// Shared helpers for the deck's serverless functions (Vercel, Node 20+, CommonJS).
// Files starting with _ are not routes. Keys only ever come from process.env; nothing here reaches the browser.

const NO_CREDITS = /insufficient_quota|credit_balance_exhausted|spend_limit_exceeded|usage_limit_exceeded|billing/;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Same-origin only: the deck's own Vercel URLs, extra ones in DECK_ORIGINS (comma separated), localhost outside production.
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return req.method === 'GET'; // plain GETs (polls from the vote page) carry no Origin
  const allowed = new Set((process.env.DECK_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
  for (const k of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) if (process.env[k]) allowed.add(`https://${process.env[k]}`);
  if (allowed.has(origin)) return true;
  if (process.env.VERCEL_ENV === 'production') return false;
  // rehearsals: localhost, and phones on the same wifi opening http://<laptop-ip>:8000 (origin host = this host)
  try { if (new URL(origin).host === req.headers.host) return true; } catch (e) { return false; }
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Best-effort per-instance throttle, not a security boundary.
const hits = new Map();
function rateLimited(req, perMinute, by) {
  const now = Date.now();
  for (const [k, r] of hits) if (r.until <= now) hits.delete(k);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const key = `${req.url?.split('?')[0]}|${by || ip}`; // `by` (e.g. a voter id): venue wifi puts a whole room on one IP
  const r = hits.get(key) || { n: 0, until: now + 60000 };
  r.n += 1; hits.set(key, r);
  return r.n > perMinute;
}

async function readJson(req, maxBytes = 64 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses JSON bodies
  let size = 0, data = '';
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw new Error('too_large'); data += chunk; }
  return data ? JSON.parse(data) : {};
}

// OpenAI call that never logs or returns the message text (it can quote part of a key).
async function openai(pathname, body, timeoutMs = 20000) {
  const res = await fetch(`https://api.openai.com/v1/${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(json.error?.code || json.error?.type || res.status);
    const err = new Error(code); err.status = res.status; err.code = NO_CREDITS.test(code) ? 'no_credits' : res.status === 429 ? 'rate_limited' : 'upstream';
    console.warn(`[openai] ${pathname} ${res.status} ${code} ${json.error?.param || ''}`);
    throw err;
  }
  return json;
}

module.exports = { sendJson, originAllowed, rateLimited, readJson, openai };
