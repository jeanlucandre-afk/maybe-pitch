// POST /api/agents-review { transcript: [{ speaker: 'presenter'|'agent', text }] }
//   → { agents: [{ id, name, says, thinks, verdict }], pros: [], cons: [], summary, provenance: 'Synthetic estimate' }
// Env: OPENAI_API_KEY (required), OPENAI_AGENTS_MODEL (default gpt-5.4-mini).
const { sendJson, originAllowed, rateLimited, readJson, openai } = require('./_lib');
const panel = require('./_agents');

const MODEL = process.env.OPENAI_AGENTS_MODEL || 'gpt-5.4-mini';
const ids = panel.agents.map((a) => a.id);
const schema = {
  type: 'object', additionalProperties: false, required: ['agents', 'pros', 'cons', 'summary'],
  properties: {
    agents: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'says', 'thinks', 'verdict'],
      properties: { id: { type: 'string', enum: ids }, says: { type: 'string' }, thinks: { type: 'string' }, verdict: { type: 'string', enum: ['yes', 'maybe', 'no'] } } } },
    pros: { type: 'array', items: { type: 'string' } },
    cons: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'Origin not allowed', code: 'origin' });
  if (rateLimited(req, 10)) return sendJson(res, 429, { error: 'Too many requests', code: 'rate_limited' });
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: 'Not configured', code: 'not_configured' });
  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: 'Bad JSON', code: 'bad_request' }); }
  const turns = (Array.isArray(body.transcript) ? body.transcript : []).slice(-60)
    .map((t) => `${t.speaker === 'agent' ? 'AI character' : 'Presenter'}: ${String(t.text || '').slice(0, 600)}`);
  if (!turns.length) return sendJson(res, 400, { error: 'Empty transcript', code: 'bad_request' });
  const prompt = `${panel.task}
You simulate this panel. Each person reacts in character, briefly, and decides on their own.
${panel.agents.map((a) => `- ${a.id}: ${a.name}; cares about ${a.cares}`).join('\n')}
Rules: "says" is one spoken sentence (max 14 words) to the room; "thinks" is one private sentence (max 12 words);
quote or point to what was actually said; never invent facts that are not in the transcript; disagree with each other where it is honest.
"pros" and "cons": 2-3 items each, max 10 words, concrete. "summary": one neutral sentence.

Transcript:
${turns.join('\n')}`;
  try {
    const r = await openai('responses', { model: MODEL, input: prompt, text: { format: { type: 'json_schema', name: 'panel', schema, strict: true } } }, 30000);
    const text = (r.output || []).flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
    const out = JSON.parse(text);
    const byId = Object.fromEntries(panel.agents.map((a) => [a.id, a]));
    out.agents = out.agents.filter((a) => byId[a.id]).map((a) => ({ ...a, name: byId[a.id].name }));
    return sendJson(res, 200, { ...out, verdictLabels: panel.verdictLabels, provenance: 'Synthetic estimate' });
  } catch (e) {
    return sendJson(res, e.code === 'rate_limited' ? 429 : 502, { error: 'Review failed', code: e.code || 'upstream' });
  }
};
