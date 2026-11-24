import { addDays } from '../time/index.js';
import { invoicesFor } from '../billing/invoicePlan.js';
import { addMonths, monthKey } from './year.js';
import { dayOnTimsClock } from './income.js';

// What's still to come (Phase 6b run 2): the money Finances expects but hasn't been paid, each on the day it is
// expected to arrive. Shared by Money's four figures, the chart's projected parts and the cash flow.
//
// - Signed instalments not invoiced yet: run 1's invoicesFor on each signed version's terms, less the instalments that
//   already have an invoice (any status: a voided one was stopped on purpose). Each arrives on its draft day plus its
//   payment terms.
// - Drafted and sent invoices: what's left on them (total less paid), on their due day; a draft with no due day yet is
//   due its terms from today. A sent invoice past its due day is overdue: Money shows it, the projections leave it out.
// - Repeating income (portal seats, memberships): each month after the current one. This month's is already an invoice.
// - Likely deals (the cash flow's switch only): each lead's value at its stage's chance of winning.
// - Amounts in dollars: an agreement's at its own fixed rate (fx_rate, dollars to the pound); an invoice's at the
//   rate the caller passes (rates.USD, dollars to the pound), else left out of pounds and flagged pending.

const toPounds = (minor, currency, dollarsPerPound) => {
  if (currency === 'GBP' || !currency) return minor;
  const r = Number(dollarsPerPound);
  return r > 0 ? Math.round(minor / r) : null;
};

/**
 * Signed agreements' instalments that haven't been invoiced yet.
 * @param {{ versions: { agreement_id, terms: object, currency?, fx_rate?, total_minor?, client_signed_at, sector?, profile_id?,
 *   organisation_id? }[], invoices?: { agreement_id, instalment_n, kind? }[], zone?: string }} a
 * @returns {{ kind: 'instalment', agreement_id, n: number, of: number, draft_on: string, due_on: string, day: string, month: string,
 *   amount_minor: number, currency: string, pounds: number|null, sector, profile_id, organisation_id }[]} day is when it's expected:
 *   its due day, or `today` when that has gone by and it still has no invoice
 */
export function plannedInstalments({ versions = [], invoices = [], today = null, zone } = {}) {
  const done = new Set((invoices || []).filter((i) => i.agreement_id && (i.kind ?? 'instalment') === 'instalment')
    .map((i) => `${i.agreement_id}#${i.instalment_n ?? 1}`));
  const out = [];
  for (const v of versions || []) {
    if (!v || !v.client_signed_at || (v.status && v.status !== 'signed')) continue;
    const currency = v.currency || v.terms?.currency || 'GBP';
    const terms = { ...(v.terms || {}), currency, total_minor: v.terms?.total_minor ?? v.total_minor };
    const signedDay = dayOnTimsClock(v.client_signed_at, zone);
    for (const p of invoicesFor(terms, { signedDay })) {
      if (done.has(`${v.agreement_id}#${p.n}`)) continue;
      const due = addDays(p.day, p.termsDays);
      const day = today && due < today ? today : due;
      out.push({ kind: 'instalment', agreement_id: v.agreement_id, n: p.n, of: p.of, draft_on: p.day, due_on: due, day, month: monthKey(day),
        amount_minor: p.total, currency, pounds: toPounds(p.total, currency, v.fx_rate ?? terms.fxRate),
        sector: v.sector ?? terms.sector ?? null, profile_id: v.profile_id ?? null, organisation_id: v.organisation_id ?? null });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/**
 * Drafted and sent invoices still to be settled.
 * @returns {{ kind: 'draft'|'sent'|'overdue', id, number, day: string, due_on: string, month: string, amount_minor: number,
 *   currency: string, pounds: number|null, sector, profile_id, organisation_id }[]} day is when it's expected (an overdue
 *   one: today)
 */
export function openInvoices({ invoices = [], today, rates = {} }) {
  const out = [];
  for (const i of invoices || []) {
    if (i.status !== 'draft' && i.status !== 'sent') continue;
    if (i.waived_at) continue;
    const left = Math.max(0, Number(i.total_minor) - Number(i.paid_minor || 0));
    if (!left) continue;
    const due = i.due_on || addDays(today, Number(i.terms_days) || 14);
    const overdue = i.status === 'sent' && due < today;
    const day = due < today ? today : due;
    out.push({ kind: overdue ? 'overdue' : i.status, id: i.id, number: i.number ?? null, day, due_on: due, month: monthKey(day),
      amount_minor: left, currency: i.currency || 'GBP', pounds: toPounds(left, i.currency, rates.USD),
      sector: i.sector ?? null, profile_id: i.profile_id ?? null, organisation_id: i.organisation_id ?? null });
  }
  return out;
}

/** Repeating income in each month after `today`'s, up to and including `untilMonth`: one item a month each, on the 1st. */
export function repeatingIncome({ repeating = [], today, untilMonth }) {
  const out = [];
  const end = monthKey(untilMonth);
  for (let m = addMonths(today, 1); m <= end; m = addMonths(m, 1)) {
    for (const r of repeating || []) {
      if ((r.per ?? 'month') !== 'month' || !(Number(r.amount_minor) > 0)) continue;
      out.push({ kind: 'repeating', name: r.name, day: `${m}-01`, month: m, amount_minor: Number(r.amount_minor), currency: 'GBP',
        pounds: Number(r.amount_minor), sector: r.sector ?? null });
    }
  }
  return out;
}

/**
 * Likely deals, each at its value times its stage's chance. A deal with an expected day is expected that month (a day
 * already gone: next month); one without is spread evenly over the 3 months after this one (the pennies left on the
 * first). Won (100%) and lost (0%) stages are left out: a won deal is a client with an agreement.
 * @returns {{ kind: 'likely', day: string, month: string, pounds: number }[]}
 */
export function likelyDeals({ leads = [], today }) {
  const out = [];
  for (const l of leads || []) {
    const chance = Number(l.likelihood);
    const value = Number(l.value_minor);
    if (!(chance > 0 && chance < 100) || !(value > 0)) continue;
    const weighted = Math.round((value * chance) / 100);
    if (l.expected_on) {
      const day = l.expected_on > today ? l.expected_on : `${addMonths(today, 1)}-01`;
      out.push({ kind: 'likely', day, month: monthKey(day), pounds: weighted });
      continue;
    }
    const each = Math.floor(weighted / 3);
    for (let k = 1; k <= 3; k += 1) {
      const m = addMonths(today, k);
      out.push({ kind: 'likely', day: `${m}-01`, month: m, pounds: each + (k === 1 ? weighted - each * 3 : 0) });
    }
  }
  return out;
}

/**
 * Everything expected from signed work, in one list: open invoices not yet overdue, signed instalments not invoiced, and
 * repeating income up to `untilMonth`. An overdue invoice is left out of what's projected (it shows as Overdue on
 * Money, and the forecast doesn't count on it), as M11's figures do: November's £1,900 more projected is Due £1,200 and
 * Not invoiced yet £700, without the £940 overdue. Likely deals are separate (the cash flow's switch).
 */
export function expectedIncome({ today, untilMonth, invoices = [], versions = [], repeating = [], rates = {}, zone }) {
  return [
    ...openInvoices({ invoices, today, rates }).filter((i) => i.kind !== 'overdue'),
    ...plannedInstalments({ versions, invoices, today, zone }),
    ...repeatingIncome({ repeating, today, untilMonth }),
  ];
}
