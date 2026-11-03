/* Connects the agent-world slide (assets/agent-world.js, spec in AGENT-WORLD.md) to the real review.
 * When the slide opens, it plays the analysis of the last call: our six agents with faces, among dots that
 * are only decoration. Every sentence and label comes from the review and result events.
 * With the data ready it lasts about 20 seconds; if not, the agents keep working until it arrives.
 * With no call, or if the analysis fails even after one retry, the slide stays on its labelled demo.
 * A opens this slide with the labelled sample call, for when the live voice fails on stage.
 * With reduced motion the real review shows too, with what agent-world.js leaves out in live mode. */
(function () {
  'use strict';

  const swarm = window.MAYBE_SWARM;
  const review = window.MAYBE_REVIEW;
  if (!swarm || !review) return;

  const AGENTS = [
    { id: 'discovery', label: 'Discovery', face: 4 },
    { id: 'product_fit', label: 'Product Fit', face: 2 },
    { id: 'objections', label: 'Objection Handling', face: 3 },
    { id: 'communication', label: 'Communication', face: 0 },
    { id: 'next_step', label: 'Closing', face: 1 },
    { id: 'integrity', label: 'Integrity', face: 4 },
  ];
  const VERDICT = { strong: 'yes', ok: 'maybe', needs_work: 'no' };
  const RATING = { strong: 'Strong', ok: 'OK', needs_work: 'Needs work' };
  const OUTCOME = { sale_agreed: 'Banana sold', no_agreement: 'No sale' };
  const LIVE_CLUSTERS = { yes: { label: RATING.strong }, maybe: { label: RATING.ok }, no: { label: RATING.needs_work } };
  const DEMO_CLUSTERS = { yes: { label: 'Convinced' }, maybe: { label: 'Needs more proof' }, no: { label: 'Not convinced' } };

  // The conclusion follows one rule, based only on the result: "Wanted candidate" needs a total rated OK or
  // Strong (45/100 or more, the rubric's threshold) and no "Needs work" in Discovery, Closing or Integrity,
  // the three areas the engine treats as must-not-fail. The deal outcome plays no part: it stays separate.
  const MUST_NOT_FAIL = ['discovery', 'next_step', 'integrity'];
  const isWanted = (result) =>
    result.rating !== 'needs_work' && !result.reviews.some((item) => MUST_NOT_FAIL.includes(item.agentId) && item.rating === 'needs_work');

  // Seconds. With the data ready: talk at 3, think at 11.6, result at 18.3, deal at 19.4, last entrance at about 20.
  // Never more than two bubbles at once, because with three there may be no free side to place the last one.
  // An agent only leaves for its cluster as its thought fades, so moving bubbles never cover each other.
  const SPAWN = 3, FIRST_SAY = 0.2, SAY_STEP = 1.4, SAY_TIME = 2.7, POINT_DELAY = 1.1;
  const THINK_GAP = 1.4, FIRST_THINK = 0.2, THINK_STEP = 0.8, THINK_TIME = 2.6, VERDICT_DELAY = 2.4, DOTS_SPREAD = 1.2;
  const RESULT_GAP = 2.5, CONCLUSION_GAP = 0.4, DEAL_GAP = 0.7, WORKING_STEP = 1.4;
  const DOTS_PER_AGENT = 50, MAX_THOUGHTS = 3, BALL_ORDER = [0, 3, 1, 4, 2, 5];
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const { root } = swarm;
  const slide = root.closest('.deck-slide');
  const mode = root.querySelector('[data-swarm-mode]');
  const provenance = root.querySelector('.sw-prov span');
  const tallyTitle = root.querySelector('[data-swarm-tally]')?.parentElement.querySelector('.sw-label');
  const [strongRow, okRow, weakRow] = root.querySelectorAll('[data-swarm-tally] > span');

  // The slide's words that only fit the demo; they come back with it.
  const liveCopy = [
    [root.querySelector('p.rv'), 'After the call · Agent review'],
    [root.querySelector('h2'), 'Six agents review your call'],
    [strongRow, RATING.strong],
    [okRow, RATING.ok],
    [weakRow, RATING.needs_work],
    [provenance, 'Reviewing 1 call'],
    [[...root.children].find((node) => /mockup only/.test(node.textContent) && !node.matches('[data-swarm-panel]')), 'Simulated review · Not a decision by any real company'],
  ]
    .filter(([node]) => node)
    .map(([node, text]) => ({ node, text, demo: node.textContent }));

  let run = null;
  let wantSample = false;
  let resting = false;

  const onSlide = () => slide.classList.contains('is-active');
  const reviewOf = (r, id) => r.analysis.arrivals[id]?.review;

  function population() {
    const total = AGENTS.length * (DOTS_PER_AGENT + 1);
    const list = Array.from({ length: total }, (unused, index) => ({ id: `dot-${index}`, delay: 0.35 + 2.3 * Math.random() ** 1.6 }));
    // Evenly spaced on the ball, so a few faces are always turning past the front. Agents who speak one after
    // the other sit far apart, so that their bubbles have room.
    AGENTS.forEach((agent, index) => {
      list[Math.round(((BALL_ORDER[index] + 0.5) * total) / AGENTS.length)] = { id: agent.id, role: agent.label, face: agent.face, delay: 0.6 + index * 0.28 };
    });
    return list;
  }

  // The same number of dots follows each agent, so the size of each cluster is the real share of its rating.
  function dotsByAgent(list) {
    const dots = list.filter((item) => item.id.startsWith('dot-'));
    return Object.fromEntries(AGENTS.map((agent, index) => [agent.id, dots.filter((dot, position) => position % AGENTS.length === index).map((dot) => dot.id)]));
  }

  // ---------- What each moment shows ----------

  // A point is never cut: if its column is full, the oldest one leaves.
  function addPoint(kind, text, by) {
    swarm.addPoint(kind, text, { by });
    const list = root.querySelector(kind === 'pro' ? '[data-swarm-pros]' : '[data-swarm-cons]');
    const column = list.closest('.sw-cols');
    const limit = column.offsetTop + column.clientHeight - parseFloat(getComputedStyle(column).paddingBottom);
    while (list.children.length > 1 && list.offsetTop + list.offsetHeight > limit) list.firstElementChild.remove();
  }

  function addPoints(agent, { rating, checks }) {
    const met = checks.find((check) => check.status === 'met');
    const weak = checks.find((check) => check.status === 'missed') || checks.find((check) => check.status === 'partial');
    if (rating !== 'needs_work' && met) addPoint('pro', met.label, agent.id);
    if (rating !== 'strong' && weak) addPoint('con', weak.label, agent.id);
  }

  // A call with no content gives every agent the same sentence: once is enough.
  function once(r, text, show) {
    if (r.said.has(text)) return;
    r.said.add(text);
    show();
  }

  function speak(r, agent, index) {
    const item = reviewOf(r, agent.id);
    once(r, item.finding, () => swarm.say(agent.id, item.finding, { to: AGENTS[(index + 1) % AGENTS.length].id, duration: SAY_TIME }));
    r.later.push({ at: r.clock + POINT_DELAY, run: () => addPoints(agent, item) });
  }

  function decide(r, agent, rating) {
    swarm.setVerdict(agent.id, VERDICT[rating]);
    if (rating !== 'ok') swarm.addQualification(agent.label, { gap: rating === 'needs_work', by: agent.id });
    r.dots[agent.id].forEach((id) => r.later.push({ at: r.clock + Math.random() * DOTS_SPREAD, run: () => swarm.setVerdict(id, VERDICT[rating]) }));
  }

  // Three thoughts at most, from the weakest areas, with an agent in between: they can be read and never collide.
  function planThoughts(r) {
    const weakest = { needs_work: 0, ok: 1 };
    const rating = (agent) => reviewOf(r, agent.id).rating;
    r.thinkers = AGENTS.filter((agent) => rating(agent) !== 'strong').sort((a, b) => weakest[rating(a)] - weakest[rating(b)]).slice(0, MAX_THOUGHTS);
    const thinkers = [...r.thinkers];
    const others = AGENTS.filter((agent) => !r.thinkers.includes(agent));
    r.thinkOrder = AGENTS.map((unused, slot) => (slot % 2 === 0 && thinkers.length ? thinkers.shift() : others.shift() || thinkers.shift()));
  }

  function reflect(r, agent) {
    const item = reviewOf(r, agent.id);
    if (r.thinkers.includes(agent)) once(r, item.suggestion, () => swarm.think(agent.id, item.suggestion, { duration: THINK_TIME }));
    r.later.push({ at: r.clock + VERDICT_DELAY, run: () => decide(r, agent, item.rating) });
  }

  function conclude(result) {
    const notes = [result.strongest && `Strongest: ${result.strongest.label}.`, result.focus && `Focus next: ${result.focus.label}.`].filter(Boolean);
    const wanted = isWanted(result);
    swarm.setConclusion({
      wanted,
      title: wanted ? 'Wanted candidate' : 'Not shortlisted',
      summary: `${result.totalPoints}/100 · ${RATING[result.rating]} · ${result.provenance}. ${notes.join(' ')}`,
      list: 'Simulated shortlist',
    });
    const stamp = root.querySelector('.sw-stamp small');
    if (stamp) stamp.textContent = 'SIMULATED';
    if (provenance) provenance.textContent = `${result.provenance} · 1 call`;
  }

  // Each step waits for its data and for its gap after the previous one, so late data never rushes the pacing.
  function script(r) {
    const result = () => r.analysis.result;
    return [
      { gap: SPAWN, run: () => swarm.setPhase('talk') },
      ...AGENTS.map((agent, index) => ({ gap: index ? SAY_STEP : FIRST_SAY, ready: () => reviewOf(r, agent.id), run: () => speak(r, agent, index) })),
      { gap: THINK_GAP, run: () => { planThoughts(r); swarm.setPhase('think'); } },
      ...AGENTS.map((unused, slot) => ({ gap: slot ? THINK_STEP : FIRST_THINK, run: () => reflect(r, r.thinkOrder[slot]) })),
      { gap: RESULT_GAP, ready: result, run: () => swarm.setPhase('result') },
      { gap: CONCLUSION_GAP, run: () => conclude(result()) },
      { gap: DEAL_GAP, run: () => swarm.setDeal(OUTCOME[result().outcome]) },
    ];
  }

  // While the data is on its way the agents only think, with no words.
  function keepWorking(r) {
    if (r.clock < r.workingAt) return;
    r.workingAt = r.clock + WORKING_STEP;
    const pending = AGENTS.filter((agent) => !reviewOf(r, agent.id));
    const pool = pending.length ? pending : AGENTS;
    swarm.think(pool[r.workingTurn++ % pool.length].id, '…', { duration: WORKING_STEP });
  }

  function advance(r) {
    if (r.analysis.failed && !r.analysis.result) {
      if (r.retried) { backToDemo(); return; }
      r.retried = true;
      review.retry(r.analysis);
    }
    const due = r.later.filter((item) => r.clock >= item.at);
    r.later = r.later.filter((item) => r.clock < item.at);
    due.forEach((item) => item.run());
    const step = r.steps[0];
    if (!step || r.clock < r.nextAt) return;
    if (step.ready && !step.ready()) { keepWorking(r); return; }
    r.steps.shift();
    step.run();
    r.nextAt = r.clock + (r.steps[0]?.gap || 0);
  }

  // The same clock as the slide's canvas: if frames stop, the script waits with it.
  function frame(r, timestamp) {
    if (run !== r) return;
    r.clock += Math.min(0.05, r.lastFrame ? (timestamp - r.lastFrame) / 1000 : 0.016);
    r.lastFrame = timestamp;
    advance(r);
    if (run === r && (r.steps.length || r.later.length)) r.raf = requestAnimationFrame((next) => frame(r, next));
  }

  // ---------- Starting and stopping ----------

  function halt() {
    if (run) cancelAnimationFrame(run.raf);
    run = null;
  }

  function begin(analysis, sample) {
    halt();
    swarm.connect();
    liveCopy.forEach(({ node, text }) => { node.textContent = text; });
    if (tallyTitle) tallyTitle.textContent = 'Where the agents stand';
    if (sample && mode) mode.textContent = 'Sample call';
    swarm.setClusters(LIVE_CLUSTERS);
    swarm.setCandidate({ name: 'Luc', meta: 'Sales trial · 1 call' });
    const agents = population();
    swarm.setAgents(agents);
    swarm.setPhase('spawn');
    const r = { analysis, sample, dots: dotsByAgent(agents), said: new Set(), later: [], clock: 0, lastFrame: 0, workingAt: 0, workingTurn: 0, retried: false };
    r.steps = script(r);
    r.nextAt = r.steps[0].gap;
    run = r;
    r.raf = requestAnimationFrame((timestamp) => frame(r, timestamp));
  }

  function restoreDemo() {
    halt();
    liveCopy.forEach(({ node, demo }) => { node.textContent = demo; });
    swarm.setClusters(DEMO_CLUSTERS);
    swarm.disconnect();
  }

  // agent-world.js only wakes up or rests on a slide change, so with reduced motion the adapter replays one.
  // The other listeners only act on the live-call slide, so they ignore it.
  const announce = (target) => document.dispatchEvent(new CustomEvent('deck:slidechange', { detail: { slide: target } }));

  function backToDemo() {
    restoreDemo();
    if (!REDUCED || !onSlide()) return;
    // Back to the demo's still frame: out of the slide and in again, without connecting.
    resting = true;
    announce(document.createElement('div'));
    announce(slide);
    resting = false;
  }

  // On the slide already. With reduced motion and no connection it is a still frame, which has to be entered again.
  function show(analysis, sample) {
    if (REDUCED && !swarm.live) {
      wantSample = sample;
      announce(slide);
    } else begin(analysis, sample);
  }

  root.addEventListener('swarm:start', () => {
    const sample = wantSample;
    wantSample = false;
    const analysis = sample ? review.sample() : review.current();
    if (analysis) begin(analysis, sample);
    else if (swarm.live) backToDemo();
  });
  root.addEventListener('swarm:stop', halt);

  // With reduced motion, agent-world.js freezes its demo on entering the slide and fires no swarm:start, unless
  // it is already connected. The capture phase runs before its listener, so the connection gets there first.
  document.addEventListener(
    'deck:slidechange',
    (event) => {
      if (!REDUCED || resting || !event.detail.slide.contains(root)) return;
      const wanted = wantSample || review.current();
      if (wanted && !swarm.live) swarm.connect();
      if (!wanted && swarm.live) restoreDemo();
    },
    true,
  );

  // The call can end just after the slide opens, while its last words are still being transcribed.
  document.addEventListener('review:started', (event) => {
    if (onSlide() && !run?.sample) show(event.detail.analysis, false);
  });

  // In the capture phase, like the rest of the deck's overlays.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if ((event.key !== 'a' && event.key !== 'A') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return;
      event.preventDefault();
      event.stopPropagation();
      review.close();
      if (onSlide()) show(review.sample(), true);
      else {
        wantSample = true;
        window.MAYBE_DECK.go([...document.querySelectorAll('.deck-slide')].indexOf(slide));
      }
    },
    true,
  );
})();
