# Live demos inside the slides

**Default: the product, live in a browser on the slide** (template slide 09). A browser window (frame + address
bar) holds a real, clickable page: the prototype in `app/` or any https site that allows being framed (many big
sites send `X-Frame-Options` and show blank: then use the prototype or the walkthrough video). The address bar
shows `data-url` and follows clicks; ← → keep working after clicking inside; `data-width` sets the page's design
width (default 1440). Always follow it with the recorded walkthrough slide as the fallback.

**Optional extras, only when the person asks for them** (they are not in the default `deck.json`; to add one, copy
its slide, css and scripts from `deck.json` → `optional`):

Four ready demos ship in the template, designed like the original deck (compare with `look/11-live-call.jpg` and
`look/13-agent-world.jpg`). Each works live or falls back to a scripted demo within seconds (no key, no network, a
blocked mic, venue wifi that blocks WebRTC) and says so quietly: the voice slide shows the original notice card
under the orb only when something needs the presenter; the agent panel's mode tag reads "Demo simulation" /
"Live agents" / "Review of the demo call"; the poll has one short line under the results. Never a status badge,
never developer text on stage (setup hints go to the browser console).

| Demo | Slide | Browser code | Server | Config to write per deck |
|---|---|---|---|---|
| Clickable prototype | `09-live-demo` | `deck.js` mounts `[data-live]` iframes | none | `app/*.html` (your product screens) |
| Voice call with an AI character | `15-voice-call` | `assets/live/voice-call.js` | `api/realtime-session.js` | `api/_persona.js` (who, voice, win/lose sentences), `data-call-script` (offline demo), `media/caller.webp` |
| Simulated people react (the original agent world) | `16-agents` | `assets/live/agent-world.js` (+ `.css`) draws it, `assets/live/agents.js` feeds it | `api/agents-review.js` | `api/_agents.js` (panel, faces, labels), `data-demo` (offline story), `media/peeps/` (faces) |
| Audience vote by QR | `17-audience` | `assets/live/audience.js` + `vote.html` | `api/poll.js` | `polls.json` (question, options, id) |

All are loaded through `deck.json` → `scripts` and `css` (already set in the template). Delete a demo by removing
its slide and its script entry.

**Template content is blocked until replaced.** Slides 15-17 carry `data-template` on their root, and
`api/_persona.js`, `api/_agents.js`, `polls.json` carry `template: true`. `tools/check.mjs` fails while they are
still there: write each one for this deck, then delete the marker.

**The voice and agent slides are a pair.** The agent slide reviews the call that just happened (from
`LIVE_CALL.getTranscript()`). Keep them adjacent and keep the two offline stories consistent: the call slide's
`data-call-script` and the agent slide's `data-demo` must describe the same call, and the people in `data-demo`
must match `api/_agents.js` (ids and names). A review of the scripted demo call is labelled "Review of the demo
call", never "Live review".

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
- Renaming the character: change `api/_persona.js` AND, on slide 15, `data-agent-name`, the callout name, the
  image alt text and `media/caller.webp` (generate a new one), plus the slide notes in deck.json.
- The presenter speaks first; say the setup on the slide before, since the mic is live as soon as this slide opens.
- `call:ended` fires on document with `{ turns }`; the agent slide reads the transcript from there.
- Models: `OPENAI_REALTIME_MODEL` (default `gpt-realtime-2.1`), `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe`).
- The MAYBE repo's `assets/voice/mara.js` is the production-hardened version (reconnects, mic tail, wrap-up nudges);
  port pieces from it if a demo has to survive a long or noisy call.

## Simulated people (the MAYBE "agent world", ported 1:1)
- The ball of ~240 people with 5-8 named, drawn faces; four steps (Spawn, Talk, Think, Verdict); speech bubbles
  where people answer each other; points flying into the card from whoever raised them; qualification chips (dashed
  = a gap); the room splitting into three clusters; a stamped conclusion. Colours and fonts come from brand.css.
- `api/_agents.js`: the task, the named people (`id`, `role`, `face` 0-4 = `media/peeps/peep-*.svg`, `cares`),
  crowd roles, cluster labels, conclusion labels. Replace the peeps with the brand's own drawings if it has some.
- The API returns the whole review as strict JSON (talk lines with `to` and points, private thoughts and
  verdicts, qualifications, the crowd split in %, a conclusion); agents.js plays it at the original pacing
  (bubbles 1.8s apart) in about 35 seconds. Model: `OPENAI_AGENTS_MODEL` (default `gpt-5.4-mini`, ~5s).
- `data-demo` on the slide: the offline story in the same shape as the engine's built-in demo (roles, cast, talk,
  quals, candidate, conclusion, deal). Keep it consistent with the call slide's demo script.
- Honesty is on the slide: "Synthetic estimate · AI review of 1 call", "Simulated people, AI-generated · not real
  opinions", the real outcome kept separate. Never present it as market research.

## Audience vote
- `polls.json`: `id`, `question`, `options`. Change `id` to reset for a new session.
- One vote per phone (id in localStorage); voting again moves the vote.
- Production needs Upstash Redis (Vercel Marketplace, free tier) or votes split across function instances; the
  status pill says "test store" until it's connected.
- QR at 420px is readable from about 10 rows back; for a big hall make it 600px and put the short URL under it.

## Cost and abuse
Every call mints a Realtime session and spends credits. Use an OpenAI project key with a monthly spend limit for
the deck. Functions accept only the deck's own origins and are rate-limited per IP, per voter and per instance;
that keeps casual abuse out but is not a security boundary.

## Screenshots of live slides
Live slides set `data-shoot-wait="<ms>"` on their root and `data-done` when finished; `tools/shoot.mjs` waits for it.

## Ideas for other live moments (build on the same three states)
Live coding result in an iframe, a camera demo (ask permission on the slide before), a live chart fed by
`/api/*`, a "type a question" wall (poll.js pattern with text answers, moderated before showing).
