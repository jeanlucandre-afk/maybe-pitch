/* agents.js: a panel of simulated people reacts live to what just happened (the MAYBE "agent world" pattern).
 *
 * Markup (template slide 16): [data-agents] root with data-demo (JSON: a full review used when offline),
 * [data-ring] (the circle of people), [data-review] with [data-pros] [data-cons] [data-summary] [data-tally],
 * [data-agents-status].
 * On slide open: takes the call transcript (LIVE_CALL.getTranscript(), else sessionStorage, else the call slide's
 * demo script), shows the people appearing, asks POST /api/agents-review, then plays it: each person says their
 * line (1.5s apart), turns to a verdict colour, and the review panel fills in. Offline → the data-demo review.
 * Always labelled: simulated people, synthetic estimate.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-agents]');
  if (!root) return;
  const slide = root.closest('.deck-slide');
  const $ = (s) => root.querySelector(s);
  const ring = $('[data-ring]'), statusEl = $('[data-agents-status]');
  let demo = {}; try { demo = JSON.parse(root.dataset.demo || '{}'); } catch (e) {}
  let timers = [], run = 0;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const setStatus = (state, text) => { if (statusEl) { statusEl.dataset.state = state; statusEl.textContent = text; } };
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  function transcript() {
    let t = window.LIVE_CALL ? window.LIVE_CALL.getTranscript() : [];
    if (!t.length) { try { t = JSON.parse(sessionStorage.getItem('live-call-turns') || '[]'); } catch (e) {} }
    if (!t.length) {
      const call = document.querySelector('[data-call]');
      try { t = JSON.parse(call && call.dataset.callScript || '[]').map((l) => ({ speaker: l.role === 'agent' ? 'agent' : 'presenter', text: l.text })); } catch (e) {}
    }
    return t.filter((x) => x.text && x.text.trim());
  }

  function layout(agents) {
    ring.innerHTML = '';
    const R = +(ring.dataset.radius || 300), n = agents.length;
    return agents.map((a, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'agent-node is-hidden';
      el.style.left = `${R + Math.cos(ang) * R}px`; el.style.top = `${R + Math.sin(ang) * R - 60}px`;
      el.innerHTML = '<div class="agent-say"></div><div class="agent-face"></div><div class="agent-name"></div><div class="agent-verdict"></div>';
      el.querySelector('.agent-face').textContent = initials(a.name || a.id);
      el.querySelector('.agent-name').textContent = a.name || a.id;
      ring.appendChild(el);
      later(150 + i * 110, () => el.classList.remove('is-hidden'));
      return el;
    });
  }

  function fillList(sel, items, start) {
    const ul = $(sel); if (!ul) return; ul.innerHTML = '';
    (items || []).forEach((txt, i) => { const li = document.createElement('li'); li.textContent = txt; ul.appendChild(li); later(start + i * 220, () => li.classList.add('is-in')); });
  }

  function play(review, my, isDemo) {
    if (my !== run) return;
    const labels = review.verdictLabels || { yes: 'Yes', maybe: 'Maybe', no: 'No' };
    const nodes = layout(review.agents);
    setStatus(isDemo ? 'demo' : 'live', isDemo ? 'Demo review · simulated people' : 'Live review · simulated people');
    let at = 900;
    review.agents.forEach((a, i) => {
      const el = nodes[i];
      later(at, () => { nodes.forEach((n) => n.classList.remove('is-speaking')); el.querySelector('.agent-say').innerHTML = ''; const s = document.createElement('span'); s.textContent = `“${a.says}”`; el.querySelector('.agent-say').appendChild(s); el.classList.add('is-speaking'); });
      later(at + 1300, () => { el.dataset.verdict = a.verdict; el.querySelector('.agent-verdict').textContent = labels[a.verdict] || a.verdict; });
      at += 1500;
    });
    later(at, () => nodes.forEach((n) => n.classList.remove('is-speaking')));
    const yes = review.agents.filter((a) => a.verdict === 'yes').length;
    later(at + 200, () => { const t = $('[data-tally]'); if (t) t.textContent = `${yes} of ${review.agents.length}`; });
    fillList('[data-pros]', review.pros, at + 400);
    fillList('[data-cons]', review.cons, at + 400 + (review.pros || []).length * 220);
    later(at + 1400, () => { const s = $('[data-summary]'); if (s) s.textContent = review.summary || ''; });
  }

  async function start() {
    const my = ++run;
    stop(false);
    ['[data-pros]', '[data-cons]'].forEach((s) => { const el = $(s); if (el) el.innerHTML = ''; });
    ['[data-summary]', '[data-tally]'].forEach((s) => { const el = $(s); if (el) el.textContent = ''; });
    const t = transcript();
    if (demo.agents) layout(demo.agents.map((a) => ({ name: a.name, id: a.id })));
    setStatus('connecting', 'The panel is thinking…');
    try {
      if (!t.length) throw new Error('no transcript');
      const r = await fetch('api/agents-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: t }) });
      if (!r.ok) throw new Error('review ' + r.status);
      play(await r.json(), my, false);
    } catch (e) {
      if (demo.agents) play(demo, my, true); else setStatus('demo', 'Review unavailable');
    }
  }
  function stop(bump = true) { if (bump) run++; timers.forEach(clearTimeout); timers = []; }

  document.addEventListener('deck:slidechange', (e) => { if (e.detail.slide === slide) start(); else stop(); });
  window.LIVE_AGENTS = { start, stop };
})();
