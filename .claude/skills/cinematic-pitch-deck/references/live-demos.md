# Live demos inside the slides

Four ready demos ship in the template. Each one works in three states and says which one it is on screen with a
status pill: **Live** (real AI or real votes), **Connecting…**, **Demo** (scripted fallback, labelled). A live
slide must never look broken: no key, no network, a blocked mic or venue wifi that blocks WebRTC all fall back
to the demo within seconds.

| Demo | Slide | Browser code | Server | Config to write per deck |
|---|---|---|---|---|
| Clickable prototype | `09-live-demo` | `deck.js` mounts `[data-live]` iframes | none | `app/*.html` (your product screens) |
| Voice call with an AI character | `15-voice-call` | `assets/live/voice-call.js` | `api/realtime-session.js` | `api/_persona.js` (who, voice, win/lose sentences), `data-call-script` (offline demo), `media/caller.webp` |
| Simulated people react | `16-agents` | `assets/live/agents.js` | `api/agents-review.js` | `api/_agents.js` (the panel), `data-demo` (offline review) |
| Audience vote by QR | `17-audience` | `assets/live/audience.js` + `vote.html` | `api/poll.js` | `polls.json` (question, options, id) |

All are loaded through `deck.json` → `scripts` and `css` (already set in the template). Delete a demo by removing
its slide and its script entry.

## Run them locally
```bash
node tools/serve.mjs            # deck + api on http://localhost:8000, reads .env
```
No key → the voice and agent slides run their demos, the poll counts in memory. Phones on the same wifi can vote
at `http://<laptop-ip>:8000/vote` (the QR shows `localhost` locally: use the deployed URL for real tests).

## Voice call (the MAYBE "Mara" pattern)
- Flow: slide opens → `POST /api/realtime-session` mints a short-lived key with the persona's instructions →
  microphone → WebRTC to OpenAI Realtime (`/v1/realtime/calls?model=…`) → transcripts stream into bubbles; the
  orb follows mic and voice levels; the character bobs while it speaks. Leaving the slide hangs up. 3-minute cap.
- Writing the persona (`api/_persona.js`): a person with a reason to say no; replies of one or two sentences; one
  objection, once; an exact sentence for yes and one for no, each followed by `end_call`; says it's an AI if asked.
  Rehearse it 5 times out loud and tighten until a good pitch wins in about a minute.
- The presenter speaks first; say the setup on the slide before, since the mic is live as soon as this slide opens.
- `call:ended` fires on document with `{ turns }`; the agent slide reads the transcript from there.
- Models: `OPENAI_REALTIME_MODEL` (default `gpt-realtime-2.1`), `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe`).
- The MAYBE repo's `assets/voice/mara.js` is the production-hardened version (reconnects, mic tail, wrap-up nudges);
  port pieces from it if a demo has to survive a long or noisy call.

## Simulated people (the MAYBE "agent world" pattern)
- `api/_agents.js`: 5-8 people with different stakes (buyer, user, rival, coach, skeptic…), and the task.
- The model returns, per person, one spoken line, one private thought and a verdict (yes/maybe/no), plus pros,
  cons and a one-line summary, as strict JSON. The slide plays them one by one, 1.5s apart, then the tally.
- Honesty: the slide always shows "Synthetic estimate · simulated people, not real opinions". Never present it as
  market research. Keep it separate from any real outcome.
- Model: `OPENAI_AGENTS_MODEL` (default `gpt-5.4-mini`, ~3s).

## Audience vote
- `polls.json`: `id`, `question`, `options`. Change `id` to reset for a new session.
- One vote per phone (id in localStorage); voting again moves the vote.
- Production needs Upstash Redis (Vercel Marketplace, free tier) or votes split across function instances; the
  status pill says "test store" until it's connected.
- QR at 420px is readable from about 10 rows back; for a big hall make it 600px and put the short URL under it.

## Ideas for other live moments (build on the same three states)
Live coding result in an iframe, a camera demo (ask permission on the slide before), a live chart fed by
`/api/*`, a "type a question" wall (poll.js pattern with text answers, moderated before showing).
