// Audience voting for the live poll slide.
//   GET  /api/poll            → { id, question, options, counts: [n…], total, store }
//   POST /api/poll { option, voter } → same; one vote per device (voter id from localStorage), re-voting moves it.
// Storage: Upstash Redis REST (Vercel Marketplace → Upstash; sets KV_REST_API_URL + KV_REST_API_TOKEN, or
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Without it, votes live in this instance's memory
// (fine for `vercel dev` and rehearsals, NOT reliable in production: the response says store: "memory").
// New session = change "id" in polls.json.
const { sendJson, originAllowed, rateLimited, readJson } = require('./_lib');
const poll = require('../polls.json');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = globalThis.__pollMem || (globalThis.__pollMem = { counts: {}, voters: {} });
const key = `poll:${poll.id}`;

async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  const bad = out.find((x) => x && x.error);
  if (bad) throw new Error(`redis ${bad.error}`);
  return out.map((x) => x.result);
}

// One atomic step: remember this device's vote, move it if it changed. Returns 0 when nothing changed.
const VOTE_LUA = `local prev = redis.call('GET', KEYS[1])
if prev == ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
if prev then redis.call('HINCRBY', KEYS[2], prev, -1) end
redis.call('EXPIRE', KEYS[2], 604800)
return 1`;

async function counts() {
  let raw = {};
  if (URL_ && TOKEN) {
    const [flat] = await redis([['HGETALL', `${key}:counts`]]);
    for (let i = 0; flat && i < flat.length; i += 2) raw[flat[i]] = +flat[i + 1];
  } else raw = mem.counts[key] || {};
  const c = poll.options.map((_, i) => Math.max(0, raw[i] || 0));
  return { id: poll.id, question: poll.question, options: poll.options, counts: c, total: c.reduce((a, b) => a + b, 0), store: URL_ && TOKEN ? 'redis' : 'memory' };
}

async function vote(option, voter, ip) {
  if (URL_ && TOKEN) {
    // shared cap per network: generous for a venue (one public IP for the room), stops a script flooding the poll
    const [n] = await redis([['INCR', `${key}:ip:${ip}`], ['EXPIRE', `${key}:ip:${ip}`, 60]]);
    if (n > 600) throw Object.assign(new Error('flood'), { status: 429 });
    await redis([['EVAL', VOTE_LUA, 2, `${key}:v:${voter}`, `${key}:counts`, String(option)]]);
  } else {
    const c = mem.counts[key] || (mem.counts[key] = {}), v = mem.voters[key] || (mem.voters[key] = {});
    if (v[voter] === option) return;
    if (v[voter] !== undefined) c[v[voter]] = (c[v[voter]] || 1) - 1;
    v[voter] = option; c[option] = (c[option] || 0) + 1;
  }
}

module.exports = async (req, res) => {
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'Origin not allowed', code: 'origin' });
  try {
    if (req.method === 'GET') { if (rateLimited(req, 3000)) return sendJson(res, 429, { code: 'rate_limited' }); return sendJson(res, 200, await counts()); }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = (await readJson(req, 2048)) || {};
    const option = Number(body.option), voter = String(body.voter || '');
    if (!Number.isInteger(option) || option < 0 || option >= poll.options.length || !/^[a-z0-9-]{8,64}$/i.test(voter)) return sendJson(res, 400, { error: 'Bad vote', code: 'bad_request' });
    if (rateLimited(req, 20, voter)) return sendJson(res, 429, { code: 'rate_limited' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().replace(/[^0-9a-f.:]/gi, '');
    await vote(option, voter, ip);
    return sendJson(res, 200, await counts());
  } catch (e) {
    if (e.status === 429) return sendJson(res, 429, { code: 'rate_limited' });
    console.warn('[poll]', e.message);
    return sendJson(res, 502, { error: 'Poll store unavailable', code: 'upstream' });
  }
};
