// The coaching day, walked as one day (Phase 6a run 2; the functionality
// tester, 20 Nov): the parts of flows.mjs whose names start "day-". A day as
// Tim on a laptop (the owner, 1440), then the same day as Maya on a phone (an
// associate, 400), each in both database modes:
//
//   device only  050 isn't there (as today): everything stays on the device.
//                Any write that leaves the page is stopped, listed as
//                `blocked` and fails the walk: the store must not even try.
//   there        049 and 050 answered by the stand-in in shared.mjs, shaped
//                as the SQL (its triggers and functions). Nothing but a read
//                ever reaches the test project.
//
// The page's clock is pinned to a day at or before the real one (never
// ahead: sign-in rule 46) and the seed counts its days from the same day.
// What a client shares, the access codes' table and every /api/ call are
// answered by stand-ins: nothing is ever sent.
//
// What today.mjs, sessions.mjs and leftovers.mjs already hold each screen
// to (the calm rules, the words, each panel on its own) is not repeated
// here: these walks check what a day carries from one step to the next,
// what reaches the database, and what the phone does differently.
//
//   PARTS=day-plan,day-calls,day-week,day-left,day-finances,day-client,day-move
//   ROLES=owner,associate   DB=none,there
import { accountId, APP, clearDevice, coachContext, codesStandIn, ME, OTHER, seedDevice, settle, standIn } from './shared.mjs';
import { DAY, ID, PRESSURE, seedClock, seedWithDay, SES, SHARED } from './seed.mjs';
import { clearCoaching, clientContext, clientStandIn, fromCoach } from './client.mjs';

export const DAY_PARTS = ['day-plan', 'day-calls', 'day-week', 'day-left', 'day-finances', 'day-client', 'day-move'];

const TUE = new Date(2026, 10, 17, 9, 0);
const EVE = new Date(2026, 10, 17, 18, 45);
const FRI = new Date(2026, 10, 13, 13, 30);
const TODAY = '2026-11-17';
const TOMORROW = '2026-11-18';
const YESTERDAY = '2026-11-16';
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Sessions these walks add to the seed: Priya's from yesterday and two of Hannah's, none written up.
const EXTRA = { priya: u(6950), hannahNoShow: u(6951), hannahTyped: u(6952), view: u(6960), cover: u(6961) };
const SAM_SPRINT = u(6970); // Sam's sprint (run 6, item 5): its own standard is 80

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const press = async (page, name) => { await button(page, name).click(); await settle(page, 450); };
const take = async (page) => { await page.locator('.ds-offer-take').click(); await settle(page, 500); };
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 450); };
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 800); };
const words = (page) => page.evaluate(() => document.querySelector('.cc-app').innerText);
const flat = (text) => text.replace(/\s+/g, ' ');
const pick = async (page, label, option) => {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const openFold = async (page, name) => { const b = page.locator('.cc-fold-btn', { hasText: name }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await settle(page, 300); } };
/** "4 hours 30 minutes", "45 min", "1 h 15 min" as minutes. */
const minutesOf = (text) => { const h = /(\d+)\s*h(?:ours?)?\b/.exec(text); const m = /(\d+)\s*min(?:utes?)?\b/.exec(text); return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1200); };

/**
 * The coaching day's walks. `report` is flows.mjs's own; `parts` the names asked for.
 * @param {{ browser: object, report: { pass: Function }, parts: string[] }} o
 */
export async function runDay({ browser, report, parts }) {
  const { pass } = report;
  const roles = (process.env.ROLES || 'owner,associate').split(',');
  const dbs = (process.env.DB || 'none,there').split(',');
  const has = (p) => parts.includes(p);

  /**
   * Opens a coach page on a pinned day. Device only: the seed is on the device and every write is stopped. There: the seed is
   * in the stand-in database, which answers 049 and 050.
   */
  async function openAt(at, { role, size, db, seedOptions = {}, seed = (rows) => rows, shares = false, path = '/coach', tag }) {
    const theme = role === 'owner' ? 'light' : 'dark';
    const there = db === 'there';
    const ctx = await coachContext(browser, { size, theme });
    const page = await ctx.newPage();
    const errors = [];
    const reached = [];
    const waits = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    // Anything but a read that a real server answered (a stand-in's answer has no server behind it) is a write that got out.
    page.on('response', (res) => {
      const req = res.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
      waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
    });
    await page.clock.setFixedTime(at);
    seedClock(at);
    const rows = seed(seedWithDay({ accounts: true, ...seedOptions }));
    const store = await standIn(page, there ? { role, db: 'there', day: true, strict: true, rows, now: () => new Date(at) } : { role, db: 'none' });
    // The portal's own questions on sign-in are answered with nothing, so none is stopped mid-way and none reaches the database.
    if (!there) await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
    const read = (body) => (route) => (route.request().method() === 'GET' ? json(route, body) : route.fallback());
    const user = (route) => (new URL(route.request().url()).searchParams.get('user_id') || '').replace(/^(eq\.|in\.\(|\))/g, '').replace(/\)$/, '');
    const prep = { now: SHARED.prep() };
    if (shares) {
      await page.route('**/rest/v1/peak_moments*', (route) => read(user(route).includes(SES.samUser) ? SHARED.moments(SES.samUser) : [])(route));
      await page.route('**/rest/v1/session_prep*', (route) => read(user(route) === SES.samUser ? prep.now : null)(route));
      // Sam's weeks carry their sprint, whose own standard is 80 (run 6, item 5): the brief's bar is coloured by it, never by 85.
      await page.route('**/rest/v1/week_scores*', (route) => read(user(route) === SES.samUser ? SHARED.weekScores().map((w) => ({ ...w, sprint_id: SAM_SPRINT })) : [])(route));
      await page.route('**/rest/v1/sprints*', (route) => read(new URL(route.request().url()).searchParams.get('id')?.includes(SAM_SPRINT) ? [{ id: SAM_SPRINT, standard: 80 }] : [])(route));
      await page.route('**/rest/v1/peak_reviews*', (route) => read(user(route) === SES.samUser ? SHARED.reviews() : [])(route));
      await page.route('**/rest/v1/checkins*', (route) => read(user(route) === SES.priyaUser ? SHARED.checkins() : [])(route));
    } else {
      await page.route('**/rest/v1/peak_moments*', read(PRESSURE.moments()));
      for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, read(t === 'session_prep' ? null : []));
    }
    const codes = await codesStandIn(page);
    const heard = [];
    if (process.env.DIAG_DIR) page.on('console', (m) => heard.push(`console ${m.type()}: ${m.text().replace(/eyJ[\w.-]+/g, '<token>').slice(0, 200)}`));
    if (process.env.DIAG_DIR) page.on('response', (res) => { const u = new URL(res.url()); if (/\/(rest|auth)\/v1\//.test(u.pathname)) heard.push(`${res.request().method()} ${u.pathname.replace(/\/(rest|auth)\/v1/, '')} ${res.status()}`); });
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 }).catch(async (e) => {
      // DIAG_DIR: what the page shows when the coach portal never opens (no tokens; the stand-in's own call list).
      if (process.env.DIAG_DIR) {
        const { writeFileSync } = await import('node:fs');
        const text = await page.locator('body').innerText().catch(() => '');
        writeFileSync(`${process.env.DIAG_DIR}/${tag || 'open'}-${role}-${size}.txt`, [`url ${new URL(page.url()).pathname}`, `errors ${errors.join(' | ')}`, `calls ${(store?.calls || []).slice(-40).join(' | ')}`, `heard ${heard.join(' | ')}`, '---', text.slice(0, 1500)].join('\n'));
        await page.screenshot({ path: `${process.env.DIAG_DIR}/${tag || 'open'}-${role}-${size}.png` }).catch(() => {});
      }
      throw e;
    });
    const me = await accountId(page);
    await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
    await clearDevice(page, me);
    if (!there) await seedDevice(page, me, rows);
    await go(page, path);
    /** A table's rows as they are kept: in the stand-in database, or on the device before 050. */
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    return {
      page, ctx, store, codes, me, there, phone: size === 400, rowsNow, prep, tag,
      one: async (table, id, key = 'id') => (await rowsNow(table)).find((r) => r[key] === id) || null,
      done: async ({ refusals = 0 } = {}) => {
        await settle(page, 600);
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
        pass(`${tag}: nothing but a read reached the test project, and no email server was asked for real`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
        if (there) {
          // Only the tables this stand-in holds (049 and 050) are "there": a later migration's rows (052's
          // client_check_ins, suggested when coaching ends) wait on the device by design until it runs
          // (coach rule 10; run 6, item 58: the check counted them, so it failed on every build).
          const waiting = await page.evaluate(([id, there]) => {
            const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || 'null');
            if (!s) return '';
            // What waits, by table and mark (never the rows' words), so a failure says where to look.
            return Object.entries(s.marks || {}).filter(([t]) => there.includes(t)).flatMap(([t, m]) => Object.values(m).filter((x) => !x.sent).map((x) => `${t}${x.refused ? ' refused' : ''}${x.gone ? ' gone' : ''}`)).join('; ')
              || (Object.keys(s.marks || {}).some((t) => !there.includes(t)) ? '' : 'kept, all sent');
          }, [me, Object.keys(store.rows)]);
          pass(`${tag}: everything reached the database, and nothing waits on the device`, !waiting, waiting);
          const refused = store.calls.filter((c) => c.startsWith('refused'));
          pass(`${tag}: the database refused nothing the page sent`, refused.length === refusals, [...new Set(refused)].slice(0, 5).join('; '));
        } else {
          pass(`${tag}: on the device nothing asks an email server`, !store.calls.some((c) => c.startsWith('api ')), store.calls.filter((c) => c.startsWith('api ')).join('; '));
        }
        pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  // ================================================================ steps 1 to 3: plan the morning, six quick adds, the over-full day
  async function planPart(o) {
    const tag = `day-plan, ${o.who}`;
    const t = await openAt(TUE, { ...o, tag });
    const { page, phone } = t;
    const todo = (id) => t.one('coach_todos', id);
    const dayRow = async () => (await t.rowsNow('coach_days')).find((d) => d.day === TODAY) || null;

    // ---- 1. Plan the morning
    pass(`${tag}: the morning offers Plan my day, and the day starts 45 minutes over`, /Plan my day/.test(await words(page)) && /Today is 45 minutes over\./.test(await words(page)));
    let chosenTime = null;
    const plan = async () => {
      await take(page);
      await dialog(page).getByRole('checkbox', { name: 'Keep “Draft the Northfield workshop outline” for today' }).click(); // unticked: it goes to tomorrow
      await press(page, 'Next');
      await dialog(page).getByRole('checkbox', { name: 'Do “Call Priya about the keynote” today' }).click();
      await dialog(page).getByRole('checkbox', { name: 'Do “Pull Sam’s progress for the review” today' }).click();
      await press(page, 'Next');
      await dialog(page).locator('[aria-label="Add a time for “Pull Sam’s progress for the review”"]').click(); await settle(page, 300);
      await dialog(page).getByRole('combobox').first().click(); await settle(page, 300);
      const options = await page.getByRole('option').allInnerTexts();
      chosenTime = options.includes('11:00') ? '11:00' : options[1];
      await page.getByRole('option', { name: chosenTime, exact: true }).click(); await settle(page, 300);
      await press(page, 'Start my day');
      await settle(page, 500);
    };
    const planned = async (again = '') => {
      const text = await words(page);
      pass(`${tag}: Start my day says “Your day is planned”${again}`, (await toast(page)) === 'Your day is planned', await toast(page));
      pass(`${tag}: the two picked are in today’s list, the one sent on has gone, the one kept stays${again}`, /Call Priya about the keynote/.test(text) && /Pull Sam’s progress for the review/.test(text) && !/Draft the Northfield workshop outline/.test(text) && /Check in with Tom Hale on the decision/.test(text));
      pass(`${tag}: the offer has gone${again}`, !/Plan my day/.test(text));
      const [t3, t4, t13, t10, d] = [await todo(DAY.t3), await todo(DAY.t4), await todo(DAY.t13), await todo(DAY.t10), await dayRow()];
      pass(`${tag}: the carried-over one unticked is planned for tomorrow, the kept one is still today’s${again}`, t3?.planned_on === TOMORROW && t10?.planned_on <= TODAY && !t10?.done_at, `${t3?.planned_on} ${t10?.planned_on}`);
      pass(`${tag}: the two upcoming ones are planned for today, one at the time given${again}`, t4?.planned_on === TODAY && t13?.planned_on === TODAY && String(t13?.planned_time || '').startsWith(chosenTime), `${t4?.planned_on} ${t13?.planned_on} ${t13?.planned_time}`);
      pass(`${tag}: the day’s plan is kept, with its to-dos in order${again}`, Boolean(d?.planned_at) && d.plan_todos.includes(DAY.t4) && d.plan_todos.includes(DAY.t13) && !d.plan_todos.includes(DAY.t3), JSON.stringify(d || null).slice(0, 120));
      pass(`${tag}: with the big one moved on, the day fits${again}`, !/minutes over/.test(text));
    };
    await plan();
    await planned();
    await undo(page);
    {
      const text = await words(page);
      const [t3, t4, t13, d] = [await todo(DAY.t3), await todo(DAY.t4), await todo(DAY.t13), await dayRow()];
      pass(`${tag}: Undo puts every to-do back where it was`, t3?.planned_on === YESTERDAY && t4?.planned_on === TOMORROW && t13?.planned_on === TOMORROW && !t13?.planned_time, `${t3?.planned_on} ${t4?.planned_on} ${t13?.planned_on} ${t13?.planned_time}`);
      pass(`${tag}: Undo takes the day’s plan away, and the offer is back`, !d?.planned_at && /Plan my day/.test(text) && /Today is 45 minutes over\./.test(text), JSON.stringify(d || null).slice(0, 100));
    }
    await plan();
    await planned(', planned again');

    // ---- 2. Six to-dos through the quick add
    await go(page, '/coach/todos');
    let first = true;
    const add = async (text, chips, said) => {
      if (phone) {
        await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600);
        if (first) {
          const box = await dialog(page).boundingBox();
          pass(`${tag}: on a phone the quick add opens full screen`, Boolean(box) && Math.round(box.width) === 400 && Math.round(box.height) >= 850 && Math.round(box.x) === 0 && Math.round(box.y) === 0, JSON.stringify(box));
        }
      } else if (first) pass(`${tag}: on a laptop the quick add is on the page`, (await page.locator('.cc-col > .cc-qadd').count()) === 1);
      first = false;
      const scope = phone ? dialog(page) : page.locator('.cc-col > .cc-qadd');
      await scope.getByLabel('What needs doing?').fill(text);
      await settle(page, 300);
      const read = await scope.locator('.cc-qadd-chips li').allInnerTexts();
      pass(`${tag}: “${text}” is read as ${chips.join(', ')}`, chips.every((c) => read.includes(c)) && read.length === chips.length, read.join(', '));
      await scope.getByRole('button', { name: 'Add to-do', exact: true }).click();
      await settle(page, 800);
      pass(`${tag}: “${text}” says “${said}”`, (await toast(page)) === said, await toast(page));
    };
    const byTitle = async (title) => (await t.rowsNow('coach_todos')).find((r) => r.title === title) || null;
    const links = async (todoId) => (await t.rowsNow('coach_tag_links')).filter((l) => l.item_kind === 'todo' && l.item_id === todoId);

    await add('Call the venue about parking 30 min !', ['Today', 'Important', '30 min'], 'Added to Today.');
    await add('Prepare the board pack 45 minutes ! #Kestrel renewal', ['Today', 'Kestrel renewal', 'Important', '45 min'], 'Added to Today.');
    await add('Outline chapter 4 #The book', ['Today', 'The book'], 'Added to Today.');
    await add('Email Dana the agenda @Email', ['Today', 'Email'], 'Added to Today.');
    {
      const row = await byTitle('Email Dana the agenda');
      pass(`${tag}: a tag typed with @ is linked to the new to-do`, Boolean(row) && (await links(row.id)).some((l) => l.tag_id === DAY.tagEmail), JSON.stringify(row ? await links(row.id) : null));
      await undo(page);
      pass(`${tag}: Undo takes the new to-do away, and its tag with it`, !(await byTitle('Email Dana the agenda')) && (await links(row?.id)).length === 0);
    }
    await add('Email Dana the agenda @Email', ['Today', 'Email'], 'Added to Today.');
    await add('Book the train to Leeds tomorrow 1h', ['Tomorrow', '1 h'], 'Added to Tomorrow.');
    await add('Water the plants after work', ['After work, today'], 'Added to After work.');
    {
      const [a, b, c, d, e, f] = [await byTitle('Call the venue about parking'), await byTitle('Prepare the board pack'), await byTitle('Outline chapter 4'), await byTitle('Email Dana the agenda'), await byTitle('Book the train to Leeds'), await byTitle('Water the plants')];
      pass(`${tag}: the two Important ones are kept Important, with their estimates, for today`, a?.important === true && a.minutes === 30 && a.planned_on === TODAY && b?.important === true && b.minutes === 45 && b.planned_on === TODAY, JSON.stringify([a?.minutes, b?.minutes]));
      pass(`${tag}: # puts a to-do in its list`, b?.list_id === DAY.listKestrel && c?.list_id === DAY.listBook, `${b?.list_id} ${c?.list_id}`);
      pass(`${tag}: “tomorrow” and “after work” land where their words say`, e?.planned_on === TOMORROW && e.minutes === 60 && !e.after_work && f?.planned_on === TODAY && f.after_work === true && d?.planned_on === TODAY && !d.after_work, JSON.stringify([e?.planned_on, f?.after_work]));
      pass(`${tag}: each is the coach’s own to-do, never a client’s`, [a, b, c, d, e, f].every((r) => r && r.coach_id === ME && !('user_id' in r) && !('sprint_id' in r)));
      const lists = await page.evaluate(() => [...document.querySelectorAll('#cc-todo-tab [role=list]')].map((l) => ({ label: l.getAttribute('aria-label'), rows: [...l.querySelectorAll('.cc-todo-row')].map((r) => ({ title: r.querySelector('.ds-todo-text')?.childNodes[0]?.textContent || '', important: Boolean(r.querySelector('.ds-todo--important')) })) })));
      const work = lists.find((l) => l.label === 'Today')?.rows || [];
      const afterWork = lists.find((l) => l.label === 'After work')?.rows || [];
      const firstPlain = work.findIndex((r) => !r.important);
      pass(`${tag}: on Today the Important ones sort first, the new two among them`, firstPlain === 3 && work.slice(firstPlain).every((r) => !r.important) && work.slice(0, 3).some((r) => r.title.includes('Call the venue')) && work.slice(0, 3).some((r) => r.title.includes('Prepare the board pack')), work.map((r) => `${r.important ? '!' : ''}${r.title.slice(0, 18)}`).join(' | '));
      pass(`${tag}: the tagged one and the listed one are in today’s list, the “after work” one under After work`, work.some((r) => r.title.includes('Email Dana')) && work.some((r) => r.title.includes('Outline chapter 4')) && afterWork.some((r) => r.title.includes('Water the plants')) && !work.some((r) => r.title.includes('Water the plants')));
      await page.getByRole('tab', { name: 'Upcoming' }).click(); await settle(page, 600);
      const upcoming = flat(await page.locator('#cc-todo-tab').innerText());
      pass(`${tag}: the one for tomorrow is under Tomorrow on Upcoming`, /Tomorrow[^|]*Book the train to Leeds/i.test(upcoming.split(/Thu 19 Nov|Fri 20 Nov/)[0]), upcoming.slice(0, 200));
      if (phone) {
        const strip = await page.locator('.cc-utabs').evaluate((el) => ({ overflow: getComputedStyle(el).overflowX, sideways: document.documentElement.scrollWidth - window.innerWidth }));
        pass(`${tag}: on a phone the tabs scroll in their own strip, and the page never scrolls sideways`, ['auto', 'scroll'].includes(strip.overflow) && strip.sideways <= 0, JSON.stringify(strip));
      }
      await page.getByRole('tab', { name: 'Today' }).click(); await settle(page, 600);
      if (phone) {
        // Press and hold chooses a row; once choosing has begun a tap chooses another.
        const rows = page.locator('.cc-todo-row');
        await rows.nth(3).dispatchEvent('pointerdown', { bubbles: true, pointerType: 'touch' });
        await settle(page, 650);
        await rows.nth(3).dispatchEvent('pointerup', { bubbles: true, pointerType: 'touch' });
        await settle(page, 250);
        const one = await page.locator('.cc-todo-bulk').innerText().catch(() => '');
        await rows.nth(4).locator('.cc-todo-open').click(); await settle(page, 300);
        const two = await page.locator('.cc-todo-bulk').innerText().catch(() => '');
        pass(`${tag}: on a phone press and hold chooses a to-do, then a tap chooses another`, /1 chosen/.test(one) && /2 chosen/.test(two) && (await page.locator('.ds-modal--shown').count()) === 0, `${flat(one)} / ${flat(two)}`);
        await page.getByRole('button', { name: 'Clear the choice' }).click(); await settle(page, 300);
      }
    }

    // ---- 3. The day is 45 minutes over again
    await go(page, '/coach');
    const over = page.locator('.cc-today-over');
    pass(`${tag}: with the new to-dos the line reads “Today is 45 minutes over.”`, flat(await over.innerText().catch(() => '')) === 'Today is 45 minutes over.', await over.innerText().catch(() => 'no line'));
    pass(`${tag}: “45 minutes over” is a link inside the sentence, with no button`, (await over.locator('.cc-inline-link').innerText().catch(() => '')) === '45 minutes over' && (await over.locator('.ds-btn').count()) === 0);
    await over.locator('.cc-inline-link').click(); await settle(page, 500);
    {
      const sums = await dialog(page).locator('.cc-today-sum .cc-line-state').allInnerTexts();
      const [calls, todos, day] = sums.map(minutesOf);
      pass(`${tag}: the panel’s three rows add up to 45 minutes over`, sums.length === 3 && calls + todos - day === 45 && calls === 270 && day === 435, sums.join(' | '));
    }
    const openMove = async () => { await dialog(page).getByRole('button', { name: 'Choose what to move' }).click(); await settle(page, 500); };
    await openMove();
    const ticked = async () => dialog(page).locator('[role=checkbox][aria-checked=true]').evaluateAll((boxes) => boxes.map((b) => ({ label: b.getAttribute('aria-label'), minutes: b.closest('.cc-today-pick').querySelector('.ds-todo-tag')?.textContent || '' })));
    const line = () => dialog(page).locator('.cc-today-nudge--first').innerText();
    const suggested = await ticked();
    const freed = suggested.reduce((n, s) => n + minutesOf(s.minutes), 0);
    pass(`${tag}: Choose what to move suggests enough to fit the day`, suggested.length > 0 && freed >= 45 && (await line()) === 'That fits your day.', `${suggested.length} ticked, ${freed} minutes; ${await line()}`);
    pass(`${tag}: it never suggests an Important one, or one with no estimate`, suggested.every((s) => !/, important$/.test(s.label) && minutesOf(s.minutes) > 0), suggested.map((s) => s.label).join(' | '));
    pass(`${tag}: the button counts what is ticked`, (await dialog(page).locator('.ds-btn--primary').innerText()) === `Move ${suggested.length} to tomorrow`, await dialog(page).locator('.ds-btn--primary').innerText());
    {
      const one = suggested[0];
      await dialog(page).getByRole('checkbox', { name: one.label, exact: true }).click(); await settle(page, 250);
      const still = 45 - (freed - minutesOf(one.minutes));
      const said = await line();
      pass(`${tag}: unticking one reads “Still … over.”, by exactly what it frees`, /^Still .+ over\.$/.test(said) && minutesOf(said) === still && still > 0, `${said} (expected ${still} minutes)`);
      await dialog(page).getByRole('checkbox', { name: one.label, exact: true }).click(); await settle(page, 250);
      pass(`${tag}: ticking it again reads “That fits your day.”`, (await line()) === 'That fits your day.', await line());
    }
    const moveNow = async () => { await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 800); };
    await moveNow();
    const titles = suggested.map((s) => /“(.+)”/.exec(s.label)[1]);
    const movedRows = async () => (await t.rowsNow('coach_todos')).filter((r) => titles.includes(r.title));
    pass(`${tag}: moving says how many, and the line goes`, (await toast(page)) === `${suggested.length} moved to tomorrow` && !/minutes over/.test(await words(page)), await toast(page));
    pass(`${tag}: what was moved is planned for tomorrow, and nothing Important moved`, (await movedRows()).length === titles.length && (await movedRows()).every((r) => r.planned_on === TOMORROW && !r.important), (await movedRows()).map((r) => r.planned_on).join(','));
    await undo(page);
    pass(`${tag}: Undo brings the to-dos, and the line, back`, /Today is 45 minutes over\./.test(await words(page)) && (await movedRows()).every((r) => r.planned_on <= TODAY), (await movedRows()).map((r) => r.planned_on).join(','));
    await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 500);
    await openMove();
    await moveNow();
    pass(`${tag}: moved again, the day fits`, !/minutes over/.test(await words(page)) && (await movedRows()).every((r) => r.planned_on === TOMORROW));
    if (t.there) {
      const sent = t.store.calls.filter((c) => /^(POST|PATCH|DELETE) coach_(todos|days|tag_links)/.test(c));
      pass(`${tag}: the plan, the to-dos and the tag reached the database as the coach’s own rows`, sent.some((c) => c === 'POST coach_todos') && sent.some((c) => c === 'POST coach_days') && sent.some((c) => c === 'DELETE coach_days') && t.store.rows.coach_todos.every((r) => r.coach_id === ME), [...new Set(sent)].join(', '));
    }
    // ---- run 6, item 12: M11's "2 weeks after I finish it", through the quick add, then ticked a day late
    {
      const title = 'Send the invoices';
      await go(page, '/coach/todos');
      await add(`${title} 2 weeks after I finish it`, ['Today', '2 weeks after I finish it'], 'Added to Today.');
      const made = await byTitle(title);
      pass(`${tag}: the repeat is kept as a rule counted from finishing`, JSON.stringify(made?.repeat_rule) === JSON.stringify({ every: 'week', interval: 2, from: 'done' }) && made.planned_on === TODAY, JSON.stringify(made?.repeat_rule));
      await page.getByRole('checkbox', { name: `Mark “${title}” as done` }).first().click(); await settle(page, 900);
      const all = (await t.rowsNow('coach_todos')).filter((r) => r.title === title);
      const next = all.find((r) => !r.done_at);
      // Ticked today (Tue 17 Nov): the next comes 2 weeks after the day it was finished, Tue 1 Dec.
      pass(`${tag}: ticking it makes the next one, 2 weeks after the day it was finished, with the same rule`, all.length === 2 && all.some((r) => r.done_at) && next?.planned_on === '2026-12-01' && next.repeat_rule?.from === 'done', JSON.stringify(all.map((r) => [r.planned_on, Boolean(r.done_at)])));
      await page.getByRole('tab', { name: 'Upcoming' }).click(); await settle(page, 600);
      pass(`${tag}: the next one shows on Upcoming`, flat(await page.locator('#cc-todo-tab').innerText()).includes(title));
      await page.getByRole('tab', { name: 'Today' }).click(); await settle(page, 400);
    }
    await t.done();
  }

  // ================================================================ steps 4 to 8: the brief, a call written up and sent, what happened, the close
  const callsSeed = (clientUser = null) => (rows) => {
    const session = (id, starts, who) => ({
      id, coach_id: ME, profile_id: null, group_id: null, engagement_id: null, kind: 'coaching', starts_at: starts.toISOString(), minutes: 60, place: null, outcome: null, waived: false,
      moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null, created_at: new Date(2026, 9, 8, 9, 0).toISOString(), ...who,
    });
    const hannah = { profile_id: SES.hannah, engagement_id: SES.eHannah };
    return {
      ...rows,
      client_profiles: rows.client_profiles.map((p) => (clientUser && p.id === SES.hannah ? { ...p, user_id: clientUser } : p)),
      coach_sessions: [
        ...rows.coach_sessions,
        session(EXTRA.priya, new Date(2026, 10, 16, 10, 0), { profile_id: ID.priya, engagement_id: ID.ePriya }),
        session(EXTRA.hannahNoShow, new Date(2026, 10, 11, 11, 0), hannah),
        session(EXTRA.hannahTyped, new Date(2026, 10, 10, 11, 0), hannah),
      ],
    };
  };

  async function callsPart(o) {
    const tag = `day-calls, ${o.who}`;
    const t = await openAt(TUE, { ...o, tag, seedOptions: { sessions: true }, seed: callsSeed(), shares: true });
    const { page, phone, there, store } = t;
    const session = (id) => t.one('coach_sessions', id);
    const engagement = (id) => t.one('engagements', id);
    const toGo = async (total) => (new RegExp(`(\\d+) of ${total}`).exec(await words(page)) || [])[1] || null;

    // ---- 4. The brief, from a call
    await page.locator('.cc-today-call--open').first().click(); await settle(page, 900);
    {
      const text = await dialog(page).innerText();
      pass(`${tag}: the brief opens from the call, every section in order`, /Sam Okafor[\s\S]*Today, 12:30[\s\S]*60 minutes, Zoom[\s\S]*Prefers early calls[\s\S]*FOR THIS CALL[\s\S]*FROM LAST TIME[\s\S]*SINCE LAST TIME[\s\S]*COMING UP[\s\S]*YOUR NOTE FROM LAST TIME/i.test(text), flat(text).slice(0, 160));
      const row = (state) => dialog(page).getByRole('button', { name: new RegExp(`^Draft the restructure announcement, ${state}\\.`) });
      await row('not yet').click(); await settle(page, 700);
      let b3 = await t.one('coach_session_actions', SES.b3);
      pass(`${tag}: From last time switches to Done, and saves`, (await toast(page)) === 'Saved' && Boolean(b3?.done_at) && (await row('done').count()) === 1, `${await toast(page)} ${b3?.done_at}`);
      pass(`${tag}: marking it done changes nothing the client was sent`, b3?.title === 'Draft the restructure announcement' && b3.send === true && b3.goes_to === 'week');
      await row('done').click(); await settle(page, 700);
      b3 = await t.one('coach_session_actions', SES.b3);
      pass(`${tag}: and back to Not yet, saved again`, (await toast(page)) === 'Saved' && !b3?.done_at && (await row('not yet').count()) === 1, `${b3?.done_at}`);
      const stat = dialog(page).locator('.cc-brief-stat');
      const bar = { value: (await stat.locator('.ds-stat-value').innerText().catch(() => '')).trim(), below: await stat.locator('.ds-bar--below').count() };
      pass(`${tag}: the brief's bar is coloured by Sam's own standard of 80, so an average of 81% has no grey "below" band (85 would have had one)`, bar.value === '81%' && bar.below === 0, JSON.stringify(bar));
      await closePanel(page);
    }

    // ---- 5. Write up a call and send the recap
    const priyaLine = async () => { const all = page.getByRole('button', { name: /^Show all \d+$/ }); if (await all.count()) { await all.click(); await settle(page, 300); } return (/Priya has [^.]+\./.exec(await words(page)) || [''])[0]; };
    const card = async () => {
      await go(page, '/coach/clients');
      if (phone) { await press(page, 'View'); await page.getByRole('menuitemcheckbox', { name: 'Board' }).click(); } else await page.getByRole('button', { name: 'Board', exact: true }).click();
      await settle(page, 700);
      return flat(await page.locator(`[data-card="${ID.priya}"]`).innerText());
    };
    const before = { attention: await priyaLine(), card: await card() };
    await go(page, `/coach/clients/${ID.priya}`);
    before.page = await toGo(6);
    pass(`${tag}: before the call is written up Priya has 2 of 6 to go, on her page, the board and Today`, before.page === '2' && /2 of 6 to go/.test(before.card) && before.attention === 'Priya has 2 sessions left.', JSON.stringify(before));

    await go(page, `/coach/sessions/${EXTRA.priya}`);
    pass(`${tag}: a call that has ended opens as “It went ahead”, 60 minutes`, (await page.getByRole('combobox', { name: /^What happened/ }).innerText()).includes('It went ahead') && /60 minutes/.test(await page.locator('.cc-ses-long [aria-checked=true], .cc-ses-long [aria-pressed=true]').first().innerText().catch(() => '')));
    const RECAP = 'Thanks for today, Priya.\n\nWe looked at the theatre list and what you take home from it. You chose the two handovers that matter most.';
    await page.getByLabel('Recap for Priya').fill(RECAP);
    for (const title of ['Hand the Thursday list to Dr Osei', 'Block 30 minutes after each list', 'Read the handover checklist']) {
      await page.locator('.ds-addrow', { hasText: 'Add action' }).click(); await settle(page, 300);
      await page.keyboard.type(title);
      await settle(page, 200);
    }
    await page.locator('.cc-ses-act').nth(1).locator('.cc-ses-where').click(); await settle(page, 200); // the second goes to the Backlog
    await page.getByRole('checkbox', { name: 'Send “Read the handover checklist” to Priya' }).click(); await settle(page, 200); // the third isn't sent
    await page.getByLabel('Focus').fill('Leading the theatre list.');
    await page.getByLabel('Insight').fill('Priya plans best out loud.');
    await page.getByLabel('Next time').fill('Ask how the first handover went.');
    await page.getByLabel('Notes for supervision').fill('I held the silence longer this time.');
    await settle(page, 1800);
    {
      const s = await session(EXTRA.priya);
      const acts = (await t.rowsNow('coach_session_actions')).filter((a) => a.session_id === EXTRA.priya);
      pass(`${tag}: everything typed is saved as it is typed, before anything is sent`, s?.recap === RECAP && s.outcome === 'held' && !s.recap_sent_at && acts.length === 3, `${s?.outcome} ${acts.length} actions`);
    }
    if (there) store.api.live = true; // the live site's email server
    await button(page, 'Send the recap').dblclick();
    await settle(page, 1500);
    const sentWords = there ? 'Sent. Priya gets it by email and in the portal, with the actions you ticked.' : 'Sent. Priya sees it in the portal, with the actions you ticked.';
    pass(`${tag}: Send the recap says exactly what happened (${there ? 'the email server answered that it sent' : 'no email before 050'})`, (await toast(page)) === sentWords, await toast(page));
    {
      const text = await words(page);
      pass(`${tag}: the page turns read-only, and Send can’t be pressed again`, text.includes('The recap has been sent, so this session stays as it is.') && (await page.locator('.cc-ses-bar').count()) === 0 && (await page.getByRole('combobox').count()) === 0 && (await page.locator('.cc-ses-act').count()) === 0);
      pass(`${tag}: the sent actions say where they went, and the unticked one that it wasn’t sent`, /Hand the Thursday list to Dr Osei\s+Goes to this week[\s\S]*Block 30 minutes after each list\s+Goes to the Backlog[\s\S]*Read the handover checklist\s+Not sent/.test(text), (text.match(/ACTIONS[\s\S]{0,220}/i) || [''])[0].replace(/\s+/g, ' '));
      const s = await session(EXTRA.priya);
      const acts = (await t.rowsNow('coach_session_actions')).filter((a) => a.session_id === EXTRA.priya).sort((a, b) => a.position - b.position);
      const notes = await t.one('coach_session_notes', EXTRA.priya, 'session_id');
      pass(`${tag}: the session is kept as sent: it went ahead, the recap as typed, sent now`, s?.outcome === 'held' && s.recap === RECAP && Boolean(s.recap_sent_at) && s.minutes === 60, `${s?.outcome} ${s?.recap_sent_at}`);
      pass(`${tag}: three actions: two to send (one to the Backlog), one not sent`, acts.length === 3 && acts[0].send === true && acts[0].goes_to === 'week' && acts[1].send === true && acts[1].goes_to === 'backlog' && acts[2].send === false, JSON.stringify(acts.map((a) => [a.send, a.goes_to])));
      pass(`${tag}: the private notes and For supervision are kept, the coach’s alone`, notes?.focus === 'Leading the theatre list.' && notes.insight === 'Priya plans best out loud.' && notes.next_time === 'Ask how the first handover went.' && notes.supervision === 'I held the silence longer this time.' && notes.coach_id === ME);
    }
    if (there) {
      const sends = store.sends.filter((x) => x.session === EXTRA.priya);
      const claims = store.claims.filter((x) => x.session === EXTRA.priya);
      pass(`${tag}: pressed twice, the database was asked to send once, and answered “sent”`, sends.length === 1 && sends[0].answer === 'sent', JSON.stringify(sends));
      pass(`${tag}: the email was claimed once, and the server asked once`, claims.length === 1 && claims[0].first === true && store.api.asked.filter((a) => a.kind === 'recap' && a.sessionId === EXTRA.priya).length === 1 && Object.keys(store.api.asked[0]).length === 2, JSON.stringify(claims));
      pass(`${tag}: the database keeps sessions left from the session: 5 held of 6`, (await engagement(ID.ePriya))?.sessions_held === 5 && (await engagement(ID.ePriya))?.sessions_held_base === 4, JSON.stringify(await engagement(ID.ePriya)).slice(0, 160));
    } else {
      pass(`${tag}: nothing asked the email server`, !store.calls.some((c) => c.startsWith('api ')), store.calls.filter((c) => c.startsWith('api ')).join('; '));
    }
    await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 1200);
    pass(`${tag}: after a reload it is still sent and read-only, with nothing to press`, (await words(page)).includes('The recap has been sent') && (await page.locator('.cc-ses-bar').count()) === 0 && (await words(page)).includes('You chose the two handovers that matter most.'));
    await go(page, `/coach/clients/${ID.priya}`);
    const after = { page: await toGo(6) };
    await go(page, '/coach');
    after.attention = await priyaLine();
    after.card = await card();
    pass(`${tag}: sessions left drops by one on Priya’s page, the board and Today’s attention`, after.page === '1' && /1 of 6 to go/.test(after.card) && after.attention === 'Priya has 1 session left.', JSON.stringify(after));

    if (there) {
      // The other answer: a preview's email server says it never sends. The recap still goes in the portal, and nothing is claimed.
      store.api.live = false;
      await go(page, `/coach/sessions/${SES.write}`);
      await press(page, 'Send the recap');
      await settle(page, 900);
      pass(`${tag}: when the email server answers that nothing was sent, the toast says only “in the portal”`, (await toast(page)) === 'Sent. Hannah sees it in the portal, with the actions you ticked.', await toast(page));
      pass(`${tag}: that recap is sent once too, and no email was claimed for it`, store.sends.filter((x) => x.session === SES.write).length === 1 && store.claims.filter((x) => x.session === SES.write).length === 0 && Boolean((await session(SES.write))?.recap_sent_at) && !(await session(SES.write))?.recap_emailed_at);
      pass(`${tag}: already held, so sending it changes no count`, (await engagement(SES.eHannah))?.sessions_held === 6, `${(await engagement(SES.eHannah))?.sessions_held}`);
    }

    if (there) {
      // Sent from another device meanwhile: this page still shows Leo's recap as unsent. What is typed here can't replace what
      // the client was given: from run 6 (item 3) this tab's save is refused as changed in another tab, said calmly with
      // "Reload to see it" (never "Saved"), and the page shows the session as it was sent, with nothing to press.
      const leo = store.rows.coach_sessions.find((s) => s.profile_id === ID.leo && s.outcome === 'held' && !s.recap_sent_at);
      leo.updated_at ||= '2026-11-16T18:00:00.000Z'; // a database row always has one (the seed's rows may not)
      await go(page, `/coach/sessions/${leo.id}`);
      const asSent = leo.recap;
      store.fn.session_send_recap(store.coaches[0].user_id, leo.id); // the other device's Send
      // The stand-in's clock is pinned to the walk's Tuesday; the database's own updated_at moves on with every change.
      leo.updated_at = new Date(Date.parse(leo.updated_at || '2026-11-16T18:00:00.000Z') + 60000).toISOString();
      await page.getByLabel('Recap for Leo').fill('Rewritten here, after it went from the other device.');
      await settle(page, 1800);
      pass(`${tag}: a recap sent from another device can’t be rewritten from here (the database keeps it as sent)`, leo.recap === asSent && Boolean(leo.recap_sent_at), leo.recap.slice(0, 60));
      const text = await words(page);
      pass(`${tag}: the page says it changed in another tab, with a way to see it`, /This session changed in another tab\./.test(text) && (await page.getByRole('button', { name: 'Reload to see it' }).count()) === 1 && (await toast(page)) !== 'Saved', flat(text).slice(-160));
      pass(`${tag}: and shows the session as it was sent, read-only, with nothing sent twice`, text.includes('The recap has been sent, so this session stays as it is.') && text.includes(asSent) && !text.includes('Rewritten here') && (await page.locator('.cc-ses-bar').count()) === 0
        && store.sends.filter((x) => x.session === leo.id).length === 0 && store.claims.filter((x) => x.session === leo.id).length === 0, flat((text.match(/RECAP[\s\S]{0,200}/i) || [''])[0]));
    }

    // ---- 6. A late cancellation: it counts; Waive it; Undo
    const hannahHeld = async (n) => !there || (await engagement(SES.eHannah))?.sessions_held === n;
    const backToHannah = async () => { await page.locator('.cc-backrow button, .cc-backrow a').first().click(); await page.waitForSelector('.cc-fold-btn'); await settle(page, 700); };
    await go(page, `/coach/clients/${SES.hannah}`);
    pass(`${tag}: Hannah starts with 6 of 12 to go`, (await toGo(12)) === '6', await toGo(12));
    await go(page, `/coach/sessions/${SES.blank}`);
    await pick(page, 'What happened', 'Cancelled with under 24 hours’ notice');
    pass(`${tag}: a late cancellation says it counts`, (await words(page)).includes('It counts as one of Hannah’s sessions.'));
    await press(page, 'Save');
    await settle(page, 600);
    pass(`${tag}: Save says “Saved”, and it is kept as counting`, (await toast(page)) === 'Saved' && (await session(SES.blank))?.outcome === 'late_cancel' && (await session(SES.blank))?.waived === false && await hannahHeld(7), `${(await engagement(SES.eHannah))?.sessions_held}`);
    await press(page, 'Waive it');
    await settle(page, 600);
    pass(`${tag}: Waive it says it no longer counts`, (await toast(page)) === 'Waived. It no longer counts as used.' && (await session(SES.blank))?.waived === true && await hannahHeld(6), `${await toast(page)} ${(await engagement(SES.eHannah))?.sessions_held}`);
    await backToHannah();
    pass(`${tag}: waived, sessions left comes back`, (await toGo(12)) === '6', await toGo(12));
    await undo(page);
    pass(`${tag}: Undo counts it again, and sessions left drops`, (await session(SES.blank))?.waived === false && (await toGo(12)) === '5' && await hannahHeld(7), `${await toGo(12)} ${(await engagement(SES.eHannah))?.sessions_held}`);

    // ---- 7. A no-show counts; a moved session doesn't, and makes the new one
    await go(page, `/coach/sessions/${EXTRA.hannahNoShow}`);
    await pick(page, 'What happened', 'No-show');
    pass(`${tag}: a no-show says it counts, and only the coach sees it`, (await words(page)).includes('It counts as used, and only you see it.'));
    await press(page, 'Save');
    await settle(page, 600);
    await backToHannah();
    pass(`${tag}: a no-show counts: 4 of 12 to go`, (await session(EXTRA.hannahNoShow))?.outcome === 'no_show' && (await toGo(12)) === '4' && await hannahHeld(8), `${await toGo(12)} ${(await engagement(SES.eHannah))?.sessions_held}`);
    await go(page, `/coach/sessions/${SES.future}`);
    await pick(page, 'What happened', 'Moved');
    await page.locator('.cc-ses-two .ds-date').click(); await settle(page, 400);
    await page.locator('.ds-cal-day:not([disabled])', { hasText: /^26$/ }).first().click(); await settle(page, 400);
    await page.locator('.cc-ses-two input[type=time]').fill('16:00');
    await press(page, 'Save');
    await settle(page, 700);
    {
      const all = await t.rowsNow('coach_sessions');
      const moved = all.find((s) => s.id === SES.future);
      const made = all.find((s) => s.profile_id === SES.hannah && !s.outcome && new Date(s.starts_at).getDate() === 26);
      pass(`${tag}: Moved marks the session moved and makes the new one at the new time`, moved?.outcome === 'moved' && Boolean(moved.moved_to) && Boolean(made) && made.minutes === 60 && made.engagement_id === SES.eHannah && new Date(made.starts_at).getHours() === 16, JSON.stringify([moved?.outcome, made?.starts_at]));
      pass(`${tag}: the page says where it moved to`, (await words(page)).includes('It moved to Thu 26 Nov, 16:00.'));
      await backToHannah();
      pass(`${tag}: a moved session doesn’t count: still 4 of 12 to go`, (await toGo(12)) === '4' && await hannahHeld(8), `${await toGo(12)} ${(await engagement(SES.eHannah))?.sessions_held}`);
    }

    // ---- A count kept right: a recap typed (which marks the call as held) and, without leaving the portal, the engagement saved.
    await go(page, `/coach/sessions/${EXTRA.hannahTyped}`);
    await page.getByLabel('Recap for Hannah').fill('Thanks for today, Hannah. A first draft of the recap.');
    await settle(page, 1800);
    pass(`${tag}: typing a recap marks the call as held, so it counts`, (await session(EXTRA.hannahTyped))?.outcome === 'held' && await hannahHeld(9), `${(await engagement(SES.eHannah))?.sessions_held}`);
    await backToHannah();
    pass(`${tag}: Hannah’s page follows at once: 3 of 12 to go`, (await toGo(12)) === '3', await toGo(12));
    await openFold(page, 'Engagement');
    await page.getByRole('button', { name: 'End this engagement' }).click(); await settle(page, 800);
    pass(`${tag}: ending the engagement says so`, (await toast(page)) === 'Engagement ended' && (await engagement(SES.eHannah))?.status === 'ended', await toast(page));
    pass(`${tag}: saving the engagement never loses a recorded session from its count`, await hannahHeld(9), `${(await engagement(SES.eHannah))?.sessions_held} held, base ${(await engagement(SES.eHannah))?.sessions_held_base}`);
    await undo(page);
    pass(`${tag}: Undo brings the engagement back, with the same count`, (await engagement(SES.eHannah))?.status === 'active' && await hannahHeld(9) && (await toGo(12)) === '3', `${(await engagement(SES.eHannah))?.sessions_held} ${await toGo(12)}`);
    // A count the coach types stands; editing the engagement afterwards (its funder here) leaves the count alone, and so does Undo.
    await openFold(page, 'Sessions and recaps');
    await button(page, 'One more session held').click(); await settle(page, 800);
    pass(`${tag}: a count the coach types stands: 2 of 12 to go`, (await toast(page)) === 'Saved' && (await toGo(12)) === '2' && await hannahHeld(10), `${await toGo(12)} ${(await engagement(SES.eHannah))?.sessions_held}`);
    await page.getByRole('button', { name: 'End this engagement' }).locator('xpath=..').getByRole('button', { name: 'Edit', exact: true }).click(); await settle(page, 600);
    await dialog(page).getByLabel('Funded by').fill('Wells and Co');
    await dialog(page).getByRole('button', { name: 'Save my edit', exact: true }).click(); await settle(page, 900);
    pass(`${tag}: editing the engagement keeps the count: still 2 of 12 to go`, (await engagement(SES.eHannah))?.funded_by === 'Wells and Co' && (await toGo(12)) === '2' && await hannahHeld(10), `${(await toast(page))}; ${await toGo(12)} to go; ${(await engagement(SES.eHannah))?.sessions_held} held, base ${(await engagement(SES.eHannah))?.sessions_held_base}`);
    await undo(page);
    pass(`${tag}: and Undo of that edit keeps it too`, !(await engagement(SES.eHannah))?.funded_by && (await toGo(12)) === '2' && await hannahHeld(10), `${await toGo(12)} to go; ${(await engagement(SES.eHannah))?.sessions_held} held`);

    // ---- 8. The guided close, to the end
    await openFold(page, 'More');
    await press(page, 'Start the guided close');
    pass(`${tag}: Start the guided close opens it`, /\/close$/.test(page.url()));
    await go(page, `/coach/clients/${ID.priya}/close`);
    {
      const text = await words(page);
      pass(`${tag}: the close shows the shared scores, at the start and now`, /Hardware score\s+52 at the start\s+(Now\s+)?71/.test(text) && /FIRST REVIEW GOALS/i.test(text), flat((text.match(/OUTCOMES[\s\S]{0,140}/i) || [''])[0]));
    }
    await page.getByRole('checkbox', { name: 'Testimonial: I’ve asked Priya' }).click(); await settle(page, 600);
    pass(`${tag}: a request is ticked as asked, with today’s date`, (await toast(page)) === 'Ticked as asked' && /Asked Tue 17 Nov/.test(await words(page)), await toast(page));
    await pick(page, 'Which portal level does Priya keep', 'Free');
    const closed = async (again = '') => {
      await press(page, 'Move to Past clients');
      await settle(page, 800);
      const [p, e] = [await t.one('client_profiles', ID.priya), await engagement(ID.ePriya)];
      pass(`${tag}: Move to Past clients says exactly what happened${again}`, (await toast(page)) === 'Priya is in Past clients, still searchable, and you can start a new engagement from Priya’s page.' && /\/coach\/clients$/.test(page.url()), await toast(page));
      pass(`${tag}: Priya is past from today, her engagement ended, the level kept${again}`, p?.status === 'past' && p.ended_on === TODAY && e?.status === 'ended' && p.getting_started?.close?.keeps === 'free' && !/Priya Nair/.test(await page.locator('.cc-rows, .cc-list, .cc-board').first().innerText().catch(() => '')), `${p?.status} ${e?.status}`);
      if (there) pass(`${tag}: the close changes no count${again}`, e?.sessions_held === 5, `${e?.sessions_held}`);
    };
    await closed();
    await undo(page);
    {
      const [p, e] = [await t.one('client_profiles', ID.priya), await engagement(ID.ePriya)];
      pass(`${tag}: Undo puts Priya and her engagement back`, p?.status === 'active' && e?.status === 'active' && (!there || e.sessions_held === 5), `${p?.status} ${e?.status} ${e?.sessions_held}`);
    }
    await go(page, `/coach/clients/${ID.priya}/close`);
    await closed(', again');
    await go(page, '/coach/clients/past');
    pass(`${tag}: and she is in Past clients`, /Priya Nair/.test(await words(page)));
    await t.done();
  }

  // ================================================================ steps 9 to 11: Friday afternoon, the evening, capacity
  async function weekPart(o) {
    const tag = `day-week, ${o.who}`;
    // ---- 9. Friday afternoon: Rate my energy, then the Weekly review
    let t = await openAt(FRI, { ...o, tag: `${tag}, Friday` });
    let { page } = t;
    const week = async () => (await t.rowsNow('coach_weeks')).find((w) => w.week_start === '2026-11-09') || null;
    pass(`${tag}: on a Friday afternoon the one offer is Rate my energy`, (await page.locator('.ds-offer').count()) === 1 && /Rate my energy/.test(await page.locator('.ds-offer').innerText()), await page.locator('.ds-offer').innerText().catch(() => 'none'));
    await take(page);
    await page.getByRole('radio', { name: 'Very good', exact: true }).click(); await settle(page, 900);
    pass(`${tag}: one tap rates the week, says “Saved” and closes`, (await toast(page)) === 'Saved' && (await page.locator('.ds-modal--shown').count()) === 0 && (await week())?.energy === 'very_good' && Boolean((await week())?.energy_at), `${await toast(page)} ${(await week())?.energy}`);
    await undo(page);
    pass(`${tag}: Undo takes the rating away, and the offer asks again`, !(await week())?.energy && /Rate my energy/.test(await page.locator('.ds-offer').innerText().catch(() => '')), JSON.stringify(await week()).slice(0, 80));
    await take(page);
    await page.getByRole('radio', { name: 'Good', exact: true }).click(); await settle(page, 900);
    pass(`${tag}: rated again, the offer becomes the Weekly review`, (await week())?.energy === 'good' && /Weekly review/.test(await page.locator('.ds-offer').innerText().catch(() => '')), await page.locator('.ds-offer').innerText().catch(() => 'none'));
    await take(page);
    const steps = ['How was your energy this week?', 'Your hours', 'What got done', 'Next week’s shape', 'What would you change?'];
    const seen = [];
    for (let i = 0; i < steps.length; i += 1) {
      seen.push(`${flat(await dialog(page).locator('.cc-today-step').innerText())}: ${flat(await dialog(page).locator('.cc-today-q').innerText())}`);
      if (i < steps.length - 1) await press(page, 'Next');
    }
    pass(`${tag}: the Weekly review has its five steps, in order`, steps.every((s, i) => seen[i].startsWith(`Step ${i + 1} of 5`) && seen[i].includes(s)), seen.join(' | '));
    await dialog(page).locator('textarea').fill('Leave Thursday afternoon clear for writing.');
    await press(page, 'Finish the review');
    await settle(page, 600);
    pass(`${tag}: Finish the review says “Review saved”, and the week keeps the rating and what was typed`, (await toast(page)) === 'Review saved' && (await week())?.review?.change === 'Leave Thursday afternoon clear for writing.' && Boolean((await week())?.reviewed_at) && (await week())?.energy === 'good', `${await toast(page)} ${JSON.stringify((await week())?.review)}`);
    // (Friday afternoon: Plan my day isn't offered after 12:00, so with both done no offer is left.)
    pass(`${tag}: a reviewed week isn’t offered its review or its rating again, and never two offers at once`, (await page.locator('.ds-offer').count()) <= 1 && !/Weekly review|Rate my energy/.test(await page.locator('.ds-offer').innerText().catch(() => '')), await page.locator('.ds-offer').innerText().catch(() => 'none'));
    pass(`${tag}: the week is the coach’s own row`, (await week())?.coach_id === ME);
    await t.done();

    // ---- 10. The evening: Close the day
    t = await openAt(EVE, { ...o, tag: `${tag}, the evening` });
    page = t.page;
    const dayRow = async () => (await t.rowsNow('coach_days')).find((d) => d.day === TODAY) || null;
    pass(`${tag}: in the evening the one offer is Close the day`, /Close the day/.test(await page.locator('.ds-offer').innerText().catch(() => '')));
    await take(page);
    pass(`${tag}: Close the day starts with what got done`, /Step 1 of 3/.test(await dialog(page).innerText()) && /What got done/i.test(await dialog(page).innerText()));
    await press(page, 'Next');
    const left = await dialog(page).locator('.cc-today-still').count();
    await press(page, 'Move them to tomorrow');
    await settle(page, 500);
    const work = (await t.rowsNow('coach_todos')).filter((r) => [DAY.t1, DAY.t9, DAY.t10, DAY.t2, DAY.t3, DAY.t11].includes(r.id));
    pass(`${tag}: Move them to tomorrow moves what is left, and says how many`, left === 6 && (await toast(page)) === '6 moved to tomorrow' && work.every((r) => r.planned_on === TOMORROW), `${left} left; ${await toast(page)}`);
    await press(page, 'Next');
    pass(`${tag}: it ends with tomorrow at a glance`, /Step 3 of 3/.test(await dialog(page).innerText()) && /Tomorrow at a glance/i.test(await dialog(page).innerText()));
    await dialog(page).locator('.ds-btn--primary').click(); await settle(page, 800);
    pass(`${tag}: Close the day says “Day closed”, and the day is kept as closed with what was moved`, (await toast(page)) === 'Day closed' && Boolean((await dayRow())?.closed_at) && (await dayRow())?.shutdown?.moved === 6, `${await toast(page)} ${JSON.stringify(await dayRow()).slice(0, 120)}`);
    pass(`${tag}: a closed day offers nothing more`, (await page.locator('.ds-offer').count()) === 0);
    await t.done();

    // ---- 11. Capacity
    t = await openAt(TUE, { ...o, tag: `${tag}, capacity` });
    page = t.page;
    const hours = () => page.locator('.cc-setrow', { hasText: 'Coaching hours each week' });
    const typeHours = async (v) => {
      await page.getByRole('button', { name: 'Edit Coaching hours each week' }).click(); await settle(page, 300);
      await page.locator('.cc-setrow--edit input').fill(v);
      await page.locator('.cc-setrow--edit').getByRole('button', { name: 'Save' }).click(); await settle(page, 900);
    };
    pass(`${tag}: capacity starts at 11 of 15`, /11 of 15/.test(await page.locator('.cc-today-figures').innerText()), flat(await page.locator('.cc-today-figures').innerText()));
    await page.getByRole('button', { name: 'Edit capacity' }).click(); await settle(page, 900);
    pass(`${tag}: Edit beside Capacity opens Settings, Working hours`, new URL(page.url()).pathname === '/coach/settings/hours' && /Coaching hours each week\s+15 hours/.test(await page.locator('.cc-app').innerText()));
    await typeHours('0');
    pass(`${tag}: a number that isn’t hours is said calmly`, /Type a number of hours from 1 to 80\./.test(await page.locator('.cc-setrow--edit').innerText().catch(() => '')));
    await page.locator('.cc-setrow--edit').getByRole('button', { name: 'Cancel' }).click(); await settle(page, 300);
    await typeHours('12');
    const mayNot = !t.there && o.role === 'associate';
    if (mayNot) {
      // Before 050 only the owner may change a coach's row (026): an associate is told it waits, and nothing changes.
      pass(`${tag}: before 050 an associate is told calmly that it waits`, (await toast(page)) === 'This will work once the coaching day’s tables are in place.', await toast(page));
      await go(page, '/coach');
      pass(`${tag}: and Today still reads 11 of 15`, /11 of 15/.test(await page.locator('.cc-today-figures').innerText()));
    } else {
      pass(`${tag}: 12 hours saves, with Undo`, /Saved/.test(await toast(page)) && /12 hours/.test(await hours().innerText()) && t.store.coaches[0].capacity_hours_week === 12, `${await toast(page)} ${t.store.coaches[0].capacity_hours_week}`);
      await undo(page);
      pass(`${tag}: Undo puts 15 back`, /15 hours/.test(await hours().innerText()) && t.store.coaches[0].capacity_hours_week === 15, `${await hours().innerText()} ${t.store.coaches[0].capacity_hours_week}`);
      await typeHours('12');
      await go(page, '/coach');
      pass(`${tag}: Today reads 11 of 12`, /11 of 12/.test(await page.locator('.cc-today-figures').innerText()), flat(await page.locator('.cc-today-figures').innerText()));
      if (t.there) pass(`${tag}: each coach sets their own through the database’s checked function`, t.store.calls.filter((c) => c === 'rpc coach_save_capacity').length === 3 && !t.store.calls.includes('PATCH coaches'), t.store.calls.filter((c) => /capacity|coaches/.test(c)).join(', '));
    }
    await t.done({ refusals: 0 });
  }

  // ================================================================ step 12: what run 1 left, with the database there (leftovers.mjs walks them on the device)
  async function leftPart(o) {
    const tag = `day-left, ${o.who}`;
    const sentAt = new Date(TUE); sentAt.setDate(sentAt.getDate() - 17); sentAt.setHours(7, 0, 4, 0);
    const seed = (rows) => ({
      ...rows,
      client_profiles: rows.client_profiles.map((p) => (p.id === ID.leo ? { ...p, email: 'leo@example.invalid' } : p)),
      workshop_sends: [{ id: u(6970), workshop_id: ID.wsPast, kind: 'day_before', sent_at: sentAt.toISOString(), people: 22, sent_by: null }],
    });
    const t = await openAt(TUE, { ...o, tag, seed, path: '/coach/clients' });
    const { page, store } = t;
    const profile = (id) => store.rows.client_profiles.find((p) => p.id === id);

    // The board: dragged to another column, and moved with the arrow keys, each with Undo.
    await page.getByRole('button', { name: 'Board', exact: true }).click(); await settle(page, 700);
    const columnOf = () => page.evaluate((id) => document.querySelector(`[data-card="${id}"]`)?.closest('[data-stage]')?.dataset.stage || null, ID.sam);
    const was = await columnOf();
    const to = was === 'renewal_due' ? 'closing' : 'renewal_due';
    const cardBox = await page.locator(`[data-card="${ID.sam}"]`).boundingBox();
    const col = await page.locator(`[data-stage="${to}"]`).boundingBox();
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 20, cardBox.y + cardBox.height / 2 + 10, { steps: 3 });
    await page.mouse.move(col.x + col.width / 2, col.y + 120, { steps: 8 });
    await page.mouse.up();
    await settle(page, 900);
    pass(`${tag}: a card dragged to another column is kept there by the database`, (await columnOf()) === to && profile(ID.sam).stage === to && /^Moved to /.test(await toast(page)), `${await columnOf()} ${profile(ID.sam).stage} ${await toast(page)}`);
    await undo(page);
    pass(`${tag}: Undo puts it back, in the database too`, (await columnOf()) === was && profile(ID.sam).stage == null, `${await columnOf()} ${profile(ID.sam).stage}`);
    await page.locator(`[data-card="${ID.sam}"]`).focus();
    await page.keyboard.press('ArrowRight');
    await settle(page, 900);
    const order = ['starting', 'active', 'renewal_due', 'closing', 'paused'];
    pass(`${tag}: the right arrow moves a focused card one column on, with its message`, order.indexOf(await columnOf()) === order.indexOf(was) + 1 && profile(ID.sam).stage === (await columnOf()) && /^Moved to /.test(await toast(page)), `${was} to ${await columnOf()}; ${await toast(page)}`);
    await undo(page);
    pass(`${tag}: and Undo puts that back too`, (await columnOf()) === was && profile(ID.sam).stage == null, `${await columnOf()} ${profile(ID.sam).stage}`);

    // An organisation's access code: shown once with Copy, then only Reset.
    await go(page, `/coach/organisations/${ID.kestrel}`);
    const row = page.locator('.cc-line', { hasText: 'Access code' });
    await row.getByRole('button', { name: 'Make an access code' }).click(); await settle(page, 800);
    const shown = (await dialog(page).locator('.cc-code').textContent().catch(() => '')) || '';
    pass(`${tag}: the access code shows once, with Copy`, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/.test(shown) && (await dialog(page).getByRole('button', { name: 'Copy', exact: true }).count()) === 1, `${shown.length} characters`);
    pass(`${tag}: only its fingerprint was saved, to the stand-in and never the test project`, t.codes.posts.length === 1 && !JSON.stringify(t.codes.posts).includes(shown) && /^[0-9a-f]{64}$/.test(t.codes.posts[0].code_hash || ''));
    await closePanel(page);
    pass(`${tag}: afterwards the row offers only Reset`, /An access code is set\./.test(await row.innerText()) && /Reset the code/.test(await row.innerText()) && !/Make an access code/.test(await row.innerText()) && !(await page.locator('.cc-app').innerText()).includes(shown), flat(await row.innerText()));

    // A workshop's Emails, and Send the follow-up: once.
    await go(page, `/coach/workshops/${ID.wsPast}`);
    const emails = () => page.locator('section, .cc-part').filter({ has: page.getByRole('heading', { name: 'Emails' }) }).last();
    pass(`${tag}: the workshop’s Emails say what went and what is the coach’s to send`, /Reminder the day before It was sent on Sat 31 Oct at 07:00, to 22 people\./.test(flat(await emails().innerText())) && /Follow-up You send this after the day\./.test(flat(await emails().innerText())), flat(await emails().innerText()));
    store.api.live = true;
    await emails().getByRole('button', { name: 'Send the follow-up' }).click(); await settle(page, 600);
    await dialog(page).getByRole('button', { name: 'Send the follow-up', exact: true }).click(); await settle(page, 1200);
    const followUps = () => store.rows.workshop_sends.filter((x) => x.workshop_id === ID.wsPast && x.kind === 'follow_up');
    pass(`${tag}: Send the follow-up says to how many, and the database records it once (the survey with it)`, (await toast(page)) === 'Follow-up sent to 22 people.' && followUps().length === 1 && followUps()[0].people === 22 && store.rows.workshop_sends.some((x) => x.workshop_id === ID.wsPast && x.kind === 'survey'), `${await toast(page)} ${followUps().length}`);
    await settle(page, 600);
    const again = emails().getByRole('button', { name: 'Send the follow-up' });
    const asked = store.api.asked.length;
    if (await again.count()) {
      await again.click(); await settle(page, 600);
      const confirm = dialog(page).getByRole('button', { name: 'Send the follow-up', exact: true });
      if (await confirm.count()) { await confirm.click(); await settle(page, 1000); }
    }
    pass(`${tag}: a second press sends nothing more`, followUps().length === 1 && !(store.api.answers || []).slice(1).some((a) => a.sent === true && store.api.asked[(store.api.answers || []).indexOf(a)]?.kind === 'workshop_follow_up'), `${followUps().length} recorded; the button ${(await again.count()) ? 'still shows' : 'has gone'}; asked ${store.api.asked.length - asked} more time(s); it said “${await toast(page)}”`);
    console.log(`  note (${tag}): after the follow-up went, its button ${(await again.count()) ? `still shows; pressed again the server was asked ${store.api.asked.length - asked} more time(s) and answered “${(store.api.answers || []).slice(-1)[0]?.reason || 'sent'}”, and the page said “${await toast(page)}”` : 'has gone, so it can’t be pressed again'}.`);
    pass(`${tag}: once it has gone the Emails say when, to how many`, /Follow-up It was sent on Tue 17 Nov at 09:00, to 22 people\./.test(flat(await emails().innerText())), flat(await emails().innerText()));

    // Invite to the portal, both ways.
    await go(page, `/coach/clients/${ID.leo}`);
    await page.getByRole('button', { name: 'Invite to the portal' }).first().click(); await settle(page, 600);
    await dialog(page).getByRole('button', { name: 'Invite Leo', exact: true }).click(); await settle(page, 1000);
    pass(`${tag}: from the live site the invite says it was sent`, (await toast(page)) === 'Invite sent to Leo.' && Boolean(profile(ID.leo).invited_at) && store.calls.includes('rpc client_invite'), await toast(page));
    profile(ID.leo).invited_at = null;
    store.api.live = false;
    await go(page, `/coach/clients/${ID.leo}`);
    await page.getByRole('button', { name: 'Invite to the portal' }).first().click(); await settle(page, 600);
    await dialog(page).getByRole('button', { name: 'Invite Leo', exact: true }).click(); await settle(page, 1000);
    pass(`${tag}: from a preview it says no email goes`, (await toast(page)) === 'Invited. No email goes from a preview.' && Boolean(profile(ID.leo).invited_at), await toast(page));
    pass(`${tag}: the server is asked for this client only`, store.api.asked.filter((a) => a.kind === 'invite').every((a) => a.profileId === ID.leo && Object.keys(a).length === 2) && store.api.asked.filter((a) => a.kind === 'invite').length === 2);

    // The name note: Email and View their page only.
    await go(page, '/coach');
    await page.locator('.cc-quiet', { hasText: 'birthday today' }).locator('.cc-inline-link').click(); await settle(page, 700);
    const offered = await dialog(page).locator('.ds-dialog-body a, .ds-dialog-body button, .cc-panel-foot a, .cc-panel-foot button, .ds-dialog-foot a, .ds-dialog-foot button').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.textContent || '').trim()).filter(Boolean));
    pass(`${tag}: the name note offers Email and View their page only (no Portal message)`, offered.includes('Open in my email') && offered.includes('View Priya’s page') && offered.length === 2 && !/Portal message|WhatsApp|iMessage/.test(await dialog(page).innerText()), offered.join(' | '));
    await closePanel(page);
    await t.done();
  }

  // ================================================================ step 13: Business is Finances
  async function financesPart(o) {
    const tag = `day-finances, ${o.who}`;
    // The seed's own to-do list called "Business" is renamed here, so nothing a coach made is found by the word.
    const seed = (rows) => ({ ...rows, coach_todo_lists: rows.coach_todo_lists.map((l) => (l.id === DAY.listBusiness ? { ...l, name: 'The practice' } : l)) });
    const t = await openAt(TUE, { ...o, tag, seed });
    const { page, phone } = t;
    const owner = o.role === 'owner';
    if (phone) await page.locator('.cc-phonebar').getByRole('button', { name: 'Menu' }).click(); else await button(page, 'Open the menu').click();
    await settle(page, 500);
    // (To-dos carries its small count of today's, and the coach's own lists sit under it.)
    const items = (await page.locator('.cc-menu-item').allInnerTexts()).map((i) => i.split('\n')[0]);
    pass(`${tag}: the menu reads ${owner ? 'Today, Finances, To-dos, …' : 'Today, To-dos, … with no Finances'}`, owner ? items.slice(0, 3).join(', ') === 'Today, Finances, To-dos' : items.slice(0, 2).join(', ') === 'Today, To-dos' && !items.includes('Finances'), items.join(', '));
    pass(`${tag}: nothing in the menu says Business`, !items.some((i) => /business/i.test(i)));
    await page.locator('.cc-menu-item', { hasText: 'To-dos' }).click(); await settle(page, 800);
    pass(`${tag}: To-dos opens the to-dos, no longer “Coming in this build”`, new URL(page.url()).pathname === '/coach/todos' && !/Coming in this build/.test(await words(page)) && /^to-dos$/i.test((await page.locator('h1').innerText()).trim()) && (await page.title()) === 'To-dos, Clarity Coach', `${await page.title()}`);
    await go(page, '/coach/business');
    pass(`${tag}: /coach/business lands on ${owner ? '/coach/finances' : 'Today (Finances is the owner’s)'}`, new URL(page.url()).pathname === (owner ? '/coach/finances' : '/coach'), new URL(page.url()).pathname);
    pass(`${tag}: no title says Business`, !/business/i.test(await page.title()) && !/business/i.test(await page.locator('h1').first().innerText()) && (!owner || (/finances/i.test(await page.locator('h1').first().innerText()) && (await page.title()) === 'Finances, Clarity Coach')), `${await page.title()} / ${await page.locator('h1').first().innerText()}`);
    await go(page, '/coach/business/anything?x=1');
    pass(`${tag}: an older address under it lands in the same place`, new URL(page.url()).pathname === (owner ? '/coach/finances' : '/coach'), new URL(page.url()).pathname);
    const search = async (typed) => {
      await page.getByRole('button', { name: /^Search/ }).first().click(); await settle(page, 400);
      await page.locator('.cc-jump-input').fill(typed); await settle(page, 400);
      const found = await page.locator('.cc-jump-item').allInnerTexts();
      await page.keyboard.press('Escape'); await settle(page, 300);
      return found.map(flat);
    };
    const fin = await search('Finances');
    pass(`${tag}: search ${owner ? 'finds Finances' : 'finds no Finances for an associate'}`, owner ? fin.some((f) => /^Finances/.test(f)) : !fin.some((f) => /Finances/.test(f)), fin.join(' | '));
    const bus = await search('Business');
    pass(`${tag}: nothing finds “Business”`, bus.length === 0, bus.join(' | '));
    const all = await search('f');
    pass(`${tag}: no search result says Business`, !all.some((f) => /business/i.test(f)), all.filter((f) => /business/i.test(f)).join(' | '));
    await t.done();
  }

  // ================================================================ step 14: the client's side, fed by what the coach really did
  async function clientPart(o) {
    const tag = `day-client, ${o.who}`;
    // The test client's own sign-in, with every function its Coaching page calls answered from the coach's stand-in database.
    const clientCtx = await clientContext(browser, { size: 400, theme: 'light' });
    const client = await clientCtx.newPage();
    const clientErrors = [];
    client.on('pageerror', (e) => clientErrors.push(String(e).slice(0, 240)));
    const data = fromCoach();
    data.coach = { ...data.coach, first_name: 'Alex' };
    data.invites = [];
    const stood = await clientStandIn(client, data);
    await client.goto(`${APP}/coaching`);
    await client.waitForSelector('.ui-root', { timeout: 20000 });
    const clientUser = await accountId(client);
    await client.evaluate(() => localStorage.setItem('clarity-colour-mode', 'light'));
    await clearCoaching(client);

    const realNow = Date.now();
    const dayKey = (offset) => { const d = new Date(realNow + offset * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const seed = (rows) => ({
      ...callsSeed(clientUser)(rows),
      client_view_requests: [{ id: EXTRA.view, profile_id: SES.hannah, coach_id: ME, asked_at: new Date(TUE.getTime() - 10 * 60000).toISOString(), answered_at: null, allowed: null, expires_at: null }],
      coach_cover: [{ id: EXTRA.cover, coach_id: ME, cover_coach_id: OTHER, profile_id: SES.hannah, starts_on: dayKey(30), ends_on: dayKey(43), client_agreed_at: null }],
    });
    const t = await openAt(TUE, { ...o, tag, seedOptions: { sessions: true }, seed, shares: true, path: `/coach/sessions/${SES.write}` });
    const { page, store } = t;

    // The client's functions, as 050's SQL answers them for this account (and 049's two answers, as its SQL).
    const fn = (name, handler) => client.route(`**/rest/v1/rpc/${name}`, (route) => {
      const args = (() => { try { return route.request().postDataJSON() || {}; } catch { return {}; } })();
      try { const out = handler(args); return out === undefined ? route.fulfill({ status: 204 }) : json(route, out); } catch (e) { return json(route, { code: e.code || 'P0001', message: e.message }, e.status || 400); }
    });
    await fn('my_session_recaps', () => store.fn.my_session_recaps(clientUser));
    await fn('my_session_action', (a) => { stood.calls.push(`my_session_action done:${a.p_done ?? null} placed:${a.p_placed ?? null}`); store.fn.my_session_action(clientUser, a.p_action, a.p_done ?? null, a.p_placed ?? null); });
    await fn('my_view_asks', () => store.fn.my_view_asks(clientUser));
    await fn('my_cover_asks', () => store.fn.my_cover_asks(clientUser));
    await fn('client_view_answer', (a) => { const r = store.rows.client_view_requests.find((x) => x.id === a.p_request && !x.answered_at); if (!r) throw Object.assign(new Error('That request isn’t open.'), { code: '42501', status: 403 }); Object.assign(r, { answered_at: new Date().toISOString(), allowed: a.p_allowed, expires_at: a.p_allowed ? new Date(Date.now() + 30 * 60000).toISOString() : null }); });
    await fn('cover_agree', (a) => { const c = store.rows.coach_cover.find((x) => x.id === a.p_cover && !x.client_agreed_at); if (!c) throw Object.assign(new Error('That isn’t yours to agree.'), { code: '42501', status: 403 }); c.client_agreed_at = new Date().toISOString(); });

    const openClient = async () => { await client.goto(`${APP}/coaching`); await client.waitForSelector('.ui-root', { timeout: 20000 }); await settle(client, 1600); return client.locator('.ui-root').first().innerText(); };
    let text = await openClient();
    pass(`${tag}: before the coach sends, the client sees only the recap sent earlier`, text.includes('You chose the two launch markets') && !text.includes('We looked at the pricing launch'), flat(text).slice(0, 200));

    // The coach sends yesterday's recap (three actions: two ticked, one of them for the Backlog; one not ticked).
    await press(page, 'Send the recap');
    await settle(page, 1200);
    pass(`${tag}: the coach sends the recap`, (await toast(page)) === 'Sent. Hannah sees it in the portal, with the actions you ticked.' && store.sends.length === 1 && store.sends[0].answer === 'sent', await toast(page));

    text = await openClient();
    pass(`${tag}: the client now has it, newest first, as it was sent`, text.includes('We looked at the pricing launch') && text.indexOf('We looked at the pricing launch') < text.indexOf('You chose the two launch markets'), flat(text).slice(0, 240));
    pass(`${tag}: with the actions the coach ticked, each for the place the coach chose`, (await client.getByRole('button', { name: /^Add to this week: Hand the launch plan to Femi by Wednesday/ }).count()) === 1 && (await client.getByRole('button', { name: /^Add to my backlog: Book a 15-minute check-in each morning/ }).count()) === 1);
    pass(`${tag}: an action the coach didn’t tick, the private notes and For supervision never reach the client`, !text.includes('Write the pricing story on one page') && !/Choosing the launch markets|decides fastest|supervision/i.test(text));
    pass(`${tag}: an action already done reads as done`, (await client.locator('.coaching-action').filter({ hasText: 'Call the three launch customers' }).getByRole('checkbox').getAttribute('aria-checked')) === 'true');
    pass(`${tag}: the coach’s request to view, and cover, are asked in their own words`, text.includes('Alex would like to view your portal for 30 minutes.') && /While Alex is away from .+, Maya will cover\./.test(text), flat((text.match(/Alex would like[\s\S]{0,200}/) || [''])[0]));

    const first = client.locator('.coaching-action').filter({ hasText: 'Hand the launch plan to Femi' });
    await first.getByRole('checkbox').click(); await settle(client, 700);
    pass(`${tag}: the client ticks an action done, and the coach’s database has it`, Boolean(store.rows.coach_session_actions.find((a) => a.id === SES.a1)?.done_at) && (await first.getByRole('checkbox').getAttribute('aria-checked')) === 'true');
    await client.getByRole('button', { name: 'Yes, for 30 minutes' }).click(); await settle(client, 900);
    const request = store.rows.client_view_requests[0];
    pass(`${tag}: yes to viewing is kept for 30 minutes`, request.allowed === true && Math.abs(new Date(request.expires_at) - new Date(request.answered_at) - 30 * 60000) < 2000 && /Alex can view your portal until \d{2}:\d{2}\./.test(await client.locator('.ui-root').first().innerText()));
    await client.getByRole('button', { name: 'I agree to Maya covering' }).click(); await settle(client, 800);
    pass(`${tag}: cover is agreed`, Boolean(store.rows.coach_cover[0].client_agreed_at) && (await client.locator('.coaching-agreed').innerText().catch(() => '')) === 'Agreed');
    const box = client.getByLabel('What do you want to talk about next time?');
    await box.click(); await settle(client, 400);
    await client.keyboard.type('How to hand over the launch without checking in every hour.');
    if (await client.getByRole('button', { name: 'Done', exact: true }).count()) { await client.getByRole('button', { name: 'Done', exact: true }).click(); await settle(client, 400); }
    await client.getByRole('button', { name: 'Save', exact: true }).click(); await settle(client, 800);
    pass(`${tag}: For next time is saved as the client’s own note`, data.prep?.body === 'How to hand over the launch without checking in every hour.' && data.prepUser === clientUser, JSON.stringify(data.prep));
    await client.getByRole('button', { name: /^Add to this week: |^Add to my backlog: Book a 15-minute/ }).first().click(); await settle(client, 900);
    pass(`${tag}: Add opens the shared add panel with the action’s words`, /Book a 15-minute check-in each morning/.test(await client.locator('[role=dialog]').last().innerText().catch(() => '')) || (await client.locator('[role=dialog]').last().locator('textarea, input[type=text]').first().inputValue().catch(() => '')).startsWith('Book a 15-minute'), flat(await client.locator('[role=dialog]').last().innerText().catch(() => 'no panel')).slice(0, 120));
    await client.keyboard.press('Escape'); await settle(client, 400);

    // Back on the coach's side: what the client did shows.
    await go(page, `/coach/sessions/${SES.write}`);
    text = await words(page);
    pass(`${tag}: the coach’s sent recap shows the client’s tick as Done`, /Hand the launch plan to Femi by Wednesday\s+Goes to this week\s+Done/.test(text) && /Book a 15-minute check-in each morning\s+Goes to the Backlog\s+Not yet/.test(text), flat((text.match(/ACTIONS[\s\S]{0,260}/i) || [''])[0]));
    await go(page, `/coach/clients/${SES.hannah}`);
    await openFold(page, 'More');
    const until = new Date(request.expires_at);
    const time = `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
    pass(`${tag}: the coach reads the client’s yes, and until when`, (await words(page)).includes(`Hannah said yes. You can view what Hannah shares until ${time}.`), (/(Hannah said[^\n]*|Ask to view[^\n]*|Waiting[^\n]*)/.exec(await words(page)) || [''])[0]);
    await go(page, '/coach/settings/away');
    pass(`${tag}: and that cover is agreed`, /Maya Collins covers Hannah Wells/.test(await words(page)) && !/Waiting for the client to agree/.test(await words(page)), flat((/(Maya Collins covers[\s\S]{0,120})/.exec(await words(page)) || [''])[0]));

    const stray = stood.blocked.filter((b) => !/person_settings|todos|day_plan/.test(b));
    pass(`${tag}: nothing left the client’s page for the test project or an email server`, stray.length === 0, [...new Set(stray)].slice(0, 5).join('; '));
    pass(`${tag}: nothing in the client’s console`, clientErrors.length === 0, [...new Set(clientErrors)].slice(0, 3).join(' | '));
    await clearCoaching(client, { after: true });
    await clientCtx.close();
    await t.done();
  }

  // ================================================================ the database arrives: what waited on the device moves across once
  async function movePart(o) {
    const tag = `day-move, ${o.who}`;
    // Before: everything on the device (as today). A day's worth is made there.
    // (Rows only the database ever makes, the bell's and the Activity log's, and another coach's profile, are left out of the
    // device's seed: no device holds those before the tables are there.)
    const onDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, ...own } = callsSeed()(rows); return own; };
    const a = await openAt(TUE, { ...o, db: 'none', tag: `${tag}, on the device`, seedOptions: { sessions: true }, seed: onDevice, shares: true, path: '/coach/todos' });
    let { page } = a;
    const scope = a.phone ? null : page.locator('.cc-col > .cc-qadd');
    if (a.phone) { await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600); }
    await (scope || dialog(page)).getByLabel('What needs doing?').fill('Draft the offsite agenda 30 min #Offsite @Deep');
    await (scope || dialog(page)).getByRole('button', { name: 'Add to-do', exact: true }).click(); await settle(page, 800);
    await go(page, `/coach/sessions/${SES.blank}`);
    await pick(page, 'What happened', 'Cancelled with under 24 hours’ notice');
    await press(page, 'Save');
    await go(page, `/coach/sessions/${EXTRA.hannahTyped}`);
    await page.getByLabel('Recap for Hannah').fill('Thanks for today, Hannah. Typed before the tables were there.');
    await page.locator('.ds-addrow', { hasText: 'Add action' }).click(); await settle(page, 300);
    await page.keyboard.type('Send the launch checklist');
    await page.getByLabel('Focus').fill('The launch.');
    await settle(page, 1800);
    await go(page, `/coach/clients/${SES.hannah}`);
    const toGo = async () => (/(\d+) of 12/.exec(await words(page)) || [])[1] || null;
    const before = { hannah: await toGo() };
    // A count typed on the device before the tables are there (Sam's: one more held).
    await go(page, `/coach/clients/${ID.sam}`);
    await openFold(page, 'Sessions and recaps');
    await button(page, 'One more session held').click(); await settle(page, 800);
    before.sam = await toGo();
    const device = {};
    for (const table of ['client_profiles', 'engagements', 'coach_todo_lists', 'coach_todo_headings', 'coach_todos', 'coach_tags', 'coach_tag_links', 'coach_sessions', 'coach_session_people', 'coach_session_actions', 'coach_session_notes']) device[table] = (await a.rowsNow(table)).length;
    pass(`${tag}: on the device the late cancellation and the typed recap count: 4 of 12 to go`, before.hannah === '4', before.hannah);
    const blocked = a.store.calls.filter((c) => c.startsWith('blocked'));
    pass(`${tag}: on the device nothing was sent, and nothing was tried`, blocked.length === 0, blocked.slice(0, 4).join('; '));
    await page.close();

    // After: 049 and 050 are there, with nothing in them yet. The same device opens the portal.
    page = await a.ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.clock.setFixedTime(TUE);
    const store = await standIn(page, { role: o.role, db: 'there', day: true, strict: true, rows: {}, now: () => new Date(TUE) });
    await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
    for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
    await page.goto(`${APP}/coach/clients/${SES.hannah}`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    // Everything waiting is sent, a row at a time: wait until nothing waits on the device (or 40 seconds).
    for (let i = 0; i < 80; i += 1) { if (!(await page.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), a.me))) break; await settle(page, 500); }
    const waiting = await page.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), a.me);
    const refused = store.calls.filter((c) => c.startsWith('refused'));
    const unsent = await page.evaluate((id) => { const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}'); return Object.entries(kept.rows || {}).map(([table, rows]) => [table, Object.keys(rows).filter((k) => !kept.marks?.[table]?.[k]?.sent).length]).filter(([, n]) => n > 0).map(([table, n]) => `${table} ${n}`); }, a.me);
    pass(`${tag}: what waited on the device is moved across, and nothing is left waiting`, !waiting, `still unsent: ${unsent.join(', ')}`);
    pass(`${tag}: parents went before their parts: the database refused nothing`, refused.length === 0, [...new Set(refused)].slice(0, 5).join('; '));
    const counts = Object.fromEntries(Object.keys(device).map((table) => [table, store.rows[table].length]));
    pass(`${tag}: every row arrived, once`, Object.keys(device).every((table) => counts[table] === device[table]), Object.keys(device).filter((table) => counts[table] !== device[table]).map((table) => `${table}: ${counts[table]} of ${device[table]}`).join('; '));
    const posts = store.calls.filter((c) => c.startsWith('POST '));
    const firstOf = (table) => posts.indexOf(`POST ${table}`);
    pass(`${tag}: in order: clients, engagements, lists, to-dos, sessions, then their actions and notes`, firstOf('client_profiles') < firstOf('engagements') && firstOf('coach_todo_lists') < firstOf('coach_todos') && firstOf('engagements') < firstOf('coach_sessions') && firstOf('coach_sessions') < firstOf('coach_session_actions') && firstOf('coach_sessions') < firstOf('coach_session_notes'), ['client_profiles', 'engagements', 'coach_todo_lists', 'coach_todos', 'coach_sessions', 'coach_session_actions', 'coach_session_notes'].map((t) => `${t} ${firstOf(t)}`).join(', '));
    const todo = store.rows.coach_todos.find((r) => r.title === 'Draft the offsite agenda');
    pass(`${tag}: the new to-do arrived with its new list and its new tag`, Boolean(todo) && store.rows.coach_todo_lists.some((l) => l.id === todo.list_id && l.name === 'Offsite') && store.rows.coach_tag_links.some((l) => l.item_id === todo.id && store.rows.coach_tags.some((g) => g.id === l.tag_id && g.name === 'Deep')));
    const e = store.rows.engagements.find((x) => x.id === SES.eHannah);
    pass(`${tag}: the database counts the sessions as the device did: 8 held of 12`, e?.sessions_held === 8 && e.sessions_held_base === 3, `${e?.sessions_held} held, base ${e?.sessions_held_base}`);
    const sentBefore = store.rows.coach_sessions.find((x) => x.id === SES.sent);
    pass(`${tag}: a recap marked sent on the device before 050 arrives unsent, to be sent for real (as the go-live note says)`, Boolean(sentBefore) && !sentBefore.recap_sent_at && sentBefore.outcome === 'held');
    const sentPosts = posts.length;
    await go(page, `/coach/clients/${SES.hannah}`);
    pass(`${tag}: opened again, Hannah’s page reads the same: 4 of 12 to go`, (await toGo()) === before.hannah, `${await toGo()} against ${before.hannah}`);
    await go(page, `/coach/clients/${ID.sam}`);
    const sam = store.rows.engagements.find((x) => x.id === ID.eSam);
    // 050's insert guard keeps the base a device brings, so a count typed there before 050 reads the same afterwards.
    pass(`${tag}: a count typed on the device before 050 reads the same once moved across: ${before.sam} of 12 to go`, (await toGo()) === before.sam, `${await toGo()} against ${before.sam}; the database holds ${sam?.sessions_held} held (base ${sam?.sessions_held_base})`);
    await settle(page, 1500);
    pass(`${tag}: and nothing is sent a second time`, store.calls.filter((c) => c.startsWith('POST ')).length === sentPosts, `${store.calls.filter((c) => c.startsWith('POST ')).length - sentPosts} more`);
    await go(page, `/coach/sessions/${SES.sent}`);
    pass(`${tag}: the recap “sent” before 050 can now be sent for real`, (await page.locator('.cc-ses-bar').innerText().catch(() => '')).trim() === 'Send the recap', (await page.locator('.cc-ses-bar').innerText().catch(() => 'no button')).trim());
    const stray = store.calls.filter((c) => c.startsWith('blocked'));
    pass(`${tag}: nothing was stopped on its way to the test project`, stray.length === 0, stray.slice(0, 4).join('; '));
    pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
    await clearDevice(page, a.me);
    await a.ctx.close();
  }

  const who = { owner: 'Tim 1440', associate: 'Maya 400' };
  try {
    for (const role of roles) {
      for (const db of dbs) {
        const o = { role, size: role === 'owner' ? 1440 : 400, db, who: `${who[role]}, ${db === 'there' ? 'the database there' : 'device only'}` };
        const run = async (name, work) => {
          if (!has(name)) return;
          try { await work(o); } catch (e) { pass(`${name}, ${o.who}: every step ran`, false, String(e).split('\n').slice(0, 3).join(' ').slice(0, 320)); }
        };
        await run('day-plan', planPart);
        await run('day-calls', callsPart);
        await run('day-week', weekPart);
        // What run 1 left is the owner's, and leftovers.mjs walks it on the device: here it runs against the database.
        if (role === 'owner' && db === 'there') await run('day-left', leftPart);
        await run('day-finances', financesPart);
        // The client's side is fed by what the coach's database holds, so it needs it there.
        if (role === 'owner' && db === 'there') await run('day-client', clientPart);
        // The database arriving is walked once for each role (it starts on the device and ends with the database there).
        if (db === 'there') await run('day-move', movePart);
      }
    }
  } finally {
    seedClock(null);
  }
}
