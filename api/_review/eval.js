// Measures with real OpenAI whether the agents get it right, and how long they take. Spends credits.
// node --env-file=.env api/_review/eval.js        one pass over the sample calls
// node --env-file=.env api/_review/eval.js 3      three passes, to see the worst time

const { reviewSalesCall } = require('./engine');
const { SAMPLE_CALLS } = require('./sample-calls');

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }
  const runs = Number(process.argv[2]) || 1;
  const times = [];
  let failures = 0;

  for (let pass = 1; pass <= runs; pass += 1) {
    for (const call of SAMPLE_CALLS) {
      const result = await reviewSalesCall({ turns: call.turns });
      const { expected } = call;
      const fact = (id) => result.facts.find((item) => item.id === id);
      const problems = [];

      if (result.totalPoints < expected.minTotal || result.totalPoints > expected.maxTotal) {
        problems.push(`total ${result.totalPoints}, expected ${expected.minTotal}-${expected.maxTotal}`);
      }
      if (result.outcome !== expected.outcome) problems.push(`outcome ${result.outcome}, expected ${expected.outcome}`);
      if (fact('stated_price').passed !== (expected.price === 'stated')) problems.push('price judged wrong');
      if (fact('no_false_promise').passed === expected.falsePromise) problems.push('false promise judged wrong');
      Object.entries(expected.ratings || {}).forEach(([agentId, allowed]) => {
        const review = result.reviews.find((item) => item.agentId === agentId);
        if (!allowed.includes(review.rating)) problems.push(`${agentId}: ${review.rating}, expected ${allowed.join('/')}`);
      });
      if (result.fallbackAgents.length) problems.push(`no AI for: ${result.fallbackAgents.join(', ')}`);

      if (call.id !== 'too_short') times.push(result.elapsedMs);
      if (problems.length) failures += 1;

      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${call.label}: ${result.totalPoints}/100, ${result.outcome}, ${(result.elapsedMs / 1000).toFixed(1)} s`);
      problems.forEach((problem) => console.log(`      - ${problem}`));
      result.reviews.forEach((review) => console.log(`      ${review.agentId} ${review.points}/${review.maxPoints}: ${review.finding}`));
    }
  }

  const sorted = [...times].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] || 0;
  console.log(`\nTime: median ${(middle / 1000).toFixed(1)} s, worst ${((sorted.at(-1) || 0) / 1000).toFixed(1)} s`);
  console.log(failures ? `${failures} calls with problems` : 'All calls came out as a sales professional would expect');
  process.exit(failures ? 1 : 0);
}

main();
