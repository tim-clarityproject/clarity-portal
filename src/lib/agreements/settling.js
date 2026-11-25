import { addDays } from '../time/index.js';
import { instalments } from '../billing/money.js';
import { moneyText, rateText, lowerFirst, roundDeposit } from './currency.js';
import { planTotal, sessions } from './pricing.js';
import { kindOf, selfFunded } from './terms.js';
import { finalTotal, retainerUpfront, saving, sixUpFront, upfrontActive, UPFRONT_PERCENT } from './upfront.js';

// How an agreement is settled (brief items 4 and 8; M28's settleOpts, firstPay, payTitle and payRest). Four ways for
// set sessions: in full up front; a deposit of 30% (rounded to the nearest £100) then 5 monthly instalments; 6 equal
// monthly instalments; as delivered (each coaching session invoiced after it happens). A retainer monthly or as
// delivered; a team programme M28's three (risk 5); a one-off in full up front, or after the work with a 30% deposit;
// a block of hours in full, up front. The first payment is settled at signing (self-funded only). Instalments add up
// to the penny (the leftover goes on the first). Checked by tests/performance/agreements-settling.test.mjs.

export const DEPOSIT_SHARE = 0.3;
export const DEPOSIT_THEN = 5;
export const EQUAL_COUNT = 6;
export const TEAM_THEN = 3;

const cur = (t) => t?.currency || 'GBP';
const split = (total, count) => {
  if (!(total > 0)) return Array.from({ length: count }, () => 0);
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => each + (i === 0 ? total - each * count : 0));
};

/** The deposit for set sessions: 30% of the plan's total, to the nearest £100 (¥10,000 for yen; risk 26). */
export const deposit = (t, chosen) => roundDeposit(planTotal(t, chosen) * DEPOSIT_SHARE, cur(t));

/** Set sessions' four ways, with their words (M28's settleOpts): [{ value, label }]. */
export function settleOptions(t, chosen) {
  const c = cur(t);
  const f = planTotal(t, chosen);
  const n = sessions(t) || 1;
  const dep = deposit(t, chosen);
  const offer = t?.offerUpfront !== false && selfFunded(t);
  return [
    { value: 'full', label: `In full, up front, ${moneyText(offer ? Math.round(f * (100 - UPFRONT_PERCENT) / 100) : f, c)}${offer ? `, ${UPFRONT_PERCENT}% off` : ''}` },
    { value: 'deposit', label: `A deposit of ${moneyText(dep, c)}, then ${DEPOSIT_THEN} monthly instalments of ${moneyText(split(f - dep, DEPOSIT_THEN)[DEPOSIT_THEN - 1], c)}` },
    { value: 'equal', label: `${EQUAL_COUNT} monthly instalments of ${moneyText(split(f, EQUAL_COUNT)[EQUAL_COUNT - 1], c)}` },
    { value: 'delivered', label: `As delivered, ${moneyText(split(f, n)[n - 1], c)} a coaching session` },
  ];
}

/** A team programme's three ways (M28's tsettleOpts): a deposit of a third, then 3 instalments; 3 equal; in full. */
export function teamOptions(t) {
  const c = cur(t);
  const f = Number(t?.team?.totalMinor) || 0;
  const dep = roundDeposit(f / 3, c);
  return [
    { value: 'deposit', label: `A deposit of ${moneyText(dep, c)}, then ${TEAM_THEN} instalments of ${moneyText(split(f - dep, TEAM_THEN)[TEAM_THEN - 1], c)}` },
    { value: 'equal', label: `${TEAM_THEN} instalments of ${moneyText(split(f, TEAM_THEN)[TEAM_THEN - 1], c)}` },
    { value: 'full', label: `In full, up front, ${moneyText(f, c)}` },
  ];
}

/** What is settled at signing (M28's firstPay), in minor units. A client funded by an organisation settles nothing. */
export function firstPayment(t, choice = t?.choice ?? 'upfront', chosen) {
  if (!selfFunded(t)) return 0;
  const k = kindOf(t);
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    return retainerUpfront(t, choice) ? sixUpFront(fee) : fee;
  }
  if (k === 'oneoff') {
    const total = Number(t.oneoff?.totalMinor) || 0;
    return t.oneoff?.settle === 'after' ? roundDeposit(total * DEPOSIT_SHARE, cur(t)) : total;
  }
  if (k === 'hours') return Number(t.hours?.blockMinor) || 0;
  if (k === 'team') return 0;
  const pf = planTotal(t, chosen);
  if (upfrontActive(t, choice)) return finalTotal(t, choice, chosen);
  if (t.settle === 'full') return pf;
  if (t.settle === 'deposit') return deposit(t, chosen);
  if (t.settle === 'delivered') return split(pf, sessions(t) || 1)[0];
  return split(pf, EQUAL_COUNT)[0];
}

/** The settle step's title (M28's payTitle). */
export function payTitle(t, choice = t?.choice ?? 'upfront') {
  const k = kindOf(t);
  if (k === 'retainer') return retainerUpfront(t, choice) ? 'Six months up front' : 'Your first month';
  if (k === 'oneoff') return t.oneoff?.settle === 'after' ? 'Your deposit' : 'Your investment';
  if (k === 'hours') return 'Your investment';
  if (upfrontActive(t, choice)) return 'Your investment';
  return { full: 'Your investment', deposit: 'Your deposit', equal: 'First instalment', delivered: 'First coaching session' }[t.settle] || 'Your investment';
}

/** The line under the first payment: what follows (M28's payRest). */
export function restLine(t, choice = t?.choice ?? 'upfront', chosen) {
  const c = cur(t);
  const k = kindOf(t);
  if (k === 'retainer') {
    const fee = rateText(Number(t.retainer?.feeMinor) || 0, 'month', c);
    return retainerUpfront(t, choice) ? `Then ${fee} from month 7.` : `Then ${fee}, invoiced as agreed.`;
  }
  // M28's "The rest is invoiced as agreed." where something follows; where nothing does (a one-off or a block of hours
  // settled in full), no line at all (UI finding 7).
  if (k === 'oneoff') return t.oneoff?.settle === 'after' ? 'The rest is invoiced as agreed.' : '';
  if (k === 'hours') return '';
  if (k === 'team') return 'The rest is invoiced as agreed.';
  const pf = planTotal(t, chosen);
  if (upfrontActive(t, choice)) return `Nothing more to settle. You saved ${moneyText(saving(pf), c)}.`;
  if (t.settle === 'full') return 'Nothing more to settle.';
  if (t.settle === 'deposit') return `Then ${DEPOSIT_THEN} monthly instalments of ${moneyText(split(pf - deposit(t, chosen), DEPOSIT_THEN)[DEPOSIT_THEN - 1], c)}, collected the same way.`;
  if (t.settle === 'equal') return `Then ${EQUAL_COUNT - 1} more monthly instalments of ${moneyText(split(pf, EQUAL_COUNT)[EQUAL_COUNT - 1], c)}, collected the same way.`;
  return 'Then each coaching session is invoiced after it happens.';
}

/** Whether something is left to settle after the first payment (M28's hasRest: "You can set up Direct Debit for the rest"). */
export function hasRest(t, choice = t?.choice ?? 'upfront', chosen) {
  if (!selfFunded(t)) return false;
  const k = kindOf(t);
  if (k === 'retainer') return true;
  if (k === 'hours') return false;
  if (k === 'oneoff') return t.oneoff?.settle === 'after';
  return !upfrontActive(t, choice) && t.settle !== 'full';
}

/** "£15,300, in 6 monthly instalments of £2,550" and the like: the investment as the agreement says it (M28's investText). */
export function investmentWords(t, choice = t?.choice ?? 'upfront', chosen) {
  const c = cur(t);
  const k = kindOf(t);
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    return retainerUpfront(t, choice)
      ? `${moneyText(sixUpFront(fee), c)} for the first 6 months, settled up front with ${UPFRONT_PERCENT}% off, then ${rateText(fee, 'month', c)}`
      : `${rateText(fee, 'month', c)}, ${t.retainer?.invoice === 'delivered' ? 'invoiced as coaching sessions happen' : 'invoiced monthly'}`;
  }
  if (k === 'oneoff') {
    const total = Number(t.oneoff?.totalMinor) || 0;
    return t.oneoff?.settle === 'after'
      ? `${moneyText(total, c)}, in full, after the work, with a deposit of ${moneyText(firstPayment(t, choice), c)} when you sign`
      : `${moneyText(total, c)}, in full, up front`;
  }
  if (k === 'hours') return `${moneyText(Number(t.hours?.blockMinor) || 0, c)}, settled in full, up front`;
  if (k === 'team') {
    const o = teamOptions(t).find((x) => x.value === t.team?.settle) || teamOptions(t)[0];
    return `${moneyText(Number(t.team?.totalMinor) || 0, c)}: ${lowerFirst(o.label)}`;
  }
  const f = finalTotal(t, choice, chosen);
  if (upfrontActive(t, choice)) return `${moneyText(f, c)}, in full, up front, with ${UPFRONT_PERCENT}% off`;
  if (t.settle === 'full') return `${moneyText(f, c)}, in full, up front`;
  const o = settleOptions(t, chosen).find((x) => x.value === t.settle);
  if (t.settle === 'equal') return `${moneyText(f, c)}, in ${lowerFirst(o.label)}`;
  if (t.settle === 'delivered') return `${moneyText(f, c)}, ${lowerFirst(o.label).replace(/^as delivered,/, 'invoiced as delivered at')}`;
  return `${moneyText(f, c)}, ${lowerFirst(o.label)}`;
}

/**
 * The invoices an agreement makes, in order, from its signing day: [{ n, of, day, amount, kind }]. `kind` is the
 * invoice's own kind (065: first_payment, deposit, instalment). As delivered drafts one per coaching session after it
 * happens (delivered.js), so only its first is here. A retainer lists its first 6 months. Nothing for a client funded by
 * an organisation (the organisation is invoiced from its own profile).
 */
export function schedule(t, { signedDay, choice = t?.choice ?? 'upfront', chosen } = {}) {
  if (!signedDay || !selfFunded(t)) return [];
  const k = kindOf(t);
  const nextMonth = instalments({ total: 2, count: 2, firstDay: signedDay })[1].day;
  const monthly = (total, count, from, startN, of, kind) => (total > 0
    ? instalments({ total, count, firstDay: from }).map((x, i) => ({ n: startN + i, of, day: x.day, amount: x.amount, kind: i === 0 && startN === 1 ? 'first_payment' : kind }))
    : []);
  if (k === 'hours') return [{ n: 1, of: 1, day: signedDay, amount: firstPayment(t, choice), kind: 'first_payment' }];
  if (k === 'oneoff') {
    const total = Number(t.oneoff?.totalMinor) || 0;
    if (t.oneoff?.settle !== 'after') return [{ n: 1, of: 1, day: signedDay, amount: total, kind: 'first_payment' }];
    const dep = firstPayment(t, choice);
    return [{ n: 1, of: 2, day: signedDay, amount: dep, kind: 'deposit' }, { n: 2, of: 2, day: t.oneoff?.on && t.oneoff.on > signedDay ? t.oneoff.on : signedDay, amount: total - dep, kind: 'instalment' }];
  }
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    if (retainerUpfront(t, choice)) {
      const later = fee > 0 ? instalments({ total: fee * 6, count: 6, firstDay: addMonths(signedDay, 6) }).map((x, i) => ({ n: 2 + i, of: 7, day: x.day, amount: fee, kind: 'instalment' })) : [];
      return [{ n: 1, of: 7, day: signedDay, amount: sixUpFront(fee), kind: 'first_payment' }, ...later];
    }
    if (t.retainer?.invoice === 'delivered') return [{ n: 1, of: 1, day: signedDay, amount: fee, kind: 'first_payment' }];
    return monthly(fee * 6, 6, signedDay, 1, 6, 'instalment').map((x) => ({ ...x, amount: fee }));
  }
  if (k === 'team') return [];
  const pf = planTotal(t, chosen);
  if (upfrontActive(t, choice) || t.settle === 'full') return [{ n: 1, of: 1, day: signedDay, amount: firstPayment(t, choice, chosen), kind: 'first_payment' }];
  if (t.settle === 'deposit') {
    const dep = deposit(t, chosen);
    return [{ n: 1, of: 1 + DEPOSIT_THEN, day: signedDay, amount: dep, kind: 'deposit' }, ...monthly(pf - dep, DEPOSIT_THEN, nextMonth, 2, 1 + DEPOSIT_THEN, 'instalment')];
  }
  if (t.settle === 'delivered') return [{ n: 1, of: sessions(t) || 1, day: signedDay, amount: firstPayment(t, choice, chosen), kind: 'first_payment' }];
  return monthly(pf, EQUAL_COUNT, signedDay, 1, EQUAL_COUNT, 'instalment');
}

/** A day key some calendar months on (the month's last day when it is shorter). */
export function addMonths(day, months) {
  const [y, m, d] = String(day).split('-').map(Number);
  const mm = m - 1 + months;
  const yy = y + Math.floor(mm / 12);
  const month = ((mm % 12) + 12) % 12 + 1;
  const last = new Date(Date.UTC(yy, month, 0)).getUTCDate();
  return `${yy}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
