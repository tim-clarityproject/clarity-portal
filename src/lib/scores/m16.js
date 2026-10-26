// M16. Answers from feedback links (docs/scoring-methods.md, M16).
//
// Written answers are shown as written. Ratings collected by link are
// averaged per item beside the person's own, with the number of answers.
// A giver's name is hidden from others when 3 or more people answer (the
// 360 rule; Claude, 26 Oct, 17:18).

export const NAMES_HIDDEN_FROM = 3;

/**
 * M16: per-item averages of ratings given by link.
 * @param {{ ratings: Object<string, number|null> }[]} answers
 * @returns {Object<string, { average: number|null, answers: number }>}
 */
export function m16RatingSummary(answers, itemKeys) {
  const out = {};
  for (const k of itemKeys) {
    const v = (answers || []).map((a) => a.ratings?.[k]).filter((x) => typeof x === 'number');
    out[k] = { average: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, answers: v.length };
  }
  return out;
}

/** M16: are givers' names hidden? Only for requests using the 360 rule, from 3 answers. */
export function m16NamesHidden(answerCount, hideNamesRule) {
  return Boolean(hideNamesRule) && answerCount >= NAMES_HIDDEN_FROM;
}
