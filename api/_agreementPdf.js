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
