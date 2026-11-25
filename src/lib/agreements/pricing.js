import { hoursWords, moneyText, rateText } from './currency.js';
import { sessionCount } from './endDate.js';

// The price of an agreement (brief item 3; M28's C): a total, an hourly rate × hours, or a monthly fee; visit days on
// top; each discount its own line under the full price; the extras the client ticks on a quote. Minor units throughout.
// Checked by tests/performance/agreements-pricing.test.mjs.

/** How many coaching sessions, and how many minutes in all, from the blocks. */
export const sessions = (t) => sessionCount(t?.blocks);
export const minutes = (t) => (t?.blocks || []).reduce((a, b) => a + Math.max(0, Math.floor(Number(b?.n) || 0)) * (Number(b?.minutes) || 0), 0);

/** The price before visit days and discounts. */
export function base(t) {
  if (t?.priceMode === 'hourly') return Math.round((Number(t.rateMinor) || 0) * minutes(t) / 60);
  if (t?.priceMode === 'monthly') return (Number(t.monthlyMinor) || 0) * (Number(t.months) || 0);
  return Number(t?.totalMinor) || 0;
}

/** The price with any visit days added. */
export const visitsMinor = (t) => (t?.visitDays ? (Number(t.visitDays.n) || 0) * (Number(t.visitDays.rateMinor) || 0) : 0);
export const subtotal = (t) => base(t) + visitsMinor(t);

/** One discount's amount off (a percentage of the subtotal, or a fixed amount), never more than what is left. */
export function discountAmount(d, sub) {
  if (d?.type === 'returning') return Math.round(sub * (Number(d.percent) || 0) / 100);
  if (d?.type === 'reduced') return Math.round(Number(d.amountMinor) || 0);
  return 0;
}
/** "Returning client, 15% off" or "Reduced fee, £500 off" (M28's discLabel; "paying up front" is the automatic 5%, item 37). */
export function discountLabel(d, currency = 'GBP') {
  if (d?.type === 'returning') return `Returning client, ${d.percent}% off`;
  return `Reduced fee, ${moneyText(d?.amountMinor || 0, currency)} off`;
}
/** Each discount as its own line: { label, amount } with the amount negative. */
export function discountLines(t) {
  const sub = subtotal(t);
  let left = sub;
  return (t?.discounts || []).map((d) => {
    const off = Math.min(left, discountAmount(d, sub));
    left -= off;
    return { label: discountLabel(d, t.currency || 'GBP'), amount: -off };
  });
}

/** The extras offered, with whether each is chosen: [{ key, title, priceMinor, hint, chosen }]. */
export function extras(t, chosen = t?.extrasChosen || []) {
  return (t?.extrasOffered || []).map((e) => ({ ...e, chosen: chosen.includes(e.key) }));
}
export const extrasTotal = (t, chosen = t?.extrasChosen || []) => extras(t, chosen).filter((e) => e.chosen).reduce((a, e) => a + (Number(e.priceMinor) || 0), 0);

/** The plan's total: the subtotal less discounts (never below zero), plus the chosen extras (M28's planFin). */
export function planTotal(t, chosen = t?.extrasChosen || []) {
  const off = discountLines(t).reduce((a, l) => a - l.amount, 0);
  return Math.max(0, subtotal(t) - off) + extrasTotal(t, chosen);
}

/** "16 coaching sessions, 16 hours 30 minutes in all." */
export const sessionsSummary = (t) => `${sessions(t)} coaching ${sessions(t) === 1 ? 'session' : 'sessions'}, ${hoursWords(minutes(t))} in all.`;
/** "16 hours 30 minutes at £750/hr, so £12,375." */
export const hourlyLine = (t) => `${hoursWords(minutes(t))} at ${rateText(t.rateMinor || 0, 'hour', t.currency || 'GBP')}, so ${moneyText(base(t), t.currency || 'GBP')}.`;
/** "In all: £15,300." with ", with the visit days" when there are some. */
export const finLine = (t, total = planTotal(t)) => `In all: ${moneyText(total, t.currency || 'GBP')}${t?.visitDays ? ', with the visit days' : ''}.`;

/** "1 of 90 minutes, then 15 of 60 minutes" (M28's lengths line). */
export const blocksText = (blocks) => (blocks || []).filter((b) => Number(b?.n) > 0).map((b) => `${b.n} of ${b.minutes} minutes`).join(', then ');
/** Whether the blocks are of mixed lengths (a difference the check before sending lists). */
export const mixedLengths = (t) => new Set((t?.blocks || []).map((b) => Number(b.minutes))).size > 1;
