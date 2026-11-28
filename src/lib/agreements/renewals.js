import { addDays, daysBetween, dayKeyWords, weekdayOf } from '../time/index.js';
import { addMonths } from './settling.js';
import { sixUpFront } from './upfront.js';

// Six months is the gold standard (brief items 38 to 41; M28's s-n-renew and s-n-price). A month before any 6 months
// end (set sessions, or a retainer's term), Needs you offers the next 6 months, drafted from the current agreement
// with up front chosen. A yearly price review shows 6 weeks before it is due. Day keys throughout.
// Checked by tests/performance/agreements-renewals.test.mjs.

export const TERM_MONTHS = 6;
export const NOTICE_DAYS = 30;
export const PRICE_REVIEW_SHOWS_DAYS = 42;

/** The last day of a term of `months` from its first day. */
export const termEnds = (start, months = TERM_MONTHS) => addDays(addMonths(start, months), -1);
/** When "Offer [name] the next 6 months" shows: one calendar month before the end (Fri 12 Feb 2027 → Tue 12 Jan 2027). */
export const renewalDue = (end) => addMonths(end, -1);
export const renewalShows = (end, today) => Boolean(end && today) && today >= renewalDue(end) && today <= end;
/** The last day either side can say no to a retainer's renewal (30 days before the term ends). */
export const noticeBy = (end) => addDays(end, -NOTICE_DAYS);

/** A yearly price review is due 12 months after the price began (Mon 4 Jan 2026 → Mon 4 Jan 2027). */
export const priceReviewDue = (priceSince) => addMonths(priceSince, 12);
/** It shows 6 weeks before it is due (Mon 4 Jan 2027 → Mon 23 Nov 2026). */
export const priceReviewShows = (due) => addDays(due, -PRICE_REVIEW_SHOWS_DAYS);

export const percentUp = (oldMinor, newMinor) => Math.round((Number(newMinor) / Number(oldMinor) - 1) * 100);
export const noticeDays = (today, from) => daysBetween(today, from);
/** "Up 10%, with 40 days' notice." (M28's priceLine). */
export function priceLine(oldMinor, newMinor, today, from) {
  const up = percentUp(oldMinor, newMinor);
  const d = noticeDays(today, from);
  return `${up >= 0 ? `Up ${up}%` : `Down ${-up}%`}, with ${d} ${d === 1 ? 'day’s' : 'days’'} notice.`;
}
/** "January": the month a new price starts, said aloud in the talking points. */
export const monthName = (day) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(String(day).slice(5, 7)) - 1];

/**
 * Needs you's line: "These 6 months end Fri 12 Feb, 30 days to go", the term's own length and a true countdown (rule
 * 29an; the Stage D UI tester's fault 6: "a month from now" showed 6 and 13 days before the end, and "6 months" on a
 * 12-month agreement). `today` gives the countdown; without it the line ends at the date.
 */
export function renewalLine(end, today = null, months = TERM_MONTHS) {
  const head = `These ${months} months end ${dayKeyWords(end)}`;
  if (!today) return head;
  const d = daysBetween(today, end);
  if (d <= 0) return `These ${months} months end today`;
  return `${head}, ${d} ${d === 1 ? 'day' : 'days'} to go`;
}

/**
 * The next 6 months' terms, drafted from the current ones with up front chosen (Tim: "I always want to do the bulk
 * payments for cashflow"): starting the Monday after the end, the end worked out again, nothing chosen by the coach.
 */
export function nextTermDraft(t, { newFeeMinor = null } = {}) {
  const next = JSON.parse(JSON.stringify(t || {}));
  const end = t?.endsOn;
  if (end) next.startsOn = addDays(end, ((8 - weekdayOf(end)) % 7) || 7);
  next.endsOn = null;
  next.endsPicked = false;
  next.choice = 'upfront';
  next.offerUpfront = true;
  next.extrasChosen = [];
  if (newFeeMinor != null && next.retainer) next.retainer.feeMinor = Number(newFeeMinor);
  return next;
}

/** Six months up front at a new monthly fee: £3,300 → £18,810. */
export const upfrontAt = (feeMinor) => sixUpFront(feeMinor);
