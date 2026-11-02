# MAYBE hackathon presentation

Live: https://maybe-pitch.vercel.app · ← → to move · F full screen · P notes

**Working together:** read `CLAUDE.md` first (branches, who owns which files, previews, secrets). Luc owns `main` and merges; the partner works on `voice` and opens pull requests.

# MAYBE hackathon presentation

A static site: scroll slides with live product screens and a voice agent. No build step. Deploy the `maybe/pitch` folder to Vercel as-is.

## Presenting

- Scroll, or use the keyboard: → ↓ Space PageDown for next, ← ↑ PageUp for back, Home and End, 1–9 to jump (0 = slide 10).
- F: fullscreen. P: presenter notes (bottom right). Esc closes notes.
- Deep links: `/#slide-6` opens the DICE slide.
- Live slides (4, 5, 6, 8, 9) load the real prototype in a browser frame from `app/*.html`. You can scroll and click inside. "Open full screen" opens it in a new tab.
- On a projector, use 1920×1080 at 100% zoom. Present from Chrome.

## Voice agent

1. Review `agent-prompt.md`.
2. Create the ElevenLabs agent from it and add the client tools listed there.
3. Put the agent id in `assets/site.js`: `const AGENT_ID = 'agent_…';`.
4. In the agent's security settings, allow the Vercel domain.

Without an id the "Talk to MAYBE" button stays visible but disabled ("Agent not connected yet"). The agent can move slides through `goToSlide`, `nextSlide`, `prevSlide`, `openScreen` and `getCurrentSlide`.

## Files

- `index.html`: the 11 slides. Notes for each slide are in its `data-notes`.
- `assets/site.css`, `assets/site.js`: styles and behaviour. Tokens match the MAYBE Product Design System.
- `assets/img/`: AI-generated covers and Open Peeps (CC0) drawings.
- `app/`: the live product screens.
- `vercel.json`: clean URLs and caching.

Companies shown are examples. Mockup only, no partnership implied. Cover images are AI-generated.

## Presentation deck (index.html)

`index.html` is now the left/right presentation. It is **generated** from the slide boards on the "Presentation" page of the MAYBE Final design canvas, so design slides there, not in this file. The previous scrolling version is kept at `scroll.html`.

- Keys: → / Space / PageDown next, ← / PageUp previous, Home / End, 1–9 jump, F full screen, P speaker notes. Swipe on touch screens. Arrow buttons bottom-right appear when the mouse moves.
- Live screens: any element on a slide board with `data-live="<screen>"` gets `app/<screen>.html` in an iframe when the slide opens (the canvas screenshot is the fallback). Arrow keys still work after clicking inside a live screen, except while typing in a field.
- Speaker notes come from the grey sticky note under each board on the canvas.

### Rebuild after editing slides on the canvas

1. Copy the boards `project/SlideNN.dc.html` and `project/canvas.json` from the canvas into `src/`.
2. If a slide uses a new image, add its canvas asset id → sha256 to `src/assets.json` and sha256 → file to `tools/blob-map.json`, and put the file in `deck/img/`. The build warns about any image it cannot map.
3. `node tools/build-deck.mjs`

### Voice agent

Set `AGENT_ID` at the top of `assets/deck.js`. The deck exposes the same client tools as before (`goToSlide`, `nextSlide`, `prevSlide`, `openScreen`, `getCurrentSlide`); `getCurrentSlide` now also returns the live `screens` on the slide. See `agent-prompt.md`.
