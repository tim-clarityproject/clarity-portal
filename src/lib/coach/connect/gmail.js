// Gmail, through the portal's own server (Phase 6a run 4): the OPTIONAL
// connection behind Settings, Email, "Log Gmail with clients and leads".
// READ ONLY. There is no way here to send, reply, label, archive or delete:
// the interface has one question, "what arrived or was sent since last
// time?", and the portal keeps one line of each email on the right person's
// timeline (the database decides whose: coach_email_add, migration 052).
//
// THE INTERFACE (the stand-in in standIn.js has exactly the same one):
//   service: 'gmail', real: boolean
//   listMessages({ cursor }) → { emails, cursor }
//       the emails since the cursor (the last 30 days without one), oldest
//       first, each in the shape the database takes:
//       { external_id, source: 'gmail', direction: 'in' | 'out',
//         from: { name, email }, to: [{ name, email }], cc: [...],
//         subject, snippet, body, sent_at, thread_key, link }
//       `link` opens that email in Gmail (https only); `cursor` is handed
//       back next time.
//
// The real adapter never holds a key: every call goes to
// /api/coach-email-in with the owner's own sign-in, and the server uses the
// keys in its environment. THE SERVER'S SIDE OF GMAIL IS NOT BUILT YET (it
// answers "not connected"): it needs Google's review of a restricted Gmail
// scope, a consent step and one more service name in coach_connections.
// Until then the copy-in address does the job, and this adapter is ready.
import { cut } from '../model.js';

const tidyPerson = (p) => ({ name: cut(String(p?.name || '').trim(), 120), email: String(p?.email || '').trim().toLowerCase() });
/** One email as the database takes it, whatever the server sent: nothing but the fields it knows, and an https link or none. */
export function tidyEmail(e) {
  if (!e || typeof e !== 'object') return null;
  const sent = new Date(e.sent_at);
  return {
    external_id: e.external_id ? String(e.external_id).slice(0, 300) : null, source: 'gmail', direction: e.direction === 'in' ? 'in' : 'out',
    from: e.from ? tidyPerson(e.from) : null, to: (Array.isArray(e.to) ? e.to : []).slice(0, 50).map(tidyPerson), cc: (Array.isArray(e.cc) ? e.cc : []).slice(0, 50).map(tidyPerson),
    subject: e.subject ? cut(String(e.subject), 300) : null, snippet: e.snippet ? cut(String(e.snippet), 300) : null, body: e.body ? cut(String(e.body), 100000) : null,
    sent_at: Number.isNaN(sent.getTime()) ? null : sent.toISOString(), thread_key: e.thread_key ? String(e.thread_key).slice(0, 200) : null,
    link: /^https:\/\//.test(String(e.link || '')) && String(e.link).length <= 600 ? e.link : null,
  };
}

/**
 * @param {(body: object) => Promise<object>} ask posts to /api/coach-email-in and resolves its answer (server.js's askEmailServer)
 */
export function gmailAdapter(ask) {
  return {
    service: 'gmail',
    real: true,
    async listMessages({ cursor = null } = {}) {
      const answer = await ask({ service: 'gmail', kind: 'list', cursor });
      if (!answer || answer.ok !== true) { const err = new Error('Gmail didn’t answer.'); err.code = answer?.reason || 'no_answer'; throw err; }
      return { emails: (Array.isArray(answer.emails) ? answer.emails : []).map(tidyEmail).filter(Boolean), cursor: answer.cursor ?? cursor };
    },
  };
}

/** Not connected: nothing is read and nothing is logged. */
export const gmailOff = { service: 'gmail', real: false, off: true, async listMessages({ cursor = null } = {}) { return { emails: [], cursor }; } };

/**
 * One round of logging Gmail: what arrived or was sent since the cursor is
 * handed, one email at a time, to `log` (crmData.js's logEmail, which asks
 * coach_email_add; before migration 052 the page's own device-first
 * logging). The database keeps each email once (its external id), so a
 * round that is run twice logs nothing twice. Nothing runs unless the
 * owner has switched "Log Gmail with clients and leads" on. A round that
 * stops part-way keeps the old cursor, so the next one starts again from
 * the same place.
 * @param {{ gmail: object, cursor?: string|null, on: boolean, log: (email: object) => Promise<{ new?: boolean, links?: number, waiting?: number }|null> }} o
 * @returns {Promise<{ cursor: string|null, read: number, logged: number, links: number, waiting: number, problem: string|null }>}
 */
export async function gmailOnce({ gmail, cursor = null, on, log }) {
  const out = { cursor, read: 0, logged: 0, links: 0, waiting: 0, problem: null };
  if (!on || !gmail || gmail.off) return out;
  let pulled;
  try { pulled = await gmail.listMessages({ cursor }); } catch (err) { return { ...out, problem: err?.code || 'no_answer' }; }
  for (const email of pulled.emails) {
    out.read += 1;
    try {
      const answer = await log(email);
      if (answer?.new) out.logged += 1;
      out.links += Number(answer?.links) || 0;
      out.waiting += Number(answer?.waiting) || 0;
    } catch { return { ...out, problem: 'not_logged' }; }
  }
  return { ...out, cursor: pulled.cursor ?? cursor };
}
