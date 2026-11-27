// The commit questions that end the built performance tools (Stage D, Draft 11,
// approved by Tim on 27 Nov 2026; question rules 14, 32 and 34): one question
// to commit, what and when, which can't be skipped. Where the tool has a
// sprint to put it in, the answer becomes a to-do for the Strategy it serves,
// so it shows again on Home, the sprint and the debrief (Action first, rule 3).

/** Build your plan, before its Ready summary: a to-do in the first sprint's week 1. */
export const PLAN_FIRST_QUESTION = 'What will you do first, and when?';
/** Start a sprint, last: a to-do in the new sprint's week 1. */
export const DAY_ONE_QUESTION = 'What will you do on day one?';
/** The Weekly performance debrief, last: a to-do in next week (the Backlog after the sprint's last week). */
export const MONDAY_QUESTION = 'What will you do first on Monday?';
/** Said under the box when Next is pressed with it empty: the commit question can't be skipped. */
export const COMMIT_NEEDED = 'Type what you’ll do to carry on.';
/** The to-do's Strategy, asked only when the plan has more than one. */
export const COMMIT_STRATEGY = 'Which Strategy does it serve?';

/** The most a to-do holds (todos.text, 028). */
export const COMMIT_MAX = 300;

/**
 * The to-do a commit answer becomes, or null when there's nothing to keep:
 * no words, or no Strategy for it to serve (every to-do serves one).
 * `strategies` are the plan's ({ id } or { value }); an unknown choice takes the first.
 */
export function commitTodo(text, strategyId, strategies = []) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().slice(0, COMMIT_MAX).trim();
  const ids = strategies.map((s) => s.id ?? s.value).filter(Boolean);
  const strategy = ids.includes(strategyId) ? strategyId : ids[0] || null;
  if (!words || !strategy) return null;
  return { text: words, strategyId: strategy };
}
