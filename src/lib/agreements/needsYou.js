import { daysBetween, dayKeyWords } from '../time/index.js';
import { hoursWords, moneyText, rateText } from './currency.js';
import { renewalLine } from './renewals.js';

// Needs you on Today (brief items 4, 10, 23, 24, 28, 40, 41, 43; M28's needs(); risk 11): every drafted next step, each
// sending nothing by itself, with Undo. Each item is built from facts the page already holds; its key names it in
// 065's needs_you_done (Done, or Not now until a day), so two tabs and Undo agree. The lines are M28's.
// An item: { key, kind, title, line, when, go, data }. Checked by tests/performance/agreements-needs-you.test.mjs.

export const EMPTY_LINE = 'Nothing needs you right now.';
export const ORDER = Object.freeze(['delivered', 'sign_reminder', 'first_payment', 'hours', 'approval', 'overdue', 'po', 'portal', 'price', 'renew', 'change', 'fx']);

/** "Today", "Yesterday", a weekday within the week ("Mon"), else "Tue 17 Nov". */
export function whenWords(day, today) {
  if (!day || !today) return '';
  const d = daysBetween(day, today);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return dayKeyWords(day).slice(0, 3);
  return dayKeyWords(day, { year: true, today });
}
const item = (kind, id, title, line, day, today, go, data = {}) => ({ key: `${kind}:${id}`, kind, title, line, when: whenWords(day, today), day, go, data });
const s = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const deliveredItem = ({ agreementId, name, count, amountMinor, currency = 'GBP', day, today }) =>
  item('delivered', agreementId, `Invoice ready for ${name}`, `${s(count, 'coaching session', 'coaching sessions')} since the last one, ${moneyText(amountMinor, currency)}`, day, today, 'delivered', { agreementId });
export const signReminderItem = ({ versionId, name, version, sentDay, day, today }) =>
  item('sign_reminder', versionId, `Reminder ready for ${name}`, `Hasn’t signed version ${version}, sent ${s(daysBetween(sentDay, today), 'day', 'days')} ago`, day, today, 'sign_reminder', { versionId });
export const firstPaymentItem = ({ versionId, firstName, day, today }) =>
  item('first_payment', versionId, `${firstName} signed, and the first payment isn’t settled yet.`, 'A reminder is drafted for you to send', day, today, 'first_payment', { versionId });
export const hoursItem = ({ agreementId, firstName, usedMinutes, blockMinutes, day, today }) =>
  item('hours', agreementId, `${firstName}’s block is ${Math.round((usedMinutes / blockMinutes) * 100)}% used`, `${hoursWords(usedMinutes)} of ${hoursWords(blockMinutes)}`, day, today, 'hours', { agreementId });
export const approvalItem = ({ agreementId, coachName, clientName, coaching, day, today }) =>
  item('approval', agreementId, `${coachName} made an agreement for you to approve`, `${clientName}, ${coaching}`, day, today, 'approval', { agreementId });
export const overdueItem = ({ invoiceId, name, number, amountMinor, currency = 'GBP', daysOverdue, day, today }) =>
  item('overdue', invoiceId, `Reminder ready for ${name}`, `CLARITY-${number}, ${moneyText(amountMinor, currency)}, ${s(daysOverdue, 'day', 'days')} overdue`, day, today, 'overdue', { invoiceId });
export const poItem = ({ organisationId, orgName, number, day, today }) =>
  item('po', organisationId, `${orgName} needs a purchase order`, `Invoice CLARITY-${number} is waiting`, day, today, 'po', { organisationId });
export const portalItem = ({ invoiceId, number, orgName, day, today }) =>
  item('portal', invoiceId, `Upload CLARITY-${number} to ${orgName}’s supplier portal`, 'Sent by email today; they also want it on their portal', day, today, 'portal', { invoiceId });
export const priceItem = ({ agreementId, name, feeMinor, currency = 'GBP', sinceDay, dueDay, day, today }) =>
  item('price', agreementId, `Yearly price review for ${name}`, `Retainer, ${rateText(feeMinor, 'month', currency)} since ${dayKeyWords(sinceDay, { year: true }).replace(/^[A-Z][a-z]{2} \d{1,2} /, '')}, review due ${dayKeyWords(dueDay)}`, day, today, 'price', { agreementId });
export const renewItem = ({ agreementId, name, endDay, day, today }) =>
  item('renew', agreementId, `Offer ${name} the next 6 months`, renewalLine(endDay), day, today, 'renew', { agreementId });
export const changeItem = ({ requestId, name, clauseTitle, day, today }) =>
  item('change', requestId, `${name} asked for a change to their agreement`, clauseTitle, day, today, 'change', { requestId });
export const fxItem = ({ agreementId, name, currency, fallPercent, day, today }) =>
  item('fx', agreementId, `The pound value of ${name}’s next invoice is down ${fallPercent}%`, `${currency} has moved since signing, so check the next term’s price`, day, today, 'fx', { agreementId });

/**
 * The items still to show: not Done, and not put off until a day still to come (needs_you_done rows), in M28's order,
 * the newest first within a kind.
 */
export function visible(items, doneRows = [], today) {
  const byKey = new Map((doneRows || []).map((r) => [r.item_key, r]));
  return (items || []).filter((i) => {
    const d = byKey.get(i.key);
    if (!d) return true;
    if (d.state === 'done') return false;
    return Boolean(d.until && today && d.until <= today);
  }).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || String(b.day || '').localeCompare(String(a.day || '')));
}

/** The row saved for Done or Not now (065's needs_you_done; the store keys it by coach and item). */
export const doneRow = (coachId, key, { state = 'done', until = null } = {}) => ({ coach_id: coachId, item_key: key, state, until, at: new Date().toISOString() });
