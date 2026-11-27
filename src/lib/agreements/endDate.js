import { addDays, dayIn, daysBetween, weekdayOf, dayKeyWords } from '../time/index.js';

// An agreement's end date (brief item 6; M28's builder and s-extend, s-pause). Day keys only ("2027-07-02"), through
// src/lib/time: no clock is read. Checked by tests/performance/agreements-end-date.test.mjs.
//
// The end date is worked out: the Friday of the week the last coaching session falls in, from the start date, the
// number of coaching sessions and How often. "Weekly" is 1 week apart, "Every 2 weeks" 2, "Monthly" 4, "Weekly for 6
// weeks, then every 2 weeks" as it says, and "As we agree" counts as every 2 weeks. A date the coach picks wins;
// extending or pausing sets a picked date. A last session on a Saturday or Sunday ends on the following Friday, never
// before it (risk 30).

export const RHYTHMS = Object.freeze(['Weekly', 'Every 2 weeks', 'Monthly', 'Weekly for 6 weeks, then every 2 weeks', 'As we agree']);
export const DEFAULT_RHYTHM = 'Weekly for 6 weeks, then every 2 weeks';
const FRIDAY = 5;

// Polish 1, Stage C (M28 version 6's questionnaire): a momentum phase of any length, "Weekly for 4 weeks, then every
// 2 weeks", "Weekly for 8 weeks, then monthly" and the like, as well as the five above. The rhythm stays one sentence
// on the terms, so every place that writes it (the clauses, the PDF, the Main points) reads it as it is.
const MOMENTUM = /^Weekly for (\d{1,2}) weeks, then (.+)$/i;
const plainGap = (words) => {
  const w = String(words || '').trim().toLowerCase();
  if (w === 'weekly' || w === 'every week') return 1;
  if (w === 'monthly' || w === 'every month') return 4;
  return 2; // every 2 weeks, as we agree, and anything else
};

/** Weeks between coaching session i - 1 and i (i counts from 1). */
export function gapWeeks(i, rhythm) {
  const m = MOMENTUM.exec(String(rhythm || ''));
  if (m) return i <= Number(m[1]) ? 1 : plainGap(m[2]);
  return plainGap(rhythm); // Weekly, Monthly, Every 2 weeks, As we agree, and anything else
}

/** How often after the momentum phase, as the questionnaire asks it: 'Weekly' | 'Every 2 weeks' | 'Monthly' | 'As we agree'. */
export const AFTER_RHYTHMS = Object.freeze(['Weekly', 'Every 2 weeks', 'Monthly', 'As we agree']);
/** The weekly sessions a rhythm starts with (0 when there is no momentum phase). */
export function momentumWeeks(rhythm) {
  const m = MOMENTUM.exec(String(rhythm || ''));
  return m ? Number(m[1]) : 0;
}
/** The rhythm after any momentum phase ("Every 2 weeks" from "Weekly for 6 weeks, then every 2 weeks"). */
export function afterRhythm(rhythm) {
  const m = MOMENTUM.exec(String(rhythm || ''));
  const words = m ? m[2] : String(rhythm || '');
  return AFTER_RHYTHMS.find((r) => r.toLowerCase() === words.trim().toLowerCase()) || 'Every 2 weeks';
}
/** A rhythm from its two answers: "Weekly for 6 weeks, then every 2 weeks", or the plain rhythm with no momentum phase. */
export function rhythmOf(weeks, after) {
  const plain = AFTER_RHYTHMS.includes(after) ? after : 'Every 2 weeks';
  const n = Math.max(0, Math.floor(Number(weeks) || 0));
  return n > 0 ? `Weekly for ${n} weeks, then ${plain.toLowerCase()}` : plain;
}
/** Whether a rhythm is one the agreement can be written with (the five above, or a momentum phase of 1 to 26 weeks). */
export function isRhythm(rhythm) {
  if (RHYTHMS.includes(rhythm)) return true;
  const m = MOMENTUM.exec(String(rhythm || ''));
  return Boolean(m) && Number(m[1]) >= 1 && Number(m[1]) <= 26 && AFTER_RHYTHMS.some((r) => r.toLowerCase() === m[2].trim().toLowerCase());
}

const plusMonths = (day, months) => {
  const [y, mo, d] = String(day).split('-').map(Number);
  const mm = mo - 1 + months;
  const yy = y + Math.floor(mm / 12);
  const month = ((mm % 12) + 12) % 12 + 1;
  const last = new Date(Date.UTC(yy, month, 0)).getUTCDate();
  return `${yy}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
/**
 * How many coaching sessions fit in a term (M28 version 6: "How long will the coaching run?"): one on the start day,
 * then one at each gap of the rhythm, while it falls before the same day so many months on. At least 1.
 */
export function sessionsInTerm(start, rhythm, months) {
  if (!start || !(Number(months) > 0)) return 1;
  const end = plusMonths(start, Number(months));
  let n = 1;
  while (n < 400 && addDays(start, weeksToLast(n + 1, rhythm) * 7) < end) n += 1;
  return n;
}

/** Weeks from the first coaching session to the last of n. */
export function weeksToLast(n, rhythm) {
  let w = 0;
  for (let i = 2; i <= Math.max(1, Math.floor(Number(n) || 1)); i += 1) w += gapWeeks(i, rhythm);
  return w;
}

/** The day the last of n coaching sessions falls, counted in whole weeks from the start. */
export const lastSessionWeek = (start, n, rhythm) => addDays(start, weeksToLast(n, rhythm) * 7);

/** The Friday on or after a day. */
export function fridayOnOrAfter(day) {
  return addDays(day, (FRIDAY - weekdayOf(day) + 7) % 7);
}

/** How many coaching sessions blocks add up to: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }] → 16. */
export const sessionCount = (blocks) => (blocks || []).reduce((a, b) => a + Math.max(0, Math.floor(Number(b?.n) || 0)), 0);

/** The suggested end date: the Friday of the last coaching session's week. `count` is a number or the blocks. */
export function suggestEnd(start, count, rhythm) {
  const n = Array.isArray(count) ? sessionCount(count) : Number(count);
  return fridayOnOrAfter(lastSessionWeek(start, n || 1, rhythm));
}

/** The builder's end-date choices: the suggested one, then 2, 4 and 8 weeks spare (M28's endOptsFrom). */
export function endOptions(suggested) {
  return [
    { value: suggested, label: `${dayKeyWords(suggested, { year: true })}, suggested` },
    ...[2, 4, 8].map((w) => {
      const v = addDays(suggested, w * 7);
      return { value: v, label: `${dayKeyWords(v, { year: true })}, ${w} weeks spare` };
    }),
  ];
}

/** The line under the end date: worked out, or the coach's own choice with the suggestion (M28's endHint). */
export function endHint({ start, count, rhythm, end, picked }) {
  const suggested = suggestEnd(start, count, rhythm);
  if (!picked || end === suggested) {
    const n = Array.isArray(count) ? sessionCount(count) : Number(count);
    return `Worked out: the last coaching session is in the week of ${dayKeyWords(lastSessionWeek(start, n || 1, rhythm), { year: true })}.`;
  }
  return `You chose this. Suggested: ${dayKeyWords(suggested, { year: true })}.`;
}

/** Extend the end date: the Friday after 2, 4, 8 or 12 more weeks (M28's extOpts). `today`: the year only when it isn't today's. */
export function extendOptions(end, today = null) {
  return [2, 4, 8, 12].map((w) => {
    const v = fridayOnOrAfter(addDays(end, w * 7));
    return { value: v, label: dayKeyWords(v, { year: true, today }) };
  });
}

/** The day coaching starts again after a pause that runs to `to`: the next weekday (a pause to a Friday resumes on Monday). */
export function resumeDay(to) {
  const next = addDays(to, 1);
  const w = weekdayOf(next); // Monday 1 … Sunday 7
  return w === 6 ? addDays(next, 2) : w === 7 ? addDays(next, 1) : next;
}

/**
 * A pause's length in days: from its first day to the day coaching starts again (resumeDay), so a Monday to a Friday
 * is whole weeks (Mon 1 Mar to Fri 26 Mar: 28 days). The one length the end date (pauseMove) and every invoice due from
 * the pause's start (settling.js's agreementSchedule) move on by, on the device and the server alike (Stage D item 16:
 * before, the end moved by the days plus 3 and the invoices by the days plus 1, two days apart, landing on a Saturday).
 */
export function pauseDays(from, to) {
  if (!from || !to || to <= from) return 0;
  return daysBetween(from, resumeDay(to));
}

/**
 * Pausing from one day to another moves the end date on by the pause's length (pauseDays: a Monday to a Friday is 4
 * whole weeks), to the Friday on or after it (M28's pause). Returns { ok, days, weeks, end, line } or { ok: false, line }.
 * `today` (on screen): the line's date shows its year only when it isn't today's; the server leaves it out (the year kept).
 */
export function pauseMove(end, from, to, today = null) {
  if (!from || !to || to <= from) return { ok: false, line: 'Choose an Until date after From.' };
  const days = pauseDays(from, to);
  const weeks = Math.round(days / 7);
  const newEnd = fridayOnOrAfter(addDays(end, days));
  return {
    ok: true, days, weeks, end: newEnd,
    line: `Coaching pauses for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, so the end date moves to ${dayKeyWords(newEnd, { year: true, today })}.`,
  };
}

/**
 * Why a pause can't be made, in calm words, or null (the break-it tester's F6; agreements rules 12 and 25). An
 * agreement keeps one pause (`paused_from` to `paused_to`, which moves its invoices on by its length), so a second is
 * refused rather than written over the first, whether the first is still to come, running or over; a pause starts today
 * or later and ends after it starts, and starts before the agreement's end. `paused`: { from, to } already kept, or null.
 * The device (before Pause is offered) and the server (before anything is written) ask the same.
 */
export function pauseProblem({ from, to, today, end = null, paused = null }) {
  if (paused?.from) {
    const when = paused.to ? `from ${dayKeyWords(paused.from, { year: true, today })} to ${dayKeyWords(paused.to, { year: true, today })}` : `from ${dayKeyWords(paused.from, { year: true, today })}`;
    return `This agreement was paused ${when}, and it can be paused once. To give more time, extend the end date instead.`;
  }
  if (!from || !to || to <= from) return 'Choose an Until date after From.';
  if (today && from < today) return 'A pause starts today or later. Choose a later From date.';
  if (end && from > end) return `A pause starts before the agreement ends on ${dayKeyWords(end, { year: true, today })}. Choose an earlier From date.`;
  return null;
}

/**
 * Why an early end can't be set, or null (F6): the last day is today or later and before the end the agreement has now
 * (`end`; an early end already set counts when it is sooner).
 */
export function endEarlyProblem({ on, today, end = null, earlyEnd = null }) {
  if (!on) return 'Choose the last day.';
  if (today && on < today) return 'Choose today or a later day.';
  const until = [end, earlyEnd].filter(Boolean).sort()[0] || null;
  if (until && on >= until) return `It already ends on ${dayKeyWords(until, { year: true, today })}. Choose a last day before then.`;
  return null;
}

/**
 * The coaching sessions already booked inside a pause (Stage D item 16, Tim, 27 Nov): the client's coaching sessions
 * still to come whose day (on `zone`'s clock) is from `from` to `to`, earliest first. A pause moves and cancels none of
 * them: the coach moves or cancels each one with the calendar's own Move and Delete, and the client hears only about
 * those (the calendar's own session emails). The device (the pause's check and the agreement's page) and the server
 * (the pause's answer) ask the same.
 * @param {object[]} sessions coach_sessions rows
 * @param {{ from: string, to: string, profileId?: string|null, zone?: string, now?: number }} pause
 */
export function sessionsInPause(sessions, { from, to, profileId = null, zone = 'Europe/London', now = Date.now() } = {}) {
  if (!from || !to || to < from) return [];
  return (sessions || [])
    .filter((s) => s && s.starts_at && (!profileId || s.profile_id === profileId) && (s.kind || 'coaching') === 'coaching' && !s.outcome)
    .filter((s) => Date.parse(s.starts_at) > now)
    .filter((s) => { const d = dayIn(zone, new Date(s.starts_at)); return d >= from && d <= to; })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
