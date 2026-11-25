// A week as Tim, walked (Phase 6a run 3, step 7: the functionality tester).
// The calendar and booking used the way a coaching week uses them, with the
// time zone rules of time-zone-safeguards.md read off the screen:
//
//   week-ny      a New York client's weekly Monday 07:30 series across the UK's
//                clock change (25 Oct 2026) and the US's (1 Nov): 12:30, 11:30,
//                12:30 for Tim, 7:30 am for her every time; the clock-change line
//                on Today in each week; both time columns on the change days
//   week-sydney  a Sydney client: Monday 08:00 there is Sunday evening here, and
//                both days show in Book a call, on the tile, in the brief and in
//                the call's own panel; quarter-hour starts; the reminders' times
//   week-three   a three-way call: anchored to the booker's zone, guests pasted,
//                its session made with it, a Zoom link (the stand-in) and Join on
//                Zoom in the brief, the call's panel, the session and the bar
//   week-poll    a poll: times picked, held as dashed tiles, two people answer on
//                their own pages in their own zones, the winner becomes the call
//                and the rest are released
//   week-open    Open for calls (two touching blocks join, never over something
//                busy, Copy last week), then a signed-out guest in another zone
//                books a Chemistry Call end to end, moves it, and Tim sees the
//                item, the booking and the lead; 5 calls a day and a 15-minute gap
//   week-link    a single-use link used once then refused; Offer times by email
//                drafted in the reader's zone, nothing sent
//   week-cal     a repeat edited "all of them" and deleted "this one"; working
//                hours edited on the calendar, with Book a call's suggestions and
//                Today's over-full line following them
//   week-google  Personal and Family items (the portal's own and ones read from
//                "Google") are only ever busy to a booking page, never named
//   week-bar     the next-call bar from the day's own session at 11, 8 and 4
//                minutes before, as it starts, 9 and 11 minutes in
//   week-phone   the core of it on a phone: the series booked, the week's list,
//                Today's line and the bar
//
// (cal-flows.mjs walks drag-create, move, resize, typed times, "this one" and
// "this and following", Duplicate, Delete, to-dos on and off the calendar, My
// calendars and Weekends; sync-flows.mjs Google both ways; book-flows.mjs the
// client's own /coaching. This walk doesn't repeat them.)
//
// Both database modes, as the other walks:
//   device only  051 isn't there (as today): everything stays on the device;
//                a write that leaves the page is stopped, listed and fails.
//   there        049 to 051 answered by the stand-in (cal: true).
// The page's clock is pinned in the past (never ahead of the real day) and
// nothing is ever sent: every /api/ call is answered by a stand-in.
//
//   PARTS=week-ny,week-sydney,week-three,week-poll,week-open,week-link,week-cal,week-google,week-bar,week-phone
//   ROLES=owner,associate   DB=none,there
//   SHOTS=<folder> keeps a picture of the Sydney client's brief.
//   PEEK=1 lists the calls just before a write that was stopped on its way out, when there is one.
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, settle, standIn } from './shared.mjs';
import { CAL, ID, seedClock, seedWithCal } from './seed.mjs';
import { guestStandIn } from './book-standin.mjs';
import { dayKeyWords, instantAt, onQuarterHour, seriesCalls, seriesRule, wallClock } from '../../src/lib/time/index.js';
import { reminderTimes } from '../../src/lib/coach/calendar.js';

export const WEEK_PARTS = ['week-ny', 'week-sydney', 'week-three', 'week-poll', 'week-open', 'week-link', 'week-cal', 'week-google', 'week-bar', 'week-phone'];
const LON = 'Europe/London';
const NY = 'America/New_York';
const SYD = 'Australia/Sydney';
/** M11's Tuesday, and the Tuesday before the UK's clocks go back. */
const TUE = new Date(2026, 10, 17, 12, 22);
const OCT = new Date(2026, 9, 13, 12, 22);
const ISLA = '00000000-0000-4000-8000-000000009a01';
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
const uk = (t) => wallClock(t, LON);

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 500); };
const press = async (scope, page, name) => { await scope.getByRole('button', { name, exact: true }).first().click(); await settle(page, 500); };
const pick = async (scope, page, label, option) => {
  await scope.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
// Polish 1 (25 Nov; the example's booking page): the days are a month grid (each free day a button named
// "Monday 23 November"), the time zone sits behind "Change the time zone", and a chosen time goes on with Continue.
const freeDays = async (page) => (await page.locator('.cc-book-col .ds-cal-day:not([disabled])').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))))
  .map((l) => `${l.slice(0, 3)} ${l.split(' ')[1]}`);
const dayButton = (page, short) => page.locator('.cc-book-col .ds-cal-day:not([disabled])').filter({ has: page.locator('span', { hasText: new RegExp(`^${short.split(' ')[1]}$`) }) }).first();
const zoneTo = async (page, city) => {
  const link = page.getByRole('button', { name: 'Change the time zone', exact: true });
  if (await link.count()) { await link.click(); await settle(page, 300); }
  await pick(page, page, 'Your time zone', city);
};
const carryOn = async (page) => { await page.locator('.cc-book-go').first().click(); await settle(page, 500); };
const backToTimes = async (page) => { const b = page.getByRole('button', { name: 'Change the time', exact: true }); if (await b.count()) { await b.click(); await settle(page, 400); } };
const tile = (page, day, text) => page.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: text }).first();
/** Where a minute of a day is on the grid (the UK column's own hours). */
const point = (page, day, minutes) => page.evaluate(([d, m]) => {
  const r = document.querySelector(`[data-cal-day="${d}"]`).getBoundingClientRect();
  const hours = document.querySelectorAll('.cc-cal-times')[1].querySelectorAll('.cc-cal-hour');
  const from = Number(hours[0].textContent.slice(0, 2)) * 60;
  return { x: r.left + r.width * 0.5, y: r.top + ((m - from) / (hours.length * 60)) * r.height };
}, [day, minutes]);
const clickAt = async (page, day, minutes) => { const p = await point(page, day, minutes); await page.mouse.click(p.x, p.y); await settle(page, 500); };
const dragOn = async (page, day, fromMin, toMin) => {
  const a = await point(page, day, fromMin); const z = await point(page, day, toMin);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x, (a.y + z.y) / 2, { steps: 4 }); await page.mouse.move(z.x, z.y, { steps: 4 }); await page.mouse.up(); await settle(page, 900);
};
/** The two time columns' labels, row by row: [other zone, UK]. */
const columns = (page) => page.evaluate(() => {
  const cols = [...document.querySelectorAll('.cc-cal-times')].map((c) => [...c.querySelectorAll('.cc-cal-hour')].map((h) => h.textContent.trim()));
  return (cols[1] || []).map((label, i) => [cols[0]?.[i] || '', label]);
});

async function run() {
  const report = makeReport('A week as Tim');
  const { pass } = report;
  const parts = (process.env.PARTS || WEEK_PARTS.join(',')).split(',');
  const has = (p) => parts.includes(p);
  const roles = (process.env.ROLES || 'owner').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  /** A coach's page: signed in, standing in, the clock pinned at `when` and the seed's week counted from it. */
  async function openAt({ role, db, tag, when = TUE, size = 1440, path = '/coach/calendar?view=week', change = null, standIns = false }) {
    const theme = role === 'owner' ? 'light' : 'dark';
    const there = db === 'there';
    const ctx = await coachContext(browser, { size, theme });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    if (size === 1440) await page.setViewportSize({ width: 1440, height: 1500 });
    const errors = [];
    const reached = [];
    const waits = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    page.on('response', (res) => {
      const req = res.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
      waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
    });
    // The page's clock and the stand-in database's are one, and a walk can move both on.
    let clock = new Date(when);
    await page.clock.setFixedTime(clock);
    seedClock(when);
    const rows = seedWithCal({ accounts: true });
    if (change) change(rows);
    const store = await standIn(page, there ? { role, db: 'there', day: true, cal: true, strict: true, rows, now: () => new Date(clock) } : { role, db: 'none' });
    if (!there) await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
    const read = (body) => (route) => (route.request().method() === 'GET' ? json(route, body) : route.fallback());
    for (const t of ['peak_moments', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, read([]));
    await page.route('**/rest/v1/session_prep*', read(null));
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    const me = await accountId(page);
    await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
    await clearDevice(page, me);
    if (!there) await seedDevice(page, me, rows);
    if (standIns) await page.evaluate((id) => localStorage.setItem(`clarity-cache:${id}:coach-standin-on`, JSON.stringify({ google: true, zoom: true })), me);
    const go = async (to) => { await page.goto(`${APP}${to}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
    await go(path);
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    return {
      page, ctx, store, me, there, tag, go, rowsNow, rows,
      one: async (table, id) => (await rowsNow(table)).find((r) => r.id === id) || null,
      count: async (table, test = () => true) => (await rowsNow(table)).filter(test).length,
      text: () => page.evaluate(() => document.querySelector('.cc-app').innerText),
      /** Moves the clock (the page's and the stand-in database's) and opens a page afresh at that moment. */
      setClock: async (date, to = null) => {
        clock = new Date(date);
        await page.clock.setFixedTime(clock);
        // Device only: the stand-in's "not yet" note is stamped as each page loads, and lasts an hour of the page's own clock.
        // A clock moved on is applied after that stamp, so it is stamped again after the move: otherwise a page loaded more
        // than an hour "later" asks the real database, finds 049, and tries to send the seed (stopped and listed, but tried).
        if (!there) await page.addInitScript(() => { try { for (const k of ['clarity-coach-not-yet', 'clarity-coach-day-not-yet', 'clarity-coach-cal-not-yet']) localStorage.setItem(k, String(Date.now())); } catch { /* blocked */ } });
        if (to) await go(to); else { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(page, 600); }
      },
      round: async () => { await page.evaluate(() => window.__clarityCalSync.round()); await settle(page, 1200); },
      done: async ({ api = [] } = {}) => {
        await settle(page, 600);
        await Promise.all(waits);
        if (process.env.PEEK) { const n = store.calls.findIndex((c) => c.startsWith('blocked')); if (n >= 0) console.log('PEEK calls before the first blocked one:', store.calls.slice(Math.max(0, n - 12), n + 3).join(' ; ')); }
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        const asked = store.calls.filter((c) => c.startsWith('api ') && !api.some((a) => c.includes(a)));
        pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
        pass(`${tag}: nothing was asked of the portal's server that could send`, asked.length === 0, [...new Set(asked)].slice(0, 5).join('; '));
        pass(`${tag}: nothing but a read reached the test project`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
        pass(`${tag}: no page error`, errors.length === 0, [...new Set(errors)].slice(0, 3).join('; '));
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }
  const book = async (page) => { await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 1100); };
  /** The seed without what would sit on the series' own Mondays: the day seed's later sessions and the Training repeat. */
  const quietMondays = (rows) => {
    rows.coach_sessions = rows.coach_sessions.filter((s) => s.starts_at < at('2026-10-19', '00:00'));
    rows.coach_cal_items = rows.coach_cal_items.filter((i) => i.id !== CAL.training);
  };
  /** Books Mia Torres every Monday at 12:30 UK time (07:30 in New York) from Mon 19 Oct, three calls. */
  const bookSeries = async (t, tag) => {
    const { page } = t;
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Mia Torres');
    await press(dialog(page), page, 'Choose my own time');
    await dialog(page).locator('.ds-date').click(); await settle(page, 400);
    await page.locator('.ds-cal-day:not([disabled])', { hasText: /^19$/ }).last().click(); await settle(page, 400);
    await dialog(page).getByLabel('Starts').fill('12:30'); await settle(page, 400);
    const both = await dialog(page).locator('.cc-book-both-clocks').textContent().catch(() => '');
    pass(`${tag}: the chosen time shows both clocks: "12:30 UK time · 7:30 am New York time"`, both === 'Mon 19 Oct, 12:30 UK time · 7:30 am New York time', both);
    await pick(dialog(page), page, 'How often', 'Every week');
    for (let i = 0; i < 3; i += 1) await press(dialog(page), page, 'Fewer calls');
    pass(`${tag}: the button counts the series' calls`, (await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').textContent()) === 'Book 3 calls');
    const clashes = await dialog(page).locator('.cc-book-clash').allTextContents();
    pass(`${tag}: none of the three Mondays clashes`, clashes.length === 0, clashes.join(' | '));
    await book(page);
    const made = (await t.rowsNow('coach_cal_items')).filter((i) => i.title === 'Mia Torres' && i.id !== CAL.miaMon).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    return made;
  };

  // ================================================================ a New York client across both clock changes
  async function newYork(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, New York`;
    const t = await openAt({ role, db, tag, when: OCT, change: quietMondays });
    const { page } = t;
    const made = await bookSeries(t, tag);
    const rule = seriesRule({ weekday: 1, time: '07:30', zone: NY, from: '2026-10-19' });
    const want = seriesCalls(rule, { from: instantAt('2026-10-19', '00:00', LON), to: instantAt('2026-11-03', '00:00', LON) }).map((c) => new Date(c.at).toISOString());
    pass(`${tag}: three calls are made, each with its own session, anchored to New York`, made.length === 3 && made.every((i) => i.time_zone === NY && i.session_id && i.kind === 'client_call'), JSON.stringify(made.map((i) => [i.time_zone, Boolean(i.session_id)])));
    pass(`${tag}: they are the time library's own series for "every Monday, 07:30 New York time"`, want.length === 3 && made.every((i, n) => same(i.starts_at, want[n])), made.map((i) => i.starts_at).join(' '));
    pass(`${tag}: it is 7:30 am in New York every time`, made.every((i) => wallClock(i.starts_at, NY).time === '07:30' && onQuarterHour(i.starts_at, NY)));
    pass(`${tag}: and 12:30, 11:30, 12:30 for Tim across 25 Oct and 1 Nov`, made.map((i) => uk(i.starts_at).time).join() === '12:30,11:30,12:30', made.map((i) => uk(i.starts_at).time).join());
    const sessions = await t.rowsNow('coach_sessions');
    pass(`${tag}: each session starts at its call's own moment`, made.every((i) => same(sessions.find((s) => s.id === i.session_id)?.starts_at, i.starts_at)));

    // ---- the calendar, week by week
    for (const [day, time, minutes] of [['2026-10-19', '12:30', 750], ['2026-10-26', '11:30', 690], ['2026-11-02', '12:30', 750]]) {
      await t.go(`/coach/calendar?view=week&day=${day}`);
      const mia = tile(page, day, '7:30 am New York');
      const words = (await mia.textContent().catch(() => '')) || '';
      pass(`${tag}: Mon ${day.slice(8)}: the tile says ${time} and "7:30 am New York" inside its block`, words.includes('Mia Torres') && words.includes(`${time}, 7:30 am New York`), words);
      const box = await mia.boundingBox().catch(() => null);
      const y = (await point(page, day, minutes)).y;
      pass(`${tag}: Mon ${day.slice(8)}: and is drawn at ${time} on the UK column`, Boolean(box) && Math.abs(box.y - y) <= 2, box ? `${Math.round(box.y)} for ${Math.round(y)}` : 'no tile');
      pass(`${tag}: Mon ${day.slice(8)}: a screen reader hears both`, new RegExp(`${time} to .*7:30 am New York`).test((await mia.getAttribute('aria-label').catch(() => '')) || ''), (await mia.getAttribute('aria-label').catch(() => '')) || '');
    }

    // ---- both time columns on the change days. (The second column starts on the next client call's zone each time
    // the calendar opens, so New York is chosen on each day; the hour a clock change repeats is cal-rules.mjs's.)
    for (const [day, hours] of [['2026-10-24', 5], ['2026-10-25', 4], ['2026-10-26', 4], ['2026-10-31', 4], ['2026-11-01', 5], ['2026-11-02', 5]]) {
      await t.go(`/coach/calendar?view=day&day=${day}`);
      await page.locator('.cc-cal-zone-btn').click(); await settle(page, 400);
      await page.getByRole('menuitemcheckbox', { name: 'New York' }).click(); await settle(page, 600);
      const rows = await columns(page);
      const zones = await page.locator('.cc-cal-zone').allTextContents();
      const wrong = rows.filter(([other, own]) => wallClock(instantAt(day, own, LON), NY).time !== other);
      const eight = rows.find(([, own]) => own === '08:00');
      pass(`${tag}: ${day}: every row of the New York column is that moment in New York (${hours} hours behind)`, zones.join() === 'New York,UK' && rows.length >= 12 && wrong.length === 0
        && Boolean(eight) && Number(eight[0].slice(0, 2)) === 8 - hours, `${zones.join('|')} ${wrong.slice(0, 3).join(' ')} ${eight || ''}`);
    }

    // ---- Today, the Monday before each change
    await t.setClock(new Date(2026, 9, 19, 9, 0), '/coach');
    let said = await t.text();
    pass(`${tag}: Mon 19 Oct, Today: one quiet line says the UK's clocks go back on Sunday 25 Oct`, (said.match(/UK clocks go back on Sunday 25 Oct\./g) || []).length === 1);
    pass(`${tag}: and that Mia's Monday call moves from 12:30 to 11:30 UK time from Mon 26 Oct`, /Your calls with clients in other time zones stay at their usual time for them; for you, .*Mia’s Monday call moves from 12:30 to 11:30 UK time from Mon 26 Oct/.test(said), (said.match(/UK clocks go back[^\n]*/) || [''])[0]);
    pass(`${tag}: the line never uses letters for a zone`, !/\b(EST|EDT|GMT|BST|ET|PT|CST)\b/.test((said.match(/clocks go [^\n]*/) || [''])[0]));
    let row = page.locator('.cc-today-calls .ds-li', { hasText: 'Mia Torres' }).first();
    pass(`${tag}: Today's call row gives her own time 12-hour: "7:30 am New York"`, /12:30/.test(await row.textContent().catch(() => '')) && /7:30 am New York/.test(await row.textContent().catch(() => '')), await row.textContent().catch(() => ''));
    await t.setClock(new Date(2026, 9, 26, 9, 0), '/coach');
    said = await t.text();
    pass(`${tag}: Mon 26 Oct, Today: one quiet line says the US's clocks go back on Sunday 1 Nov`, (said.match(/US clocks go back on Sunday 1 Nov\./g) || []).length === 1 && !/UK clocks go back/.test(said));
    pass(`${tag}: and that Mia's Monday call moves from 11:30 to 12:30 UK time from Mon 2 Nov`, /Your calls with US clients stay at their usual time for them; for you, .*Mia’s Monday call moves from 11:30 to 12:30 UK time from Mon 2 Nov/.test(said), (said.match(/US clocks go back[^\n]*/) || [''])[0]);
    row = page.locator('.cc-today-calls .ds-li', { hasText: 'Mia Torres' }).first();
    pass(`${tag}: that Monday her call is at 11:30 for Tim and still 7:30 am for her`, /11:30/.test(await row.textContent().catch(() => '')) && /7:30 am New York/.test(await row.textContent().catch(() => '')), await row.textContent().catch(() => ''));
    await t.setClock(new Date(2026, 10, 2, 9, 0), '/coach');
    said = await t.text();
    row = page.locator('.cc-today-calls .ds-li', { hasText: 'Mia Torres' }).first();
    pass(`${tag}: Mon 2 Nov: back at 12:30, with no clock-change line left`, /12:30/.test(await row.textContent().catch(() => '')) && !/clocks go/.test(said), (said.match(/clocks go [^\n]*/) || [''])[0]);
    await t.done();
  }

  // ================================================================ a Sydney client: both days
  async function sydney(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, Sydney`;
    const t = await openAt({ role, db, tag, when: new Date(2026, 10, 17, 9, 0), change: (rows) => {
      const priya = rows.client_profiles.find((p) => p.id === ID.priya);
      rows.client_profiles.push({ ...priya, id: ISLA, user_id: null, name: 'Isla Brooks', email: 'isla@example.invalid', city: 'Sydney', time_zone: SYD, job_title: 'Managing partner' });
      rows.engagements.push({ ...rows.engagements.find((e) => e.id === ID.ePriya), id: '00000000-0000-4000-8000-000000009a02', profile_id: ISLA, sessions_total: 12, sessions_held: 1 });
    } });
    const { page } = t;
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Isla Brooks');
    const offers = await dialog(page).locator('.ds-answer').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s*\n\s*/g, ' | ')));
    // Tim's working day (09:00 to 18:30 UK time) is 20:00 to 05:30 in Sydney in November: no time is inside her 07:00 to 20:00,
    // so nothing is suggested, calmly, and any time that is suggested gives her own clock and her day.
    const none = /No free times in the next 2 weeks\. Choose your own time\./.test(await dialog(page).innerText());
    pass(`${tag}: no time in Tim's working day is between 07:00 and 20:00 in Sydney, and the panel says so calmly`, offers.length ? offers.every((o) => /\| (\w{3} \d+ Nov, )?\d\d:\d\d for Isla in Sydney$/.test(o)) : none, offers.join(' ; '));
    await press(dialog(page), page, 'Choose my own time');
    await dialog(page).locator('.ds-date').click(); await settle(page, 400);
    await page.locator('.ds-cal-day:not([disabled])', { hasText: /^22$/ }).last().click(); await settle(page, 400);
    // A start off the quarter hour in her time never gets booked.
    await dialog(page).getByLabel('Starts').fill('21:10'); await settle(page, 400);
    const before = await t.count('coach_cal_items');
    await book(page);
    const off = (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || '';
    const stray = (await t.rowsNow('coach_cal_items')).filter((i) => i.title === 'Isla Brooks');
    pass(`${tag}: a start off the quarter hour is refused calmly, or put on the quarter hour: never saved as typed`, (stray.length === 0 && /^Calls start on a quarter hour in Sydney time\. Choose the nearest one\.$/.test(off)) || stray.every((i) => onQuarterHour(i.starts_at, SYD)), `${off} ${stray.map((i) => i.starts_at).join()}`);
    if (stray.length) { await t.go('/coach/calendar/book'); pass(`${tag}: (the typed 21:10 was booked: see the line above)`, false, stray.map((i) => uk(i.starts_at).time).join()); }
    else pass(`${tag}: and nothing was saved`, (await t.count('coach_cal_items')) === before);
    await dialog(page).getByLabel('Starts').fill('21:00'); await settle(page, 400);
    const both = (await dialog(page).locator('.cc-book-both-clocks').textContent().catch(() => '')) || '';
    pass(`${tag}: Book a call shows both days: Sun 22 Nov, 21:00 UK time and Mon 23 Nov, 08:00 Sydney time`, both === 'Sun 22 Nov, 21:00 UK time (Mon 23 Nov, 08:00 Sydney time)' || both === 'Mon 23 Nov, 08:00 Sydney time (Sun 22 Nov, 21:00 UK time)', both);
    await book(page);
    const said = await toast(page);
    const item = (await t.rowsNow('coach_cal_items')).find((i) => i.title === 'Isla Brooks');
    pass(`${tag}: the call is anchored to Sydney: Mon 23 Nov, 08:00 there, on a quarter hour`, item?.time_zone === SYD && wallClock(item.starts_at, SYD).date === '2026-11-23' && wallClock(item.starts_at, SYD).time === '08:00' && onQuarterHour(item.starts_at, SYD) && Boolean(item.session_id), `${item?.time_zone} ${item?.starts_at} ${said}`);

    // ---- the tile, the brief, the call's own panel, the Schedule
    await t.go('/coach/calendar?view=day&day=2026-11-22');
    const isla = tile(page, '2026-11-22', 'Isla Brooks');
    const words = (await isla.textContent().catch(() => '')) || '';
    pass(`${tag}: the tile sits on Tim's Sunday at 21:00 and says her Monday: "Mon 23 Nov, 08:00 Sydney"`, words.includes('21:00') && words.includes('Mon 23 Nov, 08:00 Sydney'), words);
    pass(`${tag}: and a screen reader hears both days`, /Sun 22 Nov.*Mon 23 Nov, 08:00 Sydney/.test((await isla.getAttribute('aria-label').catch(() => '')) || ''), (await isla.getAttribute('aria-label').catch(() => '')) || '');
    await isla.click(); await settle(page, 1200);
    const brief = (await dialog(page).locator('.cc-brief-meta').textContent().catch(() => '')) || '';
    if (process.env.SHOTS) await dialog(page).screenshot({ path: `${process.env.SHOTS}/week-sydney-brief-${role}-${db}.png` }).catch(() => {});
    pass(`${tag}: the brief gives Tim's time and hers, with her day: "Mon 23 Nov, 08:00 Sydney time"`, /21:00/.test(brief) && brief.includes('Mon 23 Nov, 08:00 Sydney time'), brief);
    await dialog(page).getByRole('button', { name: 'Edit the call' }).click(); await settle(page, 900);
    const panel = await dialog(page).textContent();
    pass(`${tag}: the call's own panel says "Isla’s time: Mon 23 Nov, 08:00 Sydney."`, panel.includes('Isla’s time: Mon 23 Nov, 08:00 Sydney.') && (await dialog(page).getByLabel('Starts').inputValue()) === '21:00', panel.slice(0, 160));
    await closePanel(page);
    await t.go('/coach/calendar?view=schedule&day=2026-11-22');
    const sched = (await page.locator('.cc-sched-row', { hasText: 'Isla Brooks' }).first().textContent().catch(() => '')) || '';
    const head = await page.locator('.cc-sched-day').allTextContents();
    pass(`${tag}: the Schedule lists it under Sun 22 Nov with her Monday beside it`, sched.includes('21:00') && sched.includes('Mon 23 Nov, 08:00 Sydney') && head.some((h) => h.includes('Sun 22 Nov')), `${sched} / ${head.slice(0, 6).join(', ')}`);

    // ---- the reminders, from the rules: the day before at 18:00 her time; an hour before, with no clock time
    const [dayBefore, hourBefore] = reminderTimes(item.starts_at, SYD);
    pass(`${tag}: the day-before reminder goes at 18:00 Sydney time on Sun 22 Nov (07:00 in the UK)`, wallClock(dayBefore.at, SYD).date === '2026-11-22' && wallClock(dayBefore.at, SYD).time === '18:00' && uk(dayBefore.at).time === '07:00' && dayBefore.givesClockTime === true);
    pass(`${tag}: the 1-hour reminder goes an hour before and never gives a clock time`, same(hourBefore.at, new Date(new Date(item.starts_at).getTime() - 3600000)) && hourBefore.givesClockTime === false);
    await t.go('/coach/settings/booking');
    const line = (await page.locator('.cc-setpane').innerText()).split('\n').find((l) => /is tomorrow at/.test(l)) || '';
    pass(`${tag}: Settings, Booking shows what the day-before email says, with a place's name and never letters`, /^Your call with \w+ is tomorrow at \d\d:\d\d UK time\.$/.test(line) && (await page.locator('.cc-setpane').innerText()).includes('Each person reads the time in their own time zone.'), line || 'no such line');
    await t.done();
  }

  // ================================================================ a three-way call, with Zoom
  async function threeWay(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, three-way`;
    const t = await openAt({ role, db, tag, when: TUE, standIns: true });
    const { page } = t;
    await t.round();
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Sam Okafor');
    await pick(dialog(page), page, 'What kind of session', 'Three-way meeting');
    await dialog(page).getByLabel('Who’s invited?').fill('Dana Whitfield <dana@example.invalid>\ndana@example.invalid; Paul Garner');
    await settle(page, 300);
    const read = await dialog(page).textContent();
    pass(`${tag}: the pasted sponsor is read: one person to invite, the duplicate out, a name with no email said`, /1 person to invite\./.test(read) && /1 duplicate was taken out\./.test(read) && /Paul Garner has no email yet/.test(read), (read.match(/\d+ (person|people) to invite\.[^.]*\.[^.]*\./) || [''])[0]);
    pass(`${tag}: it says the zone it is anchored to: the booker's`, /It’s anchored to UK time, where you’re booking it\./.test(read));
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    const counts = { guests: await t.count('coach_cal_guests'), sessions: await t.count('coach_sessions') };
    await book(page);
    const item = (await t.rowsNow('coach_cal_items')).filter((i) => i.title === 'Sam Okafor' && i.id !== CAL.samTue).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const session = (await t.rowsNow('coach_sessions')).find((s) => s.id === item?.session_id);
    const guests = (await t.rowsNow('coach_cal_guests')).filter((g) => g.item_id === item?.id);
    pass(`${tag}: the call is made with its session (a three-way) and its guests, anchored to UK time`, item?.time_zone === LON && session?.kind === 'three_way' && same(session.starts_at, item.starts_at) && (await t.count('coach_sessions')) === counts.sessions + 1 && guests.length === (await t.count('coach_cal_guests')) - counts.guests && guests.some((g) => g.email === 'dana@example.invalid'), `${item?.time_zone} ${session?.kind} ${guests.map((g) => g.name).join()}`);
    pass(`${tag}: before a round has run the call has no link yet`, !item?.meeting_link);
    await t.round(); await t.round();
    const linked = await t.one('coach_cal_items', item.id);
    const link = linked?.meeting_link || '';
    pass(`${tag}: within a round Zoom (the stand-in) gives the call its link`, /^https:\/\/zoom\.example\/j\/\d+$/.test(link), link || 'no link');
    const meeting = (await page.evaluate(() => window.__clarityCalSync.zoom().meetings())).find((m) => m.id === linked?.meeting_id);
    pass(`${tag}: the meeting is made in the zone the call is anchored to`, meeting?.timeZone === LON, meeting?.timeZone);
    const day = uk(item.starts_at).date;
    await t.go(`/coach/calendar?view=day&day=${day}`);
    await page.locator(`[data-cal-day="${day}"] [data-cal-key="item:${item.id}"], [data-cal-day="${day}"] [data-cal-key*="${item.id}"]`).first().click(); await settle(page, 1200);
    let join = dialog(page).getByRole('link', { name: 'Join on Zoom' });
    pass(`${tag}: its tile opens the brief, with Join on Zoom on the call's own link`, (await dialog(page).locator('.ds-dialog-title').textContent().catch(() => '')) === 'Sam Okafor' && (await join.getAttribute('href').catch(() => '')) === link);
    await dialog(page).getByRole('button', { name: 'Edit the call' }).click(); await settle(page, 900);
    join = dialog(page).getByRole('link', { name: 'Join on Zoom' });
    pass(`${tag}: the call's own panel has Join on Zoom too`, (await join.getAttribute('href').catch(() => '')) === link);
    await press(dialog(page), page, 'More options');
    pass(`${tag}: and lists its guest`, (await dialog(page).textContent()).includes('Dana Whitfield'));
    await closePanel(page);
    await t.go(`/coach/sessions/${session.id}`);
    join = page.locator('.cc-ses').getByRole('link', { name: 'Join on Zoom' });
    pass(`${tag}: the session's page has Join on Zoom`, (await join.getAttribute('href').catch(() => '')) === link);
    // The bar, 8 minutes before it (never a moment ahead of the real day).
    const eight = new Date(new Date(item.starts_at).getTime() - 8 * 60000);
    if (eight.getTime() < Date.now()) {
      await t.setClock(eight, '/coach');
      const bar = page.locator('.cc-callbar');
      pass(`${tag}: 8 minutes before, the bar names it with Join on Zoom on the same link`, (await bar.textContent().catch(() => '')).includes('Sam Okafor in 8 minutes') && (await bar.getByRole('link', { name: 'Join on Zoom' }).getAttribute('href').catch(() => '')) === link, await bar.textContent().catch(() => 'no bar'));
    } else pass(`${tag}: the first free time is before the real day, so the bar can be shown`, false, item.starts_at);
    await t.done();
  }

  // ================================================================ the next-call bar, from the day's own session
  async function bar(role, db, size = 1440) {
    const tag = `${role}${size === 400 ? ' on a phone' : ''}, ${db === 'there' ? '051 there' : 'device only'}, the bar`;
    const t = await openAt({ role, db, tag, size, when: new Date(2026, 10, 17, 12, 19), path: '/coach' });
    const { page } = t;
    const strip = page.locator('.cc-callbar');
    const sam = await t.one('coach_cal_items', CAL.samTue);
    pass(`${tag}: 11 minutes before, no bar`, (await strip.count()) === 0);
    await t.setClock(new Date(2026, 10, 17, 12, 22));
    pass(`${tag}: 8 minutes before, the bar names the call quietly`, (await strip.count()) === 1 && (await strip.textContent()).includes('Sam Okafor in 8 minutes') && !/cc-callbar--soon/.test(await strip.getAttribute('class')), await strip.textContent().catch(() => 'no bar'));
    const join = strip.getByRole('link', { name: 'Join on Zoom' });
    pass(`${tag}: Join on Zoom is a quiet link to the call's own meeting`, (await join.getAttribute('href').catch(() => '')) === sam.meeting_link && /^https:\/\//.test(sam.meeting_link) && (await join.evaluate((el) => !el.classList.contains('ds-btn--primary')).catch(() => false)));
    await t.setClock(new Date(2026, 10, 17, 12, 26));
    pass(`${tag}: 4 minutes before, it is coral`, (await strip.textContent()).includes('Sam Okafor in 4 minutes') && /cc-callbar--soon/.test(await strip.getAttribute('class')));
    await t.setClock(new Date(2026, 10, 17, 12, 30));
    pass(`${tag}: as it starts, "is starting now"`, (await strip.textContent()).includes('Sam Okafor is starting now'), await strip.textContent().catch(() => ''));
    await t.setClock(new Date(2026, 10, 17, 12, 39));
    pass(`${tag}: 9 minutes in, the bar is still there, and still says the call has started`, (await strip.count()) === 1 && /Sam Okafor/.test(await strip.textContent()) && !/in \d+ minutes/.test(await strip.textContent()), await strip.textContent().catch(() => 'no bar'));
    await t.setClock(new Date(2026, 10, 17, 12, 41));
    pass(`${tag}: 11 minutes in, it has gone`, (await strip.count()) === 0);
    pass(`${tag}: nothing scrolls sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await t.done();
  }

  /** A signed-out visitor's page, in the coach's own stand-in database. */
  const guestPage = async (store, when, { size = 1440, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: size === 400 ? { width: 400, height: 860 } : { width: 1440, height: 1200 }, serviceWorkers: 'block', colorScheme: theme, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.clock.setFixedTime(when);
    await guestStandIn(page, store);
    const open = async (path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-public', { timeout: 20000 }); await settle(page, 1000); };
    return { page, ctx, errors, open, words: () => page.locator('.cc-public').innerText() };
  };

  // ================================================================ a poll
  async function poll(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, a poll`;
    const when = new Date(2026, 10, 17, 9, 0);
    const t = await openAt({ role, db, tag, when });
    const { page } = t;
    await t.go('/coach/calendar/polls/new');
    await dialog(page).getByLabel('What’s it for?').fill('Sponsor review');
    await dialog(page).getByLabel('Who’s invited?').fill('Dana Whitfield <dana@example.invalid>, Mia Torres <mia@example.invalid>');
    await press(dialog(page), page, 'Pick the times');
    const holdsWas = await t.count('coach_cal_items', (i) => i.kind === 'hold');
    const itemsWas = await t.count('coach_cal_items');
    const pickedNow = async () => page.locator('[data-cal-key^="pick:"]').count();
    // Two times known to be free, then the first of a few others that is (a busy one is refused with a calm line, and isn't picked).
    for (const [day, minutes] of [['2026-11-18', 16 * 60 + 10], ['2026-11-20', 10 * 60 + 10]]) await clickAt(page, day, minutes);
    for (const [day, minutes] of [['2026-11-20', 13 * 60 + 10], ['2026-11-19', 9 * 60 + 40], ['2026-11-18', 12 * 60 + 10]]) { if ((await pickedNow()) < 3) await clickAt(page, day, minutes); }
    const picked = Number(((await page.locator('.cc-pickbar-count').textContent()) || '').replace(/\D/g, '')) || 0;
    pass(`${tag}: three times are picked on the calendar itself, each a dashed tile, and nothing is held yet`, picked === 3 && (await page.locator('[data-cal-key^="pick:"]').count()) === 3 && (await t.count('coach_cal_items')) === itemsWas, `${picked} picked`);
    await press(page.locator('.cc-pickbar'), page, 'Make the poll');
    await settle(page, 900);
    const made = (await t.rowsNow('coach_polls')).find((p) => p.title === 'Sponsor review');
    const options = (await t.rowsNow('coach_poll_options')).filter((o) => o.poll_id === made?.id).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    const people = (await t.rowsNow('coach_poll_people')).filter((p) => p.poll_id === made?.id);
    pass(`${tag}: the poll is made with its three times held and each person's own key`, Boolean(made) && options.length === 3 && people.length === 2 && people.every((p) => p.vote_key) && (await t.count('coach_cal_items', (i) => i.kind === 'hold')) === holdsWas + 3);
    pass(`${tag}: nothing is sent: each note opens in Tim's own email`, (await page.locator('.cc-poll-page').innerText()).includes('Nothing is sent until you send it from your own email.') && (await page.locator('a[href^="mailto:"]').count()) === 2);
    // Mia answers in New York: her times are hers, 12-hour.
    await page.getByRole('button', { name: 'Edit Mia’s time zone' }).click(); await settle(page, 500);
    await pick(dialog(page), page, 'Their time zone', 'New York');
    pass(`${tag}: a person's time zone is saved on the poll`, (await toast(page)) === 'Saved' && (await t.rowsNow('coach_poll_people')).find((p) => p.name === 'Mia Torres' && p.poll_id === made.id)?.time_zone === NY);
    await page.locator('.cc-poll-tabs').getByRole('button', { name: /Mia/ }).click(); await settle(page, 400);
    const hers = await page.locator('.cc-poll-page').innerText();
    pass(`${tag}: the coach can read the times as Mia will: in New York time, 12-hour`, hers.includes('They’re in New York time.') && (hers.match(/\d{1,2}:\d\d (am|pm)/g) || []).length >= 3, (hers.match(/They’re in [^\n]*/) || [''])[0]);
    // The held times, on the calendar.
    await t.go('/coach/calendar?view=week');
    const held = await page.locator('.cc-cal-body .cc-cal-tile--hold').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopStyle));
    pass(`${tag}: each held time is a dashed outline on the calendar`, held.length === holdsWas + 3 && held.every((b) => b === 'dashed'), held.join());

    let winner = options[1];
    if (t.there) {
      const dana = people.find((p) => p.name === 'Dana Whitfield');
      const mia = (await t.rowsNow('coach_poll_people')).find((p) => p.name === 'Mia Torres' && p.poll_id === made.id);
      const a = await guestPage(t.store, when, { size: 400 });
      await a.open(`/poll/${dana.vote_key}`);
      const danaSees = await a.words();
      pass(`${tag}: Dana's page shows the three times in her own (UK) time, and nothing of the calendar`, (await a.page.getByRole('checkbox').count()) === 3 && /\b16:00\b/.test(danaSees) && !/Training|Sam Okafor|Writing/.test(danaSees), danaSees.slice(0, 200));
      await a.page.getByRole('checkbox').nth(1).click();
      await a.page.getByRole('button', { name: 'Send my answers', exact: true }).click(); await settle(a.page, 700);
      const b = await guestPage(t.store, when, { theme: 'dark' });
      await b.open(`/poll/${mia.vote_key}`);
      const miaSees = await b.words();
      pass(`${tag}: Mia's page opens in New York time, 12-hour, the city named`, /11:00 am/.test(miaSees) && (await b.page.getByRole('combobox', { name: /^Your time zone/ }).textContent()).includes('New York'), miaSees.slice(0, 260));
      for (let i = 0; i < 3; i += 1) await b.page.getByRole('checkbox').nth(i).click();
      await b.page.getByRole('button', { name: 'Send my answers', exact: true }).click(); await settle(b.page, 700);
      pass(`${tag}: both sets of answers are saved by the database's own function`, /Your answers are in/.test(await b.words()) && t.store.rows.coach_poll_votes.filter((v) => [dana.id, mia.id].includes(v.person_id)).length === 6);
      await t.go(`/coach/calendar/polls/${made.id}`);
      const rows = await page.locator('.cc-poll-row:not(.cc-poll-row--person)').evaluateAll((els) => els.map((el) => ({ words: el.innerText.replace(/\n/g, ' | '), all: Boolean(el.querySelector('.cc-poll-all')) })));
      pass(`${tag}: the coach sees who can make each time, and the one everyone can`, rows.length === 3 && rows.filter((r) => r.all).length === 1 && rows[1].all && /Dana can’t/.test(rows[0].words), rows.map((r) => r.words).join(' ; '));
      await page.locator('.cc-poll-row', { has: page.locator('.cc-poll-all') }).getByRole('button', { name: /^Confirm / }).click(); await settle(page, 1100);
      winner = options[1];
      // Dana's page now says it is confirmed, in her time.
      await a.open(`/poll/${dana.vote_key}`);
      pass(`${tag}: a person asked then sees it confirmed, with Add to calendar`, (await a.words()).includes(`It’s confirmed for ${dayKeyWords(uk(winner.starts_at).date)}, ${uk(winner.starts_at).time} UK time.`) && (await a.page.getByRole('button', { name: 'Add to calendar', exact: true }).count()) === 1, (await a.words()).slice(0, 200));
      pass(`${tag}: no page error on the two people's pages`, a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 2).join(' | '));
      await a.ctx.close(); await b.ctx.close();
    } else {
      await t.go(`/coach/calendar/polls/${made.id}`);
      await page.locator('.cc-poll-row:not(.cc-poll-row--person)').nth(1).getByRole('button', { name: /^Confirm / }).click(); await settle(page, 1100);
    }
    const check = async (what) => {
      const done = (await t.rowsNow('coach_polls')).find((p) => p.id === made.id);
      const call = (await t.rowsNow('coach_cal_items')).find((i) => i.id === done.confirmed_item_id);
      pass(`${tag}: ${what}: the winner becomes the call, at its own time`, done.status === 'confirmed' && done.confirmed_option_id === winner.id && Boolean(call) && call.kind !== 'hold' && call.title === 'Sponsor review' && same(call.starts_at, winner.starts_at), `${done.status} ${call?.kind} ${call?.starts_at}`);
      pass(`${tag}: ${what}: every held time is released at once`, (await t.count('coach_cal_items', (i) => i.kind === 'hold')) === holdsWas);
    };
    await check('Confirm');
    await undo(page);
    pass(`${tag}: Undo opens the poll again, with its three times held`, (await t.rowsNow('coach_polls')).find((p) => p.id === made.id).status === 'open' && (await t.count('coach_cal_items', (i) => i.kind === 'hold')) === holdsWas + 3 && !(await t.rowsNow('coach_cal_items')).some((i) => i.title === 'Sponsor review' && i.kind !== 'hold'));
    await page.locator('.cc-poll-row:not(.cc-poll-row--person)').nth(1).getByRole('button', { name: /^Confirm / }).click(); await settle(page, 1100);
    await check('Confirm, again');
    pass(`${tag}: the poll's page says when it is confirmed for`, (await page.locator('.cc-poll-page').innerText()).includes(`It’s confirmed for ${dayKeyWords(uk(winner.starts_at).date)}, ${uk(winner.starts_at).time}`), (await page.locator('.cc-poll-page').innerText()).slice(0, 200));
    await t.done();
  }

  // ================================================================ Open for calls, a guest's Chemistry Call, the limits
  async function open(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, Open for calls`;
    const when = new Date(2026, 10, 17, 9, 0);
    const FULL = '2026-11-27';
    const t = await openAt({ role, db, tag, when, change: (rows) => {
      // Thanksgiving (Thu 26 Nov) is free: the seed's two-day conference would keep it busy.
      rows.coach_cal_items = rows.coach_cal_items.filter((i) => i.id !== CAL.conference);
      // A Friday that already holds 5 calls, with an Open for calls block on it (the seed's own, 14:00 to 16:00).
      const call = rows.coach_cal_items.find((i) => i.id === CAL.hannahFri);
      rows.coach_sessions = rows.coach_sessions.filter((s) => uk(s.starts_at).date !== FULL);
      ['08:00', '09:15', '10:30', '11:45', '17:00'].forEach((time, n) => rows.coach_cal_items.push({ ...call, id: `00000000-0000-4000-8000-00000000970${n}`, title: `Client ${n + 1}`, session_id: null, profile_id: null, starts_at: at(FULL, time), ends_at: new Date(instantAt(FULL, time, LON).getTime() + 3600000).toISOString() }));
    } });
    const { page } = t;
    const mine = async (table) => (await t.rowsNow(table)).filter((r) => !r.coach_id || r.coach_id === t.rows.coach_open_blocks[0].coach_id);
    const blocks = async () => (await mine('coach_open_blocks')).length;
    await t.go('/coach/calendar/open');
    pass(`${tag}: Open for calls opens on next week, its open times outlined in mint`, (await page.locator('.cc-cal-range').textContent()) === '23 to 27 Nov' && (await page.locator('.cc-cal-tile--open').count()) >= 3);
    const was = await blocks();
    await dragOn(page, '2026-11-24', 19 * 60, 20 * 60);
    pass(`${tag}: dragging on a free time makes an open block`, (await blocks()) === was + 1 && (await mine('coach_open_blocks')).some((b) => b.starts_at === at('2026-11-24', '19:00') && b.ends_at === at('2026-11-24', '20:00')), await toast(page));
    await undo(page);
    pass(`${tag}: Undo takes it away`, (await blocks()) === was);
    await dragOn(page, '2026-11-24', 19 * 60, 20 * 60);
    await dragOn(page, '2026-11-24', 20 * 60, 20 * 60 + 45);
    const joined = (await mine('coach_open_blocks')).filter((b) => uk(b.starts_at).date === '2026-11-24');
    pass(`${tag}: a second block that touches the first joins it: one block, 19:00 to 20:45`, (await blocks()) === was + 1 && joined.length === 1 && joined[0].starts_at === at('2026-11-24', '19:00') && joined[0].ends_at === at('2026-11-24', '20:45'), joined.map((b) => `${uk(b.starts_at).time}-${uk(b.ends_at).time}`).join());
    await dragOn(page, '2026-11-23', 10 * 60, 11 * 60);
    pass(`${tag}: a block never sits over something busy, and says what is there`, /^That overlaps Training\.$/.test(await toast(page)) && (await blocks()) === was + 1, await toast(page));
    await page.getByRole('button', { name: 'Next week' }).click(); await settle(page, 700);
    const before = await blocks();
    await press(page, page, 'Copy last week');
    const copied = (await mine('coach_open_blocks')).filter((b) => b.starts_at >= at('2026-11-30', '00:00') && b.starts_at < at('2026-12-07', '00:00'));
    pass(`${tag}: Copy last week brings last week's blocks to this one at the same clock times`, /^Copied from last week/.test(await toast(page)) && (await blocks()) > before && copied.some((b) => b.starts_at === at('2026-11-30', '14:00') && b.ends_at === at('2026-11-30', '16:00')) && copied.some((b) => b.starts_at === at('2026-12-01', '19:00') && b.ends_at === at('2026-12-01', '20:45')), `${await toast(page)} ${copied.length}`);
    await undo(page);
    pass(`${tag}: and Undo takes the copies away`, (await blocks()) === before);

    // ---- at most 5 calls a day: by hand in Book a call
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    await press(dialog(page), page, 'Choose my own time');
    await dialog(page).locator('.ds-date').click(); await settle(page, 400);
    await page.locator('.ds-cal-day:not([disabled])', { hasText: /^27$/ }).last().click(); await settle(page, 400);
    await dialog(page).getByLabel('Starts').fill('14:30'); await settle(page, 300);
    const itemsWas = (await mine('coach_cal_items')).length;
    await book(page);
    pass(`${tag}: a sixth call on a day that has 5 is refused calmly`, (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'That day already has 5 calls. Choose another day.' && (await mine('coach_cal_items')).length === itemsWas, await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => ''));
    await dialog(page).locator('.ds-date').click(); await settle(page, 400);
    await page.locator('.ds-cal-day:not([disabled])', { hasText: /^18$/ }).last().click(); await settle(page, 400);
    await dialog(page).getByLabel('Starts').fill('16:00'); await settle(page, 300);
    await book(page);
    pass(`${tag}: and one that ends as another call starts is refused, naming it: calls keep 15 minutes between them`, (await mine('coach_cal_items')).length === itemsWas && /^That’s within 15 minutes of Nora Ellis\. Choose a time with a gap either side\.$/.test((await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || ''), await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => ''));
    await closePanel(page);

    if (t.there) {
      const store = t.store;
      const counts = { items: store.rows.coach_cal_items.length, bookings: store.rows.coach_bookings.length, leads: store.rows.coach_leads.length };
      const g = await guestPage(store, when);
      await g.open(`/book/${CAL.chemKey}`);
      const start = await g.words();
      pass(`${tag}: a guest's Chemistry Call page shows its own call only, and nothing of the calendar`, /Chemistry Call/i.test(start) && !/Connection Call/i.test(start) && !/Training|Sam Okafor|Client 1|Dentist|Swimming/.test(start));
      await zoneTo(g.page, 'Los Angeles');
      const days = async () => freeDays(g.page);
      const first = await days();
      // Mon 23 Nov's block is 14:00 to 16:00 UK time: 6:00 to 8:00 am in Los Angeles, so only 7:00 am onwards shows at first.
      const shown = (await g.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim());
      pass(`${tag}: times are in the visitor's own zone, 12-hour, and only 07:00 to 20:00 there shows at first`, first[0] === 'Mon 23' && shown.length > 0 && shown.every((x) => /^\d{1,2}:\d{2} (am|pm)$/.test(x)) && shown[0] === '7:00 am' && /Los Angeles time/.test(await g.page.locator('.cc-book-times').getAttribute('aria-label')), `${first.join(',')} / ${shown.join(',')}`);
      pass(`${tag}: a day with 5 calls already is never offered, though it has an open block`, !first.includes('Fri 27'), first.join(','));
      await g.page.getByRole('button', { name: 'Show early and late times', exact: true }).click(); await settle(g.page, 500);
      const all = (await g.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim());
      pass(`${tag}: "Show early and late times" adds the ones before 07:00 her time`, all[0] === '6:00 am' && all.length > shown.length && !(await days()).includes('Fri 27'), all.join(','));
      // Thanksgiving, said before she books (Thu 26 Nov: 13:30 to 15:00 UK time is 5:30 to 7:00 am in Los Angeles).
      if ((await days()).includes('Thu 26')) {
        await dayButton(g.page, 'Thu 26').click(); await settle(g.page, 300);
        await g.page.locator('.cc-book-time').first().click(); await settle(g.page, 300);
        await carryOn(g.page); await settle(g.page, 600);
        pass(`${tag}: a public holiday where the visitor is says so before they book`, /That’s Thanksgiving in the US\./.test(await g.words()), (await g.words()).slice(0, 300));
      } else pass(`${tag}: Thanksgiving's early times are offered once early and late times show`, false, (await days()).join(','));
      await backToTimes(g.page);
      await dayButton(g.page, 'Mon 23').click(); await settle(g.page, 300);
      await g.page.locator('.cc-book-time', { hasText: /^7:00 am$/ }).click(); await settle(g.page, 400);
      await carryOn(g.page);
      pass(`${tag}: both clocks show once a time is chosen`, /7:00 am Los Angeles time · 15:00 UK time/.test(await g.page.locator('.cc-book-when').textContent()), await g.page.locator('.cc-book-when').textContent());
      await g.page.getByLabel('Your name').fill('Grace Liu');
      await g.page.getByLabel('Your email').fill('grace@example.invalid');
      await g.page.getByLabel('What would you like from the call?').fill('To think through a new role.');
      await g.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(g.page, 1000);
      const booking = store.rows.coach_bookings.find((b) => b.name === 'Grace Liu');
      const item = store.rows.coach_cal_items.find((i) => i.id === booking?.item_id);
      pass(`${tag}: she is booked: "You’re booked for Mon 23 Nov, 7:00 am Los Angeles time."`, /You’re booked for Mon 23 Nov, 7:00 am Los Angeles time\./.test(await g.words()), (await g.words()).slice(0, 200));
      pass(`${tag}: booking makes the item, the booking and the lead, anchored to her zone`, store.rows.coach_cal_items.length === counts.items + 1 && store.rows.coach_bookings.length === counts.bookings + 1 && store.rows.coach_leads.length === counts.leads + 1 && item?.kind === 'chemistry' && item?.time_zone === 'America/Los_Angeles' && onQuarterHour(booking.starts_at, 'America/Los_Angeles') && store.rows.coach_leads.some((l) => l.booking_id === booking.id && l.source === 'chemistry_page' && l.status === 'new'));
      pass(`${tag}: the page's address becomes her own link, with Add to calendar, and says to keep it to move or cancel`, g.page.url() === `${APP}/book/mine/${booking.guest_key}` && (await g.page.getByRole('button', { name: 'Add to calendar', exact: true }).count()) === 1 && /Keep this page’s link to move or cancel later\./.test(await g.words()));
      pass(`${tag}: a confirmation is asked of the server by her key, and none is claimed sent on a build that isn't live`, store.calls.includes('api /api/booking-email') && !/confirmation is on its way/.test(await g.words()));
      // A second visitor, in the UK: nothing within 15 minutes of her call is offered.
      const h = await guestPage(store, when, { theme: 'dark' });
      await h.open(`/book/${CAL.chemKey}`);
      const near = (await h.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim());
      pass(`${tag}: another visitor is never offered her time, nor one within 15 minutes of it`, near.length > 0 && near.every((x) => /^\d\d:\d\d$/.test(x)) && !near.some((x) => x >= '14:30' && x < '15:45') && near.includes('14:00'), near.join(','));
      await h.open(`/book/${CAL.connKey}`);
      pass(`${tag}: the Connection Call page never shows the Chemistry Call`, /Connection Call/i.test(await h.words()) && !/Chemistry Call/i.test(await h.words()));
      await h.ctx.close();
      // She moves it, from her own link.
      const first0 = booking.starts_at;
      await g.open(`/book/mine/${booking.guest_key}`);
      pass(`${tag}: opened again, her link shows her call in her own time, with Move it and Cancel it`, /Your call is on Mon 23 Nov, 7:00 am Los Angeles time\./.test(await g.words()) && (await g.page.getByRole('button', { name: 'Cancel it', exact: true }).count()) === 1, (await g.words()).slice(0, 200));
      await g.page.getByRole('button', { name: 'Move it', exact: true }).click(); await settle(g.page, 900);
      await g.page.locator('.cc-book-time').last().click(); await settle(g.page, 300);
      await g.page.locator('.cc-book-move .ds-btn--primary').click(); await settle(g.page, 1000);
      pass(`${tag}: moving it moves the booking and its calendar item together`, booking.starts_at !== first0 && item.starts_at === booking.starts_at && booking.moved_from === first0 && /Moved\./.test(await g.words()), `${first0} to ${booking.starts_at}`);
      pass(`${tag}: no page error on the guest's pages`, g.errors.length === 0, g.errors.slice(0, 2).join(' | '));
      await g.ctx.close();
      // Tim sees it: the call on his calendar, in mint, with her own time.
      const day = uk(booking.starts_at).date;
      await t.go(`/coach/calendar?view=day&day=${day}`);
      const grace = page.locator('.cc-cal-tile--chemistry', { hasText: 'Grace Liu' });
      // (A 30-minute call sits on one line, so her own time is in its spoken name and its panel, not in the block.)
      pass(`${tag}: Tim's calendar shows the booked call in mint, at the time she moved it to, with her own clock in its spoken name`, (await grace.count()) === 1 && (await grace.textContent()).includes(uk(booking.starts_at).time) && /\d{1,2}:\d\d (am|pm) Los Angeles/.test((await grace.getAttribute('aria-label')) || ''), `${await grace.textContent().catch(() => 'no tile')} / ${await grace.getAttribute('aria-label').catch(() => '')}`);
      await grace.click(); await settle(page, 900);
      pass(`${tag}: and its panel says "Grace’s time" in Los Angeles, 12-hour`, /Grace’s time: \d{1,2}:\d\d (am|pm) Los Angeles\./.test(await dialog(page).textContent()), (await dialog(page).textContent()).slice(0, 160));
      await closePanel(page);
      await t.done({ api: ['/api/booking-email'] });
      return;
    }
    await t.done();
  }

  // ================================================================ a single-use link, and Offer times by email
  async function link(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, links`;
    const when = new Date(2026, 10, 17, 9, 0);
    const t = await openAt({ role, db, tag, when });
    const { page } = t;
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    await press(dialog(page), page, 'Make a single-use link instead');
    const linksWas = await t.count('coach_booking_links');
    await press(dialog(page), page, 'Create the link');
    const made = (await t.rowsNow('coach_booking_links')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const shown = await dialog(page).getByLabel('The link', { exact: true }).inputValue().catch(() => '');
    pass(`${tag}: a single-use link is made for the client and shown with its own address`, (await t.count('coach_booking_links')) === linksWas + 1 && shown === `${APP}/book/link/${made.key}` && made.for_name === 'Priya Nair' && !made.used_at && /It works once/.test(await dialog(page).textContent()));
    await closePanel(page);
    if (t.there) {
      const g = await guestPage(t.store, when);
      await g.open(`/book/link/${made.key}`);
      await g.page.locator('.cc-book-time').first().click(); await settle(g.page, 300);
      await carryOn(g.page);
      pass(`${tag}: the link opens with the name already filled in`, (await g.page.getByLabel('Your name').inputValue()) === 'Priya Nair');
      await g.page.getByLabel('Your email').fill('priya@example.invalid');
      await g.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(g.page, 1000);
      pass(`${tag}: it books once`, /You’re booked/.test(await g.words()) && Boolean(t.store.rows.coach_booking_links.find((l) => l.id === made.id).used_at), (await g.words()).slice(0, 160));
      const again = await guestPage(t.store, when, { theme: 'dark' });
      await again.open(`/book/link/${made.key}`);
      pass(`${tag}: used a second time, it is refused calmly and offers no time`, /This link has already been used\. Ask for a new one\./.test(await again.words()) && (await again.page.locator('.cc-book-time').count()) === 0);
      await g.ctx.close(); await again.ctx.close();
      await t.go('/coach/settings/booking');
      pass(`${tag}: Settings, Booking no longer counts it among the open links`, /2 open/.test(await page.locator('.cc-setrow', { hasText: 'Single-use links' }).textContent()), await page.locator('.cc-setrow', { hasText: 'Single-use links' }).textContent());
    }
    // ---- Offer times by email: in the reader's zone, nothing sent, nothing held
    const holds = await t.count('coach_cal_items', (i) => i.kind === 'hold');
    await t.go('/coach/calendar/offer');
    await clickAt(page, '2026-11-18', 16 * 60 + 10);
    await clickAt(page, '2026-11-20', 10 * 60 + 10);
    await pick(page.locator('.cc-pickbar'), page, 'Their time zone', 'Singapore');
    let mail = decodeURIComponent((await page.locator('.cc-pickbar a.ds-link').getAttribute('href')) || '');
    pass(`${tag}: for a reader in Singapore the draft gives their own days and 24-hour times: Thu 19 Nov, 00:00 and Fri 20 Nov, 18:00`, /^mailto:\?subject=/.test(mail) && /They are in Singapore time\./.test(mail) && /Thu 19 Nov, 00:00/.test(mail) && /Fri 20 Nov, 18:00/.test(mail), mail.slice(0, 260));
    await pick(page.locator('.cc-pickbar'), page, 'Their time zone', 'New York');
    mail = decodeURIComponent((await page.locator('.cc-pickbar a.ds-link').getAttribute('href')) || '');
    pass(`${tag}: for a reader in New York, 12-hour: Wed 18 Nov, 11:00 am and Fri 20 Nov, 5:00 am`, /They are in New York time\./.test(mail) && /Wed 18 Nov, 11:00 am/.test(mail) && /Fri 20 Nov, 5:00 am/.test(mail) && !/\b(EST|EDT|GMT|BST)\b/.test(mail), mail.slice(0, 260));
    await press(page.locator('.cc-pickbar'), page, 'Copy');
    pass(`${tag}: Copy says what was copied; nothing is held and nothing is sent`, /^(Copied 2 times in New York time\.|That didn’t copy)/.test(await toast(page)) && (await t.count('coach_cal_items', (i) => i.kind === 'hold')) === holds, await toast(page));
    await press(page.locator('.cc-pickbar'), page, 'Cancel');
    await t.done({ api: ['/api/booking-email'] });
  }

  // ================================================================ the calendar: a repeat, and working hours that booking and Today follow
  async function calendar(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, the calendar`;
    const t = await openAt({ role, db, tag, when: TUE });
    const { page } = t;
    const D = { mon: '2026-11-16', tue: '2026-11-17' };
    // ---- a repeat, all of them
    await tile(page, D.tue, 'Training').click(); await settle(page, 700);
    await dialog(page).getByLabel('Starts').fill('10:00');
    await dialog(page).getByRole('radio', { name: 'All of them' }).click(); await settle(page, 300);
    await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
    let series = await t.one('coach_cal_items', CAL.training);
    const others = (await t.rowsNow('coach_cal_items')).filter((i) => i.split_from === CAL.training || i.series_id === CAL.training);
    pass(`${tag}: a repeat edited "All of them" moves the series itself: no split, no stand-in row`, uk(series.starts_at).time === '10:00' && others.length === 0 && !series.repeat_rule.until, `${uk(series.starts_at).time} ${others.length}`);
    pass(`${tag}: Monday's and Tuesday's both start at 10:00`, (await tile(page, D.mon, 'Training').textContent()).includes('10:00') && (await tile(page, D.tue, 'Training').textContent()).includes('10:00'));
    await undo(page);
    series = await t.one('coach_cal_items', CAL.training);
    pass(`${tag}: Undo puts the whole series back at 09:45`, uk(series.starts_at).time === '09:45' && (await tile(page, D.mon, 'Training').textContent()).includes('09:45'));
    // ---- a repeat, this one deleted
    await tile(page, D.tue, 'Training').click(); await settle(page, 700);
    await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page, 900);
    const gone = (await t.rowsNow('coach_cal_items')).find((i) => i.series_id === CAL.training && i.occurrence_on === D.tue);
    pass(`${tag}: Delete on one time of a repeat takes only that one`, (await toast(page)) === 'Deleted' && gone?.removed === true && (await tile(page, D.tue, 'Training').count()) === 0 && (await tile(page, D.mon, 'Training').count()) === 1 && Boolean(await t.one('coach_cal_items', CAL.training)), `${await toast(page)} ${JSON.stringify(gone && [gone.removed, gone.occurrence_on])}`);
    await undo(page);
    pass(`${tag}: and Undo brings it back`, (await tile(page, D.tue, 'Training').count()) === 1);

    // ---- working hours, set on the calendar; Today and booking follow
    await t.go('/coach');
    const overBefore = ((await t.text()).match(/Today is ([^\n]*?) over\./) || [])[1] || '';
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    const late = async () => {
      for (let i = 0; i < 6 && (await dialog(page).getByRole('button', { name: 'Show more times', exact: true }).count()); i += 1) await press(dialog(page), page, 'Show more times');
      return (await dialog(page).locator('.ds-answer').allTextContents()).filter((o) => /^Tue 24 Nov, (1[6-9]|2\d):/.test(o.trim()));
    };
    const lateBefore = await late();
    await closePanel(page);
    await t.go('/coach/calendar?view=week');
    await press(page, page, 'Working hours');
    const finish = page.getByRole('slider', { name: 'Tuesday, finish' });
    await finish.focus();
    for (let i = 0; i < 14; i += 1) await page.keyboard.press('ArrowUp');
    await settle(page, 300);
    pass(`${tag}: Tuesday's finish moves from 18:30 to 15:00 in 15-minute steps`, (await finish.textContent()) === 'Finish 15:00', await finish.textContent());
    await press(page, page, 'Done');
    pass(`${tag}: Done saves the hours`, (await toast(page)) === 'Working hours saved.' && (await t.rowsNow('coach_settings'))[0].working_hours?.tue?.to === '15:00');
    await t.go('/coach');
    const overAfter = ((await t.text()).match(/Today is ([^\n]*?) over\./) || [])[1] || '';
    pass(`${tag}: Today's over-full line follows the shorter day`, Boolean(overAfter) && overAfter !== overBefore, `before “${overBefore}”, after “${overAfter}”`);
    await t.go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    const lateAfter = await late();
    const tuesdays = (await dialog(page).locator('.ds-answer').allTextContents()).filter((o) => /^Tue 24 Nov, /.test(o.trim()));
    pass(`${tag}: Book a call no longer suggests a Tuesday time that ends after 15:00`, lateAfter.length === 0 && tuesdays.every((o) => { const m = /, (\d\d):(\d\d)/.exec(o); return Number(m[1]) * 60 + Number(m[2]) + 60 <= 15 * 60; }), `before ${lateBefore.length} late, after ${lateAfter.length}; ${tuesdays.join(' ; ')}`);
    await closePanel(page);
    await t.go('/coach/calendar?view=week');
    await undo(page).catch(() => {});
    await t.done();
  }

  // ================================================================ Personal and Family are only ever busy to booking
  async function google(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}, busy only`;
    const when = new Date(2026, 10, 17, 9, 0);
    const t = await openAt({ role, db, tag, when, standIns: true, change: (rows) => {
      // The portal's own family item, over the first hour of Monday's open block (14:00 to 16:00).
      const swim = rows.coach_cal_items.find((i) => i.id === CAL.swimming);
      rows.coach_cal_items.push({ ...swim, id: '00000000-0000-4000-8000-000000009801', title: 'School play', starts_at: at('2026-11-23', '14:00'), ends_at: at('2026-11-23', '15:00') });
    } });
    const { page } = t;
    await t.round();
    // A personal event made in Google, over the first half hour of Friday's open block (14:00 to 16:00).
    await page.evaluate(() => { window.__clarityCalSync.google().inGoogle.add({ summary: 'Physio', calendarId: 'personal', start: { dateTime: '2026-11-27T14:00:00', timeZone: 'Europe/London' }, end: { dateTime: '2026-11-27T14:30:00', timeZone: 'Europe/London' } }); });
    await t.round();
    const physio = (await t.rowsNow('coach_cal_items')).find((i) => i.title === 'Physio');
    pass(`${tag}: a Personal event read from "Google" keeps its calendar here and counts as busy`, physio?.calendar === 'personal' && physio?.busy === true);
    await t.go('/coach/calendar?view=week&day=2026-11-23');
    pass(`${tag}: Tim sees both on his own calendar, as dashed life items`, /cc-cal-tile--life/.test((await tile(page, '2026-11-23', 'School play').getAttribute('class').catch(() => '')) || '') && /cc-cal-tile--life/.test((await tile(page, '2026-11-27', 'Physio').getAttribute('class').catch(() => '')) || ''));
    await t.go('/coach/calendar/open');
    const openPage = await t.text();
    pass(`${tag}: Open for calls draws them as busy for Tim, who may read his own`, /School play/.test(openPage) && /Physio/.test(openPage));
    if (t.there) {
      const g = await guestPage(t.store, when);
      await g.open(`/book/${CAL.chemKey}`);
      const mon = (await g.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim());
      pass(`${tag}: a booking page offers Monday only once the family item is over (from 15:00)`, mon.length > 0 && mon[0] === '15:00' && !mon.some((x) => x < '15:00'), mon.join(','));
      await dayButton(g.page, 'Fri 27').click(); await settle(g.page, 400);
      const fri = (await g.page.locator('.cc-book-time').allTextContents()).map((x) => x.trim());
      pass(`${tag}: and Friday only once the personal one from Google is over (from 14:30)`, fri.length > 0 && fri[0] === '14:30', fri.join(','));
      pass(`${tag}: neither is ever named, on any day`, !/School play|Physio|Swimming|Dentist|Parents/.test(await g.words()));
      const sent = t.store.calls.filter((c) => c.startsWith('rpc booking_'));
      pass(`${tag}: the page asked only the database's own booking functions`, sent.length > 0 && (t.store.blocked || []).length === 0, (t.store.blocked || []).slice(0, 3).join());
      await g.ctx.close();
    }
    await t.done();
  }

  // ================================================================ the core of it on a phone
  async function phone(role, db) {
    const tag = `${role} on a phone, ${db === 'there' ? '051 there' : 'device only'}`;
    const t = await openAt({ role, db, tag, size: 400, when: OCT, path: '/coach/calendar', change: quietMondays });
    const { page } = t;
    const made = await bookSeries(t, tag);
    pass(`${tag}: the series is three calls anchored to New York: 12:30, 11:30, 12:30 for the coach, 07:30 there`, made.length === 3 && made.every((i) => i.time_zone === NY && wallClock(i.starts_at, NY).time === '07:30' && i.session_id) && made.map((i) => uk(i.starts_at).time).join() === '12:30,11:30,12:30', made.map((i) => uk(i.starts_at).time).join());
    pass(`${tag}: the panel was a full-screen one and nothing scrolls sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    for (const [day, time] of [['2026-10-19', '12:30'], ['2026-10-26', '11:30'], ['2026-11-02', '12:30']]) {
      await t.go(`/coach/calendar?view=week&day=${day}`);
      const row = page.locator('.cc-sched-row', { hasText: '7:30 am New York' }).first();
      const words = (await row.innerText().catch(() => '')).replace(/\n/g, ' | ');
      pass(`${tag}: the week's list for ${day}: Mia at ${time}, "7:30 am New York", with a peach square before the time`, words.includes('Mia Torres') && words.includes(time) && (await row.locator('.cc-sched-square').count()) === 1 && (await page.locator('.cc-cal').count()) === 0, words);
    }
    await t.setClock(new Date(2026, 9, 26, 9, 0), '/coach');
    const said = await t.text();
    pass(`${tag}: Today on Mon 26 Oct: the US clock-change line, with the day the call moves`, /US clocks go back on Sunday 1 Nov\./.test(said) && /Mia’s Monday call moves from 11:30 to 12:30 UK time from Mon 2 Nov/.test(said), (said.match(/US clocks go back[^\n]*/) || [''])[0]);
    const row = page.locator('.cc-today-calls .ds-li', { hasText: 'Mia Torres' }).first();
    pass(`${tag}: and her call's row: 11:30, "7:30 am New York"`, /11:30/.test(await row.textContent().catch(() => '')) && /7:30 am New York/.test(await row.textContent().catch(() => '')), await row.textContent().catch(() => ''));
    pass(`${tag}: Today fits the phone`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    // The bar, from her own call.
    await t.setClock(new Date(2026, 9, 26, 11, 22), '/coach');
    const strip = page.locator('.cc-callbar');
    pass(`${tag}: 8 minutes before her call the bar names it`, (await strip.textContent().catch(() => '')).includes('Mia Torres in 8 minutes'), await strip.textContent().catch(() => 'no bar'));
    await t.setClock(new Date(2026, 9, 26, 11, 27));
    pass(`${tag}: 3 minutes before, it is coral, and still inside the phone's width`, /cc-callbar--soon/.test((await strip.getAttribute('class').catch(() => '')) || '') && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await t.done();
  }

  try {
    for (const role of roles) {
      for (const db of dbs) {
        if (has('week-ny')) await newYork(role, db);
        if (has('week-sydney')) await sydney(role, db);
        if (has('week-three')) await threeWay(role, db);
        if (has('week-poll')) await poll(role, db);
        if (has('week-open')) await open(role, db);
        if (has('week-link')) await link(role, db);
        if (has('week-cal')) await calendar(role, db);
        if (has('week-google')) await google(role, db);
        if (has('week-bar')) await bar(role, db);
        if (has('week-phone')) { await phone(role, db); await bar(role, db, 400); }
      }
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  report.done();
}

run().catch((e) => { console.error(String(e).split('\n').slice(0, 6).join('\n')); process.exit(1); });
