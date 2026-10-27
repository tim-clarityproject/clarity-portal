// M13. Hardware and Software check-in (docs/scoring-methods.md, M13).
//
// Two scores out of 100 from one-tap answers about the past month. The
// chosen option is stored (not the score), so the scoring can change later;
// these tables turn options into points, exactly as M13 lists them.
// Answers: { H1: 'h7_8', H2: 'good', … S6: 'often' }.

import { m0Change, m0Round } from './m0.js';

const steps = (keys) => Object.fromEntries(keys.map((k, i) => [k, (i * 100) / (keys.length - 1)]));

export const OPTIONS = Object.freeze({
  H1: { under_5: 0, h5_6: 40, h6_7: 75, h7_8: 100, h8_9: 100, over_9: 70 },
  H2: steps(['very_poor', 'poor', 'ok', 'good', 'very_good']),
  H3: { never: 100, rarely: 75, sometimes: 50, often: 25, always: 0 },
  H4: { none: 0, under_1: 25, h1_2_5: 60, h2_5_5: 100, over_5: 100 },
  H5: { d0: 0, d1: 50, d2_plus: 100 },
  H6: { under_4: 100, h4_6: 75, h6_8: 50, h8_10: 25, over_10: 0 },
  H7: steps(['very_poor', 'poor', 'ok', 'good', 'very_good']),
  H8: { none: 100, u1_7: 100, u8_14: 80, u15_21: 45, u22_35: 20, over_35: 0 },
  H9: { never: 100, less_than_monthly: 75, monthly: 50, weekly: 25, daily: 0 },
  H10: steps(['very_low', 'low', 'ok', 'high', 'very_high']),
  H11: steps(['very_low', 'low', 'ok', 'high', 'very_high']),
  H12: steps(['very_poor', 'poor', 'ok', 'good', 'very_good']),
  H13: { not_at_all: 100, a_little: 75, moderately: 50, quite_a_lot: 25, very_much: 0 },
  S: steps(['never', 'rarely', 'sometimes', 'often', 'always']),
});

/** Hardware areas in the tie order for "One thing to work on" (Claude). */
export const HARDWARE_AREAS = Object.freeze([
  { key: 'sleep', name: 'Sleep', questions: ['H1', 'H2'] },
  { key: 'movement', name: 'Movement', questions: ['H4', 'H5', 'H6'] },
  { key: 'fuel', name: 'Fuel and alcohol', questions: ['H7', 'H8', 'H9'] },
  { key: 'stress', name: 'Stress', questions: ['H3'] },
  { key: 'mood_energy', name: 'Mood and energy', questions: ['H10', 'H11'] },
  { key: 'health', name: 'Health', questions: ['H12', 'H13'] },
]);
export const SOFTWARE_AREAS = Object.freeze([
  { key: 'bouncing_back', name: 'Bouncing back', questions: ['S1'] },
  { key: 'emotions', name: 'Emotions', questions: ['S2'] },
  { key: 'focus', name: 'Focus', questions: ['S3'] },
  { key: 'decisions', name: 'Decisions', questions: ['S4'] },
  { key: 'communication', name: 'Communication', questions: ['S5'] },
  { key: 'conflict', name: 'Conflict', questions: ['S6'] },
]);

/** Points for one answer, or null when unanswered (or not scored: H14 to H16). */
export function m13Points(code, option) {
  if (option == null) return null;
  const table = code.startsWith('S') ? OPTIONS.S : OPTIONS[code];
  if (!table) return null;
  const v = Object.hasOwn(table, option) ? table[option] : undefined;
  if (v === undefined) throw new Error(`Unknown answer ${option} for ${code}`);
  return v;
}

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/**
 * M13: area scores, the Hardware score and the Software score (each 0 to
 * 100, exact). An area with no answers is null and left out.
 */
export function m13CheckinScores(answers) {
  const area = (a) => mean(a.questions.map((q) => m13Points(q, answers[q])).filter((x) => x != null));
  const hardwareAreas = Object.fromEntries(HARDWARE_AREAS.map((a) => [a.key, area(a)]));
  const softwareAreas = Object.fromEntries(SOFTWARE_AREAS.map((a) => [a.key, area(a)]));
  return {
    hardware: mean(Object.values(hardwareAreas).filter((x) => x != null)),
    software: mean(Object.values(softwareAreas).filter((x) => x != null)),
    hardwareAreas,
    softwareAreas,
  };
}

/**
 * M13 results against last month: the changes (from rounded figures), what
 * improved (up to 3 areas that rose, biggest first; once a typical swing is
 * known for an area, only rises bigger than it) and one thing to work on
 * (the lowest Hardware area, ties in HARDWARE_AREAS order).
 * @param {object} now m13CheckinScores
 * @param {object|null} before last month's, or null
 * @param {Object<string, number>} [typicalSwing] per area key, from real data (M23)
 */
export function m13Results(now, before, typicalSwing = {}) {
  const all = [...HARDWARE_AREAS, ...SOFTWARE_AREAS];
  const value = (s, key) => s.hardwareAreas[key] ?? s.softwareAreas[key] ?? null;
  const rises = [];
  if (before) {
    all.forEach((a, order) => {
      const change = m0Change(value(now, a.key), value(before, a.key));
      if (change != null && change > 0 && change > (typicalSwing[a.key] ?? 0)) rises.push({ key: a.key, name: a.name, change, order });
    });
  }
  rises.sort((x, y) => (y.change - x.change) || (x.order - y.order));
  let workOn = null;
  for (const a of HARDWARE_AREAS) {
    const v = now.hardwareAreas[a.key];
    if (v != null && (!workOn || m0Round(v) < m0Round(workOn.score))) workOn = { key: a.key, name: a.name, score: v };
  }
  return {
    hardwareChange: before ? m0Change(now.hardware, before.hardware) : null,
    softwareChange: before ? m0Change(now.software, before.software) : null,
    improved: rises.slice(0, 3).map((r) => ({ key: r.key, name: r.name, change: r.change })),
    workOn,
  };
}

/**
 * M13 flags for the coach, never shown to the client (Tim, 23 Oct): mood
 * Very low; over 35 units, or heavy sessions weekly or more; under 5 hours'
 * or Very poor sleep two months running; stress Always; pain Quite a lot or
 * Very much. (No flag when the check-in is switched off for the coach: the
 * database checks that.)
 * @returns {{ code: string, reason: string }[]}
 */
export function m13Flags(answers, lastMonth = null) {
  const flags = [];
  if (answers.H10 === 'very_low') flags.push({ code: 'H10', reason: 'mood_very_low' });
  if (answers.H8 === 'over_35') flags.push({ code: 'H8', reason: 'units_over_35' });
  if (answers.H9 === 'weekly' || answers.H9 === 'daily') flags.push({ code: 'H9', reason: 'heavy_sessions_weekly' });
  const poorSleep = (a) => a && (a.H1 === 'under_5' || a.H2 === 'very_poor');
  if (poorSleep(answers) && poorSleep(lastMonth)) flags.push({ code: answers.H1 === 'under_5' ? 'H1' : 'H2', reason: 'poor_sleep_two_months' });
  if (answers.H3 === 'always') flags.push({ code: 'H3', reason: 'stress_always' });
  if (answers.H13 === 'quite_a_lot' || answers.H13 === 'very_much') flags.push({ code: 'H13', reason: 'pain' });
  return flags;
}
