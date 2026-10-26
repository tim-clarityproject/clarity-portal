// M2. To-do score (docs/scoring-methods.md, M2).
//
// A to-do counts as done (100) or not done (0) in the week it was planned
// for. The rules (decided 21 Oct; done early: Claude):
//   - moving it before its week starts is free;
//   - moving it out after its week has started counts as not done in that week;
//   - an undone to-do rolls into the next week and counts there too;
//   - done early, it counts only in the week it was done.
//
// A to-do: { id, strategyId, impact (1 to 3), createdOn, plannedWeek,
//   moves: [{ on: date key, toWeek: number|null }], doneOn: date key|null,
//   deleted?: boolean }
// Weeks are sprint week numbers; `weeks` is the sprint's calendar (M0.4).
// A move on a week's first day is a move after that week started.

import { m0WeekOfDay } from './m0.js';

/** The week a to-do was planned for at the start of a day (moves on earlier days applied). */
export function m2PlannedWeekAt(todo, day) {
  let week = todo.plannedWeek ?? null;
  for (const mv of [...(todo.moves || [])].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))) {
    if (mv.on < day) week = mv.toWeek ?? null;
  }
  return week;
}

/** The week a to-do was planned for after every move up to the end of a day. */
function plannedWeekAfter(todo, day) {
  let week = todo.plannedWeek ?? null;
  for (const mv of [...(todo.moves || [])].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))) {
    if (mv.on <= day) week = mv.toWeek ?? null;
  }
  return week;
}

/**
 * M2: the score a to-do gets in one week, or null when it doesn't count there.
 * @param {object} todo
 * @param {{number: number, start: string, end: string}} week
 * @param {object[]} weeks the sprint's weeks, for the week a to-do was done in
 * @param {{ soFar?: boolean }} [opts] so far (M5): open to-dos aren't counted yet
 * @returns {number|null} 100, 0 or null
 */
export function m2TodoScore(todo, week, weeks, opts = {}) {
  if (todo.deleted) return null;
  const doneWeek = todo.doneOn ? m0WeekOfDay(weeks, todo.doneOn) : null;
  if (todo.doneOn && doneWeek === week.number) return 100;
  if (todo.doneOn && todo.doneOn < week.start) return null; // done before this week
  if (todo.createdOn && todo.createdOn > week.end) return null; // didn't exist yet
  if (opts.soFar) return null; // open to-dos count only once done, or when the week finishes
  const atStart = todo.createdOn && todo.createdOn > week.start
    ? (todo.plannedWeek ?? null)
    : m2PlannedWeekAt(todo, week.start);
  const atEnd = plannedWeekAfter(todo, week.end);
  const due = (atStart != null && atStart <= week.number) || (atEnd != null && atEnd <= week.number);
  return due ? 0 : null;
}

/**
 * M2: every to-do that counts in one week, as items for M4.
 * @returns {{ id: string, strategyId: string, impact: number, score: number, kind: 'todo' }[]}
 */
export function m2TodoItems(todos, week, weeks, opts = {}) {
  const items = [];
  for (const t of todos || []) {
    const score = m2TodoScore(t, week, weeks, opts);
    if (score != null) items.push({ id: t.id, strategyId: t.strategyId, impact: t.impact ?? 2, score, kind: 'todo' });
  }
  return items;
}
