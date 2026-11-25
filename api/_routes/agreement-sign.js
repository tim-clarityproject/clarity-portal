// A client signs a version of their coaching agreement (follow-up 5, item 4).
//   POST /api/agreement-sign  { versionId, name, signatureId, fingerprint, startNow?, choice? }
//   (Phase 6b run 3: signed with 065's sign_agreement_v2, which also records the "Start my coaching straight away" tick
//   with its time for a self-funded client, and the way of settling where it is offered.)
// with the client's own sign-in as the Authorization header.
//
// 1. Signs AS THE CALLER with sign_agreement (061), exactly as the browser did
//    before: the database checks it is their own agreement, the version sent
//    and signed by the coach, the newest, unchanged since they read it
//    (fingerprint), not signed already, their email verified, and their own
//    signature.
// 2. Then makes the signed PDF, with both signatures drawn, and keeps it
//    (api/_agreementPdf.js, migration 064), so the signed copy never changes.
//    If that can't be done now (no server key on this deployment, or it
//    didn't work), signing still stands: the first download makes it, from
//    the same signed version, and keeps it.
//
// Answers (nothing is logged, and nothing technical goes back):
//   200 { ok: true, signed_at, fingerprint, version, pdf: true|false }   pdf: kept already
//   400, 403, 409 { ok: false, code, message }   the database's own refusal, in its words
//   401 not signed in    502 the database didn't answer
// Environment variables (Vercel): SUPABASE_SERVICE_ROLE_KEY (to read the
// signatures and keep the PDF), and the Supabase URL and anon key the app
// already has.
import { UUID, asCaller, asServer, callerToken, makeAndKeep, refusal, supabaseKeys } from '../_agreementPdf.js';

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const SIGN_IN = 'Sign in again to carry on.';

/** The request's fields, or null when it is the wrong shape. */
export function signRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const ok = typeof b.versionId === 'string' && UUID.test(b.versionId)
    && typeof b.signatureId === 'string' && UUID.test(b.signatureId)
    && typeof b.name === 'string' && b.name.length <= 400
    && (b.fingerprint == null || (typeof b.fingerprint === 'string' && b.fingerprint.length <= 64));
  if (!ok || (b.startNow != null && typeof b.startNow !== 'boolean') || (b.choice != null && !['upfront', 'plan'].includes(b.choice))) return null;
  return { versionId: b.versionId, signatureId: b.signatureId, name: b.name, fingerprint: b.fingerprint ?? null, startNow: b.startNow === true, choice: b.choice ?? null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: '' });
  const env = process.env;
  const asked = signRequest(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: '' });
  const token = callerToken(req);
  const { url, anon } = supabaseKeys(env);
  if (!url || !anon || !token) return reply(res, 401, { ok: false, code: '42501', message: SIGN_IN });

  let signed;
  try {
    signed = await asCaller(env, token).rpc('sign_agreement_v2', {
      p_version: asked.versionId, p_name: asked.name, p_signature: asked.signatureId, p_fingerprint: asked.fingerprint,
      p_start_now: asked.startNow, p_choice: asked.choice,
    });
  } catch {
    return reply(res, 502, { ok: false, message: '' });
  }
  if (signed.error) {
    const r = refusal(signed.error);
    return reply(res, r.status, r.body);
  }
  const d = signed.data || {};

  // Signed: now its PDF, with both signatures, kept as made. Never undoes the signing.
  let pdf = false;
  const server = asServer(env);
  if (server) {
    try { pdf = Boolean(await makeAndKeep(server, asked.versionId)); } catch { pdf = false; }
  }
  return reply(res, 200, { ok: true, signed_at: d.signed_at || null, fingerprint: d.fingerprint || null, version: d.version ?? null, pdf,
    start_now: d.start_now ?? null, settle_choice: d.settle_choice ?? null, self_funded: d.self_funded ?? null });
}
