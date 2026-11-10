/* voice-call.js: a live voice call with an AI character on a slide (the MAYBE "Mara" pattern).
 *
 * Markup (template slide 15): [data-call] root with data-call-script (JSON demo turns), [data-orb] (.orb with
 * .orb__swirl, .orb__wave--a/--b, .orb__shine), [data-bubbles], [data-avatar] (img), [data-call-status].
 *
 * Opening the slide starts a call: POST /api/realtime-session → short-lived key → microphone → WebRTC to OpenAI
 * Realtime. The presenter speaks first. Leaving the slide hangs up. If the API isn't configured, the mic is
 * blocked or the network fails, the slide plays the scripted demo instead and the status pill says "Demo".
 * One requestAnimationFrame loop eases the level (never jumps) and moves the waves by accumulated phase.
 *
 * API: window.LIVE_CALL = { connect(), disconnect(), setMode('you'|'agent'|'idle'), setLevel(0..1),
 *   addMessage(role, text, {replaceLast}), clear(), getTranscript() }
 * Events on document: call:ended { turns: [{ speaker: 'presenter'|'agent', text }] }
 */
(function () {
  'use strict';
  const root = document.querySelector('[data-call]');
  if (!root) return;
  const slide = root.closest('.deck-slide');
  const $ = (s) => root.querySelector(s);
  const orb = $('[data-orb]'), bubbles = $('[data-bubbles]'), avatar = $('[data-avatar]'), statusEl = $('[data-call-status]');
  const swirl = orb.querySelector('.orb__swirl'), waveA = orb.querySelector('.orb__wave--a'), waveB = orb.querySelector('.orb__wave--b');
  const AGENT = root.dataset.agentName || 'AI';
  const YOU = root.dataset.youName || 'You';
  const MAX_BUBBLES = 4, MAX_CALL_MS = 3 * 60 * 1000;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let script = []; try { script = JSON.parse(root.dataset.callScript || '[]'); } catch (e) {}

  let turns = [], mode = 'idle', target = 0, level = 0, phaseA = 0, phaseB = 0, rot = 0, raf = 0, last = 0;
  let link = null, demoTimers = [], session = 0, endTimer = 0, wasLive = false;

  // ---------- look ----------
  function setStatus(state, text) { if (statusEl) { statusEl.dataset.state = state; statusEl.textContent = text; } }
  function setMode(m) { mode = m === 'you' || m === 'agent' ? m : 'idle'; avatar && avatar.classList.toggle('is-talking', mode === 'agent'); }
  function setLevel(v) { target = Math.max(0, Math.min(1, +v || 0)); }
  function frame(t) {
    const dt = Math.min(64, t - (last || t)); last = t;
    level += (target - level) * (1 - Math.pow(0.001, dt / 1000 * 2.2));   // eased: never jumps
    const speed = 0.35 + level * 1.6;
    phaseA = (phaseA + dt / 7000 * speed) % 1; phaseB = (phaseB + dt / 10000 * speed) % 1; rot = (rot + dt / 14000 * 360 * (0.5 + level)) % 360;
    orb.style.setProperty('--level', level.toFixed(3));
    if (!REDUCED) {
      waveA.style.transform = `translateX(${-phaseA * 50}%)`; waveB.style.transform = `translateX(${-(1 - phaseB) * 50}%)`;
      swirl.style.transform = `rotate(${rot}deg)`;
    }
    if (link && link.meter) setLevel(link.meter());
    raf = requestAnimationFrame(frame);
  }

  // opts.id: a Realtime item id; the same id always updates the same bubble and turn, wherever it is (transcripts
  // of the presenter often arrive after the AI has started answering). opts.replaceLast: extend the newest bubble.
  const byId = new Map();
  function addMessage(role, text, opts = {}) {
    const who = role === 'agent' ? 'agent' : 'you';
    let rec = opts.id ? byId.get(opts.id) : null;
    if (!rec && opts.replaceLast) {
      const el = bubbles.lastElementChild;
      if (el && el.classList.contains(`bubble--${who}`) && el._turn) rec = { el, turn: el._turn };
    }
    if (!rec) {
      const el = document.createElement('div');
      el.className = `bubble bubble--${who} is-new`;
      el.innerHTML = '<b></b><span></span>';
      el.querySelector('b').textContent = who === 'agent' ? AGENT : YOU;
      bubbles.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-new')));
      while (bubbles.children.length > MAX_BUBBLES) bubbles.firstElementChild.remove();
      const turn = { speaker: who === 'agent' ? 'agent' : 'presenter', text: '' };
      turns.push(turn);
      el._turn = turn;
      rec = { el, turn };
      if (opts.id) byId.set(opts.id, rec);
    }
    rec.el.querySelector('span').textContent = text;
    rec.turn.text = text;
    try { sessionStorage.setItem('live-call-turns', JSON.stringify(turns.filter((t) => t.text && t.text !== '…'))); } catch (e) {}
  }
  function dropMessage(id) {
    const rec = byId.get(id); if (!rec) return;
    rec.el.remove(); turns = turns.filter((t) => t !== rec.turn); byId.delete(id);
  }
  function clear() { bubbles.innerHTML = ''; turns = []; byId.clear(); }

  // ---------- demo (no connection) ----------
  function playDemo(reason) {
    setStatus('demo', reason || 'Demo · not connected');
    let at = 600;
    script.forEach((line) => {
      const who = line.role === 'agent' ? 'agent' : 'you', words = String(line.text).split(' ');
      demoTimers.push(setTimeout(() => setMode(who), at));
      words.forEach((_, i) => demoTimers.push(setTimeout(() => { addMessage(who, words.slice(0, i + 1).join(' '), { replaceLast: i > 0 }); setLevel(0.35 + Math.random() * 0.5); }, at + i * 170)));
      at += words.length * 170 + 300;
      demoTimers.push(setTimeout(() => { setMode('idle'); setLevel(0); }, at));
      at += 900;
    });
    demoTimers.push(setTimeout(() => ended(), at));
  }

  // ---------- live ----------
  async function connect() {
    const my = ++session;
    disconnectLink(); clear(); setMode('idle'); setLevel(0); wasLive = false;
    if (!window.RTCPeerConnection || !navigator.mediaDevices) return playDemo('Demo · browser has no live audio');
    setStatus('connecting', 'Connecting…');
    let token, model = '';
    try {
      const r = await fetch('api/realtime-session', { method: 'POST' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return my === session && playDemo(j.code === 'no_credits' ? 'Demo · voice has no credits' : 'Demo · voice not configured'); }
      const j = await r.json(); token = j.value; model = j.model || '';
    } catch (e) { return my === session && playDemo('Demo · offline'); }
    if (my !== session) return;
    const L = link = { pc: null, stream: null, ctx: null };
    try {
      L.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (my !== session) return disconnectLink(L);
      L.ctx = new (window.AudioContext || window.webkitAudioContext)(); L.ctx.resume().catch(() => {});
      const meter = (stream) => { const a = L.ctx.createAnalyser(); a.fftSize = 512; L.ctx.createMediaStreamSource(stream).connect(a); const d = new Uint8Array(a.fftSize); return () => { a.getByteTimeDomainData(d); let s = 0; for (const v of d) s += (v - 128) ** 2; return Math.min(1, Math.sqrt(s / d.length) / 40); }; };
      const mic = meter(L.stream); let remote = () => 0;
      L.meter = () => Math.max(mode === 'agent' ? remote() : 0, mic());
      L.pc = new RTCPeerConnection();
      L.audio = new Audio(); L.audio.autoplay = true;
      L.pc.ontrack = (e) => { L.audio.srcObject = e.streams[0]; remote = meter(e.streams[0]); L.audio.play().catch(() => setStatus('live', 'Live · click once to hear the voice')); };
      L.pc.addTrack(L.stream.getAudioTracks()[0], L.stream);
      const ch = L.pc.createDataChannel('oai-events');
      ch.onopen = () => { clearTimeout(L.openTimer); if (my === session) { wasLive = true; setStatus('live', `Live · ${AGENT} is listening`); } };
      ch.onmessage = (e) => { try { onEvent(JSON.parse(e.data), L); } catch (err) {} };
      L.pc.onconnectionstatechange = () => { if (L.pc.connectionState === 'failed' && my === session) { disconnectLink(L); setStatus('demo', 'Connection lost'); } };
      const offer = await L.pc.createOffer(); await L.pc.setLocalDescription(offer);
      const r = await fetch('https://api.openai.com/v1/realtime/calls' + (model ? `?model=${encodeURIComponent(model)}` : ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp });
      if (!r.ok) throw new Error('calls ' + r.status);
      await L.pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
      // venue wifi that blocks WebRTC never opens the channel: don't hang on "Connecting…"
      L.openTimer = setTimeout(() => { if (my === session && link === L && (!L.pc || L.pc.connectionState !== 'connected')) { disconnectLink(L); playDemo('Demo · network blocks live audio'); } }, 12000);
      clearTimeout(endTimer); endTimer = setTimeout(() => hangUp(), MAX_CALL_MS);
    } catch (e) {
      console.warn('[voice-call]', e.name, e.message);
      disconnectLink(L);
      if (my === session) playDemo(e.name === 'NotAllowedError' ? 'Demo · microphone blocked' : 'Demo · could not connect');
    }
  }

  function onEvent(ev, L) {
    const t = ev.type, id = ev.item_id;
    if (t === 'input_audio_buffer.speech_started') setMode('you');
    else if (t === 'input_audio_buffer.speech_stopped') setMode('idle');
    // reserve the presenter's bubble when their audio is committed, so it stays before the AI's answer
    else if (t === 'input_audio_buffer.committed' && id) { L.text = L.text || {}; L.text[id] = ''; addMessage('you', '…', { id }); }
    else if (t === 'conversation.item.input_audio_transcription.delta') { L.text = L.text || {}; L.text[id] = (L.text[id] || '') + (ev.delta || ''); addMessage('you', L.text[id], { id }); }
    else if (t === 'conversation.item.input_audio_transcription.completed') { const tx = (ev.transcript || '').trim(); if (tx) addMessage('you', tx, { id }); else dropMessage(id); }
    else if (t === 'conversation.item.input_audio_transcription.failed') dropMessage(id);
    else if (t === 'response.output_audio_transcript.delta') { setMode('agent'); L.text = L.text || {}; L.text[id] = (L.text[id] || '') + (ev.delta || ''); addMessage('agent', L.text[id], { id }); }
    else if (t === 'response.output_audio_transcript.done') { if (ev.transcript) addMessage('agent', ev.transcript, { id }); }
    else if (t === 'response.function_call_arguments.done' && ev.name === 'end_call') wantsHangUp(L);
    else if (t === 'response.done') {
      if ((ev.response && ev.response.output || []).some((o) => o.type === 'function_call' && o.name === 'end_call')) wantsHangUp(L);
    }
    else if (t === 'output_audio_buffer.stopped') {
      if (mode === 'agent') setMode('idle');
      if (L.hangAfter) { clearTimeout(L.hangTimer); L.hangTimer = setTimeout(() => { if (link === L) hangUp(); }, 500); } // after the last word is heard
    }
    else if (t === 'error') console.warn('[voice-call] realtime error', ev.error && ev.error.code);
  }
  function wantsHangUp(L) {
    if (L.hangAfter) return;
    L.hangAfter = true;
    clearTimeout(L.hangTimer);
    L.hangTimer = setTimeout(() => { if (link === L) hangUp(); }, 10000); // safety net if the audio-stopped event never comes
  }

  function disconnectLink(L = link) {
    if (!L) return;
    clearTimeout(L.openTimer); clearTimeout(L.hangTimer);
    try { L.pc && L.pc.close(); } catch (e) {}
    L.stream && L.stream.getTracks().forEach((tr) => tr.stop());
    L.ctx && L.ctx.close().catch(() => {});
    if (L.audio) { L.audio.pause(); L.audio.srcObject = null; }
    if (link === L) link = null;
  }
  function ended() { document.dispatchEvent(new CustomEvent('call:ended', { detail: { turns: window.LIVE_CALL.getTranscript() } })); }
  function hangUp() { const had = !!link; disconnectLink(); clearTimeout(endTimer); setMode('idle'); setLevel(0); if (had) { setStatus('demo', 'Call ended'); ended(); } }
  function disconnect() { session++; demoTimers.forEach(clearTimeout); demoTimers = []; hangUp(); }

  document.addEventListener('deck:slidechange', (e) => {
    const here = e.detail.slide === slide;
    if (here) { if (!raf) raf = requestAnimationFrame(frame); connect(); }
    else if (raf || link || demoTimers.length) { disconnect(); cancelAnimationFrame(raf); raf = 0; }
  });
  window.LIVE_CALL = { wasLive: () => wasLive, connect, disconnect, setMode, setLevel, addMessage, clear, getTranscript: () => turns.filter((t) => t.text && t.text !== '…').map((t) => ({ ...t })) };
})();
