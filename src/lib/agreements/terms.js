import { isCurrency } from './currency.js';
import { DEFAULT_RHYTHM, isRhythm, sessionCount, suggestEnd } from './endDate.js';

// What an agreement is written from: its terms (agreement_versions.terms), one shape for every kind (Phase 6b run 3;
// brief items 1 to 7 and 37 to 39; M28's builders). Plain rules, checked by tests/performance/agreements-terms.test.mjs.
// Amounts are whole minor units of `currency`; days are day keys.
//
// @typedef {object} Terms
//   kind          'sessions' | 'retainer' | 'team' | 'oneoff' | 'hours'
//   coaching      the name shown as "Your coaching" ("6-month coaching")
//   funder        'self' | 'org';  fundedBy: the organisation's name when funded (061's key), else null
//   blocks        [{ n, minutes }]  coaching sessions in blocks of different lengths (1 × 90, then 15 × 60)
//   rhythm        one of RHYTHMS;  place: 'zoom' | 'inperson' | 'either'
//   startsOn, endsOn, endsPicked (the coach chose the end date)
//   level         the portal level included ('Executive');  healthCheck: false unless the coach adds it (item 7)
//   visitDays     { n, rateMinor } | null
//   priceMode     'total' | 'hourly' | 'monthly';  totalMinor, rateMinor, monthlyMinor, months
//   currency, fxRate (units of the currency to £1, as 061 keeps it), beyondRateMinor (a named rate beyond the package)
//   discounts     [{ type: 'returning', percent } | { type: 'reduced', amountMinor }]  each its own line (item 3)
//   settle        'full' | 'deposit' | 'equal' | 'delivered'  (sessions)
//   offerUpfront  true unless switched off (item 37);  choice: 'upfront' | 'plan' | null (the client's, at signing)
//   extrasOffered [{ key, title, priceMinor, hint }];  extrasChosen: [key]
//   expenses, noticeHours (24), dueDays (14), expiryDays (30), pausing (true), fullTerm (committed for 6 months, item 38)
//   retainer      { sessions: 'Up to 2 a month, 60 minutes each', feeMinor, invoice: 'monthly' | 'delivered' }
//   team          { people: [{ name, email, profileId }], sessions: '12 of 60 minutes each', totalMinor,
//                   settle: 'deposit' | 'equal' | 'full', needsPO, invoicesEmail, sponsor: { name, role, email } }
//   oneoff        { on, place: 'zoom' | 'inperson', totalMinor, settle: 'before' | 'after' };  work: what it is
//   hours         { work, rateMinor, blockMinor, owner: 'client' | 'coach', tellAt80 }
//   goals, clientName, clientFirst, coachName, coachFirst, orgName, personalNote, needsPO (a sponsor's version)
//   Polish 1, Stage C (M28 version 6's questionnaire; every key optional, so earlier versions read as before):
//   gbpMinor      the coach's own £ figure for the main price (a month's fee, a total, a block), set first; the price
//                 keys above hold the figure the client sees in `currency`
//   localMode     'up' | 'down' | 'exact' | 'own': how the client's figure was chosen from the £ figure
//   clientZone    the place-name zone the client is based in;  basedIn: "Toronto, Canada"
//   adhoc         ad hoc support by email and WhatsApp between coaching sessions (true unless switched off)
//   portal        The Clarity Portal included (true unless switched off), at `level`
//   after         'offer' | 'renew' | 'end': what happens after the term (set sessions)
//   poNumber      the purchase order's number when the coach has it;  organisationId: the funding organisation

export const KINDS = Object.freeze(['sessions', 'retainer', 'team', 'oneoff', 'hours']);
export const KIND_NAMES = Object.freeze({
  sessions: 'Set sessions over a period', retainer: 'Ongoing monthly retainer', team: 'Team or group programme',
  oneoff: 'One-off piece of work', hours: 'Block of hours',
});
export const PLACES = Object.freeze({ zoom: 'on Zoom', inperson: 'in person', either: 'on Zoom or in person' });
export const SESSION_LENGTHS = Object.freeze([30, 45, 60, 75, 90, 120]);
export const SETTLE_WAYS = Object.freeze(['full', 'deposit', 'equal', 'delivered']);
export const NOTICE_HOURS = 24;
export const DUE_DAYS = 14;
export const EXPIRY_DAYS = Object.freeze([14, 30, 60]);
export const DEFAULT_EXPIRY_DAYS = 30;

/** The keys a client funded by an organisation reads (065's my_agreements allow-list; no money key, ever). */
export const FUNDED_KEYS = Object.freeze(['coaching', 'sessions', 'minutes', 'place', 'rhythm', 'startsOn', 'endsOn', 'ongoing', 'goals',
  'contactWays', 'clientName', 'clientEmail', 'coachName', 'coachFirst', 'coachEmail', 'fundedBy', 'expensesAllowed', 'sponsor',
  'kind', 'blocks', 'level', 'noticeHours', 'pausing', 'work']);

/** Whether the client settles it themselves (no organisation funds it). */
export const selfFunded = (t) => !t?.fundedBy && t?.funder !== 'org';
export const kindOf = (t) => (KINDS.includes(t?.kind) ? t.kind : 'sessions');

/** A new agreement's terms for a kind, before a package fills them in (M28's starting values). */
export function blankTerms(kind = 'sessions') {
  const k = KINDS.includes(kind) ? kind : 'sessions';
  const base = {
    kind: k, coaching: '', funder: 'self', fundedBy: null, place: 'zoom', rhythm: DEFAULT_RHYTHM, startsOn: null, endsOn: null,
    endsPicked: false, level: 'Executive', healthCheck: false, visitDays: null, currency: 'GBP', fxRate: null, beyondRateMinor: null,
    discounts: [], offerUpfront: true, choice: null, extrasOffered: [], extrasChosen: [], expenses: true, noticeHours: NOTICE_HOURS,
    dueDays: DUE_DAYS, expiryDays: DEFAULT_EXPIRY_DAYS, pausing: true, fullTerm: false,
  };
  if (k === 'sessions') return { ...base, blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], priceMode: 'total', totalMinor: 0, rateMinor: null, monthlyMinor: null, months: 6, settle: 'equal', fullTerm: true };
  if (k === 'retainer') return { ...base, retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: 0, invoice: 'monthly' }, fullTerm: false };
  if (k === 'team') return { ...base, blocks: [{ n: 12, minutes: 60 }], rhythm: 'Every 2 weeks', team: { people: [], sessions: '12 of 60 minutes each', totalMinor: 0, settle: 'deposit', needsPO: true, invoicesEmail: '', sponsor: { name: '', role: '', email: '' } }, funder: 'org', offerUpfront: false };
  if (k === 'oneoff') return { ...base, work: '', oneoff: { on: null, place: 'zoom', totalMinor: 0, settle: 'before' } };
  return { ...base, hours: { work: '', rateMinor: 0, blockMinor: 0, owner: 'client', tellAt80: true }, offerUpfront: false };
}

/**
 * A new agreement's terms from a package (pricing_packages: its defaults jsonb, prices and personal note), for a
 * client or an organisation. The Health Check stays off unless the package adds it (item 7).
 * @param {{ agreement_kind?: string, name?: string, defaults?: object, personal_price_minor?: number, org_price_minor?: number, currency?: string, personal_note?: string }} pkg
 * @param {{ funded?: boolean, orgName?: string, clientName?: string, clientFirst?: string, coachName?: string, coachFirst?: string, startsOn?: string }} who
 */
export function fromPackage(pkg = {}, who = {}) {
  const d = pkg.defaults && typeof pkg.defaults === 'object' ? pkg.defaults : {};
  const t = { ...blankTerms(pkg.agreement_kind || d.kind), ...d };
  t.kind = KINDS.includes(pkg.agreement_kind) ? pkg.agreement_kind : kindOf(t);
  t.coaching = pkg.name || t.coaching || '';
  t.healthCheck = d.healthCheck === true;
  t.offerUpfront = d.offerUpfront !== false && t.kind !== 'hours' && t.kind !== 'team';
  t.currency = isCurrency(pkg.currency) ? pkg.currency : t.currency;
  const price = who.funded ? pkg.org_price_minor : pkg.personal_price_minor;
  if (Number.isFinite(Number(price)) && price != null) {
    if (t.kind === 'sessions' && t.priceMode === 'total') t.totalMinor = Number(price);
    if (t.kind === 'retainer') t.retainer = { ...t.retainer, feeMinor: Number(price) };
    if (t.kind === 'team') t.team = { ...t.team, totalMinor: Number(price) };
    if (t.kind === 'oneoff') t.oneoff = { ...t.oneoff, totalMinor: Number(price) };
    if (t.kind === 'hours') t.hours = { ...t.hours, blockMinor: Number(price) };
  }
  t.funder = who.funded ? 'org' : 'self';
  t.fundedBy = who.funded ? (who.orgName || null) : null;
  for (const k of ['clientName', 'clientFirst', 'coachName', 'coachFirst', 'orgName']) if (who[k]) t[k] = who[k];
  if (who.startsOn) {
    t.startsOn = who.startsOn;
    if (Array.isArray(t.blocks) && t.blocks.length) t.endsOn = suggestEnd(who.startsOn, t.blocks, t.rhythm);
  }
  t.personalNote = personalNoteFor(pkg.personal_note, who.clientFirst);
  return t;
}

/** The package's personal note with the client's first name filled in ("[name]" or "{name}"), editable before sending (item 31). */
export function personalNoteFor(note, first) {
  const text = String(note || '').trim();
  return first ? text.replace(/\[name\]|\{name\}/gi, first) : text;
}

/**
 * What's missing or out of range, as calm lines the builder can show beside the part (empty when it can be sent).
 * Never blocks a currency or a rate (item 42: "never block sending").
 */
export function checkTerms(t) {
  const out = [];
  const kind = kindOf(t);
  if (!t || typeof t !== 'object') return ['Choose a kind of agreement first.'];
  if (!isCurrency(t.currency || 'GBP')) out.push('Choose a currency from the list.');
  if (kind === 'sessions' || kind === 'team') {
    if (!Array.isArray(t.blocks) || !t.blocks.length || sessionCount(t.blocks) < 1) out.push('Add at least one coaching session.');
    if ((t.blocks || []).some((b) => !SESSION_LENGTHS.includes(Number(b?.minutes)))) out.push('Choose how long each coaching session is.');
    if (!isRhythm(t.rhythm)) out.push('Choose how often.');
  }
  if (kind !== 'hours' && kind !== 'oneoff' && !t.startsOn) out.push('Choose a start date.');
  if (t.startsOn && t.endsOn && t.endsOn < t.startsOn) out.push('Choose an end date after the start date.');
  if (kind === 'sessions') {
    const price = t.priceMode === 'hourly' ? t.rateMinor : t.priceMode === 'monthly' ? t.monthlyMinor : t.totalMinor;
    if (!(Number(price) > 0) && selfFunded(t)) out.push('Add the price.');
    if (!SETTLE_WAYS.includes(t.settle)) out.push('Choose how it is settled.');
  }
  if (kind === 'retainer' && !(Number(t.retainer?.feeMinor) > 0)) out.push('Add the monthly fee.');
  if (kind === 'team') {
    if (!(t.team?.people || []).length) out.push('Add the people in the programme.');
    if (!t.team?.sponsor?.name || !t.team?.sponsor?.email) out.push('Add who signs for the organisation.');
  }
  if (kind === 'oneoff') {
    if (!String(t.work || '').trim()) out.push('Say what the work is.');
    if (!(Number(t.oneoff?.totalMinor) > 0)) out.push('Add the price.');
  }
  if (kind === 'hours') {
    if (!String(t.hours?.work || '').trim()) out.push('Say what is being built.');
    if (!(Number(t.hours?.rateMinor) > 0)) out.push('Add the hourly rate.');
    if (!(Number(t.hours?.blockMinor) > 0)) out.push('Add the block in money.');
  }
  if (!Number.isInteger(Number(t.noticeHours)) || Number(t.noticeHours) < 1 || Number(t.noticeHours) > 168) out.push('Notice is 1 to 168 hours.');
  if (!EXPIRY_DAYS.includes(Number(t.expiryDays ?? DEFAULT_EXPIRY_DAYS))) out.push('An offer runs out after 14, 30 or 60 days.');
  for (const d of t.discounts || []) {
    if (d?.type === 'returning' && !(Number(d.percent) > 0 && Number(d.percent) <= 100)) out.push('A discount is more than 0% and at most 100%.');
    if (d?.type === 'reduced' && !(Number(d.amountMinor) > 0)) out.push('Add how much off.');
  }
  return [...new Set(out)];
}

/** The terms as a client funded by an organisation reads them: only FUNDED_KEYS (the same cut the database makes). */
export function forClient(t, { funded = !selfFunded(t) } = {}) {
  if (!funded) return t;
  return Object.fromEntries(Object.entries(t || {}).filter(([k]) => FUNDED_KEYS.includes(k)));
}
