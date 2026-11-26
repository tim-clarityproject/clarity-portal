import { dayKeyWords } from '../time/index.js';
import { andList, hoursWords, lowerFirst, moneyText, rateText, upperFirst } from './currency.js';
import { blockMinutes } from './hours.js';
import { investmentWords, teamOptions } from './settling.js';
import { ALL_CLAUSE_KEYS, clauseKeys, PROVIDER, sessionsText, STANDARD } from './standardWording.js';
import { kindOf, PLACES, selfFunded } from './terms.js';
import { canChoose } from './upfront.js';

// An agreement's clauses as its reader sees them (brief items 15 to 17; M28's clauses(), points()): the standard
// wording for its kind (standardWording.js, or the coach's own newer standard), each agreement's own edits on top
// (agreement_versions.overrides, each linked to the standard it changed), numbered in order with no gaps whichever
// clauses it has. Every signed version stores its full text as signed (version.clauses).
//
// A clause: { key, number, title, paragraphs: [{ text, why }], money, base, edited, choices? }
//   base     'code' (version 0) or 'v<N>' (the coach's standard version N)
//   money    the one clause a client funded by an organisation never sees (061's cut)
//   choices  { upfront, plan }: the investment clause's paragraphs for each way of settling, stored together where the
//            client chooses at signing, so the text they sign is exactly what was sent (resolveChoice picks one).
// Checked by tests/performance/agreements-clauses.test.mjs.

const FILL = /\{(noticeHours|dueDays)\}/g;
/** A standard's text with the agreement's own figures: "{noticeHours}" and "{dueDays}". */
export const fill = (text, t) => String(text || '').replace(FILL, (_, k) => String(k === 'noticeHours' ? (t?.noticeHours ?? 24) : (t?.dueDays ?? 14)));
const filled = (paragraphs, t) => (paragraphs || []).map((p) => ({ text: fill(p.text, t), why: p.why ? fill(p.why, t) : null }));
const sameText = (a, b) => JSON.stringify((a || []).map((p) => [p.text, p.why || null])) === JSON.stringify((b || []).map((p) => [p.text, p.why || null]));

/**
 * The standard clause for these terms: the coach's newest standard version where there is one (`standards[key]`:
 * { version, title, paragraphs }), else the code's.
 */
export function standardClause(key, t, { standards = {}, choice } = {}) {
  const code = STANDARD[key]?.(t, { choice });
  if (!code) return null;
  const own = standards?.[key];
  if (own && Array.isArray(own.paragraphs) && own.paragraphs.length) {
    return { key, title: own.title || code.title, paragraphs: filled(own.paragraphs, t), money: Boolean(code.money), base: `v${own.version}` };
  }
  return { key, title: code.title, paragraphs: code.paragraphs, money: Boolean(code.money), base: 'code' };
}

/** Numbers clauses 1, 2, 3… in order, whichever there are. */
export const number = (list) => list.map((c, i) => ({ ...c, number: i + 1 }));

/**
 * The agreement's clauses, numbered: the standard for its kind, the agreement's own edits on top.
 * @param {object} t terms
 * @param {{ standards?: object, overrides?: object, choice?: 'upfront'|'plan', seesMoney?: boolean }} opts
 */
export function buildClauses(t, { standards = {}, overrides = {}, choice, seesMoney = true } = {}) {
  const list = clauseKeys(t).map((key) => {
    const std = standardClause(key, t, { standards, choice });
    const own = overrides?.[key];
    if (own && Array.isArray(own.paragraphs) && own.paragraphs.length) {
      const paragraphs = filled(own.paragraphs, t);
      return { ...std, title: own.title || std.title, paragraphs, base: own.base || std.base, edited: !sameText(paragraphs, std.paragraphs) };
    }
    return { ...std, edited: false };
  }).filter((c) => seesMoney || !c.money);
  return number(list);
}

/**
 * The clauses to store on a version as sent: where the client chooses between up front and the plan, the investment
 * clause carries both texts (`choices`), its own paragraphs being up front's (the starting choice).
 */
export function forStorage(t, opts = {}) {
  const up = buildClauses(t, { ...opts, choice: 'upfront' });
  if (!canChoose(t) || opts.overrides?.investment) return up;
  const plan = buildClauses(t, { ...opts, choice: 'plan' });
  return up.map((c, i) => (c.key === 'investment' ? { ...c, choices: { upfront: c.paragraphs, plan: plan[i].paragraphs } } : c));
}

/** The clauses with the client's choice applied (what they signed). */
export const resolveChoice = (clauses, choice) => (clauses || []).map((c) => (c.choices && c.choices[choice] ? { ...c, paragraphs: c.choices[choice] } : c));

/**
 * The stored clauses with the investment clause's paragraphs set to a choice made (a quote accepted with the plan: the
 * break-it tester, run 3, finding 7), keeping both texts in `choices` for the signing block. No choice: as they are.
 */
export const withChoice = (clauses, choice) => (choice === 'upfront' || choice === 'plan'
  ? (clauses || []).map((c) => (c.choices && c.choices[choice] ? { ...c, paragraphs: c.choices[choice] } : c))
  : clauses);

/** "9. Changing your mind in the first 14 days". */
export const clauseTitle = (c) => `${c.number}. ${c.title}`;

/** The keys of clauses edited for this agreement (their text differs from the standard). */
export const editedKeys = (t, opts = {}) => buildClauses(t, opts).filter((c) => c.edited).map((c) => c.key);

/** An override for one clause, linked to the standard it changed ("Just for Sam"). */
export function overrideFor(key, t, paragraphs, { standards = {}, title } = {}) {
  const std = standardClause(key, t, { standards });
  return { base: std?.base || 'code', title: title || std?.title, paragraphs: paragraphs.map((p) => ({ text: String(p.text || '').trim(), why: p.why ? String(p.why).trim() : null })) };
}

/** Every clause key, its title in the standard wording, for the clause library's list. */
export const libraryKeys = () => ALL_CLAUSE_KEYS;

// ---------------------------------------------------------------- Main points

const commitment = (t) => (kindOf(t) === 'retainer'
  ? { label: 'Commitment', value: '6-month terms, renewing unless either of us says otherwise' }
  : t.fullTerm
    ? { label: 'Commitment', value: 'The full 6 months, unless something exceptional happens' }
    : { label: 'Ending early', value: '30 days’ notice, in writing, from either of us' });

/**
 * Main points, at a glance (M28's points(), teamPoints(), hoursPoints()). A client funded by an organisation sees
 * Funded by in place of the money. `rearrangingEdited` adds ", as clause N sets out".
 */
export function mainPoints(t, { choice = t?.choice ?? 'upfront', seesMoney = selfFunded(t), clauses = null, paused = null, endingOn = null } = {}) {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const re = (() => {
    const cl = (clauses || []).find((x) => x.key === 'rearranging');
    return { label: 'Rearranging', value: `Up to ${t.noticeHours ?? 24} hours before, at no charge${cl?.edited ? `, as clause ${cl.number} sets out` : ''}` };
  })();
  const head = [{ label: 'Coaching provider', value: PROVIDER.name }, { label: 'Your coach', value: t.coachName || '' }];
  if (k === 'team') return teamPoints(t);
  if (k === 'hours') return hoursPoints(t);
  if (k === 'retainer') {
    return [...head,
      { label: 'Your coaching', value: t.coaching || 'Monthly coaching retainer' },
      { label: 'Coaching sessions', value: `${t.retainer?.sessions || ''}, ${PLACES[t.place] || PLACES.zoom}` },
      { label: 'Dates', value: t.startsOn ? `From ${dayKeyWords(t.startsOn, { year: true })}, ongoing, with a yearly price review` : 'Ongoing, with a yearly price review' },
      seesMoney ? { label: 'Your investment', value: upperFirst(investmentWords(t, choice)) } : { label: 'Funded by', value: t.fundedBy || '' },
      re, commitment(t)].filter((r) => r.value);
  }
  if (k === 'oneoff') {
    return [...head,
      { label: 'Your coaching', value: t.work || '' },
      { label: 'When', value: t.oneoff?.on ? dayKeyWords(t.oneoff.on, { year: true }) : '' },
      { label: 'Where', value: t.oneoff?.place === 'inperson' ? 'In person' : 'On Zoom' },
      seesMoney ? { label: 'Your investment', value: `${moneyText(Number(t.oneoff?.totalMinor) || 0, c)}, in full, ${t.oneoff?.settle === 'after' ? 'after the work' : 'up front'}` } : { label: 'Funded by', value: t.fundedBy || '' },
    ].filter((r) => r.value);
  }
  const inc = [];
  if (t.healthCheck) inc.push('a Health Check with a debrief');
  if (t.visitDays?.n) inc.push(`${t.visitDays.n} visit days`);
  for (const e of (t.extrasOffered || []).filter((x) => (t.extrasChosen || []).includes(x.key))) inc.push(lowerFirst(e.title));
  if (t.portal !== false) inc.push(`the ${t.level || 'Executive'} level of the portal`);
  return [...head,
    { label: 'Your coaching', value: t.coaching || '' },
    { label: 'Coaching sessions', value: sessionsText(t) },
    { label: 'Dates', value: t.startsOn && t.endsOn ? `${dayKeyWords(t.startsOn, { year: true })} to ${dayKeyWords(t.endsOn, { year: true })}` : '' },
    seesMoney ? { label: 'Your investment', value: upperFirst(investmentWords(t, choice)) } : { label: 'Funded by', value: t.fundedBy || '' },
    ...(t.adhoc === true ? [{ label: 'Between sessions', value: 'Ad hoc support by email and WhatsApp' }] : []),
    { label: 'Also included', value: upperFirst(andList(inc)) },
    ...(paused?.from && paused?.to ? [{ label: 'Paused', value: `${dayKeyWords(paused.from, { year: true })} to ${dayKeyWords(paused.to, { year: true })}` }] : []),
    ...(endingOn ? [{ label: 'Ending', value: dayKeyWords(endingOn, { year: true }) }] : []),
    re,
    { label: 'Session summaries', value: 'Shared with you automatically' },
    commitment(t),
  ].filter((r) => r.value);
}

/** A team programme's Main points, for the sponsor (M28's teamPoints). */
export function teamPoints(t) {
  const c = t.currency || 'GBP';
  const o = teamOptions(t).find((x) => x.value === t.team?.settle) || teamOptions(t)[0];
  return [
    { label: 'Coaching for', value: andList((t.team?.people || []).map((p) => p.name)) || 'No one yet' },
    { label: 'Coaching sessions', value: t.team?.sessions || '' },
    { label: 'Dates', value: t.startsOn && t.endsOn ? `${dayKeyWords(t.startsOn, { year: true })} to ${dayKeyWords(t.endsOn, { year: true })}` : '' },
    { label: 'Investment', value: `${moneyText(Number(t.team?.totalMinor) || 0, c)}: ${lowerFirst(o.label)}` },
    { label: 'Invoices to', value: t.team?.invoicesEmail || '' },
    ...(t.team?.needsPO ? [{ label: 'Purchase order', value: 'Needed before invoices go' }] : []),
    { label: 'What you’ll hear', value: 'When coaching starts and ends, and how many coaching sessions are used' },
  ].filter((r) => r.value);
}

/** A block of hours' Main points (M28's hoursPoints). */
export function hoursPoints(t) {
  const h = t.hours || {};
  const c = t.currency || 'GBP';
  return [
    { label: 'The work', value: h.work || '' },
    { label: 'Rate', value: rateText(Number(h.rateMinor) || 0, 'hour', c) },
    { label: 'Block', value: `${moneyText(Number(h.blockMinor) || 0, c)}, ${hoursWords(blockMinutes(h.blockMinor, h.rateMinor))}, settled up front` },
    { label: 'Who owns the work', value: h.owner === 'coach' ? `${t.coachFirst || 'Your coach'}, licensed to ${t.clientFirst || 'you'}` : `${t.clientFirst || 'You'}, once settled` },
    { label: 'You’ll see', value: 'Each piece of time logged, with its date and what it was for' },
  ].filter((r) => r.value);
}
