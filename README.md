# MAYBE. Try real work before you choose it.

**Macromedia × CODE Hackathon 2026 · Team: Boris & Luc**

## ▶ Presentation (the demo is inside)

**https://maybe-pitch.vercel.app**

The presentation *is* the demo. The product runs live inside the slides, so there is no separate demo link:

| Slide | What you see |
|---|---|
| **12 · Live call** | A real voice call with **Mara**, an AI customer. Speak into your microphone; she answers live. |
| **13 · Careers** | Browse real-world jobs and open a trial, such as the DICE design editor. |
| **14 · Agent world** | Right after the call, a crowd of simulated AI agents reviews it and gives a verdict. |
| **15 · Product walkthrough** | A recorded run through the working prototype: marketplace, trial, AI review, employer side. |

**How to use it:** open the link in Chrome, press **→** to move, **F** for full screen, **P** for speaker notes. Allow the microphone on the live-call slide. Without a connection the slides play a demo run instead.

## What MAYBE is

Students pick a real job from a company, **try** the actual task for about an hour (simulated and safe to fail), and **keep the proof**: transcripts, files and scores that say where they came from. Employers see the work, not just the CV, and a person decides who gets invited to interview.

> AI creates the chance; people make the decision.

Companies shown (DICE, Dr. Lipp, Spotify and others) are examples: mockup only, no partnership implied. AI-generated images and simulated agents are labelled as such.

## How it's built

| Part | Where |
|---|---|
| Slides: generated from our design canvas into one static page | `index.html` ← `src/*.dc.html` via `tools/build-deck.mjs` |
| Live voice call with Mara (OpenAI Realtime, short-lived key from the server) | `api/realtime-session.js`, `assets/voice/mara.js`, `assets/live-call.js` |
| AI review of the call: agents, rubric, evidence | `api/review-sales.js`, `api/_review/`, `assets/voice/agent-world-live.js`, `assets/agent-world.js` |
| Clickable product prototype (student and employer screens) | `app/` |
| Images, videos, slide assets | `deck/img/` |

Hosting: Vercel (static files + Node serverless functions in `api/`). API keys live only in Vercel environment variables; `.env.example` lists the names.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To run the voice call and AI review locally too, use `vercel dev` with a `.env` (names in `.env.example`). After editing anything in `src/`, run `node tools/build-deck.mjs` to regenerate `index.html`.

## Repository map

```
index.html           the presentation (generated, don't edit by hand)
src/                 slide designs + canvas.json (order, speaker notes)
app/                 product prototype screens shown inside the slides
assets/              deck behaviour and styles; assets/voice/ = voice + review client code
api/                 serverless functions: realtime voice session, call review
deck/img/            images and videos
tools/               deck builder, walkthrough recorder
docs/                reference notes
```

Team docs: [`CLAUDE.md`](CLAUDE.md) (how we work: branches, lanes, secrets) · [`HANDOFF.md`](HANDOFF.md) (current state) · [`LIVE-CALL.md`](LIVE-CALL.md) · [`AGENT-WORLD.md`](AGENT-WORLD.md) · [`agent-prompt.md`](agent-prompt.md). `scroll.html` is an earlier scrolling version of the deck, kept for reference.
