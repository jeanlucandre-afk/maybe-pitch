/* audience.js: the room votes on their phones; results grow live on the slide.
 *
 * Markup (template slide 17): [data-poll] root, [data-qr] (QR code box), [data-poll-url] (short link text),
 * [data-poll-question], [data-poll-rows], [data-poll-total], [data-poll-status].
 * The QR points to <deck origin>/vote (vote.html). While the slide is open it reads GET /api/poll every 1.5s.
 * No API (static hosting, offline) → a clearly labelled demo with simulated votes.
 * Needs assets/live/vendor/qrcode.js (qrcode-generator, MIT) loaded before this file.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-poll]');
  if (!root) return;
  const slide = root.closest('.deck-slide');
  const $ = (s) => root.querySelector(s);
  const statusEl = $('[data-poll-status]');
  let timer = 0, demoCounts = null, built = '', everLive = false, failures = 0, warned = false;
  const setStatus = (state) => { if (statusEl) statusEl.dataset.state = state; };

  function drawQr() {
    const url = (root.dataset.voteUrl || `${location.origin}/vote`);
    $('[data-poll-url]') && ($('[data-poll-url]').textContent = url.replace(/^https?:\/\//, ''));
    const box = $('[data-qr]');
    if (!box || typeof window.qrcode !== 'function' || box.dataset.done === url) return;
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
    const ink = getComputedStyle(root).getPropertyValue('--ink').trim();   // QR in the brand ink, no white box
    box.querySelectorAll('path, rect').forEach((el) => { const f = (el.getAttribute('fill') || '').toLowerCase(); if (f === 'black' || f === '#000000') el.setAttribute('fill', ink || '#000'); });
    box.dataset.done = url;
  }

  function render(p) {
    // the question stays as designed on the slide (accent word); only a demo without a slide question fills it
    const q = $('[data-poll-question]'); if (q && !q.textContent.trim()) q.textContent = p.question;
    const rows = $('[data-poll-rows]');
    const sig = JSON.stringify(p.options);
    if (built !== sig) {   // rebuild when the options change (demo → live, or a new polls.json)
      rows.innerHTML = p.options.map(() => '<div class="poll-row"><div class="top"><span class="label"></span><span class="val">0<span class="pc">%</span></span></div><span class="track"><i class="fill"></i></span></div>').join('');
      [...rows.children].forEach((r, i) => { r.querySelector('.label').textContent = p.options[i]; });
      built = sig;
    }
    const max = Math.max(...p.counts);
    [...rows.children].forEach((r, i) => {
      const share = p.total ? Math.round(p.counts[i] / p.total * 100) : 0;
      r.querySelector('.val').firstChild.textContent = String(share);
      r.querySelector('.fill').style.width = `${share}%`;
      r.classList.toggle('is-lead', p.total > 0 && p.counts[i] === max);
    });
    $('[data-poll-total]') && ($('[data-poll-total]').textContent = `${p.total} ${p.total === 1 ? 'vote' : 'votes'}${p.demo ? ' · demo, simulated' : ''}`);
  }

  async function tick() {
    try {
      const r = await fetch('api/poll', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const p = await r.json();
      render(p); everLive = true; failures = 0;
      setStatus('live');
      if (p.store === 'memory' && !warned) { warned = true; console.warn('[poll] votes are in memory: connect Upstash Redis in Vercel before the event'); }
    } catch (e) {
      // once it has been live, a hiccup keeps the last real result on screen; never swap in simulated votes
      if (everLive) { failures++; if (failures > 2) setStatus('connecting'); return; }
      // never live (static hosting, offline): simulated votes so the slide is never empty, labelled as such
      const opts = JSON.parse(root.dataset.demoOptions || '["Yes","Maybe","No"]');
      demoCounts = demoCounts || opts.map(() => 0);
      demoCounts = demoCounts.map((c, i) => c + (Math.random() < [0.6, 0.35, 0.15][i % 3] ? 1 : 0));
      render({ question: root.dataset.demoQuestion || '', options: opts, counts: demoCounts, total: demoCounts.reduce((a, b) => a + b, 0), demo: true });
      setStatus('demo');
    }
  }

  document.addEventListener('deck:slidechange', (e) => {
    clearInterval(timer);
    if (e.detail.slide !== slide) return;
    drawQr(); tick(); timer = setInterval(tick, 1500);
  });
})();
