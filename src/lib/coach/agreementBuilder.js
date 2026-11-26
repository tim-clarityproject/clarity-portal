import { addDays, dayKeyWords, weekdayOf } from '../time/index.js';
import { andList, hoursWords, isCurrency, lowerFirst, moneyText, rateText } from '../agreements/currency.js';
import { buildClauses, forStorage, mainPoints, resolveChoice } from '../agreements/clauses.js';
import { endHint, endOptions, sessionCount, suggestEnd } from '../agreements/endDate.js';
import { fxLine, fxLineMonthly, matchMyPrice, perUnit, underBy, underLine } from '../agreements/fx.js';
import { blockMinutes } from '../agreements/hours.js';
import { finLine, hourlyLine, planTotal, sessionsSummary } from '../agreements/pricing.js';
import { agreementTotal, firstPayment, settleOptions, teamOptions } from '../agreements/settling.js';
import { ALL_CLAUSE_KEYS, clauseKeys } from '../agreements/standardWording.js';
import { agreementStatus, expiryLine, NOT_YET, sentLine, sentTitle } from '../agreements/status.js';
import { blankTerms, KINDS, kindOf, personalNoteFor, selfFunded } from '../agreements/terms.js';
import { finalTotal, upfrontLine } from '../agreements/upfront.js';
import { nextTermDraft } from '../agreements/renewals.js';
import { quoteNumber } from '../agreements/quote.js';

// Starting an agreement, from the coach's side (Phase 6b run 3, Group B; M28 s-client, s-start, s-packages, the five
// builders, s-library, s-clause, s-check, s-sign and s-sent; brief items 1 to 7, 15 to 22, 31 and 37 to 42). Plain
// rules with no database and no window, so the pages only draw: who an agreement is for, a package's row, the draft's
// two rows (the agreement and its first version), each change to the terms (the end date worked out unless picked),
// the builder's lines, the version's fields as they are saved and sent, the coach's own standard wording, the clause
// library's rows and the client page's Agreement fold. Every price, date, clause and line comes from
// src/lib/agreements; nothing here works one out for itself. Checked by tests/performance/coach-builder.test.mjs.

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v ?? null));

/** Each kind's short name on a package's row (M28's .ld): "Set sessions", "Retainer", "Team", "One-off", "Hours". */
export const KIND_SHORT = Object.freeze({ sessions: 'Set sessions', retainer: 'Retainer', team: 'Team', oneoff: 'One-off', hours: 'Hours' });
/** Each kind's standard wording, as Settings, Agreements names it (M28's "Your standard wording"). */
export const WORDING_NAMES = Object.freeze({
  sessions: 'Coaching agreement', retainer: 'Retainer agreement', team: 'Sponsor agreement', oneoff: 'One-off agreement', hours: 'Block of hours agreement',
});
/** M28's four extras, offered to a coach who hasn't made their own list yet (065's agreement_extras). */
export const DEFAULT_EXTRAS = Object.freeze([
  { key: 'session', title: 'Extra coaching session', priceMinor: 75000, hint: null },
  { key: 'visit', title: 'Visit day', priceMinor: 250000, hint: null },
  { key: 'workshop', title: 'Team workshop day', priceMinor: 300000, hint: null },
  { key: 'hc', title: 'Health Check with a debrief', priceMinor: 150000, hint: 'for teams and CEOs' },
]);
/** The builder's parts, in order (M28's underlined tabs row, which jumps to each). */
export const BUILDER_PARTS = Object.freeze([
  { value: 'coaching', label: 'The coaching' }, { value: 'included', label: 'What’s included' }, { value: 'investment', label: 'The investment' },
  { value: 'extras', label: 'Quote extras' }, { value: 'terms', label: 'The terms' },
]);
/** The retainer's "How many coaching sessions?" choices (M28's s-b-retainer). */
export const RETAINER_SESSIONS = Object.freeze(['Up to 1 a month, 60 minutes', 'Up to 2 a month, 60 minutes each', 'Up to 4 a month, 45 minutes each', 'As we agree each month']);
/** The team's "How many coaching sessions each?" choices (M28's s-b-team), with the blocks each one means. */
export const TEAM_SESSIONS = Object.freeze([
  { value: '12 of 60 minutes each', blocks: [{ n: 12, minutes: 60 }] },
  { value: '8 of 60 minutes each', blocks: [{ n: 8, minutes: 60 }] },
  { value: '6 of 90 minutes each', blocks: [{ n: 6, minutes: 90 }] },
]);
export const LEVELS = Object.freeze([
  { value: 'Executive', label: 'Executive, for the length of the agreement' }, { value: 'Individual', label: 'Individual, for the length of the agreement' },
]);
export const NOTICE_CHOICES = Object.freeze([12, 24, 48]);
export const DUE_CHOICES = Object.freeze([7, 14, 30]);
export const MONTH_CHOICES = Object.freeze([3, 6, 12]);

// ---------------------------------------------------------------- who it is for

/**
 * Who a new agreement is for, from the address's `for`: "client:<id>", "org:<id>" or "lead:<id>". Null when it says
 * nothing a coach could start from.
 */
export function startFor(value) {
  const m = /^(client|org|lead):([0-9a-f-]{36})$/i.exec(String(value || ''));
  return m ? { kind: m[1].toLowerCase(), id: m[2].toLowerCase() } : null;
}

/** The person or organisation an agreement is with: { name, first, orgName, funded, profileId, organisationId }. */
export function partyOf({ agreement, clients = [], organisations = [] }) {
  const profile = agreement?.profile_id ? clients.find((c) => c.id === agreement.profile_id) || null : null;
  const org = agreement?.organisation_id ? organisations.find((o) => o.id === agreement.organisation_id) || null : null;
  if (agreement?.kind === 'sponsor' && org && !profile) return { name: org.name, first: org.name, orgName: org.name, funded: true, profileId: null, organisationId: org.id };
  const name = text(profile?.name) || text(org?.name) || '';
  return { name, first: firstOf(name), orgName: org?.name || null, funded: Boolean(org) && agreement?.kind === 'sponsor', profileId: profile?.id || null, organisationId: org?.id || null };
}
export const firstOf = (name) => text(name).split(/\s+/)[0] || '';
/** "Sam's", "James'": a possessive for a first name. */
export const possessive = (first) => (first ? (/s$/i.test(first) ? `${first}’` : `${first}’s`) : 'Their');

// ---------------------------------------------------------------- packages

const priceFor = (pkg, funded) => {
  const v = funded ? pkg?.org_price_minor : pkg?.personal_price_minor;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
};
const pkgKind = (pkg) => (KINDS.includes(pkg?.agreement_kind) ? pkg.agreement_kind : kindOf(pkg?.defaults));

/**
 * A package's row (M28's s-start and s-packages): { title, meta, kind, short }. `where` 'start' writes the longer
 * line (16 coaching sessions, £18,000; Up to 2 coaching sessions a month, £3,000/month; For an organisation, from
 * £27,000; its own detail, £1,500; Bought up front, £150/hr); 'settings' the shorter one (M28's s-packages).
 */
export function packageRow(pkg, { funded = false, where = 'start' } = {}) {
  const kind = pkgKind(pkg);
  const d = isObj(pkg?.defaults) ? pkg.defaults : {};
  const c = isCurrency(pkg?.currency) ? pkg.currency : 'GBP';
  const price = priceFor(pkg, funded) ?? priceFor(pkg, !funded);
  const money = price != null ? moneyText(price, c) : '';
  const parts = [];
  if (kind === 'sessions') {
    const n = sessionCount(d.blocks);
    if (where === 'start' && n) parts.push(`${n} coaching ${n === 1 ? 'session' : 'sessions'}`);
    if (where === 'settings' && n) parts.push(`${n} coaching ${n === 1 ? 'session' : 'sessions'}`);
    // A package set by the month (Polish 1, Stage C) reads "£750/month".
    if (d.priceMode === 'monthly' && Number(d.monthlyMinor) > 0) parts.push(rateText(Number(d.monthlyMinor), 'month', c));
    else if (money) parts.push(money);
  } else if (kind === 'retainer') {
    const m = /^Up to (\d+) a month/i.exec(text(d.retainer?.sessions));
    if (where === 'start' && m) parts.push(`Up to ${m[1]} coaching ${m[1] === '1' ? 'session' : 'sessions'} a month`);
    if (price != null) parts.push(rateText(price, 'month', c));
  } else if (kind === 'team') {
    if (where === 'start') parts.push(money ? `For an organisation, from ${money}` : 'For an organisation');
    else if (money) parts.push(`From ${money}`);
  } else if (kind === 'oneoff') {
    if (where === 'start' && text(pkg?.detail)) parts.push(text(pkg.detail));
    if (money) parts.push(money);
  } else {
    const rate = Number(d.hours?.rateMinor) || 0;
    if (where === 'start') parts.push(rate ? `Bought up front, ${rateText(rate, 'hour', c)}` : 'Bought up front');
    else if (rate) parts.push(rateText(rate, 'hour', c));
  }
  return { id: pkg?.id, title: text(pkg?.name) || WORDING_NAMES[kind], meta: parts.join(', '), kind, short: KIND_SHORT[kind] };
}

/** The packages a coach starts from: not archived, in their order; an associate also has the owner's (065). */
export function startPackages(rows = []) {
  return (rows || []).filter((p) => !p.archived).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || text(a.name).localeCompare(text(b.name)));
}

// ---------------------------------------------------------------- days

/** The builder's start days: the next 12 Mondays from today (M28 offers Mondays). A start already chosen stays. */
export function startDays(todayKey, chosen = null, n = 12) {
  const first = addDays(todayKey, ((8 - weekdayOf(todayKey)) % 7) || 7);
  const days = Array.from({ length: n }, (_, i) => addDays(first, i * 7));
  if (chosen && !days.includes(chosen)) days.unshift(chosen);
  return days.map((d) => ({ value: d, label: dayKeyWords(d, { year: true }) }));
}
/** The end-date choices: suggested, then 2, 4 and 8 weeks spare; a date already picked stays in the list. */
export function endDays(t) {
  if (!t?.startsOn) return [];
  const o = endOptions(suggestEnd(t.startsOn, t.blocks, t.rhythm));
  if (t.endsOn && !o.some((x) => x.value === t.endsOn)) o.push({ value: t.endsOn, label: dayKeyWords(t.endsOn, { year: true }) });
  return o;
}

// ---------------------------------------------------------------- the draft

/**
 * A new draft: the agreement's row and its first version's (061 and 065), from a package or a kind.
 * @param {{ pkg?: object, kind?: string, who: { profile?: object, organisation?: object }, coach: { id, full_name?, display_first_name? },
 *   isOwner: boolean, ids: { agreementId, versionId }, todayKey: string, renewFrom?: { agreement, version } }} a
 */
export function newDraft({ pkg = null, kind = null, who = {}, coach = {}, isOwner = true, ids, todayKey, renewFrom = null }) {
  const profile = who.profile || null;
  const organisation = who.organisation || null;
  const forOrg = Boolean(organisation) && !profile;
  const coachName = text(coach.full_name) || text(coach.display_first_name) || '';
  const startsOn = startDays(todayKey)[0].value;
  const facts = {
    funded: forOrg, orgName: organisation?.name || null, clientName: text(profile?.name) || (forOrg ? '' : ''),
    clientFirst: firstOf(profile?.name), coachName, coachFirst: firstOf(coachName) || text(coach.display_first_name), startsOn,
  };
  let terms;
  if (renewFrom?.version?.terms) {
    terms = nextTermDraft(renewFrom.version.terms);
    if (terms.startsOn && Array.isArray(terms.blocks) && terms.blocks.length) terms.endsOn = suggestEnd(terms.startsOn, terms.blocks, terms.rhythm);
  } else if (pkg) {
    terms = fromPackageTerms(pkg, facts);
  } else {
    terms = { ...blankTerms(kind || (forOrg ? 'team' : 'sessions')), ...pick(facts, ['clientName', 'clientFirst', 'coachName', 'coachFirst']) };
    terms.funder = forOrg ? 'org' : 'self';
    terms.fundedBy = forOrg ? organisation.name : null;
    terms.orgName = organisation?.name || null;
    terms.startsOn = startsOn;
    if (Array.isArray(terms.blocks)) terms.endsOn = suggestEnd(startsOn, terms.blocks, terms.rhythm);
  }
  if (kindOf(terms) === 'team' && organisation) terms.orgName = organisation.name;
  const k = kindOf(terms);
  const agreement = {
    id: ids.agreementId, coach_id: coach.id, kind: forOrg || k === 'team' ? 'sponsor' : 'coaching',
    profile_id: profile?.id || null, organisation_id: organisation?.id || profile?.organisation_id || null, status: 'draft', current_version: 1,
    agreement_kind: k, package_id: pkg?.id || renewFrom?.agreement?.package_id || null,
    // An associate's agreement waits for the owner's approval before it goes (risk 23; FOUNDATION: B marks it).
    approval: 'not_needed', renews_id: renewFrom?.agreement?.id || null,
  };
  if (agreement.kind === 'coaching') agreement.organisation_id = profile?.organisation_id || null;
  if (agreement.kind === 'sponsor' && !agreement.organisation_id) agreement.kind = 'coaching';
  const version = {
    id: ids.versionId, agreement_id: ids.agreementId, coach_id: coach.id, version: 1, status: 'draft', terms, clauses: [], overrides: {},
    currency: 'GBP', fx_rate: null, fx_at: null, total_minor: totalMinor(terms), funded_by: selfFunded(terms) ? null : (terms.fundedBy || terms.orgName || null),
    personal_note: terms.personalNote || null, send_as: 'agreement',
  };
  return { agreement, version, isOwner };
}

/** A package's terms for one client (Polish 1, Stage C: the questionnaire's "What are you offering?" fills from it). */
export const termsFromPackage = (pkg, facts = {}) => fromPackageTerms(pkg, { funded: false, startsOn: null, ...facts });

function fromPackageTerms(pkg, facts) {
  const kind = pkgKind(pkg);
  const d = isObj(pkg.defaults) ? copy(pkg.defaults) : {};
  const t = { ...blankTerms(kind), ...d, kind };
  t.coaching = text(pkg.name) || t.coaching || '';
  t.healthCheck = d.healthCheck === true;
  t.offerUpfront = d.offerUpfront !== false && kind !== 'hours' && kind !== 'team';
  t.currency = isCurrency(pkg.currency) ? pkg.currency : 'GBP';
  const price = priceFor(pkg, facts.funded) ?? priceFor(pkg, !facts.funded);
  if (price != null) {
    if (kind === 'sessions') { if (t.priceMode === 'hourly') t.rateMinor = t.rateMinor || null; else if (t.priceMode === 'monthly') t.monthlyMinor = t.monthlyMinor || null; else t.totalMinor = price; }
    if (kind === 'retainer') t.retainer = { ...blankTerms('retainer').retainer, ...(t.retainer || {}), feeMinor: price };
    if (kind === 'team') t.team = { ...blankTerms('team').team, ...(t.team || {}), totalMinor: price };
    if (kind === 'oneoff') t.oneoff = { ...blankTerms('oneoff').oneoff, ...(t.oneoff || {}), totalMinor: price };
    if (kind === 'hours') t.hours = { ...blankTerms('hours').hours, ...(t.hours || {}), blockMinor: price };
  }
  if (kind === 'oneoff' && !text(t.work)) t.work = text(pkg.detail);
  t.funder = facts.funded ? 'org' : 'self';
  t.fundedBy = facts.funded ? facts.orgName : null;
  for (const k of ['clientName', 'clientFirst', 'coachName', 'coachFirst', 'orgName']) if (facts[k]) t[k] = facts[k];
  t.startsOn = facts.startsOn;
  if (kind === 'oneoff') t.oneoff = { ...t.oneoff, on: t.oneoff?.on || facts.startsOn };
  if (t.startsOn && Array.isArray(t.blocks) && t.blocks.length) { t.endsOn = suggestEnd(t.startsOn, t.blocks, t.rhythm); t.endsPicked = false; }
  t.personalNote = personalNoteFor(pkg.personal_note, facts.clientFirst);
  return t;
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));

/** The next version's draft (a change made as a new version, M28's newVersion): the newest version's terms and edits. */
export function nextVersionDraft({ agreement, versions = [], versionId, coachId }) {
  const mine = versions.filter((v) => v.agreement_id === agreement.id).sort((a, b) => b.version - a.version);
  const last = mine[0] || null;
  return {
    id: versionId, agreement_id: agreement.id, coach_id: coachId || agreement.coach_id, version: (last?.version || 0) + 1, status: 'draft',
    terms: copy(last?.terms || {}), clauses: [], overrides: copy(last?.overrides || {}), currency: last?.currency || 'GBP', fx_rate: last?.fx_rate ?? null,
    fx_at: last?.fx_at ?? null, total_minor: last?.total_minor ?? null, funded_by: last?.funded_by ?? null, personal_note: last?.personal_note || null, send_as: 'agreement',
  };
}

/** The version being built: the agreement's newest draft, or null when every version has gone out. */
export function draftVersion(agreementId, versions = []) {
  return versions.filter((v) => v.agreement_id === agreementId && v.status === 'draft').sort((a, b) => b.version - a.version)[0] || null;
}
/** The agreement's newest version, whatever its state. */
export function newestVersion(agreementId, versions = []) {
  return versions.filter((v) => v.agreement_id === agreementId).sort((a, b) => b.version - a.version)[0] || null;
}

// ---------------------------------------------------------------- changes to the terms

/**
 * The terms with one change made (`change` holds the keys that changed; nested parts such as `retainer` are merged).
 * A new start, blocks or How often moves the end date with them unless the coach picked one (item 6); picking the
 * suggested date again is the same as not picking.
 */
export function withChange(t, change = {}) {
  if (change.kind && change.kind !== kindOf(t)) return switchKind(t, change.kind);
  const next = { ...t };
  for (const [k, v] of Object.entries(change)) {
    next[k] = isObj(v) && isObj(t?.[k]) && !['visitDays'].includes(k) ? { ...t[k], ...v } : v;
  }
  if (change.team?.sessions) {
    const found = TEAM_SESSIONS.find((s) => s.value === change.team.sessions);
    if (found) next.blocks = copy(found.blocks);
  }
  if (change.funder) {
    next.fundedBy = change.funder === 'org' ? (text(next.orgName) || text(t.fundedBy) || null) : null;
    if (change.funder === 'org') { next.offerUpfront = t.offerUpfront; }
  }
  if (change.orgName !== undefined && next.funder === 'org') next.fundedBy = text(change.orgName) || null;
  const moved = ['startsOn', 'blocks', 'rhythm'].some((k) => k in change) || change.team?.sessions;
  if ('endsOn' in change && next.startsOn && Array.isArray(next.blocks)) {
    next.endsPicked = change.endsOn !== suggestEnd(next.startsOn, next.blocks, next.rhythm);
  } else if (moved && next.startsOn && Array.isArray(next.blocks) && next.blocks.length && !next.endsPicked) {
    next.endsOn = suggestEnd(next.startsOn, next.blocks, next.rhythm);
  }
  return next;
}

/** The terms moved to another kind: what both kinds share is kept (who, money's currency, the terms), the rest starts afresh. */
export function switchKind(t, kind) {
  const fresh = blankTerms(kind);
  const keep = ['coaching', 'clientName', 'clientFirst', 'coachName', 'coachFirst', 'orgName', 'personalNote', 'currency', 'fxRate', 'noticeHours',
    'dueDays', 'expiryDays', 'pausing', 'place', 'startsOn', 'level', 'goals'];
  const next = { ...fresh, ...pick(t || {}, keep) };
  if (kind !== 'team') { next.funder = t?.funder || 'self'; next.fundedBy = t?.funder === 'org' ? t.fundedBy || t.orgName || null : null; }
  if (kind === 'team') { next.funder = 'org'; next.fundedBy = t?.orgName || t?.fundedBy || null; next.offerUpfront = false; }
  if (kind === 'hours') next.offerUpfront = false;
  if (kind === 'oneoff') next.oneoff = { ...next.oneoff, on: t?.startsOn || null };
  if (next.startsOn && Array.isArray(next.blocks) && next.blocks.length) next.endsOn = suggestEnd(next.startsOn, next.blocks, next.rhythm);
  // The price typed so far comes along (a total stays a total; a fee becomes the new kind's price).
  const had = t ? pricedAmount(t) : 0;
  if (had > 0) {
    if (kind === 'sessions') { next.priceMode = 'total'; next.totalMinor = had; }
    if (kind === 'retainer') next.retainer = { ...next.retainer, feeMinor: had };
    if (kind === 'team') next.team = { ...next.team, totalMinor: had };
    if (kind === 'oneoff') next.oneoff = { ...next.oneoff, totalMinor: had };
    if (kind === 'hours') next.hours = { ...next.hours, blockMinor: had };
  }
  return next;
}

/** Adds a block of coaching sessions (M28's addBlock: 1 of 60 minutes). */
export const addBlock = (t) => withChange(t, { blocks: [...(t.blocks || []), { n: 1, minutes: 60 }] });
/** Takes one away (only while there are two or more). */
export const removeBlock = (t, i) => ((t.blocks || []).length > 1 ? withChange(t, { blocks: t.blocks.filter((_, j) => j !== i) }) : t);
/** One block's count or length changed. */
export const setBlock = (t, i, part) => withChange(t, { blocks: (t.blocks || []).map((b, j) => (j === i ? { ...b, ...part } : b)) });

/** A discount added from the small form (M28's addDisc): returning % or reduced (typed in the currency's units). */
export function addDiscount(t, { type, amount }) {
  const n = Number(String(amount ?? '').replace(/[^\d.]/g, ''));
  if (!(n > 0)) return { terms: t, problem: 'Add how much off first.' };
  if (type === 'returning' && n > 100) return { terms: t, problem: 'A discount is at most 100%.' };
  const d = type === 'reduced' ? { type: 'reduced', amountMinor: Math.round(n * unitOf(t.currency)) } : { type: 'returning', percent: n };
  return { terms: withChange(t, { discounts: [...(t.discounts || []), d] }), problem: null };
}
const unitOf = (c) => (c === 'JPY' ? 1 : 100);

/** An extra offered on quotes (065's agreement_extras row or one of M28's four), as the terms keep it. */
export const extraOf = (row) => ({ key: row.key, title: row.title, priceMinor: Number(row.price_minor ?? row.priceMinor) || 0, hint: row.hint || null });
/** The coach's extras to choose from: their own list, else M28's four. */
export function extrasList(rows = []) {
  const own = (rows || []).filter((r) => !r.archived).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0)).map(extraOf);
  return own.length ? own : DEFAULT_EXTRAS.map((e) => ({ ...e }));
}
/** "Visit day, £2,500" or "Health Check with a debrief, £1,500, for teams and CEOs" (M28's extraopts). */
export const extraLine = (e, c = 'GBP') => [e.title, moneyText(e.priceMinor || 0, c), e.hint].filter(Boolean).join(', ');

// ---------------------------------------------------------------- prices and lines

/** The version's total_minor: what the agreement is for before the client's choice (in full keeps its 5% off). */
export function totalMinor(t) {
  return agreementTotal(t, 'plan');
}

/** The amount the price warning reads (a set price only: a total for sessions, the fee, the team's or one-off's total). */
const pricedAmount = (t) => {
  const k = kindOf(t);
  if (k === 'sessions') return t.priceMode === 'total' ? Number(t.totalMinor) || 0 : null;
  if (k === 'retainer') return Number(t.retainer?.feeMinor) || 0;
  if (k === 'team') return Number(t.team?.totalMinor) || 0;
  if (k === 'oneoff') return Number(t.oneoff?.totalMinor) || 0;
  return Number(t.hours?.blockMinor) || 0;
};

/**
 * The £ side of another currency (item 42): { line, warn, match } where `rate` is £ per unit and `packageGbpMinor`
 * the package's £ price. Never blocks anything.
 */
export function fxLines(t, { rate, packageGbpMinor = null, day = null } = {}) {
  const c = t?.currency || 'GBP';
  if (c === 'GBP' || !(Number(rate) > 0)) return { line: '', warn: '', match: null, day };
  const k = kindOf(t);
  const amount = k === 'sessions' ? planTotal(t) : pricedAmount(t);
  const line = k === 'retainer' ? fxLineMonthly(amount, c, rate) : fxLine(amount, c, rate);
  const priced = pricedAmount(t);
  const under = priced != null && packageGbpMinor ? underBy(priced, c, rate, packageGbpMinor) : 0;
  return { line, warn: under > 0 ? underLine(under, packageGbpMinor) : '', match: under > 0 ? matchMyPrice(packageGbpMinor, c, rate) : null, day };
}
/** The price set to Match my £ price (the same part the warning read). */
export function matched(t, minor) {
  const k = kindOf(t);
  if (k === 'sessions') return withChange(t, { totalMinor: minor });
  if (k === 'retainer') return withChange(t, { retainer: { feeMinor: minor } });
  if (k === 'team') return withChange(t, { team: { totalMinor: minor } });
  if (k === 'oneoff') return withChange(t, { oneoff: { totalMinor: minor } });
  return withChange(t, { hours: { blockMinor: minor } });
}

/** £ per unit and its day from coach_fx_rates() ({ day, rates: { EUR: units per £1 } }). */
export function rateOf(answer, c) {
  if (c === 'GBP') return { rate: 1, unitsPerGbp: 1, day: answer?.day || null };
  const units = Number(answer?.rates?.[c]);
  return units > 0 ? { rate: perUnit(units), unitsPerGbp: units, day: answer?.day || null } : { rate: null, unitsPerGbp: null, day: null };
}

/**
 * The builder's lines under its parts (M28's T): sessions, end date, hourly, in all, first payment, up front, the
 * live view's last line, and a block of hours' size.
 */
export function builderLines(t, { first = 'they', orgName = null } = {}) {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const self = selfFunded(t);
  const pay = firstPayment(t, t.choice ?? 'upfront');
  const funder = t.fundedBy || orgName || t.orgName || 'the organisation';
  const lines = {
    sessions: Array.isArray(t.blocks) && t.blocks.length ? sessionsSummary(t) : '',
    end: t.startsOn && Array.isArray(t.blocks) && t.blocks.length ? endHint({ start: t.startsOn, count: t.blocks, rhythm: t.rhythm, end: t.endsOn, picked: t.endsPicked }) : '',
    hourly: k === 'sessions' && t.priceMode === 'hourly' ? hourlyLine(t) : '',
    fin: k === 'sessions' ? finLine({ ...t, visitDays: t.visitDays?.n ? t.visitDays : null }, finalTotal(t, t.choice ?? 'upfront')) : '',
    firstPay: self ? `${first} settles ${moneyText(pay, c)} when signing, as the last step of agreeing.` : `${funder} is invoiced, so ${first} settles nothing when signing.`,
    upfront: (k === 'sessions' || k === 'retainer') && t.offerUpfront !== false ? upfrontLine(t) : '',
    short: k === 'team' || k === 'hours' ? '' : `In all: ${moneyText(liveTotal(t), c)}. Settled when signing: ${self ? moneyText(pay, c) : `nothing, invoiced to ${funder}`}.`,
    block: k === 'hours' ? `That’s ${hoursWords(blockMinutes(t.hours?.blockMinor, t.hours?.rateMinor))}, settled in full, up front.` : '',
  };
  return lines;
}
const liveTotal = (t) => {
  const k = kindOf(t);
  if (k === 'sessions') return finalTotal(t, t.choice ?? 'upfront');
  if (k === 'retainer') return Number(t.retainer?.feeMinor) || 0;
  return totalMinor(t);
};

/** Settling's choices for the kind (sessions' four, the team's three, a one-off's two). */
export function settleChoices(t) {
  const k = kindOf(t);
  if (k === 'team') return teamOptions(t);
  if (k === 'oneoff') return [{ value: 'before', label: 'In full, up front' }, { value: 'after', label: 'In full, after the work' }];
  return settleOptions(t);
}

/** The discount's label and amount line in the builder (M28's discounts render): "−£2,700". */
export { discountLines } from '../agreements/pricing.js';

// ---------------------------------------------------------------- the coach's own standard wording

/**
 * The coach's standard wording for a kind, newest version per clause (065's agreement_clause_standards, insert only):
 * { [key]: { version, title, paragraphs, id, created_at } }. An associate reads the owner's (pass the owner's rows).
 */
export function standardsFor(rows = [], kind) {
  const out = {};
  for (const r of rows || []) {
    if (r.agreement_kind !== kind) continue;
    const had = out[r.clause_key];
    if (!had || Number(r.version) > had.version) out[r.clause_key] = { version: Number(r.version), title: r.title, paragraphs: r.paragraphs, id: r.id, created_at: r.created_at };
  }
  return out;
}

/** "Use this wording for everyone": a new standard version, never a change to one (sent agreements keep theirs). */
export function newStandardRow({ id, coachId, kind, key, title, paragraphs, standards = {}, fromAgreement = null }) {
  return {
    id, coach_id: coachId, agreement_kind: kind, clause_key: key, version: (standards[key]?.version || 0) + 1, title,
    paragraphs: (paragraphs || []).map((p) => ({ text: text(p.text), why: text(p.why) || null })), from_agreement: fromAgreement,
  };
}

/** Sample terms a standard is shown with in Settings (the kind's own figures, Sam's example names from M28). */
export function sampleTerms(kind, coach = {}) {
  const t = blankTerms(kind);
  t.clientName = 'your client';
  t.clientFirst = 'your client';
  t.coachName = text(coach.full_name) || text(coach.display_first_name) || 'your coach';
  return t;
}

/**
 * The clause library's rows (M28's s-library): "4. Rearranging and cancelling" with "Edited for Sam", "Your standard,
 * changed today" or "Your standard wording".
 */
export function libraryRows(t, { standards = {}, overrides = {}, first = 'them', todayKey = null, standard = false } = {}) {
  return buildClauses(t, { standards, overrides }).map((c) => {
    const own = standards[c.key];
    const changedToday = own && todayKey && String(own.created_at || '').slice(0, 10) === todayKey;
    let line = 'Your standard wording';
    if (!standard && c.edited) line = `Edited for ${first}`;
    else if (own) line = changedToday ? 'Your standard, changed today' : `Your standard, version ${own.version}`;
    return { key: c.key, number: c.number, title: c.title, label: `${c.number}. ${c.title}`, line, edited: !standard && c.edited };
  });
}
/**
 * When a kind's standard wording last changed (Polish 1, Stage C: the card's "Updated 12 Nov"): the newest of its
 * versions' created_at, as stored (the page reads it through parseDbTimestamp), or null while it's the first wording.
 */
export function standardsChangedAt(rows = [], kind = 'sessions') {
  return (rows || []).filter((r) => r.agreement_kind === kind && r.created_at).map((r) => String(r.created_at)).sort().pop() || null;
}
/** The standard's own versions of one clause, newest first: [{ version, created_at, title, paragraphs }] (each dated). */
export function clauseVersions(rows = [], kind, key) {
  return (rows || []).filter((r) => r.agreement_kind === kind && r.clause_key === key).sort((a, b) => Number(b.version) - Number(a.version))
    .map((r) => ({ version: Number(r.version), created_at: r.created_at || null, title: r.title, paragraphs: r.paragraphs }));
}

/** "11 clauses" or "11 clauses, changed today" (M28's stdLine). */
export function standardLine(kind, rows = [], todayKey = null) {
  const n = clauseKeys(blankTerms(kind)).length;
  const today = todayKey && (rows || []).some((r) => r.agreement_kind === kind && String(r.created_at || '').slice(0, 10) === todayKey);
  return `${n} clauses${today ? ', changed today' : ''}`;
}
export const isClauseKey = (key) => ALL_CLAUSE_KEYS.includes(key);

/** The paragraphs being edited differ from the standard's (M28's editDiffers). */
export function differsFrom(paragraphs, std) {
  const a = (paragraphs || []).map((p) => [text(p.text), text(p.why) || null]);
  const b = (std || []).map((p) => [text(p.text), text(p.why) || null]);
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ---------------------------------------------------------------- the version as saved and sent

/**
 * The version's own fields from its terms: clauses as stored (both settling texts where the client chooses), the
 * currency with today's rate (units per £1, 061's way round), the total and who funds it. `rate` is rateOf()'s answer.
 */
export function versionFields(t, { standards = {}, overrides = {}, rate = null, now = new Date() } = {}) {
  const c = t.currency || 'GBP';
  const out = {
    terms: t,
    clauses: forStorage(t, { standards, overrides }),
    total_minor: totalMinor(t),
    funded_by: selfFunded(t) ? null : (text(t.fundedBy) || text(t.orgName) || null),
    overrides: overrides || {},
  };
  if (c === 'GBP') return { ...out, currency: 'GBP', fx_rate: null, fx_at: null };
  // A version in another currency keeps its rate (061's check); until today's rate is here it stays as it was.
  if (rate?.unitsPerGbp > 0) return { ...out, currency: c, fx_rate: Number(rate.unitsPerGbp.toFixed(6)), fx_at: now.toISOString(), terms: { ...t, fxRate: Number(rate.unitsPerGbp.toFixed(6)) } };
  return out;
}

/** The agreement as its reader sees it (Preview, and the live view): Main points and the clauses, up front chosen. */
export function readerView(t, { standards = {}, overrides = {}, choice = null } = {}) {
  const pick = choice ?? t.choice ?? 'upfront';
  const clauses = resolveChoice(forStorage(t, { standards, overrides }), pick);
  return { points: mainPoints(t, { choice: pick, clauses }), clauses };
}

/** What still stops sending, as calm lines (terms.checkTerms plus the version's rate). */
export function sendProblems(t, { rate = null } = {}) {
  const out = [];
  if ((t.currency || 'GBP') !== 'GBP' && !(rate?.unitsPerGbp > 0)) out.push('Today’s rate for that currency hasn’t loaded. Check your connection and try again.');
  return out;
}

/** The send's body (asks.js agreements.send). */
export function sendBody({ agreement, version, signatureId = null, newSignature = null, personalNote = '', sendAs = 'agreement', validDays = 30, quoteId = null }) {
  return {
    agreementId: agreement.id, versionId: version.id, ...(signatureId ? { signatureId } : {}), ...(newSignature ? { newSignature } : {}),
    personalNote: text(personalNote), sendAs, ...(sendAs === 'quote' ? { validDays: Number(validDays) || 30, quoteId } : {}),
  };
}

/**
 * The rows a send writes when the server isn't built yet (asks.js's stand-in, never on the live site): the version
 * signed by the coach and sent, the agreement sent. A quote leaves the version a draft (065: held while out).
 */
export function sentRows({ agreement, version, signatureId = null, sentAt, sendAs = 'agreement', todayKey }) {
  const t = version.terms || {};
  if (sendAs === 'quote') {
    return { agreement: { ...agreement }, version: { ...version, send_as: 'quote', coach_signed_at: sentAt, coach_signature_id: signatureId || version.coach_signature_id || null } };
  }
  return {
    agreement: { ...agreement, status: 'sent', current_version: version.version },
    version: { ...version, status: 'sent', sent_at: sentAt, coach_signed_at: sentAt, coach_signature_id: signatureId || version.coach_signature_id || null, send_as: 'agreement',
      expires_on: addDays(todayKey, Number(t.expiryDays) || 30) },
  };
}

// ---------------------------------------------------------------- check before sending

/** The send button's words (M28): "Sign and send to Sam", to the sponsor, the quote's own. */
export const sendWords = ({ kind, first, sendAs = 'agreement' }) => (sendAs === 'quote' ? 'Sign and send the quote'
  : kind === 'team' ? 'Sign and send to the sponsor' : `Sign and send to ${first || 'them'}`);

// ---------------------------------------------------------------- the client page's Agreement fold

/**
 * The client page's Agreement fold (M28 s-client and s-sent): the line under its heading, and, once something is
 * sent, its heading and the Sent, Opened, Signed and Settled rows with the expiry line.
 * @returns {{ line, summary, agreement, version, quote, head, rows, title, sentLine, expiry, waitingApproval }}
 */
export function foldModel({ agreements = [], versions = [], quotes = [], opens = [], invoices = [], profileId, first, ownerFirst = 'Tim', now = new Date() }) {
  const theirs = agreements.filter((a) => a.profile_id === profileId && (a.kind || 'coaching') === 'coaching')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const live = theirs.filter((a) => !['ended', 'ended_not_renewed', 'cancelled', 'expired'].includes(a.status));
  // The one that has gone out (sent or signed) wins over newer drafts beside it (UI finding 7: s-sent showed a draft).
  const out = (a) => versions.some((v) => v.agreement_id === a.id && (v.status === 'sent' || v.status === 'signed'
    || quotes.some((q) => q.version_id === v.id && q.status !== 'draft' && q.status !== 'withdrawn')));
  const current = live.find(out) || live[0] || null;
  const last = theirs.find((a) => ['ended', 'ended_not_renewed'].includes(a.status)) || null;
  const empty = { agreement: null, version: null, quote: null, head: '', rows: [], title: '', sentLine: '', expiry: '', waitingApproval: false };
  if (!current) {
    const endedOn = last ? newestVersion(last.id, versions)?.terms?.endsOn || last.ending_on : null;
    return { ...empty, line: last ? (endedOn ? `${possessive(first)} last agreement ended on ${dayKeyWords(endedOn)}.` : `${possessive(first)} last agreement has ended.`) : `${first} has no agreement yet.`, summary: last ? 'Ended' : '' };
  }
  const mine = versions.filter((v) => v.agreement_id === current.id).sort((a, b) => b.version - a.version);
  const sent = mine.find((v) => v.status === 'sent' || v.status === 'signed') || null;
  const draft = mine.find((v) => v.status === 'draft') || null;
  const quote = draft ? quotes.find((q) => q.version_id === draft.id && q.status !== 'draft' && q.status !== 'withdrawn') || null : null;
  const waitingApproval = current.approval === 'waiting' || current.approval === 'changes_asked';
  const shown = sent || draft;
  const t = shown?.terms || {};
  let line;
  if (sent?.status === 'signed' || sent?.client_signed_at) line = `Version ${sent.version}, signed.${t.startsOn && t.endsOn ? ` ${dayKeyWords(t.startsOn, { year: true })} to ${dayKeyWords(t.endsOn, { year: true })}.` : ''}`;
  else if (sent) line = `Version ${sent.version} is waiting for ${first} to sign.`;
  else if (quote) line = `Quote ${quote.number ? quoteNumber(quote.number) : ''} is with ${first}.`.replace('Quote  is', 'A quote is');
  else if (waitingApproval) line = current.approval === 'changes_asked' ? `${ownerFirst} asked for a change before version ${draft?.version || 1} goes.` : `Version ${draft?.version || 1} is waiting for ${ownerFirst} to approve it.`;
  else line = `Version ${draft?.version || 1} is a draft. Nothing has gone to ${first} yet.`;
  if (!sent && !quote) return { ...empty, agreement: current, version: draft, line, summary: waitingApproval ? 'Waiting for approval' : 'Draft', waitingApproval };
  const version = sent || draft;
  const funded = Boolean(version.funded_by);
  const firstInvoice = funded ? null : invoices.filter((i) => i.agreement_id === current.id && (i.version_id === version.id || !i.version_id))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null;
  const versionOpens = opens.filter((o) => (o.version_id && o.version_id === version.id) || (quote && o.quote_id === quote.id));
  const rows = quote && !sent
    ? agreementStatus({ version: { ...version, sent_at: quote.sent_at }, opens: versionOpens, firstInvoice: null, now }).slice(0, 2)
    : agreementStatus({ version, opens: versionOpens, firstInvoice, orgName: version.funded_by, now });
  const head = quote && !sent ? `Quote ${quote.number ? quoteNumber(quote.number) : ''}`.trim() : `Agreement, version ${version.version}`;
  const signedNow = Boolean(version.client_signed_at);
  return {
    line, summary: signedNow ? 'Signed' : rows.find((r) => r.label === 'Opened')?.done ? 'Opened' : 'Sent', agreement: current, version, quote: quote && !sent ? quote : null,
    head, rows, title: sentTitle({ version, firstName: first, quote: quote && !sent ? quote : null }),
    sentLine: sentLine({ version, quote: quote && !sent ? quote : null, now }),
    expiry: quote && !sent ? '' : expiryLine({ version, firstName: first }), waitingApproval,
  };
}
export { NOT_YET };

/** The organisation page's line (sponsor agreements): its newest sponsor agreement, like a client's. */
export function orgFold({ agreements = [], versions = [], organisationId, name }) {
  const theirs = agreements.filter((a) => a.kind === 'sponsor' && a.organisation_id === organisationId)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const a = theirs[0] || null;
  if (!a) return { agreement: null, line: '' };
  const v = newestVersion(a.id, versions);
  const line = v?.sponsor_signed_at ? `Version ${v.version}, signed by ${name}.` : v?.status === 'sent' ? `Version ${v.version} is waiting for ${name}’s sponsor to sign.` : `Version ${v?.version || 1} is a draft.`;
  return { agreement: a, version: v, line };
}

/** The live view's people line (a team's "Coaching for"): "Sam Reid, Jo Patel and Alex Morgan". */
export const peopleLine = (t) => andList((t.team?.people || []).map((p) => p.name)) || 'No one yet';
export { lowerFirst };

// ---------------------------------------------------------------- a package's own defaults (Settings, Agreements)

/** A package's terms for the builder in package mode (no client, no dates). */
export function packageTerms(pkg) {
  const kind = pkgKind(pkg);
  return fromPackageTerms(pkg, { funded: kind === 'team', startsOn: null });
}
const NOT_DEFAULTS = ['clientName', 'clientFirst', 'coachName', 'coachFirst', 'orgName', 'personalNote', 'startsOn', 'endsOn', 'endsPicked', 'fundedBy',
  'funder', 'choice', 'extrasChosen', 'fxRate', 'coaching', 'kind', 'totalMinor', 'work', 'clientZone', 'basedIn', 'organisationId', 'poNumber', 'poAnswer', 'localMode'];
/**
 * The package's row with these terms as its defaults (065's pricing_packages.defaults), the price in the column it
 * belongs to (an organisation's for a team, a person's otherwise) and the note with [name] kept for each client.
 */
export function packageChange(pkg, t, note) {
  const kind = kindOf(t);
  const defaults = Object.fromEntries(Object.entries(t).filter(([k]) => !NOT_DEFAULTS.includes(k)));
  const price = pricedAmount(t);
  if (defaults.retainer) defaults.retainer = { ...defaults.retainer, feeMinor: undefined };
  if (defaults.team) defaults.team = { ...defaults.team, totalMinor: undefined, people: [] };
  if (defaults.oneoff) defaults.oneoff = { ...defaults.oneoff, totalMinor: undefined, on: null };
  if (defaults.hours) defaults.hours = { ...defaults.hours, blockMinor: undefined };
  const row = { ...pkg, agreement_kind: kind, defaults: JSON.parse(JSON.stringify(defaults)), currency: t.currency || 'GBP', personal_note: text(note) || null };
  if (kind === 'oneoff' && text(t.work)) row.detail = text(t.work).slice(0, 120);
  // Set by the month (Polish 1, Stage C), the package's price is the term's total; the month's fee is in its defaults.
  const monthly = kind === 'sessions' && t.priceMode === 'monthly' ? (Number(t.monthlyMinor) || 0) * (Number(t.months) || 6) : null;
  if (kind === 'team') row.org_price_minor = price ?? null; else row.personal_price_minor = monthly ?? price ?? null;
  return row;
}
