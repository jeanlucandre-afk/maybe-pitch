// GET /api/health → which live features are configured (names only, never values). Used by tools/check.mjs and the slides.
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, openai: !!process.env.OPENAI_API_KEY, pollStore: !!((process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)) }));
};
