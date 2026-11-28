// A signed agreement's PDF, made on the server (follow-up 5, item 4), shared by
// api/_routes/agreement-sign.js and api/_routes/agreement-pdf.js.
//
// Who may have it is always decided AS THE CALLER, with their own sign-in
// (sign_agreement, agreement_signed_pdf: 061 and 064), never here. The
// server's key is used for two things only, after that check: reading what
// the PDF is made from (agreement_pdf_source: the version as its client sees
// it, and both signatures, the coach's included, which no client can read)
// and keeping the PDF (agreement_signed_pdf_keep: the first one made is kept,
// exactly as made, and a second is never stored).
//
// The file name starts with an underscore so Vercel never publishes it as a function.
import { createClient } from '@supabase/supabase-js';

// The PDF code (pdfkit, the template, the fonts) loads only when a PDF is made, so the coach
// portal's other addresses on this router start as quickly as before.
const pdfCode = () => Promise.all([
  import('../src/lib/coaching/agreementRules.js'), import('../src/lib/pdf/docs/agreement.js'),
  import('../src/lib/pdf/paper.js'), import('./_pdfAssets.js'),
]).then(([rules, doc, paper, assets]) => ({ tidyVersion: rules.tidyVersion, agreementPdf: doc.agreementPdf, paperFor: paper.paperFor, makeServerPdf: assets.makeServerPdf }));

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };

/** The Supabase URL and keys this deployment has. */
export const supabaseKeys = (env) => ({
  url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
  anon: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
  service: env.SUPABASE_SERVICE_ROLE_KEY || '',
});

/** The caller's own sign-in from the Authorization header, or ''. */
export const callerToken = (req) => String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();

/** A client that asks the database as the caller: its rules decide. */
export function asCaller(env, token) {
  const { url, anon } = supabaseKeys(env);
  return createClient(url, anon, { ...CLIENT_OPTIONS, global: { headers: { Authorization: `Bearer ${token}` } } });
}

/** The server's own client, or null where this deployment has no server key. */
export function asServer(env) {
  const { url, service } = supabaseKeys(env);
  return url && service ? createClient(url, service, CLIENT_OPTIONS) : null;
}

// The business's own details (068, finance_settings: the company's name and number, website, email and bank), read
// with the server's key for the PDFs the server makes (the 25 Nov PDFs' footer, From and Payment details). Kept for a
// minute per instance. Null where this deployment has no server key, or before 068 has run: a PDF then prints the
// company's name alone, never a number or bank details written into the code.
let businessKept = null;
const BUSINESS_COLUMNS = 'company_name, company_number, website, invoice_email, vat_registered, vat_number, bank_name, bank_account_name, bank_sort_code, bank_account_number';
export async function businessDetails(env = process.env, now = Date.now()) {
  if (businessKept && now - businessKept.at < 60000) return businessKept.row;
  const server = asServer(env);
  if (!server) return null;
  let row = null;
  try {
    const { data: owner } = await server.from('coaches').select('id').eq('role', 'owner').order('created_at').limit(1).maybeSingle();
    if (owner?.id) {
      const { data, error } = await server.from('finance_settings').select(BUSINESS_COLUMNS).eq('coach_id', owner.id).maybeSingle();
      row = error ? null : data || null;
    }
  } catch { row = null; }
  businessKept = { at: now, row };
  return row;
}

/** The answer's status for a database refusal: the database's own words go back, never anything technical. */
export function refusal(error) {
  const code = String(error?.code || '');
  const message = typeof error?.message === 'string' && error.message.length < 200 ? error.message : '';
  if (code === '42501') return { status: 403, body: { ok: false, code, message } };
  if (code === 'CC409') return { status: 409, body: { ok: false, code, message } };
  if (code === '22023') return { status: 400, body: { ok: false, code, message } };
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(String(error?.message || ''))) return { status: 401, body: { ok: false, code: '42501', message: 'Sign in again to carry on.' } };
  return { status: 502, body: { ok: false, message: '' } };
}

/** The largest drawn signature drawn as a picture: anything bigger is written as the signer's name instead. */
export const SIGNATURE_MAX = Object.freeze({ width: 2000, height: 1000 });

/**
 * A PNG's width and height from its header (IHDR), without decoding it, or null when it isn't a PNG.
 * @param {string} image a data URL or plain base64
 */
export function pngSize(image) {
  try {
    const b64 = String(image || '').replace(/^data:image\/png;base64,/, '').slice(0, 64);
    const head = Buffer.from(b64, 'base64');
    if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/**
 * A signature the server will draw: a drawing only when it is a PNG no bigger than SIGNATURE_MAX (a huge one would
 * take the server's memory; break-it tester, follow-up 5), otherwise the signer's name written on the line.
 */
export function safeSignature(sig, name) {
  if (!sig || sig.kind !== 'drawn') return sig || null;
  const size = pngSize(sig.image);
  if (size && size.width > 0 && size.height > 0 && size.width <= SIGNATURE_MAX.width && size.height <= SIGNATURE_MAX.height) return sig;
  return { kind: 'typed', typed_name: String(name || '').trim() || 'Signed' };
}

/**
 * The document for a signed version, from the server's source (064, agreement_pdf_source).
 * Exported for the tests: the same function makes the file the client and the coach download.
 */
export async function signedDocument(source) {
  const { tidyVersion, agreementPdf, paperFor } = await pdfCode();
  const version = tidyVersion(source?.version);
  if (!version || !version.signedAt) return null;
  const zone = typeof source.time_zone === 'string' && source.time_zone ? source.time_zone : 'Europe/London';
  return {
    spec: agreementPdf({
      version,
      signature: safeSignature(source.client_signature, version.signedName || source.client_name),
      coachSignature: safeSignature(source.coach_signature, version.coachName || ''),
      clientName: typeof source.client_name === 'string' ? source.client_name : '',
      timeZone: zone,
      business: source.business ?? await businessDetails(),
    }),
    // PDF rule 3, from what the server knows of the client: their saved zone (paperFor's own order).
    paper: paperFor({ country: null, region: null, timeZone: zone }),
  };
}

/**
 * Makes a signed version's PDF and keeps it, once: called only after the caller was checked as its
 * client (signing) or as the client or coach (download). Resolves the kept file
 * ({ pdf: base64, file_name, sha256 }), the one kept first when another was made at the same time,
 * or null when the version isn't signed.
 */
export async function makeAndKeep(server, versionId) {
  const src = await server.rpc('agreement_pdf_source', { p_version: versionId });
  if (src.error) throw new Error('source');
  if (!src.data?.ok) return null;
  const made = await signedDocument(src.data);
  if (!made) return null;
  const { makeServerPdf } = await pdfCode();
  const { bytes, fileName } = await makeServerPdf(made.spec, { paper: made.paper });
  const kept = await server.rpc('agreement_signed_pdf_keep', {
    p_version: versionId,
    p_pdf: Buffer.from(bytes).toString('base64'),
    p_file_name: fileName,
  });
  if (kept.error || !kept.data?.ok) throw new Error('keep');
  return kept.data;
}

// ---------------------------------------------------------------- Phase 6b run 3 (065): quotes, sponsors, invoices
// The same template, made on the server: a quote's PDF (its private link's Download PDF), a sponsor's agreement (before
// and after they sign by link), an organisation's invoice with its timesheet and the evidence appended (pdf-lib, one
// file: brief item 27), and a credit note. All light (PDF rule 1). Appended evidence pages are the organisation's own
// screenshots and PDFs, untagged (plan section 7's decision); the template's footer counts them in "Page 2 of 4".
const docCode = () => Promise.all([
  import('../src/lib/pdf/docs/quote.js'), import('../src/lib/pdf/docs/invoice.js'), import('../src/lib/pdf/docs/creditNote.js'),
  import('../src/lib/pdf/docs/agreement.js'), import('../src/lib/coaching/agreementRules.js'), import('./_pdfAssets.js'), import('../src/lib/pdf/paper.js'),
]).then(([q, i, c, a, rules, assets, paper]) => ({
  quotePdf: q.quotePdf, invoicePdf: i.invoicePdf, creditNotePdf: c.creditNotePdf, agreementPdf: a.agreementPdf, tidyVersion: rules.tidyVersion,
  makeServerPdf: assets.makeServerPdf, paperFor: paper.paperFor, PAPER: paper.PAPER,
}));

/** The paper for a reader in this zone (PDF rule 3, paperFor's order: no country or region known on the server). */
export async function paperForZone(zone) {
  const { paperFor } = await docCode();
  return paperFor({ country: null, region: null, timeZone: typeof zone === 'string' ? zone : '' });
}

/** A light PDF from a document description: { bytes, fileName }. */
export async function pdfFrom(spec, zone = 'Europe/London') {
  const { makeServerPdf } = await docCode();
  // Every PDF the server makes carries the business's own details in its footer (068); a builder given them already
  // (an invoice's From and Payment details) keeps its own.
  const business = spec.business ?? await businessDetails();
  return makeServerPdf(business ? { ...spec, business } : spec, { paper: await paperForZone(zone) });
}

/** The quote's PDF from what quote_open gave its link (state 'open'), with the coach's signature (read by the server). */
export async function quoteFile(open, { coachSignature = null, zone = 'Europe/London' } = {}) {
  const { quotePdf } = await docCode();
  const sentDay = String(open.sent_at || '').slice(0, 10) || String(open.valid_until || '');
  const spec = quotePdf({ number: open.number, terms: { ...(open.terms || {}), currency: open.currency || open.terms?.currency }, clauses: open.clauses || [],
    sentDay, validUntil: open.valid_until, note: open.personal_note || '', coachSignature: safeSignature(coachSignature, open.terms?.coachName), business: await businessDetails() });
  return pdfFrom(spec, zone);
}

/**
 * A sponsor's agreement (kind 'sponsor'), read with the server's key once the link has been checked: unsigned (as the
 * sponsor reads it, signed by the coach) or signed, with the sponsor's own signature. { bytes, fileName } or null.
 */
export async function sponsorFile(server, versionId) {
  const { agreementPdf, tidyVersion } = await docCode();
  const { data: v } = await server.from('agreement_versions').select('*').eq('id', versionId).maybeSingle();
  if (!v) return null;
  const { data: a } = await server.from('agreements').select('*').eq('id', v.agreement_id).maybeSingle();
  if (!a || a.kind !== 'sponsor') return null;
  const { data: org } = a.organisation_id ? await server.from('organisations').select('name').eq('id', a.organisation_id).maybeSingle() : { data: null };
  const { data: coach } = await server.from('coaches').select('user_id').eq('id', v.coach_id).maybeSingle();
  const { data: coachSig } = v.coach_signature_id ? await server.from('signatures').select('kind, image, typed_name, user_id').eq('id', v.coach_signature_id).maybeSingle() : { data: null };
  const { data: sponsorSig } = await server.from('sponsor_signatures').select('image, typed_name').eq('version_id', v.id).maybeSingle();
  const version = tidyVersion({ ...v, reference: a.reference, current: true, status: v.status === 'draft' ? 'sent' : v.status, client_signed_at: null });
  if (!version) return null;
  const sponsorSignature = sponsorSig ? (sponsorSig.image ? { kind: 'drawn', image: sponsorSig.image } : { kind: 'typed', typed_name: sponsorSig.typed_name }) : null;
  const spec = agreementPdf({
    version: { ...version, signedAt: null },
    coachSignature: coachSig && coachSig.user_id === coach?.user_id ? safeSignature(coachSig, version.terms?.coachName) : null,
    clientName: org?.name || version.terms?.orgName || '',
    raw: v,
    // The sponsor funds it, so their file keeps the money clauses their Read shows (Stage D, F2).
    seesMoney: true,
    sponsorSignature: safeSignature(sponsorSignature, v.sponsor_name),
    business: await businessDetails(),
  });
  return pdfFrom({ ...spec, who: org?.name || spec.who }, 'Europe/London');
}

/** Whether the bytes start as a PNG, a JPEG or a PDF (never trusting the name or the stored type alone). */
export function evidenceKind(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  return null;
}

const MM = 72 / 25.4;

/** How many pages the evidence will add: one an image, a PDF's own pages. Unreadable files add none. */
export async function evidencePages(evidence) {
  const { PDFDocument } = await import('pdf-lib');
  let n = 0;
  for (const e of evidence || []) {
    const kind = evidenceKind(e.bytes);
    if (kind === 'png' || kind === 'jpeg') n += 1;
    else if (kind === 'pdf') {
      try { n += (await PDFDocument.load(e.bytes, { ignoreEncryption: false })).getPageCount(); } catch { /* left out */ }
    }
  }
  return n;
}

/**
 * The one file (brief item 27): the template's pages, then each piece of evidence as its own page(s): an image placed at
 * full width inside the 19mm margins on the same paper, a PDF's pages as they are. A file that can't be read is left out.
 * @param {Uint8Array} bytes the template's PDF
 * @param {{ bytes: Uint8Array, name?: string }[]} evidence
 */
export async function withEvidence(bytes, evidence = []) {
  if (!evidence?.length) return bytes;
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes);
  const [first] = doc.getPages();
  const { width: W, height: H } = first.getSize();
  for (const e of evidence) {
    const kind = evidenceKind(e.bytes);
    try {
      if (kind === 'pdf') {
        const src = await PDFDocument.load(e.bytes);
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else if (kind === 'png' || kind === 'jpeg') {
        const img = kind === 'png' ? await doc.embedPng(e.bytes) : await doc.embedJpg(e.bytes);
        const page = doc.addPage([W, H]);
        const m = 19 * MM;
        const scale = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height, 1.5);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (W - w) / 2, y: H - m - h, width: w, height: h });
      }
    } catch { /* an unreadable file is left out, never breaking the invoice */ }
  }
  return doc.save();
}

/** An organisation's invoice: the template's pages with the evidence appended. { bytes, fileName, pages }. */
export async function invoiceFile(input, evidence = [], zone = 'Europe/London') {
  const { invoicePdf } = await docCode();
  const extraPages = await evidencePages(evidence);
  const made = await pdfFrom(invoicePdf({ ...input, extraPages, business: input.business ?? await businessDetails() }), zone);
  const bytes = await withEvidence(made.bytes, evidence);
  const { PDFDocument } = await import('pdf-lib');
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  return { bytes, fileName: made.fileName, pages };
}

/** A credit note's PDF. */
export async function creditNoteFile(input, zone = 'Europe/London') {
  const { creditNotePdf } = await docCode();
  return pdfFrom(creditNotePdf({ ...input, business: input.business ?? await businessDetails() }), zone);
}
