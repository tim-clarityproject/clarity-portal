import { addDays, dayKeyWords } from '../time/index.js';
import { andList, lowerFirst, moneyText, rateText, unitMinor } from './currency.js';
import { afterRhythm, momentumWeeks, rhythmOf, sessionCount, sessionsInTerm, suggestEnd } from './endDate.js';
import { localFor, localFigures } from './fx.js';
import { base, discountLines, keepTotal, planTotal } from './pricing.js';
import { equalCount, teamOptions } from './settling.js';
import { blankTerms, kindOf, selfFunded, PLACES as PLACE_WORDS } from './terms.js';
import { UPFRONT_PERCENT, upfrontTotal } from './upfront.js';
import { placeLabel } from './places.js';

// The agreement builder as a questionnaire, one question per screen (Polish 1, Stage C; M28 version 6, "build"; Tim,
// 25 Nov 18:10). Which questions each kind asks, in M28's order and words, under its group (Who, What, When, Money,
// Included, Terms, then the check); the "So far:" line; the plain sentences of "Does this read right?", each with the
// question its Change opens; and each answer as a change to the terms. Every price, date and line still comes from the
// engine (pricing, settling, endDate, fx); this file only asks. Plain rules with no window or database, checked by
// tests/performance/agreements-questions.test.mjs.
//
// The questionnaire sets a set-sessions agreement by the month (priceMode 'monthly', `months` 3, 6 or 12): the fee each
// month in pounds first (`gbpMinor`), the client's currency, then the figure they see (`monthlyMinor`), and the number
// of coaching sessions and the end date worked out from the start, the momentum phase, how often and the term.

export const GROUPS = Object.freeze(['Who', 'What', 'When', 'Money', 'Included', 'Terms']);
const GROUP_OF = Object.freeze({
  payer: 'Who', org: 'Who', sponsor: 'Who', po: 'Who', invoices: 'Who', people: 'Who',
  pname: 'What', offer: 'What', work: 'What',
  start: 'When', mom: 'When', mlen: 'When', often: 'When', term: 'When', len: 'When', where: 'When', tz: 'When', rsess: 'When', on: 'When', oplace: 'When', tsess: 'When',
  fee: 'Money', rate: 'Money', cur: 'Money', local: 'Money', settle: 'Money', disc: 'Money',
  extras: 'Included',
  notice: 'Terms', after: 'Terms', owner: 'Terms', pnote: 'Terms',
  check: 'Check',
});
export const groupOf = (key) => GROUP_OF[key] || '';

export const MOMENTUM_CHOICES = Object.freeze([4, 6, 8]);
export const TERM_CHOICES = Object.freeze([3, 6, 12]);
export const NOTICE_CHOICES = Object.freeze([24, 48]);
/** How long the coaching sessions are (M28 version 6): all one length, or the first longer. */
export const LENGTH_CHOICES = Object.freeze([
  { value: '60', label: 'All 60 minutes' },
  { value: '90-60', label: 'The first 90 minutes, then 60', hint: 'More time to set things up' },
  { value: '90', label: 'All 90 minutes' },
  { value: '45', label: 'All 45 minutes' },
  { value: '30', label: 'All 30 minutes' },
]);
/** How often after any momentum phase (M28 version 6's words; the rhythm keeps its own). */
export const OFTEN_CHOICES = Object.freeze([
  { value: 'Weekly', label: 'Every week' },
  { value: 'Every 2 weeks', label: 'Every 2 weeks' },
  { value: 'Monthly', label: 'Every month' },
  { value: 'As we agree', label: 'As you agree', hint: 'Counted as every 2 weeks for the end date' },
]);
export const WHERE_CHOICES = Object.freeze([
  { value: 'zoom', label: 'On Zoom' }, { value: 'inperson', label: 'In person' }, { value: 'either', label: 'Either, as suits' },
]);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const numberWords = { 3: 'three', 6: 'six', 12: 'twelve' };
/** "six months", "12 months". */
export const termWords = (months) => `${numberWords[months] || months} months`;

// ---------------------------------------------------------------- the questions each kind asks

/**
 * The questions, in order, for these terms: [key]. `ctx`: { pkgMode (a package's own defaults: no client, no dates,
 * a name first and the note last), forOrg (the agreement is with an organisation, not a person) }.
 */
export function questionKeys(t, { pkgMode = false, forOrg = false } = {}) {
  const k = kindOf(t);
  const funded = !selfFunded(t) && k !== 'team';
  const fx = (t.currency || 'GBP') !== 'GBP';
  const who = pkgMode || k === 'team' || forOrg ? [] : ['payer', ...(funded ? ['org', 'sponsor', 'po'] : [])];
  const money = (prices) => [...prices, ...(pkgMode ? [] : ['cur', ...(fx ? ['local'] : [])])];
  const head = pkgMode ? ['pname'] : [...who, 'offer'];
  const tail = pkgMode ? ['pnote'] : ['check'];
  if (k === 'retainer') return [...head, ...(pkgMode ? [] : ['start']), 'rsess', 'where', ...(pkgMode ? [] : ['tz']), ...money(['fee']), 'settle', 'extras', 'notice', ...tail];
  if (k === 'oneoff') return [...head, 'work', ...(pkgMode ? [] : ['on']), 'oplace', ...(pkgMode ? [] : ['tz']), ...money(['fee']), 'settle', 'notice', ...tail];
  if (k === 'hours') return [...head, 'work', ...money(['rate', 'fee']), 'owner', ...tail];
  if (k === 'team') {
    return [...head, ...(pkgMode ? [] : ['sponsor', 'invoices', 'po', 'people', 'start']), 'tsess', 'often', ...(pkgMode ? [] : ['tz']), ...money(['fee']), 'settle', 'extras', 'notice', ...tail];
  }
  return [...head, ...(pkgMode ? [] : ['start']), 'mom', ...(momentumWeeks(t.rhythm) ? ['mlen'] : []), 'often', 'term', 'len', 'where', ...(pkgMode ? [] : ['tz']),
    ...money(['fee']), 'settle', ...(pkgMode ? [] : ['disc']), 'extras', 'notice', 'after', ...tail];
}

/** The first question of a group (Change on the check opens it). */
export const firstOfGroup = (keys, group) => keys.find((k) => groupOf(k) === group) || keys[0];

// ---------------------------------------------------------------- the questions' words

/**
 * A question's words: { question, hint }. `ctx`: { first (the client's first name, or the organisation's name),
 * orgName, rate (units per £1 for the client's currency), pkgMode }.
 */
export function questionWords(key, t, ctx = {}) {
  const first = ctx.first || 'your client';
  const org = text(t.orgName) || text(t.fundedBy) || ctx.orgName || 'the organisation';
  const k = kindOf(t);
  const months = Number(t.months) || 6;
  const c = t.currency || 'GBP';
  const payerWords = ctx.pkgMode ? 'your client' : selfFunded(t) && k !== 'team' ? first : org;
  switch (key) {
    case 'payer': return { question: 'Who’s paying for the coaching?' };
    case 'org': return { question: 'Which organisation?', hint: `${first} still signs their own agreement for the coaching. The organisation is invoiced.` };
    case 'sponsor': return k === 'team'
      ? { question: `Who signs for ${org}?`, hint: 'They sign by a link in their email. No account needed.' }
      : { question: `Who’s the sponsor at ${org}?`, hint: 'Named in the agreement as who funds the coaching.' };
    case 'po': return { question: 'Do they need a purchase order?' };
    case 'invoices': return { question: `Where do ${org}’s invoices go?` };
    case 'people': return { question: 'Who’s in the programme?', hint: 'Each person also signs their own coaching agreement, with no money rows, once the sponsor has signed.' };
    case 'pname': return { question: 'What’s the package called?' };
    case 'offer': return { question: 'What are you offering?', hint: 'Your package fills in the answers that follow. You can change any of them.' };
    case 'work': return k === 'hours' ? { question: 'What’s being built?' } : { question: 'What is the work?' };
    case 'start': return { question: 'When would you like to start?', hint: 'Any day.' };
    case 'on': return { question: 'When is it?', hint: 'Any day.' };
    case 'mom': return { question: 'Will you start with a momentum phase?', hint: 'A few weekly sessions at the start, before settling into the usual rhythm.' };
    case 'mlen': return { question: 'How long is the momentum phase?' };
    case 'often': return { question: momentumWeeks(t.rhythm) ? 'After that, how often will you meet?' : 'How often will you meet?' };
    case 'term': return { question: 'How long will the coaching run?' };
    case 'len': return { question: 'How long are the sessions?' };
    case 'where': case 'oplace': return { question: 'Where will you meet?' };
    case 'tz': return { question: `Where is ${first} based?`, hint: `Type a city or country. Session times show in ${first}’s own time.` };
    case 'rsess': return { question: 'How many coaching sessions a month?', hint: 'It runs in 6-month terms, renewing unless either of you says otherwise.' };
    case 'tsess': return { question: 'How many coaching sessions each?' };
    case 'fee': {
      const after = ctx.pkgMode ? '' : ` If ${first} pays in another currency, you’ll see it in theirs next.`;
      if (k === 'oneoff') return { question: 'What’s the fee for the work, in pounds?', hint: `Always set in pounds first.${after}` };
      if (k === 'team') return { question: 'What’s the programme’s total, in pounds?', hint: `Always set in pounds first.${after}` };
      if (k === 'hours') return { question: 'How big is the block, in pounds?', hint: 'The hours it buys are worked out from your rate.' };
      return { question: 'What’s your fee each month, in pounds?', hint: `Always set in pounds first.${after}` };
    }
    case 'rate': return { question: 'What’s your hourly rate, in pounds?', hint: ctx.pkgMode ? 'Always set in pounds first.' : `Always set in pounds first. If ${first} pays in another currency, you’ll see it in theirs next.` };
    case 'cur': return { question: `Which currency will ${first} pay in?`, hint: 'Type a currency or a country.' };
    case 'local': {
      const exact = localFor('exact', t.gbpMinor, c, ctx.rate);
      return {
        question: `What should ${first} see, in ${currencyWords(c)}?`,
        hint: exact ? `Your ${moneyText(t.gbpMinor || 0, 'GBP')} is about ${moneyText(exact, c)} today. Choose the figure ${first} sees.` : `Today’s rate for ${c} hasn’t loaded yet, so type the figure ${first} sees.`,
      };
    }
    case 'settle': return { question: `How will ${payerWords} settle it?` };
    case 'disc': return { question: 'Any discount?' };
    case 'extras': return { question: 'What’s included alongside the coaching?', hint: `This is the value ${ctx.pkgMode ? 'your client gets' : `${first} gets`} beyond the sessions themselves.` };
    case 'notice': return { question: 'How much notice to rearrange?', hint: 'A session moved with less notice counts as used, unless something exceptional happens.' };
    case 'after': return { question: `What happens after the ${termWords(months)}?` };
    case 'owner': return { question: 'Who owns the work?', hint: 'You always keep your own methods and earlier work.' };
    case 'pnote': return { question: 'What would you like to say to each client?', hint: '[name] becomes the client’s first name. It opens the email and the agreement.' };
    case 'check': return { question: 'Does this read right?', hint: `This is what ${k === 'team' ? 'the sponsor' : first} will see first.` };
    default: return { question: '' };
  }
}
const currencyWords = (c) => ({ GBP: 'pounds', EUR: 'euros', USD: 'US dollars', CAD: 'Canadian dollars', AUD: 'Australian dollars', NZD: 'New Zealand dollars',
  CHF: 'Swiss francs', AED: 'UAE dirhams', SGD: 'Singapore dollars', HKD: 'Hong Kong dollars', SEK: 'Swedish kronor', NOK: 'Norwegian kroner',
  DKK: 'Danish kroner', ZAR: 'South African rand', JPY: 'Japanese yen' })[c] || c;

// ---------------------------------------------------------------- the answers, read from the terms

/** The terms' main price in the client's currency: a month's fee, a total or a block. */
export function mainPrice(t) {
  const k = kindOf(t);
  if (k === 'retainer') return Number(t.retainer?.feeMinor) || 0;
  if (k === 'oneoff') return Number(t.oneoff?.totalMinor) || 0;
  if (k === 'team') return Number(t.team?.totalMinor) || 0;
  if (k === 'hours') return Number(t.hours?.blockMinor) || 0;
  return t.priceMode === 'monthly' ? Number(t.monthlyMinor) || 0 : Number(t.totalMinor) || 0;
}
/** The terms with the main price set. */
export function withMain(t, minor) {
  const k = kindOf(t);
  const v = Math.max(0, Math.round(Number(minor) || 0));
  if (k === 'retainer') return { ...t, retainer: { ...(t.retainer || {}), feeMinor: v } };
  if (k === 'oneoff') return { ...t, oneoff: { ...(t.oneoff || {}), totalMinor: v } };
  if (k === 'team') return { ...t, team: { ...(t.team || {}), totalMinor: v } };
  if (k === 'hours') return { ...t, hours: { ...(t.hours || {}), blockMinor: v } };
  return t.priceMode === 'monthly' ? { ...t, monthlyMinor: v } : { ...t, totalMinor: v };
}

/** The session-length answer the blocks make: '60', '90-60' and the like. */
export function lengthOf(t) {
  const b = (t.blocks || []).filter((x) => Number(x?.n) > 0);
  if (b.length === 2 && Number(b[0].n) === 1 && Number(b[0].minutes) > Number(b[1].minutes)) return `${b[0].minutes}-${b[1].minutes}`;
  return String(b[b.length - 1]?.minutes || 60);
}
/** The blocks for a length answer and a number of coaching sessions. */
export function blocksFor(length, n) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  const [a, b] = String(length || '60').split('-').map(Number);
  if (b && count > 1) return [{ n: 1, minutes: a }, { n: count - 1, minutes: b }];
  return [{ n: count, minutes: b && count === 1 ? a : a || 60 }];
}
/** "the first 90 minutes, then 60" or "60 minutes". */
export function lengthWords(t) {
  const v = lengthOf(t);
  const [a, b] = v.split('-');
  return b ? `the first ${a} minutes, then ${b}` : `${a} minutes`;
}
/** The discount answer: 'none', 'returning10' or 'other'. */
export function discountOf(t) {
  const d = t.discounts || [];
  if (!d.length) return 'none';
  if (d.length === 1 && d[0].type === 'returning' && Number(d[0].percent) === 10) return 'returning10';
  return 'other';
}
/** The purchase-order answer: 'yes' (with its number), 'later' or 'no'. */
export const poOf = (t) => {
  const needs = kindOf(t) === 'team' ? t.team?.needsPO : t.needsPO;
  if (!needs) return 'no';
  return text(t.poNumber) ? 'yes' : (t.poAnswer === 'yes' ? 'yes' : 'later');
};

// ---------------------------------------------------------------- the answers, as changes to the terms

const SAMPLE_START = '2027-01-04';
/**
 * Set sessions in the questionnaire's shape: priced by the month over a term of 3, 6 or 12 months, the coaching
 * sessions and the end date worked out. A draft priced as a total (a package, a run 3 draft) becomes its total spread
 * over its months; the £ figure is the price itself while it is in pounds.
 */
export function asQuestionnaire(t) {
  const k = kindOf(t);
  let next = { ...t };
  if (next.adhoc === undefined) next.adhoc = true;
  if (next.portal === undefined) next.portal = true;
  if (k === 'sessions') {
    if (next.priceMode !== 'monthly') {
      const months = [3, 6, 12].includes(Number(next.months)) ? Number(next.months) : 6;
      // A month's fee in whole units of the currency (a total of £5,840 over 3 months reads £1,947 a month).
      // Its total is kept exactly (F5): the month's fee is what the coach reads, the total what is invoiced.
      const total = base(t);
      next = { ...next, priceMode: 'monthly', months, monthlyMinor: Math.round(total / months / unitMinor(next.currency || 'GBP')) * unitMinor(next.currency || 'GBP') || 0 };
      if (total > 0) next = keepTotal(next, total);
    }
    if (!next.after) next.after = 'offer';
    // M28 version 6 offers three ways: all up front, monthly and after each session (a deposit reads as monthly).
    if (next.settle === 'deposit') next.settle = 'equal';
    next = recount(next);
  }
  if (!(Number(next.gbpMinor) > 0) && (next.currency || 'GBP') === 'GBP') next.gbpMinor = mainPrice(next);
  if (k === 'hours' && !(Number(next.gbpRateMinor) > 0) && (next.currency || 'GBP') === 'GBP') next.gbpRateMinor = Number(next.hours?.rateMinor) || 0;
  return next;
}

/** The coaching sessions and the end date, worked out again from the start, the rhythm, the term and the length. */
export function recount(t) {
  if (kindOf(t) !== 'sessions' || t.priceMode !== 'monthly') return t;
  const n = sessionsInTerm(t.startsOn || SAMPLE_START, t.rhythm, Number(t.months) || 6);
  const blocks = blocksFor(lengthOf(t), n);
  const next = { ...t, blocks };
  if (t.startsOn) { next.endsOn = suggestEnd(t.startsOn, blocks, t.rhythm); next.endsPicked = false; }
  return next;
}

/** The client's figure worked out again from the £ figure (the way it was chosen; their own figure stays). */
export function relocal(t, unitsPerGbp) {
  const c = t.currency || 'GBP';
  const mode = t.localMode || 'up';
  let next = t;
  if (c === 'GBP') {
    next = withMain(next, t.gbpMinor ?? mainPrice(t));
    if (kindOf(t) === 'hours' && t.gbpRateMinor != null) next = { ...next, hours: { ...next.hours, rateMinor: t.gbpRateMinor } };
    return next;
  }
  if (mode === 'own' || !(Number(unitsPerGbp) > 0)) return next;
  next = withMain(next, localFor(mode, t.gbpMinor, c, unitsPerGbp));
  if (kindOf(t) === 'hours' && Number(t.gbpRateMinor) > 0) next = { ...next, hours: { ...next.hours, rateMinor: localFor(mode, t.gbpRateMinor, c, unitsPerGbp) } };
  return next;
}

/**
 * One answer as a change to the terms. `answer` is the question's own value; `ctx.rate` the client's currency in units
 * per £1. Returns the next terms (never the same object).
 */
export function answer(t, key, value, ctx = {}) {
  const k = kindOf(t);
  switch (key) {
    case 'payer': return value === 'org'
      ? { ...t, funder: 'org', fundedBy: text(t.orgName) || text(ctx.orgName) || t.fundedBy || null, orgName: text(t.orgName) || text(ctx.orgName) || null, offerUpfront: t.offerUpfront }
      : { ...t, funder: 'self', fundedBy: null };
    case 'org': return { ...t, organisationId: value?.id || null, orgName: text(value?.name) || null, fundedBy: t.funder === 'org' ? text(value?.name) || null : t.fundedBy, invoicesEmail: text(value?.email) || t.invoicesEmail || '' };
    case 'po': {
      const needs = value !== 'no';
      const base2 = { ...t, poAnswer: value, poNumber: value === 'yes' ? t.poNumber || '' : null };
      return k === 'team' ? { ...base2, team: { ...(t.team || {}), needsPO: needs } } : { ...base2, needsPO: needs };
    }
    case 'start': return recount({ ...t, startsOn: value, ...(k === 'oneoff' ? { oneoff: { ...(t.oneoff || {}), on: value } } : {}) });
    case 'on': return { ...t, oneoff: { ...(t.oneoff || {}), on: value }, startsOn: value };
    case 'mom': return recount({ ...t, rhythm: rhythmOf(value ? (momentumWeeks(t.rhythm) || 6) : 0, afterRhythm(t.rhythm)) });
    case 'mlen': return recount({ ...t, rhythm: rhythmOf(value, afterRhythm(t.rhythm)) });
    case 'often': return recount({ ...t, rhythm: rhythmOf(momentumWeeks(t.rhythm), value) });
    case 'term': return recount({ ...t, months: Number(value) });
    case 'len': return k === 'team' ? t : recount({ ...t, blocks: blocksFor(value, sessionCount(t.blocks)) });
    case 'where': return { ...t, place: value };
    case 'oplace': return { ...t, place: value, oneoff: { ...(t.oneoff || {}), place: value } };
    case 'tz': return { ...t, clientZone: value?.zone || null, basedIn: text(value?.label) || placeLabel(value?.zone) || null };
    case 'rsess': return { ...t, retainer: { ...(t.retainer || {}), sessions: value } };
    case 'fee': return relocal({ ...t, gbpMinor: Math.max(0, Math.round(Number(value) || 0)) }, ctx.rate);
    case 'rate': return relocal({ ...t, gbpRateMinor: Math.max(0, Math.round(Number(value) || 0)) }, ctx.rate);
    case 'cur': {
      // A new currency starts from the £ figure at ITS rate (ctx.rate is the new currency's: F4); its own figure and
      // rate are never carried into another currency. Without a rate the figure is left empty until one is here.
      if (value === t.currency) return relocal({ ...t }, ctx.rate);
      const next = { ...t, currency: value, localMode: value === 'GBP' ? null : 'up', fxRate: null };
      if (value !== 'GBP' && !(Number(ctx.rate) > 0)) {
        const empty = withMain(next, 0);
        return kindOf(t) === 'hours' ? { ...empty, hours: { ...empty.hours, rateMinor: 0 } } : empty;
      }
      return relocal(next, ctx.rate);
    }
    case 'local': return value?.mode === 'own'
      ? { ...withMain(t, value.minor), localMode: 'own' }
      : relocal({ ...t, localMode: value?.mode || 'up' }, ctx.rate);
    case 'settle': {
      if (k === 'retainer') return { ...t, retainer: { ...(t.retainer || {}), invoice: value === 'delivered' ? 'delivered' : 'monthly' } };
      if (k === 'oneoff') return { ...t, oneoff: { ...(t.oneoff || {}), settle: value } };
      if (k === 'team') return { ...t, team: { ...(t.team || {}), settle: value } };
      return { ...t, settle: value };
    }
    case 'disc': return value === 'returning10' ? { ...t, discounts: [{ type: 'returning', percent: 10 }] } : value === 'none' ? { ...t, discounts: [] } : t;
    case 'notice': return { ...t, noticeHours: Number(value) };
    case 'after': return { ...t, after: value };
    case 'owner': return { ...t, hours: { ...(t.hours || {}), owner: value } };
    case 'tsess': return { ...t, team: { ...(t.team || {}), sessions: value } };
    default: return t;
  }
}

// ---------------------------------------------------------------- the choices each question offers

/** The settling choices in M28 version 6's words: [{ value, label, hint }]. `first` the client; `org` the organisation. */
export function settleChoices(t, { first = 'your client', orgName = null, pkgMode = false } = {}) {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const funded = !selfFunded(t) && !pkgMode;
  const who = pkgMode ? 'your client' : first;
  if (k === 'team') return teamOptions(t).map((o) => ({ value: o.value, label: o.label.replace(/^./, (x) => x.toUpperCase()) }));
  if (k === 'oneoff') return [{ value: 'before', label: 'In full, up front' }, { value: 'after', label: 'In full, after the work', hint: 'With a deposit of 30% when signing' }];
  if (k === 'retainer') {
    return funded
      ? [{ value: 'monthly', label: 'Invoiced monthly', hint: `By bank transfer, ${t.dueDays ?? 14} days` }, { value: 'delivered', label: 'Invoiced after each session' }]
      : [{ value: 'monthly', label: 'Monthly, by Direct Debit', hint: `The first month when ${who} signs` }, { value: 'delivered', label: 'After each session', hint: 'Invoiced as you go' }];
  }
  const months = Number(t.months) || 6;
  const all = planTotal(t);
  if (funded) {
    return [
      { value: 'full', label: 'Invoiced up front', hint: `${moneyText(all, c)}, by bank transfer` },
      { value: 'equal', label: 'Invoiced monthly', hint: `By bank transfer, ${t.dueDays ?? 14} days` },
      { value: 'delivered', label: 'Invoiced after each session', hint: (t.needsPO ? 'Quoting their purchase order' : 'By bank transfer') },
    ];
  }
  const upOn = t.offerUpfront !== false;
  return [
    { value: 'full', label: upOn ? `All up front, ${UPFRONT_PERCENT}% off` : 'All up front', hint: `${moneyText(upOn ? upfrontTotal(all) : all, c)}, when ${who} signs` },
    { value: 'equal', label: 'Monthly, by Direct Debit', hint: equalCount({ ...t, months }) > 1 ? `The first month when ${who} signs` : `When ${who} signs` },
    { value: 'delivered', label: 'After each session', hint: 'Invoiced as you go' },
  ];
}
/** The settling answer the terms hold. */
export function settleOf(t) {
  const k = kindOf(t);
  if (k === 'retainer') return t.retainer?.invoice === 'delivered' ? 'delivered' : 'monthly';
  if (k === 'oneoff') return t.oneoff?.settle || 'before';
  if (k === 'team') return t.team?.settle || 'deposit';
  return t.settle === 'deposit' ? 'equal' : t.settle || 'equal';
}

/**
 * The figures the client could see (M28 version 6): rounded up, rounded down, exactly today's rate, each with its £
 * value, then the coach's own: [{ value: mode, label, hint, minor, under }]. Empty while today's rate is unknown.
 */
export function localChoices(t, unitsPerGbp, { per = 'a month' } = {}) {
  const c = t.currency || 'GBP';
  const out = localFigures(t.gbpMinor, c, unitsPerGbp).map((o) => ({
    value: o.mode,
    minor: o.minor,
    under: o.under,
    label: `${moneyText(o.minor, c)}${per ? ` ${per}` : ''}`,
    hint: o.mode === 'up' ? `Rounded up, about ${wholePounds(o.gbpMinor)}`
      : o.mode === 'down' ? `Rounded down, about ${wholePounds(o.gbpMinor)}${o.under ? ', a little under your price' : ''}`
        : `Exactly today’s rate, ${wholePounds(o.gbpMinor)}`,
  }));
  return [...out, { value: 'own', label: 'Your own figure', hint: `Type it in ${c === 'GBP' ? 'pounds' : currencyWords(c)}`, minor: null, under: false }];
}
/** Whole pounds, as M28 version 6 writes a £ value beside another currency: "about £752". */
const wholePounds = (minor) => `£${Math.round((Number(minor) || 0) / 100).toLocaleString('en-GB')}`;
const perWords = (t) => (['sessions', 'retainer'].includes(kindOf(t)) ? 'a month' : '');
export { perWords };

// ---------------------------------------------------------------- the "So far:" line and the check

/** The words for who pays: "paid by Sam" or "paid by Morrow Cycles". */
const paidBy = (t, first) => (selfFunded(t) && kindOf(t) !== 'team' ? `paid by ${first}` : `paid by ${text(t.orgName) || text(t.fundedBy) || 'the organisation'}`);
const startWords = (day) => (day ? dayKeyWords(day) : '');

/**
 * The "So far:" line above a question (M28 version 6): what's been answered before it, joined with " · ". Nothing on
 * the first question or the check. `ctx`: { first, coachFirst }.
 */
export function soFar(t, key, keys, { first = 'your client', coachFirst = '' } = {}) {
  if (key === 'check' || key === 'pnote') return '';
  const here = keys.indexOf(key);
  const past = (k) => keys.indexOf(k) >= 0 && keys.indexOf(k) < here;
  const out = [];
  if (coachFirst && here > 0) out.push(coachFirst);
  if (past('payer') || (kindOf(t) === 'team' && past('offer'))) out.push(paidBy(t, first));
  if (past('offer') || past('pname')) out.push(text(t.coaching) || 'Coaching');
  if (past('start') && t.startsOn) out.push(`from ${startWords(t.startsOn)}`);
  if (past('on') && t.oneoff?.on) out.push(`on ${startWords(t.oneoff.on)}`);
  if (past('term')) out.push(`${sessionCount(t.blocks)} sessions over ${Number(t.months) || 6} months`);
  if (past('fee') && Number(t.gbpMinor) > 0) {
    const c = t.currency || 'GBP';
    const per = perWords(t) ? ` ${perWords(t)}` : '';
    out.push(`${moneyText(t.gbpMinor, 'GBP')}${per}${c !== 'GBP' && past('local') ? ` (${moneyText(mainPrice(t), c)})` : ''}`);
  }
  return out.length ? `So far: ${out.join(' · ')}` : '';
}

/** The sessions line: "16 sessions (weekly for 6 weeks, then every 2 weeks), the first 90 minutes, then 60". */
const sessionsLine = (t) => {
  const n = sessionCount(t.blocks);
  return `${n} ${n === 1 ? 'session' : 'sessions'} (${lowerFirst(t.rhythm || 'Every 2 weeks')}), ${lengthWords(t)}`;
};

/**
 * "Does this read right?" (M28 version 6): the plain sentences the client sees first, each with the question its Change
 * opens: [{ key, text, edit }]. `ctx`: { first, coachFirst, keys }.
 */
export function checkLines(t, { first = 'your client', coachFirst = 'you', keys = questionKeys(t) } = {}) {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const at = (group) => firstOfGroup(keys, group);
  const out = [];
  const what = k === 'oneoff' || k === 'hours' ? text(k === 'hours' ? t.hours?.work : t.work) || text(t.coaching) : text(t.coaching) || 'Coaching';
  out.push({ key: 'what', text: what || 'Coaching', edit: at('What') });
  if (k === 'team') {
    const s = t.team?.sponsor || {};
    out.push({ key: 'who', text: `Coached by ${coachFirst}, for ${andList((t.team?.people || []).map((p) => p.name)) || 'no one yet'}, signed for ${text(t.orgName) || 'the organisation'} by ${[text(s.name), text(s.role)].filter(Boolean).join(', ') || 'the sponsor'}${t.team?.needsPO ? ', with a purchase order' : ''}`, edit: at('Who') });
  } else {
    const funded = !selfFunded(t);
    const sp = t.sponsor || {};
    out.push({ key: 'who', text: `Coached by ${coachFirst}, ${paidBy(t, first)}${funded && (text(sp.name) || t.needsPO) ? ` (${[text(sp.name) ? `sponsored by ${[text(sp.name), text(sp.role)].filter(Boolean).join(', ')}` : '', t.needsPO ? 'with a purchase order' : ''].filter(Boolean).join(', ')})` : ''}`, edit: keys.includes('payer') ? 'payer' : at('What') });
  }
  const place = t.basedIn ? `, ${String(t.basedIn).split(',')[0]} time` : '';
  const where = PLACE_WORDS[t.place] || PLACE_WORDS.zoom;
  if (k === 'sessions') {
    out.push({ key: 'when', text: `${sessionsLine(t)}, ${where}, from ${startWords(t.startsOn)} to ${t.endsOn ? dayKeyWords(t.endsOn, { year: true }) : ''}${place}`, edit: at('When') });
  } else if (k === 'retainer') {
    out.push({ key: 'when', text: `${t.retainer?.sessions || ''}, ${where}, from ${startWords(t.startsOn)}, in 6-month terms${place}`, edit: at('When') });
  } else if (k === 'oneoff') {
    out.push({ key: 'when', text: `${t.oneoff?.on ? `On ${dayKeyWords(t.oneoff.on, { year: true })}` : 'On a day you agree'}, ${t.oneoff?.place === 'inperson' ? 'in person' : 'on Zoom'}${place}`, edit: at('When') });
  } else if (k === 'team') {
    out.push({ key: 'when', text: `${t.team?.sessions || ''}, ${lowerFirst(t.rhythm || 'Every 2 weeks')}, from ${startWords(t.startsOn)}${t.endsOn ? ` to ${dayKeyWords(t.endsOn, { year: true })}` : ''}${place}`, edit: at('When') });
  }
  out.push({ key: 'fee', text: feeLine(t, first), edit: at('Money') });
  if (k !== 'hours' && k !== 'oneoff') {
    const also = alsoIncluded(t);
    out.push({ key: 'also', text: also.length ? `Also included: ${andList(also)}` : 'Nothing extra included', edit: at('Included') });
  }
  if (k === 'hours') {
    out.push({ key: 'terms', text: t.hours?.owner === 'coach' ? `You own the work, licensed to ${first}` : `${first} owns the work once it’s settled`, edit: at('Terms') });
  } else {
    const after = k === 'sessions' ? { offer: 'you offer the next term a month before the end', renew: 'renews unless either says otherwise 30 days before', end: 'ends at the end of the term' }[t.after || 'offer'] : '';
    out.push({ key: 'terms', text: `${t.noticeHours ?? 24} hours’ notice to rearrange${after ? `; ${after}` : ''}`, edit: at('Terms') });
  }
  return out;
}

/** What's included beyond the coaching sessions, as the check and the Main points say it. */
export function alsoIncluded(t, { first = null } = {}) {
  const out = [];
  if (t.adhoc !== false) out.push('ad hoc support by email and WhatsApp between sessions');
  if (t.portal !== false) out.push(`The Clarity Portal at the ${t.level || 'Executive'} level${first ? `, ${first}’s personal performance platform` : ''}`);
  if (t.healthCheck) out.push('a Health Check');
  if (t.visitDays?.n) out.push(`${t.visitDays.n} visit ${t.visitDays.n === 1 ? 'day' : 'days'}`);
  return out;
}

/** The fee as the check says it: "£750 a month by Direct Debit, £4,500 in all (your £750 a month)". */
export function feeLine(t, first = 'your client') {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const m = (v) => moneyText(v, c);
  const funded = !selfFunded(t) || k === 'team';
  const gbp = c !== 'GBP' && Number(t.gbpMinor) > 0 ? ` (your ${moneyText(t.gbpMinor, 'GBP')}${perWords(t) ? ` ${perWords(t)}` : ''})` : '';
  const off = discountLines(t).map((l) => l.label.replace(/^./, (x) => x.toLowerCase()));
  const offWords = off.length ? `, with ${andList(off)}` : '';
  if (k === 'retainer') {
    const fee = Number(t.retainer?.feeMinor) || 0;
    const how = t.retainer?.invoice === 'delivered' ? 'invoiced after each session' : funded ? 'invoiced monthly' : 'by Direct Debit';
    return `${rateText(fee, 'month', c).replace('/month', ' a month')}, ${how}${gbp}`;
  }
  if (k === 'oneoff') return `${m(Number(t.oneoff?.totalMinor) || 0)}, in full, ${t.oneoff?.settle === 'after' ? 'after the work' : 'up front'}${gbp}`;
  if (k === 'hours') return `${m(Number(t.hours?.blockMinor) || 0)} for the block, at ${rateText(Number(t.hours?.rateMinor) || 0, 'hour', c)}${gbp}`;
  if (k === 'team') {
    const o = teamOptions(t).find((x) => x.value === t.team?.settle) || teamOptions(t)[0];
    return `${m(Number(t.team?.totalMinor) || 0)}: ${lowerFirst(o?.label || '')}${gbp}`;
  }
  const monthly = Number(t.monthlyMinor) || 0;
  const all = planTotal(t);
  const each = Math.round(all / (Number(t.months) || 6));
  if (t.settle === 'full') {
    const upOn = t.offerUpfront !== false && !funded;
    return `${funded ? 'Invoiced up front' : 'All up front'}, ${m(upOn ? upfrontTotal(all) : all)}${upOn ? ` with ${UPFRONT_PERCENT}% off` : ''}${offWords}${gbp}`;
  }
  if (t.settle === 'delivered') return `${m(off.length ? each : monthly)} a month, invoiced after each session${offWords}${gbp}`;
  return `${m(off.length ? each : monthly)} a month, ${funded ? 'invoiced monthly' : 'by Direct Debit'}, ${m(all)} in all${offWords}${gbp}`;
}

/** The term's answer rows under "How long will the coaching run?": { count, countNote, end }. */
export function termRows(t) {
  const n = sessionCount(t.blocks);
  const w = momentumWeeks(t.rhythm);
  const often = (OFTEN_CHOICES.find((o) => o.value === afterRhythm(t.rhythm))?.label || 'Every 2 weeks').toLowerCase();
  return {
    count: `${n} ${n === 1 ? 'session' : 'sessions'}`,
    countNote: w ? `${Math.min(w, n)} weekly, then ${Math.max(0, n - w)} ${often}` : often,
    end: t.endsOn ? dayKeyWords(t.endsOn, { year: true }) : '',
  };
}

/** "In all" under the fee: { total: "£4,500", note: "6 months at £750" }, in pounds. */
export function feeRows(t) {
  const k = kindOf(t);
  const g = Number(t.gbpMinor) || 0;
  if (k === 'sessions') return { total: moneyText((t.currency || 'GBP') === 'GBP' && t.priceMode === 'monthly' ? base(t) : g * (Number(t.months) || 6), 'GBP'), note: `${Number(t.months) || 6} months at ${moneyText(g, 'GBP')}` };
  if (k === 'retainer') return { total: moneyText(g * 6, 'GBP'), note: `The first 6-month term at ${moneyText(g, 'GBP')}` };
  return null;
}

/** A package's line on "What are you offering?": "Weekly for 6 weeks, then every 2 weeks" and its price. */
export function offerLine(pkgTerms) {
  const k = kindOf(pkgTerms);
  if (k === 'retainer') return `${pkgTerms.retainer?.sessions || 'Monthly coaching'}, in 6-month terms`;
  if (k === 'team') return 'A sponsor agreement, plus one for each person';
  if (k === 'hours') return 'Logged against a balance';
  if (k === 'oneoff') return text(pkgTerms.work) || 'A one-off piece of work';
  return pkgTerms.rhythm || '';
}

/** A blank agreement for "Something different", keeping who it is with, the start and the money's currency. */
export function blankFrom(t) {
  const keep = ['clientName', 'clientFirst', 'coachName', 'coachFirst', 'orgName', 'funder', 'fundedBy', 'sponsor', 'needsPO', 'poNumber', 'poAnswer',
    'organisationId', 'invoicesEmail', 'startsOn', 'clientZone', 'basedIn', 'currency', 'localMode', 'personalNote'];
  const fresh = blankTerms('sessions');
  const next = { ...fresh, ...Object.fromEntries(keep.filter((x) => t[x] !== undefined).map((x) => [x, t[x]])), coaching: 'Coaching', priceMode: 'monthly', months: 6, monthlyMinor: 0, gbpMinor: 0 };
  return asQuestionnaire(next);
}

/** The day a date question shows first: the chosen one, else the next Monday. */
export const firstPickDay = (chosen, todayKey) => chosen || addDays(todayKey, ((8 - new Date(`${todayKey}T12:00:00Z`).getUTCDay()) % 7) || 7);

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/**
 * What the agreement email says it is for (M28 version 6's "Here's the agreement for your six months of coaching,
 * starting on Monday 4 January."): { what, startsWords }, each '' when the terms don't say.
 */
export function emailWords(t = {}) {
  const k = kindOf(t);
  const what = k === 'sessions' && t.priceMode === 'monthly' && Number(t.months) > 0 ? `${termWords(Number(t.months))} of coaching`
    : lowerFirst(text(t.coaching) || text(t.work) || '');
  const day = k === 'oneoff' ? t.oneoff?.on : t.startsOn;
  let startsWords = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) {
    const [weekday, d] = dayKeyWords(day, { long: true }).split(' ');
    startsWords = `${weekday} ${d} ${FULL_MONTHS[Number(day.slice(5, 7)) - 1]}`;
  }
  return { what, startsWords };
}
