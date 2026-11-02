# Agent-world slide: developer handoff

Slide 7 (canvas board `Slide05c`, right after the live call with Mara) shows a ball of simulated people reviewing the call. They **spawn** from the call transcript, **talk** it through with each other (replies included), then the ball splits while each agent **thinks** on its own and joins a verdict cluster.

The **review panel** on the left, kept apart from the animation, turns that into a concrete conclusion about the candidate:

- **What worked** and **What didn't**. Each point flies in from the agent who raised it.
- **Qualifications found**. A dashed chip marks a gap to work on.
- A live tally of where the market stands.
- **The verdict:** *Wanted candidate*, added to the company's shortlist (e.g. "Dr. Lipp · Sales shortlist"), or not shortlisted.
- Provenance ("Synthetic estimate · AI review of 1 call") and the real deal outcome, shown separately.

For now one call is reviewed. Later, the same conclusion from many calls ranks candidates on each company's wanted list.

- **Design source:** `src/Slide05c.dc.html` (the layout and copy on the left).
- **Runtime:** `assets/agent-world.js`, loaded by `tools/build-deck.mjs`. It draws the canvas and loops a scripted demo.
- **Build:** `node tools/build-deck.mjs`.

Until real agents are connected, the slide loops a demo of about 36 seconds: 320 agents, eight of them named with faces, three back-and-forth exchanges about the call, then the verdict. The demo uses the same public calls listed below, so real agents look exactly like it.

## What is on the slide

| Element | Selector | Behaviour |
|---|---|---|
| Canvas (right) | `[data-swarm-canvas]` | The ball, links, pulses, faces, speech and thought bubbles, clusters and the provenance stamp. |
| Steps | `[data-swarm-step="spawn" \| "talk" \| "think" \| "result"]` | Spawn · Talk · Think · Verdict. |
| Mode pill | `[data-swarm-mode]` | "Demo simulation" or "Live agents" (set by `connect()` / `disconnect()`). |
| Review panel | `[data-swarm-panel]` | Candidate (`[data-swarm-cand-name]`, `-meta`), `[data-swarm-pros]`, `[data-swarm-cons]`, `[data-swarm-quals]`, `[data-swarm-tally]` (fills itself from the clusters), `[data-swarm-verdict]`, `[data-swarm-deal]`. |

Visual rules: speech is a solid bubble, a thought is a dashed bubble with a halo. An agent that speaks or thinks steps to the front of the ball so its face shows. Verdict colours: `yes` is ink, `maybe` is zinc, `no` is white with an outline.

## API: `window.MAYBE_SWARM`

```js
MAYBE_SWARM.connect();                   // stop the demo; the slide now shows only what you send
MAYBE_SWARM.setAgents([                  // the population (replaces any previous one)
  { id: 'buyer', role: 'Store buyer', face: 1 },   // face 0–4 = a drawn peep (named agent); omit for a plain dot
  { id: 'p17', role: 'Student, 16', delay: 0.4 },  // delay = seconds before it pops out of the transcript card
  // ...hundreds more are fine
]);
MAYBE_SWARM.addAgent({ id, role, face, delay });   // add one at a time, e.g. while streaming
MAYBE_SWARM.setPhase('spawn' | 'talk' | 'think' | 'result');  // also 'idle', 'reset'
MAYBE_SWARM.say('buyer', 'Mara pushed on shelf space.', { to: 'p17', duration: 3.5 }); // `to` lights the link
MAYBE_SWARM.think('buyer', 'A 24-unit tray is low risk.', { duration: 3 });             // dashed bubble + halo
MAYBE_SWARM.setVerdict('buyer', 'yes' | 'maybe' | 'no' | null);  // in think/result the agent flies to that cluster
MAYBE_SWARM.setClusters({ yes: { label: 'Convinced' }, maybe: { label: 'Needs more proof' }, no: { label: 'Not convinced' } });

// the review panel (left)
MAYBE_SWARM.setCandidate({ name: 'Luc', meta: 'Candidate · Dr. Lipp sales trial · 1 call' });
MAYBE_SWARM.addPoint('pro' | 'con', 'Answered the six-week risk with a 24-unit trial', { by: 'buyer' }); // keeps the last 3 per side
MAYBE_SWARM.addQualification('Handles objections', { by: 'buyer' });
MAYBE_SWARM.addQualification('Product facts', { gap: true, by: 'pharm' });   // dashed chip: something to work on
MAYBE_SWARM.setConclusion({ wanted: true, summary: 'Most of the simulated market was convinced: …', list: 'Dr. Lipp · Sales shortlist' });
MAYBE_SWARM.setDeal('Mara asked for a 24-unit trial offer.');                // the real outcome, kept apart from the score
MAYBE_SWARM.clear();
MAYBE_SWARM.disconnect();                // back to the looping demo
MAYBE_SWARM.phase; MAYBE_SWARM.agents;   // read state
```

Events, fired on `MAYBE_SWARM.root`:

- `swarm:start` / `swarm:stop`: the slide came on screen or left it. Start and cancel your backend run here.
- `swarm:phase` with `detail.phase`.

**The call transcript** comes from the live-call slide. `MAYBE_CALL.getTranscript()` returns `[{role: 'you' | 'agent', text}]` for the current call. `MAYBE_CALL.root` also fires `call:message` for every line, so you can start working before the presenter changes slides.

## Suggested backend (Boris to decide)

A Vercel function streams small JSON events, and the page turns each one into a `MAYBE_SWARM` call. Keys stay on the server.

```
POST /api/agent-world   { transcript: [...], trial: 'drlipp-sales' }
→ text/event-stream (or NDJSON), one event per line:
  { "type": "agents",  "agents": [{ "id": "buyer", "role": "Store buyer", "face": 1 }, ...] }
  { "type": "phase",   "phase": "talk" }
  { "type": "say",     "id": "buyer", "text": "...", "to": "p17" }
  { "type": "phase",   "phase": "think" }
  { "type": "think",   "id": "buyer", "text": "..." }
  { "type": "point",   "kind": "pro", "text": "...", "by": "buyer" }
  { "type": "verdict", "id": "buyer", "verdict": "yes" }
  { "type": "qualification", "text": "Handles objections", "gap": false, "by": "buyer" }
  { "type": "phase",   "phase": "result" }
  { "type": "conclusion", "wanted": true, "summary": "...", "list": "Dr. Lipp · Sales shortlist" }
  { "type": "deal",    "text": "Mara asked for a 24-unit trial offer." }
```

How the server could produce those events:

1. **Spawn:** one model call turns the transcript and the trial brief into about 8 named personas (role, needs, doubts). A few hundred lightweight agents are sampled around them (role and leaning only) so the ball is full.
2. **Talk:** run a few round-robin turns where the named personas react to the call and reply to each other. Stream each line as a `say` event with `to` set to the agent they answer. When a line names a concrete strength or weakness of the call, also send a `point` event.
3. **Think:** evaluate each named persona separately and in parallel, with structured output `{verdict, thought}`. Send `think`, then `verdict`. For the lightweight agents, either evaluate them in cheap batches or sample them from their persona's verdict. Either way the result is labelled a **synthetic estimate**, and the deal outcome stays separate.
4. **Conclude:** one final model call reads the discussion and the verdicts and returns the `qualification`s (strengths, plus gaps flagged `gap: true`) and the `conclusion`. `wanted: true` puts the candidate on the company's wanted-candidates list. Base the decision on an explicit rule you document, for example "convinced share above a set level and no blocking gap", so the verdict can be explained. Send the real deal outcome from the call as `deal`.

Pacing: the model is faster or slower than the eye. Queue the events on the page and space the bubbles about 1.8 s apart:

```js
const q = []; let busy = false;
function enqueue(ev) { q.push(ev); if (!busy) drain(); }
function drain() {
  const ev = q.shift(); if (!ev) { busy = false; return; } busy = true;
  if (ev.type === 'agents') MAYBE_SWARM.setAgents(ev.agents);
  if (ev.type === 'phase') MAYBE_SWARM.setPhase(ev.phase);
  if (ev.type === 'say') MAYBE_SWARM.say(ev.id, ev.text, { to: ev.to, duration: 3.6 });
  if (ev.type === 'think') MAYBE_SWARM.think(ev.id, ev.text, { duration: 2.6 });
  if (ev.type === 'verdict') MAYBE_SWARM.setVerdict(ev.id, ev.verdict);
  if (ev.type === 'point') MAYBE_SWARM.addPoint(ev.kind, ev.text, { by: ev.by });
  if (ev.type === 'qualification') MAYBE_SWARM.addQualification(ev.text, { gap: ev.gap, by: ev.by });
  if (ev.type === 'conclusion') MAYBE_SWARM.setConclusion(ev);
  if (ev.type === 'deal') MAYBE_SWARM.setDeal(ev.text);
  const gap = { say: 1800, think: 1700, phase: 600, agents: 3800 }[ev.type] ?? 40;
  setTimeout(drain, gap);
}

MAYBE_SWARM.root.addEventListener('swarm:start', async () => {
  MAYBE_SWARM.connect();
  const res = await fetch('/api/agent-world', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: MAYBE_CALL.getTranscript(), trial: 'drlipp-sales' }) });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += value;
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/^data:\s*/, '').trim(); buf = buf.slice(i + 1); if (line) enqueue(JSON.parse(line)); } }
});
```

Put this adapter in `assets/voice/agent-world-live.js` and load it with one `<script>` tag next to `agent-world.js` in `tools/build-deck.mjs`. If the backend fails, call `MAYBE_SWARM.disconnect()` so the demo keeps the stage alive.

## Content rules for the agents

- They are simulated people, never real customers or real Dr. Lipp staff. Dr. Lipp is a mockup example with no partnership implied.
- No invented statistics in what they say. The clusters show sizes, not numbers.
- The result is always labelled a synthetic estimate (the panel's footer says "Synthetic estimate · AI review of 1 call"), and the deal outcome is shown apart from it.
- Points and the conclusion only describe what happened in the call. Never claim a hiring decision by a real company.
- An agent asked whether it is an AI says yes.
