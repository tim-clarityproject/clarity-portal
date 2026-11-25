import { addDays } from '../time/index.js';
import { parseDbTimestamp } from '../dateFormatter.js';
import { expectedPay, threeMonthAverage } from './associates.js';
import { dayOnTimsClock, incomeBetween } from './income.js';
import { costsBetween, keepAboveDefault, occurrences, outgoingRows } from './outgoings.js';
import { expectedIncome, likelyDeals } from './projected.js';
import { addMonths, DEFAULT_YEAR_START_MONTH, financialYear, monthDays, monthKey, monthName } from './year.js';
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
//   deadlines with an amount on their day, and associate pay the month after it's delivered, on the 1st. A month gone
//   by, and this month so far, is what 062's associate_month_minutes says was delivered (held or ended with no outcome
//   yet, late cancellations unless waived, no-shows only when Tim pays them; `monthMinutes`); this month's sessions
//   still to come and later months' bookings are 058's; a month with nothing delivered or booked is their 3-month
//   average. Without 062's minutes, 058's reading quietly stands in (a past session counts as held). Last month's pay
//   goes out this month unless it's marked as paid (a statement's paid_on).
// - The tax pot ("Set aside for tax"), worked out, never typed: from the financial year's first day to today, each
//   month sets aside the tax share of its profit (income in pounds less the costs paid that month: outgoings, one-off
//   costs, company deadlines that aren't tax, associate pay marked as paid; a month's profit never below nothing),
//   less tax already paid (`taxPotSoFar`). Then the forecast carries it on month by month. It is money kept aside inside
//   the bank balance, so setting it aside moves no cash. Only tax deadlines pay out of the pot: kind corporation_tax
//   or vat_return, or a name that says tax or VAT. One with an amount takes that amount off the pot; one with no amount
//   pays out the whole pot. Any other deadline with an amount (the confirmation statement's fee) is an ordinary cost
//   that lowers the profit. `spendable` is cash less the pot.
// - Low cash: when the lowest month-end is below "Keep cash above" (2 months of outgoings until Tim sets it), Needs
//   you says "Cash dips to £1,800 in February." and Today's line "Cash dips in February".

export const HORIZONS = Object.freeze([3, 6, 12]);
const TAX_WORDS = /\b(tax|vat)\b/i;
const TAX_KINDS = new Set(['corporation_tax', 'vat_return']);

/** Whether a company deadline pays tax out of the pot: corporation tax or a VAT return, or named with tax or VAT. */
export const isTaxDeadline = (d) => Boolean(d) && (TAX_KINDS.has(d.kind) || TAX_WORDS.test(String(d.name || '')));

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

/**
 * The tax pot so far: from the financial year's first day to today, the tax share of each month's profit (never below
 * nothing), less the tax deadlines paid by today (an amount comes off; none pays out the whole pot).
 * @returns {{ pot: number, monthProfit: number }} monthProfit is this month's profit so far (the forecast finishes the month)
 */
export function taxPotSoFar({ today, startMonth = DEFAULT_YEAR_START_MONTH, settings = {}, lines = [], outgoings = [], deadlines = [], associatePayouts = [], zone }) {
  const share = Math.max(0, Math.min(100, Number(settings.tax_share_percent ?? 25)));
  const fy = financialYear(today, startMonth);
  const thisMonth = monthKey(today);
  const payouts = (associatePayouts || []).filter((p) => p.paid_at).map((p) => ({ day: dayOnTimsClock(p.paid_at, zone), amount: Number(p.amount_minor) || 0 }));
  let pot = 0;
  let monthProfit = 0;
  for (const m of fy.months) {
    if (m > thisMonth) break;
    const from = monthDays(m).first;
    const to = m === thisMonth ? today : monthDays(m).last;
    let costs = costsBetween(outgoings, from, to).reduce((a, c) => a + c.amount, 0);
    const taxPaid = [];
    for (const d of deadlines || []) {
      for (const day of occurrences({ every: d.every || 'once', starts_on: d.due_on, on_date: d.due_on }, from, to)) {
        if (isTaxDeadline(d)) taxPaid.push({ day, amount: Number(d.amount_minor) > 0 ? Number(d.amount_minor) : null });
        else if (Number(d.amount_minor) > 0) costs += Number(d.amount_minor);
      }
    }
    costs += payouts.filter((p) => p.day >= from && p.day <= to).reduce((a, p) => a + p.amount, 0);
    const profit = incomeBetween(lines, from, to) - costs;
    if (m === thisMonth) monthProfit = profit;
    pot += Math.max(0, Math.round((profit * share) / 100));
    for (const t of taxPaid.sort((a, b) => (a.day < b.day ? -1 : 1))) pot = t.amount == null ? 0 : Math.max(0, pot - t.amount);
  }
  return { pot, monthProfit };
}

/** The bank check is asked once a month: when the balance wasn't checked this month (or ever). */
export const bankCheckDue = ({ settings = {}, today, zone }) => !settings.bank_checked_at || monthKey(dayOnTimsClock(settings.bank_checked_at, zone)) !== monthKey(today);

/**
 * The forecast.
 * @param {{ today: string, months?: 3|6|12, settings: object, lines?: object[], outgoings?: object[], deadlines?: object[],
 *   invoices?: object[], versions?: object[], repeating?: object[], rates?: object, leads?: object[], includeLikely?: boolean,
 *   associates?: { coach_id: string, name?: string, hourly_rate_minor: number }[], sessions?: object[],
 *   associatePayouts?: { coach_id: string, month: string, amount_minor: number, paid_at: string }[],
 *   monthMinutes?: Record<string, object[]>|null, zone?: string }} a
 *   monthMinutes: 062's associate_month_minutes rows by month ('YYYY-MM'), for the months read
 * @returns {{ cashNow: number, end: number, endLabel: string, goingOut: number, keepAbove: number, taxPot: number, taxPotNow: number,
 *   rows: { label: string, month: string, from: string, to: string, in: number, out: number, cash: number, taxPot: number,
 *     spendable: number, below: boolean, belowWords: string, readout: string, items: object[] }[],
 *   lowest: { cash: number, month: string, words: string }, needsYou: string|null, todayShort: string|null,
 *   todayReadout: string, notInPounds: number }}
 */
export function cashFlow(a) {
  const { today, months = 6, settings = {}, lines = [], outgoings = [], deadlines = [], invoices = [], versions = [], repeating = [],
    rates = {}, leads = [], includeLikely = false, associates = [], sessions = [], associatePayouts = [], monthMinutes = null, zone } = a;
  const startMonth = Number(settings.year_start_month) || DEFAULT_YEAR_START_MONTH;
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
      const tax = isTaxDeadline(d);
      if (Number(d.amount_minor) > 0) outs[periodOf(day)].push({ day, amount: Number(d.amount_minor), name: d.name, kind: 'deadline', paysTax: tax });
      else if (tax) taxDays.push({ k: periodOf(day), day, name: d.name });
    }
  }
  const paidFor = new Set((associatePayouts || []).map((p) => `${p.coach_id}#${monthKey(p.month)}`));
  for (const as of associates || []) {
    const rate = Number(as.hourly_rate_minor) || 0;
    for (let m = addMonths(thisMonth, -1); m < lastMonth; m = addMonths(m, 1)) {
      if (paidFor.has(`${as.coach_id}#${m}`)) continue;
      const pay = expectedPay({ coachId: as.coach_id, rateMinor: rate, sessions, month: m, fromMonth: thisMonth, zone, noShowsPaid: settings.no_shows_paid, monthMinutes });
      if (!pay.payMinor) continue;
      const day = `${addMonths(m, 1)}-01`;
      outs[periodOf(day)].push({ day, amount: pay.payMinor, name: as.name || 'Associate', kind: 'associate', coach_id: as.coach_id, forMonth: m, from: pay.from });
    }
  }

  const share = Math.max(0, Math.min(100, Number(settings.tax_share_percent ?? 25)));
  const soFar = taxPotSoFar({ today, startMonth, settings, lines, outgoings, deadlines, associatePayouts, zone });
  let pot = soFar.pot;
  let cash = now.cash;
  const setAside = (profit) => Math.max(0, Math.round((profit * share) / 100));
  const rows = periods.map((p, k) => {
    let inSum = ins[k].reduce((s, i) => s + i.pounds, 0);
    let outSum = outs[k].reduce((s, o) => s + o.amount, 0);
    for (const o of outs[k]) if (o.paysTax) pot = Math.max(0, pot - o.amount);
    const profit = inSum - outs[k].filter((o) => !o.paysTax).reduce((s, o) => s + o.amount, 0);
    // The rest of this month finishes the month the pot so far began: the month's whole profit, never below nothing.
    pot = k === 0 ? Math.max(0, pot + setAside(soFar.monthProfit + profit) - setAside(soFar.monthProfit)) : pot + setAside(profit);
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
    monthlyMinor: threeMonthAverage({ coachId: as.coach_id, rateMinor: Number(as.hourly_rate_minor) || 0, sessions, month: thisMonth, zone, noShowsPaid: settings.no_shows_paid, monthMinutes }) }));
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
    taxPotNow: soFar.pot,
    rows,
    lowest: { cash: low.cash, month: low.month, words: monthName(low.month) },
    needsYou: dips ? `Cash dips to ${poundsWords(low.cash)} in ${monthName(low.month)}.` : null,
    todayShort: dips ? `Cash dips in ${monthName(low.month)}` : null,
    todayReadout: `Today, ${poundsWords(now.cash)}`,
    notInPounds,
  };
}
