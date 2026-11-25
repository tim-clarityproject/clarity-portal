import { supabase } from '../supabase.js';
import { isOnline } from '../connection.js';
import { isOffline } from '../friendlyError.js';
import { isNotThere } from '../coachingRules.js';
import { apiFetch } from '../readShare.js';
import { isSignatureImage, nameOk, signError, tidyAgreements } from './agreementRules.js';

export * from './agreementRules.js';

// The client's agreements, signing and invoices (Phase 6b run 1, mock-up M13), through migration
// 061's own functions only, as the signed-in person, so the database decides what is read and done:
//   my_agreements()            their own agreements, every version sent or signed; a funded client's
//                              without any amount (terms and clauses cut by the database)
//   my_invoices()              their own invoices, only where they settle them themselves
//   agreement_fingerprint(v)   the document's fingerprint, read when the signing screen opens
//   sign_agreement(v, name, signature, fingerprint)
//                              signs once: theirs, sent, coach-signed, newest, unchanged since read;
//                              asked through the server (/api/agreement-sign, as the person), which
//                              then makes the signed PDF with both signatures and keeps it (064)
//   agreement_signed_pdf(v)    the signed PDF as it was kept (064); /api/agreement-pdf makes and
//                              keeps it first when it wasn't (signed before 064, or its making failed)
//   public.signatures          their own rows only (select and insert): the newest drawn one is the
//                              saved signature
// No table of agreements or invoices is ever read directly.
//
// Quiet until 061 has run: a function or table the database doesn't have reads as nothing there,
// is asked for once per visit (this module remembers it until the portal is next opened, with
// nothing kept on the device), and nothing is said.

let missing = false; // 061 isn't on the database: asked once per visit
const notThere = (res) => isNotThere(res?.error) || res?.status === 404;

const EMPTY = Object.freeze({ ready: false, agreements: [], invoices: [] });

/**
 * Everything My coaching, Home's row and Billing need. Throws only when the database didn't
 * answer (the page then keeps the device's copy); before 061 it is empty.
 */
export async function loadAgreements(userId) {
  if (!userId || missing) return { ...EMPTY };
  const [agreements, invoices] = await Promise.all([supabase.rpc('my_agreements'), supabase.rpc('my_invoices')]);
  if (notThere(agreements) || notThere(invoices)) { missing = true; return { ...EMPTY }; }
  if (agreements.error) throw agreements.error;
  if (invoices.error) throw invoices.error;
  return tidyAgreements({ ready: true, agreements: agreements.data, invoices: invoices.data });
}

/**
 * The signing screen's own read: the version and its fingerprint, read together so the
 * fingerprint signed with is the one of what was shown (061 refuses a changed document).
 * @returns {Promise<{ ready: boolean, agreements: object[], invoices: object[], fingerprint: string|null }>}
 */
export async function loadSigning(userId, versionId) {
  const all = await loadAgreements(userId);
  if (!all.ready || !all.agreements.some((v) => v.id === versionId)) return { ...all, fingerprint: null };
  const print = await supabase.rpc('agreement_fingerprint', { p_version: versionId });
  if (print.error && !notThere(print)) throw print.error;
  return { ...all, fingerprint: typeof print.data === 'string' ? print.data : null };
}

// ---------------------------------------------------------------- signatures (one's own)

const SIG_COLUMNS = 'id,kind,image,typed_name,created_at';

/** The saved signature: the newest drawn one, or null (also before 061, or with no connection). */
export async function loadSavedSignature(userId) {
  if (!userId || missing) return null;
  const res = await supabase.from('signatures').select(SIG_COLUMNS).eq('user_id', userId).eq('kind', 'drawn')
    .order('created_at', { ascending: false }).limit(1);
  if (res.error) {
    if (notThere(res)) return null;
    throw res.error;
  }
  const row = res.data?.[0];
  return row && isSignatureImage(row.image) ? row : null;
}

/** The person's signatures made at or before `at` (newest first), for a signed PDF's signing record. */
export async function loadSignaturesBefore(userId, at) {
  if (!userId || !at) return [];
  const res = await supabase.from('signatures').select(SIG_COLUMNS).eq('user_id', userId).lte('created_at', at)
    .order('created_at', { ascending: false }).limit(5);
  if (res.error) {
    if (notThere(res)) return [];
    throw res.error;
  }
  return res.data || [];
}

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';

/** Keeps a drawn signature as the saved one (My signature, and "Use this signature"). */
export async function saveDrawnSignature(userId, image) {
  if (!isSignatureImage(image)) throw new Error('Draw your signature to carry on.');
  const res = await supabase.from('signatures').insert({ user_id: userId, kind: 'drawn', image }).select(SIG_COLUMNS).single();
  if (res.error) {
    const e = new Error(SAVE_PROBLEM);
    e.offline = isOffline(res.error);
    throw e;
  }
  return res.data;
}

/**
 * Signs a version. Signing needs a connection: offline it says so and nothing is lost on the
 * screen. The signature it signs with is added just before (a copy of the saved drawing, a new
 * drawing, or the typed name), so the signed PDF can always find it by its time.
 * @param {{ userId: string, versionId: string, name: string, fingerprint: string|null,
 *   signature: { kind: 'drawn', image: string } | { kind: 'typed' } }} p
 * @returns {Promise<{ ok: true, signedAt: string, fingerprint: string, version: number, signature: object }
 *   | { ok: false, kind: string, lines: string[] }>}
 */
export async function signAgreement({ userId, versionId, name, fingerprint, signature }) {
  if (!isOnline()) return { ok: false, ...signError(null, { online: false }) };
  const fullName = String(name || '').trim();
  if (!nameOk(fullName)) return { ok: false, kind: 'refused', lines: ['Type your full name to sign.'] };
  const row = signature?.kind === 'typed'
    ? { user_id: userId, kind: 'typed', typed_name: fullName }
    : { user_id: userId, kind: 'drawn', image: signature?.image };
  if (row.kind === 'drawn' && !isSignatureImage(row.image)) return { ok: false, kind: 'refused', lines: ['Use your signature to sign.'] };
  try {
    const added = await supabase.from('signatures').insert(row).select(SIG_COLUMNS).single();
    if (added.error) return { ok: false, ...signError(added.error, { online: !isOffline(added.error) }) };
    const res = await signThroughServer({ versionId, name: fullName, signatureId: added.data.id, fingerprint });
    if (res.error) return { ok: false, ...signError(res.error, { online: !isOffline(res.error) }) };
    const d = res.data || {};
    return { ok: true, signedAt: d.signed_at || new Date().toISOString(), fingerprint: d.fingerprint || fingerprint, version: d.version, signature: added.data };
  } catch (error) {
    return { ok: false, ...signError(error, { online: !isOffline(error) }) };
  }
}

// ---------------------------------------------------------------- the signed PDF (follow-up 5, 064)

async function signedInToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
}

/** A server answer as JSON, or null when nothing that is the server's own answered (no server on a developer's machine). */
async function serverAnswer(path, body) {
  const token = await signedInToken();
  if (!token) return { status: 401, body: { ok: false, code: '42501', message: 'Sign in again to carry on.' } };
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = /application\/json/i.test(res.headers.get('content-type') || '') ? await res.json().catch(() => null) : null;
  if (!json || typeof json !== 'object' || typeof json.ok !== 'boolean') return res.status === 404 || !json ? null : { status: res.status, body: {} };
  return { status: res.status, body: json };
}

/**
 * Signs through the server (/api/agreement-sign), which signs as the person and then makes and
 * keeps the signed PDF. Resolves as supabase.rpc does ({ data } or { error: { code, message } }).
 * Where no server answers at all (a developer's machine), it signs with sign_agreement itself, and
 * the first download makes the PDF.
 */
async function signThroughServer({ versionId, name, signatureId, fingerprint }) {
  const answer = await serverAnswer('/api/agreement-sign', { versionId, name, signatureId, fingerprint });
  if (!answer) {
    return supabase.rpc('sign_agreement', { p_version: versionId, p_name: name, p_signature: signatureId, p_fingerprint: fingerprint });
  }
  if (answer.body.ok) return { data: { signed_at: answer.body.signed_at, fingerprint: answer.body.fingerprint, version: answer.body.version } };
  return { error: { code: answer.body.code || (answer.status >= 500 ? '' : String(answer.status)), message: answer.body.message || '' } };
}

const fromBase64 = (b64) => {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

/** The file's name when the database's is missing: "Coaching agreement, version 2.pdf". */
const fallbackName = (version) => `Coaching agreement${version?.version ? `, version ${version.version}` : ''}.pdf`;

/**
 * A signed version's PDF as it was kept at signing (064): read straight from the database when it
 * is kept, or from the server (/api/agreement-pdf), which makes and keeps it first when it isn't.
 * For the version's client, or its coach with the 6-digit code. Throws when it can't be had now.
 * @param {{ id: string, version?: number }} version
 * @returns {Promise<{ bytes: Uint8Array, fileName: string }>}
 */
export async function loadSignedPdf(version) {
  const versionId = version?.id;
  if (!versionId) throw new Error('No agreement.');
  const kept = await supabase.rpc('agreement_signed_pdf', { p_version: versionId });
  if (kept.error) throw kept.error;
  if (kept.data?.made && typeof kept.data.pdf === 'string') {
    return { bytes: fromBase64(kept.data.pdf), fileName: kept.data.file_name || fallbackName(version) };
  }
  if (!kept.data?.ok) throw new Error('This agreement isn’t signed yet.');
  const answer = await serverAnswer('/api/agreement-pdf', { versionId });
  if (!answer || !answer.body.ok || typeof answer.body.pdf !== 'string') {
    const e = new Error(answer?.body?.message || 'The signed PDF isn’t ready.');
    if (!answer) e.offline = !isOnline();
    throw e;
  }
  return { bytes: fromBase64(answer.body.pdf), fileName: answer.body.fileName || fallbackName(version) };
}
