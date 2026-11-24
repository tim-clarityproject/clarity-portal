import { feeLines, instalments, termsDays } from './money.js';

// Which invoices an agreement makes, and when (Phase 6b run 1, step 4): plain rules shared by the server
// (api/_routes/coach-billing.js drafts them in Stripe) and its nightly round, checked by tests/performance/billing-plan.test.mjs.
// Nothing here sends: every invoice starts as a draft that waits for the coach's Send.
//
// - Paid in full: one invoice at signing, the full price with each discount as its own line under it.
// - Instalments: the first at signing, each later one drafted on its own day; the amounts add up exactly to the total
//   after discounts, and each names its place ("instalment 2 of 6").
// - Pro bono: no invoice at all (its hours are still counted elsewhere).
// - Who settles it: the client, or for an organisation-funded client the organisation's finance contact, with 30 days'
//   terms and the purchase order number when there is one.

/**
 * @param {object} terms agreement_versions.terms: { coaching, total_minor (the full price), currency, instalments, discounts, proBono,
 *   fundedBy, poNumber, termsDays, startsOn }
 * @param {{ signedDay: string }} when the day it was signed (the first invoice's day)
 * @returns {{ n: number, of: number, day: string, total: number, lines: { description: string, amount: number }[], termsDays: number,
 *   settlesTo: 'client'|'organisation', poNumber: string|null }[]}
 */
export function invoicesFor(terms, { signedDay }) {
  if (!terms || terms.proBono || !(Number(terms.total_minor) > 0)) return [];
  const currency = terms.currency === 'USD' ? 'USD' : 'GBP';
  const fees = feeLines({ full: Number(terms.total_minor), discounts: terms.discounts || [] });
  const count = Math.max(1, Number(terms.instalments) || 1);
  const days = termsDays({ fundedBy: terms.fundedBy || null, override: terms.termsDays ?? null });
  const settlesTo = terms.fundedBy ? 'organisation' : 'client';
  const poNumber = terms.poNumber ? String(terms.poNumber).slice(0, 100) : null;
  const what = String(terms.coaching || 'Coaching').slice(0, 200);
  if (count === 1) {
    return [{ n: 1, of: 1, day: signedDay, total: fees.total, termsDays: days, settlesTo, poNumber,
      lines: [{ description: what, amount: fees.full }, ...fees.lines.map((l) => ({ description: l.name, amount: l.amount }))] }];
  }
  const firstDay = terms.firstInstalmentOn && terms.firstInstalmentOn > signedDay ? terms.firstInstalmentOn : signedDay;
  // Each instalment carries its share of the full price, then each discount's share as its own named line under it
  // (a discount is always its own line; functionality tester, 6b run 1). Every column is split exactly, so the
  // instalments add up to the discounted total to the penny.
  const fullShares = instalments({ total: fees.full, count, firstDay });
  const offShares = fees.lines.map((l) => (l.amount ? instalments({ total: -l.amount, count, firstDay }) : null));
  return fullShares.map((i, k) => {
    const lines = [{ description: `${what}, instalment ${i.n} of ${count}`, amount: i.amount }];
    fees.lines.forEach((l, j) => { if (offShares[j]) lines.push({ description: l.name, amount: -offShares[j][k].amount }); });
    return { n: i.n, of: count, day: i.day, total: lines.reduce((a, l) => a + l.amount, 0), termsDays: days, settlesTo, poNumber, lines };
  });
}

/** The invoices due to be drafted by `today` that aren't drafted yet (by their place: n), the soonest first. */
export const dueToDraft = (planned, draftedNs, today) => planned.filter((p) => p.day <= today && !draftedNs.includes(p.n));

/** A late cancellation for a pay-per-session client: one invoice for the session at its rate (the coach may Waive it). */
export function lateCancelInvoice({ rateMinor, coaching = 'Coaching session', sessionDayWords, fundedBy = null, poNumber = null }) {
  if (!(Number(rateMinor) > 0)) return null;
  return { n: 1, of: 1, total: Number(rateMinor), termsDays: termsDays({ fundedBy }), settlesTo: fundedBy ? 'organisation' : 'client', poNumber,
    lines: [{ description: `${coaching}, cancelled with less than 24 hours’ notice, ${sessionDayWords}`, amount: Number(rateMinor) }] };
}

/** Expenses as their own invoice, or as lines for the next one: each at cost, named and dated. */
export const expenseLines = (expenses) => (expenses || []).filter((e) => !e.invoice_id).map((e) => ({ description: `${e.description}, ${e.spent_on}`, amount: Number(e.amount_minor) }));
