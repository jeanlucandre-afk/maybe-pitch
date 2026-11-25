// Usage: node tools/demo-video/shoot.mjs <outdir> t1 t2 ...   (stills of demo/leyla-expedia at given seconds)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright')); }
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
const root = resolve(new URL('../..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css', '.m4a': 'audio/mp4' };
export function serve() {
  return new Promise(ok => { const srv = createServer(async (q, r) => {
    try { const p = join(root, decodeURIComponent(q.url.split('?')[0])); r.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); r.end(await readFile(p)); }
    catch { r.writeHead(404); r.end(); } }).listen(0, () => ok(srv)); });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, ...ts] = process.argv.slice(2);
  const srv = await serve(); const port = srv.address().port;
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await pg.goto(`http://localhost:${port}/demo/leyla-expedia/index.html?render&t=0`); await pg.evaluate(() => document.fonts.ready);
  for (const t of ts) { await pg.evaluate(t => window.seek(t), +t); await pg.screenshot({ path: `${out}/t${t}.jpg`, quality: 80 }); }
  await b.close(); srv.close();
}
