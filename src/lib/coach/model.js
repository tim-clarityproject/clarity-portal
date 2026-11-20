// The coach portal's rules, Clarity Coach (Phase 6a run 1; mock-up M11,
// version 3.6). Pure functions only: nothing here reads the database, the
// device or the clock by itself, so every rule is a unit test
// (tests/performance/coach-model.test.mjs).
import { addDays as addZoneDays, instantAt, isZone, wallClock, zonePlace } from '../time/index.js';

const UNSEEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​-‏‪-‮⁠-⁤﻿]/g;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Text as typed, without what can't be seen and without spaces round it. */
export const clean = (value) => String(value ?? '').replace(UNSEEN, '').replace(/\s+/g, ' ').trim();

/**
 * The first `max` characters of what was typed, never ending on half of an emoji (a character kept as a pair is
 * left out whole when only its first half would fit: the database refuses half of one).
 */
export function cut(value, max) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return text.slice(0, /[\uD800-\uDBFF]/.test(text[max - 1]) ? max - 1 : max);
}

// ---------------------------------------------------------------- days

/** A day key ("2026-11-19") as a local Date at midday (never shifted by a clock change). */
export function fromDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

export function toDayKey(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(key, n) {
  const d = fromDayKey(key);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

/** "Thu 19 Nov", with the year when it isn't this one. Empty for no day. */
export function dayWords(key, todayKey) {
  const d = fromDayKey(key);
  if (!d) return '';
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const thisYear = todayKey ? Number(String(todayKey).slice(0, 4)) : new Date().getFullYear();
  return d.getFullYear() === thisYear ? base : `${base} ${d.getFullYear()}`;
}

/** "Mon 21 Dec to Sun 3 Jan", or the one day. */
export function rangeWords(from, to, todayKey) {
  if (!from) return '';
  return !to || to === from ? dayWords(from, todayKey) : `${dayWords(from, todayKey)} to ${dayWords(to, todayKey)}`;
}

/** "12 Mar" for a birthday kept as a month and a day. */
export const birthdayWords = (month, day) => (month && day ? `${day} ${MONTHS[month - 1]}` : '');

// ---------------------------------------------------------------- lists people paste

const EMAIL = /^[^\s@,;<>()[\]\\":]+@[^\s@,;<>()[\]\\":]+\.[^\s@,;<>()[\]\\":]+$/;
export const isEmail = (value) => EMAIL.test(String(value || '')) && clean(value) === String(value);

/**
 * "Who's invited?": names and emails pasted in any of the usual shapes,
 * split by commas, semicolons, tabs or new lines, "Name <email>" included.
 * Duplicates (the same email, whatever its capitals) are taken out.
 * @returns {{ people: {name: string, email: string}[], duplicates: number, unread: string[] }}
 */
export function parsePeople(text) {
  const people = [];
  const unread = [];
  const seen = new Set();
  let duplicates = 0;
  let waitingName = '';
  const take = (name, email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) { duplicates += 1; return; }
    seen.add(key);
    people.push({ name: clean(name).replace(/^["']+|["']+$/g, ''), email: key });
  };
  for (const raw of String(text || '').split(/[\n\r;,\t]+/)) {
    const piece = clean(raw);
    if (!piece) continue;
    const angled = /^(.*?)<\s*([^<>\s]+)\s*>$/.exec(piece);
    if (angled && isEmail(angled[2])) {
      take(angled[1] || waitingName, angled[2]);
      waitingName = '';
      continue;
    }
    const words = piece.split(' ');
    const last = words[words.length - 1].replace(/^[<(]|[>)]$/g, '');
    if (isEmail(last)) {
      take(words.slice(0, -1).join(' ') || waitingName, last);
      waitingName = '';
      continue;
    }
    if (piece.includes('@')) { unread.push(piece); waitingName = ''; continue; }
    // A name on its own: it belongs to the email that follows it ("Dan Reid, dan@…").
    if (waitingName) unread.push(waitingName);
    waitingName = piece;
  }
  if (waitingName) unread.push(waitingName);
  return { people, duplicates, unread };
}

const TEAM_HEADS = {
  name: /^(full )?name$/i, first: /^first( name)?$/i, last: /^(last|sur)(name| name)?$/i, email: /^e-?mail( address)?$/i,
  job_title: /^(role|job|job title|title|position)$/i, mobile: /^(mobile|phone|mobile number|phone number|cell)$/i, city: /^(city|location|office)$/i,
};

/** A line of a spreadsheet: tabs first, otherwise commas, with "quoted, cells" kept whole. */
function cells(line) {
  if (line.includes('\t')) return line.split('\t').map(clean);
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted; } else if (ch === ',' && !quoted) { out.push(clean(cur)); cur = ''; } else cur += ch;
  }
  out.push(clean(cur));
  return out;
}

/**
 * "Add a team": rows from a spreadsheet (pasted, or a .csv file's text) or a
 * pasted list. With a heading row its columns are read by name; without
 * one each line is read as "Who's invited?" reads it, with anything after
 * the email taken as the role.
 * @returns {{ name: string, email: string, job_title: string, mobile: string, city: string }[]}
 */
export function parseTeam(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => clean(l));
  if (!lines.length) return [];
  const head = cells(lines[0]);
  const cols = {};
  head.forEach((h, i) => {
    for (const [key, re] of Object.entries(TEAM_HEADS)) if (re.test(h) && cols[key] == null) cols[key] = i;
  });
  if (cols.email != null && (cols.name != null || cols.first != null)) {
    return lines.slice(1).map((line) => {
      const c = cells(line);
      const name = cols.name != null ? c[cols.name] : clean(`${c[cols.first] || ''} ${cols.last != null ? c[cols.last] || '' : ''}`);
      return { name: name || '', email: (c[cols.email] || '').toLowerCase(), job_title: (cols.job_title != null && c[cols.job_title]) || '', mobile: (cols.mobile != null && c[cols.mobile]) || '', city: (cols.city != null && c[cols.city]) || '' };
    }).filter((r) => r.name || r.email);
  }
  return lines.map((line) => {
    const c = cells(line).filter(Boolean);
    const at = c.findIndex((x) => isEmail(x.replace(/^<|>$/g, '')));
    if (at === -1) {
      const one = parsePeople(line).people[0];
      return one ? { ...one, job_title: '', mobile: '', city: '' } : { name: clean(line), email: '', job_title: '', mobile: '', city: '' };
    }
    return { name: c.slice(0, at).join(' '), email: c[at].replace(/^<|>$/g, '').toLowerCase(), job_title: c[at + 1] || '', mobile: '', city: '' };
  }).filter((r) => r.name || r.email);
}

/**
 * The preview before a team is made: each row is new, a duplicate inside
 * the list, already a client (the same email), or needs something first.
 * @param {object[]} rows parseTeam's rows
 * @param {object[]} existing the coach's client profiles
 * @param {{ seatsLeft?: number|null }} [limits] the organisation's free seats (null: no limit)
 */
export function teamPreview(rows, existing = [], { seatsLeft = null } = {}) {
  const have = new Set(existing.filter((p) => p.email && !p.merged_into).map((p) => p.email.toLowerCase()));
  const seen = new Set();
  const out = rows.map((r) => {
    const name = clean(r.name);
    const email = clean(r.email).toLowerCase();
    let state = 'new';
    if (!name) state = 'no_name';
    else if (email && !isEmail(email)) state = 'bad_email';
    else if (email && have.has(email)) state = 'already';
    else if (email && seen.has(email)) state = 'duplicate';
    if (email) seen.add(email);
    return { ...r, name, email, state };
  });
  const fresh = out.filter((r) => r.state === 'new');
  const over = seatsLeft == null ? 0 : Math.max(0, fresh.length - seatsLeft);
  return {
    rows: out,
    add: fresh.length,
    already: out.filter((r) => r.state === 'already').length,
    duplicates: out.filter((r) => r.state === 'duplicate').length,
    unreadable: out.filter((r) => r.state === 'no_name' || r.state === 'bad_email').length,
    overSeats: over,
  };
}

export const TEAM_STATE_WORDS = {
  new: 'New', already: 'Already a client', duplicate: 'Twice in this list', no_name: 'Needs a name', bad_email: 'That email doesn’t look right',
};

// ---------------------------------------------------------------- engagements

export const ENGAGEMENT_KINDS = [
  { value: 'sessions', label: 'A set of sessions' },
  { value: 'fixed_period', label: 'A fixed period' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'pay_as_you_go', label: 'Pay as you go' },
  { value: 'pro_bono', label: 'Pro bono' },
];

const packsOf = (engagement, packs) => (packs || []).filter((p) => p.engagement_id === engagement.id);

/** Sessions in total (the engagement's and its packs'), held, and to go; null when it isn't counted in sessions. */
export function sessionsLeft(engagement, packs = []) {
  if (!engagement) return null;
  const extra = packsOf(engagement, packs).reduce((n, p) => n + (Number(p.sessions) || 0), 0);
  if (engagement.sessions_total == null && !extra) return null;
  const total = (Number(engagement.sessions_total) || 0) + extra;
  const held = Math.max(0, Number(engagement.sessions_held) || 0);
  return { total, held, left: Math.max(0, total - held) };
}

/** Whole minutes between two instants: a second short of a minute doesn't count. */
export function minutesBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.floor((b - a) / 60000);
}

/** Minutes clocked on an engagement (or one of its projects), a running clock counted up to `now`. */
export function minutesClocked(entries, { engagementId, projectId } = {}, now = new Date()) {
  return (entries || [])
    .filter((e) => (!engagementId || e.engagement_id === engagementId) && (projectId === undefined || (e.project_id || null) === projectId))
    .reduce((n, e) => n + minutesBetween(e.started_at, e.ended_at || now), 0);
}

/** Time credit: bought (the engagement's and its packs'), used, and left, in minutes; null when there is none. */
export function timeCredit(engagement, packs = [], entries = [], now = new Date()) {
  if (!engagement) return null;
  const extra = packsOf(engagement, packs).reduce((n, p) => n + (Number(p.minutes) || 0), 0);
  if (engagement.time_credit_minutes == null && !extra) return null;
  const total = (Number(engagement.time_credit_minutes) || 0) + extra;
  const used = minutesClocked(entries, { engagementId: engagement.id }, now);
  return { total, used, left: Math.max(0, total - used) };
}

/** The coach's running clock, if any. */
export const runningEntry = (entries) => (entries || []).find((e) => !e.ended_at) || null;

/** "2 hours 10 minutes" (or "2 h 10 min" where space is tight). */
export function minutesWords(minutes, short = false) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (short) return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
  const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
  const mins = r || !h ? `${r} ${r === 1 ? 'minute' : 'minutes'}` : '';
  return [hours, mins].filter(Boolean).join(' ');
}

/** A running clock's "0:07:42". */
export function clockWords(startedAt, now = new Date()) {
  const s = Math.max(0, Math.floor((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** The one line for a list, board card or table: "7 of 12", "2 h 10 min credit", or nothing. */
export function engagementLine(engagement, packs, entries, now, { toGo = false } = {}) {
  const credit = timeCredit(engagement, packs, entries, now);
  if (credit && sessionsLeft(engagement, packs) == null) return `${minutesWords(credit.left, true)} credit`;
  const s = sessionsLeft(engagement, packs);
  if (!s) return '';
  return `${s.left} of ${s.total}${toGo ? ' to go' : ''}`;
}

// ---------------------------------------------------------------- cover

/**
 * Where a cover stands on a day: 'waiting' (the client hasn't agreed),
 * 'before', 'on' (the cover coach sees what the client shares) or 'over'.
 */
export function coverState(cover, todayKey) {
  if (!cover || !cover.starts_on || !cover.ends_on) return 'over';
  if (todayKey > cover.ends_on) return 'over';
  if (!cover.client_agreed_at) return 'waiting';
  return todayKey < cover.starts_on ? 'before' : 'on';
}

// ---------------------------------------------------------------- clients: stage, filter, sort

export const STAGES = [
  { value: 'starting', label: 'Starting' },
  { value: 'active', label: 'Active' },
  { value: 'renewal_due', label: 'Renewal due' },
  { value: 'closing', label: 'Closing' },
  { value: 'paused', label: 'Paused' },
];
export const stageLabel = (value) => STAGES.find((s) => s.value === value)?.label || '';

/**
 * The board's column for a client: the coach's own choice when they made
 * one, otherwise worked out: paused; no session held yet is Starting; one
 * session to go is Closing; two to go, or an end within 30 days, is
 * Renewal due; otherwise Active.
 */
export function boardStage(profile, engagement, packs, todayKey) {
  if (profile.status === 'paused') return 'paused';
  if (profile.stage && profile.stage !== 'paused') return profile.stage;
  const s = sessionsLeft(engagement, packs);
  if (!engagement) return 'starting';
  if (s && s.held === 0) return 'starting';
  if (s && s.total > 0 && s.left <= 1) return 'closing';
  const endsSoon = engagement.ends_on && todayKey && engagement.ends_on <= addDays(todayKey, 30);
  if ((s && s.total > 0 && s.left <= 2) || endsSoon) return 'renewal_due';
  return 'active';
}

/**
 * A card moved to another column of the board: what changes on the client's
 * profile. A column is the coach's own choice of `stage`; Paused is the
 * client's status, so moving there pauses them (the stage they had is
 * kept), and moving out of Paused makes them active again. Null for a
 * column there isn't.
 */
export function stageMove(profile, to) {
  if (!STAGES.some((s) => s.value === to)) return null;
  if (to === 'paused') return { status: 'paused' };
  return { stage: to, ...(profile?.status === 'paused' ? { status: 'active' } : {}) };
}

/** The column to the left (-1) or right (1) of one, or null at the board's edge. */
export function stageBeside(stage, step) {
  const i = STAGES.findIndex((s) => s.value === stage);
  return i < 0 ? null : STAGES[i + step]?.value || null;
}

/** A custom field's value for an item, as kept: text, a number, or a day key. Null when empty. */
export function fieldValue(field, values, itemId) {
  const v = (values || []).find((x) => x.field_id === field.id && x.item_id === itemId);
  if (!v) return null;
  if (field.kind === 'number') return v.value_number == null || v.value_number === '' ? null : Number(v.value_number);
  if (field.kind === 'date') return v.value_date || null;
  return v.value_text == null || v.value_text === '' ? null : v.value_text;
}

/** That value as people read it: "24,000", "Mon 8 Mar", the text. */
export function fieldWords(field, value, todayKey) {
  if (value == null || value === '') return '';
  if (field.kind === 'number') return Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  if (field.kind === 'date') return dayWords(value, todayKey);
  return String(value);
}

/** What was typed into a field's box, as the row to keep (or null to clear it). Returns undefined when it can't be read. */
export function fieldFromTyped(field, typed) {
  const text = clean(typed);
  if (!text) return null;
  if (field.kind === 'number') {
    const n = Number(text.replace(/[£$€,\s]/g, ''));
    return Number.isFinite(n) ? { value_number: n } : undefined;
  }
  if (field.kind === 'date') return fromDayKey(text) ? { value_date: text } : undefined;
  if (field.kind === 'choice') return (field.options || []).includes(text) ? { value_text: text } : undefined;
  return { value_text: text.slice(0, 2000) };
}

/**
 * The rows a list shows. Each client is { profile, engagement, tags: [tag
 * ids], stage, nextAt, coachId }.
 * @param {object} filters { q, tag: [ids], status: [stages], organisation, coach, fields: { [fieldId]: [values or 'none'] } }
 * @param {{ fields: object[], values: object[], tags: object[], organisations: object[] }} ctx
 */
export function filterClients(clients, filters = {}, ctx = {}) {
  const q = clean(filters.q).toLowerCase();
  const tagIds = filters.tag || [];
  const stages = filters.status || [];
  const fieldFilters = Object.entries(filters.fields || {}).filter(([, v]) => v && v.length);
  const orgName = (id) => (ctx.organisations || []).find((o) => o.id === id)?.name || '';
  return clients.filter((c) => {
    const p = c.profile;
    if (q) {
      const hay = [p.name, p.email, orgName(p.organisation_id), p.city, p.job_title].filter(Boolean).join(' ').toLowerCase();
      if (!q.split(' ').every((word) => hay.includes(word))) return false;
    }
    if (tagIds.length && !tagIds.some((t) => (c.tags || []).includes(t))) return false;
    if (stages.length && !stages.includes(c.stage)) return false;
    if (filters.organisation && p.organisation_id !== filters.organisation) return false;
    if (filters.coach && p.coach_id !== filters.coach) return false;
    for (const [fieldId, wanted] of fieldFilters) {
      const field = (ctx.fields || []).find((f) => f.id === fieldId);
      if (!field) continue;
      const v = fieldValue(field, ctx.values, p.id);
      const key = v == null ? 'none' : String(v);
      if (!wanted.includes(key)) return false;
    }
    return true;
  });
}

/** How many filters are on, for "2 filters" beside the button. */
export function filterCount(filters = {}) {
  return (filters.tag?.length ? 1 : 0) + (filters.status?.length ? 1 : 0) + (filters.organisation ? 1 : 0) + (filters.coach ? 1 : 0)
    + Object.values(filters.fields || {}).filter((v) => v && v.length).length;
}

export const BASE_SORTS = [
  { value: 'next', label: 'Next session first' },
  { value: 'left', label: 'Fewest sessions to go first' },
  { value: 'last', label: 'Longest since contact first' },
  { value: 'name', label: 'Name, A to Z' },
  { value: 'namez', label: 'Name, Z to A' },
  { value: 'leftz', label: 'Most sessions to go first' },
  { value: 'lastz', label: 'Most recent contact first' },
];

/** Every way to sort: the fixed ones, then one or two for each custom field. */
export function sortOptions(fields = []) {
  const own = fields.flatMap((f) => {
    if (f.kind === 'number') return [{ value: `f:${f.id}`, label: `Lowest ${f.name.toLowerCase()} first` }, { value: `f:${f.id}:z`, label: `Highest ${f.name.toLowerCase()} first` }];
    if (f.kind === 'date') return [{ value: `f:${f.id}`, label: `Soonest ${f.name.toLowerCase()} first` }];
    return [{ value: `f:${f.id}`, label: `${f.name}, A to Z` }];
  });
  return [...BASE_SORTS, ...own];
}

const byName = (a, b) => a.profile.name.localeCompare(b.profile.name, 'en', { sensitivity: 'base' });
// Empty values always go last, whichever way the rest run.
const withEmptyLast = (get, cmp) => (a, b) => {
  const x = get(a);
  const y = get(b);
  if (x == null && y == null) return byName(a, b);
  if (x == null) return 1;
  if (y == null) return -1;
  return cmp(x, y) || byName(a, b);
};
const up = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const down = (x, y) => up(y, x);

export function sortClients(clients, sort = 'next', ctx = {}) {
  const left = (c) => sessionsLeft(c.engagement, ctx.packs)?.left ?? null;
  const out = [...clients];
  if (sort === 'name') return out.sort(byName);
  if (sort === 'namez') return out.sort((a, b) => byName(b, a));
  if (sort === 'left') return out.sort(withEmptyLast(left, up));
  if (sort === 'leftz') return out.sort(withEmptyLast(left, down));
  if (sort === 'last') return out.sort(withEmptyLast((c) => c.profile.last_contact_on || null, up));
  if (sort === 'lastz') return out.sort(withEmptyLast((c) => c.profile.last_contact_on || null, down));
  if (sort.startsWith('f:')) {
    const [, id, z] = sort.split(':');
    const field = (ctx.fields || []).find((f) => f.id === id);
    if (field) {
      const get = (c) => {
        const v = fieldValue(field, ctx.values, c.profile.id);
        return typeof v === 'string' ? v.toLowerCase() : v;
      };
      return out.sort(withEmptyLast(get, z ? down : up));
    }
  }
  return out.sort(withEmptyLast((c) => c.nextAt || null, up));
}

// ---------------------------------------------------------------- saved views

export const MAX_FAVOURITES = 5;

/** A view to save from what the list shows now. */
export function viewFromList(name, { filters = {}, sort = 'next', columns = [], layout = 'list' } = {}) {
  const { q: _q, ...kept } = filters;
  return { name: clean(name).slice(0, 60), filters: kept, sort, columns, layout };
}

/** What a saved view puts back on the list (anything it doesn't know is left at its start). */
export function listFromView(view) {
  const f = view?.filters && typeof view.filters === 'object' && !Array.isArray(view.filters) ? view.filters : {};
  return {
    filters: { tag: Array.isArray(f.tag) ? f.tag : [], status: Array.isArray(f.status) ? f.status : [], organisation: f.organisation || null, coach: f.coach || null, fields: f.fields && typeof f.fields === 'object' ? f.fields : {} },
    sort: typeof view?.sort === 'string' && view.sort ? view.sort : 'next',
    columns: Array.isArray(view?.columns) ? view.columns : [],
    layout: ['list', 'board', 'table'].includes(view?.layout) ? view.layout : 'list',
  };
}

/** The views in the menu, at most 5, in their order. */
export const favouriteViews = (views) => (views || []).filter((v) => v.favourite).sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)).slice(0, MAX_FAVOURITES);
export const canFavourite = (views) => (views || []).filter((v) => v.favourite).length < MAX_FAVOURITES;
export const FAVOURITES_FULL = 'Up to 5 views can be in the menu. Take one out first.';

// ---------------------------------------------------------------- merge

export const MERGE_FIELDS = [
  ['name', 'Name'], ['email', 'Email'], ['mobile', 'Mobile'], ['organisation_id', 'Organisation'],
  ['job_title', 'Role'], ['city', 'City'], ['time_zone', 'Time zone'], ['referred_by', 'Referred by'],
];

/**
 * Merge into one: a row for each field either has. Where both have the same
 * (or only one has it) there is nothing to choose; where they differ the
 * coach chooses, side by side.
 * @param {(key: string, value: any) => string} [show] how a value reads (an organisation's name for its id)
 */
export function mergePlan(a, b, show = (_k, v) => String(v)) {
  if (!a || !b || a.id === b.id) return null;
  return MERGE_FIELDS.map(([key, label]) => {
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    if (x == null && y == null) return null;
    const same = x == null || y == null || String(x).toLowerCase() === String(y).toLowerCase();
    return { key, label, a: x == null ? '' : show(key, x), b: y == null ? '' : show(key, y), choose: !same, one: same ? show(key, x ?? y) : '' };
  }).filter(Boolean);
}

/** The fields to take from the second, from the coach's choices ({ name: 'b' }). */
export const mergeValues = (choices = {}) => Object.fromEntries(Object.entries(choices).filter(([, side]) => side === 'b').map(([key]) => [key, true]));

/** What one profile looks like after the merge, for the device's own copy. */
export function mergedProfile(keep, drop, values = {}) {
  const out = { ...keep };
  for (const [key] of MERGE_FIELDS) out[key] = values[key] ? drop[key] ?? null : keep[key] ?? drop[key] ?? null;
  out.frequent_traveller = Boolean(keep.frequent_traveller || drop.frequent_traveller);
  out.user_id = keep.user_id || drop.user_id || null;
  out.invited_at = keep.invited_at || drop.invited_at || null;
  return out;
}

/** Pairs that look like the same person: the same email, or the same name. */
export function likelyDuplicates(profiles) {
  const live = (profiles || []).filter((p) => !p.merged_into);
  const pairs = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      const sameEmail = a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase();
      const sameName = clean(a.name).toLowerCase() === clean(b.name).toLowerCase();
      if (sameEmail || sameName) pairs.push([a, b]);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------- the next-call bar

export const CALL_BAR = { fromMinutes: 10, coralMinutes: 5, untilMinutes: 10 };

/**
 * The slim next-call bar: from 10 minutes before a call until 10 minutes
 * in, coral from 5 minutes before. Null outside that.
 * @param {{ name: string, startsAt: string|Date, zoom?: string, briefTo?: string }} call
 */
export function nextCallBar(call, now = new Date()) {
  if (!call || !call.startsAt) return null;
  const start = new Date(call.startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const secs = (start - new Date(now).getTime()) / 1000;
  if (secs > CALL_BAR.fromMinutes * 60 || secs < -CALL_BAR.untilMinutes * 60) return null;
  const before = Math.ceil(secs / 60);
  const into = Math.floor(-secs / 60);
  let words;
  if (secs > 0) words = `in ${before} ${before === 1 ? 'minute' : 'minutes'}`;
  else if (into < 1) words = 'is starting now';
  else words = `started ${into} ${into === 1 ? 'minute' : 'minutes'} ago`;
  return { name: call.name, words, coral: secs <= CALL_BAR.coralMinutes * 60, zoom: call.zoom || null, briefTo: call.briefTo || null, sessionId: call.sessionId || null };
}

/** The call the bar is for: the first one inside its window. */
export function callForBar(calls, now = new Date()) {
  return (calls || []).slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).find((c) => nextCallBar(c, now)) || null;
}

// ---------------------------------------------------------------- search

/**
 * One box finds people, pages and actions as it is typed. Before anything
 * is typed: the recent items, then the actions.
 * @param {{ people: object[], pages: object[], actions: object[], recent: object[] }} all each item { key, title, kind, ... }
 * @returns {{ label: string, items: object[] }[]}
 */
export function searchResults(query, { people = [], pages = [], actions = [], recent = [], items = [] } = {}) {
  const q = clean(query).toLowerCase();
  if (!q) {
    return [{ label: 'Recent', items: recent.slice(0, 5) }, { label: 'Actions', items: actions }].filter((g) => g.items.length);
  }
  const words = q.split(' ');
  const score = (item) => {
    const title = item.title.toLowerCase();
    const hay = `${title} ${(item.also || '').toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) return 0;
    if (title === q) return 4;
    if (title.startsWith(q)) return 3;
    if (title.split(' ').some((part) => part.startsWith(words[0]))) return 2;
    return 1;
  };
  const rank = (items) => items.map((item) => [score(item), item]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title)).map(([, item]) => item);
  return [
    { label: 'People', items: rank(people).slice(0, 8) },
    { label: 'Calendar', items: rank(items).slice(0, 6) },
    { label: 'Pages', items: rank(pages).slice(0, 6) },
    { label: 'Actions', items: rank(actions).slice(0, 6) },
  ].filter((g) => g.items.length);
}

/** Recent items, newest first, one of each, at most 8 kept. */
export function withRecent(recent, item) {
  return [{ key: item.key, title: item.title, kind: item.kind, to: item.to }, ...(recent || []).filter((r) => r.key !== item.key)].slice(0, 8);
}

// ---------------------------------------------------------------- reaching a client

const digits = (mobile) => String(mobile || '').replace(/[^\d+]/g, '');

/**
 * The quick buttons: Email opens the coach's own email app; WhatsApp and
 * iMessage show only with a mobile number, iMessage only for +1 numbers.
 * Nothing is ever sent from the portal.
 */
export function quickContacts(profile, { subject = '', body = '' } = {}) {
  const out = [];
  if (profile?.email && isEmail(profile.email)) {
    const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
    out.push({ key: 'email', label: 'Email', href: `mailto:${profile.email}${q ? `?${q}` : ''}` });
  }
  const mobile = digits(profile?.mobile);
  if (/^\+\d{6,15}$/.test(mobile)) {
    out.push({ key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${mobile.slice(1)}` });
    if (mobile.startsWith('+1')) out.push({ key: 'imessage', label: 'iMessage', href: `sms:${mobile}` });
  }
  return out;
}

/** Whose birthday it is today, from About them. */
export function birthdaysOn(abouts, profiles, todayKey) {
  const d = fromDayKey(todayKey);
  if (!d) return [];
  return (abouts || []).filter((a) => a.birthday_month === d.getMonth() + 1 && a.birthday_day === d.getDate())
    .map((a) => (profiles || []).find((p) => p.id === a.profile_id && !p.merged_into && p.status !== 'past')).filter(Boolean);
}

export const firstName = (name) => clean(name).split(' ')[0] || '';
/** "Sam’s", "Marcus’s". */
export const possessive = (name) => `${name}’s`;

/** The drafted birthday note. */
export function birthdayNote(profile, coachFirstName) {
  return `Happy birthday, ${firstName(profile.name)}!\n\nI hope you get some proper time off today.\n\n${coachFirstName || ''}`.trimEnd();
}

// ---------------------------------------------------------------- Getting started

/** A new client's steps; each ticks itself where the portal can tell, or is ticked by the coach. */
export function gettingStarted(profile, { engagement = null, sessionsHeld = 0 } = {}) {
  const ticked = profile.getting_started || {};
  const rows = [
    { key: 'engagement', label: 'Engagement', done: Boolean(engagement) || ticked.engagement === true, auto: Boolean(engagement) },
    { key: 'invited', label: 'Invite to the portal', done: Boolean(profile.user_id || profile.invited_at) || ticked.invited === true, auto: Boolean(profile.user_id || profile.invited_at) },
    { key: 'first_review', label: 'First review', done: ticked.first_review === true, auto: false },
    { key: 'first_session', label: 'First session', done: sessionsHeld > 0 || ticked.first_session === true, auto: sessionsHeld > 0 },
    { key: 'welcome_pack', label: 'Welcome pack', done: ticked.welcome_pack === true, auto: false },
  ];
  return { rows, complete: rows.every((r) => r.done) };
}

// ---------------------------------------------------------------- export

// A cell that a spreadsheet would run as a formula is kept as text.
const safeCell = (v) => {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** The rows of an export: a heading row, then one row for each client, every field with it. */
export function exportRows(clients, ctx = {}, todayKey) {
  const fields = ctx.fields || [];
  const orgName = (id) => (ctx.organisations || []).find((o) => o.id === id)?.name || '';
  const tagName = (id) => (ctx.tags || []).find((t) => t.id === id)?.name || '';
  const head = ['Name', 'Email', 'Mobile', 'Organisation', 'Role', 'City', 'Time zone', 'Status', 'Sessions to go', 'Last contact', 'Referred by', 'Tags', ...fields.map((f) => f.name)];
  const rows = clients.map((c) => {
    const p = c.profile;
    return [
      p.name, p.email || '', p.mobile || '', orgName(p.organisation_id), p.job_title || '', p.city || '', p.time_zone || '',
      stageLabel(c.stage), engagementLine(c.engagement, ctx.packs, ctx.entries, ctx.now), p.last_contact_on ? dayWords(p.last_contact_on, todayKey) : '',
      p.referred_by || '', (c.tags || []).map(tagName).filter(Boolean).join(', '),
      ...fields.map((f) => {
        const v = fieldValue(f, ctx.values, p.id);
        return f.kind === 'number' ? (v ?? '') : fieldWords(f, v, todayKey);
      }),
    ];
  });
  return [head, ...rows];
}

export function toCsv(rows) {
  const cell = (v) => {
    const s = typeof v === 'number' ? String(v) : safeCell(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

export { safeCell };

// ---------------------------------------------------------------- workshops

/** Registered, waiting and came, with the places left. */
export function workshopCounts(attendees, capacity) {
  const live = (attendees || []).filter((a) => a.status !== 'cancelled');
  const registered = live.filter((a) => a.status === 'registered').length;
  return { registered, waiting: live.filter((a) => a.status === 'waiting').length, came: live.filter((a) => a.attended).length, left: Math.max(0, (Number(capacity) || 0) - registered) };
}

/** Whether a new registration gets a place or joins the waiting list, as the database decides it. */
export function registrationStatus(attendees, capacity, email) {
  const mine = (attendees || []).find((a) => a.email === String(email || '').toLowerCase() && a.status !== 'cancelled');
  if (mine) return `already_${mine.status}`;
  return workshopCounts(attendees, capacity).registered < (Number(capacity) || 0) ? 'registered' : 'waiting';
}

/** Has the workshop's day passed? */
export const workshopIsPast = (workshop, now = new Date()) => Boolean(workshop?.starts_at) && new Date(workshop.ends_at || workshop.starts_at).getTime() < new Date(now).getTime();

/**
 * View as client: where the coach's newest ask stands (049's
 * client_view_requests; a yes lasts 30 minutes). 'asked' (no answer yet,
 * for 7 days, as the client is shown it), 'yes' with `until` while the 30
 * minutes run, 'no' for a day after a no; otherwise null.
 */
export function viewAskState(requests, now = new Date()) {
  const at = new Date(now).getTime();
  const newest = [...(requests || [])].sort((a, b) => instantOf(b.asked_at) - instantOf(a.asked_at))[0];
  if (!newest) return null;
  if (!newest.answered_at) return at - instantOf(newest.asked_at).getTime() < 7 * 24 * HOUR_MS ? { state: 'asked' } : null;
  if (newest.allowed === true) return newest.expires_at && instantOf(newest.expires_at).getTime() > at ? { state: 'yes', until: newest.expires_at } : null;
  return at - instantOf(newest.answered_at).getTime() < 24 * HOUR_MS ? { state: 'no' } : null;
}

// A workshop's emails (Phase 6a run 2). The reminders are sent by a
// scheduled job when their switches are on; the follow-up (with the survey
// when its switch is on) goes when the coach presses "Send the follow-up".
export const WORKSHOP_HOME_ZONE = 'Europe/London'; // as the database reads a workshop with no zone (050)
const DAY_BEFORE_AT = '07:00'; // in the workshop's own time zone, as 050's workshop_emails_due has it
const HOUR_MS = 60 * 60 * 1000;

/** "Wed 18 Nov at 07:00" in a place, with the year when it isn't `now`'s, and the place when the reader is elsewhere. */
/** A saved timestamp as a Date: one with no time-zone ending is UTC (CLAUDE.md rule 19). */
const instantOf = (value) => (typeof value === 'string' && !/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(value.trim()) ? new Date(`${value.trim().replace(' ', 'T')}Z`) : new Date(value));

function instantWords(instant, zone, now, readerZone) {
  const w = wallClock(instantOf(instant), zone);
  const p = (n) => String(n).padStart(2, '0');
  const year = w.year === wallClock(new Date(now), zone).year ? '' : ` ${w.year}`;
  const elsewhere = readerZone && isZone(readerZone) && readerZone !== zone ? ` ${zonePlace(zone)} time` : '';
  return `${DAYS[w.weekday % 7]} ${w.day} ${MONTHS[w.month - 1]}${year} at ${p(w.hour)}:${p(w.minute)}${elsewhere}`;
}

/**
 * The Emails section of a workshop's page: one row for each email whose
 * switch is on, saying when it goes or went, then the follow-up, which the
 * coach sends. `sends` are the workshop's workshop_sends rows (050: what
 * has gone, once each). The day-before reminder goes from 07:00 the day
 * before in the workshop's own time zone, and only while the workshop is
 * more than 2 hours away; the 1-hour reminder goes 1 hour before (the
 * database sends it between 75 and 45 minutes before).
 * Each row: { kind, label, words, sent, button } (`button`: "Send the
 * follow-up" belongs on this row; `early`: pressed now, it is too soon).
 */
export function workshopEmailRows(workshop, sends = [], now = new Date(), readerZone = null) {
  if (!workshop) return [];
  const zone = isZone(workshop.time_zone) ? workshop.time_zone : WORKSHOP_HOME_ZONE;
  const at = new Date(now).getTime();
  const starts = workshop.starts_at ? instantOf(workshop.starts_at).getTime() : NaN;
  const dated = Number.isFinite(starts);
  const gone = (kind) => (sends || []).find((x) => x.workshop_id === workshop.id && x.kind === kind) || null;
  const went = (send) => {
    const n = Number(send.people) || 0;
    return `It was sent on ${instantWords(send.sent_at, zone, now, readerZone)}, to ${n} ${n === 1 ? 'person' : 'people'}.`;
  };
  const rows = [];
  if (workshop.remind_day_before === true) {
    const sent = gone('day_before');
    let words = 'It goes once the workshop has a date.';
    if (sent) words = went(sent);
    else if (dated) {
      const goes = instantAt(addZoneDays(wallClock(new Date(starts), zone).date, -1), DAY_BEFORE_AT, zone).getTime();
      if (starts - at <= 2 * HOUR_MS) words = 'It wasn’t sent, because it was switched on under 2 hours before the start.';
      else if (at >= goes) words = 'It goes in the next few minutes.';
      else words = `It goes on ${instantWords(goes, zone, now, readerZone)}.`;
    }
    rows.push({ kind: 'day_before', label: 'Reminder the day before', words, sent: Boolean(sent), button: false });
  }
  if (workshop.remind_hour_before === true) {
    const sent = gone('hour_before');
    let words = 'It goes once the workshop has a date.';
    if (sent) words = went(sent);
    else if (dated) {
      if (starts - at < 0.75 * HOUR_MS) words = 'It wasn’t sent, because it was switched on under 1 hour before the start.';
      else if (starts - at <= 1.25 * HOUR_MS) words = 'It goes in the next few minutes.';
      else words = `It goes on ${instantWords(starts - HOUR_MS, zone, now, readerZone)}.`;
    }
    rows.push({ kind: 'hour_before', label: 'Reminder 1 hour before', words, sent: Boolean(sent), button: false });
  }
  const followUp = gone('follow_up');
  rows.push({ kind: 'follow_up', label: 'Follow-up', words: followUp ? went(followUp) : 'You send this after the day.', sent: Boolean(followUp), button: !followUp, early: !dated || starts > at });
  if (workshop.survey_on === true) {
    const survey = gone('survey');
    rows.push({ kind: 'survey', label: 'Survey', words: survey ? went(survey) : followUp ? 'It didn’t go with the follow-up, because it was switched on afterwards.' : 'It goes with the follow-up.', sent: Boolean(survey), button: false });
  }
  return rows;
}

// ---------------------------------------------------------------- Settings

/** "09:00 to 18:30" as { from, to }, or null when it can't be read (or the end isn't after the start). */
export function parseHours(text) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:to|-|–)\s*(\d{1,2})[:.](\d{2})\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const p = (n) => String(n).padStart(2, '0');
  const from = `${p(h1)}:${p(m1)}`;
  const to = `${p(h2)}:${p(m2)}`;
  return to > from ? { from, to } : null;
}
export const hoursWords = (h) => (h && h.from && h.to ? `${h.from} to ${h.to}` : 'Not working');

/** The 21 cities the time zone list starts with (M11's "Edit this list"), as place names. */
export const START_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver',
  'America/Phoenix', 'Pacific/Honolulu', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/Paris', 'Europe/Berlin',
  'Africa/Johannesburg', 'Asia/Qatar', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
];

export const NOTIFICATION_KINDS = [
  { key: 'bookings', label: 'Bookings, moves and cancellations' },
  { key: 'agreements', label: 'Agreements signed' },
  { key: 'payments', label: 'Payments in and overdue', owner: true },
  { key: 'support', label: 'Support flags' },
  { key: 'before_call', label: '10 minutes before each call', note: 'This one comes in quiet hours too.' },
];

/** A notification switch is on unless it was switched off. */
export const notificationOn = (settings, key) => settings?.notifications?.[key] !== false;

// ---------------------------------------------------------------- Everything (the timeline)

export const TIMELINE_KINDS = [
  { value: 'all', label: 'Everything' }, { value: 'note', label: 'Notes' }, { value: 'file', label: 'Files' },
  { value: 'time', label: 'Time' }, { value: 'engagement', label: 'Engagement' },
];

/** One timeline in date order, newest first, filtered by kind and searched. */
export function timeline({ notes = [], files = [], entries = [], engagements = [], projects = [] }, { kind = 'all', q = '' } = {}, now = new Date()) {
  const items = [
    ...notes.map((n) => ({ id: `n:${n.id}`, kind: 'note', at: n.created_at || `${n.noted_on}T12:00:00`, day: n.noted_on, title: n.pinned ? 'Pinned note' : 'Private note', line: `Note, ${n.body}` })),
    ...files.map((f) => ({ id: `f:${f.id}`, kind: 'file', at: f.created_at, title: f.name, line: `File, added by ${f.added_by === 'client' ? 'them' : 'you'}` })),
    ...entries.filter((e) => e.ended_at).map((e) => ({ id: `t:${e.id}`, kind: 'time', at: e.started_at, title: (projects.find((p) => p.id === e.project_id)?.name) || 'Time', line: `Time, ${minutesWords(minutesBetween(e.started_at, e.ended_at || now))}` })),
    ...engagements.map((e) => ({ id: `e:${e.id}`, kind: 'engagement', at: e.created_at || (e.starts_on ? `${e.starts_on}T12:00:00` : null), title: 'Engagement started', line: `Engagement, ${ENGAGEMENT_KINDS.find((k) => k.value === e.kind)?.label || ''}` })),
  ].filter((i) => i.at);
  const words = clean(q).toLowerCase().split(' ').filter(Boolean);
  return items
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => words.every((w) => `${i.title} ${i.line}`.toLowerCase().includes(w)))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}
