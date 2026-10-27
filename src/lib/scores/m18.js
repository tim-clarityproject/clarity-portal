// M18. Team pulse (docs/scoring-methods.md, M18).
//
// The short pulse's five measures, each scored 0 to 100; the team figure is
// the average of the answers to each measure. Results show only once the
// pulse closes, and only with 3 or more answers (Tim, 27 Oct, 14:20): see
// m18ResultsShown. The stress question is stored as 'stress' and shown as
// Calm (higher is calmer). The question wording is a first draft for Tim to
// confirm with the M17 mock-up. The database has copies
// (public.score_m18_pulse, migration 032; public.score_m18_shown, 033),
// tested on the same cases.

import { m0Change } from './m0.js';

const five = (keys) => Object.fromEntries(keys.map((k, i) => [k, i * 25]));
const OFTEN_UP = five(['never', 'rarely', 'sometimes', 'often', 'always']);

/** Measures in the tie order for the next step (Claude). */
export const PULSE_MEASURES = Object.freeze([
  { key: 'energy', name: 'Energy to perform', scale: five(['very_low', 'low', 'ok', 'high', 'very_high']),
    step: 'Ask your team what would give them more energy at work.' },
  { key: 'sleep', name: 'Sleep', scale: five(['very_poor', 'poor', 'ok', 'good', 'very_good']),
    step: 'Ask your team what gets in the way of a good night’s sleep.' },
  { key: 'stress', name: 'Calm', scale: { never: 100, rarely: 75, sometimes: 50, often: 25, always: 0 },
    step: 'Ask your team what is adding the most pressure right now.' },
  { key: 'workload', name: 'Workload', scale: OFTEN_UP,
    step: 'Ask your team what would ease the workload.' },
  { key: 'support', name: 'Support', scale: OFTEN_UP,
    step: 'Ask each person what support would help them perform.' },
]);

/** A pulse stays open for 7 days, or less if the boss chooses (M18). */
export const PULSE_OPEN_DAYS = 7;
/** Results need at least this many answers (M18). */
export const PULSE_MIN_ANSWERS = 3;

/**
 * M18: may the boss see this pulse's results (the measures, their own
 * questions and the comments)? Only once it has closed, with 3 or more
 * answers. Named answers show one by one, so the totals would also give away
 * the answers of the 1 or 2 people who stayed anonymous; then the results
 * stay private too (Claude, 27 Oct). Named answers always show as they come
 * in; the number of answers shows only once the pulse closes.
 * @param {{ closed: boolean, answers: number, named: number }} input
 * @returns {{ shown: boolean, reason: 'open'|'too_few'|'too_few_anonymous'|null, answers: number|null, message: string|null }}
 */
export function m18ResultsShown({ closed, answers, named = 0 }) {
  if (!closed) return { shown: false, reason: 'open', answers: null, message: 'Results show once the pulse closes.' };
  const people = answers === 1 ? '1 person' : `${answers} people`;
  if (answers < PULSE_MIN_ANSWERS) {
    return { shown: false, reason: 'too_few', answers, message: `${people} answered, so the results stay private.` };
  }
  const anonymous = answers - named;
  if (anonymous > 0 && anonymous < PULSE_MIN_ANSWERS) {
    return { shown: false, reason: 'too_few_anonymous', answers, message: `${people} answered, but only ${anonymous} without a name, so the results stay private.` };
  }
  return { shown: true, reason: null, answers, message: null };
}

/**
 * M18: may one figure show (a measure, or one of the boss's own rating
 * questions)? On the same terms as the pulse: 3 or more answers to that
 * question, and not just 1 or 2 anonymous ones beside named answers, so
 * someone skipping a question never leaves one person's answer on show.
 * The database has a copy (public.score_m18_figure_shown, migration 033).
 * @param {{ answers: number, named: number }} input answers to this question
 */
export function m18FigureShown({ answers, named = 0 }) {
  const anonymous = answers - named;
  return answers >= PULSE_MIN_ANSWERS && !(anonymous > 0 && anonymous < PULSE_MIN_ANSWERS);
}

/** The note on the answering page for a small team (Claude): fewer than 5 people. */
export const SMALL_TEAM = 5;
export function m18SmallTeam(wentTo) {
  return wentTo < SMALL_TEAM;
}

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** A seeded shuffle (mulberry32), so comments come in a random order that tests can repeat. */
export function m18Shuffle(list, seed = Date.now()) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * M18: one send's results.
 * @param {object} input
 *   answers       [{ energy, sleep, stress, workload, support, own: { [questionId]: number|string },
 *                    comment, name }] (name only when the giver chose to add it)
 *   wentTo        how many people it went to
 *   ownQuestions  [{ id, kind: 'rating'|'text' }] up to 3
 *   previous      the last send's measures { energy: 62.5, … } or null
 *   seed          for the comments' random order
 * @returns {{ answers: number, wentTo: number, measures: object, own: object, comments: string[],
 *   named: object[], nextStep: string|null }}
 */
export function m18PulseResults({ answers = [], wentTo, ownQuestions = [], previous = null, seed }) {
  const measures = {};
  for (const m of PULSE_MEASURES) {
    const v = answers.map((a) => (Object.hasOwn(m.scale, a[m.key] ?? '') ? m.scale[a[m.key]] : undefined)).filter((x) => x !== undefined);
    const figure = mean(v);
    measures[m.key] = {
      figure,
      answers: v.length,
      change: previous && previous[m.key] != null ? m0Change(figure, previous[m.key]) : null,
    };
  }
  const own = {};
  for (const q of ownQuestions) {
    if (q.kind === 'rating') {
      const v = answers.map((a) => a.own?.[q.id]).filter((x) => typeof x === 'number');
      own[q.id] = { average: mean(v), answers: v.length };
    } else {
      own[q.id] = { texts: m18Shuffle(answers.map((a) => a.own?.[q.id]).filter((x) => typeof x === 'string' && x.trim()), seed) };
    }
  }
  let lowest = null;
  for (const m of PULSE_MEASURES) {
    const f = measures[m.key].figure;
    if (f != null && (!lowest || f < lowest.figure)) lowest = { ...m, figure: f };
  }
  return {
    answers: answers.length,
    wentTo,
    measures,
    own,
    comments: m18Shuffle(answers.map((a) => a.comment).filter((c) => c && c.trim()), seed),
    named: answers.filter((a) => a.name).map((a) => ({ name: a.name, energy: a.energy, sleep: a.sleep, stress: a.stress, workload: a.workload, support: a.support })),
    nextStep: lowest ? lowest.step : null,
  };
}
