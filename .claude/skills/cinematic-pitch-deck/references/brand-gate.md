# Brand gate

The deck's look comes from about twelve decisions. Make them first, get a yes, then build. A strong
brand on a simple layout beats a clever layout on no brand.

## 1. Find the brand
In this order:
1. A design system or brand book the person points to (Claude Design System artifact, Figma library,
   PDF guidelines, a website's CSS). Read it, take exact values. Never approximate a logo: copy the file.
2. The product itself (its app or site): take colours, fonts, radius and voice from the real thing.
3. Nothing exists: run discovery (below) and propose **two or three directions** as brand boards.

## 2. Discovery questions (only what you can't find)
- Name, and the promise in six words or fewer ("Try real work before you choose it.").
- Who is in the room (jury, investors, customers) and what they must believe after.
- Three words for how it should feel, and one brand it must NOT look like.
- An existing colour, logo, font? Light or dark default?
- Words and claims that are off-limits (legal, partners, "AI that knows you", etc.).

## 3. The brief (write it to BRAND.md)

| Field | Rule | MAYBE example |
|---|---|---|
| Name + mark | The wordmark is the name set huge in the display font, plus one accent glyph | `MAYBE.` with a violet full stop |
| Promise | ≤ 6 words, used under the title and at the close | Try real work before you choose it. / Try it. Prove it. |
| Ground | Light slides on white or near-white; dark slides on near-black | #FFFFFF / #09090B |
| Ink scale | ink, ink-2 (body), ink-3 (sources), line, track, ghost | #09090B #52525B #71717A #E4E4E7 #F4F4F5 #D4D4D8 |
| Accent | ONE saturated colour. Light-ground version, a deep version for small text, a soft tint, a light version for dark slides | #7C3AED / #5B21B6 / #EDE9FE / #C4B5FD |
| Display font | A grotesk with tight tracking that still reads at -0.045em; weight 700 | Geist 700 |
| Number font | A monospace (or tabular) face for every figure | Geist Mono 500 |
| Imagery | One style only: drawn people, or photos, or product screenshots; say which | Open Peeps line drawings; product UI |
| Voice | Plain, direct, short. Sentence case. No exclamation marks, no emoji | "Some never got the chance to discover what they can do." |
| Honesty rules | What must be labelled (examples, AI images, simulations, estimates) | "Mockup only, no partnership implied" |
| Banned | Claims and words never used | "career test", invented numbers |

## 4. Brand.css
Fill `template/assets/brand.css` from the brief. Every variable has a comment saying where it is used.
Fonts: put the Google Fonts URL in `deck.json` → `fonts`, and the family names in `--font-sans` / `--font-mono`.
Self-hosted fonts: add `@font-face` to brand.css and the files under `assets/fonts/`.

Contrast checks (compute them, don't eyeball):
- `--ink-3` on `--bg` ≥ 4.5:1 (sources are small text). `--ink-dark-2` on `--bg-dark` ≥ 4.5:1.
- `--accent` on `--bg` ≥ 3:1 (it is only used at 60px+ or as fills). `--accent-deep` ≥ 4.5:1 for small accent text.
- `--accent-on-dark` on `--bg-dark` ≥ 4.5:1.
- Ghost people vs accent people must differ in lightness, not only hue.

Avoid: gradients as decoration, more than one accent, purple-blue "AI" gradients, emoji, drop shadows on text,
centred body copy, stock photos of people at laptops.

## 5. Image style
Write `media/image-style.txt` from the imagery row of the brief (images.md has examples). If the deck will use
generated images, make 2-3 test images (`--quality low`, a few cents each on the API) to show next to the brand
board; skip this if it won't. Delete test images you don't keep (check.mjs lists unused media).

## 6. Brand board (what you show for approval)
Build three slides with the real tokens and show screenshots (tools/shoot.mjs, or one Playwright shot each):
1. the title slide (giant wordmark + promise + names),
2. one light data slide (headline with the accent word, a big mono number, a grown bar, a source line),
3. one dark question slide (104px, one accent word).

Ask: "Is this the brand? Anything to change before I build the whole deck?" Do not continue without a yes.
When approved, add `/* brand approved: <date> */` at the top of brand.css (tools/check.mjs blocks the placeholder
accent #E4572E unless this line says the approved brand really uses it). When the person changes a token later, change brand.css only; the slides follow.
