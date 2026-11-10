// When automatic emails go (time-zone-safeguards.md, rule 11): reminders,
// Leading Ideas for clients and nudges are sent in the morning of the
// reader's own time, never by UK clocks, so nobody is woken at 03:00.
// Nothing sends these yet (booking and Kit come in Phase 6a); these work
// out the instants.
import { addDays, dayIn, instantAt, wallClock, weekdayOf } from './instants.js';

export const MORNING_HOUR = '07:00';
export const MORNING_ENDS = '09:00';
export const LEADING_IDEAS_WEEKDAY = 4; // Thursday
export const PUBLIC_LIST_ZONE = 'Europe/London'; // Kit can't send by each subscriber's zone: the public list goes at 07:00 UK time

/** 07:00 on a day in the reader's own zone. */
export const morningOf = (day, zone) => instantAt(day, MORNING_HOUR, zone);

/** Whether an instant is in the reader's morning, 07:00 to 09:00 their time. */
export function inTheMorning(instant, zone) {
  const w = wallClock(instant, zone);
  const m = w.hour * 60 + w.minute;
  return m >= 7 * 60 && m <= 9 * 60;
}

/**
 * When the day-before reminder for a session goes: 07:00 on the day before
 * the session, on the reader's own calendar and clock.
 */
export function dayBeforeReminderAt(sessionInstant, readerZone) {
  return morningOf(addDays(wallClock(sessionInstant, readerZone).date, -1), readerZone);
}

/** When the last reminder goes: 1 hour before. It never gives a clock time, so it can't be wrong. */
export const hourBeforeReminderAt = (sessionInstant) => new Date(new Date(sessionInstant).getTime() - 3600000);

/** The next Thursday 07:00 in a reader's zone, at or after now: when their Leading Ideas goes. */
export function nextLeadingIdeasAt(zone, now = new Date()) {
  let day = dayIn(zone, now);
  for (let i = 0; i < 8; i += 1) {
    if (weekdayOf(day) === LEADING_IDEAS_WEEKDAY) {
      const at = morningOf(day, zone);
      if (at.getTime() >= new Date(now).getTime()) return at;
    }
    day = addDays(day, 1);
  }
  return morningOf(day, zone);
}
