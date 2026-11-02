/* MAYBE live-call slide runtime.
 *
 * The live-call slide (canvas board Slide05b) has:
 *   [data-call]           the slide root; data-call-script holds the demo conversation (JSON)
 *   [data-orb]            the voice orb (biggest in silence, smaller the louder the sound)
 *   [data-bubbles]        the conversation column on the right
 *   [data-avatar]         the drawn character; class avatar--talking while the agent speaks
 *   [data-call-status] [data-call-timer] [data-call-mute] [data-call-end]   optional; used when present
 *
 * Smoothness: one requestAnimationFrame loop drives everything while the slide is on screen.
 * The level is eased (never jumps), the waves and swirl move by accumulated phase (their speed follows
 * the level but they never restart), and bubbles glide into place (FLIP) while text streams in word by word.
 *
 * Until a developer connects a real voice agent, the slide plays a demo: with a microphone it waits for the
 * presenter to speak before showing their line, then Mara "answers". See LIVE-CALL.md for the API.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-call]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const orb = $('[data-orb]'), bubbles = $('[data-bubbles]'), avatar = $('[data-avatar]');
  const waveA = orb.querySelector('.orb__wave--a'), waveB = orb.querySelector('.orb__wave--b');
  const swirl = orb.querySelector('.orb__swirl');
  const statusEl = $('[data-call-status]'), timerEl = $('[data-call-timer]');
  const muteBtn = $('[data-call-mute]'), endBtn = $('[data-call-end]');
  const AGENT_NAME = 'Mara';
  const MAX_BUBBLES = 4;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let script = [];
  try { script = JSON.parse(root.dataset.callScript || '[]'); } catch (e) { script = []; }

  let mode = 'idle', live = false, muted = false, active = false;
  orb.classList.add('orb--live'); // CSS hands motion over to this script

  // ---------- mode (who is talking) ----------
  function setMode(m) {
    mode = m === 'you' || m === 'agent' ? m : 'idle';
    orb.classList.remove('orb--idle', 'orb--you', 'orb--agent');
    orb.classList.add('orb--' + mode);
    avatar.classList.toggle('avatar--talking', mode === 'agent');
    const text = mode === 'you' ? (muted ? 'Muted' : 'You are speaking') : mode === 'agent' ? `${AGENT_NAME} is speaking` : 'Listening…';
    if (statusEl) statusEl.textContent = text;
    orb.setAttribute('aria-label', text);
  }

  // ---------- level sources ----------
  let externalLevel = null; // set by MAYBE_CALL.setLevel (real agent)
  let mic = null, micLevel = 0, micWanted = true;

  async function startMic() {
    if (mic || !micWanted || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!active || live) { stream.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      mic = { ctx, analyser, stream, data: new Float32Array(analyser.fftSize) };
    } catch (e) { mic = null; micWanted = false; }
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.ctx.close();
    mic = null; micLevel = 0;
  }
  function readMic() {
    if (!mic) return 0;
    mic.analyser.getFloatTimeDomainData(mic.data);
    let sum = 0;
    for (let i = 0; i < mic.data.length; i++) sum += mic.data[i] * mic.data[i];
    const rms = Math.sqrt(sum / mic.data.length);
    micLevel = Math.max(0, Math.min(1, (rms - 0.012) * 7));
    return micLevel;
  }
  // gentle, speech-like envelope for the demo agent voice (no sharp spikes)
  function fakeVoice(t) {
    const w = 0.5 + 0.5 * (Math.sin(t * 5.1) * 0.5 + Math.sin(t * 7.9 + 1.3) * 0.3 + Math.sin(t * 2.3) * 0.2);
    return 0.22 + 0.22 * w;
  }

  // speaking detector with hysteresis, so modes don't flicker
  const talk = { on: false, since: 0 };
  function detectSpeech(level, now) {
    if (!talk.on && level > 0.14) { if (!talk.since) talk.since = now; if (now - talk.since > 120) { talk.on = true; talk.since = 0; return 'start'; } }
    else if (talk.on && level < 0.06) { if (!talk.since) talk.since = now; if (now - talk.since > 650) { talk.on = false; talk.since = 0; return 'stop'; } }
    else talk.since = 0;
    return null;
  }

  // ---------- the render loop ----------
  let raf = null, last = 0, shown = 0, phaseA = 0, phaseB = 0, angle = 0, speechListeners = [];
  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const t = now / 1000;

    // target level
    let target;
    if (externalLevel !== null) target = externalLevel;
    else {
      const you = mic ? readMic() : (mode === 'you' ? fakeVoice(t + 2) : 0);
      const agent = mode === 'agent' ? fakeVoice(t) : 0;
      target = Math.max(you, agent);
      if (mic) { const ev = detectSpeech(you, now); if (ev) speechListeners.forEach((f) => f(ev)); }
    }
    target = muted && mode === 'you' ? 0 : target;

    // ease toward the target: quick to shrink, slower to grow back (dt-based, frame-rate independent)
    const k = target > shown ? 7 : 3.2;
    shown += (target - shown) * (1 - Math.exp(-k * dt));
    const lvl = REDUCED ? 0 : shown;

    orb.style.transform = `scale(${(1 - lvl * 0.24).toFixed(4)})`;
    orb.style.setProperty('--level', lvl.toFixed(3));

    if (!REDUCED) {
      // wave speed follows the level smoothly; position accumulates, so nothing ever jumps
      phaseA = (phaseA + dt * (0.14 + lvl * 0.55)) % 1;
      phaseB = (phaseB + dt * (0.10 + lvl * 0.35)) % 1;
      angle = (angle + dt * (24 + lvl * 60)) % 360;
      if (waveA) waveA.style.transform = `translate3d(${(-phaseA * 50).toFixed(3)}%,0,0)`;
      if (waveB) waveB.style.transform = `translate3d(${(-50 + phaseB * 50).toFixed(3)}%,0,0)`;
      if (swirl) swirl.style.transform = `rotate(${angle.toFixed(2)}deg)`;
    }
    raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = null; }

  // ---------- bubbles: glide (FLIP) + stream text ----------
  function bubbleStyle(role) {
    const you = role === 'you';
    return {
      wrap: [
        `align-self: ${you ? 'flex-end' : 'flex-start'}`, 'max-width: 600px', 'padding: 16px 22px',
        `border-radius: ${you ? '20px 20px 6px 20px' : '20px 20px 20px 6px'}`,
        `background: ${you ? '#09090B' : '#FFFFFF'}`, `color: ${you ? '#FAFAFA' : '#09090B'}`,
        `border: ${you ? '0' : '1px solid #E4E4E7'}`, 'font-size: 26px', 'line-height: 1.4',
        'box-shadow: 0 1px 2px rgba(0,0,0,.04)', 'transition: opacity .45s ease', 'will-change: transform'
      ].join('; '),
      name: `display: block; font-size: 15px; font-weight: 600; letter-spacing: .02em; color: ${you ? '#A1A1AA' : '#5B21B6'}; margin-bottom: 4px;`
    };
  }

  // Run a DOM change and animate every existing bubble from its old to its new position.
  function glide(change) {
    const kids = Array.from(bubbles.children);
    const before = new Map(kids.map((el) => [el, el.getBoundingClientRect().top]));
    change();
    const scale = root.getBoundingClientRect().height / root.offsetHeight || 1; // deck scales the stage
    Array.from(bubbles.children).forEach((el) => {
      if (!before.has(el) || REDUCED) return;
      const dy = (before.get(el) - el.getBoundingClientRect().top) / scale;
      if (Math.abs(dy) < 0.5) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }

  function fadeOld() {
    const all = Array.from(bubbles.children);
    all.forEach((el, i) => { el.style.opacity = i === all.length - 1 ? '1' : String(0.5 + (i / Math.max(1, all.length - 1)) * 0.4); });
  }

  function makeBubble(role) {
    const st = bubbleStyle(role);
    const b = document.createElement('div');
    b.className = 'bubble-live';
    b.dataset.role = role;
    b.setAttribute('style', st.wrap);
    const name = document.createElement('span');
    name.setAttribute('style', st.name);
    name.textContent = role === 'you' ? 'You' : AGENT_NAME;
    const t = document.createElement('span');
    t.dataset.text = '';
    b.append(name, t);
    return b;
  }

  // Adds a bubble, or updates the last one when it is the same speaker still talking (streaming transcripts).
  function addMessage(role, text, { replaceLast = false } = {}) {
    role = role === 'you' ? 'you' : 'agent';
    const lastB = bubbles.lastElementChild;
    if (replaceLast && lastB && lastB.dataset.role === role) {
      glide(() => { lastB.querySelector('[data-text]').textContent = text; });
      return lastB;
    }
    const b = makeBubble(role);
    b.querySelector('[data-text]').textContent = text;
    glide(() => {
      bubbles.appendChild(b);
      while (bubbles.children.length > MAX_BUBBLES) bubbles.removeChild(bubbles.firstElementChild);
    });
    if (!REDUCED) b.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    fadeOld();
    return b;
  }

  // Demo helper: reveal a line word by word over `ms`, like live speech-to-text. Returns a stop function.
  function streamLine(role, text, ms) {
    const words = text.split(' ');
    let i = 0, stopped = false, timer = null;
    addMessage(role, words[0] || '');
    const step = Math.max(90, ms / Math.max(1, words.length));
    const next = () => {
      if (stopped) return;
      i += 1;
      if (i >= words.length) return;
      addMessage(role, words.slice(0, i + 1).join(' '), { replaceLast: true });
      timer = setTimeout(next, step);
    };
    timer = setTimeout(next, step);
    return { finish() { stopped = true; clearTimeout(timer); addMessage(role, text, { replaceLast: true }); } };
  }

  function clear() { bubbles.innerHTML = ''; setMode('idle'); }

  // ---------- demo conversation ----------
  let demoTimers = [], demoStep = 0, current = null, demoOn = false;
  const later = (fn, ms) => { const id = setTimeout(fn, ms); demoTimers.push(id); return id; };

  function nextTurn() {
    if (!demoOn) return;
    if (demoStep >= script.length) {
      setMode('idle');
      later(() => { clear(); demoStep = 0; nextTurn(); }, 4200);
      return;
    }
    const m = script[demoStep];
    if (m.role === 'you') {
      if (mic) { setMode('idle'); return; } // wait for the presenter to actually speak (see onSpeech)
      setMode('you');
      current = streamLine('you', m.text, 2000);
      later(() => { current.finish(); current = null; demoStep++; setMode('idle'); later(nextTurn, 700); }, 2300);
    } else {
      // Mara answers: her text appears only while she speaks
      setMode('agent');
      const ms = Math.max(1600, m.text.split(' ').length * 260);
      current = streamLine('agent', m.text, ms);
      later(() => { current.finish(); current = null; demoStep++; setMode('idle'); later(nextTurn, mic ? 300 : 800); }, ms + 250);
    }
  }

  function onSpeech(ev) {
    if (!demoOn || live) return;
    const m = script[demoStep];
    if (!m || m.role !== 'you') return;
    if (ev === 'start' && !current) {
      setMode('you');
      current = streamLine('you', m.text, Math.max(1800, m.text.split(' ').length * 300));
    } else if (ev === 'stop' && current) {
      current.finish(); current = null; demoStep++;
      setMode('idle');
      later(nextTurn, 600);
    }
  }
  speechListeners.push(onSpeech);

  function startDemo() {
    if (live || !script.length) return;
    stopDemo();
    demoOn = true; demoStep = 0; clear();
    later(nextTurn, 900);
  }
  function stopDemo() {
    demoOn = false;
    demoTimers.forEach(clearTimeout); demoTimers = [];
    if (current) { current.finish(); current = null; }
  }

  // ---------- optional timer ----------
  let clock = null, seconds = 0;
  function renderClock() { if (timerEl) timerEl.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
  function startClock(reset) { if (reset) seconds = 0; clearInterval(clock); renderClock(); clock = setInterval(() => { seconds += 1; renderClock(); }, 1000); }
  function stopClock() { clearInterval(clock); clock = null; }

  // ---------- slide visibility (from deck.js) ----------
  const slide = root.closest('.deck-slide');
  document.addEventListener('deck:slidechange', (e) => {
    const now = e.detail && e.detail.slide === slide;
    if (now === active) return;
    active = now;
    if (active) { startLoop(); if (!live) { startMic(); startDemo(); } }
    else { stopLoop(); stopMic(); if (!live) stopDemo(); }
  });

  // ---------- buttons ----------
  if (muteBtn) muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.style.background = muted ? '#F4F4F5' : '#FFFFFF';
    setMode(mode);
    root.dispatchEvent(new CustomEvent('call:mute', { bubbles: true, detail: { muted } }));
  });
  if (endBtn) endBtn.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('call:end', { bubbles: true }));
    if (!live) { stopDemo(); clear(); }
  });

  // ---------- public API for the real voice agent ----------
  window.MAYBE_CALL = {
    /** Stop the demo and the built-in mic meter; from now on the slide shows only what you send. */
    connect() { live = true; stopDemo(); stopMic(); clear(); externalLevel = 0; startLoop(); startClock(true); },
    /** Back to the demo. */
    disconnect() { live = false; externalLevel = null; stopClock(); if (active) { startMic(); startDemo(); } },
    /** 'you' | 'agent' | 'idle': who is talking now. */
    setMode,
    /** 0..1 loudness of whoever is talking. Send it as often as you like (every frame is fine); the page eases it. Louder = smaller orb. */
    setLevel(v) { externalLevel = Math.max(0, Math.min(1, Number(v) || 0)); startLoop(); },
    /** Let the built-in microphone meter drive the orb in demo mode (default on). */
    useMic(on) { micWanted = !!on; if (!on) stopMic(); else if (active && !live) startMic(); },
    /** role 'you' | 'agent'. Pass {replaceLast: true} to update the last bubble while a transcript streams in; the column glides smoothly. */
    addMessage,
    clear,
    startClock, stopClock,
    get muted() { return muted; },
    root
  };
})();
