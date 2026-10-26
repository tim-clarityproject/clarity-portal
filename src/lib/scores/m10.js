// M10. What's improving and what's holding you back (docs/scoring-methods.md, M10).
//
// Up to 3 things going well and up to 3 holding someone back, always about
// the current sprint, most important first, each holding-back item with one
// fix. Wording is the screen's; this returns what to say and in what order.

import { m0AtStandard, m0Round, m0RoundHours } from './m0.js';

const MAX = 3;
const HIGH_STRESS = new Set(['quite_a_lot', 'very_much']);

/**
 * M10.
 * @param {object} input
 *   standard
 *   objectives  [{ id, name, result (M9), effortOnTrack (M9.3) }]
 *   strategies  [{ id, name, weeks: [{ score }] }] the current sprint's finished weeks, oldest first
 *   habits      [{ id, name, weeks: [{ score }] }] the same
 *   sleep       { hoursNow, hoursBefore, qualityNow, qualityBefore } averages over the
 *               last 4 weeks and the 4 before (M12); any may be null
 *   stress      the current sprint's finished weeks' stress answers, oldest first
 * @returns {{ improving: object[], holdingBack: object[] }}
 */
export function m10ImprovingAndHoldingBack(input) {
  const { standard } = input;
  const improving = [];
  const objectives = input.objectives || [];
  // 1. Objectives improving this sprint, target reached first.
  for (const o of objectives.filter((x) => x.result.reached && x.result.improving)) improving.push({ kind: 'objective_reached', id: o.id, name: o.name });
  for (const o of objectives.filter((x) => !x.result.reached && x.result.improving)) improving.push({ kind: 'objective_improving', id: o.id, name: o.name });
  // 2. Strategies at or above the standard for the last 3 finished weeks running.
  for (const s of input.strategies || []) {
    const last = s.weeks.slice(-3);
    if (last.length === 3 && last.every((w) => m0AtStandard(w.score, standard))) improving.push({ kind: 'strategy_at_standard', id: s.id, name: s.name });
  }
  // 3. A habit kept up (target met) for 4 finished weeks running.
  for (const h of input.habits || []) {
    const last = h.weeks.slice(-4);
    if (last.length === 4 && last.every((w) => w.score != null && w.score >= 100 - 1e-9)) improving.push({ kind: 'habit_kept_up', id: h.id, name: h.name });
  }
  // 4. Sleep hours or quality up on the previous 4 weeks.
  const sl = input.sleep || {};
  if ((sl.hoursNow != null && sl.hoursBefore != null && m0RoundHours(sl.hoursNow) > m0RoundHours(sl.hoursBefore))
    || (sl.qualityNow != null && sl.qualityBefore != null && sl.qualityNow > sl.qualityBefore)) {
    improving.push({ kind: 'sleep_up' });
  }

  const holdingBack = [];
  // 1. A Strategy below the standard in each of the last 2 finished weeks.
  for (const s of input.strategies || []) {
    const last = s.weeks.slice(-2);
    if (last.length === 2 && last.every((w) => w.score != null && !m0AtStandard(w.score, standard))) {
      holdingBack.push({ kind: 'strategy_below', id: s.id, name: s.name, fix: 'Plan it into this week' });
    }
  }
  // 2. An objective not moving while its effort is on track.
  for (const o of objectives) {
    if (o.result.notMoving && o.effortOnTrack) holdingBack.push({ kind: 'objective_not_moving', id: o.id, name: o.name, fix: 'Review this Strategy' });
  }
  // 3. The habits with the lowest average this sprint, if under 50% (Claude).
  const habitAverages = (input.habits || []).map((h) => {
    const v = h.weeks.map((w) => w.score).filter((x) => x != null);
    return { h, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  }).filter((x) => x.avg != null && m0Round(x.avg) < 50).sort((a, b) => a.avg - b.avg);
  for (const { h, avg } of habitAverages) holdingBack.push({ kind: 'habit_low', id: h.id, name: h.name, average: avg, fix: 'Make it easier this week' });
  // 4. Recovery signals going the wrong way (Claude).
  const sleepDown = sl.hoursNow != null && sl.hoursBefore != null && sl.hoursBefore - sl.hoursNow >= 0.5 - 1e-9;
  const stress = input.stress || [];
  const stressHigh = stress.length >= 2 && stress.slice(-2).every((s) => HIGH_STRESS.has(s));
  if (sleepDown || stressHigh) holdingBack.push({ kind: 'recovery_signals', sleepDown, stressHigh, fix: 'Plan some recovery' });

  return { improving: improving.slice(0, MAX), holdingBack: holdingBack.slice(0, MAX) };
}
