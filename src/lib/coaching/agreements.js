import { supabase } from '../supabase.js';
import { isOnline } from '../connection.js';
import { isOffline } from '../friendlyError.js';
import { isNotThere } from '../coachingRules.js';
import { isSignatureImage, nameOk, signError, tidyAgreements } from './agreementRules.js';

export * from './agreementRules.js';

// The client's agreements, signing and invoices (Phase 6b run 1, mock-up M13), through migration
// 061's own functions only, as the signed-in person, so the database decides what is read and done:
//   my_agreements()            their own agreements, every version sent or signed; a funded client's
//                              without any amount (terms and clauses cut by the database)
//   my_invoices()              their own invoices, only where they settle them themselves
//   agreement_fingerprint(v)   the document's fingerprint, read when the signing screen opens
//   sign_agreement(v, name, signature, fingerprint)
//                              signs once: theirs, sent, coach-signed, newest, unchanged since read
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
    const res = await supabase.rpc('sign_agreement', {
      p_version: versionId, p_name: fullName, p_signature: added.data.id, p_fingerprint: fingerprint,
    });
    if (res.error) return { ok: false, ...signError(res.error, { online: !isOffline(res.error) }) };
    const d = res.data || {};
    return { ok: true, signedAt: d.signed_at || new Date().toISOString(), fingerprint: d.fingerprint || fingerprint, version: d.version, signature: added.data };
  } catch (error) {
    return { ok: false, ...signError(error, { online: !isOffline(error) }) };
  }
}
