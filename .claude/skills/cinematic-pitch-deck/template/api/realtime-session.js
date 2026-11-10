// POST /api/realtime-session → { value } : a short-lived OpenAI Realtime key for ONE call. The real key stays here.
// Env: OPENAI_API_KEY (required), OPENAI_REALTIME_MODEL (default gpt-realtime-2.1), OPENAI_TRANSCRIBE_MODEL (default gpt-4o-transcribe).
const { sendJson, originAllowed, rateLimited, openai } = require('./_lib');
const persona = require('./_persona');

const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1';
const TRANSCRIBE = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
const noArgs = { type: 'object', properties: {}, additionalProperties: false };

const session = () => ({
  type: 'realtime',
  model: MODEL,
  instructions: persona.instructions,
  output_modalities: ['audio'],
  max_output_tokens: 1024,
  audio: {
    input: {
      noise_reduction: { type: 'far_field' }, // a stage mic picks up the room
      transcription: { model: TRANSCRIBE, language: persona.language || 'en', prompt: [persona.context, (persona.keywords || []).length ? `Names and words: ${persona.keywords.join(', ')}.` : ''].filter(Boolean).join(' ') },
      turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true },
    },
    output: { voice: persona.voice || 'marin' },
  },
  tools: [{ type: 'function', name: 'end_call', description: 'Hang up right after saying a closing sentence.', parameters: noArgs }],
  tool_choice: 'auto',
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'Origin not allowed', code: 'origin' });
  if (rateLimited(req, 20) || rateLimited(req, 12, 'all')) return sendJson(res, 429, { error: 'Too many requests', code: 'rate_limited' }); // per IP, and per instance overall (each call spends credits)
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: 'Voice is not configured', code: 'not_configured' });
  try {
    const data = await openai('realtime/client_secrets', { session: session() }, 8000);
    if (typeof data.value !== 'string') throw Object.assign(new Error('no token'), { code: 'upstream' });
    return sendJson(res, 200, { value: data.value, model: MODEL, name: persona.name });
  } catch (e) {
    return sendJson(res, e.code === 'rate_limited' ? 429 : 502, { error: 'Could not start the voice session', code: e.code || 'upstream' });
  }
};
