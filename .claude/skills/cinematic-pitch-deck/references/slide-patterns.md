# Slide patterns

All measurements are on the 1920x1080 stage. Each pattern names its template slide in `template/slides/`.

## Grid and spacing
- Side margin **160px** on statement and data slides, **120px** on the title and the close.
- Statement slides: the text block is vertically centred (`.pad`). Data slides: headline at **top 140px**,
  visual below or to the right.
- The 4px accent **progress line** sits on the top edge of every counted slide (the builder adds it).
- Bottom-right corner (right 72px, bottom 32px) is the place for the honest small print.
- Max line length: headline 13-24ch, lede 40-46ch, body 26-30ch. Set `max-width` in `ch`.

## Type scale
| Role | Size / weight / leading / tracking | Class |
|---|---|---|
| Wordmark (title) | 506px / 700 / .78 / -0.065em, nudged left 20px to optically align | `.display` |
| Wordmark (close) | 360px | `.display` |
| Question / hero (dark) | 104px / 700 / 1.02 / -0.045em | `.h-hero` |
| Data headline | 76-80px / 700 / 1.02 / -0.045em | `.h-1` |
| Tagline, names | 68px / 600 / 1 / -0.04em | `.h-2` |
| Lede (setup line) | 36px / 400 / 1.35, ink-2 | `.lede` |
| Body under a number | 26px / 1.35, ink-2 | `.body-l` |
| Big number | mono 500, 80-120px, -0.05em, decimal point tightened with `<span class="pt">` | `.num .num-xl/l/m` |
| Small number (bar label) | mono 40px | `.num .num-s` |
| Eyebrow / kicker | mono 16-24px, uppercase kicker with .08em tracking | `.eyebrow` `.kicker` |
| Source | 15px, ink-3 | `.source` |

## Patterns

**Cold question** [01] - dark, one 104px sentence, `max-width: 20ch`, one `.hl` word, reveal at 0.4s.

**Crowd stat** [02] - left column 700px wide, centred: headline (76px, 13ch) then one supporting bar row.
Right: `<x-crowd total="100" on="N" cols="10" size="46" gap="14">` at right 200px, vertically centred
(`top:50%; margin-top:-308px`). The highlighted share turns accent after everyone has walked in (~3s).
Use when the number is "N in 100" or a percentage of people.

**Pictogram rows** [03] - headline, then rows on a `250px 740px 1fr` grid: mono 80px number |
`<x-pictos value="…">` (10 icons, partial fill) | one meaning sentence 28px. Rows 0.5s apart.

**Two-number side by side** [05 left] - two mono 96px numbers with 26ch meanings and source lines, 64px apart.

**Dot grid** - `<x-dots total="100" on="1">` for "1 in 100" or tiny shares next to a big number.

**Twist** [04] - dark: grey lede (36px) → assumption (104px) at 0.9s → accent word alone at 2.0s.

**Phone feed** [05 right] - a 450x900 phone (radius 64, 14px bezel, inset 2px #27272A ring, deep shadow) at
left 1180px top 90px; inside, a 400%-tall column of 4 story cards that steps up every ~4.5s (18s loop).
Card: source pill, mono handle + date, 31px sentence with one accent phrase, "Reported by …" at the bottom.

**Real-people flower** [06] - no text. A post screenshot ~760px wide, rotated -1.5°, flies in from the
camera (`.hero-post`). 3-7 phones (270x490 or 340x620 for the hero clip) as `.petal`s around it, each with
its own `--rest` transform (rotateY ±16-20°, rotate up to ±36°), entering from depth along `--fx/--fy`, then
swaying forever. Phones may bleed off the edges. One clip has sound, all autoplay.

**Turn** [07] - dark: grey lede that names both problems, then the "What if … instead of …" at 1.0s.

**Title** [08] - eyebrow at left 120 top 112 (event in accent-deep, year in ink-3). Bottom block at
bottom 120: wordmark (506px) with the accent glyph, then a row with the promise (68px) left and "By" +
names right. Revealed by the intro video (media-and-demo.md).

**Live demo** [09] - a `[data-live="app/x.html"]` frame (1140x860 at left 660 top 110) with a three-line
explanation on the left. For a voice demo: a big orb left, conversation bubbles right, a drawn character
rising from the bottom edge with a name callout (see media-and-demo.md).

**Walkthrough** [10] - full-bleed video on the accent ground, `data-play data-rate="2"`.

**Market bars** [11] - vertical bars on a 2px ink baseline: past (ghost), now (accent), a dashed gap,
forecast (accent-soft). Value labels above in mono 40px, years below in mono 20px. Proof bars right
(560px wide, label left, mono value right, 14px track, one in ink and one in accent).

**Timeline** [12] - a 4px line at top 578px: grey full width, then ink to the deadline (70%). "Today" dot
(24px ink) left; deadline dot (40px accent, 10px accent-soft halo, pops). Requirement chips below
(pill, 1px line border, 22px), one bold 30px sentence, small caveat bottom right.

**Callback** [13] - dark: the opening question at 96px, then its mirror at 72px in ink-dark-2, each with one accent word.

**Close** [14] - top: grey 32px line (old world), 68px line (new world). Bottom: wordmark 360px left,
two-verb tagline 68px right, landing last at 2.2s.

## Recurring details that make it look designed
- Accent word = the stressed word. Exactly one per headline (two only on the callback slide, one per line).
- Mono for every figure, including years and dates on charts.
- Tight decimal points: `66<span class="pt">.</span>8%`.
- Bars have a light track; the filled part grows from the left.
- Phones are drawn in CSS (bezel, inset ring, deep soft shadow), not photos of phones.
- People are icons or drawings, never stock photos.
- Sources sit in 15px grey directly under the number they belong to.
- Nothing touches the edges except intentional bleeds (petals, full-bleed video).
