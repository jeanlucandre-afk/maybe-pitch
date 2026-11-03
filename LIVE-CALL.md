# Live-call slide: developer handoff

On the live-call slide (`#slide-11` when this was written; the number moves with the deck) the presenter talks live with **Mara**, an AI customer, over the OpenAI Realtime API. He approaches her cold at a hackathon and tries to sell her a banana.

- **Design source:** the canvas board `Slide05b · Live call (voice agent)`, copied to `src/Slide05b.dc.html`. Build with `node tools/build-deck.mjs`.
- **The look:** `assets/live-call.js`. It knows nothing about the voice.
- **The voice:** `assets/voice/mara.js`, which drives the look through `window.MAYBE_CALL`.
- **The short-lived key and Mara's instructions:** `api/realtime-session.js`.
- **Tests:** `node --test api/_voice/mara.test.js`. A simulated call with fake Realtime events, RTCPeerConnection and microphone. It spends no credits and cannot reach the network.

## How a call goes

1. Entering the slide takes it over at once (`MAYBE_CALL.connect()`), so no demo bubble ever appears.
2. The page asks `POST /api/realtime-session` for a short-lived key, then opens the microphone.
3. It opens a WebRTC connection with a data channel called `oai-events`, and posts the offer to `https://api.openai.com/v1/realtime/calls`.
4. The presenter speaks first. Mara hears the audio directly. Their words reach the bubbles through Realtime events.
5. The call ends when Mara closes it, when the presenter leaves the slide, or at the 3 minute limit. `call:ended` fires, and the bubbles stay until the slide is entered again. That clears them and starts a new call with the microphone live.

**Say the intro on the title slide, just before it.** The microphone is live as soon as the live-call slide is open, and the first words on it must be the approach to Mara.

## The `call:ended` event

Other code depends on this. It fires on `document`, exactly once per call:

```js
document.addEventListener('call:ended', (event) => {
  event.detail.turns; // in conversation order
  // [{ id: 'item_abc', speaker: 'candidate', text: 'Hi, sorry to interrupt.', atMs: 1200 },
  //  { id: 'item_def', speaker: 'prospect', text: 'Oh, hi. Do I know you?', atMs: 3400 }]
});
```

- `speaker` is `"candidate"` (the presenter) or `"prospect"` (Mara). Each turn has exactly these four fields.
- `atMs` is the time since the call started. It never goes down from one turn to the next.
- Turns with no words are left out, and so are lines Mara never said out loud and noise she decided to ignore.
- `turns` can be empty, for example when the presenter passes through the slide or the microphone was denied.
- A dropped call that reconnects is still the same call, so it fires once, at the real end.
- It does **not** fire when the demo plays, because no call happened.
- It fires up to 3 seconds after the end, while the last sentence is being transcribed.

## When the demo appears

Only when `/api/realtime-session` answers **503 with `code: "not_configured"`**: the server has no key. Nothing else brings it back: not an error, not the end of a call, not a 503 from anywhere else. `MAYBE_CALL.disconnect()` is what restores the demo, so it must not be called when a call ends or fails.

A plain static server such as `npx serve .` has no `api/`, so the slide shows "Mara could not connect." and no demo. To see the demo locally, run `vercel dev` with no key set. With `OPENAI_API_KEY` in `.env`, the same command makes real calls and spends credits.

## On the slide

| Element | Selector | Behaviour |
|---|---|---|
| Voice orb (left) | `[data-orb]` | Biggest in silence, shrinks as sound gets louder. Class `orb--idle`, `orb--you` or `orb--agent` sets the motion style. |
| Conversation (right) | `[data-bubbles]` | Black bubbles for "You", white bubbles for "Mara". The last 4 stay. |
| Character (bottom right) | `[data-avatar]` | Class `avatar--talking` while the agent speaks. |
| Notice (under the orb) | created by `mara.js` | One short status or problem at a time, with a button when there is something to do. Hidden in a normal call once it is connected. |
| Optional controls | `[data-call-status]`, `[data-call-timer]`, `[data-call-mute]`, `[data-call-end]` | Not on the current design. If added back, mute and end fire `call:mute` and `call:end` on the slide root, and `mara.js` obeys them. |

### Keys on the slide

| Key | What it does |
|---|---|
| **Hold T** | Push to talk, the backup for a noisy room. The first press turns voice detection off. Hold to talk, release to send. Pressing while Mara talks cuts her off. |
| **Shift+T** | Back to automatic voice detection. Push to talk otherwise carries over to reconnects and to the next call, until the page reloads. |
| **M** | Mute or unmute. A notice shows while muted. The next call starts unmuted. |
| **Enter** | Same as the Try again button. |
| **A** (from `agent-world-live.js`) | The backup if the voice fails on stage: opens the agent-world slide with the labelled sample call. It needs the network, because it calls `/api/review-sales`. If the venue connection is dead, switch to a phone hotspot first. |

Space, the arrows, Home, End, PageUp, PageDown, the numbers, F, P and R belong to the deck and the review. While the review is open it takes every key but F.

### When something fails

| What happens | What the page does |
|---|---|
| A Realtime `error` event | Logs it and carries on. The docs say most errors leave the session open. Only out-of-credits codes stop the call. |
| The connection is `disconnected` | Waits 6 seconds, because it often recovers by itself. |
| The connection is lost for good | Reconnects once by itself, in the same call. The new session gets the conversation so far, and Mara answers his last line if it had no reply. The bubbles stay. |
| It still cannot connect | Notice with **Try again**. The call stays open with what was said, until he retries or leaves the slide. When the browser comes back online it retries by itself. |
| Microphone denied, missing, busy or unplugged | Notice saying which, with **Try again**. |
| The browser blocks sound | Notice with **Turn on sound**. Any key or click also fixes it. |
| No reply after his turn | Asks for one after 6 seconds, then shows a notice after 14 more. |
| A reply fails | Asks again once, then shows a notice. |
| Mara's stop event never arrives | The microphone reopens after 25 seconds. A hang-up goes ahead after 15. |
| The call goes on too long | At 2:30 Mara is told to close. At 3:00 the call ends, after her current sentence. A late retry gets at least one more minute. |
| The presenter talks for 20 seconds without a break | Probably noise: a notice suggests holding T. |
| His words never show, on any turn | Transcription is failing. Mara still answers, because she hears the audio directly. No notice shows, and the console logs `[mara] transcription failed` only if OpenAI reports it. With under 3 words from him no review opens. In rehearsal, set `OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe`. |

When a call ends with 3 or more words from him, `review.js` starts the analysis with nothing on screen. The presenter goes on through the careers slide and the design editor, and the agent-world slide shows the result on arrival (`assets/voice/agent-world-live.js`). With no call, or if the analysis fails twice, that slide stays on its labelled demo.

## Why each setting

Checked against the official OpenAI docs on 2026-11-02. **None of these has been tried against the real API yet**, so the first real test is what confirms them.

| Setting | Value | Why |
|---|---|---|
| Model | `gpt-realtime-2.1` | Valid and current. The docs say it improves silence, noise and interruption handling over `gpt-realtime-2`. For new apps the docs now point to GPT-Live, but that is a different API, not a swap. |
| Transcription | `gpt-live-transcribe` with `languages: ['en']`, plus a prompt and keywords | The code used `gpt-transcribe`, which the docs describe as a WebSocket workflow, and this page uses WebRTC. It also takes `languages`, not `language`. `gpt-live-transcribe` streams as he speaks. OpenAI's cookbook names it for WebRTC, and the Agents JS guide shows it with `gpt-realtime-2.1` on default turn detection. Its limit against voice detection is worded for transcription sessions, but no page names it with `semantic_vad` outright. So on any 400 from OpenAI the server falls back to `gpt-4o-transcribe`, which shuts down on Feb 26, 2027, and logs the code and field. Note that transcription is a separate process: **the bubble can differ from what Mara heard**. |
| Voice detection | `semantic_vad`, `eagerness: 'medium'` | It judges from his words whether he finished, so a pause mid-sentence should not cut him off. The wait is at most 4 seconds. There is no threshold to set. To compare, use `?vad=server`. |
| `interrupt_response` | `true` | With `false` the docs warn a new turn "may fail to create a response" if she is already responding, which leaves him unanswered. With `true`, if he keeps talking before her audio starts, her reply is cancelled and she waits. |
| Microphone while she speaks | Closed, and for 350 ms after | So room speakers cannot trigger her on stage. The cost: he cannot interrupt her by voice, only with T. Her replies are short. |
| Noise reduction | `far_field` | For laptop and room microphones. Off by default. It filters audio before voice detection and before the model, so it also helps what she hears. With a headset or a handheld microphone, try `?noise=near`. |
| Reasoning | `low` | The docs suggest starting here, and disagree about the default, so it is set explicitly. |
| `max_output_tokens` | 1024 | A backstop against a long monologue. The prompt is what keeps her to two sentences. |
| `wait_for_user` tool | No-op | From the docs: voice agents tend to answer noise. This lets her stay quiet through laughter or applause. |
| `end_call` tool | Acted on only at `response.done` with status `completed` | The docs say the function event also fires for cancelled replies. In case the tool is not called, the page also hangs up when her line contains one of the two closing sentences, or ends in goodbye, bye or take care. |

The docs do not list which error codes are fatal, and they do not document how a session ending is signalled. So the page watches the data channel and the connection state itself. Exact sentences are likely, not guaranteed: the docs say instructions guide the model and are not guaranteed to be followed.

### Rehearsal switches

Add these to the URL, for example `http://localhost:3010/?vad=server#slide-11`:

| Switch | What it does |
|---|---|
| `?ptt=1` | Start in push to talk. |
| `?vad=server` | Volume-based detection instead: threshold 0.6, 800 ms of silence. |
| `?noise=near`, `far`, `off` | Change the noise reduction. |
| `?voicedebug` | Log every Realtime event with its time in the browser console. Turn on the Verbose level to see them. |

Environment variables, by name: `OPENAI_API_KEY` (required), `OPENAI_REALTIME_MODEL` and `OPENAI_TRANSCRIBE_MODEL` (optional overrides).

## Mara's scene

The full text is in `api/realtime-session.js`.

- He speaks first. She replies in one or two natural sentences.
- She is hungry and has not eaten, but says so only if asked about it.
- She is busy, and objects once: she could just get pizza.
- She says exactly **"Okay, I'll take the banana."** only if he was polite, found out she is hungry, explained why a banana suits her, answered the objection, stated the price and asked for the sale.
- A bad sale ends in exactly **"No thanks, I'll pass."**
- If he asks, she says she is an AI.

A good sale should fit in about a minute. If he goes quiet after a failed pitch, nothing moves until the 2:30 wrap-up or until he presses →.

## API: `window.MAYBE_CALL`

```js
MAYBE_CALL.connect();                  // stop the demo and its mic meter; the slide now shows only what you send
MAYBE_CALL.useMic(false);              // turn the demo's mic meter off or on
MAYBE_CALL.setMode('you' | 'agent' | 'idle');
MAYBE_CALL.setLevel(0.0 - 1.0);        // send it as often as you like; the page eases it
MAYBE_CALL.addMessage('you' | 'agent', text, { replaceLast: true }); // replaceLast updates the last bubble if it has the same role
MAYBE_CALL.clear();
MAYBE_CALL.disconnect();               // back to the demo; only for when there is no key
```

`mara.js` also relies on these from `live-call.js`: `addMessage` returning the bubble, its `instant` option, `MAYBE_CALL.root`, and the bubble details `.bubble-live`, `[data-text]`, `_words` and `data-leaving`. Change them together with `mara.js`, then run the tests.

## Smoothness

- One animation loop drives the orb while the slide is on screen. The level is eased: quick to shrink, slower to grow back.
- The waves and swirl move continuously and only change speed, so they never restart or jump.
- Bubbles grow open, and only the current one is updated as words stream in. If his text arrives after Mara started, his bubble slides in above hers, so the order holds.
- `mara.js` adds one rule so bubbles do not shrink to fit the column and lose their last lines: `.bubble-live { flex: none; }`.
