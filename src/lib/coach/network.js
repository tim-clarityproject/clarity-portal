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
// pop-up card, the give and ask line) are added to this file too, never
// worked out in a page.

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
