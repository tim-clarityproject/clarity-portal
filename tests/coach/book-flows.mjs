// Booking, walked (Phase 6a run 3, step 4), on M11's own Tuesday (17 Nov
// 2026; never ahead of the real day):
//
//   coach   Book a call of each kind (one call, a series in the client's own
//           zone, a three-way, a group, in person with travel time, a time
//           that overlaps something), a single-use link, Offer times by
//           email, a poll made and confirmed, Open for calls (drag, join,
//           never over something busy, Copy last week) and Settings'
//           limits. As the owner and as an associate, in both database modes:
//             device only  051 isn't there (as today): everything stays on
//                          the device; a write that leaves the page is
//                          stopped, listed and fails the walk.
//             there        049 to 051 answered by the stand-in (cal: true).
//   guest   signed out, sharing the coach's stand-in database: a Chemistry
//           Call booked end to end then moved, "Add to calendar", two guests
//           racing for one time, a single-use link used twice, early and late
//           times, a public holiday said first, a poll voted on then
//           confirmed by the coach; and the calm line before 051.
//   client  the test client on /coaching: a session moved inside 24 hours
//           (it says so first), one booked, one cancelled; and the calm line
//           before 051.
//
// Nothing reaches the test project but reads, no email is ever asked for
// that would send, and every browser is muted.
//
//   PARTS=coach,guest,client   ROLES=owner,associate   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, openCalSettings, seedDevice, settle, standIn } from './shared.mjs';
import { CAL, ID, seedClock, seedWithCal } from './seed.mjs';
import { guestStandIn } from './book-standin.mjs';
import { clearCoaching, clientContext, clientStandIn, fromCoach } from './client.mjs';
import { instantAt, onQuarterHour, wallClock } from '../../src/lib/time/index.js';

const TUE = new Date(2026, 10, 17, 9, 0);
const LON = 'Europe/London';
const NY = 'America/New_York';
const at = (day, time, zone = LON) => instantAt(day, time, zone).toISOString();
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const press = async (scope, page, name) => { if (scope === page) await openCalSettings(page, name); await scope.getByRole('button', { name, exact: true }).first().click(); await settle(page, 500); };
const pick = async (scope, page, label, option) => {
  await scope.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
/** Where a minute of a day is on the calendar's grid. */
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

async function run() {
  const report = makeReport('Booking');
  const { pass } = report;
  const parts = (process.env.PARTS || 'coach,guest,client').split(',');
  const roles = (process.env.ROLES || 'owner,associate').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  /** A coach's page: signed in, standing in, the clock pinned and M11's week seeded. */
  async function coachPage({ role, db, tag, size = 1440, holiday = false }) {
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
    await page.clock.setFixedTime(TUE);
    seedClock(TUE);
    const rows = seedWithCal({ accounts: true });
    // A time that is free on Thanksgiving (Thu 26 Nov 2026), for the holiday line: the seed's two-day conference would keep that day busy.
    if (holiday) rows.coach_cal_items = rows.coach_cal_items.filter((i) => i.id !== CAL.conference);
    rows.coach_open_blocks.push({ id: '00000000-0000-4000-8000-000000009911', coach_id: rows.coach_open_blocks[0].coach_id, starts_at: at('2026-11-26', '18:30'), ends_at: at('2026-11-26', '20:00'), time_zone: LON, call_type_id: null, created_at: at('2026-11-10', '09:00') });
    const store = await standIn(page, there ? { role, db: 'there', day: true, cal: true, strict: true, rows, now: () => new Date(TUE) } : { role, db: 'none' });
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
    const go = async (path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    const mine = async (table) => (await rowsNow(table)).filter((r) => !r.coach_id || r.coach_id === rows.coach_open_blocks[0].coach_id);
    return {
      page, ctx, store, me, there, tag, go, rowsNow: mine,
      done: async () => {
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: no page error`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
        pass(`${tag}: nothing but a read reached a server`, reached.length === 0, [...new Set(reached)].slice(0, 4).join(', '));
        if (!there) pass(`${tag}: no write left the page`, blocked.length === 0, [...new Set(blocked)].slice(0, 4).join(', '));
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  // ---------------------------------------------------------------- the coach
  async function coach(role, db) {
    const tag = `${role}, ${db === 'there' ? 'with 051' : 'device only'}`;
    const t = await coachPage({ role, db, tag });
    const { page, go, rowsNow } = t;
    const count = async (table, test = () => true) => (await rowsNow(table)).filter(test).length;
    const book = async () => { await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 1100); };

    // ---- one call, anchored to the client's own zone
    await go('/coach/calendar/book');
    pass(`${tag}: Book a call is a side panel over the calendar`, (await dialog(page).locator('.ds-dialog-title').textContent()) === 'Book a call' && (await page.locator('.cc-cal, .ds-cal').count()) === 1);
    await book();
    pass(`${tag}: its button is never greyed out, and says what is missing`, (await dialog(page).locator('.cc-problem').textContent().catch(() => '')) === 'Choose who it’s with to carry on.');
    await pick(dialog(page), page, 'Who is it with', 'Jordan Reyes');
    pass(`${tag}: the length is the agreement's, and says so`, /is suggested, from Jordan’s agreement\./.test(await dialog(page).textContent()) || (await dialog(page).getByRole('radio', { name: '60 minutes' }).getAttribute('aria-checked')) === 'true');
    const first = dialog(page).locator('.ds-answer').first();
    pass(`${tag}: each suggested time gives the client's own clock, 12-hour for the US`, /\d{1,2}:\d{2} (am|pm) for Jordan in Chicago/.test(await first.textContent()), await first.textContent());
    await first.click(); await settle(page, 400);
    pass(`${tag}: both clocks show under the chosen time`, /UK time · \d{1,2}:\d{2} (am|pm) Chicago time/.test(await dialog(page).locator('.cc-book-both-clocks').textContent().catch(() => '')));
    const before = { items: await count('coach_cal_items'), sessions: await count('coach_sessions') };
    await book();
    const said = await toast(page);
    const items = await rowsNow('coach_cal_items');
    const made = items.filter((i) => i.title === 'Jordan Reyes' && i.id !== CAL.jordanTue).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    pass(`${tag}: booking makes the calendar item and its session together`, said.startsWith('Booked') && (await count('coach_cal_items')) === before.items + 1 && (await count('coach_sessions')) === before.sessions + 1 && Boolean(made?.session_id), said);
    pass(`${tag}: the call is anchored to the client's zone, on a quarter hour there`, made?.time_zone === 'America/Chicago' && onQuarterHour(made.starts_at, 'America/Chicago'), `${made?.time_zone} ${made?.starts_at}`);
    pass(`${tag}: the panel closes on the calendar`, (await page.locator('.ds-modal--shown').count()) === 0 && /\/coach\/calendar(\?|$)/.test(page.url()));

    // ---- a series: a rule in the client's zone
    await go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Jordan Reyes');
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    await pick(dialog(page), page, 'How often', 'Every 2 weeks');
    for (let i = 0; i < 3; i += 1) await press(dialog(page), page, 'Fewer calls');
    pass(`${tag}: a series' button counts its calls`, (await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').textContent()) === 'Book 3 calls');
    const clashes = await dialog(page).locator('.cc-book-clash').count();
    const was = await count('coach_cal_items', (i) => i.title === 'Jordan Reyes');
    if (clashes === 0) {
      await book();
      const series = (await rowsNow('coach_cal_items')).filter((i) => i.title === 'Jordan Reyes').sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).slice(-3);
      const clocks = new Set(series.map((i) => wallClock(i.starts_at, 'America/Chicago').time));
      pass(`${tag}: a series is one call each, at the same time for the client every 2 weeks`, (await count('coach_cal_items', (i) => i.title === 'Jordan Reyes')) === was + 3 && clocks.size === 1 && series.every((i) => i.session_id), [...clocks].join(','));
    } else {
      pass(`${tag}: a call of the series that clashes is said, with another time to choose`, /clashes with/.test(await dialog(page).locator('.cc-book-clash').first().textContent()));
    }

    // ---- a three-way: anchored to the booker's zone, with its guests
    await go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Sam Okafor');
    await pick(dialog(page), page, 'What kind of session', 'Three-way meeting');
    await dialog(page).getByLabel('Who’s invited?').fill('Dana Whitfield <dana@example.invalid>; Paul Garner <paul@example.invalid>, dana@example.invalid');
    await settle(page, 300);
    const three = await dialog(page).textContent();
    pass(`${tag}: pasted guests are read, with the count and the duplicate taken out`, /2 people to invite\./.test(three) && /1 duplicate was taken out\./.test(three));
    pass(`${tag}: a three-way says the zone it is anchored to`, /It’s anchored to UK time, where you’re booking it\./.test(three));
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    const guestsWas = await count('coach_cal_guests');
    await book();
    const threeItem = (await rowsNow('coach_cal_items')).filter((i) => i.title === 'Sam Okafor').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const threeSession = (await rowsNow('coach_sessions')).find((s) => s.id === threeItem?.session_id);
    pass(`${tag}: a three-way is booked with its guests and its own kind of session`, threeItem?.time_zone === LON && (await count('coach_cal_guests')) === guestsWas + 2 && threeSession?.kind === 'three_way', `${threeItem?.time_zone} ${threeSession?.kind}`);

    // ---- a group
    await go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Kestrel leadership team');
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    await book();
    const groupItem = (await rowsNow('coach_cal_items')).filter((i) => i.group_id === ID.group).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const groupSession = (await rowsNow('coach_sessions')).find((s) => s.id === groupItem?.session_id);
    pass(`${tag}: a group's call is the group's own session`, Boolean(groupSession) && groupSession.group_id === ID.group && !groupSession.profile_id);

    // ---- in person, with travel time either side
    await go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Leo Grant');
    await dialog(page).getByRole('radio', { name: 'In person' }).click(); await settle(page, 300);
    await dialog(page).locator('.ds-answer').first().click(); await settle(page, 300);
    await book();
    pass(`${tag}: in person asks where it is`, (await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'Type where it is to carry on.');
    await dialog(page).getByLabel('Where is it?').fill('Northfield Logistics, Leeds');
    await pick(dialog(page), page, 'Travel time each way', '30 minutes');
    const travelWas = await count('coach_cal_items', (i) => i.kind === 'travel');
    await book();
    const leo = (await rowsNow('coach_cal_items')).filter((i) => i.title === 'Leo Grant' && i.id !== CAL.leoThu).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const travel = (await rowsNow('coach_cal_items')).filter((i) => i.travel_for === leo?.id);
    pass(`${tag}: travel time is blocked either side of a call in person`, (await count('coach_cal_items', (i) => i.kind === 'travel')) === travelWas + 2 && travel.length === 2 && travel.some((x) => x.ends_at === leo.starts_at) && travel.some((x) => x.starts_at === leo.ends_at));

    // ---- a typed time that overlaps something is refused, calmly
    await go('/coach/calendar/book');
    await pick(dialog(page), page, 'Who is it with', 'Priya Nair');
    await press(dialog(page), page, 'Choose my own time');
    await dialog(page).getByLabel('Starts').fill('12:45');
    await settle(page, 300);
    const overWas = await count('coach_cal_items');
    await book();
    pass(`${tag}: a call over something busy is refused, and nothing is saved`, /^That overlaps .+\. Choose another time\.$/.test((await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => '')) || '') && (await count('coach_cal_items')) === overWas, await dialog(page).locator('.cc-problem[role=alert]').textContent().catch(() => ''));
    await press(dialog(page), page, 'Make a single-use link instead');

    // ---- a single-use link
    pass(`${tag}: “Make a single-use link instead” opens the link's panel, for that client`, (await dialog(page).locator('.ds-dialog-title').textContent()) === 'Single-use link' && (await dialog(page).getByLabel('Who is it for?').inputValue()) === 'Priya Nair');
    const linksWas = await count('coach_booking_links');
    await press(dialog(page), page, 'Create the link');
    const link = (await rowsNow('coach_booking_links')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const shownLink = await dialog(page).getByLabel('The link', { exact: true }).inputValue().catch(() => '');
    pass(`${tag}: Create the link saves it and shows its own address`, (await count('coach_booking_links')) === linksWas + 1 && shownLink === `${APP}/book/link/${link.key}` && link.for_name === 'Priya Nair' && !link.used_at, `${await count('coach_booking_links')} of ${linksWas + 1}, for ${link?.for_name}, shown ${shownLink.replace(/[0-9a-f-]{36}/, '<key>') || 'nothing'}`);
    pass(`${tag}: it says the link works once`, /It works once/.test(await dialog(page).textContent()));
    await page.keyboard.press('Escape'); await settle(page, 500);

    // ---- Offer times by email: picked on the calendar, written in the reader's zone, nothing sent
    await go('/coach/calendar/offer');
    await clickAt(page, '2026-11-18', 16 * 60 + 10);
    await clickAt(page, '2026-11-20', 10 * 60 + 10);
    pass(`${tag}: free times are picked on the calendar itself`, (await page.locator('.cc-pickbar-count').textContent()) === '2 picked' && (await page.locator('[data-cal-key^="pick:"]').count()) === 2);
    await clickAt(page, '2026-11-18', 10 * 60 + 20);
    pass(`${tag}: a busy time can't be offered`, /^That overlaps .+\. Pick a free time\.$/.test(await toast(page)), await toast(page));
    await pick(page.locator('.cc-pickbar'), page, 'Their time zone', 'New York');
    const mail = decodeURIComponent((await page.locator('.cc-pickbar a.ds-link').getAttribute('href')) || '');
    pass(`${tag}: the drafted email gives the times in the reader's own zone, 12-hour, days in words`, /^mailto:\?subject=/.test(mail) && /They are in New York time\./.test(mail) && /Wed 18 Nov, 11:00 am/.test(mail) && /Fri 20 Nov, 5:00 am/.test(mail), mail.slice(0, 200));
    await press(page.locator('.cc-pickbar'), page, 'Copy');
    pass(`${tag}: Copy says what was copied, and nothing is held`, /^(Copied 2 times in New York time\.|That didn’t copy)/.test(await toast(page)) && (await count('coach_cal_items', (i) => i.kind === 'hold')) === 3, await toast(page));
    await press(page.locator('.cc-pickbar'), page, 'Cancel');
    pass(`${tag}: Cancel goes back to the calendar`, (await page.locator('.cc-pickbar').count()) === 0 && /\/coach\/calendar(\?|$)/.test(page.url()));

    // ---- a poll: its details, 2 to 5 times picked, held as dashed tiles, then confirmed
    await go('/coach/calendar/polls/new');
    await press(dialog(page), page, 'Pick the times');
    pass(`${tag}: a poll needs to know what it's for`, (await dialog(page).locator('.cc-problem').textContent().catch(() => '')) === 'Type what it’s for to carry on.');
    await dialog(page).getByLabel('What’s it for?').fill('Sponsor review');
    await dialog(page).getByLabel('Who’s invited?').fill('Dana Whitfield <dana@example.invalid>, Ruth Adeyemi <ruth@example.invalid>');
    await press(dialog(page), page, 'Pick the times');
    pass(`${tag}: the calendar asks for 2 to 5 times`, (await page.locator('.cc-pickbar-count').textContent()) === 'Pick 2 to 5 times');
    await clickAt(page, '2026-11-18', 16 * 60 + 10);
    await press(page.locator('.cc-pickbar'), page, 'Make the poll');
    pass(`${tag}: one time isn't a poll`, (await toast(page)) === 'Pick at least 2 times.');
    await clickAt(page, '2026-11-20', 10 * 60 + 10);
    const holdsWas = await count('coach_cal_items', (i) => i.kind === 'hold');
    await press(page.locator('.cc-pickbar'), page, 'Make the poll');
    await settle(page, 900);
    const poll = (await rowsNow('coach_polls')).find((p) => p.title === 'Sponsor review');
    pass(`${tag}: the poll is made: its people each with their own key, its times held`, Boolean(poll) && (await count('coach_poll_people', (p) => p.poll_id === poll.id && p.vote_key)) === 2 && (await count('coach_poll_options', (o) => o.poll_id === poll.id)) === 2 && (await count('coach_cal_items', (i) => i.kind === 'hold')) === holdsWas + 2);
    pass(`${tag}: it opens the poll's own page`, page.url().endsWith(`/coach/calendar/polls/${poll?.id}`) && (await page.locator('.ds-page-title').textContent()) === 'Sponsor review' && (await page.locator('.cc-poll-page').innerText()).includes('Dana Whitfield and Ruth Adeyemi')); // what it is for is the title, the people under it, as M11 draws a poll (the UI tester, 20 Nov)
    const dana = (await rowsNow('coach_poll_people')).find((p) => p.poll_id === poll.id && p.name === 'Dana Whitfield');
    const href = decodeURIComponent((await page.getByRole('link', { name: 'Open the note to Dana in my email' }).getAttribute('href')) || '');
    pass(`${tag}: each person's note is drafted with their own link, and opens the coach's own email`, href.startsWith('mailto:dana@example.invalid?') && href.includes(`${APP}/poll/${dana.vote_key}`), href.slice(0, 80).replace(/[\w.]+@[\w.]+/, '<email>'));

    if (t.there) {
      // Dana and Ruth answer on their own pages, signed out, in the same database.
      const gctx = await browser.newContext({ viewport: { width: 400, height: 860 }, serviceWorkers: 'block', colorScheme: 'light' });
      const guest = await gctx.newPage();
      await guest.clock.setFixedTime(TUE);
      await guestStandIn(guest, t.store);
      await guest.goto(`${APP}/poll/${dana.vote_key}`);
      await guest.waitForSelector('.cc-public', { timeout: 20000 }); await settle(guest, 900);
      pass(`${tag}: a person asked sees the poll's times, and nothing of the calendar`, (await guest.getByRole('checkbox').count()) === 2 && !/Training|Sam Okafor/.test(await guest.locator('.cc-public').textContent()));
      await guest.getByRole('checkbox').first().click();
      await guest.getByRole('button', { name: 'Send my answers', exact: true }).click(); await settle(guest, 700);
      pass(`${tag}: their answers are saved by the database's own function`, /Your answers are in/.test(await guest.locator('.cc-public').textContent()) && t.store.rows.coach_poll_votes.filter((v) => v.person_id === dana.id).length === 2);
      await gctx.close();
      await page.reload(); await page.waitForSelector('.cc-poll-row', { timeout: 20000 }); await settle(page, 1200);
      pass(`${tag}: the coach sees who can make each time`, /Dana can\b/.test(await page.locator('.cc-poll-rows').first().textContent()) && /Dana can’t/.test(await page.locator('.cc-poll-rows').first().textContent()));
    }
    await page.getByRole('button', { name: /^Confirm / }).first().click(); await settle(page, 1100);
    const done = (await rowsNow('coach_polls')).find((p) => p.id === poll.id);
    pass(`${tag}: Confirm makes the call and frees the other time at once`, done.status === 'confirmed' && (await count('coach_cal_items', (i) => i.kind === 'hold')) === holdsWas && (await count('coach_cal_items', (i) => i.id === done.confirmed_item_id && i.kind !== 'hold' && i.title === 'Sponsor review')) === 1, await toast(page));

    // ---- Open for calls
    await go('/coach/calendar/open');
    pass(`${tag}: Open for calls opens on the week with open times, outlined in mint`, (await page.locator('.cc-cal-range').textContent()) === '23 to 27 Nov' && (await page.locator('.cc-cal-tile--open').count()) >= 3);
    const mint = await page.locator('.cc-cal-tile--open').first().evaluate((el) => { const s = getComputedStyle(el); return { edge: s.borderTopColor, coral: getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--coral').trim() }; });
    pass(`${tag}: never coral`, !/255, 111, 92/.test(mint.edge), mint.edge);
    const openWas = await count('coach_open_blocks');
    await dragOn(page, '2026-11-24', 19 * 60, 20 * 60);
    const wed = (await rowsNow('coach_open_blocks')).find((b) => b.starts_at === at('2026-11-24', '19:00'));
    pass(`${tag}: dragging on a free time makes an open block`, (await count('coach_open_blocks')) === openWas + 1 && wed?.ends_at === at('2026-11-24', '20:00'), await toast(page));
    await dragOn(page, '2026-11-24', 20 * 60, 20 * 60 + 45);
    const joined = (await rowsNow('coach_open_blocks')).find((b) => b.starts_at === at('2026-11-24', '19:00'));
    pass(`${tag}: a block that touches another joins it into one`, (await count('coach_open_blocks')) === openWas + 1 && joined?.ends_at === at('2026-11-24', '20:45'), joined?.ends_at);
    await dragOn(page, '2026-11-23', 10 * 60, 11 * 60);
    pass(`${tag}: a block never sits over something busy`, /^That overlaps Training\.$/.test(await toast(page)) && (await count('coach_open_blocks')) === openWas + 1, await toast(page));
    await press(page, page, 'Add open time');
    await dialog(page).getByLabel('From').fill('09:10');
    await dialog(page).locator('.ds-dialog-foot .ds-btn--primary').click(); await settle(page, 400);
    pass(`${tag}: a typed open time keeps to quarter hours`, (await dialog(page).locator('.cc-problem').textContent().catch(() => '')) === 'Open times start and end on a quarter hour.');
    await page.keyboard.press('Escape'); await settle(page, 500);
    await page.getByRole('button', { name: 'Next week' }).click(); await settle(page, 700);
    const nextWas = await count('coach_open_blocks');
    await press(page, page, 'Copy last week');
    const copied = (await rowsNow('coach_open_blocks')).filter((b) => b.starts_at >= at('2026-11-30', '00:00') && b.starts_at < at('2026-12-07', '00:00'));
    pass(`${tag}: Copy last week brings last week's blocks to this one, at the same clock times`, /^Copied from last week/.test(await toast(page)) && (await count('coach_open_blocks')) > nextWas && copied.some((b) => b.starts_at === at('2026-11-30', '14:00') && b.ends_at === at('2026-11-30', '16:00')), `${await toast(page)} ${copied.length}`);

    // ---- Settings, Booking: the limits are number editors
    await go('/coach/settings/booking');
    await press(page, page, 'Edit Gap between calls');
    await page.locator('.cc-setrow--edit').getByRole('button', { name: /more/i }).first().click(); await settle(page, 200);
    await press(page.locator('.cc-setrow--edit'), page, 'Save');
    const settings = (await rowsNow('coach_settings'))[0];
    pass(`${tag}: a limit is saved as a number`, settings?.booking?.gap === 20 && /20 minutes/.test(await page.locator('.cc-setrow', { hasText: 'Gap between calls' }).textContent()), JSON.stringify(settings?.booking?.gap));
    pass(`${tag}: each call type has its own page and link`, (await page.locator('.cc-setrow', { hasText: 'Discovery call page' }).count()) === 1 && (await page.locator('.cc-setrow', { hasText: 'Connection Call page' }).count()) === 1 && /open/.test(await page.locator('.cc-setrow', { hasText: 'Single-use links' }).textContent()));
    await t.done();
  }

  // ---------------------------------------------------------------- guests, signed out, in the coach's own (stand-in) database
  const guestPage = async (store, { size = 1440, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: size === 400 ? { width: 400, height: 860 } : { width: 1440, height: 1200 }, serviceWorkers: 'block', colorScheme: theme, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.clock.setFixedTime(TUE);
    await guestStandIn(page, store);
    const open = async (path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-public', { timeout: 20000 }); await settle(page, 1000); };
    return { page, ctx, errors, open, words: () => page.locator('.cc-public').textContent() };
  };

  // Polish 1 (25 Nov; the example's booking page): the time zone sits behind "Change the time zone" under the times,
  // and a chosen time goes on with Continue to Your details (two screens), as the example draws.
  const zoneTo = async (page, city) => {
    const link = page.getByRole('button', { name: 'Change the time zone', exact: true });
    if (await link.count()) { await link.click(); await settle(page, 300); }
    await pick(page, page, 'Your time zone', city);
  };
  const carryOn = async (page) => { await page.locator('.cc-book-go').first().click(); await settle(page, 500); };

  async function guests(role) {
    const tag = `a guest (${role}'s pages)`;
    const t = await coachPage({ role, db: 'there', tag: `${tag}, the coach`, holiday: true });
    const store = t.store;
    const before = { items: store.rows.coach_cal_items.length, bookings: store.rows.coach_bookings.length, leads: store.rows.coach_leads.length };

    // ---- a Discovery call, end to end
    const a = await guestPage(store);
    await a.open(`/book/${CAL.chemKey}`);
    const start = await a.words();
    pass(`${tag}: the Discovery call page shows its own call only, with the coach's full name above the title only when it's set (never "With …")`, /Discovery call/.test(start) && !/Connection Call/.test(start) && /30-minute call on Zoom/.test(start) && !/With Alex|With Maya/.test(start) && /Alex Morgan|Maya Collins/i.test(start));
    pass(`${tag}: it never shows the calendar`, !/Training|Sam Okafor|Dentist|Swimming/.test(start));
    await zoneTo(a.page, 'New York');
    const firstTime = a.page.locator('.cc-book-time').first();
    pass(`${tag}: times are in the visitor's own zone, 12-hour for the US, with the city's name`, /^\d{1,2}:\d{2} (am|pm)$/.test((await firstTime.textContent()).trim()) && /New York time/.test(await a.page.locator('.cc-book-times').getAttribute('aria-label')));
    await firstTime.click(); await settle(a.page, 400);
    await carryOn(a.page);
    pass(`${tag}: both clocks show once a time is chosen`, /am New York time · \d{2}:\d{2} UK time/.test(await a.page.locator('.cc-book-when').textContent()));
    await a.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(a.page, 300);
    pass(`${tag}: the button is never greyed out: it asks for a name`, (await a.page.locator('.cc-book-form .cc-problem').first().textContent()) === 'Type your name to carry on.');
    await a.page.getByLabel('Your name').fill('Grace Liu');
    await a.page.getByLabel('Your email').fill('grace@example.invalid');
    await a.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(a.page, 300);
    pass(`${tag}: a question that is needed is asked for`, (await a.page.locator('.cc-book-form .cc-problem').first().textContent()) === 'Answer this one to carry on.');
    await a.page.getByLabel('What would you like from the call?').fill('To think through a new role.');
    await a.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(a.page, 1000);
    const booking = store.rows.coach_bookings.find((b) => b.name === 'Grace Liu');
    const item = store.rows.coach_cal_items.find((i) => i.id === booking?.item_id);
    pass(`${tag}: booking makes the item, the booking and the lead`, /You’re booked for Mon 23 Nov, \d{1,2}:\d{2} am New York time\./.test(await a.words()) && store.rows.coach_cal_items.length === before.items + 1 && store.rows.coach_bookings.length === before.bookings + 1 && store.rows.coach_leads.length === before.leads + 1 && item?.kind === 'chemistry', await a.words());
    pass(`${tag}: the booking is anchored to the guest's own zone, on a quarter hour there`, booking?.time_zone === NY && item?.time_zone === NY && onQuarterHour(booking.starts_at, NY));
    pass(`${tag}: the lead is kept for run 4`, store.rows.coach_leads.some((l) => l.booking_id === booking.id && l.source === 'chemistry_page' && l.status === 'new'));
    pass(`${tag}: the page's address becomes the guest's own link`, a.page.url() === `${APP}/book/mine/${booking.guest_key}`);
    pass(`${tag}: a confirmation is asked of the server with the guest's key only, and none is claimed sent on a preview`, store.calls.includes('api /api/booking-email') && !/confirmation is on its way/.test(await a.words()));
    const [download] = await Promise.all([a.page.waitForEvent('download', { timeout: 8000 }), a.page.getByRole('button', { name: 'Add to calendar', exact: true }).click()]);
    const stream = await download.createReadStream();
    let ics = ''; for await (const chunk of stream) ics += chunk;
    const stamp = new Date(booking.starts_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    pass(`${tag}: Add to calendar is an .ics file made in the page, at the booked moment`, download.suggestedFilename().endsWith('.ics') && ics.includes(`DTSTART:${stamp}`) && ics.includes('SUMMARY:Discovery call with'), download.suggestedFilename());

    // ---- two guests racing for one time
    const b = await guestPage(store);
    const c = await guestPage(store, { theme: 'dark' });
    for (const g of [b, c]) { await g.open(`/book/${CAL.chemKey}`); await g.page.locator('.cc-book-time').first().click(); await settle(g.page, 300); await carryOn(g.page); await g.page.getByLabel('What would you like from the call?').fill('A first conversation.'); }
    const same = (await b.page.locator('.cc-book-when').textContent()) === (await c.page.locator('.cc-book-when').textContent());
    await b.page.getByLabel('Your name').fill('Owen Hart'); await b.page.getByLabel('Your email').fill('owen@example.invalid');
    await c.page.getByLabel('Your name').fill('Ines Duarte'); await c.page.getByLabel('Your email').fill('ines@example.invalid');
    await b.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(b.page, 900);
    await c.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(c.page, 900);
    pass(`${tag}: two guests choose the same time, and one gets it`, same && /You’re booked/.test(await b.words()) && store.rows.coach_bookings.filter((x) => ['Owen Hart', 'Ines Duarte'].includes(x.name)).length === 1);
    pass(`${tag}: the other is told calmly, and offered the times again`, (await c.page.locator('.cc-problem[role=alert]').textContent().catch(() => '')) === 'That time has just been taken. Choose another.' && (await c.page.locator('.cc-book-time').count()) > 0, await c.page.locator('.cc-problem').first().textContent().catch(() => ''));
    await b.ctx.close(); await c.ctx.close();

    // ---- moving it, from the guest's own link
    await a.open(`/book/mine/${booking.guest_key}`);
    pass(`${tag}: the guest's own page shows their call in their own time`, /Your call is on Mon 23 Nov, \d{1,2}:\d{2} am New York time\./.test(await a.words()));
    await a.page.getByRole('button', { name: 'Move it', exact: true }).click(); await settle(a.page, 900);
    const was = booking.starts_at;
    await a.page.locator('.cc-book-time').last().click(); await settle(a.page, 300);
    await a.page.locator('.cc-book-move .ds-btn--primary').click(); await settle(a.page, 1000);
    pass(`${tag}: moving it moves the booking and its calendar item together`, booking.starts_at !== was && item.starts_at === booking.starts_at && booking.moved_from === was && /Moved\./.test(await a.words()), `${was} to ${booking.starts_at}`);
    await a.page.getByRole('button', { name: 'Cancel it', exact: true }).click(); await settle(a.page, 300);
    await a.page.getByRole('button', { name: 'Keep my call', exact: true }).click(); await settle(a.page, 300);
    pass(`${tag}: Cancel it asks first, and Keep my call keeps it`, booking.status === 'booked');

    // ---- early and late times, and a public holiday said first
    await a.open(`/book/${CAL.connKey}`);
    pass(`${tag}: the Connection Call page never shows the Discovery call`, /Connection Call/.test(await a.words()) && !/Discovery call/.test(await a.words()));
    await zoneTo(a.page, 'Sydney');
    const hiddenFirst = await a.page.locator('.cc-book-time').allTextContents();
    await a.page.getByRole('button', { name: 'Show early and late times', exact: true }).click(); await settle(a.page, 400);
    const every = await a.page.locator('.ds-cal-day:not(:disabled), .cc-book-time').count();
    pass(`${tag}: only 07:00 to 20:00 the visitor's time shows until they ask for early and late times`, hiddenFirst.every((x) => { const [h] = x.trim().split(':').map(Number); return h >= 7 && h < 20; }) && every > 0 && (await a.page.getByRole('button', { name: 'Hide early and late times', exact: true }).count()) === 1);
    await a.open(`/book/${CAL.chemKey}`);
    await zoneTo(a.page, 'New York');
    const thu = a.page.getByRole('button', { name: /^Thursday 26 November/ });
    if (await thu.count() && await thu.isEnabled()) {
      await thu.click(); await settle(a.page, 300);
      await a.page.locator('.cc-book-time').first().click(); await settle(a.page, 300);
      await carryOn(a.page); await settle(a.page, 600);
      pass(`${tag}: a public holiday where the visitor is says so before they book`, /That’s Thanksgiving in the US\./.test(await a.words()), (await a.words()).slice(0, 300));
    } else pass(`${tag}: Thanksgiving's free time is offered`, false, 'Thu 26 is not among the days');

    // ---- a single-use link, used twice
    await a.open(`/book/link/${CAL.linkDanaKey}`);
    pass(`${tag}: a single-use link opens with who it is for`, (await a.page.getByLabel('Your name').count()) === 0 && /Sponsor call/.test(await a.words()));
    await a.page.locator('.cc-book-time').first().click(); await settle(a.page, 300);
    await carryOn(a.page);
    pass(`${tag}: its name is already filled in`, (await a.page.getByLabel('Your name').inputValue()) === 'Dana Whitfield');
    await a.page.getByLabel('Your email').fill('dana@example.invalid');
    await a.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(a.page, 1000);
    pass(`${tag}: it books once`, /You’re booked/.test(await a.words()) && Boolean(store.rows.coach_booking_links.find((l) => l.id === CAL.linkDana).used_at));
    const d = await guestPage(store);
    await d.open(`/book/link/${CAL.linkDanaKey}`);
    pass(`${tag}: the second time it says it has been used`, /This link has already been used\. Ask for a new one\./.test(await d.words()) && (await d.page.locator('.cc-book-time').count()) === 0);
    await d.open('/book/00000000-0000-4000-8000-00000000dead');
    pass(`${tag}: a key nobody has opens nothing`, /This link isn’t working\. Ask for a new one\./.test(await d.words()));

    // ---- before 051: one calm line, on every outside page
    store.there = false;
    for (const [path, title] of [[`/book/${CAL.chemKey}`, 'a booking page'], [`/book/mine/${booking.guest_key}`, 'a guest’s own booking'], [`/poll/${CAL.pollMiaKey}`, 'a poll']]) {
      await d.open(path);
      pass(`${tag}: before 051, ${title} says one calm line`, /Booking isn’t open yet\. Try again soon\./.test(await d.words()));
    }
    store.there = true;
    pass(`${tag}: no page error on a guest's pages`, a.errors.length + d.errors.length === 0, [...a.errors, ...d.errors].slice(0, 2).join(' | '));
    pass(`${tag}: nothing but 051's functions was asked, and no write was tried`, (store.blocked || []).length === 0, (store.blocked || []).slice(0, 3).join(', '));
    await a.ctx.close(); await d.ctx.close();

    // The coach's own calendar now holds the booking, as the call it is.
    await t.go(`/coach/calendar?view=day&day=${wallClock(booking.starts_at, LON).date}`);
    pass(`${tag}: the coach's calendar shows the booked call in mint, with the guest's own time`, (await t.page.locator('.cc-cal-tile--chemistry', { hasText: 'Grace Liu' }).count()) === 1);
    await t.done();
  }

  // ---------------------------------------------------------------- the client's own sessions
  async function client() {
    const tag = 'the client';
    const ctx = await clientContext(browser, { size: 1440, theme: 'light' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    const held = { data: fromCoach() };
    const proxy = new Proxy({}, { get: (_, k) => held.data[k], set: (_, k, v) => { held.data[k] = v; return true; } });
    const stood = await clientStandIn(page, proxy);
    const open = async () => { await page.goto(`${APP}/coaching`); await page.waitForSelector('.coaching-page', { timeout: 20000 }); await clearCoaching(page); await page.reload(); await page.waitForSelector('.coaching-page', { timeout: 20000 }); await settle(page, 1500); };
    await open();
    const section = page.locator('.coaching-section', { hasText: 'Your sessions' });
    pass(`${tag}: their sessions to come show in their own time, with its city's name`, (await section.locator('.coaching-session').count()) === 2 && / time, 1 hour/.test(await section.locator('.coaching-session').first().textContent()));
    const soon = held.data.sessions[0].starts_at;
    await section.getByRole('button', { name: /^Move the session/ }).first().click(); await settle(page, 900);
    pass(`${tag}: moving one inside 24 hours says first that it uses a session`, /This session is in under 24 hours, so moving it uses one of your sessions\./.test(await section.textContent()) && (await section.getByRole('button', { name: 'Keep my session', exact: true }).count()) === 1);
    await section.getByRole('button', { name: 'Move it anyway', exact: true }).click(); await settle(page, 400);
    pass(`${tag}: its button is never greyed out: it asks for a time`, (await section.locator('.coaching-problem').textContent().catch(() => '')) === 'Choose a time to carry on.');
    await section.locator('.coaching-times .ds-answer').first().click(); await settle(page, 300);
    await section.getByRole('button', { name: 'Move it anyway', exact: true }).click(); await settle(page, 1000);
    const moved = stood.calls.find((c) => c.startsWith('my_session_move'));
    pass(`${tag}: the move goes through the database's own function, agreed as late`, Boolean(moved) && /"p_late_ok":true/.test(moved) && held.data.sessions.every((s) => s.starts_at !== soon), moved);
    await section.getByRole('button', { name: 'Book a session', exact: true }).click(); await settle(page, 900);
    await section.locator('.coaching-times .ds-answer').first().click(); await settle(page, 300);
    await section.locator('.coaching-book .ds-btn--outline').first().click(); await settle(page, 1000);
    pass(`${tag}: a session is booked from the coach's free times`, held.data.sessions.length === 3 && (await section.locator('.coaching-session').count()) === 3, String(held.data.sessions.length));
    await section.getByRole('button', { name: /^Cancel the session/ }).last().click(); await settle(page, 400);
    await section.getByRole('button', { name: 'Cancel my session', exact: true }).click(); await settle(page, 1000);
    pass(`${tag}: one with more than 24 hours' notice is cancelled`, held.data.sessions.length === 2 && stood.calls.some((c) => c.startsWith('my_session_cancel')));
    held.data = { ...fromCoach(), sessions: undefined };
    await open();
    pass(`${tag}: before 051 the section says one calm line`, /Booking isn’t open yet\. Try again soon\./.test(await page.locator('.coaching-section', { hasText: 'Your sessions' }).textContent()));
    const stray = stood.blocked.filter((b) => !/person_settings/.test(b));
    pass(`${tag}: no page error, and no write left the page`, errors.length === 0 && stray.length === 0, [...errors, ...stray].slice(0, 3).join(' | '));
    await clearCoaching(page, { after: true });
    await ctx.close();
  }

  try {
    if (parts.includes('coach')) for (const role of roles) for (const db of dbs) await coach(role, db);
    if (parts.includes('guest')) for (const role of roles) await guests(role);
    if (parts.includes('client')) await client();
  } finally {
    await browser.close();
    seedClock(null);
  }
  report.done();
}

run().catch((e) => { console.error(String(e).split('\n').slice(0, 6).join('\n')); process.exit(1); });
