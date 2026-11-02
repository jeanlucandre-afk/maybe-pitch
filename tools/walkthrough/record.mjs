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

// 1 · Choose a trial
let f = frame();
await cap('1', 'Choose a real job to try');
await wait(700);
await click(f.getByRole('button', { name: 'Sales', exact: true }).first());
await wait(500);
await click(f.locator('button[aria-label="Dr. Lipp"]').first());
await scrollTo(260);
const card = await rect(f.locator('a[href="sales-crm.html"]').first());
await zoom(card.x - 380, card.y - 200, 1.5);
await wait(600);
await point(f.getByText('Sales Rep at Dr. Lipp').first(), 700);
await wait(500);
await click(f.locator('a[href="sales-crm.html"]').first());
await wide(700);

// 2 · Do the real work
await open('sales-crm.html');
f = frame();
await cap('2', 'Do the real work: call an AI buyer');
await wait(600);
const call = await rect(f.getByText('Live call', { exact: true }).first());
await zoom(call.x + 160, call.y + 180, 1.7);
await wait(1600);
const next = f.locator('input').first();
const nr = await rect(next);
await zoom(nr.x, nr.y - 40, 1.9);
await wait(500);
await typeInto(next, 'Send trial offer: 24-unit tray + tester, 6 weeks');
await click(f.getByText('Update deal').first(), 700);
await wait(900);
const tr = await rect(f.getByText('Live transcript').first());
await zoom(tr.x + 250, tr.y + 50, 1.6);
await wait(1600);
await wide(900);
await wait(400);
await click(f.getByText('Save & exit').first());

// 3 · Keep the evidence
await open('dashboard.html');
f = frame();
await cap('3', 'Keep the evidence');
await wait(500);
const done = await rect(f.getByText('Sales Rep at Dr. Lipp').first());
await zoom(done.x + 150, done.y, 1.6);
await wait(1500);
await scrollTo(380);
const sc = await rect(f.getByText('Your latest scores').first());
await zoom(720, sc.y + 110, 1.45);
await point(f.getByText('Rule-based').first(), 700);
await point(f.getByText('AI review').first(), 700);
await point(f.getByText('Synthetic estimate').first(), 700);
await wait(500);
await wide(900);
await wait(500);

// 4 · Employers see the work
await cap('4', 'Employers see the work');
await open('employer-board.html');
f = frame();
await wait(500);
await click(f.getByText('Jean-Luc Andre').first());
const det = await rect(f.getByText('View full evidence').first());
await zoom(det.x, det.y - 200, 1.6);
await wait(1400);
await click(f.getByText('Invite to interview').first(), 700);
await wait(700);
await wide(800);
await click(f.locator('a[href="candidate-evidence.html"]').first());
await open('candidate-evidence.html');
f = frame();
await wait(400);
await click(f.getByText('Transcript', { exact: true }).first());
await wait(900);
await click(f.getByText('Evidence', { exact: true }).first());
await scrollTo(260);
const rs = await rect(f.getByText('Rubric score').first());
await zoom(rs.x + 330, rs.y + 40, 1.55);
await wait(1700);
await wide(900);
await wait(300);
await click(f.getByText('Invite to interview').first());
await wait(800);
await cap('', '');
await wait(1200);

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
