import { addDays, dayKeyWords } from '../time/index.js';
import { hoursFigure, moneyText, rateText } from './currency.js';

// Invoicing an organisation (brief items 25 to 28 and 34; M28's s-org-billing, s-inv-new, s-inv-pdf, s-inv-sent): from
// logged coaching sessions or hours (untick any to leave off), at the hourly rate from its sponsor agreement or its
// billing profile (editable on any invoice), addressed to it, quoting the PO, supplier number and reference, due by its
// terms, settled by bank transfer quoting the invoice number. One PDF: the invoice, a timesheet page where asked, then
// each attachment. It won't send while the profile's needs aren't met, each with a calm message.
// Checked by tests/performance/agreements-org-invoice.test.mjs.

/** The hourly rate: what the coach typed on this invoice, else the sponsor agreement's, else the profile's. */
export function rate(profile, sponsorTerms, typed) {
  if (typed != null && Number(typed) > 0) return Math.round(Number(typed));
  const fromSponsor = Number(sponsorTerms?.rateMinor ?? sponsorTerms?.hourlyRateMinor);
  if (fromSponsor > 0) return fromSponsor;
  return Number(profile?.hourly_rate_minor) > 0 ? Number(profile.hourly_rate_minor) : 0;
}

/** The ticked rows: [{ key, minutes, ... }] with { [key]: true } ticks (every row ticked to start with). */
export const rows = (all, ticked) => (all || []).filter((r) => ticked?.[r.key] !== false);
export const minutesOf = (list) => (list || []).reduce((a, r) => a + (Number(r.minutes) || 0), 0);
/** Total in minor units: £300/hr for 300 minutes → £1,500. */
export const total = (list, rateMinor) => Math.round(minutesOf(list) * (Number(rateMinor) || 0) / 60);
export const dueOn = (today, termsDays = 30) => addDays(today, Number(termsDays) || 30);

/** "Logged since the last invoice, at £300/hr. Untick to leave off." */
export const introLine = (rateMinor, c = 'GBP') => `Logged since the last invoice, at ${rateText(rateMinor, 'hour', c)}. Untick to leave off.`;
/** "5 hours, so £1,500. Due within 30 days." */
export const totalLine = (list, rateMinor, termsDays = 30, c = 'GBP') => `${hoursFigure(minutesOf(list))}, so ${moneyText(total(list, rateMinor), c)}. Due within ${termsDays} days.`;
/** "Cymru Active needs evidence, such as a screenshot of your hours." */
export const evidenceHint = (orgName) => `${orgName} needs evidence, such as a screenshot of your hours.`;

export const NONE_TICKED = 'Tick at least one coaching session.';
/** What stops it being sent, in M28's words, the first first: [] when it can go. */
export function problems({ orgName, profile = {}, rows: ticked = [], poNumber = '', evidence = [] }) {
  const out = [];
  if (!ticked.length) out.push(NONE_TICKED);
  if (profile.needs_po && !String(poNumber || '').trim()) out.push(`${orgName} needs a purchase order on the invoice. Add the PO number first.`);
  if (profile.evidence_required && !(evidence || []).length) out.push(`Add the screenshot of your hours first. ${orgName} won’t accept the invoice without it.`);
  return out;
}

/** Pages in the one PDF: the invoice, a timesheet page where asked, then one page an attachment (as M28 counts). */
export const pageCount = ({ timesheet = false, attachments = 0 }) => 1 + (timesheet ? 1 : 0) + Math.max(0, Number(attachments) || 0);
export const pageWords = (n) => `${n} ${n === 1 ? 'page' : 'pages'}`;
/** "Invoice CLARITY-1251, Cymru Active, 25 Nov 2026.pdf" (PDF rule: named in words). */
export function fileName({ number, orgName, day }) {
  const words = dayKeyWords(day, { year: true }).replace(/^[A-Z][a-z]{2} /, '');
  return `Invoice CLARITY-${number}, ${String(orgName || '').replace(/[\\/:*?"<>|]/g, '')}, ${words}.pdf`;
}
/** The line on the invoice: "Coaching for Elite Football League, 4 coaching sessions, 3 to 24 Nov 2026 (timesheet on page 2)". */
export function descriptionLine({ orgName, count, firstDay, lastDay, timesheet }) {
  const words = (d) => dayKeyWords(d, { year: true }).replace(/^[A-Z][a-z]{2} /, '').split(' ');
  const [ad, am, ay] = words(firstDay);
  const b = words(lastDay).join(' ');
  const span = firstDay === lastDay ? b : ay === b.split(' ')[2] && am === b.split(' ')[1] ? `${ad} to ${b}` : ay === b.split(' ')[2] ? `${ad} ${am} to ${b}` : `${ad} ${am} ${ay} to ${b}`;
  return `Coaching for ${orgName}, ${count} coaching ${count === 1 ? 'session' : 'sessions'}, ${span}${timesheet ? ' (timesheet on page 2)' : ''}`;
}
