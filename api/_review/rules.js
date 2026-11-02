// The local fallback: if the AI does not answer in time, this answers at once so the demo never
// stops. It is simpler and more cautious than the AI, and it is labelled "Rule-based".

const { SALES_CHECKS } = require('./rubric');

const QUESTION = /\?\s*$|^(how|what|why|when|who|where|which|do|does|did|are|is|have|has|can|could|would|tell me|walk me)\b/i;
const OPEN_QUESTION = /^(how|what|why|tell me|walk me)\b/i;
const NEED_QUESTION = /\b(eat|eaten|hungry|lunch|food|how are you|how's it going|how is it going|long day)\b/i;
const EMPATHY = /\b(makes sense|i understand|i hear you|i get it|i see|that sounds|sorry to|must be|i'll be quick|long day)\b/i;
const OBJECTION = /\b(why would|pizza|something else|why a banana|too expensive|too much|not sure|don't need)\b/i;
const ASK_SALE = /\b(would you like|do you want|want to|wanna|will you|can i|could i|shall we|how about|ready to|buy|take)\b.*\b(buy|banana|one|it)\b/i;
const CONCRETE = /\b(right now|right here|here you go|i have it here|cash|card|pay)\b|[€$]\s?\d/i;
const FALSE_PROMISE = /\bguarantee[sd]?\b|\b100\s?(%|percent)\b|\bcures?\b|\bnever be hungry\b|\bwin the hackathon\b|\bstudies show\b/i;
const PRESSURE = /\b(today only|last chance|right now or|have to decide|must decide|offer ends|you'd be crazy|you'll regret)\b/i;
const STATED_PRICE = /[€$]\s?\d|\b\d+(?:[.,]\d+)?\s*(?:euros?|cents?|dollars?|bucks)\b|\b(?:a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(?:euros?|cents?|dollars?|bucks)\b/i;

// A sale needs an explicit acceptance. Loose words such as "sold" or "deal" also appear in "not sold yet" and "no deal".
const WILL_BUY = /\bi(?:'ll| will) (?:take|buy|have) (?:(?:the|a|that|this|your) banana\b|(?:it|one|(?:that|this)(?: one)?)(?:[, ]+(?:then|please|now|thanks|thank you|bye|goodbye))*[.!]*$)/i;
const UNSURE = /\b(?:no|not|never|maybe|perhaps|might|if|unless|when|once|after|later|tomorrow|doubt)\b|n't\b|\?\s*$/i;
const SAID_YES = /^(?:(?:okay|ok|alright|all right|fine|yes|yeah|yep|sure),? )*(?:give me (?:one|a banana|the banana)|(?:(?:it's|that's|you've got|you got) a )?deal|(?:i'm )?sold|you sold me)(?:,? (?:then|please|thanks|thank you))*[.!]*$/i;

// What counts as a no must reach further than a yes: the last position wins, so a no it misses would leave an earlier yes standing.
const SAID_NO = /^(?:(?:sorry|well|hmm|uh|um|actually),? )*(?:no|nope|nah|i'm good)(?:,? (?:sorry|thanks|thank you))*[.!]*$/i;
const REFUSED = /\b(not interested|no,? thanks|no,? thank you|i(?:'ll| will) pass|grab something later|think about it|actually,? no|not right now|not today|not now|maybe later|no deal|no sale|no way|not a deal|(?:not|\w+n't) sold|i won't|(?:won't|will not|wouldn't|would not|can't|cannot|never|not|not going to|not gonna|don't want to|do not want to)(?: \w+)? (?:take|taking|buy|buying|pay|paying)|don't (?:want|need) (?:it|one|that|this|a banana|the banana|any)|i(?:'ll| will) (?:have|get|take|grab) (?:\w+ )?pizza|changed my mind|forget it|never mind|not for me)\b/i;

const saidNo = (text) => REFUSED.test(text) || SAID_NO.test(text);
const saidYes = (text) => SAID_YES.test(text) || (WILL_BUY.test(text) && !UNSURE.test(text));

function sentences(ctx, speaker) {
  return ctx.turns
    .filter((turn) => turn.speaker === speaker)
    .flatMap((turn) => (turn.text.match(/[^.?!]+[.?!]*/g) || []).map((text) => ({ turn, text: text.trim() })));
}

const isQuestion = (sentence) => QUESTION.test(sentence.trim());

const cited = (id, status, found) => ({ id, status, turnId: found ? found.turn.id : null, quote: found ? found.text : null });

const claim = (found, extra) => ({ ...extra, turnId: found ? found.turn.id : null, quote: found ? found.text : null });

function ruleAudit(ctx) {
  const student = sentences(ctx, 'candidate');
  const question = student.find((item) => isQuestion(item.text) && NEED_QUESTION.test(item.text))
    || student.find((item) => isQuestion(item.text));
  const ask = student.find((item) => isQuestion(item.text) && ASK_SALE.test(item.text));
  const promise = student.find((item) => FALSE_PROMISE.test(item.text));
  const priced = student.find((item) => STATED_PRICE.test(item.text));

  let outcome = 'no_agreement';
  let outcomeFound;
  for (const item of sentences(ctx, 'prospect').reverse()) {
    const text = item.text.replace(/’/g, "'");
    if (saidNo(text)) { outcomeFound = item; break; }
    if (saidYes(text)) { outcome = 'sale_agreed'; outcomeFound = item; break; }
  }

  return {
    outcome,
    outcomeTurnId: outcomeFound ? outcomeFound.turn.id : null,
    outcomeQuote: outcomeFound ? outcomeFound.text : null,
    askedProblem: claim(question, { passed: Boolean(question) }),
    price: claim(priced, { status: priced ? 'stated' : 'not_stated' }),
    nextStep: claim(ask, { passed: Boolean(ask) }),
    falsePromise: claim(promise, { found: Boolean(promise) }),
  };
}

function ruleChecks(agentId, ctx, audit) {
  const student = sentences(ctx, 'candidate');
  const questions = student.filter((item) => isQuestion(item.text));
  const pitch = student.find((item) => ctx.scenario.productWords.some((word) => item.text.toLowerCase().includes(word)));
  const pitchIndex = pitch ? student.indexOf(pitch) : Number.POSITIVE_INFINITY;
  const firstQuestion = questions[0];
  const open = questions.find((item) => OPEN_QUESTION.test(item.text));
  const need = questions.find((item) => NEED_QUESTION.test(item.text));
  const objection = sentences(ctx, 'prospect').find((item) => OBJECTION.test(item.text));
  const answer = objection
    ? ctx.turns.slice(ctx.turns.indexOf(objection.turn) + 1).find((turn) => turn.speaker === 'candidate')
    : undefined;
  const answerSentence = student.find((item) => item.turn === answer);

  switch (agentId) {
    case 'discovery':
      return [
        cited('asked_before_pitching', firstQuestion && student.indexOf(firstQuestion) <= pitchIndex ? 'met' : 'missed', firstQuestion),
        cited('open_questions', open ? 'met' : firstQuestion ? 'partial' : 'missed', open || firstQuestion),
        cited('found_real_problem', need ? 'partial' : 'missed', need),
        cited('explored_impact', need && questions.length >= 2 ? 'partial' : 'missed', questions.find((item) => item !== need)),
      ];
    case 'product_fit':
      return [
        cited('linked_to_need', pitch && need ? 'partial' : 'missed', pitch),
        cited('customer_language', 'missed'),
        cited('relevant_only', pitch ? 'partial' : 'missed', pitch),
        cited('explained_benefit', pitch ? 'partial' : 'missed', pitch),
      ];
    case 'objections':
      if (!objection) return SALES_CHECKS.objections.map((item) => cited(item.id, 'not_applicable'));
      return [
        cited('acknowledged', answerSentence ? 'partial' : 'missed', answerSentence),
        cited('explored_concern', answerSentence && isQuestion(answerSentence.text) ? 'partial' : 'missed', answerSentence),
        cited('answered_directly', 'missed'),
        cited('confirmed_resolved', 'missed'),
      ];
    case 'communication': {
      const warm = student.find((item) => EMPATHY.test(item.text));
      return [
        cited('listened', questions.length >= 2 ? 'partial' : 'missed', questions[1]),
        cited('clear_language', ctx.metrics.longestCandidateTurnWords <= 45 ? 'partial' : 'missed', student[0]),
        cited('balanced_talk', 'met', firstQuestion),
        cited('empathy', warm ? 'partial' : 'missed', warm),
      ];
    }
    case 'next_step': {
      const ask = student.find((item) => isQuestion(item.text) && ASK_SALE.test(item.text));
      const concrete = student.find((item) => CONCRETE.test(item.text) && !PRESSURE.test(item.text));
      return [
        cited('asked_next_step', ask ? 'met' : 'missed', ask),
        cited('fitting_step', ask && firstQuestion ? 'partial' : 'missed', ask),
        cited('concrete_details', concrete ? 'met' : 'missed', concrete),
        { id: 'clear_answer', status: ask && audit.outcomeQuote ? 'met' : 'missed', turnId: audit.outcomeTurnId, quote: audit.outcomeQuote },
      ];
    }
    case 'integrity': {
      const pressure = student.find((item) => PRESSURE.test(item.text));
      return [
        cited('accurate_terms', 'met'),
        audit.falsePromise.found
          ? { id: 'no_unsupported_claims', status: 'missed', turnId: audit.falsePromise.turnId, quote: audit.falsePromise.quote }
          : cited('no_unsupported_claims', 'met'),
        pressure ? cited('no_pressure', 'missed', pressure) : cited('no_pressure', 'met'),
        cited('honest_about_limits', 'not_applicable'),
      ];
    }
    default:
      return [];
  }
}

// The final text is written by the engine from the checks, because it depends on the result.
const ruleAgent = (agentId, ctx, audit) => ({ checks: ruleChecks(agentId, ctx, audit), finding: '', suggestion: '' });

module.exports = { isQuestion, ruleAudit, ruleAgent };
