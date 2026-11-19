// The coaching day's rules (Phase 6a run 2, step 8): to-do repeats and
// dates, the quick add, Choose what to move's suggestions, capacity and a
// week over it, sessions left after each kind of session, a late
// cancellation and Waive it, the brief's average since the last session,
// the recap nudge's 24 hours, who needs attention and Today's one offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTIMATES, OTHER_ESTIMATES, estimateOk, estimateWords, todoSection, carriedWords, plannedWords, dueWords, checklistWords,
  todoFacts, sortTodos, todayTodos, upcomingGroups, somedayTodos, positionBetween, moveToDay, moveToSomeday, repeatWords,
  repeatValue, nextRepeat, completeTodo, parseQuickAdd, quickAddChips, addedWords, workingDay, callsOn, dayLoad, overWords,
  suggestMoves, moveState, weekStart, capacity, capacityFromTyped, todayOffer, sessionCounts, isLateCancellation,
  outcomeLine, withSessions, withHeldTyped, leftWords, sessionRow, toWriteUp, recapNudges, lastSession, nextSession,
  whenWords, averageSince, prepLine, attentionRows, dayDone, weekDone, doneThisWeek,
} from '../../src/lib/coach/day.js';
import { sessionsLeft } from '../../src/lib/coach/model.js';

const TODAY = '2026-11-17'; // a Tuesday
const at = (day, h = 9, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const todo = (id, extra = {}) => ({ id, title: id, planned_on: TODAY, position: Number(String(id).replace(/\D/g, '')) || 0, checklist: [], ...extra });

test('how long a to-do takes: 15 min, 30 min, 1 h, 2 h, or Other from 45 minutes to 8 hours in 15-minute steps', () => {
  assert.deepEqual(ESTIMATES, [15, 30, 60, 120]);
  assert.equal(OTHER_ESTIMATES[0], 45);
  assert.equal(OTHER_ESTIMATES.at(-1), 480);
  assert.ok(OTHER_ESTIMATES.every((m) => m % 15 === 0 && !ESTIMATES.includes(m)));
  assert.deepEqual([15, 45, 480, null].map(estimateOk), [true, true, true, true]);
  assert.deepEqual([10, 20, 495, 0, 15.5].map(estimateOk), [false, false, false, false, false]);
  assert.deepEqual([15, 60, 90, 120, 480].map(estimateWords), ['15 min', '1 h', '1 h 30 min', '2 h', '8 h']);
});

test('to-do dates: Today and Tomorrow stay single words, a planned day reads "Planned for Wed 18 Nov, 10:00", a deadline "Due Fri"', () => {
  assert.equal(plannedWords({ planned_on: TODAY, planned_time: '10:00:00' }, TODAY), 'Today');
  assert.equal(plannedWords({ planned_on: '2026-11-18', planned_time: '10:00:00' }, TODAY), 'Tomorrow');
  assert.equal(plannedWords({ planned_on: '2026-11-19', planned_time: '10:00:00' }, TODAY), 'Planned for Thu 19 Nov, 10:00');
  assert.equal(plannedWords({ planned_on: '2026-11-23' }, TODAY), 'Planned for Mon 23 Nov');
  assert.equal(plannedWords({ planned_on: '2027-01-04' }, TODAY), 'Planned for Mon 4 Jan 2027');
  assert.equal(plannedWords({}, TODAY), '');
  assert.equal(dueWords({ due_on: '2026-11-20' }, TODAY), 'Due Fri');
  assert.equal(dueWords({ due_on: TODAY }, TODAY), 'Due today');
  assert.equal(dueWords({ due_on: '2026-11-18' }, TODAY), 'Due tomorrow');
  assert.equal(dueWords({ due_on: '2026-11-27' }, TODAY), 'Due Fri 27 Nov');
  assert.equal(dueWords({ due_on: '2026-11-13' }, TODAY), 'Due Fri 13 Nov', 'a deadline that has passed is never called overdue');
  assert.equal(dueWords({ due_on: '2026-02-30' }, TODAY), '', 'a day that doesn’t exist says nothing');
});

test('a carried-over to-do reads "From yesterday" or "From Fri 13 Nov", never overdue, and stays on Today', () => {
  assert.equal(carriedWords({ planned_on: '2026-11-16' }, TODAY), 'From yesterday');
  assert.equal(carriedWords({ planned_on: '2026-11-13' }, TODAY), 'From Fri 13 Nov');
  assert.equal(carriedWords({ planned_on: TODAY }, TODAY), '');
  assert.equal(carriedWords({ planned_on: TODAY, first_planned_on: '2026-11-13' }, TODAY), 'From Fri 13 Nov', 'moved on to today, it still says where it came from');
  assert.equal(carriedWords({ planned_on: '2026-11-13', done_at: at(16) }, TODAY), '');
  assert.equal(todoSection({ planned_on: '2026-11-13' }, TODAY), 'today');
  assert.equal(todoSection({ planned_on: '2026-11-18' }, TODAY), 'upcoming');
  assert.equal(todoSection({}, TODAY), 'someday');
  assert.equal(todoSection({ planned_on: TODAY, done_at: at(17) }, TODAY), 'done');
});

test('Today’s list: Important first, then the coach’s own order, with After work apart', () => {
  const all = [todo('t3'), todo('t1', { important: true, position: 9 }), todo('t2'), todo('aw1', { after_work: true }), todo('u1', { planned_on: '2026-11-19' }), todo('s1', { planned_on: null })];
  const { work, afterWork } = todayTodos(all, TODAY);
  assert.deepEqual(work.map((t) => t.id), ['t1', 't2', 't3']);
  assert.deepEqual(afterWork.map((t) => t.id), ['aw1']);
  assert.deepEqual(sortTodos([todo('t2'), todo('t1')]).map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(somedayTodos(all, TODAY).map((t) => t.id), ['s1']);
  const groups = upcomingGroups([...all, todo('u2', { planned_on: '2026-11-18', planned_time: '14:00' }), todo('u3', { planned_on: '2026-11-18', planned_time: '10:00' })], TODAY);
  assert.deepEqual(groups.map((g) => g.label), ['Tomorrow', 'Thu 19 Nov']);
  assert.deepEqual(groups[0].items.map((t) => t.id), ['u3', 'u2'], 'a day’s to-dos run in time order');
});

test('a to-do’s quiet facts, in M11’s order', () => {
  const lists = [{ id: 'L', name: 'Northfield workshop' }];
  const clients = [{ id: 'C', name: 'Sam Okafor' }];
  assert.deepEqual(todoFacts(todo('t3', { planned_on: '2026-11-16', list_id: 'L', checklist: [{ text: 'a', done: true }, { text: 'b', done: true }, { text: 'c', done: false }] }), { lists, clients, view: 'today' }, TODAY), ['From yesterday', 'Northfield workshop', '2 of 3']);
  assert.deepEqual(todoFacts(todo('t1', { due_on: '2026-11-20' }), { view: 'today' }, TODAY), ['Due Fri']);
  assert.deepEqual(todoFacts(todo('t2', { profile_id: 'C' }), { lists, clients, view: 'today' }, TODAY), ['Sam Okafor']);
  assert.deepEqual(todoFacts(todo('t11', { from_email_sender: 'Ruth Adams' }), { view: 'today' }, TODAY), ['From email']);
  assert.deepEqual(todoFacts(todo('t4', { planned_on: '2026-11-19', planned_time: '10:00' }), { view: 'upcoming' }, TODAY), ['Planned for Thu 19 Nov, 10:00']);
  assert.equal(checklistWords(todo('x')), '');
});

test('moving a to-do keeps the day it was first planned for and drops its old time', () => {
  const moved = moveToDay(todo('t1', { planned_time: '10:00' }), '2026-11-18');
  assert.deepEqual([moved.planned_on, moved.planned_time, moved.first_planned_on, moved.someday], ['2026-11-18', null, TODAY, false]);
  assert.equal(moveToDay(moved, '2026-11-19').first_planned_on, TODAY);
  const some = moveToSomeday(todo('t1'));
  assert.deepEqual([some.planned_on, some.someday], [null, true]);
  assert.equal(positionBetween(null, null), 1000);
  assert.equal(positionBetween(1000, 2000), 1500);
  assert.ok(positionBetween(null, 1000) < 1000 && positionBetween(1000, null) > 1000);
});

test('repeats are a rule: the next day is after the planned day and after today', () => {
  assert.equal(nextRepeat({ every: 'day' }, TODAY, TODAY), '2026-11-18');
  assert.equal(nextRepeat({ every: 'day' }, '2026-11-10', TODAY), '2026-11-18', 'ticked a week late, it never comes back in the past');
  assert.equal(nextRepeat({ every: 'week' }, '2026-11-12', TODAY), '2026-11-19', 'a weekly one keeps its weekday');
  assert.equal(nextRepeat({ every: 'week', interval: 2 }, TODAY, TODAY), '2026-12-01');
  assert.equal(nextRepeat({ every: 'weekday' }, '2026-11-20', '2026-11-20'), '2026-11-23', 'Friday’s next weekday is Monday');
  assert.equal(nextRepeat({ every: 'month' }, '2026-01-31', '2026-02-10'), '2026-02-28', 'a month with no 31st takes its last day');
  assert.equal(nextRepeat({ every: 'month' }, '2026-01-31', '2026-03-01'), '2026-03-31', 'and the 31st comes back after it');
  assert.equal(nextRepeat({ every: 'year' }, '2024-02-29', '2026-11-17'), '2027-02-28');
  assert.equal(nextRepeat({ every: 'day', until: TODAY }, TODAY, TODAY), null, 'a rule that has stopped makes no next one');
  assert.equal(nextRepeat(null, TODAY, TODAY), null);
  assert.equal(nextRepeat({ every: 'day' }, '2027-01-04', TODAY), '2027-01-05', 'done early, the next follows its own day');
  assert.equal(repeatWords({ every: 'week' }, '2026-11-19'), 'Every Thursday');
  assert.equal(repeatWords({ every: 'week', interval: 2 }, TODAY), 'Every 2 weeks');
  assert.equal(repeatWords({ every: 'weekday' }), 'Every weekday');
  assert.equal(repeatValue({ every: 'week', interval: 2 }), 'week2');
  assert.equal(repeatValue(null), 'never');
});

test('ticking a repeating to-do makes the next one, with its checklist unticked', () => {
  const t = todo('t5', { repeat_rule: { every: 'week' }, planned_on: '2026-11-12', checklist: [{ text: 'a', done: true }] });
  const { done, next } = completeTodo(t, at(17, 10), TODAY, 'new');
  assert.equal(done.done_at, at(17, 10));
  assert.equal(done.repeat_rule, null, 'the ticked one keeps no rule, so un-ticking it never makes a second');
  assert.deepEqual([next.id, next.planned_on, next.repeat_of, next.done_at], ['new', '2026-11-19', 't5', null]);
  assert.deepEqual(next.repeat_rule, { every: 'week' });
  assert.deepEqual(next.checklist, [{ text: 'a', done: false }]);
  assert.equal(completeTodo(todo('t1'), at(17), TODAY, 'x').next, null);
});

test('the quick add reads plain words', () => {
  const ctx = { todayKey: TODAY, lists: [{ id: 'L', name: 'Kestrel renewal' }], tags: [{ id: 'E', name: 'Email' }], clients: [{ id: 'C', name: 'Sam Okafor' }] };
  const p = parseQuickAdd('send the renewal pack to Dana tomorrow 10:00 30m #Kestrel renewal @Email !', ctx);
  assert.deepEqual([p.title, p.planned_on, p.planned_time, p.minutes, p.important, p.list_id, p.tag_ids], ['Send the renewal pack to Dana', '2026-11-18', '10:00', 30, true, 'L', ['E']]);
  assert.deepEqual(quickAddChips(p, ctx), ['Tomorrow', 'at 10:00', 'Kestrel renewal', 'Email', 'Important', '30 min']);
  assert.equal(addedWords(p, TODAY), 'Added to Tomorrow.');
  const weekly = parseQuickAdd('Write Leading Ideas every Thursday 1h', ctx);
  assert.deepEqual([weekly.title, weekly.planned_on, weekly.minutes, weekly.repeat_rule], ['Write Leading Ideas', '2026-11-19', 60, { every: 'week' }]);
  const plain = parseQuickAdd('Read the Hogan report', ctx);
  assert.deepEqual([plain.title, plain.planned_on, plain.someday], ['Read the Hogan report', null, true]);
  assert.equal(addedWords(plain, TODAY), 'Added to Someday.');
  const home = parseQuickAdd('Book the boiler service after work', ctx);
  assert.deepEqual([home.title, home.after_work, home.planned_on], ['Book the boiler service', true, TODAY]);
  assert.equal(parseQuickAdd('Call Sam friday #Sam', ctx).profile_id, 'C');
  assert.equal(parseQuickAdd('Call Sam friday', ctx).planned_on, '2026-11-20');
  assert.equal(parseQuickAdd('Plan the offsite #Offsite 2027', ctx).new_list, 'Offsite 2027');
  assert.deepEqual(parseQuickAdd('Ring the venue @Phone', ctx).new_tags, ['Phone']);
  assert.equal(parseQuickAdd('Fix it 20m', ctx).title, 'Fix it 20m', 'an estimate that isn’t a 15-minute step stays in the title');
  assert.equal(parseQuickAdd('   ', ctx).title, '');
  assert.equal(parseQuickAdd('x'.repeat(400), ctx).title.length, 300);
});

test('the working day and a day that is over-full', () => {
  const settings = { working_hours: { tue: { from: '09:00', to: '18:30' }, sat: null } };
  assert.deepEqual(workingDay(settings, TODAY), { from: '09:00', to: '18:30', minutes: 570 });
  assert.equal(workingDay(settings, '2026-11-21'), null, 'a day off');
  assert.equal(workingDay(null, TODAY).minutes, 480, 'no hours set: 09:00 to 17:00 on weekdays');
  const sessions = [
    { id: 's1', starts_at: at(17, 12, 30), minutes: 60 }, { id: 's2', starts_at: at(17, 14), minutes: 90 },
    { id: 's3', starts_at: at(17, 15, 45), minutes: 60, outcome: 'held' }, { id: 's4', starts_at: at(17, 17), minutes: 60 },
    { id: 's5', starts_at: at(17, 10), minutes: 90 }, { id: 's6', starts_at: at(17, 9), minutes: 45 },
    { id: 's7', starts_at: at(17, 8), minutes: 60, outcome: 'moved' }, { id: 's8', starts_at: at(18, 9), minutes: 60 },
  ];
  assert.deepEqual(callsOn(sessions, TODAY).map((s) => s.id), ['s6', 's5', 's1', 's2', 's3', 's4'], 'a moved call takes no time');
  const todos = [todo('t1', { minutes: 30, important: true }), todo('t2', { minutes: 15 }), todo('t3', { minutes: 15 }), todo('t4', { minutes: 15 }), todo('t5', { minutes: 120 }), todo('t6', { minutes: 15 }),
    todo('aw1', { minutes: 60, after_work: true }), todo('d1', { minutes: 60, done_at: at(17, 8) }), todo('u1', { minutes: 60, planned_on: '2026-11-18' })];
  const load = dayLoad({ sessions, todos, settings, dayKey: TODAY });
  assert.deepEqual([load.callMinutes, load.todoMinutes, load.dayMinutes, load.over], [405, 210, 570, 45], 'M11: 6 hours 45 minutes of calls, 3 hours 30 minutes of to-dos, a 9 hour 30 minute day');
  assert.equal(overWords(load.over), '45 minutes over');
  assert.equal(overWords(75), '1 hour 15 minutes over');
  assert.equal(dayLoad({ sessions, todos, settings, dayKey: '2026-11-21' }).over, 0, 'a day off is never over');
});

test('Choose what to move suggests enough to fit, from the bottom up, never an Important one', () => {
  const work = [todo('t1', { minutes: 30, important: true }), todo('t2', { minutes: 15 }), todo('t3', { minutes: 15 }), todo('t4', { minutes: 15 }), todo('t5', { minutes: 120 }), todo('t6', { minutes: 15 })];
  assert.deepEqual(suggestMoves(work, 45), ['t5', 't6'], 'M11’s "Move 2 to tomorrow"');
  assert.deepEqual(suggestMoves(work, 15), ['t6']);
  assert.deepEqual(suggestMoves(work, 0), []);
  assert.deepEqual(suggestMoves([todo('a', { minutes: 60, important: true }), todo('b')], 30), [], 'Important and unestimated to-dos are never suggested');
  assert.deepEqual(suggestMoves(work, 1000), ['t2', 't3', 't4', 't5', 't6'], 'everything but the Important one, when even that won’t fit');
  assert.deepEqual(moveState(work, ['t5', 't6'], 45), { still: 0, line: 'That fits your day.', button: 'Move 2 to tomorrow', count: 2 });
  assert.deepEqual(moveState(work, ['t6'], 45), { still: 30, line: 'Still 30 min over.', button: 'Move 1 to tomorrow', count: 1 });
  assert.equal(moveState(work, [], 45).line, 'Still 45 min over.');
});

test('capacity: coaching hours this week against the target, and a week over it', () => {
  assert.equal(weekStart(TODAY), '2026-11-16');
  assert.equal(weekStart('2026-11-22'), '2026-11-16', 'Sunday belongs to the week that began on Monday');
  const week = (n, minutes = 60) => Array.from({ length: n }, (_, i) => ({ starts_at: at(16 + (i % 5), 9 + Math.floor(i / 5)), minutes }));
  const fine = capacity(week(11), 15, TODAY);
  assert.deepEqual([fine.words, fine.over, fine.overWords, fine.calls], ['11 of 15', false, '', 11]);
  assert.equal(fine.percent, 73);
  const over = capacity(week(17), 15, TODAY);
  assert.deepEqual([over.words, over.over, over.overWords, over.percent], ['17 of 15', true, '2 over', 100], 'the bar is full, never past it');
  assert.equal(capacity([...week(3, 90), { starts_at: at(18, 9), minutes: 60, outcome: 'no_show' }, { starts_at: at(18, 11), minutes: 60, outcome: 'late_cancel' }, { starts_at: at(24, 9), minutes: 60 }], 12, TODAY).words, '4.5 of 12', 'only calls that went ahead or are to come, in this week');
  assert.equal(capacity([], undefined, TODAY).target, 15, '15 hours by default');
  assert.deepEqual(['15', '12.5', '15 hours', '0', '81', 'lots', '7.25'].map(capacityFromTyped), [15, 12.5, 15, null, null, null, null]);
});

test('sessions left after each kind of session, a late cancellation and Waive it', () => {
  assert.deepEqual([{ outcome: 'held' }, { outcome: 'no_show' }, { outcome: 'late_cancel' }, { outcome: 'late_cancel', waived: true }, { outcome: 'moved' }, {}, null].map(sessionCounts), [true, true, true, false, false, false, false]);
  const e = { id: 'e', sessions_total: 12, sessions_held: 3 };
  const s = (outcome, extra = {}) => ({ id: `s-${outcome}-${extra.waived || ''}`, engagement_id: 'e', outcome, ...extra });
  const left = (sessions, people = []) => sessionsLeft(withSessions(e, sessions, people)).left;
  assert.equal(left([]), 9);
  assert.equal(left([s('held')]), 8, 'a session that went ahead uses one');
  assert.equal(left([s('held'), s('late_cancel')]), 7, 'a late cancellation uses one');
  assert.equal(left([s('held'), s('late_cancel', { waived: true })]), 8, 'unless it is waived');
  assert.equal(left([s('held'), s('no_show')]), 7, 'a no-show uses one');
  assert.equal(left([s('held'), s('moved')]), 8, 'a moved session never does');
  assert.equal(left([s(undefined)]), 9, 'a session not yet written up doesn’t count');
  assert.equal(left([{ id: 'g', engagement_id: 'other', outcome: 'held' }], [{ session_id: 'g', engagement_id: 'e' }]), 8, 'a group session counts against a member’s own engagement when theirs is named');
  // Once the database keeps the count (050), its base is used and a session isn't counted twice.
  const kept = withSessions({ id: 'e', sessions_total: 12, sessions_held: 4, sessions_held_base: 3 }, [s('held')]);
  assert.equal(kept.sessions_held, 4);
  const typed = withHeldTyped(kept, 7, kept.sessions_recorded);
  assert.deepEqual([typed.sessions_held, typed.sessions_held_base], [7, 6], 'a count the coach types stands: the base moves');
  assert.equal(withSessions(typed, [s('held')]).sessions_held, 7);
  assert.equal(leftWords({ id: 'x', sessions_total: 6, sessions_held: 4 }, []), '2 sessions left');
  assert.equal(leftWords({ id: 'x', sessions_total: 6, sessions_held: 5 }, []), '1 session left');
  assert.equal(leftWords({ id: 'x', sessions_total: 6, sessions_held: 6 }, []), 'No sessions left');
  assert.equal(leftWords({ id: 'x', kind: 'ongoing' }, []), '');
  assert.equal(isLateCancellation(at(18, 12), at(17, 13)), true, '23 hours before is late');
  assert.equal(isLateCancellation(at(18, 12), at(17, 11)), false, '25 hours before is not');
  assert.equal(outcomeLine('late_cancel', 'Hannah Wells'), 'It counts as one of Hannah’s sessions.');
  assert.equal(outcomeLine('late_cancel', 'Hannah Wells', true), 'Waived. It no longer counts as used.');
  assert.equal(outcomeLine('no_show', 'Hannah Wells'), 'It counts as used, and only you see it.');
  assert.equal(outcomeLine('held', 'Hannah Wells'), '');
});

test('a session’s row, what is waiting to be written up, and the calls either side', () => {
  assert.deepEqual(sessionRow({ starts_at: at(5, 10), minutes: 60, outcome: 'held', kind: 'coaching', recap: 'x', recap_sent_at: at(5, 12) }, TODAY), { title: 'Coaching session', facts: ['60 minutes', 'Recap sent'], when: 'Thu 5 Nov' });
  assert.deepEqual(sessionRow({ starts_at: at(8, 10), minutes: 60, outcome: 'late_cancel', waived: true }, TODAY).facts, ['Waived']);
  assert.equal(sessionRow({ starts_at: at(8, 10), minutes: 60, outcome: 'held', recap: 'x' }, TODAY).facts[1], 'Recap to send');
  const now = new Date(2026, 10, 17, 14, 0);
  const sessions = [{ id: 'a', profile_id: 'c', starts_at: at(16, 15, 30), minutes: 60 }, { id: 'b', profile_id: 'c', starts_at: at(17, 13, 30), minutes: 60 }, { id: 'c', profile_id: 'c', starts_at: at(5, 10), minutes: 60, outcome: 'held' }, { id: 'd', profile_id: 'c', starts_at: at(19, 10), minutes: 60 }];
  assert.deepEqual(toWriteUp(sessions, now).map((s) => s.id), ['a'], 'a call still running isn’t waiting yet');
  assert.equal(lastSession(sessions, (s) => s.profile_id === 'c', now).id, 'c');
  assert.equal(nextSession(sessions, (s) => s.profile_id === 'c', now).id, 'b');
  assert.equal(whenWords(at(17, 12, 30), TODAY), 'Today, 12:30');
  assert.equal(whenWords(at(18, 9), TODAY), 'Tomorrow, 09:00');
  assert.equal(whenWords(at(19, 16), TODAY), 'Thu 19 Nov, 16:00');
});

test('the recap nudge: a recap still unsent 24 hours after a call', () => {
  const held = (id, day, h, extra = {}) => ({ id, outcome: 'held', starts_at: at(day, h), minutes: 60, ...extra });
  const now = new Date(2026, 10, 17, 11, 0);
  assert.deepEqual(recapNudges([held('a', 16, 9), held('b', 16, 10), held('c', 16, 10, { minutes: 30 }), held('d', 15, 9, { recap_sent_at: at(15, 11) }), { id: 'e', outcome: 'no_show', starts_at: at(10, 9), minutes: 60 }], now).map((s) => s.id), ['a', 'b', 'c'],
    '24 hours run from the call’s end: a sent recap, and a call that didn’t go ahead, never nudge');
  assert.deepEqual(recapNudges([held('b', 16, 10)], new Date(2026, 10, 17, 11, 0)).map((s) => s.id), ['b'], 'exactly 24 hours after its end counts');
  assert.deepEqual(recapNudges([held('b', 16, 10)], new Date(2026, 10, 17, 10, 59)).map((s) => s.id), []);
});

test('the brief: the average performance score since the last session', () => {
  const scores = [{ week_end: '2026-11-01', score: 10 }, { week_end: '2026-11-08', score: 80 }, { week_end: '2026-11-15', score: 82 }, { week_end: '2026-11-22', score: 99 }, { week_end: '2026-11-15', score: null }];
  assert.deepEqual(averageSince(scores, at(5, 10), TODAY), { label: 'Average performance score since Thu 5 Nov', value: '81%', none: '' });
  assert.deepEqual(averageSince([], at(5, 10), TODAY), { label: 'Average performance score since Thu 5 Nov', value: null, none: 'No check-ins since Thu 5 Nov.' });
  const first = averageSince(scores, null, TODAY);
  assert.deepEqual([first.label, first.value], ['Average performance score over the last 4 weeks', '57%'], 'a first session: the last 4 weeks');
  assert.equal(prepLine('Sam Okafor', at(15, 19), TODAY), 'Sam added this on Sun 15 Nov.');
});

test('who needs attention: coaching facts only', () => {
  const now = new Date(2026, 10, 17, 9, 0);
  const rows = attentionRows({
    clients: [{ id: 'h', name: 'Hannah Wells' }, { id: 'm', name: 'Marcus Bell' }, { id: 'p', name: 'Past Person', status: 'past' }],
    engagements: [{ id: 'e', profile_id: 'h', sessions_total: 6, sessions_held: 4 }, { id: 'f', profile_id: 'm', kind: 'ongoing', time_credit_minutes: 600 }, { id: 'g', profile_id: 'p', sessions_total: 6, sessions_held: 5 }],
    entries: [{ engagement_id: 'f', started_at: at(2, 9), ended_at: at(2, 16, 50) }],
    sessions: [{ id: 's', profile_id: 'h', engagement_id: 'e', starts_at: at(16, 15, 30), minutes: 60 }],
    now, todayKey: TODAY,
  });
  assert.deepEqual(rows.map((r) => [r.name, r.line, r.action]), [
    ['Hannah Wells', 'Yesterday’s session is ready to write up.', 'Write it up'],
    ['Hannah Wells', 'Hannah has 2 sessions left.', 'Offer a renewal'],
    ['Marcus Bell', '2 hours 10 minutes of time credit are left.', 'Open Marcus’s page'],
  ]);
  assert.equal(rows[1].short, '2 sessions left');
  assert.ok(rows.every((r) => !/portal|logged|signed in/i.test(r.line)), 'never a flag from portal use');
});

test('Today’s one offer: never two at once', () => {
  const offer = (d, h, extra = {}) => todayOffer({ now: new Date(2026, 10, d, h), todayKey: `2026-11-${d}`, ...extra });
  assert.equal(offer(17, 9), 'plan');
  assert.equal(offer(17, 9, { day: { planned_at: at(17, 8) } }), null);
  assert.equal(offer(17, 9, { putOff: ['plan'] }), null, 'Not now puts it off');
  assert.equal(offer(17, 18), 'close', 'from the end of the working day');
  assert.equal(offer(17, 18, { day: { closed_at: at(17, 17, 30) } }), null);
  assert.equal(offer(20, 9), 'plan', 'a Friday morning still starts with the plan');
  assert.equal(offer(20, 9, { day: { planned_at: at(20, 8) } }), 'review');
  assert.equal(offer(20, 13), 'energy', 'Friday afternoon: Rate my energy first');
  assert.equal(offer(20, 13, { week: { energy: 'good' } }), 'review');
  assert.equal(offer(20, 13, { week: { energy: 'good', reviewed_at: at(20, 12) }, day: { planned_at: at(20, 8) } }), null);
  assert.equal(offer(17, 16, { settings: { working_hours: { tue: { from: '07:00', to: '15:00' } } }, day: { planned_at: at(17, 8) } }), 'close', 'an early finish never offers the close before 16:00');
});

test('the day’s and the week’s summaries', () => {
  const sessions = [{ starts_at: at(17, 9), minutes: 60, outcome: 'held', recap_sent_at: at(17, 11) }, { starts_at: at(17, 12), minutes: 60, outcome: 'held' }, { starts_at: at(17, 15), minutes: 60 }, { starts_at: at(24, 9), minutes: 60 }, { starts_at: at(26, 9), minutes: 60 }, { starts_at: at(26, 11), minutes: 60 }];
  const todos = [todo('a', { done_at: at(17, 10) }), todo('b', { done_at: at(16, 10) }), todo('c', { done_at: at(10, 10) }), todo('d')];
  const day = dayDone({ sessions, todos, todayKey: TODAY });
  assert.deepEqual([day.calls, day.held, day.sent, day.done, day.line], [3, 2, 1, 1, '2 calls held, 1 recap sent.']);
  assert.deepEqual(doneThisWeek(todos, TODAY).map((t) => t.id), ['a', 'b']);
  const week = weekDone({ sessions, todos, target: 15, todayKey: TODAY });
  assert.equal(week.capacity.words, '3 of 15');
  assert.equal(week.recapsSent, 1);
  assert.deepEqual(week.shape.map((d) => `${d.label} ${d.calls}`), ['Mon 0', 'Tue 1', 'Wed 0', 'Thu 2', 'Fri 0']);
  assert.equal(week.shapeLine, '3 calls, the busiest on Thursday.');
  assert.equal(weekDone({ sessions: [], todos: [], todayKey: TODAY }).shapeLine, 'No calls are booked next week yet.');
});
