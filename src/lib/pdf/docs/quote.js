import { formatDocDate } from '../../dateFormatter.js';
import { dayKeyWords } from '../../time/index.js';
import { mainPoints, resolveChoice } from '../../agreements/clauses.js';
import { quoteNumber, quoteRows } from '../../agreements/quote.js';
import { selfFunded } from '../../agreements/terms.js';

// A quote as a document for the shared PDF template (Phase 6b run 3, brief items 19 to 21; M28 s-q-client's Download
// PDF). Light only (PDF rule 1: quotes are printed and filed). Page 1: the title "Your coaching quote", the details line
// ("Prepared for Sam Reid by Dr. Tim Dutton, Wed 25 Nov 2026, Quote Q-0042"), the coach's note, Main points, Your
// investment (the package, each discount as its own line, each extra offered as an option, In all), how long it is
// valid, then every clause with its reason under each paragraph, and the coach's signature, which goes on when the quote
// is sent (brief item 19). Built from the same terms and stored clauses as the agreement; extras offered read as options
// until the client chooses them on the quote page.

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {object} o
 * @param {number} o.number          the Q- number
 * @param {object} o.terms           the version's terms
 * @param {object[]} o.clauses       the version's stored clauses ({ key, number, title, paragraphs: [{ text, why }] })
 * @param {string} o.sentDay         day key
 * @param {string} o.validUntil      day key
 * @param {string} [o.note]          the coach's personal note
 * @param {{ kind: 'drawn'|'typed', image?: string, typed_name?: string }|null} [o.coachSignature]
 */
export function quotePdf({ number, terms: t, clauses = [], sentDay, validUntil, note = '', coachSignature = null }) {
  const ref = quoteNumber(number);
  const client = one(t.clientName) || 'You';
  const coach = one(t.coachName) || 'Your coach';
  const choice = t.choice ?? 'upfront';
  const shown = resolveChoice(clauses, choice);
  const q = quoteRows(t, [], choice);
  const sees = selfFunded(t);
  const investment = sees ? [
    { type: 'table', title: 'Your investment', columns: [{ label: 'What', width: 6 }, { label: 'Amount', width: 2, align: 'right' }],
      rows: [...q.lines.map((l) => [l.label, l.amount]), ...q.extras.map((e) => [`Option: ${e.label}`, e.amount]), ...(q.upfront ? [[q.upfront.label, q.upfront.amount]] : []), ['In all', q.inAll]] },
    { type: 'text', text: q.hint },
    q.extras.length ? { type: 'text', tone: 'detail', text: 'Options are added only when you choose them on your quote.' } : null,
  ].filter(Boolean) : [];
  const sig = coachSignature?.kind === 'drawn' && typeof coachSignature.image === 'string'
    ? { image: coachSignature.image, imageAlt: `Signature of ${coach}` }
    : coachSignature?.kind === 'typed' ? { typed: one(coachSignature.typed_name) || coach } : { signature: false };
  return {
    docName: `Quote ${ref}`,
    title: 'Your coaching quote',
    who: client,
    confidential: true,
    details: [`Prepared for ${client} by ${coach}, ${formatDocDate(sentDay)}, Quote ${ref}`],
    date: sentDay,
    subject: `Coaching quote ${ref} for ${client}`,
    glance: [],
    sections: [
      { title: 'A note from your coach', blocks: String(note || '').split(/\n\s*\n/).map(one).filter(Boolean).map((text) => ({ type: 'text', text })) },
      { title: 'Main points', blocks: [{ type: 'table', columns: [{ label: 'Point', width: 2 }, { label: 'What it says', width: 4 }],
        rows: mainPoints(t, { choice, seesMoney: sees, clauses: shown }).map((r) => [r.label, r.value]) }] },
      { title: 'Your investment', blocks: investment },
      { title: 'How long it stands', blocks: [{ type: 'text', text: `This quote is valid until ${dayKeyWords(validUntil, { year: true })}.` }] },
      ...shown.map((c) => ({
        title: `${c.number}. ${c.title}`,
        blocks: (c.paragraphs || []).flatMap((p) => (typeof p === 'string' ? [{ type: 'text', text: p }]
          : [{ type: 'text', text: p.text }, p.why ? { type: 'text', tone: 'detail', text: p.why } : null])).filter(Boolean),
      })),
      { title: 'Signed by your coach', blocks: [{ type: 'signature', parties: [{
        role: 'For The Clarity Project LTD', ...sig,
        rows: [['Name', coach], ['Date', formatDocDate(sentDay)], ['Quote', ref]],
      }] }] },
    ],
  };
}
