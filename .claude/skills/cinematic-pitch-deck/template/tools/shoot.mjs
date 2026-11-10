#!/usr/bin/env node
// shoot.mjs: screenshot every slide after its choreography settles, plus a contact sheet.
//   python3 -m http.server 8000      (in the deck folder, keep it running)
//   node tools/shoot.mjs [baseUrl] [settleMs]     -> shots/slide-NN.png, shots/contact.html
// Use it after every build: check the crowd highlight, the bars, overflow, the accent word, the progress line.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://localhost:8000';
const SETTLE = +(process.argv[3] || 4500);
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE + '/index.html#slide-1');
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.DECK.total);
const cards = [];
for (let i = 0; i < total; i++) {
  await page.evaluate((i) => window.DECK.go(i), i);
  await page.waitForTimeout(SETTLE);
  const file = `slide-${String(i + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  const title = await page.evaluate(() => document.querySelector('.deck-slide.is-active').dataset.title);
  // overflow check: anything in the stage that sticks out of 1920x1080 (ignores intentionally bled petals)
  const over = await page.evaluate(() => {
    const st = document.querySelector('.deck-slide.is-active .deck-stage'), r = st.getBoundingClientRect(), k = r.width / 1920;
    return [...st.querySelectorAll('h1,h2,p,span')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 2 || b.bottom > r.bottom + 2) && !e.closest('.petal, .feed'); }).length;
  });
  cards.push({ file, title, over });
  console.log(`${i + 1}/${total} ${title}${over ? `  ⚠ ${over} text element(s) outside the slide` : ''}`);
}
fs.writeFileSync(path.join(OUT, 'contact.html'), `<!doctype html><meta charset="utf-8"><title>Contact sheet</title><style>body{margin:24px;font:14px system-ui;background:#f4f4f5}div{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0}img{width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}</style><div>${cards.map((c, i) => `<figure><img src="${c.file}"><figcaption>${i + 1}. ${c.title}${c.over ? ' ⚠ overflow' : ''}</figcaption></figure>`).join('')}</div>`);
if (errors.length) console.log('Page errors:\n  ' + [...new Set(errors)].join('\n  '));
await browser.close();
