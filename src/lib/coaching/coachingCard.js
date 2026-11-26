import { dayKeyWords } from '../time/index.js';
import { CURRENCY_LIST, moneyText } from '../agreements/currency.js';

// My Account's Coaching tab (Polish 1, example-pages-25nov.html "My Account", Coaching): the Your
// coaching card, from the client's current agreement as my_agreements() gives it (a funded client's
// has no money in it: the database cuts it). The agreement's name, the price with "/month" or "in
// total", then rows only: the dates and length, the coaching sessions with their length and rhythm,
// and what's included (the portal at its level, a Health Check, visit days, anything chosen).
// Clients invest and settle: nothing here says pay (agreements rule 2). Tested in
// tests/performance/coaching-card.test.mjs.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The sessions row: "18 coaching sessions, the first 90 minutes, then 60 minutes". */
export function sessionsWords(blocks) {
  const list = (Array.isArray(blocks) ? blocks : []).filter((b) => Number(b?.n) > 0 && Number(b?.minutes) > 0);
  if (!list.length) return null;
  const count = list.reduce((sum, b) => sum + Number(b.n), 0);
  const head = plural(count, 'coaching session', 'coaching sessions');
  if (list.length === 1) return `${head}, ${list[0].minutes} minutes`;
  if (list.length === 2 && Number(list[0].n) === 1) return `${head}, the first ${list[0].minutes} minutes, then ${list[1].minutes}`;
  return `${head}, ${list.map((b) => `${b.n} of ${b.minutes} minutes`).join(', ')}`;
}

/**
 * The card's parts, or null with no agreement. version: a tidied version (agreementRules.tidyVersion).
 * Returns { title, figure: { value, unit } | null, rows: [{ key, name, value }], to }.
 */
export function coachingCard(version, thisYear = new Date().getFullYear()) {
  if (!version) return null;
  const t = version.terms || {};
  const title = text(t.coaching) || 'Your coaching agreement';
  const currency = CURRENCY_LIST.includes(version.currency || t.currency) ? (version.currency || t.currency) : 'GBP';
  let figure = null;
  if (!version.fundedBy) {
    if (Number(t.monthlyMinor) > 0) figure = { value: moneyText(Number(t.monthlyMinor), currency), unit: '/month' };
    else if (Number(version.totalMinor ?? t.totalMinor) > 0) figure = { value: moneyText(Number(version.totalMinor ?? t.totalMinor), currency), unit: 'in total' };
  }
  const rows = [];
  if (DAY.test(t.startsOn || '') && DAY.test(t.endsOn || '')) {
    // A date this year never shows its year (writing rule 28): "Tue 24 Nov to Sat 1 May 2027" (requests-fx1 item 5).
    const other = (key) => Number(key.slice(0, 4)) !== Number(thisYear);
    rows.push({ key: 'dates', name: `${dayKeyWords(t.startsOn, { year: other(t.startsOn) })} to ${dayKeyWords(t.endsOn, { year: other(t.endsOn) })}`, value: Number(t.months) > 0 ? plural(Number(t.months), 'month', 'months') : null });
  }
  const sessions = sessionsWords(t.blocks);
  if (sessions) rows.push({ key: 'sessions', name: sessions, value: text(t.rhythm) || null });
  if (text(t.level)) rows.push({ key: 'portal', name: `The Clarity Portal, ${text(t.level)} level`, value: 'Included' });
  if (t.healthCheck) rows.push({ key: 'health', name: 'Strategic Alignment Health Check', value: 'Included' });
  if (Number(t.visitDays) > 0) rows.push({ key: 'visits', name: plural(Number(t.visitDays), 'visit day', 'visit days'), value: 'Included' });
  (Array.isArray(t.extrasChosen) ? t.extrasChosen : []).forEach((x, i) => {
    const name = text(typeof x === 'string' ? x : x?.name || x?.label);
    if (name) rows.push({ key: `extra:${i}`, name, value: 'Included' });
  });
  return { title, figure, rows, to: `/coaching/agreement/${version.id}` };
}
