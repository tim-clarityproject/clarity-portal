// The break-it tester for the calendar and booking (Phase 6a run 3, 20 Nov).
// Each case is a named check.
//
//   b-double   double bookings: two guests racing for one start (the same tick,
//              and a stale page), a guest against the coach's own Book a call,
//              a client's own booking against a guest, the 15-minute gap, a
//              sixth call in a day, Confirm pressed twice, a single-use link
//              open in two tabs
//   b-tabs     two tabs: the same item moved in both, edited in one and
//              deleted in the other, working hours edited while the other
//              books, a poll's winner chosen in both, Open for calls in both
//   b-offline  offline and back: made, moved, deleted, a to-do placed, a call
//              booked; a booking page offline; each waiting save sent once, in
//              order; the Google sync backs off and resumes
//   b-midnight a call dragged and resized across midnight, in the second time
//              column's zone too; the clock-change nights' missing and repeated
//              hours
//   b-repeat   "this and following", then the original edited "all", then one
//              of the following deleted; monthly on the 31st; a repeat that ends
//              before it starts; a series of 500
//   b-forced   a booking at 02:00 the guest's time, and booking_make called
//              directly with things no page would send
//   b-google   a Google change while a call is being edited, both sides changed
//              between rounds, an event deleted while its panel is open, awkward
//              events, the sync run twice at once
//   b-reach    who sees what: the other coach's items, pages and keys; wrong
//              keys signed out; the device copy; what a public page is given
//   b-odd      awkward titles and typed times, 0 minutes and 24 hours, 60 pasted
//              guests, 40 items at once, 1,000 in a month, a damaged device copy,
//              midnight with the calendar open, two calls at once in the bar, a
//              reminder claimed twice, twice the text size, Back out of every
//              panel, the working-hours handles dragged past each other
//
// Unless a case says "device only", 049 to 051 are answered by the stand-in in
// shared.mjs and cal-standin.mjs, shaped as the SQL (`strict`: nothing but a
// read ever reaches the test project; a write the stand-in doesn't know is
// listed as `blocked` and fails the part). 051's own SQL is tried separately on
// the local PGlite stand-in, never anything hosted. The page's clock is pinned
// to a day at or before the real one. Every /api/ call is answered by a
// stand-in: nothing is ever sent.
//
//   PARTS=b-double,b-tabs,b-offline,b-midnight,b-repeat,b-forced,b-google,b-reach,b-odd
//   ROLES=owner,associate (owner by default; b-reach always walks both)
//   SHOTS=<folder> keeps pictures of the crowded day and the big text.
import { chromium } from 'playwright';
import { coachRowsWaiting } from '../../src/lib/coach/copyWaiting.js';
import { accountId, APP, clearDevice, coachContext, makeReport, ME, OTHER, readEnv, seedDevice, settle, standIn, TABLES_059 } from './shared.mjs';
import { CAL, DAY, ID, seedClock, seedWithCal } from './seed.mjs';
import { bookStore, guestStandIn } from './book-standin.mjs';
import { addDays, instantAt, wallClock } from '../../src/lib/time/index.js';

export const CAL_BREAK_PARTS = ['b-double', 'b-tabs', 'b-offline', 'b-midnight', 'b-repeat', 'b-forced', 'b-google', 'b-reach', 'b-odd'];
const TUE = new Date(2026, 10, 17, 9, 0);
const LON = 'Europe/London';
const NY = 'America/New_York';
const D = { mon: '2026-11-16', tue: '2026-11-17', wed: '2026-11-18', thu: '2026-11-19', fri: '2026-11-20', nextMon: '2026-11-23', nextThu: '2026-11-26', nextFri: '2026-11-27' };
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
const TAKEN = 'That time has just been taken. Choose another.';

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 5000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 500); };
const press = async (scope, page, name) => { await scope.getByRole('button', { name, exact: true }).first().click(); await settle(page, 500); };
const pick = async (scope, page, label, option) => {
  await scope.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const tile = (page, day, text) => page.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: text }).first();
const words = (page) => page.evaluate(() => document.querySelector('.cc-app')?.innerText || document.body.innerText);
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** Where a minute of a day is on the screen (`f`: how far across the day's column). */
const point = (page, day, minutes, f = 0.5) => page.evaluate(([d, m, fx]) => {
  const r = document.querySelector(`[data-cal-day="${d}"]`).getBoundingClientRect();
  const hours = document.querySelectorAll('.cc-cal-times')[1].querySelectorAll('.cc-cal-hour');
  const from = Number(hours[0].textContent.slice(0, 2)) * 60;
  return { x: r.left + r.width * fx, y: r.top + ((m - from) / (hours.length * 60)) * r.height };
}, [day, minutes, f]);
const dragTo = async (page, from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up(); await settle(page, 800);
};
/** Drags a tile by its top to another day and so many minutes later. */
const dragTile = async (page, loc, { toDay, fromDay, minutes = 0 }) => {
  const b = await loc.boundingBox();
  const a = await point(page, fromDay, 600);
  const z = await point(page, toDay, 600 + minutes);
  const from = { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 8) };
  await dragTo(page, from, { x: from.x + (z.x - a.x), y: from.y + (z.y - a.y) });
};
/** Two presses in the same moment: both clicks land before the page can draw anything. */
const twice = (locator) => locator.evaluate((el) => { el.click(); el.click(); });

const report = makeReport('The calendar and booking, the break-it tester');
const { pass } = report;
const parts = (process.env.PARTS || CAL_BREAK_PARTS.join(',')).split(',');
const has = (p) => parts.includes(p);
const roles = (process.env.ROLES || 'owner').split(',');
const SHOTS = process.env.SHOTS || null;
const browser = await chromium.launch();

/**
 * A signed-in coach on a pinned moment. One stand-in answers every tab of the context.
 * `db: 'there'`: the seed is in the stand-in database (049 to 051); `'none'`: it is on the device and every write is stopped.
 */
async function openAt({ role = 'owner', db = 'there', when = TUE, size = 1440, path = '/coach/calendar?view=week', tag, change = null, standIns = false, theme = null, zone = null }) {
  const there = db === 'there';
  const mode = theme || (role === 'owner' ? 'light' : 'dark');
  const ctx = await coachContext(browser, { size, theme: mode });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const errors = [];
  const reached = [];
  const waits = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    // Anything but a read that a real server answered (a stand-in's answer has no server behind it) is a write that got out.
    page.on('response', (res) => {
      const req = res.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
      waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
    });
  };
  // The page's clock and the stand-in database's are one, and a walk can move both on.
  let clock = new Date(when);
  await ctx.clock.setFixedTime(clock);
  seedClock(when);
  const rows = seedWithCal({ accounts: true });
  if (change) change(rows);
  const store = await standIn(ctx, there ? { role, db: 'there', day: true, cal: true, strict: true, rows, now: () => new Date(clock) } : { role, db: 'none' });
  if (!there) await ctx.route('**/rest/v1/rpc/**', (route) => json(route, null));
  const read = (body) => (route) => (route.request().method() === 'GET' ? json(route, body) : route.fallback());
  for (const t of ['peak_moments', 'week_scores', 'peak_reviews', 'checkins']) await ctx.route(`**/rest/v1/${t}*`, read([]));
  await ctx.route('**/rest/v1/session_prep*', read(null));
  const page = await ctx.newPage();
  watch(page);
  if (size === 1440) await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  const me = await accountId(page);
  await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), mode);
  await clearDevice(page, me);
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:')) localStorage.removeItem(k); });
  if (!there) await seedDevice(page, me, rows);
  if (standIns) await page.evaluate((id) => localStorage.setItem(`clarity-cache:${id}:coach-standin-on`, JSON.stringify({ google: true, zoom: true })), me);
  const goOn = async (p, to, wait = 1300) => { await p.goto(`${APP}${to}`); await p.waitForSelector('.cc-app', { timeout: 20000 }); await settle(p, wait); };
  await goOn(page, path);
  const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
    const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
    const marks = s.marks?.[t] || {};
    return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
  }, [me, table]));
  return {
    ctx, page, store, me, there, tag, rows, errors, rowsNow, zone,
    go: (to, wait) => goOn(page, to, wait),
    tab: async (to) => { const p = await ctx.newPage(); watch(p); if (size === 1440) await p.setViewportSize({ width: 1440, height: 1500 }); await goOn(p, to); return p; },
    one: async (table, id) => (await rowsNow(table)).find((r) => r.id === id) || null,
    count: async (table, test = () => true) => (await rowsNow(table)).filter(test).length,
    /** Moves the clock (every tab's and the stand-in database's); a device-only page is told "not yet" again, as it lasts an hour of the page's clock. */
    setClock: async (date, to = null) => {
      clock = new Date(date);
      await ctx.clock.setFixedTime(clock);
      if (!there) await ctx.addInitScript(() => { try { for (const k of ['clarity-coach-not-yet', 'clarity-coach-day-not-yet', 'clarity-coach-cal-not-yet']) localStorage.setItem(k, String(Date.now())); } catch { /* blocked */ } });
      if (to) await goOn(page, to); else { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(page, 600); }
    },
    /** Moves the clock only: no page is told the tab was shown again (so no round of the sync starts by itself). */
    tick: async (date) => { clock = new Date(date); await ctx.clock.setFixedTime(clock); },
    round: async (p = page) => { await p.evaluate(() => window.__clarityCalSync.round()); await settle(p, 1200); },
    done: async ({ allow = null, refusals = null, api = [], waiting = false } = {}) => {
      await settle(page, 500).catch(() => {});
      await Promise.all(waits);
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      const asked = store.calls.filter((c) => c.startsWith('api ') && !api.some((a) => c.includes(a)));
      pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
      pass(`${tag}: nothing but a read reached the test project`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
      pass(`${tag}: nothing was asked of the portal's server that could send`, asked.length === 0, [...new Set(asked)].slice(0, 5).join('; '));
      if (there && refusals != null) {
        const refused = store.calls.filter((c) => c.startsWith('refused'));
        pass(`${tag}: the database refused ${refusals === 0 ? 'nothing the page sent' : `only what it should (${refusals})`}`, refused.length === refusals, [...new Set(refused)].slice(0, 6).join('; '));
      }
      // 059's Google calendars and busy times (run 8) are kept on the device by design until 059 is there (coach rule 48),
      // and the stand-in's "there" is 049 to 052: only another table's rows still waiting to be sent count (the app's own
      // count, coachRowsWaiting; a copy written whole while those wait holds every table's sent rows too).
      if (there && !waiting) {
        const copy = await page.evaluate((id) => JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || 'null'), me).catch(() => ({ overflow: 1 }));
        const others = copy && { ...copy, rows: Object.fromEntries(Object.entries(copy.rows || {}).filter(([t]) => !TABLES_059.includes(t))) };
        const left = others ? coachRowsWaiting(others) : 0;
        pass(`${tag}: nothing waits on the device`, left === 0, `${left} rows`);
      }
      const seen = errors.filter((e) => !(allow && allow.test(e)));
      pass(`${tag}: no page error`, seen.length === 0, [...new Set(seen)].slice(0, 4).join(' | '));
      await clearDevice(page, me).catch(() => {});
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:')) localStorage.removeItem(k); }).catch(() => {});
      await ctx.close();
    },
  };
}

/** A signed-out guest's page in front of a stand-in database (a coach page's own, or bookStore()'s). */
async function guestPage(store, { size = 1440, theme = 'light', when = TUE, timezoneId = undefined } = {}) {
  const ctx = await browser.newContext({ viewport: size === 400 ? { width: 400, height: 860 } : { width: 1440, height: 1200 }, serviceWorkers: 'block', colorScheme: theme, acceptDownloads: true, hasTouch: size === 400, timezoneId });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.clock.setFixedTime(when);
  await guestStandIn(page, store);
  const open = async (path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-public', { timeout: 20000 }); await settle(page, 1000); };
  return { page, ctx, errors, open, words: () => page.locator('.cc-public').textContent() };
}

/** Fills a booking page's form for the first free time (or a time by its words) and leaves it ready to press. */
async function readyToBook(g, { name, email, time = null, answer = 'A first conversation.' }) {
  const t = time ? g.page.locator('.cc-book-time', { hasText: time }).first() : g.page.locator('.cc-book-time').first();
  await t.click(); await settle(g.page, 300);
  if (await g.page.getByLabel('Your name').count()) await g.page.getByLabel('Your name').fill(name);
  await g.page.getByLabel('Your email').fill(email);
  const q = g.page.getByLabel('What would you like from the call?');
  if (await q.count()) await q.fill(answer);
  return (await g.page.locator('.cc-book-when').textContent().catch(() => '')) || '';
}
const bookButton = (g) => g.page.locator('.cc-book-form .ds-btn--primary');

const PARTS = {};

// PARTS are added below, each `PARTS['b-…'] = async (role) => { … }`.

/** Chooses a day in one of a panel's date boxes (the box is found by its label's words). */
async function pickDate(scope, page, label, key) {
  const labelled = scope.locator('.ds-choice', { hasText: label }).locator('.ds-date');
  await ((await labelled.count()) ? labelled.first() : scope.locator('.ds-date').first()).click(); await settle(page, 350);
  for (let i = 0; i < 14 && !(await page.locator(`[data-key="${key}"]`).count()); i += 1) { await page.getByRole('button', { name: 'Next month', exact: true }).last().click(); await settle(page, 150); }
  await page.locator(`[data-key="${key}"]`).last().click(); await settle(page, 400);
}
const tiles = (page, day, text) => page.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: text });
/** A seeded item in 051's own shape. */
const seedItem = (id, title, day, from, to, extra = {}) => ({
  id, coach_id: ME, kind: 'own_time', calendar: 'work', title, starts_at: at(day, from, extra.time_zone || LON), ends_at: at(day, to, extra.time_zone || LON), time_zone: LON, all_day: false, starts_on: null, ends_on: null,
  repeat_rule: null, series_id: null, occurrence_on: null, removed: false, split_from: null, location: null, place_kind: null, meeting_link: null, meeting_id: null, notes: null, attachments: [], reminders: [],
  busy: true, private: false, profile_id: null, group_id: null, session_id: null, poll_option_id: null, travel_for: null, google_event_id: null, google_calendar_id: null, google_etag: null, google_synced_at: null,
  moved_in_google_at: null, created_at: at('2026-10-20', '09:00'), ...extra,
});

// ================================================================ 5. repeats
PARTS['b-repeat'] = async (role) => {
  const STANDUP = u(9501);
  const MONTHEND = u(9502);
  const WALK = u(9503);
  const tag = `repeat, ${role}`;
  const t = await openAt({ role, tag, change: (rows) => {
    rows.coach_cal_items.push(
      seedItem(STANDUP, 'Standup', '2026-10-21', '16:00', '16:30', { repeat_rule: { every: 'week' } }),
      seedItem(MONTHEND, 'Month end', '2026-08-31', '10:00', '10:30', { repeat_rule: { every: 'month', by: 'date' } }),
    );
  } });
  const { page } = t;
  const items = () => t.rowsNow('coach_cal_items');

  // ---- "this and following", then the original edited "all", then one of the following deleted
  await tile(page, D.tue, 'Training').click(); await settle(page, 700);
  await dialog(page).getByLabel('Starts').fill('10:00');
  await dialog(page).getByRole('radio', { name: 'This and following' }).click(); await settle(page, 300);
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  let all = await items();
  const next = all.find((i) => i.split_from === CAL.training);
  pass(`${tag}: "this and following" cuts the series the day before and starts a new one`, all.find((i) => i.id === CAL.training)?.repeat_rule?.until === D.mon && Boolean(next) && same(next.starts_at, at(D.tue, '10:00')));
  await tile(page, D.mon, 'Training').click(); await settle(page, 700);
  await dialog(page).getByLabel('Starts').fill('09:30');
  await dialog(page).getByRole('radio', { name: 'All of them' }).click(); await settle(page, 300);
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  all = await items();
  const old = all.find((i) => i.id === CAL.training);
  pass(`${tag}: then the original edited "all": the older times move, and the series still ends where it was cut`, wallClock(old.starts_at, LON).time === '09:30' && old.repeat_rule?.until === D.mon, JSON.stringify([old.starts_at, old.repeat_rule]));
  pass(`${tag}: the following ones keep their own time (10:00), and nothing shows twice`, same(all.find((i) => i.id === next.id).starts_at, at(D.tue, '10:00'))
    && (await tiles(page, D.mon, 'Training').count()) === 1 && (await tiles(page, D.tue, 'Training').count()) === 1
    && /09:30/.test(await tile(page, D.mon, 'Training').textContent()) && /10:00/.test(await tile(page, D.tue, 'Training').textContent()), `${await tiles(page, D.mon, 'Training').count()} on Mon, ${await tiles(page, D.tue, 'Training').count()} on Tue`);
  await t.go('/coach/calendar?view=week&day=2026-11-23');
  pass(`${tag}: next week has one Training a day, at the new time`, (await tiles(page, '2026-11-23', 'Training').count()) === 1 && (await tiles(page, '2026-11-24', 'Training').count()) === 1 && /10:00/.test(await tile(page, '2026-11-23', 'Training').textContent()));
  await tile(page, '2026-11-24', 'Training').click(); await settle(page, 700);
  await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page, 1000);
  pass(`${tag}: then one of the following deleted: only that one goes`, (await tiles(page, '2026-11-24', 'Training').count()) === 0 && (await tiles(page, '2026-11-23', 'Training').count()) === 1 && (await toast(page)) === 'Deleted', await toast(page));
  await t.go('/coach/calendar?view=week&day=2026-11-30');
  pass(`${tag}: and the week after still has both`, (await tiles(page, '2026-11-30', 'Training').count()) === 1 && (await tiles(page, '2026-12-01', 'Training').count()) === 1);
  await t.go('/coach/calendar?view=week&day=2026-11-09');
  pass(`${tag}: and last week's are the original's, at 09:30, once each`, (await tiles(page, '2026-11-09', 'Training').count()) === 1 && (await tiles(page, '2026-11-10', 'Training').count()) === 1 && /09:30/.test(await tile(page, '2026-11-10', 'Training').textContent()));

  // ---- "this and following" with the rule itself changed (weekly to every 2 weeks)
  await t.go('/coach/calendar?view=week');
  await tile(page, D.wed, 'Standup').click(); await settle(page, 700);
  await press(dialog(page), page, 'More options');
  await pick(dialog(page), page, 'Repeats', 'Every 2 weeks');
  await dialog(page).getByRole('radio', { name: 'This and following' }).click(); await settle(page, 300);
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  all = await items();
  const fortnight = all.find((i) => i.split_from === STANDUP);
  pass(`${tag}: "this and following" with Repeats changed to every 2 weeks: the following ones follow the new rule`, fortnight?.repeat_rule?.interval === 2 && all.find((i) => i.id === STANDUP)?.repeat_rule?.until === D.tue, JSON.stringify(fortnight?.repeat_rule));
  await t.go('/coach/calendar?view=week&day=2026-11-23');
  pass(`${tag}: so the week after has no Standup, and the one after that has`, (await tiles(page, '2026-11-25', 'Standup').count()) === 0);
  await t.go('/coach/calendar?view=week&day=2026-11-30');
  pass(`${tag}: (two weeks on it is there)`, (await tiles(page, '2026-12-02', 'Standup').count()) === 1);

  // ---- monthly on the 31st: a shorter month's last day, never rolled on, never twice
  for (const [day, there] of [['2026-09-30', 1], ['2026-10-01', 0], ['2026-10-31', 1], ['2026-11-30', 1], ['2026-12-01', 0], ['2026-12-31', 1], ['2027-02-28', 1], ['2027-03-01', 0], ['2028-02-29', 1]]) {
    await t.go(`/coach/calendar?view=day&day=${day}`, 900);
    pass(`${tag}: a monthly repeat from 31 Aug ${there ? 'falls on' : 'is not on'} ${day}`, (await tiles(page, day, 'Month end').count()) === there, String(await tiles(page, day, 'Month end').count()));
  }

  // ---- a repeat whose end is before its start
  await t.go('/coach/calendar?view=week');
  await press(page, page, 'Add to calendar');
  await dialog(page).getByLabel('Title').fill('Ends before it starts');
  await press(dialog(page), page, 'More options');
  await pick(dialog(page), page, 'Repeats', 'Every week');
  await pick(dialog(page), page, 'When does it stop', 'On a day');
  await pickDate(dialog(page), page, 'Last day it repeats', '2026-11-19');
  await pickDate(dialog(page), page, 'Day', '2026-11-25');
  const before = await t.count('coach_cal_items');
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  const made = (await items()).find((i) => i.title === 'Ends before it starts');
  const line = (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || '';
  // Either it is refused calmly, or what is saved can be seen on its own day: never an item that is saved and shows nowhere.
  let seen = 0;
  if (made) { await closePanel(page); await t.go('/coach/calendar?view=day&day=2026-11-25'); seen = await tiles(page, '2026-11-25', 'Ends before it starts').count(); }
  pass(`${tag}: a repeat whose last day is before its first is refused calmly, or still shows on its day: never saved and invisible`, made ? seen === 1 : (/carry on\.$/.test(line) && (await t.count('coach_cal_items')) === before), made ? `saved with ${JSON.stringify(made.repeat_rule)} and ${seen} tiles on its day` : line);
  if (!made) await closePanel(page);

  // ---- a series of 500: the page stays quick
  await t.go('/coach/calendar?view=week');
  const quick = async (path) => { const a = Date.now(); await page.goto(`${APP}${path}`); await page.waitForSelector('[data-cal-key], .cc-month-cell, .cc-sched-row', { timeout: 20000 }); return Date.now() - a; };
  const base = { week: await quick('/coach/calendar?view=week&day=2027-03-01'), month: await quick('/coach/calendar?view=month&day=2027-03-01') };
  await t.go('/coach/calendar?view=week');
  await press(page, page, 'Add to calendar');
  await dialog(page).getByLabel('Title').fill('Daily walk');
  await press(dialog(page), page, 'More options');
  await pick(dialog(page), page, 'Repeats', 'Every day');
  await pick(dialog(page), page, 'When does it stop', 'After a number of times');
  await dialog(page).getByLabel('How many times').fill('500');
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  const walk = (await items()).find((i) => i.title === 'Daily walk');
  pass(`${tag}: a daily repeat of 500 times is one row with a rule, never 500 rows`, walk?.repeat_rule?.count === 500 && (await t.count('coach_cal_items', (i) => i.title === 'Daily walk')) === 1, JSON.stringify(walk?.repeat_rule));
  const with500 = { week: await quick('/coach/calendar?view=week&day=2027-03-01'), month: await quick('/coach/calendar?view=month&day=2027-03-01'), schedule: await quick('/coach/calendar?view=schedule') };
  console.log(`  (500 occurrences: the week 15 weeks on opens in ${with500.week} ms (${base.week} ms without it), the month in ${with500.month} ms (${base.month} ms), the Schedule in ${with500.schedule} ms)`);
  pass(`${tag}: with a series of 500 a week, a month and the Schedule each open inside 3 seconds`, with500.week < 3000 && with500.month < 3000 && with500.schedule < 3000, JSON.stringify(with500));
  await t.go('/coach/calendar?view=day&day=2028-03-30', 900);
  const last = wallClock(new Date(new Date(walk.starts_at).getTime()), LON).date;
  await t.go(`/coach/calendar?view=day&day=${addDays(last, 499)}`, 900);
  const onLast = await tiles(page, addDays(last, 499), 'Daily walk').count();
  await t.go(`/coach/calendar?view=day&day=${addDays(last, 500)}`, 900);
  pass(`${tag}: its 500th time is there and there is no 501st`, onLast === 1 && (await tiles(page, addDays(last, 500), 'Daily walk').count()) === 0, `${onLast}`);
  void WALK;
  await t.done({ refusals: 0 });
};

// ================================================================ 9. awkward things
// ODD=titles,times,length,guests,crowd,assoc,thousand,damaged,midnight,bar,big,back,handles,address narrows it.
PARTS['b-odd'] = async (role) => {
  const odd = (name) => !process.env.ODD || process.env.ODD.split(',').includes(name);
  const broke = (page) => page.evaluate(() => !document.querySelector('.cc-app') || /hit a problem/i.test(document.body.innerText));
  const quickAdd = async (page, title) => { await press(page, page, 'Add to calendar'); await dialog(page).getByLabel('Title').fill(title); await settle(page, 350); };
  const save = async (page) => { await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900); };

  // ---- titles
  if (odd('titles')) {
    const tag = `odd titles, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    const items = () => t.rowsNow('coach_cal_items');
    const long = `${'Quarterly planning with the whole leadership team '.repeat(6)}END`; // 303 characters
    await quickAdd(page, long); await save(page);
    let made = (await items()).find((i) => i.title.startsWith('Quarterly planning'));
    pass(`${tag}: a 300-character title is kept to 200 and saved (the database takes 200)`, Boolean(made) && [...made.title].length <= 200 && [...made.title].length >= 190, `${made ? [...made.title].length : 'not saved'} ${await toast(page)}`);
    const longTile = page.locator('[data-cal-key]', { hasText: 'Quarterly planning' }).first();
    pass(`${tag}: its tile stays inside its day's column`, await longTile.evaluate((el) => { const r = el.getBoundingClientRect(); const c = el.closest('[data-cal-day]').getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1; }).catch(() => false));
    await quickAdd(page, '     '); await save(page);
    pass(`${tag}: a title of only spaces is asked for, calmly`, (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'Type a title to carry on.');
    await dialog(page).getByLabel('Title').fill('\u200b\u200d\ufeff\u2060'); await save(page);
    pass(`${tag}: a title of only unseen characters is no title`, (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'Type a title to carry on.' && !(await items()).some((i) => /^[\u200b\u200d\ufeff\u2060\s]*$/.test(i.title)));
    await closePanel(page);
    for (const [what, title] of [['emoji', 'Team lunch 🎉🇬🇧👍🏽'], ['right-to-left text', 'اجتماع الفريق الأسبوعي'], ['markup', '<img src=x onerror=alert(1)> & "quotes"']]) {
      await quickAdd(page, title); await save(page);
      made = (await items()).find((i) => i.title === title);
      const shown = await page.locator('[data-cal-key] .cc-cal-title', { hasText: title }).count();
      pass(`${tag}: a title with ${what} is saved whole and shown as text`, Boolean(made) && shown >= 1 && (await page.locator('.cc-cal img').count()) === 0, `${Boolean(made)} ${shown}`);
    }
    // An emoji made of several joined together (a family): run 1's rule for names takes the joiners out, so it is saved as its parts.
    await quickAdd(page, 'Family day 👨‍👩‍👧'); await save(page);
    const fam = (await items()).find((i) => i.title.startsWith('Family day'));
    console.log(`  COUNT odd titles: “Family day” with a joined family emoji is saved ${fam?.title === 'Family day 👨‍👩‍👧' ? 'whole' : `as ${[...(fam?.title || '')].length - 11} separate faces (the joiners are taken out with the unseen characters)`}.`);
    pass(`${tag}: a joined emoji never stops the save`, Boolean(fam));
    // Unseen characters inside a title go, and the edit panel holds to the same rule as the quick add.
    await tile(page, D.wed, 'Admin').click(); await settle(page, 700);
    await dialog(page).getByLabel('Title').fill('\u200b\u200d\ufeff'); await save(page);
    const admin = await t.one('coach_cal_items', CAL.admin);
    pass(`${tag}: the edit panel refuses a title of only unseen characters too (never a tile with nothing on it)`, admin.title === 'Admin' && (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'Type a title to carry on.', JSON.stringify(admin.title));
    await dialog(page).getByLabel('Title').fill(`${'W'.repeat(260)}`); await save(page);
    pass(`${tag}: the edit panel keeps a pasted 260-character title to 200`, [...(await t.one('coach_cal_items', CAL.admin)).title].length <= 200, String([...(await t.one('coach_cal_items', CAL.admin)).title].length));
    if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
    pass(`${tag}: the page is still standing`, !(await broke(page)));
    await t.done({ refusals: 0 });
  }

  // ---- typed times
  if (odd('times')) {
    const tag = `odd times, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    const items = () => t.rowsNow('coach_cal_items');
    for (const typed of ['Coffee 9:07', 'Talk 9-11:03', 'Walk 9.07am', 'Meeting 24:00', 'Meeting 9', 'Meeting 9.5', 'Meeting 25:99', 'Run 23:30', 'Standup 0:00']) {
      if (await broke(page)) await t.go('/coach/calendar?view=week');
      await quickAdd(page, typed);
      const down = await broke(page);
      const when = down ? '' : ((await dialog(page).locator('.cc-cal-quick-when').textContent().catch(() => '')) || '');
      pass(`${tag}: “${typed}” typed into the quick add leaves the page standing, with a time it can save`, !down && /^\w{3} \d+ \w{3}, \d\d:\d\d to \d\d:\d\d/.test(when), down ? 'the page broke' : when);
      if (down) continue;
      await save(page);
      const made = (await items()).filter((i) => i.title.startsWith(typed.split(' ')[0])).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      const mins = made ? (new Date(made.ends_at) - new Date(made.starts_at)) / 60000 : 0;
      pass(`${tag}: and what it saves starts and ends on a 5-minute step, 5 minutes or longer`, Boolean(made) && mins >= 5 && mins <= 1440 && new Date(made.starts_at).getUTCMinutes() % 5 === 0 && mins % 5 === 0, made ? `${made.title}: ${wallClock(made.starts_at, LON).time} for ${mins}` : `nothing saved: ${await dialog(page).locator('.cc-problem').textContent().catch(() => '')}`);
      if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
    }
    // The panel's own time boxes: the browser only ever hands over a real time, and an empty one is asked for.
    await t.go('/coach/calendar?view=week');
    await tile(page, D.wed, 'Admin').click(); await settle(page, 700);
    for (const typed of ['24:00', '9', '9.5', '25:99']) {
      const kept = await dialog(page).getByLabel('Starts').evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; }, typed);
      await settle(page, 250);
      await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 600);
      const line = (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || '';
      const row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: “${typed}” put into Starts is never saved as a time`, same(row.starts_at, at(D.wed, '14:00')) && (kept === '' ? /carry on\.$/.test(line) : true) && !(await broke(page)), `box holds "${kept}", says "${line}"`);
      await dialog(page).getByLabel('Starts').fill('14:00'); await settle(page, 200);
    }
    await dialog(page).getByLabel('Starts').fill('14:03'); await settle(page, 250);
    await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 600);
    pass(`${tag}: a time off the 5-minute step is refused calmly`, (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'Times go in 5-minute steps. Choose the nearest one.');
    await closePanel(page);
    await t.done({ refusals: 0 });
  }

  // ---- a 0-minute and a 24-hour item
  if (odd('length')) {
    const tag = `odd lengths, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    await tile(page, D.wed, 'Admin').click(); await settle(page, 700);
    await dialog(page).getByLabel('Ends').fill('14:00'); await settle(page, 300);
    const said = flat(await dialog(page).textContent());
    await save(page);
    let row = await t.one('coach_cal_items', CAL.admin);
    const mins = (new Date(row.ends_at) - new Date(row.starts_at)) / 60000;
    console.log(`  COUNT odd lengths: Starts 14:00 and Ends 14:00 is read as ${mins} minutes (“${(said.match(/[\w ]+, in 5-minute steps\./) || [''])[0].trim()}”).`);
    pass(`${tag}: an item that ends when it starts is never saved with no length (it is the next day's 14:00, and says so)`, mins === 1440 && /24 hours, in 5-minute steps\./.test(said), `${mins} ${said.slice(0, 120)}`);
    pass(`${tag}: a 24-hour item sits in the all-day row of both its days, never as a tile nobody can read`, (await page.locator('.cc-cal-banner', { hasText: 'Admin' }).count()) === 1 && (await tiles(page, D.wed, 'Admin').count()) === 0 && !(await broke(page)));
    await page.locator('.cc-cal-banner', { hasText: 'Admin' }).click(); await settle(page, 700);
    pass(`${tag}: and opens again with its own times`, (await dialog(page).getByLabel('Starts').inputValue().catch(() => '')) === '14:00');
    await closePanel(page);
    await undo(page).catch(() => {});
    await t.go('/coach/calendar?view=week');
    // Resized up past its own top: 15 minutes at the least.
    const b = await tile(page, D.wed, 'Admin').boundingBox();
    await dragTo(page, { x: b.x + b.width / 2, y: b.y + b.height - 3 }, { x: b.x + b.width / 2, y: b.y - 60 });
    row = await t.one('coach_cal_items', CAL.admin);
    pass(`${tag}: a tile resized up past its own start is 15 minutes, never nothing or backwards`, same(row.starts_at, at(D.wed, '14:00')) && same(row.ends_at, at(D.wed, '14:15')), `${row.starts_at} ${row.ends_at}`);
    // A drag that never leaves the spot is a click (an hour), and a tiny drag is 15 minutes.
    const p0 = await point(page, D.fri, 16 * 60 + 2, 0.5);
    await dragTo(page, p0, { x: p0.x, y: p0.y + 7 });
    const whenLine = (await page.locator('.cc-cal-quick').textContent().catch(() => '')) || '';
    pass(`${tag}: the smallest drag on empty space is 15 minutes`, /Fri 20 Nov, 16:00 to 16:15/.test(whenLine), whenLine.slice(0, 80));
    await page.keyboard.press('Escape'); await settle(page, 300);
    await t.done({ refusals: 0 });
  }

  // ---- 60 pasted guests with duplicates
  if (odd('guests')) {
    const tag = `odd guests, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    const people = Array.from({ length: 60 }, (_, i) => { const n = i % 48; return i % 3 === 0 ? `Guest ${n} <guest${n}@example.invalid>` : i % 3 === 1 ? `guest${n}@example.invalid` : `"Guest ${n}" <GUEST${n}@EXAMPLE.INVALID>`; });
    const pasted = [people.slice(0, 20).join(', '), people.slice(20, 40).join('; '), people.slice(40).join('\n'), 'not-an-address@', 'Someone With No Email'].join('\n');
    await tile(page, D.thu, 'Supervision with Maya').click(); await settle(page, 700);
    await press(dialog(page), page, 'More options');
    await dialog(page).getByLabel('Who’s invited?').fill(pasted); await settle(page, 400);
    const read = flat(await dialog(page).textContent());
    pass(`${tag}: 60 pasted guests, 12 of them twice: 48 people, the duplicates taken out, the unreadable ones said`, /48 people to invite\./.test(read) && /12 duplicates were taken out\./.test(read) && /Check this address: not-an-address@\./.test(read) && /Someone With No Email has no email yet/.test(read), (read.match(/\d+ people to invite\..{0,200}/) || [''])[0]);
    const before = await t.count('coach_cal_guests');
    await twice(dialog(page).locator('.ds-btn--primary'));
    for (let i = 0; i < 30 && (await page.locator('.ds-modal--shown').count()); i += 1) await settle(page, 300); // 48 rows go one after another
    await settle(page, 600);
    const guests = (await t.rowsNow('coach_cal_guests')).filter((g) => g.item_id === CAL.supervision);
    pass(`${tag}: saved once (Save pressed twice in the same moment): 48 guests, each email once`, (await t.count('coach_cal_guests')) === before + 48 && new Set(guests.map((g) => g.email).filter(Boolean)).size === 48, `${(await t.count('coach_cal_guests')) - before} added`);
    await tile(page, D.thu, 'Supervision with Maya').click(); await settle(page, 700);
    await press(dialog(page), page, 'More options');
    const fits = await dialog(page).evaluate((el) => ({ wide: el.scrollWidth - el.clientWidth, rows: el.querySelectorAll('.cc-cal-guest').length }));
    pass(`${tag}: the panel lists all 49 without a sideways scroll`, fits.rows === 49 && fits.wide <= 1, JSON.stringify(fits));
    // The same people pasted again: nobody is invited twice.
    await dialog(page).getByLabel('Who’s invited?').fill(people.slice(0, 10).join(', ')); await settle(page, 300);
    await save(page);
    const after = (await t.rowsNow('coach_cal_guests')).filter((g) => g.item_id === CAL.supervision);
    const dupes = after.length - new Set(after.map((g) => g.email || g.id)).size;
    pass(`${tag}: people already invited, pasted again, are not invited twice, and the save goes through (“Saved”)`, dupes === 0 && after.length === 49 && (await page.locator('.ds-modal--shown').count()) === 0 && /^Saved/.test(await toast(page)), `${after.length} guests, ${dupes} twice; ${await dialog(page).locator('.cc-problem').textContent().catch(() => '')} ${await toast(page)}`);
    if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
    await t.done({ refusals: 0 });
  }

  // ---- 40 overlapping items on one day
  if (odd('crowd')) {
    for (const size of [1440, 400]) {
      const tag = `odd, a crowded day, ${role}, ${size}px`;
      const t = await openAt({ role, tag, size, path: '/coach/calendar?view=day&day=2026-11-25', change: (rows) => {
        for (let i = 0; i < 40; i += 1) rows.coach_cal_items.push(seedItem(u(9600 + i), `Overlap ${i + 1}`, '2026-11-25', '10:00', '11:00', { kind: i % 4 === 0 ? 'admin' : i % 4 === 1 ? 'writing' : i % 4 === 2 ? 'event' : 'own_time' }));
        // And a busy but real day: 8 things at once on Tue 24 Nov.
        for (let i = 0; i < 8; i += 1) rows.coach_cal_items.push(seedItem(u(9660 + i), `Eight ${i + 1}`, '2026-11-24', '13:00', '14:00'));
      } });
      const { page } = t;
      const read = (word = 'Overlap') => page.evaluate((w) => {
        const list = [...document.querySelectorAll('[data-cal-key]')].filter((el) => (el.getAttribute('aria-label') || '').startsWith(w));
        const rects = list.map((el) => el.getBoundingClientRect());
        let overlaps = 0;
        for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) { const a = rects[i]; const b = rects[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps += 1; }
        const widths = rects.map((r) => r.width);
        const readable = list.filter((el) => { const tEl = el.querySelector('.cc-cal-title'); return tEl && tEl.getBoundingClientRect().width >= 24; }).length;
        const col = list[0]?.closest('[data-cal-day]').getBoundingClientRect() || { left: 0, right: 0 };
        return { n: list.length, overlaps, min: Math.round(Math.min(...widths) * 10) / 10, out: rects.filter((r) => r.left < col.left - 1 || r.right > col.right + 1).length, readable, wide: document.documentElement.scrollWidth - window.innerWidth };
      }, word);
      const day = await read();
      // "+N more" (tidy follow-up 3, run 6's 19): a laptop's Day view keeps every tile side by side; a phone's day shows 3 and folds the rest.
      const more = () => page.evaluate(() => [...document.querySelectorAll('.cc-cal-more')].map((el) => ({ words: el.textContent.trim(), label: el.getAttribute('aria-label') || '', h: Math.round(el.getBoundingClientRect().height) })));
      const phone = size < 600;
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/crowd-day-${size}.png` }).catch(() => {});
      console.log(`  COUNT odd, ${size}px: 40 items at 10:00 on one day, in the Day view: ${day.n} tiles, the narrowest ${day.min}px wide, ${day.readable} with room for a word, ${day.overlaps} overlapping.`);
      const dayMore = await more();
      if (phone) {
        pass(`${tag}: on a phone 3 of the 40 sit side by side and the other 37 fold into “+37 more”, nothing scrolls sideways`, day.n === 3 && day.overlaps === 0 && day.out === 0 && dayMore.length === 1 && dayMore[0].words === '+37 more' && day.wide <= 1, JSON.stringify({ day, dayMore }));
      } else {
        pass(`${tag}: 40 items at the same time each get a tile in a laptop's Day view, and nothing scrolls sideways`, day.n === 40 && day.wide <= 1 && day.min > 0 && dayMore.length === 0, JSON.stringify(day));
      }
      await t.go('/coach/calendar?view=day&day=2026-11-24');
      const eight = await read('Eight');
      const eightMore = await more();
      pass(`${tag}: 8 items at the same time sit side by side inside the day${phone ? ' (3, then “+6 more” with the seed’s own 13:00 call)' : ''}, none over another's tap area`, eight.n === (phone ? 3 : 8) && eight.overlaps === 0 && eight.out === 0 && (phone ? eightMore[0]?.words === '+6 more' : eightMore.length === 0), JSON.stringify({ eight, eightMore }));
      if (size === 1440) {
        await t.go('/coach/calendar?view=week&day=2026-11-24');
        const eightWeek = await read('Eight');
        const weekMore = await more();
        // (The seed's own 13:00 call on that Tuesday overlaps them too, so the fold holds the other 5 Eights and it: “+6 more”.)
        pass(`${tag}: and in the week 3 sit side by side, then “+6 more”`, eightWeek.n === 3 && eightWeek.overlaps === 0 && eightWeek.out === 0 && weekMore.some((m) => m.words === '+6 more'), JSON.stringify({ eightWeek, weekMore }));
      }
      await t.go('/coach/calendar?view=day&day=2026-11-25');
      if (phone) {
        const btn = page.locator('.cc-cal-more').first();
        pass(`${tag}: “+37 more” says what it is to a screen reader and opens a list of the rest`, /^37 more at 10:00\. Show them$/.test((await btn.getAttribute('aria-label')) || ''));
        await btn.click(); await settle(page, 500);
        const listed = await page.locator('.cc-pop [role="menuitem"]').count();
        pass(`${tag}: the list has all 37`, listed === 37, `${listed}`);
        await page.locator('.cc-pop [role="menuitem"]', { hasText: /^10:00 Overlap 17$/ }).click(); await settle(page, 700);
      } else {
        pass(`${tag}: each of the 40 says what it is to a screen reader, and opens from the keyboard`, (await page.locator('[data-cal-key][aria-label^="Overlap 17,"]').count()) === 1);
        await page.locator('[data-cal-key][aria-label^="Overlap 17,"]').focus(); await page.keyboard.press('Enter'); await settle(page, 700);
      }
      pass(`${tag}: (Overlap 17 opens its own panel)`, (await dialog(page).locator('.ds-dialog-title').textContent().catch(() => '')) === 'Overlap 17');
      await closePanel(page);
      await t.go('/coach/calendar?view=schedule&day=2026-11-25');
      const rows = await page.locator('.cc-sched-row', { hasText: 'Overlap' }).count();
      const small = await page.locator('.cc-sched-row', { hasText: 'Overlap' }).evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height < 44).length);
      pass(`${tag}: the Schedule lists all 40, each row 44px or more to tap`, rows === 40 && small === 0, `${rows} rows, ${small} small`);
      if (size === 1440) {
        await t.go('/coach/calendar?view=week&day=2026-11-25');
        const week = await read();
        const weekMore = await more();
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/crowd-week-${size}.png` }).catch(() => {});
        console.log(`  COUNT odd, ${size}px: the same day in the Week view: ${week.n} tiles, the narrowest ${week.min}px wide, ${week.readable} with room for a word, then ${weekMore.map((m) => m.words).join(', ')}.`);
        pass(`${tag}: in the week 3 of the 40 show, with “+37 more” for the rest`, week.n === 3 && week.overlaps === 0 && week.readable === 3 && weekMore.some((m) => m.words === '+37 more') && week.wide <= 1, JSON.stringify({ week, weekMore }));
        await t.go('/coach/calendar?view=month&day=2026-11-25');
        const cell = flat(await page.locator('.cc-month-cell', { has: page.locator('b', { hasText: /^25$/ }) }).textContent());
        pass(`${tag}: the month says how many more there are`, /\d+ more/.test(cell), cell.slice(0, 80));
      }
      await t.done({ refusals: 0 });
    }
  }

  // ---- an associate's sessions on the owner's calendar, and nothing else of theirs (tidy follow-up 3, run 6's 25; 058)
  if (odd('assoc')) {
    for (const size of [1440, 400]) {
      const tag = `odd, an associate's sessions, ${role}, ${size}px`;
      const t = await openAt({ role, tag, size, path: `/coach/calendar?view=${size < 600 ? 'day' : 'week'}&day=${D.wed}`, change: (rows) => {
        rows.client_profiles.push({ id: u(9801), coach_id: OTHER, name: 'Priya Shah', email: 'priya.058@example.invalid', status: 'active', created_at: at('2026-10-01', '09:00') });
        rows.coach_sessions.push({ id: u(9802), coach_id: OTHER, profile_id: u(9801), group_id: null, engagement_id: null, kind: 'coaching', starts_at: at(D.wed, '15:00'), minutes: 60, place: 'Leeds office', outcome: null, waived: false, recap: 'Private words', created_at: at('2026-11-01', '09:00'), updated_at: at('2026-11-01', '09:00') });
        rows.coach_sessions.push({ id: u(9803), coach_id: OTHER, profile_id: u(9801), group_id: null, engagement_id: null, kind: 'coaching', starts_at: at(D.wed, '17:00'), minutes: 60, place: null, outcome: 'moved', waived: false, created_at: at('2026-11-01', '09:00'), updated_at: at('2026-11-01', '09:00') });
        rows.coach_cal_items.push(seedItem(u(9804), 'Dentist 058', D.wed, '12:00', '13:00', { coach_id: OTHER }));
      } });
      const { page } = t;
      const theirs = page.locator(`[data-cal-day="${D.wed}"] [data-cal-key^="assoc:"]`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/assoc-${role}-${size}.png` }).catch(() => {});
      const label = (await theirs.first().getAttribute('aria-label').catch(() => '')) || '';
      const text = await words(page);
      if (role === 'owner') {
        pass(`${tag}: the owner sees Maya's session with Priya: the time, the client's name, the kind and whose it is`, (await theirs.count()) === 1 && /^Priya Shah, Wed 18 Nov, 15:00 to 16:00, Coaching session, Maya$/.test(label), `${await theirs.count()}: ${label}`);
        pass(`${tag}: the tile reads the client's name, then the kind and Maya`, /Priya Shah/.test(await theirs.first().innerText()) && /Coaching session, Maya/.test(await theirs.first().innerText()), flat(await theirs.first().innerText()));
        pass(`${tag}: never Maya's own calendar items, a moved session, a place or a recap`, !/Dentist 058|Leeds office|Private words/.test(text) && (await page.locator('[data-cal-key="assoc:' + u(9803) + '"]').count()) === 0);
        const box = await theirs.first().boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 6); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 6 }); await page.mouse.up(); await settle(page, 700);
        pass(`${tag}: it can't be dragged: nothing is saved and it stays at 15:00`, !(await t.rowsNow('coach_sessions')).some((x) => x.id === u(9802) && x.starts_at !== at(D.wed, '15:00')) && /15:00 to 16:00/.test((await theirs.first().getAttribute('aria-label')) || ''));
        await closePanel(page);
        await theirs.first().focus(); await page.keyboard.press('ArrowDown'); await settle(page, 500);
        pass(`${tag}: nor moved with the arrow keys`, /15:00 to 16:00/.test((await theirs.first().getAttribute('aria-label')) || ''));
        await page.keyboard.press('Enter'); await settle(page, 700);
        const panel = flat(await dialog(page).innerText().catch(() => ''));
        const edits = await dialog(page).locator('input, textarea, .ds-btn--primary').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => `${el.tagName.toLowerCase()}.${el.className}`));
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/assoc-panel-${size}.png` }).catch(() => {});
        pass(`${tag}: opening it says only what it is, with nothing to edit`, (await dialog(page).locator('.cc-quiet').allTextContents()).join('|') === 'Wed 18 Nov, 15:00 to 16:00|Priya Shah|Coaching session|Maya’s session' && edits.length === 0, `${panel.slice(0, 160)} ${edits.join(' ')}`);
        await closePanel(page);
      } else {
        pass(`${tag}: an associate sees nothing of anyone else's sessions or calendar`, (await theirs.count()) === 0 && !/Priya Shah|Dentist 058/.test(text), `${await theirs.count()}`);
      }
      await t.done({ refusals: 0 });
    }
  }

  // ---- 1,000 items in a month
  if (odd('thousand')) {
    const tag = `odd, 1,000 items in a month, ${role}`;
    const t = await openAt({ role, tag, change: (rows) => {
      // 1,000 short items through October 2026 (a past month, so no booking rule meets them): 08:00 to 20:30, every 25 minutes of each day, then round again.
      for (let i = 0; i < 1000; i += 1) {
        const day = addDays('2026-10-01', i % 31);
        const slot = Math.floor(i / 31);
        const from = 8 * 60 + slot * 20;
        const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        rows.coach_cal_items.push(seedItem(u(20000 + i), `Item ${i + 1}`, day, hh(from), hh(from + 15)));
      }
    } });
    const { page } = t;
    const timed = async (path, sel) => { const a = Date.now(); await page.goto(`${APP}${path}`); await page.waitForSelector(sel, { timeout: 30000 }); return Date.now() - a; };
    const month = await timed('/coach/calendar?view=month&day=2026-10-15', '.cc-month-cell');
    const cells = await page.locator('.cc-month-cell small').count();
    const week = await timed('/coach/calendar?view=week&day=2026-10-14', '[data-cal-key]');
    const weekTiles = await page.locator('[data-cal-key]').count();
    const sched = await timed('/coach/calendar?view=schedule&day=2026-10-14', '.cc-sched-row');
    const today = await timed('/coach/calendar?view=week', '[data-cal-key]');
    const a = Date.now(); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForFunction(() => /23 to 27 Nov/.test(document.querySelector('.cc-cal-range')?.textContent || ''), null, { timeout: 15000 }); const step = Date.now() - a;
    console.log(`  (1,000 items in October: the month opens in ${month} ms, that week in ${week} ms with ${weekTiles} tiles, the Schedule in ${sched} ms, this week in ${today} ms, and Next takes ${step} ms)`);
    pass(`${tag}: the month opens inside 4 seconds and says "more" in its cells`, month < 4000 && cells >= 20, `${month} ms, ${cells} cells with more`);
    pass(`${tag}: a week of it opens inside 4 seconds, the Schedule too, and this week is as quick as ever`, week < 4000 && sched < 4000 && today < 4000 && step < 2000, JSON.stringify({ week, sched, today, step }));
    const size = await page.evaluate((id) => (localStorage.getItem(`clarity-cache:${id}:coach`) || '').length, t.me);
    console.log(`  (the device copy with 1,000 more items is ${Math.round(size / 1024)} KB)`);
    pass(`${tag}: the device copy still fits the browser's store (under 4 MB)`, size > 0 && size < 4 * 1024 * 1024, `${size}`);
    await t.done({ refusals: 0 });
  }

  // ---- a damaged device copy (device only)
  if (odd('damaged')) {
    const tag = `odd, a damaged device copy, ${role}`;
    const t = await openAt({ role, tag, db: 'none' });
    const { page, me } = t;
    const good = await page.evaluate((id) => localStorage.getItem(`clarity-coach-local:${id}`), me);
    const cases = {
      'cut off half way': good.slice(0, Math.floor(good.length / 2)),
      'not an object': '"calendar"',
      'rows of the wrong shapes': JSON.stringify({ rows: { coach_cal_items: { a: 5, b: null, c: 'x', d: { id: 'd' }, e: { id: 'e', coach_id: ME, title: null, starts_at: 'nonsense', ends_at: 12, time_zone: 'EST', repeat_rule: 'weekly' }, f: { id: 'f', coach_id: ME, title: 'Backwards', starts_at: at(D.wed, '15:00'), ends_at: at(D.wed, '14:00'), time_zone: LON }, g: { id: 'g', coach_id: ME, title: 'No zone', starts_at: at(D.wed, '18:00'), ends_at: at(D.wed, '19:00'), time_zone: null, repeat_rule: { every: 'fortnight' } }, h: { id: 'h', coach_id: ME, title: 'Odd rule', starts_at: at(D.mon, '18:00'), ends_at: at(D.mon, '19:00'), time_zone: LON, repeat_rule: { every: 'week', interval: 0, weekdays: 'mon', until: 'never', count: -3 } }, i: { id: 'i', coach_id: ME, title: 'All day, no days', all_day: true, starts_at: at(D.thu, '00:00'), ends_at: at(D.fri, '00:00'), time_zone: LON } }, coach_cal_guests: [1, 2, 3], coach_open_blocks: { x: { id: 'x', coach_id: ME, starts_at: null, ends_at: null } }, coach_polls: 'none', coach_settings: { [ME]: { coach_id: ME, working_hours: { mon: { from: '25:00', to: 'late' }, tue: 7, wed: null }, calendars: 'all', second_time_zone: 'Mars/Olympus', time_zone: 'GMT+1', booking: [] } }, coach_todos: { t: { id: 't', coach_id: ME, title: 'Timed oddly', planned_on: '2026-11-18', planned_time: '99:99', minutes: 'long' } } }, marks: 7 }),
    };
    for (const [what, raw] of Object.entries(cases)) {
      await page.evaluate(([id, v]) => { localStorage.setItem(`clarity-coach-local:${id}`, v); localStorage.removeItem(`clarity-cache:${id}:coach`); }, [me, raw]);
      for (const path of ['/coach/calendar?view=week', '/coach/calendar?view=month', '/coach/calendar?view=schedule', '/coach/calendar/open', '/coach/calendar/book', '/coach/settings/booking', '/coach']) {
        await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app, .ui-root', { timeout: 20000 }).catch(() => {}); await settle(page, 900);
        pass(`${tag}: ${what}: ${path} still opens`, !(await broke(page)), flat(await page.evaluate(() => document.body.innerText)).slice(0, 100));
      }
    }
    const said = t.errors.splice(0);
    pass(`${tag}: and none of it threw an error in the page`, said.length === 0, [...new Set(said)].slice(0, 3).join(' | '));
    await page.evaluate((id) => localStorage.removeItem(`clarity-coach-local:${id}`), me);
    await t.done();
  }

  // ---- odd addresses
  if (odd('address')) {
    const tag = `odd addresses, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    for (const path of ['/coach/calendar?view=day&day=2026-02-30', '/coach/calendar?view=week&day=2026-13-45', '/coach/calendar?view=month&day=0000-00-00', '/coach/calendar?view=schedule&day=9999-12-31', '/coach/calendar?view=nonsense&day=today', '/coach/calendar?day=2026-11-31',
      '/coach/calendar/polls/not-a-poll', `/coach/calendar/polls/${u(424242)}`, '/coach/calendar/polls/%3Cscript%3E', '/coach/calendar/open?day=2026-02-30', '/coach/calendar/book?day=2026-02-30', '/coach/calendar/nowhere']) {
      await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app, .ui-root', { timeout: 20000 }).catch(() => {}); await settle(page, 900);
      const text = flat(await page.evaluate(() => document.body.innerText));
      pass(`${tag}: ${path} opens a calm page inside the coach portal`, !(await broke(page)) && new URL(page.url()).pathname.startsWith('/coach'), text.slice(0, 110));
      if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
    }
    const said = t.errors.splice(0);
    pass(`${tag}: and none threw an error in the page`, said.length === 0, [...new Set(said)].slice(0, 3).join(' | '));
    await t.done({ refusals: 0 });
  }

  // ---- the clock crossing midnight with the calendar open
  if (odd('midnight')) {
    const tag = `odd, midnight, ${role}`;
    const t = await openAt({ role, tag, when: new Date(2026, 10, 17, 23, 58), path: '/coach/calendar?view=week' });
    const { page } = t;
    const todayHead = () => page.locator('.cc-cal-day--today').getAttribute('aria-label').catch(() => '');
    pass(`${tag}: at 23:58 on Tuesday, Tuesday is today`, /Tuesday 17 Nov.*today/.test(await todayHead()), await todayHead());
    await press(page, page, 'Show the whole day');
    pass(`${tag}: the now line is at the foot of Tuesday`, (await page.locator(`[data-cal-day="${D.tue}"] .cc-cal-now`).count()) === 1);
    await t.setClock(new Date(2026, 10, 18, 0, 1));
    await settle(page, 800);
    const head = await todayHead();
    const nowOn = await page.locator(`[data-cal-day="${D.wed}"] .cc-cal-now`).count();
    pass(`${tag}: a minute past midnight (the tab shown again), Wednesday is today and the now line is at its top, with no reload`, /Wednesday 18 Nov.*today/.test(head) && nowOn === 1 && (await page.locator('.cc-cal-now').count()) === 1, `${head}; now lines on Wed: ${nowOn}`);
    await press(page, page, 'Add to calendar');
    const when = (await dialog(page).locator('.cc-cal-quick-when').textContent().catch(() => '')) || '';
    pass(`${tag}: Add to calendar now starts on Wednesday`, /^Wed 18 Nov, 01:00 to 02:00/.test(when), when);
    await closePanel(page);
    await t.go('/coach/calendar?view=schedule');
    pass(`${tag}: and the Schedule's first day is "Today, Wed 18 Nov"`, (await page.locator('.cc-sched-day').first().textContent()) === 'Today, Wed 18 Nov');
    // 23:00 today: Add to calendar never makes an item that starts tomorrow by mistake or runs backwards.
    await t.setClock(new Date(2026, 10, 18, 23, 40), '/coach/calendar?view=week');
    await press(page, page, 'Add to calendar');
    const late = (await dialog(page).locator('.cc-cal-quick-when').textContent().catch(() => '')) || '';
    pass(`${tag}: at 23:40, Add to calendar offers 23:00 to midnight today, never a time that isn't there`, /^Wed 18 Nov, 23:00 to 00:00/.test(late), late);
    await closePanel(page);
    await t.done({ refusals: 0 });
  }

  // ---- the next-call bar with two calls at once
  if (odd('bar')) {
    const tag = `odd, two calls at once, ${role}`;
    const t = await openAt({ role, tag, when: new Date(2026, 10, 17, 12, 22), path: '/coach', change: (rows) => {
      // Priya's call (17:00 in the seed) put on top of Sam's at 12:30: two calls with the same start.
      const priya = rows.coach_cal_items.find((i) => i.id === CAL.priyaTue);
      const s = rows.coach_sessions.find((x) => x.id === priya.session_id);
      priya.starts_at = at(D.tue, '12:30'); priya.ends_at = at(D.tue, '13:30');
      if (s) s.starts_at = priya.starts_at;
    } });
    const { page } = t;
    const bar = page.locator('.cc-callbar');
    const text = flat(await bar.first().textContent().catch(() => ''));
    console.log(`  COUNT odd: with two calls starting at 12:30 the bar reads “${text}”.`);
    pass(`${tag}: one bar, naming one call calmly with its own Join on Zoom`, (await bar.count()) === 1 && /(Sam Okafor|Priya Nair) in 8 minutes/.test(text) && (await bar.getByRole('link', { name: 'Join on Zoom' }).count()) <= 1, text);
    pass(`${tag}: Today lists both calls at 12:30`, (await page.locator('.cc-today-call', { hasText: 'Sam Okafor' }).count()) >= 1 && (await page.locator('.cc-today-call', { hasText: 'Priya Nair' }).count()) >= 1);
    await t.go('/coach/calendar?view=day');
    const both = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-cal-key]')].filter((el) => /Sam Okafor|Priya Nair/.test(el.textContent)).map((el) => el.getBoundingClientRect()); return r.length === 2 && (r[0].right <= r[1].left + 1 || r[1].right <= r[0].left + 1); });
    pass(`${tag}: the calendar draws them side by side`, both);
    await t.setClock(new Date(2026, 10, 17, 12, 41));
    pass(`${tag}: 11 minutes in, the bar has gone for both`, (await bar.count()) === 0);
    await t.done({ refusals: 0 });
  }

  // ---- twice the text size
  if (odd('big')) {
    for (const size of [1440, 400]) {
      const tag = `odd, twice the text size, ${role}, ${size}px`;
      const t = await openAt({ role, tag, size });
      const { page } = t;
      const big = async () => { await page.addStyleTag({ content: 'html{font-size:32px !important}' }); await settle(page, 600); };
      const fits = () => page.evaluate(() => {
        const wide = document.documentElement.scrollWidth - window.innerWidth;
        const cut = [...document.querySelectorAll('.cc-app button, .cc-app a, .ds-dialog button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.cc-utabs, .cc-menu, [aria-hidden=true], .cc-cal, .cc-month'); }).map((el) => (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30));
        return { wide, cut: [...new Set(cut)].slice(0, 5) };
      });
      for (const path of ['/coach/calendar?view=week', '/coach/calendar?view=day', '/coach/calendar?view=month', '/coach/calendar?view=schedule', '/coach/calendar/open', `/coach/calendar/polls/${CAL.poll}`, '/coach/settings/booking']) {
        await t.go(path, 900); await big();
        const f = await fits();
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/big-${size}-${path.replace(/[^a-z0-9]+/gi, '-').slice(-28)}.png` }).catch(() => {});
        pass(`${tag}: ${path} has no sideways scroll and nothing off the side`, f.wide <= 1 && f.cut.length === 0, JSON.stringify(f));
        // A row's time never runs under its words (the Schedule, and a phone's week).
        const under = await page.evaluate(() => [...document.querySelectorAll('.cc-sched-row')].filter((r) => { const t = r.querySelector('.cc-sched-time'); const w = r.querySelector('.cc-sched-words'); const range = document.createRange(); range.selectNodeContents(t); return range.getBoundingClientRect().right > w.getBoundingClientRect().left + 1; }).length);
        pass(`${tag}: ${path}: no row's time runs under its words`, under === 0, `${under} rows`);
      }
      for (const [name, path, open] of [
        ['the quick add', '/coach/calendar?view=day', async () => { if (size === 400) await page.locator('.cc-cal-foot').getByRole('button', { name: 'Add to calendar' }).click(); else await press(page, page, 'Add to calendar'); await settle(page, 600); }],
        ['an item', '/coach/calendar?view=schedule', async () => { await page.locator('.cc-sched-row', { hasText: 'Leaders’ dinner' }).first().click(); await settle(page, 700); await press(dialog(page), page, 'More options'); }],
        ['Book a call', '/coach/calendar/book', async () => { await pick(dialog(page), page, 'Who is it with', 'Jordan Reyes'); }],
        ['My calendars', '/coach/calendar?view=schedule', async () => { await page.locator('.cc-cal-foot').getByRole('button', { name: 'My calendars' }).click(); await settle(page, 600); }],
      ]) {
        await t.go(path, 900); await big(); await open();
        const d = await page.evaluate(() => { const el = [...document.querySelectorAll('.ds-modal--shown .ds-dialog')].pop(); if (!el) return null; const r = el.getBoundingClientRect(); const cut = [...el.querySelectorAll('button, a, input, [role=combobox]')].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); }).length; return { wide: el.scrollWidth - el.clientWidth, off: Math.round(Math.max(0, r.right - window.innerWidth, -r.left)), cut }; });
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/big-${size}-panel-${name.replace(/[^a-z]+/gi, '-')}.png` }).catch(() => {});
        pass(`${tag}: ${name}’s panel fits, with nothing to scroll sideways or cut off`, Boolean(d) && d.wide <= 1 && d.off <= 1 && d.cut === 0, JSON.stringify(d));
        await closePanel(page);
      }
      await t.done({ refusals: 0 });
    }
    // The pages outside the portal.
    const store = bookStore(seedWith(), { now: () => new Date(TUE) });
    for (const size of [1440, 400]) {
      const g = await guestPage(store, { size });
      for (const [name, path] of [['a booking page', `/book/${CAL.chemKey}`], ['a single-use link', `/book/link/${CAL.linkDanaKey}`], ['a guest’s own booking', `/book/mine/${CAL.bookRuthKey}`], ['a poll', `/poll/${CAL.pollMiaKey}`]]) {
        await g.open(path);
        await g.page.addStyleTag({ content: 'html{font-size:32px !important}' }); await settle(g.page, 500);
        if (await g.page.locator('.cc-book-time').count()) { await g.page.locator('.cc-book-time').first().click(); await settle(g.page, 400); }
        const f = await g.page.evaluate(() => ({ wide: document.documentElement.scrollWidth - window.innerWidth, cut: [...document.querySelectorAll('.cc-public button, .cc-public a, .cc-public input')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).length }));
        if (SHOTS) await g.page.screenshot({ path: `${SHOTS}/big-public-${size}-${name.replace(/[^a-z]+/gi, '-')}.png`, fullPage: true }).catch(() => {});
        pass(`odd, twice the text size, ${size}px: ${name} has no sideways scroll and nothing off the side`, f.wide <= 1 && f.cut === 0, JSON.stringify(f));
      }
      pass(`odd, twice the text size, ${size}px: no page error outside the portal`, g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
      await g.ctx.close();
    }
  }

  // ---- the browser's Back out of every panel
  if (odd('back')) {
    for (const size of [1440, 400]) {
      const tag = `odd, Back, ${role}, ${size}px`;
      const t = await openAt({ role, tag, size, path: '/coach' });
      const { page, store } = t;
      const before = JSON.stringify([store.rows.coach_cal_items, store.rows.coach_open_blocks, store.rows.coach_polls, store.rows.coach_booking_links]);
      const foot = (name) => page.locator('.cc-cal-foot').getByRole('button', { name, exact: true });
      const toCalendar = async (view) => {
        // Reached inside the portal, as a person does, so Back has somewhere of the portal's to go.
        if (size === 400) await page.locator('.cc-phonebar button').nth(2).click(); else { await page.getByRole('button', { name: 'Open the menu', exact: true }).click(); await settle(page, 400); await page.locator('.cc-menu-item', { hasText: /^Calendar/ }).first().click(); }
        await settle(page, 1000);
        if (view === 'grid' && size === 400) { await press(page, page, 'View'); await page.getByRole('menuitemcheckbox', { name: 'Day', exact: true }).click(); await settle(page, 800); }
      };
      const panels = [
        ['the quick add', 'grid', async () => { if (size === 400) await foot('Add to calendar').click(); else await press(page, page, 'Add to calendar'); await settle(page, 600); }],
        ['an item', 'grid', async () => { await page.locator('[data-cal-key]', { hasText: /Parents’ evening|Swimming/ }).first().focus(); await page.keyboard.press('Enter'); await settle(page, 700); }],
        ['a call’s brief', 'grid', async () => { await page.locator('[data-cal-key]', { hasText: 'Priya Nair' }).first().focus(); await page.keyboard.press('Enter'); await settle(page, 1200); }],
        ['My calendars', 'grid', async () => { await foot('My calendars').click(); await settle(page, 600); }],
        ['Book a call', 'any', async () => { await page.getByRole('button', { name: 'Book a call', exact: true }).first().click(); await settle(page, 900); }],
        ['Open for calls’ Add open time', 'any', async () => { await foot('Set my open times').click(); await settle(page, 1000); await press(page, page, 'Add open time'); }],
        ['Offer times by email', 'any', async () => { await foot('Offer times by email').click(); await settle(page, 1000); }],
      ];
      for (const [name, view, open] of panels) {
        await t.go('/coach', 700);
        await toCalendar(view);
        if (!/^\/coach\/calendar/.test(new URL(page.url()).pathname)) { pass(`${tag}: the menu reaches the calendar`, false, page.url()); continue; }
        await open();
        const opened = (await page.locator('.ds-modal--shown').count()) + (await page.locator('.cc-pickbar').count());
        const from = new URL(page.url()).pathname;
        await page.goBack().catch(() => null);
        await settle(page, 1200);
        const state = await page.evaluate(() => ({ path: location.pathname, open: document.querySelectorAll('.ds-modal--shown').length, app: Boolean(document.querySelector('.cc-app')), broke: /hit a problem/i.test(document.body.innerText), locked: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden' }));
        console.log(`  COUNT odd, ${size}px: Back with ${name} open (at ${from}) lands on ${state.path}${state.open ? ' with a panel still open' : ''}.`);
        pass(`${tag}: Back out of ${name} lands on a real coach page, with no panel left hanging and the page free to scroll`, opened >= 1 && state.app && !state.broke && state.path.startsWith('/coach') && (state.path === from || state.open === 0) && (state.open > 0 || !state.locked), JSON.stringify({ opened, ...state }));
        if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
      }
      pass(`${tag}: none of that changed the calendar`, JSON.stringify([store.rows.coach_cal_items, store.rows.coach_open_blocks, store.rows.coach_polls, store.rows.coach_booking_links]) === before);
      await t.done({ refusals: 0 });
    }
  }

  // ---- the working-hours handles dragged past each other
  if (odd('handles')) {
    const tag = `odd, working-hours handles, ${role}`;
    const t = await openAt({ role, tag });
    const { page } = t;
    await press(page, page, 'Working hours');
    const start = page.getByRole('slider', { name: 'Monday, start' });
    const finish = page.getByRole('slider', { name: 'Monday, finish' });
    const mins = async (loc) => Number(await loc.getAttribute('aria-valuenow'));
    const drag = async (loc, toMinutes) => { const b = await loc.boundingBox(); const y = (await point(page, D.mon, toMinutes)).y; await dragTo(page, { x: b.x + b.width / 2, y: b.y + 1 }, { x: b.x + b.width / 2, y }); };
    await drag(start, 20 * 60); // Monday is 09:00 to 18:30: the start dragged to 20:00, past the finish
    pass(`${tag}: the start dragged past the finish stops 15 minutes before it`, (await mins(start)) === (await mins(finish)) - 15 && (await mins(finish)) === 18 * 60 + 30, `${await start.textContent()} / ${await finish.textContent()}`);
    await drag(finish, 8 * 60 + 5); // and the finish dragged up past the start
    pass(`${tag}: the finish dragged past the start stops 15 minutes after it`, (await mins(finish)) === (await mins(start)) + 15, `${await start.textContent()} / ${await finish.textContent()}`);
    await start.focus();
    for (let i = 0; i < 100; i += 1) await page.keyboard.press('ArrowUp');
    await settle(page, 300);
    pass(`${tag}: the start held on the up arrow stops at 00:00`, (await mins(start)) === 0, await start.textContent());
    await finish.focus();
    for (let i = 0; i < 100; i += 1) await page.keyboard.press('ArrowDown');
    await settle(page, 300);
    pass(`${tag}: the finish held on the down arrow stops at 23:45, and the grid opens out to show it`, (await mins(finish)) === 23 * 60 + 45 && await finish.evaluate((el) => { const r = el.getBoundingClientRect(); const c = el.closest('[data-cal-day]').getBoundingClientRect(); return r.top >= c.top - 2 && r.bottom <= c.bottom + 30; }), await finish.textContent());
    await finish.focus();
    for (let i = 0; i < 100; i += 1) await page.keyboard.press('ArrowUp');
    await settle(page, 300);
    pass(`${tag}: and held on the up arrow it stops 15 minutes after the start, never above it`, (await mins(finish)) === 15 && (await mins(start)) === 0, `${await start.textContent()} / ${await finish.textContent()}`);
    await press(page, page, 'Done');
    const hours = (await t.rowsNow('coach_settings'))[0].working_hours;
    pass(`${tag}: Done saves a Monday that starts before it finishes`, hours.mon.from === '00:00' && hours.mon.to === '00:15' && hours.tue.from === '09:00', JSON.stringify(hours.mon));
    await undo(page);
    pass(`${tag}: and Undo puts the hours back`, (await t.rowsNow('coach_settings'))[0].working_hours.mon.to === '18:30');
    await t.done({ refusals: 0 });
  }
};
/** The seed's rows, for a database with no coach signed in. */
function seedWith() { seedClock(TUE); return seedWithCal({ accounts: true }); }

// ================================================================ 1. double bookings
PARTS['b-double'] = async (role) => {
  const tag = `double, ${role}`;
  const BLOCK = u(9701);
  const t = await openAt({ role, tag, change: (rows) => {
    // Fri 27 Nov: open from 08:00 to 13:00 as well (the seed opens 14:00 to 16:00), for the sixth call of a day.
    rows.coach_open_blocks.push({ id: BLOCK, coach_id: ME, starts_at: at(D.nextFri, '08:00'), ends_at: at(D.nextFri, '13:00'), time_zone: LON, call_type_id: null, created_at: at('2026-11-10', '09:00') });
  } });
  const { page, store } = t;
  const bookings = () => store.rows.coach_bookings.filter((b) => b.coach_id === ME && b.status === 'booked');
  const named = (name) => store.rows.coach_bookings.filter((b) => b.name === name && b.status === 'booked');
  const line = (g) => g.page.locator('.cc-problem[role=alert]').first().textContent().catch(() => '');

  // ---- two guests, the same start, the same tick
  const a = await guestPage(store);
  const b = await guestPage(store, { theme: 'dark' });
  for (const g of [a, b]) await g.open(`/book/${CAL.chemKey}`);
  const whenA = await readyToBook(a, { name: 'Owen Hart', email: 'owen@example.invalid' });
  const whenB = await readyToBook(b, { name: 'Ines Duarte', email: 'ines@example.invalid' });
  await Promise.all([bookButton(a).click(), bookButton(b).click()]);
  await settle(a.page, 1200); await settle(b.page, 300);
  const wonA = /You’re booked/.test(await a.words());
  const wonB = /You’re booked/.test(await b.words());
  const loser = wonA ? b : a;
  pass(`${tag}: two guests press Book for the same start in the same moment: one is booked`, whenA === whenB && wonA !== wonB && named('Owen Hart').length + named('Ines Duarte').length === 1, `${whenA} / ${whenB}: ${wonA} ${wonB}`);
  pass(`${tag}: the other reads "${TAKEN}"`, (await line(loser)) === TAKEN, await line(loser));
  const first = bookings().find((x) => ['Owen Hart', 'Ines Duarte'].includes(x.name));
  const offered = async (g) => g.page.evaluate(() => [...document.querySelectorAll('.cc-book-time')].map((el) => el.textContent.trim()));
  pass(`${tag}: and is offered the times again, without the one that went or anything inside 15 minutes of it`, (await offered(loser)).length > 0 && !(await offered(loser)).includes(wallClock(first.starts_at, LON).time) && !(await offered(loser)).includes(wallClock(first.ends_at, LON).time), (await offered(loser)).slice(0, 6).join(' '));
  pass(`${tag}: one calendar item and one lead were made for it, not two`, store.rows.coach_cal_items.filter((i) => ['Owen Hart', 'Ines Duarte'].includes(i.title)).length === 1 && store.rows.coach_leads.filter((l) => ['Owen Hart', 'Ines Duarte'].includes(l.name)).length === 1);

  // ---- a stale page: opened before someone else booked, never reloaded
  const stale = await guestPage(store);
  await stale.open(`/book/${CAL.chemKey}`);
  const staleWhen = await readyToBook(stale, { name: 'Stale Page', email: 'stale@example.invalid' });
  const quick = await guestPage(store);
  await quick.open(`/book/${CAL.chemKey}`);
  const quickWhen = await readyToBook(quick, { name: 'Quick Guest', email: 'quick@example.invalid' });
  await bookButton(quick).click(); await settle(quick.page, 1000);
  await bookButton(stale).click(); await settle(stale.page, 1000);
  pass(`${tag}: a page left open while someone else books its time reads the same calm line, and books nothing`, staleWhen === quickWhen && named('Quick Guest').length === 1 && named('Stale Page').length === 0 && (await line(stale)) === TAKEN, `${staleWhen} / ${quickWhen}: ${await line(stale)}`);
  await quick.ctx.close();

  // ---- the same guest pressing Book twice in the same moment
  await readyToBook(stale, { name: 'Stale Page', email: 'stale@example.invalid' });
  await twice(bookButton(stale)); await settle(stale.page, 1200);
  pass(`${tag}: Book pressed twice in the same moment makes one booking`, named('Stale Page').length === 1 && /You’re booked/.test(await stale.words()) && store.calls.filter((c) => c === 'rpc booking_make').length <= 5, `${named('Stale Page').length} bookings`);
  // …and Enter with a click, on their own booking's Move.
  const mine = named('Stale Page')[0];
  await stale.open(`/book/mine/${mine.guest_key}`);
  await stale.page.getByRole('button', { name: 'Move it', exact: true }).click(); await settle(stale.page, 900);
  await stale.page.locator('.cc-book-time').last().click(); await settle(stale.page, 300);
  const moves = store.rows.coach_notifications.filter((n) => /moved their call/.test(n.title)).length;
  await twice(stale.page.locator('.cc-book-move .ds-btn--primary')); await settle(stale.page, 1200);
  pass(`${tag}: Move pressed twice moves it once`, store.rows.coach_notifications.filter((n) => /moved their call/.test(n.title)).length === moves + 1 && named('Stale Page').length === 1 && /Moved\./.test(await stale.words()), await stale.words());
  await stale.ctx.close(); await a.ctx.close(); await b.ctx.close();

  // ---- a single-use link open in two tabs
  const l1 = await guestPage(store);
  const l2 = await guestPage(store);
  for (const x of [l1, l2]) await x.open(`/book/link/${CAL.linkPaulKey}`);
  const times = await offered(l1);
  await l1.page.locator('.cc-book-time').first().click(); await settle(l1.page, 300);
  await l2.page.locator('.cc-book-time').nth(Math.min(4, times.length - 1)).click(); await settle(l2.page, 300);
  for (const x of [l1, l2]) await x.page.getByLabel('Your email').fill('paul@example.invalid');
  await Promise.all([bookButton(l1).click(), bookButton(l2).click()]);
  await settle(l1.page, 1200); await settle(l2.page, 300);
  const got = [/You’re booked/.test(await l1.words()), /You’re booked/.test(await l2.words())];
  const lost = got[0] ? l2 : l1;
  pass(`${tag}: a single-use link open in two tabs, each choosing a different time, books once`, got[0] !== got[1] && named('Paul Garner').length === 1 && Boolean(store.rows.coach_booking_links.find((l) => l.id === CAL.linkPaul).used_at), `${got} ${named('Paul Garner').length}`);
  pass(`${tag}: the other tab reads "This link has already been used. Ask for a new one."`, /This link has already been used\. Ask for a new one\./.test(await lost.words()), flat(await lost.words()).slice(0, 200));
  await lost.page.reload(); await lost.page.waitForSelector('.cc-public'); await settle(lost.page, 900);
  pass(`${tag}: and reloaded it offers no times`, (await lost.page.locator('.cc-book-time').count()) === 0 && /already been used/.test(await lost.words()));
  // ---- a guest against the coach's own Book a call, for the same time
  const g = await guestPage(store);
  await g.open(`/book/${CAL.chemKey}`);
  await g.page.locator('.cc-book-days').getByRole('radio', { name: 'Fri 27', exact: true }).click(); await settle(g.page, 300);
  const friWhen = await readyToBook(g, { name: 'Grace Liu', email: 'grace@example.invalid', time: '14:00' });
  await t.go('/coach/calendar/book');
  await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
  await press(dialog(page), page, 'Choose my own time');
  await pickDate(dialog(page), page, 'Day', D.nextFri);
  await dialog(page).getByLabel('Starts').fill('14:00'); await settle(page, 400);
  await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 1200);
  const priya = store.rows.coach_cal_items.find((i) => i.title === 'Priya Nair' && same(i.starts_at, at(D.nextFri, '14:00')));
  pass(`${tag}: the coach books a client at Fri 14:00 while a guest's page still offers it`, Boolean(priya) && /Fri 27 Nov, 14:00/.test(friWhen), `${Boolean(priya)} ${friWhen} ${await dialog(page).locator('.cc-problem').textContent().catch(() => '')}`);
  await bookButton(g).click(); await settle(g.page, 1000);
  pass(`${tag}: the guest who then presses Book for it reads the calm line and is not booked`, (await line(g)) === TAKEN && named('Grace Liu').length === 0, await line(g));
  const after = await offered(g);
  pass(`${tag}: and their times no longer hold 14:00 to 15:00, or the 15 minutes after`, !['14:00', '14:15', '14:30', '14:45', '15:00'].some((x) => after.includes(x)), after.join(' '));
  // The other way round: a guest has the time, and the coach's own Book a call for it is refused.
  await g.page.locator('.cc-book-days').getByRole('radio', { name: 'Fri 27', exact: true }).click().catch(() => {}); await settle(g.page, 300);
  await readyToBook(g, { name: 'Grace Liu', email: 'grace@example.invalid', time: '15:15' });
  await bookButton(g).click(); await settle(g.page, 1000);
  const grace = named('Grace Liu')[0];
  pass(`${tag}: the guest books Fri 15:15 instead`, Boolean(grace) && same(grace.starts_at, at(D.nextFri, '15:15')), await g.words());
  await t.go('/coach/calendar/book');
  await pick(dialog(page), page, 'Who is it with', 'Sam Okafor');
  await press(dialog(page), page, 'Choose my own time');
  await pickDate(dialog(page), page, 'Day', D.nextFri);
  await dialog(page).getByLabel('Starts').fill('15:15'); await settle(page, 400);
  const itemsBefore = store.rows.coach_cal_items.length;
  await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 1200);
  const refusal = (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || '';
  pass(`${tag}: the coach's own Book a call over a guest's booking is refused calmly (the page had loaded before the guest booked, then heard of it)`, store.rows.coach_cal_items.length === itemsBefore ? /^That overlaps .+\. Choose another time\.$/.test(refusal) : false, refusal || `saved: ${store.rows.coach_cal_items.length - itemsBefore} more items`);
  if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
  await g.ctx.close();

  // ---- a client's own booking against a guest's (the database's own functions, as their pages call them)
  const client = store.rows.client_profiles.find((p) => p.user_id && p.coach_id === ME && p.id === ID.sam) || store.rows.client_profiles.find((p) => p.user_id && p.coach_id === ME);
  const fn = store.fn;
  const cs = (r) => r?.status;
  pass(`${tag}: a client can't book their coach at a guest's start, nor in the 15 minutes either side`, cs(fn.my_session_book(client.user_id, at(D.nextFri, '15:15'))) === 'taken' && cs(fn.my_session_book(client.user_id, at(D.nextFri, '15:45'))) === 'taken' && cs(fn.my_session_book(client.user_id, at(D.nextFri, '14:30'))) === 'taken');
  const mineBooked = fn.my_session_book(client.user_id, at(D.nextThu + '', '10:00'));
  const thuFree = cs(mineBooked) === 'booked';
  console.log(`  COUNT double: the client's own booking for Thu 26 Nov at 10:00 answers “${cs(mineBooked)}” (that day holds the seed's all-day conference).`);
  const tueStart = at('2026-11-24', '14:00');
  const clientBook = fn.my_session_book(client.user_id, tueStart);
  pass(`${tag}: the client books Tue 24 Nov at 14:00, in the coach's working hours`, cs(clientBook) === 'booked' || thuFree, JSON.stringify(clientBook));
  pass(`${tag}: and the same call asked for twice is booked once`, cs(fn.my_session_book(client.user_id, tueStart)) !== 'booked' && store.rows.coach_sessions.filter((s) => s.profile_id === client.id && same(s.starts_at, tueStart)).length === (cs(clientBook) === 'booked' ? 1 : 0));

  // ---- inside the 15-minute gap, and a sixth call in a day (the page's own function, with the page's own arguments)
  const book = (name, time, day = D.nextFri) => fn.booking_make(null, CAL.chemKey, at(day, time), name, `${name.replace(/\s+/g, '.').toLowerCase()}@example.invalid`, LON, { q: 'x' }, false);
  pass(`${tag}: a start that ends as a call begins, or begins as one ends, is inside the gap: refused`, cs(book('Gap One', '14:45')) === 'taken' && cs(book('Gap Two', '15:00')) === 'taken' && cs(book('Gap Three', '13:30')) === 'taken');
  // Fri 27 holds Priya (14:00) and Grace (15:15): three more make five.
  // Fri 27 holds Paul (the link, in the morning), Priya (14:00) and Grace (15:15): two more make five.
  const freeFri = () => fn.booking_free_times(null, CAL.chemKey, at(D.nextFri, '00:00'), at('2026-11-28', '00:00')).map((x) => wallClock(x.starts_at, LON).time);
  const made = [book('Call Four', freeFri()[0]), book('Call Five', freeFri()[0])].map(cs);
  const sixth = book('Call Six', '12:15');
  pass(`${tag}: with five calls that day the database offers no start on it`, freeFri().length === 0, freeFri().join(' '));
  const friCalls = store.rows.coach_cal_items.filter((i) => i.coach_id === ME && wallClock(i.starts_at, LON).date === D.nextFri && (['client_call', 'chemistry', 'connection'].includes(i.kind) || store.rows.coach_bookings.some((x) => x.item_id === i.id && x.status === 'booked'))).length;
  pass(`${tag}: two more calls on Fri 27 make five (a call booked through a single-use link counts), and a sixth is refused`, made.every((x) => x === 'booked') && friCalls === 5 && cs(sixth) === 'taken', `${made.join(',')} then ${cs(sixth)}; ${friCalls} calls`);
  const h = await guestPage(store);
  await h.open(`/book/${CAL.chemKey}`);
  pass(`${tag}: so a booking page offers no time at all on that day`, (await h.page.locator('.cc-book-days').getByRole('radio', { name: 'Fri 27', exact: true }).count()) === 0 && ((await h.page.locator('.cc-book-days').getByRole('radio').count()) > 0 || /There are no free times at the moment\. Try again in a few days\./.test(await h.words())), flat(await h.words()).slice(0, 160));
  {
    const fresh = bookStore(seedWith(), { now: () => new Date(TUE) });
    const e = 'many@example.invalid';
    const r = [[D.nextMon, '14:00'], [D.nextMon, '14:45'], [D.nextFri, '14:00']].map(([d, time]) => fresh.fn.booking_make(null, CAL.chemKey, at(d, time), 'Many Calls', e, LON, {}, false).status);
    const fourth = fresh.fn.booking_make(null, CAL.chemKey, at(D.nextFri, '15:00'), 'Many Calls', e, LON, {}, false).status;
    pass(`${tag}: the same email can hold 3 calls to come, and a fourth says so`, r.every((x) => x === 'booked') && fourth === 'too_many', `${r.join(',')} then ${fourth}`);
  }

  pass(`${tag}: no page error on any guest's page`, [a, b, g, h, l1, l2].every((x) => x.errors.length === 0), [a, b, g, h, l1, l2].flatMap((x) => x.errors).slice(0, 2).join(' | '));
  pass(`${tag}: nothing but 051's functions was asked by a guest's page, and no write was tried`, (store.blocked || []).length === 0, (store.blocked || []).slice(0, 3).join(', '));
  for (const x of [h, l1, l2]) await x.ctx.close().catch(() => {});

  // The coach's calendar holds each booked call once.
  await t.go(`/coach/calendar?view=day&day=${D.nextFri}`);
  const titles = await page.locator('[data-cal-key] .cc-cal-title').allTextContents();
  pass(`${tag}: the coach's Friday shows each call once`, ['Paul Garner', 'Priya Nair', 'Grace Liu', 'Call Four', 'Call Five'].every((n) => titles.filter((x) => x === n).length === 1) && !titles.includes('Call Six'), titles.join(', '));
  await t.done({ api: ['/api/booking-email'], waiting: true });
};

// ================================================================ 6. a booking at 02:00 the guest's time, and booking_make called directly
PARTS['b-forced'] = async (role) => {
  const tag = `forced, ${role}`;
  seedClock(TUE);
  const rows = seedWithCal({ accounts: true });
  // Mon 23 Nov, 17:00 to 18:00 in London is 02:00 to 03:00 on Tuesday in Tokyo.
  rows.coach_open_blocks.push({ id: u(9711), coach_id: ME, starts_at: at(D.nextMon, '17:00'), ends_at: at(D.nextMon, '18:00'), time_zone: LON, call_type_id: null, created_at: at('2026-11-10', '09:00') });
  const store = bookStore(rows, { now: () => new Date(TUE) });
  const count = () => store.rows.coach_bookings.length;
  const g = await guestPage(store, { timezoneId: 'Asia/Tokyo' });
  await g.open(`/book/${CAL.chemKey}`);
  const zone = flat(await g.page.getByRole('combobox', { name: /^Your time zone/ }).textContent());
  pass(`${tag}: the page starts in the visitor's own zone (Tokyo)`, /Tokyo/.test(zone), zone);
  const allTimes = async () => { const out = []; const days = g.page.locator('.cc-book-days').getByRole('radio'); for (let i = 0; i < await days.count(); i += 1) { await days.nth(i).click(); await settle(g.page, 150); out.push(...(await g.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim())); } return out; };
  const shownFirst = await allTimes();
  pass(`${tag}: 02:00 Tokyo time is hidden to start with, and so is every time outside 07:00 to 20:00 there (here, all of them: the page says so)`, shownFirst.every((x) => x >= '07:00' && x <= '19:30') && !shownFirst.includes('02:00') && (shownFirst.length > 0 || /The free times are early or late where you are\./.test(await g.words())), `${shownFirst.join(' ')} ${flat(await g.words()).slice(0, 140)}`);
  await g.page.getByRole('button', { name: 'Show early and late times', exact: true }).click(); await settle(g.page, 400);
  const shownAll = await allTimes();
  pass(`${tag}: "Show early and late times" brings 02:00 and 02:15`, shownAll.includes('02:00') && shownAll.includes('02:15'), shownAll.join(' '));
  // Forced: the page's own request, changed on its way out to what no page would send. Each is refused with its calm line, and nothing is booked.
  const WORDS = { quarter: 'Calls start on a quarter hour. Choose one of the times shown.', hours: 'That time is early or late where you are. Choose “Show early and late times” to book it.', name: 'Type your name to carry on.', email: 'That email doesn’t look right. Check it and try again.', zone: 'Choose your time zone to carry on.', too_long: 'That’s too long to send. Shorten your answers and try again.', not_found: 'This link isn’t working. Ask for a new one.' };
  let change = null;
  await g.page.route('**/rest/v1/rpc/booking_make', (route) => { const body = route.request().postDataJSON(); return route.fallback({ postData: JSON.stringify(change ? change(body) : body) }); });
  const tokyo2 = at('2026-11-24', '02:00', 'Asia/Tokyo');
  const cases = [
    ['02:00 without "early and late" agreed', (b) => ({ ...b, p_early_late: false }), WORDS.hours],
    ['a start 10 minutes off the quarter hour', (b) => ({ ...b, p_start: new Date(new Date(tokyo2).getTime() + 10 * 60000).toISOString() }), WORDS.quarter],
    ['a start with seconds on it', (b) => ({ ...b, p_start: new Date(new Date(tokyo2).getTime() + 30000).toISOString() }), WORDS.quarter],
    ['a time that has passed', (b) => ({ ...b, p_start: at('2026-11-16', '14:00') }), TAKEN],
    ['a time inside the notice needed (in 3 hours)', (b) => ({ ...b, p_start: at(D.tue, '12:00') }), TAKEN],
    ['a time outside every Open block', (b) => ({ ...b, p_start: at('2026-11-24', '10:00') }), TAKEN],
    ['a time further ahead than the page opens', (b) => ({ ...b, p_start: at('2027-03-01', '14:00') }), TAKEN],
    ['a time years away', (b) => ({ ...b, p_start: '9999-12-31T14:00:00.000Z' }), TAKEN],
    ['an answer of 20,000 bytes', (b) => ({ ...b, p_answers: { q: 'a'.repeat(20000) } }), WORDS.too_long],
    ['answers that are a list', (b) => ({ ...b, p_answers: ['a', 'b'] }), WORDS.too_long],
    ['the zone "EST"', (b) => ({ ...b, p_zone: 'EST' }), WORDS.zone],
    ['the zone "+05:00"', (b) => ({ ...b, p_zone: '+05:00' }), WORDS.zone],
    ['no zone', (b) => ({ ...b, p_zone: '' }), WORDS.zone],
    ['no name', (b) => ({ ...b, p_name: '' }), WORDS.name],
    ['a name of only unseen characters', (b) => ({ ...b, p_name: '​‍ ﻿' }), WORDS.name],
    ['a name of 121 characters', (b) => ({ ...b, p_name: 'N'.repeat(121) }), WORDS.name],
    ['a bad email', (b) => ({ ...b, p_email: 'not an email' }), WORDS.email],
    ['two addresses as one email', (b) => ({ ...b, p_email: 'a@example.invalid,b@example.invalid' }), WORDS.email],
    ['a key nobody has', (b) => ({ ...b, p_key: u(999999) }), WORDS.not_found],
  ];
  for (const [what, mutate, want] of cases) {
    await g.open(`/book/${CAL.chemKey}`);
    await g.page.getByRole('button', { name: 'Show early and late times', exact: true }).click(); await settle(g.page, 300);
    const days = g.page.locator('.cc-book-days').getByRole('radio');
    let found = false;
    for (let i = 0; i < await days.count() && !found; i += 1) { await days.nth(i).click(); await settle(g.page, 150); found = (await g.page.locator('.cc-book-time', { hasText: /^02:00$/ }).count()) > 0; }
    await readyToBook(g, { name: 'Forced Guest', email: 'forced@example.invalid', time: /^02:00$/ });
    const before = count();
    change = mutate;
    await bookButton(g).click(); await settle(g.page, 900);
    change = null;
    const said = (await g.page.locator('.cc-problem[role=alert]').first().textContent().catch(() => '')) || '';
    pass(`${tag}: ${what} is refused calmly, and nothing is booked`, found && said === want && count() === before && !/fail|error|undefined|null/i.test(said) && !/You’re booked/.test(await g.words()), said || flat(await g.words()).slice(0, 120));
  }
  // And unforced, 02:00 books, anchored to Tokyo.
  await g.open(`/book/${CAL.chemKey}`);
  await g.page.getByRole('button', { name: 'Show early and late times', exact: true }).click(); await settle(g.page, 300);
  { const days = g.page.locator('.cc-book-days').getByRole('radio'); for (let i = 0; i < await days.count(); i += 1) { await days.nth(i).click(); await settle(g.page, 150); if (await g.page.locator('.cc-book-time', { hasText: /^02:00$/ }).count()) break; } }
  const both = await readyToBook(g, { name: 'Haruto Sato', email: 'haruto@example.invalid', time: /^02:00$/ });
  await bookButton(g).click(); await settle(g.page, 1000);
  const made = store.rows.coach_bookings.find((b) => b.name === 'Haruto Sato');
  pass(`${tag}: chosen with early and late times showing, 02:00 Tokyo time books: Tue 24 Nov there, Mon 23 Nov 17:00 in the UK, and both days are said first`, made?.time_zone === 'Asia/Tokyo' && same(made.starts_at, at(D.nextMon, '17:00')) && /Tue 24 Nov, 02:00 Tokyo time/.test(both) && /Mon 23 Nov, 17:00 UK time/.test(both) && /You’re booked for Tue 24 Nov, 02:00 Tokyo time\./.test(flat(await g.words())), `${both} / ${flat(await g.words()).slice(0, 120)}`);
  pass(`${tag}: no page error, and no write was tried`, g.errors.length === 0 && store.blocked.length === 0, [...g.errors, ...store.blocked].slice(0, 3).join(' | '));
  await g.ctx.close();
  void role;
};

// ================================================================ 8. who sees what
PARTS['b-reach'] = async () => {
  const SECRET = /secret/i;
  const T = { item: u(9801), type: u(9802), pageKey: u(9803), poll: u(9804), person: u(9805), voteKey: u(9806), option: u(9807), link: u(9808), linkKey: u(9809), block: u(9810), booking: u(9811), guestKey: u(9812), lead: u(9813), hold: u(9814), guest: u(9815) };
  /** Rows that belong to the OTHER coach, in every one of 051's tables. */
  const others = (rows, name) => {
    const made = at('2026-11-10', '09:00');
    rows.coach_cal_items.push(
      seedItem(T.item, `${name} secret meeting`, D.wed, '10:00', '11:00', { coach_id: OTHER, notes: `${name} secret note`, location: `${name} secret place` }),
      seedItem(T.hold, `${name} secret hold`, D.thu, '10:00', '11:00', { coach_id: OTHER, kind: 'hold', poll_option_id: T.option }));
    rows.coach_cal_guests.push({ id: T.guest, item_id: T.item, coach_id: OTHER, name: `${name} secret guest`, email: 'secret-guest@example.invalid', profile_id: null, guest_coach_id: null, contact_id: null, reply: 'none', replied_at: null, invited_at: null, position: 0, created_at: made });
    rows.coach_call_types.push({ ...rows.coach_call_types[0], id: T.type, coach_id: OTHER, key: 'chemistry', name: `${name} secret call`, page_key: T.pageKey });
    rows.coach_polls.push({ ...rows.coach_polls[0], id: T.poll, coach_id: OTHER, title: `${name} secret poll` });
    rows.coach_poll_people.push({ ...rows.coach_poll_people[0], id: T.person, poll_id: T.poll, coach_id: OTHER, name: `${name} secret person`, email: 'secret-person@example.invalid', vote_key: T.voteKey, profile_id: null });
    rows.coach_poll_options.push({ ...rows.coach_poll_options[0], id: T.option, poll_id: T.poll, coach_id: OTHER });
    rows.coach_booking_links.push({ ...rows.coach_booking_links[0], id: T.link, coach_id: OTHER, key: T.linkKey, purpose: `${name} secret link`, for_name: `${name} secret visitor` });
    rows.coach_open_blocks.push({ id: T.block, coach_id: OTHER, starts_at: at(D.nextMon, '09:00'), ends_at: at(D.nextMon, '11:00'), time_zone: LON, call_type_id: null, created_at: made });
    rows.coach_bookings.push({ ...rows.coach_bookings[0], id: T.booking, coach_id: OTHER, call_type_id: T.type, item_id: T.item, lead_id: T.lead, name: `${name} secret booker`, email: 'secret-booker@example.invalid', guest_key: T.guestKey, starts_at: at(D.wed, '10:00'), ends_at: at(D.wed, '11:00') });
    rows.coach_leads.push({ ...rows.coach_leads[0], id: T.lead, coach_id: OTHER, name: `${name} secret lead`, email: 'secret-lead@example.invalid', booking_id: T.booking });
  };
  for (const [role, theirs] of [['associate', 'Owner’s'], ['owner', 'Associate’s']]) {
    const tag = `reach, ${role === 'associate' ? 'an associate reaching for the owner’s' : 'the owner reaching for an associate’s'}`;
    const t = await openAt({ role, tag, change: (rows) => others(rows, theirs) });
    const { page, store, me } = t;
    const mineBefore = JSON.stringify(store.rows.coach_cal_items.filter((i) => i.coach_id === OTHER));
    for (const [path, what] of [
      ['/coach/calendar?view=week', 'the week'], ['/coach/calendar?view=day&day=2026-11-18', 'the day their item is on'], ['/coach/calendar?view=month', 'the month'], ['/coach/calendar?view=schedule', 'the Schedule'],
      [`/coach/calendar/polls/${T.poll}`, 'their poll’s address'], ['/coach/calendar/open', 'Open for calls'], ['/coach/calendar/book', 'Book a call'], ['/coach/calendar/offer', 'Offer times by email'],
      ['/coach/settings/booking', 'Settings, Booking (the pages and links)'], ['/coach/settings/calendars', 'Settings, My calendars'], ['/coach', 'Today'], ['/coach/todos?view=calendar', 'To-dos as a calendar'],
    ]) {
      await t.go(path, 900);
      const text = await page.evaluate(() => document.body.innerText);
      const html = await page.evaluate(() => document.body.innerHTML);
      pass(`${tag}: ${what} shows nothing of the other coach's, in words or in a link`, !SECRET.test(text) && ![T.pageKey, T.linkKey, T.voteKey, T.guestKey].some((k) => html.includes(k)), `${path}: ${flat(text).match(/.{0,40}secret.{0,40}/i)?.[0] || 'a key in the page'}`);
      if (/polls\//.test(path)) pass(`${tag}: their poll's address opens a calm line, not a poll`, /isn’t here any more|Calendar/i.test(text) && (await page.locator('.cc-poll-row').count()) === 0, flat(text).slice(0, 140));
      if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
    }
    await t.go('/coach/calendar?view=week');
    await page.getByRole('button', { name: 'Search, or do anything' }).click(); await settle(page, 300);
    await page.keyboard.type('secret'); await settle(page, 500);
    pass(`${tag}: search finds nothing of it`, /Nothing matches/.test(await page.locator('.cc-jump-list').innerText().catch(() => '')), await page.locator('.cc-jump-list').innerText().catch(() => ''));
    await page.keyboard.press('Escape'); await settle(page, 300);
    // Their time is theirs: it never blocks this coach's own calendar or booking.
    await dragTo(page, await point(page, D.wed, 10 * 60 + 5, 0.5), await point(page, D.wed, 11 * 60 - 3, 0.5));
    const quick = page.locator('.cc-cal-quick');
    await quick.getByLabel('Title').fill('Mine at the same time'); await quick.locator('.ds-btn--primary').click(); await settle(page, 900);
    pass(`${tag}: their own item at the other coach's time saves as usual`, store.rows.coach_cal_items.some((i) => i.title === 'Mine at the same time' && i.coach_id === ME));
    const device = await page.evaluate(() => Object.keys(localStorage).filter((k) => /coach/.test(k)).map((k) => localStorage.getItem(k)).join('\n'));
    pass(`${tag}: nothing of the other coach's calendar is in the device copy`, !SECRET.test(device) && ![T.item, T.pageKey, T.linkKey, T.voteKey, T.guestKey, T.poll].some((k) => device.includes(k)) && device.includes(CAL.training), `${device.length} characters`);
    pass(`${tag}: the database kept those rows back (${store.withheld} times), and none of them changed`, store.withheld > 0 && JSON.stringify(store.rows.coach_cal_items.filter((i) => i.coach_id === OTHER)) === mineBefore);
    // A write aimed at the other coach's rows by hand (the page's own sign-in, as a curious coach's console would send it).
    const tried = await page.evaluate(async ([id, pollId, base]) => {
      const key = Object.keys(localStorage).find((k) => k === 'clarity-portal-auth' || /^sb-.*-auth-token$/.test(k));
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      const token = s.access_token || s.currentSession?.access_token;
      const send = (method, path, body) => fetch(`${base}/rest/v1/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: 'stand-in', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => `${r.status} ${(await r.text()).slice(0, 60)}`).catch((e) => `stopped ${e.message}`);
      return [await send('PATCH', `coach_cal_items?id=eq.${id}`, { title: 'Taken over' }), await send('DELETE', `coach_cal_items?id=eq.${id}`), await send('DELETE', `coach_polls?id=eq.${pollId}`), await send('GET', `coach_cal_items?id=eq.${id}`), await send('GET', 'coach_bookings?select=*'), await send('GET', 'coach_connections?select=*')];
    }, [T.item, T.poll, String(readEnv().TEST_SUPABASE_URL).replace(/\/$/, '')]); // answered by the stand-in: nothing leaves this computer
    const their = store.rows.coach_cal_items.find((i) => i.id === T.item);
    pass(`${tag}: a change, a delete and a read aimed at their rows by hand touch and return nothing`, their?.title.endsWith('secret meeting') && store.rows.coach_polls.some((p) => p.id === T.poll) && !tried.join(' ').match(/secret/i) && /^(200 \[\]|4\d\d)/.test(tried[3]) && /^4\d\d/.test(tried[5]), tried.join(' | ').slice(0, 300));
    await t.done({ refusals: null, waiting: true });
  }

  // ---- signed out, guessing
  seedClock(TUE);
  const rows = seedWithCal({ accounts: true });
  const store = bookStore(rows, { now: () => new Date(TUE) });
  const g = await guestPage(store);
  const seen = [];
  g.page.on('response', async (res) => { if (/\/rest\/v1\/rpc\//.test(res.url())) seen.push(`${res.url().split('/rpc/')[1]} ${await res.text().catch(() => '')}`); });
  const NOT = /This link isn’t working\. Ask for a new one\./;
  for (const [path, what] of [
    [`/book/${u(1)}`, 'a booking page with a key nobody has'], [`/book/link/${u(2)}`, 'a single-use link with a key nobody has'], [`/book/mine/${u(3)}`, 'a booking with a key nobody has'], [`/poll/${u(4)}`, 'a poll with a key nobody has'],
    [`/book/mine/${CAL.chemKey}`, 'a page’s key used as a guest’s'], [`/book/${CAL.bookRuthKey}`, 'a guest’s key used as a page’s'], [`/book/${CAL.pollMiaKey}`, 'a poll key used as a page’s'], [`/poll/${CAL.chemKey}`, 'a page’s key used as a poll’s'],
    [`/book/mine/${CAL.linkDanaKey}`, 'a link’s key used as a guest’s'], [`/book/${CAL.chem}`, 'a call type’s id (not its key)'], [`/poll/${CAL.poll}`, 'a poll’s id (not a person’s key)'], [`/poll/${CAL.pollMia}`, 'a person’s id (not their key)'],
    ['/book/abc', 'a key that isn’t one'], ['/book/mine/..%2F..%2Fcoach', 'a key made to look like an address'], ['/poll/%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'a key made of markup'], [`/book/${CAL.chemKey.toUpperCase()}x`, 'a real key with a letter added'],
  ]) {
    const asked = store.calls.length;
    await g.page.goto(`${APP}${path}`); await g.page.waitForSelector('.cc-public, .ui-root', { timeout: 20000 }).catch(() => {}); await settle(g.page, 900);
    const text = flat(await g.page.evaluate(() => document.body.innerText));
    const out = !/^\/(book|poll)/.test(new URL(g.page.url()).pathname);
    pass(`reach, signed out: ${what} opens nothing`, (NOT.test(text) || out) && !/Chemistry Call|Three-way meeting|Ruth|Sponsor call|Training/.test(text) && (await g.page.locator('.cc-book-time, [role=checkbox]').count()) === 0, `${path}: ${text.slice(0, 120)}`);
    if (!/[0-9a-f]{12}$/i.test(path)) pass(`reach, signed out: (${what}: the database isn't even asked)`, store.calls.length === asked, store.calls.slice(asked).join(', '));
  }
  // What the real pages are given: their own call, free starts, their own booking, their own answers. Never the calendar.
  seen.length = 0;
  await g.open(`/book/${CAL.chemKey}`);
  await g.open(`/book/link/${CAL.linkDanaKey}`);
  await g.open(`/book/mine/${CAL.bookRuthKey}`);
  await g.page.getByRole('button', { name: 'Move it', exact: true }).click().catch(() => {}); await settle(g.page, 900);
  await g.open(`/poll/${CAL.pollMiaKey}`);
  const given = seen.join('\n');
  // (Ruth, Dana and Mia are the three keyholders here: each is given their own name, and nobody else's.)
  const own = ['Ruth Adeyemi', 'Mia and Paul', 'Mia Torres', 'Dana Whitfield'];
  const titles = rows.coach_cal_items.map((i) => i.title).filter((x) => !own.includes(x));
  const leaked = [...titles, ...rows.coach_cal_guests.map((x) => x.name).filter((x) => !own.includes(x)), 'Paul Garner', 'paul@example.invalid', 'nadia@example.invalid', 'Nadia Osei', 'ruth@example.invalid', 'mia@example.invalid', 'dana@example.invalid', CAL.connKey, CAL.bookNadiaKey, CAL.pollPaulKey, '"notes"', '"email"', '"answers"', 'Northfield', 'Lighthouse'].filter((x) => x && given.includes(x));
  pass('reach, signed out: what a booking page, a link, a guest’s own booking and a poll are given holds no item’s title, no guest, no other person’s email or key', seen.length >= 6 && leaked.length === 0, `${seen.length} answers; ${[...new Set(leaked)].slice(0, 6).join(', ')}`);
  const pollText = flat(await g.words());
  pass('reach, signed out: Mia’s poll page shows her own answers and nobody else’s', /Three-way meeting/.test(pollText) && !/Paul/.test(pollText) && !/paul_key|can’t make/.test(given.split('\n').filter((l) => l.startsWith('poll_page')).join('')) && !given.includes(CAL.pollPaul));
  pass('reach, signed out: no page error, and nothing but 051’s functions was asked', g.errors.length === 0 && store.blocked.length === 0, [...g.errors, ...store.blocked].slice(0, 3).join(' | '));
  await g.ctx.close();
};

// ================================================================ 4. across midnight, and the clock-change nights
PARTS['b-midnight'] = async (role) => {
  const tag = `midnight, ${role}`;
  const SPRING = u(9901);
  const AUTUMN = u(9902);
  const t = await openAt({ role, tag, path: '/coach/calendar?view=week', change: (rows) => {
    rows.coach_cal_items.push(seedItem(SPRING, 'Spring item', '2026-03-29', '10:00', '11:00'), seedItem(AUTUMN, 'Autumn item', '2026-10-25', '10:00', '11:00'));
  } });
  const { page } = t;
  await page.setViewportSize({ width: 1440, height: 2600 }); // the whole day on screen at once, so a drag never leaves the window
  const whole = async () => { if (await page.getByRole('button', { name: 'Show the whole day', exact: true }).count()) await press(page, page, 'Show the whole day'); };
  await whole();
  const keyed = (day) => page.locator(`[data-cal-day="${day}"] [data-cal-key="${CAL.priyaTue}"]`);

  // ---- a call dragged across midnight
  const priya0 = await t.one('coach_cal_items', CAL.priyaTue);
  await dragTile(page, keyed(D.tue).first(), { fromDay: D.tue, toDay: D.tue, minutes: 390 }); // 17:00 to 23:30
  let row = await t.one('coach_cal_items', CAL.priyaTue);
  let said = await toast(page);
  pass(`${tag}: a call dragged to 23:30 runs over midnight and keeps its hour`, same(row.starts_at, at(D.tue, '23:30')) && same(row.ends_at, at(D.wed, '00:30')), `${row.starts_at} ${row.ends_at}`);
  pass(`${tag}: its toast says where it went and to tell the client`, /^Moved to Tue 23:30\. Tell Priya the new time\.$/.test(said), said);
  if (priya0.session_id) pass(`${tag}: its session goes with it`, same((await t.one('coach_sessions', priya0.session_id)).starts_at, at(D.tue, '23:30')));
  pass(`${tag}: it is drawn on both days: Tuesday to midnight, and Wednesday from midnight`, (await keyed(D.tue).count()) === 1 && (await keyed(D.wed).count()) === 1
    && await keyed(D.wed).first().evaluate((el) => { const c = el.closest('[data-cal-day]').getBoundingClientRect(); const r = el.getBoundingClientRect(); return Math.abs(r.top - c.top) <= 3 && r.height > 4; }).catch(() => false), `${await keyed(D.tue).count()} on Tue; on Wed: ${(await keyed(D.wed).evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')} [${el.dataset.calKey.slice(-8)} ${Math.round(el.getBoundingClientRect().top)} ${Math.round(el.getBoundingClientRect().height)}]`))).join(' | ')}`);
  pass(`${tag}: a screen reader hears its real times`, /Tue 17 Nov, 23:30 to 00:30/.test((await keyed(D.tue).first().getAttribute('aria-label')) || ''), (await keyed(D.tue).first().getAttribute('aria-label')) || '');
  // Dragged below the foot of the day: it stops at the day's last quarter hour, never off the calendar.
  const b = await keyed(D.tue).first().boundingBox();
  await dragTo(page, { x: b.x + b.width / 2, y: b.y + 4 }, { x: b.x + b.width / 2, y: b.y + 400 });
  row = await t.one('coach_cal_items', CAL.priyaTue);
  pass(`${tag}: dragged past the foot of the day it stops at 23:45, an hour long still`, same(row.starts_at, at(D.tue, '23:45')) && same(row.ends_at, at(D.wed, '00:45')), `${row.starts_at}`);
  // The arrow keys carry it over midnight into the next day.
  await keyed(D.tue).first().focus();
  await page.keyboard.press('ArrowDown'); await settle(page, 900);
  row = await t.one('coach_cal_items', CAL.priyaTue);
  pass(`${tag}: one arrow key later it starts at 00:00 on Wednesday, and sits on Wednesday alone`, same(row.starts_at, at(D.wed, '00:00')) && (await keyed(D.tue).count()) === 0 && (await keyed(D.wed).count()) === 1, `${row.starts_at}`);
  await keyed(D.wed).first().focus();
  await page.keyboard.press('ArrowUp'); await settle(page, 900);
  row = await t.one('coach_cal_items', CAL.priyaTue);
  pass(`${tag}: and one back, 23:45 on Tuesday again`, same(row.starts_at, at(D.tue, '23:45')), row.starts_at);
  // The continuation on Wednesday can be dragged too: the whole call moves, by its own start.
  await dragTile(page, keyed(D.wed).first(), { fromDay: D.wed, toDay: D.thu, minutes: 0 });
  row = await t.one('coach_cal_items', CAL.priyaTue);
  pass(`${tag}: dragging the part that shows on the next day moves the whole call a day, at the same clock time`, same(row.starts_at, at(D.wed, '23:45')) && same(row.ends_at, at(D.thu, '00:45')), `${row.starts_at} ${await toast(page)}`);

  // ---- resized across midnight
  const admin = () => tile(page, D.wed, 'Admin');
  const ab = await admin().boundingBox();
  const foot = (await point(page, D.wed, 24 * 60)).y;
  await dragTo(page, { x: ab.x + ab.width / 2, y: ab.y + ab.height - 3 }, { x: ab.x + ab.width / 2, y: foot + 80 });
  row = await t.one('coach_cal_items', CAL.admin);
  said = await toast(page);
  const endWall = wallClock(row.ends_at, LON);
  console.log(`  COUNT midnight: Admin (Wed 14:00) resized by dragging its foot 80px below the foot of the day ends at ${endWall.date} ${endWall.time}; the toast reads “${said}”.`);
  pass(`${tag}: a tile resized past the foot of the day carries on into the next day, to a quarter hour, and its toast says the real end`, same(row.starts_at, at(D.wed, '14:00')) && endWall.date === D.thu && endWall.minute % 15 === 0 && endWall.time <= '03:00' && said === `Now 14:00 to ${endWall.time}.`, `${row.ends_at} ${said}`);
  pass(`${tag}: and it is drawn on both days`, (await tiles(page, D.wed, 'Admin').count()) === 1 && (await tiles(page, D.thu, 'Admin').count()) === (endWall.time === '00:00' ? 0 : 1));
  await admin().click(); await settle(page, 700);
  await dialog(page).getByLabel('Ends').fill('01:30'); await settle(page, 300);
  pass(`${tag}: typed to end at 01:30 the panel says how long that is (11 hours 30 minutes)`, /11 hours 30 minutes, in 5-minute steps\./.test(await dialog(page).textContent()));
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  row = await t.one('coach_cal_items', CAL.admin);
  pass(`${tag}: and it ends at 01:30 on Thursday, drawn on both days`, same(row.ends_at, at(D.thu, '01:30')) && (await tiles(page, D.wed, 'Admin').count()) === 1 && (await tiles(page, D.thu, 'Admin').count()) === 1, row.ends_at);

  // ---- in the second time column's zone: a Chicago client's call moved so that it is the day before for them
  await t.go('/coach/calendar?view=day&day=2026-11-17'); await whole();
  await page.locator('.cc-cal-zone-btn').click(); await settle(page, 400);
  await page.getByRole('menuitemcheckbox', { name: 'Chicago' }).click(); await settle(page, 600);
  const jordan0 = await t.one('coach_cal_items', CAL.jordanTue);
  await dragTile(page, tile(page, D.tue, 'Jordan Reyes'), { fromDay: D.tue, toDay: D.tue, minutes: -(15 * 60 + 45 - 5 * 60 - 30) }); // 15:45 to 05:30 UK time: 23:30 on Monday in Chicago
  row = await t.one('coach_cal_items', CAL.jordanTue);
  const label = (await tile(page, D.tue, 'Jordan Reyes').getAttribute('aria-label')) || '';
  pass(`${tag}: a Chicago client's call dragged to 05:30 UK time is 11:30 pm on Monday for them, and stays anchored to Chicago`, same(row.starts_at, at(D.tue, '05:30')) && row.time_zone === 'America/Chicago' && wallClock(row.starts_at, 'America/Chicago').date === D.mon && wallClock(row.starts_at, 'America/Chicago').time === '23:30', `${row.starts_at} ${row.time_zone}`);
  pass(`${tag}: its tile and a screen reader give the client's own day: "Mon 16 Nov, 11:30 pm Chicago"`, /Mon 16 Nov, 11:30 pm Chicago/.test(label) && /Mon 16 Nov, 11:30 pm Chicago/.test(await tile(page, D.tue, 'Jordan Reyes').textContent()), label);
  if (jordan0.session_id) pass(`${tag}: and its session follows`, same((await t.one('coach_sessions', jordan0.session_id)).starts_at, at(D.tue, '05:30')));
  const cols = await page.evaluate(() => { const c = [...document.querySelectorAll('.cc-cal-times')].map((x) => [...x.querySelectorAll('.cc-cal-hour')].map((h) => h.textContent.trim())); return { zone: document.querySelector('.cc-cal-zone')?.textContent.trim(), rows: c[1].map((uk, i) => [c[0][i], uk]) }; });
  pass(`${tag}: the Chicago column reads 18:00 beside midnight UK time and 00:00 beside 06:00`, cols.zone === 'Chicago' && cols.rows.some(([o, k]) => k === '00:00' && o === '18:00') && cols.rows.some(([o, k]) => k === '06:00' && o === '00:00'), `${cols.zone} ${JSON.stringify(cols.rows.slice(0, 7))}`);
  await tile(page, D.tue, 'Jordan Reyes').focus();
  for (let i = 0; i < 2; i += 1) { await page.keyboard.press('ArrowDown'); await settle(page, 900); }
  row = await t.one('coach_cal_items', CAL.jordanTue);
  pass(`${tag}: two arrow keys on, 06:00 UK time is midnight on Tuesday in Chicago, and the tile drops the day`, same(row.starts_at, at(D.tue, '06:00')) && /12:00 am Chicago/.test(await tile(page, D.tue, 'Jordan Reyes').textContent()) && !/Mon 16 Nov/.test(await tile(page, D.tue, 'Jordan Reyes').textContent()), await tile(page, D.tue, 'Jordan Reyes').textContent());

  // ---- the clock-change nights (the UK's: 29 Mar 2026, when 01:00 to 02:00 isn't there; 25 Oct 2026, when it comes twice)
  for (const [day, id, name, what, wantWall] of [['2026-03-29', SPRING, 'Spring item', 'the hour that isn’t there', '02:15'], ['2026-10-25', AUTUMN, 'Autumn item', 'the hour that comes twice', '01:15']]) {
    await t.go(`/coach/calendar?view=day&day=${day}`); await whole();
    pass(`${tag}: ${day}: the day opens, with ${day === '2026-03-29' ? 24 : 24} hour rows`, (await page.locator('.cc-cal-times').nth(1).locator('.cc-cal-hour').count()) === 24 && (await tiles(page, day, name).count()) === 1);
    await dragTile(page, tile(page, day, name), { fromDay: day, toDay: day, minutes: -(10 * 60 - 75) }); // 10:00 to 01:15
    row = await t.one('coach_cal_items', id);
    said = await toast(page);
    const mins = (new Date(row.ends_at) - new Date(row.starts_at)) / 60000;
    const wall = wallClock(row.starts_at, LON);
    console.log(`  COUNT midnight: ${day}: an item dragged to 01:15, in ${what}, is saved at ${wall.time} UK time (${row.starts_at}) and the toast reads “${said}”.`);
    pass(`${tag}: ${day}: an item dragged onto ${what} is saved at a real moment, an hour long, on that day`, mins === 60 && wall.date === day && wall.time === wantWall, `${row.starts_at} for ${mins}`);
    pass(`${tag}: ${day}: the toast and the tile say the time it was really given`, said === `Moved to Sun ${wall.time}.` && (await tiles(page, day, name).count()) === 1 && new RegExp(`${wall.time} to `).test((await tile(page, day, name).getAttribute('aria-label')) || ''), `${said} / ${await tile(page, day, name).getAttribute('aria-label')}`);
    // Made new by dragging over the hour itself.
    await dragTo(page, await point(page, day, 60 + 2, 0.8), await point(page, day, 120 - 3, 0.8));
    const quick = page.locator('.cc-cal-quick');
    const when = (await quick.locator('.cc-cal-quick-when').textContent().catch(() => '')) || '';
    await quick.getByLabel('Title').fill(`Made in ${day}`); await quick.locator('.ds-btn--primary').click(); await settle(page, 900);
    const made = (await t.rowsNow('coach_cal_items')).find((i) => i.title === `Made in ${day}`);
    const madeMins = made ? (new Date(made.ends_at) - new Date(made.starts_at)) / 60000 : 0;
    const shownSpan = made ? `${wallClock(made.starts_at, LON).time} to ${wallClock(made.ends_at, LON).time}` : '';
    console.log(`  COUNT midnight: ${day}: dragging 01:00 to 02:00 offers “${when}” and saves ${shownSpan} UK time, ${madeMins} minutes long.`);
    pass(`${tag}: ${day}: an item made by dragging over ${what} is saved as the quick add said, with a real length`, Boolean(made) && madeMins > 0 && madeMins <= 120 && when.includes(shownSpan), `${when} / ${shownSpan} / ${madeMins}`);
  }
  await t.done({ refusals: 0 });
};

// ================================================================ 2. two tabs
PARTS['b-tabs'] = async (role) => {
  const tag = `two tabs, ${role}`;
  const t = await openAt({ role, tag });
  const a = t.page;
  const { store } = t;
  const b = await t.tab('/coach/calendar?view=week');
  const span = (p, day, name) => p.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: name }).first().getAttribute('aria-label').catch(() => null);

  // ---- the same item moved in both
  await tile(a, D.wed, 'Admin').focus();
  await a.keyboard.press('ArrowDown'); await settle(a, 1000);
  pass(`${tag}: an item moved in one tab moves in the other, with no reload`, /14:15 to 16:15/.test((await span(b, D.wed, 'Admin')) || ''), (await span(b, D.wed, 'Admin')) || '');
  await tile(b, D.wed, 'Admin').focus();
  await b.keyboard.press('ArrowDown'); await settle(b, 1000);
  let row = await t.one('coach_cal_items', CAL.admin);
  pass(`${tag}: then moved in the other, it builds on the first move (14:30), never back from an old copy`, same(row.starts_at, at(D.wed, '14:30')) && /14:30 to 16:30/.test((await span(a, D.wed, 'Admin')) || ''), `${row.starts_at} / ${await span(a, D.wed, 'Admin')}`);
  // In the same moment, in both.
  await tile(a, D.wed, 'Admin').focus(); await tile(b, D.wed, 'Admin').focus();
  await Promise.all([a.keyboard.press('ArrowDown'), b.keyboard.press('ArrowRight')]);
  await settle(a, 1500); await settle(b, 300);
  row = await t.one('coach_cal_items', CAL.admin);
  const w = wallClock(row.starts_at, LON);
  const seenFirst = [await a.locator('[data-cal-key]', { hasText: 'Admin' }).first().getAttribute('aria-label').catch(() => ''), await b.locator('[data-cal-key]', { hasText: 'Admin' }).first().getAttribute('aria-label').catch(() => '')];
  console.log(`  COUNT two tabs: straight after, the tabs show “${seenFirst[0]}” and “${seenFirst[1]}”; the database holds ${w.date} ${w.time} (the last write to arrive). Each tab follows the database the next time it is shown.`);
  for (const p of [a, b]) { await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(p, 1200); }
  const [inA, inB] = [await span(a, w.date, 'Admin'), await span(b, w.date, 'Admin')];
  console.log(`  COUNT two tabs: Admin moved 15 minutes later in one tab and a day on in the other in the same moment ends at ${w.date} ${w.time} in the database.`);
  pass(`${tag}: moved in both in the same moment: one move stands, and once each tab is shown again both agree with the database`, Boolean(inA) && inA === inB && new RegExp(`${w.time} to `).test(inA) && (await a.locator('[data-cal-key]', { hasText: 'Admin' }).count()) === 1 && (await b.locator('[data-cal-key]', { hasText: 'Admin' }).count()) === 1 && store.rows.coach_cal_items.filter((i) => i.title === 'Admin').length === 1, `${inA} / ${inB} / ${row.starts_at}`);

  // ---- edited in one and deleted in the other
  await tile(a, D.thu, 'Supervision with Maya').click(); await settle(a, 700);
  await dialog(a).getByLabel('Title').fill('Supervision, being edited');
  await tile(b, D.thu, 'Supervision with Maya').click(); await settle(b, 700);
  await dialog(b).getByRole('button', { name: 'Delete', exact: true }).click(); await settle(b, 1200);
  const stillOpen = await a.locator('.ds-modal--shown').count();
  console.log(`  COUNT two tabs: with an item's panel open in one tab and the item deleted in the other, the panel ${stillOpen ? 'stays open' : 'closes by itself'}.`);
  if (stillOpen) { await dialog(a).locator('.ds-btn--primary').click().catch(() => {}); await settle(a, 1000); }
  const sup = await t.one('coach_cal_items', CAL.supervision);
  const shownA = await a.locator('[data-cal-key]', { hasText: /Supervision/ }).count();
  const shownB = await b.locator('[data-cal-key]', { hasText: /Supervision/ }).count();
  pass(`${tag}: edited in one tab and deleted in the other: the two tabs and the database agree (it is gone, or it is back in both)`, shownA === shownB && shownA === (sup ? 1 : 0) && (await a.locator('.ds-modal--shown').count()) === 0, `in the database: ${Boolean(sup)}; tiles ${shownA} and ${shownB}`);
  pass(`${tag}: its guest row went, or came back, with it`, store.rows.coach_cal_guests.some((g) => g.id === CAL.guestMaya) === Boolean(sup));
  if (!sup) {
    await b.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click().catch(() => {}); await settle(b, 1200);
    pass(`${tag}: Undo in the tab that deleted it brings it back in both, with its guest`, Boolean(await t.one('coach_cal_items', CAL.supervision)) && (await a.locator('[data-cal-key]', { hasText: 'Supervision with Maya' }).count()) === 1 && store.rows.coach_cal_guests.some((g) => g.id === CAL.guestMaya));
  }

  // ---- working hours edited in one while the other books
  await t.go('/coach/calendar/book');
  await pick(dialog(a), a, 'Who is it with', 'Priya Nair');
  const offers = async () => dialog(a).locator('.ds-answer').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s*\n\s*/g, ' | ')));
  const before = await offers();
  await b.goto(`${APP}/coach/calendar?view=week&day=2026-11-23`); await b.waitForSelector('.cc-app'); await settle(b, 1200);
  await press(b, b, 'Working hours');
  // Every day's start put to 16:00: nothing before then is in the working day any more.
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    const finish = b.getByRole('slider', { name: `${d}, finish` });
    await finish.focus(); for (let i = 0; i < 12; i += 1) await b.keyboard.press('ArrowDown');
    const start = b.getByRole('slider', { name: `${d}, start` });
    await start.focus(); for (let i = 0; i < 28; i += 1) await b.keyboard.press('ArrowDown');
  }
  await press(b, b, 'Done'); await settle(b, 1000);
  const hours = store.rows.coach_settings.find((x) => x.coach_id === ME)?.working_hours;
  const after = await offers();
  const early = after.filter((o) => { const m = /(\d\d):(\d\d)/.exec(o); return m && Number(m[1]) < 16; });
  console.log(`  COUNT two tabs: Book a call offered ${before.slice(0, 3).join(' ; ')} … then, with every day starting at 16:00, ${after.slice(0, 3).join(' ; ') || 'nothing'}.`);
  pass(`${tag}: working hours moved to start at 16:00 in one tab: Book a call, already open in the other, stops offering earlier times (no reload)`, hours?.mon?.from === '16:00' && before.length > 0 && early.length === 0 && JSON.stringify(after) !== JSON.stringify(before), `${JSON.stringify(hours?.mon)}; still offered: ${early.slice(0, 3).join(' ; ')}`);
  if (after.length) {
    await dialog(a).locator('.ds-answer').first().click(); await settle(a, 300);
    await dialog(a).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(a, 1200);
    const made = store.rows.coach_cal_items.filter((i) => i.title === 'Priya Nair' && i.id !== CAL.priyaTue)[0];
    pass(`${tag}: and the call it books is inside the new hours`, Boolean(made) && wallClock(made.starts_at, LON).time >= '16:00', made?.starts_at);
  } else await closePanel(a);
  await b.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click().catch(() => {}); await settle(b, 900);

  // ---- a poll's winner chosen in both
  await t.go(`/coach/calendar/polls/${CAL.poll}`);
  await b.goto(`${APP}/coach/calendar/polls/${CAL.poll}`); await b.waitForSelector('.cc-poll-row', { timeout: 20000 }); await settle(b, 1000);
  const confirmA = a.getByRole('button', { name: /^Confirm / }).first();
  const confirmB = b.getByRole('button', { name: /^Confirm / }).nth(1);
  const [nameA, nameB] = [await confirmA.textContent(), await confirmB.textContent()];
  // One tab confirms; the other, still drawn as it was a moment before, has its own Confirm pressed 150 ms later.
  const staleButton = await confirmB.elementHandle();
  await confirmA.click();
  await b.waitForTimeout(150);
  await staleButton.evaluate((el) => el.click()).catch(() => {});
  await settle(a, 1800); await settle(b, 400);
  const poll = store.rows.coach_polls.find((p) => p.id === CAL.poll);
  const options = store.rows.coach_poll_options.filter((o) => o.poll_id === CAL.poll).map((o) => o.id);
  const left = store.rows.coach_cal_items.filter((i) => options.includes(i.poll_option_id) || i.id === poll.confirmed_item_id);
  const calls = left.filter((i) => i.kind !== 'hold');
  console.log(`  COUNT two tabs: “${nameA}” in one tab and “${nameB}” in the other, pressed 150 ms apart: the poll is ${poll.status}, with ${calls.length} call(s) made and ${left.length - calls.length} time(s) still held.`);
  pass(`${tag}: a poll's winner chosen in one tab and, a moment later, a different one in the other: the poll is confirmed once, with one call, at the time it names, and nothing left held`, poll.status === 'confirmed' && calls.length === 1 && calls[0].id === poll.confirmed_item_id && same(calls[0].starts_at, store.rows.coach_poll_options.find((o) => o.id === poll.confirmed_option_id)?.starts_at) && left.length === 1, `${poll.status}; calls ${calls.map((c) => c.starts_at).join(',')}; left ${left.length}; confirmed item ${calls.some((c) => c.id === poll.confirmed_item_id)}`);
  const [textA, textB] = [flat(await a.locator('.cc-poll-page').textContent().catch(() => '')), flat(await b.locator('.cc-poll-page').textContent().catch(() => ''))];
  pass(`${tag}: both tabs then say the same confirmed time, and neither offers Confirm any more`, (await a.getByRole('button', { name: /^Confirm / }).count()) === 0 && (await b.getByRole('button', { name: /^Confirm / }).count()) === 0 && (textA.match(/Confirmed[^.]*\./) || ['a'])[0] === (textB.match(/Confirmed[^.]*\./) || ['b'])[0], `${(textA.match(/Confirmed[^.]*\./) || [''])[0]} / ${(textB.match(/Confirmed[^.]*\./) || [''])[0]}`);

  // ---- Open for calls edited in both
  await t.go('/coach/calendar/open');
  await b.goto(`${APP}/coach/calendar/open`); await b.waitForSelector('.cc-app'); await settle(b, 1300);
  const drag = async (p, day, from, to) => { const x = await point(p, day, from); const z = await point(p, day, to); await p.mouse.move(x.x, x.y); await p.mouse.down(); await p.mouse.move(x.x, (x.y + z.y) / 2, { steps: 4 }); await p.mouse.move(z.x, z.y, { steps: 4 }); await p.mouse.up(); };
  const blocks = () => store.rows.coach_open_blocks.filter((x) => x.coach_id === ME);
  const n0 = blocks().length;
  await drag(a, '2026-11-24', 19 * 60, 20 * 60); await settle(a, 1200);
  pass(`${tag}: an open time made in one tab shows in the other, with no reload`, blocks().length === n0 + 1 && (await b.locator('[data-cal-day="2026-11-24"] .cc-cal-tile--open').count()) === 1);
  await drag(b, '2026-11-24', 20 * 60, 20 * 60 + 45); await settle(b, 1200);
  const joined = blocks().find((x) => same(x.starts_at, at('2026-11-24', '19:00')));
  pass(`${tag}: one made in the other that touches it joins it, never a second block beside it`, blocks().length === n0 + 1 && same(joined?.ends_at, at('2026-11-24', '20:45')), `${blocks().length - n0} more; ends ${joined?.ends_at}`);
  // The same block made in both in the same moment.
  await Promise.all([drag(a, '2026-11-27', 18 * 60, 19 * 60), drag(b, '2026-11-27', 18 * 60 + 30, 19 * 60 + 30)]);
  await settle(a, 1800); await settle(b, 400);
  const wed = blocks().filter((x) => wallClock(x.starts_at, LON).date === '2026-11-27' && wallClock(x.starts_at, LON).time >= '17:00').sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
  const overlap = wed.some((x, i) => wed.slice(i + 1).some((y) => new Date(y.starts_at) < new Date(x.ends_at)));
  console.log(`  COUNT two tabs: overlapping open times dragged in both tabs in the same moment leave ${wed.length} block(s) on Fri 27 Nov: ${wed.map((x) => `${wallClock(x.starts_at, LON).time} to ${wallClock(x.ends_at, LON).time}`).join(', ')}${overlap ? ' (they overlap)' : ''}.`);
  pass(`${tag}: open times dragged over each other in both tabs at once never offer a start twice (the database's free times hold each start once)`, (() => { const free = store.fn.booking_free_times(null, CAL.chemKey, at('2026-11-27', '00:00'), at('2026-11-28', '00:00')).map((x) => x.starts_at); return new Set(free).size === free.length; })());
  pass(`${tag}: and both tabs draw the same open times that day`, (await a.locator('[data-cal-day="2026-11-25"] .cc-cal-tile--open').count()) === (await b.locator('[data-cal-day="2026-11-25"] .cc-cal-tile--open').count()));
  await t.done({ refusals: 0 });
};

// ================================================================ 3. offline and back
PARTS['b-offline'] = async (role) => {
  const tag = `offline, ${role}`;
  const t = await openAt({ role, tag });
  const { page, store, ctx } = t;
  const snapshot = () => JSON.stringify([store.rows.coach_cal_items, store.rows.coach_sessions, store.rows.coach_todos, store.rows.coach_cal_guests]);
  const before = snapshot();
  const callsAt = store.calls.length;
  await ctx.setOffline(true); store.down = true;
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const said = [];
  // made
  await press(page, page, 'Add to calendar');
  await dialog(page).getByLabel('Title').fill('Made offline Thu 15:00'); await settle(page, 300);
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1200);
  said.push(await toast(page));
  // moved
  await tile(page, D.wed, 'Admin').focus(); await page.keyboard.press('ArrowDown'); await settle(page, 1200);
  said.push(await toast(page));
  // deleted
  await tile(page, D.thu, 'Supervision with Maya').click(); await settle(page, 700);
  await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page, 1200);
  said.push(await toast(page));
  // a to-do placed
  await press(page, page, 'Show to-dos');
  const card = page.locator('.cc-cal-todos .cc-cal-todo').first();
  const todoId = await card.getAttribute('data-todo');
  const cb = await card.boundingBox();
  await dragTo(page, { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }, await point(page, D.fri, 16 * 60 + 2, 0.5)); await settle(page, 600);
  said.push(await toast(page));
  // a call booked
  await t.page.evaluate(() => window.history.pushState({}, '', '/coach/calendar/book')); await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await settle(page, 900);
  let bookedSaid = '';
  if (await page.locator('.ds-modal--shown').count()) {
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 1500);
    bookedSaid = await toast(page);
  }
  said.push(bookedSaid);
  console.log(`  COUNT offline: made, moved, deleted, a to-do placed and a call booked with no connection say: ${said.map((x) => `“${x}”`).join(', ')}.`);
  pass(`${tag}: each change made with no connection says "Will sync" (a delete says "Deleted", with its Undo), calmly, and nothing says it didn't save`, said.every((x, n) => x === (n === 2 ? 'Deleted' : 'Will sync')) && !said.some((x) => /didn’t|fail|error/i.test(x)), said.join(' | '));
  const text = await words(page);
  pass(`${tag}: the page shows them all meanwhile`, (await page.locator('[data-cal-key]', { hasText: 'Made offline' }).count()) === 1 && /14:15/.test((await tile(page, D.wed, 'Admin').getAttribute('aria-label')) || '') && (await page.locator('[data-cal-key]', { hasText: 'Supervision with Maya' }).count()) === 0 && (await page.locator(`[data-cal-key="todo:${todoId}"]`).count()) === 1 && !/hit a problem/i.test(text));
  pass(`${tag}: and the database holds none of it yet`, snapshot() === before);
  // A reload with no connection still shows what waits (the app itself comes from this computer's server here, as the service worker gives it to a real phone).
  await ctx.setOffline(false);
  await page.reload(); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1500);
  pass(`${tag}: reloaded while the database still can't be reached, what waits is still on the calendar`, snapshot() === before && (await page.locator('[data-cal-key]', { hasText: 'Made offline' }).count()) === 1 && (await page.locator('[data-cal-key]', { hasText: 'Supervision with Maya' }).count()) === 0);
  // Back online.
  store.down = false;
  const writes = [];
  page.on('request', (req) => { if (!/\/rest\/v1\/coach_/.test(req.url()) || req.method() === 'GET') return; let ids = ''; try { const body = req.postDataJSON(); ids = (Array.isArray(body) ? body : [body]).map((r) => r?.id || '').join(','); } catch { /* a delete */ } writes.push(`${req.method()} ${req.url().split('/rest/v1/')[1].split('?')[0]} ${ids || req.url().split('id=eq.')[1] || ''}`); });
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  for (let i = 0; i < 40 && !(store.rows.coach_cal_items.some((x) => x.title === 'Made offline') && !store.rows.coach_cal_items.some((x) => x.id === CAL.supervision)); i += 1) await settle(page, 500);
  await settle(page, 2500);
  const sent = store.calls.slice(callsAt).filter((c) => /^(POST|PATCH|DELETE) coach_(cal_items|sessions|todos|cal_guests)/.test(c));
  const made = store.rows.coach_cal_items.filter((x) => x.title === 'Made offline');
  const priya = store.rows.coach_cal_items.filter((x) => x.title === 'Priya Nair' && x.id !== CAL.priyaTue);
  pass(`${tag}: back online, each waiting change reaches the database`, made.length === 1 && same(made[0].starts_at, at(D.thu, '15:00')) && same((await t.one('coach_cal_items', CAL.admin)).starts_at, at(D.wed, '14:15')) && !(await t.one('coach_cal_items', CAL.supervision)) && String((await t.one('coach_todos', todoId)).planned_time).startsWith('16:00'), `${made.length} made; ${sent.length} writes`);
  if (bookedSaid) pass(`${tag}: the booked call arrives once, with its session (the session first: the database refused nothing)`, priya.length === 1 && Boolean(priya[0].session_id) && store.rows.coach_sessions.filter((x) => x.id === priya[0].session_id).length === 1, `${priya.length} calls`);
  const posts = {};
  for (const c of sent) posts[c] = (posts[c] || 0) + 1;
  const twiceSent = writes.filter((w, n) => writes.indexOf(w) !== n);
  console.log(`  COUNT offline: back online the page sent ${JSON.stringify(posts)}; ${twiceSent.length} of them were a second send of the same row${twiceSent.length ? ` (${[...new Set(twiceSent.map((w) => w.split(' ').slice(0, 2).join(' ')))].join(', ')})` : ''}.`);
  if (process.env.PEEK) console.log(writes.map((w) => `    ${w}`).join('\n'));
  // The queue sends each waiting change once, in the order made (a session before the call that points at it); the store's own
  // load then sends each still-unmarked row once more, as the same row (run 1's store: an upsert, so nothing is doubled).
  const firstSends = writes.filter((x, n) => writes.indexOf(x) === n);
  pass(`${tag}: the first send of each change is in the order it was made, a session before its call, and a delete goes once`, firstSends.findIndex((x) => x.startsWith('POST coach_sessions')) < firstSends.findIndex((x) => priya[0] && x.includes(priya[0].id)) && (posts['DELETE coach_cal_items'] || 0) === 1 && firstSends.findIndex((x) => made[0] && x.includes(made[0].id)) === 0, firstSends.slice(0, 8).map((x) => x.split(' ').slice(0, 2).join(' ')).join(', '));
  pass(`${tag}: no row is sent more than twice, and a second send is the same row again (nothing is doubled in the database)`, writes.every((x) => writes.filter((y) => y === x).length <= 2) && store.rows.coach_sessions.filter((x) => x.id === priya[0]?.session_id).length <= 1 && store.rows.coach_todos.filter((x) => x.id === todoId).length === 1, JSON.stringify(posts));
  pass(`${tag}: and nothing waits on the device any more`, !(await page.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)) || Object.keys(localStorage).some((k) => k.startsWith('clarity-queue:') && (JSON.parse(localStorage.getItem(k) || '[]') || []).length > 0), t.me)));
  // ---- the Google sync, with no connection and back (its own page, with the stand-in Google switched on)
  {
    const s = await openAt({ role, tag: `${tag}, the Google sync`, standIns: true });
    const inGoogle = () => s.page.evaluate(() => window.__clarityCalSync.google().events().map((e) => e.summary));
    await s.round();
    const had = (await inGoogle()).length;
    await s.ctx.setOffline(true); s.store.down = true;
    await s.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await press(s.page, s.page, 'Add to calendar');
    await dialog(s.page).getByLabel('Title').fill('Made offline Thu 15:00'); await settle(s.page, 300);
    await dialog(s.page).locator('.ds-btn--primary').click(); await settle(s.page, 1200);
    await s.page.evaluate(() => Promise.race([window.__clarityCalSync.round(), new Promise((r) => setTimeout(r, 3000))])).catch(() => {}); await settle(s.page, 800);
    const quiet = flat(await words(s.page));
    pass(`${tag}: a round of the Google sync with no connection sends nothing and raises no alarm`, (await inGoogle()).length === had && !/hit a problem|didn’t sync|Google Calendar (isn’t|can’t)/i.test(quiet));
    await s.ctx.setOffline(false); s.store.down = false;
    await s.page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    for (let i = 0; i < 30 && !s.store.rows.coach_cal_items.some((x) => x.title === 'Made offline'); i += 1) await settle(s.page, 500);
    await s.round(); await s.round();
    const events = await inGoogle();
    pass(`${tag}: back online it picks up where it stopped: the item made offline is in "Google" once`, events.filter((x) => x === 'Made offline').length === 1 && s.store.rows.coach_cal_items.filter((x) => x.title === 'Made offline' && x.google_event_id).length === 1, `${events.filter((x) => x === 'Made offline').length}`);
    await s.done({ refusals: 0, allow: /Failed to fetch|NetworkError|Load failed|ERR_INTERNET/i });
  }

  // ---- a public booking page with no connection
  const g = await guestPage(store);
  const bookingsBefore = store.rows.coach_bookings.length;
  await g.open(`/book/${CAL.chemKey}`);
  await readyToBook(g, { name: 'Offline Guest', email: 'offline@example.invalid' });
  await g.ctx.setOffline(true);
  await bookButton(g).click(); await settle(g.page, 1200);
  const line = (await g.page.locator('.cc-problem[role=alert]').first().textContent().catch(() => '')) || '';
  pass(`${tag}: a booking page with no connection says it needs one, and books nothing`, line === 'This needs a connection, so try again when you’re back online.' && store.rows.coach_bookings.length === bookingsBefore && !/You’re booked/.test(await g.words()), line);
  await twice(bookButton(g)); await settle(g.page, 800);
  await g.ctx.setOffline(false);
  await settle(g.page, 1500);
  pass(`${tag}: and it never books by itself when the connection comes back: the guest presses again`, store.rows.coach_bookings.length === bookingsBefore);
  await bookButton(g).click(); await settle(g.page, 1200);
  pass(`${tag}: pressed again, online, it books once`, store.rows.coach_bookings.filter((x) => x.name === 'Offline Guest').length === 1 && /You’re booked/.test(await g.words()));
  await g.ctx.close();
  await t.done({ refusals: 0, api: ['/api/booking-email'], allow: /Failed to fetch|NetworkError|Load failed|ERR_INTERNET/i });
};

// ================================================================ 7. Google Calendar
PARTS['b-google'] = async (role) => {
  const tag = `google, ${role}`;
  const t = await openAt({ role, tag, standIns: true });
  const { page } = t;
  const google = (fn, ...args) => page.evaluate(([f, a]) => { const g = window.__clarityCalSync.google(); return f === 'events' ? g.events() : f === 'sent' ? g.sent() : g.inGoogle[f](...a); }, [fn, args]);
  const eventOf = async (itemId) => (await google('events')).find((e) => e.extendedProperties?.private?.clarityId === itemId) || null;
  const LONG = { dateTime: '2026-11-19T10:00:00', timeZone: LON };
  await t.round();

  // ---- a Google change arriving while a call is being edited
  const ruth = await eventOf(CAL.ruth);
  await tile(page, D.wed, 'Ruth Adeyemi').click(); await settle(page, 800);
  const isPanel = (await dialog(page).getByLabel('Starts').count()) === 1;
  pass(`${tag}: a Chemistry Call opens its own panel`, isPanel && Boolean(ruth));
  await dialog(page).getByLabel('Starts').fill('13:10'); await dialog(page).getByLabel('Title').fill('Ruth Adeyemi, typed'); await settle(page, 300);
  await google('move', ruth.id, { dateTime: '2026-11-19T10:00:00', timeZone: LON }, { dateTime: '2026-11-19T10:30:00', timeZone: LON });
  await t.round();
  pass(`${tag}: a call moved in Google while its panel is open: the typing is kept and the panel says so`, (await dialog(page).getByLabel('Starts').inputValue()) === '13:10' && (await dialog(page).getByLabel('Title').inputValue()) === 'Ruth Adeyemi, typed' && (await dialog(page).textContent()).includes('This changed in Google Calendar. Save to keep your version, or close to take the new one.'));
  pass(`${tag}: and nothing has moved under it, here or for the guest's booking`, same((await t.one('coach_cal_items', CAL.ruth)).starts_at, at(D.wed, '13:00')) && same((await t.rowsNow('coach_bookings')).find((x) => x.id === CAL.bookRuth).starts_at, at(D.wed, '13:00')));
  await t.setClock(new Date(TUE.getTime() + 2 * 60000));
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
  await t.round();
  let item = await t.one('coach_cal_items', CAL.ruth);
  let event = await eventOf(CAL.ruth);
  pass(`${tag}: saved after Google's change, the coach's version stands on both sides (the newest choice wins)`, same(item.starts_at, at(D.wed, '13:10')) && item.title === 'Ruth Adeyemi, typed' && event?.start?.dateTime === '2026-11-18T13:10:00' && event?.summary === 'Ruth Adeyemi, typed', `${item.starts_at} ${item.title} / ${event?.start?.dateTime} ${event?.summary}`);
  if (t.there) pass(`${tag}: and the guest's booking follows the item`, same(t.store.rows.coach_bookings.find((x) => x.id === CAL.bookRuth).starts_at, at(D.wed, '13:10')));

  // ---- the same event changed on both sides between two rounds
  const writing = await eventOf(CAL.writing);
  await google('edit', writing.id, { summary: 'Writing, Google’s title' });
  await t.tick(new Date(TUE.getTime() + 4 * 60000));
  await tile(page, D.wed, 'Writing').focus(); await page.keyboard.press('ArrowDown'); await settle(page, 800); // the portal's change is the later one
  await t.round();
  item = await t.one('coach_cal_items', CAL.writing); event = await eventOf(CAL.writing);
  pass(`${tag}: changed in Google, then here, between two rounds: the later change (here) wins whole, and the two sides end the same`, same(item.starts_at, at(D.wed, '09:15')) && item.title === 'Writing' && event?.summary === 'Writing' && event?.start?.dateTime === '2026-11-18T09:15:00', `${item.title} ${item.starts_at} / ${event?.summary} ${event?.start?.dateTime}`);
  await tile(page, D.wed, 'Writing').focus(); await page.keyboard.press('ArrowDown'); await settle(page, 800);
  await t.tick(new Date(TUE.getTime() + 6 * 60000));
  await google('move', writing.id, { dateTime: '2026-11-18T11:00:00', timeZone: LON }, { dateTime: '2026-11-18T14:00:00', timeZone: LON }); // Google's is the later one
  await t.round();
  item = await t.one('coach_cal_items', CAL.writing); event = await eventOf(CAL.writing);
  pass(`${tag}: changed here, then in Google: the later change (Google's) wins, and the two sides end the same`, same(item.starts_at, at(D.wed, '11:00')) && event?.start?.dateTime === '2026-11-18T11:00:00', `${item.starts_at} / ${event?.start?.dateTime}`);
  await t.round();
  pass(`${tag}: and a further round changes nothing`, same((await t.one('coach_cal_items', CAL.writing)).starts_at, at(D.wed, '11:00')) && (await google('events')).filter((e) => /^Writing/.test(e.summary)).length === 1);

  // ---- an event deleted in Google while its panel is open
  const coffee = await eventOf(CAL.coffeeDan);
  await tile(page, D.wed, 'Coffee with Dan Reid').click(); await settle(page, 800);
  await dialog(page).getByLabel('Title').fill('Coffee, still typing');
  await google('remove', coffee.id);
  await t.round();
  const open = await page.locator('.ds-modal--shown').count();
  const held = open ? await dialog(page).textContent() : '';
  console.log(`  COUNT google: an event deleted in Google while its panel is open: the panel ${open ? `stays open${/This was deleted in Google Calendar\. Save to keep it, or close to let it go\./.test(held) ? ' and says “This was deleted in Google Calendar. Save to keep it, or close to let it go.”' : ' and says nothing'}` : 'closes'}, and the item is ${(await t.one('coach_cal_items', CAL.coffeeDan)) ? 'still here' : 'gone'}.`);
  pass(`${tag}: deleted in Google while its panel is open: nothing is thrown away under the coach, and the panel says so`, open === 1 && (await dialog(page).getByLabel('Title').inputValue()) === 'Coffee, still typing' && Boolean(await t.one('coach_cal_items', CAL.coffeeDan)) && /This was deleted in Google Calendar\. Save to keep it, or close to let it go\./.test(held), held.slice(0, 120));
  if (open) { await closePanel(page); await settle(page, 1200); await t.round(); }
  pass(`${tag}: closed without saving, the delete comes in on the next round`, !(await t.one('coach_cal_items', CAL.coffeeDan)) && (await tiles(page, D.wed, 'Coffee').count()) === 0);
  // …and one deleted in Google while open, then saved here: the coach's version stays and is made in Google again, once.
  const dinner = await eventOf(CAL.dinner);
  await tile(page, D.thu, 'Leaders’ dinner').click(); await settle(page, 800);
  await dialog(page).getByLabel('Title').fill('Leaders’ dinner, kept');
  await google('remove', dinner.id);
  await t.round();
  await t.setClock(new Date(TUE.getTime() + 8 * 60000));
  if (await page.locator('.ds-modal--shown').count()) { await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000); }
  await t.round(); await t.round();
  const kept = await t.one('coach_cal_items', CAL.dinner);
  const again = (await google('events')).filter((e) => /Leaders’ dinner/.test(e.summary || ''));
  console.log(`  COUNT google: deleted in Google while open, then saved here: the item is ${kept ? `kept as “${kept.title}”` : 'gone'}, and Google holds ${again.length} event(s) for it.`);
  pass(`${tag}: deleted in Google while open, then saved: the two sides end the same (kept here and once in Google, or gone from both)`, kept ? again.length === 1 && again[0].summary === kept.title : again.length === 0, `${kept?.title} / ${again.map((e) => e.summary).join(', ')}`);

  // ---- awkward events made in Google
  await google('add', { start: { dateTime: '2026-11-20T08:00:00', timeZone: LON }, end: { dateTime: '2026-11-20T08:30:00', timeZone: LON } }); // no title
  await google('add', { summary: '   ', start: { dateTime: '2026-11-20T10:00:00', timeZone: LON }, end: { dateTime: '2026-11-20T10:30:00', timeZone: LON } }); // a title of spaces
  await google('add', { summary: `Long ${'title '.repeat(830)}`, start: LONG, end: { dateTime: '2026-11-19T10:45:00', timeZone: LON } }); // about 5,000 characters
  await google('add', { summary: 'All day in Google', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } });
  await google('add', { summary: 'Three days in Google', start: { date: '2026-11-18' }, end: { date: '2026-11-21' } });
  await google('add', { summary: 'Zone nobody knows', start: { dateTime: '2026-11-20T16:00:00', timeZone: 'Mars/Olympus_Mons' }, end: { dateTime: '2026-11-20T16:30:00', timeZone: 'Mars/Olympus_Mons' } });
  await google('add', { summary: 'Offset only', start: { dateTime: '2026-11-20T17:00:00+05:30' }, end: { dateTime: '2026-11-20T17:30:00+05:30' } });
  await google('add', { summary: 'Ends before it starts', start: { dateTime: '2026-11-20T19:00:00', timeZone: LON }, end: { dateTime: '2026-11-20T18:00:00', timeZone: LON } });
  await google('add', { summary: 'No end at all', start: { dateTime: '2026-11-20T20:00:00', timeZone: LON } });
  await google('add', { summary: 'Six weeks long', start: { dateTime: '2026-11-20T09:00:00', timeZone: LON }, end: { dateTime: '2027-01-05T09:00:00', timeZone: LON } });
  await google('add', { summary: '<b>Markup</b> & “quotes” 🎉', calendarId: 'family', start: { dateTime: '2026-11-20T12:00:00', timeZone: LON }, end: { dateTime: '2026-11-20T12:30:00', timeZone: LON } });
  await t.round(); await t.round();
  const items = await t.rowsNow('coach_cal_items');
  const from = (re) => items.find((i) => re.test(i.title));
  const bad = items.filter((i) => i.google_event_id && (!(new Date(i.ends_at) > new Date(i.starts_at)) || !String(i.title || '').trim() || [...i.title].length > 200 || !/^[A-Za-z_]+\/[A-Za-z_/+-]+$|^UTC$/.test(i.time_zone)));
  pass(`${tag}: awkward events read from Google are each a row the database keeps: a title of 1 to 200, a real zone, an end after its start`, bad.length === 0, bad.slice(0, 3).map((i) => `${JSON.stringify(String(i.title).slice(0, 20))} ${i.time_zone} ${i.starts_at} ${i.ends_at}`).join(' ; '));
  const refusedNow = t.there ? t.store.calls.filter((c) => c.startsWith('refused')) : [];
  pass(`${tag}: and the database refused none of them`, refusedNow.length === 0, [...new Set(refusedNow)].join('; '));
  const long = from(/^Long title/);
  const allDay = from(/^All day in Google/);
  const three = from(/^Three days in Google/);
  const mars = from(/^Zone nobody knows/);
  const offset = from(/^Offset only/);
  console.log(`  COUNT google: no title comes in as ${JSON.stringify(items.filter((i) => i.google_event_id && same(i.starts_at, at(D.fri, '08:00'))).map((i) => i.title))}; the 5,000-character title as ${long ? [...long.title].length : 'nothing'} characters; a zone nobody knows as ${mars ? `${mars.time_zone} at ${wallClock(mars.starts_at, LON).time} UK time` : 'nothing'}; an offset with no zone as ${offset ? `${offset.time_zone} at ${wallClock(offset.starts_at, LON).time} UK time` : 'nothing'}; “Ends before it starts” as ${from(/^Ends before/) ? 'an item' : 'nothing'}; “No end at all” as ${from(/^No end/) ? 'an item' : 'nothing'}; “Six weeks long” as ${from(/^Six weeks/) ? 'an item' : 'nothing'}.`);
  pass(`${tag}: an event with no end, one that ends before it starts and one six weeks long are left in Google and skipped here (the database keeps none of those), and the round carries on`, !from(/^Ends before/) && !from(/^No end/) && !from(/^Six weeks/) && Boolean(from(/^All day in Google/)));
  pass(`${tag}: an event with no title, or a title of spaces, comes in with a name a person can read`, items.filter((i) => i.google_event_id && (same(i.starts_at, at(D.fri, '08:00')) || same(i.starts_at, at(D.fri, '10:00')))).length === 2 && items.filter((i) => i.google_event_id && (same(i.starts_at, at(D.fri, '08:00')) || same(i.starts_at, at(D.fri, '10:00')))).every((i) => /\w/.test(i.title)));
  pass(`${tag}: a 5,000-character title is kept to 200`, Boolean(long) && [...long.title].length <= 200);
  pass(`${tag}: an all-day event is all day on its own day, and a three-day one on its three`, allDay?.all_day === true && allDay.starts_on === '2026-11-20' && allDay.ends_on === '2026-11-20' && three?.all_day === true && three.starts_on === '2026-11-18' && three.ends_on === '2026-11-20', JSON.stringify([allDay?.starts_on, allDay?.ends_on, three?.starts_on, three?.ends_on]));
  pass(`${tag}: an offset with no zone is at the right moment (11:30 UK time), anchored to a place`, Boolean(offset) && same(offset.starts_at, '2026-11-20T11:30:00Z'));
  await t.go('/coach/calendar?view=week');
  const text = await words(page);
  pass(`${tag}: the week draws them all, the page stands, and markup is only ever text`, !/hit a problem/i.test(text) && (await page.locator('.cc-cal-banner', { hasText: 'All day in Google' }).count()) === 1 && (await page.locator('.cc-cal-banner', { hasText: 'Three days in Google' }).count()) === 1 && (await page.locator('.cc-cal b', { hasText: 'Markup' }).count()) === 0 && (await page.locator('[data-cal-key]', { hasText: '<b>Markup</b>' }).count()) === 1);
  await t.go('/coach/calendar?view=month'); await t.go('/coach/calendar?view=schedule');
  pass(`${tag}: the month and the Schedule open with them too`, !/hit a problem/i.test(await words(page)));
  // Their second round sends nothing back that would change them in Google.
  const sentBefore = (await google('sent')).length;
  const eventsBefore = JSON.stringify((await google('events')).map((e) => [e.id, e.summary, e.start, e.end]));
  await t.round();
  pass(`${tag}: a further round leaves Google exactly as it was (nothing is "corrected" there)`, JSON.stringify((await google('events')).map((e) => [e.id, e.summary, e.start, e.end])) === eventsBefore && (await google('sent')).length === sentBefore);

  // ---- the sync run twice at once
  await t.go('/coach/calendar?view=week');
  await press(page, page, 'Add to calendar');
  await dialog(page).getByLabel('Title').fill('Twice at once Thu 16:00'); await settle(page, 300);
  await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900);
  await page.evaluate(() => Promise.all([window.__clarityCalSync.round(), window.__clarityCalSync.round(), window.__clarityCalSync.round()])); await settle(page, 1500);
  const b = await t.tab('/coach/calendar?view=week');
  await Promise.all([page.evaluate(() => window.__clarityCalSync.round()), b.evaluate(() => window.__clarityCalSync.round())]); await settle(page, 1500);
  const twiceEvents = (await google('events')).filter((e) => e.summary === 'Twice at once');
  pass(`${tag}: three rounds at once, then a round in each of two tabs at once, make the new item in Google once`, twiceEvents.length === 1 && (await t.count('coach_cal_items', (i) => i.title === 'Twice at once')) === 1, `${twiceEvents.length} events`);
  pass(`${tag}: and no item is in Google twice`, (() => true)() && (await google('events')).map((e) => e.extendedProperties?.private?.clarityId).filter(Boolean).every((id, n, all) => all.indexOf(id) === n));
  await t.done({ refusals: 0 });
};
// @@PARTS@@

try {
  for (const name of CAL_BREAK_PARTS) {
    if (!has(name) || !PARTS[name]) continue;
    for (const role of (name === 'b-reach' ? ['owner'] : roles)) await PARTS[name](role);
  }
} catch (e) {
  pass('the walk ran to its end', false, String(e).split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
  seedClock(null);
}
report.done();
