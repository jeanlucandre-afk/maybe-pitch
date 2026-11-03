#!/usr/bin/env node
// Builds the presentation deck (index.html) from the canvas slide boards.
//
//   src/SlideNN.dc.html   one board per slide, copied from the "Presentation" page of the MAYBE Final canvas
//   src/canvas.json       the canvas index: slide order, titles, and the grey sticky notes used as speaker notes
//   src/assets.json       canvas asset id -> sha256 (from the canvas asset listing)
//   tools/blob-map.json   sha256 -> local image under deck/
//
// Usage: node tools/build-deck.mjs        (run from maybe/pitch)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(p, 'utf8');
const warn = [];

const canvas = JSON.parse(read(path.join(SRC, 'canvas.json')));
const assets = JSON.parse(read(path.join(SRC, 'assets.json')));
const blobMap = JSON.parse(read(path.join(ROOT, 'tools', 'blob-map.json')));

const decodeAttr = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Slides: boards on the presentation page, in canvas reading order: rows top to bottom, each row left to right.
// A board counts as in a row when its top is within 3/4 of a slide height of the row's first board.
// Boards parked far below the grid (a gap of more than ~2.4 slide heights after the last row) stay on the
// canvas but are left out of the deck.
const pres = Object.entries(canvas.boards)
  .filter(([, b]) => b.page === 'presentation')
  .sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
const rows = [];
for (const e of pres) {
  const row = rows[rows.length - 1];
  if (row && e[1].y - row.y < e[1].h * 0.75) row.items.push(e);
  else rows.push({ y: e[1].y, items: [e] });
}
const boards = [], parked = [];
rows.forEach((row, i) => {
  const gap = i ? row.y - rows[i - 1].y : 0;
  const into = parked.length || gap > row.items[0][1].h * 2.4 ? parked : boards;
  into.push(...row.items.sort(([, a], [, b]) => a.x - b.x));
});

const notes = Object.values(canvas.notes || {}).filter((n) => n.page === 'presentation' && !n.kind);
function notesFor(file, b) {
  // Prefer the note whose title names this board ("Notes · 05d · …"); fall back to the note right under it.
  const id = file.replace(/^Slide/, '').replace(/\.dc\.html$/, '');
  const base = id.replace(/-[a-z0-9]{3,6}$/, ''); // canvas copies get a suffix: "05d-o9hm" uses 05d's notes
  const named = (n) => (n.text.match(/^Notes · ([^ ]+) ·/) || [])[1];
  const n = notes.find((n) => named(n) === id) || notes.find((n) => named(n) === base)
    || notes.find((n) => !named(n) && Math.abs(n.x - b.x) < 40 && n.y >= b.y + b.h && n.y <= b.y + b.h + 600);
  if (!n) return '';
  return n.text.replace(/^Notes[^\n]*\n/, '').trim();
}

function renderBoard(file) {
  const html = read(path.join(SRC, file));
  const helmet = (html.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const body = (html.match(/<\/helmet>([\s\S]*?)<\/x-dc>/) || [, ''])[1];
  const scriptTag = html.match(/<script type="text\/x-dc"[^>]*data-props='([^']*)'[^>]*>([\s\S]*?)<\/script>/);
  const props = {};
  if (scriptTag) {
    const decl = JSON.parse(decodeAttr(scriptTag[1]));
    for (const [k, v] of Object.entries(decl)) if (!k.startsWith('$') && v && 'default' in v) props[k] = v.default;
  }
  let vals = {};
  if (scriptTag) {
    class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(s) { Object.assign(this.state, s); } forceUpdate() {} }
    const Component = new Function('DCLogic', `${scriptTag[2]}\n;return Component;`)(DCLogic);
    const c = new Component(props);
    vals = c.renderVals() || {};
  }
  if (/<dc-import\b/.test(body)) warn.push(`${file}: uses dc-import, which this builder does not expand`);
  const lookup = (p, scope) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const fill = (tpl, scope) => tpl.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (m, p) => {
    const v = lookup(p, scope);
    if (v === undefined) { warn.push(`${file}: hole {{${p}}} has no value`); return ''; }
    return typeof v === 'function' ? '' : String(v);
  });
  // expand <sc-for> and <sc-if> (innermost first, so nesting works)
  let out = body, guard = 0;
  const forRe = /<sc-for\s+list="\{\{\s*([\w.$]+)\s*\}\}"\s+as="(\w+)"[^>]*>((?:(?!<sc-for\b)[\s\S])*?)<\/sc-for>/;
  const ifRe = /<sc-if\s+value="\{\{\s*([\w.$]+)\s*\}\}"[^>]*>((?:(?!<sc-if\b)[\s\S])*?)<\/sc-if>/;
  while ((forRe.test(out) || ifRe.test(out)) && guard++ < 200) {
    out = out.replace(forRe, (m, listPath, as, inner) => {
      const list = lookup(listPath, vals) || [];
      return list.map((item, i) => fill(inner, { ...vals, [as]: item, $index: i })).join('');
    });
    out = out.replace(ifRe, (m, p, inner) => (lookup(p, vals) ? inner : ''));
  }
  out = fill(out, vals);
  out = out.replace(/\/_blob\/([0-9a-f]{32})/g, (m, id) => {
    const sha = assets[id];
    const local = sha && blobMap[sha];
    if (!local) { warn.push(`${file}: image /_blob/${id} has no local file (add it to src/assets.json and tools/blob-map.json)`); return m; }
    return `deck/${local}`;
  });
  const styles = [...helmet.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/body\{margin:0\}/, '').replace(/a\{color:#09090B\}a:hover\{color:#52525B\}/, ''));
  return { body: out.trim(), styles };
}

function renumber(body, n, total) {
  return body
    .replace(/>\s*\d+\s*\/\s*\d+\s*<\/div>/, `>${n} / ${total}</div>`)
    .replace(/(height: 4px; width: )[\d.]+%(; background: #7C3AED;)/, `$1${(n / total * 100).toFixed(1)}%$2`)
    // the eyebrow number ("<span …>02</span> · The problem") follows the slide's position in the deck
    .replace(/(<span style="color: #(?:5B21B6|C4B5FD);">)\d+(<\/span> · )/, `$1${String(n).padStart(2, '0')}$2`);
}

const seenStyles = new Set();
const styleBlocks = [];
const sections = boards.map(([file, b], i) => {
  const r = renderBoard(file);
  // a leading "00" board (black pre-show screen) is not counted in the slide numbers
  const offset = /^Slide00\b/.test(boards[0][0]) ? 1 : 0;
  const body = renumber(r.body, i + 1 - offset, boards.length - offset), styles = r.styles;
  for (const s of styles) { const k = s.trim(); if (k && !seenStyles.has(k)) { seenStyles.add(k); styleBlocks.push(k); } }
  const title = (b.title || file).replace(/^\d+[a-z]?\d*\s*·\s*/, '').replace(/\s+copy$/i, '');
  return `<section class="deck-slide" id="slide-${i + 1}" data-title="${esc(title)}" data-notes="${esc(notesFor(file, b))}" aria-roledescription="slide" aria-label="${i + 1} of ${boards.length}: ${esc(title)}">
<div class="deck-stage">
${body}
</div>
</section>`;
});

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAYBE · Hackathon presentation</title>
<meta name="description" content="MAYBE: try real work before you choose it. Interactive hackathon presentation.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/deck.css">
<style>
${styleBlocks.join('\n')}
</style>
</head>
<body>
<!-- Generated by tools/build-deck.mjs from the canvas boards in src/. Edit the slides on the canvas, not here. -->
<main class="deck" aria-label="MAYBE presentation">
${sections.join('\n')}
</main>

<nav class="deck-nav" aria-label="Slide controls">
  <button type="button" class="deck-btn" data-prev aria-label="Previous slide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
  <span class="deck-count" aria-live="polite"><span data-cur>1</span> / <span data-total>${boards.length}</span></span>
  <button type="button" class="deck-btn" data-next aria-label="Next slide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
  <button type="button" class="deck-btn" data-fullscreen aria-label="Full screen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
</nav>

<aside class="deck-notes" data-notes-panel hidden aria-label="Speaker notes">
  <p class="deck-notes__title" data-notes-title></p>
  <p class="deck-notes__text" data-notes-text></p>
  <p class="deck-notes__hint">P hides notes · ← → move · F full screen</p>
</aside>

<div class="agent" data-agent>
  <button class="agent__btn" type="button" data-agent-open aria-describedby="agent-tip"><img src="deck/img/peep-thinker.svg" alt=""><span>Talk to MAYBE</span><span class="agent__dot" aria-hidden="true"></span></button>
  <span class="agent__tip" id="agent-tip" role="tooltip">Agent not connected yet</span>
</div>

<script src="assets/live-call.js" defer></script>
<script src="assets/agent-world.js" defer></script>
<script src="assets/deck.js" defer></script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), page);
console.log(`Built index.html: ${boards.length} slides, ${styleBlocks.length} style block(s).`);
if (parked.length) console.log(`Left out (parked below the grid on the canvas): ${parked.map(([f]) => f).join(', ')}`);
if (warn.length) { console.log('Warnings:'); for (const w of warn) console.log('  - ' + w); process.exitCode = 0; }
