// The Health Check's results (mock-up M7b version 51), as the page works
// them out and words them: the rows, the headline as one sentence, the
// line for important, the questions to start with, the Success Factor
// levels, the ⓘ pop-ups' words, the orders of the list and the state
// words. The page itself (its order on screen, rule 29ar, and what each
// part looks like) is checked in the browser: tests/healthcheck/flow.mjs
// and compare-m7b.mjs. Invented names only. Run with npm run test:healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_TITLE, CON, CSF_LEVELS, IMPORTANCE_MEANS, LINE_OPTIONS, PROG, PROGS, RES, SORTS, SUCCESS_FACTOR_INFO,
  chartInfo, csfLevel, csfLevelName, headlineLine, headlineSentence, importanceLines, resultRows, resultsModel, sortRows, stateSentence, stateWords,
} from '../../src/health-check/words.js';
import { EXAMPLE } from '../../src/health-check/example.js';

// The mock-up's own invented answers (OWN in M7b).
const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
function kestrel({ levels = [3, 2, 2, 1], line } = {}) {
  return {
    objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
    csfs: CSF.map((text, i) => ({ id: `f${i}`, text, ...(levels ? { level: levels[i] } : {}) })),
    projects: PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
    ratings: Object.fromEntries(PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])),
    importantLine: line ?? null,
    completedAt: '2026-10-27T09:00:00.000Z',
  };
}
const AS_OF = '2026-10-27';

test('the rows: ranked by need of attention, each with its figure, state and dot size', () => {
  const { rows, line } = resultsModel(kestrel(), { asOf: AS_OF });
  assert.equal(line, 50);
  assert.deepEqual(rows.map((r) => [r.n, r.text, r.pct, stateWords(r), r.size]), [
    [1, 'Enterprise sales team', 83, 'Needs attention', 'large'],
    [2, 'Hiring plan for 2027', 58, 'Too early to tell', 'large'],
    [3, 'Pricing review', 57, 'Needs managing', 'small'],
    [4, 'Partner channel', 43, 'Less important', 'middle'],
    [5, 'Customer success programme', 76, 'Moving well', 'middle'],
    [6, 'New office fit-out', 15, 'Less important', 'large'],
    [7, 'Data platform', 57, 'Moving well', 'middle'],
  ]);
  // The same rows the chart and the PDF draw from.
  assert.deepEqual(resultRows(kestrel()).map((r) => r.id), rows.map((r) => r.id));
  assert.deepEqual(rows[0].dates, ['Started Sep 2025', 'Due to finish Dec 2026']);
  assert.deepEqual(rows.find((r) => r.text === 'Partner channel').dates, ['Started Apr 2026', 'Open-ended, with no agreed finish date']);
});

test('the headline is one sentence, never a big figure, with what needs you on its own line', () => {
  const { headline } = resultsModel(kestrel(), { asOf: AS_OF });
  assert.equal(headlineLine(headline), '2 of your 5 important projects are moving well.');
  assert.equal(headline.rest, '1 needs managing, 1 needs attention and 1 is too early to tell.');
  // The PDF's chart and the completion email say it in one go.
  assert.equal(headlineSentence(headline), '2 of 5 important projects are moving well. 1 needs managing, 1 needs attention and 1 is too early to tell.');
});

test('the headline agrees with its number, and says so when nothing important is under way', () => {
  const at70 = resultsModel(kestrel({ line: 70 }), { asOf: AS_OF });
  assert.equal(at70.line, 70);
  assert.equal(headlineLine(at70.headline), '1 of your 2 important projects is moving well.');
  assert.equal(at70.headline.rest, '1 needs attention.');
  const none = kestrel();
  Object.values(none.ratings).forEach((r) => { r.contrib = { f0: 0, f1: 0, f2: 0, f3: 0 }; });
  const m = resultsModel(none, { asOf: AS_OF });
  assert.equal(headlineLine(m.headline), 'None of your important projects is under way yet.');
  assert.equal(headlineLine(m.headline, true), headlineLine(m.headline));
});

test('the line for important: 30% to 80%, 50% suggested, and the line moves the states', () => {
  assert.deepEqual(LINE_OPTIONS, [30, 40, 50, 60, 70, 80].map((v) => ({ value: v, label: v === 50 ? '50%, suggested' : `${v}%` })));
  const at30 = resultsModel(kestrel({ line: 30 }), { asOf: AS_OF }).rows;
  assert.equal(stateWords(at30.find((r) => r.text === 'Partner channel')), 'Needs managing');
  const at80 = resultsModel(kestrel({ line: 80 }), { asOf: AS_OF }).rows;
  assert.deepEqual(at80.filter((r) => r.q).map((r) => r.text), ['Enterprise sales team']);
});

test('questions to start with: up to three, each with its topic and why it is asked', () => {
  const { questions } = resultsModel(kestrel(), { asOf: AS_OF });
  assert.deepEqual(questions.map((q) => [q.label, q.question, q.reason]), [
    ['Timing', 'Is “Enterprise sales team” worth a sprint of extra resource to finish by Dec 2026, or should its timeline change?', 'You rated its progress “Bad”, and it’s due to finish in 2 months.'],
    ['Resource', 'Is “New office fit-out” worth the resource it takes?', 'You rated its resource requirements “High”, and its strategic importance is 15%.'],
    ['Success Factors', 'What could strongly support “A team with the right skills in the right roles”?', 'You didn’t rate any project “High” for this Success Factor.'],
  ]);
  // A question about a project names it, so pointing at it can light its dot.
  assert.equal(questions[0].projectId, 'p0');
  assert.equal(questions[2].projectId, undefined);
});

test('Success Factors: Critical, Very important, Important, and one no project rates High says so', () => {
  assert.deepEqual(CSF_LEVELS.map((l) => l.name), ['Critical', 'Very important', 'Important']);
  const { factors, gaps } = resultsModel(kestrel(), { asOf: AS_OF });
  assert.deepEqual(factors.map((f) => csfLevelName(csfLevel(f))), ['Critical', 'Very important', 'Very important', 'Important']);
  assert.deepEqual(gaps, ['f2']);
});

test('an older Health Check: every Success Factor reads Very important, the line is 50', () => {
  const old = resultsModel(kestrel({ levels: null }), { asOf: AS_OF });
  assert.equal(old.line, 50);
  assert.deepEqual(old.factors.map((f) => csfLevelName(csfLevel(f))), Array(4).fill('Very important'));
  assert.deepEqual(old.rows.map((r) => r.pct), [83, 58, 58, 42, 75, 17, 58]);
});

test('the example report says "their" and "They"', () => {
  const e = resultsModel(EXAMPLE.draft, { asOf: EXAMPLE.asOf, theirs: true });
  assert.equal(e.rows.length, 8);
  assert.equal(headlineLine(e.headline, true), '2 of their 5 important projects are moving well.');
  assert.ok(e.questions.length >= 1 && e.questions.length <= 3);
  for (const q of e.questions) assert.match(q.reason, /^(They |None of them)/);
  assert.ok(!e.questions.some((q) => /\byou\b|\byour\b/i.test(`${q.question} ${q.reason}`)));
});

test('the chart’s ⓘ: each mark’s word, then its meaning, with the line as it is now', () => {
  assert.equal(CHART_TITLE, 'Strategic importance against progress');
  assert.deepEqual(chartInfo(50), [
    { bold: 'Strategic importance against progress' },
    { term: 'Each dot', meaning: 'It’s a project, numbered as in the list below.' },
    { term: 'Bigger dots', meaning: 'They show projects that require more resource.' },
    { term: 'Important', meaning: 'It’s a project above the line you set, which is now 50%.' },
    { term: 'Too early to tell', meaning: 'It’s a project at the Embryonic stage.' },
  ]);
  assert.equal(chartInfo(70)[3].meaning, 'It’s a project above the line you set, which is now 70%.');
});

test('the Strategic importance ⓘ no longer explains the weights', () => {
  const lines = importanceLines();
  assert.deepEqual(lines, [
    { bold: 'Strategic importance' },
    { line: IMPORTANCE_MEANS },
    { line: 'High on every Success Factor scores 100%.' },
  ]);
  assert.equal(IMPORTANCE_MEANS, 'It’s how much a project helps the Success Factors, out of 100%.');
  const all = JSON.stringify(lines);
  for (const gone of ['40%', '20%', '140%', '120%', 'Critical', 'Very important', 'weight']) assert.ok(!all.includes(gone), `still says ${gone}`);
});

test('what a Success Factor is, and what it is not, word for word', () => {
  assert.deepEqual(SUCCESS_FACTOR_INFO, [
    { bold: 'What is a Success Factor?' },
    { line: 'It’s one of the few things that must go right for you to reach your objective.' },
    { line: 'For example, “Win and keep enterprise clients”.' },
    { heading: 'What it’s not:' },
    { bullets: ['A project or a task, such as “Launch the new CRM”.', 'A target or a measure, such as “£40m in revenue”.'] },
  ]);
});

test('Sort by: four orders, each project keeping its own number', () => {
  assert.deepEqual(SORTS.map(([key, label]) => [key, label]), [
    ['att', 'Most in need of attention'], ['imp', 'Strategic importance'], ['prog', 'Progress'], ['res', 'Resource required'],
  ]);
  const { rows } = resultsModel(kestrel(), { asOf: AS_OF });
  assert.deepEqual(sortRows(rows, 'att').map((r) => r.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(sortRows(rows, 'imp').map((r) => r.pct), [83, 76, 58, 57, 57, 43, 15]);
  assert.deepEqual(sortRows(rows, 'prog').map((r) => PROGS[r.progress]), ['Embryonic', 'Bad', 'Fair', 'Fair', 'Good', 'Good', 'Excellent']);
  assert.deepEqual(sortRows(rows, 'res').map((r) => RES[r.resource][0]), ['Very high', 'High', 'High', 'Moderate', 'Moderate', 'Moderate', 'Low']);
  // Ties keep the ranked order, and the ranked rows themselves are never reordered.
  assert.deepEqual(sortRows(rows, 'prog').filter((r) => r.progress === 3).map((r) => r.n), [3, 4]);
  assert.deepEqual(rows.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7]);
  // A project not rated yet goes last by progress and by resource.
  const partly = kestrel();
  partly.ratings.p0 = { contrib: partly.ratings.p0.contrib, progress: null, resource: null };
  const r2 = resultsModel(partly, { asOf: AS_OF }).rows;
  assert.equal(sortRows(r2, 'prog').at(-1).text, 'Enterprise sales team');
  assert.equal(sortRows(r2, 'res').at(-1).text, 'Enterprise sales team');
});

test('the state in a word or two, and as a sentence', () => {
  const { rows } = resultsModel(kestrel(), { asOf: AS_OF });
  const by = (name) => rows.find((r) => r.text === name);
  assert.deepEqual(
    ['Enterprise sales team', 'Hiring plan for 2027', 'Pricing review', 'Partner channel', 'Data platform'].map((n) => [stateWords(by(n)), stateSentence(by(n))]),
    [
      ['Needs attention', 'It’s important and needs attention.'],
      ['Too early to tell', 'It’s important, but it’s too early to tell.'],
      ['Needs managing', 'It’s important and needs managing.'],
      ['Less important', 'It’s less important to the objective.'],
      ['Moving well', 'It’s important and moving well.'],
    ],
  );
  const partly = kestrel();
  partly.ratings.p0 = { contrib: partly.ratings.p0.contrib, progress: null, resource: null };
  const row = resultsModel(partly, { asOf: AS_OF }).rows.find((r) => r.text === 'Enterprise sales team');
  assert.equal(stateWords(row), 'Not rated yet');
  assert.equal(stateSentence(row), 'It isn’t fully rated yet.');
});

test('the answers people choose from say Success Factor, never CSF', () => {
  assert.deepEqual(CON.map(([word]) => word), ['None', 'Low', 'Medium', 'High']);
  assert.deepEqual(PROG.slice(1).map(([word]) => word), ['Embryonic', 'Bad', 'Fair', 'Good', 'Excellent']);
  assert.deepEqual(RES.slice(1).map(([word]) => word), ['Minimal', 'Low', 'Moderate', 'High', 'Very high']);
  const all = JSON.stringify([CON, PROG, RES, SORTS, SUCCESS_FACTOR_INFO, chartInfo(50), importanceLines()]);
  assert.ok(!/CSF|Critical Success Factor/.test(all));
  // Every meaning is a full sentence.
  for (const [, meaning] of [...CON, ...PROG.slice(1), ...RES.slice(1)]) assert.match(meaning, /^[A-Z].+\.$/);
});
