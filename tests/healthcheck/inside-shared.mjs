// What the inside Health Check's browser suites share (inside-flow.mjs and
// compare-m7.mjs): M7's own invented teams (Kestrel Group's Leadership team
// with three versions and its Product team), saved in the inside shape; a
// page on the dev server signed in as the test client, with the Health
// Check's own reads and writes of `decisions` answered here (so nothing is
// written to the test database unless a part asks for the real one), every
// /api/ call and email answered or blocked, and everything outside localhost
// and the test project blocked. No fonts are added: the page loads its own.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { APP, TEST_HOST, readEnv, signIn as realSignIn } from '../phase8/shared.mjs';

export { APP };
export const M7_FILE = process.env.M7_FILE || join(homedir(), 'Downloads', 'clarity-health-check-calm', 'm7-health-check-inside.html');
export const BASE = '/strategic-alignment';
export const COACH = 'Tim';
export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// ---------------------------------------------------------------- M7's teams (its TEAMS, word for word)
const CSF1 = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const OBJ1 = 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.';
const LT = { id: '7a000000-0000-4000-8000-00000000a001', name: 'Leadership team' };
const PT = { id: '7a000000-0000-4000-8000-00000000a002', name: 'Product team' };
export const IDS = {
  lt3: '7b000000-0000-4000-8000-000000000003',
  lt2: '7b000000-0000-4000-8000-000000000002',
  lt1: '7b000000-0000-4000-8000-000000000001',
  pt1: '7b000000-0000-4000-8000-000000000011',
  old: '7b000000-0000-4000-8000-0000000000aa',
};
const V = {
  lt3: { team: LT, iso: '2026-10-27', w: [3, 2, 2, 1], csf: CSF1, obj: OBJ1, pr: [['Enterprise sales team', [3, 2, 2, 3], 2, 5, '2025-09', '2026-12'], ['Customer success programme', [3, 3, 1, 2], 4, 3, '2026-01', '2027-03'], ['Pricing review', [2, 2, 0, 3], 3, 2, '2026-06', '2026-12'], ['Hiring plan for 2027', [2, 1, 2, 2], 1, 4, '2026-10', '2027-06'], ['Partner channel', [2, 1, 1, 1], 3, 3, '2026-04', 'open'], ['New office fit-out', [0, 0, 1, 1], 4, 4, '2026-07', '2026-11'], ['Data platform', [1, 3, 1, 2], 5, 3, '2025-11', '2026-12']] },
  lt2: { team: LT, iso: '2026-07-14', w: [2, 2, 2, 2], csf: CSF1, obj: OBJ1, pr: [['Enterprise sales team', [3, 2, 2, 3], 3, 4, '2025-09', '2026-12'], ['Customer success programme', [3, 3, 1, 2], 3, 3, '2026-01', '2027-03'], ['Pricing review', [2, 2, 0, 3], 2, 2, '2026-06', '2026-12'], ['Partner channel', [2, 1, 1, 1], 3, 3, '2026-04', 'open'], ['New office fit-out', [0, 0, 1, 1], 3, 4, '2026-07', '2026-11'], ['Data platform', [1, 3, 1, 2], 4, 3, '2025-11', '2026-12'], ['Rebrand', [1, 2, 0, 1], 4, 3, '2026-02', '2026-08']] },
  lt1: { team: LT, iso: '2026-04-03', out: true, w: [2, 2, 2, 2], csf: CSF1, obj: OBJ1, pr: [['Enterprise sales team', [3, 2, 2, 3], 1, 4, '2025-09', '2026-12'], ['Customer success programme', [3, 3, 1, 2], 1, 3, '2026-01', '2027-03'], ['Partner channel', [2, 1, 1, 1], 2, 3, '2026-04', 'open'], ['Data platform', [1, 3, 1, 2], 3, 3, '2025-11', '2026-12'], ['Rebrand', [1, 2, 0, 1], 2, 3, '2026-02', '2026-08'], ['Website rebuild', [1, 2, 0, 1], 4, 2, '2025-10', '2026-05']] },
  pt1: { team: PT, iso: '2026-09-02', line: 60, w: [3, 2, 2], csf: ['A product that saves customers a day a week', 'Fast, reliable releases', 'Customers who help shape the roadmap'], obj: 'Make Kestrel the product customers recommend first in its market.', pr: [['Mobile app rebuild', [3, 2, 2], 2, 5, '2026-03', '2027-02'], ['Release automation', [1, 3, 0], 4, 3, '2026-01', '2026-12'], ['Customer advisory board', [1, 0, 3], 3, 2, '2026-05', 'open'], ['Reporting suite', [3, 1, 2], 4, 4, '2025-12', '2026-10']] },
};
// The same project keeps its id across a team's versions (a new version copies them).
const pid = (team, name) => `p-${team.id.slice(-4)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** One of M7's versions as the saved row (src/lib/healthCheck/inside.js). */
export function m7Row(key, userId, extra = {}) {
  const v = V[key];
  const fid = (i) => `f-${v.team.id.slice(-4)}-${i}`;
  return {
    id: IDS[key],
    user_id: userId,
    tool_type: 'strategic-alignment',
    title: v.team.name,
    status: 'completed',
    draft: false,
    created_at: `${v.iso}T09:00:00`,
    updated_at: `${v.iso}T09:30:00`,
    form_data: {
      shape: 2,
      team: v.team,
      date: v.iso,
      made: 'version',
      from: null,
      step: null,
      shared_with_coach: true,
      ...(v.out ? { from_outside: { at: `${v.iso}T08:00:00Z` } } : {}),
      data: {
        objective: v.obj,
        csfs: v.csf.map((text, i) => ({ id: fid(i), text, level: v.w[i] })),
        projects: v.pr.map(([t, , , , s, f]) => ({ id: pid(v.team, t), text: t, started: s, due: f })),
        ratings: { owner: Object.fromEntries(v.pr.map(([t, c, p, r]) => [pid(v.team, t), { contrib: Object.fromEntries(c.map((x, k) => [fid(k), x])), progress: p, resource: r }])) },
        ...(v.line ? { importantLine: v.line } : { importantLine: 50 }),
        completedAt: `${v.iso}T09:30:00Z`,
      },
      ...extra,
    },
  };
}
export const m7Rows = (userId) => ['lt3', 'lt2', 'lt1', 'pt1'].map((k) => m7Row(k, userId));

/** A Health Check saved by the older pages (no ids, weights, line, resource or dates). */
export const oldRow = (userId) => ({
  id: IDS.old,
  user_id: userId,
  tool_type: 'strategic-alignment',
  title: 'Board of directors',
  status: 'completed',
  draft: false,
  created_at: '2025-03-12T08:00:00',
  updated_at: '2025-03-12T08:00:00',
  form_data: {
    goal: 'Grow the business to £20m by 2027',
    risks: ['Cash runs short'],
    strategies: [],
    factors: ['Win new customers', 'Keep the ones we have'],
    projects: ['CRM roll-out', 'Customer success team'],
    matrix: { '0-0': 3, '0-1': 1, '1-1': 3 },
    progress: { 0: 2, 1: 4 },
  },
});

// ---------------------------------------------------------------- the page
let session = null; // one real sign-in, shared by every page of a run

/** Signs the test client in once and keeps the device's sign-in for every later page. */
async function signedIn(browser, dir) {
  if (session) return session;
  const env = readEnv();
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await blockAll(ctx);
  const page = await ctx.newPage();
  await realSignIn(page, env);
  const userId = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (/auth-token/.test(k)) { try { return JSON.parse(localStorage.getItem(k)).user.id; } catch { /* next */ } }
    }
    return null;
  });
  const file = join(dir, 'signed-in.json');
  await ctx.storageState({ path: file });
  await ctx.close();
  session = { file, userId };
  return session;
}

/** Every other host and every email call blocked; /api/ answered as sent. */
async function blockAll(ctx, sent = []) {
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (/\/api\//.test(url)) { sent.push(url.replace(/\?.*$/, '')); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.fallback();
    if (url.includes(TEST_HOST)) return route.fallback();
    return route.abort();
  });
}

/**
 * A signed-in page. opts: rows (the Health Check rows the stand-in holds;
 * null: the real database is used), coach (the coach's first name, or null),
 * textTwice, height, scale, storage ({ key: value } in localStorage first).
 * Returns { ctx, page, store, problems, fonts, sent, userId }.
 */
export async function insidePage(browser, width, mode, opts = {}) {
  const dir = opts.dir || join(process.cwd(), 'tmp-hc-inside');
  const { file, userId } = await signedIn(browser, dir);
  const phone = width <= 600;
  const ctx = await browser.newContext({
    storageState: file,
    viewport: { width, height: opts.height || (phone ? 844 : 900) }, isMobile: phone, hasTouch: phone, deviceScaleFactor: opts.scale || 2,
    colorScheme: mode, reducedMotion: opts.motion ? 'no-preference' : 'reduce', locale: 'en-GB', timezoneId: 'Europe/London', acceptDownloads: true,
  });
  const sent = [];
  const fonts = [];
  ctx.on('request', (r) => { if (r.resourceType() === 'font' && !r.url().startsWith('data:')) fonts.push(r.url().replace(/\?.*$/, '')); });
  await blockAll(ctx, sent);
  // The coach (my_coach's own shape; nothing in the database changes).
  if (opts.coach !== null) {
    await ctx.route(/\/rest\/v1\/rpc\/my_coach/, (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ coach_id: '22222222-2222-4222-8222-222222222222', first_name: opts.coach || COACH, away_until: null, mobile: null, contact_ways: ['email'] }]),
    }));
  }
  const store = { rows: opts.rows ? opts.rows.map((r) => ({ ...r, user_id: r.user_id || userId })) : null, writes: [], deletes: [] };
  if (store.rows) {
    await ctx.route(/\/rest\/v1\/decisions(\?|$)/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const idEq = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (req.method() === 'GET') {
        if (url.searchParams.get('tool_type') === 'eq.strategic-alignment') return json(store.rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)));
        if (idEq && store.rows.some((r) => r.id === idEq)) {
          const found = store.rows.filter((r) => r.id === idEq);
          // .single() asks for one object, as PostgREST gives it.
          return /vnd\.pgrst\.object/.test(req.headers().accept || '') ? json(found[0]) : json(found);
        }
        // Any other list of decisions (My Plans): the real rows, with the Health Checks from here.
        try {
          const real = await route.fetch();
          const body = await real.json().catch(() => []);
          if (!Array.isArray(body)) return route.fulfill({ response: real });
          return json([...body.filter((r) => r.tool_type !== 'strategic-alignment'), ...store.rows]);
        } catch {
          // The page closed (or went offline) while it was asked.
          return route.abort().catch(() => {});
        }
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        const list = Array.isArray(body) ? body : [body];
        if (!list.every((r) => r.tool_type === 'strategic-alignment')) return route.fallback();
        const saved = list.map((r) => {
          const i = store.rows.findIndex((x) => x.id === r.id);
          const row = { ...(i >= 0 ? store.rows[i] : { created_at: new Date().toISOString() }), ...r, updated_at: new Date().toISOString() };
          if (i >= 0) store.rows[i] = row; else store.rows.push(row);
          store.writes.push(row);
          return row;
        });
        return json(saved, 201);
      }
      if (req.method() === 'DELETE' && idEq && store.rows.some((r) => r.id === idEq)) {
        const gone = store.rows.filter((r) => r.id === idEq);
        store.rows = store.rows.filter((r) => r.id !== idEq);
        store.deletes.push(idEq);
        return json(gone);
      }
      return route.fallback();
    });
  }
  // The person's page settings (person_settings.page_preferences), answered
  // here so the offer row's counting is the test's own and nothing is saved:
  // opts.offers (the offers object; by default the Quick guide's offer has
  // been taken, so the one-off tip shows as it did before the offer row).
  store.prefs = { offers: opts.offers === undefined ? { 'health-check-guide': { taken: true } } : opts.offers };
  store.prefWrites = [];
  await ctx.route(/\/rest\/v1\/person_settings(\?|$)/, async (route) => {
    const req = route.request();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    // The real answer is read as asked (Home and the rest need its other settings); only the offers in it
    // are the test's, and a change is answered here, never written.
    const withOffers = (r) => (r && typeof r === 'object' && 'page_preferences' in r
      ? { ...r, page_preferences: { ...(r.page_preferences || {}), offers: store.prefs.offers }, ...(store.prefsAt ? { updated_at: store.prefsAt } : {}) }
      : r);
    if (req.method() === 'GET') {
      try {
        const real = await route.fetch();
        const body = await real.json().catch(() => null);
        if (body === null) return route.fulfill({ response: real });
        // No row yet: the offers alone, as a row would hold them.
        const none = Array.isArray(body) && !body.length && /page_preferences/.test(decodeURIComponent(req.url()));
        if (none) return json([withOffers({ user_id: userId, page_preferences: {}, updated_at: '2026-11-14T09:00:00' })]);
        return json(Array.isArray(body) ? body.map(withOffers) : withOffers(body), real.status());
      } catch {
        return route.abort().catch(() => {});
      }
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}');
      const one = Array.isArray(body) ? body[0] : body;
      if (!one?.page_preferences) return route.fallback();
      store.prefs = { offers: one.page_preferences.offers || {} };
      store.prefWrites.push(one.page_preferences);
      store.prefsAt = new Date().toISOString().replace('Z', '');
      return json([{ ...one, user_id: userId, updated_at: store.prefsAt }], req.method() === 'POST' ? 201 : 200);
    }
    return route.fallback();
  });
  if (opts.textTwice) await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html { font-size: 32px !important; }'; document.head.appendChild(st); }); });
  if (opts.storage) await ctx.addInitScript((kept) => { try { for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v); } catch { /* blocked */ } }, opts.storage);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  // Known until Tim runs the migrations: the tool_answers table (043), guest_claim (035) and alignment_claim (044) answer 404.
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource|WebSocket|\[vite\]|Vite server/.test(m.text())) problems.push(`console: ${m.text().replace(/eyJ\S+|sb_\S+|[\w.+-]+@[\w-]+\.[\w.]+/g, '…').slice(0, 400)}`); });
  page.on('response', (r) => {
    if (r.status() >= 400 && !/tool_answers|rpc\/(guest|alignment)_claim/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url().replace(/\?.*$/, '').replace(/^https?:\/\/[^/]+/, '')}`);
  });
  return { ctx, page, store, problems, fonts, sent, userId };
}

/** Opens an address of the inside Health Check and waits for it. */
export async function open(page, path = BASE) {
  await page.goto(`${APP}${path}`);
  await page.locator('.ds-page-title, .ds-guide-question, .ds-guide-title, .ds-error').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
}
