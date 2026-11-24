import { formatClockTime, formatDocDate } from '../../dateFormatter';
import { pdfDetails, signingWords, PROVIDER } from '../../billing/agreementText';
import { agreementSections, glanceRows, termsFor } from '../../coaching/agreementRules';

// A coaching agreement as a document for the shared PDF template (Phase 6b run 1; M13 A5 and A6;
// the wording file's "Signing screens and the PDF"). Light only (PDF rule 1: agreements are
// printed, signed and filed). Page 1 opens with the title "Coaching agreement", the details line
// "[Client name], [date], reference [CLARITY-AG-0001], version [1]", then the Main points rows,
// then the agreement's numbered sections, and last the Signing record: for the coach and for the
// client their name, verified email (where the client can read it), date and time, and the
// document's fingerprint, with the client's signature drawn. The coach's own signature isn't
// readable by the client (061 keeps it to the coach), so their column holds the record without it.
//
// An organisation-funded client's PDF has no money anywhere: it is made from what my_agreements()
// gives them, which has none, and agreementRules.js cuts it again.

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const whenWords = (at) => (at ? `${formatDocDate(at)}, ${formatClockTime(at)}` : '');
// 64 hexadecimal characters, in groups of 8 so the line wraps inside its column.
const printWords = (fp) => (fp ? fp.match(/.{1,8}/g).join(' ') : '');

/**
 * @param {Object} input
 * @param {Object} input.version a tidied version (agreementRules.js tidyVersion)
 * @param {{ kind: 'drawn'|'typed', image?: string, typed_name?: string }|null} [input.signature] the client's
 * @param {string} [input.clientName] when the terms have none
 */
export function agreementPdf({ version: v, signature = null, clientName = '' }) {
  const words = signingWords(oneLine(v?.terms?.coachFirst) || 'your coach');
  const t = termsFor(v);
  const client = oneLine(v.signedName) || oneLine(t.clientName) || oneLine(clientName);
  const coach = oneLine(t.coachName) || 'Your coach';
  const date = v.signedAt || v.sentAt || new Date();
  const fingerprint = printWords(v.fingerprint);

  const main = glanceRows(v);
  const sections = agreementSections(v).map((c) => ({
    title: c.title ? `${c.number}. ${c.title}` : 'The coaching agreement',
    blocks: c.paragraphs.map((p) => ({ type: 'text', text: p })),
  }));

  const record = v.signedAt ? [{
    title: words.pdfRecord,
    blocks: [{
      type: 'signature',
      parties: [
        {
          role: `For ${PROVIDER.name}`,
          signature: false,
          rows: [
            ['Name', coach],
            ['Verified email', oneLine(t.coachEmail)],
            ['Date and time', whenWords(v.coachSignedAt)],
            ['Fingerprint', fingerprint],
          ].filter(([, value]) => value),
        },
        {
          role: 'Client',
          image: signature?.kind === 'drawn' ? signature.image : null,
          imageAlt: `Signature of ${client}`,
          typed: signature?.kind === 'typed' ? oneLine(signature.typed_name) || client : null,
          rows: [
            ['Name', client],
            ['Verified email', oneLine(v.signedEmail)],
            ['Date and time', whenWords(v.signedAt)],
            ['Fingerprint', fingerprint],
          ].filter(([, value]) => value),
        },
      ],
    }],
  }] : [];

  return {
    docName: words.pdfTitle,
    title: words.pdfTitle,
    who: client || null,
    confidential: true,
    details: [pdfDetails({ clientName: client, dayWords: formatDocDate(date), reference: v.reference, version: v.version })],
    date,
    subject: `${words.pdfTitle}, version ${v.version}`,
    glance: [],
    sections: [
      {
        title: 'Main points',
        blocks: main.length ? [{
          type: 'table',
          columns: [{ label: 'Point', width: 2 }, { label: 'What it says', width: 4 }],
          rows: main.map((r) => [r.label, r.value]),
        }] : [],
      },
      ...sections,
      ...record,
    ],
  };
}
