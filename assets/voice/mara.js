/* Live voice for the call slide: the presenter talks to Mara over OpenAI Realtime (WebRTC).
 * The look lives in live-call.js; this file drives it through window.MAYBE_CALL and also relies on its bubble markup (see LIVE-CALL.md).
 * On the slide: M mutes, hold T to talk (and leave voice detection off), Shift+T back to automatic, Enter retries.
 * For rehearsals, in the URL: ?ptt=1 ?vad=server ?noise=near|far|off ?voicedebug
 * Every call ends with one call:ended on document. See LIVE-CALL.md. */
(function () {
  'use strict';
  const view = window.MAYBE_CALL;
  if (!view) return;

  const WRAP_UP_MS = 150000, MAX_CALL_MS = 180000, MIN_AFTER_RETRY_MS = 60000;
  const REQUEST_MS = 10000, CONNECT_MS = 15000, LINK_GRACE_MS = 6000, RETRY_MS = 600;
  const REPLY_NUDGE_MS = 6000, REPLY_GIVE_UP_MS = 14000, LONG_SPEECH_MS = 20000;
  const SPEECH_WATCHDOG_MS = 25000, HANGUP_WATCHDOG_MS = 15000, HANGUP_TAIL_MS = 700, MIC_TAIL_MS = 350;
  const MIN_TALK_MS = 250, TALK_TAIL_MS = 200, DRAIN_MS = 3000, MIC_PROMPT_MS = 700;
  const MAX_TURNS = 200, MAX_TURN_LENGTH = 2000; // what /api/review-sales accepts

  const CLOSING_LINE = /\b(ok(?:ay)?,? i['’]?ll take the banana|no,? thanks,? i['’]?ll pass)\b/i;
  const GOODBYE = /\b(good ?bye|bye(?:-bye)?|take care)\b[.!]*\s*$/i;
  const NO_CREDITS = /insufficient_quota|credit_balance_exhausted|spend_limit_exceeded|usage_limit_exceeded/;
  const SESSION_OVER = /session_expired/;
  const WORDS = /[\p{L}\p{N}]/u;
  const FLUSH = 'flush'; // stands for an utterance being committed as the call ends

  const PROBLEM = {
    micDenied: 'Microphone blocked. Allow it in the address bar, then try again.',
    micMissing: 'No microphone found. Connect one, then try again.',
    micBusy: 'The microphone is in use by another app. Close it, then try again.',
    micLost: 'The microphone stopped working. Check it, then try again.',
    insecure: 'The microphone only works on HTTPS or localhost.',
    unsupported: 'This browser cannot make the call. Use Chrome.',
    network: 'Connection lost. Check the internet, then try again.',
    credits: 'The voice service is out of credits.',
    busy: 'Too many attempts. Wait a moment, then try again.',
    origin: 'This address is not allowed to start a call.',
    noAnswer: 'Mara is not answering. Try again.',
    server: 'Mara could not connect. Try again.',
  };

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('voicedebug');
  const VAD_SERVER = { type: 'server_vad', threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 800, create_response: true, interrupt_response: true };
  const VAD_OVERRIDE = params.get('vad') === 'server' ? VAD_SERVER : null;
  const NOISE = { near: { type: 'near_field' }, far: { type: 'far_field' }, off: null };
  const NOISE_OVERRIDE = NOISE[params.get('noise')];

  let active = false, call = null, owner = null;
  let muted = false, manual = params.get('ptt') === '1', talking = false;

  // The demo and its microphone meter stay off unless the server says there is no key.
  view.useMic(false);

  // Bubbles must overflow under the column's top fade. If they shrink to fit, they lose their last lines.
  const bubbleRule = document.createElement('style');
  bubbleRule.textContent = '.bubble-live { flex: none; }';
  view.root.appendChild(bubbleRule);

  // ---------- notice ----------
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.setAttribute('style', 'position: absolute; left: 200px; top: 900px; width: 660px; z-index: 5; display: none; justify-content: center; pointer-events: none;');
  const noticeBox = document.createElement('div');
  noticeBox.setAttribute('style', 'display: inline-flex; align-items: center; gap: 18px; padding: 14px 20px; border-radius: 14px; background: #FFFFFF; border: 1px solid #E4E4E7; box-shadow: 0 8px 22px -10px rgba(0,0,0,.25); color: #09090B; font-size: 22px; line-height: 1.3; pointer-events: auto;');
  const noticeText = document.createElement('span');
  const noticeButton = document.createElement('button');
  noticeButton.type = 'button';
  noticeButton.setAttribute('style', 'flex: none; padding: 10px 18px; border: 0; border-radius: 10px; background: #09090B; color: #FAFAFA; font: inherit; font-size: 20px; font-weight: 600; cursor: pointer;');
  noticeBox.append(noticeText, noticeButton);
  notice.appendChild(noticeBox);
  view.root.appendChild(notice);

  function noticeFor(c) {
    if (!c || c.phase === 'ending') return null;
    if (c.phase === 'failed') return { text: c.problem, action: 'Try again', onClick: () => retry(c) };
    if (c.phase === 'reconnecting') return { text: 'Connection lost. Reconnecting…' };
    if (c.phase === 'connecting') return { text: c.everLive ? 'Reconnecting…' : c.waitingForMic ? 'Allow the microphone to start the call.' : 'Connecting…' };
    if (c.audioBlocked) return { text: 'Mara cannot play sound yet.', action: 'Turn on sound', onClick: () => unlockAudio(c) };
    if (muted) return { text: 'Microphone muted. Press M to unmute.' };
    if (manual) return { text: talking ? 'Talking. Release T to send.' : 'Hold T to talk.' };
    if (c.longSpeech) return { text: 'Noisy room? Hold T to talk.' };
    return null;
  }

  let noticeAction = null;
  noticeButton.addEventListener('click', () => { noticeButton.blur(); if (noticeAction) noticeAction(); });

  function renderNotice() {
    const shown = noticeFor(call);
    notice.style.display = shown ? 'flex' : 'none';
    if (!shown) { noticeAction = null; return; }
    noticeText.textContent = shown.text;
    noticeButton.textContent = shown.action || '';
    noticeButton.style.display = shown.action ? 'block' : 'none';
    noticeAction = shown.onClick || null;
  }

  // ---------- turns and bubbles ----------
  const elapsed = c => Math.max(0, Math.round(performance.now() - c.startedAt));
  const role = t => (t.speaker === 'candidate' ? 'you' : 'agent');
  const bubblesEl = () => view.root.querySelector('[data-bubbles]');
  const standing = el => !!el && el.isConnected && !el.dataset.leaving;

  function turn(c, id, speaker) {
    let t = c.byId.get(id);
    if (!t) {
      const atMs = speaker === 'candidate' && c.talkStartedAt != null ? c.talkStartedAt : elapsed(c);
      t = { id, speaker, text: '', atMs, final: false, bubble: null, responseId: null };
      c.byId.set(id, t);
      c.turns.push(t);
    }
    return t;
  }

  function lastBubble() {
    const kids = Array.from(bubblesEl().children).filter(el => !el.dataset.leaving);
    return kids[kids.length - 1];
  }

  // A bubble that is no longer the last one: same markup as live-call.js builds, without the fade.
  function setBubbleText(el, text) {
    const holder = el.querySelector('[data-text]');
    const words = text.trim().split(/\s+/).filter(Boolean);
    const spans = words.map((word, i) => {
      const span = document.createElement('span');
      span.textContent = (i ? ' ' : '') + word;
      return span;
    });
    holder.replaceChildren(...spans);
    el._words = words;
  }

  // Mara's text can outrun her bubble opening: the height then eases to the full line, instead of jumping, as it finishes.
  function easeAfterGrow(el) {
    const grow = el.getAnimations && el.getAnimations()[0];
    if (!grow) return;
    const frames = grow.effect.getKeyframes();
    const from = parseFloat(frames[frames.length - 1].height);
    grow.addEventListener('finish', () => {
      const to = el.offsetHeight;
      if (Math.abs(to - from) >= 1) el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: 'cubic-bezier(.45,.05,.25,1)' });
    }, { once: true });
  }

  // Keeps the bubbles in conversation order even when the presenter's text arrives after Mara started.
  function render(c, t) {
    if (owner !== c || !WORDS.test(t.text)) return;
    if (t.bubble && !standing(t.bubble)) return;
    if (t.bubble) {
      if (t.bubble === lastBubble()) view.addMessage(role(t), t.text, { replaceLast: true });
      else setBubbleText(t.bubble, t.text);
      return;
    }
    const later = c.turns.slice(c.turns.indexOf(t) + 1).find(other => standing(other.bubble));
    if (!later) { t.bubble = view.addMessage(role(t), t.text); easeAfterGrow(t.bubble); return; }
    const previousLast = lastBubble();
    t.bubble = view.addMessage(role(t), t.text, { instant: true });
    const faded = previousLast.style.opacity;
    if (later.bubble.isConnected) {
      bubblesEl().insertBefore(t.bubble, later.bubble);
      t.bubble.style.opacity = faded;
      previousLast.style.opacity = '1';
    }
  }

  function dropTurn(c, t) {
    c.turns.splice(c.turns.indexOf(t), 1);
    c.byId.delete(t.id);
    if (t.bubble) {
      t.bubble.remove();
      const last = lastBubble();
      if (last) last.style.opacity = '1';
    }
  }

  function lastSaidIsHis(c) {
    const said = c.turns.filter(t => WORDS.test(t.text) || c.pending.has(t.id)); // a line whose transcript is on its way counts
    return said.length > 0 && said[said.length - 1].speaker === 'candidate';
  }

  function finalTurns(c) {
    let last = 0;
    return c.turns
      .filter(t => WORDS.test(t.text))
      .slice(-MAX_TURNS)
      .map(t => {
        last = Math.max(last, t.atMs);
        // Straight apostrophes: the review's rules look for "I'll".
        return { id: t.id, speaker: t.speaker, text: t.text.replace(/’/g, "'").trim().slice(0, MAX_TURN_LENGTH), atMs: last };
      });
  }

  // ---------- microphone, sound, orb ----------
  function updateMic(c) {
    const track = c.link && c.link.track;
    if (!track) return;
    const open = manual ? talking || !!c.talkTail : !c.agentSpeaking && !c.micHold;
    track.enabled = c.phase === 'live' && !c.hangingUp && !muted && open;
  }

  function refreshMode(c) {
    if (owner !== c) return;
    const mode = c.agentSpeaking ? 'agent' : c.userSpeaking || (talking && call === c) ? 'you' : 'idle';
    if (mode !== c.mode) { c.mode = mode; view.setMode(mode); }
  }

  function goQuiet(c) {
    c.agentSpeaking = c.userSpeaking = false;
    refreshMode(c);
    if (active && owner === c) view.setLevel(0);
  }

  function rms(analyser, data) {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    return Math.max(0, Math.min(1, (Math.sqrt(sum / data.length) - 0.012) * 7));
  }

  function levels(c, link) {
    if (link.closed || c.link !== link) return;
    view.setLevel(Math.max(rms(link.micAnalyser, link.micData), rms(link.remoteAnalyser, link.remoteData)));
    link.raf = requestAnimationFrame(() => levels(c, link));
  }

  function listen(link, stream) {
    if (!link.ctx) return {};
    try {
      const analyser = link.ctx.createAnalyser();
      analyser.fftSize = 1024;
      link.ctx.createMediaStreamSource(stream).connect(analyser);
      return { analyser, data: new Float32Array(analyser.fftSize) };
    } catch (error) { return {}; } // the orb is decoration: never lose a call over it
  }

  function unlockAudio(c) {
    const link = c && c.link;
    if (!link) return;
    if (link.ctx && link.ctx.state === 'suspended') link.ctx.resume().catch(() => {});
    if (link.audio && link.audio.srcObject && link.audio.paused) {
      link.audio.play().then(() => { c.audioBlocked = false; renderNotice(); }).catch(() => {});
    }
  }

  // ---------- sending to Realtime ----------
  function send(c, event) {
    const channel = c.link && c.link.channel;
    if (!channel || channel.readyState !== 'open') return false;
    try { channel.send(JSON.stringify(event)); return true; } catch (error) { return false; }
  }

  function sendSession(c, input) {
    send(c, { type: 'session.update', session: { type: 'realtime', audio: { input } } });
  }

  function sendStartupSettings(c) {
    const input = {};
    if (manual) input.turn_detection = null;
    else if (VAD_OVERRIDE) input.turn_detection = VAD_OVERRIDE;
    if (NOISE_OVERRIDE !== undefined) input.noise_reduction = NOISE_OVERRIDE;
    if (Object.keys(input).length) sendSession(c, input);
  }

  // After a reconnect the new session knows nothing, so it gets the call so far.
  function sendHistory(c) {
    const lines = finalTurns(c).map(t => `${t.speaker === 'candidate' ? 'Him' : 'You'}: ${t.text}`);
    if (!lines.length) return;
    send(c, { type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: `The connection dropped for a moment. Do not greet him again and do not mention it. The conversation so far:\n${lines.join('\n')}` }] } });
  }

  function askToWrapUp(c) {
    send(c, { type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'You have to get back to work now. In your next reply close the conversation: buy only if all six conditions have happened, otherwise say your no. Then call end_call.' }] } });
    if (!c.responseActive && !c.userSpeaking && !c.agentSpeaking && !talking) send(c, { type: 'response.create' });
  }

  // ---------- push to talk ----------
  function setManual(c, on) {
    if (manual === on) return;
    manual = on;
    if (!on) releaseTalk(c);
    if (c && c.phase === 'live') {
      sendSession(c, { turn_detection: on ? null : VAD_OVERRIDE || c.autoDetection || { type: 'semantic_vad' } });
      if (on) { c.userSpeaking = false; c.longSpeech = false; clearTimeout(c.longSpeechTimer); }
      updateMic(c);
      refreshMode(c);
    }
    renderNotice();
  }

  function pressTalk(c) {
    if (talking || muted || !c || c.phase !== 'live' || c.hangingUp) return;
    talking = true;
    if (c.talkTail) {
      clearTimeout(c.talkTail); // pressed again before the last press was sent: same utterance
      c.talkTail = null;
    } else {
      c.talkStartedAt = elapsed(c);
      send(c, { type: 'input_audio_buffer.clear' });
      send(c, { type: 'response.cancel' }); // always: one may be on its way, and the docs say this is safe with none
      if (c.agentSpeaking) send(c, { type: 'output_audio_buffer.clear' });
    }
    updateMic(c);
    refreshMode(c);
    renderNotice();
  }

  // A tap only arms the mode: if its cancel cost him a reply, ask again.
  function askAgainAfterTap(c) {
    if (manual && c.owesReply && !talking && !c.talkTail && lastSaidIsHis(c)) send(c, { type: 'response.create' });
  }

  function releaseTalk(c) {
    if (!talking) return;
    talking = false;
    if (c) {
      const tooShort = c.talkStartedAt == null || elapsed(c) - c.talkStartedAt < MIN_TALK_MS;
      c.talkTail = setTimeout(() => {
        c.talkTail = null;
        if (c.phase === 'live') {
          if (tooShort) { send(c, { type: 'input_audio_buffer.clear' }); c.talkStartedAt = null; askAgainAfterTap(c); }
          else { send(c, { type: 'input_audio_buffer.commit' }); send(c, { type: 'response.create' }); }
        }
        updateMic(c);
      }, tooShort ? 0 : TALK_TAIL_MS);
      refreshMode(c);
    }
    renderNotice();
  }

  // ---------- Mara speaking and hanging up ----------
  function speakingStarted(c, responseId) {
    c.agentSpeaking = true;
    if (responseId) c.spoken.add(responseId);
    clearTimeout(c.micTailTimer);
    c.micHold = false;
    clearTimeout(c.speechWatchdog);
    // If the stop event never comes the microphone would stay closed for good.
    c.speechWatchdog = setTimeout(() => { if (c.agentSpeaking) speakingStopped(c, true); }, SPEECH_WATCHDOG_MS);
    updateMic(c);
    refreshMode(c);
  }

  function speakingStopped(c, now) {
    if (!c.agentSpeaking) return;
    c.agentSpeaking = false;
    clearTimeout(c.speechWatchdog);
    refreshMode(c);
    if (c.hangingUp) { hangUpSoon(c, HANGUP_TAIL_MS); return; }
    // The server finished sending, not the speakers playing: hold the mic a moment so the room does not trigger it.
    c.micHold = !now;
    clearTimeout(c.micTailTimer);
    if (c.micHold) c.micTailTimer = setTimeout(() => { c.micHold = false; updateMic(c); }, MIC_TAIL_MS);
    updateMic(c);
  }

  function hangUpSoon(c, ms) {
    clearTimeout(c.hangUpTimer);
    c.hangUpTimer = setTimeout(() => endCall(c, true), ms);
  }

  function hangUpAfterSpeech(c, responseId, hasMessage) {
    c.hangingUp = true;
    updateMic(c);
    if (c.agentSpeaking || (hasMessage && !c.spoken.has(responseId))) hangUpSoon(c, HANGUP_WATCHDOG_MS);
    else hangUpSoon(c, hasMessage ? HANGUP_TAIL_MS : 0);
  }

  // ---------- a reply that does not come ----------
  function watchForReply(c) {
    clearTimeout(c.replyTimer);
    c.replyTimer = setTimeout(() => {
      if (c.phase !== 'live' || c.responseActive) return;
      send(c, { type: 'response.create' });
      c.replyTimer = setTimeout(() => {
        if (c.phase === 'live' && !c.responseActive) fail(c, 'noAnswer');
      }, REPLY_GIVE_UP_MS);
    }, REPLY_NUDGE_MS);
  }

  // Mara decided the last thing she heard was not for her: it should not read as something he said.
  function ignoreNoise(c) {
    const t = c.byId.get(c.lastCommitted);
    if (!t || t.speaker !== 'candidate' || c.turns[c.turns.length - 1] !== t) return;
    c.ignored.add(t.id);
    dropTurn(c, t);
  }

  function onResponseDone(c, response) {
    c.responseActive = false;
    const id = response.id, status = response.status, output = Array.isArray(response.output) ? response.output : [];
    const calls = output.filter(item => item.type === 'function_call');
    const hasMessage = output.some(item => item.type === 'message');
    calls.filter(item => item.name === 'wait_for_user' && item.call_id).forEach(item => {
      send(c, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: '{}' } });
    });
    if (status !== 'completed' && !c.spoken.has(id)) {
      c.closingResponse = null;
      c.turns.filter(t => t.responseId === id).forEach(t => dropTurn(c, t)); // she never said it out loud
    }
    if (status === 'failed') {
      const code = String((response.status_details && response.status_details.error && response.status_details.error.code) || '');
      console.warn('[mara] response failed', code);
      if (NO_CREDITS.test(code)) { fail(c, 'credits'); return; }
      if (++c.failedResponses >= 2) { fail(c, 'noAnswer'); return; }
      send(c, { type: 'response.create' });
    }
    if (status === 'completed') c.failedResponses = 0;
    // Room noise can cancel a reply before she speaks. If she then ignores the noise, his line still needs its answer.
    if (status === 'cancelled' && !c.spoken.has(id)) { c.owesReply = true; askAgainAfterTap(c); }
    else if (c.spoken.has(id)) c.owesReply = false;
    if (status === 'completed' && !hasMessage && calls.length && calls.every(item => item.name === 'wait_for_user')) {
      ignoreNoise(c);
      if (c.owesReply && !talking && !c.userSpeaking) {
        c.owesReply = false;
        if (lastSaidIsHis(c)) send(c, { type: 'response.create', response: { tool_choice: 'none' } });
      }
    }
    const closes = calls.some(item => item.name === 'end_call') || c.closingResponse === id;
    c.closingResponse = null;
    if (status === 'completed' && closes) hangUpAfterSpeech(c, id, hasMessage);
  }

  function onError(c, error) {
    const code = String((error && (error.code || error.type)) || '');
    console.warn('[mara]', code, error && error.message);
    if (NO_CREDITS.test(code)) fail(c, 'credits');
    else if (SESSION_OVER.test(code)) fail(c, 'network', true);
    // The docs: most errors are recoverable and the session stays open.
  }

  // ---------- Realtime events ----------
  function onEvent(c, event) {
    if (DEBUG) console.debug('[mara]', elapsed(c), event.type, event);
    const type = event.type;
    const isHisTranscript = /^conversation\.item\.input_audio_transcription\./.test(type);
    if (c.phase === 'ending' && type !== 'input_audio_buffer.committed' && !isHisTranscript) return; // only what completes his last words
    if (isHisTranscript && c.ignored.has(event.item_id)) {
      c.pending.delete(event.item_id);
      drained(c);
      return;
    }
    if (type === 'session.created') {
      const detection = event.session && event.session.audio && event.session.audio.input && event.session.audio.input.turn_detection;
      if (detection) c.autoDetection = detection;
    } else if (type === 'input_audio_buffer.speech_started') {
      if (manual) return; // sent before the server saw that detection is off: no stop event would ever follow
      c.userSpeaking = true;
      turn(c, event.item_id, 'candidate');
      clearTimeout(c.longSpeechTimer);
      c.longSpeechTimer = setTimeout(() => { c.longSpeech = true; renderNotice(); }, LONG_SPEECH_MS);
      refreshMode(c);
    } else if (type === 'input_audio_buffer.speech_stopped') {
      c.userSpeaking = false;
      c.longSpeech = false;
      clearTimeout(c.longSpeechTimer);
      refreshMode(c);
      renderNotice();
    } else if (type === 'input_audio_buffer.committed') {
      turn(c, event.item_id, 'candidate');
      c.lastCommitted = event.item_id;
      if (!talking) c.talkStartedAt = null; // T may be down again: this answers the press before it
      c.pending.delete(FLUSH);
      c.pending.add(event.item_id);
      if (c.phase === 'live') watchForReply(c);
    } else if (type === 'conversation.item.input_audio_transcription.delta') {
      const t = turn(c, event.item_id, 'candidate');
      if (t.final || !event.delta) return;
      t.text += event.delta;
      render(c, t);
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      const t = turn(c, event.item_id, 'candidate');
      if (event.transcript) t.text = event.transcript;
      t.final = true;
      c.pending.delete(event.item_id);
      render(c, t);
      drained(c);
    } else if (type === 'conversation.item.input_audio_transcription.failed') {
      console.warn('[mara] transcription failed', event.error && event.error.code);
      c.pending.delete(event.item_id);
      drained(c);
    } else if (type === 'response.created') {
      c.responseActive = true;
      clearTimeout(c.replyTimer);
    } else if (type === 'response.output_item.added') {
      if (event.item && event.item.type === 'message') turn(c, event.item.id, 'prospect').responseId = event.response_id;
    } else if (type === 'response.output_audio_transcript.delta') {
      const t = turn(c, event.item_id, 'prospect');
      if (event.response_id) t.responseId = event.response_id;
      if (t.final || !event.delta) return;
      t.text += event.delta;
      render(c, t);
    } else if (type === 'response.output_audio_transcript.done') {
      const t = turn(c, event.item_id, 'prospect');
      if (event.transcript) t.text = event.transcript;
      t.final = true;
      render(c, t);
      if (CLOSING_LINE.test(t.text) || GOODBYE.test(t.text)) c.closingResponse = event.response_id;
    } else if (type === 'output_audio_buffer.started') {
      speakingStarted(c, event.response_id);
    } else if (type === 'output_audio_buffer.stopped') {
      speakingStopped(c, false);
    } else if (type === 'output_audio_buffer.cleared') {
      speakingStopped(c, true);
    } else if (type === 'response.done') {
      if (event.response) onResponseDone(c, event.response);
    } else if (type === 'error') {
      onError(c, event.error);
    }
  }

  // ---------- connecting ----------
  function classify(error) {
    if (error && error.problem) return error.problem;
    const name = error && error.name;
    return name === 'AbortError' || name === 'TypeError' || name === 'TimeoutError' ? 'network' : 'server';
  }

  function micProblem(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'micDenied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'micMissing';
    if (name === 'NotReadableError') return 'micBusy';
    return 'micLost';
  }

  const problemError = problem => Object.assign(new Error(problem), { problem });

  async function request(link, url, options, read) {
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    const timer = setTimeout(abort, REQUEST_MS);
    link.abort.signal.addEventListener('abort', abort, { once: true });
    try {
      return await read(await fetch(url, { ...options, signal: timeout.signal }));
    } finally {
      clearTimeout(timer);
      link.abort.signal.removeEventListener('abort', abort);
    }
  }

  async function getToken(link) {
    return request(link, '/api/realtime-session', { method: 'POST' }, async response => {
      const body = await response.json().catch(() => ({}));
      if (response.status === 503 && body.code === 'not_configured') return null;
      if (response.ok && typeof body.value === 'string') return body.value;
      if (body.code === 'no_credits') throw problemError('credits');
      if (response.status === 429) throw problemError('busy');
      if (response.status === 403) throw problemError('origin');
      console.warn('[mara] session answered', response.status, body.code);
      throw problemError('server');
    });
  }

  function closeTransport(link) {
    clearTimeout(link.connectTimer);
    clearTimeout(link.graceTimer);
    if (link.channel) { link.channel.onopen = link.channel.onmessage = link.channel.onclose = link.channel.onerror = null; try { link.channel.close(); } catch (error) {} }
    if (link.pc) { link.pc.ontrack = link.pc.onconnectionstatechange = null; try { link.pc.close(); } catch (error) {} }
  }

  function releaseMedia(link) {
    link.closed = true;
    link.abort.abort();
    cancelAnimationFrame(link.raf);
    if (link.track) link.track.onended = null;
    if (link.stream) link.stream.getTracks().forEach(track => track.stop());
    if (link.audio) { link.audio.pause(); link.audio.srcObject = null; }
    if (link.ctx) link.ctx.close().catch(() => {});
  }

  function clearCallTimers(c) {
    [c.replyTimer, c.micTailTimer, c.speechWatchdog, c.longSpeechTimer, c.wrapTimer, c.endTimer, c.retryTimer, c.hangUpTimer, c.talkTail].forEach(clearTimeout);
    c.talkTail = null;
  }

  function linkLost(c, link) {
    if (c.link !== link || link.closed) return;
    fail(c, 'network', c.phase === 'live');
  }

  async function openLink(c) {
    const link = { abort: new AbortController(), closed: false };
    c.link = link;
    const alive = () => call === c && c.link === link && !link.closed;
    renderNotice();
    try {
      if (!window.RTCPeerConnection) throw problemError('unsupported');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw problemError('insecure');
      const token = await getToken(link);
      if (!alive()) return;
      if (token === null) {
        if (c.everLive) throw problemError('server'); // the key vanished mid-call: this call stays real
        useDemo(c);
        return;
      }

      // Only a real prompt takes this long; an allowed microphone opens before the message would show.
      const promptTimer = setTimeout(() => { if (alive()) { c.waitingForMic = true; renderNotice(); } }, MIC_PROMPT_MS);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .catch(error => { throw problemError(micProblem(error)); })
        .finally(() => clearTimeout(promptTimer));
      c.waitingForMic = false;
      if (!alive()) { stream.getTracks().forEach(track => track.stop()); return; }
      renderNotice();
      link.stream = stream;
      link.track = stream.getAudioTracks()[0];
      link.track.enabled = false;
      link.track.onended = () => { if (alive() && c.phase !== 'ending') fail(c, 'micLost'); };

      try {
        link.ctx = new (window.AudioContext || window.webkitAudioContext)();
        link.ctx.resume().catch(() => {}); // without a gesture this stays pending: do not wait for it
      } catch (error) { link.ctx = null; }
      const mic = listen(link, stream);
      link.micAnalyser = mic.analyser;
      link.micData = mic.data;

      const pc = link.pc = new RTCPeerConnection();
      link.audio = new Audio();
      link.audio.autoplay = true;
      pc.ontrack = event => {
        if (!alive() || link.audio.srcObject) return;
        link.audio.srcObject = event.streams[0];
        const remote = listen(link, event.streams[0]);
        link.remoteAnalyser = remote.analyser;
        link.remoteData = remote.data;
        link.audio.play().catch(error => {
          if (error.name !== 'NotAllowedError' || !alive()) return;
          c.audioBlocked = true;
          renderNotice();
        });
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') { clearTimeout(link.graceTimer); link.graceTimer = null; }
        else if (state === 'failed') linkLost(c, link);
        else if (state === 'disconnected' && !link.graceTimer) {
          // Often recovers on its own; do not throw the call away yet.
          link.graceTimer = setTimeout(() => linkLost(c, link), LINK_GRACE_MS);
        }
      };
      pc.addTrack(link.track, stream);

      const channel = link.channel = pc.createDataChannel('oai-events');
      channel.onopen = () => {
        if (!alive()) return;
        clearTimeout(link.connectTimer);
        goLive(c, link);
      };
      channel.onmessage = event => {
        if (!alive() && !c.draining) return;
        let parsed;
        try { parsed = JSON.parse(event.data); } catch (error) { return; }
        try { onEvent(c, parsed); } catch (error) { console.warn('[mara] event not handled', parsed.type, error); }
      };
      channel.onclose = () => {
        if (c.draining) finish(c);
        else linkLost(c, link);
      };
      channel.onerror = event => console.warn('[mara] data channel error', event && event.error);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!alive()) return;
      const sdp = await request(link, 'https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      }, async response => {
        if (response.ok) return response.text();
        console.warn('[mara] calls answered', response.status);
        throw problemError(response.status === 429 ? 'busy' : 'server');
      });
      if (!alive()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp });
      if (!alive()) return;
      link.connectTimer = setTimeout(() => { if (alive() && c.phase !== 'live') fail(c, 'network'); }, CONNECT_MS);
    } catch (error) {
      c.waitingForMic = false;
      if (!alive()) return;
      console.warn('[mara] could not connect', error);
      fail(c, classify(error));
    }
  }

  function goLive(c, link) {
    c.phase = 'live';
    c.everLive = true;
    sendStartupSettings(c);
    sendHistory(c);
    if (lastSaidIsHis(c)) { send(c, { type: 'response.create' }); watchForReply(c); } // the drop left his last line unanswered
    updateMic(c);
    if (link.ctx && link.ctx.state === 'suspended') link.ctx.resume().catch(() => {});
    levels(c, link);
    renderNotice();
    // Armed on every connection, so a late retry still gets some time.
    const left = Math.max(MIN_AFTER_RETRY_MS, MAX_CALL_MS - elapsed(c));
    clearTimeout(c.wrapTimer);
    clearTimeout(c.endTimer);
    c.wrapTimer = setTimeout(() => { if (c.phase === 'live') askToWrapUp(c); }, left - (MAX_CALL_MS - WRAP_UP_MS));
    c.endTimer = setTimeout(() => {
      if (c.phase !== 'live') return;
      if (c.agentSpeaking) hangUpAfterSpeech(c, null, true);
      else endCall(c, true);
    }, left);
  }

  // The call stays open, with what has been said, until the presenter retries or leaves the slide.
  function fail(c, problem, canAutoRetry) {
    if (call !== c || c.phase === 'ending' || c.phase === 'failed') return;
    if (c.hangingUp || c.closingResponse) { endCall(c, true); return; } // she already closed: nothing left to reconnect for
    if (talking) { talking = false; clearTimeout(c.talkTail); c.talkTail = null; }
    const link = c.link;
    if (link) { releaseMedia(link); closeTransport(link); c.link = null; }
    [c.replyTimer, c.micTailTimer, c.speechWatchdog, c.longSpeechTimer, c.hangUpTimer].forEach(clearTimeout);
    c.responseActive = c.hangingUp = c.micHold = c.longSpeech = c.audioBlocked = c.owesReply = false;
    c.failedResponses = 0;
    c.talkStartedAt = null;
    c.pending.clear();
    goQuiet(c);
    if (canAutoRetry && !c.autoRetried) {
      c.autoRetried = true;
      c.phase = 'reconnecting';
      renderNotice();
      c.retryTimer = setTimeout(() => { if (call === c && c.phase === 'reconnecting') { c.phase = 'connecting'; openLink(c); } }, RETRY_MS);
      return;
    }
    c.phase = 'failed';
    c.problem = PROBLEM[problem] || PROBLEM.server;
    c.problemKind = problem;
    renderNotice();
  }

  function retry(c) {
    if (call !== c || c.phase !== 'failed') return;
    c.phase = 'connecting';
    openLink(c);
  }

  function useDemo(c) {
    releaseMedia(c.link);
    closeTransport(c.link);
    c.link = null;
    clearCallTimers(c);
    c.phase = 'ending';
    c.ended = true; // no call happened, so there is no call:ended
    call = null;
    owner = null;
    renderNotice();
    view.useMic(true);
    view.disconnect();
  }

  // ---------- ending ----------
  function beginCall() {
    if (window.MAYBE_REVIEW) window.MAYBE_REVIEW.close(); // the last call's review must not open over this one
    muted = false;
    talking = false;
    const c = {
      startedAt: performance.now(), turns: [], byId: new Map(), pending: new Set(), spoken: new Set(), ignored: new Set(),
      phase: 'connecting', mode: 'idle', link: null, everLive: false, autoRetried: false, failedResponses: 0,
      agentSpeaking: false, userSpeaking: false, responseActive: false, micHold: false, hangingUp: false,
      longSpeech: false, audioBlocked: false, waitingForMic: false, talkStartedAt: null, closingResponse: null,
      lastCommitted: null, owesReply: false, draining: false, ended: false,
    };
    call = c;
    owner = c;
    view.connect();
    openLink(c);
  }

  function endCall(c, drain) {
    if (c.ended || c.phase === 'ending') return;
    const link = c.link;
    const channelOpen = !!(link && link.channel && link.channel.readyState === 'open');
    // An utterance still in progress gets transcribed before the call is reported.
    if (drain && channelOpen && (c.userSpeaking || talking || c.talkTail)) {
      c.pending.add(FLUSH);
      send(c, { type: 'input_audio_buffer.commit' });
    }
    if (c.responseActive && !c.hangingUp) {
      if (channelOpen) send(c, { type: 'response.cancel' });
      c.turns.filter(t => t.responseId && !c.spoken.has(t.responseId)).forEach(t => dropTurn(c, t)); // a line nobody heard is not part of the call
    }
    c.phase = 'ending';
    talking = false;
    clearCallTimers(c);
    if (call === c) call = null;
    if (link) { releaseMedia(link); link.closed = true; }
    goQuiet(c);
    renderNotice();
    if (drain && channelOpen && c.pending.size) {
      c.draining = true;
      c.drainTimer = setTimeout(() => finish(c), DRAIN_MS);
    } else finish(c);
  }

  function drained(c) {
    if (c.draining && !c.pending.size) finish(c);
  }

  function finish(c) {
    if (c.ended) return;
    c.ended = true;
    c.draining = false;
    clearTimeout(c.drainTimer);
    if (c.link) { closeTransport(c.link); c.link = null; }
    document.dispatchEvent(new CustomEvent('call:ended', { detail: { turns: finalTurns(c) } }));
    if (owner !== c && call && window.MAYBE_REVIEW) window.MAYBE_REVIEW.close(); // a new call is already on the slide
  }

  // ---------- the deck ----------
  document.addEventListener('deck:slidechange', e => {
    const now = !!(e.detail && e.detail.slide && e.detail.slide.contains(view.root));
    if (now === active) return;
    active = now;
    if (active) {
      // A click in a live screen on the next slide leaves focus in its hidden iframe, where keys never reach this page.
      const focused = document.activeElement;
      if (focused && focused.tagName === 'IFRAME') { focused.blur(); window.focus(); }
      beginCall();
    } else {
      view.useMic(false);
      if (call) endCall(call, true);
    }
  });

  const isTyping = target => !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''));

  document.addEventListener('keydown', e => {
    if (!active || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
    unlockAudio(call);
    const key = (e.key || '').toLowerCase();
    if (key === 'm' && !e.repeat) {
      muted = !muted;
      if (call) updateMic(call);
      view.root.setAttribute('aria-label', muted ? 'Microphone muted. Press M to unmute.' : 'Microphone on. Press M to mute.');
      renderNotice();
    } else if (key === 't' && call) {
      e.preventDefault();
      if (e.repeat && (talking || !manual)) return; // a repeat can start the press if T went down before the call was live
      if (e.shiftKey) { setManual(call, false); return; }
      setManual(call, true);
      pressTalk(call);
    } else if (key === 'enter' && call && call.phase === 'failed') {
      e.preventDefault();
      if (!e.repeat) retry(call);
    }
  });
  // A is the backup when the live voice fails. The review takes the screen and every key, so no call stays open behind it.
  // This file loads before review.js, so this runs first and the review A opens replaces the one call:ended would open.
  document.addEventListener('keydown', e => {
    if (!call || e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.key || '').toLowerCase() !== 'a' || isTyping(e.target)) return;
    endCall(call, false);
  }, true);
  document.addEventListener('keyup', e => { if ((e.key || '').toLowerCase() === 't') releaseTalk(call); });
  window.addEventListener('blur', () => releaseTalk(call));
  document.addEventListener('pointerdown', () => { if (active) unlockAudio(call); });

  window.addEventListener('offline', () => {
    const c = call, link = c && c.link;
    if (c && c.phase === 'live' && link && !link.graceTimer) link.graceTimer = setTimeout(() => linkLost(c, link), LINK_GRACE_MS);
  });
  window.addEventListener('online', () => {
    if (!call) return;
    if (call.phase === 'failed' && call.problemKind === 'network') retry(call);
    const link = call.link;
    if (link && link.graceTimer && link.pc && link.pc.connectionState === 'connected') { clearTimeout(link.graceTimer); link.graceTimer = null; }
  });
  window.addEventListener('pagehide', () => { if (call) endCall(call, false); });

  view.root.addEventListener('call:mute', e => {
    muted = !!(e.detail && e.detail.muted);
    if (call) updateMic(call);
    renderNotice();
  });
  view.root.addEventListener('call:end', () => { if (call) endCall(call, true); });
})();
