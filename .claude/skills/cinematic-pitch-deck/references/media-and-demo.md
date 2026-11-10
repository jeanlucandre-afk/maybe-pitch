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

Run: `python3 -m http.server 8765` in the deck folder, then `node tools/walkthrough/record.mjs`.
Needs Playwright (preinstalled in Claude cloud sessions; else `npm i playwright`) and ffmpeg.

## Live prototype in the slide
`<div data-live="app/screen.html" style="left;top;width;height">`: the runtime mounts an iframe designed at
1440px wide, scales it to the box, adds a "Live · click and scroll" badge, preloads the next slide's frame,
and forwards ← → from inside the iframe. Build the prototype as static HTML in `app/` with the same tokens.
Demo data only; companies shown as examples say "mockup only, no partnership implied".

## Real people (TikToks, posts)
- `data-tiktok="https://www.tiktok.com/@user/video/<id>"` on a phone screen embeds the official player while
  the slide is open (removed when it closes). `data-autoplay` starts it; `data-sound` keeps audio on one clip;
  all others are muted through the player API. Needs internet at the venue; check every clip loads.
- Screenshot posts as WebP. Credit the account in the notes; say "individual accounts, not typical cases".

## Live voice agent (optional, the MAYBE "live call")
Pattern: a big audio-reactive orb (left), conversation bubbles streaming in word by word (right), a drawn
character rising from the bottom edge with a name callout ("Mara · Potential buyer · AI") that bobs while it
talks. Architecture:
- A serverless function mints a short-lived session key (`api/realtime-session.js` with the provider key in
  env vars). The page never sees the real key.
- The page connects over WebRTC (OpenAI Realtime or ElevenLabs Conversational AI), feeds mic/agent levels
  into `setLevel(0..1)`, and transcript events into `addMessage(role, text, {replaceLast})`.
- Without a connection, the slide plays a scripted demo conversation so it never looks broken.
- Start/stop on `deck:slidechange`; end the call when the presenter leaves the slide; the agent says it is
  AI if asked.
The MAYBE repo (`assets/live-call.js`, `assets/voice/mara.js`, `api/realtime-session.js`, LIVE-CALL.md) is a
complete working reference.

## Images
- One imagery style per deck. Drawn people (e.g. Open Peeps, CC0) age better than photos.
- AI-generated images carry a small "AI-generated" label (`.ai-label`) on the slide.
- Compress: JPG/WebP ≤ 300 KB for full-bleed, SVG for drawings and logos. Reference as `media/<file>`.
