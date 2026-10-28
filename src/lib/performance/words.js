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

/** An objective's figure on its own: "£172k", "31", "7/10". */
export function objectiveFigure(objective, value) {
  if (objective.kind === 'rating') return `${plainNumber(value)}/10`;
  const { pre, suf } = splitUnit(objective.unit);
  return `${pre}${plainNumber(value)}${suf}`;
}

/** What the figure is measured against: "of 40", "of £250k", "target 9/10". */
export function objectiveTarget(objective) {
  if (objective.kind === 'rating') return `target ${plainNumber(objective.target)}/10`;
  const { word } = splitUnit(objective.unit);
  return `of ${objectiveFigure(objective, objective.target)}${word ? ` ${word}` : ''}`;
}

/** How the kind is named on its card, or null for a number. */
export function objectiveKindLabel(objective) {
  if (objective.kind === 'milestone') return 'Milestone';
  if (objective.kind === 'rating') return 'Rated out of 10';
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
  if (objective.kind === 'rating') return `${objectiveFigure(objective, current)} of ${plainNumber(objective.target)}/10`;
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
        ? `Rated 1 to 5 each day, aim for ${plainNumber(habit.target)} or lower`
        : `Rated 1 to 5 each day, aim for ${plainNumber(habit.target)}`;
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
