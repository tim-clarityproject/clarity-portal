import { addDays, daysBetween, dayKeyWords } from '../time/index.js';
import { moneyText } from './currency.js';
import { discountLines, extras, planTotal, sessions, subtotal } from './pricing.js';
import { firstPayment, investmentWords, settleOptions } from './settling.js';
import { UPFRONT_PERCENT, finalTotal, saving, upfrontActive } from './upfront.js';

// Quotes (brief items 19 to 21; M28's s-check "How should it go?", s-sent, s-q-client). A quote has its own number
// (Q-0001 upwards, never reused: 065's quote_take_number), is valid for 14, 30 or 60 days, and is built from the same
// terms as an agreement. The coach picks which extras it offers; the client ticks extras and chooses how to settle,
// and the total and settling options follow. Checked by tests/performance/agreements-quote.test.mjs.

export const VALID_DAYS = Object.freeze([14, 30, 60]);

/** "Q-0042". */
export function quoteNumber(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('Quote numbers start at 1.');
  return `Q-${String(n).padStart(4, '0')}`;
}
/** The number in "Q-0042", or null. */
export const quoteNumberOf = (text) => { const m = /^Q-(\d{4,9})$/.exec(String(text || '')); return m ? Number(m[1]) : null; };

/** The last day it can be accepted: 30 days from Wed 25 Nov 2026 is Fri 25 Dec 2026. */
export function validUntil(sentDay, days = 30) {
  if (!VALID_DAYS.includes(Number(days))) throw new Error('A quote is valid for 14, 30 or 60 days.');
  return addDays(sentDay, Number(days));
}
export const isExpired = (until, today) => Boolean(until && today) && daysBetween(until, today) > 0;
export const validLine = (until) => `Valid until ${dayKeyWords(until, { year: true })}`;

/**
 * The quote's figures with the client's ticks and choice: the plan's total, what they invest, what is settled at
 * signing, and the settling options recomputed (ticking a £2,500 visit day on £15,300 makes £17,800).
 */
export function total(t, chosen = t?.extrasChosen || [], choice = t?.choice ?? 'upfront') {
  return {
    planTotal: planTotal(t, chosen),
    invest: finalTotal(t, choice, chosen),
    firstPayment: firstPayment(t, choice, chosen),
    settleOptions: settleOptions(t, chosen),
    investmentWords: investmentWords(t, choice, chosen),
  };
}

/** The quote's table rows (M28's quoteTable): the package line, each discount, each extra offered, then In all. */
export function quoteRows(t, chosen = t?.extrasChosen || [], choice = t?.choice ?? 'upfront') {
  const c = t.currency || 'GBP';
  return {
    lines: [
      { label: `${t.coaching || 'Coaching'}, ${sessions(t)} coaching ${sessions(t) === 1 ? 'session' : 'sessions'}`, amount: moneyText(subtotal(t), c) },
      ...discountLines(t).map((d) => ({ label: d.label, amount: moneyText(d.amount, c) })),
    ],
    extras: extras(t, chosen).map((e) => ({ key: e.key, label: e.title, amount: moneyText(e.priceMinor || 0, c), chosen: e.chosen })),
    // Up front's 5% off on its own line under the extras, as each discount has its own (brief item 3; UI finding 4):
    // £10,480 with up front chosen reads "Up front, 5% off  −£524", then In all £9,956.
    upfront: upfrontActive(t, choice) ? { label: `Up front, ${UPFRONT_PERCENT}% off`, amount: moneyText(-saving(planTotal(t, chosen)), c) } : null,
    inAll: moneyText(finalTotal(t, choice, chosen), c),
    hint: `${investmentWords(t, choice, chosen).replace(/^./, (x) => x.toUpperCase())}. The first ${moneyText(firstPayment(t, choice, chosen), c)} is settled when you sign.`,
  };
}
