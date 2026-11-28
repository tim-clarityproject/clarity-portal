import { addDays, dayIn, daysBetween, dayKeyWords, isZone } from '../time/index.js';
import { CURRENCY, CURRENCY_LIST } from '../agreements/currency.js';

// Money for coaching (Phase 6b run 1; Tim's money rules, 23 Nov 2026). Plain rules with no database or Stripe, shared by
// the coach portal, the client's pages, the server and the PDFs, and checked by tests/performance/billing-money.test.mjs.
//
// - Amounts are whole minor units (pence or cents) everywhere; only these functions turn them into words.
// - Clients invest and settle, never pay or cost; organisations fund. These functions write figures only: the words
//   around them come from the approved wording files.
// - Rates are written £750/hr and £860/month, with no spaces.
// - Invoice numbers are CLARITY- followed by a number from 1201, in order, never reused (the database hands them out).
// - Terms: 14 days for a person, 30 days for an organisation, changeable on any invoice.
// - An agreement's currency is pounds or dollars; in dollars the exchange rate and its moment are written into the fees
//   section and the PDF, and the amounts are then fixed in dollars.
// - No late fees or interest, ever, and a missed instalment never pauses coaching sessions by itself.
// - A discount is never a cheaper price: it is its own named line under the full price.

// Pounds, dollars and euros as run 1 and 2 write them; since Phase 6b run 3 (065) every currency an agreement may be in
// (src/lib/agreements/currency.js: M28's 15, the ECB's list and the dirham), each with its own minor unit (yen has none).
// The agreement screens write money through currency.js's moneyText ("US$1,250", as M28 does).
export const CURRENCIES = Object.freeze({
  ...Object.fromEntries(CURRENCY_LIST.map((c) => [c, { symbol: CURRENCY[c].symbol, name: CURRENCY[c].name, exponent: CURRENCY[c].exponent }])),
  GBP: { symbol: '£', name: 'pounds', exponent: 2 }, USD: { symbol: '$', name: 'dollars', exponent: 2 }, EUR: { symbol: '€', name: 'euros', exponent: 2 },
});
export const FIRST_INVOICE_NUMBER = 1201;
export const TERMS_DAYS = Object.freeze({ person: 14, organisation: 30 });
/** Days overdue at which a reminder is drafted (draft-2-emails.md), and how long after the 14-day one it asks for. */
export const REMINDER_DAYS = Object.freeze([3, 7, 14]);
export const SETTLE_BY_DAYS = 7;

const currencyOf = (c) => (CURRENCIES[c] ? c : null);

/** "£18,000", "£3,000.50", "$1,250": whole amounts with no pence, others with two places. Negative as "−£450". */
export function moneyWords(minor, currency = 'GBP') {
  const c = currencyOf(currency);
  if (!c || !Number.isFinite(Number(minor))) throw new Error('An amount needs whole minor units and one of the currencies an agreement may be in.');
  const n = Math.round(Number(minor));
  const abs = Math.abs(n);
  const per = 10 ** CURRENCIES[c].exponent;
  const whole = Math.floor(abs / per);
  const rest = abs % per;
  const text = `${CURRENCIES[c].symbol}${whole.toLocaleString('en-GB')}${rest ? `.${String(rest).padStart(CURRENCIES[c].exponent, '0')}` : ''}`;
  return n < 0 ? `−${text}` : text;
}

/** A rate as Tim writes it: "£750/hr", "£860/month", "£200/session", with no spaces. */
export function rateWords(minor, per, currency = 'GBP') {
  const unit = { hour: 'hr', month: 'month', session: 'session', year: 'year' }[per];
  if (!unit) throw new Error('A rate is per hour, month, session or year.');
  return `${moneyWords(minor, currency)}/${unit}`;
}

/** "CLARITY-1201". The number itself always comes from the database's own sequence (061), never worked out here. */
export function invoiceNumber(n) {
  if (!Number.isInteger(n) || n < FIRST_INVOICE_NUMBER) throw new Error(`Invoice numbers start at ${FIRST_INVOICE_NUMBER}.`);
  return `CLARITY-${n}`;
}
/** The number in "CLARITY-1243", or null. */
export function invoiceNumberOf(text) {
  const m = /^CLARITY-(\d{4,9})$/.exec(String(text || ''));
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= FIRST_INVOICE_NUMBER ? n : null;
}
/** Whether numbers handed out so far are in order with none used twice (gaps from a voided draft are allowed, never reuse). */
export function numbersInOrder(numbers) {
  const ns = (numbers || []).map(invoiceNumberOf);
  if (ns.some((n) => n == null)) return false;
  return ns.every((n, i) => i === 0 || n > ns[i - 1]);
}

/** Days to settle: 14 for a person, 30 for an organisation, unless this invoice says otherwise (1 to 120). */
export function termsDays({ fundedBy = null, override = null } = {}) {
  if (override != null) {
    const n = Number(override);
    if (!Number.isInteger(n) || n < 1 || n > 120) throw new Error('Terms are 1 to 120 days.');
    return n;
  }
  return fundedBy ? TERMS_DAYS.organisation : TERMS_DAYS.person;
}
/** The due day of an invoice sent on `sentDay` (a day key). */
export const dueDay = (sentDay, days) => addDays(sentDay, days);

/**
 * The instalments of an agreement: `count` amounts that add up exactly to `total` (the pennies left over go on the
 * first, so no instalment is ever more than a penny apart), monthly from `firstDay` on the same day of the month (the
 * month's last day when it is shorter: 31 Jan, 28 Feb, 31 Mar). The first is invoiced at signing.
 * @returns {{ n: number, day: string, amount: number }[]}
 */
export function instalments({ total, count, firstDay }) {
  if (!Number.isInteger(total) || total <= 0) throw new Error('The total is a whole number of minor units above zero.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Instalments are 1 to 60.');
  const [y, m, d] = String(firstDay).split('-').map(Number);
  if (!y || !m || !d) throw new Error('The first instalment needs its day.');
  const each = Math.floor(total / count);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const month = m - 1 + i;
    const yy = y + Math.floor(month / 12);
    const mm = (month % 12) + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const day = `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    out.push({ n: i + 1, day, amount: each + (i === 0 ? total - each * count : 0) });
  }
  return out;
}

/**
 * The fees, with each discount its own line under the full price ("Returning client, 15% off"), never a cheaper price.
 * A percentage is taken from the full price; a fixed amount as it is; the total never goes below zero.
 * @param {{ full: number, discounts?: { name: string, percent?: number, amount?: number }[] }} a
 * @returns {{ full: number, lines: { name: string, amount: number }[], total: number }}
 */
export function feeLines({ full, discounts = [] }) {
  if (!Number.isInteger(full) || full < 0) throw new Error('The full price is a whole number of minor units.');
  const lines = [];
  let left = full;
  for (const d of discounts || []) {
    const name = String(d?.name || '').trim();
    if (!name) throw new Error('Every discount has a name.');
    let off;
    if (d.percent != null) {
      const p = Number(d.percent);
      if (!(p > 0 && p <= 100)) throw new Error('A discount is more than 0% and at most 100%.');
      off = Math.round((full * p) / 100);
    } else {
      off = Math.round(Number(d.amount));
      if (!Number.isInteger(off) || off <= 0) throw new Error('A fixed discount is a whole amount above zero.');
    }
    off = Math.min(off, left);
    left -= off;
    lines.push({ name, amount: -off });
  }
  return { full, lines, total: left };
}

/**
 * An agreement in dollars: the rate from pounds, the moment it was read, and the amount fixed in dollars from then on.
 * @returns {{ currency: 'USD', rate: number, rateAt: string, amount: number, words: string }}
 */
export function fixedInDollars({ pounds, rate, rateAt }) {
  const r = Number(rate);
  if (!Number.isInteger(pounds) || pounds < 0) throw new Error('The amount in pounds is a whole number of pence.');
  if (!(r > 0 && r < 10)) throw new Error('The exchange rate is a number of dollars to the pound.');
  const at = new Date(rateAt);
  if (Number.isNaN(at.getTime())) throw new Error('The exchange rate needs the moment it was read.');
  const amount = Math.round(pounds * r);
  return { currency: 'USD', rate: r, rateAt: at.toISOString(), amount, words: `${moneyWords(amount, 'USD')}, at $${r.toFixed(4)} to the pound` };
}

/** The day an invoice becomes 3, 7 or 14 days overdue, in the payer's own time zone (a day key: clock changes can't move it). */
export const overdueOn = (dueKey, days) => addDays(dueKey, days);
/** How many days overdue an invoice due on `dueKey` is at `now`, on the payer's own clock (0 when not yet overdue). */
export function daysOverdue(dueKey, now, zone) {
  const today = dayIn(isZone(zone) ? zone : 'Europe/London', new Date(now));
  return Math.max(0, daysBetween(dueKey, today));
}
/**
 * Today on an invoice's payer's own clock, as the server reads it (daysOverdue: its payer_zone, else London), so Needs
 * you and Finances count the days overdue and the reminder owed exactly as the nightly round does (Stage D break-it:
 * the device counted on the coach's clock). Without `now` (a caller that only knows a day), `today` as given.
 */
export function payerToday(invoice, today, now = null) {
  if (now == null || Number.isNaN(new Date(now).getTime())) return today;
  return dayIn(isZone(invoice?.payer_zone) ? invoice.payer_zone : 'Europe/London', new Date(now));
}
/**
 * The reminders that count for one invoice: every one sent or being sent (one that may have gone keeps its Send again,
 * after a check), and drafts at no lower a stage than the highest drafted or sent. A draft below a later one is retired (the server deletes it when it drafts the later one; this
 * ignores any left), so an invoice never offers two drafts, nor the 7-day one after the 14-day one went (the Stage D
 * break-it tester). The server's Send and drafting, Needs you and Finances read the same.
 */
export function currentReminders(reminders = []) {
  const list = (reminders || []).filter(Boolean);
  const top = Math.max(0, ...list.map((r) => Number(r.stage)).filter(Number.isFinite));
  return list.filter((r) => r.sent_at || r.sending_at || Number(r.stage) >= top);
}
/**
 * The reminder owed `late` days overdue, given the stages already drafted: the latest stage reached that is later than
 * every one drafted, or null. An invoice first seen 9 days overdue owes the 7-day one only (never the 3-day one as
 * well, nor the 3-day one a day later), and the 14-day one on its day (Stage D, item 15).
 */
export function stageOwed(late, drafted = []) {
  const last = Math.max(0, ...(drafted || []).map(Number).filter(Number.isFinite));
  const due = REMINDER_DAYS.filter((d) => late >= d && d > last);
  return due.length ? due.at(-1) : null;
}
/** Which reminder is due now (3, 7 or 14), given those already drafted; null for none. Never one already drafted. */
export function reminderDue({ dueKey, now, zone, drafted = [], paid = false, paused = false }) {
  if (paid || paused || !dueKey) return null;
  return stageOwed(daysOverdue(dueKey, now, zone), drafted);
}
/** The 14-day reminder's settle-by day: 7 days after that email goes, on the payer's clock ("Fri 4 Dec"). */
export function settleBy(sentAt, zone) {
  const day = addDays(dayIn(isZone(zone) ? zone : 'Europe/London', new Date(sentAt)), SETTLE_BY_DAYS);
  return { day, words: dayKeyWords(day) };
}

/**
 * Whether someone sees money for this coaching: never an organisation-funded client who isn't the sponsor (on screens,
 * emails and PDFs). A self-funded client does; the sponsor and the organisation's finance contact do; coaches do.
 */
export function seesMoney({ fundedBy = null, viewer = 'client' } = {}) {
  if (viewer === 'coach' || viewer === 'sponsor' || viewer === 'finance') return true;
  return !fundedBy;
}

/** The month a refund counts against: the month it was refunded, never the original payment's (a minus line there). */
export function refundMonth(refundedAt, zone) {
  return dayIn(isZone(zone) ? zone : 'Europe/London', new Date(refundedAt)).slice(0, 7);
}

/** The words "Ongoing, with a yearly price review" or "Mon 4 Jan 2027 to Fri 2 Jul 2027" for Main points' Dates row. */
export function datesWords({ ongoing = false, startsOn = null, endsOn = null }) {
  if (ongoing) return 'Ongoing, with a yearly price review';
  if (!startsOn || !endsOn) return '';
  return `${dayKeyWords(startsOn, { year: true })} to ${dayKeyWords(endsOn, { year: true })}`;
}
