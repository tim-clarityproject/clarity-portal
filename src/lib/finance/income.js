import { dayIn } from '../time/index.js';
import { parseDbTimestamp } from '../dateFormatter.js';
import { financeZone, monthKey } from './year.js';

// Income (Phase 6b run 2, step 2: Money). Plain sums over the rows 061 keeps, checked by tests/performance/finance-income.test.mjs.
//
// - Income counts on the day it was paid, on Tim's own clock (Europe/London unless given): a payment at 23:30 UTC on
//   31 Oct in summer time is 1 Nov's, and in winter it is 31 Oct's.
// - In pounds at the amount that landed (payments.landed_gbp_minor), else the amount itself when it was in pounds. A
//   dollar payment with no landed figure yet is left out of every pounds total and flagged (`pending`), never guessed.
// - A refund (a credit note of kind 'refund') comes off the month it was refunded, as a minus line linked to the
//   original payment, at that payment's landed rate. A credit (kind 'credit') is kept against future work, so it
//   changes no income.
// - Stripe's fee (payments.fee_minor) is read as pence: Stripe takes it in the account's own currency, pounds.
// - Pro bono hours have a worth at Tim's rates, and are never income.

export const DEFAULT_SECTORS = Object.freeze(['Business', 'Sport', 'Medicine', 'Personal']);

const byId = (rows) => new Map((rows || []).filter((r) => r && r.id != null).map((r) => [r.id, r]));
const num = (v) => (v == null || v === '' ? null : Number(v));

/** The day an instant (a database timestamp, read through parseDbTimestamp) falls on, on Tim's clock. */
export function dayOnTimsClock(at, zone) {
  const d = parseDbTimestamp(at);
  if (Number.isNaN(d.getTime())) throw new Error('A payment needs the moment it was paid.');
  return dayIn(financeZone(zone), d);
}

/**
 * A payment in pounds: the landed amount, else the amount if it was in pounds; null (pending) for another currency
 * that hasn't landed yet.
 * @returns {{ pounds: number|null, pending: boolean, rate: number|null }} rate in dollars to the pound, when known
 */
export function paymentPounds(p) {
  const amount = Number(p.amount_minor);
  const landed = num(p.landed_gbp_minor);
  if (landed != null) return { pounds: landed, pending: false, rate: p.currency === 'GBP' || !landed ? null : amount / landed };
  if (p.currency === 'GBP') return { pounds: amount, pending: false, rate: null };
  return { pounds: null, pending: true, rate: null };
}

/**
 * Every payment and refund as one line each, on its paid (or refunded) day on Tim's clock.
 * @param {{ payments?: object[], creditNotes?: object[], invoices?: object[], zone?: string }} a
 * @returns {{ id, kind: 'payment'|'refund', day: string, month: string, pounds: number|null, pending: boolean,
 *   amount_minor: number, currency: string, rate: number|null, fee_minor: number, sector: string|null, invoice_id,
 *   profile_id, organisation_id, payment_id: string|null, added_by_coach: boolean, method: string|null }[]}
 *   amount_minor and pounds are minus for a refund; payment_id is the refund's original payment. Sorted by day.
 */
export function incomeLines({ payments = [], creditNotes = [], invoices = [], zone } = {}) {
  const inv = byId(invoices);
  const lines = [];
  for (const p of payments || []) {
    const i = inv.get(p.invoice_id) || {};
    const day = dayOnTimsClock(p.paid_at, zone);
    const { pounds, pending, rate } = paymentPounds(p);
    lines.push({
      id: p.id ?? null, kind: 'payment', day, month: monthKey(day), pounds, pending, amount_minor: Number(p.amount_minor),
      currency: p.currency, rate, fee_minor: Number(p.fee_minor) || 0, sector: p.sector ?? i.sector ?? null,
      invoice_id: p.invoice_id ?? null, profile_id: p.profile_id ?? i.profile_id ?? null,
      organisation_id: p.organisation_id ?? i.organisation_id ?? null, payment_id: null,
      added_by_coach: Boolean(p.added_by_coach), method: p.method ?? null, at: p.paid_at,
    });
  }
  const paymentsOn = (invoiceId) => lines.filter((l) => l.kind === 'payment' && l.invoice_id === invoiceId);
  for (const c of creditNotes || []) {
    if (c.kind !== 'refund') continue; // a credit is kept against future work: no income changes
    const i = inv.get(c.invoice_id) || {};
    const day = dayOnTimsClock(c.created_at, zone);
    const refundAt = parseDbTimestamp(c.created_at).getTime();
    // The original: the latest payment on the invoice before the refund, preferring one in the refund's currency that
    // has landed in pounds (its rate turns the refund into pounds).
    const on = paymentsOn(c.invoice_id);
    const before = on.filter((l) => parseDbTimestamp(l.at).getTime() <= refundAt);
    const landed = (l) => l.currency === c.currency && l.pounds != null;
    const original = before.filter(landed).at(-1) || on.filter(landed)[0] || before.at(-1) || on[0] || null;
    const amount = Number(c.amount_minor);
    let pounds = null;
    if (c.currency === 'GBP') pounds = -amount;
    else if (original && original.currency === c.currency && original.pounds != null && original.amount_minor > 0) {
      pounds = -Math.round((amount * original.pounds) / original.amount_minor);
    }
    lines.push({
      id: c.id ?? null, kind: 'refund', day, month: monthKey(day), pounds, pending: pounds == null, amount_minor: -amount,
      currency: c.currency, rate: original?.rate ?? null, fee_minor: 0, sector: original?.sector ?? i.sector ?? null,
      invoice_id: c.invoice_id ?? null, profile_id: original?.profile_id ?? i.profile_id ?? null,
      organisation_id: original?.organisation_id ?? i.organisation_id ?? null, payment_id: original?.id ?? null,
      added_by_coach: false, method: null, at: c.created_at, number: c.number ?? null,
    });
  }
  return lines.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const inMonths = (months) => {
  const set = new Set((months || []).map(monthKey));
  return (l) => set.has(l.month);
};
const counted = (l) => l.pounds != null;

/** Pounds in the given months (refunds taken off), pending lines left out. */
export const incomeIn = (lines, months) => (lines || []).filter(inMonths(months)).filter(counted).reduce((a, l) => a + l.pounds, 0);

/** Pounds between two days, both included. */
export const incomeBetween = (lines, from, to) => (lines || []).filter((l) => l.day >= from && l.day <= to).filter(counted).reduce((a, l) => a + l.pounds, 0);

/** Pounds for each month: { '2026-11': 230000, … }, with every asked month present. */
export function incomeByMonth(lines, months, { sector = null } = {}) {
  const out = Object.fromEntries((months || []).map((m) => [monthKey(m), 0]));
  for (const l of lines || []) {
    if (!counted(l) || !(l.month in out)) continue;
    if (sector && l.sector !== sector) continue;
    out[l.month] += l.pounds;
  }
  return out;
}

/** Running totals of incomeByMonth in the months' order. */
export function runningTotals(byMonth, months) {
  let t = 0;
  return Object.fromEntries((months || []).map((m) => { t += byMonth[monthKey(m)] || 0; return [monthKey(m), t]; }));
}

/** Payments in another currency that haven't landed in pounds yet: left out of the pounds totals, flagged here. */
export const notYetInPounds = (lines, months) => (lines || []).filter((l) => l.pending && (!months || inMonths(months)(l)));

/** "Stripe fees this month": the fees on payments in the months, in pence. */
export const stripeFees = (lines, months) => (lines || []).filter(inMonths(months)).reduce((a, l) => a + (l.fee_minor || 0), 0);

/**
 * Shares that are whole percents adding up to exactly 100 (largest remainder), from amounts; a minus or nothing counts
 * as 0. All zero gives all 0.
 */
export function sharesOf(amounts) {
  const xs = amounts.map((a) => Math.max(0, Number(a) || 0));
  const total = xs.reduce((a, b) => a + b, 0);
  if (!total) return xs.map(() => 0);
  const raw = xs.map((x) => (x * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length) { out[order[k][1]] += 1; left -= 1; }
  return out;
}

/**
 * By sector: what came in (Paid) and what's to come, each sector's share of what came in adding up to 100%.
 * @param {{ lines: object[], months: string[], toCome?: { sector: string|null, pounds: number, month: string }[], sectors?: string[] }} a
 * @returns {{ sector: string|null, paid: number, toCome: number, share: number }[]} the named sectors in order, then any
 *   other sector found (null for a payment with no sector), each only when it has something
 */
export function sectorRows({ lines, months, toCome = [], sectors = DEFAULT_SECTORS }) {
  const rows = new Map(sectors.map((s) => [s, { sector: s, paid: 0, toCome: 0 }]));
  const row = (s) => { if (!rows.has(s)) rows.set(s, { sector: s, paid: 0, toCome: 0 }); return rows.get(s); };
  const keep = inMonths(months);
  for (const l of lines || []) if (keep(l) && counted(l)) row(l.sector ?? null).paid += l.pounds;
  for (const t of toCome || []) if (keep(t) && t.pounds != null) row(t.sector ?? null).toCome += t.pounds;
  const list = [...rows.values()].filter((r) => sectors.includes(r.sector) || r.paid || r.toCome);
  const shares = sharesOf(list.map((r) => r.paid));
  return list.map((r, i) => ({ ...r, share: shares[i] }));
}

/**
 * By client: pounds in the months for each client (a person's profile, or an organisation), the most first.
 * @returns {{ key: string, profile_id, organisation_id, pounds: number, addedByCoach: boolean }[]}
 */
export function clientRows(lines, months) {
  const keep = inMonths(months);
  const rows = new Map();
  for (const l of lines || []) {
    if (!keep(l) || !counted(l)) continue;
    const key = l.organisation_id ? `org:${l.organisation_id}` : l.profile_id ? `person:${l.profile_id}` : 'unknown';
    const r = rows.get(key) || { key, profile_id: l.organisation_id ? null : l.profile_id, organisation_id: l.organisation_id || null, pounds: 0, addedByCoach: false };
    r.pounds += l.pounds;
    r.addedByCoach = r.addedByCoach || l.added_by_coach;
    rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => b.pounds - a.pounds);
}

/**
 * Pro bono this year: hours held on pro bono engagements and their worth at Tim's rates. Never income, never counted
 * towards targets.
 * @param {{ sessions: { starts_at, minutes, outcome, rate_minor? }[], hourlyRateMinor: number, from: string, to: string, zone?: string }} a
 *   a session's own rate_minor (an hour) wins over hourlyRateMinor
 * @returns {{ minutes: number, worth: number }}
 */
export function proBono({ sessions = [], hourlyRateMinor = 0, from, to, zone }) {
  let minutes = 0;
  let worth = 0;
  for (const s of sessions || []) {
    if (s.outcome !== 'held') continue;
    const day = dayOnTimsClock(s.starts_at, zone);
    if (day < from || day > to) continue;
    const m = Math.max(0, Number(s.minutes) || 0);
    minutes += m;
    worth += Math.round((m * Number(s.rate_minor ?? hourlyRateMinor)) / 60);
  }
  return { minutes, worth };
}
