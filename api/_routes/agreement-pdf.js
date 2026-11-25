// A signed agreement's PDF (follow-up 5, item 4): the client's download and
// the coach's "Open the agreement".
//   POST /api/agreement-pdf  { versionId }
// with the caller's own sign-in as the Authorization header.
//
// Asked AS THE CALLER first (agreement_signed_pdf, 064): only that version's
// client, or the agreement's coach with their 6-digit code, gets anything.
// The kept file comes back as it was made at signing. Only where none was
// kept (signing's own making didn't happen, or the version was signed before
// 064) the server makes it now, from the same signed version, with both
// signatures, keeps it, and hands back the one kept; it is never made or
// replaced again once kept.
//
// Answers:
//   200 { ok: true, pdf: base64, fileName }
//   403 { ok: false, code: '42501', message }   not theirs (or a coach without the code)
//   409 { ok: false, error: 'not_signed' }       the version isn't signed yet
//   401 not signed in    502 the database didn't answer, or it couldn't be made now
// Environment variables (Vercel): SUPABASE_SERVICE_ROLE_KEY (only to make and
// keep a PDF not yet kept), and the Supabase URL and anon key.
import { UUID, asCaller, asServer, callerToken, makeAndKeep, refusal, supabaseKeys } from '../_agreementPdf.js';

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false });
  const env = process.env;
  const versionId = req.body && typeof req.body === 'object' ? req.body.versionId : null;
  if (typeof versionId !== 'string' || !UUID.test(versionId)) return reply(res, 400, { ok: false });
  const token = callerToken(req);
  const { url, anon } = supabaseKeys(env);
  if (!url || !anon || !token) return reply(res, 401, { ok: false, code: '42501', message: 'Sign in again to carry on.' });

  let mine;
  try {
    mine = await asCaller(env, token).rpc('agreement_signed_pdf', { p_version: versionId });
  } catch {
    return reply(res, 502, { ok: false });
  }
  if (mine.error) {
    const r = refusal(mine.error);
    return reply(res, r.status, r.body);
  }
  const d = mine.data || {};
  if (!d.ok) return reply(res, 409, { ok: false, error: 'not_signed' });
  if (d.made && typeof d.pdf === 'string') return reply(res, 200, { ok: true, pdf: d.pdf, fileName: d.file_name });

  // Theirs, signed, and not kept yet: made now, once.
  const server = asServer(env);
  if (!server) return reply(res, 502, { ok: false });
  try {
    const kept = await makeAndKeep(server, versionId);
    if (!kept) return reply(res, 409, { ok: false, error: 'not_signed' });
    return reply(res, 200, { ok: true, pdf: kept.pdf, fileName: kept.file_name });
  } catch {
    return reply(res, 502, { ok: false });
  }
}
