import { fromColumn, longDay, money, one } from './money.js';

// A credit note as a document for the shared PDF template (Phase 6b run 3; M28 s-refund: "A credit note PDF is made
// either way"; brief item 13, cancelling within 14 days), in the 25 Nov invoice's layout (Polish 1): the lockup bar
// with CREDIT NOTE, the key facts (its number, CLARITY-CN-0007 from 061's own run, the date, the invoice it is
// against), From and Credit to, the amount credited in the light panel, the line items with the total, why, and
// whether it was refunded or kept as a credit. Light only (PDF rule 1).

/**
 * @param {{ number: string, issuedOn: string, payerName: string, invoiceNumber?: string|null, amountMinor: number,
 *   currency?: string, kind: 'refund'|'credit', reason?: string|null, lines?: { description: string, amount: number }[],
 *   business?: object, coachName?: string }} o
 */
export function creditNotePdf({ number, issuedOn, payerName, invoiceNumber = null, amountMinor, currency = 'GBP', kind = 'refund', reason = null, lines = null, business = null, coachName = '' }) {
  const who = one(payerName) || 'Client';
  const rows = (lines && lines.length ? lines : [{ description: invoiceNumber ? `Credit against invoice ${invoiceNumber}` : 'Credit', amount: amountMinor }])
    .map((l) => [{ text: one(l.description) }, money(l.amount, currency)]);
  return {
    kind: 'Credit note',
    docName: `Credit note ${one(number)}`,
    title: 'Credit note',
    who,
    confidential: false,
    business,
    details: [kind === 'refund' ? 'A refund' : 'A credit against your next coaching'],
    facts: [['Credit note', one(number)], ['Date', longDay(issuedOn)], ['Against invoice', one(invoiceNumber)]],
    date: issuedOn,
    subject: `Credit note ${one(number)} for ${who}`,
    glance: [],
    sections: [
      { title: 'From and credit to', look: 'none', blocks: [{ type: 'parties', columns: [fromColumn(business, coachName), { label: 'Credit to', name: who, lines: [] }] }] },
      { title: 'Amount credited', look: 'none', gapMm: 7, blocks: [{ type: 'due', label: 'Amount credited', value: money(amountMinor, currency),
        note: kind === 'refund' ? 'Refunded' : 'Kept as a credit' }] },
      { title: 'What it’s for', look: 'none', gapMm: 7, blocks: [
        { type: 'table', title: 'What it’s for', ruled: true, columns: [{ label: 'Description', width: 1 }, { label: 'Amount', mm: 30, align: 'right' }], rows },
        { type: 'totals', grand: [`Total credited (${currency})`, money(amountMinor, currency)] },
      ] },
      { title: 'Why', look: 'label', gapMm: 7, blocks: reason ? [{ type: 'text', text: one(reason) }] : [] },
      { title: 'What happens next', look: 'label', gapMm: 7, blocks: [{ type: 'text', text: kind === 'refund'
        ? `${money(amountMinor, currency)} is refunded to the card or account it was settled from. It usually arrives within 5 to 10 working days.`
        : `${money(amountMinor, currency)} is kept as a credit against your next coaching.` }] },
    ],
  };
}
