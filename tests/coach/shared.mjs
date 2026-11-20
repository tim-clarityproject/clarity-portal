// Shared by the coach portal's browser tests (Phase 6a run 1).
//
// They sign in as the test project's coach account and then decide, with
// stand-ins, what the page is told about two things the test project
// can't yet give:
//   - who the coach is: the owner or an associate (the test account's own
//     row there is an associate's, and Tim alone changes that database);
//   - migration 049's tables: not there yet (the app keeps everything on
//     the device, as it will until Tim runs 049), or there (a small
//     stand-in that answers as the database's API does: read, add, change,
//     remove, and the checked functions the pages call).
// Who may read what in the real database is proved by the SQL test
// (supabase/049_coach_portal_foundation_test.sql), never by these stand-ins.
//
//   - migration 050's tables (the coaching day; the functionality tester,
//     20 Nov): with `day: true` the stand-in also holds the coach's to-dos,
//     days, weeks and sessions and answers 050's functions and triggers as
//     the SQL does (supabase/migrations/050_coach_day.sql): sessions left
//     kept from the sessions that count, a sent recap locked, a recap sent
//     once and its email claimed once, capacity, the workshop follow-up
//     claimed once, and what the client's own functions return.
//
// No test here sends an email or a message: every /api/ call is answered
// with a stand-in, and nothing is ever written to the test project.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const APP = (process.env.APP_URL || 'http://localhost:4317').replace(/\/$/, '');
const TEST_REF = 'gqtqljngeenqzxneucoc';

export function readEnv() {
  const out = {};
  for (const line of readFileSync(join(homedir(), '.clarity-test-accounts.env'), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  if (!String(out.TEST_SUPABASE_URL || '').includes(TEST_REF)) throw new Error('These tests only ever run on the test project.');
  return out;
}

export const SIZES = { 1440: { width: 1440, height: 900 }, 768: { width: 768, height: 1024 }, 400: { width: 400, height: 860 } };

// ---------------------------------------------------------------- a report
export function makeReport(name) {
  let passed = 0;
  const failed = [];
  return {
    pass(what, ok, detail = '') {
      if (ok) { passed += 1; return true; }
      failed.push(`${what}${detail ? `: ${detail}` : ''}`);
      console.log(`  FAILED ${what}${detail ? `: ${detail}` : ''}`);
      return false;
    },
    done() {
      console.log(`\n${name}: ${passed} passed, ${failed.length} failed.`);
      if (failed.length) { console.log(failed.map((f) => `  - ${f}`).join('\n')); process.exitCode = 1; }
      return failed.length === 0;
    },
  };
}

// ---------------------------------------------------------------- signing in
const STATE_DIR = join(tmpdir(), 'clarity-coach-tests');

/** A signed-in browser context for the test coach (the session is kept in the system's temporary folder, never printed). */
export async function coachContext(browser, { size = 1440, theme = 'dark', fresh = false, reducedMotion = 'reduce' } = {}) {
  mkdirSync(STATE_DIR, { recursive: true });
  const file = join(STATE_DIR, 'coach-owner.json');
  const opts = { viewport: SIZES[size] || size, colorScheme: theme, serviceWorkers: 'block', reducedMotion, hasTouch: size === 400 };
  if (!fresh && existsSync(file)) return browser.newContext({ ...opts, storageState: file });
  const env = readEnv();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
  await page.goto(`${APP}/coach/sign-in`);
  await page.getByLabel('Email').fill(env.TEST_COACH_OWNER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(env.TEST_COACH_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !/sign-in/.test(u.pathname), { timeout: 30000 });
  await page.waitForTimeout(1200);
  await ctx.storageState({ path: file });
  await page.close();
  return ctx;
}

/** The signed-in account's id, read from the page's own session. */
export async function accountId(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === 'clarity-portal-auth' || /^sb-.*-auth-token$/.test(k)) { try { const v = JSON.parse(localStorage.getItem(k)); const id = v?.user?.id || v?.currentSession?.user?.id; if (id) return id; } catch { /* next */ } }
    }
    return null;
  });
}

// ---------------------------------------------------------------- the stand-ins
export const ME = '11111111-1111-4111-8111-111111111111'; // the signed-in coach's row
export const OTHER = '22222222-2222-4222-8222-222222222222'; // the other coach's row

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-expose-headers': 'content-range' } });
const refused = (route, code, message, status = 403) => json(route, { code, message, details: null, hint: null }, status);

const KEYS = {
  coach_settings: ['coach_id'], coach_profiles: ['coach_id'], client_about: ['profile_id', 'coach_id'],
  coach_tag_links: ['tag_id', 'item_kind', 'item_id'], coach_field_values: ['field_id', 'item_id'],
  // The coaching day (050), as src/lib/coach/store.js TABLES has them.
  coach_days: ['coach_id', 'day'], coach_weeks: ['coach_id', 'week_start'], coach_session_people: ['session_id', 'profile_id'], coach_session_notes: ['session_id'],
};
const TABLES = ['organisations', 'coach_settings', 'coach_profiles', 'coach_away', 'client_profiles', 'client_about', 'client_notes', 'client_files', 'client_view_requests',
  'coach_tags', 'coach_tag_links', 'coach_fields', 'coach_field_values', 'coach_views', 'organisation_contacts', 'organisation_documents', 'coach_groups',
  'coach_group_members', 'engagements', 'engagement_packs', 'engagement_projects', 'time_entries', 'workshops', 'workshop_attendees', 'workshop_materials',
  'workshop_survey_answers', 'coach_cover', 'data_requests', 'coach_notifications', 'activity_log'];
// Migration 050's tables (the coaching day), held only when the stand-in is asked for them (`day: true`).
const DAY_TABLES = ['coach_todo_lists', 'coach_todo_headings', 'coach_todos', 'coach_days', 'coach_weeks', 'coach_sessions', 'coach_session_people',
  'coach_session_actions', 'coach_session_notes', 'workshop_sends'];

/** A refusal as the database's API words it: a code, a message and the HTTP status. */
class Refusal extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const no = (code, message, status) => { throw new Refusal(code, message, status); };
const lengthOf = (v) => [...String(v ?? '')].length;
const between = (v, min, max) => { const n = lengthOf(String(v ?? '').trim()); return n >= min && n <= max; };

/** 050's checks on a row, as its tables state them (a broken one is refused with 23514, as Postgres does). */
function dayChecks(table, r) {
  const bad = (what) => no('23514', `new row for relation "${table}" violates check constraint "${what}"`);
  if (table === 'coach_todo_lists' || table === 'coach_todo_headings') { if (!between(r.name, 1, 80)) bad('name'); }
  if (table === 'coach_todos') {
    if (!between(r.title, 1, 300)) bad('title');
    if (r.notes != null && lengthOf(r.notes) > 4000) bad('notes');
    if (r.minutes != null && !(Number.isInteger(r.minutes) && r.minutes >= 15 && r.minutes <= 480 && r.minutes % 15 === 0)) bad('minutes');
    if (r.planned_time != null && r.planned_on == null) bad('planned_time needs planned_on');
    if (r.someday && r.planned_on != null) bad('someday with a day');
    if (r.repeat_rule != null && !(typeof r.repeat_rule === 'object' && !Array.isArray(r.repeat_rule) && ['day', 'weekday', 'week', 'month', 'year'].includes(r.repeat_rule.every)
      && (!('interval' in r.repeat_rule) || (Number.isInteger(r.repeat_rule.interval) && r.repeat_rule.interval >= 1 && r.repeat_rule.interval <= 52)))) bad('repeat_rule');
    if (!(Array.isArray(r.checklist ?? []) && (r.checklist ?? []).length <= 50 && (r.checklist ?? []).every((i) => i && typeof i === 'object' && typeof i.text === 'string' && between(i.text, 1, 200) && ['boolean', 'undefined'].includes(typeof i.done)))) bad('checklist');
    if (lengthOf(r.from_email_sender) > 200 || lengthOf(r.from_email_subject) > 300) bad('from_email');
  }
  if (table === 'coach_days') {
    if (!Array.isArray(r.plan_todos ?? []) || (r.plan_todos ?? []).length > 500) bad('plan_todos');
    if (!(r.shutdown == null || (typeof r.shutdown === 'object' && !Array.isArray(r.shutdown)))) bad('shutdown');
  }
  if (table === 'coach_weeks') {
    if (new Date(`${r.week_start}T12:00:00Z`).getUTCDay() !== 1) bad('week_start is a Monday');
    if (r.energy != null && !['poor', 'fair', 'good', 'very_good', 'excellent'].includes(r.energy)) bad('energy');
    if (!(r.review == null || (typeof r.review === 'object' && !Array.isArray(r.review)))) bad('review');
  }
  if (table === 'coach_sessions') {
    if (!['coaching', 'group', 'three_way', 'review', 'chemistry', 'other'].includes(r.kind ?? 'coaching')) bad('kind');
    if (![30, 60, 90].includes(r.minutes ?? 60)) bad('minutes');
    if (r.outcome != null && !['held', 'late_cancel', 'no_show', 'moved'].includes(r.outcome)) bad('outcome');
    if ((r.profile_id != null) === (r.group_id != null)) bad('a client or a group');
    if (r.waived && r.outcome !== 'late_cancel') bad('waived only when cancelled late');
    if (r.moved_to != null && r.outcome !== 'moved') bad('moved_to only when moved');
    if (lengthOf(r.recap) > 12000 || lengthOf(r.place) > 120) bad('length');
    if (!r.starts_at) no('23502', 'null value in column "starts_at" of relation "coach_sessions" violates not-null constraint');
  }
  if (table === 'coach_session_actions') {
    if (!between(r.title, 1, 300)) bad('title');
    if (!['week', 'backlog'].includes(r.goes_to ?? 'week')) bad('goes_to');
  }
  if (table === 'coach_session_notes') { for (const c of ['focus', 'insight', 'next_time', 'supervision']) if (lengthOf(r[c]) > 6000) bad(c); }
}

/**
 * Puts the stand-ins in front of a page.
 * @param {{ role: 'owner'|'associate', db: 'none'|'there', rows?: object, admin?: object[], day?: boolean, strict?: boolean, now?: () => Date }} opts
 *   `day` (with db 'there'): migration 050 is there too: its tables are held and its functions and triggers answered as the SQL does.
 *   `strict` (with db 'there'): nothing but a read ever reaches the test project: a function the stand-in doesn't know is answered
 *     with nothing (listed as `rpc name (not run)`), and a write to any other table is stopped and listed as `blocked …`.
 *   `now`: the database's clock (a walk that pins the page's clock hands the same time in).
 *   `page` may be a browser context: every tab in it is then answered by the one stand-in.
 * @returns the stand-in database ({ rows, calls, coaches, sends, claims, fn, api, withheld, leak })
 */
export async function standIn(page, { role = 'owner', db = 'none', rows = {}, admin = [], day = false, strict = false, now: clock = () => new Date() } = {}) {
  const me = { id: ME, user_id: null, role: role === 'owner' ? 'owner' : 'coach', display_first_name: role === 'owner' ? 'Alex' : 'Maya', full_name: role === 'owner' ? 'Alex Morgan' : 'Maya Collins', email: null, mobile: null, contact_ways: ['email'], active: true, capacity_hours_week: 15, hourly_rate: role === 'owner' ? null : 100, rate_currency: 'GBP' };
  const other = { id: OTHER, user_id: randomUUID(), role: role === 'owner' ? 'coach' : 'owner', display_first_name: role === 'owner' ? 'Maya' : 'Alex', full_name: role === 'owner' ? 'Maya Collins' : 'Alex Morgan', email: null, mobile: null, contact_ways: ['email'], active: true, capacity_hours_week: 15, hourly_rate: role === 'owner' ? 100 : null, rate_currency: 'GBP' };
  const held = db === 'there' && day ? [...TABLES, ...DAY_TABLES] : TABLES;
  const store = { rows: Object.fromEntries(held.map((t) => [t, [...(rows[t] || [])]])), calls: [], coaches: [me, other], down: false, sends: [], claims: [], api: { live: false, asked: [] }, withheld: 0, leak: false };
  const keyOf = (table, row) => (KEYS[table] || ['id']).map((c) => row[c]).join('|');
  const stamp = () => clock().toISOString();

  // ---- 050, as its SQL: what counts, sessions left, the locks, and its functions.
  /** session_counts(): it went ahead, a no-show, or cancelled late and not waived. A moved one never counts. */
  const counts = (s) => Boolean(s) && (s.outcome === 'held' || s.outcome === 'no_show' || (s.outcome === 'late_cancel' && !s.waived));
  /** _engagement_recorded(): the engagement's own sessions that count, and a group session's own-engagement members. */
  const recorded = (engagementId) => store.rows.coach_sessions.filter((s) => s.engagement_id === engagementId && counts(s)).length
    + store.rows.coach_session_people.filter((sp) => sp.engagement_id === engagementId && counts(store.rows.coach_sessions.find((s) => s.id === sp.session_id))).length;
  /** _engagement_recount(): sessions_held is the base plus every recorded session that counts. */
  const recount = (engagementId) => {
    const e = engagementId && store.rows.engagements.find((x) => x.id === engagementId);
    if (e) e.sessions_held = Math.min(1000, Math.max(0, (Number(e.sessions_held_base) || 0) + recorded(e.id)));
  };
  const sessionOf = (id) => store.rows.coach_sessions.find((s) => s.id === id) || null;
  if (db === 'there' && day) {
    // The migration copies sessions_held into sessions_held_base once; a seed's sessions then count on top, as they would from that day on.
    for (const e of store.rows.engagements) { if (e.sessions_held_base == null) e.sessions_held_base = Number(e.sessions_held) || 0; }
    for (const e of store.rows.engagements) recount(e.id);
    for (const s of store.rows.coach_settings) if (s.hidden_help == null) s.hidden_help = {};
  }
  /** Row security's "with check" for 050's tables: the coach's own rows, for their own session. */
  const mine = (table, r) => {
    if (table === 'workshop_sends') no('42501', 'permission denied for table workshop_sends', 403);
    if (table === 'coach_session_people') { if (sessionOf(r.session_id)?.coach_id !== ME) no('42501', 'new row violates row-level security policy for table "coach_session_people"', 403); return; }
    if (r.coach_id !== ME) no('42501', `new row violates row-level security policy for table "${table}"`, 403);
    if ((table === 'coach_session_actions' || table === 'coach_session_notes') && sessionOf(r.session_id)?.coach_id !== ME) no('42501', `new row violates row-level security policy for table "${table}"`, 403);
  };
  /** 050's foreign keys: a row can only point at a row that is there (23503 otherwise), so parents must arrive before their parts. */
  const FKS = {
    coach_todo_lists: [['profile_id', 'client_profiles'], ['organisation_id', 'organisations']],
    coach_todo_headings: [['list_id', 'coach_todo_lists']],
    coach_todos: [['list_id', 'coach_todo_lists'], ['heading_id', 'coach_todo_headings'], ['profile_id', 'client_profiles']],
    coach_sessions: [['profile_id', 'client_profiles'], ['group_id', 'coach_groups'], ['engagement_id', 'engagements']],
    coach_session_people: [['session_id', 'coach_sessions'], ['profile_id', 'client_profiles'], ['engagement_id', 'engagements']],
    coach_session_actions: [['session_id', 'coach_sessions']],
    coach_session_notes: [['session_id', 'coach_sessions']],
  };
  const points = (table, r) => {
    for (const [column, parent] of FKS[table] || []) {
      if (r[column] != null && !store.rows[parent].some((x) => x.id === r[column])) no('23503', `insert or update on table "${table}" violates foreign key constraint "${table}_${column}_fkey"`, 409);
    }
  };
  /** The "before" triggers: what a row becomes as it is added (old is null) or changed. */
  const before = (table, old, next) => {
    if (table === 'engagements') { // engagements_held_guard
      if (!old) return { ...next, sessions_held_base: next.sessions_held_base != null ? Number(next.sessions_held_base) : (Number(next.sessions_held) || 0) };
      if ((next.sessions_held ?? null) !== (old.sessions_held ?? null)) return { ...next, sessions_held_base: (Number(next.sessions_held) || 0) - recorded(old.id) };
      return { ...next, sessions_held_base: old.sessions_held_base };
    }
    if (table === 'coach_sessions') { // coach_sessions_guard
      if (!old) return { ...next, recap_sent_at: null, recap_sent_by: null, recap_emailed_at: null };
      const kept = { ...next, coach_id: old.coach_id, recap_sent_at: old.recap_sent_at ?? null, recap_sent_by: old.recap_sent_by ?? null, recap_emailed_at: old.recap_emailed_at ?? null };
      if (old.recap_sent_at) for (const c of ['recap', 'outcome', 'waived', 'moved_to', 'starts_at', 'profile_id', 'group_id']) kept[c] = old[c] ?? null;
      return kept;
    }
    if (table === 'coach_session_actions') { // coach_session_actions_guard
      if (!sessionOf(next.session_id)?.recap_sent_at) return next;
      if (!old) return { ...next, send: false };
      return { ...next, session_id: old.session_id, title: old.title, send: old.send, goes_to: old.goes_to };
    }
    return next;
  };
  /** The "after" triggers: sessions left follows the sessions. */
  const after = (table, old, next) => {
    if (table === 'coach_sessions') {
      if (old) recount(old.engagement_id);
      if (next) { recount(next.engagement_id); for (const sp of store.rows.coach_session_people.filter((x) => x.session_id === next.id)) recount(sp.engagement_id); }
    }
    if (table === 'coach_session_people') { if (old) recount(old.engagement_id); if (next) recount(next.engagement_id); }
  };
  /** A delete, as row security and the foreign keys leave it: resolves the rows that went. */
  const removeRows = (table, hit) => {
    let gone = hit;
    if (table === 'coach_sessions') gone = hit.filter((s) => !s.recap_sent_at); // "Sessions: remove unsent"
    if (table === 'coach_session_actions') for (const a of gone) if (a.send && sessionOf(a.session_id)?.recap_sent_at) no('22023', 'This action went with the recap, so it stays.');
    if (table === 'workshop_sends') no('42501', 'permission denied for table workshop_sends', 403);
    store.rows[table] = store.rows[table].filter((r) => !gone.includes(r));
    if (!day) return gone;
    for (const r of gone) {
      if (table === 'coach_sessions') {
        const people = store.rows.coach_session_people.filter((x) => x.session_id === r.id);
        for (const t of ['coach_session_people', 'coach_session_actions', 'coach_session_notes']) store.rows[t] = store.rows[t].filter((x) => x.session_id !== r.id);
        after('coach_sessions', r, null);
        for (const sp of people) recount(sp.engagement_id);
      }
      if (table === 'coach_session_people') after(table, r, null);
      if (table === 'coach_todo_lists') {
        store.rows.coach_todo_headings = store.rows.coach_todo_headings.filter((h) => h.list_id !== r.id);
        for (const t of store.rows.coach_todos) if (t.list_id === r.id) { t.list_id = null; t.heading_id = null; }
      }
      if (table === 'coach_todo_headings') for (const t of store.rows.coach_todos) if (t.heading_id === r.id) t.heading_id = null;
    }
    return gone;
  };

  // The functions, as their SQL. `uid` is the account asking (auth.uid()).
  const myProfiles = (uid) => store.rows.client_profiles.filter((p) => uid && p.user_id === uid && !p.merged_into);
  const firstNameOf = (coachId) => store.coaches.find((c) => c.id === coachId)?.display_first_name ?? null;
  store.fn = {
    /** session_send_recap(p_session): only its coach, only once, only a session that went ahead with something typed. */
    session_send_recap(uid, id) {
      const s = sessionOf(id);
      if (!s || s.coach_id !== ME) no('42501', 'That session isn’t yours.', 403);
      if (s.recap_sent_at) return 'already_sent';
      if (s.outcome !== 'held') no('22023', 'A recap goes only for a session that went ahead.');
      if (!String(s.recap ?? '').trim()) no('22023', 'Type the recap first.');
      Object.assign(s, { recap_sent_at: stamp(), recap_sent_by: uid, updated_at: stamp() });
      return 'sent';
    },
    /** session_recap_email_claim(p_session): true the first time for a sent recap, false ever after. */
    session_recap_email_claim(uid, id) {
      const s = sessionOf(id);
      const first = Boolean(s && s.coach_id === ME && s.recap_sent_at && !s.recap_emailed_at);
      if (first) s.recap_emailed_at = stamp();
      store.claims.push({ session: id, first });
      return first;
    },
    /** session_recap_people(p_session): each person a sent recap goes to who has an email. */
    session_recap_people(uid, id) {
      const s = sessionOf(id);
      if (!s || !s.recap_sent_at || s.coach_id !== ME) return [];
      const out = [];
      const p = store.rows.client_profiles.find((x) => x.id === s.profile_id);
      if (p?.email) out.push({ name: p.name, email: p.email });
      for (const m of store.rows.coach_group_members.filter((x) => s.group_id && x.group_id === s.group_id)) {
        const email = m.email ?? store.rows.client_profiles.find((x) => x.id === m.profile_id)?.email ?? null;
        if (email && !out.some((o) => o.name === m.name && o.email === email)) out.push({ name: m.name, email });
      }
      return out;
    },
    /** coach_save_capacity(p_hours): 1 to 80, in halves, on the coach's own row. */
    coach_save_capacity(uid, hours) {
      if (hours == null || typeof hours !== 'number' || hours < 1 || hours > 80 || hours * 2 !== Math.trunc(hours * 2)) no('22023', 'Type a number of hours from 1 to 80.');
      me.capacity_hours_week = hours;
    },
    /** workshop_follow_up_claim(p_workshop): the coach's own, after it has started, once: who it goes to, or nothing the second time. */
    workshop_follow_up_claim(uid, id) {
      const w = store.rows.workshops.find((x) => x.id === id);
      if (!w || w.coach_id !== ME) no('42501', 'That workshop isn’t yours.', 403);
      if (!w.starts_at || new Date(w.starts_at) > clock()) no('22023', 'The follow-up goes after the workshop has started.');
      const to = store.rows.workshop_attendees.filter((a) => a.workshop_id === id && a.status === 'registered' && a.email);
      if (store.rows.workshop_sends.some((x) => x.workshop_id === id && x.kind === 'follow_up')) return [];
      store.rows.workshop_sends.push({ id: randomUUID(), workshop_id: id, kind: 'follow_up', sent_at: stamp(), people: to.length, sent_by: uid });
      if (w.survey_on) {
        if (!store.rows.workshop_sends.some((x) => x.workshop_id === id && x.kind === 'survey')) store.rows.workshop_sends.push({ id: randomUUID(), workshop_id: id, kind: 'survey', sent_at: stamp(), people: to.length, sent_by: uid });
        if (!w.survey_sent_on) w.survey_sent_on = stamp().slice(0, 10);
      }
      return to.map((a) => ({ kind: w.survey_on ? 'follow_up_survey' : 'follow_up', attendee_name: a.name, attendee_email: a.email, survey_key: a.survey_key ?? null }));
    },
    /** my_session_recaps(): the signed-in client's sent recaps, newest first, each with the actions ticked to send. */
    my_session_recaps(uid) {
      const own = new Set(myProfiles(uid).map((p) => p.id));
      const groups = new Set(store.rows.coach_group_members.filter((m) => own.has(m.profile_id)).map((m) => m.group_id));
      return store.rows.coach_sessions
        .filter((s) => s.recap_sent_at && (own.has(s.profile_id) || groups.has(s.group_id)))
        .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at))).slice(0, 200)
        .map((s) => ({
          session_id: s.id, starts_at: s.starts_at, minutes: s.minutes, kind: s.kind, coach_first_name: firstNameOf(s.coach_id),
          group_name: store.rows.coach_groups.find((g) => g.id === s.group_id)?.name ?? null, recap: s.recap, sent_at: s.recap_sent_at,
          actions: store.rows.coach_session_actions.filter((a) => a.session_id === s.id && a.send)
            .sort((a, b) => (a.position - b.position) || String(a.created_at).localeCompare(String(b.created_at)))
            .map((a) => ({ id: a.id, title: a.title, goes_to: a.goes_to, done: a.done_at != null, placed: a.placed_at != null })),
        }));
    },
    /** my_session_action(p_action, p_done, p_placed): only an action of a recap they were sent. */
    my_session_action(uid, id, done = null, placed = null) {
      const a = store.rows.coach_session_actions.find((x) => x.id === id && x.send);
      if (!a || !store.fn.my_session_recaps(uid).some((r) => r.session_id === a.session_id)) no('42501', 'That action isn’t yours.', 403);
      if (done != null) a.done_at = done ? (a.done_at ?? stamp()) : null;
      if (placed != null) a.placed_at = placed ? (a.placed_at ?? stamp()) : null;
    },
    /** my_view_asks(): the View as client requests of the last 7 days, newest first, with the coach's first name. */
    my_view_asks(uid) {
      const own = new Set(myProfiles(uid).map((p) => p.id));
      return store.rows.client_view_requests.filter((r) => own.has(r.profile_id) && new Date(r.asked_at).getTime() > clock().getTime() - 7 * 86400000)
        .sort((a, b) => String(b.asked_at).localeCompare(String(a.asked_at))).slice(0, 20)
        .map((r) => ({ request_id: r.id, coach_first_name: firstNameOf(r.coach_id), asked_at: r.asked_at, answered_at: r.answered_at ?? null, allowed: r.allowed ?? null, expires_at: r.expires_at ?? null }));
    },
    /** my_cover_asks(): cover that hasn't ended, by its first day, with both coaches' first names. */
    my_cover_asks(uid) {
      const own = new Set(myProfiles(uid).map((p) => p.id));
      const today = stamp().slice(0, 10);
      return store.rows.coach_cover.filter((c) => own.has(c.profile_id) && c.ends_on >= today)
        .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)))
        .map((c) => ({ cover_id: c.id, coach_first_name: firstNameOf(c.coach_id), cover_first_name: firstNameOf(c.cover_coach_id), starts_on: c.starts_on, ends_on: c.ends_on, agreed_at: c.client_agreed_at ?? null }));
    },
  };

  await page.route('**/api/**', (r) => { store.calls.push(`api ${new URL(r.request().url()).pathname}`); return json(r, { ok: true, sent: false }); });
  if (db === 'there' && day) {
    // The email server (api/coach-send.js), answered as it answers and never sending: a preview ({ live: false }) says so
    // before it asks the database anything; the live site reads with the coach's own sign-in and claims the send first.
    await page.route('**/api/coach-send', (route) => {
      if (store.down) return route.abort('internetdisconnected');
      const body = (() => { try { return route.request().postDataJSON() || {}; } catch { return {}; } })();
      store.calls.push('api /api/coach-send');
      store.api.asked.push(body);
      const say = (answer, status = 200) => { store.api.answers = [...(store.api.answers || []), answer]; return json(route, answer, status); };
      if (!store.api.live) return say({ sent: false, reason: 'preview' });
      try {
        if (body.kind === 'recap') {
          const s = sessionOf(body.sessionId);
          if (!s || s.coach_id !== ME) return say({ sent: false, message: 'That session isn’t yours.' }, 404);
          if (!s.recap_sent_at) return say({ sent: false, reason: 'not_sent' });
          const to = store.fn.session_recap_people(me.user_id, s.id);
          if (!to.length) return say({ sent: false, reason: 'nobody' });
          if (store.fn.session_recap_email_claim(me.user_id, s.id) !== true) return say({ sent: false, reason: 'already' });
          return say({ sent: true, people: to.length });
        }
        if (body.kind === 'invite') {
          const p = store.rows.client_profiles.find((x) => x.id === body.profileId && x.coach_id === ME);
          if (!p || p.merged_into) return say({ sent: false, message: 'That client isn’t yours.' }, 404);
          if (p.user_id) return say({ sent: false, reason: 'has_account' });
          if (!p.email) return say({ sent: false, reason: 'nobody' });
          p.invited_at = p.invited_at || stamp();
          return say({ sent: true, people: 1 });
        }
        if (body.kind === 'workshop_follow_up') {
          const w = store.rows.workshops.find((x) => x.id === body.workshopId && x.coach_id === ME);
          if (!w) return say({ sent: false, message: 'That workshop isn’t yours.' }, 404);
          if (store.rows.workshop_sends.some((x) => x.workshop_id === w.id && x.kind === 'follow_up')) return say({ sent: false, reason: 'already' });
          const people = store.fn.workshop_follow_up_claim(me.user_id, w.id);
          if (!people.length) return say({ sent: false, reason: 'already' });
          return say({ sent: true, people: people.length });
        }
      } catch (e) {
        if (e instanceof Refusal) return e.code === '22023' ? say({ sent: false, reason: 'early' }) : say({ sent: false, message: e.message }, 404);
        throw e;
      }
      return say({ sent: false, message: 'That didn’t work. Try again in a moment.' }, 400);
    });
  }

  // Who the coach is.
  await page.route('**/rest/v1/coaches*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (store.down) return route.abort('internetdisconnected');
    if (req.method() === 'GET') {
      const uid = (url.searchParams.get('user_id') || '').replace('eq.', '');
      if (uid) { me.user_id = uid; return json(route, [me]); }
      // 026: a coach reads their own row, the owner reads every row.
      return json(route, role === 'owner' ? store.coaches : [me]);
    }
    if (req.method() === 'PATCH') {
      if (role !== 'owner') return json(route, []);
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const row = store.coaches.find((c) => c.id === id);
      if (row) Object.assign(row, req.postDataJSON());
      return json(route, row ? [row] : []);
    }
    return json(route, []);
  });

  if (db === 'none') {
    // "Before the tables": everything must stay on the device. 049 is on the
    // test project now, so the page is told "not yet" on every load (both
    // 049's note and 050's), and any write that still leaves the page for
    // the database is stopped here and counted, never sent (19 Nov: a walk
    // in this mode once wrote the seed's organisations to the test project).
    await page.addInitScript(() => {
      try {
        localStorage.setItem('clarity-coach-not-yet', String(Date.now()));
        localStorage.setItem('clarity-coach-day-not-yet', String(Date.now()));
      } catch { /* blocked */ }
    });
    await page.route('**/rest/v1/**', (route) => {
      const req = route.request();
      const name = new URL(req.url()).pathname.split('/rest/v1/')[1] || '';
      if (name.startsWith('coaches')) return route.fallback();
      if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
      // A checked function (the portal's own questions after sign-in among them) is answered with nothing: it never runs.
      if (name.startsWith('rpc/')) { store.calls.push(`rpc ${name.slice(4)} (not run)`); return json(route, null); }
      store.calls.push(`blocked ${req.method()} ${name}`);
      return route.abort('blockedbyclient');
    });
    return store;
  }
  // "049 isn't there yet" is remembered on a device for an hour; a page that is
  // answered by the stand-in starts without that note, every time it loads.
  await page.addInitScript((dayThere) => {
    try {
      localStorage.removeItem('clarity-coach-not-yet');
      // 050: there (the page is never told "not yet"), or not (told so on every load, so it never asks the test project).
      if (dayThere) localStorage.removeItem('clarity-coach-day-not-yet'); else localStorage.setItem('clarity-coach-day-not-yet', String(Date.now()));
    } catch { /* blocked */ }
  }, day);

  // 050's read rules (the break-it tester, 20 Nov): a coach reads only their own to-dos, lists, days, weeks and sessions, and
  // the owner is no exception. A row of another coach's is never returned (counted in `store.withheld`), changed or deleted.
  // `store.leak = true` switches that off, for a walk that asks what a page would show if such a row ever reached the device.
  const readable = (table, r) => !day || !DAY_TABLES.includes(table) || store.leak === true || (
    table === 'coach_session_people' ? sessionOf(r.session_id)?.coach_id === ME
      : table === 'workshop_sends' ? store.rows.workshops.find((w) => w.id === r.workshop_id)?.coach_id === ME
        : r.coach_id === ME);
  const filtered = (table, url) => {
    const all = store.rows[table];
    let out = all.filter((r) => readable(table, r));
    store.withheld += all.length - out.length;
    for (const [k, v] of url.searchParams) {
      if (['select', 'limit', 'on_conflict', 'order', 'offset', 'columns'].includes(k)) continue;
      if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3));
      else if (v === 'is.null') out = out.filter((r) => r[k] == null);
    }
    return out;
  };

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const name = url.pathname.split('/rest/v1/')[1];
    if (store.down) return route.abort('internetdisconnected');
    if (name.startsWith('rpc/')) {
      const fn = name.slice(4);
      const args = req.postDataJSON() || {};
      store.calls.push(`rpc ${fn}`);
      const profiles = store.rows.client_profiles;
      switch (fn) {
        case 'coach_list':
          return json(route, (role === 'owner' ? store.coaches : store.coaches.filter((c) => c.active)).map((c) => ({
            coach_id: c.id, first_name: c.display_first_name, full_name: c.full_name, role: c.role, active: c.active, is_me: c.id === ME,
            clients: role === 'owner' ? profiles.filter((p) => p.coach_id === c.id && !p.merged_into && p.status !== 'past').length + (c.id === OTHER ? admin.length : 0) : null,
            hourly_rate: role === 'owner' ? c.hourly_rate : null, rate_currency: role === 'owner' ? c.rate_currency : null,
            profile_waiting: role === 'owner' ? store.rows.coach_profiles.some((p) => p.coach_id === c.id && !p.approved_at && p.submitted_at) : null,
          })));
        case 'coach_admin_clients':
          if (role !== 'owner') return refused(route, '42501', 'Only the owner can do this.');
          return json(route, [
            ...profiles.filter((p) => !p.merged_into).map((p) => { const e = store.rows.engagements.find((x) => x.profile_id === p.id && x.status !== 'ended'); return { profile_id: p.id, name: p.name, coach_id: p.coach_id, coach_first_name: store.coaches.find((c) => c.id === p.coach_id)?.display_first_name, organisation_id: p.organisation_id, organisation_name: store.rows.organisations.find((o) => o.id === p.organisation_id)?.name || null, status: p.status, engagement_kind: e?.kind || null, sessions_total: e?.sessions_total ?? null, sessions_held: e?.sessions_held ?? null, time_credit_minutes: e?.time_credit_minutes ?? null, ends_on: e?.ends_on || null }; }),
            ...admin,
          ]);
        case 'client_move': {
          if (role !== 'owner') return refused(route, '42501', 'Only the owner can do this.');
          const p = profiles.find((x) => x.id === args.p_profile);
          const a = admin.find((x) => x.profile_id === args.p_profile);
          if (!p && !a) return refused(route, '22023', 'That client isn’t here any more.', 400);
          const from = p ? p.coach_id : a.coach_id;
          if (p) p.coach_id = args.p_to_coach;
          if (a) { // it now belongs to the coach it moved to
            admin.splice(admin.indexOf(a), 1);
            if (args.p_to_coach === ME) profiles.push({ id: a.profile_id, coach_id: ME, user_id: null, name: a.name, email: null, organisation_id: a.organisation_id, status: a.status, getting_started: {}, frequent_traveller: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            else admin.push({ ...a, coach_id: args.p_to_coach });
          } else if (p && args.p_to_coach !== ME) {
            profiles.splice(profiles.indexOf(p), 1);
            admin.push({ profile_id: p.id, name: p.name, coach_id: args.p_to_coach, coach_first_name: store.coaches.find((c) => c.id === args.p_to_coach)?.display_first_name, organisation_id: p.organisation_id, organisation_name: null, status: p.status, engagement_kind: null, sessions_total: null, sessions_held: null, time_credit_minutes: null, ends_on: null });
          }
          store.rows.activity_log.push({ id: randomUUID(), actor_id: me.user_id, actor_name: me.full_name, kind: 'move', summary: 'moved a client.', item: {}, created_at: new Date().toISOString() });
          return json(route, from);
        }
        case 'client_add_for':
          if (role !== 'owner') return refused(route, '42501', 'Only the owner can do this.');
          admin.push({ profile_id: args.p_id, name: args.p_name, coach_id: args.p_coach, coach_first_name: store.coaches.find((c) => c.id === args.p_coach)?.display_first_name, organisation_id: args.p_organisation, organisation_name: null, status: 'active', engagement_kind: null, sessions_total: null, sessions_held: null, time_credit_minutes: null, ends_on: null });
          return json(route, args.p_id);
        case 'coach_save_details':
          Object.assign(me, { display_first_name: args.p_first_name, full_name: args.p_full_name, mobile: args.p_mobile, contact_ways: args.p_contact_ways });
          return route.fulfill({ status: 204 });
        case 'log_activity':
          store.rows.activity_log.push({ id: randomUUID(), actor_id: me.user_id, actor_name: me.full_name, kind: args.p_kind, summary: args.p_summary, item: {}, created_at: new Date().toISOString() });
          return route.fulfill({ status: 204 });
        case 'client_invite': {
          const p = profiles.find((x) => x.id === args.p_profile);
          if (p) p.invited_at = new Date().toISOString();
          return route.fulfill({ status: 204 });
        }
        case 'coach_profile_decide': {
          const p = store.rows.coach_profiles.find((x) => x.coach_id === args.p_coach);
          if (p) p.approved_at = args.p_approve ? new Date().toISOString() : null;
          return route.fulfill({ status: 204 });
        }
        case 'coach_switch': {
          const c = store.coaches.find((x) => x.id === args.p_coach);
          if (!args.p_active && (profiles.some((p) => p.coach_id === args.p_coach) || admin.some((a) => a.coach_id === args.p_coach))) return refused(route, '23514', 'Move this coach’s clients first.', 400);
          if (c) c.active = args.p_active;
          return route.fulfill({ status: 204 });
        }
        case 'workshop_page': {
          const w = store.rows.workshops.find((x) => x.page_key === args.p_key);
          if (!w) return json(route, null);
          return json(route, { title: w.title, starts_at: w.starts_at, ends_at: w.ends_at, time_zone: w.time_zone, place: w.place, organisation: store.rows.organisations.find((o) => o.id === w.organisation_id)?.name || null, capacity: w.capacity, taken: store.rows.workshop_attendees.filter((a) => a.workshop_id === w.id && a.status === 'registered').length, open: w.registration_open === true, questions: w.questions });
        }
        case 'workshop_register': {
          const w = store.rows.workshops.find((x) => x.page_key === args.p_key);
          if (!w) return json(route, 'not_found');
          if (!w.registration_open) return json(route, 'closed');
          const email = String(args.p_email || '').toLowerCase();
          const mine = store.rows.workshop_attendees.find((a) => a.workshop_id === w.id && a.email === email && a.status !== 'cancelled');
          if (mine) return json(route, `already_${mine.status}`);
          const taken = store.rows.workshop_attendees.filter((a) => a.workshop_id === w.id && a.status === 'registered').length;
          const status = taken < w.capacity ? 'registered' : 'waiting';
          store.rows.workshop_attendees.push({ id: randomUUID(), workshop_id: w.id, name: args.p_name, email, status, answers: args.p_answers || {}, attended: false, source: 'page', survey_key: randomUUID(), registered_at: new Date().toISOString() });
          store.rows.coach_notifications.push({ id: randomUUID(), coach_id: w.coach_id, kind: 'workshop', title: `${args.p_name} ${status === 'registered' ? 'registered for' : 'joined the waiting list for'} ${w.title}`, detail: null, item_kind: 'workshop', item_id: w.id, created_at: new Date().toISOString(), read_at: null });
          return json(route, status);
        }
        case 'client_merge': {
          const keep = profiles.find((x) => x.id === args.p_keep);
          const drop = profiles.find((x) => x.id === args.p_drop);
          if (args.p_keep === args.p_drop) return refused(route, '22023', 'Choose two different people to merge.', 400);
          if (!keep || !drop) return refused(route, '42501', 'Both clients must be yours.');
          const id = randomUUID();
          store.merges = store.merges || {};
          store.merges[id] = { keep: { ...keep }, drop: { ...drop } };
          for (const k of Object.keys(args.p_values || {})) keep[k] = drop[k];
          drop.merged_into = keep.id;
          return json(route, id);
        }
        case 'client_unmerge': {
          const m = store.merges?.[args.p_merge];
          if (!m) return refused(route, '22023', 'That merge can’t be undone any more.', 400);
          Object.assign(profiles.find((x) => x.id === m.keep.id), m.keep);
          Object.assign(profiles.find((x) => x.id === m.drop.id), m.drop);
          delete store.merges[args.p_merge];
          return route.fulfill({ status: 204 });
        }
        case 'client_delete': {
          const p = profiles.find((x) => x.id === args.p_profile);
          if (!p) return refused(route, '42501', 'That client isn’t yours.');
          if (String(args.p_typed_name || '').trim() !== p.name.trim()) return refused(route, '22023', 'Type the name exactly to carry on.', 400);
          store.rows.client_profiles = profiles.filter((x) => x.id !== p.id);
          return route.fulfill({ status: 204 });
        }
        case 'coach_client_list':
          return json(route, []);
        default:
          if (day) {
            // 050's functions, as their SQL (store.fn); a refusal is answered as the database words it.
            try {
              const uid = me.user_id;
              switch (fn) {
                case 'coach_save_capacity': store.fn.coach_save_capacity(uid, args.p_hours); return route.fulfill({ status: 204 });
                case 'session_send_recap': { const answer = store.fn.session_send_recap(uid, args.p_session); store.sends.push({ session: args.p_session, answer }); return json(route, answer); }
                case 'session_recap_email_claim': return json(route, store.fn.session_recap_email_claim(uid, args.p_session));
                case 'session_recap_people': return json(route, store.fn.session_recap_people(uid, args.p_session));
                case 'workshop_follow_up_claim': return json(route, store.fn.workshop_follow_up_claim(uid, args.p_workshop));
                case 'my_session_recaps': return json(route, store.fn.my_session_recaps(uid));
                case 'my_session_action': store.fn.my_session_action(uid, args.p_action, args.p_done ?? null, args.p_placed ?? null); return route.fulfill({ status: 204 });
                case 'my_view_asks': return json(route, store.fn.my_view_asks(uid));
                case 'my_cover_asks': return json(route, store.fn.my_cover_asks(uid));
                // Only the email server may call these (the service role): a signed-in coach is refused.
                case 'workshop_emails_due': case 'workshop_send_claim': return refused(route, '42501', `permission denied for function ${fn}`);
                default:
              }
            } catch (e) {
              if (e instanceof Refusal) { if (fn === 'session_send_recap') store.sends.push({ session: args.p_session, answer: `refused ${e.code}` }); return refused(route, e.code, e.message, e.status); }
              throw e;
            }
          }
          if (strict) { store.calls[store.calls.length - 1] = `rpc ${fn} (not run)`; return json(route, null); }
          // Anything else is the portal's own (person_today and so on): the real test project answers.
          return route.fallback();
      }
    }
    const table = name.split('?')[0];
    if (!held.includes(table)) {
      const method = req.method();
      // 050 isn't there: its tables answer as a database without them does, and the test project is never asked.
      if (DAY_TABLES.includes(table)) return json(route, { code: 'PGRST205', details: null, hint: null, message: `Could not find the table 'public.${table}' in the schema cache` }, 404);
      if (strict && method !== 'GET' && method !== 'HEAD') { store.calls.push(`blocked ${method} ${table}`); return route.abort('blockedbyclient'); }
      return route.fallback();
    }
    const method = req.method();
    const now = stamp();
    const hooked = day && (DAY_TABLES.includes(table) || table === 'engagements');
    store.calls.push(`${method} ${table}`);
    if (method === 'GET' || method === 'HEAD') return json(route, filtered(table, url));
    try {
      if (method === 'POST') {
        const body = req.postDataJSON();
        const list = Array.isArray(body) ? body : [body];
        const ignore = (req.headers().prefer || '').includes('ignore-duplicates');
        const out = [];
        for (const r of list) {
          if (table === 'coach_notifications') return refused(route, '42501', 'permission denied for table coach_notifications');
          if (table === 'time_entries' && !r.ended_at && store.rows.time_entries.some((t) => t.coach_id === r.coach_id && !t.ended_at && t.id !== r.id)) return refused(route, '23505', 'duplicate key value violates unique constraint "time_entries_one_running"', 409);
          const at = store.rows[table].findIndex((x) => keyOf(table, x) === keyOf(table, r));
          const old = at >= 0 ? store.rows[table][at] : null;
          if (old && ignore) continue;
          // An upsert onto a row the coach can't read is a change to another coach's row: row security refuses it.
          if (old && !readable(table, old)) return refused(route, '42501', `new row violates row-level security policy (USING expression) for table "${table}"`);
          let row = old ? { ...old, ...r, updated_at: now } : { created_at: now, ...r, updated_at: now };
          if (hooked) {
            if (DAY_TABLES.includes(table)) mine(table, row);
            // An upsert is an insert first (its "before insert" trigger runs), then a change to the row that was there.
            row = before(table, null, row);
            if (old) row = before(table, old, row);
            if (DAY_TABLES.includes(table)) { dayChecks(table, row); points(table, row); }
          }
          if (old) store.rows[table][at] = row; else store.rows[table].push(row);
          if (hooked) after(table, old, row);
          out.push(row);
        }
        return json(route, out, 201);
      }
      if (method === 'PATCH') {
        const hit = filtered(table, url);
        const body = req.postDataJSON();
        const out = [];
        for (const old of hit) {
          let row = { ...old, ...body, updated_at: now };
          if (hooked) { if (DAY_TABLES.includes(table)) mine(table, row); row = before(table, old, row); if (DAY_TABLES.includes(table)) { dayChecks(table, row); points(table, row); } }
          const was = { ...old };
          Object.assign(old, row);
          if (hooked) after(table, was, old);
          out.push(old);
        }
        return json(route, out);
      }
      if (method === 'DELETE') return json(route, removeRows(table, filtered(table, url)));
    } catch (e) {
      if (e instanceof Refusal) { store.calls.push(`refused ${method} ${table} ${e.code}`); return refused(route, e.code, e.message, e.status); }
      throw e;
    }
    return route.fallback();
  });

  // The two file stores: uploads are taken and forgotten, links are made up.
  await page.route('**/storage/v1/object/**', (route) => {
    store.calls.push(`storage ${route.request().method()}`);
    if (route.request().url().includes('/sign/')) return json(route, { signedURL: '/object/sign/stand-in?token=x' });
    return json(route, { Key: 'stand-in', Id: randomUUID() });
  });
  return store;
}

/** Puts rows on the device as the coach portal keeps them before 049 (clarity-coach-local:<account>). */
export async function seedDevice(page, userId, rows) {
  const KEY = (table, row) => (KEYS[table] || ['id']).map((c) => row[c]).join('|');
  const state = { rows: {}, marks: {} };
  const now = new Date().toISOString();
  for (const [table, list] of Object.entries(rows)) {
    state.rows[table] = {}; state.marks[table] = {};
    for (const r of list) { const row = { created_at: now, updated_at: now, ...r }; state.rows[table][KEY(table, row)] = row; state.marks[table][KEY(table, row)] = { sent: false, gone: false, refused: false }; }
  }
  await page.evaluate(([id, s]) => {
    localStorage.setItem(`clarity-coach-local:${id}`, JSON.stringify(s));
    localStorage.removeItem(`clarity-cache:${id}:coach`);
    localStorage.removeItem(`clarity-cache:${id}:coach-clients-list`);
    localStorage.removeItem(`clarity-cache:${id}:coach-folds`);
    localStorage.removeItem(`clarity-cache:${id}:coach-not-duplicates`);
    localStorage.removeItem(`clarity-cache:${id}:coach-role`);
  }, [userId, state]);
}

/** Takes the coach portal's device copies off this browser (what a test made is never kept). */
export async function clearDevice(page, userId) {
  await page.evaluate((id) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`clarity-coach-local:${id}`) || k.startsWith(`clarity-cache:${id}:coach`) || k === 'clarity-coach-not-yet' || k === 'clarity-coach-day-not-yet') localStorage.removeItem(k);
  }, userId);
}

export const toastText = (page) => page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '');
export const settle = (page, ms = 350) => page.waitForTimeout(ms);

/**
 * The access codes' table (026), answered by a stand-in that keeps what it is given, so no code ever reaches the
 * test project (in either database mode). Call it after standIn. Resolves { rows, posts }.
 */
export async function codesStandIn(page) {
  const codes = { rows: [], posts: [] };
  const answer = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/rest/v1/organisation_access_codes*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const org = (url.searchParams.get('organisation_id') || '').replace('eq.', '');
    if (req.method() === 'GET') return answer(route, codes.rows.filter((r) => r.organisation_id === org && !r.switched_off_at).map((r) => ({ id: r.id })));
    if (req.method() === 'POST') { const row = req.postDataJSON(); codes.posts.push(row); codes.rows.push({ switched_off_at: null, ...row }); return answer(route, [], 201); }
    if (req.method() === 'PATCH') {
      const not = (url.searchParams.get('id') || '').replace('neq.', '');
      for (const r of codes.rows) if (r.organisation_id === org && !r.switched_off_at && r.id !== not) Object.assign(r, req.postDataJSON());
      return answer(route, []);
    }
    return route.abort();
  });
  return codes;
}
