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
  const by = (phase) => new Set((ratings || []).filter((r) => r.phase === phase).map((r) => r.raterId));
  const startRaters = by('start');
  const paired = [...by('end')].filter((id) => startRaters.has(id));
  const pairedSet = new Set(paired);
  if (paired.length < MIN_RATERS) {
    return { enough: false, raters: paired.length, change: null, lookingBackChange: null, start: null, end: null, lookingBack: null, improved: null };
  }
  const avg = (phase) => mean((ratings || [])
    .filter((r) => r.phase === phase && pairedSet.has(r.raterId) && OFTEN[r.answer] !== undefined)
    .map((r) => OFTEN[r.answer]));
  const start = avg('start');
  const end = avg('end');
  const lookingBack = avg('looking_back');
  const change = end - start;
  return {
    enough: true,
    raters: paired.length,
    start,
    end,
    lookingBack,
    change,
    lookingBackChange: lookingBack == null ? null : end - lookingBack,
    improved: m0Round(change) >= IMPROVED_POINTS,
  };
}
