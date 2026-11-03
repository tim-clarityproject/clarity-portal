// Phase 4 step 7: migration 039's device-first stores in the running app,
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/store-039.mjs
//
// A. Without 039 (the test database as it is, so the tables really are
//    missing): Sleep wind down's thoughts and the day's habits are kept on
//    the device, shown as Saved, with no error and no write to a 039 table.
// B. With 039 "there": the two tables (and person_settings, so the real
//    account is never written) answered by an in-memory stand-in for
//    PostgREST, routed in the browser. Mocking the REST answers was chosen
//    over a rolled-back SQL check because it runs the app's own reads and
//    writes from start to finish; the SQL those make is checked in
//    supabase/039_day_habits_and_wind_down_test.sql (2k to 2o, 3j to 3m).
//      - what waited on the device moves across once, on opening Home;
//      - another device's choice shows here after a reload;
//      - thoughts typed save to wind_down_nights, the device keeping a copy;
//      - the orb: the account's choice wins over the device's copy, and a
//        choice is saved beside the menu's pins, never over them.
// C. With 039 (and 038) really there (Tim ran them on the test project,
//    3 Nov): what the older app kept on the device (a day's habit, last
//    night's thoughts, an end-of-sprint review's answers) moves across to
//    the real tables once, on opening Home and the sprint page; the device
//    marks them sent (the review's answers are taken off it); opening again
//    sends nothing new. Every row it makes is deleted afterwards.
// Part A runs only while the 039 tables are missing, part C only once they
// are there. Part A writes only to the device, part B only to the
// stand-in, part C only rows it deletes again. The clock is fixed (Wed 21
// Oct 2026, 22:30 London).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { londonInstant } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const NIGHT = '2026-10-21';
const YESTERDAY = '2026-10-20';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const TABLES_039 = ['day_plan_habits', 'wind_down_nights'];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = signIn.user.id;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return v;
}

// ---------------------------------------------------------------- a stand-in for PostgREST
// Tables in memory, answering the few requests supabase-js makes: select
// with eq and gte filters, upsert (merge or ignore duplicates, on the
// table's key), and update matched by its filters (the save-version
// guard's updated_at among them). updated_at moves on with every write.
function restStandIn(keys) {
  const tables = Object.fromEntries(Object.keys(keys).map((t) => [t, []]));
  const calls = [];
  let clock = 0;
  const stamp = () => { clock += 1; return `2026-10-21T21:00:${String(clock).padStart(2, '0')}.000Z`; };
  const id = () => `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;
  const same = (a, b) => `${a}` === `${b}` || (Date.parse(a) && Date.parse(a) === Date.parse(`${b}`.replace(' ', '+')));
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    const rows = tables[table];
    const filters = [...url.searchParams].filter(([k]) => !['select', 'limit', 'on_conflict', 'order', 'columns'].includes(k));
    const match = (r) => filters.every(([k, v]) => {
      const [op, ...rest] = v.split('.');
      const val = rest.join('.');
      if (op === 'eq') return same(r[k], val);
      if (op === 'gte') return `${r[k]}` >= val;
      return true;
    });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const method = req.method();
    calls.push({ table, method, url: req.url(), body: req.postData() });
    if (method === 'GET' || method === 'HEAD') {
      let out = rows.filter(match);
      if (url.searchParams.get('limit')) out = out.slice(0, Number(url.searchParams.get('limit')));
      return json(200, out);
    }
    const body = JSON.parse(req.postData() || '{}');
    if (method === 'POST') {
      const prefer = req.headers().prefer || '';
      const key = (url.searchParams.get('on_conflict') || keys[table].join(',')).split(',');
      const out = [];
      for (const v of Array.isArray(body) ? body : [body]) {
        const hit = rows.find((r) => key.every((k) => same(r[k], v[k])));
        if (hit && /ignore-duplicates/.test(prefer)) continue;
        if (hit) out.push({ ...Object.assign(hit, v, { updated_at: stamp() }) });
        else {
          const row = { id: id(), created_at: stamp(), ...v, updated_at: stamp() };
          rows.push(row);
          out.push({ ...row });
        }
      }
      return json(201, out);
    }
    if (method === 'PATCH') {
      const out = rows.filter(match).map((r) => ({ ...Object.assign(r, body, { updated_at: stamp() }) }));
      return json(200, out);
    }
    if (method === 'DELETE') {
      const out = rows.filter(match);
      tables[table] = rows.filter((r) => !match(r));
      return json(200, out);
    }
    return json(405, {});
  }
  return { tables, calls, handle, stamp };
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function signedIn({ standIn = null, onRequest } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await context.clock.install({ time: londonInstant(NIGHT, '22:30') });
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    onRequest?.(req);
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (standIn) {
      const m = /\/rest\/v1\/([a-z_]+)/.exec(url);
      if (m && standIn.tables[m[1]]) return standIn.handle(route);
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass('no page errors', false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  if (new URL(page.url()).pathname !== '/welcome') await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
  return { context, page };
}

const device = (page, key) => page.evaluate((k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
}, key);
const nightsKey = `clarity-cache:${me}:wind-down-nights`;
const planKey = (date) => `clarity-day-plan-local:${me}:${date}`;

async function typeThought(page, text) {
  await page.goto(`${APP}/sleep-wind-down`);
  await page.getByRole('heading', { name: 'What’s on your mind for tomorrow?' }).waitFor({ timeout: 20000 });
  await page.getByRole('textbox', { name: 'Thought 1' }).fill(text);
  return until(async () => (await page.locator('.ds-guide-bar').innerText()).includes('Saved'), 10000);
}
const errorShown = (page) => page.locator('.ds-toast--error, [role=alert]').filter({ hasText: /didn’t save|went wrong/i }).count();

const tablesThere = (await Promise.all(TABLES_039.map(async (t) => (await db.from(t).select('id').limit(1)).error?.code || 'there'))).every((c) => c === 'there');
console.log(tablesThere ? '039 is on the test database: parts B and C.' : '039 is not on the test database yet: parts A and B.');

try {
  // ---------------------------------------------------------------- A. without 039
  if (!tablesThere) {
    const writes = [];
    const reads = [];
    const { context, page } = await signedIn({
      onRequest: (req) => {
        const m = /\/rest\/v1\/([a-z_]+)/.exec(req.url());
        if (!m || !TABLES_039.includes(m[1])) return;
        (req.method() === 'GET' || req.method() === 'HEAD' ? reads : writes).push(`${req.method()} ${m[1]}`);
      },
    });
    const tables = await Promise.all(TABLES_039.map(async (t) => (await db.from(t).select('id').limit(1)).error?.code || 'there'));
    pass('A: the test database has no 039 tables (as expected before Tim runs it)', tables.every((c) => c === 'PGRST205'), tables.join(', '));

    pass('A: a thought typed shows Saved', Boolean(await typeThought(page, 'Store test thought')));
    const kept = (await device(page, nightsKey))?.[NIGHT];
    pass('A: the thought is kept on the device for tonight', kept?.thoughts?.includes('Store test thought'), JSON.stringify(kept));
    pass('A: ... marked as still to be sent (moved across once 039 runs)', kept?.sent === false, JSON.stringify(kept));
    pass('A: no error shown', (await errorShown(page)) === 0);

    // The day's habits, through the app's own module (the same one Plan my day uses).
    const r = await page.evaluate(async ({ uid, h }) => {
      const m = await import('/src/lib/performance/dayPlanHabits.js');
      const out = await m.saveDayChoices(uid, '2026-10-21', { habits: [h], order: [`habit:${h}`], top: `habit:${h}` });
      return { status: out.status, read: m.readDayChoices(uid, '2026-10-21') };
    }, { uid: me, h: H1 });
    pass('A: a habit chosen for the day answers "device", as before', r.status === 'device', JSON.stringify(r));
    pass('A: ... and is read back from the device', r.read?.habits?.[0] === H1 && r.read.top === `habit:${H1}`, JSON.stringify(r.read));

    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
    await sleep(1500); // Home's quiet refresh has had its chance (it does nothing without 039)
    pass('A: Home opens with no error', (await errorShown(page)) === 0);
    pass('A: nothing is ever written to a 039 table', writes.length === 0, writes.join(', '));
    pass('A: only the quiet "is it there yet?" reads were made', reads.length > 0 && reads.every((x) => x.startsWith('GET')), reads.join(', '));
    const still = (await device(page, nightsKey))?.[NIGHT];
    pass('A: the device copy is unchanged after Home', still?.thoughts?.includes('Store test thought') && still.sent === false);
    await context.close();
  }

  // ---------------------------------------------------------------- B. with 039 there (stand-in)
  {
    const rest = restStandIn({ day_plan_habits: ['user_id', 'local_date'], wind_down_nights: ['user_id', 'night'], person_settings: ['user_id'] });
    rest.tables.person_settings.push({ user_id: me, page_preferences: { menu_pins: ['breathe'], orb_style: 'level' }, updated_at: rest.stamp() });
    const { context, page } = await signedIn({ standIn: rest });
    // What the older app kept on the device: a day's habit and last night's thoughts.
    await page.evaluate(({ nk, pk, h }) => {
      localStorage.setItem(pk, JSON.stringify({ habits: [h], order: [`habit:${h}`], top: `habit:${h}` }));
      localStorage.setItem(nk, JSON.stringify({ '2026-10-20': { thoughts: ['Legacy thought'], finishedAt: '2026-10-20T21:40:00.000Z', sound: 'off' } }));
      localStorage.setItem('clarity-orb-style', 'rings');
    }, { nk: nightsKey, pk: planKey(NIGHT), h: H1 });
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });

    const movedDay = await until(() => rest.tables.day_plan_habits.find((r) => r.local_date === NIGHT && r.user_id === me), 15000);
    pass('B: the day\'s habit waiting on the device is moved across', movedDay?.habit_ids?.[0] === H1 && movedDay.top_pick === `habit:${H1}`, JSON.stringify(movedDay));
    const movedNight = await until(() => rest.tables.wind_down_nights.find((r) => r.night === YESTERDAY), 15000);
    pass('B: last night\'s thoughts are moved across, finished time and all', movedNight?.thoughts?.[0] === 'Legacy thought' && Boolean(movedNight.finished_at), JSON.stringify(movedNight));
    const marked = await until(async () => (await device(page, planKey(NIGHT)))?.sent === true && (await device(page, nightsKey))?.[YESTERDAY]?.sent === true, 10000);
    pass('B: ... and the device keeps them, marked as sent', Boolean(marked));
    const postsBefore = rest.calls.filter((c) => c.method === 'POST' && TABLES_039.includes(c.table)).length;
    await page.reload();
    await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
    await sleep(1500);
    pass('B: moved once: opening Home again sends nothing new', rest.calls.filter((c) => c.method === 'POST' && TABLES_039.includes(c.table)).length === postsBefore);

    // The orb: the account's Level wins over the device's Rings.
    pass('B: the account\'s orb choice (Level) wins over the device\'s copy', Boolean(await until(async () => (await page.evaluate(() => localStorage.getItem('clarity-orb-style'))) === 'level', 10000)));

    // Another device chooses a different habit for today.
    Object.assign(movedDay, { habit_ids: [H2], pick_order: [`habit:${H2}`], top_pick: `habit:${H2}`, updated_at: rest.stamp() });
    await page.reload();
    await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
    const shown = await until(async () => (await device(page, planKey(NIGHT)))?.habits?.[0] === H2, 10000);
    pass('B: another device\'s choice for today shows here', Boolean(shown), JSON.stringify(await device(page, planKey(NIGHT))));

    // Thoughts typed tonight go to the table, the device keeping a copy.
    pass('B: a thought typed shows Saved', Boolean(await typeThought(page, 'Mocked thought')));
    const saved = await until(() => rest.tables.wind_down_nights.find((r) => r.night === NIGHT && r.thoughts?.includes('Mocked thought')), 10000);
    pass('B: ... it is in wind_down_nights for tonight', Boolean(saved), JSON.stringify(rest.tables.wind_down_nights));
    const copy = (await device(page, nightsKey))?.[NIGHT];
    pass('B: ... and on the device too (the offline cache)', copy?.thoughts?.includes('Mocked thought'));
    pass('B: no error shown', (await errorShown(page)) === 0);

    // An orb choice is saved beside the pins, never over them.
    await page.evaluate(async (uid) => {
      const m = await import('/src/lib/menuPins.js');
      await m.setPreference(uid, 'orb_style', 'rings');
    }, me);
    const prefs = await until(() => (rest.tables.person_settings[0]?.page_preferences?.orb_style === 'rings' ? rest.tables.person_settings[0].page_preferences : null), 10000);
    pass('B: the orb choice is saved to the account', prefs?.orb_style === 'rings', JSON.stringify(rest.tables.person_settings));
    pass('B: ... and the pins stay', JSON.stringify(prefs?.menu_pins) === JSON.stringify(['breathe']), JSON.stringify(prefs));
    await context.close();
  }

  // ---------------------------------------------------------------- C. with 039 really there
  if (tablesThere) {
    const sprint = (await db.from('sprints').select('id').eq('user_id', me).eq('status', 'running').limit(1)).data?.[0];
    const habit = sprint && (await db.from('sprint_habits').select('id').eq('sprint_id', sprint.id).limit(1)).data?.[0];
    pass('C: the seeded client has a running sprint with a habit', Boolean(habit));
    const had = {
      day: (await db.from('day_plan_habits').select('id').eq('user_id', me).eq('local_date', NIGHT)).data || [],
      night: (await db.from('wind_down_nights').select('id').eq('user_id', me).eq('night', YESTERDAY)).data || [],
      review: (await db.from('sprint_reviews').select('id').eq('user_id', me).eq('sprint_id', sprint.id)).data || [],
    };
    pass('C: nothing for these days is in the tables before', !had.day.length && !had.night.length && !had.review.length, JSON.stringify(had));
    const posts = [];
    const { context, page } = await signedIn({
      onRequest: (req) => {
        const m = /\/rest\/v1\/([a-z_]+)/.exec(req.url());
        if (m && req.method() === 'POST' && [...TABLES_039, 'sprint_reviews'].includes(m[1])) posts.push(m[1]);
      },
    });
    try {
      const reviewKey = `clarity-cache:${me}:performance-sprint-review-answers`;
      await page.evaluate(({ nk, pk, rk, h, sid }) => {
        localStorage.setItem(pk, JSON.stringify({ habits: [h], order: [`habit:${h}`], top: `habit:${h}` }));
        localStorage.setItem(nk, JSON.stringify({ '2026-10-20': { thoughts: ['Device thought'], finishedAt: '2026-10-20T21:40:00.000Z', sound: 'off' } }));
        localStorage.setItem(rk, JSON.stringify({ v: { [sid]: { worked: 'Morning plans', next: 'Earlier nights', choice: 'sprint', at: null, finishedAt: '2026-10-20T19:00:00.000Z' } }, at: Date.now() }));
      }, { nk: nightsKey, pk: planKey(NIGHT), rk: reviewKey, h: habit.id, sid: sprint.id });
      await page.goto(`${APP}/welcome`);
      await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
      const day = await until(async () => (await db.from('day_plan_habits').select('*').eq('user_id', me).eq('local_date', NIGHT)).data?.[0], 15000);
      pass('C: the day\'s habit waiting on the device is in day_plan_habits', day?.habit_ids?.[0] === habit.id && day.top_pick === `habit:${habit.id}`, JSON.stringify(day));
      const night = await until(async () => (await db.from('wind_down_nights').select('*').eq('user_id', me).eq('night', YESTERDAY)).data?.[0], 15000);
      pass('C: last night\'s thoughts are in wind_down_nights, finished time and all', night?.thoughts?.[0] === 'Device thought' && Boolean(night.finished_at), JSON.stringify(night));
      const marked = await until(async () => (await device(page, planKey(NIGHT)))?.sent === true && (await device(page, nightsKey))?.[YESTERDAY]?.sent === true, 10000);
      pass('C: ... and the device keeps them, marked as sent', Boolean(marked));

      await page.goto(`${APP}/performance-sprint`);
      await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
      const review = await until(async () => (await db.from('sprint_reviews').select('*').eq('user_id', me).eq('sprint_id', sprint.id)).data?.[0], 15000);
      pass('C: the review\'s answers waiting on the device are in sprint_reviews (038)', review?.worked_best === 'Morning plans' && review.next_better === 'Earlier nights' && review.next_choice === 'sprint', JSON.stringify(review));
      const off = await until(async () => !((await device(page, reviewKey))?.v || {})[sprint.id], 10000);
      pass('C: ... and taken off the device', Boolean(off));

      const sent = posts.length;
      await page.goto(`${APP}/welcome`);
      await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
      await page.goto(`${APP}/performance-sprint`);
      await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
      await sleep(1500);
      pass('C: moved once: opening Home and the sprint again sends nothing new', posts.length === sent, `${sent} then ${posts.length}`);
      const counts = await Promise.all([
        db.from('day_plan_habits').select('id').eq('user_id', me).eq('local_date', NIGHT),
        db.from('wind_down_nights').select('id').eq('user_id', me).eq('night', YESTERDAY),
        db.from('sprint_reviews').select('id').eq('user_id', me).eq('sprint_id', sprint.id),
      ]);
      pass('C: one row each, never two', counts.every((c) => c.data?.length === 1), counts.map((c) => c.data?.length).join(', '));
      pass('C: no error shown', (await errorShown(page)) === 0);
    } finally {
      await context.close();
      // Leave the test database as it was.
      await db.from('day_plan_habits').delete().eq('user_id', me).eq('local_date', NIGHT);
      await db.from('wind_down_nights').delete().eq('user_id', me).eq('night', YESTERDAY);
      await db.from('sprint_reviews').delete().eq('user_id', me).eq('sprint_id', sprint.id);
      const left = await Promise.all([
        db.from('day_plan_habits').select('id').eq('user_id', me).eq('local_date', NIGHT),
        db.from('wind_down_nights').select('id').eq('user_id', me).eq('night', YESTERDAY),
        db.from('sprint_reviews').select('id').eq('user_id', me).eq('sprint_id', sprint.id),
      ]);
      pass('C: tidy: the rows it made are deleted', left.every((c) => (c.data || []).length === 0));
    }
  }
} catch (e) {
  pass('the run finished', false, e.message.split('\n')[0]);
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
