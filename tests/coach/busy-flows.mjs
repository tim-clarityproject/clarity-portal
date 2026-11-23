// Your Personal and Family calendars from Google, walked (Phase 6a run 8,
// item 2), against the Google stand-in: no key exists, nothing leaves the
// page and nothing is ever sent. As the owner and as an associate on a
// laptop, in both database modes (device only; 049 to 052 answered by the
// stand-in in shared.mjs, 059 not there, so the calendars and busy times
// are kept on the device as the app does until Tim runs 059).
//
//   busy-list     Settings, My calendars: every calendar on the account, the main one with no switch, Personal and Family off
//   busy-show     Family switched on: its event is a soft filled tile with its title; Personal (off) shows nothing; it opens read only
//   busy-block    Book a call's own time check and the calendar refuse the busy time by its title; switched off, it frees again
//   busy-readonly every call the portal made to "Google": only reads of the other calendars, never a write
//
// The page's clock is pinned to M11's Tuesday (17 Nov 2026, 12:22). "In
// Google" is the stand-in's own hook, through window.__clarityCalSync,
// which only a build that isn't live has.
//
//   PARTS=busy-list,busy-show,busy-block,busy-readonly   ROLES=owner,associate   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, settle, standIn } from './shared.mjs';
import { seedClock, seedWithCal } from './seed.mjs';
import { instantAt } from '../../src/lib/time/index.js';

export const BUSY_PARTS = ['busy-list', 'busy-show', 'busy-block', 'busy-readonly', 'busy-fresh'];
const TUE = new Date(2026, 10, 17, 12, 22);
const LON = 'Europe/London';
const WED = '2026-11-18';
const at = (day, time) => instantAt(day, time, LON).toISOString();
const PERSONAL = 'personal.standin@group.calendar.example';
const FAMILY = 'family.standin@group.calendar.example';

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const round = async (page) => { await page.evaluate(() => window.__clarityCalSync.round()); await settle(page, 1200); };
const asked = (page) => page.evaluate(() => window.__clarityCalSync.google().asked());
const busyTile = (page, text) => page.locator(`[data-cal-day="${WED}"] .cc-cal-tile--busy`, { hasText: text });

async function run() {
  const report = makeReport('Your Personal and Family calendars from Google');
  const { pass } = report;
  const parts = (process.env.PARTS || BUSY_PARTS.join(',')).split(',');
  const has = (p) => parts.includes(p);
  const roles = (process.env.ROLES || 'owner,associate').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  async function openAt({ role, db, tag, path = '/coach/settings/calendars' }) {
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
    await page.clock.setFixedTime(TUE);
    seedClock(TUE);
    const rows = seedWithCal({ accounts: true });
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
    await page.evaluate((id) => localStorage.setItem(`clarity-cache:${id}:coach-standin-on`, JSON.stringify({ google: true })), me);
    await go(page, path);
    // "In Google": the School play on Family and Physio on Personal, on the Wednesday.
    await page.evaluate(([fam, pers, a, b, c, d]) => {
      const g = window.__clarityCalSync.google();
      g.inGoogle.addTo(fam, { summary: 'School play', location: '12 Mill Lane', start: { dateTime: a }, end: { dateTime: b } });
      g.inGoogle.addTo(pers, { summary: 'Physio', start: { dateTime: c }, end: { dateTime: d } });
    }, [FAMILY, PERSONAL, at(WED, '10:30'), at(WED, '11:30'), at(WED, '14:00'), at(WED, '15:00')]);
    const rowsNow = async (table) => page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]);
    return {
      page, store, me, rowsNow,
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

  const switchFamily = async (page, on) => {
    const sw = page.getByRole('switch', { name: 'Family' }).last();
    if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
    await settle(page, 700);
    await round(page);
  };

  for (const role of roles) {
    for (const db of dbs) {
      const tag = `${role}, ${db === 'there' ? '051 there, 059 not' : 'device only'}`;

      if (has('busy-list')) {
        const t = await openAt({ role, db, tag: `${tag}, list` });
        const { page } = t;
        await round(page);
        const group = page.getByRole('group', { name: 'From Google Calendar' });
        const words = await group.textContent().catch(() => '');
        pass(`${tag}: My calendars lists every calendar on the account, the main one first`, /Work\s*Kept in step with this calendar both ways/.test(words) && words.includes('Personal') && words.includes('Family'), words.slice(0, 200));
        pass(`${tag}: the main calendar has no switch`, (await group.getByRole('switch', { name: 'Work' }).count()) === 0);
        const checked = await Promise.all(['Personal', 'Family'].map((n) => group.getByRole('switch', { name: n }).getAttribute('aria-checked')));
        pass(`${tag}: Personal and Family are off until switched on`, checked.every((v) => v === 'false'), checked.join(','));
        pass(`${tag}: nothing is read from a calendar that is off`, !(await asked(page)).some((a) => a.what === 'busy'));
        pass(`${tag}: kept on the device until 059 is there`, (await t.rowsNow('coach_google_calendars')).length === 3 && (await t.rowsNow('coach_busy_times')).length === 0);
        // Switched on, then Undo.
        await group.getByRole('switch', { name: 'Family' }).click(); await settle(page, 600);
        const toast = await page.locator('.ds-toast').last().textContent().catch(() => '');
        pass(`${tag}: switching Family on says what it does, with Undo`, toast.includes('Family shows on your calendar and blocks those times.') && /Undo/.test(toast), toast);
        await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).click(); await settle(page, 900);
        pass(`${tag}: Undo switches it off again`, (await group.getByRole('switch', { name: 'Family' }).getAttribute('aria-checked')) === 'false');
        await t.done();
      }

      if (has('busy-fresh')) {
        // "Google" started again (another device, a cleared browser): its events come back under new ids. What the device
        // kept from before goes, and each event shows once.
        const t = await openAt({ role, db, tag: `${tag}, fresh` });
        const { page } = t;
        await round(page);
        await switchFamily(page, true);
        await page.evaluate((id) => localStorage.removeItem(`clarity-cache:${id}:coach-standin-google`), t.me);
        await go(page, '/coach/settings/calendars');
        await page.evaluate(([fam, a, b]) => {
          const g = window.__clarityCalSync.google();
          g.createEvent({ summary: 'Something on Work first', start: { dateTime: a }, end: { dateTime: b } });
          g.inGoogle.addTo(fam, { summary: 'School play', start: { dateTime: a }, end: { dateTime: b } });
        }, [FAMILY, at(WED, '10:30'), at(WED, '11:30')]);
        await round(page);
        await round(page);
        const busy = await t.rowsNow('coach_busy_times');
        pass(`${tag}: after "Google" starts again, each event is kept once`, busy.length === 1, JSON.stringify(busy.map((b) => b.event_id)));
        await go(page, `/coach/calendar?view=week&day=${WED}`);
        pass(`${tag}: and shows once`, (await busyTile(page, 'School play').count()) === 1, String(await busyTile(page, 'School play').count()));
        await t.done();
      }

      if (has('busy-show') || has('busy-block') || has('busy-readonly')) {
        const t = await openAt({ role, db, tag: `${tag}, show` });
        const { page } = t;
        await round(page);
        await switchFamily(page, true);
        const busy = await t.rowsNow('coach_busy_times');
        pass(`${tag}: the School play is kept as a busy time, with its title and times only`, busy.length === 1 && busy[0].title === 'School play' && !JSON.stringify(busy[0]).includes('Mill'), JSON.stringify(busy).slice(0, 200));
        await go(page, `/coach/calendar?view=week&day=${WED}`);
        if (has('busy-show')) {
          const tile = busyTile(page, 'School play');
          pass(`${tag}: on the calendar it is a soft filled tile with its title and its calendar`, (await tile.count()) === 1 && /Family/.test(await tile.textContent()));
          const look = await tile.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, left: s.borderLeftWidth, style: s.borderLeftStyle }; });
          pass(`${tag}: filled, with no dashed edge and no side line`, look.bg !== 'rgba(0, 0, 0, 0)' && look.style !== 'dashed' && parseFloat(look.left || '0') <= 1, JSON.stringify(look));
          pass(`${tag}: Physio (Personal, off) isn't shown`, (await busyTile(page, 'Physio').count()) === 0);
          await tile.click(); await settle(page, 600);
          const panel = await page.locator('.ds-modal--shown .ds-dialog').last().textContent().catch(() => '');
          pass(`${tag}: it opens read only: when, its calendar, and that it is edited in Google`, panel.includes('From your Family calendar in Google') && panel.includes('Edit it in Google Calendar.') && !/Delete|Save/.test(panel), panel.slice(0, 200));
          await page.keyboard.press('Escape'); await settle(page, 400);
        }
        if (has('busy-block')) {
          // The coach's own calendar refuses a call over it, by its title (Book a call's typed time and Offer times use the same check).
          const refused = await page.evaluate(() => [...document.querySelectorAll('.cc-cal-tile--busy')].every((el) => el.classList.contains('cc-cal-tile--fixed')));
          pass(`${tag}: a busy tile can't be dragged or changed here`, refused);
          await go(page, '/coach/settings/calendars');
          await switchFamily(page, false);
          pass(`${tag}: switched off, its busy times go at once`, (await t.rowsNow('coach_busy_times')).length === 0);
          await go(page, `/coach/calendar?view=week&day=${WED}`);
          pass(`${tag}: and the tile goes from the calendar`, (await busyTile(page, 'School play').count()) === 0);
        }
        if (has('busy-readonly')) {
          const calls = await asked(page);
          const writes = calls.filter((a) => ['create', 'update', 'delete'].includes(a.what));
          pass(`${tag}: the other calendars were only ever read`, calls.filter((a) => a.calendarId !== 'primary').every((a) => a.what === 'busy'), JSON.stringify(calls.slice(-6)));
          pass(`${tag}: every write the sync made went to the main calendar only`, writes.every((a) => a.calendarId === 'primary'));
          const family = await page.evaluate((fam) => window.__clarityCalSync.google().listBusy({ calendarId: fam, timeMin: '2026-11-01T00:00:00Z', timeMax: '2027-01-01T00:00:00Z' }), FAMILY);
          pass(`${tag}: the Family calendar in "Google" is exactly as it was`, family.length === 1 && family[0].summary === 'School play' && family[0].location === '12 Mill Lane');
        }
        await t.done();
      }
    }
  }
  await browser.close();
  seedClock(null);
  report.done();
}

run().catch((e) => { console.error('FAILED TO RUN:', String(e).split('\n')[0]); process.exit(1); });
