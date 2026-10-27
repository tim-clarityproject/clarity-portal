// M14. Patterns in your numbers (docs/scoring-methods.md, M14 and M22).
//
// A fixed list of links in one person's own numbers. A link becomes a card
// only when it is big enough to matter, very unlikely to be chance (a
// shuffle test, corrected for checking many links), holds in both halves of
// the data, and, for links measured in the same week, reaches Strong. It
// never says one thing causes another.
//
// The proof that this keeps false cards rare is the simulation in
// scripts/sim-patterns.mjs (npm run sim:patterns), which runs this exact code
// on invented people. Its result set the corrected chance threshold (M22).
//
// One person's data, as the engine reads it:
//   weeks: [{ eligible, score, stress, wayOfBeing,
//             strategies: { [sid]: { score, without: { [habitId]: score }, atStandard } },
//             habits: { [hid]: { strategyId, kept, sleep } },
//             objectives: { [oid]: { figure, direction: 'up'|'down', servedBy: [sid] } } }]
//            oldest first, the last 26 weeks at most (M14.3)
//   days:  [{ weekday (Monday 0), eligible, working, sleepHours, sleepQuality, dayScore }]
//            dayScore is worked out without any sleep habit (M14.1)
//   questions: [{ id: 'Q1'|'Q2', cause, result }] the person's own (M14.1)

// ---------------------------------------------------------------- settings
export const M14 = Object.freeze({
  maxWeeks: 26,
  minWeeksPerGroup: 6,
  minDaysPerGroup: 20,
  minWeeksPerGroupPerHalf: 3,
  minDaysPerGroupPerHalf: 10,
  trendWindow: 9,
  trendMinimum: 5,
  blockWeeks: 8,
  shuffles: 10000,
  // The corrected chance a card must be under (Benjamini and Hochberg).
  // 5% in the methods document; tightened to 2.6% by the simulation, the
  // first threshold at which the whole 95% interval of people seeing a false
  // card at any weekly check fell below 1 in 20 (M22).
  alpha: 0.026,
  strongAlpha: 0.01,
  sizeOfSwing: 0.5,
  halfSizeOfSwing: 0.25,
  minScorePoints: 3,
  stayWeeks: 4,
  clearlyFails: 0.2,
  maxCards: 4,
});

const GOOD_STRESS = new Set(['not_at_all', 'a_little']);
const GOOD_SLEEP = new Set(['good', 'very_good']);

// ---------------------------------------------------------------- arithmetic
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
};
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** A seeded random number generator (mulberry32), so every run can be repeated. */
export function m14Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- M14.4 allowing for getting better
/**
 * Weekly residuals: each week's figure minus the median of the 9 weeks
 * centred on it (fewer at the ends, at least 5), counting eligible weeks
 * with a figure only.
 * @param {number[]} values in time order
 * @returns {number[]}
 */
export function m14WeeklyResiduals(values) {
  const n = values.length;
  const half = Math.floor(M14.trendWindow / 2);
  return values.map((v, i) => {
    let lo = Math.max(0, i - half);
    let hi = Math.min(n - 1, i + half);
    // At the ends the window is shorter; widen it to at least 5 where possible.
    while (hi - lo + 1 < Math.min(M14.trendMinimum, n)) {
      if (lo > 0) lo -= 1;
      else if (hi < n - 1) hi += 1;
      else break;
    }
    return v - median(values.slice(lo, hi + 1));
  });
}

/**
 * Daily residuals: each day's figure minus the average of the same weekday
 * in the 4 weeks either side (rule 13). A day with no such neighbour is null.
 * @param {{ index: number, weekday: number, value: number }[]} days index = day number
 */
export function m14DailyResiduals(days) {
  return days.map((d) => {
    const near = days.filter((o) => o !== d && o.weekday === d.weekday && Math.abs(o.index - d.index) <= 28);
    return near.length ? d.value - mean(near.map((o) => o.value)) : null;
  });
}

// ---------------------------------------------------------------- M14.5 the tests
/** The gap between the better group's and the other group's average. */
function gapOf(res, groups) {
  let a = 0; let na = 0; let b = 0; let nb = 0;
  for (let i = 0; i < res.length; i += 1) {
    if (groups[i]) { a += res[i]; na += 1; } else { b += res[i]; nb += 1; }
  }
  return a / na - b / nb;
}

/**
 * The shuffle (permutation) test, two-sided: how often a shuffle of the
 * group labels gives a gap at least as big as the one seen. Labels are
 * shuffled only within blocks (8 neighbouring weeks, or the same weekday),
 * so the shuffle respects time and the weekly rhythm.
 *
 * Early stopping (allowed by the brief, checked against full runs in the
 * simulation): after each batch, stop once the chance is clearly above
 * `stopAbove`, since a link that far from passing can't change any decision
 * (Benjamini and Hochberg never pass a test whose chance is above alpha).
 * @returns {{ p: number, shuffles: number, early: boolean }}
 */
export function m14ShuffleTest(res, groups, blocks, { rng, shuffles = M14.shuffles, stopAbove = null, batch = 200 } = {}) {
  const observed = Math.abs(gapOf(res, groups));
  const eps = 1e-9 * Math.max(1, observed);
  const byBlock = new Map();
  blocks.forEach((b, i) => { if (!byBlock.has(b)) byBlock.set(b, []); byBlock.get(b).push(i); });
  const blockList = [...byBlock.values()].filter((idx) => idx.length > 1);
  const perm = [...groups];
  let hits = 0;
  let done = 0;
  while (done < shuffles) {
    const end = Math.min(shuffles, done + batch);
    for (; done < end; done += 1) {
      for (const idx of blockList) {
        for (let k = idx.length - 1; k > 0; k -= 1) {
          const j = Math.floor(rng() * (k + 1));
          const a = idx[k]; const b = idx[j];
          const t = perm[a]; perm[a] = perm[b]; perm[b] = t;
        }
      }
      if (Math.abs(gapOf(res, perm)) >= observed - eps) hits += 1;
    }
    if (stopAbove != null && done < shuffles) {
      // Wilson lower bound at about 99.99% (z = 3.9).
      const ph = hits / done;
      const z = 3.9;
      const lower = (ph + (z * z) / (2 * done) - z * Math.sqrt((ph * (1 - ph)) / done + (z * z) / (4 * done * done))) / (1 + (z * z) / done);
      if (lower > stopAbove) return { p: (hits + 1) / (done + 1), shuffles: done, early: true };
    }
  }
  return { p: (hits + 1) / (shuffles + 1), shuffles, early: false };
}

/** Benjamini and Hochberg corrected chances (q-values), in the input's order. */
export function m14BenjaminiHochberg(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array(m);
  let min = 1;
  for (let k = m - 1; k >= 0; k -= 1) {
    min = Math.min(min, (order[k].p * m) / (k + 1));
    q[order[k].i] = Math.min(1, min);
  }
  return q;
}

/**
 * One link's figures, before the correction: groups, sizes, averages, the
 * usual swing, the gap, both halves, and the shuffle test.
 * @param {object} link { id, kind: 'weekly'|'daily', units: [{ t, group, residual, block }],
 *   resultIsScore, sameWeek }
 * @returns {object|null} null when there isn't enough data in each group
 */
export function m14Evaluate(link, opts) {
  const u = link.units;
  const weekly = link.kind === 'weekly';
  const need = weekly ? M14.minWeeksPerGroup : M14.minDaysPerGroup;
  const needHalf = weekly ? M14.minWeeksPerGroupPerHalf : M14.minDaysPerGroupPerHalf;
  const inGroup = u.filter((x) => x.group).length;
  if (inGroup < need || u.length - inGroup < need) return null;
  const res = u.map((x) => x.residual);
  const groups = u.map((x) => x.group);
  const gap = gapOf(res, groups);
  const swing = sd(res);
  const mid = Math.floor(u.length / 2);
  const halves = [u.slice(0, mid), u.slice(mid)].map((h) => {
    const g = h.filter((x) => x.group).length;
    return { enough: g >= needHalf && h.length - g >= needHalf, gap: g && h.length - g ? gapOf(h.map((x) => x.residual), h.map((x) => x.group)) : 0 };
  });
  const holds = halves.every((h) => h.enough && Math.sign(h.gap) === Math.sign(gap) && Math.abs(h.gap) >= M14.halfSizeOfSwing * swing);
  const bigEnough = Math.abs(gap) >= M14.sizeOfSwing * swing && (!link.resultIsScore || Math.abs(gap) >= M14.minScorePoints);
  const test = m14ShuffleTest(res, groups, u.map((x) => x.block), opts);
  return {
    id: link.id,
    kind: link.kind,
    sameWeek: Boolean(link.sameWeek),
    resultIsScore: Boolean(link.resultIsScore),
    sizes: [inGroup, u.length - inGroup],
    averages: [mean(res.filter((_, i) => groups[i])), mean(res.filter((_, i) => !groups[i]))],
    gap,
    swing,
    bigEnough,
    holds,
    halves,
    p: test.p,
    shuffles: test.shuffles,
    early: test.early,
  };
}

// ---------------------------------------------------------------- M14.1 the links
const lastWeeks = (weeks) => weeks.slice(-M14.maxWeeks);

/** Weekly units from a series of { week index, cause (true/false/null), result }. */
function weeklyUnits(points) {
  const usable = points.filter((p) => p.result != null && Number.isFinite(p.result));
  const res = m14WeeklyResiduals(usable.map((p) => p.result));
  return usable
    .map((p, i) => ({ t: p.t, group: p.cause, residual: res[i] }))
    .filter((x) => x.group === true || x.group === false)
    .map((x, i) => ({ ...x, block: Math.floor(i / M14.blockWeeks) }));
}

/**
 * Every link the engine checks for one person (M14.1). No link contains its
 * own cause: L3 compares a habit with its Strategy's score worked out without
 * it, and L1 and L2 use a day score worked out without any sleep habit.
 * @returns {{ id: string, key: string, kind: string, units: object[], resultIsScore: boolean, sameWeek: boolean }[]}
 */
export function m14Links(person) {
  const weeks = lastWeeks(person.weeks || []).map((w, t) => ({ ...w, t })).filter((w) => w.eligible);
  const links = [];

  // L1 and L2: daily, working days of eligible weeks only.
  const days = (person.days || []).slice(-M14.maxWeeks * 7).map((d, index) => ({ ...d, index })).filter((d) => d.eligible && d.working && d.dayScore != null);
  if (days.length) {
    const resid = m14DailyResiduals(days.map((d) => ({ index: d.index, weekday: d.weekday, value: d.dayScore })));
    const base = days.map((d, i) => ({ d, residual: resid[i] })).filter((x) => x.residual != null);
    const daily = (id, cause) => ({
      id, key: id, kind: 'daily', resultIsScore: true, sameWeek: false,
      units: base.map(({ d, residual }) => ({ t: d.index, group: cause(d), residual, block: d.weekday }))
        .filter((x) => x.group === true || x.group === false),
    });
    links.push(daily('L1', (d) => (d.sleepHours == null || d.sleepToConfirm ? null : d.sleepHours >= 7)));
    links.push(daily('L2', (d) => (d.sleepQuality == null ? null : GOOD_SLEEP.has(d.sleepQuality))));
  }

  // L3: each habit, kept or not, against its Strategy's score without it.
  const habitIds = new Set(weeks.flatMap((w) => Object.keys(w.habits || {})));
  for (const hid of habitIds) {
    const sid = weeks.map((w) => w.habits?.[hid]?.strategyId).find(Boolean);
    links.push({
      id: 'L3', key: `L3:${hid}`, subject: hid, kind: 'weekly', resultIsScore: true, sameWeek: false,
      units: weeklyUnits(weeks.map((w) => ({ t: w.t, cause: w.habits?.[hid]?.kept ?? null, result: w.strategies?.[sid]?.without?.[hid] ?? null }))),
    });
  }

  // L4 and L5: measured in the same week, so they must reach Strong.
  links.push({
    id: 'L4', key: 'L4', kind: 'weekly', resultIsScore: true, sameWeek: true,
    units: weeklyUnits(weeks.map((w) => ({ t: w.t, cause: w.stress == null ? null : GOOD_STRESS.has(w.stress), result: w.score }))),
  });
  links.push({
    id: 'L5', key: 'L5', kind: 'weekly', resultIsScore: true, sameWeek: true,
    units: weeklyUnits(weeks.map((w) => ({ t: w.t, cause: w.wayOfBeing == null ? null : w.wayOfBeing >= 7, result: w.score }))),
  });

  // L6: a Strategy at or above the standard against below, and its
  // objective's change 2 to 4 weeks later: the figure at the end of the
  // fourth week after minus the figure at the end of the second (Claude).
  // For an objective that should go down, a fall is the better result.
  const all = lastWeeks(person.weeks || []);
  const pairs = new Set();
  for (const w of all) {
    for (const [oid, o] of Object.entries(w.objectives || {})) for (const sid of o.servedBy || []) pairs.add(`${sid}|${oid}`);
  }
  for (const pair of pairs) {
    const [sid, oid] = pair.split('|');
    const points = [];
    all.forEach((w, t) => {
      if (!w.eligible) return;
      const a = all[t + 2]?.objectives?.[oid];
      const b = all[t + 4]?.objectives?.[oid];
      const change = a && b && a.figure != null && b.figure != null ? (b.figure - a.figure) * (b.direction === 'down' ? -1 : 1) : null;
      points.push({ t, cause: w.strategies?.[sid]?.atStandard ?? null, result: change });
    });
    links.push({ id: 'L6', key: `L6:${sid}:${oid}`, subject: `${sid}:${oid}`, kind: 'weekly', resultIsScore: false, sameWeek: false, units: weeklyUnits(points) });
  }

  // Q1 and Q2: the person's own questions, refused if they contain their cause.
  for (const q of person.questions || []) {
    if (!m14QuestionAllowed(q, all).allowed) continue;
    links.push({
      id: q.id, key: q.id, kind: 'weekly', resultIsScore: q.result.kind !== 'objective', sameWeek: Boolean(q.sameWeek),
      units: weeklyUnits(weeks.map((w) => ({ t: w.t, cause: questionCause(q, w), result: questionResult(q, w) }))),
    });
  }
  return links;
}

function questionCause(q, w) {
  if (q.cause.kind === 'habit') return w.habits?.[q.cause.id]?.kept ?? null;
  if (q.cause.kind === 'stress') return w.stress == null ? null : GOOD_STRESS.has(w.stress);
  if (q.cause.kind === 'way_of_being') return w.wayOfBeing == null ? null : w.wayOfBeing >= 7;
  return null;
}
function questionResult(q, w) {
  if (q.result.kind === 'weekly_score') return w.score;
  if (q.result.kind === 'strategy') return w.strategies?.[q.result.id]?.score ?? null;
  return null;
}

/**
 * M14.1: a question whose result already contains its cause is refused
 * ("That one would always look linked, so it can't be checked."): a habit
 * against its own Strategy's score, or against the weekly score (which
 * contains every habit).
 */
export function m14QuestionAllowed(q, weeks) {
  if (q.cause.kind === 'habit') {
    const sid = (weeks || []).map((w) => w.habits?.[q.cause.id]?.strategyId).find(Boolean);
    if (q.result.kind === 'weekly_score' || (q.result.kind === 'strategy' && q.result.id === sid)) {
      return { allowed: false, message: "That one would always look linked, so it can't be checked." };
    }
  }
  return { allowed: true, message: null };
}

// ---------------------------------------------------------------- one weekly check
/**
 * M14.5: every link checked, corrected together, and judged.
 * @param {object} person see the top of this file
 * @param {{ rng: () => number, alpha?: number, earlyStop?: boolean, fullFor?: Set<string> }} opts
 *   fullFor: links that get the full 10,000 shuffles (cards already shown)
 * @returns {object[]} each evaluated link with q, passes, strength, positive
 */
export function m14Check(person, opts) {
  const alpha = opts.alpha ?? M14.alpha;
  const evaluated = [];
  for (const link of m14Links(person)) {
    const full = !opts.earlyStop || (opts.fullFor && opts.fullFor.has(link.key));
    const e = m14Evaluate(link, { rng: opts.rng, stopAbove: full ? null : alpha });
    if (e) evaluated.push({ ...e, key: link.key, subject: link.subject ?? null });
  }
  const q = m14BenjaminiHochberg(evaluated.map((e) => e.p));
  return evaluated.map((e, i) => {
    const strong = q[i] < Math.min(M14.strongAlpha, alpha) && Math.abs(e.gap) >= e.swing;
    const passes = q[i] < alpha && e.bigEnough && e.holds && (!e.sameWeek || strong);
    return { ...e, q: q[i], passes, strength: passes ? (strong ? 'strong' : 'clear') : null, positive: e.gap > 0 };
  });
}

// ---------------------------------------------------------------- M14.6 staying steady
/**
 * One week's cards, from last week's state (rules 6, 17, 19, 23): a card
 * stays for at least 4 weeks once shown, unless it clearly fails (corrected
 * chance over 1 in 5, or the gap reverses); at most 4 cards; at most one new
 * card a week. Positive links go to the person; links the other way are
 * coach-only (rule 18) and follow the same rules separately.
 * @param {object[]} results from m14Check
 * @param {{ cards: { key, positive, shownAt }[] }} state last week's
 * @param {number} week this week's number
 * @returns {{ cards: object[], added: object|null, removed: object[] }}
 */
export function m14Steady(results, state, week) {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const kept = [];
  const removed = [];
  for (const card of state.cards || []) {
    const r = byKey.get(card.key);
    const sameWay = r && (r.gap > 0) === card.positive;
    const young = week - card.shownAt < M14.stayWeeks;
    const clearlyFails = !r || !sameWay || r.q > M14.clearlyFails;
    if ((young && !clearlyFails) || (r && r.passes && sameWay)) kept.push({ ...card, result: r });
    else removed.push(card);
  }
  let added = null;
  for (const positive of [true, false]) {
    const shown = kept.filter((c) => c.positive === positive);
    if (shown.length >= M14.maxCards) continue;
    const fresh = results
      .filter((r) => r.passes && r.positive === positive && !kept.some((c) => c.key === r.key))
      .sort((a, b) => a.q - b.q)[0];
    if (fresh) {
      const card = { key: fresh.key, id: fresh.id, positive, shownAt: week, result: fresh };
      kept.push(card);
      if (positive) added = card;
    }
  }
  return { cards: kept, added, removed };
}

/**
 * M14.8: what "How was this worked out?" says, in figures: the groups and
 * their sizes, each group's average, the usual swing, how unlikely chance is
 * ("about 1 in 300") and that it held in both halves.
 */
export function m14HowWorkedOut(r) {
  const oneIn = Math.max(1, Math.round(1 / Math.max(r.q, 1e-6)));
  return {
    sizes: r.sizes,
    averages: r.averages,
    swing: r.swing,
    gap: r.gap,
    chance: `about 1 in ${oneIn}`,
    heldInBothHalves: r.holds,
    strength: r.strength,
  };
}
