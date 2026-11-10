#!/usr/bin/env node
// check.mjs: preflight before every push/deploy. Exit code 1 on any blocking problem.
//   node tools/check.mjs
// Checks: the build runs clean · placeholder brand/text left · secrets in tracked files · every local media file
// referenced exists · big media · every AI image in media/ai-images.json is labelled on its slide · api/ needs
// which env vars (names only) · .env is gitignored.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rel = (p) => path.relative(ROOT, p);
const fail = [], warn = [];

// 1. build
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'build.mjs')], { encoding: 'utf8' });
  if (/Warnings:/.test(out)) warn.push('build warnings:\n' + out.split('Warnings:')[1].trim());
} catch (e) { fail.push('build.mjs failed: ' + (e.stderr || e.message)); }

const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'deck.json'), 'utf8'));
const slideFiles = deck.slides.map((s) => path.join(ROOT, 'slides', s.file)).filter((f) => fs.existsSync(f));
const slides = Object.fromEntries(slideFiles.map((f) => [rel(f), fs.readFileSync(f, 'utf8')]));

// 2. placeholders
const brand = fs.readFileSync(path.join(ROOT, 'assets/brand.css'), 'utf8');
if (/--accent:\s*#E4572E/i.test(brand) && !/brand approved/i.test(brand)) fail.push('assets/brand.css still has the placeholder brand (accent #E4572E). Run the brand gate.');
for (const [f, s] of Object.entries(slides)) {
  const text = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
  const ph = text.match(/\[[A-Z][^\]]{1,60}\]|\bBRAND\b/g);
  if (ph) fail.push(`${f}: placeholder text left: ${[...new Set(ph)].slice(0, 4).join(', ')}`);
  if (/data-tiktok="[^"]*video\/0{10,}/.test(s)) fail.push(`${f}: template TikTok ids (000…) left`);
}

// 3. secrets in files that git would ship
let tracked = [];
try { tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
catch (e) { tracked = []; warn.push('not a git repo yet: secret scan covers slides/, api/, assets/ only'); }
const scan = tracked.length ? tracked : ['slides', 'api', 'assets', 'deck.json'].flatMap(function walk(p) { const a = path.join(ROOT, p); return !fs.existsSync(a) ? [] : fs.statSync(a).isDirectory() ? fs.readdirSync(a).flatMap((c) => walk(path.join(p, c))) : [p]; });
const SECRET = /\b(sk-(?:proj-|live-)?[A-Za-z0-9_-]{20,}|ek_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,})|(?:API_KEY|TOKEN|SECRET)\s*=\s*['"]?[A-Za-z0-9_\-]{16,}/;
for (const f of scan) {
  if (/\.(png|jpe?g|webp|gif|mp4|webm|woff2?|ico|zip)$/i.test(f) || f === '.env.example') continue;
  const abs = path.join(ROOT, f); if (!fs.existsSync(abs) || fs.statSync(abs).size > 2e6) continue;
  if (SECRET.test(fs.readFileSync(abs, 'utf8'))) fail.push(`${f}: looks like it contains a secret. Remove it, rotate the key, keep keys in env vars.`);
}
if (tracked.includes('.env')) fail.push('.env is tracked by git. Remove it from the repo and rotate the keys in it.');

// 4. media referenced exist; sizes
const html = Object.values(slides).join('\n') + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of new Set([...html.matchAll(/(?:src|href|data-live)="((?:media|app|assets)\/[^"#?]+)"/g)].map((x) => x[1]))) {
  if (!fs.existsSync(path.join(ROOT, m))) fail.push(`missing file: ${m}`);
}
if (fs.existsSync(path.join(ROOT, 'media'))) for (const f of fs.readdirSync(path.join(ROOT, 'media'))) {
  const size = fs.statSync(path.join(ROOT, 'media', f)).size;
  if (size > 25e6) fail.push(`media/${f} is ${(size / 1e6).toFixed(0)} MB: too big for a smooth deck (compress; videos ≤ 15 MB)`);
  else if (size > 8e6) warn.push(`media/${f} is ${(size / 1e6).toFixed(1)} MB: consider compressing`);
}

// 5. AI images labelled
const manifestPath = path.join(ROOT, 'media/ai-images.json');
if (fs.existsSync(manifestPath)) for (const img of JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) {
  const used = Object.entries(slides).filter(([, s]) => s.includes(img.file) || s.includes(img.file.replace(/\.webp$/, '.png')));
  for (const [f, s] of used) if (!/ai-label|AI-generated/i.test(s)) fail.push(`${f}: uses ${img.file} (AI-generated) without an "AI-generated" label`);
}

// 6. env vars the api needs (names only)
const apiDir = path.join(ROOT, 'api');
const needs = new Set();
if (fs.existsSync(apiDir)) for (const f of fs.readdirSync(apiDir)) for (const m of fs.readFileSync(path.join(apiDir, f), 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!/^VERCEL|^NODE_/.test(m[1])) needs.add(m[1]);
const gi = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
if (!/^\.env$/m.test(gi)) fail.push('.gitignore must list .env');

console.log(`Slides: ${deck.slides.length} · live scripts: ${(deck.scripts || []).length}`);
console.log(`Env vars the api reads (set in Vercel → Settings → Environment Variables, names only here): ${[...needs].sort().join(', ') || 'none'}`);
if (warn.length) console.log('\nWarnings:\n  - ' + warn.join('\n  - '));
if (fail.length) { console.log('\nBlocking:\n  ✗ ' + fail.join('\n  ✗ ')); process.exit(1); }
console.log('\n✓ Ready to push.');
