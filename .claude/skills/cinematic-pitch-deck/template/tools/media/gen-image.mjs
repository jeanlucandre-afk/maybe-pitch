#!/usr/bin/env node
// gen-image.mjs: make a deck image or character in the brand's image style.
// Engine order: 1) Codex CLI (uses your ChatGPT/Codex plan credits)  2) OpenAI Images API (OPENAI_API_KEY).
// Falls back to 2 when Codex is missing, not logged in, out of credits, has no image tool, or produces no file.
// Codex runs sandboxed to the deck folder (--sandbox workspace-write): it can write the image, nothing outside.
//
//   node tools/media/gen-image.mjs --name mara --prompt "a retail buyer with a headset, waist up, facing left"
//        [--size 1024x1536] [--transparent] [--ref media/mara.png] [--quality low|medium|high] [--engine auto|codex|api] [--webp]
//
// Writes media/<name>.png (and .webp with --webp) and records it in media/ai-images.json (prompt, engine, model,
// date). Every image in that manifest must carry an "AI-generated" label on its slide (tools/check.mjs checks it).
// The style prefix comes from media/image-style.txt, written at the brand gate, so every image matches.
// --ref keeps a character consistent: the reference image is sent along (API: images/edits).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

// Behind an HTTPS proxy (Claude Code cloud, corporate networks) Node's fetch needs NODE_USE_ENV_PROXY=1 (Node ≥ 22.21).
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MEDIA = path.join(ROOT, 'media');
const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
if (!args.name || !args.prompt) { console.error('Usage: --name <file name> --prompt "<what>" [--size 1024x1024|1024x1536|1536x1024] [--transparent] [--ref file] [--engine auto|codex|api] [--webp]'); process.exit(2); }

const name = String(args.name).replace(/[^a-z0-9_-]/gi, '-');
const size = args.size || '1024x1024';
const quality = args.quality || 'medium';
const engine = args.engine || 'auto';
// gpt-image-2 draws best but has no transparent background; transparent cut-outs (characters) use gpt-image-1.5.
const model = args.transparent ? (process.env.OPENAI_IMAGE_MODEL_TRANSPARENT || 'gpt-image-1.5') : (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
const out = path.join(MEDIA, `${name}.png`);
const stylePath = path.join(MEDIA, 'image-style.txt');
const style = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf8').trim() : '';
if (!style) console.warn('! media/image-style.txt is missing: images will not share one style. Write it from the brand brief.');
const prompt = [style, String(args.prompt), args.transparent ? 'Isolated subject on a fully transparent background, no ground shadow.' : '', 'No text, no logos, no watermarks.'].filter(Boolean).join('\n\n');
fs.mkdirSync(MEDIA, { recursive: true });

// .env support for laptops (Claude Code cloud injects the key through its proxy instead)
const envFile = path.join(ROOT, '.env');
if (!process.env.OPENAI_API_KEY && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m);
  if (m) process.env.OPENAI_API_KEY = m[1].trim().replace(/^['"]|['"]$/g, '');
}

const isPng = (f) => fs.existsSync(f) && fs.readFileSync(f).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const NO_CREDITS = /insufficient_quota|credits?|quota|usage limit|billing|plan limit|not logged in|log ?in|unauthori[sz]ed|\b40[12]\b|\b429\b/i;

function tryCodex() {
  const has = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { encoding: 'utf8' }).status === 0;
  if (!has) return { ok: false, why: 'codex CLI not installed' };
  const before = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
  const task = `Generate ONE image with your built-in image generation tool and save it as a PNG at media/${name}.png in this folder.
Size ${size}${args.transparent ? ', transparent background' : ''}.${args.ref ? ` Match the character in ${String(args.ref)}.` : ''}
Do not call any API with an API key, do not write scripts, and do not change any other file.
If you have no image generation tool or no credits for it, print NO_IMAGE_TOOL and stop.
Image prompt:
${prompt}`;
  const r = spawnSync('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', ROOT, task], { encoding: 'utf8', timeout: 6 * 60 * 1000 });
  const log = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (isPng(out) && fs.statSync(out).mtimeMs > before) return { ok: true, model: 'codex image tool' };
  const why = /NO_IMAGE_TOOL/.test(log) ? 'codex has no image tool or no credits for it'
    : NO_CREDITS.test(log) ? 'codex out of credits or not logged in'
    : r.error ? `codex failed (${r.error.code || r.error.message})` : 'codex made no PNG';
  return { ok: false, why };
}

async function tryApi() {
  // In Claude Code cloud the proxy injects the real key for api.openai.com, so a placeholder is enough there.
  const key = process.env.OPENAI_API_KEY || 'sk-injected-by-proxy';
  const common = { model, prompt, size, quality, n: 1, ...(args.transparent ? { background: 'transparent', output_format: 'png' } : {}) };
  let res;
  try {
    if (args.ref) {
      const form = new FormData();
      for (const [k, v] of Object.entries(common)) form.append(k, String(v));
      const ref = path.resolve(String(args.ref));
      form.append('image[]', new Blob([fs.readFileSync(ref)], { type: 'image/png' }), path.basename(ref));
      res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(180000) });
    } else {
      res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(common), signal: AbortSignal.timeout(180000) });
    }
  } catch (e) { return { ok: false, why: `OpenAI API unreachable (${e.name})` }; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body.error?.code || body.error?.type || '';
    const hint = res.status === 401 ? ' (set OPENAI_API_KEY in .env or the environment)'
      : /quota|billing/.test(code) ? ' (the API key has no credits)'
      : res.status === 400 ? ` (${body.error?.param || ''}: ${String(body.error?.message || '').slice(0, 160)})` : '';
    return { ok: false, why: `OpenAI API ${res.status} ${code}${hint}` };
  }
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) return { ok: false, why: 'OpenAI API returned no image' };
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  return { ok: true, model };
}

let result = { ok: false }, used = '';
const tried = [];
if (engine !== 'api') { result = tryCodex(); used = 'codex'; tried.push(`codex: ${result.ok ? 'ok' : result.why}`); }
if (!result.ok && engine !== 'codex') { result = await tryApi(); used = 'openai-api'; tried.push(`api: ${result.ok ? 'ok' : result.why}`); }
console.log(tried.join(' → '));
if (!result.ok) { console.error(`✗ No image made for ${name}.`); process.exit(1); }

let file = `media/${name}.png`;
if (args.webp) {
  try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-c:v', 'libwebp', '-quality', '86', out.replace(/\.png$/, '.webp')]); file = `media/${name}.webp`; }
  catch (e) { console.warn('! webp conversion failed (needs ffmpeg with libwebp); keeping the PNG.'); }
}
const manifestPath = path.join(MEDIA, 'ai-images.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const entry = { file, prompt: String(args.prompt), styled: !!style, engine: used, model: result.model, size, ref: args.ref || null, date: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(manifestPath, JSON.stringify([...manifest.filter((m) => m.file !== entry.file), entry], null, 2) + '\n');
console.log(`✓ ${file} (${used}, ${result.model}). Label it "AI-generated" on its slide.`);
