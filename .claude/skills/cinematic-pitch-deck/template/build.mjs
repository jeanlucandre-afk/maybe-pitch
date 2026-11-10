#!/usr/bin/env node
// build.mjs: slides/*.html + deck.json -> index.html (one static page, no dependencies).
//
//   deck.json   { "title", "lang", "fonts": "<Google Fonts css2 URL>", "slides": [ { "file", "title", "notes", "uncounted" } ] }
//   slides/     one HTML fragment per slide, root element <div class="slide-root [dark]"> … </div>
//
// Generators (the little touches, so nobody hand-types 100 SVGs):
//   <x-crowd total="100" on="26" cols="10" size="46" gap="14" start="0.25" label="…"></x-crowd>
//       people walk in from the right, the first `on` of them turn accent once everyone has arrived
//   <x-pictos value="51.2" count="10" size="64" start="0.5"></x-pictos>
//       a row of person icons filled to value% (partial icon clipped), each pops in
//   <x-dots total="100" on="1" cols="10" size="14" start="1.6"></x-dots>
//       a dot grid with `on` dots in the accent, for "1 in 100" style stats
//
// Usage: node build.mjs   (prints warnings for missing files, missing notes, unknown generators)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'deck.json'), 'utf8'));
const warn = [];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const r2 = (n) => Math.round(n * 100) / 100;

const PERSON = '<path d="M12 2.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Z M3.5 23.5v-3.2C3.5 15.9 7.3 13 12 13s8.5 2.9 8.5 7.3v3.2Z"/>';
const person = (size, fill) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block;${fill ? `fill:${fill};` : ''}">${PERSON}</svg>`;

function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1]] = m[2];
  return o;
}

const generators = {
  crowd(a) {
    const total = +a.total || 100, on = a.on != null ? +a.on : 0, cols = +a.cols || 10, size = +a.size || 46, gap = +a.gap || 14, start = +(a.start ?? 0.25);
    let out = '';
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const d = r2(start + c * 0.07 + r * 0.05);           // a wave: left columns arrive first, rows slightly later
      const t = r2(start + 2.65 + 0.03 * (c + 2 * r));     // highlight once the whole crowd has arrived
      out += `<span class="walker${i < on ? ' on' : ''}" style="--wd:${d};--wt:${t};display:block;width:${size}px;height:${size}px">${person(size)}</span>`;
    }
    return `<div role="img" aria-label="${esc(a.label || `${on} of ${total} people highlighted`)}" style="display:grid;grid-template-columns:repeat(${cols},${size}px);gap:${gap}px">${out}</div>`;
  },
  pictos(a) {
    const value = +a.value || 0, count = +a.count || 10, size = +a.size || 64, start = +(a.start ?? 0.4), step = 100 / count;
    let out = '';
    for (let i = 0; i < count; i++) {
      const fill = Math.max(0, Math.min(1, (value - i * step) / step));
      if (fill <= 0) { out += `<span style="position:relative;display:block;width:${size}px;height:${size}px">${person(size, 'var(--ghost)')}</span>`; continue; }
      out += `<span class="pop" style="--d:${r2(start + i * 0.05)};position:relative;display:block;width:${size}px;height:${size}px">${person(size, 'var(--ghost)')}`
        + `<span style="position:absolute;left:0;top:0;bottom:0;width:${r2(fill * 100)}%;overflow:hidden">${person(size, 'var(--accent)')}</span></span>`;
    }
    return `<div role="img" aria-label="${esc(a.label || value + '%')}" style="display:flex;gap:${+a.gap || 12}px">${out}</div>`;
  },
  dots(a) {
    const total = +a.total || 100, on = a.on != null ? +a.on : 1, cols = +a.cols || 10, size = +a.size || 14, start = +(a.start ?? 0);
    let out = '';
    for (let i = 0; i < total; i++) out += `<span class="pop" style="--d:${r2(start + i * 0.02)};display:block;width:${size}px;height:${size}px;border-radius:999px;background:${i < on ? 'var(--accent)' : 'var(--ghost)'}"></span>`;
    return `<div role="img" aria-label="${esc(a.label || `${on} of ${total}`)}" style="display:grid;grid-template-columns:repeat(${cols},${size}px);gap:${Math.round(size * 0.43)}px">${out}</div>`;
  },
};

function expand(html, file) {
  return html.replace(/<x-([a-z]+)\b([^>]*?)(?:\/>|>\s*<\/x-\1>)/g, (m, name, a) => {
    if (!generators[name]) { warn.push(`${file}: unknown generator <x-${name}>`); return m; }
    return generators[name](attrs(a));
  });
}

const sections = deck.slides.map((s, i) => {
  const p = path.join(ROOT, 'slides', s.file);
  if (!fs.existsSync(p)) { warn.push(`missing slide file slides/${s.file}`); return ''; }
  let body = expand(fs.readFileSync(p, 'utf8').trim(), s.file);
  if (!/class="[^"]*slide-root/.test(body)) warn.push(`${s.file}: root element needs class="slide-root"`);
  if (!s.notes && !s.uncounted) warn.push(`${s.file}: no speaker notes`);
  // the progress line goes into every counted slide
  if (!s.uncounted) body = body.replace(/(<div class="[^"]*slide-root[^"]*"[^>]*>)/, '$1\n<div class="progress" aria-hidden="true"></div>');
  return `<section class="deck-slide" id="slide-${i + 1}"${s.uncounted ? ' data-uncounted' : ''} data-title="${esc(s.title)}" data-notes="${esc(s.notes)}" aria-roledescription="slide" aria-label="${i + 1} of ${deck.slides.length}: ${esc(s.title)}">
<div class="deck-stage">
${body}
</div>
</section>`;
});

const page = `<!doctype html>
<html lang="${esc(deck.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title)}</title>
${deck.fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${esc(deck.fonts)}" rel="stylesheet">` : ''}
<link rel="stylesheet" href="assets/brand.css">
<link rel="stylesheet" href="assets/deck.css">
<link rel="stylesheet" href="assets/motion.css">
${(deck.css || []).map((c) => `<link rel="stylesheet" href="${esc(c)}">`).join('\n')}
</head>
<body data-deck-title="${esc(deck.title)}">
<!-- Generated by build.mjs from slides/ and deck.json. Edit those, not this file. -->
<main class="deck" aria-label="${esc(deck.title)}">
${sections.join('\n')}
</main>
<nav class="deck-nav" aria-label="Slide controls">
  <button type="button" class="deck-btn" data-prev aria-label="Previous slide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
  <span class="deck-count" aria-live="polite"><span data-cur>1</span> / <span data-total>${deck.slides.length}</span></span>
  <button type="button" class="deck-btn" data-next aria-label="Next slide"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
  <button type="button" class="deck-btn" data-fullscreen aria-label="Full screen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
</nav>
<aside class="deck-notes" data-notes-panel hidden aria-label="Speaker notes">
  <p class="deck-notes__title" data-notes-title></p>
  <p class="deck-notes__text" data-notes-text></p>
  <p class="deck-notes__hint">P hides notes · ← → move · F full screen</p>
</aside>
${(deck.scripts || []).map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
<script src="assets/deck.js" defer></script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), page);
console.log(`Built index.html: ${deck.slides.length} slides.`);
if (warn.length) { console.log('Warnings:'); for (const w of warn) console.log('  - ' + w); }
