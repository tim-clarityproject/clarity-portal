// The end-of-sprint review (src/lib/performance/sprintReview.js): the
// opening (UNDEFINED 8: the standard decides), "Since you started" (M6),
// each objective's lines (M9), the habits that stuck (UNDEFINED 9: kept up,
// M11, in at least 75% of the finished weeks) and what finishing changes
// in the plan (versions.js decides major or minor).
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planChangeKind,
  reviewOpening,
  reviewPlanChanges,
  reviewView,
  sinceStartedLine,
  unfinishedNotes,
} from '../../src/lib/performance/index.js';

test('the opening: great at or above the standard (on the shown figure), calm below', () => {
  assert.deepEqual(reviewOpening(86, 85, 'Sam'), { great: true, question: 'Great sprint, Sam! You averaged 86%.' });
  assert.equal(reviewOpening(84.5, 85, 'Sam').great, true); // shown as 85%
  assert.equal(reviewOpening(84.4, 85, 'Sam').question, 'Not your strongest sprint. What still went well?');
  assert.equal(reviewOpening(90, 85, null).question, 'Great sprint! You averaged 90%.');
  assert.equal(reviewOpening(null, 85, 'Sam').question, 'Let’s look back on this sprint.');
});

test('Since you started says only the parts with data', () => {
  assert.equal(sinceStartedLine({ averageChange: 5, hardwareChange: 12, objectivesReached: 1 }), 'Since you started, your average is up 5 points, your Hardware score is up 12 points and you’ve reached 1 objective.');
  assert.equal(sinceStartedLine({ averageChange: -3, hardwareChange: null, objectivesReached: 2 }), 'Since you started, your average is down 3 points and you’ve reached 2 objectives.');
  assert.equal(sinceStartedLine({ averageChange: null, hardwareChange: null, objectivesReached: 0 }), null);
});

// Performance Sprint 2: two weeks from Mon 5 Oct 2026, seen on Tue 20 Oct
// (both weeks finished). One Strategy serving one objective; a habit for
// this sprint only, 3 sessions a week, kept up both weeks; a plan habit,
// once a week, done in week 1 only.
function rows(over = {}) {
  const setting = (id, sh, m) => ({ id, sprint_habit_id: sh, from_week: 1, unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, ...m });
  const log = (sh, date) => ({ id: `${sh}-${date}`, sprint_habit_id: sh, local_date: date, value: 1, to_confirm: false });
  return {
    plan: { id: 'p', mission: 'Lead well', major: 3, minor: 2 },
    sprint: { id: 's2', plan_id: 'p', number: 2, status: 'running', start_on: '2026-10-05', length_weeks: 2, standard: 85, label: null },
    sprints: [
      { id: 's1', plan_id: 'p', number: 1, status: 'finished', start_on: '2026-09-07', length_weeks: 2, standard: 85, actual_end_on: '2026-09-20' },
      { id: 's2', plan_id: 'p', number: 2, status: 'running', start_on: '2026-10-05', length_weeks: 2, standard: 85 },
    ],
    weekScores: [
      { sprint_id: 's1', sprint_week: 1, week_end: '2026-09-13', score: 90, eligible: true, final: true },
      { sprint_id: 's1', sprint_week: 2, week_end: '2026-09-20', score: 80, eligible: true, final: true },
    ],
    objectives: [{ id: 'o1' }],
    planObjectives: [
      { id: 'o1', plan_id: 'p', name: 'Coaching clients', kind: 'number', unit: null, direction: 'up', start_value: 24, start_set_on: '2026-01-05', target_value: 40, by_when: '2027-12-31', due_on: null, reached_on: null, sort_order: 0 },
      { id: 'o2', plan_id: 'p', name: 'Publish my book', kind: 'milestone', unit: null, direction: 'up', start_value: null, start_set_on: '2026-01-05', target_value: null, by_when: null, due_on: '2027-06-30', reached_on: '2026-10-10', sort_order: 1 },
    ],
    figures: [
      { id: 'f1', objective_id: 'o1', value: 31, recorded_on: '2026-10-01', created_at: '2026-10-01T08:00:00Z' },
      { id: 'f2', objective_id: 'o1', value: 34, recorded_on: '2026-10-16', created_at: '2026-10-16T08:00:00Z' },
    ],
    strategies: [{ id: 'g', name: 'Grow through referrals' }],
    links: [{ strategy_id: 'g', objective_id: 'o1' }],
    planHabits: [{ id: 'ph', plan_id: 'p', strategy_id: 'g', name: 'Strategic block', measure: 'yes_no_weekly', impact: 2, sort_order: 0 }],
    sprintHabits: [
      { id: 'mob', sprint_id: 's2', habit_id: null, strategy_id: 'g', name: 'Mobility sessions', sort_order: 0 },
      { id: 'blk', sprint_id: 's2', habit_id: 'ph', strategy_id: 'g', name: 'Strategic block', sort_order: 1 },
    ],
    sprintSettings: [
      setting('mob1', 'mob', { measure: 'count', unit: 'sessions', target: 3, target_per: 'week', impact: 2 }),
      setting('blk1', 'blk', { measure: 'yes_no_weekly', impact: 2 }),
    ],
    logs: [
      ...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13', '2026-10-14'].map((d) => log('mob', d)),
      log('blk', '2026-10-06'),
    ],
    todos: [],
    todoMoves: [],
    wins: [],
    winLinks: [],
    recoveries: [],
    workingPatterns: [],
    debriefs: [],
    checkins: [{ month: '2026-08-01', hardware_score: 60 }, { month: '2026-10-01', hardware_score: 72 }],
    personSettings: { units: 'metric' },
    firstName: 'Sam',
    latestVersion: null,
    ...over,
  };
}

test('the review of an ended sprint: figures from the scores library', () => {
  const v = reviewView(rows(), { today: '2026-10-20' });
  assert.equal(v.state, 'over');
  assert.equal(v.name, 'Performance Sprint 2');
  assert.equal(v.nextNumber, 3);
  assert.equal(v.finishOn, '2026-10-18');
  // Week 1: both habits met, 100. Week 2: sessions met, the block not: 50.
  assert.deepEqual(v.weeks.map((w) => w.score), [100, 50]);
  assert.deepEqual(v.weeks.map((w) => w.state), ['good', 'below']);
  assert.equal(v.average, '75%');
  assert.equal(v.opening.question, 'Not your strongest sprint. What still went well?');
  assert.deepEqual(v.atStandard, { value: '1', of: 'of 2' });
  assert.deepEqual(v.best, { value: 'Week 1, 100%', range: 'Mon 5 Oct to Sun 11 Oct', good: true });
  assert.equal(v.lastSprintLine, 'Last sprint, 1 of 2 weeks were at your standard.');
  // Sprint 1 averaged 85, this one 75: down 10; Hardware 60 to 72; the book is reached.
  assert.equal(v.sinceLine, 'Since you started, your average is down 10 points, your Hardware score is up 12 points and you’ve reached 1 objective.');
  assert.deepEqual(v.objectives[0].lines, ['34 of 40', 'Up 3 this sprint', 'By 31 Dec 2027']);
  assert.deepEqual(v.objectives[1].lines, ['Milestone', 'Done', 'By 30 Jun 2027']);
  // Kept up in 2 of 2 (stuck); the block 1 of 2 (50%, not stuck).
  assert.deepEqual(v.stuck.map((h) => [h.name, h.keptLine, h.inPlan]), [['Mobility sessions', 'Kept up in 2 of 2 weeks', false]]);
  assert.equal(v.stuck[0].measureLine, '3 sessions a week');
});

test('a sprint still running, one not started and one paused by Recovery', () => {
  assert.equal(reviewView(rows(), { today: '2026-10-14' }).state, 'running');
  assert.equal(reviewView(rows(), { today: '2026-10-14' }).finishOn, '2026-10-14');
  assert.equal(reviewView(rows(), { today: '2026-10-01' }).state, 'future');
  const open = { id: 'r', sprint_id: 's2', start_on: '2026-10-12', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null };
  assert.equal(reviewView(rows({ recoveries: [open] }), { today: '2026-10-14' }).state, 'paused');
  assert.equal(reviewView(rows({ sprint: null }), { today: '2026-10-14' }).state, 'none');
});

test('finishing: retire, change, add, and a habit that stuck added to the plan', () => {
  const d = rows();
  const draft = {
    objectives: {
      o1: { choice: 'change', edit: { id: 'o1', name: 'Coaching clients', kind: 'number', start: '24', target: '45', date: '2027-12-31', unit: null, saved: true } },
      o2: { choice: 'retire' },
    },
    added: [
      { id: 'o3', name: 'Confidence leading workshops', kind: 'rating', start: '6', target: '8', date: '2027-06-30', unit: null, saved: false },
      { id: 'o4', name: 'Half written', kind: 'number', start: '', target: '', date: '', unit: null, saved: false },
    ],
    stick: { mob: 'h-new' },
  };
  const c = reviewPlanChanges(d, draft, '2026-10-20');
  assert.deepEqual(c.archive, ['o2']);
  assert.deepEqual(c.saves.map((o) => [o.id, o.target, o.startOn ?? null]), [['o1', 45, null], ['o3', 8, '2026-10-20']]);
  assert.equal(c.unfinishedAdded, 1);
  assert.deepEqual(c.habits.map((h) => [h.sprintHabitId, h.row.id, h.row.name, h.row.measure, h.row.target, h.row.targetPer]), [['mob', 'h-new', 'Mobility sessions', 'count', 3, 'week']]);
  // Objectives added and removed: a major version.
  assert.equal(planChangeKind(c.before, c.after), 'major');
  assert.deepEqual(unfinishedNotes(c), ['One new objective isn’t finished, so it isn’t added.']);
});

test('finishing with only a habit added, or nothing changed', () => {
  const d = rows();
  const habitOnly = reviewPlanChanges(d, { objectives: {}, added: [], stick: { mob: 'h-new' } }, '2026-10-20');
  assert.equal(planChangeKind(habitOnly.before, habitOnly.after), 'minor');
  const none = reviewPlanChanges(d, { objectives: { o1: { choice: 'change', edit: { id: 'o1', name: '', kind: 'number', start: '24', target: '40', date: '2027-12-31', saved: true } } }, added: [], stick: {} }, '2026-10-20');
  assert.equal(none.unfinishedChanges, 1);
  assert.equal(planChangeKind(none.before, none.after), null);
});
