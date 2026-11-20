// The copy-in address, through the portal's own server (Phase 6a run 4).
//
// HOW IT WORKS. The owner has two addresses of their own (migration 052's
// coach_email_addresses: "log.<name>.<8 characters>" and "todo.<name>.<8
// characters>", at the portal's inbound domain). Copying the log address
// into any email puts that email on the right person's timeline; forwarding
// an email to the to-do address makes it a to-do. The email never passes
// through the browser: an inbound-email service receives it and posts it to
// /api/coach-email-in with a shared secret, and that function hands it to
// the database (email_in, the server's key only). Nothing is ever sent.
//
// THE INTERFACE (the stand-in in standIn.js has exactly the same one):
//   service: 'copy_in_email', real: boolean
//   status()        → { ready: boolean, domain: string|null }
//       ready: the server has its secret, its key and its inbound domain,
//       so an email copied to the address really arrives
//   addresses(keys) → { log: string, todo: string }
//       the owner's two addresses in full, '' for one that isn't there yet
//       (keys: coach_email_addresses rows, or { log, todo })
// The stand-in adds `arrive(...)` and `handOver()` so a test, or a tester on
// a build that isn't live, can make an invented email "arrive".
//
// The real adapter never holds a key or the secret: it only asks the server
// whether the address is set up, with the owner's own sign-in.
import { copyInAddress, copyInKey, emailPeople, headerPeople } from '../crm.js';
import { clean, cut, isEmail } from '../model.js';

/** A coach's two keys from coach_email_addresses rows (or an object that already has them). */
export function keysOf(keys) {
  if (Array.isArray(keys)) return { log: keys.find((k) => k.kind === 'log')?.key || '', todo: keys.find((k) => k.kind === 'todo')?.key || '' };
  return { log: keys?.log || '', todo: keys?.todo || '' };
}
/** The two addresses in full; '' until both the key and the inbound domain are known. */
export const addressesFor = (keys, domain) => ({ log: copyInAddress(keysOf(keys).log, domain), todo: copyInAddress(keysOf(keys).todo, domain) });

/**
 * @param {(body: object) => Promise<object>} ask posts to /api/coach-email-in with the owner's sign-in (server.js's askEmailServer)
 */
export function copyInEmailAdapter(ask) {
  let known = null;
  const status = async () => {
    try {
      const answer = await ask({ kind: 'status' });
      known = { ready: answer?.ok === true && answer.copy_in === true, domain: answer?.ok === true && typeof answer.domain === 'string' && answer.domain ? answer.domain : null };
    } catch { known = { ready: false, domain: null }; }
    return known;
  };
  return {
    service: 'copy_in_email',
    real: true,
    status,
    async addresses(keys) { const s = known || await status(); return s.ready ? addressesFor(keys, s.domain) : { log: '', todo: '' }; },
  };
}

/** No address yet: the live site before the email service is set up. It shows nothing to copy and hands nothing over. */
export const copyInOff = {
  service: 'copy_in_email',
  real: false,
  off: true,
  async status() { return { ready: false, domain: null }; },
  async addresses() { return { log: '', todo: '' }; },
};

// ---------------------------------------------------------------- the inbound webhook's shape

const BODY_MAX = 100000;
const text = (v) => (typeof v === 'string' ? v : '');
/** People from a header as a string ("A <a@x>, b@y"), a list of strings, or a list of { email, name } in any of the usual spellings. */
function peopleOf(value) {
  if (!value) return [];
  if (typeof value === 'string') return headerPeople(value);
  if (Array.isArray(value)) return value.flatMap((v) => peopleOf(v));
  if (typeof value === 'object') {
    const email = clean(value.email ?? value.Email ?? value.address ?? value.Address).toLowerCase();
    return isEmail(email) ? [{ name: cut(clean(value.name ?? value.Name), 120), email }] : [];
  }
  return [];
}
const idOf = (v) => clean(text(v)).replace(/^<|>$/g, '').slice(0, 300);
/** HTML as plain words, for an email that came with no text part. */
const plain = (html) => text(html).replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|blockquote)>/gi, '\n').replace(/<\/(td|th)>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"');
const header = (payload, name) => {
  const h = payload.headers ?? payload.Headers;
  if (Array.isArray(h)) { const hit = h.find((x) => String(x?.name ?? x?.Name ?? '').toLowerCase() === name); return text(hit?.value ?? hit?.Value); }
  if (h && typeof h === 'object') { const key = Object.keys(h).find((k) => k.toLowerCase() === name); return key ? text(h[key]) : ''; }
  return '';
};

/**
 * An inbound-email service's webhook, read: which of the owner's addresses
 * it was copied to (its key), and the email as the database takes it.
 * It reads the plain shape below and the usual spellings of the common
 * services (FromFull, ToFull, CcFull, BccFull, TextBody, MessageID…):
 *   { from: 'Name <a@x>' | { email, name }, to: [...], cc: [...], bcc: [...],
 *     recipient | envelope: { to: [...] }   (who the service received it for)
 *     subject, text, html, date, message_id, in_reply_to, references, headers }
 * @param {object} payload
 * @param {{ domain?: string }} [o] the portal's inbound domain: only an address there counts
 * @returns {{ key: string, kind: 'log'|'todo', email: object }|{ problem: 'unreadable'|'no_address' }}
 *   `email`: { external_id, source: 'copy_in', direction: 'out', from, to, cc, subject, snippet, body, sent_at, thread_key, link: null }
 */
export function readInbound(payload, { domain = '' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { problem: 'unreadable' };
  const from = peopleOf(payload.FromFull ?? payload.from ?? payload.From ?? payload.sender)[0] || null;
  const to = peopleOf(payload.ToFull ?? payload.to ?? payload.To);
  const cc = peopleOf(payload.CcFull ?? payload.cc ?? payload.Cc);
  const bcc = peopleOf(payload.BccFull ?? payload.bcc ?? payload.Bcc);
  const received = peopleOf([payload.OriginalRecipient, payload.recipient, payload.rcpt_to, payload.envelope?.to, payload.envelope?.recipients].filter(Boolean));
  const found = copyInKey([...received, ...to, ...cc, ...bcc], domain);
  if (!found) return { problem: 'no_address' };
  const subject = cut(clean(payload.subject ?? payload.Subject), 300);
  const body = cut((text(payload.text ?? payload.TextBody ?? payload['body-plain'] ?? payload.plain) || plain(payload.html ?? payload.HtmlBody ?? payload['body-html'])).replace(/\r\n/g, '\n').trim(), BODY_MAX);
  if (!from && !subject && !body) return { problem: 'unreadable' };
  // The copy-in addresses themselves are nobody: they never show among the people an email names.
  const ours = (p) => Boolean(copyInKey([p], domain));
  const sent = new Date(text(payload.date ?? payload.Date) || header(payload, 'date'));
  const messageId = idOf(payload.message_id ?? payload.MessageID ?? payload.messageId ?? payload['Message-Id']) || idOf(header(payload, 'message-id'));
  const replyTo = idOf(payload.in_reply_to ?? payload.InReplyTo) || idOf(header(payload, 'in-reply-to'));
  const firstRef = idOf((text(payload.references ?? payload.References) || header(payload, 'references')).trim().split(/\s+/)[0]);
  const threadKey = firstRef || replyTo || messageId || clean(subject).toLowerCase().replace(/^((re|fwd?|fw)\s*:\s*)+/i, '');
  return {
    key: found.key, kind: found.kind,
    email: {
      external_id: messageId || null, source: 'copy_in', direction: 'out',
      from: from ? { name: from.name, email: from.email } : null,
      to: to.filter((p) => !ours(p)).slice(0, 50), cc: cc.filter((p) => !ours(p)).slice(0, 50),
      subject: subject || null, snippet: cut(clean(body), 300) || null, body: body || null,
      sent_at: Number.isNaN(sent.getTime()) ? null : sent.toISOString(), thread_key: cut(threadKey, 200) || null, link: null,
    },
  };
}

/** Which way an email went, once the owner's own addresses are known: from one of them is 'out', from anyone else 'in'. Not known: 'out' (copying the address in is something the owner does). */
export const directionOf = (email, ownAddresses = []) => (ownAddresses.length && email?.from?.email && !ownAddresses.map((a) => String(a || '').toLowerCase()).includes(email.from.email) ? 'in' : 'out');
/** Everyone an email names apart from the owner (for a page that shows who it would be logged to). */
export const othersIn = (email, ownAddresses = []) => emailPeople(email).filter((p) => !ownAddresses.map((a) => String(a || '').toLowerCase()).includes(p.email));
