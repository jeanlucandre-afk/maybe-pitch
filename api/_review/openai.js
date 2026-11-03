// The OpenAI request, with no dependencies. The key never leaves the server.

const OPENAI_RESPONSES = 'https://api.openai.com/v1/responses';

async function askOpenAI({ name, instructions, input, schema }, signal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const response = await fetch(OPENAI_RESPONSES, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: process.env.OPENAI_REVIEW_MODEL || 'gpt-6.1-terra',
      reasoning: { effort: process.env.OPENAI_REVIEW_EFFORT || 'none' }, // measured: faster and just as accurate as low
      service_tier: process.env.OPENAI_REVIEW_TIER || 'fast', // double the price, about 0.7 s less; "default" turns it off
      instructions,
      input,
      store: false,
      max_output_tokens: 1500, // includes reasoning
      prompt_cache_key: 'maybe-sales-review',
      text: { verbosity: 'low', format: { type: 'json_schema', name, schema, strict: true } },
    }),
  });

  // This message only reaches the server log, never the screen.
  if (!response.ok) {
    const detail = (await response.text()).replace(/sk-[\w*-]+/g, '[key]').slice(0, 300);
    throw new Error(`OpenAI answered ${response.status}: ${detail}`);
  }

  const body = await response.json();
  if (body.status === 'incomplete') throw new Error('OpenAI cut the answer short');

  const text = (body.output || [])
    .flatMap((item) => (item.type === 'message' ? item.content || [] : []))
    .find((part) => part.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI returned no text');

  return JSON.parse(text);
}

module.exports = { askOpenAI };
