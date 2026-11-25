import { formatDocDate } from '../../dateFormatter.js';
import { moneyText } from '../../agreements/currency.js';

// A credit note as a document for the shared PDF template (Phase 6b run 3; M28 s-refund: "A credit note PDF is made
// either way"; brief item 13, cancelling within 14 days). Light only (PDF rule 1). Its number (CLARITY-CN-0007, 061's
// own run), the invoice it is against, the amount, why, and whether it was refunded or kept as a credit.

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {{ number: string, issuedOn: string, payerName: string, invoiceNumber?: string|null, amountMinor: number,
 *   currency?: string, kind: 'refund'|'credit', reason?: string|null, lines?: { description: string, amount: number }[] }} o
 */
export function creditNotePdf({ number, issuedOn, payerName, invoiceNumber = null, amountMinor, currency = 'GBP', kind = 'refund', reason = null, lines = null }) {
  const who = one(payerName) || 'Client';
  const rows = (lines && lines.length ? lines : [{ description: invoiceNumber ? `Credit against invoice ${invoiceNumber}` : 'Credit', amount: amountMinor }])
    .map((l) => [one(l.description), moneyText(l.amount, currency)]);
  rows.push(['Total credited', moneyText(amountMinor, currency)]);
  return {
    docName: `Credit note ${one(number)}`,
    title: 'Credit note',
    who,
    confidential: false,
    details: [[who, formatDocDate(issuedOn), one(number)].filter(Boolean).join(', ')],
    date: issuedOn,
    subject: `Credit note ${one(number)} for ${who}`,
    glance: [],
    sections: [
      { title: 'What it’s for', blocks: [
        { type: 'table', title: 'What it’s for', columns: [{ label: 'Description', width: 6 }, { label: 'Amount', width: 2, align: 'right' }], rows },
        reason ? { type: 'field', label: 'Why', text: one(reason) } : null,
      ].filter(Boolean) },
      { title: 'What happens next', blocks: [{ type: 'text', text: kind === 'refund'
        ? `${moneyText(amountMinor, currency)} is refunded to the card or account it was settled from. It usually arrives within 5 to 10 working days.`
        : `${moneyText(amountMinor, currency)} is kept as a credit against your next coaching.` }] },
    ],
  };
}
