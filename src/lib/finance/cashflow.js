import { addDays } from '../time/index.js';
import { parseDbTimestamp } from '../dateFormatter.js';
import { expectedPay, threeMonthAverage } from './associates.js';
import { dayOnTimsClock } from './income.js';
import { costsBetween, keepAboveDefault, occurrences, outgoingRows } from './outgoings.js';
import { expectedIncome, likelyDeals } from './projected.js';
import { addMonths, monthDays, monthKey, monthName } from './year.js';
import { poundsWords } from './words.js';

// The cash flow (Phase 6b run 2, step 2), the forecast Tim finds hardest. Checked by tests/performance/finance-cashflow.test.mjs.
//
// - Cash now: the bank balance Tim typed, as of the moment he checked it, plus every payment in since (in pounds at
//   the landed amount; a refund comes off), less every cost out since (outgoings, one-off costs, deadlines with an
//   amount, associate pay marked as paid).
// - Then the rest of this month and 3, 6 or 12 months ahead. Money in: open invoices on their due day (an overdue one
//   isn't counted on, as M11's figures show), signed instalments not invoiced yet, repeating income each month after this one, and,
//   with the switch on, likely deals weighted by their stage's chance (see projected.js for how they're spread).
// - Money out: recurring outgoings by their frequency (a yearly cost in the month it's paid), one-off costs, company
//   deadlines with an amount on their day, and associate pay the month after it's delivered, on the 1st: from what's
//   delivered and booked, else their 3-month average. Last month's pay goes out this month unless it's marked as paid.
// - The tax pot ("Set aside for tax"): each month adds the tax share of that month's profit (in less out, never below
//   nothing). It is money kept aside inside the bank balance, so setting it aside moves no cash. On a deadline with an
//   amount that amount goes out and comes off the pot; on a deadline with no amount whose name says tax or VAT, the
//   whole pot goes out. `spendable` is cash less the pot.
// - Low cash: when the lowest month-end is below "Keep cash above" (2 months of outgoings until Tim sets it), Needs
//   you says "Cash dips to £1,800 in February." and Today's line "Cash dips in February".

export const HORIZONS = Object.freeze([3, 6, 12]);
const TAX_WORDS = /\b(tax|vat)\b/i;

const atOf = (v) => parseDbTimestamp(v).getTime();

/**
 * Cash now, from the bank balance and everything since it was checked.
 * @returns {{ cash: number, checkedDay: string|null, inSince: number, outSince: number }}
 */
export function cashNow({ settings = {}, today, lines = [], outgoings = [], deadlines = [], associatePayouts = [], zone }) {
  const balance = Number(settings.bank_balance_minor) || 0;
  if (!settings.bank_checked_at) return { cash: balance, checkedDay: null, inSince: 0, outSince: 0 };
  const checkedAt = atOf(settings.bank_checked_at);
  const checkedDay = dayOnTimsClock(settings.bank_checked_at, zone);
  const inSince = (lines || []).filter((l) => l.pounds != null && l.day <= today && atOf(l.at) > checkedAt).reduce((a, l) => a + l.pounds, 0);
  const from = addDays(checkedDay, 1);
  let outSince = from <= today ? costsBetween(outgoings, from, today).reduce((a, c) => a + c.amount, 0) : 0;
  for (const d of deadlines || []) {
    if (!(Number(d.amount_minor) > 0) || from > today) continue;
    outSince += occurrences({ every: d.every || 'once', starts_on: d.due_on, on_date: d.due_on }, from, today).length * Number(d.amount_minor);
  }
  outSince += (associatePayouts || []).filter((p) => p.paid_at && atOf(p.paid_at) > checkedAt).reduce((a, p) => a + (Number(p.amount_minor) || 0), 0);
  return { cash: balance + inSince - outSince, checkedDay, inSince, outSince };
}

/** The bank check is asked once a month: when the balance wasn't checked this month (or ever). */
export const bankCheckDue = ({ settings = {}, today, zone }) => !settings.bank_checked_at || monthKey(dayOnTimsClock(settings.bank_checked_at, zone)) !== monthKey(today);

/**
 * The forecast.
 * @param {{ today: string, months?: 3|6|12, settings: object, lines?: object[], outgoings?: object[], deadlines?: object[],
 *   invoices?: object[], versions?: object[], repeating?: object[], rates?: object, leads?: object[], includeLikely?: boolean,
 *   associates?: { coach_id: string, name?: string, hourly_rate_minor: number }[], sessions?: object[],
 *   associatePayouts?: { coach_id: string, month: string, amount_minor: number, paid_at: string }[], zone?: string }} a
 * @returns {{ cashNow: number, end: number, endLabel: string, goingOut: number, keepAbove: number, taxPot: number,
 *   rows: { label: string, month: string, from: string, to: string, in: number, out: number, cash: number, taxPot: number,
 *     spendable: number, below: boolean, belowWords: string, readout: string, items: object[] }[],
 *   lowest: { cash: number, month: string, words: string }, needsYou: string|null, todayShort: string|null,
 *   todayReadout: string, notInPounds: number }}
 */
export function cashFlow(a) {
  const { today, months = 6, settings = {}, lines = [], outgoings = [], deadlines = [], invoices = [], versions = [], repeating = [],
    rates = {}, leads = [], includeLikely = false, associates = [], sessions = [], associatePayouts = [], zone } = a;
  if (!HORIZONS.includes(months)) throw new Error('The cash flow looks 3, 6 or 12 months ahead.');
  const now = cashNow({ settings, today, lines, outgoings, deadlines, associatePayouts, zone });
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, months);

  const periods = [{ label: `Rest of ${monthName(thisMonth)}`, month: thisMonth, from: addDays(today, 1), to: monthDays(thisMonth).last }];
  for (let k = 1; k <= months; k += 1) {
    const m = addMonths(thisMonth, k);
    periods.push({ label: monthName(m), month: m, from: monthDays(m).first, to: monthDays(m).last });
  }
  const periodOf = (day) => (day <= periods[0].to ? 0 : periods.findIndex((p) => day >= p.from && day <= p.to));

  const ins = periods.map(() => []);
  const outs = periods.map(() => []);
  let notInPounds = 0;
  const income = [...expectedIncome({ today, untilMonth: lastMonth, invoices, versions, repeating, rates, zone }), ...(includeLikely ? likelyDeals({ leads, today }) : [])];
  for (const i of income) {
    if (i.pounds == null) { notInPounds += 1; continue; }
    const k = periodOf(i.day);
    if (k >= 0) ins[k].push(i);
  }
  for (const c of costsBetween(outgoings, periods[0].from, periods.at(-1).to)) outs[periodOf(c.day)].push(c);
  const taxDays = [];
  for (const d of deadlines || []) {
    for (const day of occurrences({ every: d.every || 'once', starts_on: d.due_on, on_date: d.due_on }, periods[0].from, periods.at(-1).to)) {
      if (Number(d.amount_minor) > 0) outs[periodOf(day)].push({ day, amount: Number(d.amount_minor), name: d.name, kind: 'deadline', paysTax: true });
      else if (TAX_WORDS.test(String(d.name || ''))) taxDays.push({ k: periodOf(day), day, name: d.name });
    }
  }
  const paidFor = new Set((associatePayouts || []).map((p) => `${p.coach_id}#${monthKey(p.month)}`));
  for (const as of associates || []) {
    const rate = Number(as.hourly_rate_minor) || 0;
    for (let m = addMonths(thisMonth, -1); m < lastMonth; m = addMonths(m, 1)) {
      if (paidFor.has(`${as.coach_id}#${m}`)) continue;
      const pay = expectedPay({ coachId: as.coach_id, rateMinor: rate, sessions, month: m, fromMonth: thisMonth, zone, noShowsPaid: settings.no_shows_paid });
      if (!pay.payMinor) continue;
      const day = `${addMonths(m, 1)}-01`;
      outs[periodOf(day)].push({ day, amount: pay.payMinor, name: as.name || 'Associate', kind: 'associate', coach_id: as.coach_id, forMonth: m, from: pay.from });
    }
  }

  const share = Math.max(0, Math.min(100, Number(settings.tax_share_percent ?? 25)));
  let pot = Math.max(0, Number(settings.tax_pot_minor) || 0);
  let cash = now.cash;
  const rows = periods.map((p, k) => {
    let inSum = ins[k].reduce((s, i) => s + i.pounds, 0);
    let outSum = outs[k].reduce((s, o) => s + o.amount, 0);
    for (const o of outs[k]) if (o.paysTax) pot = Math.max(0, pot - o.amount);
    const profit = inSum - outs[k].filter((o) => !o.paysTax).reduce((s, o) => s + o.amount, 0);
    pot += Math.max(0, Math.round((profit * share) / 100));
    for (const t of taxDays.filter((d) => d.k === k)) {
      if (pot > 0) outs[k].push({ day: t.day, amount: pot, name: t.name, kind: 'tax_pot' });
      outSum += pot;
      pot = 0;
    }
    cash += inSum - outSum;
    inSum = Math.round(inSum);
    return { ...p, in: inSum, out: outSum, cash, taxPot: pot, spendable: cash - pot, items: [...ins[k], ...outs[k]] };
  });

  const monthlyAssociates = (associates || []).map((as) => ({ name: as.name || 'Associate',
    monthlyMinor: threeMonthAverage({ coachId: as.coach_id, rateMinor: Number(as.hourly_rate_minor) || 0, sessions, month: thisMonth, zone, noShowsPaid: settings.no_shows_paid }) }));
  const goingOut = outgoingRows({ outgoings, today, associates: monthlyAssociates }).total;
  const keepAbove = settings.keep_above_minor != null ? Number(settings.keep_above_minor) : keepAboveDefault(goingOut);
  for (const r of rows) {
    r.below = r.cash < keepAbove;
    r.belowWords = r.below ? `Below ${poundsWords(keepAbove)}` : '';
    const end = r.month === thisMonth ? `End of ${monthName(r.month)} (so far)` : `End of ${monthName(r.month)}`;
    r.readout = `${end}, ${poundsWords(r.cash)}, in ${poundsWords(r.in)}, out ${poundsWords(r.out)}`;
  }
  const low = rows.reduce((best, r) => (r.cash < best.cash ? r : best), rows[0]);
  const dips = low.cash < keepAbove;
  return {
    cashNow: now.cash,
    end: rows.at(-1).cash,
    endLabel: `In ${months} months`,
    goingOut,
    keepAbove,
    taxPot: rows.at(-1).taxPot,
    rows,
    lowest: { cash: low.cash, month: low.month, words: monthName(low.month) },
    needsYou: dips ? `Cash dips to ${poundsWords(low.cash)} in ${monthName(low.month)}.` : null,
    todayShort: dips ? `Cash dips in ${monthName(low.month)}` : null,
    todayReadout: `Today, ${poundsWords(now.cash)}`,
    notInPounds,
  };
}
