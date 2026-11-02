/* Live voice integration for the slide. M toggles the microphone. */
(function () {
  'use strict';
  const view = window.MAYBE_CALL;
  if (!view) return;
  let active = false, timer = null, current = null, awaitingClick = false, muted = false;

  function startLater() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (active && !current) start(); }, 1000);
  }

  function updateMic(s) {
    if (s.track) s.track.enabled = !muted && !s.agentSpeaking && !s.closing;
  }

  function render(s) {
    if (current !== s || s.closing) return;
    view.clear();
    s.turns.filter(t => t.text).forEach(t => view.addMessage(t.speaker === 'candidate' ? 'you' : 'agent', t.text));
    view.setMode(s.agentSpeaking ? 'agent' : s.userSpeaking ? 'you' : 'idle');
  }

  function turn(s, id, speaker) {
    let t = s.turns.find(item => item.id === id);
    if (!t) {
      t = { id, speaker, text: '', atMs: Math.max(0, Math.round(performance.now() - s.started)) };
      s.turns.push(t);
    }
    return t;
  }

  function rms(analyser, data) {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    return Math.min(1, Math.sqrt(sum / data.length) * 7);
  }

  function levels(s) {
    if (current !== s || s.closing) return;
    view.setLevel(Math.max(rms(s.micAnalyser, s.micData), rms(s.remoteAnalyser, s.remoteData)));
    s.raf = requestAnimationFrame(() => levels(s));
  }

  function finish(s) {
    if (s.finished) return;
    s.finished = true;
    clearTimeout(s.closeTimer);
    if (s.channel) s.channel.close();
    if (s.pc) s.pc.close();
    document.dispatchEvent(new CustomEvent('call:ended', { detail: { turns: s.turns.filter(t => t.text.trim()).map(t => ({ ...t })) } }));
  }

  function close(s, drain) {
    if (!s || s.closing) return;
    if (drain && s.userSpeaking && s.channel?.readyState === 'open') {
      // Flush an utterance that was still in progress when the slide was left.
      const last = [...s.turns].reverse().find(t => t.speaker === 'candidate');
      if (last) s.pending.add(last.id);
      s.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
    s.closing = true;
    if (current === s) current = null;
    s.abort.abort();
    cancelAnimationFrame(s.raf);
    if (s.stream) s.stream.getTracks().forEach(track => track.stop());
    if (s.audio) { s.audio.pause(); s.audio.srcObject = null; }
    if (s.ctx) s.ctx.close().catch(() => {});
    view.disconnect();
    // Allow already committed audio's asynchronous transcription to arrive.
    if (drain && s.channel && s.channel.readyState === 'open' && s.pending.size) {
      s.closeTimer = setTimeout(() => finish(s), 5000);
    } else finish(s);
  }

  function onEvent(s, event) {
    const type = event.type;
    if (type === 'input_audio_buffer.speech_started') {
      s.userSpeaking = true;
      turn(s, event.item_id, 'candidate');
      render(s);
    } else if (type === 'input_audio_buffer.speech_stopped') {
      s.userSpeaking = false;
      if (event.item_id) s.pending.add(event.item_id);
      render(s);
    } else if (type === 'input_audio_buffer.committed') {
      turn(s, event.item_id, 'candidate');
      s.pending.add(event.item_id);
    } else if (type === 'conversation.item.input_audio_transcription.delta') {
      turn(s, event.item_id, 'candidate').text += event.delta || '';
      render(s);
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      turn(s, event.item_id, 'candidate').text = event.transcript || '';
      s.pending.delete(event.item_id);
      render(s);
      if (s.closing && !s.pending.size) finish(s);
    } else if (type === 'conversation.item.input_audio_transcription.failed') {
      s.pending.delete(event.item_id);
      if (s.closing && !s.pending.size) finish(s);
    } else if (type === 'response.output_item.added' && event.item?.type === 'message') {
      turn(s, event.item.id, 'prospect');
    } else if (type === 'response.output_audio_transcript.delta') {
      turn(s, event.item_id, 'prospect').text += event.delta || '';
      render(s);
    } else if (type === 'response.output_audio_transcript.done') {
      turn(s, event.item_id, 'prospect').text = event.transcript || '';
      if (/\b(goodbye|good bye|bye(?:-bye)?|take care)\b/i.test(event.transcript || '')) s.goodbye = true;
      render(s);
    } else if (type === 'response.function_call_arguments.done' && event.name === 'end_call') {
      s.goodbye = true;
    } else if (type === 'output_audio_buffer.started') {
      s.agentSpeaking = true;
      updateMic(s);
      render(s);
    } else if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
      s.agentSpeaking = false;
      if (s.goodbye) { close(s, true); return; }
      updateMic(s);
      render(s);
    } else if (type === 'error') {
      close(s, true);
    }
  }

  async function start() {
    if (!active || current) return;
    awaitingClick = false;
    const s = { started: performance.now(), turns: [], pending: new Set(), abort: new AbortController(), agentSpeaking: false, userSpeaking: false, closing: false, finished: false };
    current = s;
    view.connect();
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (s.closing) { s.stream.getTracks().forEach(t => t.stop()); return; }
      s.track = s.stream.getAudioTracks()[0];
      updateMic(s);
      s.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await s.ctx.resume();
      if (s.closing) { s.ctx.close().catch(() => {}); return; }
      s.micAnalyser = s.ctx.createAnalyser(); s.micAnalyser.fftSize = 1024;
      s.micData = new Float32Array(s.micAnalyser.fftSize);
      s.ctx.createMediaStreamSource(s.stream).connect(s.micAnalyser);
      s.pc = new RTCPeerConnection();
      s.audio = new Audio(); s.audio.autoplay = true;
      s.pc.ontrack = e => {
        if (s.closing) return;
        s.audio.srcObject = e.streams[0];
        s.remoteAnalyser = s.ctx.createAnalyser(); s.remoteAnalyser.fftSize = 1024;
        s.remoteData = new Float32Array(s.remoteAnalyser.fftSize);
        s.ctx.createMediaStreamSource(e.streams[0]).connect(s.remoteAnalyser);
        s.audio.play().catch(() => { awaitingClick = true; close(s, true); });
      };
      s.pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(s.pc.connectionState) && !s.closing) close(s, true); };
      s.pc.addTrack(s.track, s.stream);
      s.channel = s.pc.createDataChannel('oai-events');
      s.channel.onmessage = e => { try { onEvent(s, JSON.parse(e.data)); } catch (_) { close(s, true); } };
      s.channel.onerror = () => close(s, true);
      s.channel.onclose = () => { if (!s.finished) { if (s.closing) finish(s); else close(s, false); } };
      const credential = await fetch('/api/realtime-session', { method: 'POST', signal: s.abort.signal });
      if (!credential.ok) throw new Error('Session unavailable');
      const { value } = await credential.json();
      const offer = await s.pc.createOffer();
      await s.pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/sdp' }, body: offer.sdp, signal: s.abort.signal });
      if (!answer.ok) throw new Error('Connection unavailable');
      await s.pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      if (!s.closing) levels(s);
    } catch (error) {
      if (!s.closing) { awaitingClick = error.name === 'NotAllowedError'; close(s, false); }
    }
  }

  document.addEventListener('deck:slidechange', e => {
    active = !!e.detail?.slide?.contains(view.root);
    clearTimeout(timer);
    if (active) startLater();
    else { awaitingClick = false; if (current) close(current, true); }
  });
  view.root.addEventListener('click', () => { if (active && awaitingClick && !current) start(); });
  document.addEventListener('keydown', e => {
    if (!active || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (e.key.toLowerCase() === 'm') {
      muted = !muted;
      if (current) updateMic(current);
      view.root.setAttribute('aria-label', muted ? 'Microphone muted. Press M to unmute.' : 'Microphone on. Press M to mute.');
    }
  });
  view.root.addEventListener('call:mute', e => { muted = !!e.detail.muted; if (current) updateMic(current); });
  view.root.addEventListener('call:end', () => { if (current) close(current, true); });
})();
