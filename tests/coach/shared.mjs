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

/**
 * Puts the stand-ins in front of a page.
 * @param {{ role: 'owner'|'associate', db: 'none'|'there', rows?: object, admin?: object[], offline?: () => boolean }} opts
 * @returns the stand-in database ({ rows, calls }) when db is 'there'
 */
export async function standIn(page, { role = 'owner', db = 'none', rows = {}, admin = [] } = {}) {
  const me = { id: ME, user_id: null, role: role === 'owner' ? 'owner' : 'coach', display_first_name: role === 'owner' ? 'Alex' : 'Maya', full_name: role === 'owner' ? 'Alex Morgan' : 'Maya Collins', email: null, mobile: null, contact_ways: ['email'], active: true, capacity_hours_week: 15, hourly_rate: role === 'owner' ? null : 100, rate_currency: 'GBP' };
  const other = { id: OTHER, user_id: randomUUID(), role: role === 'owner' ? 'coach' : 'owner', display_first_name: role === 'owner' ? 'Maya' : 'Alex', full_name: role === 'owner' ? 'Maya Collins' : 'Alex Morgan', email: null, mobile: null, contact_ways: ['email'], active: true, capacity_hours_week: 15, hourly_rate: role === 'owner' ? 100 : null, rate_currency: 'GBP' };
  const store = { rows: Object.fromEntries(TABLES.map((t) => [t, [...(rows[t] || [])]])), calls: [], coaches: [me, other], down: false };
  const keyOf = (table, row) => (KEYS[table] || ['id']).map((c) => row[c]).join('|');

  await page.route('**/api/**', (r) => { store.calls.push(`api ${new URL(r.request().url()).pathname}`); return json(r, { ok: true, sent: false }); });

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
  await page.addInitScript(() => { try { localStorage.removeItem('clarity-coach-not-yet'); } catch { /* blocked */ } });

  const filtered = (table, url) => {
    let out = store.rows[table];
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
          // Anything else is the portal's own (person_today and so on): the real test project answers.
          return route.fallback();
      }
    }
    const table = name.split('?')[0];
    if (!TABLES.includes(table)) return route.fallback();
    const method = req.method();
    const now = new Date().toISOString();
    store.calls.push(`${method} ${table}`);
    if (method === 'GET' || method === 'HEAD') return json(route, filtered(table, url));
    if (method === 'POST') {
      const body = req.postDataJSON();
      const list = Array.isArray(body) ? body : [body];
      const ignore = (req.headers().prefer || '').includes('ignore-duplicates');
      const out = [];
      for (const r of list) {
        if (table === 'coach_notifications') return refused(route, '42501', 'permission denied for table coach_notifications');
        if (table === 'time_entries' && !r.ended_at && store.rows.time_entries.some((t) => t.coach_id === r.coach_id && !t.ended_at && t.id !== r.id)) return refused(route, '23505', 'duplicate key value violates unique constraint "time_entries_one_running"', 409);
        const at = store.rows[table].findIndex((x) => keyOf(table, x) === keyOf(table, r));
        if (at >= 0) { if (ignore) continue; store.rows[table][at] = { ...store.rows[table][at], ...r, updated_at: now }; out.push(store.rows[table][at]); } else { const row = { created_at: now, ...r, updated_at: now }; store.rows[table].push(row); out.push(row); }
      }
      return json(route, out, 201);
    }
    if (method === 'PATCH') {
      const hit = filtered(table, url);
      const body = req.postDataJSON();
      hit.forEach((r) => Object.assign(r, body, { updated_at: now }));
      return json(route, hit);
    }
    if (method === 'DELETE') {
      const hit = filtered(table, url);
      store.rows[table] = store.rows[table].filter((r) => !hit.includes(r));
      return json(route, hit);
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
    for (const k of Object.keys(localStorage)) if (k.startsWith(`clarity-coach-local:${id}`) || k.startsWith(`clarity-cache:${id}:coach`) || k === 'clarity-coach-not-yet') localStorage.removeItem(k);
  }, userId);
}

export const toastText = (page) => page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '');
export const settle = (page, ms = 350) => page.waitForTimeout(ms);
