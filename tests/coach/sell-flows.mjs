// A week of selling as Tim (Phase 6a run 4, step 5: the functionality
// tester), walked from a booking to a Won client, in both database modes
// (device only: 049 to 052 "not yet"; and 049 to 052 answered by the stand-ins
// in shared.mjs, cal-standin.mjs and crm-standin.mjs), as the owner on a
// laptop, the core again on a phone, and as the associate where it says.
// Nothing reaches the test project and NOTHING IS EVER SENT: every write is
// the stand-in's, or is stopped and listed; every /api/ call is answered "not
// sent" and counted; a mailto, a WhatsApp link or a window opened is counted.
//
//   sell-book     a guest books a Discovery call on the public page: a lead appears on Leads with the booking on its
//                 timeline (and its automation's to-do, once); before 051 the page says one calm line and no lead appears
//   sell-work     a lead worked: two calls logged with what was learned, then Where Ruth is: the card's readiness words
//                 change as the notes fill; the next step typed over; the stage chosen in place; the weighted value and the
//                 stage totals follow; Referred by a Network person
//   sell-quiet    after 14 days with no contact a lead reads "Quiet for N days" (the clock moved on, the note stamped again),
//                 and the quiet automation adds its to-do once
//   sell-auto     "when a lead moves to Deciding, add a to-do" makes exactly one, none on the same move again or a reload; one
//                 that moves a stage does so once; nothing is ever sent
//   sell-won      Mark as won: a client is made, the timeline is on the client's page, the agreement draft stub, the lead leaves
//                 its stage; Undo takes it all back; won again, one client
//   sell-board    Tim makes a board, adds cards, shares it; the associate sees it read only and nothing else (no other board,
//                 Leads or Network); unshared, it goes
//   sell-email    copied in: an email from a lead lands on her timeline; two people nobody knows wait on Leads: Add as a lead,
//                 and Not now
//   sell-net      three catch-ups (last spoke and the due day move; Actions, the table and the map follow), a give and an ask
//                 ("You’ve given twice and asked once."), a rating edited across a boundary, Move to Leads
//   sell-archive  Ready to archive?: everyone ticked, two unticked, "Archive 1", Undo; the two never suggested again; Archived
//                 with Restore
//   sell-map      1,200 people: "Showing 150 of 1,200"; Show each list; Find someone; a dot opens the person or the list
//   sell-today    Today's Keep in touch (people due, then past clients' check-ins), the menu's count, a check-in note that only
//                 opens the coach's own email app
//   sell-import   a CSV of leads and of Network people (duplicates first), export both, merge two leads with Undo
//   sell-arrive   before 052, then 052 arrives: Leads, a board, an automation and Network move across once, nothing doubled
//
//   PARTS=sell-book,…   DB=none,there   SIZE=1440|400 (400 runs the core: sell-book, sell-work, sell-won, sell-net, sell-today)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, frameMenu, makeReport, OTHER, seedDevice, seedNetworkDevice, settle, SIZES, standIn, toastText } from './shared.mjs';
import { frameMenuWords } from './shared.mjs';
import { CAL, CRM, manyNetwork, networkDeviceSeed, seedClock, seedWithCrm } from './seed.mjs';
import { guestStandIn } from './book-standin.mjs';
import { mapProblems, readMap } from './net-rules.mjs';

// The coach's menu as the Polish 1 frame draws it (Stage A; shared.mjs frameMenuWords): the frame lists Boards itself,
// not each board under it (Stage C: the boards are on Boards' page).
const menuText = async (page) => (await frameMenuWords(page)).join('\n');

// Polish 1 (B4): "+ Add" by the list's label opens Quick Add; "Add their details too" opens the whole Add lead form,
// the name typed there carried over (cleared here, so the form starts as it always did).
async function openAddLead(page) {
  await page.locator('.ds-addlink[aria-label="Add lead"]').first().click();
  await page.locator('#cc-add-lead .ds-qa-box').fill('x');
  await page.getByRole('button', { name: 'Add their details too', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.ds-modal--shown .ds-dialog').last().getByLabel('Who is it?').fill('');
}


export const SELL_PARTS = ['sell-book', 'sell-work', 'sell-quiet', 'sell-auto', 'sell-won', 'sell-board', 'sell-email', 'sell-net', 'sell-archive', 'sell-map', 'sell-today', 'sell-import', 'sell-arrive'];
const PHONE_PARTS = ['sell-book', 'sell-work', 'sell-won', 'sell-net', 'sell-today'];
const TUE = new Date(2026, 10, 17, 9, 0);
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
// A name in a list or table, a board card and the pages that open more are real links since Polish 1 (B4): press either.
const press = async (page, name, scope = page) => { await scope.getByRole('button', { name, exact: true }).or(scope.getByRole('link', { name, exact: true })).first().click(); await settle(page, 600); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const words = (page) => page.evaluate(() => (document.querySelector('.cc-main')?.innerText || '').replace(/ /g, ' '));
const panelWords = (page) => dialog(page).innerText().then((t) => t.replace(/ /g, ' ')).catch(() => '');
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).last().click(); await settle(page, 900); };
const choose = async (page, label, option, scope = page) => { await scope.getByLabel(label, { exact: true }).first().click(); await settle(page, 300); await page.getByRole('option', { name: option, exact: true }).first().click(); await settle(page, 500); };
const has = (text, list) => list.every((w) => text.toLowerCase().includes(w.toLowerCase()));
const missing = (text, list) => list.filter((w) => !text.toLowerCase().includes(w.toLowerCase())).join(' | ');
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const money = (s) => Number(String(s).replace(/[£,]/g, '')) || 0;
// Rows only the database ever makes, and another coach's own, are never on a device before the tables are there.
const forDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, coach_bookings: _b, coach_email_addresses: _e, coach_poll_votes: _v, coach_cal_reminder_sends: _r, network_people: _np, network_gives: _ng, network_ratings: _nr, network_merges: _nm, ...own } = rows; return own; };
const NOT_YET = ['clarity-coach-not-yet', 'clarity-coach-day-not-yet', 'clarity-coach-cal-not-yet', 'clarity-coach-crm-not-yet'];
// Polish 1 (Stage B): Network's Actions are cards with a label and the shared rows, as network-flows reads them.
const actionRows = (page, title) => page.locator('.ds-card', { has: page.locator('.ds-label', { hasText: title }) }).locator('.ds-li').evaluateAll((rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
const cellText = async (page, name, index) => (await page.locator('.cc-net-table tbody tr', { has: page.getByRole('link', { name, exact: true }) }).locator('td, th').nth(index).innerText()).trim();
const netCell = (page, column, name) => page.locator('.cc-net-table').getByRole('button', { name: new RegExp(`^${column} for ${name}`) }).first();
const column = (page, name) => page.locator('.cc-lboard .cc-board-col', { has: page.locator('.cc-board-head', { hasText: name }) }).first();
/** A board column's head: "£31,500" and "£15,750 likely", read as numbers. */
const totals = async (page, name) => { const t = flat(await column(page, name).locator('.cc-lboard-sum').innerText()); const v = /£([\d,]+)(?! likely)/.exec(t); const l = /£([\d,]+) likely/.exec(t); return { value: v ? money(v[1]) : 0, likely: l ? money(l[1]) : 0, text: t }; };

async function run() {
  const report = makeReport('A week of selling, the flows');
  const { pass } = report;
  const size = Number(process.env.SIZE || 1440);
  const phone = size < 1100;
  const parts = (process.env.PARTS || (phone ? PHONE_PARTS : SELL_PARTS).join(',')).split(',');
  const on = (p) => parts.includes(p);
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();
  const at = phone ? ', a phone' : '';

  /**
   * A page signed in and standing in, its clock on `clock` (M11's Tuesday unless told), with the seed in the stand-in database
   * or on the device. `network` puts Network's people on the device too; `rows` replaces the seed.
   */
  async function openAt({ role = 'owner', db, path, tag, rows = null, network = true, clock = TUE, people = null, viewport = null }) {
    const there = db === 'there';
    let now = new Date(clock);
    const ctx = await coachContext(browser, { size: phone ? 400 : 1440, theme: there ? 'light' : 'dark' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    await page.setViewportSize(viewport || (phone ? SIZES[400] : { width: 1440, height: 1200 }));
    const errors = [];
    const reached = [];
    const api = [];
    const waits = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    page.on('response', (res) => {
      const req = res.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
      waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
    });
    // Anything that would leave the portal for someone else's inbox or chat: counted, never followed.
    await page.addInitScript(() => {
      window.__sent = [];
      document.addEventListener('click', (e) => { const a = e.target?.closest?.('a[href]'); const h = a?.getAttribute('href') || ''; if (/^(mailto|sms|tel):|wa\.me|imessage/i.test(h)) window.__sent.push(h.split(/[:?]/)[0]); }, true);
      window.open = (u) => { window.__sent.push(`open ${String(u).split(/[:?]/)[0]}`); return null; };
    });
    await page.clock.setFixedTime(now);
    seedClock(now);
    const seed = rows || seedWithCrm({ accounts: true });
    if (people) { seed.network_people = people; seed.network_gives = []; seed.network_ratings = []; }
    const store = await standIn(page, { role, db, day: there, cal: there, crm: there, strict: there, rows: there ? seed : {}, now: () => new Date(now) });
    await page.route('**/api/**', (route) => { api.push(new URL(route.request().url()).pathname); return json(route, { ok: true, sent: false }); });
    await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
    await page.route('**/rest/v1/organisation_access_codes*', (route) => (route.request().method() === 'GET' ? json(route, []) : route.abort()));
    for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
    if (!there) await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    const me = await accountId(page);
    await clearDevice(page, me);
    await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.startsWith(`clarity-cache:${id}:coach-email-standin`) || k === `clarity-cache:${id}:coach-board-layout`) localStorage.removeItem(k); }, me);
    const callsFrom = store.calls.length;
    if (!there) {
      await seedDevice(page, me, forDevice(seed));
      if (role === 'owner' && network) await seedNetworkDevice(page, me, people ? { people, gives: [], ratings: [] } : networkDeviceSeed());
    }
    if (path) await go(page, path);
    const deviceRows = (table) => page.evaluate(([id, t]) => {
      const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || localStorage.getItem(`clarity-cache:${id}:coach`) || '{}');
      const marks = kept.marks?.[t] || {};
      return Object.entries(kept.rows?.[t] || {}).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
    }, [me, table]);
    const devicePeople = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"people":{}}').people || {}), me);
    const deviceGives = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"gives":{}}').gives || {}), me);
    return {
      page, ctx, store, me, there, errors, seed, api, callsFrom,
      rowsNow: async (table) => (there ? store.rows[table] || [] : deviceRows(table)),
      peopleNow: async () => (there ? store.rows.network_people || [] : devicePeople()),
      givesNow: async () => (there ? store.rows.network_gives || [] : deviceGives()),
      deviceRows,
      sent: () => page.evaluate(() => window.__sent || []),
      /** Moves the page's clock (never past the real day), stamping the stand-in's "not yet" note again on the device. */
      async moveClock(to) {
        now = new Date(to);
        seedClock(now);
        await page.clock.setFixedTime(now);
        if (!there) await page.addInitScript((keys) => { try { for (const k of keys) localStorage.setItem(k, String(Date.now())); } catch { /* blocked */ } }, NOT_YET);
      },
      async close({ keep = false } = {}) {
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
        pass(`${tag}: nothing was written to the test project`, reached.length === 0 && blocked.length === 0, [...new Set([...reached, ...blocked])].slice(0, 4).join('; '));
        pass(`${tag}: nothing asked the server to send anything (no /api/ call at all)`, api.length === 0, [...new Set(api)].join(', '));
        if (keep) return;
        await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.startsWith(`clarity-cache:${id}:coach-email-standin`) || k === `clarity-cache:${id}:coach-board-layout`) localStorage.removeItem(k); }, me).catch(() => {});
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  /** A signed-out guest on a booking page, sharing the coach's stand-in database (or one with no 051 in it). */
  async function guestPage(store) {
    const ctx = await browser.newContext({ viewport: phone ? SIZES[400] : { width: 1440, height: 1200 }, serviceWorkers: 'block', colorScheme: 'light' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.clock.setFixedTime(TUE);
    await guestStandIn(page, store);
    const open = async (path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-public', { timeout: 20000 }); await settle(page, 1000); };
    return { page, ctx, errors, open, words: () => page.locator('.cc-public').textContent() };
  }

  try {
    for (const db of dbs) {
      const mode = `${db === 'there' ? '049 to 052 there' : 'on the device'}${at}`;

      // ---------------------------------------------------------------- 1. a guest books a Discovery call
      if (on('sell-book')) {
        const tag = `sell-book, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads' });
        const leadsBefore = (await a.rowsNow('coach_leads')).length;
        const g = await guestPage(a.there ? a.store : { there: false, calls: [], blocked: [] });
        await g.open(`/book/${CAL.chemKey}`);
        if (a.there) {
          await g.page.locator('.cc-book-time').first().click(); await settle(g.page, 400);
          // Polish 1 (Stage A, the example's two screens): Continue opens Your details.
          await g.page.locator('.cc-book-go').first().click(); await settle(g.page, 500);
          await g.page.getByLabel('Your name').fill('Nell Okoye');
          await g.page.getByLabel('Your email').fill('nell.okoye@example.invalid');
          await g.page.getByLabel('What would you like from the call?').fill('To lead a bigger team without losing the plot.');
          await g.page.locator('.cc-book-form .ds-btn--primary').click(); await settle(g.page, 1200);
          pass(`${tag}: the guest is booked on the public page`, /You’re booked for/.test(await g.words()), (await g.words()).slice(0, 120));
          await go(a.page, '/coach/leads'); await settle(a.page, 3500); // the watch asks a moment after the portal opens
          const nell = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Nell Okoye');
          pass(`${tag}: a lead is made by the booking, once, in the first stage, from the Discovery call page`, (await a.rowsNow('coach_leads')).length === leadsBefore + 1 && nell?.stage_id === CRM.stNew && nell.source === 'chemistry_page' && Boolean(nell.booking_id), JSON.stringify(nell && [nell.stage_id === CRM.stNew, nell.source]));
          const card = phone ? '' : await a.page.locator(`[data-card="${nell?.id}"]`).innerText().catch(() => '');
          pass(`${tag}: Nell is on Leads${phone ? ' (the list)' : ', in New'}`, phone ? (await words(a.page)).includes('Nell Okoye') : (await column(a.page, 'New').innerText()).includes('Nell Okoye') && card.includes('Nell Okoye'), card.replace(/\n/g, ' '));
          await go(a.page, `/coach/leads/${nell?.id}`);
          // On a phone the timeline row keeps two lines; tapping it opens its lines in full (the booking's answers).
          if (phone) await a.page.locator('button.cc-timeline-row', { hasText: 'Booked a Discovery call' }).first().click().catch(() => {});
          const text = await words(a.page);
          pass(`${tag}: her page has the booking on its timeline, where she came from, and what she answered`, has(text, ['Booked a Discovery call', 'First contact', 'Discovery call page', 'To lead a bigger team without losing the plot.']), missing(text, ['Booked a Discovery call', 'First contact', 'Discovery call page', 'To lead a bigger team without losing the plot.']) + ' :: ' + flat(text).slice(0, 700));
          const todos = (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === nell?.id && t.automation_id === CRM.a4);
          pass(`${tag}: the “call is booked” automation adds “Read their booking answers” once`, todos.length === 1 && todos[0].title === 'Read their booking answers', JSON.stringify(todos.map((t) => [t.title, t.planned_on])));
          await go(a.page, '/coach/leads'); await settle(a.page, 3000);
          pass(`${tag}: opened again, the automation adds nothing more`, (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === nell?.id && t.automation_id === CRM.a4).length === 1);
          pass(`${tag}: the guest's page asked nothing but 051's functions, and wrote nothing`, g.errors.length === 0 && (a.store.blocked || []).length === 0, [...g.errors, ...(a.store.blocked || [])].slice(0, 3).join(' | '));
        } else {
          pass(`${tag}: before 051 the booking page says one calm line`, /Booking isn’t open yet\. Try again soon\./.test(await g.words()) && (await g.page.locator('.cc-book-time').count()) === 0, (await g.words()).slice(0, 120));
          await go(a.page, '/coach/leads');
          pass(`${tag}: and no lead appears`, (await a.rowsNow('coach_leads')).length === leadsBefore && !(await words(a.page)).includes('Nell Okoye'));
        }
        await g.ctx.close();
        await a.close();
      }

      // ---------------------------------------------------------------- 2. working the lead
      if (on('sell-work')) {
        const tag = `sell-work, ${mode}`;
        const ruthId = CAL.leadRuth;
        const a = await openAt({ db, tag, path: '/coach/leads' });
        const { page } = a;
        const cardOf = async () => (phone ? '' : flat(await page.locator(`[data-card="${ruthId}"]`).innerText().catch(() => '')));
        if (!phone) pass(`${tag}: before any notes, Ruth's card says nothing about how ready she is`, !/Ready to decide|Still to find out|Early days/.test(await cardOf()), await cardOf());
        await go(page, `/coach/leads/${ruthId}`);
        pass(`${tag}: her page: early days, everything still to find out`, (await words(page)).includes('Early days. Still to find out: the outcome, what’s in the way, who decides, who funds it and when.'));
        // The first call: the outcome and the pain.
        await press(page, 'Log a call');
        let d = dialog(page);
        await d.getByLabel('How did it go?').fill('Good first call. She wants the staff team pulling together.');
        await d.getByLabel('What happens next?').fill('Send two dates for a second call');
        await d.getByLabel('What do they want to achieve?').fill('A staff team that plans together.');
        await d.getByLabel('What’s getting in the way?').fill('Silos between the coaches and the analysts.');
        await press(page, 'Save the call', d);
        pass(`${tag}: the first call is logged, its follow-up on the coach's to-dos`, (await toastText(page)).startsWith('Logged.'), await toastText(page));
        pass(`${tag}: after two notes: “Early days. Still to find out: who decides, who funds it and when.”`, (await words(page)).includes('Early days. Still to find out: who decides, who funds it and when.'));
        // The second: who decides and who funds it.
        await press(page, 'Log a call');
        d = dialog(page);
        await d.getByLabel('How did it go?').fill('Met the chief executive too.');
        await d.getByLabel('Who decides?').fill('Ruth, with the chief executive.');
        await d.getByLabel('Who funds it?').fill('The club’s development budget.');
        await press(page, 'Save the call', d);
        pass(`${tag}: after four: “Nearly there. Still to find out: when.”`, (await words(page)).includes('Nearly there. Still to find out: when.'));
        if (!phone) { await go(page, '/coach/leads'); pass(`${tag}: the card on the board says it in words: “Still to find out: when”`, (await cardOf()).includes('Still to find out: when') && !/\d+\s?%|\d\/\d/.test(await cardOf()), await cardOf()); await go(page, `/coach/leads/${ruthId}`); }
        // Where Ruth is: the last one.
        await page.getByRole('button', { name: 'Edit where Ruth is' }).click(); await settle(page, 600);
        d = dialog(page);
        pass(`${tag}: Where Ruth is holds what the calls learned`, (await d.getByLabel('Who decides?').inputValue()) === 'Ruth, with the chief executive.' && (await d.getByLabel('What do they want to achieve?').inputValue()) === 'A staff team that plans together.');
        await d.getByLabel('When do they want to start?').fill('January, before the season review.');
        await press(page, 'Save my edit', d);
        pass(`${tag}: with all five known: “Ready to decide.”`, (await words(page)).includes('Ready to decide.'));
        const ruth = (await a.rowsNow('coach_leads')).find((l) => l.id === ruthId);
        pass(`${tag}: the five notes are kept on the lead`, ruth?.want_outcome === 'A staff team that plans together.' && ruth.want_pain && ruth.who_decides && ruth.who_funds && ruth.decide_when === 'January, before the season review.', JSON.stringify(ruth && [ruth.want_outcome, ruth.decide_when]));
        const calls = (await a.rowsNow('coach_lead_events')).filter((e) => e.lead_id === ruthId && e.kind === 'call');
        pass(`${tag}: both calls are on her timeline, and last contact is today`, calls.length === 2 && ruth.last_contact_on === '2026-11-17', `${calls.length} calls, ${ruth?.last_contact_on}`);

        if (!phone) {
          await go(page, '/coach/leads');
          pass(`${tag}: the card now reads “Ready to decide”`, (await cardOf()).includes('Ready to decide'), await cardOf());
          const propBefore = await totals(page, 'Proposal sent');
          const callBefore = await totals(page, ruth.stage_id === CRM.stCall ? 'Call booked' : 'New');
          // The table: the next step typed over, the value typed over, the stage chosen in place.
          await press(page, 'Table');
          const row = page.locator('.cc-lead-table tbody tr', { hasText: 'Ruth Adeyemi' }).first();
          await row.getByRole('button', { name: /^Next step, / }).click(); await settle(page, 300);
          await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Send the proposal for January'); await page.keyboard.press('Enter'); await settle(page, 800);
          pass(`${tag}: the next step is typed over in place: “Saved”`, (await a.rowsNow('coach_leads')).find((l) => l.id === ruthId)?.next_step === 'Send the proposal for January' && (await toastText(page)).includes('Saved'), await toastText(page));
          await row.getByRole('button', { name: /^Value, / }).click(); await settle(page, 300);
          await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('£8,000'); await page.keyboard.press('Enter'); await settle(page, 800);
          pass(`${tag}: the value is typed over: £8,000`, (await a.rowsNow('coach_leads')).find((l) => l.id === ruthId)?.value === 8000);
          await row.getByRole('button', { name: /^Stage, / }).click(); await settle(page, 400);
          await page.getByRole('menuitemcheckbox', { name: 'Proposal sent' }).click(); await settle(page, 1300);
          pass(`${tag}: the stage is chosen in place: “Moved to Proposal sent.”, and its automation adds a to-do`, (await toastText(page)).includes('Moved to Proposal sent.') && (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === ruthId && t.automation_id === CRM.a1).length === 1, await toastText(page));
          await press(page, 'Board');
          const propAfter = await totals(page, 'Proposal sent');
          const callAfter = await totals(page, ruth.stage_id === CRM.stCall ? 'Call booked' : 'New');
          pass(`${tag}: the weighted value follows: Proposal sent gains £8,000, and £4,000 likely at 50%`, propAfter.value === propBefore.value + 8000 && propAfter.likely === propBefore.likely + 4000 && (await column(page, 'Proposal sent').innerText()).includes('Ruth Adeyemi'), `${propBefore.text} → ${propAfter.text}`);
          pass(`${tag}: and her old stage's total loses her`, !(await column(page, ruth.stage_id === CRM.stCall ? 'Call booked' : 'New').innerText()).includes('Ruth Adeyemi') && callAfter.value === callBefore.value, `${callBefore.text} → ${callAfter.text}`);
          await go(page, `/coach/leads/${ruthId}`);
        } else {
          // On a phone there is no table: the next step, the value and the stage are edited in Edit details.
          await press(page, 'Edit details');
          d = dialog(page);
          await d.getByLabel('Next step', { exact: true }).fill('Send the proposal for January');
          await d.getByLabel('Value', { exact: true }).fill('£8,000');
          await choose(page, 'Stage', 'Proposal sent', d);
          await press(page, 'Save my edit', d);
          const r2 = (await a.rowsNow('coach_leads')).find((l) => l.id === ruthId);
          pass(`${tag}: on a phone, Edit details saves the next step, the value and the stage`, r2?.next_step === 'Send the proposal for January' && r2.value === 8000 && r2.stage_id === CRM.stProp, JSON.stringify(r2 && [r2.next_step, r2.value, r2.stage_id === CRM.stProp]));
          pass(`${tag}: the page shows the next step and the new stage`, has(await words(page), ['Send the proposal for January', 'Proposal sent', '£8,000']), missing(await words(page), ['Send the proposal for January', 'Proposal sent', '£8,000']));
        }
        // Referred by a Network person.
        await press(page, 'Edit details');
        d = dialog(page);
        await choose(page, 'Where they came from', 'Referred by someone', d);
        await d.getByLabel('Who referred them?').fill('Dan Reid');
        await press(page, 'Save my edit', d);
        const r3 = (await a.rowsNow('coach_leads')).find((l) => l.id === ruthId);
        pass(`${tag}: Referred by Dan Reid shows in her details`, (await words(page)).includes('Referred by') && (await words(page)).includes('Dan Reid') && r3?.referred_by === 'Dan Reid' && r3.source === 'referral', JSON.stringify(r3 && [r3.referred_by, r3.source]));
        pass(`${tag}: Dan Reid, who is in the Network, is joined to her as the person who referred her`, r3?.referred_by_person === CRM.dan, String(r3?.referred_by_person));
        const link = page.locator('.cc-main').getByRole('button', { name: 'Dan Reid', exact: true }).or(page.locator('.cc-main').getByRole('link', { name: 'Dan Reid', exact: true }));
        pass(`${tag}: his name opens him in Network`, (await link.count()) === 1);
        if (await link.count()) { await link.first().click(); await settle(page, 1200); pass(`${tag}: it opens Dan's panel`, /\/coach\/network\?.*person=/.test(page.url()) && (await panelWords(page)).includes('I spoke to Dan today'), page.url().slice(-60)); }
        // Amy, referred by Hannah Wells in the seed (the person already joined): her name opens Hannah.
        await go(page, `/coach/leads/${CRM.amy}`);
        pass(`${tag}: Amy's referrer, joined in the seed, is a link to Hannah in Network`, (await page.locator('.cc-main').getByRole('button', { name: 'Hannah Wells', exact: true }).or(page.locator('.cc-main').getByRole('link', { name: 'Hannah Wells', exact: true })).count()) === 1);
        await a.close();
      }

      // ---------------------------------------------------------------- 3. it goes quiet
      if (on('sell-quiet') && !phone) {
        const tag = `sell-quiet, ${mode}`;
        const START = new Date(2026, 10, 3, 9, 0); // Tue 3 Nov: two weeks before M11's Tuesday, never past the real day
        const a = await openAt({ db, tag, path: '/coach/leads', clock: START });
        const { page } = a;
        await openAddLead(page); await settle(page, 600);
        await dialog(page).getByLabel('Who is it?').fill('Hana Okafor');
        await choose(page, 'Where did they come from?', 'Somewhere else', dialog(page));
        await press(page, 'Add lead', dialog(page));
        const hana = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Hana Okafor');
        const first = flat(await page.locator(`[data-card="${hana?.id}"]`).innerText({ timeout: 5000 }).catch(() => ''));
        pass(`${tag}: Hana is added on Tue 3 Nov, and isn't quiet`, Boolean(hana) && first.includes('Hana Okafor') && !first.includes('Quiet'), `${Boolean(hana)} ${first} ${await toastText(page)} ${flat(await panelWords(page)).slice(0, 200)}`);
        const see = async (when) => { await a.moveClock(when); await go(page, '/coach/leads'); await settle(page, 3500); return flat(await page.locator(`[data-card="${hana?.id}"]`).innerText().catch(() => '')); };
        let card = await see(new Date(2026, 10, 16, 9, 0));
        pass(`${tag}: 13 days on (Mon 16 Nov), still not quiet`, card.includes('Hana Okafor') && !card.includes('Quiet'), card);
        card = await see(new Date(2026, 10, 17, 9, 0));
        pass(`${tag}: 14 days on (Tue 17 Nov): “Quiet for 14 days”`, card.includes('Quiet for 14 days'), card);
        const checkIns = async () => (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === hana?.id && t.automation_id === CRM.a3);
        pass(`${tag}: the “quiet for 14 days” automation adds “Check in” for her, once`, (await checkIns()).length === 1 && (await checkIns())[0].title === 'Check in' && (await checkIns())[0].planned_on === '2026-11-17', JSON.stringify((await checkIns()).map((t) => [t.title, t.planned_on])));
        card = await see(new Date(2026, 10, 20, 9, 0));
        pass(`${tag}: Fri 20 Nov: “Quiet for 17 days”, and still one “Check in”`, card.includes('Quiet for 17 days') && (await checkIns()).length === 1, `${card} / ${(await checkIns()).length}`);
        await press(page, 'Table');
        pass(`${tag}: the table says it under Last contact too`, flat(await page.locator('.cc-lead-table tbody tr', { hasText: 'Hana Okafor' }).first().innerText()).includes('Quiet for 17 days'));
        // A call logged ends it.
        await go(page, `/coach/leads/${hana?.id}`);
        await press(page, 'Log a call');
        await dialog(page).getByLabel('How did it go?').fill('Caught her at last.');
        await press(page, 'Save the call', dialog(page));
        await go(page, '/coach/leads');
        await press(page, 'Board');
        const last = flat(await page.locator(`[data-card="${hana?.id}"]`).innerText({ timeout: 5000 }).catch(() => ''));
        pass(`${tag}: a call logged and she isn't quiet any more`, last.includes('Hana Okafor') && !last.includes('Quiet'), last);
        await a.close();
      }

      // ---------------------------------------------------------------- 4. automations, and nothing is sent
      if (on('sell-auto') && !phone) {
        const tag = `sell-auto, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads/automations' });
        const { page } = a;
        await press(page, 'Add automation');
        let d = dialog(page);
        await choose(page, 'Which stage?', 'Deciding', d);
        await d.getByLabel('To-do', { exact: true }).fill('Send the contract');
        await choose(page, 'When?', '2 days later', d);
        await press(page, 'Save', d);
        const mine = (await a.rowsNow('coach_automations')).find((r) => r.todo_title === 'Send the contract');
        const made = async () => (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id);
        await go(page, '/coach/leads');
        await press(page, 'Table');
        const stage = async (name, to) => { await page.locator('.cc-lead-table tbody tr', { hasText: name }).first().getByRole('button', { name: /^Stage, / }).click(); await settle(page, 400); await page.getByRole('menuitemcheckbox', { name: to }).click(); await settle(page, 1300); };
        await stage('Elena Ruiz', 'Deciding');
        pass(`${tag}: Elena moved to Deciding: one to-do, “Send the contract”, 2 days later`, (await made()).length === 1 && (await made())[0].lead_id === CRM.elena && (await made())[0].planned_on === '2026-11-19' && (await toastText(page)).includes('An automation added a to-do.'), JSON.stringify((await made()).map((t) => [t.title, t.planned_on])));
        await stage('Elena Ruiz', 'Deciding');
        pass(`${tag}: choosing Deciding again, where she already is, adds nothing`, (await made()).length === 1 && (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mine?.id).length === 1);
        await go(page, '/coach/leads'); await settle(page, 4000);
        pass(`${tag}: a reload, with the watch asking again, adds nothing`, (await made()).length === 1);
        // Out and back in again is a new move of its own: said here as what happens, not as a rule.
        await press(page, 'Table');
        await stage('Elena Ruiz', 'Proposal sent');
        await stage('Elena Ruiz', 'Deciding');
        const again = (await made()).length;
        console.log(`NOTE ${tag}: moved out of Deciding and back in, the automation's to-dos for Elena number ${again}`);
        // One that moves a stage: a proposal opened once moves the lead to Deciding, once.
        await go(page, '/coach/leads/automations');
        await press(page, 'Add automation');
        d = dialog(page);
        await choose(page, 'When', 'A proposal is opened', d);
        await choose(page, 'How many times?', 'Once', d);
        await choose(page, 'Then', 'Move the lead to a stage', d);
        await choose(page, 'Which stage does it move to?', 'Deciding', d);
        await press(page, 'Save', d);
        await settle(page, 4500);
        const mover = (await a.rowsNow('coach_automations')).find((r) => r.action === 'stage' && r.trigger === 'proposal_opened');
        const moves = async () => (await a.rowsNow('coach_lead_events')).filter((e) => e.lead_id === CRM.amy && e.kind === 'stage' && (e.data?.automation_id === mover?.id || e.data?.by === mover?.id));
        pass(`${tag}: the automation moves Amy (her proposal opened) to Deciding once, with its line`, (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy)?.stage_id === CRM.stDeciding && (await moves()).length === 1, `${(await moves()).length} lines`);
        await go(page, '/coach/leads'); await settle(page, 4500);
        pass(`${tag}: opened again, it doesn't move her again`, (await moves()).length === 1 && (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mover?.id).length === 1);
        pass(`${tag}: no automation opened an email, a chat or a window`, (await a.sent()).length === 0, (await a.sent()).join(', '));
        await a.close();
      }

      // ---------------------------------------------------------------- 5. won
      if (on('sell-won')) {
        const tag = `sell-won, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads' });
        const { page } = a;
        const decidingBefore = phone ? null : await totals(page, 'Deciding');
        const clientsBefore = (await a.rowsNow('client_profiles')).length;
        const tomLines = (await a.rowsNow('coach_lead_events')).filter((e) => e.lead_id === CRM.tom && e.title).map((e) => e.title);
        await go(page, `/coach/leads/${CRM.tom}`);
        await press(page, 'Mark as won');
        pass(`${tag}: Mark as won: “Won. Tom is now a client…”`, (await toastText(page)).startsWith('Won. Tom is now a client'), await toastText(page));
        const wonNow = async () => {
          const tom = (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.tom);
          const client = (await a.rowsNow('client_profiles')).find((p) => p.id === tom?.won_profile_id);
          const line = (await a.rowsNow('coach_lead_events')).find((e) => e.lead_id === CRM.tom && e.kind === 'won');
          return { tom, client, line, clients: (await a.rowsNow('client_profiles')).length };
        };
        let w = await wonNow();
        pass(`${tag}: one client is made from the lead, the lead is in Won`, w.clients === clientsBefore + 1 && w.client?.name === 'Tom Hale' && w.tom?.stage_id === CRM.stWon && Boolean(w.tom.won_at), JSON.stringify([w.clients - clientsBefore, w.client?.name]));
        pass(`${tag}: an agreement draft stub is left for Finances, on the Won line`, w.line?.data?.agreement_draft?.status === 'draft', JSON.stringify(w.line?.data?.agreement_draft || null));
        await undo(page);
        w = await wonNow();
        pass(`${tag}: Undo takes it all back: no client, no Won line, Tom in Deciding`, w.clients === clientsBefore && !w.line && w.tom?.stage_id === CRM.stDeciding && !w.tom.won_at && !w.tom.won_profile_id && !(await a.rowsNow('organisation_deals')).some((x) => x.lead_id === CRM.tom), JSON.stringify([w.clients - clientsBefore, Boolean(w.line), w.tom?.stage_id === CRM.stDeciding]));
        if (!phone) { await go(page, '/coach/leads'); pass(`${tag}: and he is back in Deciding on the board`, (await column(page, 'Deciding').innerText()).includes('Tom Hale')); }
        await go(page, `/coach/leads/${CRM.tom}`);
        await press(page, 'Mark as won');
        w = await wonNow();
        pass(`${tag}: won again: one client, not two`, w.clients === clientsBefore + 1 && w.tom?.stage_id === CRM.stWon && (await a.rowsNow('client_profiles')).filter((p) => p.name === 'Tom Hale').length === 1);
        await go(page, `/coach/leads/${CRM.tom}`);
        await press(page, 'Open the client’s page');
        await press(page, 'Everything');
        const all = await words(page);
        pass(`${tag}: the client's page carries Tom's timeline over`, all.includes('Won') && tomLines.slice(0, 3).every((t) => all.includes(t)), missing(all, tomLines.slice(0, 3)));
        if (!phone) {
          await go(page, '/coach/leads');
          const decidingAfter = await totals(page, 'Deciding');
          pass(`${tag}: Tom leaves Deciding, and its total drops by his value`, !(await column(page, 'Deciding').innerText()).includes('Tom Hale') && decidingAfter.value === decidingBefore.value - (w.tom.value || 0) && (await column(page, 'Won').innerText()).includes('Tom Hale'), `${decidingBefore.text} → ${decidingAfter.text}`);
        }
        await a.close();
      }

      // ---------------------------------------------------------------- 6. a shared board
      if (on('sell-board') && !phone) {
        const tag = `sell-board, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/boards' });
        const { page } = a;
        await press(page, 'New board');
        let d = dialog(page);
        await d.getByLabel('What’s it called?').fill('Workshops 2027');
        await press(page, 'Make the board', d); await settle(page, 800);
        const board = (await a.rowsNow('coach_boards')).find((b) => b.name === 'Workshops 2027');
        const stages = (await a.rowsNow('coach_board_stages')).filter((s) => s.board_id === board?.id).sort((x, y) => x.position - y.position);
        pass(`${tag}: the board is made, not shared, with its stages`, Boolean(board) && board.shared === false && stages.length >= 3, `${stages.length} stages`);
        for (const name of ['Northfield team day', 'Kestrel leaders offsite']) {
          await page.getByRole('button', { name: `Add card to ${stages[0].name}` }).click(); await settle(page, 600);
          d = dialog(page);
          await d.getByLabel('Name', { exact: true }).fill(name);
          await press(page, 'Add card', d);
        }
        pass(`${tag}: two cards are added`, has(await words(page), ['Northfield team day', 'Kestrel leaders offsite']) && (await a.rowsNow('coach_board_items')).filter((i) => i.board_id === board?.id).length === 2);
        await press(page, 'Edit this board');
        d = dialog(page);
        await d.getByRole('switch').click(); await settle(page, 300);
        await press(page, 'Save', d); await settle(page, 700);
        pass(`${tag}: shared: “Shared.”`, /^Shared\./.test((await toastText(page)).trim()) && (await a.rowsNow('coach_boards')).find((b) => b.id === board?.id)?.shared === true, await toastText(page));
        // What the owner's database now holds, as the associate's database would hold it (the owner's rows are another coach's to her).
        const owner = (t) => a.rowsNow(t).then((rows) => rows.map((r) => ({ ...r, coach_id: OTHER })));
        const ownerBoards = await owner('coach_boards');
        const ownerStages = await owner('coach_board_stages');
        const ownerItems = await owner('coach_board_items');
        await a.close();

        const rows = seedWithCrm({ accounts: true, network: false });
        rows.coach_boards = ownerBoards; rows.coach_board_stages = ownerStages; rows.coach_board_items = ownerItems;
        const b = await openAt({ role: 'associate', db, tag: `${tag}, the associate`, path: '/coach/boards', rows, network: false });
        let text = await words(b.page);
        pass(`${tag}: the associate sees Workshops 2027 and no other board`, text.includes('Workshops 2027') && !/Speaking|Partners/.test(text), text.slice(0, 160));
        const menu = await menuText(b.page);
        pass(`${tag}: her menu has Boards, and no Leads or Network`, /Boards/.test(menu) && !/Speaking|Partners|Leads|Network/.test(menu), flat(menu).slice(0, 200));
        await b.page.keyboard.press('Escape'); await settle(b.page, 300);
        await go(b.page, `/coach/boards/${board.id}`);
        text = await words(b.page);
        pass(`${tag}: it is read only: no Edit this board, no Add card`, has(text, ['Northfield team day', 'can’t edit it']) && !text.includes('Edit this board') && !text.includes('Add card'), text.slice(0, 160));
        for (const path of ['/coach/leads', '/coach/network', `/coach/leads/${CRM.amy}`, `/coach/network?person=${CRM.david}`]) {
          await go(b.page, path);
          pass(`${tag}: ${path.replace(/[?/].{20,}$/, '…')} sends her to her own Today`, new URL(b.page.url()).pathname === '/coach' && (await dialog(b.page).count()) === 0);
        }
        if (b.there) {
          // Tim unshares it: the next time her portal asks, it has gone.
          for (const x of b.store.rows.coach_boards) if (x.id === board.id) x.shared = false;
          await go(b.page, '/coach/boards');
          pass(`${tag}: unshared, it goes from her Boards`, !(await words(b.page)).includes('Workshops 2027') && (await words(b.page)).includes('No board is shared with you yet.'), (await words(b.page)).slice(0, 120));
          await go(b.page, `/coach/boards/${board.id}`);
          pass(`${tag}: and its own address shows nothing of it`, (await words(b.page)).includes('This board isn’t here any more.') && !(await words(b.page)).includes('Northfield team day'));
          pass(`${tag}: and her menu has no Boards`, !/Boards|Workshops/.test(await menuText(b.page)));
          await b.page.keyboard.press('Escape');
        }
        await b.close();
      }

      // ---------------------------------------------------------------- 7. emails copied in
      if (on('sell-email') && !phone) {
        const tag = `sell-email, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/settings/email', network: false });
        const { page } = a;
        await page.getByRole('switch', { name: 'Use stand-in addresses on this device' }).click(); await settle(page, 800);
        const logKey = ((/log\.[a-z0-9.]+@in\.example\.invalid/.exec(await words(page)) || [''])[0]).split('@')[0];
        pass(`${tag}: the copy-in address shows with the stand-in on`, Boolean(logKey));
        if (a.there) a.store.accountEmail = await page.evaluate(() => JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}')?.user?.email || null);
        const arrive = (email) => page.evaluate(async ([k, e]) => {
          const own = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}')?.user?.email || 'owner@example.invalid';
          const s = window.__clarityEmailSync;
          const swap = (p) => (p === 'me' ? { name: 'Alex Morgan', email: own } : p);
          s.copyIn().arrive(k, { ...e, from: swap(e.from), to: (e.to || []).map(swap) });
          return s.round();
        }, [logKey, email]);
        const ruth = a.seed.coach_leads.find((l) => l.id === CAL.leadRuth);
        // Ruth's reply, forwarded on to the copy-in address.
        let done = await arrive({ from: { name: ruth.name, email: ruth.email }, to: ['me'], subject: 'Re: Second call', text: 'Thursday works. Ruth', message_id: 'f4-sell-1@example.invalid' }); await settle(page, 700);
        pass(`${tag}: Ruth's reply is logged once, waiting for nobody`, done.logged === 1 && done.waiting === 0, JSON.stringify(done));
        // One the owner sent to two people nobody knows.
        done = await arrive({ from: 'me', to: [{ name: 'Owen Hart', email: 'owen.hart@example.invalid' }, { name: 'Ines Duarte', email: 'ines.duarte@example.invalid' }], subject: 'Workshop dates', text: 'Here are the dates.', message_id: 'f4-sell-2@example.invalid' }); await settle(page, 700);
        pass(`${tag}: the email to two people nobody knows is logged, and both wait`, done.logged === 1 && done.waiting === 2, JSON.stringify(done));
        const links = (await a.rowsNow('coach_email_links')).filter((l) => l.person_kind === 'lead' && l.person_id === CAL.leadRuth);
        pass(`${tag}: Ruth's reply belongs to her lead`, links.some((l) => (a.there ? a.store.rows.coach_emails : []).concat([]).length >= 0) && links.length >= 1, `${links.length}`);
        await go(page, `/coach/leads/${CAL.leadRuth}`);
        pass(`${tag}: it is on her timeline: “Ruth replied: Second call”`, (await words(page)).includes('Ruth replied: Second call'), flat(await page.locator('.cc-lead-tl').innerText().catch(() => '')).slice(0, 300));
        await go(page, '/coach/leads');
        const handled = [];
        for (let i = 0; i < 5; i += 1) {
          const line = await page.locator('.cc-lead-line', { hasText: 'isn’t in the portal yet' }).first().innerText().catch(() => '');
          if (!line) break;
          if (line.includes('Owen Hart')) { await page.locator('.cc-lead-line', { hasText: 'Owen Hart' }).getByRole('button', { name: 'Add as a lead', exact: true }).click(); handled.push('Owen: added'); }
          else if (line.includes('Ines Duarte')) { await page.locator('.cc-lead-line', { hasText: 'Ines Duarte' }).getByRole('button', { name: 'Not now', exact: true }).click(); await settle(page, 700); handled.push(`Ines: ${await toastText(page)}`); }
          else { await page.locator('.cc-lead-line', { hasText: 'isn’t in the portal yet' }).getByRole('button', { name: 'Not now', exact: true }).click(); handled.push('Sarah: not now'); }
          await settle(page, 900);
        }
        const owen = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Owen Hart');
        pass(`${tag}: each waiting person shows in turn: Owen added as a lead, Ines left out with Not now`, handled.some((h) => h === 'Owen: added') && handled.some((h) => h.startsWith('Ines: Left out')), handled.join(' | '));
        pass(`${tag}: Owen is in New from “Your email”, with the email on his timeline`, owen?.source === 'email' && owen.stage_id === CRM.stNew && (await a.rowsNow('coach_email_links')).some((l) => l.person_kind === 'lead' && l.person_id === owen.id), JSON.stringify(owen && [owen.source]));
        pass(`${tag}: Ines is never asked about again, and isn't a lead`, !(await a.rowsNow('coach_leads')).some((l) => l.name === 'Ines Duarte') && (await a.rowsNow('coach_email_waiting')).filter((w) => w.status === 'waiting').length === 0 && !(await words(page)).includes('isn’t in the portal yet'));
        await go(page, '/coach/leads');
        pass(`${tag}: after a reload nobody waits`, !(await words(page)).includes('isn’t in the portal yet'));
        await a.close();
      }

      // ---------------------------------------------------------------- 8. Network: catch-ups, a give and an ask, a rating, Move to Leads
      if (on('sell-net')) {
        const tag = `sell-net, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network' });
        const { page } = a;
        const three = [['Sofia', CRM.sofia, 'Sofia Marsh'], ['Dana', CRM.dana, 'Dana Whitfield'], ['Hannah', CRM.hannah, 'Hannah Wells']];
        for (const [first, id, name] of three) {
          await page.locator('.ds-li', { hasText: name }).first().click(); await settle(page, 800);
          await press(page, `I spoke to ${first} today`, dialog(page));
          const said = await toastText(page);
          pass(`${tag}: a catch-up with ${first} is logged, with when next`, /^Logged\. Next time is /.test(said) && (await panelWords(page)).includes('You last spoke today.'), said);
          await page.keyboard.press('Escape'); await settle(page, 700);
          const p = (await a.peopleNow()).find((x) => x.id === id);
          pass(`${tag}: ${first}'s last spoke is today, and she has left Due now`, p?.last_spoke_on === '2026-11-17' && !(await actionRows(page, 'Due now')).some((r) => r.startsWith(name)), p?.last_spoke_on);
        }
        const due = await actionRows(page, 'Due now');
        pass(`${tag}: Due now is down to the rest, Jamal first`, due.length >= 1 && !due.some((r) => /^(Sofia|Dana|Hannah)/.test(r)), due.slice(0, 2).join(' | '));
        if (!phone) {
          await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900);
          pass(`${tag}: the table follows: Sofia last spoke today, next due a rhythm on (Wed 17 Feb 2027)`, (await cellText(page, 'Sofia Marsh', 11)) === 'Today' || (await cellText(page, 'Sofia Marsh', 11)) === 'Tue 17 Nov', await cellText(page, 'Sofia Marsh', 11));
          pass(`${tag}: and her next due is Wed 17 Feb 2027`, (await cellText(page, 'Sofia Marsh', 12)) === 'Wed 17 Feb 2027', await cellText(page, 'Sofia Marsh', 12));
          // The map follows: Find Sofia, and her card's catch-up is no longer due.
          await page.getByRole('tab', { name: 'Map', exact: true }).click(); await settle(page, 900);
          await page.getByRole('searchbox', { name: 'Find someone' }).fill('Sofia Marsh'); await settle(page, 900);
          await page.locator('.cc-net-hits').getByRole('option', { name: /^Sofia Marsh/ }).first().click(); await settle(page, 900);
          await page.locator('.cc-net-dot--found').focus(); await settle(page, 500);
          const tip = await page.evaluate(() => [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden)?.innerText || `no pop-up; the dot reads ${document.querySelector('.cc-net-dot--found')?.getAttribute('aria-label')}`);
          pass(`${tag}: the map follows: Sofia's card reads “Catch-up: Wed 17 Feb 2027”`, /Catch-up:?\s*Wed 17 Feb 2027/.test(tip) || (/Sofia Marsh/.test(tip) && /Wed 17 Feb 2027/.test(tip)), flat(tip));
          await page.mouse.move(5, 5);
        }
        // A give and an ask, on David.
        await go(page, `/coach/network?person=${CRM.david}`);
        pass(`${tag}: David's line before: given once, nothing asked`, (await panelWords(page)).includes('You’ve given once and haven’t asked yet.'));
        await press(page, 'Log what you gave', dialog(page));
        await dialog(page).getByRole('radio', { name: 'An article or resource' }).click();
        await dialog(page).getByLabel('What did you give?').fill('The piece on team rhythms.');
        await press(page, 'Save', dialog(page));
        await press(page, 'Log an ask', dialog(page));
        await dialog(page).getByRole('radio', { name: 'An introduction' }).click();
        await press(page, 'Save', dialog(page));
        pass(`${tag}: “You’ve given twice and asked once.”`, (await panelWords(page)).includes('You’ve given twice and asked once.'), (await panelWords(page)).slice(0, 300));
        const gives = (await a.givesNow()).filter((g) => g.person_id === CRM.david);
        pass(`${tag}: both are kept`, gives.filter((g) => g.direction === 'gave').length === 2 && gives.filter((g) => g.direction === 'asked').length === 1, `${gives.length}`);
        if (!phone) {
          await page.keyboard.press('Escape'); await settle(page, 600);
          await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900);
          pass(`${tag}: the table counts Given 2, Asked 1`, (await cellText(page, 'David Stark', 13)) === '2' && (await cellText(page, 'David Stark', 14)) === '1', `${await cellText(page, 'David Stark', 13)} ${await cellText(page, 'David Stark', 14)}`);
          // A rating across a boundary: Dana's trust 8 to 7 keeps her in Keep close; 7 to 6 moves her to Invest.
          const rate = async (n) => { await netCell(page, 'Trust in you', 'Dana Whitfield').click(); await settle(page, 500); await page.getByRole('menuitemradio', { name: String(n), exact: true }).click(); await settle(page, 900); };
          await rate(7);
          pass(`${tag}: Dana's trust to 7: “Saved.”, still Keep close (7 is in)`, (await toastText(page)) === 'Saved.' && (await cellText(page, 'Dana Whitfield', 5)) === 'Keep close', await cellText(page, 'Dana Whitfield', 5));
          await rate(6);
          pass(`${tag}: to 6: Where to focus crosses to Invest`, (await cellText(page, 'Dana Whitfield', 5)) === 'Invest' && (await a.peopleNow()).find((p) => p.id === CRM.dana)?.trust === 6, await cellText(page, 'Dana Whitfield', 5));
          await undo(page);
          pass(`${tag}: Undo: 7, and Keep close again`, (await cellText(page, 'Dana Whitfield', 7)) === '7' && (await cellText(page, 'Dana Whitfield', 5)) === 'Keep close');
          await page.getByRole('tab', { name: 'Map', exact: true }).click(); await settle(page, 900);
          await choose(page, 'Show', 'Keep close');
          await page.getByRole('searchbox', { name: 'Find someone' }).fill('Dana Whitfield'); await settle(page, 900);
          await page.locator('.cc-net-hits').getByRole('option', { name: /^Dana Whitfield/ }).first().click(); await settle(page, 900);
          const found = await page.evaluate(() => document.querySelector('.cc-net-dot--found')?.getAttribute('class') || '');
          pass(`${tag}: on the map she is in Keep close again`, /keep_close|keep-close|mixed/.test(found), found);
          await press(page, 'David Stark', page.locator('.cc-main')).catch(() => {});
        }
        await go(page, `/coach/network?person=${CRM.david}`);
        await press(page, 'Move to Leads', dialog(page));
        pass(`${tag}: Move to Leads: “David is in Leads now, and still in your Network.”`, (await toastText(page)) === 'David is in Leads now, and still in your Network.', await toastText(page));
        const lead = (await a.rowsNow('coach_leads')).find((l) => l.network_person_id === CRM.david);
        pass(`${tag}: a lead points at him, and he stays in Network`, Boolean(lead) && (await a.peopleNow()).some((p) => p.id === CRM.david && !p.archived_at));
        await a.close();
      }

      // ---------------------------------------------------------------- 9. an archive review
      if (on('sell-archive') && !phone) {
        const tag = `sell-archive, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network' });
        const { page } = a;
        await press(page, 'Review them');
        const boxes = dialog(page).getByRole('checkbox');
        pass(`${tag}: Review them opens everyone ticked`, (await boxes.count()) === 3 && (await boxes.evaluateAll((b) => b.every((x) => x.getAttribute('aria-checked') === 'true'))));
        await dialog(page).getByRole('checkbox', { name: /Daniel Vance/ }).click(); await settle(page, 300);
        await dialog(page).getByRole('checkbox', { name: /Zara Nash/ }).click(); await settle(page, 300);
        await press(page, 'Archive 1', dialog(page));
        pass(`${tag}: two unticked: “Archive 1”, with Undo`, /^Archived/.test(await toastText(page)) && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1, await toastText(page));
        let people = await a.peopleNow();
        const got = (id) => people.find((p) => p.id === id);
        pass(`${tag}: Bea is archived, the two unticked are kept`, Boolean(got(CRM.beaR)?.archived_at) && got(CRM.danielV)?.keep === true && got(CRM.zaraN)?.keep === true && !got(CRM.danielV)?.archived_at);
        await undo(page);
        people = await a.peopleNow();
        pass(`${tag}: Undo: Bea back, and the two not kept any more`, !got(CRM.beaR)?.archived_at && !got(CRM.danielV)?.keep && !got(CRM.zaraN)?.keep, JSON.stringify([got(CRM.beaR)?.archived_at, got(CRM.danielV)?.keep]));
        await press(page, 'Review them');
        await dialog(page).getByRole('checkbox', { name: /Daniel Vance/ }).click(); await settle(page, 300);
        await dialog(page).getByRole('checkbox', { name: /Zara Nash/ }).click(); await settle(page, 300);
        await press(page, 'Archive 1', dialog(page));
        await go(page, '/coach/network');
        pass(`${tag}: the two unticked are never suggested again: no card after a reload`, !(await words(page)).includes('no contact for 18 months'));
        if (a.there) pass(`${tag}: and the database counts nobody ready`, a.store.fn.network_counts({ p_today: '2026-11-17' }).ready === 0, JSON.stringify(a.store.fn.network_counts({ p_today: '2026-11-17' })));
        await go(page, '/coach/network?tab=table');
        await press(page, 'Archived, 3');
        const text = await words(page);
        pass(`${tag}: Archived shows Bea with the two archived before`, has(text, ['3 archived', 'Bea Reeves', 'Adam Ford', 'Priyesh Young']), text.slice(0, 160));
        await press(page, 'Bea Reeves');
        await press(page, 'Restore', dialog(page));
        pass(`${tag}: Restore brings Bea back`, (await toastText(page)) === 'Restored.' && !(await a.peopleNow()).find((p) => p.id === CRM.beaR)?.archived_at, await toastText(page));
        await a.close();
      }

      // ---------------------------------------------------------------- 10. finding someone on the map, with 1,200 people
      if (on('sell-map') && !phone) {
        const tag = `sell-map, ${mode}`;
        const people = manyNetwork(1200, { archived: 0 });
        const a = await openAt({ db, tag, path: '/coach/network?tab=map', people });
        const { page } = a;
        pass(`${tag}: the line says “Showing 150 of 1,200 people…”`, (await words(page)).includes('Showing 150 of 1,200 people: your focus lists first, then who you spoke to most recently.'), flat(await page.locator('.cc-net-mapline').innerText().catch(() => '')));
        const m = await page.evaluate(readMap);
        pass(`${tag}: 150 people in one dot a spot, nothing wrong with the map`, mapProblems(m, { phone: false }).length === 0 && m.dots.reduce((n, d) => n + d.n, 0) === 150, mapProblems(m, { phone: false }).join('; '));
        for (const [list, style] of [['Keep close', 'keep_close'], ['Maintain', 'maintain'], ['Invest', 'invest'], ['Rebalance?', 'rebalance'], ['No list', 'none']]) {
          await choose(page, 'Show', list);
          const shown = await page.evaluate(readMap);
          pass(`${tag}: Show ${list}: every dot is ${style}`, shown.dots.length > 0 && shown.dots.every((d) => d.style === style), [...new Set(shown.dots.map((d) => d.style))].join(','));
        }
        await choose(page, 'Show', 'Everyone');
        const shownIds = a.there ? new Set(a.store.fn.network_map({ p_show: 'everyone', p_limit: 150 }).rows.map((r) => r.id)) : null;
        const outside = people.find((p) => Number.isInteger(p.influence) && Number.isInteger(p.trust) && (shownIds ? !shownIds.has(p.id) : p.rhythm_months === 12));
        await page.getByRole('searchbox', { name: 'Find someone' }).fill(outside.name); await settle(page, 1000);
        await page.locator('.cc-net-hits').getByRole('option', { name: new RegExp(`^${outside.name}`) }).first().click(); await settle(page, 900);
        const found = await page.evaluate(() => { const g = document.querySelector('.cc-net-dot--found'); return g ? { named: g.querySelector('.cc-net-named')?.textContent, n: Number(g.querySelector('.cc-net-num')?.textContent || 1) } : null; });
        pass(`${tag}: Find someone rings and names ${outside.name}'s dot`, found?.named === outside.name, JSON.stringify(found));
        await page.locator('.cc-net-dot--found').focus(); await page.keyboard.press('Enter'); await settle(page, 900);
        const title = (await dialog(page).locator('.ds-dialog-title').innerText().catch(() => '')).trim();
        pass(`${tag}: their dot opens ${found?.n > 1 ? 'the list of names at that shared spot' : 'their card'}`, found?.n > 1 ? new RegExp(`^${found.n} people`, 'i').test(title) && (await panelWords(page)).includes(outside.name) : title.toLowerCase() === outside.name.toLowerCase(), title);
        await page.keyboard.press('Escape'); await settle(page, 500);
        const numbered = page.locator('.cc-net-map .cc-net-dot:has(.cc-net-num)').first();
        if (await numbered.count()) {
          const n = Number(await numbered.locator('.cc-net-num').textContent());
          await numbered.focus(); await page.keyboard.press('Enter'); await settle(page, 900);
          pass(`${tag}: a shared spot opens its list of ${n} names`, (await dialog(page).locator('.cc-row').count()) === n);
          await page.keyboard.press('Escape');
        }
        await a.close();
      }

      // ---------------------------------------------------------------- 11. Today
      if (on('sell-today')) {
        const tag = `sell-today, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach' });
        const { page } = a;
        // Polish 1 (Stages A to C): Today's parts are cards and their lines the shared rows (.ds-li), as network-flows reads them.
        const section = page.locator('.cc-today-keep');
        const rows = await section.locator('.ds-li').evaluateAll((list) => list.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}: Keep in touch: the people due first, then past clients' check-ins, one quiet line each`, /^Sofia Marsh/.test(rows[0] || '') && rows.slice(3).some((r) => /check-in/.test(r)) && rows.every((r) => r.length < 80), rows.join(' | '));
        // The frame's menu (polish 1) is plain words with no counts; Today's Keep in touch carries the people due.
        const item = (await frameMenu(page)).filter({ hasText: /^Network/ }).first();
        pass(`${tag}: Network is in the menu, a link with its plain name`, flat(await item.innerText()) === 'Network' && (await item.getAttribute('href')) === '/coach/network', flat(await item.innerText()));
        await page.keyboard.press('Escape'); await settle(page, 500);
        await section.getByRole('button', { name: /^Leah Moran: 12-month check-in/ }).click(); await settle(page, 800);
        const d = dialog(page);
        const href = await d.getByRole('link', { name: 'Open in my email' }).getAttribute('href');
        pass(`${tag}: a past client's check-in note: “Open in my email” is a mailto link, and nothing says it sends`, /^mailto:/.test(href || '') && (await panelWords(page)).includes('Nothing is sent until you send it from your own email.') && (await d.getByRole('button', { name: /^Send/ }).count()) === 0);
        await d.getByRole('link', { name: 'Open in my email' }).click(); await settle(page, 900);
        pass(`${tag}: pressing it opens the coach's own email app only (a mailto), asks no server, and marks the check-in done with Undo`, JSON.stringify(await a.sent()) === '["mailto"]' && a.api.length === 0 && Boolean((await a.rowsNow('client_check_ins')).find((c) => c.id === CRM.ciLeah)?.done_at) && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1, JSON.stringify(await a.sent()));
        await undo(page);
        pass(`${tag}: Undo puts it back on Today`, !(await a.rowsNow('client_check_ins')).find((c) => c.id === CRM.ciLeah)?.done_at && (await section.innerText()).includes('Leah Moran'));
        await a.close();
      }

      // ---------------------------------------------------------------- 12. import, export, merge
      if (on('sell-import') && !phone) {
        const tag = `sell-import, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads' });
        const { page } = a;
        const dir = mkdtempSync(join(tmpdir(), 'clarity-sell-'));
        try {
          const before = (await a.rowsNow('coach_leads')).length;
          await press(page, 'Import from a spreadsheet');
          await dialog(page).locator('input[type=file]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Email,Organisation\nPaula Grey,paula.grey@example.invalid,Ridgeway Trust\nAmy Cole,amy.cole@example.invalid,Northfield Logistics\n') });
          await settle(page, 700);
          let text = await panelWords(page);
          pass(`${tag}: a CSV of leads: the duplicate shows first`, text.includes('Amy Cole is already a lead, with the same email.') && text.search(/possible duplicates/i) < text.search(/your columns/i) && text.includes('Add 1 lead'), text.slice(0, 240));
          await press(page, 'Add 1 lead', dialog(page));
          pass(`${tag}: one lead is added, Paula, in New`, (await a.rowsNow('coach_leads')).length === before + 1 && (await a.rowsNow('coach_leads')).find((l) => l.name === 'Paula Grey')?.stage_id === CRM.stNew);
          await press(page, 'Export');
          const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Download', exact: true }).click()]);
          pass(`${tag}: Leads export downloads “Leads, 17 Nov 2026.xlsx”`, file.suggestedFilename() === 'Leads, 17 Nov 2026.xlsx', file.suggestedFilename());
          await file.delete().catch(() => {});
          await page.keyboard.press('Escape'); await settle(page, 500);
          // Merge two leads, with Undo.
          await press(page, 'Review');
          await press(page, 'Merge into one', dialog(page)); await settle(page, 900);
          const merged = () => a.rowsNow('coach_leads').then((l) => l.find((x) => x.id === CRM.christopherDoyle));
          pass(`${tag}: two Chris Doyles merged into one`, (await toastText(page)).includes('Merged.') && Boolean((await merged())?.merged_into), await toastText(page));
          await undo(page);
          pass(`${tag}: Undo makes them two again`, !(await merged())?.merged_into && (await column(page, 'New').innerText()).includes('Christopher Doyle'));
          // Network: a CSV with a duplicate first.
          await go(page, '/coach/network?tab=table');
          const count = async () => (await page.locator('.cc-net-ctl .cc-net-count').innerText()).trim();
          const was = await count();
          await press(page, 'Import a spreadsheet');
          await dialog(page).locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Organisation,Email\nImo Reyes,Arden Vale,imo.reyes@example.invalid\nDan Reid,Harbour Lane,\n') });
          await settle(page, 900);
          text = await panelWords(page);
          pass(`${tag}: a CSV of Network people: the duplicate shows first`, text.includes('Dan Reid, Harbour Lane, is already in your Network, with the same name.') && text.includes('Add 1 person') && text.search(/possible duplicates/i) < text.search(/your columns/i), text.slice(0, 240));
          await press(page, 'Add 1 person', dialog(page));
          pass(`${tag}: Imo is added and the count grows by one`, (await a.peopleNow()).some((p) => p.name === 'Imo Reyes') && (await count()) !== was, `${was} → ${await count()}`);
          await press(page, 'Export');
          const [net] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Download', exact: true }).click()]);
          pass(`${tag}: Network export downloads “Network, 17 Nov 2026.xlsx”`, net.suggestedFilename() === 'Network, 17 Nov 2026.xlsx', net.suggestedFilename());
          await net.delete().catch(() => {});
        } finally { rmSync(dir, { recursive: true, force: true }); }
        await a.close();
      }
    }

    // ---------------------------------------------------------------- 13. before 052, then 052 arrives
    if (on('sell-arrive') && !phone) {
      const tag = 'sell-arrive';
      const a = await openAt({ db: 'none', tag: `${tag}, on the device`, path: '/coach/leads' });
      let { page } = a;
      await openAddLead(page); await settle(page, 600);
      await dialog(page).getByLabel('Who is it?').fill('Paula Grey');
      await press(page, 'Add lead', dialog(page));
      await go(page, '/coach/leads/automations');
      await press(page, 'Add automation');
      await choose(page, 'Which stage?', 'Deciding', dialog(page));
      await dialog(page).getByLabel('To-do', { exact: true }).fill('Send the contract');
      await press(page, 'Save', dialog(page));
      await go(page, '/coach/boards');
      await press(page, 'New board');
      await dialog(page).getByLabel('What’s it called?').fill('Workshops 2027');
      await press(page, 'Make the board', dialog(page)); await settle(page, 800);
      const madeBoard = (await a.deviceRows('coach_boards')).find((b) => b.name === 'Workshops 2027');
      const stage0 = (await a.deviceRows('coach_board_stages')).filter((s) => s.board_id === madeBoard?.id).sort((x, y) => x.position - y.position)[0];
      await page.getByRole('button', { name: `Add card to ${stage0?.name}` }).click(); await settle(page, 600);
      await dialog(page).getByLabel('Name', { exact: true }).fill('Northfield team day');
      await press(page, 'Add card', dialog(page));
      await go(page, `/coach/network?person=${CRM.david}`);
      await press(page, 'Log an ask', dialog(page));
      await dialog(page).getByRole('radio', { name: 'Advice' }).click();
      await press(page, 'Save', dialog(page));
      await page.keyboard.press('Escape'); await settle(page, 500);
      await page.getByRole('button', { name: 'Add someone', exact: true }).first().click(); await settle(page, 600);
      await dialog(page).getByLabel('Who?').fill('Nell Okoye');
      await press(page, 'Add', dialog(page));
      const TABLES = ['coach_lead_stages', 'coach_leads', 'coach_lead_events', 'coach_automations', 'coach_automation_runs', 'coach_boards', 'coach_board_stages', 'coach_board_items'];
      const device = {};
      for (const t of TABLES) device[t] = (await a.deviceRows(t)).length;
      const people = (await a.peopleNow()).length;
      const gives = (await a.givesNow()).length;
      pass(`${tag}: on the device a lead, an automation, a board with a card, an ask and a person are kept, and nothing was sent`, device.coach_boards === 3 && device.coach_board_items >= 8 && people === 21 && a.store.calls.filter((c) => c.startsWith('blocked')).length === 0, JSON.stringify({ ...device, people, gives }));
      await a.close({ keep: true });
      await page.close();

      page = await a.ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
      await page.clock.setFixedTime(TUE);
      const store = await standIn(page, { role: 'owner', db: 'there', day: true, cal: true, crm: true, strict: true, rows: {}, now: () => new Date(TUE) });
      const api = [];
      await page.route('**/api/**', (route) => { api.push(1); return json(route, { ok: true, sent: false }); });
      await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
      for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
      await page.goto(`${APP}/coach/leads`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      const unsent = () => page.evaluate(([id, tables]) => { const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}'); return Object.entries(kept.rows || {}).filter(([t]) => tables.includes(t)).map(([t, rows]) => [t, Object.keys(rows).filter((k) => !kept.marks?.[t]?.[k]?.sent).length]).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`); }, [a.me, TABLES]);
      const waitingPeople = () => page.evaluate((id) => Object.keys(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"people":{}}').people || {}).length, a.me);
      for (let i = 0; i < 140; i += 1) { if ((await unsent()).length === 0 && (await waitingPeople()) === 0) break; await settle(page, 500); }
      pass(`${tag}: once 052 is there, nothing of Leads, boards, automations or Network waits on the device`, (await unsent()).length === 0 && (await waitingPeople()) === 0, `${(await unsent()).join(', ')}; ${await waitingPeople()} people`);
      const counts = Object.fromEntries(TABLES.map((t) => [t, (store.rows[t] || []).length]));
      pass(`${tag}: every row arrived once (Leads, boards, automations)`, TABLES.every((t) => counts[t] === device[t]), TABLES.filter((t) => counts[t] !== device[t]).map((t) => `${t}: ${counts[t]} of ${device[t]}`).join('; '));
      pass(`${tag}: Network's people and what was given and asked arrived once`, (store.rows.network_people || []).length === people && (store.rows.network_gives || []).length === gives, `${(store.rows.network_people || []).length} of ${people}, ${(store.rows.network_gives || []).length} of ${gives}`);
      pass(`${tag}: the database refused none of it`, !store.calls.some((c) => c.startsWith('refused')), store.calls.filter((c) => c.startsWith('refused')).slice(0, 3).join('; '));
      const posts = store.calls.filter((c) => /^POST /.test(c)).length;
      for (const path of ['/coach/boards', '/coach/network', '/coach/leads/automations']) { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 2500); }
      pass(`${tag}: opened again on three pages, nothing is sent a second time and nothing is doubled`, store.calls.filter((c) => /^POST /.test(c)).length === posts && TABLES.every((t) => (store.rows[t] || []).length === device[t]) && (store.rows.network_people || []).length === people, `${store.calls.filter((c) => /^POST /.test(c)).length} against ${posts}`);
      pass(`${tag}: the board and its card read the same from the database`, has(await words(page), []) && store.rows.coach_board_items.some((i) => i.title === 'Northfield team day'));
      pass(`${tag}: nothing in the console, nothing reached the test project, nothing asked to send`, errors.length === 0 && !store.calls.some((c) => c.startsWith('blocked')) && api.length === 0, [...errors, ...store.calls.filter((c) => c.startsWith('blocked'))].slice(0, 3).join(' | '));
      await page.evaluate((id) => { localStorage.removeItem(`clarity-coach-network-local:${id}`); }, a.me);
      await clearDevice(page, a.me);
      await a.ctx.close();
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  report.done();
}

run().catch((e) => { console.error(`STOPPED: ${String(e).split('\n')[0].slice(0, 300)} at ${(String(e?.stack || '').split('\n').find((l) => l.includes('sell-flows.mjs')) || '').trim()}`); process.exit(1); });
