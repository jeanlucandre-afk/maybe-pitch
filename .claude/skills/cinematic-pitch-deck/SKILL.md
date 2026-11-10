---
name: cinematic-pitch-deck
description: Build a cinematic, browser-based pitch presentation (hackathon, investor, demo day, keynote) for ANY brand, in the style of the MAYBE hackathon deck - huge tight type, one accent colour, dark question slides, choreographed reveals, walking-crowd and pictogram stats, phone feeds, a title revealed by an intro video, the live product inside the slides, and a recorded product walkthrough. Use when someone asks for a pitch deck, presentation, keynote or slides that should look designed and move, not a PowerPoint. Requires an approved brand design BEFORE any slide is written. For the MAYBE brand itself, use the maybe-pitch-deck skill instead.
---

# Cinematic pitch deck

A deck that feels like a short film: few words, very large, revealed in a rhythm; numbers you can *see*
(people walking in, icons filling up, bars growing); real people on real phones; then the product, live.
Output is one static `index.html` (1920x1080 stage scaled to any screen) plus assets, deployable anywhere.

The engine is in `template/` next to this file. The references explain the why and the exact specs:

| Read | When |
|---|---|
| `references/brand-gate.md` | Step 1, always. The brand brief and how it becomes `brand.css`. |
| `references/story-arc.md` | Step 2. The 14-beat arc and the beat sheet. |
| `references/slide-patterns.md` | Step 4. Every layout, with measurements, and which template slide shows it. |
| `references/motion.md` | Step 4. Timing rules, the choreography library, the signature effects. |
| `references/media-and-demo.md` | Step 5. Intro video, walkthrough recording, live prototype, TikToks, a live voice agent. |
| `references/checklist.md` | Step 6 and before every delivery. |

## Non-negotiables

1. **Brand first. No slide before an approved brand.** If the person has no brand system, you make a
   small one with them first (brand-gate.md) and they approve it. A deck in the template's placeholder
   orange is never delivered.
2. **One accent colour, one highlighted word per headline.** Everything else is ink, greys and white or black.
3. **Big and few.** Headlines 76-104px on a 1920 stage, at most ~20 words per slide, one idea per slide.
4. **Every number has a source on the slide** (15px grey line) and its honest caveat in the speaker notes.
   No invented numbers, users, prices, logos or testimonials. Company logos used as examples say so.
   AI-generated images are labelled. Simulated agents say they are AI.
5. **Motion explains, it never decorates.** Things appear in reading order, numbers land after their claim,
   highlights come last. Respect `prefers-reduced-motion` (the library does).
6. **The demo lives inside the deck**, with a recorded fallback right after it.

## Workflow

### 1. Brand gate (stop here until approved)
Follow `references/brand-gate.md`: collect or derive the brief (name, promise, audience, accent, inks,
fonts, mark, imagery style, voice, banned words), write `template/assets/brand.css` from it, render the
brand board (title slide + one data slide + one dark question slide) and show it. Ask for a yes or
changes. Record the approved brief in the project (`BRAND.md`).

### 2. Story
Fill the beat sheet from `references/story-arc.md`: one line per slide (what the audience should feel or
learn), the one accent word, the number and its source, the speaker note. Default arc: cold question →
the gap (crowd) → the human cost (pictograms) → the other side → the twist ("Right?") → the escalation
(phone feed) → real people (post + TikTok flower) → the turn ("What if…") → title with intro video →
live demo → walkthrough → market → why now → back to the opening question → close. Cut what the story
doesn't need; never cut the question, the turn, the title or the demo. Get the beat sheet approved.

### 3. Facts
Research every number. Keep a sources table (claim, number, source, date, URL, caveat). If a number
can't be sourced, change the sentence, don't keep the number.

### 4. Build
```bash
cp -r <this skill>/template ./deck && cd deck     # or into the repo root
# edit assets/brand.css (from step 1), deck.json (title, fonts, slide order, notes), slides/*.html
node build.mjs                                     # -> index.html; read every warning
python3 -m http.server 8000                        # open http://localhost:8000
```
Start each slide from the closest template slide (slide-patterns.md lists them). Keep the `rv` / `grow` /
`pop` classes and `--d` delays; change words, numbers and the generator attributes (`<x-crowd on="26">`,
`<x-pictos value="51.2">`, `<x-dots on="1">`). Delete template slides you don't use from `deck.json`.

### 5. Media and demo
Intro video for the title, the clickable prototype in `app/`, the walkthrough recorded with
`tools/walkthrough/record.mjs`, TikToks/posts for the real-people slide, optional live voice agent.
See `references/media-and-demo.md`.

### 6. QA
`node tools/shoot.mjs http://localhost:8000` screenshots every slide after its animation settles and
flags text outside the slide. **Look at every screenshot** (Read the PNGs) and fix: overflow, widows,
a second accent word, a number without a source, low contrast. Then run `references/checklist.md`,
including a full click-through with ← → and the speaker notes (P).

### 7. Ship
Static hosting (Vercel: import the repo, no build settings; or any static host). Push = deploy. Keys for a
live agent live only in server env vars, never in the page. Send the person the URL and the presenter keys:
← → move, F full screen, P notes, 1-9 jump.

## Saying what you did
Tell the person which beats you used, which numbers are sourced where, what is placeholder or AI-generated,
and what they must check live at the venue (network for TikToks and the live demo, microphone, audio).
