import { addDays, dayKeyWords } from '../time/index.js';
import { formatClockTime, getLocalDateKey, parseDbTimestamp } from '../dateFormatter.js';
import { moneyText } from './currency.js';
import { quoteNumber } from './quote.js';

// Where an agreement or quote stands, for the coach (brief item 22; M28's s-sent): Sent, Opened (with its time),
// Signed and Settled. Opened is the coach's only: nothing here is ever shown to the client (Tim, 25 Nov; 065 never
// hands opens to a client). Times only through formatClockTime (rule 19), days in words.
// Checked by tests/performance/agreements-status.test.mjs.

export const NOT_YET = 'Not yet';
const at = (v) => (v ? parseDbTimestamp(v) : null);
const dayOf = (v) => getLocalDateKey(at(v));

/** "Today, 12:52", "Yesterday, 09:10" or "Tue 24 Nov, 09:10" on the device's own clock. */
export function whenWords(value, now = new Date()) {
  const d = at(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = getLocalDateKey(d);
  const today = getLocalDateKey(now);
  const lead = day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : dayKeyWords(day);
  return `${lead}, ${formatClockTime(d)}`;
}
/** "Today", "Yesterday" or "Tue 24 Nov". */
export function dayOnlyWords(value, now = new Date()) {
  const d = at(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = getLocalDateKey(d);
  const today = getLocalDateKey(now);
  return day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : dayKeyWords(day);
}

/**
 * The four rows: [{ label, value, done }].
 * @param {{ version: object, opens?: { opened_at: string }[], firstInvoice?: { status: string, paid_minor?: number, total_minor?: number, currency?: string, paid_at?: string }|null, orgName?: string|null, now?: Date }} a
 */
export function agreementStatus({ version, opens = [], firstInvoice = null, orgName = null, now = new Date() }) {
  const v = version || {};
  const firstOpen = (opens || []).map((o) => o.opened_at).filter(Boolean).sort((a, b) => at(a) - at(b))[0];
  const signedAt = v.client_signed_at || v.sponsor_signed_at;
  const funded = Boolean(v.funded_by || orgName);
  let settled = NOT_YET;
  if (funded) settled = `Invoiced to ${v.funded_by || orgName}`;
  else if (firstInvoice?.status === 'paid') settled = `${moneyText(firstInvoice.paid_minor || firstInvoice.total_minor || 0, firstInvoice.currency || 'GBP')}, ${dayOnlyWords(firstInvoice.paid_at, now).replace(/^Today$/, 'today')}`;
  const rows = [
    { label: 'Sent', value: v.sent_at ? whenWords(v.sent_at, now) : NOT_YET },
    { label: 'Opened', value: firstOpen ? whenWords(firstOpen, now) : NOT_YET },
    { label: 'Signed', value: signedAt ? dayOnlyWords(signedAt, now) : NOT_YET },
    { label: 'Settled', value: settled },
  ];
  return rows.map((r) => ({ ...r, done: r.value !== NOT_YET }));
}

/** "Version 1, waiting for Sam to sign" or "Version 1, signed by Sam" (M28's sentTitle); a quote's own. */
export function sentTitle({ version, firstName, quote = null }) {
  if (quote) return `Quote ${quoteNumber(quote.number)}, ${quote.status === 'accepted' ? `accepted by ${firstName}` : `waiting for ${firstName}`}`;
  const signed = Boolean(version?.client_signed_at || version?.sponsor_signed_at);
  return `Version ${version?.version || 1}, ${signed ? `signed by ${firstName}` : `waiting for ${firstName} to sign`}`;
}
/** The line under it. */
export function sentLine({ version, quote = null, now = new Date() }) {
  if (quote) {
    if (quote.status === 'accepted') return 'Accepted. The agreement is in your Needs you.';
    return `Sent ${dayOnlyWords(quote.sent_at, now).toLowerCase()}. Valid until ${dayKeyWords(quote.valid_until, { year: true })}.`;
  }
  const signed = version?.client_signed_at || version?.sponsor_signed_at;
  if (signed) return `Signed ${dayOnlyWords(signed, now).toLowerCase()}. Both signatures are in the PDF.`;
  return `Sent ${dayOnlyWords(version?.sent_at, now).toLowerCase()}. A reminder is drafted for you at 3 and 7 days.`;
}
/** "If Sam hasn't signed, it runs out on Fri 25 Dec 2026. You can reopen it in one step." */
export function expiryLine({ version, firstName, today = null }) {
  if (version?.client_signed_at || version?.sponsor_signed_at) return `${firstName} has signed, so nothing runs out.`;
  if (!version?.expires_on) return '';
  // A day this year without its year (writing rule 28), given today's day key; without one the year shows.
  const year = !today || String(today).slice(0, 4) !== String(version.expires_on).slice(0, 4);
  return `If ${firstName} hasn’t signed, it runs out on ${dayKeyWords(version.expires_on, { year })}. You can reopen it in one step.`;
}
export { dayOf };
