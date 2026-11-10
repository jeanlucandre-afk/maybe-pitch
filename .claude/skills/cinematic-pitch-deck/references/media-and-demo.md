# Media and the demo

## Title intro video
- 5-8 seconds, 1920x1080, H.264 MP4, muted (autoplay needs muted), `faststart`. Under ~6 MB.
- Its last frame should match the title slide (same ground, wordmark position), so the fade-out reveals the
  real slide seamlessly. Typical content: the wordmark assembling, letters typing, a quick montage ending on white.
- Sources: a motion tool export, a screen recording of an HTML animation (record with Playwright like the
  walkthrough), or an AI video tool (label it if it shows people or places).
- Mechanics (template slide 08, runtime `media()`): slide root has `data-intro`; it is black until 250ms
  after the slide opens, then the video plays over the title and fades out in its last 4%. If the file is
  missing or autoplay is blocked, the title simply shows. Next slide → back resets it.

## Product walkthrough (the "walking demo")
`template/tools/walkthrough/` records the real prototype as if a person used it:
- `stage.html`: the prototype in a browser window (fake address bar per page) on the accent ground; a
  camera layer that zooms smoothly on a point (`cam(x, y, scale)`), a fake cursor that glides (`cursorTo`)
  and presses with a ripple (`press`), and a numbered caption pill top-left (`caption(n, text)`).
- `record.mjs`: Playwright drives it with the Chrome screencast (sharper than built-in video), then ffmpeg
  makes a 30fps H.264 `media/walkthrough.mp4`. Helpers: `open`, `point`, `click`, `scrollTo`, `typeInto`,
  `zoom`, `wide`, `cap`.
- Script 4-6 numbered steps (MAYBE: Find a real job → Read the brief → Sell: call an AI buyer → Log the
  call in the CRM → Get reviewed by AI → Get invited). In each: caption, glide, zoom 1.4-1.9x on the thing
  that matters, act, back to wide. Typing at 55ms per key. Things a script can't click (an AI reply
  streaming in), expose as a hook in the prototype (`window.APP.say(role, text)`).
- The slide plays it full-bleed at 2x (`data-play data-rate="2"`), restarting on every visit. Put it right
  after the live demo (fallback) and again after the close (loops during Q&A).

Run: `node tools/serve.mjs 8765` in the deck folder, then `node tools/walkthrough/record.mjs`.
Needs Playwright (preinstalled in Claude cloud sessions; else `npm i playwright`) and ffmpeg.

## Live prototype, voice call, simulated panel, audience vote
See `live-demos.md`.

## Real people (TikToks, posts)
- `data-tiktok="https://www.tiktok.com/@user/video/<id>"` on a phone screen embeds the official player while
  the slide is open (removed when it closes). `data-autoplay` starts it; `data-sound` keeps audio on one clip;
  all others are muted through the player API. Needs internet at the venue; check every clip loads.
- Screenshot posts as WebP. Credit the account in the notes; say "individual accounts, not typical cases".

## Images
Generated images and characters: see `images.md`. Photos and drawings you already have: JPG/WebP ≤ 300 KB for
full-bleed, SVG for drawings and logos, referenced as `media/<file>`. One imagery style per deck.
