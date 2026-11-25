import { addDays, daysBetween, dayKeyWords } from '../time/index.js';
import { kindOf, selfFunded } from './terms.js';

// The 14-day right to cancel (UK Consumer Contracts Regulations; brief items 11 to 14), for self-funded individuals
// only (risk 18: every self-funded individual, one-offs and retainers included; never a team programme or anything an
// organisation funds). The window runs to the end of the 14th day after the signing day, so a coaching session can be
// booked from the day after that, unless the client ticked "Start my coaching straight away" (065's coach_sessions_065
// trigger holds the same rule in the database). Checked by tests/performance/agreements-cooling-off.test.mjs.

export const COOLING_DAYS = 14;
export const START_NOW_LINE = 'Start my coaching straight away. If I cancel within 14 days, I’m only charged for the coaching sessions I’ve had.';
export const SETTLE_LINE = 'You can still change your mind within 14 days.';

/** Whether the 14-day right applies to this agreement. */
export const applies = (t) => selfFunded(t) && kindOf(t) !== 'team';

/** The last day of the 14 days, from the signing day (a day key in the client's own zone). */
export const windowEnds = (signedDay) => addDays(signedDay, COOLING_DAYS);

/** The first day a coaching session can be booked: the signing day with the tick, else the day after the 14 days. */
export const bookableFrom = (signedDay, startNow = false) => (startNow ? signedDay : addDays(signedDay, COOLING_DAYS + 1));

/** Whether today is still inside the 14 days. */
export const inWindow = (signedDay, today) => Boolean(signedDay && today) && daysBetween(signedDay, today) >= 0 && daysBetween(signedDay, today) <= COOLING_DAYS;

/** Whether the coach is offered "Cancel within 14 days" (never for a funded agreement, a team, or once cancelled). */
export const offered = ({ terms, signedDay, today, cancelled = false }) => !cancelled && applies(terms) && inWindow(signedDay, today);

/**
 * The refund on cancelling within 14 days: everything settled, or, with the start-now tick, less the coaching sessions
 * had at the agreement's per-session price (never below zero).
 */
export function refund14({ paidMinor, sessionsHad = 0, perSessionMinor = 0, startNow = false }) {
  const paid = Math.max(0, Math.round(Number(paidMinor) || 0));
  if (!startNow) return paid;
  return Math.max(0, paid - Math.max(0, Math.floor(Number(sessionsHad) || 0)) * Math.round(Number(perSessionMinor) || 0));
}

/** The calm words when a session would fall inside the 14 days (as the database says it). */
export const tooSoonLine = (firstName, signedDay) => `That’s inside ${firstName}’s 14 days to change their mind. Book it from ${dayKeyWords(bookableFrom(signedDay))}.`;

/**
 * Cancelling within 14 days takes the client's coaching sessions still to come off the calendar, as the calendar's own
 * Delete takes one (calendar.js's deleteEntry): the session where nothing is written up, its call, the call's guests
 * and its travel time. The server does it (coach-agreements.js's cancel_14) and the coach's device takes the same rows
 * off its copy (calendar.js's futureSessionsPlan is this list). Nothing is emailed: the coach lets the client know.
 * Tables as calendar.js's T names them. → { sessions, remove: [[table, id], …] } (guests, travel, calls, then sessions)
 */
export function futureSessionRows(profileId, { sessions = [], items = [], guests = [], now = Date.now() } = {}) {
  const ahead = (sessions || []).filter((s) => profileId && s.profile_id === profileId && (s.kind || 'coaching') === 'coaching'
    && Date.parse(s.starts_at) > now && !s.outcome && !s.recap_sent_at);
  const remove = [];
  for (const s of ahead) {
    for (const i of (items || []).filter((x) => x.session_id === s.id)) {
      remove.push(...(guests || []).filter((g) => g.item_id === i.id).map((g) => ['coach_cal_guests', g.id]));
      remove.push(...(items || []).filter((x) => x.travel_for === i.id).map((x) => ['coach_cal_items', x.id]));
      remove.push(['coach_cal_items', i.id]);
    }
    remove.push(['coach_sessions', s.id]);
  }
  return { sessions: ahead, remove };
}
