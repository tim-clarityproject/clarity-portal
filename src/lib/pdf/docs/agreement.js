import { parseDbTimestamp } from '../../dateFormatter.js';
import { businessOf } from '../theme.js';
import { longDay, shortRange } from './money.js';
import { signingWords, isNewClause } from '../../billing/agreementText.js';
import { mainPoints as newMainPoints, resolveChoice } from '../../agreements/clauses.js';
import { canChoose } from '../../agreements/upfront.js';
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
// Phase 6b run 3 (065): a version made by the builder stores its clauses as [{ key, number, title, paragraphs: [{ text,
// why }], money, choices? }]. Each paragraph's reason goes under it in a quieter grey line (brief item 15; no side
// line), the investment clause is the one the client chose (settle_choice), Main points are the new kinds' own, and the
// signing record says whether "Start my coaching straight away" was ticked (with its time) and how it is settled. A
// sponsor's agreement (signed by link) carries the sponsor's signature, role and purchase order.
const reasonBlocks = (c) => (c.paragraphs || []).flatMap((p) => (typeof p === 'string'
  ? [{ type: 'text', tone: 'compact', text: p }]
  : [{ type: 'text', tone: 'compact', text: p?.text || '' }, p?.why ? { type: 'text', tone: 'detail', text: p.why, gapMm: 1 } : null])).filter(Boolean)
  .map((b, i) => (i === 0 ? b : { ...b, gapMm: b.gapMm ?? 1.5 }));

/**
 * @param {Object} [input.raw] the version as stored or as my_agreements() gives it (065's start_now, start_now_at,
 *   settle_choice, sponsor_*), for the new parts of the signing record
 * @param {{ kind: 'drawn'|'typed', image?: string, typed_name?: string }|null} [input.sponsorSignature]
 */
export function agreementPdf({ version: v, signature = null, coachSignature = null, clientName = '', timeZone = ZONE, raw = null, sponsorSignature = null, business = null }) {
  const biz = businessOf(business);
  const words = signingWords(oneLine(v?.terms?.coachFirst) || 'your coach');
  const t = termsFor(v);
  const client = oneLine(v.signedName) || oneLine(t.clientName) || oneLine(clientName);
  const coach = oneLine(t.coachName) || 'Your coach';
  const zone = timeZone || ZONE;
  // The day as a day key in that zone, so the details line and the file name never move a day with the server's clock.
  const date = dayIn(zone, parseDbTimestamp(v.signedAt || v.sentAt || new Date()));
  const fingerprint = printWords(v.fingerprint);

  const newStyle = (v.clauses || []).some(isNewClause);
  const sees = !v.fundedBy;
  const choice = raw?.settle_choice || t.choice || null;
  let main;
  let sections;
  if (newStyle) {
    let n = 0;
    const shown = resolveChoice(v.clauses, choice).filter((c) => c && (sees || !(c.money === true || c.money === 'true')))
      .map((c) => ({ ...c, number: (n += 1) }));
    main = newMainPoints({ ...t, coachName: t.coachName || coach }, { choice: choice || 'upfront', seesMoney: sees, clauses: shown });
    sections = shown.map((c) => ({ title: `${c.number}. ${c.title}`, blocks: reasonBlocks(c) }));
  } else {
    main = glanceRows(v);
    sections = agreementSections(v).map((c) => ({
      title: c.title ? `${c.number}. ${c.title}` : 'The coaching agreement',
      blocks: c.paragraphs.map((p, i) => ({ type: 'text', tone: 'compact', text: p, ...(i ? { gapMm: 1.5 } : {}) })),
    }));
  }
  // The signing record's new rows (065): the start-now tick for a self-funded client, and the way of settling chosen.
  const startRow = raw && sees && raw.start_now != null
    ? ['Start straight away', raw.start_now ? `Ticked, ${whenWords(raw.start_now_at, zone)}` : 'Not ticked'] : null;
  const settleRow = raw && sees && raw.settle_choice && canChoose(t)
    ? ['How it’s settled', raw.settle_choice === 'upfront' ? 'Up front, with 5% off' : 'As planned'] : null;
  const sponsorParty = raw?.sponsor_signed_at ? {
    role: 'Sponsor',
    ...drawn(sponsorSignature, oneLine(raw.sponsor_name)),
    imageAlt: `Signature of ${oneLine(raw.sponsor_name)}`,
    rows: [
      ['Name', oneLine(raw.sponsor_name)],
      ['Role', oneLine(raw.sponsor_role)],
      ['Email', oneLine(raw.sponsor_email)],
      ['Purchase order', oneLine(raw.sponsor_po)],
      ['Date and time', whenWords(raw.sponsor_signed_at, zone)],
      ['Fingerprint', fingerprint],
    ].filter(([, value]) => value),
  } : null;

  // Signed (the 25 Nov PDFs): the client's signature on the left and the coach's on the right, each on its line, with
  // its name, who it's for and when under it; the fingerprint once, under both. A sponsor signs in the client's place.
  const clientParty = sponsorParty || {
    role: 'Client',
    ...drawn(signature, client),
    imageAlt: `Signature of ${client}`,
    signature: v.signedAt ? undefined : false,
    rows: [
      ['Name', client],
      ['Email', oneLine(v.signedEmail)],
      ['Date', whenWords(v.signedAt, zone)],
      startRow,
      settleRow,
    ].filter((r) => r && r[1]),
  };
  const coachParty = {
    role: `For ${biz.name}`,
    ...(coachSignature ? { ...drawn(coachSignature, coach), imageAlt: `Signature of ${coach}` } : { signature: false }),
    rows: [
      ['Name', coach],
      ['For', biz.name],
      ['Email', oneLine(t.coachEmail)],
      ['Date', whenWords(v.coachSignedAt, zone)],
    ].filter(([, value]) => value),
  };
  const record = (v.signedAt || sponsorParty) ? [{
    title: 'Signed',
    look: 'label',
    gapMm: 10,
    blocks: [
      { type: 'signature', parties: [clientParty, coachParty] },
      fingerprint ? { type: 'text', tone: 'note', gapMm: 5, text: `Fingerprint of the signed version: ${fingerprint}` } : null,
    ].filter(Boolean),
  }] : [];

  const facts = [
    ['Reference', oneLine(v.reference)],
    ['Version', v.version != null ? String(v.version) : ''],
    ['Date', longDay(date)],
    ['Term', t.startsOn && t.endsOn ? shortRange(t.startsOn, t.endsOn) : (t.ongoing ? 'Ongoing' : '')],
  ];
  const partyName = sponsorParty ? oneLine(raw?.sponsor_org) || client : client;
  return {
    kind: 'Agreement',
    docName: words.pdfTitle,
    running: [words.pdfTitle, [oneLine(v.reference), v.version != null ? `version ${v.version}` : ''].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    title: words.pdfTitle,
    who: client || null,
    confidential: true,
    business,
    details: [`Between ${biz.name} and ${partyName || 'the client'}`],
    facts,
    date,
    subject: `${words.pdfTitle}, version ${v.version}`,
    glance: [],
    sections: [
      { title: 'The coach and the client', look: 'none', blocks: [{ type: 'parties', columns: [
        { label: 'The coach', name: biz.name, lines: [coach ? `represented by ${coach}` : ''] },
        { label: sponsorParty ? 'The sponsor' : 'The client', name: partyName, lines: [sponsorParty ? '' : oneLine(t.clientEmail || v.signedEmail)] },
      ] }] },
      {
        title: 'Key terms',
        look: 'label',
        gapMm: 7,
        blocks: main.length ? [{
          type: 'table',
          ruled: true,
          columns: [{ label: '', mm: 48, grey: true }, { label: '', width: 1 }],
          rows: main.filter((r) => !/^(Coaching provider|Your coach)$/.test(r.label)).map((r) => [r.label, r.value]),
        }] : [],
      },
      ...sections.map((c, i) => ({ ...c, look: 'clause', above: i === 0 ? 'Terms' : null, gapMm: i === 0 ? 9 : 4.5 })),
      ...record,
    ],
  };
}
