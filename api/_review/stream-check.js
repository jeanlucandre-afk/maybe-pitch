// Checks that the review really arrives in parts at a deployed URL. Spends one review of credits there.
// node api/_review/stream-check.js https://your-preview.vercel.app

const { SAMPLE_CALLS } = require('./sample-calls');

const MIN_SPREAD_MS = 100; // below this the cards arrived together, so it proves nothing either way

async function main() {
  const base = (process.argv[2] || '').replace(/\/$/, '');
  if (!base) {
    console.error('Usage: node api/_review/stream-check.js https://your-preview.vercel.app');
    process.exit(1);
  }

  const started = Date.now();
  const since = () => Date.now() - started;
  const response = await fetch(`${base}/api/review-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ turns: SAMPLE_CALLS.find((call) => call.id === 'solid').turns }),
  });
  const encoding = response.headers.get('content-encoding') || 'none';
  console.log(`HTTP ${response.status} after ${since()} ms, type ${response.headers.get('content-type')}, compression ${encoding}`);
  if (!response.ok) {
    console.log((await response.text()).slice(0, 300));
    process.exit(1);
  }

  const events = [];
  let reads = 0;
  let buffer = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    reads += 1;
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.filter((line) => line.trim()).forEach((line) => {
      const event = JSON.parse(line);
      events.push({ ...event, atMs: since() });
      const name = event.type === 'review' ? `${event.review.agentId} (${event.review.provenance})` : event.type;
      console.log(`  ${String(since()).padStart(5)} ms  ${name}`);
    });
  }

  const cards = events.filter((event) => event.type === 'review');
  const result = events.find((event) => event.type === 'result')?.result;
  const spread = cards.length ? cards.at(-1).atMs - cards[0].atMs : 0;
  console.log(`${cards.length} cards in ${reads} network reads; first to last ${spread} ms; server time ${result?.elapsedMs} ms`);

  if (!result) console.log('FAILED: no result arrived.');
  else if (result.fallbackAgents.length) console.log(`INCONCLUSIVE: no AI for ${result.fallbackAgents.join(', ')}. Is OPENAI_API_KEY set there?`);
  else if (reads === 1) console.log('BUFFERED: everything arrived at once.');
  else if (spread < MIN_SPREAD_MS) console.log('INCONCLUSIVE: the cards happened to finish together. Run it again.');
  else console.log('IN PARTS: each card arrived when it was ready.');
}

main();
