// Checks that every quote really exists in the call. The AI can invent a sentence; here it is
// discarded, and what gets shown is always the literal text of the turn.

const WORD = /[\p{L}\p{N}€$%]+(?:['’]\p{L}+)?/gu;

function tokenize(text) {
  return [...text.matchAll(WORD)].map((match) => ({
    word: match[0].toLowerCase().replaceAll('’', "'"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function longestRun(wanted, found) {
  let best = { start: 0, length: 0 };
  let previous = new Array(wanted.length + 1).fill(0);
  found.forEach((token, foundIndex) => {
    const current = new Array(wanted.length + 1).fill(0);
    wanted.forEach((target, wantedIndex) => {
      if (target.word !== token.word) return;
      const length = previous[wantedIndex] + 1;
      current[wantedIndex + 1] = length;
      if (length > best.length) best = { start: foundIndex - length + 1, length };
    });
    previous = current;
  });
  return best;
}

// Tolerates small errors, but at least 70% of the quote must appear in a row in a real turn.
function verifyQuote(turns, quote, options = {}) {
  if (!quote) return null;
  const wanted = tokenize(quote);
  if (wanted.length === 0) return null;
  const needed = Math.max(Math.min(3, wanted.length), Math.ceil(wanted.length * 0.7));

  const pool = turns
    .filter((turn) => !options.speaker || turn.speaker === options.speaker)
    .sort((a, b) => Number(b.id === options.turnId) - Number(a.id === options.turnId));

  for (const turn of pool) {
    const found = tokenize(turn.text);
    const run = longestRun(wanted, found);
    if (run.length >= needed) {
      const literal = turn.text.slice(found[run.start].start, found[run.start + run.length - 1].end);
      return { kind: 'quote', turnId: turn.id, quote: literal };
    }
  }
  return null;
}

const countWords = (text) => tokenize(text).length;

function clampWords(text, maxWords) {
  const tokens = tokenize(text);
  if (tokens.length <= maxWords) return text.trim();
  return `${text.slice(0, tokens[maxWords - 1].end).trim()}.`;
}

module.exports = { verifyQuote, countWords, clampWords };
