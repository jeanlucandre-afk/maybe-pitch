#!/usr/bin/env node
// serve.mjs: local server for the deck AND its api/ functions, no Vercel account needed.
//   node tools/serve.mjs [port]      → http://localhost:8000  (phones on the same wifi: http://<laptop-ip>:8000/vote)
// Loads .env (OPENAI_API_KEY, …). Same routing as Vercel: /api/<name> → api/<name>.js, clean URLs (/vote → vote.html).
// Behind an HTTPS proxy (Claude Code cloud) it re-runs itself with NODE_USE_ENV_PROXY=1 so fetch reaches OpenAI.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = +(process.argv[2] || process.env.PORT || 8000);
const require = createRequire(import.meta.url);
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
process.env.VERCEL_ENV = process.env.VERCEL_ENV || 'development';
// Claude Code cloud injects provider keys at its proxy: a placeholder lets the api/ functions run there.
if (!process.env.OPENAI_API_KEY && process.env.CCR_AGENT_PROXY_ENABLED) process.env.OPENAI_API_KEY = 'sk-injected-by-proxy';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

http.createServer((req, res) => handle(req, res).catch((e) => {
  console.error('[serve]', e.message);
  if (!res.headersSent) { res.statusCode = 400; res.end('Bad request'); } else res.destroy();
})).listen(PORT, () => {
  console.log(`Deck on http://localhost:${PORT}  ·  vote page /vote  ·  OpenAI key ${process.env.OPENAI_API_KEY ? 'set' : 'not set (live slides run their demos)'}`);
});

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  let p;
  try { p = decodeURIComponent(url.pathname).replace(/\\/g, '/'); } catch (e) { res.statusCode = 400; return res.end('Bad request'); }
  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/[^a-z0-9-]/gi, '');
    const file = path.join(ROOT, 'api', `${name}.js`);
    if (!name || name.startsWith('_') || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
    try { delete require.cache[require.resolve(file)]; req.query = Object.fromEntries(url.searchParams); await require(file)(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"Function crashed"}'); } }
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  // never serve dotfiles (.env, .git, .vercel) or anything outside the deck folder; case-insensitive for macOS/Windows
  if (p.split('/').some((seg) => seg.startsWith('.'))) { res.statusCode = 403; return res.end(); }
  let file = path.resolve(ROOT, '.' + p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end(); }
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  const stat = fs.statSync(file), type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range); // video seeking needs ranges
  if (range) {
    const start = range[1] === '' ? Math.max(0, stat.size - (+range[2] || 0)) : +range[1];
    const end = range[1] !== '' && range[2] ? Math.min(+range[2], stat.size - 1) : stat.size - 1;
    if (!(start >= 0 && start <= end && start < stat.size)) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}
