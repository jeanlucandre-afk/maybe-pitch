// The review engine. All agents run at once and none goes past the deadline: whichever does not
// answer in time is covered by the local fallback. The AI gives its view check by check, but the
// quotes, the points and the result are decided here, so every review follows the same rules.

const { clampWords, countWords, verifyQuote } = require('./evidence');
const { askOpenAI } = require('./openai');
const { CHECK_VALUE, COACH_RULES, RATING_THRESHOLDS, REVIEW_LIMITS, SALES_CHECKS, SALES_PANEL } = require('./rubric');
const { isQuestion, ruleAgent, ruleAudit } = require('./rules');
const { activeScenario } = require('./scenario');

const DEFAULT_DEADLINE_MS = 7000;
const MIN_CANDIDATE_WORDS = 12; // below this there is nothing to assess, so no AI is spent
const MUST_NOT_FAIL = ['discovery', 'next_step', 'integrity'];
const pointsOf = (agentId) => SALES_PANEL.find((agent) => agent.id === agentId).points;

// ---------- Call context ----------

function callMetrics(turns) {
  const student = turns.filter((turn) => turn.speaker === 'candidate');
  const candidateWords = student.reduce((sum, turn) => sum + countWords(turn.text), 0);
  const prospectWords = turns.reduce((sum, turn) => sum + (turn.speaker === 'prospect' ? countWords(turn.text) : 0), 0);
  const total = candidateWords + prospectWords;
  return {
    durationMs: turns.length ? Math.max(...turns.map((turn) => turn.atMs)) : 0,
    candidateWords,
    prospectWords,
    candidateTalkShare: total ? Math.round((candidateWords / total) * 100) : 0,
    questionsAsked: student.flatMap((turn) => turn.text.match(/[^.?!]+[.?!]*/g) || []).filter(isQuestion).length,
    longestCandidateTurnWords: Math.max(0, ...student.map((turn) => countWords(turn.text))),
  };
}

function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildContext(turns, scenario) {
  const lines = turns.map((turn) => {
    const who = turn.speaker === 'candidate' ? 'STUDENT' : 'CUSTOMER';
    // Without angle brackets, nobody can close the transcript block from inside the call.
    return `${turn.id} [${clock(turn.atMs)}] ${who}: ${turn.text.replace(/[<>]/g, ' ')}`;
  });
  return {
    turns,
    scenario,
    metrics: callMetrics(turns),
    transcript: `<transcript>\n${lines.join('\n')}\n</transcript>`,
    instructions: `${COACH_RULES}\n\n${scenario.brief}`,
  };
}

// ---------- What the AI is asked ----------

const nullableText = { type: ['string', 'null'] };

function agentSchema(agent) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['checks', 'finding', 'suggestion'],
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'status', 'turnId', 'quote'],
          properties: {
            id: { type: 'string', enum: SALES_CHECKS[agent.id].map((item) => item.id) },
            status: { type: 'string', enum: ['met', 'partial', 'missed', 'not_applicable'] },
            turnId: nullableText,
            quote: nullableText,
          },
        },
      },
      finding: { type: 'string' },
      suggestion: { type: 'string' },
    },
  };
}

function claimSchema(extra) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...Object.keys(extra), 'turnId', 'quote'],
    properties: { ...extra, turnId: nullableText, quote: nullableText },
  };
}

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'outcomeTurnId', 'outcomeQuote', 'askedProblem', 'price', 'nextStep', 'falsePromise'],
  properties: {
    outcome: { type: 'string', enum: ['sale_agreed', 'no_agreement'] },
    outcomeTurnId: nullableText,
    outcomeQuote: nullableText,
    askedProblem: claimSchema({ passed: { type: 'boolean' } }),
    price: claimSchema({ status: { type: 'string', enum: ['stated', 'unclear', 'not_stated'] } }),
    nextStep: claimSchema({ passed: { type: 'boolean' } }),
    falsePromise: claimSchema({ found: { type: 'boolean' } }),
  },
};

function metricsText(metrics) {
  return `# Call metrics, measured by software. Trust them over your own counting.
Student talk share: ${metrics.candidateTalkShare}%. Student questions: ${metrics.questionsAsked}. Longest student turn: ${metrics.longestCandidateTurnWords} words.`;
}

function agentInput(agent, ctx) {
  const checks = SALES_CHECKS[agent.id]
    .map((item) => {
      const cite = item.faultOnly ? 'quote only if it fails' : `cite the ${item.citeFrom === 'candidate' ? 'student' : 'customer'}`;
      return `- ${item.id} (${cite}): ${item.test}`;
    })
    .join('\n');
  return `# Your area in this review: ${agent.label}. ${agent.question}
Assess every one of these checks and nothing else:
${checks}

${metricsText(ctx.metrics)}

# The conversation
${ctx.transcript}`;
}

function auditInput(ctx) {
  return `# Your task in this review: fact-check the conversation. Do not coach; only establish what happened.
- outcome: decided only by the customer's explicit words, never by a friendly tone. If they changed their mind, the last position counts. sale_agreed needs a clear yes to buying; "sounds interesting" is not agreement. Otherwise no_agreement. Quote the customer's deciding words.
- askedProblem: the student asked about the customer's situation or need. Quote the question.
- price: stated: the student gave one clear price, in digits or in words. unclear: they contradicted themselves or changed it for no reason. not_stated: never mentioned. Quote the student.
- nextStep: the student explicitly asked the customer to buy. "Let me know" does not count. Quote the student.
- falsePromise: the student claimed what the product cannot deliver: cures, guarantees, invented studies or numbers. Saying it is quick, filling or gives energy is not a false promise. Quote the student.

${metricsText(ctx.metrics)}

# The conversation
${ctx.transcript}`;
}

const isAgentOutput = (raw) => Boolean(raw && Array.isArray(raw.checks) && typeof raw.finding === 'string' && typeof raw.suggestion === 'string');
const isAudit = (raw) => Boolean(raw && raw.outcome && raw.askedProblem && raw.price && raw.nextStep && raw.falsePromise);

// ---------- Verification: nothing is taken as true without a real quote ----------

function verifyAudit(raw, turns) {
  const student = (item) => verifyQuote(turns, item.quote, { turnId: item.turnId, speaker: 'candidate' });
  const outcomeEvidence = verifyQuote(turns, raw.outcomeQuote, { turnId: raw.outcomeTurnId, speaker: 'prospect' });
  const priceEvidence = raw.price.status === 'not_stated' ? null : student(raw.price);
  return {
    // The outcome must be explicit: without the customer's own words, there was no agreement.
    outcome: outcomeEvidence ? raw.outcome : 'no_agreement',
    outcomeEvidence,
    askedProblem: raw.askedProblem.passed ? student(raw.askedProblem) : null,
    price: { status: priceEvidence ? raw.price.status : 'not_stated', evidence: priceEvidence },
    nextStep: raw.nextStep.passed ? student(raw.nextStep) : null,
    falsePromise: raw.falsePromise.found ? student(raw.falsePromise) : null,
  };
}

function verifyCheck(definition, raw, ctx) {
  let status = raw ? raw.status : definition.faultOnly ? 'met' : 'missed';
  let evidence = verifyQuote(ctx.turns, raw && raw.quote, { turnId: raw && raw.turnId, speaker: definition.citeFrom });

  if (status === 'not_applicable' && !definition.canBeNotApplicable) status = 'missed';
  if (definition.faultOnly) {
    // Nobody is accused without a real quote.
    if ((status === 'missed' || status === 'partial') && !evidence) status = 'met';
    if (status === 'met') evidence = null;
  } else if ((status === 'met' || status === 'partial') && !evidence) {
    // No evidence, no credit.
    status = 'missed';
  }
  if (status === 'not_applicable') evidence = null;

  return { id: definition.id, label: definition.label, status, evidence };
}

function talkBalance({ candidateTalkShare: share, longestCandidateTurnWords: longest }) {
  // The AI customer answers in short sentences, so talking a little over half is normal.
  if (share <= 70 && longest <= 70) return 'met';
  if (share <= 85 && longest <= 100) return 'partial';
  return 'missed';
}

// What can be checked against facts outweighs an agent's opinion. If an agent approved something
// the facts contradict, the fact wins and the card says so.
function applyFacts(check, audit, ctx) {
  switch (check.id) {
    case 'balanced_talk': {
      const status = talkBalance(ctx.metrics);
      if (status === 'met') return { ...check, status };
      const longest = ctx.turns
        .filter((turn) => turn.speaker === 'candidate')
        .reduce((a, b) => (countWords(b.text) > countWords(a.text) ? b : a));
      return { ...check, status, evidence: verifyQuote(ctx.turns, clampWords(longest.text, 15), { turnId: longest.id, speaker: 'candidate' }) };
    }
    case 'open_questions':
    case 'found_real_problem':
      return audit.askedProblem ? check : { ...check, status: 'missed', evidence: null };
    case 'asked_next_step':
      return audit.nextStep ? check : { ...check, status: 'missed', evidence: null };
    case 'explicit_agreement':
      return audit.outcome === 'sale_agreed'
        ? { ...check, status: 'met', evidence: audit.outcomeEvidence }
        : { ...check, status: 'missed', evidence: null };
    case 'accurate_terms':
      if (audit.price.status === 'unclear') return { ...check, status: 'missed', evidence: audit.price.evidence };
      if (audit.price.status === 'stated') return { ...check, status: 'met', evidence: audit.price.evidence };
      return { ...check, status: 'not_applicable', evidence: null };
    case 'no_unsupported_claims':
      return audit.falsePromise ? { ...check, status: 'missed', evidence: audit.falsePromise } : check;
    default:
      return check;
  }
}

// ---------- Points ----------

function ratingFor(share) {
  if (share >= RATING_THRESHOLDS.strong) return 'strong';
  if (share >= RATING_THRESHOLDS.ok) return 'ok';
  return 'needs_work';
}

function pointsFor(agentId, checks) {
  const scored = checks.filter((check) => check.status !== 'not_applicable');
  if (scored.length === 0) return { points: 0, maxPoints: 0, rating: 'ok' };
  const share = scored.reduce((sum, check) => sum + CHECK_VALUE[check.status], 0) / scored.length;
  const weight = pointsOf(agentId);
  return { points: Math.round(weight * share), maxPoints: weight, rating: ratingFor(share) };
}

function evidenceFor(checks, rating) {
  // The card first quotes what explains its rating.
  const order = rating === 'needs_work' ? ['missed', 'partial', 'met'] : ['met', 'partial', 'missed'];
  const evidence = order.flatMap((status) => checks.filter((check) => check.status === status && check.evidence).map((check) => check.evidence));
  const seen = new Set();
  return evidence.filter((item) => !seen.has(item.quote) && seen.add(item.quote)).slice(0, 3);
}

function finalizeReview(agent, raw, audit, ctx, source) {
  const definitions = SALES_CHECKS[agent.id];
  const opinions = definitions.map((definition) => verifyCheck(definition, raw.checks.find((check) => check.id === definition.id), ctx));
  const checks = opinions.map((check) => applyFacts(check, audit, ctx));
  const { points, maxPoints, rating } = pointsFor(agent.id, checks);

  const weakest = checks.find((check) => check.status === 'missed') || checks.find((check) => check.status === 'partial');
  const tipOf = (check) => definitions.find((definition) => definition.id === (check && check.id))?.tip;
  // Talk time is always measured by the code, so it contradicts nobody.
  const overruled = checks.find(
    (check, index) => check.id !== 'balanced_talk' && check.status === 'missed' && (opinions[index].status === 'met' || opinions[index].status === 'partial'),
  );

  let { finding, suggestion } = raw;
  if (source === 'ai' && overruled) {
    finding = `Fact check: "${overruled.label}" did not hold up in this conversation.`;
    suggestion = tipOf(overruled) || suggestion;
  }
  if (!finding.trim() || !suggestion.trim()) {
    const met = checks.filter((check) => check.status === 'met').length;
    const scored = checks.filter((check) => check.status !== 'not_applicable').length;
    if (maxPoints === 0) finding = 'Not scored: nothing came up in this conversation to assess here.';
    else if (weakest) finding = `Quick check: ${met} of ${scored} points met; weakest was "${weakest.label}".`;
    else finding = `Quick check: all ${scored} points met.`;
    suggestion = tipOf(weakest) || 'Keep doing this on your next call.';
  }

  return {
    agentId: agent.id,
    status: 'done',
    rating,
    finding: clampWords(finding, REVIEW_LIMITS.findingMaxWords),
    suggestion: clampWords(suggestion, REVIEW_LIMITS.suggestionMaxWords),
    evidence: evidenceFor(checks, rating),
    checks,
    points,
    maxPoints,
    provenance: source === 'ai' ? 'AI review' : 'Rule-based',
  };
}

// A call with no content: nothing to reward and nothing to accuse anyone of.
function emptyReview(agent) {
  const notApplicable = agent.id === 'integrity';
  return {
    agentId: agent.id,
    status: 'done',
    rating: notApplicable ? 'ok' : 'needs_work',
    finding: 'The conversation ended before there was enough to assess.',
    suggestion: "Stay in the conversation and ask about the customer's situation.",
    evidence: [],
    checks: SALES_CHECKS[agent.id].map((definition) => ({
      id: definition.id,
      label: definition.label,
      status: notApplicable ? 'not_applicable' : 'missed',
      evidence: null,
    })),
    points: 0,
    maxPoints: notApplicable ? 0 : agent.points,
    provenance: 'Rule-based',
  };
}

function factsFrom(audit, provenance) {
  const fact = (id, label, passed, evidence) => ({ id, label, passed, evidence: evidence || undefined, provenance });
  return [
    fact('asked_problem', "Asked about the customer's need", Boolean(audit.askedProblem), audit.askedProblem),
    fact('stated_price', 'Stated a clear price', audit.price.status === 'stated', audit.price.evidence),
    fact('next_step', 'Asked for the sale', Boolean(audit.nextStep), audit.nextStep),
    fact('no_false_promise', 'Made no unsupported promises', !audit.falsePromise, audit.falsePromise),
  ];
}

function buildResult(reviews, audit, ctx, startedAt, fallbackAgents) {
  const scored = reviews.filter((review) => review.maxPoints > 0);
  const earned = scored.reduce((sum, review) => sum + review.points, 0);
  const possible = scored.reduce((sum, review) => sum + review.maxPoints, 0);
  const totalPoints = possible ? Math.round((earned / possible) * 100) : 0;

  const label = (agentId) => SALES_PANEL.find((agent) => agent.id === agentId).label;
  const share = (review) => review.points / (review.maxPoints || 1);
  const byShare = [...scored].sort((a, b) => share(b) - share(a));
  const byLoss = [...scored].sort((a, b) => b.maxPoints - b.points - (a.maxPoints - a.points));

  // The first thing a sales manager would say: a false promise comes before any technique.
  const integrity = reviews.find((review) => review.agentId === 'integrity');
  const best = byShare[0];
  const worst = integrity && integrity.rating === 'needs_work' ? integrity : byLoss[0];

  // No strong call without understanding the customer, asking for the sale, or with false promises.
  const capped = reviews.some((review) => MUST_NOT_FAIL.includes(review.agentId) && review.rating === 'needs_work');
  const totalRating = ratingFor(totalPoints / 100);

  return {
    totalPoints,
    rating: capped && totalRating === 'strong' ? 'ok' : totalRating,
    provenance: fallbackAgents.length === 0 ? 'AI review' : fallbackAgents.length >= reviews.length ? 'Rule-based' : 'AI review and rule-based',
    outcome: audit.outcome, // simulated, and always shown apart from the score
    outcomeEvidence: audit.outcomeEvidence,
    facts: factsFrom(audit, fallbackAgents.includes('facts') ? 'Rule-based' : 'AI review'),
    reviews,
    strongest: best && share(best) >= 0.5 ? { agentId: best.agentId, label: label(best.agentId) } : null,
    focus: worst && share(worst) < 0.9 ? { agentId: worst.agentId, label: label(worst.agentId), suggestion: worst.suggestion } : null,
    metrics: ctx.metrics,
    elapsedMs: Date.now() - startedAt,
    fallbackAgents,
  };
}

// ---------- The engine ----------

// Guarantees the limit even if the request hangs and ignores the signal.
function withinDeadline(work, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(new Error('deadline'));
    signal.addEventListener('abort', () => reject(new Error('deadline')), { once: true });
    work.then(resolve, reject);
  });
}

async function reviewSalesCall({ turns, scenario = activeScenario, ask = askOpenAI, deadlineMs, onReview }) {
  const startedAt = Date.now();
  const ctx = buildContext(turns, scenario);
  const limit = deadlineMs || Number(process.env.OPENAI_REVIEW_DEADLINE_MS) || DEFAULT_DEADLINE_MS;

  if (ctx.metrics.candidateWords < MIN_CANDIDATE_WORDS) {
    const reviews = SALES_PANEL.map(emptyReview);
    reviews.forEach((review) => onReview && onReview(review));
    return buildResult(reviews, verifyAudit(ruleAudit(ctx), turns), ctx, startedAt, []);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);
  const fallbackAgents = [];

  const fallBack = (who, error) => {
    fallbackAgents.push(who);
    console.warn(`[review] ${who} used local rules: ${error instanceof Error ? error.message : error}`);
  };

  // One promise, so even the first agent to finish already respects the facts.
  const rawAudit = withinDeadline(
    ask({ name: 'sales_call_facts', instructions: ctx.instructions, input: auditInput(ctx), schema: AUDIT_SCHEMA }, controller.signal),
    controller.signal,
  )
    .then((raw) => {
      if (!isAudit(raw)) throw new Error('invalid answer');
      return raw;
    })
    .catch((error) => {
      fallBack('facts', error);
      return ruleAudit(ctx);
    });
  const audit = rawAudit.then((raw) => verifyAudit(raw, turns));

  const reviews = await Promise.all(
    SALES_PANEL.map(async (agent) => {
      let raw = null;
      try {
        const answer = await withinDeadline(
          ask({ name: 'sales_agent_review', instructions: ctx.instructions, input: agentInput(agent, ctx), schema: agentSchema(agent) }, controller.signal),
          controller.signal,
        );
        if (!isAgentOutput(answer)) throw new Error('invalid answer');
        raw = answer;
      } catch (error) {
        fallBack(agent.id, error);
      }
      const review = finalizeReview(agent, raw || ruleAgent(agent.id, ctx, await rawAudit), await audit, ctx, raw ? 'ai' : 'rules');
      if (onReview) onReview(review);
      return review;
    }),
  );

  clearTimeout(timer);
  return buildResult(reviews, await audit, ctx, startedAt, fallbackAgents);
}

module.exports = { reviewSalesCall };
