# The design bar

The standard is the MAYBE hackathon deck. `references/look/*.jpg` are screenshots of it (the number is its slide
number). Every slide you make, live slides included, must look like it belongs in that deck, in the new brand.

## The required check
After `tools/shoot.mjs`, open each new screenshot AND the closest reference in `look/` (Read both images) and
compare them side by side: type size and weight, amount of text, whitespace, number of colours, how status and
labels are shown. If the new slide is busier, smaller, greyer or more "app-like", fix it before showing anyone.

| New slide | Compare with |
|---|---|
| question / twist / turn / callback | 02-question, 05-twist, 09-turn, 17-callback |
| any stat | 03-crowd-stat, 04-pictograms, 07-phone-feed, 15-market |
| title / close | 10-title, 18-close |
| voice call | 11-live-call |
| agent panel | 13-agent-world |
| poll, timeline, anything else | 15-market, 16-timeline |

## What it looks like
- One huge idea per slide. Headlines 76-104px, tight tracking; the rest is space.
- At most three text sizes per slide: headline, one supporting size, the 15px source line.
- Ink, greys, white or near-black, and ONE accent used on one word, one bar, the highlighted people.
- Numbers in the mono font, large. Labels are sentences, not ALL-CAPS badges.
- Cards only where the original has them (the agent-world panel: 2px ink border, hard offset shadow, mono labels).
- Drawn people and real screenshots; no stock photos, no emoji, no icons for decoration.

## "Vibe code" tells: never ship these
- Status pills / badges with coloured dots in a corner ("● Live · test store…"). Status is a quiet line or the
  original's notice card under the orb, shown only when the presenter needs it.
- Developer messages on stage (setup hints, env var names, "add Upstash"). Those go to the console.
- A font that isn't loaded: the slide falls back to a system face. The fonts in `brand.css` must be in
  `deck.json` → `fonts` (check.mjs warns); vote.html gets them from the build.
- Many small grey texts, uppercase kickers on every block, initials-in-circles as avatars, soft shadows on
  everything, gradients, rounded "dashboard cards", progress spinners.
- Inventing a new visual for a pattern the deck already solved: reuse the template slide (agent world, phone,
  crowd, bar rows) and change words and data.
