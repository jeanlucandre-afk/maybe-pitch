// Receives the transcript and sends each agent's opinion as soon as it is ready.
// Every line of the response is one JSON event: the cards and, at the end, the result.

const { reviewSalesCall } = require('./_review/engine');

const MAX_TURNS = 200;
const MAX_TURN_LENGTH = 2000;
const MAX_PER_MINUTE = 10;

// Best-effort per-instance throttle, not a distributed security boundary.
const requests = new Map();

function originAllowed(origin) {
  const allowed = new Set(['https://maybe-pitch.vercel.app']);
  for (const name of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    if (process.env[name]) allowed.add(`https://${process.env[name]}`);
  }
  if (allowed.has(origin)) return true;
  return process.env.VERCEL_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
}

function tooManyRequests(req) {
  const now = Date.now();
  for (const [ip, record] of requests) if (record.until <= now) requests.delete(ip);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const record = requests.get(ip) || { count: 0, until: now + 60000 };
  record.count += 1;
  requests.set(ip, record);
  return record.count > MAX_PER_MINUTE;
}

function parseTurns(value) {
  if (!Array.isArray(value) || value.length > MAX_TURNS) return null;
  const valid = value.every(
    (turn) =>
      typeof turn?.id === 'string' &&
      (turn.speaker === 'candidate' || turn.speaker === 'prospect') &&
      typeof turn.text === 'string' &&
      turn.text.length <= MAX_TURN_LENGTH &&
      typeof turn.atMs === 'number',
  );
  return valid ? value : null;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!originAllowed(req.headers.origin)) return sendJson(res, 403, { error: 'Origin not allowed' });
  if (tooManyRequests(req)) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });

  let body = null;
  try {
    // On Vercel, reading req.body throws if the JSON is invalid.
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) { /* answered below as a bad request */ }
  const turns = parseTurns(body?.turns);
  if (!turns) return sendJson(res, 400, { error: 'Send { turns: [...] }' });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson');
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);
  try {
    const result = await reviewSalesCall({ turns, onReview: (review) => send({ type: 'review', review }) });
    send({ type: 'result', result });
  } catch (error) {
    console.error('[review] failed', error);
    send({ type: 'error', message: 'The review could not finish.' });
  }
  res.end();
};
