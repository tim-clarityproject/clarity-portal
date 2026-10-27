// M19. Organisation figures: the four KPI layers (docs/scoring-methods.md, M19).
//
// Totals by team, never one person's data, built from each person's latest
// frozen end-of-sprint summary (M6). The database has a copy
// (public.score_m19_org, migration 032), tested on the same cases; the
// database is what leaders actually read.
//
// Group sizes (spec section 12, M19.3): use figures only for groups of 3 or
// more seats; objective and Strategy figures at any size; self-reported
// totals at any size; the monthly check-in never. "% of seats at their own
// standard" comes from weekly Performance scores, which sponsors and
// leaders never otherwise see, so it follows the use figures' rule: groups
// of 3 or more seats only (Claude).

import { m0AtStandard, m0Round } from './m0.js';

export const USE_FIGURES_MIN_SEATS = 3;
export const CONTRIBUTION_NOTE = 'Coaching contributes to these results alongside many other things. These figures show change over the same period, not proof of cause.';

/**
 * M19.1: % of agreed Outcome Objectives on track or reached.
 * @param {('reached'|'on_track'|'off_track'|'too_early')[]} statuses
 * @returns {{ percent: number|null, shown: number|null, counted: number, onTrack: number,
 *   reached: number, tooEarly: number }}
 */
export function m19Headline(statuses) {
  const s = statuses || [];
  const tooEarly = s.filter((x) => x === 'too_early').length;
  const reached = s.filter((x) => x === 'reached').length;
  const onTrack = s.filter((x) => x === 'on_track').length;
  const counted = s.length - tooEarly;
  const percent = counted ? ((reached + onTrack) / counted) * 100 : null;
  return { percent, shown: m0Round(percent), counted, onTrack, reached, tooEarly };
}

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/**
 * M19: one group's figures (a team and every team below it, or the whole
 * organisation).
 * @param {object} input
 *   seats  [{ current: boolean (false for someone who has left), hasPlan, sprintRunning,
 *            finishedSeatWeeks, debriefsDone,
 *            summary: null | { objectives: [{ status }], strategies: [{ average }],
 *                              averageScore, standard } }]
 *          Leavers' latest summaries still count in totals (anonymised);
 *          only current seats count towards the group's size and use figures.
 *   impact      [{ enough, change, improved }] M17 results, one per person
 *   goalChecks  [{ reading }] M15 results (anonymous totals at any size)
 * @returns {object}
 */
export function m19GroupFigures({ seats = [], impact = [], goalChecks = [] }) {
  const current = seats.filter((s) => s.current);
  const summaries = seats.map((s) => s.summary).filter(Boolean);
  const headline = m19Headline(summaries.flatMap((s) => (s.objectives || []).map((o) => o.status)));

  const showUse = current.length >= USE_FIGURES_MIN_SEATS;
  const pct = (n, d) => (d ? (n / d) * 100 : null);
  const seatWeeks = current.reduce((a, s) => a + (s.finishedSeatWeeks || 0), 0);
  const use = showUse ? {
    plansInPlace: pct(current.filter((s) => s.hasPlan).length, current.length),
    sprintsRunning: pct(current.filter((s) => s.sprintRunning).length, current.length),
    debriefsDone: pct(current.reduce((a, s) => a + (s.debriefsDone || 0), 0), seatWeeks),
  } : null;

  const withAverage = summaries.filter((s) => s.averageScore != null);
  const enough = impact.filter((r) => r.enough);
  const readings = ['own_reasons', 'mixed', 'no_strong_reason', 'pressure'];
  return {
    seats: current.length,
    peopleCounted: summaries.length,
    headline,
    use,
    useHiddenReason: showUse ? null : 'Use figures show for groups of 3 or more seats.',
    behaviour: {
      atOwnStandard: showUse ? pct(withAverage.filter((s) => m0AtStandard(s.averageScore, s.standard)).length, withAverage.length) : null,
      averageStrategyScore: mean(summaries.flatMap((s) => (s.strategies || []).map((x) => x.average)).filter((x) => x != null)),
    },
    // Before and after impact is rated by others for each person: groups of
    // 3 or more seats only, like the use figures (Claude).
    outcomes: showUse ? {
      impactPeople: enough.length,
      impactAverageChange: mean(enough.map((r) => r.change)),
      impactImproved: pct(enough.filter((r) => r.improved).length, enough.length),
    } : { impactPeople: null, impactAverageChange: null, impactImproved: null },
    goalChecks: goalChecks.length ? Object.fromEntries(readings.map((r) => [r, goalChecks.filter((g) => g.reading === r).length])) : null,
    note: CONTRIBUTION_NOTE,
  };
}
