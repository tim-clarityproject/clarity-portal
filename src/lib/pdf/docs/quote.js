import { mainPoints } from '../../agreements/clauses.js';
import { quoteNumber, quoteRows } from '../../agreements/quote.js';
import { discountLines, extras, subtotal } from '../../agreements/pricing.js';
import { selfFunded } from '../../agreements/terms.js';
import { finalTotal, saving, upfrontActive } from '../../agreements/upfront.js';
import { fromColumn, longDay, money, one, vatRow } from './money.js';

// A quotation as a document for the shared PDF template, to the approved 25 Nov PDF (Polish 1; pdfs-25nov:
// "Quotation Q-0042, Alex Morgan"). Light only (PDF rule 1: quotes are printed and filed).
//
// One page: the lockup bar with QUOTATION; the title with the coaching it's for; the key facts on the right (quote
// number, date, valid until, start date); From and Prepared for; the coach's note where there is one; the line items
// (the coaching, then each discount as its own line); Subtotal, Discount, VAT ("Not VAT registered" until registered)
// and the total under a rule ("Total, paid in advance" when up front is chosen, with the as-planned figure under it);
// the optional additions with their prices; and how to accept and how long it stands. Its figures are run 3's engine's
// (src/lib/agreements: quoteRows, pricing, upfront), never worked out here. The full terms arrive with the agreement
// the quote becomes, so the clauses are no longer printed on the quotation (the approved PDF has none).

/**
 * @param {object} o
 * @param {number} o.number          the Q- number
 * @param {object} o.terms           the version's terms
 * @param {object[]} [o.clauses]     kept for the callers; not printed (above)
 * @param {string} o.sentDay         day key
 * @param {string} o.validUntil      day key
 * @param {string} [o.note]          the coach's personal note
 * @param {object} [o.coachSignature] kept for the callers; a quotation isn't signed
 * @param {object} [o.business]      the business's details (finance_settings, 068)
 */
export function quotePdf({ number, terms: t, sentDay, validUntil, note = '', business = null }) {
  const ref = quoteNumber(number);
  const c = t.currency || 'GBP';
  const client = one(t.clientName) || 'You';
  const coach = one(t.coachName);
  const choice = t.choice ?? 'upfront';
  const sees = selfFunded(t);
  const q = quoteRows(t, [], choice);
  const sub = subtotal(t);
  const discounts = discountLines(t);
  const up = upfrontActive(t, choice);
  const offered = extras(t, []);
  const planTotal = finalTotal(t, 'plan', []);
  const total = finalTotal(t, choice, []);
  const discountMinor = discounts.reduce((a, d) => a + d.amount, 0) - (up ? saving(finalTotal(t, 'plan', [])) : 0);
  // The coaching's line under its name: the engine's own Coaching sessions words ("12 of 60 minutes, on Zoom, every 2
  // weeks"), as the agreement's Key terms read.
  const sessionsLine = one((mainPoints(t, { choice, seesMoney: sees }).find((r) => r.label === 'Coaching sessions') || {}).value);
  const rows = sees ? [
    [{ text: one(t.coaching) || 'Coaching', detail: sessionsLine }, '1', money(sub, c), money(sub, c)],
    ...discounts.map((d) => [{ text: d.label }, '', '', money(d.amount, c)]),
    ...(up ? [[{ text: q.upfront.label.replace(/^./, (x) => x.toUpperCase()), detail: 'When it’s settled in full at signing' }, '', '', money(-saving(finalTotal(t, 'plan', [])), c)]] : []),
  ] : [];
  return {
    kind: 'Quotation',
    docName: `Quotation ${ref}`,
    title: 'Quotation',
    who: client,
    confidential: false,
    business,
    details: [one(t.coaching) || 'Coaching'],
    facts: [
      ['Quote number', ref],
      ['Date', longDay(sentDay)],
      ['Valid until', longDay(validUntil)],
      ['Start date', longDay(t.startsOn)],
    ],
    date: sentDay,
    subject: `Quotation ${ref} for ${client}`,
    glance: [],
    sections: [
      { title: 'From and prepared for', look: 'none', blocks: [{ type: 'parties', columns: [
        fromColumn(business, coach),
        { label: 'Prepared for', name: client, lines: [one(t.clientEmail)] },
      ] }] },
      { title: 'A note from your coach', look: 'label', gapMm: 7,
        blocks: String(note || '').split(/\n\s*\n/).map(one).filter(Boolean).map((text, i) => ({ type: 'text', text, ...(i ? { gapMm: 2 } : {}) })) },
      { title: 'Line items', look: 'none', gapMm: 7, blocks: rows.length ? [
        { type: 'table', title: 'Line items', ruled: true, columns: [{ label: 'Description', width: 1 }, { label: 'Qty', mm: 14, align: 'right' },
          { label: 'Unit price', mm: 26, align: 'right' }, { label: 'Amount', mm: 26, align: 'right' }], rows },
        { type: 'totals', rows: [['Subtotal', money(sub, c)], discountMinor ? ['Discount', money(discountMinor, c)] : null, vatRow(business)].filter(Boolean),
          grand: [up ? `Total, paid in advance (${c})` : `Total (${c})`, money(total, c)],
          after: up && planTotal !== total ? [['Or as planned', money(planTotal, c)]] : [] },
      ] : [] },
      { title: 'Optional additions', look: 'label', gapMm: 7, blocks: sees && offered.length ? [{
        type: 'table', title: 'Optional additions', ruled: true, columns: [{ label: '', width: 1 }, { label: '', mm: 30, align: 'right' }],
        rows: offered.map((e) => [{ text: one(e.title), detail: one(e.hint) }, money(e.priceMinor || 0, c)]),
      }] : [] },
      { title: 'How to accept', look: 'none', gapMm: 8, blocks: [
        { type: 'text', tone: 'note', text: 'To accept, open the quotation from your email and choose Accept and sign. It becomes your agreement, ready to sign in the same sitting.' },
        validUntil ? { type: 'text', tone: 'note', gapMm: 1.5, text: `This quotation is valid until ${longDay(validUntil)}.` } : null,
      ].filter(Boolean) },
    ],
  };
}
