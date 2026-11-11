// The plan's words, worked out once so every screen says them the same
// way: an objective's figure and target, a habit's measure line and the
// short dates the plan uses. No scores are worked out here (those are in
// src/lib/scores); these only put numbers the person typed into words.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENCY = /^[£$€]/;

/** "31 Dec 2027" from a "YYYY-MM-DD" key. */
export function shortDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A number as people write it: "10,000", "1.5". */
export function plainNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

// A unit is either a symbol that sits against the number ("£", "£k", "%")
// or a word that follows it ("clients").
function splitUnit(unit) {
  const u = (unit || '').trim();
  if (!u) return { pre: '', suf: '', word: '' };
  if (CURRENCY.test(u)) {
    const rest = u.slice(1);
    return rest.length <= 2 && !/\s/.test(rest) ? { pre: u[0], suf: rest, word: '' } : { pre: u[0], suf: '', word: rest.trim() };
  }
  if (u.length <= 2 && !/\s/.test(u)) return { pre: '', suf: u, word: '' };
  return { pre: '', suf: '', word: u };
}

// Ratings are five words, never numbers (5e rule 29i; Tim and Claude, 10
// Nov): Poor, Fair, Good, Very good, Excellent, the "how good" scale. The
// five words score 0, 25, 50, 75 and 100 (docs/scoring-methods.md, M1 and
// M9.1). Nothing saved changes shape:
// - a habit rated each day keeps its saved 1 to 5 (1 Poor to 5 Excellent),
//   and M1's rating rule gives the same score as the words' 0 to 100;
// - an Outcome Objective's rating stays on its saved 0 to 10: a word saves
//   0, 2.5, 5, 7.5 or 10 (the same 0, 25, 50, 75 and 100 out of 100), and
//   an older figure reads 0 to 2 Poor, 3 to 4 Fair, 5 to 6 Good, 7 to 8
//   Very good, 9 to 10 Excellent, keeping its date. Targets the same.
export const RATING_WORDS = Object.freeze(['Poor', 'Fair', 'Good', 'Very good', 'Excellent']);

// A saved or typed figure: a number, or text that reads as one. Nothing,
// blank text, true or false, a list or anything else is no figure, so it
// shows no word (never "Poor" for an empty answer).
const isFigure = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));

/** Which of the five words (0 to 4) an objective's saved 0 to 10 figure reads as, or null. */
export function ratingStep(value) {
  if (!isFigure(value)) return null;
  const v = Number(value);
  if (v < 2.5) return 0;
  if (v < 5) return 1;
  if (v < 7) return 2;
  if (v < 9) return 3;
  return 4;
}

/** "Very good" for an objective's saved 0 to 10 figure ('' when there is none). */
export function ratingWord(value) {
  const step = ratingStep(value);
  return step == null ? '' : RATING_WORDS[step];
}

/** The figure a word saves on the objective's 0 to 10 scale: 0, 2.5, 5, 7.5 or 10. */
export const ratingValue = (step) => step * 2.5;

/** The word's score out of 100: 0, 25, 50, 75 or 100. */
export function ratingScore(value) {
  const step = ratingStep(value);
  return step == null ? null : step * 25;
}

/** The answers for an objective's rating, each saving its 0 to 10 figure as text. */
export const OBJECTIVE_RATING_OPTIONS = Object.freeze(RATING_WORDS.map((label, step) => ({ value: String(ratingValue(step)), label })));

/** A typed or saved objective rating as the answer it shows ('' when none). */
export function ratingOption(value) {
  const step = ratingStep(value);
  return step == null ? null : String(ratingValue(step));
}

/** "Very good" for a habit's daily rating (1 to 5), or its average. */
export function habitRatingWord(value) {
  if (!isFigure(value)) return '';
  return RATING_WORDS[Math.min(5, Math.max(1, Math.round(Number(value)))) - 1];
}

/** The answers for a habit's daily rating: the five words, saving 1 to 5. */
export const HABIT_RATING_OPTIONS = Object.freeze(RATING_WORDS.map((label, i) => ({ value: i + 1, label })));

// Way of being (Daily review and the dashboard) and Sleep quality (Daily
// plan) use the same five words (Tim, 10 Nov, 23:22; docs/scoring-methods.md
// M12). Nothing saved changes shape:
// - the way of being stays on its saved 1 to 10: a word saves 2, 4, 6, 8 or
//   10 (the top of its band), and an older figure reads 1 to 2 Poor, 3 to 4
//   Fair, 5 to 6 Good, 7 to 8 Very good, 9 to 10 Excellent, the objective's
//   bands, keeping its date. Averages are still worked out on the saved
//   figures, so no score changes;
// - sleep quality keeps its five saved keys, which read straight across in
//   order: very_poor Poor, poor Fair, fair Good, good Very good, very_good
//   Excellent.
/** The figure a word saves for the way of being, on its 1 to 10: 2, 4, 6, 8 or 10. */
export const wayRatingValue = (step) => (step + 1) * 2;

/** The answers for the way of being's rating: the five words, saving 2, 4, 6, 8 or 10. */
export const WAY_RATING_OPTIONS = Object.freeze(RATING_WORDS.map((label, step) => ({ value: wayRatingValue(step), label })));

/** A saved way-of-being rating (1 to 10) as the answer it shows, or null. */
export function wayRatingOption(value) {
  const step = ratingStep(value);
  return step == null ? null : wayRatingValue(step);
}

/**
 * The figure to save when a word is tapped: the word's own figure, or
 * nothing when it is the word already showing, so a second tap clears the
 * rating (as the 1 to 10 row did) and an older figure is never rewritten by
 * tapping its own word (a saved 7 shows "Very good"; tapping it must not
 * turn the 7 into an 8).
 */
export function wayRatingTapped(saved, tapped) {
  return wayRatingOption(saved) === tapped ? null : tapped;
}

/** "Very good" for a saved way-of-being rating, or an average of them ('' when none). */
export const wayRatingWord = (value) => ratingWord(value);

const SLEEP_QUALITY_KEYS = ['very_poor', 'poor', 'fair', 'good', 'very_good'];

/** "Very good" for a saved sleep quality key ('' when there is none). */
export function sleepQualityWord(key) {
  const i = SLEEP_QUALITY_KEYS.indexOf(key);
  return i === -1 ? '' : RATING_WORDS[i];
}

/** The word's score out of 100 for a saved sleep quality key: 0, 25, 50, 75 or 100 (null when none). */
export function sleepQualityScore(key) {
  const i = SLEEP_QUALITY_KEYS.indexOf(key);
  return i === -1 ? null : i * 25;
}

/** An objective's figure on its own: "£172k", "31", "Very good". */
export function objectiveFigure(objective, value) {
  if (objective.kind === 'rating') return ratingWord(value);
  const { pre, suf } = splitUnit(objective.unit);
  return `${pre}${plainNumber(value)}${suf}`;
}

/** What the figure is measured against: "of 40", "of £250k", "target Excellent". */
export function objectiveTarget(objective) {
  // A rating with no target saved says nothing, never "target" on its own.
  if (objective.kind === 'rating') return ratingWord(objective.target) ? `target ${ratingWord(objective.target)}` : '';
  const { word } = splitUnit(objective.unit);
  return `of ${objectiveFigure(objective, objective.target)}${word ? ` ${word}` : ''}`;
}

/** How the kind is named on its card, or null for a number. */
export function objectiveKindLabel(objective) {
  if (objective.kind === 'milestone') return 'Milestone';
  if (objective.kind === 'rating') return 'Rated from Poor to Excellent';
  return null;
}

/** The date an objective is aimed at. */
export function objectiveDate(objective) {
  return objective.kind === 'milestone' ? objective.dueOn : objective.byWhen;
}

/**
 * One line per objective for the My Mission panel (M1 mpanel): "31 of 40",
 * "7/10 of 9/10", "Not yet, by 30 Jun 2027" or "Done".
 */
export function objectiveStripFigure(objective, current, reached) {
  if (objective.kind === 'milestone') return reached ? 'Done' : `Not yet, by ${shortDate(objective.dueOn)}`;
  if (objective.kind === 'rating') return [objectiveFigure(objective, current), objectiveTarget(objective)].filter(Boolean).join(', ');
  return `${objectiveFigure(objective, current)} ${objectiveTarget(objective)}`;
}

/**
 * A habit's measure as one line (M1 mDef), e.g. "10,000 steps a day",
 * "4 sessions a week", "Rated 1 to 5 each day, aim for 4". A label, so no
 * full stop.
 * @param {{measure, unit, target, targetPer, limit, limitPer, direction}} habit
 */
export function habitMeasureLine(habit) {
  const unit = (habit.unit || '').trim();
  const per = (p) => (p === 'day' ? 'a day' : 'a week');
  switch (habit.measure) {
    case 'amount':
    case 'count':
      return `${plainNumber(habit.target)}${unit ? ` ${unit}` : habit.measure === 'count' ? ' times' : ''} ${per(habit.targetPer)}`;
    case 'count_limit':
      return `No more than ${plainNumber(habit.limit)}${unit ? ` ${unit}` : ''} ${per(habit.limitPer)}`;
    case 'yes_no_days_limit':
      return `Yes or no each day, no more than ${plainNumber(habit.limit)} ${Number(habit.limit) === 1 ? 'day' : 'days'} a week`;
    case 'yes_no_days_target':
      return habit.target == null
        ? 'Yes or no each working day'
        : `Yes or no each day, aim for ${plainNumber(habit.target)} ${Number(habit.target) === 1 ? 'day' : 'days'} a week`;
    case 'rating':
      return habit.direction === 'lower'
        ? `Rated each day, aim for ${habitRatingWord(habit.target)} or lower`
        : `Rated each day, aim for ${habitRatingWord(habit.target)}`;
    case 'yes_no_weekly':
      return 'Once a week';
    default:
      return '';
  }
}

/** "Serves objective 1", "Serves objectives 1 and 3" (M1 serves()). */
export function servesLine(numbers) {
  if (!numbers.length) return 'Serves no objective yet';
  if (numbers.length === 1) return `Serves objective ${numbers[0]}`;
  return `Serves objectives ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}
