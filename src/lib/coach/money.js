import { addDays, dayKeyWords, daysBetween } from '../time/index.js';
import { moneyText } from '../agreements/currency.js';
import { currentEnd, earlyEnd, isSigned, sessionsIn } from '../agreements/duringAgreement.js';
import { quoteNumber } from '../agreements/quote.js';
import { NOT_YET } from '../agreements/status.js';

// The coach's money screens (Polish 1, Stage C, C2; M28 version 6: "client", "sent", "needs"): the words of a client's
// Agreements and Money cards, worked out from the coach's own rows. Pure, so tests/performance/coach-money.test.mjs
// checks each line. Every amount through moneyText (currency.js), every day through src/lib/time.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (key) => MONTHS[Number(String(key).slice(5, 7)) - 1];
const yearOf = (key) => String(key).slice(0, 4);
const isDay = (key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key || ''));

/** "Jun to Dec 2025", "Sep 2025 to Mar 2026", "From Jan 2027" or "" (M28's line under an agreement's name). */
export function monthSpan(startsOn, endsOn) {
  const s = isDay(startsOn) ? startsOn : null;
  const e = isDay(endsOn) ? endsOn : null;
  if (s && e) {
    if (yearOf(s) === yearOf(e)) return monthOf(s) === monthOf(e) ? `${monthOf(s)} ${yearOf(s)}` : `${monthOf(s)} to ${monthOf(e)} ${yearOf(e)}`;
    return `${monthOf(s)} ${yearOf(s)} to ${monthOf(e)} ${yearOf(e)}`;
  }
  if (s) return `From ${monthOf(s)} ${yearOf(s)}`;
  if (e) return `To ${monthOf(e)} ${yearOf(e)}`;
  return '';
}

const termsOf = (v) => (v?.terms && typeof v.terms === 'object' ? v.terms : {});
const CLOSED = ['cancelled', 'ended', 'ended_not_renewed', 'expired'];

/** An agreement's name as the coach knows it: its coaching, else its kind's own words. */
export function agreementName(terms, agreement) {
  const t = terms || {};
  const named = String(t.coaching || t.name || agreement?.name || '').trim();
  if (named) return named;
  return { hours: 'Block of hours', retainer: 'Monthly retainer', oneoff: 'One-off piece of work', team: 'Team coaching' }[t.kind] || 'Coaching';
}

/**
 * Where one agreement stands, in a word or two (M28's list: "Ended"; the Sent page's four statuses decide the rest):
 * Draft, Waiting for approval, Quote sent, Sent, Opened, Signed (not started yet), Running, Ended, Cancelled, Ran out.
 */
export function agreementState({ agreement, latest, inForce, quote = null, opened = false, today }) {
  const a = agreement || {};
  if (a.status === 'cancelled') return { word: 'Cancelled', key: 'closed' };
  if (a.status === 'ended' || a.status === 'ended_not_renewed') return { word: 'Ended', key: 'closed' };
  if (a.status === 'expired') return { word: 'Ran out', key: 'closed' };
  if (isSigned(inForce)) {
    const t = termsOf(inForce);
    const end = earlyEnd(a) || currentEnd(a, t);
    if (end && today && end < today) return { word: 'Ended', key: 'closed' };
    if (t.startsOn && today && t.startsOn > today) return { word: 'Signed', key: 'signed' };
    // A newer version waiting to be signed (a price review, a change) is the one to follow.
    if (latest && latest !== inForce && latest.status === 'sent' && !isSigned(latest)) return { word: opened ? 'Opened' : 'Sent', key: 'sent' };
    return { word: 'Running', key: 'running' };
  }
  if (latest?.status === 'sent') return { word: opened ? 'Opened' : 'Sent', key: 'sent' };
  if (quote) return { word: quote.status === 'accepted' ? 'Quote accepted' : 'Quote sent', key: 'quote' };
  if (a.approval === 'waiting') return { word: 'Waiting for approval', key: 'draft' };
  if (a.approval === 'changes_asked') return { word: 'Change asked for', key: 'draft' };
  return { word: 'Draft', key: 'draft' };
}

/**
 * A client's agreements, newest first (M28 "client": the Agreements card). Each row: its name, its months and version
 * ("Jun to Dec 2025, version 2"), where it stands, and where it opens: a draft its builder, one waiting for the client
 * its Sent page, the rest the agreement's own page. A version made before 065 (no terms.kind) opens as run 1's did
 * (`run1`: the page opens its PDF or its text).
 */
export function agreementRows({ agreements = [], versions = [], quotes = [], opens = [], profileId, today }) {
  const mine = agreements.filter((a) => a && a.profile_id === profileId)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return mine.map((a) => {
    const vs = versions.filter((v) => v.agreement_id === a.id).sort((x, y) => (y.version || 0) - (x.version || 0));
    const latest = vs[0] || null;
    const inForce = vs.find(isSigned) || null;
    const shown = inForce || latest;
    const t = termsOf(shown);
    const quote = latest && !isSigned(latest) ? quotes.find((q) => q.version_id === latest.id && q.status !== 'draft' && q.status !== 'withdrawn') || null : null;
    const opened = Boolean(latest) && opens.some((o) => (o.version_id && o.version_id === latest.id) || (quote && o.quote_id === quote.id));
    const state = agreementState({ agreement: a, latest, inForce, quote, opened, today });
    const span = monthSpan(t.startsOn, isSigned(inForce) ? (earlyEnd(a) || currentEnd(a, t)) : t.endsOn);
    const version = shown?.version || 1;
    const sub = [span, `version ${version}`].filter(Boolean).join(', ');
    const run1 = Boolean(shown) && !t.kind;
    let to = `/coach/agreements/${a.id}`;
    if (!run1) {
      if (state.key === 'draft' && !quote) to = `/coach/agreements/${a.id}/edit`;
      else if (state.key === 'sent' || state.key === 'quote') to = `/coach/agreements/${a.id}/sent`;
    }
    return { id: a.id, name: agreementName(t, a), sub: sub.charAt(0).toUpperCase() + sub.slice(1), value: state.word, state: state.key, to, run1, version: shown };
  });
}

/** Is something already on its way to this client (a draft, a version or a quote waiting), so nothing new starts? */
export const somethingWaiting = (rows) => rows.some((r) => ['draft', 'sent', 'quote'].includes(r.state));

const remaining = (i) => Math.max(0, Number(i.total_minor || 0) - Number(i.paid_minor || 0));
const sumBy = (list, amount) => {
  const by = new Map();
  for (const i of list) {
    const c = i.currency || 'GBP';
    by.set(c, (by.get(c) || 0) + amount(i));
  }
  return [...by.entries()].filter(([, minor]) => minor > 0).map(([currency, minor]) => ({ currency, minor }));
};
/** "£9,000" or "£9,000 and US$750": one figure per currency, never converted. */
export const amountsText = (list) => list.map((x) => moneyText(x.minor, x.currency)).join(' and ');

/**
 * A client's money (M28 "client": the Money card): what they have settled in all, what is owed now (each sent invoice
 * not yet settled, with when it's due or how late it is), and an organisation that is invoiced for them instead.
 */
export function moneySummary({ invoices = [], agreements = [], versions = [], profileId, today }) {
  const theirs = new Set(agreements.filter((a) => a.profile_id === profileId).map((a) => a.id));
  const mine = invoices.filter((i) => i && !i.voided_at && i.status !== 'void'
    && (i.profile_id === profileId || (i.agreement_id && theirs.has(i.agreement_id)))
    && (i.settles_to || 'client') !== 'organisation');
  const settled = sumBy(mine.filter((i) => i.status === 'paid'), (i) => Number(i.paid_minor || i.total_minor || 0));
  const owed = mine.filter((i) => i.status === 'sent' && remaining(i) > 0)
    .sort((a, b) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')))
    .map((i) => {
      const late = i.due_on && today && i.due_on < today ? daysBetween(i.due_on, today) : 0;
      const amount = moneyText(remaining(i), i.currency || 'GBP');
      const when = late ? `${late} ${late === 1 ? 'day' : 'days'} overdue` : i.due_on ? (i.due_on === today ? 'Due today' : `Due ${dayKeyWords(i.due_on)}`) : 'Sent';
      return { id: i.id, name: `${amount} owed`, sub: i.number != null ? `Invoice CLARITY-${i.number}` : 'Invoice', value: when, late: late > 0 };
    });
  const funder = versions.filter((v) => theirs.has(v.agreement_id) && isSigned(v) && v.funded_by)
    .sort((a, b) => String(b.client_signed_at || '').localeCompare(String(a.client_signed_at || '')))[0]?.funded_by || null;
  return { settled, owed, funder };
}

/** M28 "sent": the agreement's key facts beside its four statuses ("£750 /month", the dates, "12 sessions"). */
export function sentFacts(version, today = null) {
  const t = termsOf(version);
  const c = t.currency || 'GBP';
  const money = (minor, unit) => (Number(minor) > 0 ? { price: moneyText(Number(minor), c), unit } : null);
  const priced = (t.kind === 'retainer' && money(t.retainer?.feeMinor, '/month'))
    || (t.kind === 'team' && money(t.team?.totalMinor, 'in all'))
    || (t.kind === 'oneoff' && money(t.oneoff?.totalMinor, 'in all'))
    || (t.kind === 'hours' && money(t.hours?.blockMinor, `block at ${moneyText(Number(t.hours?.rateMinor) || 0, c)}/hour`))
    || (t.priceMode === 'monthly' && money(t.monthlyMinor, '/month'))
    || (t.priceMode === 'hourly' && money(t.rateMinor, '/hour'))
    || money(t.totalMinor, 'in all')
    || { price: null, unit: '' };
  // The year only where it isn't this one (writing rule 28), given today's day key; without one the year shows.
  const yr = (key) => !today || String(today).slice(0, 4) !== String(key).slice(0, 4);
  const dates = t.startsOn && t.endsOn ? `${dayKeyWords(t.startsOn, { year: today ? yr(t.startsOn) && String(t.startsOn).slice(0, 4) !== String(t.endsOn).slice(0, 4) : false })} to ${dayKeyWords(t.endsOn, { year: yr(t.endsOn) })}` : t.startsOn ? `From ${dayKeyWords(t.startsOn, { year: yr(t.startsOn) })}` : '';
  const n = sessionsIn(t) || 0;
  return { ...priced, dates, sessions: n > 0 ? `${n} ${n === 1 ? 'session' : 'sessions'}` : '' };
}

/** The line under the Sent page's title (M28 "sent"): when the coach signed, then what will show here. */
export function sentLead({ version, first, quote = null, clock }) {
  if (quote) return `${quote.status === 'accepted' ? `${first} accepted it` : `It went to ${first}`}. You’ll see here the moment ${first} opens and accepts it.`;
  const signedAt = version?.coach_signed_at || version?.sent_at;
  const when = signedAt && clock ? `You signed it at ${clock(signedAt)}. ` : '';
  if (isSigned(version)) return `${when}${first} has signed it.`.trim();
  return `${when}You’ll see here the moment ${first} opens, signs and settles it.`;
}

/** M28 "sent": the reminder line under the statuses. */
export const reminderLine = (first, signed) => (signed ? '' : `If ${first} hasn’t signed in 3 days, a reminder is drafted in Needs you for you to send.`);

/** The quote's eyebrow ("Quote Q-1042") or the agreement's ("Agreement, version 1"). */
export const sentLabel = (version, quote) => (quote ? `Quote ${quoteNumber(quote.number)}` : `Agreement, version ${version?.version || 1}`);

export { NOT_YET, addDays };
