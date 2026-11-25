import { formatDocDate, parseDbTimestamp } from '../../dateFormatter.js';
import { pdfDetails, signingWords, PROVIDER } from '../../billing/agreementText.js';
import { agreementSections, glanceRows, termsFor } from '../../coaching/agreementRules.js';
import { dayIn, wallClock } from '../../time/instants.js';
import { zoneLabel } from '../../time/zones.js';

// A coaching agreement as a document for the shared PDF template (Phase 6b run 1; M13 A5 and A6;
// the wording file's "Signing screens and the PDF"). Light only (PDF rule 1: agreements are
// printed, signed and filed). Page 1 opens with the title "Coaching agreement", the details line
// "[Client name], [date], reference [CLARITY-AG-0001], version [1]", then the Main points rows,
// then the agreement's numbered sections, and last the Signing record: for the coach and for the
// client their name, verified email (where the client can read it), date and time, and the
// document's fingerprint, each with their signature drawn (a PNG drawing) or written (a typed name).
//
// Made once, on the server, at the moment of signing (follow-up 5: api/_agreementPdf.js), and kept
// as it was made (064, agreement_signed_pdfs): the client's download and the coach's "Open the
// agreement" both give that stored file. The server reads both signatures with its own key; the
// coach's signature reaches the client only drawn on this PDF. Its dates and times are read in one
// named zone (the client's saved zone, else the coach's, else the UK's) through the time library,
// with the place beside each time ("18:40 UK time"), so the file reads the same wherever it's opened.
//
// An organisation-funded client's PDF has no money anywhere: it is made from the version as
// my_agreements() gives it to them (064's agreement_pdf_source cuts it the same way), and
// agreementRules.js cuts it again.

const ZONE = 'Europe/London';
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 2 Dec 2026, 18:40 UK time": 24-hour, as every PDF (PDF rule 19), in the zone named. */
function whenWords(at, zone) {
  if (!at) return '';
  const w = wallClock(parseDbTimestamp(at), zone);
  return `${DAYS[w.weekday - 1]} ${w.day} ${MONTHS[w.month - 1]} ${w.year}, ${pad(w.hour)}:${pad(w.minute)} ${zoneLabel(zone)}`;
}
// 64 hexadecimal characters, in groups of 8 so the line wraps inside its column.
const printWords = (fp) => (fp ? fp.match(/.{1,8}/g).join(' ') : '');
/** A signature as the signing record draws it: a PNG drawing, or a typed name written on the line. */
const drawn = (sig, name) => ({
  image: sig?.kind === 'drawn' && typeof sig.image === 'string' ? sig.image : null,
  typed: sig?.kind === 'typed' ? oneLine(sig.typed_name) || name : null,
});

/**
 * @param {Object} input
 * @param {Object} input.version a tidied version (agreementRules.js tidyVersion)
 * @param {{ kind: 'drawn'|'typed', image?: string, typed_name?: string }|null} [input.signature] the client's
 * @param {{ kind: 'drawn'|'typed', image?: string, typed_name?: string }|null} [input.coachSignature] the coach's
 *   (read by the server only); without it the coach's column holds the record alone
 * @param {string} [input.clientName] when the terms have none
 * @param {string} [input.timeZone] the zone its dates and times are read in (the UK's unless given)
 */
export function agreementPdf({ version: v, signature = null, coachSignature = null, clientName = '', timeZone = ZONE }) {
  const words = signingWords(oneLine(v?.terms?.coachFirst) || 'your coach');
  const t = termsFor(v);
  const client = oneLine(v.signedName) || oneLine(t.clientName) || oneLine(clientName);
  const coach = oneLine(t.coachName) || 'Your coach';
  const zone = timeZone || ZONE;
  // The day as a day key in that zone, so the details line and the file name never move a day with the server's clock.
  const date = dayIn(zone, parseDbTimestamp(v.signedAt || v.sentAt || new Date()));
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
          ...(coachSignature ? { ...drawn(coachSignature, coach), imageAlt: `Signature of ${coach}` } : { signature: false }),
          rows: [
            ['Name', coach],
            ['Verified email', oneLine(t.coachEmail)],
            ['Date and time', whenWords(v.coachSignedAt, zone)],
            ['Fingerprint', fingerprint],
          ].filter(([, value]) => value),
        },
        {
          role: 'Client',
          ...drawn(signature, client),
          imageAlt: `Signature of ${client}`,
          rows: [
            ['Name', client],
            ['Verified email', oneLine(v.signedEmail)],
            ['Date and time', whenWords(v.signedAt, zone)],
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
