#!/usr/bin/env node
// record.mjs: records media/walkthrough.mp4 from the real prototype in app/, as if a person used it.
// The prototype runs in a browser window on the brand's accent ground (stage.html). A fake cursor glides and
// clicks with a ripple, the page smooth-scrolls, text is typed key by key, a camera zooms on what matters, and a
// numbered caption names each step. Recorded with the Chrome screencast (sharper than Playwright video).
//
//   python3 -m http.server 8765          (in the deck folder, keep it running)
//   node tools/walkthrough/record.mjs     (needs Playwright + ffmpeg)
//
// Write the STEPS section for your product: 4-6 steps, each = caption + 2-4 actions + one zoom. Aim for 60-90 s
// raw; the slide plays it at 2x. Make the prototype expose small hooks (window.APP.say(...)) for things a script
// can't click, like an AI reply streaming in.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'media/walkthrough.mp4');
const TMP = fs.mkdtempSync('/tmp/walkthrough-');
const BASE = process.env.BASE || 'http://localhost:8765';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${BASE}/tools/walkthrough/stage.html`);
await page.evaluate(() => document.fonts.ready);

// ---- helpers ----
const wait = (ms) => page.waitForTimeout(ms);
const st = (fn, ...a) => page.evaluate(([f, a]) => window[f](...a), [fn, a]);
const frame = () => page.frame({ url: /\/app\// });
async function open(file) {                                    // load app/<file> in the window
  await st('go', file);
  await page.waitForFunction((f) => document.getElementById('app').contentWindow.location.href.endsWith(f) &&
    document.getElementById('app').contentDocument.readyState === 'complete', file);
  await frame().evaluate(() => document.fonts.ready);
  await wait(500);
}
async function rect(loc) {
  return loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
}
async function point(loc, ms = 800) { const r = await rect(loc); await st('cursorTo', r.x, r.y, ms); await wait(ms + 120); return r; }
async function click(loc, ms = 800) {                          // glide, press (ripple), click
  const r = await point(loc, ms);
  await st('press', r.x, r.y); await wait(140);
  await loc.evaluate((el) => el.click());
  await wait(380);
  return r;
}
async function scrollTo(y, ms = 1100) { await frame().evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y); await wait(ms); }
async function typeInto(loc, text) {                            // human typing speed
  await click(loc, 700);
  await loc.evaluate((el) => { el.focus(); el.select && el.select(); });
  await loc.pressSequentially(text, { delay: 55 });
  await wait(350);
}
const zoom = (x, y, s, ms = 1100) => st('cam', x, y, s, ms); // centre app point (x, y) at scale s (1.3-1.9 reads well)
const wide = (ms = 1100) => st('cam', 0, 0, 1, ms);
const cap = (n, t) => st('caption', n, t);                     // cap('', '') hides it

// ---- record ----
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});
await open('index.html');
await st('cursorTo', 1100, 640, 0);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await wait(900);

// ======== STEPS: replace with your product's story ========
let f = frame();
await cap('1', 'Find what you need');
await wait(900);
await scrollTo(300, 1500);
const target = f.locator('body');                 // e.g. f.getByText('Sales Rep at Dr. Lipp').first()
const r = await rect(target);
await zoom(r.x, Math.min(r.y, 400), 1.45);
await wait(1500);
await wide(900);
// await click(f.locator('a[href="trial.html"]').first()); await open('trial.html'); f = frame(); await cap('2', 'Try it'); …
// ===========================================================

await wait(900);
await cap('', '');
await wait(1100);
await cdp.send('Page.stopScreencast');
await browser.close();

// ---- encode: each frame lasts until the next one (screencast frames are irregular) ----
const list = [];
frames.forEach((fr, i) => {
  const file = path.join(TMP, `f${String(i).padStart(5, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(fr.data, 'base64'));
  const dur = i + 1 < frames.length ? frames[i + 1].t - fr.t : 0.5;
  list.push(`file '${file}'`, `duration ${Math.max(dur, 0.001).toFixed(4)}`);
});
list.push(`file '${path.join(TMP, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
fs.writeFileSync(path.join(TMP, 'list.txt'), 'ffconcat version 1.0\n' + list.join('\n') + '\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'list.txt'),
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
  '-movflags', '+faststart', '-an', OUT]);
console.log(`${frames.length} frames → ${OUT}`);
