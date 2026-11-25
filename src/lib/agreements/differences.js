import { moneyText, rateText } from './currency.js';
import { buildClauses, clauseTitle } from './clauses.js';
import { blocksText, discountLines, mixedLengths, planTotal } from './pricing.js';
import { DEFAULT_EXPIRY_DAYS, DUE_DAYS, kindOf, NOTICE_HOURS, selfFunded } from './terms.js';

// Check before sending lists every difference from the standard (brief item 18; M28's unusual()): edited clauses,
// discounts, mixed coaching session lengths, pricing by the hour or month, visit days, funding by an organisation,
// notice, due days, expiry, pausing off, and a retainer invoiced as delivered. Each row: { label, detail, where,
// clauseKey } where `where` is 'clause' (opens that clause) or 'builder' (the builder's own part).
// Checked by tests/performance/agreements-differences.test.mjs.

export const NOTHING_LINE = 'Nothing. It uses your standard wording and package.';

export function differences(t, { overrides = {}, standards = {}, clientFirst = t?.clientFirst || 'them' } = {}) {
  const rows = [];
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  for (const cl of buildClauses(t, { overrides, standards })) {
    if (cl.edited) rows.push({ label: clauseTitle(cl), detail: `Edited for ${clientFirst}`, where: 'clause', clauseKey: cl.key });
  }
  if (k === 'sessions') {
    const total = planTotal(t);
    for (const d of discountLines(t)) rows.push({ label: d.label, detail: `${moneyText(d.amount, c)}, so ${moneyText(total, c)} in all`, where: 'builder' });
    if (mixedLengths(t)) rows.push({ label: 'Coaching session lengths', detail: blocksText(t.blocks), where: 'builder' });
    if (t.priceMode === 'hourly') rows.push({ label: 'Priced', detail: `By the hour, ${rateText(t.rateMinor || 0, 'hour', c)}`, where: 'builder' });
    if (t.priceMode === 'monthly') rows.push({ label: 'Priced', detail: `Monthly, ${rateText(t.monthlyMinor || 0, 'month', c)}`, where: 'builder' });
    if (t.visitDays?.n) rows.push({ label: 'Visit days', detail: `${t.visitDays.n} days at ${moneyText(t.visitDays.rateMinor || 0, c)}`, where: 'builder' });
    if (!selfFunded(t)) rows.push({ label: 'Funded by', detail: t.fundedBy || t.orgName || '', where: 'builder' });
  }
  if (k === 'retainer' && t.retainer?.invoice === 'delivered') rows.push({ label: 'Invoiced as delivered', detail: 'Drafted after coaching sessions happen', where: 'builder' });
  if (Number(t.noticeHours ?? NOTICE_HOURS) !== NOTICE_HOURS) rows.push({ label: 'Rearranging notice', detail: `${t.noticeHours} hours`, where: 'builder' });
  if (Number(t.dueDays ?? DUE_DAYS) !== DUE_DAYS) rows.push({ label: 'Invoices due within', detail: `${t.dueDays} days`, where: 'builder' });
  if (Number(t.expiryDays ?? DEFAULT_EXPIRY_DAYS) !== DEFAULT_EXPIRY_DAYS) rows.push({ label: 'Offer runs out after', detail: `${t.expiryDays} days`, where: 'builder' });
  if (t.pausing === false) rows.push({ label: 'Pausing', detail: 'Not allowed', where: 'builder' });
  return rows;
}

/** "1 clause edited for Sam: 4. Rearranging and cancelling" or "No changes" (M28's wordingLine). */
export function wordingLine(t, { overrides = {}, standards = {}, clientFirst = t?.clientFirst || 'them' } = {}) {
  const e = buildClauses(t, { overrides, standards }).filter((c) => c.edited);
  if (!e.length) return 'No changes';
  return `${e.length} ${e.length === 1 ? 'clause' : 'clauses'} edited for ${clientFirst}: ${e.map(clauseTitle).join(', ')}`;
}
