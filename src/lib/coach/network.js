// Network's rules (Phase 6a run 4; M11 seq 77; migration 052): the single
// source for what the database also works out. Pure functions only, so the
// page, the device-first copy (networkData.js) and the tests' stand-in
// (tests/coach/crm-standin.mjs) all give the answers
// supabase/migrations/052_coach_crm.sql gives: Where to focus, when a
// catch-up is due, who is ready to archive, ONE PAGE of the table
// (searched, sorted and narrowed), the map's 150, duplicates and a merge.
// Each has the same answer as its twin in supabase/052_coach_crm_test.sql
// (tests/performance/coach-network.test.mjs).
//
// The words a page shows (the lists' names, "9 days overdue", the map's
// pop-up card, the give and ask line) are in this file too, in its second
// half, never worked out in a page.
import { addDays, clean, cut, dayWords, firstName, fromDayKey, isEmail, quickContacts } from './model.js';

/** The four ratings, in the order they are shown; each 0 to 10, or empty until rated. */
export const RATINGS = ['influence', 'trust', 'value_delivery', 'what_you_get'];

/** The Where to focus lists, in the order they are shown and sorted ("Keep close first"). */
export const FOCUS_LISTS = ['keep_close', 'maintain', 'invest', 'rebalance'];

/** The headings the table can be sorted by (network_page's p_sort); a column of your own is `own:<its id>`. */
export const NETWORK_SORTS = ['name', 'organisation', 'role', 'email', 'phone', 'focus', 'influence', 'trust', 'value_delivery',
  'what_you_get', 'rhythm', 'last_spoke', 'due', 'given', 'asked'];

/** What you've given, and what you've asked (network_gives' kinds). */
export const GAVE_KINDS = ['idea', 'resource', 'introduction', 'favour', 'other'];
export const ASKED_KINDS = ['introduction', 'referral', 'advice', 'favour', 'other'];

/** How many rows the table loads at a time, and how many people the map shows. */
export const NETWORK_PAGE = 50;
export const MAP_LIMIT = 150;

const rated = (v) => Number.isInteger(v) && v >= 0 && v <= 10;

/**
 * Where to focus, checked in this order, once all four ratings are in:
 * Keep close (trust 7 or more and what you get 7 or more), Invest
 * (influence 7 or more, with trust or value delivery 6 or less), Maintain
 * (influence, trust and value delivery all 7 or more), Rebalance?
 * (influence 4 or less and what you get 4 or less). Anyone else, or anyone
 * not fully rated, is on no list.
 * @param {{ influence?: number, trust?: number, value_delivery?: number, what_you_get?: number }} p
 * @returns {'keep_close'|'invest'|'maintain'|'rebalance'|null}
 */
export function focusOf(p) {
  if (!p || !RATINGS.every((k) => rated(p[k]))) return null;
  if (p.trust >= 7 && p.what_you_get >= 7) return 'keep_close';
  if (p.influence >= 7 && (p.trust <= 6 || p.value_delivery <= 6)) return 'invest';
  if (p.influence >= 7 && p.trust >= 7 && p.value_delivery >= 7) return 'maintain';
  if (p.influence <= 4 && p.what_you_get <= 4) return 'rebalance';
  return null;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n, w = 2) => String(n).padStart(w, '0');

/**
 * A day some months on (or back), as the database counts it: the same day
 * of the month, or the month's last day when it has no such day (31 Jan
 * and 3 months is 30 Apr).
 * @param {string} day 'YYYY-MM-DD'
 * @param {number} months whole months, negative to go back
 * @returns {string|null}
 */
export function monthsOn(day, months) {
  const m = DAY.exec(String(day || ''));
  if (!m || !Number.isInteger(months)) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const y = Math.floor(total / 12);
  const mo = total - y * 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return `${pad(y, 4)}-${pad(mo + 1)}-${pad(Math.min(Number(m[3]), last))}`;
}

/**
 * When the next catch-up is due: the rhythm after you last spoke (never
 * spoken: after the day they were added), or the day "Not now" put it off
 * to when that is later. No rhythm, no due day.
 * @param {{ rhythm_months?: number, last_spoke_on?: string, added_on?: string, snoozed_until?: string }} p
 * @returns {string|null} 'YYYY-MM-DD'
 */
export function dueOn(p) {
  if (!p || !Number.isInteger(p.rhythm_months)) return null;
  const from = p.last_spoke_on || p.added_on;
  const due = from ? monthsOn(from, p.rhythm_months) : null;
  if (due && p.snoozed_until) return p.snoozed_until > due ? p.snoozed_until : due;
  return due || p.snoozed_until || null;
}

/** A person as the database hands them back: with focus and due_on worked out. */
export const withWorkedOut = (p) => ({ ...p, focus: focusOf(p), due_on: dueOn(p) });

/** In the table (or the archive): not merged away, and archived or not as asked. */
const inTable = (p, archived) => !p.merged_into && Boolean(p.archived_at) === Boolean(archived);

/**
 * Ready to archive: no contact for 18 months (never spoken: since they
 * were added), on no focus list, not archived, and not kept (someone
 * unticked in "Ready to archive?" is never suggested again).
 * @param {object} p a person
 * @param {string} today the owner's own day, 'YYYY-MM-DD'
 */
export function readyToArchive(p, today) {
  if (!p || p.archived_at || p.merged_into || p.keep || focusOf(p)) return false;
  const last = p.last_spoke_on || p.added_on;
  return Boolean(last) && last < monthsOn(today, -18);
}

const lower = (v) => String(v ?? '').toLowerCase();
const blank = (v) => v == null || v === '';
const FOCUS_ORDER = { keep_close: 1, maintain: 2, invest: 3, rebalance: 4 };
const NUMBER = /^-?[0-9]{1,12}(\.[0-9]{1,6})?$/;

/** The value a heading sorts by (empty sorts last, both ways). */
function sortValue(p, sort, columns) {
  if (String(sort || '').startsWith('own:')) {
    const id = String(sort).slice(4);
    const column = (columns || []).find((c) => String(c.id) === id);
    if (!column) return lower(p.name);
    const v = p.own?.[id];
    if (column.kind === 'number') return NUMBER.test(String(v ?? '')) ? Number(v) : null;
    return blank(v) ? null : lower(v);
  }
  switch (sort) {
    case 'organisation': return blank(p.organisation) ? null : lower(p.organisation);
    case 'role': return blank(p.role) ? null : lower(p.role);
    case 'email': return p.email ?? null;
    case 'phone': return blank(p.phone) ? null : p.phone;
    case 'focus': return FOCUS_ORDER[focusOf(p)] ?? null;
    case 'influence': return p.influence ?? null;
    case 'trust': return p.trust ?? null;
    case 'value_delivery': return p.value_delivery ?? null;
    case 'what_you_get': return p.what_you_get ?? null;
    case 'rhythm': return p.rhythm_months ?? null;
    case 'last_spoke': return p.last_spoke_on ?? null;
    case 'due': return dueOn(p);
    case 'given': return p.given_count ?? 0;
    case 'asked': return p.asked_count ?? 0;
    default: return lower(p.name);
  }
}

const compare = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en'));

/**
 * ONE PAGE of Network, as network_page() answers: searched by name or
 * organisation, narrowed ("Show only"), sorted, then 50 at a time.
 * @param {object[]} people everyone the device holds (the database never hands them all over)
 * @param {{ search?: string, sort?: string, desc?: boolean, only?: object, archived?: boolean, limit?: number, offset?: number, today: string }} query
 *   `only`: { focus: ['keep_close', 'invest', 'maintain', 'rebalance', 'none'], role: [...], organisation: [...],
 *   rhythm: [1, 3, 0 for none], due: 'now' | 'coming', ready: true }
 * @param {object[]} [columns] your own columns (for `own:<id>` sorts)
 * @returns {{ total: number, all: number, rows: object[] }} `all`: everyone active (or archived), whatever was searched for
 */
export function networkPage(people, query = {}, columns = []) {
  const { search = '', sort = 'name', desc = false, archived = false, today } = query;
  const only = query.only && typeof query.only === 'object' && !Array.isArray(query.only) ? query.only : {};
  const limit = Math.max(1, Math.min(200, Number.isInteger(query.limit) ? query.limit : NETWORK_PAGE));
  const offset = Math.max(0, Number.isInteger(query.offset) ? query.offset : 0);
  const q = lower(search).trim().slice(0, 120);
  const list = (v) => (Array.isArray(v) && v.length ? v.map(String) : null);
  const focus = list(only.focus);
  const role = list(only.role);
  const organisation = list(only.organisation);
  const rhythm = Array.isArray(only.rhythm) && only.rhythm.length ? only.rhythm.map(String).filter((x) => /^[0-9]{1,2}$/.test(x)).map(Number) : null;
  const base = (people || []).filter((p) => inTable(p, archived));
  const hit = base.filter((p) => {
    if (q && !lower(p.name).includes(q) && !lower(p.organisation).includes(q)) return false;
    if (focus && !focus.includes(focusOf(p) || 'none')) return false;
    if (role && !role.includes(p.role ?? '')) return false;
    if (organisation && !organisation.includes(p.organisation ?? '')) return false;
    if (rhythm && !rhythm.includes(p.rhythm_months ?? 0)) return false;
    const due = dueOn(p);
    if (only.due === 'now' && !(due && due <= today)) return false;
    if (only.due === 'coming' && !(due && due > today)) return false;
    if ((only.ready === true || only.ready === 'true') && !readyToArchive(p, today)) return false;
    return true;
  });
  const keyed = hit.map((p) => ({ p, v: sortValue(p, sort, columns) }));
  keyed.sort((a, b) => {
    if (a.v == null || b.v == null) { if (a.v != null) return -1; if (b.v != null) return 1; } else {
      const c = compare(a.v, b.v);
      if (c) return desc ? -c : c;
    }
    return lower(a.p.name).localeCompare(lower(b.p.name), 'en') || String(a.p.id).localeCompare(String(b.p.id));
  });
  return { total: hit.length, all: base.length, rows: keyed.slice(offset, offset + limit).map(({ p }) => withWorkedOut(p)) };
}

/**
 * The map's people, as network_map() answers: only people with a spot
 * (influence and trust both rated), up to 150: Keep close, Maintain and
 * Invest first, then whoever you spoke to most recently.
 * @param {object[]} people
 * @param {{ show?: 'everyone'|'keep_close'|'maintain'|'invest'|'rebalance'|'none', limit?: number }} [options]
 * @returns {{ total: number, placed: number, rows: object[] }} `total`: everyone active; `placed`: with a spot, in this Show
 */
export function networkMap(people, { show = 'everyone', limit = MAP_LIMIT } = {}) {
  const active = (people || []).filter((p) => inTable(p, false));
  const placed = active.filter((p) => rated(p.influence) && rated(p.trust) && (show === 'everyone' || (focusOf(p) || 'none') === show));
  const first = (p) => (['keep_close', 'maintain', 'invest'].includes(focusOf(p)) ? 0 : 1);
  const rows = [...placed].sort((a, b) => first(a) - first(b)
    || (a.last_spoke_on || b.last_spoke_on ? (a.last_spoke_on ? (b.last_spoke_on ? b.last_spoke_on.localeCompare(a.last_spoke_on) : -1) : 1) : 0)
    || lower(a.name).localeCompare(lower(b.name), 'en') || String(a.id).localeCompare(String(b.id)));
  const cap = Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : MAP_LIMIT));
  return {
    total: active.length,
    placed: placed.length,
    rows: rows.slice(0, cap).map((p) => ({ id: p.id, name: p.name, organisation: p.organisation ?? null, role: p.role ?? null, focus: focusOf(p),
      influence: p.influence, trust: p.trust, value_delivery: p.value_delivery ?? null, what_you_get: p.what_you_get ?? null,
      rhythm_months: p.rhythm_months ?? null, last_spoke_on: p.last_spoke_on ?? null, due_on: dueOn(p) })),
  };
}

/**
 * The counts the pages and the menu show, as network_counts() answers.
 * @returns {{ active: number, archived: number, due: number, ready: number }} `due`: a catch-up is due (the menu's count)
 */
export function networkCounts(people, today) {
  const all = (people || []).filter((p) => !p.merged_into);
  const active = all.filter((p) => !p.archived_at);
  return {
    active: active.length,
    archived: all.length - active.length,
    due: active.filter((p) => { const d = dueOn(p); return Boolean(d) && d <= today; }).length,
    ready: active.filter((p) => readyToArchive(p, today)).length,
  };
}

/**
 * Import, step 1: which rows may already be in Network (the same email, or
 * the same name whatever its capitals), as network_duplicates() answers.
 * @param {object[]} people
 * @param {{ name?: string, email?: string }[]} rows
 * @returns {{ index: number, id: string, name: string, organisation: string|null, email: string|null, by: 'email'|'name', archived: boolean }[]}
 */
export function networkDuplicates(people, rows) {
  const out = [];
  const known = (people || []).filter((p) => !p.merged_into);
  const made = (p) => String(p.created_at || '');
  (rows || []).forEach((row, index) => {
    const email = lower(row?.email).trim();
    const name = lower(row?.name).trim();
    const sameEmail = (p) => Boolean(email) && Boolean(p.email) && lower(p.email) === email;
    const m = known.filter((p) => sameEmail(p) || (Boolean(name) && lower(p.name) === name))
      .sort((x, y) => Number(sameEmail(y)) - Number(sameEmail(x)) || made(x).localeCompare(made(y)))[0];
    if (m) out.push({ index, id: m.id, name: m.name, organisation: m.organisation ?? null, email: m.email ?? null, by: sameEmail(m) ? 'email' : 'name', archived: Boolean(m.archived_at) });
  });
  return out;
}

const text = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const rating = (v) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return rated(n) ? n : null; };

/**
 * One imported row as a Network person's own columns (network_import()
 * takes these): trimmed, the email lower-cased, a rating outside 0 to 10
 * left empty. A row with no name is no person.
 * @returns {object|null}
 */
export function importRow(row) {
  const name = text(row?.name, 120);
  if (!name) return null;
  const rhythm = Number(row?.rhythm_months);
  return {
    ...(row.id ? { id: row.id } : {}),
    name,
    organisation: text(row.organisation, 120),
    role: text(row.role, 80),
    email: text(row.email, 254)?.toLowerCase() ?? null,
    phone: text(row.phone, 40),
    influence: rating(row.influence),
    trust: rating(row.trust),
    value_delivery: rating(row.value_delivery),
    what_you_get: rating(row.what_you_get),
    rhythm_months: Number.isInteger(rhythm) && rhythm >= 1 && rhythm <= 24 ? rhythm : null,
    last_spoke_on: DAY.test(String(row.last_spoke_on || '')) ? row.last_spoke_on : null,
    notes: text(row.notes, 6000),
    own: row.own && typeof row.own === 'object' && !Array.isArray(row.own) ? row.own : {},
  };
}

/**
 * Two people merged into one, as network_merge() does it: the kept
 * person's own values stand, blanks are filled from the other, and
 * `values` names the fields to take from the one merged away.
 * @param {object} keep
 * @param {object} drop
 * @param {{ name?: boolean, organisation?: boolean, role?: boolean, email?: boolean, phone?: boolean, notes?: boolean }} [values]
 * @returns {object} the kept person, merged (given_count and asked_count are counted again from the gives)
 */
export function mergedPerson(keep, drop, values = {}) {
  const take = (k) => (values && Object.prototype.hasOwnProperty.call(values, k) ? drop[k] ?? null : keep[k] ?? drop[k] ?? null);
  const later = (a, b) => (a && b ? (a > b ? a : b) : a || b || null);
  const earlier = (a, b) => (a && b ? (a < b ? a : b) : a || b || null);
  return {
    ...keep,
    name: values && Object.prototype.hasOwnProperty.call(values, 'name') ? drop.name : keep.name,
    organisation: take('organisation'),
    organisation_id: values && Object.prototype.hasOwnProperty.call(values, 'organisation') ? drop.organisation_id ?? null : keep.organisation_id ?? drop.organisation_id ?? null,
    role: take('role'),
    email: take('email'),
    phone: take('phone'),
    notes: take('notes'),
    influence: keep.influence ?? drop.influence ?? null,
    trust: keep.trust ?? drop.trust ?? null,
    value_delivery: keep.value_delivery ?? drop.value_delivery ?? null,
    what_you_get: keep.what_you_get ?? drop.what_you_get ?? null,
    rhythm_months: keep.rhythm_months ?? drop.rhythm_months ?? null,
    last_spoke_on: later(keep.last_spoke_on, drop.last_spoke_on),
    added_on: earlier(keep.added_on, drop.added_on),
    own: { ...(drop.own || {}), ...(keep.own || {}) },
    keep: Boolean(keep.keep || drop.keep),
    profile_id: keep.profile_id ?? drop.profile_id ?? null,
  };
}

// =============================================================================
// THE WORDS AND THE PAGES' RULES (builder B). Everything above is the
// database's twin; everything below is what Network's three tabs, a
// person's panel, Today and the menu show. Network's people are never
// loaded whole: Actions, the table and "Ready to archive?" are each a
// QUERY for the paging function (networkPageOf in networkData.js, which
// asks network_page), described here.
// =============================================================================

const count = (n) => Number(n || 0).toLocaleString('en-GB');
const people = (n) => `${count(n)} ${n === 1 ? 'person' : 'people'}`;
const daysFrom = (from, to) => { const a = fromDayKey(from); const b = fromDayKey(to); return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : null; };

// ---------------------------------------------------------------- the lists, the ratings and the rhythm, in words

/** Network's three underlined tabs, Actions first. */
export const NETWORK_TABS = [['actions', 'Actions'], ['table', 'Table'], ['map', 'Map']];

/** Each Where to focus list: its name and its one line on a person's panel. */
export const FOCUS_WORDS = {
  keep_close: { label: 'Keep close', line: 'Good for you both.' },
  invest: { label: 'Invest', line: 'They matter, and there’s room to build trust.' },
  maintain: { label: 'Maintain', line: 'Strong already. Keep it that way.' },
  rebalance: { label: 'Rebalance?', line: 'A lot of your time may be going in.' },
};
/** A list's name ('' for no list). */
export const focusLabel = (focus) => FOCUS_WORDS[focus]?.label || '';
/** "How it is" on a person's panel: the list and its line, or what's still needed. */
export function howItIs(p) {
  const focus = focusOf(p);
  if (focus) return { label: FOCUS_WORDS[focus].label, line: FOCUS_WORDS[focus].line };
  return RATINGS.every((k) => rated(p?.[k])) ? { label: 'No list', line: 'They aren’t in a focus list right now.' } : { label: 'Not rated yet', line: 'Add all four ratings to see where to focus.' };
}

/** The four ratings: the one name each has everywhere, the question above its box in Edit ratings, and its one line of meaning. */
export const RATING_WORDS = {
  influence: { label: 'Influence', question: 'How much influence do they have?', note: 'How much influence they have, 0 to 10.' },
  trust: { label: 'Trust in you', question: 'How much do they trust you?', note: 'How much they trust you, 0 to 10.' },
  value_delivery: { label: 'Value delivery', question: 'How much value do you deliver to them?', note: 'How much value you deliver to them, 0 to 10.' },
  what_you_get: { label: 'What you get', question: 'How much do you get from it?', note: 'How much you get from it, 0 to 10.' },
};
/** The choices a rating's small menu offers: 0 to 10. */
export const RATING_CHOICES = Array.from({ length: 11 }, (_, i) => i);
/** "8/10" on a panel; '' until rated. */
export const ratingOutOf = (v) => (rated(v) ? `${v}/10` : '');
export const RATINGS_HELP = 'Every change is kept with its date.';

/** The rhythms the menu offers, in months. */
export const RHYTHMS = [1, 2, 3, 6, 12];
/** "Every month", "Every 3 months", "Every year"; '' for no rhythm. */
export const rhythmWords = (months) => (!Number.isInteger(months) ? '' : months === 1 ? 'Every month' : months === 12 ? 'Every year' : `Every ${months} months`);
export const NO_RHYTHM = 'No rhythm';
/** The rhythm menu's choices, with "No rhythm" last. */
export const rhythmChoices = () => [...RHYTHMS.map((m) => ({ value: m, label: rhythmWords(m) })), { value: null, label: NO_RHYTHM }];

// ---------------------------------------------------------------- when a catch-up is due, in words

/** Whole days a catch-up is overdue (0 on its day; negative while it's still coming); null with no due day. */
export const daysOverdue = (dueDay, today) => (dueDay ? daysFrom(dueDay, today) : null);

/**
 * When a catch-up is due, as Actions and the table's "Next due" say it:
 * "9 days overdue", "1 day overdue", "Due today", or the day ("Sat 16 Jan").
 * @param {string|null} dueDay the person's due_on
 * @param {string} today
 */
export function dueWords(dueDay, today) {
  const over = daysOverdue(dueDay, today);
  if (over == null) return '';
  if (over > 0) return `${count(over)} ${over === 1 ? 'day' : 'days'} overdue`;
  return over === 0 ? 'Due today' : dayWords(dueDay, today);
}
/** The same for a list beside a name: "Due Sat 16 Jan" while it's coming. */
export const dueLine = (dueDay, today) => { const over = daysOverdue(dueDay, today); return over == null ? '' : over >= 0 ? dueWords(dueDay, today) : `Due ${dayWords(dueDay, today)}`; };
/** The map's pop-up card: "Due now", or the day. */
export const catchUpWords = (dueDay, today) => { const over = daysOverdue(dueDay, today); return over == null ? 'No rhythm' : over >= 0 ? 'Due now' : dayWords(dueDay, today); };

/** How long since you spoke, for Today's quiet line: "3 months since you spoke", "5 weeks since you spoke", "9 days since you spoke". */
export function sinceWords(lastSpoke, today) {
  const days = lastSpoke ? daysFrom(lastSpoke, today) : null;
  if (days == null) return 'You haven’t spoken yet';
  if (days <= 0) return 'You spoke today';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} since you spoke`;
  if (days < 60) return `${Math.floor(days / 7)} weeks since you spoke`;
  const months = Math.round(days / 30.44);
  return months >= 24 ? `${Math.floor(months / 12)} years since you spoke` : months >= 12 && months < 13 ? 'A year since you spoke' : `${months} months since you spoke`;
}

// ---------------------------------------------------------------- Actions

/** Due now folds after 8 people, Coming up after 4. */
export const DUE_FOLD = 8;
export const COMING_FOLD = 4;
/** The most a list asks for once "Show all" is opened (it then goes on in pages). */
export const ACTIONS_ALL = 200;

/**
 * Due now, as a query for the paging function: everyone whose catch-up is
 * due (from their rhythm and when you last spoke), the most overdue first.
 * @param {string} today
 * @param {{ all?: boolean, offset?: number }} [o] `all`: "Show all" was pressed
 */
export const dueNowQuery = (today, { all = false, offset = 0 } = {}) => ({ only: { due: 'now' }, sort: 'due', desc: false, limit: all ? ACTIONS_ALL : DUE_FOLD, offset, today });
/** Coming up: everyone whose catch-up is still to come, the soonest first. */
export const comingUpQuery = (today, { all = false, offset = 0 } = {}) => ({ only: { due: 'coming' }, sort: 'due', desc: false, limit: all ? ACTIONS_ALL : COMING_FOLD, offset, today });

/** A person on Actions: their name, who they are to you, their rhythm, and when ("9 days overdue", "Due Sat 16 Jan"). */
export const actionRow = (p, today) => ({ id: p.id, name: p.name, role: clean(p.role), rhythm: rhythmWords(p.rhythm_months), when: dueLine(p.due_on ?? dueOn(p), today), overdue: (daysOverdue(p.due_on ?? dueOn(p), today) ?? -1) >= 0 });

/**
 * A folded list: the rows to show and the link under them ("Show all 27"),
 * or none when everything already shows.
 * @param {object[]} rows the page's rows
 * @param {number} total the page's total
 * @param {number} fold DUE_FOLD or COMING_FOLD
 * @param {boolean} open whether Show all was pressed
 */
export function folded(rows, total, fold, open = false) {
  const shown = open ? rows : (rows || []).slice(0, fold);
  return { rows: shown, more: !open && total > fold ? `Show all ${count(total)}` : '', total };
}
export const ACTIONS_WORDS = {
  dueNow: 'Due now', comingUp: 'Coming up', add: 'Add someone', upToDate: 'Everyone’s up to date.', nothingComing: 'Nobody has a rhythm yet. Choose one on a person to see them here.',
  empty: 'Who do you want to stay in touch with?',
};

// ---------------------------------------------------------------- Ready to archive?

/** A person is suggested for the archive after this many months with no contact (and on no focus list). */
export const ARCHIVE_AFTER_MONTHS = 18;
/** "Not now" on the card hides it for this many days. */
export const ARCHIVE_NOT_NOW_DAYS = 30;

/** Everyone ready to archive, as a query for the paging function: the longest out of touch first. */
export const readyQuery = (today, { offset = 0, limit = ACTIONS_ALL } = {}) => ({ only: { ready: true }, sort: 'last_spoke', desc: false, limit, offset, today });

/** The quiet card on Actions: "34 people have had no contact for 18 months and aren’t in a focus list." */
export const readyCardLine = (n) => (n === 1 ? '1 person has had no contact for 18 months and isn’t in a focus list.' : `${count(n)} people have had no contact for 18 months and aren’t in a focus list.`);
export const READY_BUTTONS = { review: 'Review them', notNow: 'Not now', title: 'Ready to archive?', cancel: 'Cancel' };

/** Whether the card shows: someone is ready, and "Not now" wasn't pressed in the last 30 days (coach_settings.crm.archive_not_now). */
export function showReadyCard(counts, crmSettings, today) {
  if (!counts || !(counts.ready > 0)) return false;
  const put = crmSettings?.archive_not_now;
  return !(put && addDays(put, ARCHIVE_NOT_NOW_DAYS) > today);
}
/** The setting after "Not now". */
export const withArchiveNotNow = (crmSettings, today) => ({ ...(crmSettings || {}), archive_not_now: today });

/** A row of "Ready to archive?": the name, the organisation, and when you last spoke. */
export const readyRow = (p, today) => ({ id: p.id, name: p.name, organisation: clean(p.organisation), last: p.last_spoke_on ? `Last spoke ${dayWords(p.last_spoke_on, today)}` : 'Never spoken' });

/**
 * "Archive 33": everyone still ticked is archived, and anyone unticked is
 * kept and never suggested again (network_archive(ids, keep) does both).
 * @param {string[]} ids everyone in the review
 * @param {string[]} unticked the ones to keep
 * @returns {{ archive: string[], keep: string[], button: string, toast: string, needs: string }} `needs`: the calm line when nobody is left ticked
 */
export function archivePlan(ids, unticked = []) {
  const kept = new Set(unticked);
  const archive = (ids || []).filter((id) => !kept.has(id));
  return { archive, keep: (ids || []).filter((id) => kept.has(id)), button: `Archive ${count(archive.length)}`, toast: `Archived ${count(archive.length)}.`,
    needs: archive.length ? '' : 'Everyone is unticked, so nobody will be archived. Tick someone, or choose Cancel.' };
}
export const ARCHIVED_ONE = 'Archived.';
export const RESTORED = 'Restored.';
/** The link under the table: "Archived, 37" ('' when the archive is empty). */
export const archivedLink = (n) => (n > 0 ? `Archived, ${count(n)}` : '');

// ---------------------------------------------------------------- the table

/**
 * The table's own columns, in order. `sort`: its key for the paging
 * function; `sorts`: the two choices its heading's menu offers, as
 * [descending?, words]; `only`: what "Show only" narrows by, where it
 * fits; `edit`: 'type' (typed over), 'rating' and 'rhythm' (a small
 * floating menu), or none for a worked-out column; `note`: its one line
 * of meaning in Show or hide columns.
 */
export const NETWORK_COLUMNS = [
  { key: 'name', label: 'Name', sort: 'name', sorts: [[false, 'A to Z'], [true, 'Z to A']], fixed: true },
  { key: 'organisation', label: 'Organisation', sort: 'organisation', sorts: [[false, 'A to Z'], [true, 'Z to A']], only: 'organisation', edit: 'type', note: 'Where they work.' },
  { key: 'role', label: 'Role', sort: 'role', sorts: [[false, 'A to Z'], [true, 'Z to A']], only: 'role', edit: 'type', note: 'How you know them.' },
  { key: 'email', label: 'Email', sort: 'email', sorts: [[false, 'A to Z'], [true, 'Z to A']], edit: 'type', note: 'Their email address.' },
  { key: 'phone', label: 'Phone', sort: 'phone', sorts: [[false, 'A to Z'], [true, 'Z to A']], edit: 'type', note: 'Their phone number.' },
  { key: 'focus', label: 'Where to focus', sort: 'focus', sorts: [[false, 'Keep close first'], [true, 'Rebalance? first']], only: 'focus', note: 'Worked out from the four ratings.' },
  { key: 'influence', label: 'Influence', sort: 'influence', sorts: [[true, 'Highest first'], [false, 'Lowest first']], edit: 'rating', numeric: true, note: RATING_WORDS.influence.note },
  { key: 'trust', label: 'Trust in you', sort: 'trust', sorts: [[true, 'Highest first'], [false, 'Lowest first']], edit: 'rating', numeric: true, note: RATING_WORDS.trust.note },
  { key: 'value_delivery', label: 'Value delivery', sort: 'value_delivery', sorts: [[true, 'Highest first'], [false, 'Lowest first']], edit: 'rating', numeric: true, note: RATING_WORDS.value_delivery.note },
  { key: 'what_you_get', label: 'What you get', sort: 'what_you_get', sorts: [[true, 'Highest first'], [false, 'Lowest first']], edit: 'rating', numeric: true, note: RATING_WORDS.what_you_get.note },
  { key: 'rhythm_months', label: 'Rhythm', sort: 'rhythm', sorts: [[false, 'Most often first'], [true, 'Least often first']], only: 'rhythm', edit: 'rhythm', note: 'How often you want to be in touch.' },
  { key: 'last_spoke_on', label: 'Last spoke', sort: 'last_spoke', sorts: [[true, 'Most recent first'], [false, 'Longest ago first']], edit: 'type', note: 'When you last spoke.' },
  { key: 'due_on', label: 'Next due', sort: 'due', sorts: [[false, 'Most overdue first'], [true, 'Furthest away first']], note: 'Worked out from the rhythm and when you last spoke.' },
  { key: 'given_count', label: 'Given', sort: 'given', sorts: [[true, 'Highest first'], [false, 'Lowest first']], numeric: true, note: 'How many times you’ve given something.' },
  { key: 'asked_count', label: 'Asked', sort: 'asked', sorts: [[true, 'Highest first'], [false, 'Lowest first']], numeric: true, note: 'How many times you’ve asked for something.' },
];
export const OWN_COLUMN_NOTE = 'Your own column.';
export const OWN_COLUMN_KINDS = [['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['choice', 'Choice']];

/** One of your own columns as the table reads it (sorted as `own:<its id>`, typed over, never narrowed). */
export const ownColumnHead = (column) => ({ key: `own:${column.id}`, label: column.name, sort: `own:${column.id}`, own: column, edit: 'type', numeric: column.kind === 'number',
  sorts: column.kind === 'number' ? [[true, 'Highest first'], [false, 'Lowest first']] : column.kind === 'date' ? [[true, 'Most recent first'], [false, 'Longest ago first']] : [[false, 'A to Z'], [true, 'Z to A']], note: clean(column.note) || OWN_COLUMN_NOTE });

/**
 * Every column the table can show, in order: its own, then yours; and
 * which are showing (Name always is). Hidden built-in columns are kept in
 * coach_settings.crm.network_hidden; one of your own carries its own
 * `hidden`.
 * @returns {{ all: object[], shown: object[] }}
 */
export function tableColumns(columns = [], crmSettings = null) {
  const hidden = new Set(crmSettings?.network_hidden || []);
  const all = [...NETWORK_COLUMNS, ...[...(columns || [])].sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(String(b.name))).map(ownColumnHead)];
  return { all, shown: all.filter((c) => c.fixed || (c.own ? !c.own.hidden : !hidden.has(c.key))) };
}
/** The setting after a built-in column's switch is flipped in Show or hide columns. */
export function withColumnShown(crmSettings, key, shown) {
  const hidden = new Set(crmSettings?.network_hidden || []);
  if (shown) hidden.delete(key); else if (key !== 'name') hidden.add(key);
  return { ...(crmSettings || {}), network_hidden: [...hidden] };
}

/** "Show only" for Where to focus: the four lists, then No list. */
export const FOCUS_ONLY = [...FOCUS_LISTS.map((f) => [f, FOCUS_WORDS[f].label]), ['none', 'No list']];
/** "Show" on the map: Everyone and the five lists. */
export const MAP_SHOW = [['everyone', 'Everyone'], ...FOCUS_ONLY];
/** "Show only" for Rhythm (0 is no rhythm, as the paging function reads it). */
export const RHYTHM_ONLY = [...RHYTHMS.map((m) => [m, rhythmWords(m)]), [0, NO_RHYTHM]];

/**
 * The table's state as ONE query for the paging function: what was
 * searched for, the heading sorted by and which way, every "Show only",
 * the archive or not, and how many rows are showing (50 at a time).
 * @param {{ search?: string, sort?: string, desc?: boolean, only?: { focus?: string[], role?: string[], organisation?: string[], rhythm?: number[] }, archived?: boolean, pages?: number }} state
 * @param {string} today
 * @returns {object} networkPage's query: the rows of the LAST page only (offset and limit), so nobody is ever loaded twice
 */
export function tableQuery(state = {}, today) {
  const sort = NETWORK_SORTS.includes(state.sort) || /^own:.+/.test(String(state.sort || '')) ? state.sort : 'name';
  const only = {};
  for (const k of ['focus', 'role', 'organisation', 'rhythm']) if (Array.isArray(state.only?.[k]) && state.only[k].length) only[k] = [...state.only[k]];
  const pages = Math.max(1, Math.round(Number(state.pages) || 1));
  return { search: clean(state.search).slice(0, 120), sort, desc: Boolean(state.desc), only, archived: Boolean(state.archived), limit: NETWORK_PAGE, offset: (pages - 1) * NETWORK_PAGE, today };
}
/** A heading's sort chosen from its menu: the state to ask with (back to the first page). */
export const withSort = (state, column, desc) => ({ ...state, sort: column.sort, desc: Boolean(desc), pages: 1 });
/** A "Show only" choice ticked or unticked. */
export function withOnly(state, key, value, on) {
  const now = new Set(state.only?.[key] || []);
  if (on) now.add(value); else now.delete(value);
  return { ...state, only: { ...(state.only || {}), [key]: [...now] }, pages: 1 };
}
/** "Show all" in a heading's menu, and Clear above the table. */
export const withoutOnly = (state, key) => ({ ...state, only: { ...(state.only || {}), [key]: [] }, pages: 1 });
export const cleared = (state) => ({ ...state, search: '', only: {}, pages: 1 });
/** How many choices narrow a column (its heading reads "Where to focus, 1"). */
export const onlyCount = (state, key) => (state.only?.[key] || []).length;
export const headingLabel = (column, state) => { const n = column.only ? onlyCount(state, column.only) : 0; return n ? `${column.label}, ${n}` : column.label; };
export const isNarrowed = (state) => Boolean(clean(state.search)) || ['focus', 'role', 'organisation', 'rhythm'].some((k) => onlyCount(state, k) > 0);

/**
 * The count above the table: "1,139 people", "64 of 1,176 people" while
 * searched or narrowed (with Clear), "37 archived" in the archive.
 * @param {{ total: number, all: number }} page the paging function's answer
 */
export function tableCount(page, state = {}) {
  const narrowed = isNarrowed(state);
  if (state.archived) return { words: narrowed ? `${count(page.total)} of ${count(page.all)} archived` : `${count(page.all)} archived`, clear: narrowed };
  return { words: narrowed ? `${count(page.total)} of ${people(page.all)}` : people(page.all), clear: narrowed };
}
/** Under the table: "Showing 50 of 1,139" and "Show 50 more" while there are more. */
export function tableFoot(shown, total) {
  const left = Math.max(0, total - shown);
  return { showing: left > 0 ? `Showing ${count(shown)} of ${count(total)}` : '', more: left > 0 ? `Show ${Math.min(NETWORK_PAGE, left)} more` : '' };
}
export const TABLE_WORDS = {
  search: 'Search your network', clear: 'Clear', add: 'Add someone', importSheet: 'Import a spreadsheet', export: 'Export', columns: 'Show or hide columns', addColumn: 'Add column', back: 'Network',
  saved: 'Saved.', noneFound: 'Nobody matches that. Check the spelling, or choose Clear.', emptyCell: 'Add',
};

/** A cell's words: a rating as its number, the rhythm, the day you last spoke, when the next catch-up is, a count, or what was typed. */
export function cellWords(person, column, today) {
  if (column.own) { const v = person.own?.[column.own.id]; return v == null || v === '' ? '' : column.own.kind === 'date' ? dayWords(v, today) || String(v) : String(v); }
  const v = person[column.key];
  switch (column.key) {
    case 'focus': return focusLabel(person.focus ?? focusOf(person));
    case 'rhythm_months': return rhythmWords(v);
    case 'last_spoke_on': return v ? dayWords(v, today) : '';
    case 'due_on': return dueWords(person.due_on ?? dueOn(person), today);
    case 'given_count': case 'asked_count': return String(v ?? 0);
    default: return v == null ? '' : String(v);
  }
}

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** A day as typed (a cell typed over, a board card's date): "today", "yesterday", "tomorrow", "12 Oct", "Mon 12 Oct", "12 October 2025", "12/10/2025" (day first) or 2025-10-12. A day that doesn't exist is no day. */
export function typedDay(typed, today) {
  const t = clean(typed).toLowerCase().replace(/,/g, '');
  if (!t) return null;
  if (t === 'today') return today;
  if (t === 'yesterday') return addDays(today, -1);
  if (t === 'tomorrow') return addDays(today, 1);
  const year = Number(String(today).slice(0, 4));
  const real = (y, m, d) => { const key = `${pad(y, 4)}-${pad(m)}-${pad(d)}`; return fromDayKey(key) ? key : null; };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return real(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/.exec(t);
  if (m) return real(m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year, Number(m[2]), Number(m[1]));
  m = /^(?:[a-z]{3,9}\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?$/.exec(t);
  if (!m) return null;
  const mo = MONTHS3.indexOf(m[2].slice(0, 3));
  return mo < 0 ? null : real(m[3] ? Number(m[3]) : year, mo + 1, Number(m[1]));
}

/**
 * A cell changed in place: what to save (`{ id, ...what changed }` for
 * saveNetworkPerson), the toast ("Saved."), and what Undo saves back. A
 * value that can't be kept comes back as a calm line instead, and nothing
 * is saved. Where to focus, Next due, Given and Asked are worked out, so
 * they are never typed.
 * @param {object} person the row as it is
 * @param {object} column one of tableColumns' columns
 * @param {string|number|null} value what was typed, or chosen from the small menu
 * @param {string} today
 * @returns {{ patch: object, undo: object, toast: string }|{ error: string }|null} null when nothing changed
 */
export function cellChange(person, column, value, today) {
  let key = column.key;
  let next;
  if (column.own) {
    const typed = clean(value);
    if (column.own.kind === 'number' && typed && !NUMBER.test(typed.replace(/,/g, ''))) return { error: 'Type a number.' };
    if (column.own.kind === 'date' && typed && !typedDay(typed, today)) return { error: 'Type a date, such as 12 Oct or 12 Oct 2025.' };
    if (column.own.kind === 'choice' && typed && Array.isArray(column.own.options) && column.own.options.length && !column.own.options.some((o) => String(o).toLowerCase() === typed.toLowerCase())) return { error: 'Choose one of the options.' };
    const kept = !typed ? null : column.own.kind === 'number' ? typed.replace(/,/g, '') : column.own.kind === 'date' ? typedDay(typed, today)
      : column.own.kind === 'choice' && column.own.options?.length ? column.own.options.find((o) => String(o).toLowerCase() === typed.toLowerCase()) : cut(typed, 300);
    const was = person.own?.[column.own.id] ?? null;
    if ((kept ?? null) === was) return null;
    const own = { ...(person.own || {}) };
    if (kept == null) delete own[column.own.id]; else own[column.own.id] = kept;
    return { patch: { id: person.id, own }, undo: { id: person.id, own: person.own || {} }, toast: TABLE_WORDS.saved };
  }
  if (column.edit === 'rating') {
    next = value === '' || value == null ? null : Number(value);
    if (next != null && !rated(next)) return { error: 'Choose a number from 0 to 10.' };
  } else if (column.edit === 'rhythm') {
    next = value === '' || value == null || Number(value) === 0 ? null : Number(value);
    if (next != null && !(Number.isInteger(next) && next >= 1 && next <= 24)) return { error: 'Choose how often from the list.' };
  } else if (key === 'last_spoke_on') {
    const typed = clean(value);
    next = typed ? typedDay(typed, today) : null;
    if (typed && !next) return { error: 'Type a date, such as 12 Oct or 12 Oct 2025.' };
    if (next && next > today) return { error: 'That day hasn’t happened yet. Type today or an earlier day.' };
  } else if (key === 'email') {
    next = clean(value).toLowerCase() || null;
    if (next && !isEmail(next)) return { error: 'That email doesn’t look right. Check it and try again.' };
  } else if (key === 'organisation' || key === 'role' || key === 'phone') {
    next = cut(clean(value), key === 'role' ? 80 : key === 'phone' ? 40 : 120) || null;
  } else return null;
  if ((person[key] ?? null) === next) return null;
  const patch = { id: person.id, [key]: next };
  const undo = { id: person.id, [key]: person[key] ?? null };
  // Typing a new organisation's name lets go of the organisation it was joined to.
  if (key === 'organisation' && person.organisation_id) { patch.organisation_id = null; undo.organisation_id = person.organisation_id; }
  return { patch, undo, toast: TABLE_WORDS.saved };
}

/** What stops one of your own columns being added, or ''. */
export function columnProblem(name, columns = [], id = null) {
  const n = clean(name);
  if (!n) return 'Type the column’s name to carry on.';
  if (n.length > 40) return 'Column names can be up to 40 characters.';
  const taken = [...NETWORK_COLUMNS.map((c) => c.label), ...(columns || []).filter((c) => c.id !== id).map((c) => c.name)].find((x) => String(x).toLowerCase() === n.toLowerCase());
  return taken ? `There’s already a column called ${taken}. Choose another name.` : '';
}
/** One of your own columns, added last (there is no limit on how many). */
export const newColumn = ({ id, coachId, name, kind = 'text', note = '', columns = [] }) => ({ id, coach_id: coachId, name: cut(clean(name), 40), kind: OWN_COLUMN_KINDS.some(([k]) => k === kind) ? kind : 'text', options: [], note: cut(clean(note), 120) || null,
  position: Math.max(-1, ...(columns || []).map((c) => Number(c.position) || 0)) + 1, hidden: false });

// ---------------------------------------------------------------- import and export

/** What a spreadsheet's column can be matched to in Network (crm.js's matchColumns and sheetRows read them). */
export const NETWORK_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', heads: /^(full ?name|name|contact( name)?|person|who)$/i },
  { key: 'first', label: 'First name', heads: /^(first|first ?name|given ?name|forename)$/i },
  { key: 'last', label: 'Last name', heads: /^(last|last ?name|surname|family ?name)$/i },
  { key: 'organisation', label: 'Organisation', heads: /^(organi[sz]ation|company( name)?|employer|business|firm|club)$/i },
  { key: 'role', label: 'Role', heads: /^(role|relationship|how (i|you) know them|type|category)$/i },
  { key: 'email', label: 'Email', heads: /^(e[- ]?mail( address)?|email ?1)$/i },
  { key: 'phone', label: 'Phone', heads: /^(phone|mobile|cell|tel|telephone|(phone|mobile) ?(number|no\.?))$/i },
  { key: 'influence', label: 'Influence', heads: /^(their )?influence$/i },
  { key: 'trust', label: 'Trust in you', heads: /^(their )?trust( in (you|me))?$/i },
  { key: 'value_delivery', label: 'Value delivery', heads: /^(value delivery|value( you)? (offer|deliver)(ed)?|the value you offer them)$/i },
  { key: 'what_you_get', label: 'What you get', heads: /^(what (you|i) get( from it)?)$/i },
  { key: 'rhythm_months', label: 'Rhythm', heads: /^(rhythm|every|how often|frequency|cadence)$/i },
  { key: 'last_spoke_on', label: 'Last spoke', heads: /^(last spoke|last spoken|last contact(ed)?|last touch)$/i },
  { key: 'notes', label: 'Notes', heads: /^(notes?|comments?)$/i },
];
export const NETWORK_IMPORT_HELP = 'Duplicates show before anyone is added.';
export const NETWORK_IMPORT_DROP = 'Drop an Excel or CSV file here';

const RHYTHM_TYPED = [[/^(every )?(1 )?month(ly)?$/, 1], [/^(every )?(3 months|quarter(ly)?)$/, 3], [/^(every )?(6 months|half[- ]year(ly)?|twice a year)$/, 6], [/^(every )?(12 months|year(ly)?|annual(ly)?)$/, 12]];
/** A rhythm as a spreadsheet might hold it: "3", "Every 3 months", "Quarterly", "90 days". Months, or null. */
export function typedRhythm(value) {
  const t = clean(value).toLowerCase();
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) return Number(t) >= 1 && Number(t) <= 24 ? Number(t) : null;
  const named = RHYTHM_TYPED.find(([re]) => re.test(t));
  if (named) return named[1];
  let m = /^(?:every )?(\d{1,2}) months?$/.exec(t);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 24 ? Number(m[1]) : null;
  m = /^(?:every )?(\d{2,3}) days?$/.exec(t);
  if (m) { const months = Math.round(Number(m[1]) / 30); return months >= 1 && months <= 24 ? months : null; }
  return null;
}

/**
 * A spreadsheet's rows (crm.js's sheetRows) as the rows network_import()
 * takes: ratings outside 0 to 10 and anything unreadable are left blank
 * (a person with a rating missing is on no focus list until rated), and
 * the file's other columns can fill your own columns by name.
 * @param {object[]} rows `{ name, organisation, …, extra: { 'Heading': value } }`
 * @param {{ today: string, columns?: object[] }} ctx
 * @returns {object[]} importRow()'s rows, at most 5,000 (the database's own limit)
 */
export function importRows(rows, { today, columns = [] } = {}) {
  const byName = new Map((columns || []).map((c) => [String(c.name).toLowerCase(), c]));
  return (rows || []).slice(0, 5000).map((row) => {
    const own = {};
    for (const [heading, v] of Object.entries(row.extra || {})) { const c = byName.get(String(heading).toLowerCase()); if (c && clean(v)) own[c.id] = cut(clean(v), 300); }
    const spoke = typedDay(row.last_spoke_on, today);
    return importRow({ ...row, email: isEmail(clean(row.email).toLowerCase()) ? clean(row.email).toLowerCase() : null, rhythm_months: typedRhythm(row.rhythm_months),
      last_spoke_on: spoke && spoke <= today ? spoke : null, own });
  }).filter(Boolean);
}
/** What a possible duplicate says, before anyone is added. */
export const duplicateLine = (d) => `${d.name}${d.organisation ? `, ${d.organisation},` : ''} is already in your Network${d.archived ? ' (archived)' : ''}, with the same ${d.by}.`;
export const importButtonWords = (n) => `Add ${people(n)}`;
export const importedToast = (n) => `${people(n)} added.`;

/** The rows of an export: a heading row, then a row a person with every column, your own included. */
export function exportRows(peopleRows, columns = [], today) {
  const own = [...(columns || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  const head = ['Name', 'Organisation', 'Role', 'Email', 'Phone', 'Where to focus', 'Influence', 'Trust in you', 'Value delivery', 'What you get', 'Rhythm', 'Last spoke', 'Next due', 'Given', 'Asked', 'Notes', ...own.map((c) => c.name)];
  return [head, ...(peopleRows || []).map((p) => [
    p.name, p.organisation || '', p.role || '', p.email || '', p.phone || '', focusLabel(focusOf(p)), p.influence ?? '', p.trust ?? '', p.value_delivery ?? '', p.what_you_get ?? '', rhythmWords(p.rhythm_months),
    p.last_spoke_on ? dayWords(p.last_spoke_on, today) : '', dueOn(p) ? dayWords(dueOn(p), today) : '', p.given_count ?? 0, p.asked_count ?? 0, p.notes || '',
    ...own.map((c) => { const v = p.own?.[c.id]; return v == null ? '' : c.kind === 'number' && NUMBER.test(String(v)) ? Number(v) : String(v); }),
  ])];
}

// ---------------------------------------------------------------- the map

/** The chart: influence up, trust across, each 0 to 10 with ONE shared 0 at the corner, and a hairline at 7 on each, labelled once outside the chart. */
export const MAP_CHART = { up: 'Influence', across: 'Trust', min: 0, max: 10, lineAt: 7, lineLabel: '7 or more' };

/**
 * The line above the chart. Capped: "Showing 150 of 1,139 people: your
 * focus lists first, then who you spoke to most recently." Narrowed by
 * Show and all showing: "36 of 1,139 people". Everyone showing: ''.
 * @param {{ total: number, placed: number, rows: object[] }} map network_map's answer
 * @param {string} [show] the Show choice
 */
export function mapLine(map, show = 'everyone') {
  const shown = (map?.rows || []).length;
  const of = show === 'everyone' ? map.total : map.placed;
  if (shown < map.placed) return `Showing ${count(shown)} of ${people(of)}: your focus lists first, then who you spoke to most recently.`;
  return show === 'everyone' ? '' : `${count(shown)} of ${people(map.total)}`;
}
export const MAP_WORDS = { show: 'Show', find: 'Find someone', help: 'How to read the map', empty: 'Nobody is on the map yet. Rate someone’s influence and trust to place them.', noneInShow: 'Nobody in this list is on the map.' };

/**
 * One dot per spot. People who share an influence and a trust are ONE dot
 * of the same size, with how many inside when there is more than one.
 * Its style says where to focus: 'keep_close' (green with a fine ring),
 * 'maintain' (solid), 'invest' (an outline), 'rebalance' (a dashed grey
 * outline), 'mixed' (pale: the people there are in different lists) or
 * 'none' (plain grey). Never coral.
 * @param {object[]} rows network_map's rows (a found person added with withFound)
 * @param {{ foundId?: string }} [o] the person "Find someone" found, whose dot is ringed and named
 * @returns {{ key: string, trust: number, influence: number, count: number, ids: string[], style: string, number: string, found: boolean, name: string, label: string }[]}
 *   `number`: what the dot shows ('' for one person); `name`: shown beside a found dot; `label`: what a screen reader hears
 */
export function mapSpots(rows, { foundId = null } = {}) {
  const spots = new Map();
  for (const p of rows || []) {
    if (!rated(p.influence) || !rated(p.trust)) continue;
    const key = `${p.trust}:${p.influence}`;
    if (!spots.has(key)) spots.set(key, { key, trust: p.trust, influence: p.influence, people: [] });
    spots.get(key).people.push(p);
  }
  return [...spots.values()].sort((a, b) => a.influence - b.influence || a.trust - b.trust).map((s) => {
    const lists = new Set(s.people.map((p) => (p.focus ?? focusOf(p)) || 'none'));
    const style = lists.size > 1 ? 'mixed' : [...lists][0];
    const found = s.people.find((p) => p.id === foundId) || null;
    const one = s.people.length === 1 ? s.people[0] : null;
    return {
      key: s.key, trust: s.trust, influence: s.influence, count: s.people.length, ids: s.people.map((p) => p.id), style, number: one ? '' : String(s.people.length), found: Boolean(found), name: found ? found.name : '',
      label: one ? `${one.name}${focusLabel(style) ? `, ${focusLabel(style)}` : ''}. Influence ${s.influence} out of 10, trust ${s.trust} out of 10.` : `${people(s.people.length)}. Influence ${s.influence} out of 10, trust ${s.trust} out of 10. Choose to see who.`,
    };
  });
}

/** The people at one spot, as its list shows them: by list (Keep close first), then by name. */
export function spotPeople(rows, spot, today) {
  const order = { keep_close: 0, maintain: 1, invest: 2, rebalance: 3 };
  const ids = new Set(spot.ids);
  return (rows || []).filter((p) => ids.has(p.id)).map((p) => ({ p, f: p.focus ?? focusOf(p) }))
    .sort((a, b) => (order[a.f] ?? 9) - (order[b.f] ?? 9) || String(a.p.name).toLowerCase().localeCompare(String(b.p.name).toLowerCase(), 'en'))
    .map(({ p, f }) => ({ id: p.id, name: p.name, organisation: clean(p.organisation), list: focusLabel(f), due: dueLine(p.due_on ?? dueOn(p), today) }));
}
/** The list's heading: "8 people", then "Trust 7/10, influence 10/10". */
export const spotTitle = (spot) => ({ title: people(spot.count), meta: `Trust ${spot.trust}/10, influence ${spot.influence}/10` });

/**
 * A dot's pop-up, laid out as a small card: the title (the name, or "2
 * people"), then the organisation and the list ("Invest", or "Several
 * lists"), then label and value rows: Influence 9/10, Trust 6/10, and for
 * one person Catch-up (the day, or "Due now"). A numbered dot ends with
 * "Choose to see who".
 * @param {object} spot one of mapSpots' spots
 * @param {object[]} rows the map's rows
 * @param {string} today
 * @returns {{ title: string, sub: string[], rows: [string, string][], foot: string }}
 */
export function spotCard(spot, rows, today) {
  const ratings = [['Influence', `${spot.influence}/10`], ['Trust', `${spot.trust}/10`]];
  if (spot.count > 1) return { title: people(spot.count), sub: [spot.style === 'mixed' ? 'Several lists' : focusLabel(spot.style) || 'No list'], rows: ratings, foot: 'Choose to see who' };
  const p = (rows || []).find((x) => x.id === spot.ids[0]) || {};
  return { title: p.name || '', sub: [clean(p.organisation), focusLabel(spot.style)].filter(Boolean), rows: [...ratings, ['Catch-up', catchUpWords(p.due_on ?? dueOn(p), today)]], foot: '' };
}
/** On a phone a chart pop-up is one line: the name, the list and the catch-up (the organisation is on the card and the person's page; with it the line ran to two on a 400px phone). */
export const spotLine = (spot, rows, today) => { const c = spotCard(spot, rows, today); return [c.title, ...(spot.count > 1 ? c.sub : [focusLabel(spot.style)]), ...(spot.count > 1 ? [] : c.rows.slice(2).map(([, v]) => v))].filter(Boolean).join(', '); };

/** Find someone: the person found is added to the map's rows (they may be outside its 150), so their dot can be ringed and named. No spot until influence and trust are rated. */
export function withFound(rows, person) {
  if (!person || !rated(person.influence) || !rated(person.trust)) return { rows: rows || [], placed: false, line: person ? `${firstName(person.name) || 'They'} ${firstName(person.name) ? 'isn’t' : 'aren’t'} on the map yet. Rate their influence and trust to place them.` : '' };
  const there = (rows || []).some((p) => p.id === person.id);
  return { rows: there ? rows : [...(rows || []), { ...person, focus: focusOf(person), due_on: dueOn(person) }], placed: true, line: '' };
}

/** "How to read the map", in the side panel: each mark and what it means. */
export const MAP_HELP = [
  ['Up and across', 'Each person sits by their influence and their trust in you, from your ratings.'],
  ['A green dot with a fine ring', 'Keep close: their trust in you and what you get are both 7 or more.'],
  ['An outline', 'Invest: their influence is 7 or more, and their trust in you or your value delivery is 6 or less.'],
  ['A solid dot in the text colour', 'Maintain: their influence, their trust in you and your value delivery are all 7 or more.'],
  ['A dashed grey outline', 'Rebalance? A lot of your time may be going in.'],
  ['A number', 'How many people share that spot. Choose it to see who.'],
  ['A pale dot with a number', 'The people there are in different lists.'],
  ['A plain grey dot', 'Not in a list right now.'],
];

// ---------------------------------------------------------------- what you've given and what you've asked

/** What you've given, and what you've asked, in words (network_gives' kinds). */
export const GAVE_WORDS = { idea: 'An idea', resource: 'An article or resource', introduction: 'An introduction', favour: 'A favour', other: 'Something else' };
export const ASKED_WORDS = { introduction: 'An introduction', referral: 'A referral', advice: 'Advice', favour: 'A favour', other: 'Something else' };
export const GIVE_WORDS = {
  gave: { title: 'What you’ve given', log: 'Log what you gave', none: 'Nothing given yet.', question: 'What did you give?', kinds: GAVE_KINDS.map((k) => [k, GAVE_WORDS[k]]) },
  asked: { title: 'What you’ve asked', log: 'Log an ask', none: 'Nothing asked yet.', question: 'What did you ask for?', kinds: ASKED_KINDS.map((k) => [k, ASKED_WORDS[k]]) },
};
/** "once", "twice", "3 times". */
export const timesWords = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${count(n)} times`);

/**
 * The give-and-ask line: "You’ve given twice and asked once.", "You’ve
 * given once and haven’t asked yet.", "You’ve asked twice and haven’t
 * given yet.", or "Nothing logged yet."
 */
export function giveAskLine(given, asked) {
  const g = Number(given) || 0;
  const a = Number(asked) || 0;
  if (!g && !a) return 'Nothing logged yet.';
  if (!g) return `You’ve asked ${timesWords(a)} and haven’t given yet.`;
  return `You’ve given ${timesWords(g)} and ${a ? `asked ${timesWords(a)}` : 'haven’t asked yet'}.`;
}
/** The counts from a person's gives (the database keeps given_count and asked_count the same way). */
export const giveCounts = (gives, personId) => ({
  given: (gives || []).filter((g) => g.person_id === personId && g.direction === 'gave').length,
  asked: (gives || []).filter((g) => g.person_id === personId && g.direction === 'asked').length,
});
/** One side's rows on a person's panel, newest first: the kind, the note, and the day ("Today", or "Mon 17 Aug"). */
export function giveRows(gives, direction, today) {
  const words = direction === 'asked' ? ASKED_WORDS : GAVE_WORDS;
  return (gives || []).filter((g) => g.direction === direction).sort((a, b) => String(b.happened_on).localeCompare(String(a.happened_on)) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((g) => ({ id: g.id, kind: words[g.kind] || words.other, note: clean(g.note), when: g.happened_on === today ? 'Today' : dayWords(g.happened_on, today) }));
}
/**
 * A give or an ask, ready to save (saveNetworkGive).
 * @returns {{ give: object, toast: string }|{ error: string }}
 */
export function newGive({ id, coachId, personId, direction, kind, note = '', today }) {
  const kinds = direction === 'asked' ? ASKED_KINDS : GAVE_KINDS;
  if (direction !== 'asked' && direction !== 'gave') return { error: 'Choose what to log to carry on.' };
  if (!kinds.includes(kind)) return { error: 'Choose one to carry on.' };
  if (kind === 'other' && !clean(note)) return { error: direction === 'asked' ? 'Type what you asked for to carry on.' : 'Type what you gave to carry on.' };
  return { give: { id, person_id: personId, coach_id: coachId, direction, kind, note: cut(String(note || '').trim(), 600) || null, happened_on: today }, toast: 'Logged.' };
}

// ---------------------------------------------------------------- rating history

/**
 * Edit ratings: what changed, the rows to save, the history's own rows
 * for the device (the database writes network_ratings itself: one value a
 * rating and day), and the toast.
 * @param {object} person
 * @param {{ influence?: number|null, trust?: number|null, value_delivery?: number|null, what_you_get?: number|null }} typed
 * @param {{ today: string, coachId: string }} ctx
 * @returns {{ patch: object, undo: object, history: object[], toast: string }|{ error: string }|null} null when nothing changed
 */
export function ratingsChange(person, typed, { today, coachId }) {
  const patch = { id: person.id };
  const undo = { id: person.id };
  const history = [];
  for (const k of RATINGS) {
    if (!Object.prototype.hasOwnProperty.call(typed || {}, k)) continue;
    const next = typed[k] === '' || typed[k] == null ? null : Number(typed[k]);
    if (next != null && !rated(next)) return { error: 'Choose a number from 0 to 10.' };
    if ((person[k] ?? null) === next) continue;
    patch[k] = next;
    undo[k] = person[k] ?? null;
    if (next != null) history.push({ person_id: person.id, coach_id: coachId, rating: k, rated_on: today, value: next });
  }
  return Object.keys(patch).length > 1 ? { patch, undo, history, toast: TABLE_WORDS.saved } : null;
}
/** The history as the device keeps it: one value a rating and day (a second change on the same day replaces the first). */
export function withRatings(history, added) {
  const key = (r) => `${r.person_id}|${r.rating}|${r.rated_on}`;
  const fresh = new Set((added || []).map(key));
  return [...(history || []).filter((r) => !fresh.has(key(r))), ...(added || [])];
}
/** A rating's dated history on a person's panel, newest first: "8/10" and the day; `change`: "Up from 6" or "Down from 9" beside each. */
export function ratingHistory(ratings, rating, today) {
  const mine = (ratings || []).filter((r) => r.rating === rating).sort((a, b) => String(b.rated_on).localeCompare(String(a.rated_on)));
  return mine.map((r, i) => {
    const before = mine[i + 1];
    return { value: `${r.value}/10`, when: r.rated_on === today ? 'Today' : dayWords(r.rated_on, today), change: !before || before.value === r.value ? '' : `${r.value > before.value ? 'Up' : 'Down'} from ${before.value}` };
  });
}

// ---------------------------------------------------------------- one person

export const PERSON_WORDS = {
  contact: 'Contact', editContact: 'Edit contact details', howItIs: 'How it is', editRatings: 'Edit ratings', howOften: 'How often?', notNow: 'Not now, in 2 weeks', stop: 'Stop keeping in touch',
  moveToLeads: 'Move to Leads', openLead: 'Open the lead', archive: 'Archive', restore: 'Restore', noEmail: 'Add', noPhone: 'Add', archivedNote: 'Archived. Their history is kept.',
};
/** "You last spoke on Tue 17 Nov.", or "You haven’t spoken yet." */
export const lastSpokeLine = (p, today) => (p?.last_spoke_on ? `You last spoke ${p.last_spoke_on === today ? 'today' : `on ${dayWords(p.last_spoke_on, today)}`}.` : 'You haven’t spoken yet.');
/** "I spoke to David today". */
export const spokeLabel = (p) => `I spoke to ${firstName(p?.name) || 'them'} today`;
/** Under the name: the role and the organisation ("Chief medical officer, Citadel"). */
export const personSub = (p) => [clean(p?.role), clean(p?.organisation)].filter(Boolean).join(', ');

/** "I spoke to David today": last spoke is today, any "Not now" is let go, and the toast says when next. */
export function spokeToday(p, today) {
  const next = dueOn({ ...p, last_spoke_on: today, snoozed_until: null });
  return { patch: { id: p.id, last_spoke_on: today, snoozed_until: null }, undo: { id: p.id, last_spoke_on: p.last_spoke_on ?? null, snoozed_until: p.snoozed_until ?? null },
    toast: next ? `Logged. Next time is ${dayWords(next, today)}.` : 'Logged.' };
}
/** "Not now, in 2 weeks". */
export function notNow(p, today) {
  const until = addDays(today, 14);
  return { patch: { id: p.id, snoozed_until: until }, undo: { id: p.id, snoozed_until: p.snoozed_until ?? null }, toast: `Moved to ${dayWords(until, today)}.` };
}
/** "Stop keeping in touch": the rhythm goes; they stay in Network. */
export const stopKeeping = (p) => ({ patch: { id: p.id, rhythm_months: null, snoozed_until: null }, undo: { id: p.id, rhythm_months: p.rhythm_months ?? null, snoozed_until: p.snoozed_until ?? null }, toast: 'Stopped. They stay in your Network.' });

/** A phone number as WhatsApp needs it ("+447700900141" from "07700 900141"; a number already written with + keeps its country). '' when it isn't a number. */
export function mobileForLinks(phone) {
  const t = clean(phone).replace(/[^\d+]/g, '');
  if (/^\+\d{6,15}$/.test(t)) return t;
  if (/^00\d{6,15}$/.test(t)) return `+${t.slice(2)}`;
  return /^0\d{9,10}$/.test(t) ? `+44${t.slice(1)}` : '';
}
/** Email and WhatsApp (and iMessage for a +1 number) open the coach's own apps. Nothing is ever sent from the portal. */
export const personContacts = (p) => quickContacts({ email: p?.email, mobile: mobileForLinks(p?.phone) });

/** Edit contact details: the patch, or a calm line. */
export function contactChange(person, { email = '', phone = '' } = {}) {
  const e = clean(email).toLowerCase() || null;
  if (e && !isEmail(e)) return { error: 'That email doesn’t look right. Check it and try again.' };
  const ph = cut(clean(phone), 40) || null;
  if ((person.email ?? null) === e && (person.phone ?? null) === ph) return null;
  return { patch: { id: person.id, email: e, phone: ph }, undo: { id: person.id, email: person.email ?? null, phone: person.phone ?? null }, toast: TABLE_WORDS.saved };
}

/** Add someone: who they are to you, and how often. */
export const ROLES = ['Referrer', 'Sponsor', 'Client', 'Past client', 'Key contact', 'Network'];
export const ADD_RHYTHMS = [1, 3, 6, 12];
/**
 * A new Network person from Add someone.
 * @returns {{ person: object, toast: string }|{ error: string }}
 */
export function newPerson({ id, coachId, name, role = '', rhythm = 3, organisation = '', email = '', today, profileId = null }) {
  const n = cut(clean(name), 120);
  if (!n) return { error: 'Type their name to carry on.' };
  const e = clean(email).toLowerCase();
  if (e && !isEmail(e)) return { error: 'That email doesn’t look right. Check it and try again.' };
  return { person: { id, coach_id: coachId, name: n, organisation: cut(clean(organisation), 120) || null, organisation_id: null, role: cut(clean(role), 80) || null, email: e || null, phone: null,
    influence: null, trust: null, value_delivery: null, what_you_get: null, rhythm_months: Number.isInteger(rhythm) && rhythm >= 1 && rhythm <= 24 ? rhythm : null, last_spoke_on: null, snoozed_until: null,
    added_on: today, own: {}, archived_at: null, keep: false, profile_id: profileId, notes: null, merged_into: null }, toast: 'Added. You’ll see them here when it’s time.' };
}

// ---------------------------------------------------------------- Today, and the menu

/** Today shows this many people due, then "Show all 27". */
export const TODAY_KEEP_IN_TOUCH = 3;
/** Today's people due, as a query for the paging function: the three most overdue. */
export const todayDueQuery = (today) => ({ only: { due: 'now' }, sort: 'due', desc: false, limit: TODAY_KEEP_IN_TOUCH, offset: 0, today });

/**
 * Today's Keep in touch: one quiet line each for the people due a
 * catch-up (three, then "Show all 27") and for past clients' check-ins.
 * Nothing shows when nobody is due.
 * @param {{ due?: { total: number, rows: object[] }, checkIns?: { id: string, name: string, what: string, when: string }[], today: string }} o
 *   `due`: the paging function's answer to todayDueQuery; `checkIns`: crm.js's checkInsDue
 * @returns {{ title: string, people: { id: string, name: string, sub: string, line: string }[], more: string, checkIns: { id: string, name: string, sub: string, when: string, line: string }[] }|null}
 */
export function todayKeepInTouch({ due = null, checkIns = [], today }) {
  const rows = (due?.rows || []).slice(0, TODAY_KEEP_IN_TOUCH);
  if (!rows.length && !(checkIns || []).length) return null;
  return {
    title: 'Keep in touch',
    people: rows.map((p) => ({ id: p.id, name: p.name, sub: clean(p.role), line: `${p.name}: ${sinceWords(p.last_spoke_on, today).replace(/^You /, 'you ')}.` })),
    more: (due?.total || 0) > TODAY_KEEP_IN_TOUCH ? `Show all ${count(due.total)}` : '',
    checkIns: (checkIns || []).map((c) => ({ id: c.id, profileId: c.profileId ?? null, name: c.name, sub: c.what, when: c.when, line: `${c.name}: ${c.what}, ${c.when.charAt(0).toLowerCase()}${c.when.slice(1)}.` })),
  };
}

/** The menu's count beside Network: how many people are due a catch-up ('' for none), and what a screen reader hears. */
export const menuCount = (counts) => { const n = Number(counts?.due) || 0; return n > 0 ? { count: count(n), spoken: `${count(n)} due a catch-up` } : { count: '', spoken: '' }; };

// =============================================================================
// THE PAGES' OWN RULES (builder E): what Network's page, its panels, the
// frame's search and Today need beyond the above. Still pure, still the
// only place a word or a rule of Network's is written.
// =============================================================================

/** Network's address for a tab, the archive, or one person's panel (a page never writes its own). */
export function networkPath({ tab = 'actions', archived = false, person = null } = {}) {
  const q = new URLSearchParams();
  if (tab && tab !== 'actions') q.set('tab', tab);
  if (archived) { q.set('tab', 'table'); q.set('archived', '1'); }
  if (person) q.set('person', person);
  const s = q.toString();
  return `/coach/network${s ? `?${s}` : ''}`;
}

/** The table opens sorted by who is due first, as M11 draws it. */
export const TABLE_START = { search: '', sort: 'due', desc: false, only: {}, pages: 1 };

/**
 * A heading's "Show only" choices, as [value, words]: the lists for Where
 * to focus, the rhythms for Rhythm; for Role and Organisation, the ones
 * among the rows showing (Network is never loaded whole, so the table can
 * only offer what it has in hand), with any already chosen kept in.
 * @param {object} column one of tableColumns' columns
 * @param {object[]} rows the rows showing
 * @param {object} state the table's state
 * @returns {[string|number, string][]}
 */
export function onlyChoices(column, rows = [], state = {}) {
  if (!column?.only) return [];
  if (column.only === 'focus') return FOCUS_ONLY;
  if (column.only === 'rhythm') return RHYTHM_ONLY;
  const seen = new Set([...(column.only === 'role' ? ROLES : []), ...(rows || []).map((p) => clean(p[column.key])).filter(Boolean), ...(state.only?.[column.only] || [])]);
  return [...seen].sort((a, b) => a.localeCompare(b, 'en')).slice(0, 60).map((v) => [v, v]);
}

/** A row after a change, as the database would hand it back (Where to focus and Next due worked out again), so the table updates at once. */
export const rowAfter = (row, patch) => withWorkedOut({ ...row, ...patch });

/** What a cell holds when it is opened to type over: the words it shows (a day as "Thu 6 Feb 2025", so the same words save nothing). */
export const cellTyped = (person, column, today) => (column.own ? (person.own?.[column.own.id] == null ? '' : column.own.kind === 'date' ? dayWords(person.own[column.own.id], today) || String(person.own[column.own.id]) : String(person.own[column.own.id]))
  : column.key === 'last_spoke_on' ? (person.last_spoke_on ? dayWords(person.last_spoke_on, today) : '') : person[column.key] == null ? '' : String(person[column.key]));

/** What a screen reader hears for a rating's or the rhythm's cell before it opens its small menu. */
export const cellLabel = (person, column, today) => `${column.label} for ${person.name}, ${cellWords(person, column, today) || 'not set'}. Edit`;

/** Show or hide columns: one switch a column (Name always shows), each with its one line of meaning. */
export const columnSwitches = (columns = [], crmSettings = null) => { const t = tableColumns(columns, crmSettings); const shown = new Set(t.shown.map((c) => c.key)); return t.all.filter((c) => !c.fixed).map((c) => ({ key: c.key, label: c.label, note: c.note, shown: shown.has(c.key), own: c.own || null })); };
export const COLUMNS_WORDS = { title: 'Columns', add: 'Add column', name: 'What’s it called?', kind: 'What kind is it?', added: 'Column added.', kinds: OWN_COLUMN_KINDS.filter(([k]) => k !== 'choice') };

/** "When?" on Log what you gave and Log an ask: today, yesterday, and the five days before. */
export const giveDays = (today) => Array.from({ length: 7 }, (_, i) => { const day = addDays(today, -i); return { value: day, label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : dayWords(day, today) }; });

/** Add someone's panel. */
export const ADD_WORDS = { title: 'Add to your Network', who: 'Who?', role: 'Who are they to you?', rhythm: 'How often?', button: 'Add' };
/** Edit contact details', Edit ratings' and the logs' panels. */
export const PANEL_WORDS = { contact: 'Contact details', email: 'Email', phone: 'Phone', ratings: 'Edit ratings', notRated: 'Not rated', save: 'Save', kind: 'What was it?', when: 'When?', history: 'Earlier ratings' };

/** Export: what to export, and the file's sheet name. */
export const exportChoices = (viewTotal, all, narrowed) => [...(narrowed ? [{ value: 'view', label: `This view, ${people(viewTotal)}` }] : []), { value: 'all', label: `Everyone, ${people(all)}` }, { value: 'archived', label: 'The archive' }];
export const EXPORT_PAGE = 200;
/** The questions an export asks, a page at a time (never everyone at once): each is a query for the paging function. */
export function exportQueries(what, state, total, today) {
  const base = what === 'view' ? { ...tableQuery({ ...state, pages: 1 }, today) } : { sort: 'name', desc: false, only: {}, archived: what === 'archived', today };
  return Array.from({ length: Math.max(1, Math.ceil(total / EXPORT_PAGE)) }, (_, i) => ({ ...base, limit: EXPORT_PAGE, offset: i * EXPORT_PAGE }));
}

/**
 * A spreadsheet's rows for Network's import: by the matched columns (first
 * and last name joined), with each column nobody matched kept under its
 * own heading (`extra`), so it can fill one of your own columns by name.
 * A row with no name is no person.
 * @param {string[][]} table the rows under the heading row
 * @param {{ index: number, heading: string, field: string|null }[]} columns crm.js's matchColumns answer, as the coach left it
 * @returns {{ rows: object[], skipped: number }}
 */
export function networkSheetRows(table, columns) {
  const rows = [];
  let skipped = 0;
  for (const cells of table || []) {
    const row = {};
    const extra = {};
    for (const c of columns || []) {
      const v = clean(cells[c.index]);
      if (!v) continue;
      if (c.field) row[c.field] = v; else if (clean(c.heading)) extra[clean(c.heading)] = v;
    }
    const name = clean(row.name) || clean([row.first, row.last].filter(Boolean).join(' '));
    delete row.first; delete row.last;
    if (!name) { skipped += 1; continue; }
    rows.push({ ...row, name, extra });
  }
  return { rows, skipped };
}
/** Import: what the panel says about the file before anyone is added. */
export function importSummary({ adding, duplicates, skipped }) {
  return [adding ? `${people(adding)} to add.` : 'Nobody new to add yet.', duplicates ? `${count(duplicates)} may already be here.` : null,
    skipped ? `${count(skipped)} ${skipped === 1 ? 'row has' : 'rows have'} no name, so ${skipped === 1 ? 'it is' : 'they are'} left out.` : null].filter(Boolean).join(' ');
}
export const IMPORT_WORDS = { title: 'Import a spreadsheet', choose: 'Choose a file', paste: 'Or paste rows copied from a spreadsheet', duplicates: 'Possible duplicates', columns: 'Your columns', addAnyway: 'Add anyway', leaveOut: 'Leave out',
  none: 'Choose a spreadsheet or paste its rows to carry on.', needsName: 'Choose which column holds the name to carry on.', empty: 'That file has no rows to add. Check it and try again.',
  tooMany: 'A spreadsheet can add up to 5,000 people at a time. Split it and try again.', allThere: 'Everyone in this file is already in your Network. Choose “Add anyway” beside anyone to add them again.',
  unreadable: 'That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.', tooBig: 'That file is too big. Split it, or paste the rows instead.' };
/** A file chosen for Network's import: 'xlsx' or 'text' (how to read it), or the calm line when it can't be read here. */
export function importFileKind(name, size = 0) {
  if (size > 8 * 1024 * 1024) return { problem: IMPORT_WORDS.tooBig };
  if (/\.xlsx$/i.test(String(name || ''))) return { kind: 'xlsx' };
  if (/\.(csv|tsv|txt)$/i.test(String(name || ''))) return { kind: 'text' };
  return { problem: IMPORT_WORDS.unreadable };
}

/** Network people as the frame's search shows them (the owner's alone): found by name or organisation, each opening their panel. */
export const networkSearchItems = (rows) => (rows || []).map((p) => ({ key: `n:${p.id}`, title: p.name, kind: p.archived_at ? 'Network, archived' : 'Network', also: `${p.organisation || ''} ${p.role || ''}`, to: networkPath({ tab: 'table', archived: Boolean(p.archived_at), person: p.id }) }));
/** Network's own actions in search. */
export const NETWORK_SEARCH_ACTIONS = [
  { key: 'a:network', title: 'Add someone to your Network', to: '/coach/network', state: { open: 'add' } },
  { key: 'a:network-import', title: 'Import a spreadsheet into your Network', to: '/coach/network?tab=table', state: { open: 'import' } },
];
/** Search asks for this many Network people as it is typed. */
export const searchQuery = (typed, today, archived = false) => ({ search: clean(typed).slice(0, 120), sort: 'name', desc: false, only: {}, archived, limit: 6, offset: 0, today });
/** Find someone on the map: the same question, among everyone active. */
export const findQuery = (typed, today) => searchQuery(typed, today, false);

/** What a page says when Network can't be shown or a change can't be kept: what happened, then what to do. Never the database's own words. */
export function networkProblem(error) {
  const code = error?.code || '';
  if (code === 'OFFLINE') return 'Network needs a connection the first time it opens on this device, so try again when you’re back online.';
  if (code === 'NO_ROOM') return 'This device has no room left to keep that. Free some space and try again.';
  if (code === '42501') return 'That didn’t save, because Network is the owner’s to change.';
  if (code === '23514' || code === '22023' || code === '23505' || code === '23503' || code === '23001') return 'That couldn’t be kept as it is. Check it and try again.';
  return 'That didn’t save. Check your connection and try again.';
}
export const NETWORK_LOAD_PROBLEM = 'Network didn’t load. Check your connection and try again.';
/** Not now on the Ready to archive? card. */
export const READY_NOT_NOW = 'Hidden for a month.';
/** The person's panel when they aren't there any more. */
export const PERSON_GONE = 'This person isn’t in your Network any more.';
/** The map's own words for a screen reader. */
export const MAP_LABEL = 'Your Network by influence and trust';
/** Actions' "Show more" once Show all has more than a page to show. */
export const moreWords = (shown, total) => (total > shown ? `Show ${count(Math.min(ACTIONS_ALL, total - shown))} more` : '');
