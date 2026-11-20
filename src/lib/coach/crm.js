// Leads and the CRM's rules (Phase 6a run 4; M11 seq 77; migration 052):
// the single source for every rule and word on Leads, a lead's page,
// Automations, Boards, emails on timelines, past clients' check-ins and an
// organisation's account map. Pure functions only: nothing here reads the
// database, the device or the clock by itself, so every rule is a unit
// test (tests/performance/coach-crm.test.mjs). A page never works a rule
// or a word out for itself: a missing one is added here.
//
// Network's rules are network.js. What the database does by itself (a new
// lead's first stage, a booking's two timeline lines, last_contact_on
// moving forward, an email's links and its waiting row) is listed in 052's
// header; the functions here that do the same are for the device-first
// copy, before 052 is there.
import { addDays, clean, cut, dayWords, firstName, fromDayKey, isEmail, parsePeople, possessive, quickContacts, safeCell, toCsv, toDayKey } from './model.js';
import { mobileForLinks, monthsOn, typedDay } from './network.js';

const lower = (v) => String(v ?? '').toLowerCase();
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const p2 = (n) => String(n).padStart(2, '0');
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
/** Whole days from one day key to another (negative when the second is earlier). */
export function daysBetween(from, to) {
  const a = fromDayKey(from);
  const b = fromDayKey(to);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : null;
}
/** The coach's own day an instant falls on, on the device's clock. */
const dayOfInstant = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? null : toDayKey(d); };
const timeOfInstant = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** "A, B and C". */
export const listWords = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// ---------------------------------------------------------------- money

const SYMBOLS = { GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AUD: 'A$' };
const PER_WORDS = { month: 'month', year: 'year', hour: 'hr' };
const PER_SPOKEN = { month: 'per month', year: 'per year', hour: 'per hour' };

/**
 * Money the portal's way: "£13,500", with pence only when there are some
 * ("£12.50"). Nothing for no amount.
 * @param {number|string|null} amount
 * @param {string} [currency] 'GBP' unless told
 */
export function moneyWords(amount, currency = 'GBP') {
  if (amount == null || amount === '' || !Number.isFinite(Number(amount))) return '';
  const n = Number(amount);
  const whole = Math.round(n * 100) % 100 === 0;
  const figure = Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `${n < 0 ? '-' : ''}${SYMBOLS[currency] || `${currency} `}${figure}`;
}

/** A rate: "£640/month", "£750/hr" (no spaces); a one-off amount is just the money. */
export const rateWords = (amount, per = 'once', currency = 'GBP') => (moneyWords(amount, currency) && PER_WORDS[per] ? `${moneyWords(amount, currency)}/${PER_WORDS[per]}` : moneyWords(amount, currency));
/** What a screen reader hears for a rate: "£640 per month". */
export const rateSpoken = (amount, per = 'once', currency = 'GBP') => (moneyWords(amount, currency) && PER_SPOKEN[per] ? `${moneyWords(amount, currency)} ${PER_SPOKEN[per]}` : moneyWords(amount, currency));

/** A typed amount ("£13,500", "13500.50", "13.5k") as a number, or null when it isn't one. Never below 0. */
export function moneyFromTyped(typed) {
  const t = clean(typed).replace(/[£$€,\s]/g, '');
  if (!t) return null;
  const m = /^(\d+(?:\.\d{1,2})?)(k)?$/i.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return n <= 9999999999 ? n : undefined;
}
export const NEEDS_AMOUNT = 'Type an amount in numbers, such as 13,500.';

// ---------------------------------------------------------------- stages

/** The five stages a pipeline starts with (coach_lead_stages_start() makes the same). */
export const START_STAGES = [
  { name: 'New', likelihood: 10 }, { name: 'Call booked', likelihood: 25 }, { name: 'Proposal sent', likelihood: 50 },
  { name: 'Deciding', likelihood: 70 }, { name: 'Won', likelihood: 100, is_won: true },
];
/** Won's position: always last. */
export const WON_POSITION = 1000000;
export const STAGE_NAME_MAX = 40;

/** The starting stages as rows, for the device before 052 is there. */
export function startStages(coachId, newId) {
  return START_STAGES.map((s, i) => ({ id: newId(), coach_id: coachId, name: s.name, likelihood: s.likelihood, position: s.is_won ? WON_POSITION : i, is_won: Boolean(s.is_won) }));
}

/** The stages in pipeline order, Won always last. */
export const stagesInOrder = (stages) => [...(stages || [])].sort((a, b) => Number(Boolean(a.is_won)) - Number(Boolean(b.is_won)) || (a.position || 0) - (b.position || 0) || lower(a.name).localeCompare(lower(b.name)));
export const wonStage = (stages) => (stages || []).find((s) => s.is_won) || null;
export const firstStage = (stages) => stagesInOrder(stages).find((s) => !s.is_won) || null;
export const stageOf = (stages, id) => (stages || []).find((s) => s.id === id) || null;
export const stageName = (stages, id) => stageOf(stages, id)?.name || '';

/**
 * What stops a stage's name or likelihood being saved, as the calm line to
 * show, or '' when it is fine.
 * @param {{ id?: string, name: string, likelihood: number|string }} draft
 * @param {object[]} stages the others
 */
export function stageProblem(draft, stages = []) {
  const name = clean(draft?.name);
  if (!name) return 'Type the stage’s name to carry on.';
  if (name.length > STAGE_NAME_MAX) return `Stage names can be up to ${STAGE_NAME_MAX} characters.`;
  if (stages.some((s) => s.id !== draft.id && lower(clean(s.name)) === lower(name))) return `There’s already a stage called ${stages.find((s) => s.id !== draft.id && lower(clean(s.name)) === lower(name)).name}. Choose another name.`;
  if (likelihoodFromTyped(draft.likelihood) == null) return 'Type a number from 0 to 100.';
  return '';
}

/** "50", "50%" or 50 as a whole number from 0 to 100, or null. */
export function likelihoodFromTyped(typed) {
  const t = String(typed ?? '').replace(/[%\s]/g, '');
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}
export const likelihoodWords = (stage) => `${Number(stage?.likelihood) || 0}%`;

/** A new stage, placed last before Won. */
export function addStage(stages, { id, coachId, name, likelihood = 50 }) {
  const open = (stages || []).filter((s) => !s.is_won);
  return { id, coach_id: coachId, name: cut(clean(name), STAGE_NAME_MAX), likelihood: likelihoodFromTyped(likelihood) ?? 50, position: Math.max(-1, ...open.map((s) => Number(s.position) || 0)) + 1, is_won: false };
}

/** A stage renamed or given a new likelihood. Won keeps 100% and its place; its name can change. */
export function editStage(stage, { name, likelihood } = {}) {
  const next = { ...stage };
  if (name != null && clean(name)) next.name = cut(clean(name), STAGE_NAME_MAX);
  if (likelihood != null && !stage.is_won && likelihoodFromTyped(likelihood) != null) next.likelihood = likelihoodFromTyped(likelihood);
  return next;
}

/**
 * A stage dragged (or moved with the arrow keys) to a new place. Won never
 * moves and nothing goes after it.
 * @param {object[]} stages
 * @param {string} id the stage moved
 * @param {number} toIndex its new place among the stages before Won (0 is first)
 * @returns {object[]} only the rows whose position changed, to save
 */
export function reorderStages(stages, id, toIndex) {
  const open = stagesInOrder(stages).filter((s) => !s.is_won);
  const from = open.findIndex((s) => s.id === id);
  if (from < 0) return [];
  const to = Math.max(0, Math.min(open.length - 1, Math.round(Number(toIndex) || 0)));
  const [moved] = open.splice(from, 1);
  open.splice(to, 0, moved);
  return open.map((s, i) => (s.position === i ? null : { ...s, position: i })).filter(Boolean);
}
/** The place one step up or down takes a stage to (the arrow keys). */
export function stageStep(stages, id, step) {
  const open = stagesInOrder(stages).filter((s) => !s.is_won);
  const from = open.findIndex((s) => s.id === id);
  return from < 0 ? -1 : Math.max(0, Math.min(open.length - 1, from + step));
}

// One line of help at most (Tim, 18 Nov): where a removed stage's leads go is asked as it is removed (moveLeadsQuestion).
export const STAGES_HELP = 'Drag a stage to move it.';
export const WON_LAST = 'Won is always last, because it makes the lead a client.';
export const STAGES_SAVED = 'Stages saved.';

/**
 * Deleting a stage: its leads move on first (the database refuses to
 * delete a stage that still has leads), then it goes, and so does any
 * automation that named it (the database's own cascade).
 * @param {object[]} stages
 * @param {object[]} leads every lead, cold and merged ones too: each still points at its stage
 * @param {string} id the stage to delete
 * @param {{ toId?: string, automations?: object[] }} [o] `toId`: where its leads go (left out: the stage before it, or the one after for the first)
 * @returns {{ ok: boolean, line: string, count?: number, to?: object, leads?: object[], automations?: object[], stage?: object, undo?: { stage: object, leads: object[], automations: object[] } }}
 *   save `leads` first, then remove `automations` and the stage; `undo` holds the rows as they were (the stage first)
 */
export function deleteStagePlan(stages, leads, id, { toId = null, automations = [] } = {}) {
  const stage = stageOf(stages, id);
  if (!stage) return { ok: false, line: 'That stage has already gone.' };
  if (stage.is_won) return { ok: false, line: 'Won can’t be removed, because it makes the lead a client.' };
  const open = stagesInOrder(stages).filter((s) => !s.is_won);
  if (open.length <= 1) return { ok: false, line: 'A pipeline needs at least one stage before Won.' };
  const inIt = (leads || []).filter((l) => l.stage_id === id);
  const at = open.findIndex((s) => s.id === id);
  const to = (toId && toId !== id ? open.find((s) => s.id === toId) : null) || open[at - 1] || open[at + 1];
  const gone = (automations || []).filter((a) => a.trigger_stage_id === id || a.to_stage_id === id);
  const shown = inIt.filter((l) => !l.merged_into && !l.cold_at).length;
  return {
    ok: true, stage, to, count: shown,
    line: shown ? `${stage.name} removed. ${plural(shown, 'lead')} moved to ${to.name}.` : `${stage.name} removed.`,
    leads: inIt.map((l) => ({ ...l, stage_id: to.id })),
    automations: gone,
    undo: { stage, leads: inIt, automations: gone },
  };
}
/** What "Delete" asks first when a stage has leads: where they go. */
export const moveLeadsQuestion = (stage, count) => `${plural(count, 'lead')} ${count === 1 ? 'is' : 'are'} in ${stage.name}. Where should ${count === 1 ? 'it' : 'they'} go?`;

// ---------------------------------------------------------------- which leads

/** In the pipeline: not merged away and not cold. */
export const isOpenLead = (lead) => Boolean(lead) && !lead.merged_into && !lead.cold_at;
export const openLeads = (leads) => (leads || []).filter(isOpenLead);
export const isWonLead = (lead, stages) => Boolean(lead?.won_at) || Boolean(stageOf(stages, lead?.stage_id)?.is_won);
/** A lead as the database hands a new one back: with the first stage when it has none. */
export const withFirstStage = (lead, stages) => (lead.stage_id ? lead : { ...lead, stage_id: firstStage(stages)?.id ?? null });

// ---------------------------------------------------------------- weighted values

/** A lead's value as a number (0 when none is set). */
export const leadValue = (lead) => (Number.isFinite(Number(lead?.value)) && lead?.value != null && lead.value !== '' ? Number(lead.value) : 0);
/** What a value is likely to bring in: the value times the stage's likelihood, to the pound. */
export const likelyValue = (value, likelihood) => Math.round((Number(value) || 0) * (Number(likelihood) || 0) / 100);

/**
 * Each stage's totals, in pipeline order: how many leads, their value, and
 * what's likely (the value times the stage's likelihood). Won shows its
 * value alone; a stage with no values says so.
 * @returns {{ stage: object, count: number, value: number, likely: number, valueWords: string, likelyWords: string }[]}
 */
export function stageTotals(stages, leads) {
  const open = openLeads(leads);
  return stagesInOrder(stages).map((stage) => {
    const mine = open.filter((l) => l.stage_id === stage.id);
    const value = mine.reduce((sum, l) => sum + leadValue(l), 0);
    const likely = likelyValue(value, stage.likelihood);
    return { stage, count: mine.length, value, likely, valueWords: value ? moneyWords(value) : 'No value yet', likelyWords: value && !stage.is_won ? `${moneyWords(likely)} likely` : '' };
  });
}

/** The whole pipeline (Won left out): its value and what's likely, stage by stage. */
export function pipelineTotals(stages, leads) {
  const rows = stageTotals(stages, leads).filter((r) => !r.stage.is_won);
  return { count: rows.reduce((n, r) => n + r.count, 0), value: rows.reduce((n, r) => n + r.value, 0), likely: rows.reduce((n, r) => n + r.likely, 0) };
}
export const LIKELY_HELP = 'Likely counts each lead at its stage’s chance of winning, which you set in Edit stages.';

// ---------------------------------------------------------------- quiet, next step, last contact

/** A lead is quiet after this many days with no contact. */
export const QUIET_AFTER = 14;

/**
 * Days since the last contact (never contacted: since the lead was added).
 * Nothing for a won, cold or merged lead: they aren't waiting on anyone.
 */
export function quietDays(lead, todayKey, stages = []) {
  if (!isOpenLead(lead) || isWonLead(lead, stages)) return null;
  const since = lead.last_contact_on || (lead.created_at ? dayOfInstant(lead.created_at) : null);
  const days = since ? daysBetween(since, todayKey) : null;
  return days == null ? null : Math.max(0, days);
}
/** "Quiet for 19 days", from 14 days with no contact; '' before then. */
export function quietWords(lead, todayKey, stages = []) {
  const days = quietDays(lead, todayKey, stages);
  return days != null && days >= QUIET_AFTER ? `Quiet for ${days} days` : '';
}

/**
 * The next step and when: "Today", "Thu 19 Nov", "Wed 18 Nov, 13:00", or
 * "Overdue since Fri 13 Nov" once its day has passed.
 * @returns {{ step: string, when: string, overdue: boolean, line: string }} `line`: both on one line, as a card shows them
 */
export function nextStepWords(lead, todayKey) {
  const step = clean(lead?.next_step);
  const on = lead?.next_step_on || null;
  if (!step && !on) return { step: '', when: '', overdue: false, line: '' };
  const time = /^\d{2}:\d{2}/.test(String(lead.next_step_time || '')) ? String(lead.next_step_time).slice(0, 5) : '';
  const overdue = Boolean(on) && on < todayKey;
  const when = !on ? '' : overdue ? `Overdue since ${dayWords(on, todayKey)}` : `${on === todayKey ? 'Today' : dayWords(on, todayKey)}${time ? `, ${time}` : ''}`;
  return { step, when, overdue, line: [step, when].filter(Boolean).join(', ') };
}

/** When a lead was last in contact: "Today", "Yesterday", "6 days ago", then the day itself from two weeks. */
export function lastContactWords(lead, todayKey) {
  const on = lead?.last_contact_on;
  const days = on ? daysBetween(on, todayKey) : null;
  if (days == null) return '';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return days < QUIET_AFTER ? `${days} days ago` : dayWords(on, todayKey);
}

/** The "When?" choices after a call: tomorrow, in 3 days, next week, or a day chosen. */
export function followUpDays(todayKey) {
  return [
    { value: 'tomorrow', day: addDays(todayKey, 1), label: `Tomorrow, ${dayWords(addDays(todayKey, 1), todayKey)}` },
    { value: '3', day: addDays(todayKey, 3), label: `In 3 days, ${dayWords(addDays(todayKey, 3), todayKey)}` },
    { value: 'week', day: addDays(todayKey, 7), label: `Next week, ${dayWords(addDays(todayKey, 7), todayKey)}` },
    { value: 'pick', day: null, label: 'Choose a date' },
  ];
}

// ---------------------------------------------------------------- how ready a lead is (in words, never a score)

/** The five things the discovery call notes ask: the lead's column, the question, and its short name. */
export const QUALIFY = [
  { key: 'want_outcome', question: 'What do they want to achieve?', label: 'The outcome' },
  { key: 'want_pain', question: 'What’s getting in the way?', label: 'What’s in the way' },
  { key: 'who_decides', question: 'Who decides?', label: 'Who decides' },
  { key: 'who_funds', question: 'Who funds it?', label: 'Who funds it' },
  { key: 'decide_when', question: 'When do they want to start?', label: 'When' },
];
export const NOT_KNOWN = 'Not known yet';

/**
 * How ready a lead is, from what the discovery notes hold: in words only.
 * Everything known: "Ready to decide."; one or two things missing: "Nearly
 * there. Still to find out: when."; more: "Early days. Still to find out:
 * …". There is no score and no number anywhere.
 * @returns {{ line: string, short: string, ready: boolean, missing: string[] }} `short`: what a card shows
 */
export function readiness(lead) {
  const missing = QUALIFY.filter((q) => !clean(lead?.[q.key]));
  if (!missing.length) return { line: 'Ready to decide.', short: 'Ready to decide', ready: true, missing: [] };
  const names = missing.map((q) => q.label.toLowerCase());
  const list = listWords(names);
  return missing.length <= 2
    ? { line: `Nearly there. Still to find out: ${list}.`, short: `Still to find out: ${names[0]}${names.length > 1 ? ' and 1 more' : ''}`, ready: false, missing: missing.map((q) => q.key) }
    : { line: `Early days. Still to find out: ${list}.`, short: 'Early days', ready: false, missing: missing.map((q) => q.key) };
}
/** Whether any discovery note has been written (a card says how ready a lead is only once one has). */
export const hasDiscovery = (lead) => QUALIFY.some((q) => clean(lead?.[q.key]));
/** "Where Amy is". */
export const whereTitle = (lead) => `Where ${firstName(lead?.name) || 'this lead'} is`;
/** The rows under it: each thing, and what is known. */
export const discoveryRows = (lead) => QUALIFY.map((q) => ({ key: q.key, label: q.label, question: q.question, value: clean(lead?.[q.key]), words: clean(lead?.[q.key]) || NOT_KNOWN, known: Boolean(clean(lead?.[q.key])) }));
/** The notes as typed in "What you learned", ready to save on the lead (each up to 600 characters; blank is empty). */
export const discoveryPatch = (typed = {}) => Object.fromEntries(QUALIFY.filter((q) => has(typed, q.key)).map((q) => [q.key, cut(clean(typed[q.key]), 600) || null]));

// ---------------------------------------------------------------- the board, the list and the table

/** How often a proposal was opened, in words: "Opened once", "Opened 3 times"; '' for never. */
export const openedWords = (n) => (n > 0 ? `Opened ${n === 1 ? 'once' : `${n} times`}` : '');
/** How many times a lead's proposal has been opened (its timeline's lines). */
export const proposalOpens = (events, leadId) => (events || []).filter((e) => e.lead_id === leadId && e.kind === 'proposal_opened').length;

/**
 * A lead as a card or a row shows it.
 * @param {object} lead
 * @param {{ stages?: object[], events?: object[], todayKey: string }} ctx
 */
export function leadCard(lead, { stages = [], events = [], todayKey } = {}) {
  const won = isWonLead(lead, stages);
  const next = won ? { step: '', when: '', overdue: false, line: '' } : nextStepWords(lead, todayKey);
  const ready = !won && hasDiscovery(lead) ? readiness(lead) : null;
  return {
    id: lead.id, name: lead.name, sub: clean(lead.organisation) || clean(lead.job_title) || '',
    stageId: lead.stage_id, stage: stageName(stages, lead.stage_id), won,
    value: leadValue(lead), valueWords: lead.value != null && lead.value !== '' ? moneyWords(lead.value, lead.currency || 'GBP') : '',
    opened: won ? '' : openedWords(proposalOpens(events, lead.id)),
    next, quiet: quietWords(lead, todayKey, stages),
    ready: ready ? ready.short : '', isReady: Boolean(ready?.ready),
    lastContact: lastContactWords(lead, todayKey),
    wonOn: lead.won_at ? dayWords(dayOfInstant(lead.won_at), todayKey) : '',
  };
}

const byNext = (a, b) => (a.next_step_on || '9999').localeCompare(b.next_step_on || '9999') || String(a.next_step_time || '').localeCompare(String(b.next_step_time || '')) || lower(a.name).localeCompare(lower(b.name));

/**
 * The board (and the list, which is the same grouping drawn as rows): one
 * column a stage in pipeline order, its totals, and its cards, the soonest
 * next step first.
 */
export function leadBoard(stages, leads, ctx = {}) {
  const open = openLeads(leads);
  return stageTotals(stages, leads).map((t) => ({ ...t, cards: open.filter((l) => l.stage_id === t.stage.id).sort(byNext).map((l) => leadCard(l, { ...ctx, stages })) }));
}

/** The stage beside a lead's own (the arrow keys on a board card), or null at either end. */
export function stageBesideLead(stages, lead, step) {
  const order = stagesInOrder(stages);
  const at = order.findIndex((s) => s.id === lead?.stage_id);
  return at < 0 ? null : order[at + step] || null;
}

/**
 * A lead moved to another stage: the lead to save and its timeline line.
 * Moving to Won is wonPlan's, never this.
 * @returns {{ lead: object, event: object, toast: string }|null} null when it is already there
 */
export function stageMove(lead, toStage, { id, nowIso, todayKey, stages = [], by = null } = {}) {
  if (!lead || !toStage || lead.stage_id === toStage.id) return null;
  return {
    lead: { ...lead, stage_id: toStage.id },
    event: leadEvent({ id, lead, kind: 'stage', nowIso, todayKey, title: `Moved to ${toStage.name}`, detail: by ? 'By an automation.' : null, data: { from: lead.stage_id || null, to: toStage.id, ...(by ? { automation_id: by } : {}), ...(stageName(stages, lead.stage_id) ? { from_name: stageName(stages, lead.stage_id) } : {}) } }),
    toast: `Moved to ${toStage.name}.`,
  };
}

/** The table's own columns, in order; a coach's own fields (coach_fields for 'lead') follow them. */
export const LEAD_COLUMNS = [
  { key: 'name', label: 'Name', sorts: [['name', 'A to Z'], ['name_desc', 'Z to A']] },
  { key: 'stage', label: 'Stage', sorts: [['stage', 'Pipeline order']], only: 'stage', edit: 'choose' },
  { key: 'next', label: 'Next step', sorts: [['next', 'Soonest first']], only: [['week', 'This week'], ['none', 'No next step']], edit: 'type' },
  { key: 'last', label: 'Last contact', sorts: [['last', 'Most recent first'], ['last_desc', 'Longest ago first']], only: [['quiet', 'Quiet for 14 days or more']] },
  { key: 'value', label: 'Value', sorts: [['value_desc', 'Highest first'], ['value', 'Lowest first']], only: [['lo', 'Under £10,000'], ['hi', '£10,000 or more'], ['none', 'Not set']], edit: 'type' },
];
/** The More menu on every list row, in order ("Edit stage", never "Change": rule 29am). */
export const LEAD_ROW_MENU = [['edit', 'Edit details'], ['stage', 'Edit stage'], ['call', 'Log a call'], ['select', 'Select'], ['cold', 'Mark as cold']];

const SORT_KEYS = {
  name: (l) => lower(l.name), name_desc: (l) => lower(l.name),
  stage: (l, ctx) => { const i = stagesInOrder(ctx.stages).findIndex((s) => s.id === l.stage_id); return i < 0 ? 1e9 : i; },
  next: (l) => (l.next_step_on ? `${l.next_step_on} ${l.next_step_time || ''}` : null),
  last: (l) => l.last_contact_on || null, last_desc: (l) => l.last_contact_on || null,
  value: (l) => (l.value == null || l.value === '' ? null : Number(l.value)), value_desc: (l) => (l.value == null || l.value === '' ? null : Number(l.value)),
};
const DESC = new Set(['name_desc', 'last', 'value_desc']);

/**
 * Leads sorted as a heading's menu asks. Blanks go last both ways; a
 * coach's own field sorts as `field:<id>` or `field:<id>:desc` with
 * `ctx.fieldValue(lead, fieldId)`.
 */
export function sortLeads(leads, sort = 'next', ctx = {}) {
  const field = /^field:([^:]+)(:desc)?$/.exec(String(sort));
  const key = field ? (l) => { const v = ctx.fieldValue ? ctx.fieldValue(l, field[1]) : null; return v == null || v === '' ? null : typeof v === 'number' ? v : lower(v); } : SORT_KEYS[sort] || SORT_KEYS.next;
  const desc = field ? Boolean(field[2]) : DESC.has(sort);
  return [...(leads || [])].map((l) => ({ l, v: key(l, ctx) })).sort((a, b) => {
    if (a.v == null || b.v == null) { if (a.v != null) return -1; if (b.v != null) return 1; } else {
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'en');
      if (c) return desc ? -c : c;
    }
    return lower(a.l.name).localeCompare(lower(b.l.name), 'en') || String(a.l.id).localeCompare(String(b.l.id));
  }).map(({ l }) => l);
}

/**
 * Leads narrowed by the search box and the headings' "Show only".
 * @param {object[]} leads the open leads
 * @param {{ q?: string, stage?: string[], next?: string[], last?: string[], value?: string[], tag?: string[], fields?: Record<string, string[]> }} filters
 *   `tag`: tag ids (any of them); `fields`: a coach's own field's id to the values wanted ('none' for not set)
 * @param {{ stages?: object[], todayKey: string, tagIds?: (lead: object) => string[], fieldValue?: (lead: object, fieldId: string) => unknown }} ctx
 */
export function filterLeads(leads, filters = {}, ctx = {}) {
  const q = lower(clean(filters.q));
  const pick = (v) => (Array.isArray(v) && v.length ? v : null);
  const stage = pick(filters.stage);
  const next = pick(filters.next);
  const last = pick(filters.last);
  const value = pick(filters.value);
  const tag = pick(filters.tag);
  const fields = Object.entries(filters.fields || {}).filter(([, v]) => Array.isArray(v) && v.length);
  const weekEnd = ctx.todayKey ? addDays(ctx.todayKey, 7) : null;
  return (leads || []).filter((l) => {
    if (tag && !(ctx.tagIds ? ctx.tagIds(l) : []).some((t) => tag.includes(t))) return false;
    for (const [id, wanted] of fields) {
      const v = ctx.fieldValue ? ctx.fieldValue(l, id) : null;
      if (!(v == null || v === '' ? wanted.includes('none') : wanted.includes(String(v)))) return false;
    }
    if (q && !lower(l.name).includes(q) && !lower(l.organisation).includes(q) && !lower(l.email).includes(q)) return false;
    if (stage && !stage.includes(l.stage_id)) return false;
    if (next && !next.some((k) => (k === 'none' ? !clean(l.next_step) : Boolean(l.next_step_on) && l.next_step_on <= weekEnd))) return false;
    if (last && !(last.includes('quiet') && Boolean(quietWords(l, ctx.todayKey, ctx.stages)))) return false;
    const v = leadValue(l);
    if (value && !value.some((k) => (k === 'none' ? !v : k === 'lo' ? v > 0 && v < 10000 : v >= 10000))) return false;
    return true;
  });
}
/** A heading while its column is narrowed: "Stage, 2". */
export const headingWords = (label, chosen) => (chosen ? `${label}, ${chosen}` : label);
/** "8 leads", or "3 of 8 leads" while narrowed. */
export const leadCountWords = (shown, all) => (shown === all ? plural(all, 'lead') : `${shown.toLocaleString('en-GB')} of ${plural(all, 'lead')}`);

/** A next step typed over in the table: the lead to save (blank clears it and its day). */
export function withNextStep(lead, typed) {
  const step = cut(clean(typed), 200);
  return step ? { ...lead, next_step: step } : { ...lead, next_step: null, next_step_on: null, next_step_time: null };
}

// ---------------------------------------------------------------- adding a lead, and where they came from

/** "Where did they come from?" in Add lead, in order. */
export const LEAD_SOURCES = [
  ['referral', 'Referred by someone'], ['chemistry_page', 'Chemistry Call page'], ['connection_page', 'Connection Call page'],
  ['other', 'Somewhere else'],
];
const SOURCE_WORDS = {
  referral: 'A referral', chemistry_page: 'Chemistry Call page', connection_page: 'Connection Call page', booking_page: 'A booking page', single_use_link: 'A booking link',
  manual: 'Added by you', import: 'A spreadsheet', email: 'Your email', network: 'Your Network', other: 'Somewhere else',
};
/** Where a lead came from, in words. */
export const sourceWords = (lead) => SOURCE_WORDS[lead?.source] || SOURCE_WORDS.other;
/** The Details row: "Referred by" with the name when someone referred them, otherwise "Where they came from". */
export const cameFromRow = (lead) => (clean(lead?.referred_by) ? { label: 'Referred by', value: clean(lead.referred_by), personId: lead.referred_by_person || null } : { label: 'Where they came from', value: sourceWords(lead), personId: null });

export const LEAD_NEEDS_NAME = 'Type their name to carry on.';
export const LEAD_NEEDS_EMAIL = 'That email doesn’t look right. Check it and try again.';
export const LEAD_ADDED = (stage) => `Added to ${stage?.name || 'Leads'}.`;

/**
 * A new lead from Add lead (or anywhere else one is made on the device).
 * @param {{ id: string, coachId: string, stages: object[], name: string, email?: string, organisation?: string, source?: string, referredBy?: string, referredByPerson?: string, extra?: object }} o
 * @returns {{ lead?: object, error?: string }}
 */
export function newLead({ id, coachId, stages = [], name, email = '', organisation = '', source = 'manual', referredBy = '', referredByPerson = null, extra = {} }) {
  const n = cut(clean(name), 120);
  if (!n) return { error: LEAD_NEEDS_NAME };
  const e = lower(clean(email));
  if (e && !isEmail(e)) return { error: LEAD_NEEDS_EMAIL };
  const by = source === 'referral' ? cut(clean(referredBy), 120) : '';
  return { lead: {
    id, coach_id: coachId, name: n, email: e || null, source: has(SOURCE_WORDS, source) ? source : 'manual', call_type_key: null, booking_id: null, time_zone: null, answers: {}, status: 'new', notes: null,
    stage_id: firstStage(stages)?.id ?? null, organisation: cut(clean(organisation), 120) || null, organisation_id: null, job_title: null, phone: null, value: null, currency: 'GBP',
    next_step: null, next_step_on: null, next_step_time: null, referred_by: by || null, referred_by_person: by ? referredByPerson : null, network_person_id: null, last_contact_on: null,
    want_outcome: null, want_pain: null, who_decides: null, who_funds: null, decide_when: null, won_at: null, won_profile_id: null, cold_at: null, cold_reason: null, cold_check_on: null, merged_into: null,
    ...extra,
  } };
}

/**
 * Move to Leads from Network: the person stays in Network, and the lead
 * points at them (the person has no pointer back).
 * @returns {{ lead: object, event: object, toast: string }|{ error: string }}
 */
export function leadFromNetwork(person, { id, eventId, coachId, stages = [], nowIso, todayKey }) {
  const made = newLead({ id, coachId, stages, name: person.name, email: person.email || '', organisation: person.organisation || '', source: 'network',
    extra: { organisation_id: person.organisation_id ?? null, phone: person.phone ?? null, job_title: null, network_person_id: person.id, last_contact_on: person.last_spoke_on ?? null } });
  if (made.error) return made;
  return { lead: made.lead, event: leadEvent({ id: eventId, lead: made.lead, kind: 'network', nowIso, todayKey, title: 'Added from your Network', detail: null, data: { network_person_id: person.id } }), toast: MOVED_TO_LEADS(person) };
}
export const MOVED_TO_LEADS = (person) => `${firstName(person?.name) || 'They'} ${firstName(person?.name) ? 'is' : 'are'} in Leads now, and still in your Network.`;
/** The open lead a Network person already has (Move to Leads then opens it instead of making a second). */
export const leadOfPerson = (leads, personId) => openLeads(leads).find((l) => l.network_person_id === personId) || null;

// ---------------------------------------------------------------- Referred by

/**
 * Who has referred work, most won first: each referrer's introductions,
 * how many were won, and what those were worth.
 * @returns {{ name: string, personId: string|null, introductions: number, won: number, value: number, valueWords: string, line: string }[]}
 */
export function referrers(leads, stages = []) {
  const by = new Map();
  for (const l of (leads || []).filter((x) => !x.merged_into && clean(x.referred_by))) {
    const key = l.referred_by_person || lower(clean(l.referred_by));
    const r = by.get(key) || { name: clean(l.referred_by), personId: l.referred_by_person || null, introductions: 0, won: 0, value: 0 };
    r.introductions += 1;
    if (isWonLead(l, stages)) { r.won += 1; r.value += leadValue(l); }
    by.set(key, r);
  }
  return [...by.values()].sort((a, b) => b.won - a.won || b.introductions - a.introductions || lower(a.name).localeCompare(lower(b.name)))
    .map((r) => ({ ...r, valueWords: r.value ? moneyWords(r.value) : '', line: referrerLine(r.introductions, r.won) }));
}
/** "3 introductions, 2 won", "1 introduction, won", "1 introduction". */
export const referrerLine = (introductions, won) => `${plural(introductions, 'introduction')}${won ? (introductions === 1 ? ', won' : `, ${won} won`) : ''}`;

// ---------------------------------------------------------------- the timeline

/** The kinds a timeline line can be (coach_lead_events.kind). */
export const LEAD_EVENT_KINDS = ['first_contact', 'referred', 'booking', 'call', 'proposal', 'proposal_opened', 'note', 'email', 'stage', 'won', 'cold', 'warm', 'merged', 'network', 'check_in'];
/** The kinds that count as contact: each moves last_contact_on forward (never back), as the database does. */
export const CONTACT_KINDS = ['first_contact', 'booking', 'call', 'proposal', 'email'];

/**
 * A timeline line, ready to save.
 * @param {{ id: string, lead: object, kind: string, nowIso: string, todayKey: string, title: string, detail?: string|null, data?: object }} o
 */
export function leadEvent({ id, lead, kind, nowIso, todayKey, title, detail = null, data = {} }) {
  return { id, coach_id: lead.coach_id, lead_id: lead.id, kind, happened_at: nowIso, happened_on: todayKey, title: cut(clean(title), 300), detail: detail ? cut(String(detail).trim(), 6000) : null, data };
}
/** A lead after a line of a contact kind: its last contact moved forward, never back (device first; the database does this itself). */
export const withContact = (lead, event) => (CONTACT_KINDS.includes(event?.kind) && event.happened_on && (!lead.last_contact_on || lead.last_contact_on < event.happened_on) ? { ...lead, last_contact_on: event.happened_on } : lead);

/** "Chemistry Call, 30 minutes", or "Call, 30 minutes" when it isn't one of the call types. */
export const callTitle = (callName, minutes) => `${clean(callName) || 'Call'}${minutes ? `, ${minutes} minutes` : ''}`;
/** "Leadership Accelerator, £13,500 + VAT." */
export const proposalDetail = (name, amount, currency = 'GBP') => `${[clean(name), amount ? `${moneyWords(amount, currency)} + VAT` : ''].filter(Boolean).join(', ')}.`;
/** The two lines a booking writes on its lead (the database writes them itself once 052 is there). */
export const BOOKING_LINES = (callName) => ({ first: { title: 'First contact', detail: `From the ${clean(callName) || 'booking'} page.` }, booked: { title: `Booked a ${clean(callName) || 'call'}`, detail: `From your ${clean(callName) || 'booking'} page.` } });

/**
 * Log a call: the timeline line, the lead with what was learned, its next
 * step and its stage, and the follow-up as a to-do on the coach's own
 * list. Nothing is sent.
 * @param {object} lead
 * @param {{ how: string, next?: string, nextOn?: string|null, stageId?: string, learned?: object, callName?: string, minutes?: number|null }} typed
 * @param {{ id: string, todoId: string, moveId: string, nowIso: string, todayKey: string, stages: object[] }} ctx
 * @returns {{ lead: object, events: object[], todo: object|null, toast: string, movedTo: object|null }|{ error: string }}
 */
export function logCall(lead, typed, { id, todoId, moveId, nowIso, todayKey, stages = [] }) {
  const how = String(typed?.how ?? '').trim();
  const next = cut(clean(typed?.next), 200);
  if (!how && !next) return { error: 'Type how it went, or what happens next, to carry on.' };
  const event = leadEvent({ id, lead, kind: 'call', nowIso, todayKey, title: callTitle(typed.callName, typed.minutes), detail: how || null, data: typed.minutes ? { minutes: typed.minutes } : {} });
  let after = withContact({ ...lead, ...discoveryPatch(typed.learned || {}) }, event);
  const events = [event];
  if (next) after = { ...after, next_step: next, next_step_on: typed.nextOn || null, next_step_time: null };
  const to = typed.stageId && typed.stageId !== lead.stage_id ? stageOf(stages, typed.stageId) : null;
  const moved = to && !to.is_won ? stageMove(after, to, { id: moveId, nowIso, todayKey, stages }) : null;
  if (moved) { after = moved.lead; events.push(moved.event); }
  const todo = next ? leadTodo({ id: todoId, lead, title: next, plannedOn: typed.nextOn || null }) : null;
  return { lead: after, events, todo, movedTo: moved ? to : null, toast: todo?.planned_on ? `Logged. The follow-up is on your to-dos for ${dayWords(todo.planned_on, todayKey)}.` : todo ? 'Logged. The follow-up is on your to-dos.' : 'Logged.' };
}

/** A to-do on the coach's own list that points at a lead (a bare id, as 050's lead_id is). */
export function leadTodo({ id, lead, title, plannedOn = null, automationId = null, position = 0 }) {
  return {
    id, coach_id: lead.coach_id, title: cut(clean(title), 300), notes: null, important: false, planned_on: plannedOn, planned_time: null, first_planned_on: plannedOn, due_on: null, minutes: null,
    list_id: null, heading_id: null, profile_id: null, lead_id: lead.id, repeat_rule: null, repeat_of: null, remind: false, someday: !plannedOn, after_work: false, checklist: [], position, done_at: null,
    from_email_sender: null, from_email_subject: null, from_email_at: null, ...(automationId ? { automation_id: automationId } : {}),
  };
}

/** A note on a lead: its timeline line. */
export function leadNote(lead, typed, { id, nowIso, todayKey }) {
  const text = String(typed ?? '').trim();
  return text ? { event: leadEvent({ id, lead, kind: 'note', nowIso, todayKey, title: 'Note', detail: text }), toast: 'Saved' } : { error: 'Type your note to carry on.' };
}

/** How an email reads on a timeline: "Amy replied: …", "Amy emailed: …", "You replied: …", "You emailed: …". */
export function emailTitle(email, person = null) {
  const subject = clean(email?.subject);
  const reply = /^(re|aw|sv)\s*:/i.test(subject);
  const about = subject.replace(/^((re|fwd?|fw|aw|sv)\s*:\s*)+/i, '') || 'No subject';
  const who = email?.direction === 'in' ? firstName(person?.name || email?.from_name) || clean(email?.from_email) || 'They' : 'You';
  return `${who} ${reply ? 'replied' : 'emailed'}: ${about}`;
}

/**
 * A lead's timeline, newest first: every line with its day ("Today, 07:55"
 * for today's, otherwise "Thu 12 Nov"), its title and its lines of detail.
 * A proposal opened several times is ONE line at its newest opening
 * ("Leadership Accelerator. Opened 3 times."); an email is one line tagged
 * Email, and an email whose thread is hidden isn't shown.
 * @param {object[]} events the lead's coach_lead_events (a won client's page passes the events of the lead whose won_profile_id it is)
 * @param {{ emails?: object[], lead?: object, todayKey: string }} ctx
 * @returns {{ id: string, kind: string, when: string, title: string, lines: string[], tag: string, emailId: string|null, at: string }[]}
 */
export function leadTimeline(events, { emails = [], lead = null, todayKey } = {}) {
  const mail = new Map((emails || []).map((e) => [e.id, e]));
  const newest = [...(events || [])].sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)) || String(b.id).localeCompare(String(a.id)));
  const opens = new Map();
  for (const e of newest) if (e.kind === 'proposal_opened') { const k = `${e.lead_id}|${lower(e.data?.name)}`; opens.set(k, (opens.get(k) || 0) + 1); }
  const seen = new Set();
  const rows = [];
  for (const e of newest) {
    const email = e.kind === 'email' && e.data?.email_id ? mail.get(e.data.email_id) || null : null;
    if (email?.hidden) continue;
    let title = clean(e.title);
    let lines = String(e.detail || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    let tag = '';
    if (e.kind === 'proposal_opened') {
      const k = `${e.lead_id}|${lower(e.data?.name)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      title = 'Opened your proposal';
      lines = [`${clean(e.data?.name) ? `${clean(e.data.name)}. ` : ''}${openedWords(opens.get(k))}.`];
    } else if (e.kind === 'email') {
      tag = 'Email';
      if (email && (!title || lower(title) === lower(clean(email.subject)))) title = emailTitle(email, lead);
      else if (!title) title = 'Email';
      lines = [];
    }
    const day = e.happened_on || dayOfInstant(e.happened_at);
    rows.push({ id: e.id, kind: e.kind, when: day === todayKey ? `Today, ${timeOfInstant(e.happened_at)}` : dayWords(day, todayKey), title, lines, tag, emailId: email?.id || e.data?.email_id || null, at: e.happened_at });
  }
  return rows;
}

/** A client's timeline carried over from Won: the events of the lead whose won_profile_id is that client (nothing is copied). */
export function carriedTimeline(events, leads, profileId) {
  const ids = new Set((leads || []).filter((l) => l.won_profile_id === profileId).map((l) => l.id));
  return (events || []).filter((e) => ids.has(e.lead_id));
}

// ---------------------------------------------------------------- Won

/**
 * Mark as won: the lead moves to Won, a client is made from it (a lead who
 * already is one, by `profileId`, is joined to that client instead), its
 * timeline carries over by itself (carriedTimeline), and an agreement draft
 * is left for Finances to fill in (6b).
 * @param {object} lead
 * @param {{ stages: object[], profileId: string, eventId: string, dealId?: string, nowIso: string, todayKey: string, existingProfile?: object|null }} ctx
 * @returns {{ lead: object, profile: object|null, event: object, agreementDraft: object, deal: object|null, toast: string, undo: { lead: object, removeProfile: string|null, removeEvent: string, removeDeal: string|null } }|{ error: string }}
 *   `deal`: the draft as an organisation_deals row, when the lead has an organisation; `profile` is null when the client was already there
 */
export function wonPlan(lead, { stages = [], profileId, eventId, dealId = null, nowIso, todayKey, existingProfile = null }) {
  const won = wonStage(stages);
  if (!won) return { error: 'Won isn’t one of your stages yet. Open Edit stages, then try again.' };
  if (lead.won_at) return { error: `${firstName(lead.name) || 'This lead'} is already a client.` };
  const clientId = existingProfile?.id || profileId;
  const profile = existingProfile ? null : {
    id: profileId, coach_id: lead.coach_id, user_id: null, name: lead.name, email: lead.email || null, mobile: mobileForLinks(lead.phone) || null, organisation_id: lead.organisation_id || null, job_title: lead.job_title || null,
    city: null, time_zone: lead.time_zone || null, frequent_traveller: false, referred_by: lead.referred_by || null, status: 'active', stage: 'starting', getting_started: {}, last_contact_on: lead.last_contact_on || null,
    invited_at: null, ended_on: null, merged_into: null,
  };
  const agreementDraft = { lead_id: lead.id, profile_id: clientId, organisation_id: lead.organisation_id || null, name: `Coaching for ${firstName(lead.name) || lead.name}`, value: lead.value ?? null, currency: lead.currency || 'GBP', status: 'draft' };
  const deal = lead.organisation_id && dealId ? { id: dealId, organisation_id: lead.organisation_id, name: agreementDraft.name, kind: 'agreement', status: 'draft', value: lead.value ?? null, currency: agreementDraft.currency, per: 'once', detail: null, starts_on: null, renews_on: null, opens: 0, lead_id: lead.id } : null;
  const next = { ...lead, stage_id: won.id, won_at: nowIso, won_profile_id: clientId, next_step: null, next_step_on: null, next_step_time: null };
  return {
    lead: next, profile, agreementDraft, deal,
    event: leadEvent({ id: eventId, lead, kind: 'won', nowIso, todayKey, title: 'Won', detail: lead.value ? `${moneyWords(lead.value, lead.currency || 'GBP')}.` : null, data: { profile_id: clientId, from: lead.stage_id || null } }),
    toast: `Won. ${firstName(lead.name) || 'This lead'} is now a client, with an agreement ready to fill in.`,
    undo: { lead, removeProfile: profile ? profile.id : null, removeEvent: eventId, removeDeal: deal ? deal.id : null },
  };
}

// ---------------------------------------------------------------- Cold leads

/** "What happened?" when a lead is marked as cold. */
export const COLD_REASONS = [['timing', 'The timing wasn’t right'], ['budget', 'No budget this year'], ['other_coach', 'They chose someone else'], ['quiet', 'They went quiet'], ['else', 'Something else']];
/** "When should you check in again?" */
export const COLD_CHECKS = [['3m', 'In 3 months'], ['6m', 'In 6 months'], ['never', 'No need']];
const CHECK_MONTHS = { '3m': 3, '6m': 6 };

/**
 * Mark as cold: what happened, and when to check in again. The lead leaves
 * the pipeline (it keeps its stage, for coming back), and the check-in
 * becomes a to-do on that day.
 * @param {object} lead
 * @param {{ reason: string, text?: string, check: string }} typed `text`: the coach's own words for "Something else"
 * @param {{ eventId: string, todoId: string, nowIso: string, todayKey: string }} ctx
 * @returns {{ lead: object, event: object, todo: object|null, toast: string, undo: { lead: object, removeEvent: string, removeTodo: string|null } }|{ error: string }}
 */
export function coldPlan(lead, typed, { eventId, todoId, nowIso, todayKey }) {
  const reason = COLD_REASONS.find(([k]) => k === typed?.reason);
  if (!reason) return { error: 'Choose what happened to carry on.' };
  const own = cut(clean(typed.text), 300);
  if (reason[0] === 'else' && !own) return { error: 'Type what happened to carry on.' };
  const words = `${own || reason[1]}${/[.!?]$/.test(own || reason[1]) ? '' : '.'}`;
  const checkOn = CHECK_MONTHS[typed.check] ? monthsOn(todayKey, CHECK_MONTHS[typed.check]) : null;
  const first = firstName(lead.name) || 'This lead';
  const todo = checkOn ? leadTodo({ id: todoId, lead, title: `Check in with ${lead.name}`, plannedOn: checkOn }) : null;
  return {
    lead: { ...lead, cold_at: nowIso, cold_reason: words, cold_check_on: checkOn, next_step: null, next_step_on: null, next_step_time: null },
    event: leadEvent({ id: eventId, lead, kind: 'cold', nowIso, todayKey, title: 'Marked as cold', detail: words, data: { reason: reason[0], check_on: checkOn } }),
    todo,
    toast: todo ? `${first} is in Cold leads. A reminder to check in is on your to-dos.` : `${first} is in Cold leads.`,
    undo: { lead, removeEvent: eventId, removeTodo: todo ? todo.id : null },
  };
}

/** A cold lead brought back into the pipeline, at the stage it left. */
export function warmPlan(lead, { eventId, nowIso, todayKey, stages = [] }) {
  const stage = stageOf(stages, lead.stage_id) && !stageOf(stages, lead.stage_id).is_won ? stageOf(stages, lead.stage_id) : firstStage(stages);
  return {
    lead: { ...lead, cold_at: null, cold_reason: null, cold_check_on: null, stage_id: stage?.id ?? lead.stage_id },
    event: leadEvent({ id: eventId, lead, kind: 'warm', nowIso, todayKey, title: 'Back in the pipeline', detail: null, data: {} }),
    toast: `${firstName(lead.name) || 'This lead'} is back in ${stage?.name || 'the pipeline'}.`,
    undo: { lead, removeEvent: eventId },
  };
}

/**
 * Cold leads, the next to check in on first: what happened and when to
 * check in again.
 * @returns {{ id: string, name: string, sub: string, happened: string, since: string, check: string, due: boolean }[]}
 */
export function coldRows(leads, todayKey) {
  return (leads || []).filter((l) => l.cold_at && !l.merged_into)
    .sort((a, b) => (a.cold_check_on || '9999').localeCompare(b.cold_check_on || '9999') || lower(a.name).localeCompare(lower(b.name)))
    .map((l) => ({
      id: l.id, name: l.name, sub: clean(l.organisation) || clean(l.job_title) || '', happened: clean(l.cold_reason),
      since: `Cold since ${dayWords(dayOfInstant(l.cold_at), todayKey)}`,
      check: !l.cold_check_on ? 'No check-in planned' : l.cold_check_on <= todayKey ? 'Time to check in' : `Check in again on ${dayWords(l.cold_check_on, todayKey)}`,
      due: Boolean(l.cold_check_on) && l.cold_check_on <= todayKey,
    }));
}
export const NO_COLD_LEADS = 'No cold leads. A lead you mark as cold waits here, with what happened.';

// ---------------------------------------------------------------- spreadsheets: reading, matching columns, duplicates first

/**
 * A CSV file's text (or a block pasted from a spreadsheet, tabs between
 * cells) as rows of cells. Quoted cells keep their commas and line breaks;
 * rows with nothing in them are dropped.
 * @returns {string[][]}
 */
export function csvTable(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const head = src.split(/\r?\n/)[0] || '';
  const sep = head.includes('\t') ? '\t' : head.split(';').length > head.split(',').length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => clean(c))).filter((r) => r.some(Boolean));
}

/** What a lead's spreadsheet column can be matched to: the field, its name, and the headings read as it. */
export const LEAD_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', heads: /^(full ?name|name|contact( name)?|lead|person|who)$/i },
  { key: 'first', label: 'First name', heads: /^(first|first ?name|given ?name|forename)$/i },
  { key: 'last', label: 'Last name', heads: /^(last|last ?name|surname|family ?name)$/i },
  { key: 'email', label: 'Email', heads: /^(e[- ]?mail( address)?|email ?1)$/i },
  { key: 'organisation', label: 'Organisation', heads: /^(organi[sz]ation|company( name)?|employer|account|business|firm|club)$/i },
  { key: 'job_title', label: 'Role', heads: /^(role|job|job ?title|title|position)$/i },
  { key: 'phone', label: 'Phone', heads: /^(phone|mobile|cell|tel|telephone|(phone|mobile) ?(number|no\.?))$/i },
  { key: 'source', label: 'Where they came from', heads: /^(source|lead ?source|where( they came)? from|came from|channel|origin)$/i },
  { key: 'referred_by', label: 'Referred by', heads: /^(referred ?by|referrer|introduced ?by)$/i },
  { key: 'value', label: 'Value', heads: /^(value|deal ?(value|size)|amount|budget|worth|fee)$/i },
  { key: 'next_step', label: 'Next step', heads: /^(next ?step|next ?action|follow[- ]?up)$/i },
  { key: 'notes', label: 'Notes', heads: /^(notes?|comments?|details?|description)$/i },
];
export const IMPORT_HELP = 'Duplicates show before anyone is added.';
export const IMPORT_MAX = 5000;

/**
 * Columns matched: each heading of the file against the fields it could
 * be, by its name, whatever its capitals, spaces, underscores or dashes.
 * Nothing is matched twice; a heading nobody knows is left for the coach
 * to choose (or to leave out).
 * @param {string[]} headings the file's first row
 * @param {{ key: string, label: string, heads: RegExp }[]} fields
 * @returns {{ columns: { index: number, heading: string, field: string|null }[], missing: string[] }} `missing`: needed fields no column was matched to ('name')
 */
export function matchColumns(headings, fields = LEAD_IMPORT_FIELDS) {
  const taken = new Set();
  const columns = (headings || []).map((raw, index) => {
    const heading = clean(raw);
    const plain = heading.replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim();
    const field = fields.find((f) => !taken.has(f.key) && (f.heads.test(plain) || lower(f.label) === lower(plain)));
    if (field) taken.add(field.key);
    return { index, heading, field: field ? field.key : null };
  });
  const named = taken.has('name') || taken.has('first') || taken.has('last');
  return { columns, missing: named || !fields.some((f) => f.key === 'name') ? [] : ['name'] };
}
/** Whether a first row reads as headings (at least one matches a field) or is already a person. */
export const hasHeadingRow = (row, fields = LEAD_IMPORT_FIELDS) => matchColumns(row, fields).columns.some((c) => c.field) && !(row || []).some((c) => isEmail(lower(c)));
export const IMPORT_NEEDS_NAME = 'Choose which column holds the name to carry on.';
export const IMPORT_EMPTY = 'That file has no rows to add. Check it and try again.';
export const IMPORT_TOO_MANY = `A spreadsheet can add up to ${IMPORT_MAX.toLocaleString('en-GB')} people at a time. Split it and try again.`;

/**
 * The file's rows as objects, by the matched columns (first and last name
 * joined into the name). A row with no name is no person: it is counted in
 * `skipped`.
 * @param {string[][]} table the rows under the heading row
 * @param {{ index: number, field: string|null }[]} columns matchColumns' answer, as the coach left it
 * @returns {{ rows: object[], skipped: number }}
 */
export function sheetRows(table, columns) {
  const rows = [];
  let skipped = 0;
  for (const cellsOf of table || []) {
    const row = {};
    for (const c of columns || []) if (c.field && clean(cellsOf[c.index])) row[c.field] = clean(cellsOf[c.index]);
    const name = clean(row.name) || clean([row.first, row.last].filter(Boolean).join(' '));
    delete row.first; delete row.last;
    if (!name) { skipped += 1; continue; }
    rows.push({ ...row, name });
  }
  return { rows, skipped };
}

const SOURCE_FROM_TYPED = [[/referr|introduc|word of mouth/i, 'referral'], [/chemistry/i, 'chemistry_page'], [/connection/i, 'connection_page'], [/e-?mail/i, 'email'], [/network/i, 'network']];

/**
 * Import, with duplicates shown first: every row that may already be a
 * lead (the same email, or the same name whatever its capitals) or that
 * repeats an earlier row of the file, then the rest.
 * @param {object[]} rows sheetRows' rows
 * @param {object[]} leads the leads already there (cold ones too)
 * @returns {{ duplicates: { index: number, row: object, match: object|null, by: 'email'|'name'|'file' }[], fresh: { index: number, row: object }[] }}
 */
export function leadImportPlan(rows, leads) {
  const known = (leads || []).filter((l) => !l.merged_into);
  const seenEmail = new Set();
  const seenName = new Set();
  const duplicates = [];
  const fresh = [];
  (rows || []).forEach((row, index) => {
    const email = lower(clean(row.email));
    const name = lower(clean(row.name));
    const byEmail = email ? known.find((l) => lower(l.email) === email) : null;
    const byName = byEmail ? null : known.find((l) => lower(clean(l.name)) === name);
    if (byEmail || byName) duplicates.push({ index, row, match: byEmail || byName, by: byEmail ? 'email' : 'name' });
    else if ((email && seenEmail.has(email)) || (!email && seenName.has(name))) duplicates.push({ index, row, match: null, by: 'file' });
    else fresh.push({ index, row });
    if (email) seenEmail.add(email);
    seenName.add(name);
  });
  return { duplicates, fresh };
}
/** What a possible duplicate says: "Chris Doyle is already a lead, with the same email." */
export const duplicateWords = (d) => (d.by === 'file' ? `${d.row.name} is in this file twice.` : `${d.match.name} is already a lead, with the same ${d.by}.`);
/** "Add 42 leads", and after it "42 leads added." */
export const importButton = (n) => `Add ${plural(n, 'lead')}`;
export const importedWords = (n) => `${plural(n, 'lead')} added.`;

/** One imported row as a lead (source 'import' unless its own column says where they came from). */
export function leadFromImport(row, { id, coachId, stages = [] }) {
  const typedSource = clean(row.source);
  const source = clean(row.referred_by) ? 'referral' : (SOURCE_FROM_TYPED.find(([re]) => re.test(typedSource)) || [null, 'import'])[1];
  const email = lower(clean(row.email));
  const value = moneyFromTyped(row.value);
  const made = newLead({ id, coachId, stages, name: row.name, email: isEmail(email) ? email : '', organisation: row.organisation || '', source, referredBy: row.referred_by || '',
    extra: { job_title: cut(clean(row.job_title), 120) || null, phone: cut(clean(row.phone), 40) || null, value: typeof value === 'number' ? value : null, next_step: cut(clean(row.next_step), 200) || null, notes: cut(clean(row.notes), 6000) || null } });
  return made.lead || null;
}

// ---------------------------------------------------------------- merge into one, and what Undo restores

/** The fields "Merge into one" lets the coach choose between, where the two differ. */
export const LEAD_MERGE_FIELDS = [['name', 'Name'], ['email', 'Email'], ['phone', 'Mobile'], ['organisation', 'Organisation'], ['job_title', 'Role'], ['notes', 'Notes'], ['referred_by', 'Referred by'], ['value', 'Value']];
export const MERGE_INTRO = 'These two look like the same person. Choose what to keep where they differ.';
export const MERGE_NOTHING_LOST = 'Both timelines join into one. Nothing is lost.';
export const mergedWords = (kept) => `Merged. Both timelines are now on ${kept.name}.`;
export const KEPT_AS_TWO = 'Kept as two people. You won’t be asked again.';

/** The rows of "Merge into one": a row for each field either has; where they differ the coach chooses. */
export function leadMergePlan(a, b) {
  if (!a || !b || a.id === b.id) return null;
  const show = (key, v) => (key === 'value' ? moneyWords(v, a.currency || 'GBP') : String(v));
  return LEAD_MERGE_FIELDS.map(([key, label]) => {
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    if (x == null && y == null) return null;
    const same = x == null || y == null || lower(x) === lower(y);
    return { key, label, a: x == null ? '' : show(key, x), b: y == null ? '' : show(key, y), choose: !same, one: same ? show(key, x ?? y) : '' };
  }).filter(Boolean);
}

/** The kept lead after a merge, exactly as lead_merge() leaves it (`values` names the fields taken from the one merged away). */
export function mergedLead(keep, drop, values = {}) {
  const take = (k) => (has(values, k) ? drop[k] ?? null : keep[k] ?? drop[k] ?? null);
  const fill = (k) => keep[k] ?? drop[k] ?? null;
  const later = (x, y) => (x && y ? (x > y ? x : y) : x || y || null);
  return {
    ...keep,
    name: has(values, 'name') ? drop.name : keep.name,
    email: take('email'), phone: take('phone'), organisation: take('organisation'),
    organisation_id: has(values, 'organisation') ? drop.organisation_id ?? null : keep.organisation_id ?? drop.organisation_id ?? null,
    job_title: take('job_title'), notes: take('notes'), referred_by: take('referred_by'), value: take('value'),
    next_step: fill('next_step'), next_step_on: keep.next_step == null ? drop.next_step_on ?? null : keep.next_step_on ?? null, next_step_time: keep.next_step == null ? drop.next_step_time ?? null : keep.next_step_time ?? null,
    time_zone: fill('time_zone'), booking_id: fill('booking_id'), network_person_id: fill('network_person_id'), referred_by_person: fill('referred_by_person'),
    want_outcome: fill('want_outcome'), want_pain: fill('want_pain'), who_decides: fill('who_decides'), who_funds: fill('who_funds'), decide_when: fill('decide_when'),
    last_contact_on: later(keep.last_contact_on, drop.last_contact_on),
  };
}

/**
 * A merge on the device (before 052): the rows to save, and everything
 * Undo needs to put both leads back exactly as they were. The same moves
 * lead_merge() makes: the timeline, to-dos, bookings, emails, tags and the
 * coach's own fields all go to the kept lead (a tag, an email or a field
 * the kept lead already has stays the kept lead's own).
 * @param {object} keep
 * @param {object} drop
 * @param {object} values the fields to take from `drop`
 * @param {{ events?: object[], todos?: object[], bookings?: object[], emailLinks?: object[], tagLinks?: object[], fieldValues?: object[] }} rows
 * @returns {{ save: [string, object][], undo: { leads: object[], restore: [string, object][] }, toast: string }|null}
 *   `save`: [table, row] pairs in order; `undo.restore`: the rows as they were, to save back (`undo.leads` first)
 */
export function leadMergeDevice(keep, drop, values = {}, { events = [], todos = [], bookings = [], emailLinks = [], tagLinks = [], fieldValues = [] } = {}) {
  if (!keep || !drop || keep.id === drop.id || keep.merged_into || drop.merged_into) return null;
  const save = [];
  const restore = [];
  const move = (table, list, change) => { for (const r of list) { restore.push([table, r]); save.push([table, change(r)]); } };
  move('coach_lead_events', events.filter((e) => e.lead_id === drop.id), (e) => ({ ...e, lead_id: keep.id }));
  move('coach_todos', todos.filter((t) => t.lead_id === drop.id), (t) => ({ ...t, lead_id: keep.id }));
  move('coach_bookings', bookings.filter((b) => b.lead_id === drop.id), (b) => ({ ...b, lead_id: keep.id }));
  const keptEmails = new Set(emailLinks.filter((l) => l.person_kind === 'lead' && l.person_id === keep.id).map((l) => l.email_id));
  move('coach_email_links', emailLinks.filter((l) => l.person_kind === 'lead' && l.person_id === drop.id && !keptEmails.has(l.email_id)), (l) => ({ ...l, person_id: keep.id }));
  const keptTags = new Set(tagLinks.filter((l) => l.item_kind === 'lead' && l.item_id === keep.id).map((l) => l.tag_id));
  move('coach_tag_links', tagLinks.filter((l) => l.item_kind === 'lead' && l.item_id === drop.id && !keptTags.has(l.tag_id)), (l) => ({ ...l, item_id: keep.id }));
  const keptFields = new Set(fieldValues.filter((v) => v.item_id === keep.id).map((v) => v.field_id));
  move('coach_field_values', fieldValues.filter((v) => v.item_id === drop.id && !keptFields.has(v.field_id)), (v) => ({ ...v, item_id: keep.id }));
  return {
    save: [['coach_leads', mergedLead(keep, drop, values)], ['coach_leads', { ...drop, merged_into: keep.id }], ...save],
    undo: { leads: [keep, drop], restore },
    toast: mergedWords(mergedLead(keep, drop, values)),
  };
}

/** What Undo saves after a device merge: both leads as they were, then every row that moved, back where it was. */
export const leadUnmergeDevice = (undo) => [...(undo?.leads || []).map((l) => ['coach_leads', l]), ...(undo?.restore || [])];

/**
 * Pairs of open leads that look like the same person (the same email, or
 * the same name), leaving out pairs the coach has said are different
 * people (`notSame`: pairs of ids kept in coach_settings.crm.not_same).
 * @returns {{ a: object, b: object, line: string }[]}
 */
export function leadDuplicates(leads, notSame = []) {
  const said = new Set((notSame || []).map((p) => [...p].sort().join('|')));
  const live = (leads || []).filter((l) => !l.merged_into && !l.cold_at);
  const first = (l) => lower(firstName(l.name)).slice(0, 5);
  const last = (l) => lower(clean(l.name).split(' ').slice(-1)[0]);
  const pairs = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (said.has([a.id, b.id].sort().join('|'))) continue;
      const sameEmail = a.email && b.email && lower(a.email) === lower(b.email);
      const sameName = lower(clean(a.name)) === lower(clean(b.name));
      // "Chris Doyle" and "Christopher Doyle": the same last name, and one first name starts the other.
      const nearName = clean(a.name).includes(' ') && clean(b.name).includes(' ') && last(a) === last(b) && first(a).length >= 3 && (lower(firstName(b.name)).startsWith(lower(firstName(a.name))) || lower(firstName(a.name)).startsWith(lower(firstName(b.name))));
      if (sameEmail || sameName || nearName) pairs.push({ a, b, line: `${a.name.length <= b.name.length ? a.name : b.name} may be in here twice.` });
    }
  }
  return pairs;
}
/** The setting after "They’re different people": the pair is never asked about again. */
export const withNotSame = (crm, a, b) => ({ ...(crm || {}), not_same: [...((crm || {}).not_same || []), [a.id, b.id].sort()].slice(-500) });

// ---------------------------------------------------------------- export

/** "This view, 8 leads". */
export const exportWhat = (n) => `This view, ${plural(n, 'lead')}`;
export const EXPORT_HELP = 'Every field comes with it, your own fields included.';
export const EXPORT_FORMATS = [['xlsx', 'Excel'], ['csv', 'CSV']];

/**
 * The rows of an export: a heading row, then a row a lead with every
 * field, the coach's own fields included. Values are numbers so a
 * spreadsheet can add them up; a cell that would run as a formula is made
 * safe by toCsv and the Excel writer.
 * @param {object[]} leads the view's leads, in its order
 * @param {{ stages?: object[], fields?: object[], fieldWords?: (lead: object, field: object) => string|number, tagNames?: (lead: object) => string[] }} ctx
 */
export function leadExportRows(leads, ctx = {}, todayKey) {
  const fields = ctx.fields || [];
  const head = ['Name', 'Email', 'Phone', 'Organisation', 'Role', 'Stage', 'Value', 'Likely to win', 'Next step', 'Next step date', 'Last contact', 'Where they came from', 'Referred by',
    ...QUALIFY.map((q) => q.label), 'Tags', 'Notes', ...fields.map((f) => f.name)];
  const rows = (leads || []).map((l) => [
    l.name, l.email || '', l.phone || '', l.organisation || '', l.job_title || '', l.cold_at ? 'Cold' : stageName(ctx.stages, l.stage_id), l.value == null || l.value === '' ? '' : Number(l.value),
    l.cold_at ? '' : `${Number(stageOf(ctx.stages, l.stage_id)?.likelihood) || 0}%`, l.next_step || '', l.next_step_on ? dayWords(l.next_step_on, todayKey) : '', l.last_contact_on ? dayWords(l.last_contact_on, todayKey) : '',
    sourceWords(l), l.referred_by || '', ...QUALIFY.map((q) => l[q.key] || ''), (ctx.tagNames ? ctx.tagNames(l) : []).join(', '), l.notes || '',
    ...fields.map((f) => (ctx.fieldWords ? ctx.fieldWords(l, f) ?? '' : '')),
  ]);
  return [head, ...rows];
}
/** The export as a CSV file's text. */
export const leadsCsv = (leads, ctx, todayKey) => toCsv(leadExportRows(leads, ctx, todayKey));
/** "Leads, 20 Nov 2026" (the file's name, without its ending). */
export const exportName = (what, todayKey) => { const d = fromDayKey(todayKey); return d ? `${what}, ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}` : what; };
export { safeCell };

// ---------------------------------------------------------------- automations: when this happens, add a to-do or move a stage

/** What can start an automation. */
export const TRIGGERS = [
  { value: 'lead_stage', label: 'A lead moves to a stage', needs: 'stage' },
  { value: 'proposal_opened', label: 'A proposal is opened', needs: 'count', counts: [1, 2, 3, 5], suggested: 3 },
  { value: 'lead_quiet', label: 'A lead goes quiet', needs: 'count', counts: [7, 14, 21, 30], suggested: QUIET_AFTER },
  { value: 'call_booked', label: 'A call is booked', needs: 'call' },
  { value: 'lead_won', label: 'A lead is won', needs: null },
  { value: 'coaching_ended', label: 'Coaching ends', needs: null },
];
/** The ONLY two things an automation can do. Nothing here sends, tags or emails, and the table can't hold anything else. */
export const ACTIONS = [{ value: 'todo', label: 'Add a to-do' }, { value: 'stage', label: 'Move the lead to a stage' }];
export const AUTOMATION_HELP = 'Automations add to-dos and move stages. They never send anything.';
/** "When?" for the to-do, in days from the event (a booked call: from the call's own day). */
export const TODO_DAYS = [-1, 0, 1, 2, 3, 7, 14, 30];

/** "the same day", "1 day later", "3 days later", "2 weeks later", "the day before". */
export function daysLaterWords(days) {
  const n = Math.round(Number(days) || 0);
  if (n === 0) return 'the same day';
  if (n === -1) return 'the day before';
  if (n < 0) return `${-n} days before`;
  if (n % 7 === 0) return `${plural(n / 7, 'week')} later`;
  return `${plural(n, 'day')} later`;
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const todoDayChoices = (trigger) => TODO_DAYS.filter((d) => d >= 0 || trigger === 'call_booked').map((d) => ({ value: d, label: capital(daysLaterWords(d)) }));

/**
 * An automation as one sentence: "When a lead moves to Proposal sent, add
 * the to-do “Follow up on the proposal”, 3 days later."
 * @param {object} a
 * @param {{ stages?: object[], callTypes?: object[] }} ctx
 */
export function automationSentence(a, { stages = [], callTypes = [] } = {}) {
  const call = (callTypes || []).find((c) => c.key === a.call_type_key)?.name;
  const when = {
    lead_stage: `a lead moves to ${stageName(stages, a.trigger_stage_id) || 'a stage'}`,
    proposal_opened: `a proposal is opened ${a.trigger_count === 1 ? 'once' : `${a.trigger_count || 3} times`}`,
    lead_quiet: `a lead has been quiet for ${a.trigger_count || QUIET_AFTER} days`,
    call_booked: call ? `${/^[aeiou]/i.test(call) ? 'an' : 'a'} ${call} is booked` : 'a call is booked',
    lead_won: 'a lead is won',
    coaching_ended: 'coaching ends',
  }[a.trigger] || 'this happens';
  const then = a.action === 'stage'
    ? `move the lead to ${stageName(stages, a.to_stage_id) || 'a stage'}`
    : `add the to-do “${clean(a.todo_title)}”, ${daysLaterWords(a.todo_days)}`;
  return `When ${when}, ${then}.`;
}

/** Under each automation: "Ran 4 times in November", "Ran 1 time in November", "Hasn’t run in November", or "Off". */
export function ranWords(a, runs, todayKey) {
  if (!a.active) return 'Off';
  const month = String(todayKey).slice(0, 7);
  const n = (runs || []).filter((r) => r.automation_id === a.id && dayOfInstant(r.ran_at)?.slice(0, 7) === month).length;
  const name = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(month.slice(5, 7)) - 1];
  return n ? `Ran ${plural(n, 'time')} in ${name}` : `Hasn’t run in ${name}`;
}

/** An automation with nothing chosen yet (M11's Add automation opens on these). */
export const blankAutomation = ({ id, coachId, stages = [], position = 0 }) => ({
  id, coach_id: coachId, trigger: 'lead_stage', trigger_stage_id: stagesInOrder(stages).filter((s) => !s.is_won)[1]?.id ?? firstStage(stages)?.id ?? null, trigger_count: null, call_type_key: null,
  action: 'todo', todo_title: '', todo_days: 1, to_stage_id: null, active: true, position,
});

/** An automation tidied for saving: only what its trigger and action use is kept. */
export function tidyAutomation(a) {
  const t = TRIGGERS.find((x) => x.value === a.trigger) || TRIGGERS[0];
  const todo = a.action !== 'stage';
  return {
    ...a, trigger: t.value,
    trigger_stage_id: t.needs === 'stage' ? a.trigger_stage_id || null : null,
    trigger_count: t.needs === 'count' ? Math.max(1, Math.round(Number(a.trigger_count) || t.suggested)) : null,
    call_type_key: t.needs === 'call' ? a.call_type_key || null : null,
    action: todo ? 'todo' : 'stage',
    todo_title: todo ? cut(clean(a.todo_title), 300) : null,
    todo_days: todo ? Math.max(t.value === 'call_booked' ? -30 : 0, Math.min(365, Math.round(Number(a.todo_days) || 0))) : null,
    to_stage_id: todo ? null : a.to_stage_id || null,
  };
}

/**
 * What stops an automation being saved, as the calm line, or ''. An
 * automation can't move a lead to Won (that makes a client, with an
 * agreement: the coach does it), can't move a lead to the stage that
 * starts it, and can only move a lead when its trigger is about a lead.
 */
export function automationProblem(a, { stages = [] } = {}) {
  const t = TRIGGERS.find((x) => x.value === a.trigger);
  if (!t) return 'Choose what starts it to carry on.';
  if (!ACTIONS.some((x) => x.value === a.action)) return 'Choose what it does to carry on.';
  if (t.needs === 'stage' && !stageOf(stages, a.trigger_stage_id)) return 'Choose a stage to carry on.';
  if (a.action === 'todo') return clean(a.todo_title) ? '' : 'Type the to-do to carry on.';
  const to = stageOf(stages, a.to_stage_id);
  if (!to) return 'Choose the stage to move to, to carry on.';
  if (a.trigger === 'coaching_ended') return 'When coaching ends there’s no lead to move. Choose Add a to-do instead.';
  if (to.is_won) return 'Won makes a client, so it’s yours to do. Choose another stage.';
  if (a.trigger === 'lead_stage' && a.trigger_stage_id === a.to_stage_id) return 'That’s the stage that starts it. Choose another stage.';
  if (a.trigger === 'lead_won') return 'A won lead stays in Won. Choose Add a to-do instead.';
  return '';
}

// The events automations hear. Each has a `key` that names it for good: the
// database lets each automation run ONCE for each key (coach_automation_runs
// is unique on automation and event_key), so two tabs, a reload or a retry
// can never run one twice.

/** A lead reached a stage. `moveId`: the id of the move's own timeline line, so the same lead reaching the same stage later is a new event. */
export const stageEvent = (lead, stageId, moveId) => ({ trigger: 'lead_stage', key: `stage:${lead.id}:${stageId}:${moveId}`, leadId: lead.id, stageId });
/** A proposal has now been opened `count` times. Once for each automation, lead and proposal. */
export const openedEvent = (lead, proposalName, count) => ({ trigger: 'proposal_opened', key: `opened:${lead.id}:${lower(clean(proposalName)).slice(0, 80)}`, leadId: lead.id, count });
/** A lead has been quiet for `days`. Once for each automation and quiet spell (it starts again after the next contact). */
export const quietEvent = (lead, days) => ({ trigger: 'lead_quiet', key: `quiet:${lead.id}:${lead.last_contact_on || 'never'}`, leadId: lead.id, count: days });
/** A call was booked. `day`: the call's own day, which "the day before" counts from. */
export const bookedEvent = (lead, booking) => ({ trigger: 'call_booked', key: `booking:${booking.id}`, leadId: lead?.id ?? null, callTypeKey: booking.call_type_key || lead?.call_type_key || null, day: booking.day || null });
export const wonEvent = (lead) => ({ trigger: 'lead_won', key: `won:${lead.id}`, leadId: lead.id });
export const endedEvent = (profile) => ({ trigger: 'coaching_ended', key: `ended:${profile.id}:${profile.ended_on || ''}`, leadId: null, profileId: profile.id, name: profile.name });

/** Every open lead that is quiet now, as events (the app asks while the owner's portal is open). */
export function quietEvents(leads, stages, todayKey) {
  return openLeads(leads).map((l) => ({ l, days: quietDays(l, todayKey, stages) })).filter((x) => x.days != null && x.days >= 1).map((x) => quietEvent(x.l, x.days));
}

/** Whether an automation answers an event. */
export function automationMatches(a, event) {
  if (!a?.active || a.trigger !== event?.trigger) return false;
  if (a.trigger === 'lead_stage') return a.trigger_stage_id === event.stageId;
  if (a.trigger === 'proposal_opened' || a.trigger === 'lead_quiet') return (event.count || 0) >= (a.trigger_count || 1);
  if (a.trigger === 'call_booked') return !a.call_type_key || a.call_type_key === event.callTypeKey;
  return true;
}

/** How far one event may ripple through automations' own stage moves before it stops, whatever happens. */
export const CHAIN_MAX = 5;

/**
 * THE LOOP GUARD. What one event sets off, and nothing more:
 *  - the automations that match it, in their order, each with the run row
 *    to CLAIM FIRST (the app saves it; if the database refuses it, 23505,
 *    that automation has already run for this event: skip it);
 *  - an automation's own stage move is a new stage event that carries the
 *    first event's key as its `root` and the automations already run in
 *    this chain (`ran`). An automation runs AT MOST ONCE in a chain, so an
 *    automation's own stage move never sets off another automation more
 *    than once for each lead and event: A (to Deciding) and B (back to
 *    Proposal sent) run once each and stop. A follow-on run is claimed
 *    under the ROOT event's key ("<root>>chain"), so the database's own
 *    rule holds the same line across tabs and reloads;
 *  - a chain stops after CHAIN_MAX moves whatever happens.
 * @param {object} event stageEvent(), openedEvent() and the rest, or a follow-on from `follow`
 * @param {{ automations: object[], leads?: object[], stages?: object[], coachId: string, newId: () => string, nowIso: string, todayKey: string }} ctx
 * @returns {{ automation: object, run: object, todo: object|null, move: { lead: object, event: object }|null, follow: object|null }[]}
 *   for each step: save `run` first; only if it is taken, save `todo` or `move` (the lead, then its line), then hand `follow` back in
 */
export function automationSteps(event, { automations = [], leads = [], stages = [], coachId, newId, nowIso, todayKey }) {
  const ran = new Set(event.ran || []);
  const depth = event.depth || 0;
  const root = event.root || event.key;
  const chained = Boolean(event.root);
  const steps = [];
  let lead = event.leadId ? (leads || []).find((l) => l.id === event.leadId) || null : null;
  const matching = [...(automations || [])].filter((a) => automationMatches(a, event)).sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.id).localeCompare(String(b.id)));
  for (const a of matching) {
    if (ran.has(a.id)) continue; // once in a chain, never again
    if (a.action !== 'todo' && a.action !== 'stage') continue; // nothing else exists
    const run = { id: newId(), automation_id: a.id, coach_id: coachId, event_key: cut(chained ? `${root}>chain` : event.key, 200), lead_id: event.leadId || null, profile_id: event.profileId || null, todo_id: null, ran_at: nowIso };
    if (a.action === 'todo') {
      const base = event.trigger === 'call_booked' && event.day ? event.day : todayKey;
      const on = addDays(base, Math.round(Number(a.todo_days) || 0));
      const plannedOn = on && on < todayKey ? todayKey : on;
      const about = lead || { id: null, coach_id: coachId };
      const todo = { ...leadTodo({ id: newId(), lead: { ...about, coach_id: coachId }, title: a.todo_title, plannedOn, automationId: a.id }), profile_id: event.profileId || null };
      run.todo_id = todo.id;
      ran.add(a.id);
      steps.push({ automation: a, run, todo, move: null, follow: null });
      continue;
    }
    const to = stageOf(stages, a.to_stage_id);
    if (!lead || !isOpenLead(lead) || !to || to.is_won || lead.stage_id === to.id || isWonLead(lead, stages)) continue; // nothing to move: no run is claimed
    if (depth >= CHAIN_MAX) continue;
    const moveId = newId();
    const moved = stageMove(lead, to, { id: moveId, nowIso, todayKey, stages, by: a.id });
    ran.add(a.id);
    steps.push({ automation: a, run, todo: null, move: { lead: moved.lead, event: moved.event },
      follow: { ...stageEvent(moved.lead, to.id, moveId), root, depth: depth + 1, ran: [...ran] } });
    lead = moved.lead; // a later automation in this same event sees the lead where it now is
  }
  // Every follow-on knows everything that ran for this event, so nothing runs twice down any branch.
  for (const s of steps) if (s.follow) s.follow.ran = [...ran];
  return steps;
}

/**
 * Runs one event through to the end, with the app's own saving handed in:
 * each run is claimed first, a refused claim skips that step, and each
 * stage move's follow-on is run in turn (never the same automation twice).
 * Nothing here can send anything: a step is a to-do or a stage move.
 * @param {object} event
 * @param {object} ctx automationSteps' ctx; `leads` is read again through `ctx.leadsNow()` when given, so a follow-on sees the lead where it now is
 * @param {{ claim: (run: object) => Promise<boolean>, addTodo: (todo: object, step: object) => Promise<void>, move: (move: { lead: object, event: object }, step: object) => Promise<void> }} io
 * @returns {Promise<{ ran: number, todos: number, moves: number }>}
 */
export async function runAutomations(event, ctx, { claim, addTodo, move }) {
  const done = { ran: 0, todos: 0, moves: 0 };
  const queue = [event];
  let leads = ctx.leads || [];
  let alreadyRan = new Set(event.ran || []);
  while (queue.length) {
    const next = queue.shift();
    const steps = automationSteps({ ...next, ran: [...new Set([...(next.ran || []), ...alreadyRan])] }, { ...ctx, leads: ctx.leadsNow ? ctx.leadsNow() : leads });
    for (const step of steps) {
      if (!(await claim(step.run))) continue; // already ran for this event (another tab, a reload): skip it, and what it would have set off
      alreadyRan = new Set([...alreadyRan, step.automation.id]);
      done.ran += 1;
      if (step.todo) { await addTodo(step.todo, step); done.todos += 1; }
      if (step.move) {
        await move(step.move, step);
        done.moves += 1;
        leads = leads.map((l) => (l.id === step.move.lead.id ? step.move.lead : l));
        if (step.follow) queue.push(step.follow);
      }
    }
  }
  return done;
}

/** Whether an automation has already run for an event, among the runs the device holds (before 052 nothing else enforces once-only; with 052 the database's unique row does too). */
export const alreadyRan = (runs, run) => (runs || []).some((r) => r.automation_id === run.automation_id && r.event_key === run.event_key && r.id !== run.id);

/** A save's answer read as a claim: true when the run row was taken, false when the database refused it as already there (23505). */
export const claimed = (answerOrError) => !(answerOrError && (answerOrError.code === '23505' || answerOrError === 'duplicate'));

// ---------------------------------------------------------------- your own boards

/** The kinds a board's column can be. */
export const BOARD_COLUMN_KINDS = [['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['money', 'Money'], ['choice', 'Choice']];
/** "Start from" in New board: each with its stages and its fields. */
export const BOARD_TEMPLATES = [
  { key: 'blank', name: 'Blank', stages: ['To do', 'Doing', 'Done'], columns: [] },
  { key: 'speaking', name: 'Speaking', stages: ['Ideas', 'Pitched', 'Confirmed', 'Done'], columns: [['Date', 'date'], ['Fee', 'money'], ['Audience', 'text']] },
  { key: 'partners', name: 'Partners', stages: ['Talking', 'Trying it', 'Working together'], columns: [['Contact', 'text'], ['What we do together', 'text']] },
  { key: 'book', name: 'Book', stages: ['Ideas', 'Drafting', 'Editing', 'Done'], columns: [['Words', 'number'], ['Due', 'date']] },
  { key: 'podcast', name: 'Podcast guests', stages: ['To ask', 'Asked', 'Booked', 'Published'], columns: [['Show', 'text'], ['Recording', 'date']] },
];
export const BOARD_NAME_MAX = 60;
export const BOARD_HELP = 'You can edit the stages and fields at any time.';
/** A template's stages and fields in a line each: "Ideas, Pitched, Confirmed, Done"; "Date, Fee, Audience" ("None yet" for Blank). */
export const templateWords = (t) => ({ stages: t.stages.join(', '), fields: t.columns.length ? t.columns.map(([n]) => n).join(', ') : 'None yet' });

/** What stops a board's name being saved, or ''. */
export function boardProblem(name, boards = [], id = null) {
  const n = clean(name);
  if (!n) return 'Type the board’s name to carry on.';
  if (n.length > BOARD_NAME_MAX) return `Board names can be up to ${BOARD_NAME_MAX} characters.`;
  const same = boards.find((b) => b.id !== id && !b.archived_at && lower(clean(b.name)) === lower(n));
  return same ? `There’s already a board called ${same.name}. Choose another name.` : '';
}

/**
 * A new board from a template: the board (not shared: sharing is off until
 * the owner turns it on) and its stages.
 * @returns {{ board: object, stages: object[] }}
 */
export function newBoard({ id, coachId, name, template = 'blank', newId, boards = [] }) {
  const t = BOARD_TEMPLATES.find((x) => x.key === template) || BOARD_TEMPLATES[0];
  return {
    board: { id, coach_id: coachId, name: cut(clean(name), BOARD_NAME_MAX), columns: t.columns.map(([n, kind]) => ({ id: newId(), name: n, kind, ...(kind === 'choice' ? { options: [] } : {}) })), shared: false,
      position: Math.max(-1, ...boards.map((b) => Number(b.position) || 0)) + 1, archived_at: null },
    stages: t.stages.map((n, i) => ({ id: newId(), board_id: id, coach_id: coachId, name: n, position: i })),
  };
}

export const boardStagesOf = (stages, boardId) => (stages || []).filter((s) => s.board_id === boardId).sort((a, b) => (a.position || 0) - (b.position || 0));
export const boardItemsOf = (items, boardId) => (items || []).filter((i) => i.board_id === boardId);
/** Under a board's name in the list: "4 stages", "5 cards". */
export const boardLine = (board, stages, items) => [plural(boardStagesOf(stages, board.id).length, 'stage'), plural(boardItemsOf(items, board.id).length, 'card')];

/** A card's field as it reads: money as "£4,500", a date as "Wed 10 Jun", anything else as typed. */
export function boardFieldWords(column, value, todayKey) {
  if (value == null || value === '') return '';
  if (column.kind === 'money') return moneyWords(value);
  if (column.kind === 'number') return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-GB') : String(value);
  if (column.kind === 'date') return dayWords(value, todayKey) || String(value);
  return String(value);
}

/**
 * A field typed over on a card: the value to keep, or an error line.
 * A date is typed as "10 Jun", "10 Jun 2027", "10/6/2027" or 2027-06-10.
 * @returns {{ value: any }|{ error: string }}
 */
export function boardFieldFromTyped(column, typed, todayKey) {
  const t = clean(typed);
  if (!t) return { value: null };
  if (column.kind === 'money' || column.kind === 'number') {
    const n = column.kind === 'money' ? moneyFromTyped(t) : (/^-?\d{1,12}(\.\d{1,6})?$/.test(t.replace(/,/g, '')) ? Number(t.replace(/,/g, '')) : undefined);
    return typeof n === 'number' ? { value: n } : { error: column.kind === 'money' ? NEEDS_AMOUNT : 'Type a number.' };
  }
  if (column.kind === 'date') { const d = dayFromTyped(t, todayKey); return d ? { value: d } : { error: NEEDS_DAY }; }
  if (column.kind === 'choice' && Array.isArray(column.options) && column.options.length) {
    const hit = column.options.find((o) => lower(o) === lower(t));
    return hit ? { value: hit } : { error: 'Choose one of the options.' };
  }
  return { value: cut(t, 300) };
}
export const NEEDS_DAY = 'Type a date, such as 10 Jun or 10 Jun 2027.';
/**
 * A day as typed: "today", "10 Jun", "Wed 10 June 2027", "10/6/2027" (day
 * first) or 2027-06-10; without a year it is this year, and a day that
 * doesn't exist (30 Feb) is no day. One reader for the whole of Leads and
 * Network: network.js's typedDay.
 * @returns {string|null} 'YYYY-MM-DD'
 */
export const dayFromTyped = (typed, todayKey) => typedDay(typed, todayKey);

/** A card as the board shows it: its title, its first two filled fields on one line, the rest on the next. */
export function boardCard(board, item, todayKey) {
  const filled = (board.columns || []).map((c) => boardFieldWords(c, item.field_values?.[c.id], todayKey)).filter(Boolean);
  return { id: item.id, title: item.title, line: filled.slice(0, 2).join(', '), more: filled.slice(2).join(', ') };
}

/** A board as columns: each stage in order, how many cards, and the cards in their order. */
export function boardView(board, stages, items, todayKey) {
  const mine = boardItemsOf(items, board.id);
  return boardStagesOf(stages, board.id).map((stage) => {
    const cards = mine.filter((i) => i.stage_id === stage.id).sort((a, b) => (a.position || 0) - (b.position || 0) || lower(a.title).localeCompare(lower(b.title)));
    return { stage, count: cards.length, cards: cards.map((i) => boardCard(board, i, todayKey)) };
  });
}

/** A board as a table: Name, Stage, then its own columns; each cell's words ('' reads "Add" on the page). */
export function boardTable(board, stages, items, todayKey) {
  const names = new Map(boardStagesOf(stages, board.id).map((s) => [s.id, s.name]));
  return {
    head: ['Name', 'Stage', ...(board.columns || []).map((c) => c.name)],
    rows: boardItemsOf(items, board.id).sort((a, b) => (a.position || 0) - (b.position || 0) || lower(a.title).localeCompare(lower(b.title)))
      .map((i) => ({ id: i.id, title: i.title, stageId: i.stage_id, stage: names.get(i.stage_id) || '', cells: (board.columns || []).map((c) => ({ column: c.id, words: boardFieldWords(c, i.field_values?.[c.id], todayKey), numeric: c.kind === 'money' || c.kind === 'number' })) })),
  };
}

/** A new card, last in its stage. */
export function newBoardItem({ id, coachId, board, stageId, title, items = [] }) {
  const t = cut(clean(title), 200);
  if (!t) return { error: 'Type the card’s name to carry on.' };
  const inStage = boardItemsOf(items, board.id).filter((i) => i.stage_id === stageId);
  return { item: { id, board_id: board.id, coach_id: coachId, stage_id: stageId, title: t, field_values: {}, notes: null, position: Math.max(-1, ...inStage.map((i) => Number(i.position) || 0)) + 1 } };
}
/** A card moved to another stage (dragged, or with the arrow keys): last there. */
export function moveBoardItem(item, toStageId, items = []) {
  if (!item || item.stage_id === toStageId) return null;
  const there = (items || []).filter((i) => i.board_id === item.board_id && i.stage_id === toStageId);
  return { ...item, stage_id: toStageId, position: Math.max(-1, ...there.map((i) => Number(i.position) || 0)) + 1 };
}
/** A board's stage deleted: its cards go to the stage before it (or after, for the first). A board keeps at least one stage. */
export function deleteBoardStagePlan(board, stages, items, id) {
  const order = boardStagesOf(stages, board.id);
  const at = order.findIndex((s) => s.id === id);
  if (at < 0) return { ok: false, line: 'That stage has already gone.' };
  if (order.length <= 1) return { ok: false, line: 'A board needs at least one stage.' };
  const to = order[at - 1] || order[at + 1];
  const cards = boardItemsOf(items, board.id).filter((i) => i.stage_id === id);
  return { ok: true, stage: order[at], to, items: cards.map((i) => ({ ...i, stage_id: to.id })), line: cards.length ? `${order[at].name} removed. ${plural(cards.length, 'card')} moved to ${to.name}.` : `${order[at].name} removed.`, undo: { stage: order[at], items: cards } };
}
/** A board's column added, or taken away (its values stay on the cards, unseen, so Undo brings them back). */
export function withBoardColumn(board, { id, name, kind = 'text' }) {
  const n = cut(clean(name), 40);
  if (!n) return { error: 'Type the field’s name to carry on.' };
  if ((board.columns || []).some((c) => lower(c.name) === lower(n))) return { error: `There’s already a field called ${n}. Choose another name.` };
  if ((board.columns || []).length >= 30) return { error: 'A board can have up to 30 fields. Take one out first.' };
  return { board: { ...board, columns: [...(board.columns || []), { id, name: n, kind: BOARD_COLUMN_KINDS.some(([k]) => k === kind) ? kind : 'text', ...(kind === 'choice' ? { options: [] } : {}) }] } };
}
export const withoutBoardColumn = (board, columnId) => ({ ...board, columns: (board.columns || []).filter((c) => c.id !== columnId) });

/** A board's saved views: 049's coach_views with list 'board' and the board's id in its filters. */
export const boardViews = (views, boardId) => (views || []).filter((v) => v.list === 'board' && v.filters?.board_id === boardId).sort((a, b) => (a.position || 0) - (b.position || 0) || lower(a.name).localeCompare(lower(b.name)));
export const BOARD_LAYOUTS = [['board', 'Board'], ['list', 'List'], ['table', 'Table']];

/**
 * Sharing. A board is the owner's alone until the owner shares it (off by
 * default); a shared board can be READ by associates and changed only by
 * the owner. The database's rules say the same; these are for what a page
 * offers.
 */
export const boardsFor = (boards, { isOwner }) => (boards || []).filter((b) => !b.archived_at && (isOwner || b.shared)).sort((a, b) => (a.position || 0) - (b.position || 0) || lower(a.name).localeCompare(lower(b.name)));
export const canEditBoard = (board, { isOwner }) => Boolean(isOwner) && Boolean(board) && !board.archived_at;
/** The switch's label: "Share with Maya" for one associate, otherwise "Share with your associates". */
export const shareLabel = (associates = []) => (associates.length === 1 && firstName(associates[0].display_first_name || associates[0].name) ? `Share with ${firstName(associates[0].display_first_name || associates[0].name)}` : 'Share with your associates');
export const SHARE_HELP = 'They can see this board and can’t edit it.';
export const sharedToast = (on, associates = []) => (on ? `Shared. ${associates.length === 1 && firstName(associates[0].display_first_name || associates[0].name) ? firstName(associates[0].display_first_name || associates[0].name) : 'Your associates'} can see this board now.` : 'Not shared any more.');
/** What an associate reads at the top of a shared board. */
export const sharedBy = (ownerFirstName) => `${possessive(ownerFirstName || 'The owner')} board. You can see it and can’t edit it.`;

// ---------------------------------------------------------------- emails on timelines

/** The header lines of an email ("To", "Cc") as people, read as "Who's invited?" reads a pasted list. */
export const headerPeople = (text) => parsePeople(String(text || '').replace(/^\s*(to|cc|bcc|from)\s*:/i, '')).people;

/**
 * The copied-in address among an email's recipients: the address's own
 * part before the @ is the coach's key ("log.tim.7kx2…" logs the email;
 * "todo.tim.9bd3…" makes a to-do). With `domain`, only an address at the
 * portal's own inbound domain counts.
 * @param {(string|{ email?: string })[]} recipients everyone on To, Cc and Bcc
 * @param {string} [domain] the inbound domain (the server's to set)
 * @returns {{ key: string, kind: 'log'|'todo' }|null}
 */
export function copyInKey(recipients, domain = '') {
  const want = lower(clean(domain)).replace(/^@/, '');
  for (const r of recipients || []) {
    const address = lower(clean(typeof r === 'string' ? r : r?.email)).replace(/^.*<([^<>]+)>$/, '$1');
    const m = /^((log|todo)\.[a-z0-9]{1,20}\.[a-z0-9]{4,32})@([a-z0-9.-]+)$/.exec(address);
    if (m && (!want || m[3] === want)) return { key: m[1], kind: m[2] };
  }
  return null;
}
/** A coach's address in full, to show and copy; '' until both the key and the domain are known. */
export const copyInAddress = (key, domain) => (clean(key) && clean(domain) ? `${clean(key)}@${lower(clean(domain)).replace(/^@/, '')}` : '');

/** Everyone an email names, once each, in the order From, To, Cc. `main`: on the From or To line (someone only copied in never waits on Leads). */
export function emailPeople(email) {
  const out = new Map();
  const add = (p, main) => { const e = lower(clean(p?.email)); if (e && isEmail(e) && !out.has(e)) out.set(e, { email: e, name: cut(clean(p?.name), 120), main }); };
  add(email?.from || { name: email?.from_name, email: email?.from_email }, true);
  for (const p of email?.to || email?.to_people || []) add(p, true);
  for (const p of email?.cc || email?.cc_people || []) add(p, false);
  return [...out.values()];
}

/**
 * Who an email belongs to, from its addresses, as the database works it
 * out: everyone it names who is a lead, a client, a Network person or an
 * organisation's contact gets it on their timeline; anyone on its From or
 * To line who is none of those waits on Leads. The coach's own addresses
 * and the copy-in addresses themselves are nobody's timeline.
 * @param {object} email
 * @param {{ leads?: object[], clients?: object[], network?: object[], contacts?: object[], own?: string[], keys?: string[], waiting?: object[] }} who
 *   `network`: only the Network people with these addresses (asked for by email; Network is never loaded whole); `waiting`: the rows already waiting or decided (one row an address: "Not now" is remembered)
 * @returns {{ links: { person_kind: 'lead'|'client'|'network'|'contact', person_id: string }[], waiting: { name: string, email: string }[] }}
 */
export function emailBelongs(email, { leads = [], clients = [], network = [], contacts = [], own = [], keys = [], waiting = [] } = {}) {
  const mine = new Set(own.map((e) => lower(clean(e))).filter(Boolean));
  const keySet = new Set(keys.map((k) => lower(k)));
  const links = [];
  const wait = [];
  const decided = new Set((waiting || []).map((w) => lower(w.email)));
  for (const p of emailPeople(email)) {
    if (mine.has(p.email) || keySet.has(p.email.split('@')[0])) continue;
    const same = (row) => lower(row.email) === p.email;
    const l = leads.filter((x) => same(x));
    const c = clients.filter((x) => same(x));
    const n = network.filter((x) => same(x));
    const o = contacts.filter((x) => same(x));
    for (const x of l.filter((r) => !r.merged_into)) links.push({ person_kind: 'lead', person_id: x.id });
    for (const x of c.filter((r) => !r.merged_into)) links.push({ person_kind: 'client', person_id: x.id });
    for (const x of n.filter((r) => !r.merged_into)) links.push({ person_kind: 'network', person_id: x.id });
    for (const x of o) links.push({ person_kind: 'contact', person_id: x.id });
    if (p.main && !l.length && !c.length && !n.length && !o.length && !decided.has(p.email)) { decided.add(p.email); wait.push({ name: p.name, email: p.email }); }
  }
  return { links, waiting: wait };
}

/** The line on Leads for someone waiting: "You emailed Sarah Kent, who isn’t in the portal yet." */
export function waitingLine(waiting, email = null) {
  const who = clean(waiting?.name) || clean(waiting?.email);
  return email?.direction === 'in' ? `${who} emailed you, and isn’t in the portal yet.` : `You emailed ${who}, who isn’t in the portal yet.`;
}
export const WAITING_BUTTONS = { add: 'Add as a lead', dismiss: 'Not now' };

/**
 * Add as a lead: the lead (source "Your email"), the waiting row marked
 * added, the email put on the new lead's timeline, and its line there.
 * @returns {{ lead: object, waiting: object, link: object, event: object, toast: string }|{ error: string }}
 */
export function leadFromWaiting(waiting, email, { id, eventId, coachId, stages = [], nowIso, todayKey }) {
  const name = clean(waiting.name) || clean(String(waiting.email).split('@')[0].replace(/[._-]+/g, ' ')).replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  const made = newLead({ id, coachId, stages, name, email: waiting.email, source: 'email' });
  if (made.error) return made;
  const sentOn = email?.sent_at ? dayOfInstant(email.sent_at) : todayKey;
  const lead = { ...made.lead, last_contact_on: sentOn };
  return {
    lead,
    waiting: { ...waiting, status: 'added', lead_id: id, decided_at: nowIso },
    link: { email_id: waiting.email_id, coach_id: coachId, person_kind: 'lead', person_id: id },
    event: { ...leadEvent({ id: eventId, lead, kind: 'email', nowIso: email?.sent_at || nowIso, todayKey: sentOn, title: clean(email?.subject) || 'Email', data: { email_id: waiting.email_id, direction: email?.direction || 'out' } }) },
    toast: LEAD_ADDED(firstStage(stages)),
  };
}
/** Not now: the row is kept as dismissed, so that address is never asked about again. */
export const dismissWaiting = (waiting, nowIso) => ({ ...waiting, status: 'dismissed', decided_at: nowIso });
export const WAITING_DISMISSED = 'Left out. You won’t be asked about them again.';
/** The rows still waiting, newest first. */
export const waitingRows = (waiting) => (waiting || []).filter((w) => w.status === 'waiting').sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

/** An email opened from a timeline: its heading, who and when, and what can be done with it. Nothing here replies or sends. */
export function emailPanel(email, todayKey) {
  const day = dayOfInstant(email.sent_at);
  return {
    title: clean(email.subject) || 'No subject',
    from: email.direction === 'in' ? clean(email.from_name) || clean(email.from_email) : 'You',
    to: email.direction === 'in' ? '' : listWords((email.to_people || []).map((p) => clean(p.name) || p.email)),
    when: day === todayKey ? `Today, ${timeOfInstant(email.sent_at)}` : `${dayWords(day, todayKey)}, ${timeOfInstant(email.sent_at)}`,
    snippet: clean(email.snippet),
    hide: 'Hide this thread',
    open: /^https:\/\//.test(String(email.link || '')) ? { label: email.source === 'gmail' ? 'Open in Gmail' : 'Open the email', href: email.link } : null,
  };
}
/** Hide this thread: every email of the thread, marked hidden (Undo saves them back as they were). */
export function hideThread(emails, email) {
  const same = (e) => (email.thread_key ? e.thread_key === email.thread_key : e.id === email.id);
  const before = (emails || []).filter((e) => same(e) && !e.hidden);
  return { save: before.map((e) => ({ ...e, hidden: true })), undo: before, toast: 'Hidden from this timeline.' };
}

/** Settings, Email: the words beside each row. */
export const EMAIL_SETTINGS = {
  copyIn: { label: 'Copy-in address', help: 'Copy it into any email, and the email lands on that person’s timeline.' },
  forward: { label: 'Forward emails to to-dos', help: 'Forward any email to it, and it becomes a to-do.' },
  gmail: { label: 'Log Gmail with clients and leads', value: 'One line each on their timeline', help: 'Associates never see your inbox. You can hide any thread from its timeline.' },
  notSetUp: 'This address is ready once the email service is set up.',
  copied: 'Copied',
};

// ---------------------------------------------------------------- past clients stay warm

/** Check-ins are suggested this many months after coaching ends. */
export const CHECK_IN_MONTHS = [3, 6, 12];
/** A check-in shows as due from this many days before its day. */
export const CHECK_IN_AHEAD = 30;
export const CHECK_INS_SWITCH = 'Suggest check-ins at 3, 6 and 12 months';
export const checkInsOn = (settings) => settings?.crm?.suggest_check_ins !== false;
/** "6-month check-in". */
export const checkInName = (months) => `${months}-month check-in`;

/**
 * The check-ins to suggest when coaching ends: one at 3, 6 and 12 months
 * after the day it ended (one a client and month mark; any already there
 * are left alone).
 * @returns {object[]} client_check_ins rows to add
 */
export function checkInsFor(profile, { coachId, newId, existing = [] }) {
  if (!profile?.ended_on) return [];
  return CHECK_IN_MONTHS.filter((m) => !existing.some((c) => c.profile_id === profile.id && c.months === m))
    .map((m) => ({ id: newId(), coach_id: coachId, profile_id: profile.id, months: m, due_on: monthsOn(profile.ended_on, m), done_at: null, skipped_at: null, note: null, ask: null }));
}

/**
 * Check-ins due: not done, not skipped, and due within 30 days (or
 * already past), the soonest first. One a past client: their next.
 * @param {object[]} checkIns
 * @param {object[]} profiles the coach's clients (past ones are read)
 * @param {{ todayKey: string, organisations?: object[] }} ctx
 * @returns {{ id: string, profileId: string, name: string, what: string, sub: string, when: string, overdue: boolean, dueOn: string }[]}
 */
export function checkInsDue(checkIns, profiles, { todayKey, organisations = [] } = {}) {
  const until = addDays(todayKey, CHECK_IN_AHEAD);
  const people = new Map((profiles || []).filter((p) => !p.merged_into).map((p) => [p.id, p]));
  const seen = new Set();
  return (checkIns || []).filter((c) => !c.done_at && !c.skipped_at && c.due_on && c.due_on <= until && people.has(c.profile_id))
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.months - b.months)
    .filter((c) => (seen.has(c.profile_id) ? false : (seen.add(c.profile_id), true)))
    .map((c) => {
      const p = people.get(c.profile_id);
      return { id: c.id, profileId: p.id, name: p.name, what: checkInName(c.months), sub: (organisations || []).find((o) => o.id === p.organisation_id)?.name || 'Self-funded',
        when: `Due ${c.due_on === todayKey ? 'today' : dayWords(c.due_on, todayKey)}`, overdue: c.due_on < todayKey, dueOn: c.due_on };
    });
}

/** The ask a check-in can carry, at the right moment: a testimonial first, a referral from 6 months. Tim chooses each one. */
export const suggestedAsk = (months) => (months >= 6 ? 'referral' : 'testimonial');
export const ASK_BUTTONS = {
  referral: { add: 'Add referral ask', remove: 'Take out the referral ask' },
  testimonial: { add: 'Add testimonial ask', remove: 'Take out the testimonial ask' },
};
const ASK_LINES = {
  referral: 'If anyone you know is facing something similar, I’d be glad to be introduced.',
  testimonial: 'If you’d be happy to say a few words about our work together, I’d be grateful.',
};

/**
 * A note to a past client, for the coach to edit and send from their own
 * email app. Nothing is sent from the portal.
 * @param {object} profile
 * @param {{ months: number, ask?: 'referral'|'testimonial'|null }} checkIn
 * @param {{ coachFirstName?: string }} [o]
 * @returns {{ subject: string, body: string }}
 */
export function checkInNote(profile, checkIn, { coachFirstName = '' } = {}) {
  const first = firstName(profile?.name) || 'there';
  const since = checkIn.months === 12 ? 'a year' : `${checkIn.months} months`;
  const lines = [`Hi ${first},`, '', `It’s been ${since} since we finished working together, and I’ve been wondering how things are going.`, 'How are you getting on?'];
  if (ASK_LINES[checkIn.ask]) lines.push('', ASK_LINES[checkIn.ask]);
  if (clean(coachFirstName)) lines.push('', clean(coachFirstName));
  return { subject: 'How are things?', body: lines.join('\n') };
}
/** "Open in my email": the mailto link (nothing without an email address), and the check-in marked done with its note. */
export function checkInSend(profile, checkIn, note, nowIso) {
  const mail = quickContacts({ email: profile?.email }, { subject: note.subject, body: note.body }).find((c) => c.key === 'email') || null;
  return { href: mail ? mail.href : null, checkIn: { ...checkIn, done_at: nowIso, note: cut(String(note.body || ''), 6000) || null },
    toast: mail ? `Your email opens with this note to ${firstName(profile.name)}. Nothing is sent until you send it.` : `${firstName(profile?.name) || 'This client'} has no email address yet. Add one, then try again.` };
}
/** Not now: the check-in moves two weeks on. */
export function checkInLater(checkIn, todayKey) {
  const on = addDays(todayKey, 14);
  return { checkIn: { ...checkIn, due_on: on }, toast: `Moved to ${dayWords(on, todayKey)}.`, undo: checkIn };
}
/** The check-in's panel: its meta lines. */
export const checkInMeta = (profile, checkIn, todayKey) => [`${checkInName(checkIn.months)}, due ${dayWords(checkIn.due_on, todayKey)}`, profile?.ended_on ? `Ended ${dayWords(profile.ended_on, todayKey)}` : ''].filter(Boolean);

// ---------------------------------------------------------------- an organisation's account map

/** Who's who: what each role reads as. */
export const CONTACT_ROLES = [['sponsor', 'Sponsor'], ['buyer', 'Buyer'], ['hr', 'HR'], ['participant', 'Participant'], ['invoices', 'Invoices']];
const ROLE_WORDS = Object.fromEntries(CONTACT_ROLES);
const HOW_WORDS = { spoke: 'Spoke', emailed: 'Emailed', email: 'Emailed', met: 'Met', call: 'Spoke' };
const DEAL_STATUS = { draft: 'Draft', sent: 'Proposal sent', active: 'Active', ended: 'Ended', lost: 'Not going ahead' };
const GROWTH_ACTIONS = { seats: 'Offer the seats', renewal: 'Plan a renewal', workshop: 'Add to the pipeline', other: 'Add to the pipeline' };
export const ACCOUNT_MAP_PARTS = ['Who’s who', 'Agreements and proposals', 'Room to grow'];

/**
 * The account map's three parts for one organisation.
 *  - Who's who: its contacts (sponsor, buyer, HR, participants, invoices)
 *    with when you last spoke, then its clients and its groups. An
 *    associate's client shows by name only ("Maya's client").
 *  - Agreements and proposals: each deal, its status, its value ("£640/
 *    month"), when it renews, and how often a proposal was opened.
 *  - Room to grow: what's still open, each with the one thing to do next.
 * @param {{ organisation: object, contacts?: object[], clients?: object[], adminClients?: object[], groups?: object[], deals?: object[], growth?: object[], todayKey: string }} o
 *   `adminClients`: an associate's clients as coach_admin_clients() hands them to the owner ({ name, coach_first_name, organisation_id })
 */
export function accountMap({ organisation, contacts = [], clients = [], adminClients = [], groups = [], deals = [], growth = [], todayKey }) {
  const mine = (row) => row.organisation_id === organisation.id;
  const whosWho = [
    ...contacts.filter(mine).map((c) => ({
      kind: 'contact', id: c.id, name: c.name, role: (c.roles || []).map((r) => ROLE_WORDS[r]).filter(Boolean).join(', ') || clean(c.job_title) || 'Contact',
      note: clean(c.note) || ((c.roles || []).length ? clean(c.job_title) : ''), last: c.last_contact_on ? `${HOW_WORDS[c.last_contact_how] || 'Spoke'} ${dayWords(c.last_contact_on, todayKey)}` : '',
    })),
    ...clients.filter((p) => mine(p) && !p.merged_into && p.status !== 'past').map((p) => ({ kind: 'client', id: p.id, name: p.name, role: 'Client', note: clean(p.job_title), last: '' })),
    ...adminClients.filter(mine).map((p) => ({ kind: 'other', id: null, name: p.name, role: `${possessive(clean(p.coach_first_name) || 'An associate')} client`, note: '', last: '' })),
    ...groups.filter(mine).map((g) => ({ kind: 'group', id: g.id, name: g.name, role: g.size ? `Group of ${g.size}` : 'Group', note: '', last: '' })),
  ];
  const order = { active: 0, sent: 1, draft: 2, ended: 3, lost: 4 };
  const dealRows = deals.filter(mine).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || lower(a.name).localeCompare(lower(b.name))).map((d) => ({
    id: d.id, name: d.name, kind: d.kind, status: DEAL_STATUS[d.status] || '', detail: clean(d.detail),
    value: rateWords(d.value, d.per, d.currency || 'GBP'), valueSpoken: rateSpoken(d.value, d.per, d.currency || 'GBP'),
    renews: d.renews_on && d.status === 'active' ? `Renews ${dayWords(d.renews_on, todayKey)}` : '',
    opened: d.kind === 'proposal' ? openedWords(Number(d.opens) || 0) : '', leadId: d.lead_id || null,
  }));
  const growRows = growth.filter((g) => mine(g) && (g.status === 'open' || g.status === 'raised')).map((g) => ({
    id: g.id, title: g.title, note: clean(g.note), raised: g.status === 'raised', action: g.status === 'raised' ? (g.lead_id ? 'Open the lead' : '') : GROWTH_ACTIONS[g.kind] || GROWTH_ACTIONS.other, leadId: g.lead_id || null,
  }));
  return { whosWho, deals: dealRows, growth: growRows, nextRenewal: nextRenewal(deals.filter(mine), todayKey) };
}
/** The next renewal among an organisation's active agreements: "Mon 8 Mar", or '' when none is set. */
export function nextRenewal(deals, todayKey) {
  const next = (deals || []).filter((d) => d.status === 'active' && d.renews_on && d.renews_on >= todayKey).map((d) => d.renews_on).sort()[0];
  return next ? dayWords(next, todayKey) : '';
}

/**
 * Room to grow, "Add to the pipeline": a lead for the organisation (with
 * its sponsor or buyer as the person, when there is one) and the growth
 * row marked as raised, pointing at it.
 * @returns {{ lead: object, growth: object, toast: string }|{ error: string }}
 */
export function growthToLead(growth, organisation, { id, coachId, stages = [], contacts = [] }) {
  const who = contacts.find((c) => c.organisation_id === organisation.id && (c.roles || []).some((r) => r === 'sponsor' || r === 'buyer')) || null;
  const made = newLead({ id, coachId, stages, name: who?.name || organisation.name, email: who?.email || '', organisation: organisation.name, source: 'manual',
    extra: { organisation_id: organisation.id, job_title: who?.job_title || null, next_step: cut(clean(growth.title).replace(/\.$/, ''), 200) || null } });
  if (made.error) return made;
  return { lead: made.lead, growth: { ...growth, status: 'raised', lead_id: id }, toast: LEAD_ADDED(firstStage(stages)) };
}

// ---------------------------------------------------------------- the Leads pages' own rules (the page, its panels and search)

/** No filter on: what "Clear" puts back. */
export const EMPTY_LEAD_FILTERS = { stage: [], next: [], last: [], value: [], tag: [], fields: {} };
export const LEAD_LAYOUTS = [{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }, { value: 'table', label: 'Table' }];
/** A board column shows this many cards, then "Show all 67". */
export const BOARD_FOLD = 25;
/** How many filters are on (the Filter button says "Filter, 2 on"). */
export const leadFilterCount = (f = {}) => ['stage', 'next', 'last', 'value', 'tag'].filter((k) => Array.isArray(f[k]) && f[k].length).length + Object.values(f.fields || {}).filter((v) => Array.isArray(v) && v.length).length;
/** A view to save from the list as it stands (049's coach_views, list 'leads'); the search box is never part of it. */
export const leadViewFromList = (name, { filters = {}, sort = 'next', hidden = [], layout = 'board' } = {}) => { const { q: _q, ...kept } = filters; return { name: cut(clean(name), 60), filters: kept, sort, columns: hidden, layout }; };
/** What a saved view puts back on Leads (anything it doesn't know is left at its start). */
export function leadListFromView(view) {
  const f = view?.filters && typeof view.filters === 'object' && !Array.isArray(view.filters) ? view.filters : {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    filters: { stage: list(f.stage), next: list(f.next), last: list(f.last), value: list(f.value), tag: list(f.tag), fields: f.fields && typeof f.fields === 'object' && !Array.isArray(f.fields) ? f.fields : {} },
    sort: typeof view?.sort === 'string' && view.sort ? view.sort : 'next',
    hidden: list(view?.columns),
    layout: ['board', 'list', 'table'].includes(view?.layout) ? view.layout : 'board',
  };
}

/**
 * The table's columns after Name, in order: Stage, Next step, Last contact,
 * then the coach's own fields, with the lead's own Value where a field of
 * that name would sit (so there is one Value column, never two: M11 draws
 * Sector, Value, Renewal date), or straight after Last contact.
 * @param {object[]} fields the coach's own fields for leads, in their order
 * @returns {{ key: string, label: string, sorts: [string, string][], only?: string|[string, string][], edit?: string, field?: object }[]}
 */
export function leadTableColumns(fields = []) {
  const own = LEAD_COLUMNS.filter((c) => c.key !== 'name');
  const value = own.find((c) => c.key === 'value');
  const out = own.filter((c) => c.key !== 'value');
  let placed = false;
  const mine = [];
  for (const f of fields) {
    if (lower(clean(f.name)) === 'value') { if (!placed) { mine.push(value); placed = true; } continue; }
    const key = `field:${f.id}`;
    mine.push({ key, label: f.name, field: f, edit: 'type', sorts: f.kind === 'number' ? [[key, 'Lowest first'], [`${key}:desc`, 'Highest first']] : f.kind === 'date' ? [[key, 'Soonest first']] : [[key, 'A to Z']] });
  }
  return placed ? [...out, ...mine] : [...out, value, ...mine];
}
/** The coach's own fields a lead's Details show: every one but a field named Value, which is the lead's own Value. */
export const leadOwnFields = (fields = []) => fields.filter((f) => lower(clean(f.name)) !== 'value');

/**
 * The two lines a booking leaves on its lead's timeline, for a lead a
 * booking made before 052 was there (the database writes them itself once
 * it is: then this gives nothing). They are shown, never saved.
 * @param {object} lead
 * @param {{ events?: object[], booking?: object|null, callName?: string }} o
 * @returns {object[]} timeline lines shaped as coach_lead_events rows
 */
export function bookingLines(lead, { events = [], booking = null, callName = '' } = {}) {
  if (!lead?.booking_id || (events || []).some((e) => e.lead_id === lead.id && (e.kind === 'booking' || e.kind === 'first_contact'))) return [];
  const at = booking?.created_at || lead.created_at;
  const day = at ? dayOfInstant(at) : null;
  if (!day) return [];
  const words = BOOKING_LINES(callName);
  const line = (key, kind, w) => ({ id: `${lead.id}:${key}`, coach_id: lead.coach_id, lead_id: lead.id, kind, happened_at: at, happened_on: day, title: w.title, detail: w.detail, data: { booking_id: lead.booking_id, shown_only: true } });
  // Newest first on the page: "Booked" sits above "First contact", as the database's own two lines do.
  return [line('0first', 'first_contact', words.first), line('1booked', 'booking', words.booked)];
}

/** Edit stages as it opens: one row a stage, in order, Won last. */
export const stagesDraft = (stages) => stagesInOrder(stages).map((s) => ({ id: s.id, name: s.name, likelihood: String(Number(s.likelihood) || 0), is_won: Boolean(s.is_won), removed: false, toId: null }));

/**
 * Edit stages, saved: what was renamed, given a new likelihood, added,
 * moved or removed, as rows. A removed stage's leads move first (to the
 * stage chosen, or the one before it), and any automation naming it goes.
 * @param {object[]} stages as they are now
 * @param {object[]} leads every lead (cold and merged ones too)
 * @param {{ id: string, name: string, likelihood: string|number, is_won: boolean, removed: boolean, toId: string|null }[]} draft the panel's rows, in their new order
 * @param {{ coachId: string, automations?: object[] }} o
 * @returns {{ error: string, at?: string }|{ same: true }|{ save: [string, object][], remove: [string, string][], undo: { save: [string, object][], remove: [string, string][] }, toast: string, moved: number }}
 *   save `save` in order (stages first, then the leads), then remove `remove` (automations, then stages); Undo saves `undo.save` and removes `undo.remove`
 */
export function stagesSavePlan(stages, leads, draft, { coachId, automations = [] } = {}) {
  const kept = (draft || []).filter((d) => !d.removed);
  const open = kept.filter((d) => !d.is_won);
  if (!open.length) return { error: 'A pipeline needs at least one stage before Won.' };
  // A name used twice is said at the second of the two.
  for (const [i, d] of kept.entries()) { const line = stageProblem(d, kept.slice(0, i)); if (line) return { error: line, at: d.id }; }
  const save = [];
  const before = [];
  const added = [];
  open.forEach((d, i) => {
    const was = stageOf(stages, d.id);
    if (!was) { save.push(['coach_lead_stages', { ...addStage([], { id: d.id, coachId, name: d.name, likelihood: d.likelihood }), position: i }]); added.push(d.id); return; }
    const next = { ...editStage(was, d), position: i };
    if (next.name !== was.name || Number(next.likelihood) !== Number(was.likelihood) || next.position !== was.position) { save.push(['coach_lead_stages', next]); before.push(was); }
  });
  const won = wonStage(stages);
  const wonDraft = kept.find((d) => d.is_won);
  if (won && wonDraft && editStage(won, { name: wonDraft.name }).name !== won.name) { save.push(['coach_lead_stages', editStage(won, { name: wonDraft.name })]); before.push(won); }
  const order = stagesInOrder(stages).filter((s) => !s.is_won);
  const stays = new Set(open.map((d) => d.id));
  const gone = (draft || []).filter((d) => d.removed).map((d) => ({ d, stage: stageOf(stages, d.id) })).filter((x) => x.stage && !x.stage.is_won);
  const movedLeads = [];
  const leadsBefore = [];
  const autos = [];
  for (const { d, stage } of gone) {
    const at = order.findIndex((s) => s.id === stage.id);
    const near = [...order.slice(0, at).reverse(), ...order.slice(at + 1)].find((s) => stays.has(s.id));
    const toId = (d.toId && stays.has(d.toId) ? d.toId : null) || near?.id || open[0].id;
    for (const l of (leads || []).filter((x) => x.stage_id === stage.id)) { leadsBefore.push(l); movedLeads.push({ ...l, stage_id: toId }); }
    for (const a of (automations || []).filter((x) => x.trigger_stage_id === stage.id || x.to_stage_id === stage.id)) if (!autos.includes(a)) autos.push(a);
  }
  if (!save.length && !gone.length) return { same: true };
  return {
    save: [...save, ...movedLeads.map((l) => ['coach_leads', l])],
    remove: [...autos.map((a) => ['coach_automations', a.id]), ...gone.map((x) => ['coach_lead_stages', x.stage.id])],
    undo: { save: [...[...before, ...gone.map((x) => x.stage)].map((s) => ['coach_lead_stages', s]), ...leadsBefore.map((l) => ['coach_leads', l]), ...autos.map((a) => ['coach_automations', a])], remove: added.map((id) => ['coach_lead_stages', id]) },
    toast: STAGES_SAVED,
    moved: movedLeads.filter(isOpenLead).length,
  };
}

/**
 * Edit details, saved: the lead with what was typed. The stage isn't
 * changed here (a stage move has its own line on the timeline: `toStageId`
 * says where to move it afterwards, or null).
 * @param {object} lead
 * @param {{ name: string, organisation?: string, job_title?: string, email?: string, phone?: string, stageId?: string, next_step?: string, next_step_on?: string, value?: string, source?: string, referred_by?: string, notes?: string }} typed
 * @param {{ organisations?: object[] }} [o] the organisations the coach can see: a typed name that is one of them is joined to it
 * @returns {{ lead: object, toStageId: string|null }|{ error: string, at: string }}
 */
export function leadDetailsPatch(lead, typed = {}, { organisations = [] } = {}) {
  const name = cut(clean(typed.name), 120);
  if (!name) return { error: LEAD_NEEDS_NAME, at: 'name' };
  const email = lower(clean(typed.email));
  if (email && !isEmail(email)) return { error: LEAD_NEEDS_EMAIL, at: 'email' };
  const value = moneyFromTyped(typed.value);
  if (value === undefined) return { error: NEEDS_AMOUNT, at: 'value' };
  const organisation = cut(clean(typed.organisation), 120) || null;
  const sameOrg = lower(organisation) === lower(clean(lead.organisation));
  const org = organisation ? (organisations || []).find((o) => lower(clean(o.name)) === lower(organisation)) || null : null;
  const source = LEAD_SOURCES.some(([k]) => k === typed.source) ? typed.source : lead.source;
  const by = source === 'referral' ? cut(clean(typed.referred_by), 120) || null : null;
  const stepped = withNextStep(lead, typed.next_step);
  const on = stepped.next_step && /^\d{4}-\d{2}-\d{2}$/.test(String(typed.next_step_on || '')) ? typed.next_step_on : null;
  return {
    lead: {
      ...lead, name, email: email || null, organisation, organisation_id: sameOrg ? lead.organisation_id ?? org?.id ?? null : org?.id ?? null, job_title: cut(clean(typed.job_title), 120) || null,
      phone: cut(clean(typed.phone), 40) || null, value, source, referred_by: by, referred_by_person: by && by === clean(lead.referred_by) ? lead.referred_by_person ?? null : null,
      next_step: stepped.next_step, next_step_on: on, next_step_time: on && on === lead.next_step_on ? lead.next_step_time ?? null : null,
      notes: has(typed, 'notes') ? cut(String(typed.notes || '').trim(), 6000) || null : lead.notes ?? null,
    },
    toStageId: typed.stageId && typed.stageId !== lead.stage_id ? typed.stageId : null,
  };
}

/** A spreadsheet chosen for import that can't be read here: the calm line to show, or '' when it can. */
export function importFileProblem(name, size = 0) {
  if (/\.(xlsx|xls|xlsm|numbers|ods)$/i.test(String(name || ''))) return 'An Excel file can’t be read here yet. Save it as CSV, or copy the rows and paste them.';
  if (!/\.(csv|tsv|txt)$/i.test(String(name || ''))) return 'That file can’t be read here. Save it as CSV, or copy the rows and paste them.';
  return size > 4 * 1024 * 1024 ? 'That file is too big. Split it, or paste the rows instead.' : '';
}

/** Leads as search finds them (the owner's search only): open and cold leads by name, organisation or email; a won lead is found as the client it became. */
export function leadSearchItems(leads, stages = []) {
  return (leads || []).filter((l) => !l.merged_into && !isWonLead(l, stages))
    .map((l) => ({ key: `l:${l.id}`, title: l.name, kind: l.cold_at ? 'Cold lead' : 'Lead', also: `${l.organisation || ''} ${l.email || ''}`, to: `/coach/leads/${l.id}` }));
}
/** Leads' own actions in search. */
export const LEAD_SEARCH_ACTIONS = [
  { key: 'a:lead', title: 'Add lead', to: '/coach/leads', state: { open: 'add' } },
  { key: 'a:lead-import', title: 'Import leads from a spreadsheet', to: '/coach/leads', state: { open: 'import' } },
  { key: 'a:lead-export', title: 'Export leads to a spreadsheet', to: '/coach/leads', state: { open: 'export' } },
];

/** What automations did after something the coach did, to add to its message: "An automation added a to-do." ('' when none ran). */
export function automationsSaid(done) {
  const todos = done?.todos || 0;
  const moves = done?.moves || 0;
  return [todos === 1 ? 'An automation added a to-do.' : todos ? `Automations added ${todos} to-dos.` : '', moves ? 'An automation moved the lead on.' : ''].filter(Boolean).join(' ');
}

/** Leads with nobody in it yet, and a search or filter that finds nobody. */
export const LEADS_EMPTY = 'You have no leads yet. Add one, or import a spreadsheet. A booking from one of your pages lands here by itself.';
export const LEADS_NO_MATCH = 'Nobody matches. Clear the search or the filters to see every lead.';
/** A lead that has gone (deleted, or merged into another that can't be found). */
export const LEAD_GONE = 'This lead isn’t in your list any more.';
