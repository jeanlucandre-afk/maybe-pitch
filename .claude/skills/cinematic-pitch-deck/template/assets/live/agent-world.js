/* Agent-world slide runtime (the "ball of agents" after the live call), ported from the MAYBE hackathon deck.
 * Colours and fonts come from brand.css (--ink, --bg, --track, --line, --ghost, --mid, --ink-2, --ink-3, --font-*).
 * The demo story comes from data-demo on the slide root (JSON: roles, cast, talk, quals, candidate, conclusion,
 * deal, clusters); without it a neutral built-in story plays. assets/live/agents.js feeds it from /api/agents-review.
 * Global: window.SWARM (alias window.MAYBE_SWARM).
 *
 * The slide has:
 *   [data-swarm]            slide root (data-swarm-img = folder with the peep-*.svg drawings)
 *   [data-swarm-canvas]     1920x1080 canvas this file draws on
 *   [data-swarm-step=...]   the four steps on the left (spawn, talk, think, result); get is-on / is-done and --p (0..1)
 *   [data-swarm-mode]       "Demo simulation" / "Live agents" pill
 *   [data-swarm-panel]      the review card on the left: candidate, what worked / what didn't, qualifications,
 *                           the live tally and the verdict (wanted candidate or not). Points fly in from the agent who raised them.
 *
 * Phases: spawn → talk → think → result (→ reset in the demo loop).
 *   spawn   agents pop out of the call transcript card and settle into a slowly turning ball
 *   talk    neighbours connect, pulses travel, speech bubbles about the call
 *   think   each agent weighs the call alone (thought bubble), then leaves the ball for its verdict cluster
 *   result  three clusters, labelled; the panel shows the concluded verdict
 *
 * Until a developer connects real agents, the slide loops a scripted demo. Every visual comes from the same
 * public calls (window.MAYBE_SWARM), so real agents look exactly like the demo. See AGENT-WORLD.md.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-swarm]');
  if (!root) return;
  const cv = root.querySelector('[data-swarm-canvas]');
  const ctx = cv.getContext('2d');
  const steps = Array.from(root.querySelectorAll('[data-swarm-step]'));
  const modeEl = root.querySelector('[data-swarm-mode]');
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 1920, H = 1080;

  // ---------- look (Brutal Zinc, monochrome), from the brand tokens ----------
  let INK = '#09090B', PAPER = '#FFFFFF', Z100 = '#F4F4F5', Z200 = '#E4E4E7', Z300 = '#D4D4D8', Z400 = '#A1A1AA', Z500 = '#71717A', Z600 = '#52525B';
  let SANS = 'Geist, system-ui, sans-serif', MONO = "'Geist Mono', ui-monospace, monospace", INK_RGB = '9,9,11';
  function theme() {
    const cs = getComputedStyle(root), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    INK = v('--ink', INK); PAPER = v('--bg', PAPER); Z100 = v('--track', Z100); Z200 = v('--line', Z200); Z300 = v('--ghost', Z300);
    Z400 = v('--mid', Z400); Z500 = v('--ink-3', Z500); Z600 = v('--ink-2', Z600); SANS = v('--font-sans', SANS); MONO = v('--font-mono', MONO);
    const m = INK.match(/^#([0-9a-f]{6})$/i); if (m) INK_RGB = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(',');
    CLUSTERS.yes.fill = INK; CLUSTERS.maybe.fill = Z400; CLUSTERS.no.fill = PAPER; for (const k of Object.keys(CLUSTERS)) CLUSTERS[k].stroke = INK;
  }
  const BALL = { x: 1350, y: 540, r: 350 };
  const CLUSTERS = {
    yes:   { label: 'Convinced',        x: 1150, y: 450, fill: INK,   stroke: INK },
    maybe: { label: 'Needs more proof', x: 1650, y: 320, fill: Z400,  stroke: INK },
    no:    { label: 'Not convinced',    x: 1640, y: 790, fill: PAPER, stroke: INK },
  };
  const VERDICTS = Object.keys(CLUSTERS);
  for (const k of VERDICTS) Object.assign(CLUSTERS[k], { r: 0, n: 0, alpha: 0 });

  const imgBase = root.dataset.swarmImg || 'media/peeps/';
  const PEEPS = ['student', 'seller', 'designer', 'recruiter', 'thinker'].map((n) => { const i = new Image(); i.src = imgBase + 'peep-' + n + '.svg'; return i; });

  // ---------- state ----------
  let agents = [], byId = new Map(), bubbles = [], pulses = [];
  let phase = 'idle', phaseT0 = 0, now = 0, rot = 0, live = false, active = false, raf = 0, lastTs = 0;
  let meshA = 0, cardA = 0, tagA = 0, resultA = 0, layoutDirty = true, popDirty = true;
  const ease = (cur, target, dt, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

  function fib(i, n) {
    const y = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963;
    return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
  }
  function turn(p, ay, ax) {
    const x = p.x * Math.cos(ay) + p.z * Math.sin(ay), z0 = -p.x * Math.sin(ay) + p.z * Math.cos(ay);
    return { x, y: p.y * Math.cos(ax) - z0 * Math.sin(ax), z: p.y * Math.sin(ax) + z0 * Math.cos(ax) };
  }
  // tiny seeded RNG so the demo looks the same every loop
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---------- agents ----------
  function makeAgent(spec) {
    const a = {
      id: String(spec.id), role: spec.role || 'Agent', face: spec.face == null ? -1 : spec.face,
      verdict: null, bornAt: now + (spec.delay || 0), x: BALL.x, y: BALL.y, z: 0, alpha: 0, k: 3 + Math.random() * 3,
      home: { x: 0, y: 0, z: 0 }, slot: { x: 0, y: 0, z: 0 }, nb: [], thinkingUntil: 0, spotUntil: 0,
    };
    byId.set(a.id, a);
    return a;
  }
  function setAgents(list) { agents = []; byId.clear(); bubbles = []; pulses = []; (list || []).forEach((s) => agents.push(makeAgent(s))); layoutDirty = popDirty = true; }
  function addAgent(spec) { const a = makeAgent(spec); agents.push(a); layoutDirty = popDirty = true; return a.id; }

  // positions on the ball (all agents) and inside each cluster (agents with that verdict), plus neighbour links
  function relayout() {
    layoutDirty = false;
    // ball positions stay put for the whole run, so the ball thins out calmly as agents leave it
    if (popDirty) { popDirty = false; agents.forEach((a, i) => { a.home = fib(i, agents.length); }); link(agents, 'home'); }
    for (const k of VERDICTS) {
      const group = agents.filter((a) => a.verdict === k && (phase === 'think' || phase === 'result'));
      // each agent keeps its own direction from the ball, so a cluster fills up calmly instead of reshuffling
      group.forEach((a) => { a.slot = a.home; });
      CLUSTERS[k].n = group.length;
      link(group, 'slot');
    }
  }
  function link(group, key) {
    for (const a of group) {
      const best = [];
      for (const b of group) {
        if (a === b) continue;
        const d = (a[key].x - b[key].x) ** 2 + (a[key].y - b[key].y) ** 2 + (a[key].z - b[key].z) ** 2;
        if (best.length < 3) { best.push([d, b]); best.sort((p, q) => p[0] - q[0]); }
        else if (d < best[2][0]) { best[2] = [d, b]; best.sort((p, q) => p[0] - q[0]); }
      }
      a.nb = best.map((p) => p[1]);
    }
  }

  // ---------- public actions (the demo uses exactly these) ----------
  function setPhase(p) {
    if (!['idle', 'spawn', 'talk', 'think', 'result', 'reset'].includes(p)) return;
    phase = p; phaseT0 = now; layoutDirty = true;
    steps.forEach((el) => {
      const order = ['spawn', 'talk', 'think', 'result'], i = order.indexOf(el.dataset.swarmStep);
      const cur = p === 'reset' || p === 'idle' ? -1 : order.indexOf(p);
      el.classList.toggle('is-on', i === cur);
      el.classList.toggle('is-done', i < cur);
      el.style.setProperty('--p', i < cur ? 1 : 0);
    });
    root.dispatchEvent(new CustomEvent('swarm:phase', { detail: { phase: p } }));
  }
  function say(id, text, opts = {}) {
    const a = byId.get(String(id)); if (!a) return;
    bubbles = bubbles.filter((b) => b.a !== a);
    const dur = opts.duration || 3.2;
    a.spotUntil = now + dur;
    bubbles.push({ a, to: opts.to != null ? byId.get(String(opts.to)) : null, kind: 'say', text: String(text), t0: now, dur });
  }
  function think(id, text, opts = {}) {
    const a = byId.get(String(id)); if (!a) return;
    bubbles = bubbles.filter((b) => b.a !== a);
    const dur = opts.duration || 3;
    a.thinkingUntil = a.spotUntil = now + dur;
    bubbles.push({ a, kind: 'think', text: String(text), t0: now, dur });
  }
  function setVerdict(id, v) {
    const a = byId.get(String(id)); if (!a || (v != null && !CLUSTERS[v])) return;
    a.verdict = v; layoutDirty = true;
  }
  function setClusters(map) { for (const k of Object.keys(map || {})) if (CLUSTERS[k] && map[k].label) CLUSTERS[k].label = String(map[k].label); }
  function clearAll() { setAgents([]); setPhase('idle'); clearPanel(); }

  // ---------- review panel (left) ----------
  const P = (sel) => root.querySelector(sel);
  const panel = { name: P('[data-swarm-cand-name]'), meta: P('[data-swarm-cand-meta]'), pros: P('[data-swarm-pros]'), cons: P('[data-swarm-cons]'),
    quals: P('[data-swarm-quals]'), tally: P('[data-swarm-tally]'), verdict: P('[data-swarm-verdict]'), deal: P('[data-swarm-deal]') };
  const EMPTY = '<li class="sw-empty" style="display:block;animation:none">Listening to the agents…</li>';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let flyers = [];
  function setCandidate({ name, meta } = {}) {
    if (name != null && panel.name) panel.name.textContent = name;
    if (meta != null && panel.meta) panel.meta.textContent = meta;
  }
  /** type 'pro' | 'con'; opts.by = agent id that raised it (a dot flies from that agent into the panel) */
  function addPoint(type, text, opts = {}) {
    const list = type === 'con' ? panel.cons : panel.pros; if (!list) return;
    if (list.querySelector('.sw-empty')) list.innerHTML = '';
    const a = opts.by != null ? byId.get(String(opts.by)) : null;
    const li = document.createElement('li');
    li.innerHTML = esc(text) + (a || opts.byLabel ? `<small>raised by ${esc(opts.byLabel || a.role)}</small>` : '');
    list.appendChild(li);
    while (list.children.length > 3) list.removeChild(list.firstElementChild);
    if (a) fly(a, li);
  }
  /** a qualification the agents agree on; {gap: true} = something to work on (dashed chip) */
  function addQualification(text, opts = {}) {
    if (!panel.quals) return;
    const span = document.createElement('span'); span.textContent = text; if (opts.gap) span.className = 'is-gap';
    panel.quals.appendChild(span);
    const a = opts.by != null ? byId.get(String(opts.by)) : null; if (a) fly(a, span);
  }
  /** The concrete conclusion. {wanted: true|false, title, summary, list: 'Dr. Lipp · Sales trial'} */
  function setConclusion(c) {
    if (!panel.verdict) return;
    if (!c) { panel.verdict.hidden = true; panel.verdict.innerHTML = ''; if (panel.tally) panel.tally.hidden = false; return; }
    const yes = !!c.wanted, list = c.list || 'Wanted candidates';
    const small = c.small || (yes ? 'SHORTLISTED' : 'NOT SHORTLISTED'), added = c.added || (yes ? '✓ added' : '· not added');
    panel.verdict.innerHTML = `<div class="sw-verdict"><div class="sw-stamp ${yes ? 'is-yes' : ''}">${esc(c.title || (yes ? 'Wanted candidate' : 'Not shortlisted'))}<small>${esc(small)}</small></div>
      <div><div class="sw-summary">${esc(c.summary || '')}</div>
      <div class="sw-row ${yes ? '' : 'is-no'}">${esc(list)}<b>${esc(panel.name ? panel.name.textContent : 'Candidate')} ${esc(added)}</b></div></div></div>`;
    panel.verdict.hidden = false; if (panel.tally) panel.tally.hidden = true;
    const lab = panel.verdict.parentElement.querySelector('.sw-label'); if (lab) lab.textContent = 'Conclusion';
  }
  /** The real deal outcome from the call, shown apart from the score. */
  function setDeal(text, label) { if (panel.deal) panel.deal.textContent = text ? (label || 'Outcome (separate)') + ': ' + text : 'Real outcome kept separate'; }
  function clearPanel() {
    if (panel.pros) panel.pros.innerHTML = EMPTY; if (panel.cons) panel.cons.innerHTML = EMPTY; if (panel.quals) panel.quals.innerHTML = '';
    setConclusion(null); setDeal(null); flyers = [];
    const lab = panel.tally && panel.tally.parentElement.querySelector('.sw-label'); if (lab) lab.textContent = 'Where the market stands';
  }
  // stage coordinates of a panel element (the deck scales the stage)
  function stagePos(el) {
    const r = root.getBoundingClientRect(), e = el.getBoundingClientRect(), k = r.width / W || 1;
    return { x: (e.left - r.left) / k, y: (e.top - r.top + e.height / 2) / k, w: e.width / k };
  }
  function fly(a, el) { if (REDUCED) return; flyers.push({ a, el, t0: now, dur: 0.9, sx: a.x, sy: a.y }); }
  function updateTally() {
    if (!panel.tally || panel.tally.hidden) return;
    const n = Math.max(1, agents.length);
    for (const k of VERDICTS) { const b = panel.tally.querySelector(`[data-tally="${k}"]`); if (b) b.style.width = ((CLUSTERS[k].n / n) * 100).toFixed(1) + '%'; }
  }

  // ---------- drawing helpers ----------
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function face(x, y, r, idx, alpha) {
    const img = PEEPS[((idx % PEEPS.length) + PEEPS.length) % PEEPS.length];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 3, y + 3, r + 1, 0, 7); ctx.fill();
    ctx.fillStyle = Z100; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (img.complete && img.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); ctx.drawImage(img, x - r * 1.25, y - r * 0.95, r * 2.5, r * 3.53); ctx.restore(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function wrap(text, font, max) {
    ctx.font = font; const words = text.split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }

  function drawBubble(b) {
    const t = now - b.t0; if (t < 0 || t > b.dur) return;
    const inA = Math.min(1, t / 0.28), outA = Math.min(1, (b.dur - t) / 0.4), al = Math.min(inA, outA) * b.a.alpha;
    if (al <= 0.01) return;
    const thinking = b.kind === 'think', head = (thinking ? 'Thinking · ' : '') + b.a.role.toUpperCase();
    const dotsOnly = thinking && t < 0.9;
    const bodyFont = '500 21px ' + SANS, headFont = '500 14px ' + MONO;
    const lines = dotsOnly ? ['…'] : wrap(b.text, bodyFont, 340);
    ctx.font = bodyFont; let w = Math.max(...lines.map((l) => ctx.measureText(l).width)); ctx.font = headFont; w = Math.max(w, ctx.measureText(head).width) + 40;
    const h = 48 + lines.length * 28;
    const ax = b.a.x, ay = b.a.y, gap = 34;
    const place = (side) => ({ x: side[0] === 'r' ? ax + 14 : ax - w - 14, y: side[1] === 'u' ? ay - h - gap : ay + gap });
    const fits = (r) => r.x >= 850 && r.x + w <= W - 30 && r.y >= 30 && r.y + h <= H - 70;
    const labels = VERDICTS.map((k) => CLUSTERS[k]).filter((c) => c.n > 0 && (phase === 'think' || phase === 'result')).map((c) => ({ rect: { x: c.x - 150, y: c.y + c.r + 8, w: 300, h: 44 } }));
    const clear = (r) => bubbles.concat(labels).every((o) => o === b || !o.rect || r.x > o.rect.x + o.rect.w + 12 || r.x + w + 12 < o.rect.x || r.y > o.rect.y + o.rect.h + 12 || r.y + h + 12 < o.rect.y);
    if (!b.side) {
      const sides = ['ru', 'lu', 'rd', 'ld'];
      b.side = sides.find((sd) => { const r = place(sd); return fits(r) && clear(r); }) || sides.find((sd) => fits(place(sd))) || 'ru';
    }
    let { x, y } = place(b.side);
    x = Math.max(850, Math.min(W - 30 - w, x)); y = Math.max(30, Math.min(H - 70 - h, y));
    b.rect = { x, y, w, h };
    const below = y > ay;
    const s = 0.92 + 0.08 * inA;
    ctx.save(); ctx.globalAlpha = al; ctx.translate(ax, ay); ctx.scale(s, s); ctx.translate(-ax, -ay);
    // tail
    const tx = Math.max(x + 26, Math.min(x + w - 26, ax)), ty = below ? y : y + h;
    if (thinking) {
      ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      [[0.35, 7], [0.7, 4.5]].forEach(([f, r]) => { ctx.beginPath(); ctx.arc(tx + (ax - tx) * f, ty + (ay - ty) * f, r, 0, 7); ctx.fill(); ctx.stroke(); });
    }
    // shadow + body
    ctx.fillStyle = INK; roundRect(x + 4, y + 4, w, h, 14); ctx.fill();
    ctx.fillStyle = PAPER; roundRect(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; if (thinking) ctx.setLineDash([7, 6]); roundRect(x, y, w, h, 14); ctx.stroke(); ctx.setLineDash([]);
    if (!thinking) {
      const dir = below ? -1 : 1, tipX = tx + (ax - tx) * 0.6, tipY = ay - dir * 10;
      ctx.beginPath(); ctx.moveTo(tx - 10, ty - dir * 1); ctx.lineTo(tipX, tipY); ctx.lineTo(tx + 10, ty - dir * 1); ctx.closePath();
      ctx.fillStyle = PAPER; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 10, ty); ctx.lineTo(tipX, tipY); ctx.lineTo(tx + 10, ty); ctx.stroke();
    }
    ctx.fillStyle = Z500; ctx.font = headFont; ctx.fillText(head, x + 20, y + 28);
    ctx.fillStyle = INK; ctx.font = bodyFont;
    if (dotsOnly) { const n = 1 + Math.floor(t * 4) % 3; ctx.fillText('•'.repeat(n).split('').join(' '), x + 20, y + 58); }
    else lines.forEach((l, i) => ctx.fillText(l, x + 20, y + 58 + i * 28));
    ctx.restore();
  }

  // ---------- frame ----------
  function frame(dt) {
    if (layoutDirty) relayout();
    rot += dt * 0.16;
    const ax = -0.28, inBall = phase === 'spawn' || phase === 'talk' || phase === 'idle';

    // cluster sizes follow how many agents have arrived
    for (const k of VERDICTS) {
      const c = CLUSTERS[k], show = (phase === 'think' || phase === 'result') && c.n > 0;
      c.r = ease(c.r, show ? 34 + 12.5 * Math.sqrt(c.n) : 0, dt, 2.5);
      c.alpha = ease(c.alpha, show ? 1 : 0, dt, 3);
    }
    const undecidedN = agents.filter((a) => inBall || !a.verdict).length;
    const ballR = inBall ? BALL.r : Math.max(36, BALL.r * Math.sqrt(undecidedN / Math.max(1, agents.length)));

    meshA = ease(meshA, phase === 'talk' || phase === 'think' || phase === 'result' ? 1 : 0, dt, 2);
    cardA = ease(cardA, phase === 'spawn' && now - phaseT0 < 2.6 ? 1 : 0, dt, 4);
    tagA = ease(tagA, (phase === 'spawn' && now - phaseT0 > 2) || phase === 'talk' ? 1 : 0, dt, 3);
    resultA = ease(resultA, phase === 'result' ? 1 : 0, dt, 3);

    for (const a of agents) {
      const born = now >= a.bornAt;
      let p, cx, cy, r;
      if (!inBall && a.verdict && phase !== 'reset') { const c = CLUSTERS[a.verdict]; p = turn(a.slot, rot * 1.4 + VERDICTS.indexOf(a.verdict), ax); cx = c.x; cy = c.y; r = c.r; }
      else { p = turn(a.home, rot, ax); cx = BALL.x; cy = BALL.y; r = ballR; }
      if (a.spotUntil > now) p = { x: p.x, y: p.y, z: Math.max(p.z, 0.9) };
      let tx = cx + p.x * r, ty = cy + p.y * r;
      if (!born || phase === 'reset') { tx = BALL.x; ty = BALL.y; }
      a.x = ease(a.x, tx, dt, a.k); a.y = ease(a.y, ty, dt, a.k); a.z = ease(a.z, p.z, dt, 6);
      a.alpha = ease(a.alpha, born && phase !== 'reset' && phase !== 'idle' ? 1 : 0, dt, phase === 'reset' ? 3 : 8);
    }

    // stage scale for crisp lines
    const rect = cv.getBoundingClientRect(), k = Math.min(2, Math.max(1, (rect.width / W) * (window.devicePixelRatio || 1)));
    if (cv.width !== Math.round(W * k)) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // links between neighbours
    if (meshA > 0.01) {
      ctx.lineWidth = 1.2;
      for (const a of agents) for (const b of a.nb) {
        if (a.id > b.id || a.alpha < 0.05 || b.alpha < 0.05) continue;
        if (!inBall && (a.verdict !== b.verdict || !a.verdict)) { if (a.verdict || b.verdict) continue; }
        const d = (a.z + b.z) / 2; if (d < -0.4) continue;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 170) continue;
        ctx.strokeStyle = `rgba(${INK_RGB},${(meshA * Math.min(a.alpha, b.alpha) * (0.1 + 0.45 * (d + 1) / 2)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // pulses travelling along links while they talk
    if (phase === 'talk' && !REDUCED) {
      for (let i = 0; i < 3; i++) if (Math.random() < dt * 4 && agents.length) {
        const a = agents[Math.floor(Math.random() * agents.length)], b = a.nb[Math.floor(Math.random() * a.nb.length)];
        if (b && a.z > -0.1) pulses.push({ a, b, t0: now, dur: 0.6 + Math.random() * 0.5 });
      }
    }
    pulses = pulses.filter((p) => now - p.t0 < p.dur);
    ctx.fillStyle = INK;
    for (const p of pulses) { const f = (now - p.t0) / p.dur; ctx.globalAlpha = Math.sin(f * Math.PI) * meshA; ctx.beginPath(); ctx.arc(p.a.x + (p.b.x - p.a.x) * f, p.a.y + (p.b.y - p.a.y) * f, 3.2, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // a spoken line lights the link to whoever it was said to
    for (const b of bubbles) if (b.kind === 'say' && b.to && now - b.t0 < b.dur) {
      const f = ((now - b.t0) * 0.9) % 1;
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(b.a.x, b.a.y); ctx.lineTo(b.to.x, b.to.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(b.a.x + (b.to.x - b.a.x) * f, b.a.y + (b.to.y - b.a.y) * f, 4.5, 0, 7); ctx.fill();
    }

    // agents, back to front
    const order = agents.slice().sort((a, b) => a.z - b.z);
    for (const a of order) {
      if (a.alpha < 0.02) continue;
      const d = (a.z + 1) / 2, r = 2.4 + d * 4.6;
      let fill, stroke;
      const decided = a.verdict && !inBall;
      if (decided) { const c = CLUSTERS[a.verdict]; fill = c.fill; stroke = c.stroke; if (d < 0.35) { fill = a.verdict === 'yes' ? Z600 : Z200; stroke = null; } }
      else { fill = d > 0.45 ? PAPER : Z300; stroke = d > 0.45 ? INK : null; if (!inBall) stroke = d > 0.45 ? Z400 : null; }
      ctx.globalAlpha = a.alpha * (0.35 + 0.65 * d);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 7); ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; ctx.stroke(); }
      if (a.thinkingUntil > now) { // thinking halo
        const ph = (now * 1.6) % 1; ctx.globalAlpha = a.alpha * (1 - ph) * 0.8; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(a.x, a.y, r + 6 + ph * 22, 0, 7); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // faces + role tags for the named agents
    for (const a of order) {
      if (a.face < 0 || a.alpha < 0.05) continue;
      const d = (a.z + 1) / 2; if (d < 0.55) continue;
      const fa = a.alpha * Math.min(1, (d - 0.55) / 0.2), fr = 22 + 9 * d;
      face(a.x, a.y, fr, a.face, fa);
      if (tagA > 0.02 && d > 0.62) {
        ctx.font = '500 15px ' + MONO; const tw = ctx.measureText(a.role).width + 22;
        ctx.globalAlpha = fa * tagA; ctx.fillStyle = INK; roundRect(a.x - tw / 2, a.y + fr + 9, tw, 28, 6); ctx.fill();
        ctx.fillStyle = PAPER; ctx.textAlign = 'center'; ctx.fillText(a.role, a.x, a.y + fr + 28); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
    }

    // the call transcript card the agents spawn from
    if (cardA > 0.01) {
      const w = 420, h = 132, x = BALL.x - w / 2, y = BALL.y - h / 2, s = 0.9 + 0.1 * cardA;
      ctx.save(); ctx.globalAlpha = cardA; ctx.translate(BALL.x, BALL.y); ctx.scale(s, s); ctx.translate(-BALL.x, -BALL.y);
      ctx.fillStyle = INK; roundRect(x + 6, y + 6, w, h, 14); ctx.fill();
      ctx.fillStyle = PAPER; roundRect(x, y, w, h, 14); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = Z500; ctx.font = '500 15px ' + MONO; ctx.fillText('CALL TRANSCRIPT · SALES TRIAL', x + 26, y + 40);
      ctx.fillStyle = INK; ctx.font = '700 28px ' + SANS; ctx.fillText('Your call with Mara', x + 26, y + 76);
      ctx.fillStyle = Z500; ctx.font = '15px ' + MONO; ctx.fillText('Sent to the simulation', x + 26, y + 108);
      ctx.restore();
    }

    // cluster labels
    for (const k of VERDICTS) {
      const c = CLUSTERS[k]; if (c.alpha < 0.02) continue;
      ctx.globalAlpha = c.alpha; ctx.textAlign = 'center';
      const ly = c.y + c.r + 40;
      ctx.font = '600 24px ' + SANS; const tw = ctx.measureText(c.label).width;
      ctx.fillStyle = c.fill; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x - tw / 2 - 18, ly - 8, 8, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(c.label, c.x + 4, ly);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // points flying from the agent who raised them into the review panel
    flyers = flyers.filter((f) => now - f.t0 < f.dur && f.el.isConnected);
    for (const f of flyers) {
      const q = (now - f.t0) / f.dur, e = 1 - Math.pow(1 - q, 3), to = stagePos(f.el);
      const tx = to.x + to.w + 8 > 806 ? 806 : to.x + to.w + 8, ty = to.y;
      const cx = (f.sx + tx) / 2, cy = Math.min(f.sy, ty) - 120;
      const bx = (1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * cx + e * e * tx, by = (1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * cy + e * e * ty;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.setLineDash([3, 6]); ctx.globalAlpha = 0.5 * (1 - q);
      ctx.beginPath(); ctx.moveTo(f.sx, f.sy); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 7); ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, 7); ctx.fill();
    }
    updateTally();

    bubbles = bubbles.filter((b) => now - b.t0 < b.dur);
    bubbles.forEach(drawBubble);

    // step progress bar
    const on = steps.find((el) => el.classList.contains('is-on'));
    if (on && !live) on.style.setProperty('--p', Math.min(1, (now - phaseT0) / (DEMO_LEN[phase] || 1)).toFixed(3));
    if (on && live) on.style.setProperty('--p', '1');
  }

  function loop(ts) {
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016); lastTs = ts; now += dt;
    if (!live) demoTick();
    frame(dt);
    raf = active ? requestAnimationFrame(loop) : 0;
  }
  function start() { if (raf) return; lastTs = 0; raf = requestAnimationFrame(loop); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ---------- demo (mock agents reviewing the call); data-demo on the root replaces any part of it ----------
  let CFG = {}; try { CFG = JSON.parse(root.dataset.demo || '{}'); } catch (e) { CFG = {}; }
  const ROLES0 = ['Student, 16', 'Store buyer', 'Parent', 'Pharmacist', 'Teacher', 'Shop assistant', 'Rival brand', 'Area manager', 'Grandparent', 'Influencer', 'Gym owner', 'Nurse', 'Barista', 'Café owner', 'Retiree', 'Tourist'];
  // named agents: [key, role, face, verdict, private thought in "think" (or null)]
  const CAST0 = [
    ['buyer',   'Store buyer',    1, 'yes',   'A 24-unit tray is low risk. I’d stock it.'],
    ['rival',   'Rival brand',    3, 'no',    'Easy to beat on price. I’d pass.'],
    ['pharm',   'Pharmacist',     4, 'maybe', 'No ingredient facts yet. I need proof first.'],
    ['parent',  'Parent',         2, 'yes',   null],
    ['manager', 'Area manager',   3, 'maybe', 'Margin unknown. Show me numbers first.'],
    ['shop',    'Shop assistant', 0, 'yes',   'A clear next step. I’d put it by the till.'],
    ['teen',    'Student, 16',    0, 'yes',   'Small and cheap to try. I’d buy one.'],
    ['grand',   'Grandparent',    4, 'no',    null],
  ];
  // the conversation about the call: [time after talk starts, speaker, to, line, panel point]
  const TALK0 = [
    [0.6, 'buyer', 'rival', 'The 24-unit tray answered my six-week worry.', ['pro', 'Answered the six-week risk with a 24-unit trial']],
    [2.3, 'rival', 'buyer', 'Still no reason to pick them over a cheaper brand.', ['con', 'No reason given to choose Dr. Lipp over cheaper brands']],
    [4.4, 'pharm', 'parent', 'Nobody mentioned ingredients. I would have asked.', ['con', 'No product facts: ingredients never came up']],
    [6.1, 'parent', 'pharm', 'But they asked what matters before pitching. I liked that.', ['pro', 'Asked what decides shelf space before pitching']],
    [8.2, 'manager', 'shop', 'Margin never came up. That’s my first question.', null],
    [9.9, 'shop', 'manager', '“Send me the offer” is still a clear next step.', ['pro', 'Closed on a concrete next step: the offer']],
  ];
  const QUALS0 = [ // [time after think starts, text, gap?, raised by]
    [0.8, 'Listens first', false, 'parent'], [2.4, 'Handles objections', false, 'buyer'],
    [4.0, 'Closes on a next step', false, 'shop'], [5.6, 'Product facts', true, 'pharm'],
  ];
  const ROLES = CFG.roles || ROLES0, CAST = CFG.cast || CAST0, TALK = CFG.talk || TALK0, QUALS = CFG.quals || QUALS0;
  const DEMO = { spawn: 0, talk: 4.4, think: 17.0, result: 26.4, reset: 34.5, end: 36.3 };
  const DEMO_LEN = { spawn: DEMO.talk - DEMO.spawn, talk: DEMO.think - DEMO.talk, think: DEMO.result - DEMO.think, result: DEMO.reset - DEMO.result };
  let demo = null;

  function demoStart() {
    seed = 11; now = 0; clearPanel();
    setCandidate(CFG.candidate || { name: 'Luc', meta: 'Candidate · Dr. Lipp sales trial · 1 call' });
    if (CFG.clusters) setClusters(CFG.clusters);
    const N = 320, list = [];
    for (let i = 0; i < N; i++) list.push({ id: 'a' + i, role: ROLES[Math.floor(rnd() * ROLES.length)], face: -1, delay: 0.35 + 3.1 * Math.pow(rnd(), 1.6) });
    // named agents sit on evenly spaced slots of the ball, so a few faces are always turning past the front
    CAST.forEach((c, k) => { const s = list[Math.round((k + 0.5) * N / CAST.length)]; s.id = c[0]; s.role = c[1]; s.face = c[2]; s.delay = 0.6 + k * 0.28; });
    setAgents(list);
    demo = { talk: 0, quals: 0, concluded: false, decide: agents.map((a) => {
      const c = CAST.find((x) => x[0] === a.id);
      const v = c ? c[3] : (r => r < 0.55 ? 'yes' : r < 0.82 ? 'maybe' : 'no')(rnd());
      return { a, v, at: DEMO.think + 0.4 + rnd() * 8.2, done: false };
    }) };
    // named thinkers decide right after their thought bubble
    CAST.filter((c) => c[4]).forEach((c, i) => { const d = demo.decide.find((x) => x.a.id === c[0]); d.thinkAt = DEMO.think + 0.3 + i * 1.5; d.at = d.thinkAt + 2.2; d.thought = c[4]; });
    setPhase('spawn');
  }
  function demoTick() {
    if (!demo) demoStart();
    const t = now;
    if (phase === 'spawn' && t >= DEMO.talk) setPhase('talk');
    if (phase === 'talk') {
      while (demo.talk < TALK.length && t >= DEMO.talk + TALK[demo.talk][0]) {
        const [, from, to, line, point] = TALK[demo.talk++];
        say(from, line, { to, duration: 3.8 });
        if (point) { const at = now + 1.1; demo.pending = (demo.pending || []).concat([{ at, point, from }]); }
      }
      if (t >= DEMO.think) setPhase('think');
    }
    if (demo.pending) demo.pending = demo.pending.filter((p) => { if (t < p.at) return true; addPoint(p.point[0], p.point[1], { by: p.from }); return false; });
    if (phase === 'think') {
      for (const d of demo.decide) {
        if (d.thinkAt != null && !d.thinking && t >= d.thinkAt) { d.thinking = true; think(d.a.id, d.thought, { duration: 2.6 }); }
        if (!d.done && t >= d.at) { d.done = true; setVerdict(d.a.id, d.v); }
      }
      while (demo.quals < QUALS.length && t >= DEMO.think + QUALS[demo.quals][0]) { const q = QUALS[demo.quals++]; addQualification(q[1], { gap: q[2], by: q[3] }); }
      if (t >= DEMO.result) setPhase('result');
    }
    if (phase === 'result' && !demo.concluded && t >= DEMO.result + 0.4) {
      demo.concluded = true;
      setConclusion(CFG.conclusion || { wanted: true, title: 'Wanted candidate', list: 'Dr. Lipp · Sales shortlist',
        summary: 'Most of the simulated market was convinced: listens first, closes low-risk. Next time bring product and margin facts.' });
      setDeal(CFG.deal || 'Mara asked for a 24-unit trial offer.', CFG.dealLabel);
    }
    if (phase === 'result' && t >= DEMO.reset) setPhase('reset');
    if (phase === 'reset' && t >= DEMO.end) { demo = null; demoStart(); }
  }

  // ---------- slide lifecycle ----------
  function enter() {
    if (active) return; active = true; theme();
    if (!live) { demo = null; now = 0; }
    if (REDUCED && !live) { // one still: the split, mid-decision
      demoStart(); for (let i = 0; i < 1300; i++) { now += 1 / 60; demoTick(); frame(1 / 60); if (now > DEMO.result + 1) break; }
      active = false; return;
    }
    start();
    root.dispatchEvent(new CustomEvent('swarm:start'));
  }
  function leave() { if (!active) return; active = false; stop(); bubbles = []; root.dispatchEvent(new CustomEvent('swarm:stop')); }
  document.addEventListener('deck:slidechange', (e) => { if (e.detail.slide.contains(root)) enter(); else leave(); });
  if (!document.querySelector('.deck-slide')) enter(); // standalone page

  // ---------- public API ----------
  window.SWARM = window.MAYBE_SWARM = {
    /** Stop the demo; from now on the slide shows only what you send. */
    connect() { live = true; demo = null; clearAll(); if (modeEl) { modeEl.textContent = 'Live agents'; modeEl.classList.add('is-live'); } if (active) start(); },
    /** Back to the looping demo. */
    disconnect() { live = false; demo = null; now = 0; clearPanel(); if (modeEl) { modeEl.textContent = 'Demo simulation'; modeEl.classList.remove('is-live'); } },
    /** Replace the population: [{id, role, face?: 0..4 (named agent with a drawn face), delay?: seconds before it pops out}] */
    setAgents, addAgent,
    /** 'spawn' | 'talk' | 'think' | 'result' (and 'idle' | 'reset') */
    setPhase,
    /** Speech bubble from an agent; {to: otherId} lights the link between them. {duration} in seconds. */
    say,
    /** Thought bubble (dashed) + thinking halo: an agent weighing the call on its own. */
    think,
    /** 'yes' | 'maybe' | 'no' (or null). In think/result the agent flies to that cluster. */
    setVerdict,
    /** Rename the clusters, e.g. {yes: {label: 'Convinced'}} */
    setClusters,
    /** Left panel: {name, meta} of the candidate whose call is reviewed. */
    setCandidate,
    /** Left panel: addPoint('pro' | 'con', text, {by: agentId}) — a dot flies from that agent into "What worked" / "What didn't". */
    addPoint,
    /** Left panel: addQualification(text, {gap: true for something to work on, by: agentId}) */
    addQualification,
    /** Left panel: the concrete conclusion. {wanted: true|false, title?, summary, list?: 'Dr. Lipp · Sales · wanted candidates'}; null hides it. */
    setConclusion,
    /** Left panel: the real deal outcome from the call, kept apart from the score. */
    setDeal,
    clear: clearAll,
    get phase() { return phase; },
    get agents() { return agents.map((a) => ({ id: a.id, role: a.role, verdict: a.verdict })); },
    get live() { return live; },
    get demoConfig() { return CFG; },
    root,
  };
})();
