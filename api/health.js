// Smoke test for Vercel functions: GET /api/health -> {"ok":true}
module.exports = (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
};
