# Working inside the maybe-pitch repo (design-canvas flow)

The hackathon deck was built differently from the engine template: Luc designs each slide as a board on the
**MAYBE Final** design canvas (https://claude.ai/artifact/7ffQa8sB7mqJyxWByXgztf, page "Presentation"),
and `tools/build-deck.mjs` turns the exported boards (`src/SlideNN.dc.html`) into `index.html`.
Use this flow when the person wants to change *that* deck or build the next one on the same canvas.
Use the engine template (SKILL.md) for a new, standalone deck. Read the repo's CLAUDE.md first: it has the
lanes (Luc: design, Boris: voice), branch and secrets rules, which override this file.

## How the canvas boards work
- One board = one 1920x1080 slide: `<x-dc>` with `<helmet>` (fonts + `<style>`) and the slide HTML, plus a
  `<script type="text/x-dc" data-props='…'>` component whose `renderVals()` fills `{{holes}}`.
- Every animated board has props `animate` (bool), `speed` (slow/normal/fast → `--spd` 1.5/1/.6) and
  `accent` (light boards #7C3AED / #09090B / #5B21B6; dark boards #C4B5FD / #A78BFA / #FAFAFA).
- The shared motion CSS (`rv rise drift fin shot grow growy draw pop`) is pasted into every board's helmet;
  delays are written `animation-delay: calc(var(--spd) * 0.40s)`.
- The 4px violet progress bar and any "NN / total" counter are rewritten by the builder from the slide's position.
- Order = canvas grid reading order (rows top to bottom, left to right). Boards parked far below the grid are
  left out (the build prints them). Speaker notes are canvas sticky notes titled "Notes · <id> · <title>".
- Images on the canvas are `/_blob/<id>`; the builder maps them via `src/assets.json` (id → sha256) and
  `tools/blob-map.json` (sha256 → deck/img/file).

## Rebuild the deck after canvas edits
Follow "Rebuild the deck" in the maybe-pitch repo's CLAUDE.md (pull, re-read the canvas boards into `src/`,
map new images, `node tools/build-deck.mjs`, check locally, push `main`).

## Making a new slide on the canvas
Duplicate the closest board (the catalogue in hackathon-deck.md), keep its helmet and props, change the copy
and numbers, place it in the grid where it should play, add a "Notes · <id> · <title>" sticky under it.
Patterns from the engine (`<x-crowd>`, `<x-pictos>`) do not exist on the canvas; 00b and 00c contain the
expanded markup to copy instead.

## Runtime contracts that must survive any change
`window.MAYBE_CALL` (live call), `window.MAYBE_SWARM` (agent world), `deck:slidechange` on document,
`data-call` / `data-orb` / `data-bubbles` / `data-avatar` markers, `video[data-play][data-rate]`,
`[data-tiktok]`, `video.mb-intro`. Specs: LIVE-CALL.md, AGENT-WORLD.md.
