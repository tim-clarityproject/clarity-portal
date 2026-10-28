// Recovery's pure helpers (src/lib/performance/recovery.js and rows.js
// sprintPause): the paused week, when the sprint picks up and its new
// end, ending early across a week boundary, days added after the chosen
// end has passed, the database's limits, the words on screen, the paused
// and welcome-back sprint page, and a Recovery ended when a sprint starts.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backToday,
  dayCountWords,
  daysLeftWords,
  endValues,
  extendValues,
  finishDay,
  greeting,
  moreDaysMax,
  pendingStart,
  recoveriesEnded,
  recoveryEndOn,
  recoveryLead,
  recoveryRow,
  recoveryToEnd,
  recoveryView,
  sprintPageView,
  sprintPause,
  sprintStanding,
  withRecovery,
} from '../../src/lib/performance/index.js';

// Performance Sprint 4: 8 weeks from Mon 5 Oct 2026, so it was planned to
// end on Sun 29 Nov. A Recovery starts on Thu 22 Oct, in week 3, for 1 week.
const sprint = { id: 's4', number: 4, status: 'running', start_on: '2026-10-05', length_weeks: 8, standard: 85, plan_id: 'p1' };
const open = (over = {}) => ({ id: 'r1', sprint_id: 's4', start_on: '2026-10-22', chosen_days: 7, extended_days: 0, ended_at: null, end_on: null, let_coach_know: true, ...over });

test('a Recovery ends its start plus the days chosen and added', () => {
  assert.equal(recoveryEndOn(open()), '2026-10-29');
  assert.equal(recoveryEndOn(open({ extended_days: 3 })), '2026-11-01');
  assert.equal(recoveryEndOn(open({ ended_at: '2026-10-26T09:00:00Z', end_on: '2026-10-26' })), '2026-10-26');
});

test('the sprint pauses at the week it was in, and its end moves later by the days taken', () => {
  const p = sprintPause(sprint, [open()], '2026-10-24');
  assert.equal(p.week, 3);
  assert.equal(p.complete, false);
  assert.equal(p.picksUpOn, '2026-10-29');
  assert.equal(p.endBefore, '2026-11-29');
  assert.equal(p.endOn, '2026-12-06');
});

test('a Recovery from a week boundary pauses at the next week', () => {
  const p = sprintPause(sprint, [open({ start_on: '2026-10-19' })], '2026-10-20');
  assert.equal(p.week, 3);
  const q = sprintPause(sprint, [open({ start_on: '2026-10-05' })], '2026-10-06');
  assert.equal(q.week, 1);
});

test('once the chosen end has passed, it stays paused and the end counts on from today', () => {
  const p = sprintPause(sprint, [open()], '2026-11-02');
  assert.equal(p.picksUpOn, '2026-11-02');
  // 11 days of Recovery (22 Oct to 1 Nov) so far.
  assert.equal(p.endOn, '2026-12-10');
});

test('ending early across a week boundary: week 3 carries on and the end moves by the days taken', () => {
  const ended = open({ ...endValues(open(), '2026-10-26', new Date('2026-10-26T08:00:00Z')) });
  assert.equal(ended.end_on, '2026-10-26');
  const s = sprintStanding(sprint, [ended], '2026-10-26');
  assert.equal(s.endOn, '2026-12-03');
  assert.equal(backToday([ended], '2026-10-26'), ended);
  assert.equal(backToday([ended], '2026-10-27'), null);
});

test('ending never goes before the start or past the database limit', () => {
  assert.equal(endValues(open(), '2026-10-20').end_on, '2026-10-22');
  assert.equal(endValues(open(), '2027-06-01').end_on, '2027-02-19');
});

test('a few more days: 30 at a time, 60 in all, counted from today once the end has passed', () => {
  assert.equal(moreDaysMax(open(), '2026-10-24'), 30);
  assert.equal(moreDaysMax(open({ extended_days: 45 }), '2026-10-24'), 15);
  assert.equal(moreDaysMax(open({ extended_days: 60 }), '2026-10-24'), 0);
  assert.deepEqual(extendValues(open(), 3, '2026-10-24'), { extended_days: 3 });
  // Due on 29 Oct, answered on 2 Nov with 3 more days: it now ends on 5 Nov.
  const later = extendValues(open(), 3, '2026-11-02');
  assert.equal(recoveryEndOn(open(later)), '2026-11-05');
  assert.deepEqual(extendValues(open({ extended_days: 58 }), 5, '2026-10-24'), { extended_days: 60 });
});

test('a new Recovery keeps its days inside 1 to 30', () => {
  const row = recoveryRow({ id: 'r9', userId: 'u', sprintId: 's4', today: '2026-10-28', days: 45, letCoachKnow: true });
  assert.equal(row.chosen_days, 30);
  assert.equal(row.start_on, '2026-10-28');
  assert.equal(recoveryRow({ id: 'r9', userId: 'u', today: '2026-10-28', days: 0, letCoachKnow: false }).chosen_days, 1);
});

test('the words: days, whole weeks, days left and the greeting', () => {
  assert.equal(dayCountWords(1), '1 day');
  assert.equal(dayCountWords(3), '3 days');
  assert.equal(dayCountWords(7), '1 week');
  assert.equal(dayCountWords(14), '2 weeks');
  assert.equal(dayCountWords(30), '30 days');
  assert.equal(daysLeftWords(1), '1 day left.');
  assert.equal(daysLeftWords(4), '4 days left.');
  assert.equal(greeting(7), 'Good morning');
  assert.equal(greeting(13), 'Good afternoon');
  assert.equal(greeting(20), 'Good evening');
  assert.equal(recoveryLead(open(), '2026-10-24'), 'You’re in recovery until Thu 29 Oct.');
  assert.equal(recoveryLead(open(), '2026-10-29'), 'You’re in recovery.');
});

test('the Recovery pages: until when, days left, due, and the sprint paused', () => {
  const v = recoveryView({ sprint, recoveries: [open()], coach: { firstName: 'Tim' }, firstName: 'Sam', answers: [] }, { today: '2026-10-25' });
  assert.equal(v.state, 'open');
  assert.equal(v.untilText, 'Thu 29 Oct');
  assert.equal(v.daysLeft, 4);
  assert.equal(v.due, false);
  assert.equal(v.sprint.week, 3);
  assert.equal(v.sprint.endOn, 'Sun 6 Dec');
  assert.equal(v.sprint.endBefore, 'Sun 29 Nov');
  assert.equal(recoveryView({ sprint, recoveries: [open()] }, { today: '2026-10-29' }).due, true);
  const none = recoveryView({ sprint, recoveries: [] }, { today: '2026-10-28' });
  assert.equal(none.state, 'none');
  assert.equal(none.endsOn(7), 'Wed 4 Nov');
  assert.equal(none.coach, null);
});

test('the paused sprint page: hidden scores, the paused week dashed, then results for this visit', () => {
  const v = sprintPageView({ sprint, recoveries: [open()], strategies: [], sprintHabits: [], logs: [] }, { today: '2026-10-25' });
  assert.equal(v.state, 'paused');
  assert.equal(v.pause.week, 3);
  assert.equal(v.pause.picksUpOn, 'Thu 29 Oct');
  assert.equal(v.pause.endOn, 'Sun 6 Dec');
  assert.equal(v.pause.endBefore, 'Sun 29 Nov');
  assert.equal(v.pause.due, false);
  assert.deepEqual(v.hiddenWeeks.map((w) => w.state), ['done', 'done', 'paused', 'next', 'next', 'next', 'next', 'next']);
  assert.ok(v.weeks.slice(0, 2).every((w) => ['good', 'below', 'none'].includes(w.state)));
  assert.ok(!v.hiddenWeeks.some((w) => ['good', 'below'].includes(w.state)));
  assert.equal(sprintPageView({ sprint, recoveries: [open()] }, { today: '2026-10-29' }).pause.due, true);
});

test('the first day back is welcomed, the next day is normal', () => {
  const ended = open({ ended_at: '2026-10-26T08:00:00Z', end_on: '2026-10-26' });
  const v = sprintPageView({ sprint, recoveries: [ended], strategies: [], sprintHabits: [], logs: [] }, { today: '2026-10-26' });
  assert.equal(v.state, 'running');
  assert.equal(v.welcomeBack, true);
  assert.equal(v.current, 3);
  assert.equal(v.dates.end, '2026-12-03');
  assert.equal(sprintPageView({ sprint, recoveries: [ended], strategies: [], sprintHabits: [], logs: [] }, { today: '2026-10-27' }).welcomeBack, false);
});

test('starting a sprint ends an open Recovery first, and the old sprint finishes as it then stands', () => {
  const now = new Date('2026-10-26T10:00:00Z');
  const ending = recoveryToEnd([open()], '2026-10-26', now);
  assert.deepEqual(ending, { id: 'r1', values: { ended_at: now.toISOString(), end_on: '2026-10-26' } });
  assert.equal(recoveryToEnd([open({ ended_at: 'x', end_on: '2026-10-25' })], '2026-10-26'), null);
  const rows = recoveriesEnded([open()], ending);
  assert.equal(rows[0].end_on, '2026-10-26');
  assert.equal(finishDay(sprint, rows, '2026-10-26', '2026-10-27'), '2026-10-26');
  const p = pendingStart({ planId: 'p1', number: 5, startOn: '2026-10-27', lengthWeeks: 8, standard: 85, endRecovery: ending }, () => 'id');
  assert.deepEqual(p.endRecovery, ending);
  assert.equal(pendingStart({ planId: 'p1', number: 5, startOn: '2026-10-27', lengthWeeks: 8, standard: 85 }, () => 'id').endRecovery, null);
});

test('a change is put into the rows on the device once, in date order', () => {
  const earlier = { id: 'r0', start_on: '2026-08-01', ended_at: 'x', end_on: '2026-08-08' };
  const rows = withRecovery([earlier, open()], open({ extended_days: 2 }));
  assert.deepEqual(rows.map((r) => r.id), ['r0', 'r1']);
  assert.equal(rows[1].extended_days, 2);
});
