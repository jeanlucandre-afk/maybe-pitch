# MAYBE pitch: handoff (3 Nov 2026)

Live: https://maybe-pitch.vercel.app (deploys automatically from `main` in about a minute)
Repo: https://github.com/jeanlucandre-afk/maybe-pitch
Design canvas: https://claude.ai/artifact/7ffQa8sB7mqJyxWByXgztf (page "Presentation")

Everything below is on `main`. The canvas and `src/` match as of this handoff.

## The deck (19 slides)

The deck follows the canvas grid: rows top to bottom, each row left to right. Boards parked far below the grid stay on the canvas but are left out (now: 05e Employer side, 05f What MAYBE is, 10b Why now, 10d The business). Move a board back into the grid to bring it back.

| # | Slide | Source file |
|---|---|---|
| 1 | Black pre-show | `src/Slide00.dc.html` |
| 2 | The question | `src/Slide00a.dc.html` |
| 3 | The experience gap (26 in 100) | `src/Slide00b.dc.html` |
| 4 | The human cost | `src/Slide00c.dc.html` |
| 5 | The other side | `src/Slide00d.dc.html` |
| 6 | The screening | `src/Slide00e.dc.html` |
| 7 | AI vs AI | `src/Slide00e2.dc.html` |
| 8 | Real people (X post + TikTok flower, no text) | `src/Slide00e3.dc.html` |
| 9 | The turn | `src/Slide00f.dc.html` |
| 10 | Title (intro video) | `src/Slide01.dc.html` |
| 11 | Live call with Mara (OpenAI Realtime voice, Boris) | `src/Slide05b.dc.html` |
| 12 | Careers roller → Figma-like DICE design editor (Boris) | `src/Slide05b2.dc.html` |
| 13 | Agent world: AI agents review the live call (Boris) | `src/Slide05c.dc.html` |
| 14 | Product walkthrough video (2x) | `src/Slide05d.dc.html` |
| 15 | The market | `src/Slide10a.dc.html` |
| 16 | The European opportunity | `src/Slide10c.dc.html` |
| 17 | Back to the start | `src/Slide12.dc.html` |
| 18 | Try it. Prove it. | `src/Slide13.dc.html` |
| 19 | Product walkthrough video again (2x) | `src/Slide05d-o9hm.dc.html` |

Speaker notes live in `src/canvas.json` (`notes`), matched to a slide by their title ("Notes · 05d · …"; a canvas copy like `05d-o9hm` uses `05d`'s notes). Press **P** in the deck.

## Working in Cursor

```bash
git pull origin main
python3 -m http.server 8000      # or: npx serve .   → http://localhost:8000
node tools/build-deck.mjs        # after any change in src/ → regenerates index.html
```

- Edit slides in `src/Slide*.dc.html`, never `index.html` (it's generated).
- Push to `main` = deploy. Check `node tools/build-deck.mjs` prints no warnings first.
- **Canvas vs Cursor:** the canvas doesn't see your Cursor edits and Cursor doesn't see canvas edits. Pick one place per slide. If you edit in Cursor and later ask Claude to "rebuild from the canvas", it will overwrite `src/` with the canvas copy, so tell Claude to publish your `src/` changes to the canvas first.
- New image: put it in `deck/img/`, reference it as `deck/img/<file>` directly in the slide (simplest from Cursor). Canvas uploads use `/_blob/<id>` + `src/assets.json` + `tools/blob-map.json`.

## Runtime features (`assets/deck.js`)

- `video[data-play]`: restarts when its slide opens, pauses when it closes. `data-rate="2"` sets playback speed (walkthrough, slide 13).
- `[data-tiktok="https://www.tiktok.com/@user/video/<id>"]`: embeds the TikTok player in that box while the slide is open; add `data-autoplay` to start it by itself (only the first one on slide 8 does). Needs internet at the venue.
- Keys: ← → move, F full screen, P speaker notes, 1–9 jump.

## Sources used on the new slides

- 11,000 applications/minute on LinkedIn: LinkedIn data via The New York Times, June 2025.
- 1 in 5 companies let AI reject with no human review: Resume Builder survey of 948 business leaders, 2024.
- X post: @Sumits_X sharing a r/recruitinghell post (team lead auto-rejected in 6 minutes; React vs React.js). Unverified personal account; screenshot in `deck/img/x-own-company.webp`.
- TikToks: [@its_ken04](https://www.tiktok.com/@its_ken04/video/7499859438732414251), [@petobsessed777](https://www.tiktok.com/@petobsessed777/video/7499996920622992682), [@jerryjhlee](https://www.tiktok.com/@jerryjhlee/video/7354420966665014574). Not checked from the build machine (TikTok is blocked there): open slide 8 live and confirm all three load.
- Strong extra stat, not on a slide yet: Harvard Business School / Accenture "Hidden Workers" (2021): 88% of employers say screening software rejects qualified high-skilled candidates for not matching the job description exactly.

## Open items

1. Check the three TikToks play on the live site (slide 8).
2. Slide 7's phone feed also tells the six-minute story; drop that card if it feels repeated after slide 8.
3. Slides 13 and 16 each contain the walkthrough video twice, stacked (a canvas copy-paste); harmless but decodes twice. Delete one `<video>` per board if the laptop struggles.
4. Official DICE and Dr. Lipp logos in the prototype marketplace: needs `dice.fm` and `www.drlipp.com` allowed in the Claude environment's network settings, or drop the SVGs into `app/img/` yourself, then re-record the walkthrough (`node tools/walkthrough/record.mjs` with a server on :8765).

## For Boris

- `voice` was merged into `main` on 3 Nov (Mara voice, review agents, careers + design editor). The "Talk to MAYBE" button is hidden in `tools/build-deck.mjs`.
- Live call `#slide-11`, careers `#slide-12`, agent world `#slide-13`.

- Branch `voice` has nothing that isn't on `main`, and is 27 commits behind. Start with `git checkout voice && git merge origin/main`.
- Slide numbers moved: **live call is `#slide-11`, agent world `#slide-12`** (CLAUDE.md is updated). The `window.MAYBE_CALL` / `window.MAYBE_SWARM` contracts are unchanged.
- Lane rules and the PR checklist are in `CLAUDE.md`. Env var names go in the PR, never values.
