---
name: cinematic-pitch-deck
description: Build and publish a cinematic pitch presentation as a live website (own GitHub repo + Vercel, like maybe-pitch.vercel.app) for ANY brand - huge tight type, one accent colour, choreographed reveals, walking-crowd and pictogram stats, autoplaying videos, a title revealed by an intro film, and live demos inside the slides (clickable prototype, a voice call with an AI character, simulated people reacting live, the audience voting by QR). Generates brand-styled images and characters with Codex, falling back to the OpenAI API. Use for pitch decks, demo days, hackathons, investor or keynote presentations that should look designed and move, not PowerPoint. Requires an approved brand BEFORE any slide. For the MAYBE brand use maybe-pitch-deck.
---

# Cinematic pitch deck

A deck that feels like a short film and runs as a website: few words, very large, revealed in rhythm; numbers you
can *see*; real people on real phones; then the product working live in the room. Output: a GitHub repo with a
static `index.html` (1920x1080 stage scaled to any screen), `media/`, `app/` and Vercel functions in `api/`,
deployed on every push.

Engine: `template/` next to this file. References (read the one for the step you're on):

| Read | When |
|---|---|
| `references/brand-gate.md` | Step 1, always. Brand brief → `brand.css` + image style. |
| `references/story-arc.md` | Step 2. The beat sheet. |
| `references/slide-patterns.md` | Step 4. Every layout with measurements. |
| `references/motion.md` | Step 4. Choreography rules, the effect library, timing table. |
| `references/images.md` | Step 5. Characters and images: Codex first, then the OpenAI API. |
| `references/media-and-demo.md` | Step 5. Intro film, recorded walkthrough, TikToks. |
| `references/live-demos.md` | Step 5. Voice call, simulated panel, audience vote, live prototype. |
| `references/web-and-deploy.md` | Step 7. GitHub repo + Vercel + env vars + live checks. |
| `references/checklist.md` | Before every delivery. |

## Non-negotiables
1. **Brand first.** No slide before the person approves a brand (brand-gate.md). The template's placeholder orange
   never ships; `tools/check.mjs` blocks it.
2. **One accent colour, one highlighted word per headline.** Everything else ink, greys, white or near-black.
3. **Big and few.** 76-104px headlines on the 1920 stage, ≤ ~20 words a slide, one idea a slide.
4. **Honest.** Every number has a source line on the slide and its caveat in the notes. No invented numbers,
   users, prices, logos or testimonials. Example companies say "mockup only". AI images are labelled. Simulated
   people and AI characters say so, on screen.
5. **Motion explains, never decorates.** Reading order; claim before proof; one house curve; reduced-motion safe.
6. **Live, with a net.** Every live demo shows Live / Connecting / Demo and falls back to a labelled demo in
   seconds; a recorded walkthrough follows the live part.
7. **Keys stay on the server.** Only names in chat, code and commits; values live in Vercel env vars or a
   gitignored `.env`.

## Questions to ask first (only what you can't find out)
- Audience, length, date and venue (projector? wifi? can the presenter use a mic?).
- Brand sources (design system, site, logo files) or "make one".
- Which live moments: prototype, voice call, simulated panel, audience vote. What the product really does today.
- Presenters' names, event name. GitHub owner and Vercel team for the repo; public or private.
- Codex installed and logged in? Otherwise the OpenAI API key pays for images.

## Workflow
0. **Set up the folder.** Copy the engine OUTSIDE any existing repo (cloud: `/home/user/<name>`; laptop: next to
   your projects): `cp -r <this skill>/template ../<brand>-pitch && cd ../<brand>-pitch`. `<this skill>` is the
   folder holding this SKILL.md (`.claude/skills/…` in a repo, `~/.claude/skills/…` on a laptop; otherwise
   `find / -path '*cinematic-pitch-deck/SKILL.md' 2>/dev/null`). Run `which codex`: if it's missing (normal in
   cloud sessions) pass `--engine api` to gen-image.mjs instead of asking.
1. **Brand gate.** brand-gate.md: brief → `assets/brand.css` (add `/* brand approved: <date> */`),
   `media/image-style.txt`, 2-3 test images (images.md), a three-slide brand board. Show it where the person can
   see it: in a cloud session publish the screenshots as an Artifact page (or push and share a Vercel preview);
   on a laptop open the PNGs. Stop until approved.
2. **Story.** story-arc.md: beat sheet (slide, headline with the accent word, visual, number + source, note).
   Get it approved.
3. **Facts.** Sources table for every number; drop numbers that can't be sourced.
4. **Build.** `node build.mjs && node tools/serve.mjs` → http://localhost:8000 (deck + api).
   Start each slide from the closest template slide; keep the motion classes and `--d` delays; change words,
   numbers and generator attributes (`<x-crowd on="26">`, `<x-pictos value="51.2">`, `<x-dots on="1">`).
   Remove unused slides from `deck.json`.
5. **Media and live demos.** Characters and images via `tools/media/gen-image.mjs` (Codex → API). Intro film,
   walkthrough recording (`tools/walkthrough/record.mjs`), TikToks. Live demos: write `api/_persona.js`,
   `api/_agents.js`, `polls.json`, the demo scripts, and the prototype in `app/`.
6. **QA.** `node tools/shoot.mjs http://localhost:8000` and **look at every PNG**; `node tools/check.mjs` must say
   "Ready to push"; click through with ← → and P; test every live slide with and without a key.
7. **Publish.** web-and-deploy.md: GitHub repo, Vercel project linked to it, env var names for the person to fill,
   then verify the production URL (`/api/health`, each live slide, a phone vote).

## Where it runs
- Claude Code (cloud or laptop): everything, including repo, deploy and live tests.
- claude.ai / Claude app with the skill uploaded: brand gate, story, slides and a zip of the deck folder; pushing,
  Vercel and live-API tests need Claude Code or the person's own terminal.

## Verify before saying done
Give the person: the production URL, the repo, which slides are live and what each falls back to, which env vars
they must add (names), what is AI-generated, every number with its source, and what to test at the venue
(wifi, mic, audio, projector resolution). Presenter keys: ← → move, F full screen, P notes, 1-9 jump.
