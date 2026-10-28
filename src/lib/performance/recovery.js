// Recovery, started any time (mock-up M15): what its pages say and what
// they write, worked out in one place. Pure code: no database, no React,
// no device clock (today is passed in), tested in tests/performance.
//
// The sprint clock is the methods' (M0.4: Recovery pauses sprint time
// from its start until the day "I'm ready to go again" is said, and the
// sprint end moves later by the days taken). What the methods leave open
// is a screen choice made here and listed in progress.md as UNDEFINED:
// the end shown while Recovery runs (rows.js sprintPause), and what
// happens when the chosen end passes with no answer (it stays paused and
// the end check-in shows).

import { addDays, daysBetween } from '../scores/dates.js';
import { openRecovery, recoveryEndOn, sprintPause } from './rows';
import { dayName } from './sprintPage';

/** The day counter's limits (M15 dstep; Tim, 26 Oct, 16:24 to 16:25). */
export const RECOVERY_MIN_DAYS = 1;
export const RECOVERY_MAX_DAYS = 30;
export const RECOVERY_SUGGESTED_DAYS = 7;
/** The database's own limits (recovery_periods): days added in all, and start to end. */
export const RECOVERY_MAX_ADDED = 60;
export const RECOVERY_MAX_SPAN = 120;

/** The recharge answer's limit (recovery_recharge_answers.answer). */
export const RECHARGE_MAX = 500;

/** "1 day", "3 days", "1 week", "2 weeks" (M15: whole weeks read in weeks). */
export function dayCountWords(n) {
  if (n > 0 && n % 7 === 0) return n === 7 ? '1 week' : `${n / 7} weeks`;
  return n === 1 ? '1 day' : `${n} days`;
}

/** "4 days left." (M15 banner). */
export function daysLeftWords(n) {
  return n === 1 ? '1 day left.' : `${n} days left.`;
}

/** "Good morning", "Good afternoon" or "Good evening", from the hour on the person's clock. */
export function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Where "A few more days" counts from: the chosen end, or today once that
 * has passed (Claude's call: days added after the end has come are added
 * to today, so the new end is never already over).
 */
function moreFrom(row, today) {
  const end = recoveryEndOn(row);
  return today && end < today ? today : end;
}

/** The days already added in all, counting a chosen end that has passed. */
function addedSoFar(row, today) {
  return daysBetween(row.start_on, moreFrom(row, today)) - (row.chosen_days || 0);
}

/** The most days "A few more days" can add now: 30 at a time, 60 in all. */
export function moreDaysMax(row, today) {
  if (!row) return 0;
  return Math.max(0, Math.min(RECOVERY_MAX_DAYS, RECOVERY_MAX_ADDED - addedSoFar(row, today)));
}

/** The new Recovery row (M15 "Start my recovery"); the id is made on the device. */
export function recoveryRow({ id, userId, sprintId = null, today, days, letCoachKnow }) {
  return {
    id,
    user_id: userId,
    sprint_id: sprintId,
    start_on: today,
    chosen_days: Math.min(RECOVERY_MAX_DAYS, Math.max(RECOVERY_MIN_DAYS, Math.round(days))),
    extended_days: 0,
    let_coach_know: Boolean(letCoachKnow),
  };
}

/**
 * Ending it ("I'm ready to go again" or "Pick up my sprint"): today
 * counts again (M0.4). Never before its start, and never further from it
 * than the database allows.
 */
export function endValues(row, today, now = new Date()) {
  let end = today < row.start_on ? row.start_on : today;
  const cap = addDays(row.start_on, RECOVERY_MAX_SPAN);
  if (end > cap) end = cap;
  return { ended_at: now.toISOString(), end_on: end };
}

/** Adding days ("Add the days"): the new end is `more` days after moreFrom. */
export function extendValues(row, more, today) {
  const add = Math.max(0, Math.min(moreDaysMax(row, today), Math.round(more)));
  return { extended_days: addedSoFar(row, today) + add };
}

/** The rows as they will be once a Recovery starts, ends or grows: for the pages' copies on the device. */
export function withRecovery(rows = [], row) {
  return [...rows.filter((r) => r.id !== row.id), row].sort((a, b) => (a.start_on < b.start_on ? -1 : 1));
}

/**
 * Where the running sprint stands, in words, while a Recovery is open
 * (M15 "Sprint, paused"), or what a new Recovery would do to it.
 */
function sprintWords(sprint, recoveries, today) {
  if (!sprint || sprint.status !== 'running') return null;
  const name = `Performance Sprint ${sprint.number}`;
  if (today < sprint.start_on) return { name, number: sprint.number, notStarted: true, startsOn: dayName(sprint.start_on, today) };
  const p = sprintPause(sprint, recoveries, today);
  return {
    name,
    number: sprint.number,
    lengthWeeks: sprint.length_weeks,
    week: p.week,
    complete: p.complete,
    endedOn: p.endedOn ? dayName(p.endedOn, today) : null,
    picksUpOn: dayName(p.picksUpOn, today),
    endOn: dayName(p.endOn, today),
    endBefore: dayName(p.endBefore, today),
    moved: p.endOn !== p.endBefore,
  };
}

/**
 * The Recovery pages' whole view (M15 Take a recovery week, Home in
 * recovery, the end check-in).
 * @param {object} d rows from loadRecoveryPage
 * @param {{ today: string }} opts the person's local today
 */
export function recoveryView(d, { today }) {
  if (!d) return null;
  const recoveries = d.recoveries || [];
  const open = openRecovery(recoveries);
  const sprint = d.sprint && d.sprint.status === 'running' ? d.sprint : null;
  const coach = d.coach?.firstName || null;
  const common = { today, coach, firstName: d.firstName || '', sprintId: sprint?.id || null };
  if (!open) {
    return {
      ...common,
      state: 'none',
      endsOn: (days) => dayName(addDays(today, days), today),
      sprint: sprint ? { name: `Performance Sprint ${sprint.number}`, number: sprint.number } : null,
    };
  }
  const endOn = recoveryEndOn(open);
  const left = daysBetween(today, endOn);
  const answer = (d.answers || []).find((a) => a.recovery_id === open.id && a.local_date === today) || null;
  return {
    ...common,
    state: 'open',
    recovery: open,
    endOn,
    untilText: dayName(endOn, today),
    daysLeft: left,
    // The chosen end has come with no answer yet (UNDEFINED, audit 4.7):
    // the sprint stays paused and the end check-in shows.
    due: left <= 0,
    moreMax: moreDaysMax(open, today),
    endsAfter: (more) => dayName(addDays(endOn < today ? today : endOn, more), today),
    answer,
    sprint: sprintWords(sprint, recoveries, today),
  };
}

/**
 * The first line wherever scores are hidden (M15 "You're in recovery
 * until Mon 2 Nov."); once the chosen end has come with no answer yet, it
 * stays "You're in recovery." until the end check-in is answered.
 */
export function recoveryLead(row, today) {
  const end = recoveryEndOn(row);
  return end > today ? `You’re in recovery until ${dayName(end, today)}.` : 'You’re in recovery.';
}
