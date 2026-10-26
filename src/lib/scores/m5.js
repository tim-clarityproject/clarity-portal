// M5. Weekly Performance score (docs/scoring-methods.md, M5).
//
// Σ(Strategy score × objectives it serves) ÷ Σ(objectives each serves), over
// the Strategies scored that week (decided 21 Oct). A Strategy always counts
// at least once (Claude). A week with nothing planned has no score.
//
// The database has a copy of m5WeekFromRaw (public.score_week_raw, migration
// 032), and both are tested on the same cases (tests/scores/cases.json).

import { m1HabitScore } from './m1.js';
import { m2TodoItems } from './m2.js';
import { m3WinItems } from './m3.js';
import { m4StrategyScore } from './m4.js';

/**
 * M5: the week's score from its Strategy scores.
 * @param {{score: number|null, served: number}[]} strategies
 * @returns {number|null}
 */
export function m5WeeklyPerformanceScore(strategies) {
  let num = 0;
  let den = 0;
  for (const s of strategies || []) {
    if (s.score == null) continue;
    const times = Math.max(1, s.served || 0);
    num += times * s.score;
    den += times;
  }
  return den ? num / den : null;
}

/**
 * M5 from the raw week: habits and their logs (M1), to-dos (M2) and wins
 * (M3), into Strategy scores (M4) and the week's score.
 *
 * @param {object} input
 *   week         { number, start, end, days: [7 date keys] }
 *   weeks        the sprint's weeks [{ number, start, end }] (for to-dos done early)
 *   workingDays  the week's working days (M0.3)
 *   soFarUntil   optional: "So far" up to and including this day
 *   strategies   [{ id, served }] (served: how many Outcome Objectives it serves)
 *   habits       [{ id, strategyId, impact, measure, target, targetPer, limit, limitPer, direction }],
 *                each as in force that week
 *   logs         [{ habitId, date, value, toConfirm }]
 *   todos        see M2
 *   wins         see M3
 * @returns {{ score: number|null, strategies: {id: string, served: number, score: number|null}[],
 *   habits: {id: string, score: number|null, notLogged: boolean}[] }}
 */
export function m5WeekFromRaw(input) {
  const soFar = Boolean(input.soFarUntil);
  const week = { days: input.week.days, workingDays: input.workingDays || [], soFarUntil: input.soFarUntil || null };
  const logsByHabit = new Map();
  for (const l of input.logs || []) {
    if (!logsByHabit.has(l.habitId)) logsByHabit.set(l.habitId, []);
    logsByHabit.get(l.habitId).push(l);
  }
  const habitResults = [];
  const items = [];
  for (const h of input.habits || []) {
    const r = m1HabitScore(h, logsByHabit.get(h.id) || [], week);
    habitResults.push({ id: h.id, score: r.score, notLogged: r.notLogged });
    if (r.score != null) items.push({ strategyId: h.strategyId, impact: h.impact ?? 2, score: r.score, kind: 'habit' });
  }
  items.push(...m2TodoItems(input.todos, input.week, input.weeks || [input.week], { soFar }));
  items.push(...m3WinItems(input.wins, input.week.days, { soFarUntil: input.soFarUntil }));
  const strategies = (input.strategies || []).map((s) => ({
    id: s.id,
    served: s.served || 0,
    score: m4StrategyScore(items.filter((it) => it.strategyId === s.id)),
  }));
  return { score: m5WeeklyPerformanceScore(strategies), strategies, habits: habitResults };
}
