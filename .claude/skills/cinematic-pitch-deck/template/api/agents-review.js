// The simulated panel for the agent-world slide.
//   GET  /api/agents-review → the panel (names, faces, labels; no model call), so the slide can spawn at once
//   POST /api/agents-review { transcript: [{ speaker: 'presenter'|'agent', text }] }
//     → { talk: [{ id, to, says, point }], think: [{ id, thinks, verdict }], qualifications: [{ text, gap, by }],
//         crowd: { yes, maybe, no }, conclusion: { positive, summary }, provenance }
// Env: OPENAI_API_KEY (required), OPENAI_AGENTS_MODEL (default gpt-5.4-mini).
const { sendJson, originAllowed, rateLimited, readJson, openai } = require('./_lib');
const panel = require('./_agents');

const MODEL = process.env.OPENAI_AGENTS_MODEL || 'gpt-5.4-mini';
const ids = panel.agents.map((a) => a.id);
const str = { type: 'string' };
const schema = {
  type: 'object', additionalProperties: false, required: ['talk', 'think', 'qualifications', 'crowd', 'conclusion'],
  properties: {
    talk: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'to', 'says', 'point'], properties: {
      id: { type: 'string', enum: ids }, to: { type: 'string', enum: ids }, says: str,
      point: { type: 'object', additionalProperties: false, required: ['kind', 'text'], properties: { kind: { type: 'string', enum: ['pro', 'con', 'none'] }, text: str } } } } },
    think: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'thinks', 'verdict'], properties: {
      id: { type: 'string', enum: ids }, thinks: str, verdict: { type: 'string', enum: ['yes', 'maybe', 'no'] } } } },
    qualifications: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'gap', 'by'], properties: { text: str, gap: { type: 'boolean' }, by: { type: 'string', enum: ids } } } },
    crowd: { type: 'object', additionalProperties: false, required: ['yes', 'maybe', 'no'], properties: { yes: { type: 'integer' }, maybe: { type: 'integer' }, no: { type: 'integer' } } },
    conclusion: { type: 'object', additionalProperties: false, required: ['positive', 'summary'], properties: { positive: { type: 'boolean' }, summary: str } },
  },
};
const publicPanel = () => ({ agents: panel.agents.map(({ id, role, face }) => ({ id, role, face })), crowdRoles: panel.crowdRoles, candidate: panel.candidate, clusters: panel.clusters, conclusion: panel.conclusion });

module.exports = async (req, res) => {
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'Origin not allowed', code: 'origin' });
  if (req.method === 'GET') return process.env.OPENAI_API_KEY ? sendJson(res, 200, publicPanel()) : sendJson(res, 503, { code: 'not_configured' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (rateLimited(req, 10)) return sendJson(res, 429, { error: 'Too many requests', code: 'rate_limited' });
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: 'Not configured', code: 'not_configured' });
  let body;
  try { body = (await readJson(req)) || {}; } catch (e) { return sendJson(res, 400, { error: 'Bad JSON', code: 'bad_request' }); }
  const turns = (Array.isArray(body.transcript) ? body.transcript : []).filter((t) => t && typeof t === 'object' && String(t.text || '').trim()).slice(-60)
    .map((t) => `${t.speaker === 'agent' ? 'AI character' : 'Presenter'}: ${String(t.text).slice(0, 600)}`);
  if (!turns.length) return sendJson(res, 400, { error: 'Empty transcript', code: 'bad_request' });
  const prompt = `${panel.task}
You simulate this panel of people watching the call. They talk it through, then each decides alone.
${panel.agents.map((a) => `- ${a.id}: ${a.role}; cares about ${a.cares}`).join('\n')}
"talk": 6 lines, a real exchange: each line answers the previous speaker ("to"); max 12 words; refer to what was actually said.
Where a line names a concrete strength or weakness of the presenter, put it in "point" (kind pro/con, max 9 words); else kind "none" and text "".
"think": one per person, a private thought (max 11 words) and a verdict (yes = convinced, maybe = needs more proof, no = not convinced).
"qualifications": 3-4 skills the presenter showed or lacked (2-3 words each; gap = true when lacking), each with who noticed it.
"crowd": the split in percent (summing to 100) you would expect across a broad market of similar people.
"conclusion": positive if most would be convinced; summary one neutral sentence (max 24 words) with what to do next time.
Never invent facts that are not in the transcript. Disagree where it is honest.

Transcript:
${turns.join('\n')}`;
  try {
    const r = await openai('responses', { model: MODEL, input: prompt, text: { format: { type: 'json_schema', name: 'panel', schema, strict: true } } }, 30000);
    const text = (r.output || []).flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
    const out = JSON.parse(text);
    const sum = out.crowd.yes + out.crowd.maybe + out.crowd.no || 1;
    for (const k of ['yes', 'maybe', 'no']) out.crowd[k] = Math.round(out.crowd[k] / sum * 100);
    return sendJson(res, 200, { ...out, panel: publicPanel(), provenance: 'Synthetic estimate' });
  } catch (e) {
    return sendJson(res, e.code === 'rate_limited' ? 429 : 502, { error: 'Review failed', code: e.code || 'upstream' });
  }
};
