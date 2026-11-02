// Measures with real OpenAI whether the agents get it right, and how long they take. Spends credits.
// node --env-file=.env api/_review/eval.js        one pass over the sample calls
// node --env-file=.env api/_review/eval.js 3      three passes, to see the worst time
// --only=solid,pushy   only those calls
// --pair               also one call twice, changing only the final answer: the score must not move
// --cap=3              stops before the spend could pass this many dollars (1 by default)
// --ledger=file        keeps the spend between runs, so the cap covers all of them
// --out=file           saves what the AI answered, to read it afterwards

const fs = require('node:fs');
const { reviewSalesCall } = require('./engine');
const { OUTCOME_PAIR, SAMPLE_CALLS } = require('./sample-calls');

// Dollars per million tokens, from OpenAI's pricing page on 2026-11-02.
const PRICES = {
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
};
const CACHE_WRITE_FACTOR = 1.25;
const WORST_INPUT_TOKENS = 3000;
const WORST_OUTPUT_TOKENS = 1500;
const REQUESTS_PER_CALL = 14; // seven, and at worst a backup for each
const WORST_TIER_FACTOR = 2; // Fast mode
const PAIR_TOLERANCE = 10; // two AI readings of one call differ a little, even with no outcome involved

function worstCost(price) {
  return (WORST_TIER_FACTOR * (WORST_INPUT_TOKENS * price.input * CACHE_WRITE_FACTOR + WORST_OUTPUT_TOKENS * price.output)) / 1e6;
}

function costOf(price, usage) {
  const details = usage.input_tokens_details || {};
  const cached = details.cached_tokens || 0;
  // If OpenAI does not report what was written to its cache, assume everything uncached was.
  const written = details.cache_write_tokens ?? usage.cache_write_tokens ?? usage.input_tokens - cached;
  const plain = usage.input_tokens - cached - written;
  return (plain * price.input + written * price.input * CACHE_WRITE_FACTOR + cached * price.cached + usage.output_tokens * price.output) / 1e6;
}

// Watches the requests without touching them. Only the answer is kept, never the headers.
function watchRequests(price) {
  const realFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const started = Date.now();
    const { text, input } = JSON.parse(init.body);
    const area = /review: ([^.]+)\./.exec(input)?.[1] || 'Facts';
    const record = { area, format: text.format.name, costUsd: worstCost(price) }; // counted as worst case until it answers
    requests.push(record);
    const response = await realFetch(url, init);
    const body = await response.clone().json().catch(() => null);
    record.ms = Date.now() - started;
    record.status = response.status;
    if (body?.usage) {
      record.usage = body.usage;
      record.tier = body.service_tier;
      // Fast mode costs double. If OpenAI downgrades a request it reports "default" and charges the normal rate.
      record.costUsd = costOf(price, body.usage) * (['fast', 'priority'].includes(body.service_tier) ? 2 : 1);
    }
    record.outputText = (body?.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text;
    return response;
  };
  return requests;
}

async function review(turns) {
  const started = Date.now();
  let firstCardMs = null;
  const result = await reviewSalesCall({
    turns,
    onReview: () => { if (firstCardMs === null) firstCardMs = Date.now() - started; },
  });
  return { result, firstCardMs };
}

function problemsWith(result, expected) {
  const fact = (id) => result.facts.find((item) => item.id === id);
  const problems = [];
  if (result.totalPoints < expected.minTotal || result.totalPoints > expected.maxTotal) {
    problems.push(`total ${result.totalPoints}, expected ${expected.minTotal}-${expected.maxTotal}`);
  }
  if (result.outcome !== expected.outcome) problems.push(`outcome ${result.outcome}, expected ${expected.outcome}`);
  if (fact('stated_price').passed !== (expected.price === 'stated')) problems.push('price judged wrong');
  if (fact('no_false_promise').passed === expected.falsePromise) problems.push('false promise judged wrong');
  Object.entries(expected.ratings || {}).forEach(([agentId, allowed]) => {
    const card = result.reviews.find((item) => item.agentId === agentId);
    if (!allowed.includes(card.rating)) problems.push(`${agentId}: ${card.rating}, expected ${allowed.join('/')}`);
  });
  if (result.fallbackAgents.length) problems.push(`no AI for: ${result.fallbackAgents.join(', ')}`);
  return problems;
}

const STATUS_MARK = { met: 'M', partial: 'p', missed: 'x', not_applicable: '-' };

function printCall(label, problems, { result, firstCardMs }) {
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label}: ${result.totalPoints}/100, ${result.outcome}, first card ${(firstCardMs / 1000).toFixed(1)} s, all ${(result.elapsedMs / 1000).toFixed(1)} s`);
  problems.forEach((problem) => console.log(`      - ${problem}`));
  result.reviews.forEach((card) => {
    const marks = card.checks.map((item) => STATUS_MARK[item.status]).join('');
    console.log(`      ${card.agentId} ${card.points}/${card.maxPoints} [${marks}]: ${card.finding}`);
  });
}

function summary(name, values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] || 0;
  console.log(`${name}: median ${(middle / 1000).toFixed(1)} s, worst ${((sorted.at(-1) || 0) / 1000).toFixed(1)} s (${sorted.length})`);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const runs = Number(args.find((arg) => /^\d+$/.test(arg))) || 1;
  const only = option('only')?.split(',');
  const pair = args.includes('--pair');
  const cap = Number(option('cap')) || 1;
  const ledger = option('ledger');
  const out = option('out');

  const model = process.env.OPENAI_REVIEW_MODEL || 'gpt-6.1-terra';
  const price = PRICES[model];
  if (!price) {
    console.error(`No price known for ${model}: add it to PRICES before spending.`);
    process.exit(1);
  }

  const spentBefore = ledger && fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')).spentUsd : 0;
  const requests = watchRequests(price);
  const spentNow = () => requests.reduce((sum, item) => sum + item.costUsd, 0);
  const saveSpend = () => { if (ledger) fs.writeFileSync(ledger, JSON.stringify({ spentUsd: spentBefore + spentNow() })); };
  const affordable = () => spentBefore + spentNow() + REQUESTS_PER_CALL * worstCost(price) <= cap;

  console.log(`Model ${model}, effort ${process.env.OPENAI_REVIEW_EFFORT || 'default'}, tier ${process.env.OPENAI_REVIEW_TIER || 'default'}. Spent so far $${spentBefore.toFixed(3)} of $${cap}.`);

  const calls = SAMPLE_CALLS.filter((call) => !only || only.includes(call.id));
  const dump = [];
  const allTimes = [];
  const firstCardTimes = [];
  const firstPassTimes = [];
  let failures = 0;
  let stopped = false;

  const run = async (id, label, turns, pass, checkResult) => {
    if (!affordable()) {
      stopped = true;
      return null;
    }
    const seen = requests.length;
    const answer = await review(turns);
    const problems = checkResult(answer.result);
    if (problems.length) failures += 1;
    printCall(label, problems, answer);
    if (id !== 'too_short') {
      allTimes.push(answer.result.elapsedMs);
      firstCardTimes.push(answer.firstCardMs);
      if (pass === 1) firstPassTimes.push(answer.result.elapsedMs);
    }
    dump.push({ pass, id, problems, firstCardMs: answer.firstCardMs, result: answer.result, requests: requests.slice(seen) });
    saveSpend();
    return answer.result;
  };

  for (let pass = 1; pass <= runs && !stopped; pass += 1) {
    for (const call of calls) {
      await run(call.id, call.label, call.turns, pass, (result) => problemsWith(result, call.expected));
      if (stopped) break;
    }
    if (pair && !stopped) {
      const noProblems = (result) => (result.fallbackAgents.length ? [`no AI for: ${result.fallbackAgents.join(', ')}`] : []);
      const sale = await run('pair_sale', 'Pair, customer buys', OUTCOME_PAIR.sale, pass, noProblems);
      const noSale = await run('pair_no_sale', 'Pair, customer declines', OUTCOME_PAIR.noSale, pass, noProblems);
      if (sale && noSale) {
        const gap = sale.totalPoints - noSale.totalPoints;
        const moved = Math.abs(gap) > PAIR_TOLERANCE;
        if (moved) failures += 1;
        console.log(`${moved ? 'FAIL' : 'ok  '} Closing the sale moved the score by ${gap} points (tolerance ${PAIR_TOLERANCE})`);
      }
    }
  }

  const used = requests.filter((item) => item.usage);
  const average = (pick) => (used.length ? Math.round(used.reduce((sum, item) => sum + pick(item.usage), 0) / used.length) : 0);
  console.log('');
  summary('Time to all cards', allTimes);
  summary('Time to first card', firstCardTimes);
  summary('Time to all cards, first pass only', firstPassTimes);
  summary('One request', used.map((item) => item.ms));
  console.log(`Per request: input ${average((u) => u.input_tokens)} (cached ${average((u) => u.input_tokens_details?.cached_tokens || 0)}), output ${average((u) => u.output_tokens)} (reasoning ${average((u) => u.output_tokens_details?.reasoning_tokens || 0)})`);
  const tiers = [...new Set(used.map((item) => item.tier))].join(', ');
  console.log(`Spent this run $${spentNow().toFixed(3)} in ${requests.length} requests, served as: ${tiers}; total $${(spentBefore + spentNow()).toFixed(3)} of $${cap}.`);
  if (stopped) console.log('STOPPED: the next call could have gone over the cap.');
  if (out) fs.writeFileSync(out, JSON.stringify(dump, null, 1));
  console.log(failures ? `${failures} calls with problems` : 'All calls came out as a sales professional would expect');
  process.exit(failures || stopped ? 1 : 0);
}

main();
