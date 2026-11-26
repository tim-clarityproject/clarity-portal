import { hoursWords, moneyText, rateText } from './currency.js';

// A block of hours (brief item 24; M28's s-b-hours, s-h-log, s-h-client, s-n-hours): what is being built, the hourly
// rate, the block in money (the hours worked out from it), and the time logged against it with a running balance. At
// 80% used, a line in the coach's Needs you with a top-up invoice drafted; nothing goes to the client by itself.
// Checked by tests/performance/agreements-hours.test.mjs.

export const TELL_AT = 0.8;

/** The block in minutes: £2,000 at £150/hr → 800 (13 hours 20 minutes). Whole minutes, rounded down. */
export function blockMinutes(blockMinor, rateMinor) {
  const rate = Number(rateMinor) || 0;
  return rate > 0 ? Math.floor((Number(blockMinor) || 0) * 60 / rate) : 0;
}

/** Minutes logged: entries are { minutes } or time_entries rows ({ started_at, ended_at }). */
export function entryMinutes(e) {
  if (Number.isFinite(Number(e?.minutes))) return Math.max(0, Math.round(Number(e.minutes)));
  const a = Date.parse(e?.started_at);
  const b = Date.parse(e?.ended_at);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : 0;
}
export const used = (entries) => (entries || []).reduce((a, e) => a + entryMinutes(e), 0);

/** "10 hours 40 minutes used of 13 hours 20 minutes, 2 hours 40 minutes left." or "… used, 30 minutes over the block." */
export function balanceLine(usedMinutes, block) {
  const u = Math.max(0, Math.round(usedMinutes));
  if (u <= block) return `${hoursWords(u)} used of ${hoursWords(block)}, ${hoursWords(block - u)} left.`;
  return `${hoursWords(u)} used, ${hoursWords(u - block)} over the block.`;
}

/** Whether the block is 80% used or more (the Needs you line). */
export const at80 = (usedMinutes, block) => block > 0 && usedMinutes / block >= TELL_AT;
/** The share used, as a whole percentage (M28's "Adie's block is 80% used"). */
export const percentUsed = (usedMinutes, block) => (block > 0 ? Math.round((usedMinutes / block) * 100) : 0);

/** "2 hours", "3 hours 10 minutes": a length in full words (26 Oct rule 8: never "h"; P9, Polish 1, over M28's "2 h 00"). */
export const entryLength = (minutes) => hoursWords(minutes);

/** "£2,000 at £150/hr" and "That's 13 hours 20 minutes, settled in full, up front." */
export const blockShort = (h, c = 'GBP') => `${moneyText(Number(h?.blockMinor) || 0, c)} at ${rateText(Number(h?.rateMinor) || 0, 'hour', c)}`;
export const blockLine = (h) => `That’s ${hoursWords(blockMinutes(h?.blockMinor, h?.rateMinor))}, settled in full, up front.`;

/** The top-up invoice drafted at 80%: another block at the same rate, one line. */
export function topUp(t) {
  const h = t?.hours || {};
  const amount = Number(h.blockMinor) || 0;
  return { kind: 'top_up', amount, lines: [{ description: `${h.work || 'Block of hours'}: another block of ${hoursWords(blockMinutes(amount, h.rateMinor))}`, amount }] };
}
