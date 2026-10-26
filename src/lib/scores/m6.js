// M6. Sprint figures (docs/scoring-methods.md, M6).
//
// The sprint's score is the average of its finished weeks. The database has
// a copy (public.score_m6_sprint, migration 032), tested on the same cases.

import { m0AtStandard, m0Change, m0Round } from './m0.js';

/**
 * M6: the sprint's glance figures.
 * @param {{number: number, score: number|null, finished: boolean}[]} weeks
 *   in order; a finished week with no score (nothing planned) is left out
 * @param {number} standard (M7)
 * @param {number|null} [previousAverage] the previous sprint's final average
 * @returns {{ average: number|null, finishedWeeks: number, weeksAtStandard: number,
 *   best: {number: number, score: number}|null, change: number|null }}
 */
export function m6SprintFigures(weeks, standard, previousAverage = null) {
  const done = (weeks || []).filter((w) => w.finished && w.score != null);
  const average = done.length ? done.reduce((s, w) => s + w.score, 0) / done.length : null;
  let best = null;
  for (const w of done) {
    // Highest shown score; on a tie, the most recent (Claude).
    if (!best || m0Round(w.score) > m0Round(best.score)
      || (m0Round(w.score) === m0Round(best.score) && w.number > best.number)) best = { number: w.number, score: w.score };
  }
  return {
    average,
    finishedWeeks: done.length,
    weeksAtStandard: done.filter((w) => m0AtStandard(w.score, standard)).length,
    best,
    change: previousAverage == null || average == null ? null : m0Change(average, previousAverage),
  };
}

/**
 * M6: "Since you started" at the end-of-sprint review (experience rule 16).
 */
export function m6SinceStarted({ firstAverage, currentAverage, firstHardware, latestHardware, objectivesReached }) {
  return {
    averageChange: m0Change(currentAverage, firstAverage),
    hardwareChange: m0Change(latestHardware, firstHardware),
    objectivesReached: objectivesReached || 0,
  };
}

/**
 * M6: a Strategy's score over the sprint: the mean of its finished weeks'
 * scores (weeks with nothing planned left out).
 * @param {{score: number|null, finished: boolean}[]} weekScores
 */
export function m6StrategySprintAverage(weekScores) {
  const done = (weekScores || []).filter((w) => w.finished && w.score != null);
  return done.length ? done.reduce((s, w) => s + w.score, 0) / done.length : null;
}

/**
 * M6: the frozen end-of-sprint summary for sponsors and leaders (Tim, 26 Oct,
 * 17:29 to 17:31). Only the organisation's objectives and the development
 * objective, and the score of each Strategy serving them, averaged over the
 * sprint. Nothing else.
 *
 * @param {object} input
 *   objectives  [{ id, name, source: 'own'|'organisation'|'development', ...M9 result fields }]
 *   strategies  [{ id, name, serves: [objective ids], weekScores: [{ score, finished }] }]
 *   methodsVersion
 */
export function m6SponsorSummary({ objectives, strategies, methodsVersion }) {
  const shared = (objectives || []).filter((o) => o.source === 'organisation' || o.source === 'development');
  const ids = new Set(shared.map((o) => o.id));
  return {
    methodsVersion,
    objectives: shared,
    strategies: (strategies || [])
      .filter((s) => (s.serves || []).some((id) => ids.has(id)))
      .map((s) => ({
        id: s.id,
        name: s.name,
        serves: s.serves.filter((id) => ids.has(id)),
        average: m6StrategySprintAverage(s.weekScores),
      })),
  };
}
