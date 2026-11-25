// Render demo/<DEMO, default layla> to MP4: seeks the page's global clock frame by frame and pipes stills into ffmpeg.
// Usage: node tools/demo-video/render.mjs <out.mp4> [audio.wav] [fps=30] [seconds=30.4]
import { spawn } from 'node:child_process';
import { serve } from './shoot.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright')); }
const [out, audio, fpsArg, secArg] = process.argv.slice(2);
const fps = +(fpsArg || 30), secs = +(secArg || 30.4), n = Math.round(fps * secs);
const srv = await serve(); const port = srv.address().port;
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto(`http://localhost:${port}/demo/${process.env.DEMO || 'layla'}/index.html?render&t=0`);
await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(500);
const args = ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
if (audio) args.push('-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < n; i++) {
  await pg.evaluate(t => window.seek(t), Math.min(i / fps, secs));
  const buf = await pg.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${n}`);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r));
await b.close(); srv.close(); console.log('wrote', out);
