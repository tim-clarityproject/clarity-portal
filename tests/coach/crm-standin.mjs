// Migration 052 (Leads, the CRM and Network), as a stand-in for the coach
// portal's browser tests (Phase 6a run 4). `standIn(page, { db: 'there',
// day: true, cal: true, crm: true })` in shared.mjs holds 052's tables and
// answers its rules, triggers and functions as the SQL does
// (supabase/migrations/052_coach_crm.sql): the owner alone reads Leads'
// stages, automations, boards, emails and Network (an associate reads only
// a shared board, and can't change it); Won is always the last stage; a
// new lead takes the first stage; a booking writes its own timeline lines;
// an automation can only add a to-do or move a stage, once an event;
// Network is answered a page at a time, searched, sorted and narrowed.
// Who may read what in the real database is proved by the SQL test
// (supabase/052_coach_crm_test.sql), never by this.
//
// Network's own rules (Where to focus, when a catch-up is due, a page, the
// map, the counts, duplicates, a merge) are src/lib/coach/network.js, the
// database's twin: tests/performance/coach-crm-standin.test.mjs holds both
// to the answers the SQL test expects.
import { randomUUID } from 'node:crypto';
import { dueOn, focusOf, importRow, mergedPerson, networkCounts, networkDuplicates, networkMap, networkPage, RATINGS } from '../../src/lib/coach/network.js';

/** 052's own tables (coach_leads is 051's: 052 adds columns and rules to it). */
export const CRM_TABLES = ['coach_lead_stages', 'coach_lead_events', 'coach_lead_merges', 'coach_automations', 'coach_automation_runs', 'coach_boards',
  'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_bodies', 'coach_email_links', 'coach_email_waiting',
  'coach_email_addresses', 'client_check_ins', 'organisation_deals', 'organisation_growth', 'network_people', 'network_ratings',
  'network_gives', 'network_columns', 'network_merges'];
/** Older tables 052 adds rules to: their saves pass through this stand-in too. */
export const CRM_HOOKED = [...CRM_TABLES, 'coach_leads', 'organisation_contacts'];
export const CRM_KEYS = {
  coach_email_bodies: ['email_id'], coach_email_links: ['email_id', 'person_kind', 'person_id'], network_ratings: ['person_id', 'rating', 'rated_on'],
};
/** 052's functions: answered by the stand-in with `crm`, and as "no such function" without it (the test project is never asked). */
export const CRM_FUNCTIONS = ['coach_lead_stages_start', 'lead_merge', 'lead_unmerge', 'network_page', 'network_map', 'network_counts',
  'network_archive', 'network_restore', 'network_duplicates', 'network_import', 'network_merge', 'network_unmerge',
  'coach_email_addresses_start', 'coach_email_add', 'email_in'];

/** The five stages coach_lead_stages_start() makes, as the SQL has them. */
export const START_STAGES = [
  { name: 'New', likelihood: 10, position: 0, is_won: false }, { name: 'Call booked', likelihood: 25, position: 1, is_won: false },
  { name: 'Proposal sent', likelihood: 50, position: 2, is_won: false }, { name: 'Deciding', likelihood: 70, position: 3, is_won: false },
  { name: 'Won', likelihood: 100, position: 1000000, is_won: true },
];

const OWNER_ALONE = ['coach_lead_stages', 'coach_automations', 'coach_automation_runs', 'coach_emails', 'coach_email_bodies', 'coach_email_links',
  'coach_email_waiting', 'coach_email_addresses', 'network_people', 'network_ratings', 'network_gives', 'network_columns'];
const LEAD_SOURCES = ['chemistry_page', 'connection_page', 'booking_page', 'single_use_link', 'other', 'manual', 'import', 'email', 'network', 'referral'];
const EVENT_KINDS = ['first_contact', 'referred', 'booking', 'call', 'proposal', 'proposal_opened', 'note', 'email', 'stage', 'won', 'cold', 'warm', 'merged', 'network', 'check_in'];
const CONTACT_KINDS = ['first_contact', 'booking', 'call', 'proposal', 'email'];
const TRIGGERS = ['lead_stage', 'proposal_opened', 'lead_quiet', 'call_booked', 'lead_won', 'coaching_ended'];
const GAVE = ['idea', 'resource', 'introduction', 'favour', 'other'];
const ASKED = ['introduction', 'referral', 'advice', 'favour', 'other'];
const COLUMN_KINDS = ['text', 'number', 'date', 'money', 'choice'];
const CONTACT_ROLES = ['sponsor', 'invoices', 'buyer', 'hr', 'participant'];
const lengthOf = (v) => [...String(v ?? '')].length;
const named = (v, min, max) => { const n = lengthOf(String(v ?? '').trim()); return n >= min && n <= max; };
const within = (v, max) => v == null || lengthOf(v) <= max;
const low = (v) => String(v ?? '').trim().toLowerCase();
const emailOk = (e) => typeof e === 'string' && e.length >= 3 && e.length <= 254 && e === e.toLowerCase() && /^[^@\s,;<>()[\]\\":]+@[^@\s,;<>()[\]\\":]+\.[^@\s,;<>()[\]\\":]+$/.test(e);
const rating = (v) => v == null || (Number.isInteger(v) && v >= 0 && v <= 10);
/** coach_email_people_ok() */
export const peopleOk = (p) => Array.isArray(p) && p.length <= 50 && p.every((e) => e && typeof e === 'object' && !Array.isArray(e) && emailOk(e.email) && lengthOf(e.name) <= 120);
/** coach_board_columns_ok() */
export const boardColumnsOk = (p) => Array.isArray(p) && p.length <= 40 && p.every((e) => e && typeof e === 'object' && !Array.isArray(e)
  && named(e.id, 1, 40) && named(e.name, 1, 60) && COLUMN_KINDS.includes(e.kind));

/**
 * 052 for one page (or one unit test): its row security, checks, triggers and functions over `store.rows`.
 * @param {{ store: object, ME: string, me: object, clock: () => Date, no: (code: string, message: string, status?: number) => never }} with
 *   `me.role` is 'owner' for the owner and 'coach' for an associate.
 * @returns {{ readable, writable, before, after, remove, fn }} `fn` holds 052's functions by name (called with their SQL arguments, in order)
 */
export function crmStandIn({ store, ME, me, clock, no }) {
  const rows = store.rows;
  for (const t of CRM_TABLES) rows[t] ||= [];
  const isOwner = () => me.role === 'owner';
  const stamp = () => clock().toISOString();
  /** _coach_today(): the coach's own day (London in the tests, as the seed's coach). */
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(clock());
  const bad = (table, what) => no('23514', `new row for relation "${table}" violates check constraint "${what}"`);
  const rls = (table) => no('42501', `new row violates row-level security policy for table "${table}"`, 403);
  const stagesOf = (coach) => rows.coach_lead_stages.filter((s) => s.coach_id === coach).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
  const boardOf = (id) => rows.coach_boards.find((b) => b.id === id) || null;
  const personOf = (id) => rows.network_people.find((p) => p.id === id) || null;
  const leadOf = (id) => rows.coach_leads.find((l) => l.id === id) || null;
  const worked = (p) => { p.focus = focusOf(p); p.due_on = dueOn(p); return p; };
  /** _network_recount() */
  const recount = (personId) => {
    const p = personOf(personId);
    if (!p) return;
    p.given_count = rows.network_gives.filter((g) => g.person_id === personId && g.direction === 'gave').length;
    p.asked_count = rows.network_gives.filter((g) => g.person_id === personId && g.direction === 'asked').length;
  };
  /** network_people_history(): one value a rating and day. */
  const history = (old, row) => {
    for (const k of RATINGS) {
      const now10 = row[k] ?? null;
      if (old ? (old[k] ?? null) === now10 : now10 == null) continue;
      const day = today();
      const at = rows.network_ratings.findIndex((r) => r.person_id === row.id && r.rating === k && r.rated_on === day);
      const line = { person_id: row.id, coach_id: row.coach_id, rating: k, rated_on: day, value: now10, created_at: stamp() };
      if (at >= 0) rows.network_ratings[at] = { ...rows.network_ratings[at], value: now10 }; else rows.network_ratings.push(line);
    }
  };
  /** coach_lead_events_contact(): a line of a contact kind moves the lead's last contact forward. */
  const contact = (event) => {
    if (!CONTACT_KINDS.includes(event.kind)) return;
    const lead = leadOf(event.lead_id);
    const day = event.happened_on || today();
    if (lead && (!lead.last_contact_on || lead.last_contact_on < day)) lead.last_contact_on = day;
  };
  const addEvent = (event) => {
    const row = { id: randomUUID(), happened_at: stamp(), happened_on: today(), title: null, detail: null, data: {}, created_at: stamp(), updated_at: stamp(), ...event };
    rows.coach_lead_events.push(row);
    contact(row);
    return row;
  };
  /** coach_leads_booked(): a booking writes its lead's first lines by itself. */
  const booked = (lead, first) => {
    if (first) addEvent({ coach_id: lead.coach_id, lead_id: lead.id, kind: 'first_contact', happened_at: new Date(clock().getTime() - 1000).toISOString(), data: { source: lead.source } });
    addEvent({ coach_id: lead.coach_id, lead_id: lead.id, kind: 'booking', data: { booking_id: lead.booking_id, call_type_key: lead.call_type_key ?? null, source: lead.source } });
  };
  // 051's booking_make() makes or finds the lead inside the database: 052's triggers then give it its stage and its lines.
  if (typeof store.fn?.booking_make === 'function' && !store.fn.booking_make.crm) {
    const make = store.fn.booking_make;
    const wrapped = (...args) => {
      const before = new Map(rows.coach_leads.map((l) => [l.id, l.booking_id ?? null]));
      const answer = make(...args);
      for (const lead of rows.coach_leads) {
        if (!lead.booking_id || before.get(lead.id) === lead.booking_id) continue;
        const first = !before.has(lead.id);
        if (first && lead.stage_id == null) lead.stage_id = stagesOf(lead.coach_id)[0]?.id ?? null;
        booked(lead, first);
      }
      return answer;
    };
    wrapped.crm = true;
    store.fn.booking_make = wrapped;
  }

  const ownerOnly = (what = 'Only the owner can do this.') => { if (!isOwner()) no('42501', what, 403); };

  /** _email_log(): kept once; on the timeline of everyone it names who is in the portal; anyone else on its To or From line waits. */
  const emailLog = (coachId, email) => {
    if (!email || typeof email !== 'object' || Array.isArray(email)) no('22023', 'That email can’t be read.');
    const source = ['copy_in', 'gmail', 'manual'].includes(email.source) ? email.source : 'manual';
    const direction = email.direction === 'in' ? 'in' : 'out';
    const external = String(email.external_id ?? '').trim().slice(0, 300) || null;
    const clean = (list) => (Array.isArray(list) ? list : []).filter((e) => e && typeof e === 'object' && emailOk(low(e.email))).slice(0, 50)
      .map((e) => ({ name: String(e.name ?? '').trim().slice(0, 120), email: low(e.email) }));
    const from = emailOk(low(email.from?.email)) ? low(email.from.email) : null;
    const to = clean(email.to);
    const cc = clean(email.cc);
    if (external) {
      const kept = rows.coach_emails.find((e) => e.coach_id === coachId && e.source === source && e.external_id === external);
      if (kept) return { email_id: kept.id, new: false, links: 0, waiting: 0 };
    }
    const sent = Number.isNaN(new Date(email.sent_at).getTime()) ? stamp() : new Date(email.sent_at).toISOString();
    const subject = String(email.subject ?? '').trim().slice(0, 300) || null;
    const body = String(email.body ?? '').slice(0, 100000);
    const id = randomUUID();
    rows.coach_emails.push({ id, coach_id: coachId, direction, from_name: String(email.from?.name ?? '').trim().slice(0, 120) || null, from_email: from, to_people: to, cc_people: cc,
      subject, snippet: String(email.snippet || email.body || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null, sent_at: sent,
      thread_key: String(email.thread_key ?? '').slice(0, 200) || null, source, external_id: external,
      link: /^https:\/\//.test(email.link || '') && String(email.link).length <= 600 ? email.link : null, hidden: false, created_at: stamp(), updated_at: stamp() });
    if (body) rows.coach_email_bodies.push({ email_id: id, coach_id: coachId, body, created_at: stamp(), updated_at: stamp() });
    const coach = store.coaches.find((c) => c.id === coachId);
    const own = [low(coach?.email), low(store.accountEmail)].filter(Boolean);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(sent));
    const seen = new Set();
    const named10 = [...(from ? [{ email: from, name: String(email.from?.name ?? '').trim() || null, main: true }] : []), ...to.map((e) => ({ ...e, main: true })), ...cc.map((e) => ({ ...e, main: false }))];
    let links = 0;
    let waiting = 0;
    const link = (kind, personId) => {
      if (rows.coach_email_links.some((l) => l.email_id === id && l.person_kind === kind && l.person_id === personId)) return false;
      rows.coach_email_links.push({ email_id: id, coach_id: coachId, person_kind: kind, person_id: personId, created_at: stamp() });
      links += 1;
      return true;
    };
    for (const who of named10) {
      if (seen.has(who.email) || own.includes(who.email) || rows.coach_email_addresses.some((k) => k.key === who.email.split('@')[0])) continue;
      seen.add(who.email);
      for (const l of rows.coach_leads.filter((x) => x.coach_id === coachId && !x.merged_into && low(x.email) === who.email)) {
        if (link('lead', l.id)) addEvent({ coach_id: coachId, lead_id: l.id, kind: 'email', happened_at: sent, happened_on: day, title: subject, data: { email_id: id, direction } });
      }
      for (const c of rows.client_profiles.filter((x) => x.coach_id === coachId && !x.merged_into && low(x.email) === who.email)) {
        if (link('client', c.id) && (!c.last_contact_on || c.last_contact_on < day)) c.last_contact_on = day;
      }
      for (const p of rows.network_people.filter((x) => x.coach_id === coachId && !x.merged_into && low(x.email) === who.email)) link('network', p.id);
      for (const oc of (rows.organisation_contacts || []).filter((x) => low(x.email) === who.email)) link('contact', oc.id);
      const known = rows.coach_leads.some((x) => x.coach_id === coachId && low(x.email) === who.email) || rows.client_profiles.some((x) => x.coach_id === coachId && low(x.email) === who.email)
        || rows.network_people.some((x) => x.coach_id === coachId && low(x.email) === who.email) || (rows.organisation_contacts || []).some((x) => low(x.email) === who.email);
      if (who.main && !known && !rows.coach_email_waiting.some((w) => w.coach_id === coachId && w.email === who.email)) {
        rows.coach_email_waiting.push({ id: randomUUID(), coach_id: coachId, email_id: id, name: who.name || null, email: who.email, status: 'waiting', lead_id: null, decided_at: null, created_at: stamp(), updated_at: stamp() });
        waiting += 1;
      }
    }
    return { email_id: id, new: true, links, waiting };
  };

  const people = () => rows.network_people.filter((p) => p.coach_id === ME);

  const fn = {
    /** coach_lead_stages_start(): the five to start, once; leads with no stage take the first. */
    coach_lead_stages_start() {
      ownerOnly();
      if (!rows.coach_lead_stages.some((s) => s.coach_id === ME)) {
        for (const s of START_STAGES) rows.coach_lead_stages.push({ id: randomUUID(), coach_id: ME, ...s, created_at: stamp(), updated_at: stamp() });
      }
      const first = stagesOf(ME)[0];
      for (const l of rows.coach_leads) if (l.coach_id === ME && l.stage_id == null) l.stage_id = first.id;
      return stagesOf(ME);
    },
    lead_merge(keepId, dropId, values = {}) {
      if (keepId === dropId) no('22023', 'Choose two different people to merge.');
      const k = leadOf(keepId);
      const d = leadOf(dropId);
      if (!k || !d || k.coach_id !== ME || d.coach_id !== ME) no('42501', 'Both leads must be yours.', 403);
      if (k.merged_into || d.merged_into) no('22023', 'One of these has already been merged.');
      const moved = { events: [], todos: [], bookings: [], emails: [], tags: [], fields: [] };
      for (const e of rows.coach_lead_events) if (e.lead_id === dropId) { e.lead_id = keepId; moved.events.push(e.id); }
      for (const t of rows.coach_todos || []) if (t.lead_id === dropId && t.coach_id === ME) { t.lead_id = keepId; moved.todos.push(t.id); }
      for (const b of rows.coach_bookings || []) if (b.lead_id === dropId && b.coach_id === ME) { b.lead_id = keepId; moved.bookings.push(b.id); }
      for (const l of rows.coach_email_links) {
        if (l.person_kind === 'lead' && l.person_id === dropId && !rows.coach_email_links.some((x) => x.email_id === l.email_id && x.person_kind === 'lead' && x.person_id === keepId)) { l.person_id = keepId; moved.emails.push(l.email_id); }
      }
      for (const l of rows.coach_tag_links || []) {
        if (l.item_kind === 'lead' && l.item_id === dropId && !rows.coach_tag_links.some((x) => x.tag_id === l.tag_id && x.item_kind === 'lead' && x.item_id === keepId)) { l.item_id = keepId; moved.tags.push(l.tag_id); }
      }
      for (const v of rows.coach_field_values || []) {
        if (v.item_id === dropId && !rows.coach_field_values.some((x) => x.field_id === v.field_id && x.item_id === keepId)) { v.item_id = keepId; moved.fields.push(v.field_id); }
      }
      const id = randomUUID();
      rows.coach_lead_merges.push({ id, coach_id: ME, kept_id: keepId, dropped_id: dropId, before: { keep: { ...k }, drop: { ...d } }, moved, merged_at: stamp(), undone_at: null });
      const has = (c) => Object.prototype.hasOwnProperty.call(values || {}, c);
      const take = (c) => (has(c) ? d[c] ?? null : k[c] ?? d[c] ?? null);
      d.merged_into = keepId;
      Object.assign(k, {
        name: has('name') ? d.name : k.name, email: take('email'), phone: take('phone'), organisation: take('organisation'),
        organisation_id: has('organisation') ? d.organisation_id ?? null : k.organisation_id ?? d.organisation_id ?? null, job_title: take('job_title'),
        notes: take('notes'), referred_by: take('referred_by'), value: take('value'),
        next_step_on: k.next_step == null ? d.next_step_on ?? null : k.next_step_on ?? null, next_step_time: k.next_step == null ? d.next_step_time ?? null : k.next_step_time ?? null,
        next_step: k.next_step ?? d.next_step ?? null, time_zone: k.time_zone ?? d.time_zone ?? null, booking_id: k.booking_id ?? d.booking_id ?? null,
        network_person_id: k.network_person_id ?? d.network_person_id ?? null, referred_by_person: k.referred_by_person ?? d.referred_by_person ?? null,
        want_outcome: k.want_outcome ?? d.want_outcome ?? null, want_pain: k.want_pain ?? d.want_pain ?? null, who_decides: k.who_decides ?? d.who_decides ?? null,
        who_funds: k.who_funds ?? d.who_funds ?? null, decide_when: k.decide_when ?? d.decide_when ?? null,
        last_contact_on: [k.last_contact_on, d.last_contact_on].filter(Boolean).sort().pop() ?? null, updated_at: stamp(),
      });
      return id;
    },
    lead_unmerge(mergeId) {
      const m = rows.coach_lead_merges.find((x) => x.id === mergeId && x.coach_id === ME && !x.undone_at);
      if (!m) no('22023', 'That merge can’t be undone any more.');
      for (const e of rows.coach_lead_events) if (m.moved.events.includes(e.id)) e.lead_id = m.dropped_id;
      for (const t of rows.coach_todos || []) if (m.moved.todos.includes(t.id)) t.lead_id = m.dropped_id;
      for (const b of rows.coach_bookings || []) if (m.moved.bookings.includes(b.id)) b.lead_id = m.dropped_id;
      for (const l of rows.coach_email_links) if (l.person_kind === 'lead' && l.person_id === m.kept_id && m.moved.emails.includes(l.email_id)) l.person_id = m.dropped_id;
      for (const l of rows.coach_tag_links || []) if (l.item_kind === 'lead' && l.item_id === m.kept_id && m.moved.tags.includes(l.tag_id)) l.item_id = m.dropped_id;
      for (const v of rows.coach_field_values || []) if (v.item_id === m.kept_id && m.moved.fields.includes(v.field_id)) v.item_id = m.dropped_id;
      const k = leadOf(m.kept_id);
      const d = leadOf(m.dropped_id);
      if (k) { for (const c of Object.keys(k)) delete k[c]; Object.assign(k, m.before.keep); }
      if (d) d.merged_into = null;
      m.undone_at = stamp();
      return null;
    },
    network_page(args = {}) {
      ownerOnly();
      return networkPage(people(), { search: args.p_search ?? '', sort: args.p_sort ?? 'name', desc: args.p_desc === true, only: args.p_only ?? {}, archived: args.p_archived === true,
        limit: args.p_limit ?? 50, offset: args.p_offset ?? 0, today: args.p_today || today() }, rows.network_columns.filter((c) => c.coach_id === ME));
    },
    network_map(args = {}) {
      ownerOnly();
      return networkMap(people(), { show: args.p_show ?? 'everyone', limit: args.p_limit ?? 150 });
    },
    network_counts(args = {}) {
      ownerOnly();
      return networkCounts(people(), args.p_today || today());
    },
    network_archive(ids = [], keep = []) {
      ownerOnly();
      if (ids.length > 5000 || keep.length > 5000) no('22023', 'That’s too many at once. Choose fewer and try again.');
      let n = 0;
      for (const p of people()) {
        if (keep.includes(p.id)) p.keep = true;
        if (ids.includes(p.id) && !p.archived_at && !p.merged_into) { p.archived_at = stamp(); n += 1; }
      }
      return n;
    },
    network_restore(ids = [], unkeep = []) {
      ownerOnly();
      if (ids.length > 5000 || unkeep.length > 5000) no('22023', 'That’s too many at once. Choose fewer and try again.');
      let n = 0;
      for (const p of people()) {
        if (unkeep.includes(p.id)) p.keep = false;
        if (ids.includes(p.id) && p.archived_at) { p.archived_at = null; n += 1; }
      }
      return n;
    },
    network_duplicates(list) {
      ownerOnly();
      if (!Array.isArray(list) || list.length > 5000) no('22023', 'That’s too many rows at once. Import up to 5,000 at a time.');
      return networkDuplicates(people(), list);
    },
    network_import(list) {
      ownerOnly();
      if (!Array.isArray(list) || list.length > 5000) no('22023', 'That’s too many rows at once. Import up to 5,000 at a time.');
      let added = 0;
      for (const raw of list) {
        // The database refuses the whole import when one rating is outside 0 to 10.
        for (const k of RATINGS) if (raw?.[k] != null && !rating(raw[k])) bad('network_people', k);
        const r = importRow(raw);
        if (!r) continue;
        const id = r.id || randomUUID();
        if (personOf(id)) continue;
        const row = worked({ archived_at: null, keep: false, snoozed_until: null, organisation_id: null, profile_id: null, merged_into: null, ...r, id, coach_id: ME,
          added_on: today(), given_count: 0, asked_count: 0, created_at: stamp(), updated_at: stamp() });
        rows.network_people.push(row);
        history(null, row);
        added += 1;
      }
      return { added };
    },
    network_merge(keepId, dropId, values = {}) {
      ownerOnly('Both people must be in your Network.');
      if (keepId === dropId) no('22023', 'Choose two different people to merge.');
      const k = personOf(keepId);
      const d = personOf(dropId);
      if (!k || !d || k.coach_id !== ME || d.coach_id !== ME) no('42501', 'Both people must be in your Network.', 403);
      if (k.merged_into || d.merged_into) no('22023', 'One of these has already been merged.');
      const moved = { gives: [], todos: [], leads: [], referred: [], emails: [] };
      for (const g of rows.network_gives) if (g.person_id === dropId) { g.person_id = keepId; moved.gives.push(g.id); }
      for (const t of rows.coach_todos || []) if (t.network_person_id === dropId && t.coach_id === ME) { t.network_person_id = keepId; moved.todos.push(t.id); }
      for (const l of rows.coach_leads) {
        if (l.coach_id !== ME) continue;
        if (l.network_person_id === dropId) { l.network_person_id = keepId; moved.leads.push(l.id); }
        if (l.referred_by_person === dropId) { l.referred_by_person = keepId; moved.referred.push(l.id); }
      }
      for (const l of rows.coach_email_links) {
        if (l.person_kind === 'network' && l.person_id === dropId && !rows.coach_email_links.some((x) => x.email_id === l.email_id && x.person_kind === 'network' && x.person_id === keepId)) { l.person_id = keepId; moved.emails.push(l.email_id); }
      }
      const id = randomUUID();
      rows.network_merges.push({ id, coach_id: ME, kept_id: keepId, dropped_id: dropId, before: { keep: { ...k }, drop: { ...d } }, moved, merged_at: stamp(), undone_at: null });
      d.merged_into = keepId;
      const was = { ...k };
      Object.assign(k, mergedPerson(k, d, values), { updated_at: stamp() });
      worked(k);
      history(was, k);
      recount(keepId);
      recount(dropId);
      return id;
    },
    network_unmerge(mergeId) {
      ownerOnly();
      const m = rows.network_merges.find((x) => x.id === mergeId && x.coach_id === ME && !x.undone_at);
      if (!m) no('22023', 'That merge can’t be undone any more.');
      for (const g of rows.network_gives) if (m.moved.gives.includes(g.id)) g.person_id = m.dropped_id;
      for (const t of rows.coach_todos || []) if (m.moved.todos.includes(t.id)) t.network_person_id = m.dropped_id;
      for (const l of rows.coach_leads) {
        if (m.moved.leads.includes(l.id)) l.network_person_id = m.dropped_id;
        if (m.moved.referred.includes(l.id)) l.referred_by_person = m.dropped_id;
      }
      for (const l of rows.coach_email_links) if (l.person_kind === 'network' && l.person_id === m.kept_id && m.moved.emails.includes(l.email_id)) l.person_id = m.dropped_id;
      const k = personOf(m.kept_id);
      const d = personOf(m.dropped_id);
      if (k) { const was = { ...k }; for (const c of Object.keys(k)) delete k[c]; Object.assign(k, m.before.keep); worked(k); history(was, k); }
      if (d) d.merged_into = null;
      recount(m.kept_id);
      recount(m.dropped_id);
      m.undone_at = stamp();
      return null;
    },
    /** coach_email_addresses_start(): the two keys, once. */
    coach_email_addresses_start() {
      ownerOnly();
      const name = String(me.display_first_name || 'coach').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'coach';
      for (const kind of ['log', 'todo']) {
        if (!rows.coach_email_addresses.some((a) => a.coach_id === ME && a.kind === kind)) {
          rows.coach_email_addresses.push({ id: randomUUID(), coach_id: ME, kind, key: `${kind}.${name}.${randomUUID().replace(/-/g, '').slice(0, 8)}`, created_at: stamp() });
        }
      }
      return rows.coach_email_addresses.filter((a) => a.coach_id === ME).sort((a, b) => a.kind.localeCompare(b.kind));
    },
    coach_email_add(email) {
      ownerOnly();
      return emailLog(ME, email);
    },
    /** email_in(): the email server's alone (a walk calls it as the server; a page is refused). */
    email_in(key, email) {
      const a = rows.coach_email_addresses.find((k) => k.key === low(key));
      if (!a || !store.coaches.some((c) => c.id === a.coach_id && c.active !== false)) return { status: 'unknown' };
      if (!email || typeof email !== 'object' || Array.isArray(email)) return { status: 'unreadable' };
      if (a.kind === 'log') return { status: 'logged', ...emailLog(a.coach_id, { ...email, source: 'copy_in' }) };
      const ref = String(email.external_id ?? '').trim().slice(0, 300) || null;
      const kept = ref ? (rows.coach_todos || []).find((t) => t.coach_id === a.coach_id && t.from_email_ref === ref) : null;
      if (kept) return { status: 'todo', todo_id: kept.id, new: false };
      const who = String(email.from?.name || '').trim();
      const title = (String(email.subject ?? '').trim() || `An email from ${who || 'someone'}`).replace(/^((fwd?|fw|re):\s*)+/i, '').trim().slice(0, 300) || 'An email';
      const sent = Number.isNaN(new Date(email.sent_at).getTime()) ? stamp() : new Date(email.sent_at).toISOString();
      const todo = { id: randomUUID(), coach_id: a.coach_id, title, notes: String(email.snippet || email.body || '').trim().slice(0, 4000) || null, important: false, checklist: [], position: 0,
        from_email_ref: ref, from_email_sender: (who || String(email.from?.email || '').trim()).slice(0, 200) || null, from_email_subject: String(email.subject ?? '').trim().slice(0, 300) || null,
        from_email_at: sent, created_at: stamp(), updated_at: stamp() };
      (rows.coach_todos ||= []).push(todo);
      return { status: 'todo', todo_id: todo.id, new: true };
    },
  };

  /** Row security's "using": what the signed-in coach may read. */
  const readable = (table, r) => {
    if (table === 'coach_lead_merges' || table === 'network_merges') return false;
    if (OWNER_ALONE.includes(table)) return isOwner() && r.coach_id === ME;
    if (table === 'coach_boards') return (isOwner() && r.coach_id === ME) || (r.shared === true && !r.archived_at);
    if (table === 'coach_board_stages' || table === 'coach_board_items') {
      const b = boardOf(r.board_id);
      return (isOwner() && r.coach_id === ME && b?.coach_id === ME) || Boolean(b && b.shared === true && !b.archived_at);
    }
    if (table === 'organisation_deals' || table === 'organisation_growth') return isOwner();
    if (table === 'coach_lead_events' || table === 'client_check_ins') return r.coach_id === ME;
    return true;
  };

  /** Row security's "with check", the tables' checks and the "before" triggers. Returns the row as it is kept. */
  const before = (table, old, row) => {
    let r = row;
    if (table === 'coach_lead_merges' || table === 'network_merges' || table === 'coach_email_addresses') no('42501', `permission denied for table ${table}`, 403);
    if (OWNER_ALONE.includes(table) && !(isOwner() && r.coach_id === ME)) rls(table);
    if ((table === 'coach_automation_runs' || table === 'coach_email_links') && old) no('42501', `permission denied for table ${table}`, 403);
    if (table === 'coach_lead_stages') {
      if (!named(r.name, 1, 40)) bad(table, 'name');
      if (!(Number.isInteger(r.likelihood ?? 0) && (r.likelihood ?? 0) >= 0 && (r.likelihood ?? 0) <= 100)) bad(table, 'likelihood');
      if (old?.is_won && !r.is_won) bad(table, 'Won is always the last stage');
      r = { likelihood: 0, position: 0, is_won: false, ...r };
      if (r.is_won) { r.position = 1000000; r.likelihood = 100; } else if (r.position >= 1000000) r.position = 999999;
      const others = rows.coach_lead_stages.filter((s) => s.coach_id === r.coach_id && s.id !== r.id);
      if (others.some((s) => low(s.name) === low(r.name))) no('23505', 'duplicate key value violates unique constraint "coach_lead_stages_one_name"', 409);
      if (r.is_won && others.some((s) => s.is_won)) no('23505', 'duplicate key value violates unique constraint "coach_lead_stages_one_won"', 409);
    }
    if (table === 'coach_leads') {
      if (!LEAD_SOURCES.includes(r.source ?? 'other')) bad(table, 'coach_leads_source_ok');
      if (![['organisation', 120], ['job_title', 120], ['phone', 40], ['next_step', 200], ['referred_by', 120], ['cold_reason', 600], ['want_outcome', 600], ['want_pain', 600],
        ['who_decides', 300], ['who_funds', 300], ['decide_when', 300]].every(([c, max]) => within(r[c], max))) bad(table, 'coach_leads_crm_lengths');
      if (r.value != null && !(Number(r.value) >= 0 && Number(r.value) <= 100000000)) bad(table, 'coach_leads_value_ok');
      if (!/^[A-Z]{3}$/.test(r.currency ?? 'GBP')) bad(table, 'coach_leads_value_ok');
      if ((r.won_at && r.cold_at) || (r.next_step_time && !r.next_step_on) || (r.merged_into && r.merged_into === r.id)) bad(table, 'coach_leads_won_or_cold');
      r = { currency: 'GBP', ...r };
      if (!old && r.stage_id == null) r.stage_id = stagesOf(r.coach_id)[0]?.id ?? null;
      if (r.stage_id != null && r.stage_id !== old?.stage_id && !rows.coach_lead_stages.some((s) => s.id === r.stage_id && s.coach_id === r.coach_id)) bad(table, 'That stage isn’t one of yours.');
      if (r.won_profile_id != null && r.won_profile_id !== old?.won_profile_id && !rows.client_profiles.some((p) => p.id === r.won_profile_id && p.coach_id === r.coach_id)) bad(table, 'That client isn’t yours.');
      for (const c of ['network_person_id', 'referred_by_person']) {
        if (r[c] != null && r[c] !== old?.[c] && !rows.network_people.some((p) => p.id === r[c] && p.coach_id === r.coach_id)) bad(table, 'That person isn’t in your Network.');
      }
      if (r.merged_into != null && r.merged_into !== old?.merged_into && !rows.coach_leads.some((l) => l.id === r.merged_into && l.coach_id === r.coach_id)) bad(table, 'That lead isn’t yours.');
    }
    if (table === 'coach_lead_events') {
      if (r.coach_id !== ME || leadOf(r.lead_id)?.coach_id !== ME) rls(table);
      if (!EVENT_KINDS.includes(r.kind)) bad(table, 'kind');
      if (!within(r.title, 300) || !within(r.detail, 4000) || (r.data != null && (typeof r.data !== 'object' || Array.isArray(r.data)))) bad(table, 'shape');
      r = { data: {}, happened_at: stamp(), ...r };
    }
    if (table === 'coach_automations') {
      if (!TRIGGERS.includes(r.trigger)) bad(table, 'trigger');
      if (!['todo', 'stage'].includes(r.action)) bad(table, 'action');
      if (r.action === 'todo' ? !(named(r.todo_title, 1, 300) && r.to_stage_id == null) : !(r.to_stage_id != null && r.todo_title == null && r.todo_days == null)) bad(table, 'the only two actions');
      if (r.todo_days != null && !(Number.isInteger(r.todo_days) && r.todo_days >= -30 && r.todo_days <= 365)) bad(table, 'todo_days');
      if (r.trigger_count != null && !(Number.isInteger(r.trigger_count) && r.trigger_count >= 1 && r.trigger_count <= 365)) bad(table, 'trigger_count');
      if ((r.trigger === 'lead_stage') !== (r.trigger_stage_id != null)) bad(table, 'a stage trigger names its stage');
      if (r.action === 'stage' && r.trigger === 'lead_stage' && r.to_stage_id === r.trigger_stage_id) bad(table, 'a move can’t point at the stage that sets it off');
      for (const c of ['trigger_stage_id', 'to_stage_id']) {
        if (r[c] != null && !rows.coach_lead_stages.some((s) => s.id === r[c] && s.coach_id === r.coach_id)) bad(table, 'That stage isn’t one of yours.');
      }
      r = { active: true, position: 0, ...r };
    }
    if (table === 'coach_automation_runs') {
      if (!rows.coach_automations.some((a) => a.id === r.automation_id && a.coach_id === ME)) rls(table);
      if (!named(r.event_key, 1, 200)) bad(table, 'event_key');
      if (rows.coach_automation_runs.some((x) => x.automation_id === r.automation_id && x.event_key === r.event_key && x.id !== r.id)) no('23505', 'duplicate key value violates unique constraint "coach_automation_runs_once"', 409);
      r = { ran_at: stamp(), ...r };
    }
    if (table === 'coach_boards') {
      if (!(isOwner() && r.coach_id === ME)) rls(table);
      if (!named(r.name, 1, 60)) bad(table, 'name');
      if (!boardColumnsOk(r.columns ?? [])) bad(table, 'columns');
      if (!r.archived_at && rows.coach_boards.some((b) => b.coach_id === r.coach_id && b.id !== r.id && !b.archived_at && low(b.name) === low(r.name))) no('23505', 'duplicate key value violates unique constraint "coach_boards_one_name"', 409);
      r = { columns: [], shared: false, position: 0, archived_at: null, ...r };
    }
    if (table === 'coach_board_stages' || table === 'coach_board_items') {
      if (!(isOwner() && r.coach_id === ME && boardOf(r.board_id)?.coach_id === ME)) rls(table);
      if (table === 'coach_board_stages' && !named(r.name, 1, 40)) bad(table, 'name');
      if (table === 'coach_board_items') {
        if (!named(r.title, 1, 200) || !within(r.notes, 6000)) bad(table, 'title');
        if (r.field_values != null && (typeof r.field_values !== 'object' || Array.isArray(r.field_values))) bad(table, 'field_values');
        if (r.stage_id != null && !rows.coach_board_stages.some((s) => s.id === r.stage_id && s.board_id === r.board_id)) bad(table, 'That stage isn’t on this board.');
        r = { field_values: {}, position: 0, ...r };
      }
    }
    if (table === 'coach_emails') {
      if (!['in', 'out'].includes(r.direction ?? 'out') || !['copy_in', 'gmail', 'manual'].includes(r.source ?? 'manual')) bad(table, 'direction or source');
      if (!peopleOk(r.to_people ?? []) || !peopleOk(r.cc_people ?? []) || (r.from_email != null && !emailOk(r.from_email))) bad(table, 'people');
      if (!within(r.subject, 300) || !within(r.snippet, 300) || (r.link != null && !(/^https:\/\//.test(r.link) && r.link.length <= 600))) bad(table, 'shape');
      if (r.external_id != null && rows.coach_emails.some((e) => e.coach_id === r.coach_id && e.source === (r.source ?? 'manual') && e.external_id === r.external_id && e.id !== r.id)) no('23505', 'duplicate key value violates unique constraint "coach_emails_once"', 409);
      r = { direction: 'out', source: 'manual', to_people: [], cc_people: [], hidden: false, sent_at: stamp(), ...r };
    }
    if (table === 'coach_email_bodies' || table === 'coach_email_links') {
      if (!rows.coach_emails.some((e) => e.id === r.email_id && e.coach_id === ME)) rls(table);
      if (table === 'coach_email_links' && !['lead', 'client', 'network', 'contact'].includes(r.person_kind)) bad(table, 'person_kind');
    }
    if (table === 'coach_email_waiting') {
      if (!emailOk(r.email) || !['waiting', 'added', 'dismissed'].includes(r.status ?? 'waiting')) bad(table, 'email or status');
      if (rows.coach_email_waiting.some((w) => w.coach_id === r.coach_id && w.email === r.email && w.id !== r.id)) no('23505', 'duplicate key value violates unique constraint "coach_email_waiting_once"', 409);
      r = { status: 'waiting', ...r };
    }
    if (table === 'client_check_ins') {
      if (r.coach_id !== ME || rows.client_profiles.find((p) => p.id === r.profile_id)?.coach_id !== ME) rls(table);
      if (![3, 6, 12].includes(r.months) || !r.due_on || (r.done_at && r.skipped_at) || (r.ask != null && !['referral', 'testimonial'].includes(r.ask)) || !within(r.note, 4000)) bad(table, 'shape');
      if (rows.client_check_ins.some((c) => c.profile_id === r.profile_id && c.months === r.months && c.id !== r.id)) no('23505', 'duplicate key value violates unique constraint "client_check_ins_profile_id_months_key"', 409);
    }
    if (table === 'organisation_deals' || table === 'organisation_growth') {
      if (!isOwner()) rls(table);
      if (table === 'organisation_deals') {
        if (!named(r.name, 1, 200) || !['agreement', 'proposal'].includes(r.kind ?? 'agreement') || !['draft', 'sent', 'active', 'ended', 'lost'].includes(r.status ?? 'draft')
          || !['once', 'month', 'year'].includes(r.per ?? 'once') || (r.value != null && !(Number(r.value) >= 0 && Number(r.value) <= 100000000)) || !within(r.detail, 240)) bad(table, 'shape');
        r = { kind: 'agreement', status: 'draft', currency: 'GBP', per: 'once', opens: 0, ...r };
      } else {
        if (!named(r.title, 1, 200) || !['workshop', 'seats', 'renewal', 'other'].includes(r.kind ?? 'other') || !['open', 'raised', 'won', 'dropped'].includes(r.status ?? 'open') || !within(r.note, 600)) bad(table, 'shape');
        r = { kind: 'other', status: 'open', ...r };
      }
    }
    if (table === 'organisation_contacts') {
      if (!(Array.isArray(r.roles ?? []) && (r.roles ?? []).every((x) => CONTACT_ROLES.includes(x)))) bad(table, 'organisation_contacts_roles_ok');
    }
    if (table === 'network_people') {
      if (!named(r.name, 1, 120) || !RATINGS.every((k) => rating(r[k] ?? null))) bad(table, 'name or rating');
      if (r.rhythm_months != null && !(Number.isInteger(r.rhythm_months) && r.rhythm_months >= 1 && r.rhythm_months <= 24)) bad(table, 'rhythm_months');
      if (!within(r.organisation, 120) || !within(r.role, 80) || !within(r.phone, 40) || !within(r.notes, 6000) || (r.email != null && !emailOk(r.email))) bad(table, 'shape');
      if (r.own != null && (typeof r.own !== 'object' || Array.isArray(r.own))) bad(table, 'own');
      if (r.merged_into && r.merged_into === r.id) bad(table, 'merged_into');
      // network_people_guard(): the two counts are the database's.
      r = worked({ own: {}, keep: false, archived_at: null, added_on: today(), ...r, given_count: old?.given_count ?? 0, asked_count: old?.asked_count ?? 0 });
    }
    if (table === 'network_ratings' || table === 'network_gives') {
      if (personOf(r.person_id)?.coach_id !== ME) rls(table);
      if (table === 'network_ratings' && (!RATINGS.includes(r.rating) || !rating(r.value ?? null))) bad(table, 'rating');
      if (table === 'network_gives') {
        if (!['gave', 'asked'].includes(r.direction) || !(r.direction === 'gave' ? GAVE : ASKED).includes(r.kind) || !within(r.note, 600)) bad(table, 'direction or kind');
        r = { happened_on: today(), ...r };
      }
    }
    if (table === 'network_columns') {
      if (!named(r.name, 1, 60) || !['text', 'number', 'date', 'choice'].includes(r.kind ?? 'text') || !within(r.note, 120)) bad(table, 'shape');
      if (rows.network_columns.some((c) => c.coach_id === r.coach_id && c.id !== r.id && low(c.name) === low(r.name))) no('23505', 'duplicate key value violates unique constraint "network_columns_one_name"', 409);
      r = { kind: 'text', options: [], position: 0, hidden: false, ...r };
    }
    return r;
  };

  /** The "after" triggers. */
  const after = (table, old, row) => {
    if (table === 'coach_lead_events' && !old) contact(row);
    if (table === 'network_people') history(old, row);
    if (table === 'network_gives') { if (old && old.person_id !== row.person_id) recount(old.person_id); recount(row.person_id); }
  };

  /** A delete: the links that hold a row where it is (23503), then what goes with it. Returns the rows removed. */
  const remove = (table, list, { cascadeOnly = false } = {}) => {
    const gone = [];
    for (const r of list) {
      if (table === 'coach_lead_merges' || table === 'network_merges' || table === 'coach_email_addresses') no('42501', `permission denied for table ${table}`, 403);
      if (OWNER_ALONE.includes(table) && !(isOwner() && r.coach_id === ME)) continue;
      if ((table === 'coach_boards' || table === 'coach_board_stages' || table === 'coach_board_items' || table === 'organisation_deals' || table === 'organisation_growth') && !(isOwner())) continue;
      if (table === 'coach_lead_stages') {
        if (r.is_won) bad(table, 'Won is always the last stage, because it makes the lead a client.');
        if (rows.coach_leads.some((l) => l.stage_id === r.id)) no('23503', 'update or delete on table "coach_lead_stages" violates foreign key constraint "coach_leads_stage_id_fkey" on table "coach_leads"', 409);
        rows.coach_automations = rows.coach_automations.filter((a) => a.trigger_stage_id !== r.id && a.to_stage_id !== r.id);
      }
      if (table === 'coach_board_stages' && rows.coach_board_items.some((i) => i.stage_id === r.id)) no('23503', 'update or delete on table "coach_board_stages" violates foreign key constraint "coach_board_items_stage_id_fkey" on table "coach_board_items"', 409);
      if (table === 'coach_boards') {
        rows.coach_board_items = rows.coach_board_items.filter((i) => i.board_id !== r.id);
        rows.coach_board_stages = rows.coach_board_stages.filter((s) => s.board_id !== r.id);
      }
      if (table === 'coach_leads') {
        rows.coach_lead_events = rows.coach_lead_events.filter((e) => e.lead_id !== r.id);
        rows.coach_automation_runs = rows.coach_automation_runs.filter((x) => x.lead_id !== r.id);
        for (const w of rows.coach_email_waiting) if (w.lead_id === r.id) w.lead_id = null;
        for (const d of rows.organisation_deals) if (d.lead_id === r.id) d.lead_id = null;
        for (const g of rows.organisation_growth) if (g.lead_id === r.id) g.lead_id = null;
      }
      if (table === 'coach_automations') rows.coach_automation_runs = rows.coach_automation_runs.filter((x) => x.automation_id !== r.id);
      if (table === 'coach_emails') {
        rows.coach_email_bodies = rows.coach_email_bodies.filter((b) => b.email_id !== r.id);
        rows.coach_email_links = rows.coach_email_links.filter((l) => l.email_id !== r.id);
        for (const w of rows.coach_email_waiting) if (w.email_id === r.id) w.email_id = null;
      }
      if (table === 'network_people') {
        rows.network_gives = rows.network_gives.filter((g) => g.person_id !== r.id);
        rows.network_ratings = rows.network_ratings.filter((x) => x.person_id !== r.id);
        for (const l of rows.coach_leads) { if (l.network_person_id === r.id) l.network_person_id = null; if (l.referred_by_person === r.id) l.referred_by_person = null; }
        for (const p of rows.network_people) if (p.merged_into === r.id) p.merged_into = null;
      }
      if (!cascadeOnly) rows[table] = rows[table].filter((x) => x !== r);
      if (table === 'network_gives') recount(r.person_id);
      gone.push(r);
    }
    return gone;
  };

  /** What the signed-in coach may change or delete (a shared board is read only for an associate). */
  const writable = (table, r) => {
    if (table === 'coach_boards') return isOwner() && r.coach_id === ME;
    if (table === 'coach_board_stages' || table === 'coach_board_items') return isOwner() && r.coach_id === ME;
    return readable(table, r);
  };

  // A seed's people arrive as plain rows: the worked-out columns and the counts are filled in as the database would have.
  for (const p of rows.network_people) { worked(p); recount(p.id); }

  return { readable, writable, before, after, remove, fn };
}
