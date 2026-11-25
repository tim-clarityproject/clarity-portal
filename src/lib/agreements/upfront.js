import { moneyText, rateText } from './currency.js';
import { planTotal } from './pricing.js';
import { kindOf, selfFunded } from './terms.js';

// Settling up front earns 5% off, automatically (brief item 37; Tim, 25 Nov, 12:42). Set sessions in instalments
// offer "Up front, 5% off" as the client's choice; a monthly retainer offers "6 months up front, 5% off" (6 × the fee ×
// 0.95). Up front is shown first and chosen to start with. The coach can switch the offer off per agreement; a client
// funded by an organisation never has the choice. Checked by tests/performance/agreements-upfront.test.mjs.

export const UPFRONT_PERCENT = 5;
const keep = (100 - UPFRONT_PERCENT) / 100;

/** Whether the client chooses between up front and the plan (M28's canChoose). */
export function canChoose(t) {
  if (t?.offerUpfront === false || !selfFunded(t)) return false;
  const k = kindOf(t);
  return k === 'retainer' || (k === 'sessions' && t.settle !== 'full');
}

/** Whether set sessions are settled up front with 5% off: in full with the offer on, or up front chosen (M28's upAct). */
export function upfrontActive(t, choice = t?.choice ?? 'upfront') {
  if (kindOf(t) !== 'sessions' || t?.offerUpfront === false || !selfFunded(t)) return false;
  return t.settle === 'full' || choice === 'upfront';
}
/** Whether a retainer's 6 months are settled up front (M28's retUp). */
export const retainerUpfront = (t, choice = t?.choice ?? 'upfront') => kindOf(t) === 'retainer' && canChoose(t) && choice === 'upfront';

export const upfrontTotal = (minor) => Math.round(minor * keep);
export const saving = (minor) => minor - upfrontTotal(minor);
/** Six months of a retainer up front: £3,000 → £17,100. */
export const sixUpFront = (feeMinor) => Math.round(feeMinor * 6 * keep);

/** What the client invests for set sessions: the plan's total, with 5% off when up front applies. */
export function finalTotal(t, choice = t?.choice ?? 'upfront', chosen) {
  const pf = planTotal(t, chosen);
  return upfrontActive(t, choice) ? upfrontTotal(pf) : pf;
}

/**
 * The choice as the quote and the signing block show it, up front first and chosen to start with:
 * [{ value: 'upfront', label: 'Up front, £14,535, 5% off' }, { value: 'plan', label: <the settling option's words> }].
 * `planLabel` is the settling option's own label (settling.js), so the two never disagree.
 */
export function choiceOptions(t, planLabel, chosen) {
  if (!canChoose(t)) return [];
  const cur = t.currency || 'GBP';
  if (kindOf(t) === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    return [
      { value: 'upfront', label: `6 months up front, ${moneyText(sixUpFront(fee), cur)}, ${UPFRONT_PERCENT}% off` },
      { value: 'plan', label: rateText(fee, 'month', cur) },
    ];
  }
  return [
    { value: 'upfront', label: `Up front, ${moneyText(upfrontTotal(planTotal(t, chosen)), cur)}, ${UPFRONT_PERCENT}% off` },
    { value: 'plan', label: planLabel || '' },
  ];
}

/** "Up front: £14,535, saving £765." or "6 months up front: £17,100, saving £900." (M28's upfrontLine). */
export function upfrontLine(t, chosen) {
  const cur = t.currency || 'GBP';
  if (kindOf(t) === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    return `6 months up front: ${moneyText(sixUpFront(fee), cur)}, saving ${moneyText(fee * 6 - sixUpFront(fee), cur)}.`;
  }
  const pf = planTotal(t, chosen);
  return `Up front: ${moneyText(upfrontTotal(pf), cur)}, saving ${moneyText(saving(pf), cur)}.`;
}
