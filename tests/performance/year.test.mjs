// View your year (src/lib/performance/year.js): ISO weeks, where each
// sprint week sits on the year (UNDEFINED in the methods: the calendar
// week of its first day), Recovery weeks (4 or more days, as M0.5), the
// frozen scores and each sprint's M6 average.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heldWeeks, isoWeek, isoWeekMonday, isoWeeksInYear, selectedWeek, yearView } from '../../src/lib/performance/index.js';

test('ISO weeks: Monday start, week 1 holds the first Thursday', () => {
  assert.deepEqual(isoWeek('2026-01-01'), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek('2025-12-29'), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek('2026-10-28'), { year: 2026, week: 44 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
  assert.equal(isoWeeksInYear(2026), 53);
  assert.equal(isoWeeksInYear(2027), 52);
  assert.equal(isoWeekMonday(2026, 1), '2025-12-29');
  assert.equal(isoWeekMonday(2026, 44), '2026-10-26');
});

const finished = (over = {}) => ({ id: 's1', plan_id: 'p', number: 1, label: null, start_on: '2026-03-02', length_weeks: 4, standard: 85, status: 'finished', actual_end_on: '2026-03-29', ...over });
const score = (sprint, week, value, final = true) => ({ sprint_id: sprint, sprint_week: week, week_end: '2026-01-01', score: value, eligible: true, final });

function rows(over = {}) {
  return {
    plan: { id: 'p' },
    sprint: null,
    sprints: [finished()],
    recoveries: [],
    workingPatterns: [],
    personSettings: { time_zone: 'Europe/London', units: 'metric' },
    weekScores: [score('s1', 1, 90), score('s1', 2, 70), score('s1', 4, 85)],
    allDebriefs: [{ sprint_id: 's1', sprint_week: 1, status: 'finished' }],
    ...over,
  };
}

test('a finished sprint sits in the calendar weeks of its weeks’ first days, with its frozen scores', () => {
  const v = yearView(rows(), { today: '2026-10-28' });
  assert.equal(v.year, 2026);
  assert.equal(v.count, 53);
  const s = v.slots.slice(9, 13);
  assert.deepEqual(s.map((x) => x.kind), ['sprint', 'sprint', 'sprint', 'sprint']);
  assert.deepEqual(s.map((x) => x.state), ['good', 'below', 'none', 'good']);
  assert.deepEqual(s.map((x) => x.score), [90, 70, null, 85]);
  assert.equal(s[2].tip.value, 'Not scored yet');
  assert.equal(s[0].tip.when, 'Performance Sprint 1, week 1');
  assert.deepEqual(v.toFreeze, [{ sprintId: 's1', week: 3 }]);
  // M6: the mean of the finished weeks with a score, (90 + 70 + 85) / 3 = 81.7, shown as 82%.
  assert.equal(v.sprints[0].average, '82%');
  assert.equal(v.sprints[0].weeksText, '4 weeks, weeks 10 to 13');
  assert.deepEqual(v.standardLines, [{ value: 85, from: 1, to: 53 }]);
  assert.equal(v.selected, 44);
  assert.equal(v.slots[43].kind, 'empty');
  assert.deepEqual(selectedWeek(v, 10).lines, ['Performance Sprint 1, week 1', 'Debriefed']);
  assert.equal(selectedWeek(v, 10).score, 90);
  assert.deepEqual(selectedWeek(v, 44).lines, ['No sprint running']);
});

test('Recovery: a calendar week with 4 or more Recovery days and no sprint week is Recovery', () => {
  const recoveries = [
    { id: 'r1', sprint_id: null, start_on: '2026-04-06', chosen_days: 5, extended_days: 0, ended_at: '2026-04-11T08:00:00Z', end_on: '2026-04-11' },
    { id: 'r2', sprint_id: null, start_on: '2026-06-01', chosen_days: 3, extended_days: 0, ended_at: '2026-06-04T08:00:00Z', end_on: '2026-06-04' },
  ];
  const v = yearView(rows({ recoveries }), { today: '2026-10-28' });
  assert.equal(v.slots[14].kind, 'recovery');
  assert.equal(v.slots[14].recoveryDays, 5);
  assert.deepEqual(v.slots[14].tip.extra, ['You were in recovery this week.']);
  assert.equal(v.slots[22].kind, 'empty');
  assert.equal(v.slots[22].recoveryDays, 3);
  assert.deepEqual(selectedWeek(v, 15).lines, ['Recovery', 'You were in recovery this week.']);
});

test('a sprint finished early holds no weeks after its last day', () => {
  const s = finished({ id: 's2', number: 2, start_on: '2026-05-04', length_weeks: 8, actual_end_on: '2026-05-20' });
  assert.equal(heldWeeks(s, [], '2026-10-28').weeks.length, 2);
  const v = yearView(rows({ sprints: [finished(), s], weekScores: [score('s2', 1, 88), score('s2', 2, 91)] }), { today: '2026-10-28' });
  assert.deepEqual(v.slots.filter((x) => x.sprintNumber === 2).map((x) => x.week), [19, 20]);
  assert.equal(v.sprints[1].weeksText, '8 weeks, weeks 19 to 20');
  assert.equal(v.sprints[1].average, '90%');
});

test('different standards: one labelled line over each sprint’s own weeks', () => {
  const s = finished({ id: 's2', number: 2, start_on: '2026-05-04', length_weeks: 2, standard: 80, actual_end_on: '2026-05-17' });
  const v = yearView(rows({ sprints: [finished(), s], weekScores: [score('s2', 1, 82)] }), { today: '2026-10-28' });
  assert.deepEqual(v.standardLines, [{ value: 85, from: 10, to: 13 }, { value: 80, from: 19, to: 20 }]);
  assert.equal(v.slots[18].state, 'good');
});

test('in recovery every score is hidden', () => {
  const open = { id: 'r', sprint_id: null, start_on: '2026-10-26', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null };
  const v = yearView(rows({ recoveries: [open] }), { today: '2026-10-28' });
  assert.equal(v.hidden, true);
  assert.ok(v.slots.filter((x) => x.kind === 'sprint').every((x) => x.state === 'hidden' && x.score == null));
  assert.equal(v.sprints[0].average, null);
  assert.deepEqual(v.standardLines, []);
});
