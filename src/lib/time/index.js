// The portal's one time library (time-zone-safeguards.md; Tim, 10 Nov).
// Everything that names a zone, saves a time, writes a time for a reader
// in a zone, works out a series, offers a booking, looks for a clock change
// or a public holiday, or times an email goes through here. Don't add a
// second way of doing any of it.
//
// (The device's own clock on screen, "07:53" in whatever zone the phone is
// in, stays with src/lib/dateFormatter.js, CLAUDE.md rule 19: inside the
// portal the screen already shows the person's own time.)
export { isZone, mustBeZone, zonePlace, zoneLabel, zoneCountry, usesTwelveHour, countryWords, countryAdjective, deviceZone } from './zones.js';
export { wallClock, offsetMinutes, instantAt, dayIn, addDays, daysBetween, weekdayOf, savedTime, savedTimeAt, readSavedTime } from './instants.js';
export { clockWords, timeWords, dayWords, dayKeyWords, whenWords, bothWords, relativeDayWords, sessionWhenWords } from './words.js';
export { seriesRule, seriesCalls, nextCall } from './series.js';
export {
  GAP_MINUTES, QUARTER_MINUTES, SOCIABLE_FROM, SOCIABLE_TO, EARLY_AND_LATE_LABEL,
  onQuarterHour, nextQuarterHour, clearOfOthers, sociable, bookingProblem, offeredStarts,
} from './booking.js';
export { clockChanges, callsThatMove, clockChangeLine } from './clockChanges.js';
export { publicHolidayOn, publicHolidayFor, holidayLine } from './holidays.js';
export {
  MORNING_HOUR, MORNING_ENDS, LEADING_IDEAS_WEEKDAY, PUBLIC_LIST_ZONE,
  morningOf, inTheMorning, dayBeforeReminderAt, hourBeforeReminderAt, nextLeadingIdeasAt,
} from './reminders.js';
