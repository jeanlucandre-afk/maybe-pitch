# Live-call slide: developer handoff

Slide 6 of the deck (full-page orb, bubbles and character, no title) is where the presenter talks live with **Mara**, a voice agent playing a Dr. Lipp retail buyer.

- **Design source:** the canvas board `Slide05b · Live call (voice agent)` on the Presentation page of the MAYBE Final canvas, copied to `src/Slide05b.dc.html`.
- **Runtime:** `assets/live-call.js`.
- **Build:** `node tools/build-deck.mjs`.

Until a real agent is connected, the slide plays a scripted demo (six turns) whenever it is on screen.

## What is on the slide

| Element | Selector | Behaviour |
|---|---|---|
| Voice orb (left) | `[data-orb]` | It's **biggest in silence and shrinks as sound gets louder** (`scale(1 - level × 0.26)`), with the liquid inside churning more. Class `orb--idle`, `orb--you` or `orb--agent` sets the motion style. In demo mode the presenter's **real microphone** drives it: the browser asks for mic permission on slide 6, and the mic is released when you leave the slide. |
| Conversation (right) | `[data-bubbles]` | Black bubbles for "You" (right-aligned), white bubbles for "Mara" (left-aligned). It keeps the last 4; older ones fade. |
| Character (bottom right) | `[data-avatar]` | Class `avatar--talking` makes her bob and shows violet sound arcs while the agent speaks. |
| Optional controls | `[data-call-status]`, `[data-call-timer]`, `[data-call-mute]`, `[data-call-end]` | Not on the current design, which is only the orb, bubbles and character. If they're added back, the runtime fills them, and mute/end fire `call:mute` / `call:end` on the slide root. |

## API: `window.MAYBE_CALL`

```js
MAYBE_CALL.connect();                  // stop the demo and the built-in mic meter; the slide now shows only what you send
MAYBE_CALL.useMic(false);              // optional: turn off the built-in mic meter in demo mode
MAYBE_CALL.setMode('you' | 'agent' | 'idle');
MAYBE_CALL.setLevel(0.0 - 1.0);        // send mic/agent volume as often as you like; the page eases it so the orb never jumps
MAYBE_CALL.addMessage('you' | 'agent', text, { replaceLast: true }); // replaceLast updates a streaming bubble
MAYBE_CALL.clear();
MAYBE_CALL.disconnect();               // back to the demo
```

## Wiring it to an ElevenLabs agent (suggested)

The deck's "Talk to MAYBE" button is a separate Q&A agent that controls the slides. Mara should be **her own agent**: a buyer persona with a first message, under 2 minutes, and no slide tools. Use the ElevenLabs JS client (`@elevenlabs/client`, pin the version you install):

```js
import { Conversation } from '@elevenlabs/client';

let conv;
document.addEventListener('deck:slidechange', async (e) => {
  const onCallSlide = e.detail.slide.contains(MAYBE_CALL.root);
  if (onCallSlide && !conv) {
    MAYBE_CALL.connect();
    conv = await Conversation.startSession({
      agentId: 'MARA_AGENT_ID',               // or a signed URL from your backend
      onMessage: ({ source, message }) => MAYBE_CALL.addMessage(source === 'user' ? 'you' : 'agent', message),
      onModeChange: ({ mode }) => MAYBE_CALL.setMode(mode === 'speaking' ? 'agent' : 'you'),
      onDisconnect: () => { MAYBE_CALL.setMode('idle'); conv = null; }
    });
    const loop = () => {
      if (!conv) return;
      const level = conv.getOutputVolume() > 0.02 ? conv.getOutputVolume() : conv.getInputVolume();
      MAYBE_CALL.setLevel(Math.min(1, level * 1.6));
      requestAnimationFrame(loop);
    };
    loop();
  }
  if (!onCallSlide && conv) { await conv.endSession(); conv = null; MAYBE_CALL.disconnect(); }
});

MAYBE_CALL.root.addEventListener('call:mute', (e) => conv && conv.setMicMuted && conv.setMicMuted(e.detail.muted));
MAYBE_CALL.root.addEventListener('call:end', async () => { if (conv) { await conv.endSession(); conv = null; } });
```

Notes:
- Check the event and method names against the client version you install. The page only needs the five `MAYBE_CALL` calls above, so another provider (for example OpenAI Realtime) works the same way.
- Microphone access needs HTTPS and a user gesture in some browsers. Start the session from a click if `startSession` is blocked, for example the presenter clicking the orb.
- Never put API keys in the page. Use a public agent with an allowed-domain list, or have your backend issue signed URLs.

## Mara's script (draft)

The persona is a retail buyer at a mid-sized drugstore chain. She is friendly, busy, and worried about shelf space near the till and about sell-through. She asks about the minimum order, accepts a 24-unit trial tray if the student handles her objections, and keeps answers to one or two sentences. She must say she is an AI if asked, and never claims to be a real Dr. Lipp customer.

## Smoothness (how the slide animates)

- One animation loop drives the orb while slide 6 is on screen. The level is eased: quick to shrink, slower to grow back.
- The waves and swirl move continuously and only speed up or slow down with the level, so they never restart or jump.
- Bubbles glide into place when a new one arrives or the last one grows, so you can stream transcripts with `{replaceLast: true}` freely.
- Demo mode: with a mic, your line appears only while you actually speak, and Mara's line types itself in while she "speaks".
