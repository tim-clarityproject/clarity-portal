import { addDays } from '../time/index.js';

// Ending an engagement early (Phase 6b run 2, step 6). Nothing here changes anything: it works out what each of Tim's
// three choices would do, and the refund, for him to choose. Checked by tests/performance/finance-ending.test.mjs.
//
// - Instalments left: the signed instalments with no invoice yet, and drafted or sent invoices not yet settled.
// - Cancel them: every instalment not invoiced is cancelled and every draft is voided (a sent invoice stays as it is).
// - Keep them (notice period): instalments and drafts due within the notice period after the end day stay; the rest
//   are cancelled.
// - Invoice what's owed: one invoice for the sessions used (held, plus any counted as used) at the per-session price,
//   less what's settled and what's already invoiced; everything else is cancelled.
// - The refund: coaching sessions invested in and not used, less any that counted as used (late cancellations):
//   what's settled less the used sessions at the per-session price (the price after discounts over the sessions), never
//   below nothing and never more than was settled.

export const CHOICES = Object.freeze(['cancel', 'keep', 'invoice']);

/**
 * @param {{ planned?: { n: number, day: string, amount_minor: number }[], invoices?: { id, status, total_minor, paid_minor, due_on }[],
 *   endOn: string, noticeDays?: number, sessionsTotal?: number|null, sessionsHeld?: number, sessionsCountedAsUsed?: number,
 *   priceMinor?: number, paidMinor?: number }} a priceMinor is the agreement's total after discounts
 * @returns {{ left: { kind: 'instalment'|'invoice', id?, n?, day: string, amount: number }[], leftTotal: number,
 *   choices: Record<'cancel'|'keep'|'invoice', { keep: object[], cancel: object[], newInvoice: number }>,
 *   refund: { minor: number, sessionsUnused: number, perSession: number|null } }}
 */
export function endEarly({ planned = [], invoices = [], endOn, noticeDays = 30, sessionsTotal = null, sessionsHeld = 0,
  sessionsCountedAsUsed = 0, priceMinor = 0, paidMinor = 0 }) {
  const left = [
    ...(invoices || []).filter((i) => (i.status === 'draft' || i.status === 'sent') && Number(i.total_minor) > Number(i.paid_minor || 0))
      .map((i) => ({ kind: 'invoice', id: i.id, status: i.status, day: i.due_on, amount: Number(i.total_minor) - Number(i.paid_minor || 0) })),
    ...(planned || []).map((p) => ({ kind: 'instalment', n: p.n, day: p.day ?? p.draft_on, amount: Number(p.amount_minor) })),
  ];
  const cancellable = (x) => x.kind === 'instalment' || x.status === 'draft';
  const sent = left.filter((x) => !cancellable(x));
  const noticeEnds = addDays(endOn, Math.max(0, Number(noticeDays) || 0));

  const used = Math.max(0, Number(sessionsHeld) || 0) + Math.max(0, Number(sessionsCountedAsUsed) || 0);
  const perSession = Number(sessionsTotal) > 0 && Number(priceMinor) > 0 ? Number(priceMinor) / Number(sessionsTotal) : null;
  const paid = Math.max(0, Number(paidMinor) || 0);
  const invoicedUnpaid = sent.reduce((a, x) => a + x.amount, 0);
  const owed = perSession == null ? 0 : Math.max(0, Math.round(used * perSession) - paid - invoicedUnpaid);
  const refundMinor = perSession == null ? 0 : Math.min(paid, Math.max(0, paid - Math.round(used * perSession)));

  return {
    left,
    leftTotal: left.reduce((a, x) => a + x.amount, 0),
    choices: {
      cancel: { keep: sent, cancel: left.filter(cancellable), newInvoice: 0 },
      keep: { keep: left.filter((x) => !cancellable(x) || (x.day && x.day <= noticeEnds)), cancel: left.filter((x) => cancellable(x) && !(x.day && x.day <= noticeEnds)), newInvoice: 0 },
      invoice: { keep: sent, cancel: left.filter(cancellable), newInvoice: owed },
    },
    refund: { minor: refundMinor, sessionsUnused: perSession == null ? 0 : Math.max(0, Math.floor(paid / perSession + 1e-9) - used), perSession },
  };
}
