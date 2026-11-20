// The break-it tester for the coaching day (Phase 6a run 2, 20 Nov): the
// parts of breakit.mjs whose names start "d-". Each case is a named check.
//
//   d-reach    an associate reaching for the owner's sessions, notes, lists and
//              to-dos, and the owner reaching for an associate's sessions
//   d-twice    a recap sent twice: a second tab, a second device, a reload
//   d-taps     two presses in the same moment: one of each
//   d-500      500 to-dos: how quick, 50 at a time, the device copy's size
//   d-tabs     two tabs on the same to-do, day, session and capacity
//   d-offline  offline and back: kept, said calmly, sent once, in order
//   d-moved    a session moved after its recap was sent (forced by hand)
//   d-odd      awkward things typed, odd addresses, a damaged device copy,
//              midnight, twice the text size, the browser's Back
//   d-client   the client's Coaching page, pressed twice and overfilled
//
// Unless a case says "device only", 049 and 050 are answered by the stand-in
// in shared.mjs, shaped as the SQL (`strict`: nothing but a read ever reaches
// the test project, and a write the stand-in doesn't know is listed as
// `blocked` and fails the part). The page's clock is pinned to a day at or
// before the real one (never ahead: sign-in rule 46). Every /api/ call is
// answered by a stand-in: nothing is ever sent.
import { accountId, APP, clearDevice, coachContext, codesStandIn, ME, OTHER, readEnv, seedDevice, settle, standIn } from './shared.mjs';
import { ADMIN_ROWS, DAY, ID, PRESSURE, seedClock, seedWithDay, SES } from './seed.mjs';
import { clearCoaching, clientContext, clientStandIn, fromCoach } from './client.mjs';

export const BREAK_PARTS = ['d-reach', 'd-twice', 'd-taps', 'd-500', 'd-tabs', 'd-offline', 'd-moved', 'd-odd', 'd-client'];

const TUE = new Date(2026, 10, 17, 9, 0);
const EVE = new Date(2026, 10, 17, 18, 45);
const FRI = new Date(2026, 10, 13, 13, 30);
const SAT = new Date(2026, 10, 14, 13, 30);
const TODAY = '2026-11-17';
const TOMORROW = '2026-11-18';
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const press = async (page, name) => { await button(page, name).click(); await settle(page, 450); };
const take = async (page) => { await page.locator('.ds-offer-take').click(); await settle(page, 500); };
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 450); };
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 4000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const words = (page) => page.evaluate(() => document.querySelector('.cc-app')?.innerText || document.body.innerText);
const flat = (text) => String(text).replace(/\s+/g, ' ');
const go = async (page, path, wait = 1100) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, wait); };
/** Two presses in the same moment: both clicks land before the page can draw anything. */
const twice = async (locator) => { await locator.evaluate((el) => { el.click(); el.click(); }); };
/** Enter and a click together, on a button that has the keyboard. */
const enterAndClick = async (page, locator) => {
  await locator.focus();
  await page.keyboard.down('Enter');
  await locator.evaluate((el) => el.click()).catch(() => {});
  await page.keyboard.up('Enter');
};
const pick = async (page, label, option) => {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const count = (store, re) => store.calls.filter((c) => re.test(c)).length;
/** Everything the coach portal keeps on this browser, as one string. */
const deviceText = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /coach/.test(k)).map((k) => localStorage.getItem(k)).join('\n'));

/**
 * The coaching day's break-it parts. `report` is breakit.mjs's own; `parts` the names asked for.
 * @param {{ browser: object, report: { pass: Function }, parts: string[] }} o
 */
export async function runDayBreak({ browser, report, parts }) {
  const { pass } = report;
  const has = (p) => parts.includes(p);

  /**
   * A signed-in coach on a pinned day. One stand-in answers every tab of the context.
   * `db: 'there'` the seed is in the stand-in database (049 and 050); `'none'` it is on the device and every write is stopped.
   */
  async function openAt(at, { role = 'owner', size = 1440, db = 'there', seed = (rows) => rows, seedOptions = {}, admin = [], path = '/coach', tag, theme = 'dark', share = null }) {
    const there = db === 'there';
    const ctx = await coachContext(browser, { size, theme });
    const errors = [];
    const reached = [];
    const waits = [];
    const asked = [];
    const watch = (page) => {
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
      page.on('request', (req) => { if (/\/rest\/v1\//.test(req.url())) asked.push(`${req.method()} ${req.url().split('/rest/v1/')[1]}`); });
      // Anything but a read that a real server answered (a stand-in's answer has no server behind it) is a write that got out.
      page.on('response', (res) => {
        const req = res.request();
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
        waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
      });
    };
    await ctx.clock.setFixedTime(at);
    seedClock(at);
    const rows = seed(seedWithDay({ accounts: true, ...seedOptions }));
    const store = await standIn(ctx, there ? { role, db: 'there', day: true, strict: true, rows, admin, now: () => new Date(at) } : { role, db: 'none' });
    if (share) { store.rows = share.rows; store.sends = share.sends; store.claims = share.claims; store.api = share.api; }
    if (!there) await ctx.route('**/rest/v1/rpc/**', (route) => json(route, null));
    const read = (body) => (route) => (route.request().method() === 'GET' ? json(route, body) : route.fallback());
    await ctx.route('**/rest/v1/peak_moments*', read(PRESSURE.moments()));
    for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await ctx.route(`**/rest/v1/${t}*`, read(t === 'session_prep' ? null : []));
    await codesStandIn(ctx);
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    const me = await accountId(page);
    await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
    if (!share) {
      await clearDevice(page, me);
      if (!there) await seedDevice(page, me, rows);
    }
    await go(page, path);
    const rowsNow = async (table) => (there ? store.rows[table] : page.evaluate(([id, t]) => {
      const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}');
      const marks = s.marks?.[t] || {};
      return Object.entries(s.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]));
    return {
      ctx, page, store, me, there, errors, asked, rowsNow, tag,
      one: async (table, id, key = 'id') => (await rowsNow(table)).find((r) => r[key] === id) || null,
      tab: async (to) => { const p = await ctx.newPage(); watch(p); await go(p, to); return p; },
      done: async ({ allow = null, refusals = null, waiting = false, keep = false } = {}) => {
        await settle(page, 500);
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: no write was stopped on its way out (none was tried)`, blocked.length === 0, [...new Set(blocked)].slice(0, 5).join('; '));
        pass(`${tag}: nothing but a read reached the test project, and no email server was asked for real`, reached.length === 0, [...new Set(reached)].slice(0, 5).join('; '));
        if (there && refusals != null) {
          const refused = store.calls.filter((c) => c.startsWith('refused'));
          pass(`${tag}: the database refused ${refusals === 0 ? 'nothing the page sent' : `only what it should (${refusals})`}`, refused.length === refusals, [...new Set(refused)].slice(0, 6).join('; '));
        }
        if (there && !waiting) pass(`${tag}: nothing waits on the device`, !(await page.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), me)));
        const seen = errors.filter((e) => !(allow && allow.test(e)));
        pass(`${tag}: nothing in the console`, seen.length === 0, [...new Set(seen)].slice(0, 4).join(' | '));
        if (!keep) { await clearDevice(page, me); await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:')) localStorage.removeItem(k); }); }
        await ctx.close();
      },
    };
  }

  // ================================================================ 1. an associate reading the owner's things, and the owner an associate's
  if (has('d-reach')) {
    const SECRET = /secret/i;
    const theirs = {
      list: u(8001), todo: u(8002), held: u(8003), future: u(8004), action: u(8005), client: u(8010), heading: u(8006),
    };
    /** Rows that belong to the OTHER coach, in 050's tables. */
    const others = (rows, name) => {
      const session = (id, starts, extra = {}) => ({
        id, coach_id: OTHER, profile_id: theirs.client, group_id: null, engagement_id: null, kind: 'coaching', starts_at: starts.toISOString(), minutes: 60, place: null, outcome: null, waived: false,
        moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null, created_at: new Date(2026, 9, 8).toISOString(), ...extra,
      });
      return {
        ...rows,
        coach_todo_lists: [...rows.coach_todo_lists, { id: theirs.list, coach_id: OTHER, name: `${name} secret list`, profile_id: null, organisation_id: null, position: 9, finished_at: null }],
        coach_todo_headings: [...rows.coach_todo_headings, { id: theirs.heading, list_id: theirs.list, coach_id: OTHER, name: `${name} secret heading`, position: 1 }],
        coach_todos: [...rows.coach_todos, { ...rows.coach_todos[0], id: theirs.todo, coach_id: OTHER, title: `${name} secret to-do`, list_id: theirs.list, heading_id: null, planned_on: TODAY, important: true }],
        coach_sessions: [...rows.coach_sessions,
          session(theirs.held, new Date(2026, 10, 16, 10, 0), { outcome: 'held', written_up_at: new Date(2026, 10, 16, 12).toISOString(), recap: `${name} secret recap.` }),
          session(theirs.future, new Date(2026, 10, 17, 11, 0))],
        coach_session_actions: [...rows.coach_session_actions, { id: theirs.action, session_id: theirs.held, coach_id: OTHER, title: `${name} secret action`, send: true, goes_to: 'week', position: 1, done_at: null, placed_at: null }],
        coach_session_notes: [...rows.coach_session_notes, { session_id: theirs.held, coach_id: OTHER, layout: 'regular', focus: `${name} secret focus`, insight: null, next_time: `${name} secret next time`, supervision: `${name} secret supervision` }],
        coach_days: [...(rows.coach_days || []), { coach_id: OTHER, day: TODAY, plan_todos: [theirs.todo], planned_at: new Date(2026, 10, 17, 8).toISOString(), plan_skipped: false, shutdown: { note: `${name} secret day` }, closed_at: null }],
        coach_weeks: [...(rows.coach_weeks || []), { coach_id: OTHER, week_start: '2026-11-16', energy: 'poor', energy_at: null, review: { change: `${name} secret review` }, reviewed_at: null }],
      };
    };
    const addresses = [
      [`/coach/sessions/${theirs.held}`, /This session isn’t here any more\./, 'a session that went ahead, with its recap and notes'],
      [`/coach/sessions/${theirs.future}`, /This session isn’t here any more\./, 'a session to come (where the brief opens from)'],
      [`/coach/todos/lists/${theirs.list}`, /This list isn’t here any more\./, 'a to-do list'],
      [`/coach/clients/${theirs.client}`, /isn’t in your list any more/, 'the client’s page'],
      [`/coach/clients/${theirs.client}/close`, /isn’t in your list any more/, 'the client’s guided close'],
      [`/coach/todos?todo=${theirs.todo}`, /To-dos/i, 'To-dos with a to-do’s id in the address'],
      [`/coach/todos/${theirs.todo}`, /Today/i, 'a to-do’s id as an address'],
      ['/coach/todos?tab=upcoming', /To-dos/i, 'Upcoming'],
      ['/coach', /Today/i, 'Today'],
    ];
    const walk = async (t, who, phase) => {
      const { page } = t;
      for (const [path, calm, what] of addresses) {
        await go(page, path, 900);
        const text = await words(page);
        pass(`reach, ${who}${phase}: ${what} shows nothing of the other coach’s`, calm.test(text) && !SECRET.test(text) && (await page.locator('.ds-modal--shown').count()) === 0, `${path}: ${flat(text).slice(0, 110)}`);
      }
      // The menu lists the coach's own to-do lists only, and search finds nothing.
      await go(page, '/coach');
      await page.getByRole('button', { name: /^(Open the menu|Menu)/ }).first().click().catch(() => null);
      await settle(page, 400);
      pass(`reach, ${who}${phase}: the menu lists only their own to-do lists`, !SECRET.test(await page.locator('.cc-menu').innerText().catch(() => '')) && /Kestrel renewal/.test(await page.locator('.cc-menu').innerText().catch(() => '')));
      await page.keyboard.press('Escape'); await settle(page, 300);
      await button(page, 'Search, or do anything').click(); await settle(page, 300);
      await page.keyboard.type('secret'); await settle(page, 400);
      pass(`reach, ${who}${phase}: search finds nothing of it`, /Nothing matches/.test(await page.locator('.cc-jump-list').innerText().catch(() => '')));
      await page.keyboard.press('Escape'); await settle(page, 300);
    };

    // ---- An associate (Maya), with the owner's rows in the database.
    {
      const tag = 'reach, an associate';
      const t = await openAt(TUE, { role: 'associate', tag, seedOptions: { sessions: true }, seed: (rows) => others(rows, 'Owner’s') });
      const { page, store } = t;
      await walk(t, 'an associate', '');
      pass(`${tag}: the database held the owner’s rows all along, and never returned one`, store.withheld > 0 && store.rows.coach_sessions.some((s) => s.coach_id === OTHER), `${store.withheld} withheld`);
      pass(`${tag}: no page asked the database for another coach’s rows by id`, !t.asked.some((a) => a.includes(OTHER) || Object.values(theirs).some((id) => a.includes(id))), t.asked.filter((a) => a.includes(OTHER)).slice(0, 3).join('; '));
      pass(`${tag}: nothing of the owner’s is in her device copy afterwards`, !SECRET.test(await deviceText(page)));
      // A save forced from her own page at one of the owner's rows is refused by the database, and changes nothing.
      const forced = await page.evaluate(async ([held, mine, base]) => {
        const send = (path, method, body) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.status).catch(() => 0);
        return {
          upsert: await send('/rest/v1/coach_sessions?on_conflict=id', 'POST', { id: held, coach_id: mine, profile_id: null, recap: 'Taken over.' }),
          patch: await send(`/rest/v1/coach_sessions?id=eq.${held}`, 'PATCH', { recap: 'Rewritten.' }),
          remove: await send(`/rest/v1/coach_session_notes?session_id=eq.${held}`, 'DELETE'),
        };
      }, [theirs.held, ME, readEnv().TEST_SUPABASE_URL.replace(/\/$/, '')]);
      const kept = store.rows.coach_sessions.find((s) => s.id === theirs.held);
      pass(`${tag}: a save, a change and a delete forced at the owner’s session change nothing`, Boolean(forced) && kept?.recap === 'Owner’s secret recap.' && kept.coach_id === OTHER && store.rows.coach_session_notes.some((n) => n.session_id === theirs.held), JSON.stringify(forced));
      // Even if such a row ever reached her device (it can't through the rules), no page shows it.
      store.leak = true;
      await walk(t, 'an associate', ', had a row leaked');
      store.leak = false;
      await t.done({ refusals: null, waiting: true });
    }

    // ---- The owner, with an associate's sessions in the database.
    {
      const tag = 'reach, the owner';
      const t = await openAt(TUE, { role: 'owner', tag, seedOptions: { sessions: true }, seed: (rows) => others(rows, 'Maya’s'), admin: ADMIN_ROWS() });
      const { page, store } = t;
      await walk(t, 'the owner', '');
      pass(`${tag}: the database never returned an associate’s session, note, action or to-do`, store.withheld > 0, `${store.withheld} withheld`);
      pass(`${tag}: nothing of the associate’s is in the owner’s device copy`, !SECRET.test(await deviceText(page)));
      await go(page, '/coach/settings/coaches');
      await page.getByRole('button', { name: 'Edit Maya Collins' }).click(); await settle(page, 600);
      const text = flat(await dialog(page).innerText());
      pass(`${tag}: the engagement’s count still shows in the owner’s admin facts`, /Owen Price Kestrel Group, 5 of 6 to go/.test(text) && /never their coaching notes/.test(text), text.slice(0, 300));
      pass(`${tag}: the admin facts say nothing of what was said`, !SECRET.test(text));
      store.leak = true;
      await walk(t, 'the owner', ', had a row leaked');
      store.leak = false;
      await t.done({ refusals: null, waiting: true });
    }
  }

  // ================================================================ 2. a recap sent twice
  if (has('d-twice')) {
    const tag = 'sent twice';
    const hannahUser = u(7010);
    const seed = (rows) => ({ ...rows, client_profiles: rows.client_profiles.map((p) => (p.id === SES.hannah ? { ...p, user_id: hannahUser } : p)) });
    const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, seed, path: `/coach/sessions/${SES.write}` });
    const { page: a, store } = t;
    store.api.live = true;
    const first = store.rows.coach_sessions.find((s) => s.id === SES.write).recap;
    // A second tab and a second device, both opened while the recap is still unsent.
    const b = await t.tab(`/coach/sessions/${SES.write}`);
    const other = await openAt(TUE, { tag: `${tag}, the second device`, seedOptions: { sessions: true }, seed, path: `/coach/sessions/${SES.write}`, share: store });
    const c = other.page;
    pass(`${tag}: all three show Send the recap to begin with`, (await a.locator('.cc-ses-bar').count()) === 1 && (await b.locator('.cc-ses-bar').count()) === 1 && (await c.locator('.cc-ses-bar').count()) === 1);

    await press(a, 'Send the recap');
    await settle(a, 1500);
    pass(`${tag}: the first press sends it, and says so`, (await toast(a)) === 'Sent. Hannah gets it by email and in the portal, with the actions you ticked.' && store.sends.length === 1 && store.sends[0].answer === 'sent', `${await toast(a)}; ${JSON.stringify(store.sends)}`);
    pass(`${tag}: a second press isn’t there to make: the page is read-only`, (await a.locator('.cc-ses-bar').count()) === 0 && /The recap has been sent/.test(await words(a)));

    // A reload: still read-only.
    await a.reload(); await a.waitForSelector('.cc-app'); await settle(a, 1200);
    pass(`${tag}: after a reload there is still nothing to press`, (await a.locator('.cc-ses-bar').count()) === 0 && /The recap has been sent/.test(await words(a)));

    // The second tab hears of it from the device; whatever it then does, nothing is sent again.
    await settle(b, 600);
    const bBar = await b.locator('.cc-ses-bar').count();
    if (bBar) {
      await b.getByLabel('Recap for Hannah').fill('A second version, typed in the other tab.').catch(() => {});
      await press(b, 'Send the recap'); await settle(b, 1200);
      pass(`${tag}: the second tab’s press says it has already been sent`, (await toast(b)) === 'This recap has already been sent.', await toast(b));
    } else {
      pass(`${tag}: the second tab turned read-only by itself`, /The recap has been sent/.test(await words(b)));
    }
    pass(`${tag}: the second tab ends showing the recap as it was sent`, /The recap has been sent/.test(await words(b)) && (await b.locator('.cc-ses-bar').count()) === 0 && !/A second version/.test(await words(b)), flat(await words(b)).slice(0, 160));

    // The second device knows nothing of it: it rewrites the recap and presses Send.
    await c.getByLabel('Recap for Hannah').fill('A third version, typed on another device.');
    await settle(c, 1700);
    await press(c, 'Send the recap'); await settle(c, 1500);
    pass(`${tag}: the second device’s press is answered “already sent”, and says so`, (await toast(c)) === 'This recap has already been sent.' && store.sends.filter((s) => s.answer === 'already_sent').length >= 1, `${await toast(c)}; ${JSON.stringify(store.sends.map((s) => s.answer))}`);
    pass(`${tag}: one “sent” in all, the rest “already sent”`, store.sends.filter((s) => s.answer === 'sent').length === 1 && store.sends.every((s) => ['sent', 'already_sent'].includes(s.answer)), JSON.stringify(store.sends.map((s) => s.answer)));
    pass(`${tag}: one email claim at most, and the server sent once`, store.claims.filter((x) => x.first).length === 1 && (store.api.answers || []).filter((x) => x.sent === true).length === 1, JSON.stringify([store.claims, store.api.answers]));
    pass(`${tag}: the second device then shows the session as it was sent`, /The recap has been sent/.test(await words(c)) && !/A third version/.test(await words(c)) && (await c.locator('.cc-ses-bar').count()) === 0, flat(await words(c)).slice(0, 200));
    const seen = store.fn.my_session_recaps(hannahUser).find((r) => r.session_id === SES.write);
    pass(`${tag}: the recap the client sees is the first one`, seen?.recap === first && store.rows.coach_sessions.find((s) => s.id === SES.write).recap === first, String(seen?.recap).slice(0, 80));
    pass(`${tag}: the client was sent the two ticked actions, as they were`, seen?.actions.length === 2 && seen.actions[0].title === 'Hand the launch plan to Femi by Wednesday', JSON.stringify(seen?.actions.map((x) => x.title)));
    await other.done({ refusals: null, waiting: true, keep: true });
    await t.done({ refusals: null });
  }

  // ================================================================ 3. double taps: one of each
  if (has('d-taps')) {
    // ---- Tuesday morning: Send, Add to-do, Move to tomorrow, Start my day, Waive it, Move to Past clients, Send the follow-up.
    {
      const tag = 'double tap';
      const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, path: `/coach/sessions/${SES.write}` });
      const { page, store } = t;
      store.api.live = true;

      await twice(button(page, 'Send the recap'));
      await settle(page, 1800);
      pass(`${tag}: Send the recap, two clicks in the same moment: one send, one email`, store.sends.filter((s) => s.session === SES.write).length === 1 && store.claims.filter((c) => c.session === SES.write).length === 1 && store.api.asked.filter((x) => x.sessionId === SES.write).length === 1, JSON.stringify([store.sends, store.claims.length, store.api.asked.length]));
      const leo = store.rows.coach_sessions.find((s) => s.profile_id === ID.leo && s.outcome === 'held' && !s.recap_sent_at);
      await go(page, `/coach/sessions/${leo.id}`);
      await enterAndClick(page, button(page, 'Send the recap'));
      await settle(page, 1800);
      pass(`${tag}: Send the recap, Enter and a click together: one send`, store.sends.filter((s) => s.session === leo.id).length === 1 && store.sends.find((s) => s.session === leo.id).answer === 'sent', JSON.stringify(store.sends));

      // Add to-do: the button twice, then Enter with a click.
      await go(page, '/coach/todos');
      const quick = page.locator('.cc-col > .cc-qadd');
      await quick.getByLabel('What needs doing?').fill('Pressed twice at once');
      await twice(quick.getByRole('button', { name: 'Add to-do', exact: true }));
      await settle(page, 1000);
      pass(`${tag}: Add to-do, two clicks: one to-do`, store.rows.coach_todos.filter((r) => r.title === 'Pressed twice at once').length === 1, `${store.rows.coach_todos.filter((r) => r.title === 'Pressed twice at once').length}`);
      await quick.getByLabel('What needs doing?').fill('Enter and the button together');
      await page.keyboard.down('Enter');
      await quick.getByRole('button', { name: 'Add to-do', exact: true }).evaluate((el) => el.click());
      await page.keyboard.up('Enter');
      await settle(page, 1000);
      pass(`${tag}: Add to-do, Enter and a click together: one to-do`, store.rows.coach_todos.filter((r) => r.title === 'Enter and the button together').length === 1, `${store.rows.coach_todos.filter((r) => r.title === 'Enter and the button together').length}`);

      // Move … to tomorrow.
      await go(page, '/coach');
      await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 500);
      await dialog(page).getByRole('button', { name: 'Choose what to move' }).click(); await settle(page, 500);
      const n = await dialog(page).locator('[role=checkbox][aria-checked=true]').count();
      let before = count(store, /^POST coach_todos$/);
      await twice(dialog(page).locator('.ds-btn--primary'));
      await settle(page, 1200);
      pass(`${tag}: Move ${n} to tomorrow, two clicks: each to-do is moved once`, n > 0 && count(store, /^POST coach_todos$/) - before === n && (await toast(page)) === `${n} moved to tomorrow` && (await page.locator('.ds-toast').count()) === 1, `${count(store, /^POST coach_todos$/) - before} saves for ${n}; ${await toast(page)}`);

      // Start my day.
      await take(page);
      await press(page, 'Next'); await press(page, 'Next');
      before = count(store, /^POST coach_days$/);
      await twice(dialog(page).locator('.ds-btn--primary'));
      await settle(page, 1200);
      pass(`${tag}: Start my day, two clicks: the day is planned once`, count(store, /^POST coach_days$/) - before === 1 && store.rows.coach_days.filter((d) => d.day === TODAY).length === 1 && (await toast(page)) === 'Your day is planned', `${count(store, /^POST coach_days$/) - before}; ${await toast(page)}`);

      // Waive it.
      await go(page, `/coach/sessions/${SES.late}`);
      before = count(store, /^POST coach_sessions$/);
      await twice(button(page, 'Waive it'));
      await settle(page, 1200);
      pass(`${tag}: Waive it, two clicks: waived once`, count(store, /^POST coach_sessions$/) - before === 1 && store.rows.coach_sessions.find((s) => s.id === SES.late).waived === true && (await page.locator('.ds-toast').count()) === 1, `${count(store, /^POST coach_sessions$/) - before} saves; ${await page.locator('.ds-toast').count()} toasts`);
      // Waived then un-waived quickly: the last press is what stays, here and in the database.
      await page.getByRole('button', { name: 'Count it as used' }).click();
      await page.getByRole('button', { name: 'Waive it' }).click({ timeout: 4000 }).catch(() => null);
      await page.getByRole('button', { name: 'Count it as used' }).click({ timeout: 4000 }).catch(() => null);
      await settle(page, 1500);
      const late = store.rows.coach_sessions.find((s) => s.id === SES.late);
      const shown = /It counts as one of Hannah’s sessions\./.test(await words(page));
      pass(`${tag}: waived then un-waived quickly ends as the last press, on the page and in the database`, late.waived === false && shown && store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_held === 6, `waived ${late.waived}; page says it counts: ${shown}; held ${store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_held}`);

      // Move to Past clients.
      await go(page, `/coach/clients/${ID.mia}/close`);
      before = count(store, /^POST client_profiles$/);
      await twice(button(page, 'Move to Past clients'));
      await settle(page, 1200);
      pass(`${tag}: Move to Past clients, two clicks: moved once`, count(store, /^POST client_profiles$/) - before === 1 && store.rows.client_profiles.find((p) => p.id === ID.mia).status === 'past' && (await page.locator('.ds-toast').count()) === 1, `${count(store, /^POST client_profiles$/) - before}`);

      // Send the follow-up (a workshop that has happened).
      await go(page, `/coach/workshops/${ID.wsPast}`);
      const ask = page.getByRole('button', { name: 'Send the follow-up' }).first();
      if (await ask.count()) {
        await ask.click(); await settle(page, 500);
        await twice(dialog(page).getByRole('button', { name: 'Send the follow-up' }));
        await settle(page, 1500);
        pass(`${tag}: Send the follow-up, two clicks: asked for once, claimed once`, store.api.asked.filter((x) => x.kind === 'workshop_follow_up').length === 1 && store.rows.workshop_sends.filter((x) => x.workshop_id === ID.wsPast && x.kind === 'follow_up').length === 1, JSON.stringify(store.api.asked.filter((x) => x.kind === 'workshop_follow_up').length));
        await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 1200);
        pass(`${tag}: once sent, the follow-up can’t be sent again from the page`, (await page.getByRole('button', { name: 'Send the follow-up' }).count()) === 0);
      } else pass(`${tag}: Send the follow-up is offered for a workshop that has happened`, false, flat(await words(page)).slice(0, 200));
      await t.done({ refusals: 0 });
    }
    // ---- The evening: Close the day.
    {
      const tag = 'double tap, evening';
      const t = await openAt(EVE, { tag });
      const { page, store } = t;
      await take(page);
      await press(page, 'Next'); await press(page, 'Next');
      const before = count(store, /^POST coach_days$/);
      await twice(dialog(page).locator('.ds-btn--primary'));
      await settle(page, 1200);
      pass(`${tag}: Close the day, two clicks: closed once`, count(store, /^POST coach_days$/) - before === 1 && Boolean(store.rows.coach_days.find((d) => d.day === TODAY)?.closed_at) && (await toast(page)) === 'Day closed' && (await page.locator('.ds-toast').count()) === 1, `${count(store, /^POST coach_days$/) - before}; ${await toast(page)}`);
      await t.done({ refusals: 0 });
    }
    // ---- A Friday afternoon: Rate my energy, then Finish the review.
    {
      const tag = 'double tap, Friday';
      const t = await openAt(FRI, { tag });
      const { page, store } = t;
      await take(page);
      let before = count(store, /^POST coach_weeks$/);
      await twice(page.getByRole('radio', { name: 'Good', exact: true }));
      await settle(page, 1200);
      pass(`${tag}: Rate my energy, two taps: rated once`, count(store, /^POST coach_weeks$/) - before === 1 && store.rows.coach_weeks.filter((w) => w.coach_id === ME).length === 1 && store.rows.coach_weeks[0].energy === 'good', `${count(store, /^POST coach_weeks$/) - before} saves`);
      await take(page);
      for (let i = 0; i < 4; i += 1) await press(page, 'Next');
      await dialog(page).locator('textarea').fill('Keep Thursday afternoon clear.');
      before = count(store, /^POST coach_weeks$/);
      await twice(dialog(page).locator('.ds-btn--primary'));
      await settle(page, 1200);
      pass(`${tag}: Finish the review, two clicks: finished once`, count(store, /^POST coach_weeks$/) - before === 1 && Boolean(store.rows.coach_weeks[0].reviewed_at) && store.rows.coach_weeks[0].review.change === 'Keep Thursday afternoon clear.' && (await toast(page)) === 'Review saved', `${count(store, /^POST coach_weeks$/) - before}; ${await toast(page)}`);
      await t.done({ refusals: 0 });
    }
  }

  // ================================================================ 4. 500 to-dos
  if (has('d-500')) {
    const PAINT_FIRST = 5000; // the first visit: the data is read from the database, then drawn
    const PAINT_AGAIN = 3000; // a later visit: drawn from the device's copy
    const TYPED = 150; // one typed character, to the screen
    const dayKey = (offset) => { const d = new Date(2026, 10, 17 + offset, 12); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const lists = [DAY.listKestrel, DAY.listBook, DAY.listAdmin];
    /** 500 to-dos: 120 for today (20 Important, 20 After work), 180 on the 30 days ahead, 150 Someday and 50 done this week; 180 of them in three lists. */
    const many = (rows) => {
      const blank = { ...rows.coach_todos[0], important: false, due_on: null, list_id: null, heading_id: null, profile_id: null, minutes: null, checklist: [], planned_time: null, planned_on: null, someday: false, after_work: false, done_at: null, repeat_rule: null, from_email_sender: null, from_email_subject: null, from_email_at: null };
      const todos = Array.from({ length: 500 }, (_, i) => {
        const row = { ...blank, id: u(90000 + i), title: `To-do number ${i + 1}, with enough words to look like a real one`, position: (i + 1) * 1000, list_id: i % 5 < 2 && i >= 120 && i < 450 ? lists[i % 3] : null };
        if (i < 120) return { ...row, planned_on: TODAY, important: i < 20, after_work: i >= 100, minutes: i < 40 ? 15 : null };
        if (i < 300) return { ...row, planned_on: dayKey(1 + ((i - 120) % 30)), important: i % 17 === 0 };
        if (i < 450) return { ...row, someday: true, important: i % 19 === 0 };
        return { ...row, planned_on: TODAY, done_at: new Date(2026, 10, 17, 8, i - 450).toISOString() };
      });
      return { ...rows, coach_todos: todos, coach_tag_links: rows.coach_tag_links.filter((l) => l.item_kind !== 'todo') };
    };
    const size = (page, me) => page.evaluate((id) => {
      const local = localStorage.getItem(`clarity-coach-local:${id}`) || '';
      const cache = localStorage.getItem(`clarity-cache:${id}:coach`) || '';
      let all = 0;
      for (const k of Object.keys(localStorage)) all += k.length + (localStorage.getItem(k) || '').length;
      return { local: local.length, cache: cache.length, all };
    }, me);
    const kb = (chars) => `${Math.round(chars / 1024)} KB`;
    const LIMIT = 5 * 1024 * 1024; // a browser keeps about 5 million characters for a site

    {
      const tag = '500 to-dos';
      const t = await openAt(TUE, { tag, seed: many });
      const { page, store, me } = t;
      // The first visit reads everything, then draws it.
      let t0 = Date.now();
      await page.goto(`${APP}/coach/todos`);
      await page.waitForSelector('.cc-todo-row', { timeout: 20000 });
      const again = Date.now() - t0;
      await settle(page, 1200);
      await clearDevice(page, me);
      t0 = Date.now();
      await page.goto(`${APP}/coach/todos`);
      await page.waitForSelector('.cc-todo-row', { timeout: 20000 });
      const first = Date.now() - t0;
      await settle(page, 1500);
      console.log(`  COUNT 500 to-dos: To-dos painted in ${first} ms with nothing on the device (read from the database first), and in ${again} ms from the device’s copy.`);
      pass(`${tag}: To-dos opens in under ${PAINT_FIRST} ms on a first visit`, first < PAINT_FIRST, `${first} ms`);
      pass(`${tag}: and in under ${PAINT_AGAIN} ms from the device’s copy`, again < PAINT_AGAIN, `${again} ms`);
      const todayRows = await page.locator('#cc-todo-tab .cc-todo-row').count();
      console.log(`  COUNT 500 to-dos: the Today tab draws all ${todayRows} of today’s rows at once (it has no “Show 50 more”).`);
      pass(`${tag}: Today lists today’s 120, the Important ones first`, todayRows === 120 && (await page.locator('#cc-todo-tab [role=list]').first().locator('.cc-todo-row').nth(19).locator('.ds-todo--important').count()) === 1 && (await page.locator('#cc-todo-tab [role=list]').first().locator('.cc-todo-row').nth(20).locator('.ds-todo--important').count()) === 0, `${todayRows} rows`);

      // A typed character.
      const box = page.locator('.cc-col > .cc-qadd').getByLabel('What needs doing?');
      await box.click();
      const text = 'Ring the venue about parking';
      const times = [];
      for (let i = 0; i < text.length; i += 1) {
        const s0 = Date.now();
        await page.keyboard.type(text[i]);
        await page.waitForFunction((want) => document.querySelector('.cc-qadd-title')?.textContent === want, text.slice(0, i + 1).trim(), { timeout: 5000 }).catch(() => null);
        times.push(Date.now() - s0);
      }
      const worst = Math.max(...times);
      const typical = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
      console.log(`  COUNT 500 to-dos: a typed character shows in ${typical} ms (the slowest of ${times.length} took ${worst} ms).`);
      pass(`${tag}: a typed character shows in under ${TYPED} ms`, typical < TYPED && worst < TYPED * 3, `typical ${typical} ms, slowest ${worst} ms`);
      await box.fill('');

      // Scrolling to the foot and back, in ten steps each way, never freezes the page (each step is laid out before the next).
      t0 = Date.now();
      const steps = await page.evaluate(() => {
        const h = document.documentElement.scrollHeight;
        const times = [];
        for (const y of [...Array.from({ length: 10 }, (_, i) => ((i + 1) * h) / 10), ...Array.from({ length: 10 }, (_, i) => h - ((i + 1) * h) / 10)]) {
          const s0 = performance.now();
          window.scrollTo(0, y);
          document.body.getBoundingClientRect();
          times.push(performance.now() - s0);
        }
        return { height: h, worst: Math.round(Math.max(...times)) };
      });
      // Then the frames themselves: at the foot, and back at the top.
      const twoFrames = async (y) => { const f0 = Date.now(); await page.evaluate((to) => new Promise((r) => { window.scrollTo(0, to === 'foot' ? document.documentElement.scrollHeight : 0); requestAnimationFrame(() => requestAnimationFrame(r)); }), y); return Date.now() - f0; };
      const atFoot = await twoFrames('foot');
      const atTop = await twoFrames('top');
      const frames = atFoot + atTop;
      console.log(`  COUNT 500 to-dos: the page is ${steps.height}px tall; scrolling it in 20 steps took ${Date.now() - t0 - frames} ms (the slowest step ${steps.worst} ms), and two frames drawn at the foot ${atFoot} ms, at the top ${atTop} ms.`);
      pass(`${tag}: the page scrolls to its foot and back without freezing`, Date.now() - t0 - frames < 1000 && steps.worst < 200 && atFoot < 500 && atTop < 500, `${Date.now() - t0} ms in all; frames at the foot ${atFoot} ms, at the top ${atTop} ms`);

      // Upcoming and Someday: 50 at a time.
      for (const [tabName, all] of [['Upcoming', 180], ['Someday', 150]]) {
        await page.getByRole('tab', { name: tabName }).click(); await settle(page, 700);
        const shown = () => page.locator('#cc-todo-tab .cc-todo-row').count();
        pass(`${tag}: ${tabName} shows the first 50, with “Show 50 more”`, (await shown()) === 50 && (await page.getByRole('button', { name: 'Show 50 more' }).count()) === 1, `${await shown()} rows`);
        await press(page, 'Show 50 more');
        pass(`${tag}: ${tabName}: “Show 50 more” shows 100`, (await shown()) === 100, `${await shown()} rows`);
        let presses = 0;
        while ((await page.getByRole('button', { name: /^Show \d+ more$/ }).count()) && presses < 5) { await page.getByRole('button', { name: /^Show \d+ more$/ }).click(); await settle(page, 300); presses += 1; }
        pass(`${tag}: ${tabName}: every one can be reached, and then the link goes`, (await shown()) === all && (await page.getByRole('button', { name: /^Show \d+ more$/ }).count()) === 0, `${await shown()} of ${all}`);
      }

      // Choose every one shown on a tab (M11 draws no "Select all": each row's own tick), Complete, then Undo.
      await page.getByRole('tab', { name: 'Upcoming' }).click(); await settle(page, 500);
      await page.getByRole('tab', { name: 'Someday' }).click(); await settle(page, 700);
      await page.evaluate(() => { document.querySelectorAll('#cc-todo-tab .cc-pick').forEach((b) => b.click()); });
      await settle(page, 500);
      pass(`${tag}: all 50 shown on Someday can be chosen`, /50 chosen/.test(await page.locator('.cc-todo-bulk').innerText().catch(() => '')), await page.locator('.cc-todo-bulk').innerText().catch(() => 'no bar'));
      const doneBefore = store.rows.coach_todos.filter((r) => r.done_at).length;
      t0 = Date.now();
      await page.locator('.cc-todo-bulk').getByRole('button', { name: 'Complete' }).click();
      await page.waitForFunction(() => /Completed 50 to-dos\./.test(document.querySelector('.ds-toast-text')?.textContent || ''), null, { timeout: 30000 }).catch(() => null);
      const completeMs = Date.now() - t0;
      pass(`${tag}: Complete says “Completed 50 to-dos.”, and all 50 are done in the database`, (await toast(page)) === 'Completed 50 to-dos.' && store.rows.coach_todos.filter((r) => r.done_at).length === doneBefore + 50, `${await toast(page)}; ${store.rows.coach_todos.filter((r) => r.done_at).length - doneBefore} done in ${completeMs} ms`);
      await settle(page, 400);
      pass(`${tag}: Someday then shows the next 50`, (await page.locator('#cc-todo-tab .cc-todo-row').count()) === 50);
      await undo(page);
      for (let i = 0; i < 20 && store.rows.coach_todos.filter((r) => r.done_at).length !== doneBefore; i += 1) await settle(page, 300);
      pass(`${tag}: Undo brings all 50 back, not done`, store.rows.coach_todos.filter((r) => r.done_at).length === doneBefore && (await page.locator('.cc-todo-bulk').count()) === 0, `${store.rows.coach_todos.filter((r) => r.done_at).length - doneBefore} still done`);

      // Today stays usable.
      t0 = Date.now();
      await page.goto(`${APP}/coach`);
      await page.waitForSelector('.cc-todo-row', { timeout: 20000 });
      const todayMs = Date.now() - t0;
      await settle(page, 900);
      console.log(`  COUNT 500 to-dos: Today painted in ${todayMs} ms, with ${await page.locator('.cc-todo-row').count()} to-do rows.`);
      pass(`${tag}: Today opens in under ${PAINT_AGAIN} ms`, todayMs < PAINT_AGAIN, `${todayMs} ms`);
      await page.locator('.cc-todo-row').nth(30).locator('.ds-check-box').click();
      await settle(page, 800);
      pass(`${tag}: a to-do can still be ticked on Today, at once`, (await toast(page)) === 'Done' && store.rows.coach_todos.filter((r) => r.done_at).length === doneBefore + 1, await toast(page));
      await page.locator('.ds-offer-take').click(); await settle(page, 600);
      await press(page, 'Next');
      pass(`${tag}: Plan my day lists 12 of the days ahead, with “Show all 180”`, (await dialog(page).locator('.cc-today-pick').count()) === 12 && (await dialog(page).getByRole('button', { name: 'Show all 180' }).count()) === 1, `${await dialog(page).locator('.cc-today-pick').count()}`);
      await closePanel(page);
      // A list's own page, with 60 or so to-dos.
      await go(page, `/coach/todos/lists/${DAY.listBook}`);
      pass(`${tag}: a list with ${store.rows.coach_todos.filter((r) => r.list_id === DAY.listBook).length} to-dos opens`, (await page.locator('.cc-todo-row').count()) === store.rows.coach_todos.filter((r) => r.list_id === DAY.listBook && !r.done_at).length);
      const s = await size(page, me);
      console.log(`  COUNT 500 to-dos: the device copy is ${kb(s.cache || s.local)} (${Math.round(((s.cache || s.local) / LIMIT) * 100)}% of the browser’s limit of about 5 MB); everything the portal keeps here is ${kb(s.all)}.`);
      pass(`${tag}: the device copy stays far under the browser’s storage limit`, (s.cache || s.local) > 0 && s.all < LIMIT / 2, JSON.stringify(s));
      await t.done({ refusals: 0 });
    }
    // Device only (before 050): the same 500 kept on the device.
    {
      const tag = '500 to-dos, device only';
      const t = await openAt(TUE, { tag, db: 'none', seed: many, path: '/coach/todos' });
      const { page, me } = t;
      pass(`${tag}: To-dos opens with all of today’s`, (await page.locator('#cc-todo-tab .cc-todo-row').count()) === 120);
      const box = page.locator('.cc-col > .cc-qadd').getByLabel('What needs doing?');
      await box.fill('One more, on the device');
      await box.press('Enter'); await settle(page, 800);
      pass(`${tag}: one more is added and kept`, (await toast(page)) === 'Added to Today.' && (await t.rowsNow('coach_todos')).length === 501, `${await toast(page)}; ${(await t.rowsNow('coach_todos')).length}`);
      const s = await size(page, me);
      console.log(`  COUNT 500 to-dos, device only: the device copy is ${kb(s.local)} (${Math.round((s.local / LIMIT) * 100)}% of about 5 MB).`);
      pass(`${tag}: the device copy stays far under the browser’s storage limit`, s.local > 0 && s.all < LIMIT / 2, JSON.stringify(s));
      await t.done();
    }
  }

  // ================================================================ 5. two tabs
  if (has('d-tabs')) {
    const tag = 'two tabs';
    const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, path: '/coach/todos' });
    const { page: a, store } = t;
    const b = await t.tab('/coach/todos');
    const todo = (id) => store.rows.coach_todos.find((r) => r.id === id);
    const openTodo = async (page, id) => { await page.locator(`.cc-todo-open[data-todo="${id}"]`).first().click(); await settle(page, 600); };
    const setTitle = async (page, title) => { const box = dialog(page).getByLabel('To-do', { exact: true }); await box.fill(title); await box.press('Enter'); await settle(page, 900); };

    // ---- the same to-do edited in both
    await openTodo(a, DAY.t9);
    await openTodo(b, DAY.t9);
    await setTitle(a, 'Reply to Elena Ruiz, from tab one');
    await dialog(b).getByRole('switch', { name: 'Important' }).click(); await settle(b, 900);
    pass(`${tag}: one tab’s new words and the other’s Important are both kept`, todo(DAY.t9).title === 'Reply to Elena Ruiz, from tab one' && todo(DAY.t9).important === true, JSON.stringify([todo(DAY.t9).title, todo(DAY.t9).important]));
    await setTitle(a, 'Words from the first tab');
    await setTitle(b, 'Words from the second tab');
    await settle(a, 700);
    const [inA, inB] = [await dialog(a).getByLabel('To-do', { exact: true }).inputValue(), await dialog(b).getByLabel('To-do', { exact: true }).inputValue()];
    pass(`${tag}: the same words edited in both end as the later save, in both tabs and the database`, inA === 'Words from the second tab' && inB === inA && todo(DAY.t9).title === inA && todo(DAY.t9).important === true, `${inA} | ${inB} | ${todo(DAY.t9).title}`);
    // Typing still in one tab's box when the other tab saves: what happens to it?
    await dialog(a).getByLabel('To-do', { exact: true }).fill('Half typed in the first tab');
    await dialog(b).getByLabel('Notes').fill('A note from the second tab.');
    await dialog(b).getByLabel('To-do', { exact: true }).click(); await settle(b, 900);
    const halfTyped = await dialog(a).getByLabel('To-do', { exact: true }).inputValue();
    pass(`${tag}: words still being typed in one tab survive the other tab’s save of something else`, halfTyped === 'Half typed in the first tab' && todo(DAY.t9).notes === 'A note from the second tab.', `${halfTyped} | ${todo(DAY.t9).notes}`);
    await dialog(a).getByLabel('To-do', { exact: true }).press('Enter'); await settle(a, 900);
    pass(`${tag}: and saving them keeps the other tab’s note`, todo(DAY.t9).title === 'Half typed in the first tab' && todo(DAY.t9).notes === 'A note from the second tab.', JSON.stringify([todo(DAY.t9).title, todo(DAY.t9).notes]));
    await closePanel(a); await closePanel(b);

    // ---- ticked in one, deleted in the other, at the same moment
    await b.locator(`.cc-todo-row:has([data-todo="${DAY.t2}"]) .cc-todo-more`).click(); await settle(b, 400);
    const del = b.getByRole('menuitem', { name: 'Delete' });
    await Promise.all([
      a.locator(`.cc-todo-row:has([data-todo="${DAY.t2}"]) .ds-check-box`).first().click(),
      del.click({ timeout: 3000 }).catch(() => null),
    ]);
    await settle(a, 1500); await settle(b, 600);
    {
      const row = todo(DAY.t2);
      const local = await a.evaluate(([id, key]) => { for (const k of [`clarity-coach-local:${id}`, `clarity-cache:${id}:coach`]) { const s = JSON.parse(localStorage.getItem(k) || 'null'); if (s) { const r = s.rows?.coach_todos?.[key]; return r && !s.marks?.coach_todos?.[key]?.gone ? { done: Boolean(r.done_at) } : null; } } return null; }, [t.me, DAY.t2]);
      const shows = async (page) => (await page.locator(`#cc-todo-tab [data-todo="${DAY.t2}"]`).count());
      const same = (row ? { done: Boolean(row.done_at) } : null);
      pass(`${tag}: ticked in one tab and deleted in the other: the device and the database end the same (${row ? 'done' : 'deleted'})`, JSON.stringify(local) === JSON.stringify(same), `device ${JSON.stringify(local)}, database ${JSON.stringify(same)}`);
      pass(`${tag}: and neither tab still lists it for today`, (await shows(a)) === 0 && (await shows(b)) === 0);
    }

    // ---- the day planned in one tab while the other shows the offer
    await go(a, '/coach'); await go(b, '/coach');
    pass(`${tag}: both tabs offer Plan my day`, /Plan my day/.test(await words(a)) && /Plan my day/.test(await words(b)));
    await take(b); // the second tab has the panel open, and stale
    await take(a); await press(a, 'Next'); await press(a, 'Next'); await press(a, 'Start my day'); await settle(a, 900);
    pass(`${tag}: planned in one tab`, (await toast(a)) === 'Your day is planned' && store.rows.coach_days.filter((d) => d.day === TODAY && d.planned_at).length === 1);
    await press(b, 'Next'); await press(b, 'Next'); await press(b, 'Start my day'); await settle(b, 900);
    pass(`${tag}: finishing the plan in the other tab too leaves one plan for the day`, store.rows.coach_days.filter((d) => d.day === TODAY).length === 1 && Boolean(store.rows.coach_days.find((d) => d.day === TODAY).planned_at));
    await settle(a, 500);
    pass(`${tag}: and neither tab still offers Plan my day`, !/Plan my day/.test(await words(a)) && !/Plan my day/.test(await words(b)));
    {
      // Without touching the other tab: an offer shown there goes when the day is closed elsewhere... the day's row is one.
      const d = store.rows.coach_days.find((x) => x.day === TODAY);
      pass(`${tag}: the day’s plan holds each to-do once`, new Set(d.plan_todos).size === d.plan_todos.length, JSON.stringify(d.plan_todos.length));
    }

    // ---- a session written up in one tab and its recap sent in the other
    await go(a, `/coach/sessions/${SES.write}`); await go(b, `/coach/sessions/${SES.write}`);
    const sentText = store.rows.coach_sessions.find((s) => s.id === SES.write).recap;
    await a.getByLabel('Recap for Hannah').fill(`${sentText}\n\nOne more line, typed in the first tab.`);
    await settle(a, 1700); // saved
    await settle(b, 400);
    const bShows = await b.getByLabel('Recap for Hannah').inputValue();
    await press(b, 'Send the recap'); await settle(b, 1500);
    const asSent = store.rows.coach_sessions.find((s) => s.id === SES.write).recap;
    pass(`${tag}: Send in the second tab sends the recap once`, store.sends.length === 1 && store.sends[0].answer === 'sent' && /^Sent\./.test(await toast(b)), `${JSON.stringify(store.sends)}; ${await toast(b)}`);
    pass(`${tag}: what went is what the second tab showed when Send was pressed`, asSent === bShows, `sent ${asSent.length} characters; the second tab showed ${bShows.length}; the first tab had saved ${sentText.length + 41}`);
    await settle(a, 800);
    const box = a.getByLabel('Recap for Hannah');
    if (await box.count()) { await box.fill('Rewritten after it was sent.'); await settle(a, 1800); }
    pass(`${tag}: the first tab can’t change it afterwards: it shows the session as sent`, store.rows.coach_sessions.find((s) => s.id === SES.write).recap === asSent && /The recap has been sent/.test(await words(a)) && (await a.locator('.cc-ses-bar').count()) === 0, flat(await words(a)).slice(0, 140));
    // Private notes are never locked: the first tab can still write one.
    await a.getByLabel('Insight').fill('Written after the recap went.'); await settle(a, 1800);
    pass(`${tag}: its private notes can still be written`, store.rows.coach_session_notes.find((n) => n.session_id === SES.write)?.insight === 'Written after the recap went.');

    // ---- capacity edited in one tab shows in the other
    await go(b, '/coach');
    await go(a, '/coach/settings/hours');
    await a.getByRole('button', { name: 'Edit Coaching hours each week' }).click(); await settle(a, 300);
    await a.locator('.cc-setrow--edit input').fill('20');
    await a.locator('.cc-setrow--edit').getByRole('button', { name: 'Save' }).click(); await settle(a, 1200);
    pass(`${tag}: capacity saved in one tab`, store.coaches[0].capacity_hours_week === 20 && /20 hours/.test(await words(a)), `${store.coaches[0].capacity_hours_week}`);
    const cap = async (page) => flat(await page.locator('.cc-today-figures').last().innerText().catch(() => ''));
    await b.bringToFront();
    await b.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await settle(b, 1200);
    const shown = await cap(b);
    await b.reload(); await b.waitForSelector('.cc-app'); await settle(b, 1200);
    const afterReload = await cap(b);
    console.log(`  COUNT two tabs: capacity in the other tab reads “${shown}” when it is shown again, and “${afterReload}” after a reload.`);
    pass(`${tag}: the other tab shows the new capacity when it is next shown`, /of 20/.test(shown), shown);
    pass(`${tag}: and after a reload`, /of 20/.test(afterReload), afterReload);
    await t.done({ refusals: null });
  }

  // ================================================================ 6. offline and back
  if (has('d-offline')) {
    const tag = 'offline';
    const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, path: '/coach/todos' });
    const { page, store, ctx, me } = t;
    const nav = async (label, to) => {
      await button(page, 'Open the menu').click(); await settle(page, 300);
      await page.locator('.cc-menu-item', { hasText: new RegExp(`^${label}`) }).first().click(); await settle(page, 900);
      pass(`${tag}: with no signal the menu still opens ${label}`, new URL(page.url()).pathname === to && (await page.locator('.cc-app h1').count()) > 0, `${page.url()}: ${flat(await words(page)).slice(0, 200)}`);
    };
    // Each page is visited once with a signal, without a reload between them, so its code is in the tab (the Home Screen
    // app keeps every file through its service worker; these tests run without one). Then the signal goes.
    const toSession = async () => {
      await page.locator('.cc-row', { hasText: 'Hannah Wells' }).first().click(); await settle(page, 800);
      const fold = page.locator('.cc-fold-btn', { hasText: 'Sessions and recaps' }).first();
      if ((await fold.getAttribute('aria-expanded')) !== 'true') { await fold.click(); await settle(page, 300); }
      await page.locator('.cc-ses-rows .cc-row').nth(1).click(); await settle(page, 900); // newest first: next week's, then yesterday's
    };
    const visit = async (label) => { await button(page, 'Open the menu').click(); await settle(page, 300); await page.locator('.cc-menu-item', { hasText: new RegExp(`^${label}`) }).first().click(); await settle(page, 900); };
    await go(page, '/coach');
    await visit('To-dos'); await visit('Clients'); await toSession(); await visit('Today');
    const local = () => page.evaluate((id) => localStorage.getItem(`clarity-coach-local:${id}`) || '', me);
    store.down = true;
    await ctx.setOffline(true);
    const sentBefore = store.calls.length;

    // To-dos: two added, one ticked.
    await nav('To-dos', '/coach/todos');
    const quick = page.locator('.cc-col > .cc-qadd');
    const said = [];
    for (const title of ['Offline one', 'Offline two']) {
      await quick.getByLabel('What needs doing?').fill(title);
      await quick.getByRole('button', { name: 'Add to-do', exact: true }).click(); await settle(page, 900);
      said.push(await toast(page));
    }
    pass(`${tag}: two to-dos added with no signal each say “Will sync”, and show at once`, said.every((x) => x === 'Will sync') && /Offline one/.test(await words(page)) && /Offline two/.test(await words(page)), said.join(' | '));
    await page.locator(`.cc-todo-row:has([data-todo="${DAY.t9}"]) .ds-check-box`).first().click(); await settle(page, 900);
    pass(`${tag}: a tick says “Will sync”`, (await toast(page)) === 'Will sync' && (await page.locator(`#cc-todo-tab [data-todo="${DAY.t9}"]`).count()) === 0, await toast(page));

    // Plan the day.
    await nav('Today', '/coach');
    await take(page); await press(page, 'Next'); await press(page, 'Next'); await press(page, 'Start my day'); await settle(page, 900);
    pass(`${tag}: the day is planned and says “Will sync”`, (await toast(page)) === 'Will sync' && !/Plan my day/.test(await words(page)), await toast(page));

    // Write up a session and press Send.
    await nav('Clients', '/coach/clients');
    await toSession();
    const onSession = new URL(page.url()).pathname === `/coach/sessions/${SES.write}`;
    pass(`${tag}: yesterday’s session opens from the client’s page with no signal`, onSession, page.url());
    const typed = 'Thanks for today, Hannah.\n\nWritten with no signal, on the train home.';
    await page.getByLabel('Recap for Hannah').fill(typed);
    await page.getByLabel('Insight').fill('Typed offline.');
    await settle(page, 2000);
    pass(`${tag}: the recap and the note are kept on the device as they are typed`, (await local()).includes('Written with no signal, on the train home.') && (await local()).includes('Typed offline.'));
    await press(page, 'Send the recap'); await settle(page, 1500);
    const sendSaid = await toast(page);
    pass(`${tag}: Send says it needs a connection, and never “Sent”`, sendSaid === 'Sending needs a connection, so try again when you’re back online.' && !/^Sent/.test(sendSaid), sendSaid);
    pass(`${tag}: nothing was sent, the page still has Send, and the device doesn’t say it went`, store.sends.length === 0 && store.api.asked.length === 0 && (await page.locator('.cc-ses-bar').count()) === 1 && !/The recap has been sent/.test(await words(page)) && !/"recap_sent_at":"2/.test((await local()).split(SES.write)[1]?.slice(0, 900) || ''));
    pass(`${tag}: with no signal nothing reached the database`, store.calls.length === sentBefore && !store.rows.coach_todos.some((r) => /^Offline/.test(r.title)) && !store.rows.coach_todos.find((r) => r.id === DAY.t9).done_at, store.calls.slice(sentBefore).join(', '));
    pass(`${tag}: nobody is signed out`, new URL(page.url()).pathname.startsWith('/coach/sessions/') && (await page.locator('.cc-app').count()) === 1);

    // Back online.
    const at = store.calls.length;
    store.down = false;
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    for (let i = 0; i < 40 && !(store.rows.coach_days.some((d) => d.day === TODAY) && store.rows.coach_sessions.find((s) => s.id === SES.write).recap === typed && store.rows.coach_session_notes.some((n) => n.session_id === SES.write)); i += 1) await settle(page, 500);
    await settle(page, 1500);
    const added = store.rows.coach_todos.filter((r) => /^Offline/.test(r.title));
    pass(`${tag}, back online: each to-do went once`, added.length === 2 && added.filter((r) => r.title === 'Offline one').length === 1, `${added.length}`);
    pass(`${tag}, back online: the tick, the day’s plan, the recap and the note went`, Boolean(store.rows.coach_todos.find((r) => r.id === DAY.t9).done_at) && store.rows.coach_days.filter((d) => d.day === TODAY && d.planned_at).length === 1 && store.rows.coach_sessions.find((s) => s.id === SES.write).recap === typed && store.rows.coach_session_notes.find((n) => n.session_id === SES.write)?.insight === 'Typed offline.');
    const writes = store.calls.slice(at).filter((c) => /^(POST|PATCH|DELETE) /.test(c));
    const firstOf = (re) => writes.findIndex((c) => re.test(c));
    pass(`${tag}, back online: they went in the order they were made (to-dos, then the day, then the session)`, firstOf(/coach_todos/) >= 0 && firstOf(/coach_todos/) < firstOf(/coach_days/) && firstOf(/coach_days/) < firstOf(/coach_sessions$/), writes.join(', ').slice(0, 300));
    {
      const order = store.rows.coach_todos.map((r) => r.title);
      pass(`${tag}, back online: the first to-do added arrived first`, order.indexOf('Offline one') < order.indexOf('Offline two'));
      const perTable = (table) => writes.filter((c) => c === `POST ${table}`).length;
      console.log(`  COUNT offline: back online the queue sent ${writes.length} saves (${perTable('coach_todos')} to-dos, ${perTable('coach_days')} day, ${perTable('coach_sessions')} session, ${perTable('coach_session_notes')} notes).`);
      pass(`${tag}, back online: nothing was doubled`, perTable('coach_days') === 1 && store.rows.coach_days.filter((d) => d.day === TODAY).length === 1 && store.rows.coach_session_notes.filter((n) => n.session_id === SES.write).length === 1, writes.join(', ').slice(0, 300));
    }
    pass(`${tag}, back online: the recap was NOT sent by itself`, store.sends.length === 0 && store.api.asked.length === 0 && !store.rows.coach_sessions.find((s) => s.id === SES.write).recap_sent_at, JSON.stringify(store.sends));
    pass(`${tag}, back online: the database refused nothing`, !store.calls.some((c) => c.startsWith('refused')), store.calls.filter((c) => c.startsWith('refused')).join('; '));
    store.api.live = true;
    await press(page, 'Send the recap'); await settle(page, 1800);
    pass(`${tag}, back online: Send now sends it, once`, store.sends.length === 1 && store.sends[0].answer === 'sent' && /^Sent\. Hannah gets it by email/.test(await toast(page)), `${JSON.stringify(store.sends)}; ${await toast(page)}`);
    await go(page, '/coach/todos');
    const moved = await page.evaluate((id) => ({ local: Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), cache: Boolean(localStorage.getItem(`clarity-cache:${id}:coach`)) }), me);
    pass(`${tag}, back online: once everything is sent the device copy is only the last data shown`, moved.cache && !moved.local, JSON.stringify(moved));
    await t.done({ refusals: 0, allow: /Failed to fetch|NetworkError|Load failed|ERR_INTERNET/ });
  }

  // ================================================================ 7. a session moved after its recap was sent
  if (has('d-moved')) {
    // ---- With 050: the page gives no way, and a device copy edited by hand never reaches the database.
    {
      const tag = 'moved after sent';
      const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, path: `/coach/sessions/${SES.sent}` });
      const { page, store, me } = t;
      const before = { ...store.rows.coach_sessions.find((s) => s.id === SES.sent) };
      const heldBefore = store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_held;
      pass(`${tag}: a sent session’s page has nothing to change what happened, or when`, /The recap has been sent, so this session stays as it is\./.test(await words(page)) && (await page.getByRole('combobox').count()) === 0 && (await page.locator('.cc-ses-bar').count()) === 0 && (await page.getByRole('button', { name: 'Delete this session' }).count()) === 0 && /It went ahead/.test(await words(page)));
      // The device's copy edited by hand: moved, at another time, its recap rewritten, and marked as still to send.
      await page.evaluate(([id, sid]) => {
        const key = localStorage.getItem(`clarity-coach-local:${id}`) ? `clarity-coach-local:${id}` : `clarity-cache:${id}:coach`;
        const s = JSON.parse(localStorage.getItem(key));
        Object.assign(s.rows.coach_sessions[sid], { outcome: 'moved', moved_to: '2026-11-26T16:00:00.000Z', starts_at: '2026-10-01T09:00:00.000Z', recap: 'Rewritten by hand.', waived: true });
        s.marks.coach_sessions[sid] = { sent: false, gone: false, refused: false };
        localStorage.setItem(`clarity-coach-local:${id}`, JSON.stringify(s));
        localStorage.removeItem(`clarity-cache:${id}:coach`);
      }, [me, SES.sent]);
      await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 2000);
      const after = store.rows.coach_sessions.find((s) => s.id === SES.sent);
      pass(`${tag}: forced from a hand-edited device copy, the database keeps the session as it was sent`, after.outcome === 'held' && after.starts_at === before.starts_at && after.recap === before.recap && !after.waived && !after.moved_to && after.recap_sent_at === before.recap_sent_at, JSON.stringify([after.outcome, after.starts_at, after.recap.slice(0, 30)]));
      pass(`${tag}: and sessions left doesn’t move`, store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_held === heldBefore, `${store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_held} / ${heldBefore}`);
      const first = flat(await words(page));
      await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 2000);
      const second = flat(await words(page));
      const asSent = (text) => /The recap has been sent/.test(text) && /It went ahead/.test(text) && text.includes('You chose the two launch markets') && !/Rewritten by hand/.test(text);
      console.log(`  COUNT moved after sent: after the forced save the page shows it as sent ${asSent(first) ? 'at once' : asSent(second) ? 'from the next load (until then it showed the hand-edited copy)' : 'NOT even after a second load'}.`);
      pass(`${tag}: the page shows the session as it was sent`, asSent(second), second.slice(0, 260));
      pass(`${tag}: the client still has the recap as it was sent`, store.rows.coach_sessions.find((s) => s.id === SES.sent).recap === before.recap);

      // A stale page: the recap went from another device while this page still shows the session as unsent, and Moved is saved here.
      const leo = store.rows.coach_sessions.find((s) => s.profile_id === ID.leo && s.outcome === 'held' && !s.recap_sent_at);
      const leoBefore = { ...leo };
      const sessionsBefore = store.rows.coach_sessions.length;
      await go(page, `/coach/sessions/${leo.id}`);
      store.fn.session_send_recap(store.coaches[0].user_id, leo.id); // the other device's Send
      await pick(page, 'What happened', 'Moved');
      await page.locator('.cc-ses-two .ds-date').click(); await settle(page, 400);
      await page.locator('.ds-cal-day:not([disabled])', { hasText: /^26$/ }).first().click(); await settle(page, 400);
      await page.locator('.cc-ses-two input[type=time]').fill('16:00');
      await press(page, 'Save'); await settle(page, 1500);
      const leoAfter = store.rows.coach_sessions.find((s) => s.id === leo.id);
      const saidMoved = await toast(page);
      pass(`${tag}: Moved saved from a stale page: the database keeps the sent session as it went ahead`, leoAfter.outcome === 'held' && leoAfter.starts_at === leoBefore.starts_at && leoAfter.recap === leoBefore.recap && !leoAfter.moved_to, JSON.stringify([leoAfter.outcome, leoAfter.moved_to]));
      await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 1800);
      pass(`${tag}: and the page then shows it as sent`, /The recap has been sent/.test(await words(page)) && /It went ahead/.test(await words(page)), flat(await words(page)).slice(0, 200));
      const extra = store.rows.coach_sessions.length - sessionsBefore;
      console.log(`  COUNT moved after sent: Moved from a stale page said “${saidMoved}” and left ${extra} new session${extra === 1 ? '' : 's'} at the new time in the database.`);
      pass(`${tag}: a refused move makes no new session at the new time`, extra === 0, `${extra} made; the toast said “${saidMoved}”`);
      await t.done({ refusals: null, waiting: true });
    }
    // ---- Device only (before 050): sessionActions.js is the lock.
    {
      const tag = 'moved after sent, device only';
      const t = await openAt(TUE, { tag, db: 'none', seedOptions: { sessions: true }, path: `/coach/sessions/${SES.write}` });
      const { page: a } = t;
      // This tab stops hearing of other tabs' changes, so its page stays as it was: only the check made at the save can stop it.
      await a.addInitScript(() => { const add = window.addEventListener.bind(window); window.addEventListener = (type, ...rest) => (type === 'storage' ? undefined : add(type, ...rest)); });
      await a.reload(); await a.waitForSelector('.cc-app'); await settle(a, 1200);
      const b = await t.tab(`/coach/sessions/${SES.write}`);
      await press(b, 'Send the recap'); await settle(b, 1200);
      pass(`${tag}: sent in another tab (kept on the device)`, (await toast(b)) === 'Sent. Hannah sees it in the portal, with the actions you ticked.' && Boolean((await t.one('coach_sessions', SES.write))?.recap_sent_at), await toast(b));
      const sent = await t.one('coach_sessions', SES.write);
      const n = (await t.rowsNow('coach_sessions')).length;
      pass(`${tag}: the first tab’s page is stale: it still offers What happened`, (await a.getByRole('combobox', { name: /^What happened/ }).count()) === 1, flat(await words(a)).slice(0, 300));
      await pick(a, 'What happened', 'Moved');
      await a.locator('.cc-ses-two .ds-date').click(); await settle(a, 400);
      await a.locator('.ds-cal-day:not([disabled])', { hasText: /^26$/ }).first().click(); await settle(a, 400);
      await a.locator('.cc-ses-two input[type=time]').fill('16:00');
      await press(a, 'Save'); await settle(a, 1200);
      const now = await t.one('coach_sessions', SES.write);
      pass(`${tag}: Moved is refused, and says why`, (await toast(a)) === 'The recap has been sent, so this session stays as it is.' && now.outcome === 'held' && now.starts_at === sent.starts_at && now.recap === sent.recap && !now.moved_to, `${await toast(a)}; ${now.outcome}`);
      pass(`${tag}: no new session was made`, (await t.rowsNow('coach_sessions')).length === n);
      pass(`${tag}: the page then shows the session as it was sent`, /The recap has been sent, so this session stays as it is\./.test(await words(a)) && (await a.locator('.cc-ses-bar').count()) === 0, flat(await words(a)).slice(0, 160));
      // The same for a late cancellation, a recap rewritten and a delete, each from a stale page.
      const c = await t.tab(`/coach/sessions/${SES.sent}`);
      pass(`${tag}: a sent session can’t be deleted from its page`, (await c.getByRole('button', { name: 'Delete this session' }).count()) === 0);
      await t.done();
    }
  }

  // ================================================================ 8. awkward things
  if (has('d-odd')) {
    const groups = (process.env.ODD || 'typed,panels,dayoff,empty,damaged,midnight,big,back').split(',');
    const odd = (g) => groups.includes(g);
    const CHECK = u(5200);
    const LEO_TODAY = u(6990);
    const extras = (rows) => ({
      ...rows,
      coach_todos: [...rows.coach_todos, { ...rows.coach_todos[0], id: CHECK, title: 'Pack for the offsite', important: false, due_on: null, list_id: null, minutes: null, planned_on: TODAY, position: 99000, checklist: Array.from({ length: 50 }, (_, i) => ({ text: `Item ${i + 1}`, done: i < 3 })) }],
      coach_sessions: [...rows.coach_sessions, { ...rows.coach_sessions[0], id: LEO_TODAY, profile_id: ID.leo, group_id: null, engagement_id: null, kind: 'coaching', starts_at: new Date(2026, 10, 17, 18, 15).toISOString(), minutes: 30, outcome: null, recap: null, recap_sent_at: null, written_up_at: null }],
    });

    // ---- what is typed into the quick add
    if (odd('typed')) {
      const tag = 'odd, typed';
      const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, seed: extras, path: '/coach/todos' });
      const { page, store } = t;
      const quick = page.locator('.cc-col > .cc-qadd');
      const box = quick.getByLabel('What needs doing?');
      const titled = (re) => store.rows.coach_todos.filter((r) => re.test(r.title));
      const add = async (text) => {
        const n = store.rows.coach_todos.length;
        await box.fill(text); await settle(page, 250);
        const chips = await quick.locator('.cc-qadd-chips li').allInnerTexts();
        await quick.getByRole('button', { name: 'Add to-do', exact: true }).click(); await settle(page, 900);
        return { chips, made: store.rows.coach_todos.length - n, row: store.rows.coach_todos[store.rows.coach_todos.length - 1], problem: (await quick.locator('.cc-problem').count()) ? await quick.locator('.cc-problem').innerText() : '' };
      };
      const wellFormed = (text) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);

      let r = await add(`A${'b'.repeat(299)}`);
      pass(`${tag}: a title of 300 characters is kept whole`, r.made === 1 && r.row.title.length === 300, `${r.made} made, ${r.row.title.length}`);
      r = await add(`C${'d'.repeat(300)}`);
      pass(`${tag}: a title of 301 characters is kept as its first 300, with no refusal`, r.made === 1 && r.row.title.length === 300 && r.row.title.startsWith('Cd'), `${r.made} made, ${r.row.title.length}`);
      r = await add(`E${'f'.repeat(298)}🎉`);
      pass(`${tag}: an emoji at the 300th character is kept whole or left out, never cut in half`, r.made === 1 && wellFormed(r.row.title) && [...r.row.title].length <= 300, `${r.row.title.length} units; ends ${JSON.stringify(r.row.title.slice(-2))}`);
      r = await add('      ');
      pass(`${tag}: only spaces is no to-do: it says what is needed`, r.made === 0 && r.problem === 'Type what needs doing to carry on.', `${r.made} made; ${r.problem}`);
      r = await add('​​‎⁠');
      pass(`${tag}: only characters nobody can see is no to-do`, r.made === 0 && r.problem === 'Type what needs doing to carry on.', `${r.made} made; ${r.problem}; ${JSON.stringify(r.made ? r.row.title : '')}`);
      r = await add('Call​ Dana­ about﻿ the venue');
      pass(`${tag}: unseen characters inside a title are taken out`, r.made === 1 && r.row.title === 'Call Dana about the venue', JSON.stringify(r.row.title));
      r = await add('🎉 Book the party 🎉 30m');
      pass(`${tag}: an emoji title is kept, with its estimate read`, r.made === 1 && r.row.title === '🎉 Book the party 🎉' && r.row.minutes === 30, JSON.stringify([r.row.title, r.row.minutes]));
      r = await add('مرحبا بالعالم tomorrow');
      pass(`${tag}: right-to-left words are kept as typed, and “tomorrow” is still read`, r.made === 1 && r.row.title === 'مرحبا بالعالم' && r.row.planned_on === TOMORROW, JSON.stringify([r.row.title, r.row.planned_on]));
      let t0 = Date.now();
      r = await add(`G${'hi '.repeat(1666)}`);
      pass(`${tag}: 5,000 characters typed at once: one to-do of at most 300, and the page stays quick`, r.made === 1 && r.row.title.length <= 300 && Date.now() - t0 < 4000, `${r.row.title.length} characters in ${Date.now() - t0} ms`);
      r = await add('Stretch 7m');
      pass(`${tag}: “7m” isn’t an estimate (they go in quarter hours): it stays in the words`, r.made === 1 && r.row.minutes == null && r.row.title === 'Stretch 7m' && !r.chips.some((c) => /min|h$/.test(c)), JSON.stringify([r.row.title, r.row.minutes, r.chips]));
      r = await add('Write the chapter 9h');
      pass(`${tag}: “9h” is over the 8 hours an estimate can be: it stays in the words`, r.made === 1 && r.row.minutes == null && r.row.title === 'Write the chapter 9h', JSON.stringify([r.row.title, r.row.minutes, r.chips]));
      r = await add('Ring the bank 10:00 someday');
      pass(`${tag}: a time with no day keeps no time`, r.made === 1 && r.row.someday === true && r.row.planned_on == null && r.row.planned_time == null && r.row.title === 'Ring the bank', JSON.stringify([r.row.title, r.row.planned_on, r.row.planned_time, r.chips]));
      r = await add('<img src=x onerror=window.__hit=1> #<b>list</b> @"tag"');
      pass(`${tag}: words written as code are shown as words, never run`, r.made === 1 && !(await page.evaluate(() => window.__hit === 1)) && (await page.locator('.cc-main img').count()) === 0, JSON.stringify(r.row.title));
      pass(`${tag}: no sideways scroll with all of those on the page`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

      // In the panel: 300 characters at most, and an emptied title keeps its words.
      await page.locator(`.cc-todo-open[data-todo="${DAY.t9}"]`).first().click(); await settle(page, 600);
      const name = dialog(page).getByLabel('To-do', { exact: true });
      await name.fill(''); await name.press('Enter'); await settle(page, 500);
      pass(`${tag}: a to-do’s words can’t be emptied in its panel`, /Type what needs doing to carry on\./.test(await dialog(page).innerText()) && store.rows.coach_todos.find((x) => x.id === DAY.t9).title === 'Reply to Elena Ruiz');
      await name.fill(`H${'i'.repeat(298)}🎉`); await name.press('Enter'); await settle(page, 900);
      pass(`${tag}: in the panel too an emoji at the limit is never cut in half`, wellFormed(store.rows.coach_todos.find((x) => x.id === DAY.t9).title), JSON.stringify(store.rows.coach_todos.find((x) => x.id === DAY.t9).title.slice(-2)));
      // A deadline before today.
      await dialog(page).getByRole('combobox', { name: /^Deadline/ }).click(); await settle(page, 300);
      await page.getByRole('option', { name: 'Another day', exact: true }).click(); await settle(page, 400);
      const day10 = page.locator('.ds-cal-day:not([disabled])', { hasText: /^10$/ }).first();
      if (!(await day10.isVisible().catch(() => false))) { await dialog(page).locator('.ds-date').last().click(); await settle(page, 400); }
      const canPick = await day10.isVisible().catch(() => false) && await day10.isEnabled().catch(() => false);
      if (canPick) { await day10.click(); await settle(page, 900); }
      const due = store.rows.coach_todos.find((x) => x.id === DAY.t9).due_on;
      for (let i = 0; i < 3 && (await page.locator('.ds-modal--shown').count()); i += 1) await closePanel(page);
      const rowText = flat(await page.locator(`.cc-todo-row:has([data-todo="${DAY.t9}"])`).first().innerText({ timeout: 2500 }).catch(() => ''));
      if (canPick) console.log(`  COUNT odd: a deadline a week before today is kept (${due}), and its row reads “${rowText.slice(-40)}”.`);
      if (canPick) pass(`${tag}: a deadline before today is kept and shown calmly`, due === '2026-11-10' && /Due Tue 10 Nov/.test(rowText) && !/overdue|late|missed/i.test(rowText), `${due}: ${rowText.slice(-80)}`);
      else { console.log('  COUNT odd: the deadline’s calendar greys out every day before today, so one can’t be chosen.'); pass(`${tag}: a deadline before today can’t be chosen, and nothing was saved`, due == null, String(due)); }
      // A checklist of 51.
      await page.locator(`.cc-todo-open[data-todo="${CHECK}"]`).first().click(); await settle(page, 600);
      await dialog(page).getByRole('button', { name: 'Add item' }).click(); await settle(page, 300);
      await dialog(page).getByLabel('New item').fill('Item 51');
      await dialog(page).getByRole('button', { name: 'Add item', exact: true }).click(); await settle(page, 600);
      pass(`${tag}: a 51st checklist item is refused in the page, with what to do`, /A checklist holds up to 50 items\. Take one out first\./.test(await dialog(page).innerText()) && store.rows.coach_todos.find((x) => x.id === CHECK).checklist.length === 50);
      await closePanel(page); await closePanel(page);
      pass(`${tag}: the database refused nothing typed here`, !store.calls.some((c) => c.startsWith('refused')), store.calls.filter((c) => c.startsWith('refused')).join('; '));
      pass(`${tag}: nothing with a title over 300 characters, and one to-do for each`, store.rows.coach_todos.every((x) => [...x.title].length <= 300) && titled(/^Stretch 7m$/).length === 1);
      await t.done({ refusals: 0 });
    }

    // ---- sessions, counts, capacity, the brief and the close, odd addresses
    if (odd('panels')) {
      const tag = 'odd, panels';
      const t = await openAt(TUE, { tag, seedOptions: { sessions: true }, seed: extras, path: `/coach/clients/${SES.hannah}` });
      const { page, store } = t;
      const openFold = async (name) => { const b = page.locator('.cc-fold-btn', { hasText: name }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await settle(page, 300); } };
      // A session at 24:00, or with no real day.
      const n = store.rows.coach_sessions.length;
      await openFold('Sessions and recaps');
      await page.locator('.ds-addrow', { hasText: 'Add session' }).first().click(); await settle(page, 500);
      const typed = await dialog(page).locator('input[type=time]').fill('24:00').then(() => 'taken', () => 'not taken');
      await dialog(page).getByRole('button', { name: 'Add session', exact: true }).click(); await settle(page, 500);
      pass(`${tag}: a session at 24:00 can’t be typed (${typed}), and with no day it says what is needed`, /Choose the day and the time to carry on\./.test(await dialog(page).innerText()) && store.rows.coach_sessions.length === n, typed);
      await dialog(page).locator('.ds-date').first().click(); await settle(page, 400);
      const days = await page.locator('.ds-cal-day').allInnerTexts();
      pass(`${tag}: the calendar offers only real days (no 30 Feb to choose)`, days.length >= 28 && days.every((d) => Number(d) >= 1 && Number(d) <= 31), `${days.length} days`);
      await page.keyboard.press('Escape'); await settle(page, 300);
      await closePanel(page);
      if (await page.locator('.ds-modal--shown').count()) await closePanel(page);

      // Sessions in total typed as -1, 1001 and "ten".
      await openFold('Engagement');
      await page.getByRole('button', { name: 'End this engagement' }).locator('xpath=..').getByRole('button', { name: 'Edit', exact: true }).click(); await settle(page, 600);
      for (const bad of ['-1', '1001', 'ten', '6.5']) {
        await dialog(page).getByLabel('Sessions in total').fill(bad);
        await dialog(page).getByRole('button', { name: 'Save my edit', exact: true }).click(); await settle(page, 400);
        pass(`${tag}: sessions typed as “${bad}” says what to type, and saves nothing`, /Type the number of sessions as a whole number\./.test(await dialog(page).innerText()) && store.rows.engagements.find((e) => e.id === SES.eHannah).sessions_total === 12, flat(await dialog(page).locator('.cc-problem').innerText({ timeout: 2500 }).catch(() => 'no line')));
      }
      await closePanel(page);
      // Sessions held is never typed: one more, one fewer, and never below nothing.
      await go(page, `/coach/clients/${ID.mia}`);
      await openFold('Sessions and recaps');
      const held = () => store.rows.engagements.find((e) => e.id === ID.eMia).sessions_held;
      const start = held();
      const savesBefore = count(store, /^POST engagements$/);
      for (let i = 0; i < start + 2; i += 1) { await page.getByRole('button', { name: 'One fewer session held' }).click(); await settle(page, 700); }
      pass(`${tag}: sessions held can’t go below nothing (it started at ${start}): the extra presses save nothing`, held() === 0 && count(store, /^POST engagements$/) - savesBefore === start && /Sessions held[\s\S]{0,120}\b0\b/.test(await words(page)), `${held()} held, ${count(store, /^POST engagements$/) - savesBefore} saves, ${flat((await words(page)).match(/.{0,30}held.{0,20}/i)?.[0] || '')}`);

      // Capacity typed as 0, 81, 7.25 and words.
      await go(page, '/coach/settings/hours');
      await page.getByRole('button', { name: 'Edit Coaching hours each week' }).click(); await settle(page, 300);
      for (const bad of ['0', '81', '7.25', 'lots', '-5', '']) {
        await page.locator('.cc-setrow--edit input').fill(bad);
        await page.locator('.cc-setrow--edit').getByRole('button', { name: 'Save' }).click(); await settle(page, 400);
        pass(`${tag}: capacity typed as “${bad}” says what to type, and saves nothing`, /Type a number of hours from 1 to 80\./.test(await page.locator('.cc-setrow--edit').innerText()) && store.coaches[0].capacity_hours_week === 15, flat(await page.locator('.cc-setrow--edit').innerText()).slice(0, 120));
      }
      await page.locator('.cc-setrow--edit input').fill('7.5');
      await page.locator('.cc-setrow--edit').getByRole('button', { name: 'Save' }).click(); await settle(page, 1200);
      pass(`${tag}: a half hour is taken: 7.5`, store.coaches[0].capacity_hours_week === 7.5 && /7\.5 hours/.test(await words(page)), `${store.coaches[0].capacity_hours_week}`);

      // A recap at its limit, pasted over it.
      await go(page, `/coach/sessions/${SES.write}`);
      const recap = page.getByLabel('Recap for Hannah');
      await recap.click(); await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(`${'Twelve thousand and one. '.repeat(480)}!`.slice(0, 12001));
      await settle(page, 2200);
      const length = (await recap.inputValue()).length;
      const kept = store.rows.coach_sessions.find((x) => x.id === SES.write).recap.length;
      console.log(`  COUNT odd: 12,001 characters pasted into the recap: the box holds ${length}, the database ${kept}.`);
      pass(`${tag}: a recap of 12,001 characters is held to 12,000, and saved`, length === 12000 && kept === 12000 && /12000 of 12000/.test(await words(page)), `${length} in the box, ${kept} saved`);

      // A client with no engagement: the brief, then the guided close.
      await go(page, '/coach');
      await page.locator('.cc-today-call--open', { hasText: 'Leo Grant' }).first().click(); await settle(page, 900);
      const brief = flat(await dialog(page).innerText().catch(() => ''));
      pass(`${tag}: the brief opens for a client with no engagement`, /Leo Grant/i.test(brief) && /Today, 18:15/.test(brief) && /SINCE LAST TIME/i.test(brief), brief.slice(0, 200));
      await closePanel(page);
      await go(page, `/coach/clients/${ID.leo}/close`);
      const closeText = flat(await words(page));
      pass(`${tag}: the guided close opens for a client with no engagement`, /CLOSE THE ENGAGEMENT/i.test(closeText) && /Leo Grant/.test(closeText) && /Leo has no portal account yet/.test(closeText), closeText.slice(0, 220));
      await press(page, 'Move to Past clients'); await settle(page, 900);
      pass(`${tag}: and Move to Past clients works without one, with Undo`, /^Leo is in Past clients/.test(await toast(page)) && store.rows.client_profiles.find((p) => p.id === ID.leo).status === 'past', await toast(page));
      await undo(page);
      pass(`${tag}: Undo brings Leo back`, store.rows.client_profiles.find((p) => p.id === ID.leo).status === 'active');
      // Already past.
      await go(page, `/coach/clients/${ID.past}/close`);
      pass(`${tag}: the guided close for a client already past says so, with no button`, /Grace is already in Past clients\./.test(await words(page)) && (await page.getByRole('button', { name: 'Move to Past clients' }).count()) === 0);
      // Addresses that aren't anything.
      for (const [path, calm] of [
        ['/coach/sessions/not-a-real-id', /This session isn’t here any more\./], ['/coach/todos/lists/not-a-real-id', /This list isn’t here any more\./],
        ['/coach/clients/not-a-real-id/close', /This client isn’t in your list any more\./], ['/coach/sessions/%3Cscript%3Ealert(1)%3C%2Fscript%3E', /This session isn’t here any more\./],
        ['/coach/todos?tab=nonsense', /TO-DOS/i], ['/coach/todos/lists/', /Today|To-do/i], [`/coach/sessions/${SES.write}/extra`, /Today/i],
      ]) {
        await go(page, path, 700);
        pass(`${tag}: ${path} is a calm page inside the coach portal`, calm.test(await words(page)) && new URL(page.url()).pathname.startsWith('/coach'), flat(await words(page)).slice(0, 120));
      }
      await t.done({ refusals: 0 });
    }

    // ---- a day off: the over-full line, and the Friday offer on a Saturday
    if (odd('dayoff')) {
      const tag = 'odd, a Saturday';
      const t = await openAt(SAT, { tag });
      const { page } = t;
      const text = await words(page);
      pass(`${tag}: the date is Saturday’s`, /Sat 14 Nov/.test(text), flat(text).slice(0, 80));
      pass(`${tag}: a day off is never “over”: no line, and no panel to open`, !/Today is .* over/.test(text) && (await page.locator('.cc-today-over').count()) === 0);
      const offer = flat(await page.locator('.ds-offer').first().innerText({ timeout: 2500 }).catch(() => ''));
      console.log(`  COUNT odd: on a Saturday at 13:30 Today’s offer row reads “${offer || 'nothing'}”.`);
      pass(`${tag}: the Friday offers (Rate my energy, the Weekly review) aren’t made on a Saturday`, !/Rate my energy|Weekly review/.test(text), offer);
      if (/Plan my day/.test(offer)) {
        await take(page); await press(page, 'Next'); await press(page, 'Next');
        const plan = flat(await dialog(page).innerText());
        pass(`${tag}: Plan my day works on a day off, and says nothing of being over`, /Put them between calls/.test(plan) && !/ over\./.test(plan), plan.slice(0, 200));
        await closePanel(page);
      }
      await t.done({ refusals: 0 });
    }

    // ---- a week with no sessions at all
    if (odd('empty')) {
      const tag = 'odd, no sessions';
      const t = await openAt(FRI, { tag, seed: (rows) => ({ ...rows, coach_sessions: [] }) });
      const { page, store } = t;
      const text = flat(await words(page));
      pass(`${tag}: Today says “No calls today.” and capacity reads 0 of 15`, /No calls today\./.test(text) && /0 of 15/.test(text) && /Calls this week 0/.test(text), text.slice(-200));
      await take(page);
      await page.getByRole('radio', { name: 'Fair', exact: true }).click(); await settle(page, 1000);
      await take(page);
      const seen = [];
      for (let i = 0; i < 5; i += 1) { seen.push(flat(await dialog(page).innerText()).slice(0, 400)); if (i < 4) await press(page, 'Next'); }
      pass(`${tag}: the weekly review walks all five steps with nothing in the week`, /How was your energy/.test(seen[0]) && /Your hours/.test(seen[1]) && /0 of 15/.test(seen[1]) && /What got done/.test(seen[2]) && /Next week’s shape/.test(seen[3]) && /What would you change\?/.test(seen[4]), seen.map((x) => x.slice(0, 60)).join(' | '));
      console.log(`  COUNT odd: with no calls next week the review’s shape step reads “${seen[3].replace(/^.*Next week’s shape/, '').trim().slice(0, 90)}”.`);
      await press(page, 'Finish the review'); await settle(page, 900);
      pass(`${tag}: and finishes`, (await toast(page)) === 'Review saved' && Boolean(store.rows.coach_weeks[0]?.reviewed_at), await toast(page));
      await go(page, '/coach/clients');
      pass(`${tag}: Clients opens too`, /Sam Okafor/.test(await words(page)));
      await t.done({ refusals: 0 });
    }

    // ---- a damaged device copy (device only)
    if (odd('damaged')) {
      const tag = 'odd, a damaged device copy';
      const t = await openAt(TUE, { tag, db: 'none', seedOptions: { sessions: true } });
      const { page, me } = t;
      await page.evaluate(([id, ids]) => {
        const key = `clarity-coach-local:${id}`;
        const s = JSON.parse(localStorage.getItem(key));
        const mark = { sent: false, gone: false, refused: false };
        for (const table of ['coach_todos', 'coach_todo_lists', 'coach_todo_headings', 'coach_days', 'coach_weeks', 'coach_sessions', 'coach_session_actions', 'coach_session_notes', 'coach_settings']) { s.rows[table] ||= {}; s.marks[table] ||= {}; }
        const put = (table, k, row) => { s.rows[table][k] = row; s.marks[table][k] = mark; };
        // A to-do with no id, one that is only an id, one whose parts are the wrong kind of thing, and one that isn't a row at all.
        put('coach_todos', 'undefined', { coach_id: ids.me, title: 'A to-do with no id', planned_on: ids.today });
        put('coach_todos', ids.bare, { id: ids.bare, coach_id: ids.me });
        put('coach_todos', ids.wrong, { id: ids.wrong, coach_id: ids.me, title: 42, planned_on: ids.today, checklist: 'not a list', minutes: 'soon', position: 'first', repeat_rule: 'weekly', planned_time: 930, important: 'yes', due_on: 'whenever', notes: { a: 1 }, done_at: null, someday: false });
        put('coach_todos', ids.done, { id: ids.done, coach_id: ids.me, title: null, planned_on: ids.today, done_at: 'yesterday afternoon' });
        s.rows.coach_todos.nonsense = 'a string where a row should be';
        s.rows.coach_todo_lists[ids.list] = { id: ids.list, coach_id: ids.me, name: null, position: 'last' };
        s.rows.coach_todo_headings[ids.heading] = { id: ids.heading, coach_id: ids.me, list_id: ids.kestrel, name: 7 };
        s.rows.coach_session_actions[ids.action] = { id: ids.action, coach_id: ids.me, session_id: ids.write, title: null, send: 'yes', position: null };
        s.rows.coach_days[`${ids.me}|${ids.today}`] = { coach_id: ids.me, day: ids.today, plan_todos: 'abc', shutdown: 'done', planned_at: 5, closed_at: null };
        s.marks.coach_days = 'marks gone wrong';
        s.rows.coach_weeks[`${ids.me}|2026-11-16`] = { coach_id: ids.me, week_start: '2026-11-16', energy: 7, review: 'a string', reviewed_at: null };
        s.marks.coach_weeks[`${ids.me}|2026-11-16`] = mark;
        // A session whose parts are wrong, an action list that is a string, and notes that are a number.
        Object.assign(s.rows.coach_sessions[ids.write], { minutes: 'sixty', recap: ['a', 'list'], kind: 'unknown' });
        s.rows.engagement_packs = 'a string where a table should be';
        s.rows.coach_session_people = ['a', 'list', 'where', 'a', 'table', 'should', 'be'];
        s.rows.coach_session_notes[ids.write] = { session_id: ids.write, coach_id: ids.me, focus: 12, insight: {}, next_time: [], supervision: null };
        s.marks.coach_session_notes[ids.write] = mark;
        put('coach_sessions', ids.nodate, { id: ids.nodate, coach_id: ids.me, profile_id: ids.sam, starts_at: 'not a date', minutes: 60, outcome: null });
        if (s.rows.coach_settings[ids.me]) Object.assign(s.rows.coach_settings[ids.me], { working_hours: 'nine to five' });
        localStorage.setItem(key, JSON.stringify(s));
      }, [me, { me: ME, today: TODAY, bare: u(5301), wrong: u(5302), done: u(5303), write: SES.write, nodate: u(6991), sam: ID.sam, list: u(5310), heading: u(5311), action: u(5312), kestrel: DAY.listKestrel }]);
      const broke = () => page.evaluate(() => /THIS PAGE HIT A PROBLEM|hit a problem/i.test(document.body.innerText));
      for (const [path, shows] of [['/coach', /TODAY/i], ['/coach/todos', /TO-DOS/i], ['/coach/todos?tab=upcoming', /TO-DOS/i], ['/coach/todos?tab=someday', /TO-DOS/i], [`/coach/sessions/${SES.write}`, /Hannah Wells/], [`/coach/sessions/${u(6991)}`, /Sam Okafor|isn’t here/], [`/coach/clients/${SES.hannah}`, /Hannah Wells/], [`/coach/clients/${ID.sam}`, /Sam Okafor/], [`/coach/clients/${ID.sam}/close`, /Sam Okafor/], ['/coach/settings/hours', /Working hours/i], [`/coach/todos/lists/${DAY.listKestrel}`, /isn’t here any more|Kestrel/]]) {
        await page.goto(`${APP}${path}`); await page.waitForSelector('.ui-root', { timeout: 20000 }); await settle(page, 1300);
        const text = flat(await page.evaluate(() => document.body.innerText));
        pass(`${tag}: ${path} still opens`, !(await broke()) && new RegExp(shows.source, 'i').test(text), text.slice(0, 160));
      }
      // The panels and the folds that read those rows.
      await go(page, '/coach/todos');
      const wrong = page.locator(`.cc-todo-open[data-todo="${u(5302)}"]`).first();
      if (await wrong.count()) { await wrong.click(); await settle(page, 700); pass(`${tag}: the damaged to-do’s panel opens`, !(await broke()), flat(await page.evaluate(() => document.body.innerText)).slice(0, 120)); await closePanel(page); }
      const fold = page.locator('.cc-fold-btn', { hasText: 'Done' }).first();
      await fold.click(); await settle(page, 500);
      await page.getByLabel('Search what’s done').fill('recap'); await settle(page, 500);
      pass(`${tag}: Done opens and searches`, !(await broke()), flat(await page.evaluate(() => document.body.innerText)).slice(0, 160));
      await go(page, '/coach');
      if (await page.locator('.ds-offer-take').count()) { await take(page); pass(`${tag}: Today’s offer opens its panel`, !(await broke()) && (await page.locator('.ds-modal--shown').count()) === 1); if (!(await broke())) await closePanel(page); }
      console.log(`  COUNT odd: with the damaged copy the console held ${t.errors.length} error${t.errors.length === 1 ? '' : 's'}${t.errors.length ? `: ${[...new Set(t.errors)].slice(0, 3).join(' | ').slice(0, 300)}` : ''}.`);
      await t.done();
    }

    // ---- the clock crossing midnight with Today open
    if (odd('midnight')) {
      const tag = 'odd, midnight';
      const before = new Date(2026, 10, 16, 23, 58, 30);
      const t = await openAt(before, { tag });
      const { page, ctx, store } = t;
      const text = flat(await words(page));
      pass(`${tag}: at 23:58 on Monday Today is Monday’s`, /Mon 16 Nov/.test(text) && /Renew professional indemnity insurance/.test(text), text.slice(0, 100));
      const offerBefore = flat(await page.locator('.ds-offer').first().innerText({ timeout: 2500 }).catch(() => ''));
      await ctx.clock.setFixedTime(new Date(2026, 10, 17, 0, 0, 40));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await settle(page, 1500);
      const after = flat(await words(page));
      pass(`${tag}: just after midnight the page turns to Tuesday without a reload`, /Tue 17 Nov/.test(after) && !/Mon 16 Nov/.test(after.slice(0, 200)), after.slice(0, 120));
      pass(`${tag}: yesterday’s to-dos carry over, each saying “From yesterday”`, /Renew professional indemnity insurance/.test(after) && /From yesterday/.test(after), after.slice(0, 400));
      const offerAfter = flat(await page.locator('.ds-offer').first().innerText({ timeout: 2500 }).catch(() => ''));
      console.log(`  COUNT odd: the offer row read “${offerBefore || 'nothing'}” before midnight and “${offerAfter || 'nothing'}” after.`);
      pass(`${tag}: the evening’s Close the day gives way to the new day’s own offer`, !/Close the day/.test(offerAfter), offerAfter);
      // A to-do ticked just after midnight is done on the new day, and one added goes to the new day.
      await page.locator('.cc-todo-row .ds-check-box').first().click(); await settle(page, 800);
      const done = store.rows.coach_todos.filter((r) => r.done_at).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)))[0];
      pass(`${tag}: a to-do ticked now is done on Tuesday`, new Date(done.done_at).getDate() === 17, done.done_at);
      await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 500);
      await dialog(page).getByLabel('What needs doing?').fill('First thing in the new day');
      await dialog(page).getByRole('button', { name: 'Add to-do', exact: true }).click(); await settle(page, 900);
      pass(`${tag}: a to-do added now is for Tuesday`, store.rows.coach_todos.find((r) => r.title === 'First thing in the new day')?.planned_on === TODAY, store.rows.coach_todos.find((r) => r.title === 'First thing in the new day')?.planned_on);
      await t.done({ refusals: 0 });
    }

    // ---- text at twice the size
    if (odd('big')) {
      for (const size of [400, 1440]) {
        const tag = `odd, twice the text size, ${size}px`;
        const t = await openAt(TUE, { tag, size, seedOptions: { sessions: true }, seed: extras });
        const { page } = t;
        const big = async () => { await page.addStyleTag({ content: 'html{font-size:32px !important}' }); await settle(page, 500); };
        const fits = () => page.evaluate(() => {
          const wide = document.documentElement.scrollWidth - window.innerWidth;
          const cut = [...document.querySelectorAll('.cc-app button, .cc-app a, .ds-dialog button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.cc-utabs, .cc-menu, [aria-hidden=true]'); }).map((el) => (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30));
          return { wide, cut: [...new Set(cut)].slice(0, 5) };
        });
        for (const path of ['/coach', '/coach/todos', `/coach/sessions/${SES.write}`, `/coach/sessions/${SES.sent}`, `/coach/clients/${ID.priya}/close`, `/coach/todos/lists/${DAY.listKestrel}`]) {
          await go(page, path, 900); await big();
          const f = await fits();
          pass(`${tag}: ${path} has no sideways scroll and nothing off the side`, f.wide <= 0 && f.cut.length === 0, JSON.stringify(f));
        }
        await go(page, '/coach'); await big();
        for (const [name, open] of [
          ['Plan my day', async () => { await take(page); }],
          ['the over-full day', async () => { await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 500); }],
          ['a to-do', async () => { await page.locator('.cc-todo-open').first().click(); await settle(page, 600); }],
          ['the brief', async () => { await page.locator('.cc-today-call--open').first().click(); await settle(page, 900); }],
        ]) {
          await open();
          const d = await page.evaluate(() => { const el = [...document.querySelectorAll('.ds-modal--shown .ds-dialog')].pop(); if (!el) return null; const r = el.getBoundingClientRect(); return { wide: el.scrollWidth - el.clientWidth, off: Math.round(Math.max(0, r.right - window.innerWidth, -r.left)) }; });
          pass(`${tag}: ${name}’s panel fits, with nothing to scroll sideways`, Boolean(d) && d.wide <= 1 && d.off <= 1, JSON.stringify(d));
          await closePanel(page);
        }
        await t.done({ refusals: 0 });
      }
    }

    // ---- the browser's Back out of each panel
    if (odd('back')) {
      for (const size of [1440, 400]) {
        const tag = `odd, Back, ${size}px`;
        const t = await openAt(TUE, { tag, size, seedOptions: { sessions: true } });
        const { page, store } = t;
        const before = JSON.stringify(store.rows.coach_todos);
        // The pages are reached inside the portal, as a person does, so Back has somewhere of the portal's to go.
        const menuTo = async (label) => {
          // On a phone the bar's own first button is Today; everything else is in the menu, as on a laptop.
          if (size === 400 && label === 'Today') { await page.locator('.cc-phonebar button').first().click(); await settle(page, 900); return; }
          if (size === 400) await page.locator('.cc-phonebar button').nth(1).click(); else await button(page, 'Open the menu').click();
          await settle(page, 400);
          await page.locator('.cc-menu-item', { hasText: new RegExp(`^${label}`) }).first().click(); await settle(page, 900);
        };
        const panels = [
          ['a to-do', '/coach/todos', async () => { await page.locator('.cc-todo-open').first().click(); await settle(page, 600); }],
          ['Add to-do', '/coach/todos', async () => { await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600); }],
          ['Plan my day', '/coach', async () => { await take(page); }],
          ['the over-full day', '/coach', async () => { await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 500); }],
          ['the brief', '/coach', async () => { await page.locator('.cc-today-call--open').first().click(); await settle(page, 900); }],
        ];
        for (const [name, path, open] of panels) {
          await menuTo(path === '/coach' ? 'To-dos' : 'Today');
          await menuTo(path === '/coach' ? 'Today' : 'To-dos');
          if (new URL(page.url()).pathname !== path) { pass(`${tag}: the menu reaches ${path}`, false, page.url()); continue; }
          await open();
          const opened = await page.locator('.ds-modal--shown').count();
          await page.goBack().catch(() => null);
          await settle(page, 1200);
          const state = await page.evaluate(() => ({ path: location.pathname, open: document.querySelectorAll('.ds-modal--shown').length, app: Boolean(document.querySelector('.cc-app')), broke: /hit a problem/i.test(document.body.innerText), locked: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden' }));
          const stayed = state.path === path;
          console.log(`  COUNT odd, ${size}px: Back with ${name}’s panel open ${stayed ? (state.open ? 'stays on the page with the panel still open' : 'closes the panel and stays on the page') : `leaves for ${state.path}, the panel gone`}.`);
          pass(`${tag}: Back out of ${name}’s panel lands on a real coach page, with no panel left hanging and the page free to scroll`, opened === 1 && state.app && !state.broke && state.path.startsWith('/coach') && (stayed || state.open === 0) && (state.open > 0 || !state.locked), JSON.stringify(state));
          if (await page.locator('.ds-modal--shown').count()) await closePanel(page);
        }
        pass(`${tag}: none of that changed a to-do`, JSON.stringify(store.rows.coach_todos) === before);
        await t.done({ refusals: 0 });
      }
    }
  }

  // ================================================================ 9. the client's Coaching page
  if (has('d-client')) {
    const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    async function openClient({ size = 1440, theme = 'light', data, tag }) {
      const ctx = await clientContext(browser, { size, theme });
      const errors = [];
      const stood = await clientStandIn(ctx, data);
      const tab = async () => {
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
        await page.goto(`${APP}/coaching`);
        await page.waitForSelector('.ui-root', { timeout: 20000 });
        return page;
      };
      const page = await tab();
      await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
      await clearCoaching(page);
      await page.goto(`${APP}/coaching`);
      await page.waitForSelector('.ui-root', { timeout: 20000 });
      await settle(page, 1500);
      return {
        page, ctx, ...stood,
        tab: async () => { const p = await tab(); await settle(p, 1500); return p; },
        done: async ({ allow = [] } = {}) => {
          const stray = stood.blocked.filter((b) => !allow.some((a) => b.includes(a)));
          pass(`${tag}: nothing reached the test project or the email server`, stray.length === 0, [...new Set(stray)].slice(0, 5).join('; '));
          pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
          await clearCoaching(page, { after: true });
          await ctx.close();
        },
      };
    }
    const body = (page) => page.evaluate(() => document.querySelector('.coaching-page')?.innerText || document.body.innerText);
    const said = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 4000 }).catch(() => '')) || '';

    // ---- answered twice, accepted twice, ticked twice
    {
      const tag = 'client, pressed twice';
      const data = fromCoach();
      const t = await openClient({ data, tag });
      const { page, calls } = t;
      const stale = await t.tab(); // a second tab, opened before anything is answered
      const n = (re) => calls.filter((c) => re.test(c)).length;

      await twice(page.getByRole('button', { name: 'Yes, for 30 minutes' }));
      await settle(page, 1200);
      pass(`${tag}: Yes to a view request, two presses: answered once`, n(/^client_view_answer/) === 1 && /Tim can view your portal until/.test(await body(page)), `${n(/^client_view_answer/)} answers`);
      await stale.getByRole('button', { name: 'No', exact: false }).filter({ hasText: /^No$/ }).first().click().catch(() => null);
      await settle(stale, 1200);
      const staleSaid = await said(stale);
      console.log(`  COUNT client: answering a view request again from a tab left open says “${staleSaid}”.`);
      pass(`${tag}: answering it again from a tab left open changes nothing, and says something calm`, data.views[0].allowed === true && Boolean(staleSaid) && !/fail|error|42501|undefined/i.test(staleSaid), staleSaid);

      await twice(page.getByRole('button', { name: /^Accept the invite/ }));
      await settle(page, 1200);
      pass(`${tag}: Accept, two presses: accepted once`, n(/^client_accept_invite/) === 1 && data.invites.length === 0 && !/has invited you/.test(await body(page)), `${n(/^client_accept_invite/)} accepts`);
      const staleAccept = stale.getByRole('button', { name: /^Accept the invite/ });
      if (await staleAccept.count()) {
        await staleAccept.click(); await settle(stale, 1200);
        const again = await said(stale);
        console.log(`  COUNT client: accepting an invite again from a tab left open says “${again}”.`);
        pass(`${tag}: accepting it again from a tab left open is calm, and makes no second link`, n(/^client_accept_invite/) === 2 && Boolean(again) && !/fail|error|42501|undefined/i.test(again), again);
      }

      await twice(page.getByRole('button', { name: /^I agree to Maya covering/ }));
      await settle(page, 1000);
      pass(`${tag}: I agree, two presses: agreed once`, n(/^cover_agree/) === 1 && /Agreed/.test(await body(page)), `${n(/^cover_agree/)}`);

      // An action ticked twice in the same moment: the page and the database end the same.
      const first = data.recaps[0].actions[0];
      const box = page.getByRole('checkbox', { name: first.title }).first();
      await twice(box);
      await settle(page, 1200);
      const shown = (await box.getAttribute('aria-checked')) === 'true' || (await box.isChecked().catch(() => false));
      pass(`${tag}: an action ticked twice at once: the page and the database agree`, shown === first.done, `page ${shown}, database ${first.done}, ${n(/^my_session_action done/)} calls`);
      await box.click(); await settle(page, 800);
      const now = (await box.getAttribute('aria-checked')) === 'true' || (await box.isChecked().catch(() => false));
      pass(`${tag}: and one more tick still agrees`, now === first.done, `page ${now}, database ${first.done}`);
      await t.done();
    }

    // ---- an expired request, 200 actions, a note of 2,001 characters
    for (const size of [1440, 400]) {
      const tag = `client, overfilled, ${size}px`;
      const data = fromCoach();
      const now = Date.now();
      data.invites = [];
      data.covers = [];
      data.views = [
        // A yes whose 30 minutes ran out an hour ago, and a request asked 8 days ago that was never answered (049 returns 7 days).
        { request_id: uid(930), coach_first_name: 'Tim', asked_at: new Date(now - 2 * 3600000).toISOString(), answered_at: new Date(now - 90 * 60000).toISOString(), allowed: true, expires_at: new Date(now - 60 * 60000).toISOString() },
      ];
      data.recaps[0].actions = Array.from({ length: 200 }, (_, i) => ({ id: uid(94000 + i), title: `Action ${i + 1}: ${i % 7 === 0 ? 'a much longer one, so that it wraps onto a second line on a phone and still lines up' : 'send the notes'}`, goes_to: i % 2 ? 'backlog' : 'week', done: i % 5 === 0, placed: i % 11 === 0 }));
      const t = await openClient({ data, tag, size });
      const { page } = t;
      const text = await body(page);
      pass(`${tag}: a request whose 30 minutes have run out shows nothing`, !/can view your portal until/.test(text) && !/would like to view your portal/.test(text) && !/From your coach/i.test(text), flat(text).slice(0, 160));
      const boxes = await page.locator('.coaching-action').count();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      pass(`${tag}: a recap with 200 actions shows them all, with no sideways scroll`, boxes === 200 && wide <= 0, `${boxes} actions, ${wide}px`);
      const t0 = Date.now();
      await page.getByRole('checkbox', { name: /^Action 200:/ }).first().click();
      await settle(page, 600);
      pass(`${tag}: the last of the 200 can be ticked at once`, data.recaps[0].actions[199].done === true && Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
      // For next time, 2,001 characters.
      const long = `${'I want to talk about the restructure. '.repeat(53)}`.slice(0, 2000) + '!';
      const prep = page.getByLabel('What do you want to talk about next time?').first();
      if (await prep.count()) {
        await prep.click(); await settle(page, 500);
        // On a phone long writing opens full screen (focus mode): the words go in there, then Done.
        const writer = page.locator('.ds-focus textarea');
        const focus = (await writer.count()) > 0;
        if (focus) await writer.first().click();
        await page.keyboard.insertText(long);
        await settle(page, 400);
        const held = (await (focus ? writer.first() : prep).inputValue()).length;
        if (focus) { await page.locator('.ds-focus-done').click(); await settle(page, 500); }
        await page.getByRole('button', { name: 'Save', exact: true }).first().click(); await settle(page, 1000);
        console.log(`  COUNT client, ${size}px: 2,001 characters into For next time: the box holds ${held}, and ${data.prep ? data.prep.body.length : 'nothing'} is saved.`);
        pass(`${tag}: a For next time note of 2,001 characters is held to 2,000 and saved`, held === 2000 && data.prep?.body.length === 2000 && (await said(page)) === 'Saved', `${held} in the box, ${data.prep?.body.length} saved, “${await said(page)}”`);
      } else pass(`${tag}: For next time shows for a client with a coach`, false, flat(text).slice(0, 200));
      await t.done();
    }
  }

  return { openAt, TUE, EVE, FRI, SAT };
}
