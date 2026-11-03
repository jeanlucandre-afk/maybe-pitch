// Records the MAYBE product walkthrough video (deck/img/walkthrough.mp4) from the real prototype in app/.
// A person "uses" the site: cursor moves, clicks, smooth scrolls, typing; a camera zooms in on what matters.
//
//   python3 -m http.server 8765        (in the repo root, keep it running)
//   node tools/walkthrough/record.mjs   (needs Playwright + ffmpeg; writes deck/img/walkthrough.mp4)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // works with a global Playwright install too
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'deck/img/walkthrough.mp4');
const TMP = fs.mkdtempSync('/tmp/walkthrough-');
const BASE = process.env.BASE || 'http://localhost:8765';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${BASE}/tools/walkthrough/stage.html`);
await page.evaluate(() => document.fonts.ready);

const wait = (ms) => page.waitForTimeout(ms);
const st = (fn, ...a) => page.evaluate(([f, a]) => window[f](...a), [fn, a]);
const frame = () => page.frame({ url: /\/app\// });

async function open(file) {
  await st('go', file);
  await page.waitForFunction((f) => document.getElementById('app').contentWindow.location.href.endsWith(f) &&
    document.getElementById('app').contentDocument.readyState === 'complete', file);
  await frame().evaluate(() => document.fonts.ready);
  await wait(500);
}
async function rect(loc) {
  return loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top }; });
}
async function point(loc, ms = 800) { const r = await rect(loc); await st('cursorTo', r.x, r.y, ms); await wait(ms + 120); return r; }
async function click(loc, ms = 800) {
  const r = await point(loc, ms);
  await st('press', r.x, r.y); await wait(140);
  await loc.evaluate((el) => el.click());
  await wait(380);
  return r;
}
async function scrollTo(y, ms = 1100) {
  await frame().evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
  await wait(ms);
}
async function typeInto(loc, text) {
  const r = await click(loc, 700);
  await loc.evaluate((el) => { el.focus(); el.select && el.select(); });
  await loc.press('Backspace');
  await loc.pressSequentially(text, { delay: 55 });
  await wait(350);
  return r;
}
const zoom = (x, y, s, ms = 1100) => st('cam', x, y, s, ms);
const wide = (ms = 1100) => st('cam', 0, 0, 1, ms);
const cap = (n, t) => st('caption', n, t);

// ---- record with the Chrome screencast (sharper than Playwright's built-in video) ----
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});

await open('marketplace.html');
await st('cursorTo', 1100, 640, 0);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await wait(900);

// 1 · Find a real job: scroll the marketplace, open the Dr. Lipp sales trial
let f = frame();
await cap('1', 'Find a real job to try');
await wait(900);
await scrollTo(330, 1500);
const card = await rect(f.getByText('Sales Rep at Dr. Lipp').first());
await zoom(card.x + 40, card.y - 60, 1.45);
await point(f.getByText('Sales Rep at Dr. Lipp').first(), 900);
await wait(700);
await click(f.locator('a[href="trial-dr-lipp.html"]').first());

// 2 · Read the brief
await open('trial-dr-lipp.html');
f = frame();
await cap('2', 'Read the brief');
await wide(600);
await wait(500);
const brief = await rect(f.getByText('Sales Rep at Dr. Lipp', { exact: true }).last());
await zoom(brief.x + 120, brief.y + 50, 1.55);
await point(f.getByText('trial order of at least 24 units', { exact: false }).first(), 900);
await wait(900);
const sc = await rect(f.getByText("How you're scored").first());
await zoom(sc.x + 170, sc.y + 110, 1.6);
await wait(1400);
const start = await rect(f.locator('#start'));
await zoom(start.x, start.y + 90, 1.5);
await wait(400);
await click(f.locator('#start'));

// 3 · Sell: a live call with an AI buyer, written into the transcript
await open('sales-crm.html');
f = frame();
await cap('3', 'Sell: call an AI buyer');
await wide(600);
await wait(700);
await scrollTo(150, 900);
await zoom(1020, 470, 1.38);
await st('cursorTo', 1250, 640, 600);
await wait(1100);
const lines = [
  ['you', 'Totally fair on shelf space. What if we start with one 24-unit tray next to the till for six weeks?', '02:31'],
  ['buyer', 'Six weeks. And if it does not sell?', '02:44'],
  ['you', 'Then you have only lost a little shelf space, and you know exactly what your customers buy.', '02:52'],
  ['buyer', 'Fair enough. Send me the offer for one tray.', '03:05'],
];
for (const [who, text, t] of lines) {
  await f.evaluate(([w, x, tt]) => window.MAYBE_CRM.say(w, x, tt), [who, text, t]);
  await wait(who === 'you' ? 2300 : 1700);
}

// 4 · Log the call in the CRM
await cap('4', 'Log the call in the CRM');
const next = f.locator('input').first();
const nr = await rect(next);
await zoom(nr.x, nr.y - 30, 1.85);
await wait(500);
await typeInto(next, 'Send offer: 1 tray, 24 units, 6-week trial');
await click(f.getByText('Update deal').first(), 700);
await wait(500);
await zoom(1100, 150, 1.5);
await wait(1500);
await wide(900);
await wait(300);
await click(f.getByText('Save & exit').first());

// 5 · Submit and get reviewed by AI
await open('sales-results.html');
f = frame();
await cap('5', 'Get reviewed by AI, scored with sources');
const rv = await rect(f.locator('#review'));
await zoom(rv.x, rv.y + 20, 1.35);
await wait(4300);
const ring = await rect(f.locator('#rs-num'));
await zoom(ring.x + 420, ring.y + 40, 1.3);
await wait(2400);
const best = await rect(f.getByText('Best moment').first());
await zoom(best.x + 120, best.y + 40, 1.45);
await wait(1600);
const share = await rect(f.locator('#share'));
await zoom(share.x - 300, share.y - 40, 1.4);
await click(f.locator('#share'));
await wait(900);

// 6 · The employer sees the best sale
await cap('6', 'Dr. Lipp sees your best work');
await wide(800);
await open('employer-board.html');
f = frame();
await wait(700);
const top = await rect(f.getByText('Jean-Luc Andre').first());
await zoom(top.x + 250, top.y + 20, 1.5);
await point(f.getByText('Jean-Luc Andre').first(), 800);
await wait(900);
await click(f.getByText('Jean-Luc Andre').first());
const det = await rect(f.getByText('View full evidence').first());
await zoom(det.x, det.y - 220, 1.55);
await wait(1800);
await click(f.getByText('Invite to interview').first(), 700);
await wait(900);
await wide(1100);
await wait(900);
await cap('', '');
await wait(1100);

await cdp.send('Page.stopScreencast');
await browser.close();

// ---- encode: each frame lasts until the next one ----
const list = [];
frames.forEach((fr, i) => {
  const file = path.join(TMP, `f${String(i).padStart(5, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(fr.data, 'base64'));
  const dur = i + 1 < frames.length ? frames[i + 1].t - fr.t : 0.5;
  list.push(`file '${file}'`, `duration ${Math.max(dur, 0.001).toFixed(4)}`);
});
list.push(`file '${path.join(TMP, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
fs.writeFileSync(path.join(TMP, 'list.txt'), 'ffconcat version 1.0\n' + list.join('\n') + '\n');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'list.txt'),
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
  '-movflags', '+faststart', '-an', OUT]);
console.log(`${frames.length} frames → ${OUT}`);
