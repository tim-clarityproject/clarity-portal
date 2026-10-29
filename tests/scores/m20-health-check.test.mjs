// npm run test:scores: methods M20.1, version 1.4 (Health Check 3). The CSF
// weights (test case M20-4), each Health Check's own line for "important",
// the headline, the questions to start with and dot size, through
// src/lib/scores/m20.js. The worked examples are the mock-up's (M7b version
// 46) invented results for Kestrel Group.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/scores/m20.js';
import { dataFromDraft, draftFromData } from '../../src/pages/alignment/alignmentFlow.js';

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.005, `${msg ?? ''}: expected ${expected}, got ${actual}`);

// ---------------------------------------------------------------- the mock-up's results
const CON = { None: 0, Low: 1, Medium: 2, High: 3 };
const KESTREL = {
  csfs: [
    { id: 'c1', text: 'Win and keep enterprise clients', level: 3 },
    { id: 'c2', text: 'A product customers recommend', level: 2 },
    { id: 'c3', text: 'A team with the right skills in the right roles', level: 2 },
    { id: 'c4', text: 'Cash to invest ahead of growth', level: 1 },
  ],
  projects: [
    ['p1', 'Enterprise sales team', [3, 2, 2, 3], 2, 5, '2026-12'],
    ['p2', 'Customer success programme', [3, 3, 1, 2], 4, 3, '2027-03'],
    ['p3', 'Pricing review', [2, 2, 0, 3], 3, 2, '2026-12'],
    ['p4', 'Hiring plan for 2027', [2, 1, 2, 2], 1, 4, '2027-06'],
    ['p5', 'Partner channel', [2, 1, 1, 1], 3, 3, 'open'],
    ['p6', 'New office fit-out', [0, 0, 1, 1], 4, 4, '2026-11'],
    ['p7', 'Data platform', [1, 3, 1, 2], 5, 3, '2026-12'],
  ],
};

/** A Health Check's pieces from compact rows: [id, name, contributions, progress, resource, due]. */
function build(csfs, rows) {
  const projects = rows.map(([id, text, , , , due]) => ({ id, text, ...(due ? { due } : {}) }));
  const owner = Object.fromEntries(rows.map(([id, , c, progress, resource]) => [id, {
    contrib: Object.fromEntries((c || []).map((v, i) => [csfs[i].id, v]).filter(([, v]) => v != null)),
    ...(progress != null ? { progress } : {}),
    ...(resource != null ? { resource } : {}),
  }]));
  return { csfs, projects, owner, ranked: S.m20RankProjects(projects, csfs, owner) };
}
const pctOf = (ranked, name) => ranked.find((r) => r.project.text === name).importance;
const kestrel = () => build(KESTREL.csfs, KESTREL.projects);
const unweighted = (csfs) => csfs.map((f) => ({ id: f.id, text: f.text }));

// ---------------------------------------------------------------- M20-4: CSF weights
test('M20-4: CSF weights Critical, Very important, Very important, Important (1.4, 1.2, 1.2, 1)', () => {
  const { ranked } = kestrel();
  const contrib = (names) => Object.fromEntries(names.map((n, i) => [KESTREL.csfs[i].id, CON[n]]));
  const ids = KESTREL.csfs.map((f) => f.id);
  const levels = S.m20CsfLevels(KESTREL.csfs);
  // Customer success programme: High, High, Low, Medium.
  const csp = contrib(['High', 'High', 'Low', 'Medium']);
  near(S.m20StrategicImportance(csp, ids, levels), 1100 / 14.4, 'Customer success programme, exact');
  assert.equal(Math.round(S.m20StrategicImportance(csp, ids, levels)), 76);
  assert.equal(Math.round(S.m20StrategicImportance(csp, ids)), 75, 'unweighted');
  // New office fit-out: None, None, Low, Low.
  const fit = contrib(['None', 'None', 'Low', 'Low']);
  assert.equal(Math.round(S.m20StrategicImportance(fit, ids, levels)), 15);
  assert.equal(Math.round(S.m20StrategicImportance(fit, ids)), 17, 'unweighted');
  // The same through the ranking, with the mock-up's other figures.
  assert.equal(Math.round(pctOf(ranked, 'Customer success programme')), 76);
  assert.equal(Math.round(pctOf(ranked, 'New office fit-out')), 15);
  assert.equal(Math.round(pctOf(ranked, 'Pricing review')), 57, 'Pricing review (58% unweighted)');
  assert.equal(Math.round(pctOf(ranked, 'Enterprise sales team')), 83, 'Enterprise sales team (unchanged)');
  assert.deepEqual(S.M20_CSF_WEIGHTS, { 1: 1, 2: 1.2, 3: 1.4 });
  assert.deepEqual(S.M20_CSF_LEVELS.map((l) => [l.level, l.name]), [[3, 'Critical'], [2, 'Very important'], [1, 'Important']]);
});

test('M20-4: with every CSF at Very important the figures are exactly today\'s, so older Health Checks are unchanged', () => {
  // Every combination of 1 to 5 CSFs scored 0 to 3, through a seeded walk.
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 5000; t++) {
    const n = 1 + rnd(6);
    const ids = Array.from({ length: n }, (_, i) => `f${i}`);
    const contrib = Object.fromEntries(ids.filter(() => rnd(5)).map((id) => [id, rnd(4)]));
    const today = (ids.reduce((s, id) => s + (contrib[id] || 0), 0) / (n * 3)) * 100;
    const allTwo = Object.fromEntries(ids.map((id) => [id, 2]));
    assert.equal(S.m20StrategicImportance(contrib, ids, allTwo), today, 'every CSF at level 2');
    assert.equal(S.m20StrategicImportance(contrib, ids), today, 'no levels saved');
  }
  // Through the ranking, an older Health Check (no level on any CSF) and the
  // same one with every CSF set to Very important rank and score alike.
  const older = build(unweighted(KESTREL.csfs), KESTREL.projects).ranked;
  const allVery = build(KESTREL.csfs.map((f) => ({ ...f, level: 2 })), KESTREL.projects).ranked;
  assert.deepEqual(allVery, older);
  assert.equal(older.find((r) => r.project.id === 'p2').importance, 75);
  near(S.m20AttentionScore(700 / 12, 1, 5), 36.46, 'M20-2 still holds');
});

test('a CSF\'s level: none saved, or a bad one, reads as Very important', () => {
  assert.equal(S.m20CsfLevel({}), 2);
  assert.equal(S.m20CsfLevel(null), 2);
  [0, 4, '3', 2.5, null].forEach((level) => assert.equal(S.m20CsfLevel({ level }), 2, String(level)));
  [1, 2, 3].forEach((level) => assert.equal(S.m20CsfLevel({ level }), level));
  assert.equal(S.m20CsfLevelName(3), 'Critical');
  assert.equal(S.m20CsfLevelName(1), 'Important');
  assert.equal(S.m20CsfLevelName(undefined), 'Very important');
});

test('removing a CSF removes its weight', () => {
  // Without its Critical first CSF, Customer success programme is
  // (3 x 1.2 + 1 x 1.2 + 2 x 1) / (3 x 3.4) = 6.8 / 10.2 = 66.67%.
  const left = KESTREL.csfs.slice(1);
  const { ranked } = build(left, KESTREL.projects.map(([id, t, c, ...rest]) => [id, t, c.slice(1), ...rest]));
  near(pctOf(ranked, 'Customer success programme'), 66.67);
  // A score still saved for the removed CSF never counts.
  const ids = left.map((f) => f.id);
  near(S.m20StrategicImportance({ c1: 3, c2: 3, c3: 1, c4: 2 }, ids, S.m20CsfLevels(KESTREL.csfs)), 66.67, 'the removed CSF\'s level is ignored');
  // The saved answers lose the CSF with its level.
  const data = dataFromDraft(draftFromData({ objective: 'x', csfs: left, projects: [] }));
  assert.deepEqual(data.csfs.map((f) => f.level), [2, 2, 1]);
});

// ---------------------------------------------------------------- the line
test('the line: 30 to 80 in steps of 10, and 50 when none is saved', () => {
  assert.deepEqual(S.M20_LINE_CHOICES, [30, 40, 50, 60, 70, 80]);
  assert.equal(S.m20ImportantLine({}), 50);
  assert.equal(S.m20ImportantLine(null), 50);
  assert.equal(S.m20ImportantLine(undefined), 50);
  [30, 40, 50, 60, 70, 80].forEach((line) => assert.equal(S.m20ImportantLine({ importantLine: line }), line));
  [20, 55, 90, '60', null, 60.5].forEach((line) => assert.equal(S.m20ImportantLine({ importantLine: line }), 50, String(line)));
});

test('the line: exactly at the line is not above it, at 30, 50 and 80', () => {
  for (const line of [30, 50, 80]) {
    assert.equal(S.m20IsAboveLine(line, line), false, `${line}% at ${line}`);
    assert.equal(S.m20IsAboveLine(line + 0.01, line), true);
    [2, 3, 4, 5].forEach((p) => assert.equal(S.m20State(p, line, line), 'less_important', `progress ${p} at ${line}`));
    assert.equal(S.m20State(4, line + 0.01, line), 'moving_well');
    assert.equal(S.m20State(3, line + 0.01, line), 'needs_managing');
    assert.equal(S.m20State(2, line + 0.01, line), 'needs_attention');
    assert.equal(S.m20IsTooEarly(1, line, line), false, 'Embryonic at the line is less important');
    assert.equal(S.m20IsTooEarly(1, line + 0.01, line), true, 'Embryonic above the line is too early to tell');
    assert.equal(S.m20State(1, line + 0.01, line), 'less_important', 'drawn as it was: too early to tell');
  }
  // At 30 a 31% project is important; at 80 an 79% one is not.
  assert.equal(S.m20State(4, 31, 30), 'moving_well');
  assert.equal(S.m20State(4, 79, 80), 'less_important');
  assert.equal(S.m20State(4, 80.5, 80), 'moving_well');
  // None saved: the four states are as before (the line defaults to 50).
  assert.equal(S.m20State(4, 50), 'less_important');
  assert.equal(S.m20State(4, 50.01), 'moving_well');
  assert.equal(S.m20Area(2, 60, 70), 'neutral');
  assert.equal(S.m20Area(2, 60), 'attention');
});

test('the line moves the four states, too early to tell, the headline and the questions', () => {
  const { ranked, csfs } = kestrel();
  // Customer success programme is 76%: important at 70, not at 80.
  assert.equal(S.m20Headline(ranked, { line: 70 }).big, '1 of 2');
  assert.equal(S.m20Headline(ranked, { line: 80 }).big, '0 of 1');
  assert.equal(S.m20Headline(ranked, { line: 30 }).big, '2 of 6');
  // At 60, the Hiring plan (58%, Embryonic) is no longer too early to tell.
  assert.equal(S.m20Headline(ranked, { line: 60 }).rest, '1 needs attention.');
  // At 80, Enterprise sales team (83%) is still above, so Timing stays.
  assert.equal(S.m20Questions(ranked, csfs, { line: 80, asOf: '2026-10' })[0].kind, 'timing');
});

// ---------------------------------------------------------------- the headline
test('the headline: the mock-up\'s "2 of 5", with the rest adding up to the total', () => {
  const h = S.m20Headline(kestrel().ranked);
  assert.equal(h.big, '2 of 5');
  assert.equal(h.line, 'important projects are moving well.');
  assert.equal(h.rest, '1 needs managing, 1 needs attention and 1 is too early to tell.');
  assert.equal(h.movingWell + h.needsManaging + h.needsAttention + h.tooEarly, h.important);
  assert.deepEqual([h.important, h.movingWell, h.needsManaging, h.needsAttention, h.tooEarly], [5, 2, 1, 1, 1]);
});

test('the headline: singular and plural', () => {
  const csfs = [{ id: 'a', text: 'A' }];
  const one = build(csfs, [['x', 'X', [3], 4, 3]]).ranked;
  assert.equal(S.m20Headline(one).big, '1 of 1');
  assert.equal(S.m20Headline(one).line, 'important projects is moving well.');
  assert.equal(S.m20Headline(one).rest, '');
  const many = build(csfs, [
    ['a', 'A', [3], 3, 3], ['b', 'B', [3], 3, 3], ['c', 'C', [3], 2, 3], ['d', 'D', [3], 2, 3],
    ['e', 'E', [3], 1, 3], ['f', 'F', [3], 1, 3], ['g', 'G', [3], 5, 3], ['h', 'H', [3], 4, 3], ['i', 'I', [0], 4, 3],
  ]).ranked;
  const h = S.m20Headline(many);
  assert.equal(h.big, '2 of 8');
  assert.equal(h.line, 'important projects are moving well.');
  assert.equal(h.rest, '2 need managing, 2 need attention and 2 are too early to tell.');
  const two = S.m20Headline(build(csfs, [['a', 'A', [3], 3, 3], ['b', 'B', [3], 1, 3]]).ranked);
  assert.equal(two.big, '0 of 2');
  assert.equal(two.line, 'important projects are moving well.');
  assert.equal(two.rest, '1 needs managing and 1 is too early to tell.');
});

test('the headline: none important', () => {
  const csfs = [{ id: 'a', text: 'A' }];
  const low = build(csfs, [['a', 'A', [1], 4, 3], ['b', 'B', [3]], ['c', 'C', [], 2, 3]]).ranked;
  const h = S.m20Headline(low);
  assert.equal(h.important, 0);
  assert.equal(h.big, '0');
  assert.equal(h.line, 'None of your important projects is under way yet.');
  assert.equal(h.rest, '');
  assert.equal(S.m20Headline(low, { theirs: true }).line, 'None of their important projects is under way yet.');
  assert.equal(S.m20Headline([]).big, '0');
});

// ---------------------------------------------------------------- the questions
test('the questions: the mock-up\'s three, the most urgent first', () => {
  const { ranked, csfs } = kestrel();
  assert.deepEqual(S.m20Questions(ranked, csfs, { asOf: '2026-10' }), [
    {
      kind: 'timing',
      label: 'Timing',
      question: 'Is “Enterprise sales team” worth a sprint of extra resource to finish by Dec 2026, or should its timeline change?',
      reason: 'You rated its progress Bad, and it’s due to finish in 2 months.',
      projectId: 'p1',
    },
    {
      kind: 'resource',
      label: 'Resource',
      question: 'Is “New office fit-out” worth the resource it takes?',
      reason: 'You rated its resource High, and its strategic importance is 15%.',
      projectId: 'p6',
    },
    {
      kind: 'csf',
      label: 'CSF cover',
      question: 'What could strongly support “A team with the right skills in the right roles”?',
      reason: 'You didn’t rate any project High for this CSF.',
      csfId: 'c3',
    },
  ]);
});

test('the questions: the example report says "They" and "their"', () => {
  const { ranked, csfs } = kestrel();
  const q = S.m20Questions(ranked, csfs, { asOf: '2026-10', theirs: true });
  assert.equal(q[0].reason, 'They rated its progress Bad, and it’s due to finish in 2 months.');
  assert.equal(q[1].reason, 'They rated its resource High, and its strategic importance is 15%.');
  assert.equal(q[2].reason, 'They didn’t rate any project High for this CSF.');
  const fix = build([{ id: 'a', text: 'A' }], [['x', 'Fix me', [3], 2, 3]]).ranked;
  assert.equal(S.m20Questions(fix, [], { theirs: true })[0].reason, 'They rated its progress Bad, and it’s above their line for important.');
  const fine = build([{ id: 'a', text: 'A' }], [['x', 'X', [3], 4, 3]]).ranked;
  assert.equal(S.m20Questions(fine, [{ id: 'a', text: 'A' }], { theirs: true })[0].question, 'What will keep their important projects on track?');
});

test('Timing: above the line, Bad or Fair, due within 3 months or past; the month wording', () => {
  const csfs = [{ id: 'a', text: 'A' }];
  const timing = (due, progress = 2, extra = {}) => S.m20Questions(build(csfs, [['x', 'Late one', [3], progress, 3, due]]).ranked, [], { asOf: '2026-10', ...extra })
    .find((q) => q.kind === 'timing');
  assert.equal(timing('2026-10').reason, 'You rated its progress Bad, and it’s due to finish this month.');
  assert.equal(timing('2026-11').reason, 'You rated its progress Bad, and it’s due to finish next month.');
  assert.equal(timing('2026-12').reason, 'You rated its progress Bad, and it’s due to finish in 2 months.');
  assert.equal(timing('2027-01', 3).reason, 'You rated its progress Fair, and it’s due to finish in 3 months.');
  assert.equal(timing('2027-01').question, 'Is “Late one” worth a sprint of extra resource to finish by Jan 2027, or should its timeline change?');
  assert.equal(timing('2026-09').reason, 'You rated its progress Bad, and it was due to finish in Sep 2026.');
  assert.equal(timing('2025-02').reason, 'You rated its progress Bad, and it was due to finish in Feb 2025.');
  assert.equal(timing('2027-02'), undefined, '4 months away is not soon');
  assert.equal(timing('open'), undefined, 'open-ended');
  assert.equal(timing(undefined), undefined, 'no date');
  assert.equal(timing('2026-11', 4), undefined, 'Good progress');
  assert.equal(timing('2026-11', 1), undefined, 'Embryonic');
  assert.equal(timing('2026-11', 2, { asOf: undefined }), undefined, 'no Health Check date');
  assert.equal(timing('2026-11', 2, { line: 100 }), undefined, 'not above the line');
  // The Health Check's date as a date, or as a Date, by its month.
  assert.equal(timing('2026-11', 2, { asOf: '2026-10-31' }).reason, 'You rated its progress Bad, and it’s due to finish next month.');
  assert.equal(timing('2026-11', 2, { asOf: new Date(2026, 9, 29) }).reason, 'You rated its progress Bad, and it’s due to finish next month.');
  // Across a year end.
  assert.equal(timing('2027-01', 2, { asOf: '2026-12' }).reason, 'You rated its progress Bad, and it’s due to finish next month.');
  assert.equal(S.m20DueWhen(5, 'Mar 2027'), 'it’s due to finish in 5 months');
});

test('Timing takes the highest in the attention order', () => {
  const csfs = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const { ranked } = build(csfs, [
    ['fair', 'Fair one', [3, 3], 3, 3, '2026-11'],
    ['bad', 'Bad one', [3, 2], 2, 5, '2026-12'],
  ]);
  assert.equal(ranked[0].project.id, 'bad');
  assert.equal(S.m20Questions(ranked, csfs, { asOf: '2026-10' })[0].projectId, 'bad');
});

test('Progress: the highest-ranked that needs attention, never the one Timing named', () => {
  const csfs = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const { ranked } = build(csfs, [
    ['due', 'Due soon', [3, 3], 2, 5, '2026-12'],
    ['next', 'Next behind', [3, 1], 2, 3, '2028-01'],
    ['third', 'Third behind', [2, 2], 2, 2],
  ]);
  const q = S.m20Questions(ranked, csfs, { asOf: '2026-10' });
  assert.deepEqual(q.map((x) => [x.kind, x.projectId]), [['timing', 'due'], ['progress', 'next']]);
  assert.equal(q[1].question, 'What would get “Next behind” back on track?');
  assert.equal(q[1].reason, 'You rated its progress Bad, and it’s above your line for important.');
  // Without a date the same project is asked about under Progress instead.
  const noDate = S.m20Questions(ranked, csfs, {});
  assert.deepEqual(noDate.map((x) => [x.kind, x.projectId]), [['progress', 'due']]);
});

test('Resource: at or below the line with High or Very high; the highest resource, then the lowest importance', () => {
  const csfs = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }];
  const { ranked } = build(csfs, [
    ['h', 'High, 33%', [1, 1], 4, 4],
    ['vh50', 'Very high, 50%', [2, 1], 4, 5],
    ['vh17', 'Very high, 17%', [1, 0], 4, 5],
    ['top', 'Above the line', [3, 3], 4, 5],
    ['mod', 'Moderate, 0%', [0, 0], 4, 3],
    ['np', 'No progress yet', [0, 0], null, 5],
    ['nr', 'Not rated', [], 4, 5],
  ]);
  const q = S.m20Questions(ranked, csfs).find((x) => x.kind === 'resource');
  assert.equal(q.projectId, 'vh17');
  assert.equal(q.question, 'Is “Very high, 17%” worth the resource it takes?');
  assert.equal(q.reason, 'You rated its resource Very high, and its strategic importance is 17%.');
  // Exactly at the line counts as at or below it.
  const at = build(csfs, [['x', 'At the line', [2, 1], 4, 4]]).ranked;
  assert.equal(S.m20Questions(at, csfs).find((x) => x.kind === 'resource').projectId, 'x');
  assert.equal(S.m20Questions(at, csfs, { line: 40 }).find((x) => x.kind === 'resource'), undefined);
  // A tie goes to the first in the list.
  const tie = build(csfs, [['one', 'One', [1, 0], 4, 4], ['two', 'Two', [0, 1], 4, 4]]).ranked;
  assert.equal(S.m20Questions(tie, csfs).find((x) => x.kind === 'resource').projectId, 'one');
});

test('CSF cover: a CSF no project rates High, the heavier first, then the first in the list', () => {
  const csfs = [
    { id: 'a', text: 'First, Important', level: 1 },
    { id: 'b', text: 'Second, Very important' },
    { id: 'c', text: 'Third, Very important', level: 2 },
    { id: 'd', text: 'Covered, Critical', level: 3 },
  ];
  const { ranked } = build(csfs, [['x', 'X', [2, 2, 2, 3], 4, 3]]);
  const q = S.m20Questions(ranked, csfs).find((x) => x.kind === 'csf');
  assert.equal(q.csfId, 'b');
  assert.equal(q.question, 'What could strongly support “Second, Very important”?');
  assert.equal(q.reason, 'You didn’t rate any project High for this CSF.');
  assert.deepEqual(S.m20CsfsWithoutHigh(ranked, csfs), ['a', 'b', 'c']);
  const heavier = csfs.map((f) => (f.id === 'a' ? { ...f, level: 3 } : f));
  assert.equal(S.m20Questions(build(heavier, [['x', 'X', [2, 2, 2, 3], 4, 3]]).ranked, heavier).find((x) => x.kind === 'csf').csfId, 'a');
});

test('On track: only when there is nothing else to ask', () => {
  const csfs = [{ id: 'a', text: 'A' }];
  const { ranked } = build(csfs, [['x', 'X', [3], 4, 3, '2026-11'], ['y', 'Y', [1], 4, 2]]);
  assert.deepEqual(S.m20Questions(ranked, csfs, { asOf: '2026-10' }), [{
    kind: 'on_track',
    label: 'On track',
    question: 'What will keep your important projects on track?',
    reason: 'None of them needs action right now.',
  }]);
});

test('the questions: at most three, each kind once, no project named twice', () => {
  const csfs = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }];
  const { ranked } = build(csfs, [
    ['t', 'Timing one', [3, 3, 0], 2, 5, '2026-11'],
    ['t2', 'Also due', [3, 2, 0], 2, 5, '2026-11'],
    ['p', 'Behind', [3, 1, 0], 2, 4],
    ['r', 'Heavy', [0, 1, 0], 4, 5],
    ['r2', 'Heavy too', [0, 1, 0], 4, 5],
  ]);
  const q = S.m20Questions(ranked, csfs, { asOf: '2026-10' });
  assert.deepEqual(q.map((x) => x.kind), ['timing', 'progress', 'resource'], 'CSF cover is the fourth, so it is left out');
  const kinds = q.map((x) => x.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  const named = q.map((x) => x.projectId).filter(Boolean);
  assert.equal(new Set(named).size, named.length);
  assert.deepEqual(named, ['t', 't2', 'r']);
  // Every question names its project or CSF in curly quotes.
  q.forEach((x) => assert.match(x.question, /“[^”]+”/));
});

// ---------------------------------------------------------------- dot size
test('dot size from resource: Minimal and Low small, Moderate middle, High and Very high large, blank Moderate', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(S.m20DotSize), ['small', 'small', 'middle', 'large', 'large']);
  assert.equal(S.m20DotSize(null), 'middle');
  assert.equal(S.m20DotSize(undefined), 'middle');
});

// ---------------------------------------------------------------- saved answers
test('saved answers: the levels and the line round-trip, and an older Health Check gains neither', () => {
  const older = { objective: 'Grow', csfs: [{ id: 'a', text: 'A' }], projects: [{ id: 'p', text: 'P' }], ratings: { owner: { p: { contrib: { a: 3 }, progress: 4 } } } };
  const draft = draftFromData(older);
  assert.equal(draft.importantLine, null);
  assert.equal(S.m20ImportantLine(draft), 50);
  assert.equal(S.m20CsfLevel(draft.csfs[0]), 2);
  assert.deepEqual(dataFromDraft(draft), older);
  // Changing them, on the draft or the data alike.
  const changed = S.m20WithImportantLine(S.m20WithCsfLevel(draft, 'a', 3), 70);
  assert.equal(draft.importantLine, null, 'a new object; the old one is unchanged');
  const saved = dataFromDraft(changed);
  assert.equal(saved.importantLine, 70);
  assert.equal(saved.csfs[0].level, 3);
  const back = draftFromData(saved);
  assert.equal(S.m20ImportantLine(back), 70);
  assert.equal(S.m20CsfLevel(back.csfs[0]), 3);
  // Bad values are refused when set and read as the defaults when saved.
  assert.equal(S.m20WithImportantLine(saved, 55), saved);
  assert.equal(S.m20WithCsfLevel(saved, 'a', 4), saved);
  const damaged = draftFromData({ ...saved, importantLine: 'high', csfs: [{ id: 'a', text: 'A', level: 'Critical' }] });
  assert.equal(S.m20ImportantLine(damaged), 50);
  assert.equal(S.m20CsfLevel(damaged.csfs[0]), 2);
  assert.equal('importantLine' in dataFromDraft(damaged), false);
});
