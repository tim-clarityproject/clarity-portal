import { addDays, dayIn, daysBetween } from '../time/index.js';
import { parseDbTimestamp } from '../dateFormatter.js';
import { instalments } from '../billing/money.js';
import { moneyText, rateText, lowerFirst, roundDeposit } from './currency.js';
import { extrasTotal, planTotal, sessions } from './pricing.js';
import { kindOf, selfFunded } from './terms.js';
import { finalTotal, retainerUpfront, saving, sixUpFront, upfrontActive, UPFRONT_PERCENT } from './upfront.js';
import { perSession, withoutExtras } from './delivered.js';

// How an agreement is settled (brief items 4 and 8; M28's settleOpts, firstPay, payTitle and payRest). Four ways for
// set sessions: in full up front; a deposit of 30% (rounded to the nearest £100) then 5 monthly instalments; 6 equal
// monthly instalments; as delivered (each coaching session invoiced after it happens). A retainer monthly or as
// delivered; a team programme M28's three (risk 5); a one-off in full up front, or after the work with a 30% deposit;
// a block of hours in full, up front. The first payment is settled at signing (self-funded only). Instalments add up
// to the penny (the leftover goes on the first). Checked by tests/performance/agreements-settling.test.mjs.

export const DEPOSIT_SHARE = 0.3;
export const DEPOSIT_THEN = 5;
export const EQUAL_COUNT = 6;
/**
 * How many equal monthly instalments: 6, or one for each month of the term when the fee is set by the month (M28
 * version 6: "Monthly, by Direct Debit" over 3, 6 or 12 months; Polish 1, Stage C).
 */
export const equalCount = (t) => (t?.priceMode === 'monthly' && Number(t?.months) >= 1 ? Math.min(60, Math.floor(Number(t.months))) : EQUAL_COUNT);
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
    { value: 'equal', label: `${equalCount(t)} monthly instalments of ${moneyText(split(f, equalCount(t))[equalCount(t) - 1], c)}` },
    { value: 'delivered', label: `As delivered, ${moneyText(perSession(t), c)} a coaching session` },
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

/**
 * The first invoice's amount, however it is funded: for a self-funded client it is settled at signing; for one funded by
 * an organisation it is the organisation's first invoice, drafted on the signing day (agreements rule 12). Ticked extras
 * are settled with it for a retainer, a one-off and a block of hours (set sessions carry them in the plan's total; as
 * delivered, each at its own price with the first session).
 */
export function firstAmount(t, choice = t?.choice ?? 'upfront', chosen) {
  const k = kindOf(t);
  const ex = extrasTotal(t, chosen);
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    return (retainerUpfront(t, choice) ? sixUpFront(fee) : fee) + ex;
  }
  if (k === 'oneoff') {
    const total = Number(t.oneoff?.totalMinor) || 0;
    return (t.oneoff?.settle === 'after' ? roundDeposit(total * DEPOSIT_SHARE, cur(t)) : total) + ex;
  }
  if (k === 'hours') return (Number(t.hours?.blockMinor) || 0) + ex;
  if (k === 'team') {
    const f = (Number(t.team?.totalMinor) || 0) + ex;
    if (t.team?.settle === 'full') return f;
    if (t.team?.settle === 'equal') return split(f, TEAM_THEN)[0];
    return roundDeposit(f / 3, cur(t));
  }
  const pf = planTotal(t, chosen);
  if (upfrontActive(t, choice)) return finalTotal(t, choice, chosen);
  if (t.settle === 'full') return pf;
  if (t.settle === 'deposit') return deposit(t, chosen);
  if (t.settle === 'delivered') return split(withoutExtras(t), sessions(t) || 1)[0] + ex;
  return split(pf, equalCount(t))[0];
}

/** What is settled at signing (M28's firstPay), in minor units. A client funded by an organisation settles nothing. */
export function firstPayment(t, choice = t?.choice ?? 'upfront', chosen) {
  if (!selfFunded(t)) return 0;
  if (kindOf(t) === 'team') return 0;
  return firstAmount(t, choice, chosen);
}

/**
 * What the agreement is for in all, as its version's total_minor keeps it, with the client's choice and extras:
 * set sessions their total (5% off up front), a retainer its first term (6 months, or 6 months up front), the rest
 * their price; ticked extras on top where they aren't in the plan already.
 */
export function agreementTotal(t, choice = t?.choice ?? 'upfront', chosen) {
  const k = kindOf(t);
  const ex = extrasTotal(t, chosen);
  if (k === 'retainer') { const fee = Number(t.retainer?.feeMinor) || 0; return (retainerUpfront(t, choice) ? sixUpFront(fee) : fee * 6) + ex; }
  if (k === 'team') return (Number(t.team?.totalMinor) || 0) + ex;
  if (k === 'oneoff') return (Number(t.oneoff?.totalMinor) || 0) + ex;
  if (k === 'hours') return (Number(t.hours?.blockMinor) || 0) + ex;
  return finalTotal(t, choice, chosen);
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
  if (t.settle === 'equal') return `Then ${equalCount(t) - 1} more monthly instalments of ${moneyText(split(pf, equalCount(t))[equalCount(t) - 1], c)}, collected the same way.`;
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
 * The invoices an agreement's terms make, in order, from its first signing day: [{ n, of, day, amount, kind }]. `kind`
 * is the invoice's own kind (065: first_payment, deposit, instalment); `of` is null for a retainer, which renews in
 * 6-month terms and goes on month after month (brief item 39) up to `until` (a day key; without it, its first term).
 * As delivered drafts one invoice per coaching session after it happens (delivered.js), so only its first is here. A
 * client funded by an organisation has the same schedule with no 5% (the organisation's invoices; agreements rule 12);
 * a team programme M28's three ways. The first (n 1) is the first payment settled at signing when self-funded.
 */
export function schedule(t, { signedDay, choice = t?.choice ?? 'upfront', chosen, until = null } = {}) {
  if (!signedDay) return [];
  const k = kindOf(t);
  const nextMonth = addMonths(signedDay, 1);
  const monthly = (total, count, from, startN, of, kind) => (total > 0
    ? instalments({ total, count, firstDay: from }).map((x, i) => ({ n: startN + i, of, day: x.day, amount: x.amount, kind: i === 0 && startN === 1 ? 'first_payment' : kind }))
    : []);
  const first = firstAmount(t, choice, chosen);
  if (k === 'hours') return [{ n: 1, of: 1, day: signedDay, amount: first, kind: 'first_payment' }];
  if (k === 'oneoff') {
    const total = (Number(t.oneoff?.totalMinor) || 0) + extrasTotal(t, chosen);
    if (t.oneoff?.settle !== 'after') return [{ n: 1, of: 1, day: signedDay, amount: first, kind: 'first_payment' }];
    return [{ n: 1, of: 2, day: signedDay, amount: first, kind: 'deposit' }, { n: 2, of: 2, day: t.oneoff?.on && t.oneoff.on > signedDay ? t.oneoff.on : signedDay, amount: total - first, kind: 'instalment' }];
  }
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    const up = retainerUpfront(t, choice);
    if (t.retainer?.invoice === 'delivered' && !up) return [{ n: 1, of: null, day: signedDay, amount: first, kind: 'first_payment' }];
    // The first invoice covers 1 month (or 6 up front); then one a month, on the same day of the month, term after term.
    const from = up ? 6 : 1;
    const last = until || addMonths(signedDay, up ? 11 : 5);
    const out = [{ n: 1, of: null, day: signedDay, amount: first, kind: 'first_payment' }];
    for (let m = from, n = 2; fee > 0 && n <= 600; m += 1, n += 1) {
      const day = addMonths(signedDay, m);
      if (day > last) break;
      out.push({ n, of: null, day, amount: fee, kind: 'instalment' });
    }
    return out;
  }
  if (k === 'team') {
    const f = (Number(t.team?.totalMinor) || 0) + extrasTotal(t, chosen);
    if (!(f > 0)) return [];
    if (t.team?.settle === 'full') return [{ n: 1, of: 1, day: signedDay, amount: f, kind: 'first_payment' }];
    if (t.team?.settle === 'equal') return monthly(f, TEAM_THEN, signedDay, 1, TEAM_THEN, 'instalment');
    return [{ n: 1, of: 1 + TEAM_THEN, day: signedDay, amount: first, kind: 'deposit' }, ...monthly(f - first, TEAM_THEN, nextMonth, 2, 1 + TEAM_THEN, 'instalment')];
  }
  const pf = planTotal(t, chosen);
  if (upfrontActive(t, choice) || t.settle === 'full') return [{ n: 1, of: 1, day: signedDay, amount: first, kind: 'first_payment' }];
  if (t.settle === 'deposit') {
    const dep = deposit(t, chosen);
    return [{ n: 1, of: 1 + DEPOSIT_THEN, day: signedDay, amount: dep, kind: 'deposit' }, ...monthly(pf - dep, DEPOSIT_THEN, nextMonth, 2, 1 + DEPOSIT_THEN, 'instalment')];
  }
  if (t.settle === 'delivered') return [{ n: 1, of: sessions(t) || 1, day: signedDay, amount: first, kind: 'first_payment' }];
  return monthly(pf, equalCount(t), signedDay, 1, equalCount(t), 'instalment');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "December 2026" for a day key. */
export const monthWords = (day) => `${MONTHS[Number(String(day).slice(5, 7)) - 1]} ${String(day).slice(0, 4)}`;

/**
 * An invoice's line from the schedule: "Leadership Sounding Board, December 2026" for a retainer's month (never "of 6":
 * it renews), "…, the first 6 months" for its 6 months up front, "…, deposit", "…, instalment 3 of 6", or the name alone.
 */
export function scheduleLine(t, p, choice = t?.choice ?? 'upfront') {
  const what = String(t?.coaching || t?.work || t?.hours?.work || 'Coaching').slice(0, 160);
  if (kindOf(t) === 'retainer') {
    if (p.n === 1 && retainerUpfront(t, choice)) return `${what}, the first 6 months`;
    return `${what}, ${monthWords(p.day)}`;
  }
  if (p.kind === 'deposit') return `${what}, deposit`;
  if (p.of > 1) return `${what}, instalment ${p.n} of ${p.of}`;
  return what;
}

const stampOf = (v) => v?.client_signed_at || v?.sponsor_signed_at || null;
const dayOfStamp = (stamp, zone) => (stamp ? dayIn(zone, parseDbTimestamp(stamp)) : null);
const termsOfVersion = (v) => ({ ...(v.terms || {}), currency: v.currency || v.terms?.currency || 'GBP', fundedBy: v.funded_by ?? v.terms?.fundedBy ?? null });

/** An agreement's signed versions, oldest first (a later one is an amendment of the first: agreements rule 12). */
export function signedVersionsOf(versions) {
  return (versions || []).filter((v) => v && stampOf(v)).sort((a, b) => (a.version || 0) - (b.version || 0));
}
/** The first signing of an agreement: the version and its day (the 14 days and the schedule count from it). */
export function firstSigning(versions, zone = 'Europe/London') {
  const v = signedVersionsOf(versions)[0] || null;
  return v ? { version: v, day: dayOfStamp(stampOf(v), zone) } : null;
}
/** Whether a version is an amendment: an earlier version of the same agreement was signed. */
export const isAmendment = (v, versions) => signedVersionsOf(versions).some((x) => x.id !== v?.id && (x.version || 0) < (v?.version || 0));

/**
 * The one billing schedule of a 065 agreement (agreements rule 12), from all its signed versions (superseded ones
 * included): the first signing sets the shape (its kind, way of settling, the client's choice and the first day), and
 * each later signed version is an amendment whose amounts apply to the invoices due from its effective day (its signing
 * day, or the later day its new price starts, terms.priceFrom), the numbers carrying on. A pause (agreement.paused_from
 * to paused_to) moves every invoice due from its start on by its length; an early end (ending_on with ending_by) stops
 * those due after it; a cancelled one makes none. Each: { n, of, day, amount, kind, versionId, line, terms }.
 * @param {object[]} versions the agreement's versions
 * @param {{ zone?: string, until?: string|null, agreement?: object|null }} opts
 */
export function agreementSchedule(versions, { zone = 'Europe/London', until = null, agreement = null } = {}) {
  const signed = signedVersionsOf(versions).filter((v) => v.terms?.kind);
  if (!signed.length || agreement?.status === 'cancelled') return [];
  const first = signed[0];
  const firstDay = dayOfStamp(stampOf(first), zone);
  const choice = first.settle_choice || 'upfront';
  const plans = signed.map((v, i) => {
    const t = termsOfVersion(v);
    const signedDay = dayOfStamp(stampOf(v), zone);
    const from = i === 0 ? firstDay : [signedDay, t.priceFrom].filter(Boolean).sort().pop();
    return { v, t, from, plan: schedule(t, { signedDay: firstDay, choice, chosen: t.extrasChosen || [], until }) };
  });
  const paused = agreement?.paused_from && agreement?.paused_to && agreement.paused_to > agreement.paused_from
    ? { from: agreement.paused_from, days: daysBetween(agreement.paused_from, agreement.paused_to) + 1 } : null;
  const stop = agreement?.ending_on && agreement?.ending_by ? agreement.ending_on : null;
  const out = [];
  for (const p of plans[0].plan) {
    let pick = plans[0];
    let item = p;
    for (const am of plans.slice(1)) {
      if (p.n === 1 || p.day < am.from) continue;
      const q = am.plan.find((x) => x.n === p.n);
      if (q) { pick = am; item = { ...p, amount: q.amount, of: q.of }; }
    }
    const day = paused && p.n > 1 && item.day >= paused.from ? addDays(item.day, paused.days) : item.day;
    if (stop && p.n > 1 && day > stop) continue;
    if (until && kindOf(pick.t) === 'retainer' && day > until && p.n > 1) continue;
    const at = { ...item, day };
    out.push({ ...at, versionId: pick.v.id, terms: pick.t, line: scheduleLine(pick.t, at, choice) });
  }
  return out;
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
