// npm run sim:patterns: the proof before go-live (methods M14.7).
//
// Runs the pattern engine (src/lib/scores/m14.js, the same code the portal
// uses) on invented people, every week from week 8 to week 26, with the
// 4-week rule on, and reports:
//
//   1. No real links: 5,000 people, 26 weeks each, with realistic noise,
//      good and bad spells that run on from week to week (autocorrelation),
//      gaps in logging, slow improvement, Recovery weeks, and habits nested
//      in Strategies exactly as the portal stores them (a Strategy's score is
//      the impact-weighted average of its habits and other items; the weekly
//      score is M5 of the Strategies). Nothing causes anything. Counted:
//      anyone who would see a false card at any weekly check. Target: fewer
//      than 1 in 20.
//   2. Planted links: 1,000 people with one planted link (a habit and its
//      Strategy's score without it), 2 of their usual swings, with at least
//      12 weeks in each group. Target: at least 3 in 4 found (Tim, 27 Oct,
//      "rare but right"; was 8 in 10 at one swing).
//   3. Early stopping against the full 10,000 shuffles, on a sample of
//      weekly checks: how often the decisions agree.
//
// Options: --people 5000 --planted 1000 --alpha 0.05 --workers N --agree 1000 --seed 1
//          --effect 2 (the planted link in usual swings) --effects 1,1.5 (for information)
//          --kept-share 0.25,0.75 (option 3: check a habit only when kept in that
//          share of its eligible weeks) --no-tighten (keep the threshold given)
//          --out tests/patterns/sim-results.json
// Uses worker threads. Prints the results and writes them to the --out file.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M14, m14Rng, m14Check, m14Steady, m14WeeklyResiduals } from '../src/lib/scores/m14.js';

const FIRST_CHECK = 8;
const WEEKS = 26;

// ---------------------------------------------------------------- invented people
function gauss(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const between = (rng, a, b) => a + (b - a) * rng();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// A series with good and bad spells that run on (AR(1)), a slow trend, and
// its own level.
function series(rng, n, { phi, sd, trend = 0, base = 0 }) {
  const out = [];
  let x = gauss(rng) * sd / Math.sqrt(1 - phi * phi);
  for (let t = 0; t < n; t += 1) {
    x = phi * x + gauss(rng) * sd;
    out.push(base + trend * t + x);
  }
  return out;
}

export function makePerson(seed, { planted = false, effect = 1 } = {}) {
  const rng = m14Rng(seed);
  const n = WEEKS;
  // Which weeks count (M0.5): thin weeks, unusual weeks and Recovery.
  const eligible = Array.from({ length: n }, () => rng() > 0.08 && rng() > 0.04);
  if (rng() < 0.3) {
    const start = Math.floor(between(rng, 2, n - 3));
    const len = rng() < 0.5 ? 1 : 2;
    for (let t = start; t < start + len; t += 1) eligible[t] = false;
  }
  const nStrategies = planted ? 3 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 3);
  const nObjectives = 2 + Math.floor(rng() * 2);
  const strategies = [];
  for (let s = 0; s < nStrategies; s += 1) {
    const plantedHere = planted && s === 0;
    const nHabits = plantedHere ? 1 : 1 + Math.floor(rng() * 3);
    const habits = [];
    for (let h = 0; h < nHabits; h += 1) {
      const latent = series(rng, n, { phi: between(rng, 0.2, 0.6), sd: 1, trend: between(rng, 0, 0.05), base: between(rng, -1, 1.2) });
      habits.push({ id: `h${s}_${h}`, impact: 1 + Math.floor(rng() * 3), kept: latent.map((v) => v > 0), partial: latent.map(() => between(rng, 0, 90)), sleep: rng() < 0.1 });
    }
    const other = series(rng, n, {
      phi: between(rng, 0.3, 0.7), sd: between(rng, 8, 16), trend: between(rng, 0, 0.6), base: plantedHere ? 60 : between(rng, 55, 85),
    });
    strategies.push({ id: `s${s}`, habits, other, serves: [] });
  }
  for (let o = 0; o < nObjectives; o += 1) strategies[o % nStrategies].serves.push(`o${o}`);
  for (const s of strategies) if (rng() < 0.3) s.serves.push(`o${Math.floor(rng() * nObjectives)}`);

  // The planted link: a habit kept about half the time, at least 12
  // eligible weeks in each group, lifting its Strategy's other items by the
  // usual swing of that score.
  let plantedKey = null;
  if (planted) {
    const s = strategies[0];
    const h = s.habits[0];
    // At least 12 weeks in each group needs at least 24 eligible weeks.
    while (eligible.filter(Boolean).length < 24) {
      const off = eligible.map((e, t) => (e ? -1 : t)).filter((t) => t >= 0);
      eligible[off[Math.floor(rng() * off.length)]] = true;
    }
    const elig = eligible.map((e, t) => (e ? t : -1)).filter((t) => t >= 0);
    for (let i = elig.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [elig[i], elig[j]] = [elig[j], elig[i]];
    }
    const inGroup = new Set(elig.slice(0, Math.floor(elig.length / 2)));
    const kept = Array.from({ length: n }, (_, t) => (eligible[t] ? inGroup.has(t) : rng() < 0.5));
    h.kept = kept;
    const res = m14WeeklyResiduals(s.other.filter((_, t) => eligible[t]));
    const m = res.reduce((a, b) => a + b, 0) / res.length;
    const swing = Math.sqrt(res.reduce((a, b) => a + (b - m) * (b - m), 0) / (res.length - 1));
    s.other = s.other.map((v, t) => v + (kept[t] ? effect * swing : 0));
    plantedKey = `L3:${h.id}`;
  }

  const stressLatent = series(rng, n, { phi: between(rng, 0.3, 0.7), sd: 1, trend: -between(rng, 0, 0.03), base: 0 });
  const wob = series(rng, n, { phi: between(rng, 0.2, 0.6), sd: 1, trend: between(rng, 0, 0.03), base: between(rng, 5.5, 7.5) });
  const objectives = Array.from({ length: nObjectives }, (_, o) => ({
    id: `o${o}`, direction: rng() < 0.2 ? 'down' : 'up',
    walk: (() => { let x = 50; const d = between(rng, 0, 0.5); const sd = between(rng, 1, 3); return Array.from({ length: n }, () => (x += d + gauss(rng) * sd)); })(),
  }));
  const STRESS = ['not_at_all', 'a_little', 'moderately', 'quite_a_lot', 'very_much'];

  const weeks = [];
  for (let t = 0; t < n; t += 1) {
    const strat = {};
    const habitsOut = {};
    let num = 0; let den = 0;
    for (const s of strategies) {
      const items = s.habits.map((h) => ({ id: h.id, w: h.impact, v: h.kept[t] ? 100 : h.partial[t] }));
      items.push({ id: null, w: 2, v: clamp(s.other[t], 0, 100) });
      const avg = (list) => list.reduce((a, b) => a + b.w * b.v, 0) / list.reduce((a, b) => a + b.w, 0);
      const score = avg(items);
      const without = Object.fromEntries(s.habits.map((h) => [h.id, avg(items.filter((it) => it.id !== h.id))]));
      strat[s.id] = { score, without, atStandard: Math.round(score) >= 85 };
      for (const h of s.habits) habitsOut[h.id] = { strategyId: s.id, kept: h.kept[t], sleep: h.sleep };
      const times = Math.max(1, s.serves.length);
      num += times * score; den += times;
    }
    const z = stressLatent[t];
    weeks.push({
      eligible: eligible[t],
      score: num / den,
      stress: STRESS[z < -1 ? 0 : z < -0.2 ? 1 : z < 0.6 ? 2 : z < 1.3 ? 3 : 4],
      wayOfBeing: clamp(wob[t], 1, 10),
      habits: habitsOut,
      strategies: strat,
      objectives: Object.fromEntries(objectives.map((o) => [o.id, {
        figure: o.walk[t], direction: o.direction, servedBy: strategies.filter((s) => s.serves.includes(o.id)).map((s) => s.id),
      }])),
    });
  }

  // Days: working days, sleep with a weekend lie-in, a day score with its
  // own weekday rhythm and trend, unrelated to sleep. Gaps in logging.
  const fourDay = rng() < 0.15;
  const sleep = series(rng, n * 7, { phi: 0.4, sd: 0.8, base: between(rng, 6.4, 7.6) });
  const quality = series(rng, n * 7, { phi: 0.3, sd: 1 });
  const dayLevel = series(rng, n * 7, { phi: 0.3, sd: 15, trend: between(rng, 0, 0.08), base: between(rng, 55, 85) });
  const days = [];
  for (let i = 0; i < n * 7; i += 1) {
    const weekday = i % 7;
    const working = fourDay ? weekday < 4 : weekday < 5;
    const hours = sleep[i] + (weekday >= 5 ? 0.6 : 0);
    const q = quality[i] + (hours - 7) * 0.8;
    days.push({
      weekday,
      eligible: eligible[Math.floor(i / 7)],
      working,
      sleepHours: rng() < 0.15 ? null : Math.round(clamp(hours, 3, 11) * 2) / 2,
      sleepQuality: rng() < 0.15 ? null : ['very_poor', 'poor', 'fair', 'good', 'very_good'][q < -1.5 ? 0 : q < -0.5 ? 1 : q < 0.4 ? 2 : q < 1.3 ? 3 : 4],
      dayScore: clamp(dayLevel[i] + (weekday === 0 ? -6 : weekday === 4 ? 3 : 0), 0, 100),
    });
  }
  return { person: { weeks, days, questions: [] }, plantedKey };
}

// One person through every weekly check, with the 4-week rule on.
function runPerson(seed, { planted, alpha, effect = 1, earlyStop = true, keptShare = null }) {
  const { person, plantedKey } = makePerson(seed, { planted, effect });
  const rng = m14Rng(seed * 7919 + 13);
  let state = { cards: [] };
  let anyCard = false;
  let anyCoachCard = false;
  let firstCardWeek = null;
  let foundAtEnd = false;
  let foundEver = false;
  for (let week = FIRST_CHECK; week <= WEEKS; week += 1) {
    const sofar = { weeks: person.weeks.slice(0, week), days: person.days.slice(0, week * 7), questions: [] };
    const fullFor = new Set(state.cards.map((c) => c.key));
    const results = m14Check(sofar, { rng, alpha, earlyStop, fullFor, keptShare });
    state = m14Steady(results, state, week);
    const positive = state.cards.filter((c) => c.positive);
    if (positive.length && !anyCard) { anyCard = true; firstCardWeek = week; }
    if (state.cards.some((c) => !c.positive)) anyCoachCard = true;
    if (plantedKey && positive.some((c) => c.key === plantedKey)) { foundEver = true; if (week === WEEKS) foundAtEnd = true; }
  }
  return { anyCard, anyCoachCard, firstCardWeek, foundAtEnd, foundEver };
}

// Early stopping against the full run, on one person's checks.
function agreement(seed, alpha, keptShare = null) {
  const { person } = makePerson(seed, {});
  const out = { checks: 0, checksAgree: 0, tests: 0, testsAgree: 0, earlyTests: 0 };
  for (const week of [FIRST_CHECK + 4, WEEKS]) {
    const sofar = { weeks: person.weeks.slice(0, week), days: person.days.slice(0, week * 7), questions: [] };
    const a = m14Check(sofar, { rng: m14Rng(seed * 31 + week), alpha, earlyStop: true, keptShare });
    const b = m14Check(sofar, { rng: m14Rng(seed * 37 + week), alpha, earlyStop: false, keptShare });
    out.checks += 1;
    const pa = a.filter((r) => r.passes).map((r) => r.key).sort().join();
    const pb = b.filter((r) => r.passes).map((r) => r.key).sort().join();
    if (pa === pb) out.checksAgree += 1;
    a.forEach((r, i) => {
      out.tests += 1;
      if (r.early) out.earlyTests += 1;
      if ((r.p <= alpha) === (b[i].p <= alpha)) out.testsAgree += 1;
    });
  }
  return out;
}

if (!isMainThread) {
  const { kind, from, to, alpha, seed, effect, keptShare } = workerData;
  const results = [];
  for (let i = from; i < to; i += 1) {
    const s = seed * 1000003 + i + (kind === 'planted' ? 500000 : kind === 'agree' ? 900000 : 0);
    results.push(kind === 'agree' ? agreement(s, alpha, keptShare) : runPerson(s, { planted: kind === 'planted', alpha, effect, keptShare }));
  }
  parentPort.postMessage(results);
}

// ---------------------------------------------------------------- the main thread
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};

function runAll(kind, count, alpha, workers, seed, effect = 1, keptShare = null) {
  const per = Math.ceil(count / workers);
  const jobs = [];
  for (let w = 0; w < workers; w += 1) {
    const from = w * per;
    const to = Math.min(count, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { kind, from, to, alpha, seed, effect, keptShare } });
      worker.on('message', resolve);
      worker.on('error', reject);
    }));
  }
  return Promise.all(jobs).then((parts) => parts.flat());
}

// A proportion with its 95% interval (Wilson).
function rate(k, nTotal) {
  const p = k / nTotal;
  const z = 1.96;
  const centre = (p + (z * z) / (2 * nTotal)) / (1 + (z * z) / nTotal);
  const half = (z * Math.sqrt((p * (1 - p)) / nTotal + (z * z) / (4 * nTotal * nTotal))) / (1 + (z * z) / nTotal);
  return { k, n: nTotal, rate: p, low: centre - half, high: centre + half };
}
const pct = (r) => `${(100 * r.rate).toFixed(1)}% (${r.k} of ${r.n}; 95% interval ${(100 * r.low).toFixed(1)}% to ${(100 * r.high).toFixed(1)}%)`;

async function main() {
  const people = arg('people', 5000);
  const plantedN = arg('planted', 1000);
  const workers = arg('workers', Math.max(1, os.cpus().length - 2));
  const agreeN = arg('agree', 1000);
  const seed = arg('seed', 1);
  let alpha = arg('alpha', M14.alpha);
  const effect = arg('effect', 2);
  const listArg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return (i >= 0 ? process.argv[i + 1] : def).split(',').map(Number).filter(Number.isFinite);
  };
  const ks = process.argv.includes('--kept-share') ? listArg('kept-share', '') : M14.l3KeptShare;
  const keptShare = ks && ks.length === 2 ? ks : null;
  const tighten = !process.argv.includes('--no-tighten');
  const outArg = process.argv.indexOf('--out');
  const outFile = outArg >= 0 ? process.argv[outArg + 1] : 'tests/patterns/sim-results.json';
  const started = Date.now();
  console.log(`Checking ${keptShare ? `a habit only when kept in ${keptShare[0] * 100}% to ${keptShare[1] * 100}% of its eligible weeks` : 'every habit'}.`);
  const tried = [];

  // 1. No real links; tighten the corrected chance threshold until it passes.
  let nullRes;
  for (;;) {
    const res = await runAll('null', people, alpha, workers, seed, 1, keptShare);
    nullRes = { alpha, any: rate(res.filter((r) => r.anyCard).length, people), coach: rate(res.filter((r) => r.anyCoachCard).length, people) };
    tried.push({ alpha, falseCardRate: nullRes.any.rate, high: nullRes.any.high });
    console.log(`No real links, alpha ${alpha}: ${pct(nullRes.any)} saw a false card at some weekly check; coach-only false cards: ${pct(nullRes.coach)}.`);
    // Safe choice (Claude): the whole 95% interval below 1 in 20, for the
    // person's cards and for coach-only cards alike.
    if ((nullRes.any.high < 0.05 && nullRes.coach.high < 0.05) || alpha <= 0.001 || !tighten) break;
    alpha = Number((alpha * (alpha > 0.02 ? 0.8 : 0.6)).toPrecision(2));
    console.log(`Not safely under 1 in 20: tightening the corrected chance threshold to ${alpha}.`);
  }

  // 2. Planted links, at the threshold that passed.
  const pres = await runAll('planted', plantedN, alpha, workers, seed, effect, keptShare);
  const foundEnd = rate(pres.filter((r) => r.foundAtEnd).length, plantedN);
  const foundEver = rate(pres.filter((r) => r.foundEver).length, plantedN);
  console.log(`Planted links of ${effect} swings, alpha ${alpha}: found at week 26: ${pct(foundEnd)}; found at any check: ${pct(foundEver)}.`);

  // Sensitivity: the same, with bigger planted links (not a target; for Tim).
  const sensitivity = [];
  for (const size of listArg('effects', '1,1.5')) {
    const r = await runAll('planted', plantedN, alpha, workers, seed + 17, size, keptShare);
    const f = rate(r.filter((x) => x.foundAtEnd).length, plantedN);
    sensitivity.push({ effectInSwings: size, foundAtWeek26: f });
    console.log(`  Planted links of ${size} swings: found at week 26: ${pct(f)}.`);
  }

  // 3. Early stopping against full runs.
  const people3 = Math.ceil(agreeN / 2);
  const ares = agreeN > 0 ? await runAll('agree', people3, alpha, workers, seed, 1, keptShare) : [];
  const sum = (k) => ares.reduce((a, r) => a + r[k], 0);
  const agree = {
    checks: sum('checks'), checksAgree: sum('checksAgree'), tests: sum('tests'), testsAgree: sum('testsAgree'), earlyTests: sum('earlyTests'),
  };
  console.log(`Early stopping: ${agree.checksAgree} of ${agree.checks} weekly checks gave the same cards as a full 10,000-shuffle run; ${agree.testsAgree} of ${agree.tests} tests made the same decision (${agree.earlyTests} of them stopped early).`);

  const out = {
    run: new Date().toISOString(),
    methodsSection: 'M14.7',
    people, planted: plantedN, weeks: WEEKS, firstCheck: FIRST_CHECK, seed,
    alpha,
    keptShare,
    tried,
    noRealLinks: { falseCard: nullRes.any, coachOnlyFalseCard: nullRes.coach, target: 'under 5%' },
    plantedLinks: { effectInSwings: effect, foundAtWeek26: foundEnd, foundAtAnyCheck: foundEver, target: effect === 2 ? 'at least 75%' : 'none (the target is set at 2 swings)', sensitivity },
    earlyStopping: agree,
    minutes: Number(((Date.now() - started) / 60000).toFixed(1)),
  };
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', outFile);
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Written to ${outFile} (${out.minutes} minutes).`);
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
