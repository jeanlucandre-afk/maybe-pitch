# Checklist

## Before building
- [ ] Brand brief approved (BRAND.md) and brand.css filled from it. No placeholder orange left.
- [ ] Beat sheet approved: one line per slide, one accent word, every number with a source.

## Every build
- [ ] `node build.mjs` prints no warnings (missing notes, unknown generators, missing files).
- [ ] `node tools/shoot.mjs` run; every screenshot looked at, not just generated.
- [ ] No text outside the stage; no widow (single word on the last line of a headline; fix with `max-width` in ch).
- [ ] Exactly one accent word per headline; accent used nowhere decorative.
- [ ] Every number: mono font, meaning sentence, source line, caveat in notes.
- [ ] Dark slides are text only; each light slide has one visual that is the number.
- [ ] The page console has no errors except missing optional media you know about.

## The little touches (MAYBE had all of them)
- [ ] Black pre-show slide, not counted in the numbering.
- [ ] Progress line on top, growing slide by slide.
- [ ] Controls invisible until the mouse moves; P shows speaker notes; F full screen; 1-9 jump; swipe works.
- [ ] Deep link `#slide-N` opens the right slide; the tab title follows the slide.
- [ ] The crowd walks in and the share lights up after everyone arrives.
- [ ] Title is revealed by the intro video; going back and forward replays it.
- [ ] Walkthrough plays at 2x and restarts on every visit; it is also the last slide for Q&A.
- [ ] Live demo has a recorded fallback right after it.
- [ ] Animations replay when you come back to a slide; nothing animates on hidden slides.
- [ ] `prefers-reduced-motion` shows final states.

## Honesty
- [ ] No invented numbers, users, prices, testimonials or partnerships.
- [ ] Companies used as examples: "mockup only, no partnership implied".
- [ ] AI-generated images labelled; simulated agents say they are AI; estimates say "estimate".
- [ ] No secret key anywhere in the repo or page (`grep -rniE "sk-|api[_-]?key|secret" .`).

## Venue
- [ ] Open the deployed URL on the presenting laptop in Chrome, full screen (F), at the projector resolution.
- [ ] Internet works for TikToks and the live demo; if not, skip to the walkthrough.
- [ ] Microphone permission granted on the live slide; audio out tested for the clip with sound.
- [ ] Speaker notes rehearsed with P; total time measured.
