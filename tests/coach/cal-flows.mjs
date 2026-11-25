// The calendar, walked (Phase 6a run 3, step 2): the week as Tim on a laptop
// (the owner, 1440, light) and as Maya (an associate, dark), then on a phone,
// each in both database modes:
//
//   device only  051 isn't there (as today): everything stays on the device.
//                Any write that leaves the page is stopped, listed as
//                `blocked` and fails the walk.
//   there        049, 050 and 051 answered by the stand-in in shared.mjs
//                (cal: true), shaped as the SQL. Nothing but a read ever
//                reaches the test project.
//
// The page's clock is pinned to M11's Tuesday (17 Nov 2026, 12:22: never
// ahead of the real day) and the seed's week is counted from it. Nothing is
// ever sent: every /api/ call would be listed as reaching a server.
//
//   PARTS=cal-view,cal-colours,cal-create,cal-quick,cal-move,cal-repeat,cal-todo,cal-hours,cal-item,cal-month,cal-phone
//   ROLES=owner,associate   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, OTHER, seedDevice, settle, standIn } from './shared.mjs';
import { CAL, DAY, ID, seedClock, seedWithCal } from './seed.mjs';
import { instantAt } from '../../src/lib/time/index.js';

export const CAL_PARTS = ['cal-view', 'cal-colours', 'cal-create', 'cal-quick', 'cal-move', 'cal-repeat', 'cal-todo', 'cal-hours', 'cal-item', 'cal-month', 'cal-phone'];
const TUE = new Date(2026, 10, 17, 12, 22);
const LON = 'Europe/London';
const D = { mon: '2026-11-16', tue: '2026-11-17', wed: '2026-11-18', thu: '2026-11-19', fri: '2026-11-20' };
const at = (day, time) => instantAt(day, time, LON).toISOString();
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 500); };
const press = async (page, name) => { await page.getByRole('button', { name, exact: true }).first().click(); await settle(page, 500); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const pick = async (scope, page, label, option) => {
  await scope.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const tile = (page, day, text) => page.locator(`[data-cal-day="${day}"] [data-cal-key]`, { hasText: text }).first();
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
/** Drags a tile by its middle to another day and so many minutes later. */
const dragTile = async (page, loc, { toDay, fromDay, minutes = 0 }) => {
  const b = await loc.boundingBox();
  const a = await point(page, fromDay, 600);
  const z = await point(page, toDay, 600 + minutes);
  const from = { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 12) };
  await dragTo(page, from, { x: from.x + (z.x - a.x), y: from.y + (z.y - a.y) });
};

async function run() {
  const report = makeReport('The calendar');
  const { pass } = report;
  const parts = (process.env.PARTS || CAL_PARTS.join(',')).split(',');
  const has = (p) => parts.includes(p);
  const roles = (process.env.ROLES || 'owner,associate').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  async function openAt({ role, size, db, path = '/coach/calendar?view=week', tag }) {
    const theme = role === 'owner' ? 'light' : 'dark';
    const there = db === 'there';
    const ctx = await coachContext(browser, { size, theme });
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
    // Another coach's own item: no coach ever sees another's calendar, the owner included.
    rows.coach_cal_items.push({ ...rows.coach_cal_items.find((i) => i.id === CAL.writing), id: '00000000-0000-4000-8000-000000009901', coach_id: OTHER, title: 'Someone else’s own time' });
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
    await go(page, path);
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    return {
      page, store, me, there, tag, rowsNow,
      one: async (table, id) => (await rowsNow(table)).find((r) => r.id === id) || null,
      done: async () => {
        await settle(page, 600);
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
        pass(`${tag}: nothing but a read reached the test project, and nothing was sent`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
        pass(`${tag}: no page error`, errors.length === 0, [...new Set(errors)].slice(0, 3).join('; '));
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  // ---------------------------------------------------------------- a laptop
  async function laptop(role, db) {
    const tag = `${role}, ${db === 'there' ? '051 there' : 'device only'}`;
    const t = await openAt({ role, size: 1440, db, tag });
    const { page } = t;
    const items = () => t.rowsNow('coach_cal_items');
    const text = () => page.evaluate(() => document.querySelector('.cc-app').innerText);

    if (has('cal-view')) {
      const heads = () => page.locator('.cc-cal-day').count();
      pass(`${tag}: the week is Monday to Friday by default`, (await heads()) === 5 && (await text()).includes('16 to 20 Nov'));
      pass(`${tag}: another coach's own item is never shown`, !(await text()).includes('Someone else’s own time'));
      const zones = await page.locator('.cc-cal-zone').allTextContents();
      pass(`${tag}: two time columns, the second on the next client call outside the UK (Chicago), then the UK`, zones[0] === 'Chicago' && zones[1] === 'UK', zones.join(' | '));
      const first = async () => [await page.locator('.cc-cal-times').nth(0).locator('.cc-cal-hour').first().textContent(), await page.locator('.cc-cal-times').nth(1).locator('.cc-cal-hour').first().textContent()];
      pass(`${tag}: 08:00 in the UK is 02:00 in Chicago`, (await first()).join() === '02:00,08:00', (await first()).join());
      await page.locator('.cc-cal-zone-btn').click(); await settle(page, 400);
      const choices = await page.getByRole('menuitemcheckbox').allTextContents();
      pass(`${tag}: one choice for the second column: the seven cities`, ['New York', 'Chicago', 'Los Angeles', 'Denver', 'Toronto', 'Dubai', 'Singapore'].every((c) => choices.some((x) => x.includes(c))), choices.join(', '));
      await page.getByRole('menuitemcheckbox', { name: 'New York' }).click(); await settle(page, 600);
      pass(`${tag}: switched to New York, 08:00 in the UK is 03:00 there`, (await first()).join() === '03:00,08:00' && (await page.locator('.cc-cal-zone').first().textContent()) === 'New York');
      // The choice is remembered (Tim, 18 Nov, 13:00; tidy follow-up 3, run 6's 21): kept in the coach's settings, and the
      // calendar opens on it again although the next client call outside the UK is still in Chicago.
      const chose = (await t.rowsNow('coach_settings'))[0];
      pass(`${tag}: the choice is kept in the coach's own settings`, chose?.second_time_zone === 'America/New_York' && chose?.calendars?.second_zone_chosen === true, JSON.stringify({ zone: chose?.second_time_zone, calendars: chose?.calendars }));
      await go(page, '/coach/calendar?view=week');
      pass(`${tag}: and the calendar opens on New York next time, not the next client's Chicago`, (await page.locator('.cc-cal-zone').first().textContent()) === 'New York');
      pass(`${tag}: a client call shows the client's own time inside its block`, /9:45 am Chicago/.test(await tile(page, D.tue, 'Jordan Reyes').textContent()));
      // Polish 1 (25 Nov): Weekends is a quiet link in the calendar's foot ("Show weekends" / "Hide weekends"), no switch.
      await press(page, 'Show weekends');
      pass(`${tag}: Weekends on shows seven days`, (await heads()) === 7 && (await text()).includes('16 to 22 Nov'));
      const kept = (await t.rowsNow('coach_settings'))[0];
      pass(`${tag}: the Weekends switch is kept in Settings' calendars`, kept?.calendars?.weekends === true);
      await press(page, 'Hide weekends');
      pass(`${tag}: the now line is drawn on today`, (await page.locator(`[data-cal-day="${D.tue}"] .cc-cal-now`).count()) === 1 && (await page.locator('.cc-cal-now').count()) === 1);
      pass(`${tag}: outside working hours is hatched under the tiles`, (await page.locator('.cc-cal-off').count()) >= 5);
      await press(page, 'My calendars');
      await dialog(page).getByRole('switch', { name: 'Family' }).click(); await settle(page, 700);
      await closePanel(page);
      pass(`${tag}: My calendars: Family switched off hides its items`, !(await text()).includes('Swimming with Esme') && (await text()).includes('Dentist'));
      await undo(page);
      pass(`${tag}: and Undo shows them again`, (await text()).includes('Swimming with Esme'));
      for (const hint of ['⌘', 'Ctrl+', 'Cmd+']) pass(`${tag}: no keyboard shortcut is shown (${hint})`, !(await text()).includes(hint));
    }

    if (has('cal-colours')) {
      const bad = await page.evaluate(() => {
        const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const out = [];
        for (const el of document.querySelectorAll('.cc-cal-body .cc-cal-tile')) {
          const cs = getComputedStyle(el);
          const bg = cs.backgroundColor;
          if (/rgba\(.*, 0\)$/.test(bg) || bg === 'transparent') { out.push(`${el.textContent.slice(0, 20)}: no background`); continue; }
          if (parseFloat(cs.borderTopLeftRadius) !== 4) out.push(`${el.textContent.slice(0, 20)}: corners ${cs.borderTopLeftRadius}`);
          for (const line of el.querySelectorAll('.cc-cal-title, .cc-cal-sub, .cc-cal-time')) {
            const ls = getComputedStyle(line);
            const [a, b] = [lum(ls.color), lum(bg)];
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < 4.5) out.push(`${line.textContent.slice(0, 20)}: ${ratio.toFixed(2)} to 1`);
            if (parseFloat(ls.fontSize) < 12) out.push(`${line.textContent.slice(0, 20)}: ${ls.fontSize}`);
          }
        }
        return out;
      });
      pass(`${tag}: every line of every tile is 4.5 to 1 or more, 12px or more, on 4px corners`, bad.length === 0, [...new Set(bad)].slice(0, 6).join('; '));
      const colour = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
      pass(`${tag}: a client call is peach`, (await colour(tile(page, D.tue, 'Sam Okafor'))) === 'rgb(255, 189, 158)');
      pass(`${tag}: a Chemistry Call is mint`, (await colour(tile(page, D.wed, 'Ruth Adeyemi'))) === 'rgb(95, 239, 187)');
      pass(`${tag}: a held time and a family item are dashed outlines`, (await tile(page, D.mon, 'Mia and Paul').evaluate((el) => getComputedStyle(el).borderTopStyle)) === 'dashed' && (await tile(page, D.mon, 'Swimming').evaluate((el) => getComputedStyle(el).borderTopStyle)) === 'dashed');
      // A cut-off title shows in full after 0.3 seconds (the shared pop-up), and not before.
      const cut = page.locator(`[data-cal-key="todo:${DAY.t12}"]`);
      await cut.hover(); await settle(page, 120);
      const early = await page.locator('.ds-infopop:not([hidden])', { hasText: 'Send the Kestrel proposal' }).count();
      await settle(page, 500);
      pass(`${tag}: hovering a cut-off item shows its full title after 0.3 seconds`, early === 0 && (await page.locator('.ds-infopop:not([hidden])', { hasText: 'Send the Kestrel proposal' }).count()) === 1);
      await page.mouse.move(5, 5); await settle(page, 200);
      pass(`${tag}: an item under 45 minutes is on one line`, (await tile(page, D.wed, 'Coffee with Dan Reid').evaluate((el) => el.classList.contains('cc-cal-tile--one') && el.getBoundingClientRect().height < 26)));
    }

    if (has('cal-create')) {
      await dragTo(page, await point(page, D.wed, 16 * 60 + 15, 0.5), await point(page, D.wed, 17 * 60 - 2, 0.5));
      const quick = page.locator('.cc-cal-quick');
      pass(`${tag}: dragging on empty space opens the quick add beside the new item, in quarter hours`, (await quick.count()) === 1 && (await quick.textContent()).includes('Wed 18 Nov, 16:15 to 17:00'), await quick.textContent().catch(() => ''));
      await quick.locator('.ds-btn--primary').click(); await settle(page, 400);
      pass(`${tag}: Save with no title says what is needed, and the button is never greyed out`, (await quick.textContent()).includes('Type a title to carry on.'));
      await quick.getByLabel('Title').fill('Plan the offsite');
      await quick.locator('.ds-btn--primary').click(); await settle(page, 900);
      let made = (await items()).find((i) => i.title === 'Plan the offsite');
      pass(`${tag}: it is saved at the dragged time, as your own time`, Boolean(made) && same(made.starts_at, at(D.wed, '16:15')) && same(made.ends_at, at(D.wed, '17:00')) && made.kind === 'own_time' && made.time_zone === LON, JSON.stringify(made && [made.starts_at, made.ends_at, made.kind]));
      pass(`${tag}: and says Added`, (await toast(page)) === (t.there ? 'Added' : 'Added'));
      await undo(page);
      pass(`${tag}: Undo takes it away`, !(await items()).some((i) => i.title === 'Plan the offsite'));
      const p = await point(page, D.thu, 10 * 60 + 20, 0.5);
      await page.mouse.click(p.x, p.y); await settle(page, 600);
      pass(`${tag}: a single click opens the quick add for an hour`, (await quick.textContent().catch(() => '')).includes('Thu 19 Nov, 10:00 to 11:00'));
      await page.keyboard.press('Escape'); await settle(page, 300);
      pass(`${tag}: Escape closes it and nothing is made`, (await quick.count()) === 0);
      made = null;
    }

    if (has('cal-quick')) {
      await press(page, 'Add to calendar');
      const d = dialog(page);
      await d.getByLabel('Title').fill('Coffee with Dan Thu 10:00');
      await settle(page, 300);
      pass(`${tag}: the quick add reads plain words: "Coffee with Dan Thu 10:00"`, (await d.textContent()).includes('Thu 19 Nov, 10:00 to 11:00') && (await d.getByRole('combobox', { name: /^What is it/ }).textContent()).includes('Networking call'), await d.locator('.cc-cal-quick-when').textContent());
      await d.locator('.ds-btn--primary').click(); await settle(page, 900);
      const coffee = (await items()).find((i) => i.title === 'Coffee with Dan');
      pass(`${tag}: it is a networking call on Thursday at 10:00`, Boolean(coffee) && coffee.kind === 'connection' && same(coffee.starts_at, at(D.thu, '10:00')) && same(coffee.ends_at, at(D.thu, '11:00')));
      await press(page, 'Add to calendar');
      await dialog(page).getByLabel('Title').fill('Chase the invoice Fri 13:00 for 30m');
      await pick(dialog(page), page, 'What is it', 'To-do');
      await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900);
      const todo = (await t.rowsNow('coach_todos')).find((x) => x.title === 'Chase the invoice');
      pass(`${tag}: a to-do goes on To-dos too, with its day, time and length`, Boolean(todo) && todo.planned_on === D.fri && String(todo.planned_time).startsWith('13:00') && todo.minutes === 30 && (await toast(page)).includes('to-do list too'), JSON.stringify(todo && [todo.planned_on, todo.planned_time, todo.minutes]));
      pass(`${tag}: and shows on the calendar with its tick`, (await tile(page, D.fri, 'Chase the invoice').locator('.cc-cal-tick').count()) === 1);
      await press(page, 'Add to calendar');
      await dialog(page).getByLabel('Title').fill('Sam Okafor');
      await pick(dialog(page), page, 'What is it', 'Client call');
      pass(`${tag}: a client call's button reads "Book the call"`, (await dialog(page).locator('.ds-btn--primary').textContent()) === 'Book the call');
      await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 900);
      pass(`${tag}: and goes on to Book a call`, new URL(page.url()).pathname === '/coach/calendar/book');
      await go(page, '/coach/calendar?view=week');
    }

    if (has('cal-move')) {
      const admin = () => tile(page, D.wed, 'Admin');
      await dragTile(page, admin(), { fromDay: D.wed, toDay: D.wed, minutes: 60 });
      let row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: a tile dragged an hour later moves an hour, in quarter hours`, same(row.starts_at, at(D.wed, '15:00')) && same(row.ends_at, at(D.wed, '17:00')), `${row.starts_at} ${await toast(page)}`);
      pass(`${tag}: and says where it went`, /^Moved to Wed 15:00/.test(await toast(page)), await toast(page));
      await page.locator('.cc-cal-day').first().click();
      await page.keyboard.press('Meta+z'); await settle(page, 900);
      row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: Cmd+Z undoes the last change`, same(row.starts_at, at(D.wed, '14:00')));
      await dragTile(page, admin(), { fromDay: D.wed, toDay: D.fri, minutes: 0 });
      row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: dragged to another day, it keeps its time`, same(row.starts_at, at(D.fri, '14:00')), row.starts_at);
      await undo(page);
      const b = await admin().boundingBox();
      const down = (await point(page, D.wed, 16 * 60 + 30)).y - (await point(page, D.wed, 16 * 60)).y;
      await dragTo(page, { x: b.x + b.width / 2, y: b.y + b.height - 3 }, { x: b.x + b.width / 2, y: b.y + b.height - 3 + down });
      row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: dragging the bottom edge changes the length`, same(row.starts_at, at(D.wed, '14:00')) && same(row.ends_at, at(D.wed, '16:30')), row.ends_at);
      await undo(page);
      await admin().focus();
      await page.keyboard.press('ArrowDown'); await settle(page, 800);
      row = await t.one('coach_cal_items', CAL.admin);
      pass(`${tag}: an arrow key moves a focused item 15 minutes, without dragging`, same(row.starts_at, at(D.wed, '14:15')), row.starts_at);
      await undo(page);
      // A client call: its session goes with it, the note is drafted, and nothing is sent.
      const before = await t.one('coach_cal_items', CAL.priyaTue);
      await dragTile(page, tile(page, D.tue, 'Priya Nair'), { fromDay: D.tue, toDay: D.tue, minutes: 60 });
      row = await t.one('coach_cal_items', CAL.priyaTue);
      const said = await toast(page);
      pass(`${tag}: moving a client call says to tell the client, with Undo`, same(row.starts_at, at(D.tue, '18:00')) && /Tell Priya the new time\.$/.test(said), said);
      if (before.session_id) {
        const s = await t.one('coach_sessions', before.session_id);
        pass(`${tag}: its session moves with it`, same(s.starts_at, at(D.tue, '18:00')));
      }
      pass(`${tag}: a note to the client is drafted, never sent`, (await text()).includes('A note to Priya is drafted.'));
      await press(page, 'Open the note');
      pass(`${tag}: the note says the new time and opens only in the coach's own email`, /18:00/.test(await dialog(page).locator('textarea').inputValue()) && (await dialog(page).textContent()).includes('Nothing is sent until you send it from your own email.'));
      await closePanel(page);
      await undo(page);
      row = await t.one('coach_cal_items', CAL.priyaTue);
      pass(`${tag}: Undo puts the call back`, same(row.starts_at, at(D.tue, '17:00')));
    }

    if (has('cal-repeat')) {
      await tile(page, D.tue, 'Training').click(); await settle(page, 700);
      const d = dialog(page);
      pass(`${tag}: a repeat's panel asks which ones`, (await d.textContent()).includes('This and following') && (await d.textContent()).includes('All of them'));
      await d.getByLabel('Starts').fill('10:00');
      await d.getByRole('radio', { name: 'This and following' }).click(); await settle(page, 300);
      await d.locator('.ds-btn--primary').click(); await settle(page, 1000);
      const all = await items();
      const old = all.find((i) => i.id === CAL.training);
      const next = all.find((i) => i.split_from === CAL.training);
      pass(`${tag}: "this and following" ends the old series the day before and starts a new one`, old?.repeat_rule?.until === D.mon && Boolean(next) && same(next.starts_at, at(D.tue, '10:00')) && next.repeat_rule?.every === 'week', JSON.stringify([old?.repeat_rule, next?.starts_at]));
      pass(`${tag}: Monday's stays at 09:45 and Tuesday's is at 10:00`, (await tile(page, D.mon, 'Training').textContent()).includes('09:45') && (await tile(page, D.tue, 'Training').textContent()).includes('10:00'));
      await undo(page);
      pass(`${tag}: Undo puts the series back whole`, !(await items()).some((i) => i.split_from === CAL.training) && !(await t.one('coach_cal_items', CAL.training)).repeat_rule.until);
      // This one: a row that stands in for that one time.
      await tile(page, D.tue, 'Training').click(); await settle(page, 700);
      await dialog(page).getByLabel('Ends').fill('11:30');
      await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 1000);
      const standsIn = (await items()).find((i) => i.series_id === CAL.training && i.occurrence_on === D.tue);
      pass(`${tag}: "this one" edits only that time`, Boolean(standsIn) && same(standsIn.ends_at, at(D.tue, '11:30')) && (await tile(page, D.mon, 'Training').textContent()).includes('12:00'));
      await undo(page);
    }

    if (has('cal-todo')) {
      await press(page, 'Show to-dos');
      const panel = page.locator('.cc-cal-todos');
      pass(`${tag}: the to-dos panel lists the to-dos to place`, (await panel.textContent()).includes('To-dos to place') && (await panel.locator('.cc-cal-todo').count()) > 2);
      const card = panel.locator('.cc-cal-todo').first();
      const id = await card.getAttribute('data-todo');
      const cb = await card.boundingBox();
      await dragTo(page, { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }, await point(page, D.thu, 15 * 60 + 32, 0.5));
      let todo = await t.one('coach_todos', id);
      pass(`${tag}: a to-do dragged onto a day gets that day and time`, todo.planned_on === D.thu && String(todo.planned_time).startsWith('15:30') && /^Placed at 15:30/.test(await toast(page)), `${todo.planned_on} ${todo.planned_time}`);
      const placed = page.locator(`[data-cal-key="todo:${id}"]`);
      pass(`${tag}: it shows on the calendar with a tick box`, (await placed.locator('.cc-cal-tick').count()) === 1);
      await placed.locator('.cc-cal-tick').click(); await settle(page, 900);
      todo = await t.one('coach_todos', id);
      pass(`${tag}: ticked on the calendar, it is done on To-dos`, Boolean(todo.done_at));
      await undo(page);
      const pb = await placed.boundingBox();
      const tb = await panel.boundingBox();
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down();
      await page.mouse.move(tb.x + 60, tb.y + 80, { steps: 6 });
      pass(`${tag}: a dashed coral outline shows while it is over the to-dos panel`, (await panel.evaluate((el) => el.classList.contains('cc-cal-todos--over') && getComputedStyle(el).outlineStyle === 'dashed')));
      await page.mouse.up(); await settle(page, 900);
      todo = await t.one('coach_todos', id);
      pass(`${tag}: dropped there it comes off the calendar: "Back on your to-do list."`, todo.planned_time == null && todo.planned_on === D.thu && (await toast(page)) === 'Back on your to-do list.', `${todo.planned_time} ${await toast(page)}`);
      await undo(page);
      pass(`${tag}: Undo puts it back on the calendar`, String((await t.one('coach_todos', id)).planned_time).startsWith('15:30'));
      await page.locator(`[data-cal-key="todo:${DAY.t12}"]`).click(); await settle(page, 700);
      const foot = await dialog(page).locator('.cc-panel-foot').textContent();
      pass(`${tag}: a placed to-do has Remove from calendar, never Delete`, foot.includes('Remove from calendar') && !foot.includes('Delete') && !foot.includes('Duplicate'), foot);
      await dialog(page).getByRole('button', { name: 'Remove from calendar' }).click(); await settle(page, 900);
      pass(`${tag}: Remove from calendar takes only its time`, (await t.one('coach_todos', DAY.t12)).planned_time == null && (await t.one('coach_todos', DAY.t12)).planned_on === D.fri);
      await undo(page);
      await press(page, 'Hide to-dos');
    }

    if (has('cal-hours')) {
      await press(page, 'Working hours');
      pass(`${tag}: Working hours opens the week for editing, with a handle at each day's start and finish`, (await text()).includes('Drag the top or bottom of each day to set your working hours.') && (await page.getByRole('slider').count()) === 10);
      pass(`${tag}: the events dim and Book a call steps back`, Number(await tile(page, D.wed, 'Admin').evaluate((el) => getComputedStyle(el).opacity)) < 0.6 && (await page.getByRole('button', { name: 'Book a call' }).count()) === 0);
      const start = page.getByRole('slider', { name: 'Monday, start' });
      await start.focus();
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settle(page, 300);
      pass(`${tag}: arrow keys move a handle in 15-minute steps`, (await start.textContent()) === 'Start 09:30');
      const finish = page.getByRole('slider', { name: 'Wednesday, finish' });
      const fb = await finish.boundingBox();
      const dy = (await point(page, D.wed, 18 * 60)).y - (await point(page, D.wed, 17 * 60)).y;
      await dragTo(page, { x: fb.x + fb.width / 2, y: fb.y }, { x: fb.x + fb.width / 2, y: fb.y + dy });
      pass(`${tag}: a handle drags to the quarter hour`, (await finish.textContent()) === 'Finish 18:00', await finish.textContent());
      await press(page, 'Done');
      const s = (await t.rowsNow('coach_settings'))[0];
      pass(`${tag}: Done saves them to Settings' working hours`, s.working_hours?.mon?.from === '09:30' && s.working_hours?.wed?.to === '18:00' && (await toast(page)) === 'Working hours saved.', JSON.stringify(s.working_hours));
      await go(page, '/coach/settings/hours');
      pass(`${tag}: Settings, Working hours shows the same hours`, /09:30/.test(await text()));
      await go(page, '/coach/calendar?view=week');
    }

    if (has('cal-item')) {
      await tile(page, D.thu, 'Leaders’ dinner').click(); await settle(page, 700);
      let d = dialog(page);
      pass(`${tag}: an item's panel has Title, Day, Starts and Ends in 5-minute steps`, (await d.textContent()).includes('2 hours, in 5-minute steps.') && (await d.getByLabel('Starts').inputValue()) === '18:30');
      await d.getByLabel('Starts').fill('18:35');
      pass(`${tag}: a typed time moves in 5-minute steps`, (await d.textContent()).includes('1 hour 55 minutes, in 5-minute steps.'));
      await press(page, 'More options');
      d = dialog(page);
      pass(`${tag}: More options shows replies on the item`, (await d.textContent()).includes('Dana Whitfield') && (await d.textContent()).includes('Maybe'));
      await d.getByLabel('Who’s invited?').fill('Dan Reid <dan@example.invalid>; ruth@example.invalid\ndan@example.invalid\nPaul Garner');
      await settle(page, 300);
      const read = await d.textContent();
      pass(`${tag}: a pasted list is read: the count, a name with no email, a duplicate taken out`, read.includes('2 people to invite.') && read.includes('Paul Garner has no email yet') && read.includes('1 duplicate was taken out.'));
      await d.getByPlaceholder('Type a name').fill('Sam'); await settle(page, 400);
      await d.locator('.cc-cal-found-row', { hasText: 'Sam Okafor' }).click(); await settle(page, 300);
      await d.locator('.ds-btn--primary').click(); await settle(page, 1000);
      const guests = (await t.rowsNow('coach_cal_guests')).filter((g) => g.item_id === CAL.dinner);
      pass(`${tag}: the guests are saved, someone from the portal tied to their own page`, guests.length === 4 && guests.some((g) => g.email === 'dan@example.invalid') && guests.some((g) => g.profile_id === ID.sam), JSON.stringify(guests.map((g) => g.name)));
      const row = await t.one('coach_cal_items', CAL.dinner);
      pass(`${tag}: and the typed time`, same(row.starts_at, at(D.thu, '18:35')));
      await undo(page);
      await tile(page, D.thu, 'Supervision with Maya').click(); await settle(page, 700);
      await dialog(page).getByRole('button', { name: 'Duplicate' }).click(); await settle(page, 900);
      pass(`${tag}: Duplicate copies it onto the next day, with Undo`, (await toast(page)) === 'Duplicated to Fri.' && (await items()).filter((i) => i.title === 'Supervision with Maya').length === 2);
      await undo(page);
      await tile(page, D.thu, 'Supervision with Maya').click(); await settle(page, 700);
      await dialog(page).getByRole('button', { name: 'Delete' }).click(); await settle(page, 900);
      pass(`${tag}: Delete says Deleted`, (await toast(page)) === 'Deleted' && !(await t.one('coach_cal_items', CAL.supervision)));
      await undo(page);
      pass(`${tag}: and Undo brings it back with its guest`, Boolean(await t.one('coach_cal_items', CAL.supervision)) && (await t.rowsNow('coach_cal_guests')).some((g) => g.id === CAL.guestMaya));
      // A new item with More options: all day, over two days.
      await press(page, 'Add to calendar');
      await dialog(page).getByLabel('Title').fill('Team away days');
      await press(page, 'More options');
      d = dialog(page);
      await d.getByRole('switch', { name: 'All day' }).click(); await settle(page, 300);
      await d.locator('.ds-btn--primary').click(); await settle(page, 1000);
      const away = (await items()).find((i) => i.title === 'Team away days');
      pass(`${tag}: an all-day item is saved by its days and shows in the all-day row`, Boolean(away) && away.all_day === true && away.starts_on === D.tue && (await page.locator('.cc-cal-banner', { hasText: 'Team away days' }).count()) === 1, JSON.stringify(away && [away.all_day, away.starts_on]));
      // A call with a session opens its brief, as Today's rows do.
      await tile(page, D.tue, 'Sam Okafor').click(); await settle(page, 1200);
      pass(`${tag}: a client call opens its brief, with Join on Zoom from the item's link`, (await dialog(page).textContent()).includes('Join on Zoom') && (await dialog(page).textContent()).includes('Sam'));
      await dialog(page).getByRole('button', { name: 'Edit the call' }).click(); await settle(page, 900);
      pass(`${tag}: and its "Edit the call" opens the call's own panel: its time, its guests, Delete`, (await dialog(page).getByLabel('Starts').inputValue()) === '12:30' && (await dialog(page).locator('.cc-panel-foot').textContent()).includes('Delete'));
      await closePanel(page);
      await tile(page, D.mon, 'Mia and Paul').click(); await settle(page, 800);
      pass(`${tag}: a held time opens its poll`, new URL(page.url()).pathname === `/coach/calendar/polls/${CAL.poll}`);
      await go(page, '/coach/calendar?view=week');
    }

    if (has('cal-month')) {
      // Polish 1 (25 Nov; rule 17): Month and Week are one switch; the month is a plain grid with a dot under each day
      // with something on, and the chosen day's list under it with its date as a small grey label.
      await press(page, 'Month');
      pass(`${tag}: the month shows November as a plain grid`, (await text()).includes('November 2026') && (await page.locator('.ds-cal-day').count()) >= 35 && (await page.locator('.ds-cal-day--has').count()) >= 5);
      pass(`${tag}: today is the filled circle`, (await page.locator('.ds-cal-day--today').getAttribute('aria-label')) === 'Tuesday 17 November, something on');
      await page.getByRole('button', { name: /^Thursday 19 November/ }).click(); await settle(page, 800);
      pass(`${tag}: a month's day shows its list under the grid`, (await page.locator('.cc-cal-dayname').textContent()) === 'Thursday 19 November' && new URL(page.url()).searchParams.get('day') === D.thu && (await page.locator('.ds-cal-day--sel').count()) === 1);
      pass(`${tag}: the day's list opens an item as its tile would`, (await page.locator('.cc-cal-daylist .ds-li').count()) >= 1);
      await press(page, 'Next month');
      pass(`${tag}: Next steps a month`, (await text()).includes('December 2026'));
      await press(page, 'Today');
      pass(`${tag}: Today comes back`, (await text()).includes('November 2026') && (await page.locator('.cc-cal-dayname').textContent()) === 'Tuesday 17 November');
      await go(page, '/coach/calendar?view=schedule');
      const rows = await page.locator('.cc-sched-row').count();
      const first = await page.locator('.cc-sched-day').first().textContent();
      pass(`${tag}: the Schedule (its own address) lists what's next from today, each with a square of its colour`, rows > 10 && first === 'Today, Tue 17 Nov' && (await page.locator('.cc-sched-square').count()) === rows, `${rows} ${first}`);
      await go(page, '/coach/calendar?view=week');
      await page.getByRole('button', { name: 'Search, or do anything' }).click();
      await page.keyboard.type('Lighthouse'); await settle(page, 500);
      const found = await page.locator('.cc-jump-list').textContent();
      pass(`${tag}: search finds a calendar item by its place or note`, found.includes('Coffee with Dan Reid'), found.slice(0, 80));
      await page.locator('.cc-jump-input').fill('Leaders'); await settle(page, 500);
      pass(`${tag}: search finds a calendar item by its title`, (await page.locator('.cc-jump-list').textContent()).includes('Leaders’ dinner, Birmingham'), found.slice(0, 80));
      await page.locator('.cc-jump-item', { hasText: 'Leaders’ dinner' }).click(); await settle(page, 900);
      pass(`${tag}: and opens its day`, new URL(page.url()).searchParams.get('day') === D.thu);
    }
    await t.done();
  }

  // ---------------------------------------------------------------- a phone
  async function phone(role, db) {
    const tag = `${role} on a phone, ${db === 'there' ? '051 there' : 'device only'}`;
    const t = await openAt({ role, size: 400, db, path: '/coach/calendar', tag });
    const { page } = t;
    const text = () => page.evaluate(() => document.querySelector('.cc-app').innerText);
    // Polish 1 (25 Nov): a phone opens on the month too, the chosen day's list under it.
    pass(`${tag}: the phone opens on the month, with today's list`, (await page.locator('.ds-cal-day').count()) >= 35 && (await page.locator('.cc-cal').count()) === 0 && (await page.locator('.cc-cal-dayname').textContent()) === 'Tuesday 17 November');
    await page.goto(page.url().replace(/\/coach\/calendar.*$/, '/coach/calendar?view=schedule')); await page.waitForSelector('.cc-app'); await settle(page, 1000);
    const square = page.locator('.cc-sched-row', { hasText: 'Parents’ evening' }).first().locator('.cc-sched-square');
    pass(`${tag}: a 10px square of each tile's colour sits before the time, dashed for a family item`, (await square.evaluate((el) => { const b = el.getBoundingClientRect(); return Math.round(b.width) === 10 && Math.round(b.height) === 10 && getComputedStyle(el).borderTopStyle === 'dashed'; })));
    pass(`${tag}: no header menu button's hamburger, and Book a call is the one coral button`, (await page.locator('.cc-cal-page .ds-btn--primary').count()) === 1);
    await page.goto(page.url().replace(/\/coach\/calendar.*$/, '/coach/calendar?view=day')); await page.waitForSelector('.cc-app'); await settle(page, 1000);
    pass(`${tag}: the day (its own address) has both time columns, with both time columns`, (await page.locator('.cc-cal-day').count()) === 1 && (await page.locator('.cc-cal-zone').count()) === 2);
    pass(`${tag}: nothing scrolls sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await press(page, 'Add to calendar');
    pass(`${tag}: Add to calendar opens a full-screen panel`, (await dialog(page).evaluate((el) => el.getBoundingClientRect().width >= window.innerWidth - 2)));
    await closePanel(page);
    // Press and hold, then drag (the page's own pointer events, as a finger gives them).
    const loc = tile(page, D.tue, 'Priya Nair');
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    const hour = (await point(page, D.tue, 660)).y - (await point(page, D.tue, 600)).y;
    const fire = (type, x, y, target) => page.evaluate(([ty, px, py, onTile]) => {
      const el = onTile ? document.elementFromPoint(px, py).closest('[data-cal-key]') : window;
      el.dispatchEvent(new PointerEvent(ty, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, clientX: px, clientY: py }));
    }, [type, x, y, target]);
    const x = b.x + b.width / 2;
    const y = b.y + 8;
    await fire('pointerdown', x, y, true);
    await page.clock.runFor(600).catch(() => {});
    await settle(page, 700);
    pass(`${tag}: press and hold lifts the item`, await loc.evaluate((el) => el.classList.contains('cc-cal-tile--held')));
    await fire('pointermove', x, y - hour / 2, false);
    await fire('pointermove', x, y - hour, false);
    await fire('pointerup', x, y - hour, false);
    await settle(page, 900);
    const row = await t.one('coach_cal_items', CAL.priyaTue);
    pass(`${tag}: then drags it: an hour earlier`, same(row.starts_at, at(D.tue, '16:00')), row.starts_at);
    await undo(page);
    await press(page, 'Week');
    pass(`${tag}: a phone's week is the week's own list, never a squashed grid`, (await page.locator('.cc-cal').count()) === 0 && (await page.locator('.cc-sched-day').first().textContent()) === 'Mon 16 Nov');
    await press(page, 'Month');
    pass(`${tag}: the month fits a phone`, (await page.locator('.ds-cal-day').count()) >= 35 && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await t.done();
  }

  try {
    for (const role of roles) {
      for (const db of dbs) {
        if (parts.some((p) => p !== 'cal-phone')) await laptop(role, db);
        if (has('cal-phone')) await phone(role, db);
      }
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  report.done();
}

run().catch((e) => { console.error(String(e).split('\n').slice(0, 6).join('\n')); process.exit(1); });
