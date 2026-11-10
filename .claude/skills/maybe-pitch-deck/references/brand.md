# MAYBE brand, for presentations

Sources: the "MAYBE Product" design system (https://claude.ai/artifact/D8md6vL8PavrLisCW86kaN) and the
hackathon deck (src/*.dc.html in github.com/jeanlucandre-afk/maybe-pitch). Read the design system README
again when building product screens; it is newer than this file.

## What MAYBE is (one paragraph you can trust)
Students pick a real job from a company, try the actual task for about an hour (simulated and safe to fail)
and keep the proof: transcripts, files and scores that say where they came from. Employers see the work,
not just the CV, and a person decides who gets invited to interview. AI creates the chance; people make the
decision. Explore → Experience → Reflect → Compare.

## Colour
| Token | Value | Where |
|---|---|---|
| ground (light) | #FFFFFF | data slides, title, close |
| ground (dark) | #09090B | question, twist, turn, callback |
| ink | #09090B / #FAFAFA on dark | headlines, numbers, primary bars |
| ink-2 | #52525B / #A1A1AA on dark | ledes, meanings |
| ink-3 | #71717A | sources, kickers (4.8:1) |
| line / track / ghost | #E4E4E7 / #F4F4F5 / #D4D4D8 | hairlines, bar tracks, unhighlighted people and bars |
| accent | #7C3AED | the accent word, progress line, highlighted people, the "now" bar, the walkthrough ground |
| accent-deep | #5B21B6 | small violet text (event name in the eyebrow) |
| accent-soft | #EDE9FE | forecast bar, deadline halo |
| accent on dark | #C4B5FD | the accent word on dark slides |

Violet is never a button, a background wash or a gradient in the product. Primary actions are black.

## Type
- Geist for words, Geist Mono for every number, date and timer (Google Fonts).
- Slides: wordmark 506/360px 700 -0.065em; questions 104px 700 -0.045em; data headlines 76-80px;
  taglines 68px 600 -0.04em; ledes 36px; meanings 26px; sources 15px.
- Product UI (when screens appear): heading-1 30/600, heading-3 18/600, body 14, caption 12/500.

## Voice
Plain, direct, short. Say what the student does ("Call three AI retail buyers by voice"). Sentence case.
No exclamation marks, no emoji. Questions that make the room think about their own choice. The core verbs
are **try**, **show**, **prove**. Speaker notes are spoken English, first person plural ("we're Boris and Luc").

## Honesty (part of the brand, not legal small print)
- Anything simulated says so: "Simulated scenario", "Synthetic estimates · not real fans", "prospects are AI".
- Every score has a provenance label: Rule-based (teal), Synthetic estimate (amber), AI review (violet).
  A deal outcome (won/lost) is shown separately and never folded into a score.
- Company logos: "Mockup only, no partnership implied". DICE and Dr. Lipp logos in the prototype are traced
  stand-ins; replace with official files before anything public.
- Statistics carry their caveat on the slide or in the notes ("an estimate of recommendations, not proven
  missed hires"; "Greenhouse customers, not the whole market"; "not a compliance claim").

## Imagery
- People: Open Peeps (Pablo Stanley, CC0): black ink, white fills. Never photos of people.
- Experience covers: AI-generated drawn scenes (festival stage, skincare still life) with a floating UI card;
  no logos baked into images; labelled AI-generated.
- Product: real screens from the prototype, inside a browser window on the violet ground (walkthrough) or a
  live iframe.
- Phones: CSS-drawn near-black devices with a #27272A inner ring.

## Iconography
Lucide-style strokes, 24 viewBox, stroke-width 2, round caps, currentColor. The MAYBE mark is "M." with the violet square.

## Never
"Career test", "personality typing", "AI that knows you", invented numbers/prices/users/testimonials,
implied partnerships, violet gradients, emoji.
