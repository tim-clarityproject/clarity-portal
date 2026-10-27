// M17. Before and after impact (docs/scoring-methods.md, M17).
//
// The sponsor and 2 or 3 colleagues rate 3 to 5 behaviours at the start and
// the end ("How often does [first name] do this?": Never 0 to Always 100).
// At the end each also gives a "looking back" rating of the start.

import { m0Round } from './m0.js';

export const OFTEN = Object.freeze({ never: 0, rarely: 25, sometimes: 50, often: 75, always: 100 });
export const IMPROVED_POINTS = 10;
export const MIN_RATERS = 2;

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/**
 * M17.
 * @param {{ raterId: string, phase: 'start'|'end'|'looking_back', behaviourId: string, answer: string }[]} ratings
 * @returns {{ enough: boolean, raters: number, change: number|null, lookingBackChange: number|null,
 *   start: number|null, end: number|null, lookingBack: number|null, improved: boolean|null }}
 *   Only raters who answered at both the start and the end are counted, so
 *   one who answered once doesn't move the change (Claude).
 */
export function m17BeforeAndAfter(ratings) {
  // Pairs: one rater's scoreable answers for one behaviour at both the start
  // and the end (Claude), so the two averages cover the same behaviours and
  // an answer that can't be scored never counts as a change.
  const val = (phase) => {
    const m = new Map();
    for (const r of ratings || []) if (r.phase === phase && Object.hasOwn(OFTEN, r.answer)) m.set(`${r.raterId}|${r.behaviourId}`, OFTEN[r.answer]);
    return m;
  };
  const s = val('start');
  const e = val('end');
  const lb = val('looking_back');
  const pairs = [...e.keys()].filter((k) => s.has(k));
  const raters = new Set(pairs.map((k) => k.split('|')[0])).size;
  if (raters < MIN_RATERS) {
    return { enough: false, raters, change: null, lookingBackChange: null, start: null, end: null, lookingBack: null, improved: null };
  }
  const start = mean(pairs.map((k) => s.get(k)));
  const end = mean(pairs.map((k) => e.get(k)));
  const lbPairs = pairs.filter((k) => lb.has(k));
  const lookingBack = lbPairs.length ? mean(lbPairs.map((k) => lb.get(k))) : null;
  const endForLb = lbPairs.length ? mean(lbPairs.map((k) => e.get(k))) : null;
  const change = end - start;
  return {
    enough: true,
    raters,
    start,
    end,
    lookingBack,
    change,
    lookingBackChange: lookingBack == null ? null : endForLb - lookingBack,
    improved: m0Round(change) >= IMPROVED_POINTS,
  };
}
