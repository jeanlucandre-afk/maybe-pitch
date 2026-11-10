# Presentation skills

Two Claude skills made from the MAYBE hackathon deck (https://maybe-pitch.vercel.app).

| Skill | Use it for |
|---|---|
| `cinematic-pitch-deck/` | A new deck for ANY brand. Brand gate first, then story, then the engine in `template/` (runtime, motion library, crowd/pictogram generators, walkthrough recorder, screenshot QA). |
| `maybe-pitch-deck/` | A new MAYBE deck with the exact hackathon look. Uses the engine above plus the MAYBE brand preset, intro video and slide catalogue. |

They load automatically in Claude Code sessions opened on this repo. Each new deck is built in its OWN folder
and repo (outside maybe-pitch) and gets its own Vercel project. To use them everywhere:
- Claude Code on your computer: copy both folders to `~/.claude/skills/`.
- claude.ai / Claude app: Settings → Capabilities → Skills → upload each folder as a zip (install both;
  the MAYBE skill uses the engine from the other one). There it can design and build the deck; pushing,
  deploying and live-API tests need Claude Code.

Try it: "Make a pitch deck for <brand> using the cinematic-pitch-deck skill" or
"Make a 5-minute MAYBE deck for school principals".
