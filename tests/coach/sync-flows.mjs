// Google Calendar, Zoom and the next-call bar, walked (Phase 6a run 3,
// steps 3 and 6), against the stand-ins: no key exists, nothing leaves the
// page and nothing is ever sent. As the owner on a laptop, in both database
// modes (device only; 049 to 051 answered by the stand-in in shared.mjs).
//
//   sync-settings  Settings, My calendars: calm with no key; the stand-ins switched on
//   sync-push      what is on the calendar reaches "Google"; a new item too; invites are only noted; a Zoom link appears
//   sync-moved     a call moved "in Google" shows "Moved in Google Calendar" within one round: tile, brief, session
//   sync-edit      a change arriving while an item is being edited never throws the typing away
//   sync-delete    deleted in Google goes here; deleted here goes from Google
//   sync-bar       the next-call bar at 8 minutes, 4 minutes, as it starts and 11 minutes in
//
// The page's clock is pinned to M11's Tuesday (17 Nov 2026, 12:22: never
// ahead of the real day). "In Google" is the stand-in's own hook, reached
// through window.__clarityCalSync, which only a build that isn't live has.
//
//   PARTS=sync-settings,sync-push,sync-moved,sync-edit,sync-delete,sync-bar   ROLES=owner,associate   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, openCalSettings, seedDevice, settle, standIn } from './shared.mjs';
import { CAL, ID, seedClock, seedWithCal } from './seed.mjs';
import { instantAt } from '../../src/lib/time/index.js';

export const SYNC_PARTS = ['sync-settings', 'sync-push', 'sync-moved', 'sync-edit', 'sync-delete', 'sync-bar'];
const TUE = new Date(2026, 10, 17, 12, 22);
const LON = 'Europe/London';
const D = { mon: '2026-11-16', tue: '2026-11-17', wed: '2026-11-18', thu: '2026-11-19', fri: '2026-11-20' };
const at = (day, time) => instantAt(day, time, LON).toISOString();
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 500); };
const press = async (page, name) => { await openCalSettings(page, name); await page.getByRole('button', { name, exact: true }).first().click(); await settle(page, 500); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const tile = (page, day, text) => page.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: text }).first();
/** One round of the sync, now, and what follows it. */
const round = async (page) => { await page.evaluate(() => window.__clarityCalSync.round()); await settle(page, 1200); };
/** "Google" and "Zoom" as the stand-ins hold them. */
const inGoogle = (page) => page.evaluate(() => window.__clarityCalSync.google().events());
const sentByGoogle = (page) => page.evaluate(() => window.__clarityCalSync.google().sent());
const inZoom = (page) => page.evaluate(() => window.__clarityCalSync.zoom().meetings());
const eventOf = async (page, itemId) => (await inGoogle(page)).find((e) => e.extendedProperties?.private?.clarityId === itemId) || null;

async function run() {
  const report = makeReport('Google Calendar, Zoom and the next-call bar');
  const { pass } = report;
  const parts = (process.env.PARTS || SYNC_PARTS.join(',')).split(',');
  const has = (p) => parts.includes(p);
  const roles = (process.env.ROLES || 'owner').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  async function openAt({ role, db, path = '/coach/calendar?view=week', tag, standIns = true, change = null }) {
    const theme = role === 'owner' ? 'light' : 'dark';
    const there = db === 'there';
    const ctx = await coachContext(browser, { size: 1440, theme });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 1500 });
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
    let clock = new Date(TUE);
    const setClock = async (date) => { clock = new Date(date); await page.clock.setFixedTime(clock); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(page, 500); };
    await page.clock.setFixedTime(clock);
    seedClock(TUE);
    const rows = seedWithCal({ accounts: true });
    // Two calls booked on Zoom that have no link yet: Zoom's stand-in makes each one, in the call's own zone.
    rows.coach_cal_items = rows.coach_cal_items.map((i) => (i.id === CAL.samTue || i.id === CAL.jordanTue ? { ...i, meeting_link: null, meeting_id: null } : i));
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
    // The stand-ins, switched on as Settings' own switches do it (sync-settings walks the switches themselves).
    if (standIns) await page.evaluate((id) => localStorage.setItem(`clarity-cache:${id}:coach-standin-on`, JSON.stringify({ google: true, zoom: true })), me);
    await go(page, path);
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    return {
      page, store, me, there, tag, rowsNow, setClock,
      one: async (table, id) => (await rowsNow(table)).find((r) => r.id === id) || null,
      done: async () => {
        await settle(page, 600);
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        const api = store.calls.filter((c) => c.startsWith('api '));
        pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
        pass(`${tag}: the portal's server was never asked (a build that isn't live has no key to ask about)`, api.length === 0, [...new Set(api)].slice(0, 5).join('; '));
        pass(`${tag}: nothing but a read reached the test project, and nothing was sent`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
        pass(`${tag}: no page error`, errors.length === 0, [...new Set(errors)].slice(0, 3).join('; '));
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  for (const role of roles) {
    for (const db of dbs) {
      const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}`;

      // ---------------------------------------------------------------- Settings, My calendars
      if (has('sync-settings')) {
        const t = await openAt({ role, db, tag: `${tag}, settings`, path: '/coach/settings/calendars', standIns: false });
        const { page } = t;
        const pane = page.locator('.cc-setpane');
        let words = await pane.textContent();
        pass(`${tag}: My calendars has a Google Calendar row and a Zoom row, each "Not connected"`, /Google Calendar\s*Not connected/.test(words) && /Zoom\s*Not connected/.test(words));
        pass(`${tag}: with nothing connected there is no sync to reach (no stand-in until it is switched on)`, (await inGoogle(page)).length === 0);
        await press(page, 'Connect Google Calendar');
        pass(`${tag}: Connect Google Calendar, with no key, says so calmly`, (await pane.textContent()).includes('Google Calendar isn’t connected on this build, so your calendar is kept in the portal only.'));
        await press(page, 'Connect Zoom');
        words = await pane.textContent();
        pass(`${tag}: Connect Zoom, with no key, says so calmly`, words.includes('Zoom isn’t connected on this build, so calls have no Zoom link.') && !/fail/i.test(words));
        await page.getByRole('switch', { name: 'Use a stand-in Google Calendar' }).click(); await settle(page, 400);
        await page.getByRole('switch', { name: 'Use a stand-in Zoom' }).click(); await settle(page, 400);
        words = await pane.textContent();
        pass(`${tag}: a build that isn't live can switch a stand-in on for each`, /Google Calendar\s*Stand-in/.test(words) && /Zoom\s*Stand-in/.test(words));
        await settle(page, 1500); await round(page);
        const events = await inGoogle(page);
        pass(`${tag}: once on, the calendar is in "Google" within one round`, events.length > 10 && events.some((e) => e.summary === 'Writing'), `${events.length} events`);
        pass(`${tag}: no keyboard shortcut is shown`, !/⌘|Ctrl\+|Cmd\+/.test(await page.locator('.cc-app').textContent()));
        await page.getByRole('switch', { name: 'Use a stand-in Google Calendar' }).click(); await settle(page, 400);
        pass(`${tag}: switched off, the stand-in is forgotten`, /Google Calendar\s*Not connected/.test(await pane.textContent()) && (await inGoogle(page)).length === 0);
        await t.done();
      }

      // ---------------------------------------------------------------- the portal's changes reach Google and Zoom
      if (has('sync-push')) {
        const t = await openAt({ role, db, tag: `${tag}, push` });
        const { page } = t;
        await round(page);
        const events = await inGoogle(page);
        const work = (await t.rowsNow('coach_cal_items')).filter((i) => i.coach_id && (i.calendar || 'work') === 'work' && !i.removed);
        pass(`${tag}: every Work item is in "Google", and each item knows its event`, work.length > 10 && work.every((i) => i.google_event_id && events.some((e) => e.id === i.google_event_id)), `${work.filter((i) => !i.google_event_id).length} without`);
        const life = (await t.rowsNow('coach_cal_items')).filter((i) => i.calendar === 'family' || i.calendar === 'personal');
        pass(`${tag}: Personal and Family items made here are never pushed to the Work calendar`, life.length > 0 && life.every((i) => !i.google_event_id) && !events.some((e) => /Swimming|Dentist|Parents/.test(e.summary)));
        const jordan = await t.one('coach_cal_items', CAL.jordanTue);
        const sam = await t.one('coach_cal_items', CAL.samTue);
        const meetings = await inZoom(page);
        pass(`${tag}: a call booked on Zoom gets its link, saved on the item`, /^https:\/\/zoom\.example\/j\/\d+$/.test(sam?.meeting_link || '') && /^https:\/\/zoom\.example\/j\/\d+$/.test(jordan?.meeting_link || ''));
        pass(`${tag}: the meeting is made in the client's own time zone`, meetings.find((m) => m.id === jordan?.meeting_id)?.timeZone === 'America/Chicago' && meetings.find((m) => m.id === sam?.meeting_id)?.timeZone === LON);
        const jordanEvent = await eventOf(page, CAL.jordanTue);
        pass(`${tag}: the event is made in the client's zone too, with the link as its place`, jordanEvent?.start?.timeZone === 'America/Chicago' && jordanEvent?.start?.dateTime === '2026-11-17T09:45:00' && jordanEvent?.location === jordan?.meeting_link);
        const sent = await sentByGoogle(page);
        pass(`${tag}: invites "go out through Google" to an item's guests (the stand-in only notes them)`, sent.some((s) => s.kind === 'invite' && s.to.includes('dana@example.invalid')), `${sent.length} noted`);
        // A second round with nothing changed asks for nothing new.
        const before = events.length;
        await round(page);
        pass(`${tag}: a round with nothing changed makes nothing twice`, (await inGoogle(page)).length === before && (await inZoom(page)).length === meetings.length);
        // Something new made here.
        await press(page, 'Add to calendar');
        await dialog(page).getByLabel('Title').fill('Coffee with Dan Thu 10:00');
        await settle(page, 300);
        await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900);
        await round(page);
        const coffee = (await inGoogle(page)).find((e) => e.summary === 'Coffee with Dan');
        pass(`${tag}: an item made in the portal is in "Google" within one round, at its own time`, Boolean(coffee) && coffee.start?.dateTime === '2026-11-19T10:00:00' && coffee.start?.timeZone === LON);
        // Moved here: the same event moves.
        const writing = await t.one('coach_cal_items', CAL.writing);
        await tile(page, D.wed, 'Writing').focus();
        await page.keyboard.press('ArrowDown'); await settle(page, 700);
        await round(page);
        const moved = await eventOf(page, CAL.writing);
        pass(`${tag}: an item moved here moves in "Google" (the same event, never a second one)`, moved?.id === writing.google_event_id && moved?.start?.dateTime === '2026-11-18T09:15:00' && (await inGoogle(page)).filter((e) => e.summary === 'Writing').length === 1, moved?.start?.dateTime);
        // The tile's panel has the link.
        await tile(page, D.tue, 'Jordan Reyes').click(); await settle(page, 800);
        const join = dialog(page).getByRole('link', { name: 'Join on Zoom' });
        pass(`${tag}: Join on Zoom shows where the call opens, with its own link`, (await join.count()) === 1 && (await join.getAttribute('href')) === jordan.meeting_link);
        await closePanel(page);
        await t.done();
      }

      // ---------------------------------------------------------------- moved in Google
      if (has('sync-moved')) {
        const t = await openAt({ role, db, tag: `${tag}, moved` });
        const { page } = t;
        await round(page);
        const sam = await eventOf(page, CAL.samTue);
        const session0 = (await t.one('coach_cal_items', CAL.samTue)).session_id;
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.move(id, { dateTime: '2026-11-18T16:15:00', timeZone: 'Europe/London' }, { dateTime: '2026-11-18T17:15:00', timeZone: 'Europe/London' }); }, sam.id);
        await round(page);
        const item = await t.one('coach_cal_items', CAL.samTue);
        pass(`${tag}: a call moved in Google moves here within one round`, same(item.starts_at, at(D.wed, '16:15')) && same(item.ends_at, at(D.wed, '17:15')) && Boolean(item.moved_in_google_at));
        const session = await t.one('coach_sessions', session0);
        pass(`${tag}: its session moves with it`, Boolean(session) && same(session.starts_at, at(D.wed, '16:15')));
        const wed = tile(page, D.wed, 'Sam Okafor');
        pass(`${tag}: its tile says "Moved in Google Calendar"`, (await wed.count()) === 1 && (await wed.textContent()).includes('Moved in Google Calendar') && (await wed.getAttribute('aria-label') || '').includes('Moved in Google Calendar'));
        pass(`${tag}: and it has left Tuesday`, (await tile(page, D.tue, 'Sam Okafor').count()) === 0);
        await wed.click(); await settle(page, 900);
        pass(`${tag}: its panel (the brief) says so too, with "Got it"`, (await dialog(page).textContent()).includes('Moved in Google Calendar.') && (await dialog(page).getByRole('button', { name: /^Got it/ }).count()) === 1);
        await closePanel(page);
        await go(page, `/coach/sessions/${session0}`);
        const ses = page.locator('.cc-ses');
        pass(`${tag}: the session says "Moved in Google Calendar", and has Join on Zoom`, (await ses.textContent()).includes('Moved in Google Calendar.') && (await ses.getByRole('link', { name: 'Join on Zoom' }).count()) === 1);
        await ses.getByRole('button', { name: /^Got it/ }).click(); await settle(page, 700);
        pass(`${tag}: "Got it" takes the mark off`, !(await ses.textContent()).includes('Moved in Google Calendar') && (await t.one('coach_cal_items', CAL.samTue)).moved_in_google_at == null);
        await round(page);
        const after = await eventOf(page, CAL.samTue);
        pass(`${tag}: and Google keeps the time it was moved to (seeing the mark sends nothing back)`, after?.start?.dateTime === '2026-11-18T16:15:00' && same((await t.one('coach_cal_items', CAL.samTue)).starts_at, at(D.wed, '16:15')));
        // Something that isn't a call, moved in Google: it moves, with no mark.
        const admin = await eventOf(page, CAL.admin);
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.move(id, { dateTime: '2026-11-18T15:00:00', timeZone: 'Europe/London' }, { dateTime: '2026-11-18T17:00:00', timeZone: 'Europe/London' }); }, admin.id);
        // A personal event made in Google: it keeps its own calendar here.
        await page.evaluate(() => { window.__clarityCalSync.google().inGoogle.add({ summary: 'School play', calendarId: 'family', start: { dateTime: '2026-11-20T14:00:00', timeZone: 'Europe/London' }, end: { dateTime: '2026-11-20T15:00:00', timeZone: 'Europe/London' } }); });
        await round(page);
        const adminNow = await t.one('coach_cal_items', CAL.admin);
        pass(`${tag}: Admin moved in Google moves here, with no mark (it isn't a call)`, same(adminNow.starts_at, at(D.wed, '15:00')) && adminNow.moved_in_google_at == null);
        const play = (await t.rowsNow('coach_cal_items')).find((i) => i.title === 'School play');
        pass(`${tag}: a Family event read from Google keeps its calendar and counts as busy`, play?.calendar === 'family' && play?.busy === true && play?.kind === 'other');
        await go(page, '/coach/calendar?view=week');
        const playTile = tile(page, D.fri, 'School play');
        pass(`${tag}: and is drawn as a dashed life item`, (await playTile.count()) === 1 && /cc-cal-tile--life/.test(await playTile.getAttribute('class')));
        await t.done();
      }

      // ---------------------------------------------------------------- a change arrives while an item is being edited
      if (has('sync-edit')) {
        const t = await openAt({ role, db, tag: `${tag}, edit` });
        const { page } = t;
        await round(page);
        // 1. Closed without saving: Google's change comes in.
        const dinner = await eventOf(page, CAL.dinner);
        await tile(page, D.thu, 'Leaders’ dinner').click(); await settle(page, 800);
        let d = dialog(page);
        await d.getByLabel('Title').fill('Leaders’ dinner, typed here');
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.edit(id, { summary: 'Dinner, renamed in Google' }); }, dinner.id);
        await round(page);
        d = dialog(page);
        pass(`${tag}: a change arriving while the item is open never throws the typing away`, (await d.getByLabel('Title').inputValue()) === 'Leaders’ dinner, typed here');
        pass(`${tag}: the panel says it changed in Google Calendar`, (await d.textContent()).includes('This changed in Google Calendar. Save to keep your version, or close to take the new one.'));
        pass(`${tag}: and nothing has changed under it`, (await t.one('coach_cal_items', CAL.dinner)).title === 'Leaders’ dinner, Birmingham');
        await closePanel(page);
        await settle(page, 1200); await round(page);
        pass(`${tag}: closed without saving, Google's version comes in on the next round`, (await t.one('coach_cal_items', CAL.dinner)).title === 'Dinner, renamed in Google');
        // 2. Saved: the portal's is the newer change, and Google takes it.
        const sup = await eventOf(page, CAL.supervision);
        const supBefore = await t.one('coach_cal_items', CAL.supervision);
        await tile(page, D.thu, supBefore.title).click(); await settle(page, 800);
        d = dialog(page);
        await d.getByLabel('Title').fill('Supervision, my title');
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.edit(id, { summary: 'Supervision, Google’s title' }); }, sup.id);
        await round(page);
        pass(`${tag}: the second item is held too`, (await dialog(page).textContent()).includes('This changed in Google Calendar.') && (await t.one('coach_cal_items', CAL.supervision)).title === supBefore.title);
        await t.setClock(new Date(TUE.getTime() + 2 * 60000)); // the save is made after Google's change
        await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900);
        await round(page);
        const kept = await t.one('coach_cal_items', CAL.supervision);
        const there = await eventOf(page, CAL.supervision);
        pass(`${tag}: saved, the coach's version stands here and in Google (the newest choice wins)`, kept.title === 'Supervision, my title' && there?.summary === 'Supervision, my title', `${kept.title} / ${there?.summary}`);
        await round(page);
        pass(`${tag}: and the two stay the same on the next round`, (await t.one('coach_cal_items', CAL.supervision)).title === 'Supervision, my title' && (await eventOf(page, CAL.supervision))?.summary === 'Supervision, my title');
        await t.done();
      }

      // ---------------------------------------------------------------- deleted, either side
      if (has('sync-delete')) {
        const t = await openAt({ role, db, tag: `${tag}, delete` });
        const { page } = t;
        await round(page);
        const coffee = await eventOf(page, CAL.coffeeDan);
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.remove(id); }, coffee.id);
        await round(page);
        pass(`${tag}: an item deleted in Google goes from the portal within one round`, (await t.one('coach_cal_items', CAL.coffeeDan)) == null && (await tile(page, D.wed, 'Coffee with Dan Reid').count()) === 0);
        // Deleted here: gone from Google, its guests told (noted only).
        const dinner = await t.one('coach_cal_items', CAL.dinner);
        await tile(page, D.thu, 'Leaders’ dinner').click(); await settle(page, 800);
        await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page, 900);
        pass(`${tag}: deleted here, it is still in Google until a round has run (its Undo comes first)`, Boolean(await eventOf(page, CAL.dinner)));
        await round(page);
        const sent = await sentByGoogle(page);
        pass(`${tag}: then it goes from Google, and its guests would be told`, (await eventOf(page, CAL.dinner)) == null && sent.some((s) => s.kind === 'cancel' && s.eventId === dinner.google_event_id));
        // A call deleted here takes its Zoom meeting with it.
        const jordan = await t.one('coach_cal_items', CAL.jordanTue);
        await page.evaluate((id) => { window.__clarityCalSync.google().inGoogle.remove(id); }, jordan.google_event_id);
        await round(page);
        pass(`${tag}: a call deleted in Google goes here and its Zoom meeting goes too`, (await t.one('coach_cal_items', CAL.jordanTue)) == null && !(await inZoom(page)).some((m) => m.id === jordan.meeting_id));
        await t.done();
      }

      // ---------------------------------------------------------------- the next-call bar
      if (has('sync-bar')) {
        const t = await openAt({ role, db, tag: `${tag}, bar`, path: '/coach' });
        const { page } = t;
        await round(page);
        const bar = page.locator('.cc-callbar');
        const sam = await t.one('coach_cal_items', CAL.samTue);
        pass(`${tag}: 8 minutes before, the bar names the call quietly`, (await bar.count()) === 1 && (await bar.textContent()).includes('Sam Okafor in 8 minutes') && !/cc-callbar--soon/.test(await bar.getAttribute('class')));
        const join = bar.getByRole('link', { name: 'Join on Zoom' });
        pass(`${tag}: Join on Zoom is a quiet link to the call's own meeting`, (await join.count()) === 1 && (await join.getAttribute('href')) === sam.meeting_link && /^https:\/\/zoom\.example\/j\//.test(sam.meeting_link));
        await t.setClock(new Date(2026, 10, 17, 12, 26));
        pass(`${tag}: 4 minutes before, it is coral`, (await bar.textContent()).includes('Sam Okafor in 4 minutes') && /cc-callbar--soon/.test(await bar.getAttribute('class')));
        await t.setClock(new Date(2026, 10, 17, 12, 30));
        pass(`${tag}: as it starts, "is starting now"`, (await bar.textContent()).includes('Sam Okafor is starting now'));
        await bar.getByRole('button', { name: /^Sam Okafor/ }).click(); await settle(page, 900);
        pass(`${tag}: the name opens the brief, with Join on Zoom`, (await dialog(page).textContent()).includes('Sam Okafor') && (await dialog(page).getByRole('link', { name: 'Join on Zoom' }).getAttribute('href')) === sam.meeting_link);
        await closePanel(page);
        await t.setClock(new Date(2026, 10, 17, 12, 41));
        pass(`${tag}: 11 minutes in, the bar has gone`, (await bar.count()) === 0);
        // The suites' own hook still works: a test call kept in this tab.
        await page.evaluate((starts) => sessionStorage.setItem('clarity-coach-test-calls', JSON.stringify([{ name: 'Test call', startsAt: starts }])), new Date(2026, 10, 17, 12, 45).toISOString());
        await t.setClock(new Date(2026, 10, 17, 12, 42));
        pass(`${tag}: the suites' test-calls hook is kept`, (await bar.count()) === 1 && (await bar.textContent()).includes('Test call in 3 minutes'));
        await page.evaluate(() => sessionStorage.removeItem('clarity-coach-test-calls'));
        pass(`${tag}: no client's own to-do was touched`, (await t.rowsNow('coach_todos')).every((x) => x.coach_id), ID.sam);
        await t.done();
      }
    }
  }

  await browser.close();
  seedClock(null);
  report.done();
}

run().catch((e) => { console.error('FAILED TO RUN:', String(e).split('\n')[0]); process.exit(1); });
