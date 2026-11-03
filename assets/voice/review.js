/* The agents' review of the call. When a call ends (call:ended), the transcript goes to the agents in the
 * background and nothing shows; review:started fires on document with the analysis. The agent-world slide
 * shows it (assets/voice/agent-world-live.js), through MAYBE_REVIEW.current(), sample() and retry().
 * The overlay below is out of the presentation's flow. Only window.MAYBE_REVIEW.show() opens it, and that
 * returns false, opening nothing, if no call has been reviewed. While open: → or Esc closes it, R replays
 * it, and review:done fires on document when it finishes. */
(function () {
  'use strict';

  const PANEL = [
    { id: 'discovery', label: 'Discovery', short: 'Di' },
    { id: 'product_fit', label: 'Product Fit', short: 'PF' },
    { id: 'objections', label: 'Objection Handling', short: 'OH' },
    { id: 'communication', label: 'Communication', short: 'Co' },
    { id: 'next_step', label: 'Closing', short: 'Cl' },
    { id: 'integrity', label: 'Integrity', short: 'In' },
  ];
  const RATING = {
    strong: { label: 'Strong', color: '#15803D' },
    ok: { label: 'OK', color: '#B45309' },
    needs_work: { label: 'Needs work', color: '#B91C1C' },
  };
  const OUTCOME = { sale_agreed: 'Banana sold', no_agreement: 'No sale' };

  const SOURCES_START = 0.3, SOURCES_MAX_SECONDS = 1.2, SOURCE_STEP = 0.12;
  const AGENTS_START = 0.9, AGENT_STEP = 0.12, FIRST_REVIEW = 2.2, REVIEW_STEP = 1.1;
  const CROSS_TALK_DELAY = 0.55, COMPLETE_DELAY = 1.6, TYPE_SPEED = 110;
  const TICK_MS = 40;
  const MIN_WORDS_TO_REVIEW = 3; // passing through the slide must not trigger a review

  const SAMPLE_TURNS = [
    ['candidate', "Hi, sorry to interrupt, I'll be quick. How's the hackathon going, have you eaten anything today?"],
    ['prospect', "Honestly, no. I've been at this laptop all day."],
    ['candidate', 'All day with no food? What has been stopping you from getting something?'],
    ['prospect', "I don't want to break my focus. Why would I buy a banana from you, though? I could get pizza."],
    ['candidate', "Pizza means a queue and a break. A banana takes a minute, it's filling, and you stay at your laptop. Does that help?"],
    ['prospect', 'That actually makes sense. How much is it?'],
    ['candidate', 'One euro, right here. Do you want to buy it?'],
    ['prospect', "Okay, I'll take the banana. Thanks, goodbye!"],
  ].map(([speaker, text], index) => ({ id: `t${index + 1}`, speaker, text, atMs: index * 6000 }));

  const SVG = 'http://www.w3.org/2000/svg';
  const CENTER = 500, AGENT_RING = 385, SOURCE_RING = 158, SOURCE_RADIUS = 22;

  let run = null; // the screen, while it is open
  let lastCall = null; // the analysis of the last call, running or finished
  let sampleCall = null;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/voice/review.css';
  document.head.appendChild(link);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = (tag, attrs, parent) => {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) parent.appendChild(node);
    return node;
  };
  const onRing = (index, total, radius, start) => {
    const angle = ((start + (index * 360) / total) * Math.PI) / 180;
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
  };
  const seconds = (r) => (performance.now() - r.startedAt) / 1000;
  const reviewOf = (r, id) => r.analysis.arrivals[id]?.review;
  const doneAt = (r, id) => {
    const arrival = r.analysis.arrivals[id];
    if (!arrival) return Number.POSITIVE_INFINITY;
    // Never shown before its agent answers; if the agent answered first, even before the screen opened, the pacing is kept.
    const index = PANEL.findIndex((agent) => agent.id === id);
    return Math.max(FIRST_REVIEW + index * REVIEW_STEP, (arrival.at - r.startedAt) / 1000);
  };

  // Every sentence comes from the real result: a real call has no dialogue written in advance.
  function crossTalk(r) {
    if (!r.analysis.result) return [];
    const { strongest, focus, outcome, reviews } = r.analysis.result;
    const talk = [];
    if (strongest && focus && strongest.agentId !== focus.agentId) {
      talk.push({
        from: strongest.agentId,
        to: focus.agentId,
        text: `Strong on ${strongest.label}, but ${focus.label} is the gap to close first.`,
      });
    }
    const honest = reviews.find((review) => review.agentId === 'integrity')?.rating === 'strong';
    talk.push({
      from: 'next_step',
      to: 'integrity',
      text:
        outcome === 'sale_agreed'
          ? honest
            ? 'The customer said yes, and the claims behind that yes check out.'
            : 'The customer said yes, but the claims behind that yes do not all check out.'
          : "No explicit yes in the customer's own words, so nothing counts as closed.",
    });
    return talk.map((item) => ({ ...item, at: Math.max(doneAt(r, item.from), doneAt(r, item.to)) + CROSS_TALK_DELAY }));
  }

  function completeAt(r) {
    if (!r.analysis.result) return Number.POSITIVE_INFINITY;
    const times = PANEL.map((agent) => doneAt(r, agent.id)).concat(crossTalk(r).map((item) => item.at));
    return Math.max(...times) + COMPLETE_DELAY;
  }

  // ---------- Building the screen ----------

  function build(r) {
    const root = el('div', 'rv-overlay');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Agents reviewing the call');
    const stage = el('div', 'rv-stage');
    root.appendChild(stage);

    const top = el('header', 'rv-top');
    const status = el('span', 'rv-chip');
    r.statusDot = el('i', 'rv-dot');
    r.statusText = el('span', '', 'Agents reviewing');
    status.append(r.statusDot, r.statusText);
    top.append(el('span', 'rv-chip rv-logo', 'MAYBE'), status);
    stage.appendChild(top);

    const stream = el('section', 'rv-panel rv-stream');
    stream.setAttribute('aria-label', 'Agent opinions');
    const streamHead = el('header', 'rv-eyebrow');
    r.postedCount = el('span', '', '0 posted');
    streamHead.append(el('span', '', 'Live opinions'), r.postedCount);
    r.streamList = el('div', 'rv-stream-list');
    r.waiting = el('p', 'rv-waiting', 'Agents are going through the call…');
    r.streamList.appendChild(r.waiting);
    stream.append(streamHead, r.streamList);
    stage.appendChild(stream);

    const roster = el('section', 'rv-panel rv-roster');
    roster.setAttribute('aria-label', 'Review panel');
    const rosterHead = el('header', 'rv-eyebrow');
    r.doneCount = el('span', '', `0/${PANEL.length}`);
    rosterHead.append(el('span', '', 'Review panel'), r.doneCount);
    const list = el('ul');
    r.rows = {};
    PANEL.forEach((agent) => {
      const row = el('li', 'rv-row rv-row--queued');
      const state = el('span', 'rv-row-state', 'Queued');
      row.append(el('span', 'rv-row-name', agent.label), state);
      list.appendChild(row);
      r.rows[agent.id] = { row, state };
    });
    roster.append(rosterHead, list);
    stage.appendChild(roster);

    buildGraph(r, stage);
    r.root = root;
    document.body.appendChild(root);
    setTimeout(() => root.classList.add('rv-overlay--in'), 20);
  }

  function buildGraph(r, stage) {
    const graph = svg('svg', { class: 'rv-graph', viewBox: '0 0 1000 1000', role: 'img', 'aria-label': 'Agents linked to the moments of the call they cite' });
    stage.appendChild(graph);
    r.citeLayer = svg('g', {}, graph);
    r.talkLayer = svg('g', {}, graph);
    const links = svg('g', {}, graph);

    r.sourcePoints = {};
    r.sources = r.turns.map((turn, index) => {
      const point = onRing(index, r.turns.length, SOURCE_RING, -90);
      r.sourcePoints[turn.id] = point;
      const radius = Math.min(SOURCE_RADIUS, 440 / r.turns.length);
      const group = svg('g', { class: 'rv-source' }, graph);
      const circle = svg('circle', { cx: point.x, cy: point.y, r: radius }, group);
      if (radius === SOURCE_RADIUS) {
        svg('text', { x: point.x, y: point.y + 7, 'text-anchor': 'middle' }, group).textContent = String(index + 1);
      }
      return { id: turn.id, group, circle };
    });

    svg('circle', { cx: CENTER, cy: CENTER, r: 84, class: 'rv-hub-pulse' }, graph);
    svg('circle', { cx: CENTER, cy: CENTER, r: 84, fill: '#09090B' }, graph);
    svg('text', { x: CENTER, y: CENTER + 2, 'text-anchor': 'middle', class: 'rv-hub-title' }, graph).textContent = 'The call';
    svg('text', { x: CENTER, y: CENTER + 32, 'text-anchor': 'middle', class: 'rv-hub-subtitle' }, graph).textContent = `${r.turns.length} turns`;

    r.agents = {};
    r.agentPoints = {};
    PANEL.forEach((agent, index) => {
      const point = onRing(index, PANEL.length, AGENT_RING, -60);
      r.agentPoints[agent.id] = point;
      const line = svg('line', { x1: CENTER, y1: CENTER, x2: point.x, y2: point.y, class: 'rv-link' }, links);
      const group = svg('g', { class: 'rv-agent' }, graph);
      svg('circle', { cx: point.x, cy: point.y, r: 52, class: 'rv-agent-pulse' }, group);
      const ring = svg('circle', { cx: point.x, cy: point.y, r: 52, class: 'rv-agent-ring' }, group);
      const initials = svg('text', { x: point.x, y: point.y + 11, 'text-anchor': 'middle', class: 'rv-agent-initials' }, group);
      initials.textContent = agent.short;
      svg('text', { x: point.x, y: point.y + 88, 'text-anchor': 'middle', class: 'rv-agent-label' }, group).textContent = agent.label;
      r.agents[agent.id] = { group, line, ring, initials, joined: false, done: false };
    });
  }

  // ---------- Each frame ----------

  function tick(r) {
    const now = seconds(r);
    const step = Math.min(SOURCE_STEP, SOURCES_MAX_SECONDS / Math.max(r.turns.length, 1));
    r.sources.forEach((source, index) => {
      if (now >= SOURCES_START + index * step) source.group.classList.add('rv-source--in');
    });

    let done = 0;
    PANEL.forEach((agent, index) => {
      const state = r.agents[agent.id];
      const { row, state: rowState } = r.rows[agent.id];
      if (!state.joined && now >= AGENTS_START + index * AGENT_STEP) {
        state.joined = true;
        state.group.classList.add('rv-agent--in', 'rv-agent--live');
        state.line.classList.add('rv-link--in', 'rv-link--live');
        row.classList.remove('rv-row--queued');
      }
      if (state.joined && !state.done) {
        rowState.textContent = `Reading turn ${(Math.floor(now * 1.6) % r.turns.length) + 1}`;
      }
      if (!state.done && now >= doneAt(r, agent.id)) finishAgent(r, agent, state, rowState);
      if (state.done) done += 1;
    });
    r.doneCount.textContent = `${done}/${PANEL.length}`;

    crossTalk(r).forEach((talk) => {
      const key = `${talk.from}-${talk.to}`;
      if (now >= talk.at && !r.posted.has(key)) postTalk(r, talk, key);
    });

    r.typing = r.typing.filter((item) => {
      item.node.textContent = item.text.slice(0, Math.max(0, Math.floor((now - item.at) * TYPE_SPEED)));
      return item.node.textContent.length < item.text.length;
    });

    if (!r.complete && now >= completeAt(r)) finish(r);
    if (r.analysis.failed && !r.failureShown) showFailure(r);
    if (r.complete && r.typing.length === 0) { clearInterval(r.timer); r.timer = null; }
  }

  function finishAgent(r, agent, state, rowState) {
    const review = reviewOf(r, agent.id);
    const rating = RATING[review.rating];
    state.done = true;
    state.group.classList.remove('rv-agent--live');
    state.line.classList.remove('rv-link--live');
    state.line.style.stroke = rating.color;
    state.ring.style.stroke = rating.color;
    state.initials.style.fill = rating.color;
    rowState.textContent = rating.label;
    rowState.className = 'rv-rating';
    rowState.style.color = rating.color;

    const from = r.agentPoints[agent.id];
    const cited = new Set();
    (review.evidence || []).forEach((item) => {
      const to = r.sourcePoints[item.turnId];
      if (!to || cited.has(item.turnId)) return;
      cited.add(item.turnId);
      svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'rv-cite', stroke: rating.color }, r.citeLayer);
      r.sources.find((source) => source.id === item.turnId).group.classList.add('rv-source--cited');
    });

    const entry = el('article', 'rv-entry');
    const head = el('div', 'rv-entry-head');
    const badge = el('span', 'rv-rating', rating.label);
    badge.style.color = rating.color;
    head.append(el('strong', '', agent.label), badge);
    const finding = el('p');
    entry.append(head, finding);
    const quote = review.evidence && review.evidence[0];
    if (quote) entry.appendChild(el('blockquote', '', `“${quote.quote}”`));
    entry.appendChild(el('span', 'rv-provenance', review.maxPoints ? `${review.points}/${review.maxPoints} · ${review.provenance}` : `Not scored · ${review.provenance}`));
    post(r, entry, agent.id);
    r.typing.push({ node: finding, text: review.finding, at: seconds(r) });
  }

  function postTalk(r, talk, key) {
    const label = (id) => PANEL.find((agent) => agent.id === id).label;
    const from = r.agentPoints[talk.from], to = r.agentPoints[talk.to];
    svg('path', { d: `M${from.x} ${from.y} Q${CENTER} ${CENTER} ${to.x} ${to.y}`, class: 'rv-talk' }, r.talkLayer);
    const entry = el('article', 'rv-entry rv-entry--talk');
    const head = el('div', 'rv-entry-head');
    head.append(el('strong', '', `${label(talk.from)} → ${label(talk.to)}`), el('span', 'rv-rating rv-rating--talk', 'Cross-check'));
    const text = el('p');
    entry.append(head, text);
    post(r, entry, key);
    r.typing.push({ node: text, text: talk.text, at: seconds(r) });
  }

  function post(r, entry, key) {
    r.posted.add(key);
    if (r.waiting) { r.waiting.remove(); r.waiting = null; }
    r.streamList.prepend(entry);
    r.postedCount.textContent = `${r.posted.size} posted`;
  }

  function finish(r) {
    r.complete = true;
    r.statusDot.classList.add('rv-dot--done');
    r.statusText.textContent = 'Review complete';
    const { result } = r.analysis;
    const rating = RATING[result.rating];
    const card = el('aside', 'rv-panel rv-result');
    const score = el('div', 'rv-score');
    const verdict = el('em', '', rating.label);
    verdict.style.color = rating.color;
    score.append(el('strong', '', String(result.totalPoints)), el('span', '', '/100'), verdict);
    const provenance = el('p', 'rv-provenance', result.provenance);
    const outcome = el('div', 'rv-outcome');
    outcome.append(el('span', 'rv-eyebrow-text', 'Simulated outcome'), el('strong', '', OUTCOME[result.outcome]));
    card.append(score, provenance, outcome);
    if (result.focus) card.appendChild(el('p', 'rv-focus', `Focus next: ${result.focus.label}. ${result.focus.suggestion}`));
    card.appendChild(el('p', 'rv-note', 'Practice feedback and evidence for human review.'));
    r.root.querySelector('.rv-stage').appendChild(card);
    document.dispatchEvent(new CustomEvent('review:done', { detail: { result, turns: r.turns } }));
  }

  function showFailure(r) {
    r.failureShown = true;
    r.statusDot.classList.add('rv-dot--done');
    r.statusText.textContent = 'Review stopped';
    const card = el('aside', 'rv-panel rv-result');
    card.append(el('strong', '', 'The review could not finish'), el('p', 'rv-note', 'Press → to go back to the presentation.'));
    r.root.querySelector('.rv-stage').appendChild(card);
    clearInterval(r.timer);
    r.timer = null;
  }

  // ---------- The analysis, which does not need the screen ----------

  function analyse(turns) {
    const analysis = { turns, arrivals: {}, result: null, failed: false };
    request(analysis);
    return analysis;
  }

  async function request(analysis) {
    analysis.failed = false;
    try {
      const response = await fetch('/api/review-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: analysis.turns }),
      });
      if (!response.ok || !response.body) throw new Error(`The review answered ${response.status}`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.filter((line) => line.trim()).forEach((line) => {
          const event = JSON.parse(line);
          if (event.type === 'review') analysis.arrivals[event.review.agentId] = { review: event.review, at: performance.now() };
          if (event.type === 'result') analysis.result = event.result;
          if (event.type === 'error') throw new Error(event.message);
        });
      }
      if (!analysis.result) throw new Error('The review ended without a result');
    } catch (error) {
      console.warn('[review]', error.message);
      analysis.failed = true;
    }
  }

  // ---------- Opening and closing ----------

  function open(analysis) {
    close();
    if (analysis.failed) request(analysis); // one more try before showing a failure on stage
    const r = {
      analysis,
      turns: analysis.turns,
      startedAt: performance.now(),
      posted: new Set(),
      typing: [],
      complete: false,
    };
    run = r;
    build(r);
    r.timer = setInterval(() => tick(r), TICK_MS);
    tick(r);
  }

  function show() {
    if (!lastCall) return false;
    if (!run || run.analysis !== lastCall) open(lastCall);
    return true;
  }

  function replay() {
    if (run && run.analysis.result) open(run.analysis);
  }

  function close() {
    if (!run) return;
    clearInterval(run.timer);
    run.root.remove();
    run = null;
  }

  const wordsSpoken = (turns) =>
    turns.filter((turn) => turn.speaker === 'candidate').reduce((sum, turn) => sum + turn.text.trim().split(/\s+/).filter(Boolean).length, 0);

  document.addEventListener('call:ended', (event) => {
    const turns = event.detail?.turns || [];
    if (wordsSpoken(turns) < MIN_WORDS_TO_REVIEW) return;
    lastCall = analyse(turns);
    document.dispatchEvent(new CustomEvent('review:started', { detail: { analysis: lastCall } }));
  });

  // In the capture phase, so the deck does not change slide behind the review.
  document.addEventListener(
    'keydown',
    (event) => {
      if (!run || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === 'f' || key === 'F') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (key === 'r' || key === 'R') replay();
      else if (['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Escape', ' '].includes(key)) close();
    },
    true,
  );

  window.MAYBE_REVIEW = {
    /** The analysis of the last call, running or finished: {turns, arrivals, result, failed}. Null before any call. */
    current: () => lastCall,
    /** The same for the labelled sample call. Requested once per page load. */
    sample: () => sampleCall || (sampleCall = analyse(SAMPLE_TURNS)),
    /** Asks the agents again for an analysis that failed. */
    retry: request,
    show,
    open: (turns) => { lastCall = analyse(turns); return show(); },
    close,
    last: () => (lastCall?.result ? lastCall : null),
  };
})();
