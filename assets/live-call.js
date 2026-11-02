/* MAYBE live-call slide runtime.
 *
 * The live-call slide (canvas board Slide05b) has:
 *   [data-call]           the slide root; data-call-script holds the demo conversation (JSON)
 *   [data-orb]            the voice orb; classes orb--idle | orb--you | orb--agent; CSS var --level (0-1) swells it
 *   [data-bubbles]        the conversation column on the right
 *   [data-avatar]         the drawn character; class avatar--talking while the agent speaks
 *   [data-call-status] [data-call-timer] [data-call-mute] [data-call-end]   optional; used when present
 *
 * Until a developer connects a real voice agent, the slide plays the scripted demo whenever it is on screen.
 * To drive it for real, call window.MAYBE_CALL.connect() once, then feed it events. See LIVE-CALL.md.
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-call]');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const orb = $('[data-orb]'), bubbles = $('[data-bubbles]'), avatar = $('[data-avatar]');
  const statusEl = $('[data-call-status]'), timerEl = $('[data-call-timer]');
  const muteBtn = $('[data-call-mute]'), endBtn = $('[data-call-end]');
  const AGENT_NAME = 'Mara';
  const MAX_BUBBLES = 4;

  let script = [];
  try { script = JSON.parse(root.dataset.callScript || '[]'); } catch (e) { script = []; }

  let mode = 'idle', live = false, muted = false, demoTimer = null, clock = null, seconds = 0, active = false;

  // ---------- view ----------
  function setMode(m) {
    mode = m === 'you' || m === 'agent' ? m : 'idle';
    orb.classList.remove('orb--idle', 'orb--you', 'orb--agent');
    orb.classList.add('orb--' + mode);
    avatar.classList.toggle('avatar--talking', mode === 'agent');
    const text = mode === 'you' ? (muted ? 'Muted' : 'You are speaking') : mode === 'agent' ? `${AGENT_NAME} is speaking` : 'Listening…';
    if (statusEl) statusEl.textContent = text;
    orb.setAttribute('aria-label', text);
  }

  function setLevel(v) {
    const n = Math.max(0, Math.min(1, Number(v) || 0));
    orb.style.setProperty('--level', n.toFixed(3));
  }

  function bubbleStyle(role) {
    const you = role === 'you';
    return {
      wrap: [
        `align-self: ${you ? 'flex-end' : 'flex-start'}`, 'max-width: 600px', 'padding: 16px 22px',
        `border-radius: ${you ? '20px 20px 6px 20px' : '20px 20px 20px 6px'}`,
        `background: ${you ? '#09090B' : '#FFFFFF'}`, `color: ${you ? '#FAFAFA' : '#09090B'}`,
        `border: ${you ? '0' : '1px solid #E4E4E7'}`, 'font-size: 26px', 'line-height: 1.4',
        'box-shadow: 0 1px 2px rgba(0,0,0,.04)', 'transition: opacity .3s'
      ].join('; '),
      name: `display: block; font-size: 15px; font-weight: 600; letter-spacing: .02em; color: ${you ? '#A1A1AA' : '#5B21B6'}; margin-bottom: 4px;`
    };
  }

  // Adds a bubble, or updates the last one when it is the same speaker still talking (streaming transcripts).
  function addMessage(role, text, { replaceLast = false } = {}) {
    role = role === 'you' ? 'you' : 'agent';
    const last = bubbles.lastElementChild;
    if (replaceLast && last && last.dataset.role === role) {
      last.querySelector('[data-text]').textContent = text;
      return;
    }
    const st = bubbleStyle(role);
    const b = document.createElement('div');
    b.className = 'bubble';
    b.dataset.role = role;
    b.setAttribute('style', st.wrap);
    const name = document.createElement('span');
    name.setAttribute('style', st.name);
    name.textContent = role === 'you' ? 'You' : AGENT_NAME;
    const t = document.createElement('span');
    t.dataset.text = '';
    t.textContent = text;
    b.append(name, t);
    bubbles.appendChild(b);
    while (bubbles.children.length > MAX_BUBBLES) bubbles.removeChild(bubbles.firstElementChild);
    const all = Array.from(bubbles.children);
    all.forEach((el, i) => { el.style.opacity = i === all.length - 1 ? '1' : String(0.55 + i * 0.12); });
  }

  function clear() { bubbles.innerHTML = ''; setMode('idle'); setLevel(0); }

  function renderClock() {
    if (timerEl) timerEl.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function startClock(reset) {
    if (reset) seconds = 0;
    clearInterval(clock);
    renderClock();
    clock = setInterval(() => { seconds += 1; renderClock(); }, 1000);
  }
  function stopClock() { clearInterval(clock); clock = null; }

  // ---------- level: real microphone + simulated agent voice ----------
  // The orb is biggest in silence and shrinks as sound gets louder (CSS: scale(1 - level * .26)).
  orb.classList.add('orb--live');
  let mic = null; // { ctx, analyser, stream, data }
  let micLevel = 0, micWanted = true, levelRaf = null;

  async function startMic() {
    if (mic || !micWanted || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      mic = { ctx, analyser, stream, data: new Float32Array(analyser.fftSize) };
    } catch (e) { mic = null; micWanted = false; /* denied or no mic: keep the simulation */ }
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
    const target = Math.max(0, Math.min(1, (rms - 0.012) * 7));
    micLevel += (target - micLevel) * (target > micLevel ? 0.45 : 0.08); // fast attack, slow release
    return micLevel;
  }
  function fakeVoice(m) {
    // speech-like envelope used when there is no real audio for that speaker
    const t = performance.now() / 1000;
    const base = m === 'you' ? 0.5 : m === 'agent' ? 0.38 : 0;
    const w = (Math.sin(t * 9) + Math.sin(t * 13.7) * 0.6 + Math.sin(t * 4.3) * 0.4) / 2;
    return Math.max(0, base + base * 0.7 * w);
  }
  function levelLoop() {
    const you = mic ? readMic() : (mode === 'you' ? fakeVoice('you') : 0);
    const agent = mode === 'agent' ? fakeVoice('agent') : 0;
    // while the presenter is actually talking, show the "you" motion inside the orb
    if (mic) {
      orb.classList.toggle('orb--you', you > 0.12);
      orb.classList.toggle('orb--agent', you <= 0.12 && mode === 'agent');
      orb.classList.toggle('orb--idle', you <= 0.12 && mode !== 'agent');
    }
    setLevel(Math.max(you, agent));
    levelRaf = requestAnimationFrame(levelLoop);
  }
  function startLevels() { if (!levelRaf) levelRaf = requestAnimationFrame(levelLoop); }
  function stopLevels() { cancelAnimationFrame(levelRaf); levelRaf = null; setLevel(0); }

  function startDemo() {
    if (live || !script.length) return;
    stopDemo();
    clear();
    startClock(true);
    seconds = 252;
    let step = 0;
    const tick = () => {
      if (step < script.length) {
        const m = script[step++];
        addMessage(m.role, m.text);
        setMode(m.role);
        demoTimer = setTimeout(tick, 2600);
      } else {
        setMode('idle');
        demoTimer = setTimeout(() => { clear(); step = 0; demoTimer = setTimeout(tick, 900); }, 3200);
      }
    };
    demoTimer = setTimeout(tick, 700);
  }
  function stopDemo() {
    clearTimeout(demoTimer); demoTimer = null;
    stopClock();
  }

  // ---------- slide visibility (from deck.js) ----------
  const slide = root.closest('.deck-slide');
  document.addEventListener('deck:slidechange', (e) => {
    const now = e.detail && e.detail.slide === slide;
    if (now === active) return;
    active = now;
    if (active) { if (!live) { startLevels(); startMic(); startDemo(); } }
    else { stopLevels(); stopMic(); if (!live) stopDemo(); }
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
    if (!live) { stopDemo(); clear(); if (statusEl) statusEl.textContent = 'Call ended'; }
  });

  // ---------- public API for the real voice agent ----------
  window.MAYBE_CALL = {
    /** Stop the demo; from now on the page only shows what you send. */
    connect() { live = true; stopDemo(); stopMic(); clear(); startClock(true); },
    /** Back to the scripted demo. */
    disconnect() { live = false; stopClock(); if (active) startDemo(); },
    /** 'you' | 'agent' | 'idle' : who is talking now. */
    setMode,
    /** 0..1 loudness of whoever is talking; call every animation frame. Louder = smaller orb. After connect(), call this yourself (the built-in mic and simulation stop driving it). */
    setLevel: (v) => { if (levelRaf) stopLevels(); setLevel(v); },
    /** Let the built-in microphone meter drive the orb (default on, demo only). */
    useMic(on) { micWanted = !!on; if (!on) stopMic(); else if (active && !live) startMic(); },
    /** role 'you' | 'agent'. Pass {replaceLast: true} to update a bubble while a transcript streams in. */
    addMessage,
    clear,
    startClock, stopClock,
    get muted() { return muted; },
    root
  };
})();
