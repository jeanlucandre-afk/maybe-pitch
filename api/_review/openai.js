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
      reasoning: { effort: process.env.OPENAI_REVIEW_EFFORT || 'low' },
      instructions,
      input,
      store: false,
      max_output_tokens: 1500, // includes reasoning
      prompt_cache_key: 'maybe-sales-review',
      text: { verbosity: 'low', format: { type: 'json_schema', name, schema, strict: true } },
    }),
  });

  // This message only reaches the server log, never the screen.
  if (!response.ok) throw new Error(`OpenAI answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const body = await response.json();
  if (body.status === 'incomplete') throw new Error('OpenAI cut the answer short');

  const text = (body.output || [])
    .flatMap((item) => (item.type === 'message' ? item.content || [] : []))
    .find((part) => part.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI returned no text');

  return JSON.parse(text);
}

module.exports = { askOpenAI };
