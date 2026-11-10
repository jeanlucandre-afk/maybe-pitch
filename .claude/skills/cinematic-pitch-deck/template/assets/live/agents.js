/* agents.js: plays a real review of the call on the agent-world slide (assets/live/agent-world.js, window.SWARM).
 *
 * Page load: GET /api/agents-review → the panel (names, faces, labels). No API → the slide keeps its scripted demo
 * ("Demo simulation", from data-demo on the slide root).
 * Slide opens with a call transcript (LIVE_CALL from the voice slide): the crowd spawns at once while
 * POST /api/agents-review asks the model; then the panel talks (1.8s apart, points fly into the card), thinks and
 * decides one by one, the crowd follows the estimated split, qualifications and the conclusion land.
 * If the transcript came from the call slide's scripted demo, the mode pill says "Review of the demo call".
 * Sets data-done on the slide root when finished (tools/shoot.mjs waits for it).
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-swarm]');
  if (!root || !window.SWARM) return;
  const slide = root.closest('.deck-slide');
  const S = window.SWARM;
  const modeEl = root.querySelector('[data-swarm-mode]');
  const CROWD = 240;
  let panel = null, run = 0, timers = [];
  const later = (ms, fn) => { const my = run; timers.push(setTimeout(() => { if (my === run) fn(); }, ms)); };

  fetch('api/agents-review', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((p) => { panel = p; }).catch(() => {});

  function transcript() {
    const live = !!(window.LIVE_CALL && window.LIVE_CALL.wasLive && window.LIVE_CALL.wasLive());
    let t = window.LIVE_CALL ? window.LIVE_CALL.getTranscript() : [];
    if (!t.length) { try { t = JSON.parse(sessionStorage.getItem('live-call-turns') || '[]'); } catch (e) {} }
    return { turns: t.filter((x) => x && x.text && x.text.trim() && x.text !== '…'), live };
  }

  function population() {
    const roles = panel.crowdRoles && panel.crowdRoles.length ? panel.crowdRoles : ['Person'];
    const list = [];
    for (let i = 0; i < CROWD; i++) list.push({ id: 'c' + i, role: roles[i % roles.length], face: -1, delay: 0.35 + 3.1 * Math.pow(((i * 7919) % 997) / 997, 1.6) });
    // named people sit on evenly spaced slots, so a few faces always turn past the front of the ball
    panel.agents.forEach((a, k) => { const s = list[Math.round((k + 0.5) * CROWD / panel.agents.length)]; Object.assign(s, { id: a.id, role: a.role, face: a.face == null ? k % 5 : a.face, delay: 0.6 + k * 0.28 }); });
    return list;
  }

  // the crowd follows the estimated split exactly, in a scattered order
  function crowdVerdicts(split, named) {
    const ids = population().map((p) => p.id).filter((id) => !named.has(id));
    const nYes = Math.round(ids.length * split.yes / 100), nMaybe = Math.round(ids.length * split.maybe / 100);
    const order = ids.map((id, i) => [((i * 7919) % 1009), id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return order.map((id, i) => ({ id, verdict: i < nYes ? 'yes' : i < nYes + nMaybe ? 'maybe' : 'no' }));
  }

  function play(review, demoCall) {
    S.setPhase('talk');
    let at = 600;
    review.talk.forEach((l) => {
      later(at, () => S.say(l.id, l.says, { to: l.to, duration: 3.8 }));
      if (l.point && l.point.kind !== 'none' && l.point.text) later(at + 1100, () => S.addPoint(l.point.kind, l.point.text, { by: l.id }));
      at += 1800;
    });
    const thinkAt = at + 1200;
    later(thinkAt, () => S.setPhase('think'));
    let t = thinkAt + 300;
    review.think.forEach((th) => {
      later(t, () => S.think(th.id, th.thinks, { duration: 2.6 }));
      later(t + 2200, () => S.setVerdict(th.id, th.verdict));
      t += 1600;
    });
    const span = Math.max(4000, t - thinkAt);
    const crowd = crowdVerdicts(review.crowd, new Set(panel.agents.map((a) => a.id)));
    crowd.forEach((c, i) => later(thinkAt + 400 + (i / crowd.length) * span, () => S.setVerdict(c.id, c.verdict)));
    review.qualifications.forEach((q, i) => later(thinkAt + 800 + i * 1600, () => S.addQualification(q.text, { gap: q.gap, by: q.by })));
    const resultAt = thinkAt + span + 1200;
    later(resultAt, () => S.setPhase('result'));
    later(resultAt + 400, () => {
      const lab = (panel.conclusion || {})[review.conclusion.positive ? 'yes' : 'no'] || {};
      S.setConclusion({ wanted: review.conclusion.positive, title: lab.title, small: lab.small, list: lab.list, added: lab.added, summary: review.conclusion.summary });
      S.setDeal(null);
      if (demoCall && modeEl) modeEl.textContent = 'Review of the demo call';
    });
    later(resultAt + 2400, () => { root.dataset.done = '1'; });
  }

  async function start() {
    const my = ++run; delete root.dataset.done;
    const { turns, live } = transcript();
    if (!panel || !turns.length) return; // the slide's own scripted demo plays, labelled "Demo simulation"
    S.connect();
    if (!live && modeEl) modeEl.textContent = 'Review of the demo call';
    S.setCandidate(panel.candidate || {});
    if (panel.clusters) S.setClusters({ yes: { label: panel.clusters.yes }, maybe: { label: panel.clusters.maybe }, no: { label: panel.clusters.no } });
    S.setAgents(population());
    S.setPhase('spawn');
    const t0 = performance.now();
    try {
      const r = await fetch('api/agents-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: turns }) });
      if (!r.ok) throw new Error('review ' + r.status);
      const review = await r.json();
      if (my !== run) return;
      later(Math.max(0, 4400 - (performance.now() - t0)), () => play(review, !live)); // let the spawn finish
    } catch (e) {
      if (my === run) S.disconnect(); // back to the labelled scripted demo
    }
  }
  function stop() { run++; timers.forEach(clearTimeout); timers = []; }

  document.addEventListener('deck:slidechange', (e) => { if (e.detail.slide === slide) start(); else stop(); });
})();
