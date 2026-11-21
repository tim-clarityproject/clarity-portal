// Leads, walked (Phase 6a run 4, step 2) as the owner on a laptop, in both
// database modes (device only: 049 to 052 "not yet"; and 049 to 052 answered
// by the stand-ins in shared.mjs and crm-standin.mjs), then as an associate,
// who has no Leads at all. Nothing reaches the test project and nothing is
// ever sent: every write is the stand-in's, or is stopped and listed.
//
//   lead-pipeline   the board as M11 draws it; Add lead; a card moved with the arrow keys, with Undo; a stage chosen and a
//                   next step typed over in the table; an automation's to-do after a stage move (claimed once)
//   lead-page       a lead's page: Log a call with what you learned, Add note, the booking on the timeline, an email opened
//   lead-won        Mark as won makes a client with the timeline carried over and an agreement draft; Undo takes it back
//   lead-cold       Mark as cold, Cold leads, Bring back
//   lead-merge      "may be in here twice": Merge into one with Undo, and "They’re different people"
//   lead-waiting    someone emailed who isn't in the portal: Add as a lead, with the email on their timeline
//   lead-import     a spreadsheet with odd columns: columns matched, duplicates first; an Excel file is refused calmly
//   lead-export     Export downloads a spreadsheet
//   lead-stages     Edit stages: add, rename, move, remove with its leads moved first, with Undo
//   lead-many       300 leads: the board, the list and the table open and fold
//   lead-associate  an associate is sent to their own Today, with no Leads in the menu or in search
//   lead-arrives    kept on the device before 052, then 049 to 052 arrive: what waited moves across once
//
//   PARTS=lead-pipeline,…   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, seedNetworkDevice, settle, standIn, toastText } from './shared.mjs';
import { CAL, CRM, ID, manyLeads, networkDeviceSeed, seedClock, seedWithCrm } from './seed.mjs';
import { xlsxBytes } from '../../src/lib/coach/xlsx.js';

export const LEAD_PARTS = ['lead-pipeline', 'lead-page', 'lead-won', 'lead-cold', 'lead-merge', 'lead-waiting', 'lead-import', 'lead-export', 'lead-stages', 'lead-many', 'lead-associate', 'lead-arrives'];
const TUE = new Date(2026, 10, 17, 9, 0);
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const press = async (page, name, scope = page) => { await scope.getByRole('button', { name, exact: true }).first().click(); await settle(page, 600); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const words = (page) => page.evaluate(() => (document.querySelector('.cc-main')?.innerText || '').replace(/ /g, ' '));
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const choose = async (page, label, option, scope = page) => { await scope.getByLabel(label, { exact: true }).first().click(); await settle(page, 300); await page.getByRole('option', { name: option, exact: true }).first().click(); await settle(page, 400); };
const column = (page, name) => page.locator('.cc-lboard .cc-board-col', { has: page.locator('.cc-board-head', { hasText: name }) }).first();
// Rows only the database ever makes, and another coach's own, are never on a device before the tables are there.
const forDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, coach_bookings: _b, coach_email_addresses: _e, coach_poll_votes: _v, coach_cal_reminder_sends: _r, ...own } = rows; return own; };

async function run() {
  const report = makeReport('Leads, the flows');
  const { pass } = report;
  const parts = (process.env.PARTS || LEAD_PARTS.join(',')).split(',');
  const has = (p) => parts.includes(p);
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  /** A page signed in and standing in, its clock on M11's Tuesday, with the seed in the stand-in database or on the device. */
  async function openAt({ role = 'owner', db, path = '/coach/leads', tag, rows = null, ctx: kept = null, device = true, network = false }) {
    const there = db === 'there';
    const ctx = kept || await coachContext(browser, { size: 1440, theme: there ? 'light' : 'dark' });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 1200 });
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
    const seed = rows || seedWithCrm({ accounts: true, network: false });
    const store = await standIn(page, { role, db, day: there, cal: there, crm: there, strict: there, rows: there ? seed : {}, now: () => new Date(TUE) });
    await page.route('**/api/**', (route) => json(route, { ok: true, sent: false }));
    await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
    for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
    if (!there) await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    const me = await accountId(page);
    if (device) {
      await clearDevice(page, me);
      if (!there) await seedDevice(page, me, forDevice(seed));
      // Network's people as the device keeps them before 052 (a lead's Referred by points at one).
      if (!there && network) await seedNetworkDevice(page, me, networkDeviceSeed());
    }
    await go(page, path);
    const deviceRows = (table) => page.evaluate(([id, t]) => {
      const kept2 = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || localStorage.getItem(`clarity-cache:${id}:coach`) || '{}');
      return Object.values(kept2.rows?.[t] || {});
    }, [me, table]);
    return {
      page, ctx, store, me, there, errors,
      /** The rows as they are kept now: in the stand-in database, or on the device. */
      rowsNow: async (table) => (there ? store.rows[table] || [] : deviceRows(table)),
      deviceRows,
      async close({ keep = false } = {}) {
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
        pass(`${tag}: nothing was written to the test project`, reached.length === 0 && blocked.length === 0, [...new Set([...reached, ...blocked])].slice(0, 4).join('; '));
        if (!keep) { await clearDevice(page, me); await ctx.close(); } else await page.close();
      },
    };
  }

  try {
    for (const db of dbs) {
      const mode = db === 'there' ? '049 to 052 there' : 'on the device';

      if (has('lead-pipeline')) {
        const tag = `lead-pipeline, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        const text = await words(page);
        pass(`${tag}: the board is M11's: five stages with their totals`, ['New', 'Call booked', 'Proposal sent', 'Deciding', 'Won', '£31,500', '£15,750 likely', '£5,250 likely', 'No value yet'].every((w) => text.includes(w)));
        pass(`${tag}: a card says how ready the lead is in words, and when it has gone quiet`, ['Still to find out: when', 'Ready to decide', 'Quiet for 19 days', 'Opened 3 times', 'Opened once'].every((w) => text.includes(w)));
        pass(`${tag}: no score is shown as a number anywhere on the board`, !/\b\d{1,3}\s?%|\b\d\/\d\b|score/i.test(text), (/\b\d{1,3}\s?%|\b\d\/\d\b|score/i.exec(text) || [''])[0]);
        pass(`${tag}: the two quiet lines are there (someone waiting, a possible duplicate)`, text.includes('You emailed Sarah Kent, who isn’t in the portal yet.') && text.includes('Chris Doyle may be in here twice.'));
        // Add lead.
        await page.locator('.cc-lboard .ds-addrow', { hasText: 'Add lead' }).click(); await settle(page, 600);
        await press(page, 'Add lead', dialog(page));
        pass(`${tag}: Add lead pressed with nothing typed says what's missing (the button is never greyed out)`, (await dialog(page).innerText()).includes('Type their name to carry on.'));
        await dialog(page).getByLabel('Who is it?').fill('Hana Okafor');
        await dialog(page).getByLabel('Which organisation?').fill('Kestrel Group');
        await dialog(page).getByLabel('Who referred them?').fill('Dan Reid');
        await press(page, 'Add lead', dialog(page));
        pass(`${tag}: the new lead is in New, said with “Added to New.”`, (await toastText(page)).includes('Added to New.') && (await column(page, 'New').innerText()).includes('Hana Okafor'), await toastText(page));
        const hana = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Hana Okafor');
        pass(`${tag}: it is kept with its stage, its organisation joined to Kestrel, and who referred them`, hana?.stage_id === CRM.stNew && hana.organisation_id === ID.kestrel && hana.referred_by === 'Dan Reid' && hana.source === 'referral', JSON.stringify([hana?.stage_id === CRM.stNew, hana?.organisation_id === ID.kestrel, hana?.referred_by, hana?.source]));
        pass(`${tag}: “Referred by Dan Reid” is on the new lead's timeline`, (await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === hana?.id && e.kind === 'referred' && e.title === 'Referred by Dan Reid'));
        // A card moved with the arrow keys, then Undo.
        const card = page.locator('[data-card]', { hasText: 'Elena Ruiz' });
        await card.focus(); await page.keyboard.press('ArrowRight'); await settle(page, 900);
        pass(`${tag}: a focused card moves a stage to the right with the arrow key, said with Undo`, (await toastText(page)).startsWith('Moved to Call booked.') && (await column(page, 'Call booked').innerText()).includes('Elena Ruiz'), await toastText(page));
        pass(`${tag}: the moved card keeps the keyboard's focus`, await page.evaluate(() => document.activeElement?.textContent?.includes('Elena Ruiz') || false));
        pass(`${tag}: the move is a line on the lead's timeline`, (await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === CRM.elena && e.kind === 'stage' && e.title === 'Moved to Call booked'));
        await undo(page);
        pass(`${tag}: Undo puts the card back in New, and takes the line off the timeline`, (await column(page, 'New').innerText()).includes('Elena Ruiz') && !(await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === CRM.elena && e.kind === 'stage'));
        // The table: a stage chosen from the stage list, a next step typed over.
        await press(page, 'Table');
        pass(`${tag}: the table has one Value column, with the coach's own fields beside it`, JSON.stringify(await page.locator('.cc-lead-table thead th').allInnerTexts()) === JSON.stringify(['Name', 'Stage', 'Next step', 'Last contact', 'Sector', 'Value', 'Renewal date', '']), JSON.stringify(await page.locator('.cc-lead-table thead th').allInnerTexts()));
        const row = (name) => page.locator('.cc-lead-table tbody tr', { hasText: name }).first();
        await row('Elena Ruiz').getByRole('button', { name: /^Stage, / }).click(); await settle(page, 400);
        await page.getByRole('menuitemcheckbox', { name: 'Proposal sent' }).click(); await settle(page, 1200);
        const said = await toastText(page);
        pass(`${tag}: a stage chosen from the stage list moves the lead, and the automation for that stage adds its to-do`, said.includes('Moved to Proposal sent.') && said.includes('An automation added a to-do.'), said);
        const todos = (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === CRM.elena && t.automation_id === CRM.a1);
        pass(`${tag}: the to-do is “Follow up on the proposal”, in 3 days, on the coach's own list`, todos.length === 1 && todos[0].title === 'Follow up on the proposal' && todos[0].planned_on === '2026-11-20', JSON.stringify(todos.map((t) => [t.title, t.planned_on])));
        const runs = (await a.rowsNow('coach_automation_runs')).filter((r) => r.lead_id === CRM.elena);
        pass(`${tag}: the run was claimed once`, runs.length === 1, `${runs.length}`);
        await row('Elena Ruiz').getByRole('button', { name: /^Next step, / }).click(); await settle(page, 300);
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Send the outline'); await page.keyboard.press('Enter'); await settle(page, 800);
        pass(`${tag}: a next step typed over is saved`, (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.elena)?.next_step === 'Send the outline' && (await toastText(page)).includes('Saved'));
        // Sort and Show only from a heading.
        await press(page, 'Value'); await page.getByRole('menuitemcheckbox', { name: 'Highest first' }).click(); await settle(page, 500);
        pass(`${tag}: a heading sorts: Value, highest first`, (await page.locator('.cc-lead-table tbody tr').first().innerText()).includes('Chris Lowe'));
        await press(page, 'Last contact'); await page.getByRole('menuitemcheckbox', { name: 'Quiet for 14 days or more' }).click(); await settle(page, 500); await page.keyboard.press('Escape'); await settle(page, 300);
        pass(`${tag}: a heading narrows: only quiet leads, with the count and Clear`, (await page.locator('.cc-lead-table tbody tr').count()) === 1 && (await words(page)).includes('1 of 11 leads.'), `${await page.locator('.cc-lead-table tbody tr').count()} rows`);
        await press(page, 'Clear');
        await a.close();
      }

      if (has('lead-page')) {
        const tag = `lead-page, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/leads/${CAL.leadRuth}` });
        const { page } = a;
        let text = await words(page);
        pass(`${tag}: Ruth's page: early days in words, her booking and her emails on one timeline`, ['Early days. Still to find out: the outcome, what’s in the way, who decides, who funds it and when.', 'Booked a Chemistry Call', 'First contact', 'Ruth replied: Can we start in January?', 'Where they came from', 'Chemistry Call page'].every((w) => text.includes(w)));
        pass(`${tag}: Email and WhatsApp open the coach's own apps, and nothing offers to send`, (await page.locator('.cc-links a[href^="mailto:"]').count()) === 1 && (await page.locator('.cc-links a[href^="https://wa.me/447700900213"]').count()) === 1 && !/\bSend\b/.test(text));
        await press(page, 'Log a call');
        await press(page, 'Save the call', dialog(page));
        pass(`${tag}: Save the call with nothing typed says what's missing`, (await dialog(page).innerText()).includes('Type how it went, or what happens next, to carry on.'));
        await dialog(page).getByLabel('How did it go?').fill('Wants her staff aligned before the season review.');
        await dialog(page).getByLabel('What happens next?').fill('Send the proposal');
        await dialog(page).getByLabel('What do they want to achieve?').fill('A staff team that plans together.');
        await dialog(page).getByLabel('Who decides?').fill('Ruth, with the chief executive.');
        await press(page, 'Save the call', dialog(page));
        pass(`${tag}: the call is logged with its follow-up on the coach's to-dos for Fri 20 Nov`, (await toastText(page)).includes('Logged. The follow-up is on your to-dos for Fri 20 Nov.'), await toastText(page));
        text = await words(page);
        pass(`${tag}: the page shows the call, the new next step, and what is now known`, ['Chemistry Call', 'Wants her staff aligned before the season review.', 'Send the proposal', 'A staff team that plans together.', 'Early days. Still to find out: what’s in the way, who funds it and when.'].every((w) => text.includes(w)));
        const ruth = (await a.rowsNow('coach_leads')).find((l) => l.id === CAL.leadRuth);
        pass(`${tag}: the lead keeps the next step, its day, and today as the last contact`, ruth?.next_step === 'Send the proposal' && ruth.next_step_on === '2026-11-20' && ruth.last_contact_on === '2026-11-17', JSON.stringify([ruth?.next_step, ruth?.next_step_on, ruth?.last_contact_on]));
        pass(`${tag}: the follow-up is one of the coach's own to-dos, pointing at the lead`, (await a.rowsNow('coach_todos')).filter((t) => t.lead_id === CAL.leadRuth && t.title === 'Send the proposal' && t.planned_on === '2026-11-20').length === 1);
        await press(page, 'Add note');
        await dialog(page).getByLabel('What do you want to remember about Ruth?').fill('Prefers a call to email.');
        await press(page, 'Add my note', dialog(page));
        pass(`${tag}: a note is on the timeline`, (await words(page)).includes('Prefers a call to email.'));
        await page.getByRole('button', { name: /Ruth replied/ }).click(); await settle(page, 700);
        const mail = await dialog(page).innerText();
        pass(`${tag}: an email opens with who, when and its words, and can only be hidden or opened: nothing replies`, mail.includes('Ruth Adeyemi') && mail.includes('Today, 08:40') && mail.includes('can we start in January?') && mail.includes('Hide this thread') && !/Reply|Send/.test(mail), mail.slice(0, 160));
        await press(page, 'Hide this thread', dialog(page));
        pass(`${tag}: a hidden thread leaves the timeline, with Undo`, !(await words(page)).includes('Ruth replied') && (await toastText(page)).includes('Hidden from this timeline.'));
        await undo(page);
        pass(`${tag}: Undo shows it again`, (await words(page)).includes('Ruth replied: Can we start in January?'));
        // A lead a booking made, with nothing written on its timeline yet (before 052), still shows its booking.
        await go(page, `/coach/leads/${CAL.leadNadia}`);
        pass(`${tag}: a booking-made lead shows its booking on the timeline`, (await words(page)).includes('Booked a Connection Call') && (await words(page)).includes('From your Connection Call page.'));
        await a.close();
      }

      if (has('lead-won')) {
        const tag = `lead-won, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/leads/${CRM.amy}` });
        const { page } = a;
        const before = (await a.rowsNow('client_profiles')).length;
        await press(page, 'Mark as won');
        pass(`${tag}: Mark as won says a client was made, with an agreement ready to fill in`, (await toastText(page)).startsWith('Won. Amy is now a client, with an agreement ready to fill in.'), await toastText(page));
        const amy = (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy);
        const client = (await a.rowsNow('client_profiles')).find((p) => p.id === amy?.won_profile_id);
        pass(`${tag}: the lead is in Won and one client was made from it, with a mobile the client's row takes`, amy?.stage_id === CRM.stWon && Boolean(amy.won_at) && (await a.rowsNow('client_profiles')).length === before + 1 && client?.name === 'Amy Cole' && client.mobile === '+447700900461' && client.organisation_id === ID.northfield, JSON.stringify([client?.name, client?.mobile]));
        const wonLine = (await a.rowsNow('coach_lead_events')).find((e) => e.lead_id === CRM.amy && e.kind === 'won');
        const deal = (await a.rowsNow('organisation_deals')).find((d) => d.lead_id === CRM.amy);
        pass(`${tag}: an agreement draft is left for Finances: on the Won line, and among Northfield's deals`, wonLine?.data?.agreement_draft?.status === 'draft' && wonLine.data.agreement_draft.value === 13500 && deal?.status === 'draft' && deal.kind === 'agreement', JSON.stringify([wonLine?.data?.agreement_draft?.status, deal?.status]));
        pass(`${tag}: the lead's page says they are a client now, with no Mark as won`, (await words(page)).includes('Amy is a client now') && (await page.getByRole('button', { name: 'Mark as won' }).count()) === 0);
        await press(page, 'Open the client’s page'); await settle(page, 900);
        await press(page, 'Everything');
        const all = await words(page);
        pass(`${tag}: the client's page carries the lead's timeline over`, ['Won', 'Chemistry Call, 30 minutes', 'Referred by Hannah Wells', 'Leadership Accelerator. Opened 3 times.'].every((w) => all.includes(w)), all.slice(0, 200));
        // Undo, on another lead.
        await go(page, `/coach/leads/${CRM.tom}`);
        await press(page, 'Mark as won'); await settle(page, 500);
        const made = (await a.rowsNow('client_profiles')).length;
        await undo(page);
        const tom = (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.tom);
        pass(`${tag}: Undo takes the client away and puts the lead back in Deciding`, (await a.rowsNow('client_profiles')).length === made - 1 && tom?.stage_id === CRM.stDeciding && !tom.won_at && !(await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === CRM.tom && e.kind === 'won'));
        await a.close();
      }

      if (has('lead-cold')) {
        const tag = `lead-cold, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/leads/${CRM.chrisLowe}` });
        const { page } = a;
        await press(page, 'Mark as cold');
        await choose(page, 'What happened?', 'No budget this year', dialog(page));
        await press(page, 'Mark as cold', dialog(page));
        pass(`${tag}: marked as cold, with a reminder to check in on the coach's to-dos`, (await toastText(page)).includes('Chris is in Cold leads. A reminder to check in is on your to-dos.'), await toastText(page));
        await go(page, '/coach/leads');
        pass(`${tag}: a cold lead leaves the board, and its stage's totals`, !(await column(page, 'Proposal sent').innerText()).includes('Chris Lowe') && (await column(page, 'Proposal sent').innerText()).includes('£13,500'));
        await press(page, 'Cold leads');
        const cold = await words(page);
        pass(`${tag}: Cold leads lists it with what happened and when to check in again`, cold.includes('Chris Lowe') && cold.includes('No budget this year.') && cold.includes('Check in again on Wed 17 Feb 2027') && cold.includes('Priya Menon'), cold.slice(0, 300));
        await page.getByRole('button', { name: 'Bring Chris Lowe back' }).click(); await settle(page, 900);
        pass(`${tag}: Bring back returns it to the stage it left`, (await toastText(page)).includes('Chris is back in Proposal sent.') && !(await words(page)).includes('Chris Lowe'), await toastText(page));
        await a.close();
      }

      if (has('lead-merge')) {
        const tag = `lead-merge, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        await press(page, 'Review');
        const panel = await dialog(page).innerText();
        pass(`${tag}: Merge into one shows what differs to choose from, and what is the same once`, ['These two look like the same person. Choose what to keep where they differ.', 'Christopher Doyle', 'Doyle Capital Partners', 'Both timelines join into one. Nothing is lost.'].every((w) => panel.includes(w)));
        await dialog(page).getByRole('radio', { name: 'Doyle Capital Partners' }).click();
        await press(page, 'Merge into one', dialog(page)); await settle(page, 900);
        let leads = await a.rowsNow('coach_leads');
        const kept = leads.find((l) => l.id === CRM.chrisDoyle);
        pass(`${tag}: one Chris Doyle is left, with the organisation chosen and the other's mobile`, (await toastText(page)).includes('Merged. Both timelines are now on Chris Doyle.') && kept?.organisation === 'Doyle Capital Partners' && kept.phone === '07700 900542' && !(await column(page, 'New').innerText()).includes('Christopher Doyle'), JSON.stringify([kept?.organisation, kept?.phone]));
        await undo(page); await settle(page, 600);
        leads = await a.rowsNow('coach_leads');
        pass(`${tag}: Undo puts both back exactly as they were`, leads.find((l) => l.id === CRM.chrisDoyle)?.organisation === 'Doyle Capital' && !leads.find((l) => l.id === CRM.christopherDoyle)?.merged_into && (await column(page, 'New').innerText()).includes('Christopher Doyle'));
        await press(page, 'Review');
        await press(page, 'They’re different people', dialog(page));
        pass(`${tag}: “They’re different people” is kept, and the line goes for good`, (await toastText(page)).includes('Kept as two people. You won’t be asked again.') && !(await words(page)).includes('may be in here twice'));
        await go(page, '/coach/leads');
        pass(`${tag}: the pair isn't asked about again after a reload`, !(await words(page)).includes('may be in here twice'));
        await a.close();
      }

      if (has('lead-waiting')) {
        const tag = `lead-waiting, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        await press(page, 'Add as a lead'); await settle(page, 600);
        const sarah = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Sarah Kent');
        pass(`${tag}: Add as a lead puts Sarah Kent in New, from “Your email”, and the line goes`, (await column(page, 'New').innerText()).includes('Sarah Kent') && sarah?.source === 'email' && !(await words(page)).includes('isn’t in the portal yet'));
        pass(`${tag}: the email is on her timeline`, (await a.rowsNow('coach_email_links')).some((l) => l.person_kind === 'lead' && l.person_id === sarah?.id && l.email_id === CRM.eSarah) && (await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === sarah?.id && e.kind === 'email'));
        await undo(page);
        pass(`${tag}: Undo takes her out and the line is back`, !(await a.rowsNow('coach_leads')).some((l) => l.name === 'Sarah Kent') && (await words(page)).includes('You emailed Sarah Kent, who isn’t in the portal yet.'));
        await press(page, 'Not now');
        pass(`${tag}: Not now leaves her out for good`, (await toastText(page)).includes('Left out. You won’t be asked about them again.') && !(await words(page)).includes('isn’t in the portal yet') && (await a.rowsNow('coach_email_waiting')).find((w) => w.id === CRM.waitSarah)?.status === 'dismissed');
        await a.close();
      }

      if (has('lead-import')) {
        const tag = `lead-import, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        const before = (await a.rowsNow('coach_leads')).length;
        await press(page, 'Import from a spreadsheet');
        await dialog(page).locator('input[type=file]').setInputFiles({ name: 'Leads 2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK not a real workbook') });
        await settle(page, 400);
        pass(`${tag}: a damaged Excel file is refused calmly, with what to do`, (await dialog(page).innerText()).includes('That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.'));
        // A real Excel workbook (made with the portal's own xlsx.js) is read like a CSV file: its columns matched, its rows counted.
        const book = xlsxBytes([['Name', 'Email', 'Company'], ['Nell Okoye', 'nell.okoye@example.invalid', 'Harbour Lane'], ['Amy Cole', 'amy.cole@example.invalid', 'Northfield Logistics']], 'Leads');
        await dialog(page).locator('input[type=file]').setInputFiles({ name: 'Leads 2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(book) });
        await settle(page, 600);
        const fromExcel = await dialog(page).innerText();
        pass(`${tag}: an Excel file is read: its columns matched and its duplicate listed first`, ['Nell Okoye', 'Amy Cole is already a lead, with the same email.', '1 to add.', 'Add 1 lead'].every((w) => fromExcel.includes(w)) && !fromExcel.includes('can’t be read'), fromExcel.slice(0, 300));
        // Odd columns: other names for the headings, one nobody knows, a row with no name, the same person twice, someone already here.
        const sheet = 'Full Name;E-mail;Company;Deal_Size;Lead Source;Shoe size\nDana Whitfield;dana@example.invalid;Kestrel Group;"£12,000";Referral;7\nAmy Cole;amy.cole@example.invalid;Northfield Logistics;;;\nelena ruiz;;;;;\nGrace Liu;grace.liu@example.invalid;Quillmark;4.5k;Chemistry Call;\nGrace Again;grace.liu@example.invalid;;;;\n;nobody@example.invalid;;;;';
        await dialog(page).locator('input[type=file]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet) });
        await settle(page, 600);
        const panel = await dialog(page).innerText();
        pass(`${tag}: the columns are matched by their names, and one nobody knows is left out`, (await dialog(page).locator('.ds-dd, [role=combobox]').count()) >= 6 && ['Full Name', 'E-mail', 'Company', 'Deal_Size', 'Lead Source', 'Shoe size', 'Leave out'].every((w) => panel.includes(w)), panel.slice(0, 200));
        pass(`${tag}: duplicates show first: someone already a lead by email, by name, and a row in the file twice`, ['Amy Cole is already a lead, with the same email.', 'Elena Ruiz is already a lead, with the same name.', 'Grace Again is in this file twice.'].every((w) => panel.includes(w)) && /possible duplicates/i.test(panel) && panel.search(/possible duplicates/i) < panel.search(/your columns/i), panel.slice(0, 400));
        pass(`${tag}: it says how many will be added, and that the row with no name is left out`, panel.includes('2 to add.') && panel.includes('3 may already be here.') && panel.includes('1 row has no name, so it is left out.') && panel.includes('Add 2 leads'));
        await press(page, 'Add 2 leads', dialog(page)); await settle(page, 900);
        const leads = await a.rowsNow('coach_leads');
        const dana = leads.find((l) => l.name === 'Dana Whitfield');
        const grace = leads.find((l) => l.name === 'Grace Liu');
        pass(`${tag}: two leads are added, with their values read and where they came from`, (await toastText(page)).includes('2 leads added.') && leads.length === before + 2 && dana?.value === 12000 && dana.source === 'referral' && grace?.value === 4500 && grace.source === 'chemistry_page' && dana.stage_id === CRM.stNew, JSON.stringify([leads.length - before, dana?.value, dana?.source, grace?.value, grace?.source]));
        await undo(page);
        pass(`${tag}: Undo takes them out again`, (await a.rowsNow('coach_leads')).length === before);
        await a.close();
      }

      if (has('lead-export')) {
        const tag = `lead-export, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        await press(page, 'Export');
        const offer = await dialog(page).innerText();
        pass(`${tag}: Export offers this view and every lead, as Excel or CSV`, ['This view, 10 leads', 'Excel', 'CSV', 'Every field comes with it, your own fields included.'].every((w) => offer.includes(w)), offer.slice(0, 200));
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Download', exact: true }).click()]);
        pass(`${tag}: a spreadsheet is downloaded, named in words`, download.suggestedFilename() === 'Leads, 17 Nov 2026.xlsx', download.suggestedFilename());
        await download.delete().catch(() => {});
        await a.close();
      }

      if (has('lead-stages')) {
        const tag = `lead-stages, ${mode}`;
        const a = await openAt({ db, tag });
        const { page } = a;
        await press(page, 'Edit stages');
        const d = dialog(page);
        pass(`${tag}: Edit stages lists the five with how likely each is to win, Won last at 100%`, JSON.stringify(await d.locator('.cc-stage-row input').evaluateAll((els) => els.map((e) => e.value))) === JSON.stringify(['New', '10%', 'Call booked', '25%', 'Proposal sent', '50%', 'Deciding', '70%', 'Won']) && (await d.innerText()).includes('100%'), JSON.stringify(await d.locator('.cc-stage-row input').evaluateAll((els) => els.map((e) => e.value))));
        await press(page, 'Add stage', d);
        await page.keyboard.type('Contract out');
        await d.getByLabel('How likely Contract out is to win, as a percentage').fill('90');
        await d.getByLabel('Stage 1’s name').fill('Enquiry');
        // Moved with the arrow keys: Deciding goes above Proposal sent.
        await d.getByRole('button', { name: 'Move Deciding', exact: true }).focus(); await page.keyboard.press('ArrowUp'); await settle(page, 300);
        pass(`${tag}: a stage moves with the arrow keys and keeps the focus`, await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Move Deciding'));
        await press(page, 'Save my edit', d); await settle(page, 900);
        const names = async () => (await a.rowsNow('coach_lead_stages')).sort((x, y) => x.position - y.position).map((s) => `${s.name} ${s.likelihood}`);
        pass(`${tag}: saved: renamed, added before Won, moved`, (await toastText(page)).includes('Stages saved.') && JSON.stringify(await names()) === JSON.stringify(['Enquiry 10', 'Call booked 25', 'Deciding 70', 'Proposal sent 50', 'Contract out 90', 'Won 100']), JSON.stringify(await names()));
        pass(`${tag}: the board shows the six stages in their new order`, JSON.stringify(await page.locator('.cc-lboard .cc-board-head span:first-child').allInnerTexts()) === JSON.stringify(['Enquiry', 'Call booked', 'Deciding', 'Proposal sent', 'Contract out', 'Won']), JSON.stringify(await page.locator('.cc-lboard .cc-board-head span:first-child').allInnerTexts()));
        await undo(page); await settle(page, 600);
        pass(`${tag}: Undo puts the five back as they were`, JSON.stringify(await names()) === JSON.stringify(['New 10', 'Call booked 25', 'Proposal sent 50', 'Deciding 70', 'Won 100']), JSON.stringify(await names()));
        // Removed, with its leads moved first.
        await press(page, 'Edit stages');
        await dialog(page).getByRole('button', { name: 'Remove Proposal sent' }).click(); await settle(page, 400);
        pass(`${tag}: removing a stage with leads asks where they go`, (await dialog(page).innerText()).includes('2 leads are in Proposal sent. Where should they go?'));
        await choose(page, 'Move them to', 'Deciding', dialog(page));
        await press(page, 'Save my edit', dialog(page)); await settle(page, 1000);
        const leads = await a.rowsNow('coach_leads');
        pass(`${tag}: the stage is gone, its leads (the cold one too) are in Deciding, and the automation that named it went with it`, !(await a.rowsNow('coach_lead_stages')).some((s) => s.id === CRM.stProp) && [CRM.amy, CRM.chrisLowe, CRM.coldLead].every((id) => leads.find((l) => l.id === id)?.stage_id === CRM.stDeciding) && !(await a.rowsNow('coach_automations')).some((x) => x.id === CRM.a1), JSON.stringify([(await a.rowsNow('coach_lead_stages')).length, (await a.rowsNow('coach_automations')).length]));
        pass(`${tag}: Deciding's total is now its own and theirs`, (await column(page, 'Deciding').innerText()).includes('£39,000'), (await column(page, 'Deciding').innerText()).slice(0, 60));
        await undo(page); await settle(page, 700);
        pass(`${tag}: Undo brings the stage, its leads and the automation back`, (await a.rowsNow('coach_lead_stages')).some((s) => s.id === CRM.stProp) && (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy)?.stage_id === CRM.stProp && (await a.rowsNow('coach_automations')).some((x) => x.id === CRM.a1));
        await a.close();
      }

      if (has('lead-many')) {
        const tag = `lead-many, ${mode}`;
        const rows = seedWithCrm({ accounts: true, network: false });
        rows.coach_leads = [...rows.coach_leads, ...manyLeads(300)];
        const started = Date.now();
        const a = await openAt({ db, tag, rows });
        const { page } = a;
        const took = Date.now() - started;
        const cards = await page.locator('.cc-lboard [data-card]').count();
        pass(`${tag}: with 310 leads the board opens (${took} ms with sign-in), each stage folded after 25 with “Show all”`, cards > 50 && cards <= 4 * 25 + 30 && (await page.getByRole('button', { name: /^Show all \d+ in / }).count()) >= 4, `${cards} cards`);
        pass(`${tag}: the totals count every lead, not only the cards shown`, /\b(6\d|7\d|8\d)\b/.test(await column(page, 'New').locator('.cc-board-head').innerText()), await column(page, 'New').locator('.cc-board-head').innerText());
        await page.getByRole('button', { name: /^Show all \d+ in New$/ }).click(); await settle(page, 500);
        pass(`${tag}: “Show all” opens the whole stage`, (await column(page, 'New').locator('[data-card]').count()) > 25);
        let t = Date.now();
        await press(page, 'Table');
        pass(`${tag}: the table opens with 100 rows and “Show all” (${Date.now() - t} ms)`, (await page.locator('.cc-lead-table tbody tr').count()) === 100 && (await page.getByRole('button', { name: /^Show all 2\d\d$/ }).count()) === 1, `${await page.locator('.cc-lead-table tbody tr').count()} rows`);
        t = Date.now();
        await page.getByLabel('Search leads').fill('grant'); await settle(page, 500);
        const found = await page.locator('.cc-lead-table tbody tr').count();
        pass(`${tag}: search narrows by name, with the count (${Date.now() - t} ms)`, found > 0 && found < 40 && /\d+ of 2\d\d leads/.test(await words(page)), `${found} rows`);
        await a.close();
      }
    }

    if (has('lead-associate')) {
      for (const db of dbs) {
        const tag = `lead-associate, ${db === 'there' ? '049 to 052 there' : 'on the device'}`;
        const a = await openAt({ role: 'associate', db, tag, path: '/coach/leads' });
        const { page } = a;
        pass(`${tag}: an associate who opens Leads is on their own Today`, new URL(page.url()).pathname === '/coach' && !(await words(page)).includes('Amy Cole'), page.url().replace(APP, ''));
        await go(page, `/coach/leads/${CRM.amy}`);
        pass(`${tag}: and so is one who opens a lead's own address, or Cold leads`, new URL(page.url()).pathname === '/coach');
        await go(page, '/coach/leads/cold');
        pass(`${tag}: Cold leads too`, new URL(page.url()).pathname === '/coach');
        await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600);
        pass(`${tag}: the menu has no Leads`, !/\bLeads\b/.test(await page.locator('.cc-menu').innerText()));
        await page.keyboard.press('Escape'); await settle(page, 300);
        await page.getByRole('button', { name: 'Search, or do anything' }).click(); await page.keyboard.type('lead'); await settle(page, 500);
        const results = await page.locator('.cc-jump').innerText();
        pass(`${tag}: search finds no Leads page, no lead and no lead action`, !/\bLeads?\b/.test(results.replace(/“lead”/, '')), results.slice(0, 120));
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('amy cole'); await settle(page, 500);
        pass(`${tag}: nor Amy Cole by name`, !(await page.locator('.cc-jump').innerText()).includes('Amy Cole'));
        // (A lead's own timeline follows the lead, which is each coach's own in the database: the seed's leads are this coach's here.)
        if (db === 'there') pass(`${tag}: the database handed the associate no stages, automations or emails`, (await a.deviceRows('coach_lead_stages')).length === 0 && (await a.deviceRows('coach_automations')).length === 0 && (await a.deviceRows('coach_emails')).length === 0, `${(await a.deviceRows('coach_lead_stages')).length} stages, ${(await a.deviceRows('coach_automations')).length} automations, ${(await a.deviceRows('coach_emails')).length} emails`);
        await a.close();
      }
    }

    if (has('lead-arrives')) {
      // Before: everything on the device (as it is today: 049 answers "not yet" in this mode, so nothing is sent at all).
      const tag = 'lead-arrives';
      const a = await openAt({ db: 'none', tag: `${tag}, on the device`, network: true });
      let { page } = a;
      await page.locator('.cc-lboard .ds-addrow', { hasText: 'Add lead' }).click(); await settle(page, 600);
      await dialog(page).getByLabel('Who is it?').fill('Hana Okafor');
      await dialog(page).getByLabel('Which organisation?').fill('Kestrel Group');
      await press(page, 'Add lead', dialog(page));
      const card = page.locator('[data-card]', { hasText: 'Hana Okafor' });
      await card.focus(); await page.keyboard.press('ArrowRight'); await settle(page, 900);
      await go(page, `/coach/leads/${CRM.amy}`);
      await press(page, 'Add note');
      await dialog(page).getByLabel('What do you want to remember about Amy?').fill('Typed before the tables were there.');
      await press(page, 'Add my note', dialog(page));
      const TABLES = ['coach_lead_stages', 'coach_leads', 'coach_lead_events', 'coach_automations', 'coach_automation_runs', 'coach_emails', 'coach_email_links', 'coach_email_waiting'];
      const device = {};
      for (const table of TABLES) device[table] = (await a.deviceRows(table)).length;
      const hanaId = (await a.deviceRows('coach_leads')).find((l) => l.name === 'Hana Okafor')?.id;
      pass(`${tag}: on the device the new lead, its move and the note are kept, and nothing was sent or tried`, Boolean(hanaId) && a.store.calls.filter((c) => c.startsWith('blocked')).length === 0 && device.coach_leads === 12, `${device.coach_leads} leads`);
      await a.close({ keep: true });

      // After: 049 to 052 are there, with nothing in them yet. The same device opens Leads.
      page = await a.ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
      await page.clock.setFixedTime(TUE);
      const store = await standIn(page, { role: 'owner', db: 'there', day: true, cal: true, crm: true, strict: true, rows: {}, now: () => new Date(TUE) });
      await page.route('**/api/**', (route) => json(route, { ok: true, sent: false }));
      await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
      for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
      await page.goto(`${APP}/coach/leads`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      const unsentNow = () => page.evaluate((id) => { const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}'); return Object.entries(kept.rows || {}).map(([table, rows]) => [table, Object.keys(rows).filter((k) => !kept.marks?.[table]?.[k]?.sent).length]).filter(([, n]) => n > 0).map(([table, n]) => `${table} ${n}`); }, a.me);
      // Everything waiting is sent, a row at a time: wait until nothing of Leads waits on the device (or 60 seconds).
      const ofLeads = (list) => list.filter((x) => TABLES.some((t) => x.startsWith(`${t} `)));
      for (let i = 0; i < 120; i += 1) { if (ofLeads(await unsentNow()).length === 0) break; await settle(page, 500); }
      pass(`${tag}: what waited on the device for Leads is moved across, and nothing of it is left waiting`, ofLeads(await unsentNow()).length === 0, ofLeads(await unsentNow()).join(', '));
      const refused = store.calls.filter((c) => c.startsWith('refused') && TABLES.some((t) => c.includes(t)));
      pass(`${tag}: parents went before their parts: the database refused nothing of Leads`, refused.length === 0, [...new Set(refused)].slice(0, 4).join('; '));
      const counts = Object.fromEntries(TABLES.map((t) => [t, (store.rows[t] || []).length]));
      pass(`${tag}: every row arrived, once`, TABLES.every((t) => counts[t] === device[t]), TABLES.filter((t) => counts[t] !== device[t]).map((t) => `${t}: ${counts[t]} of ${device[t]}`).join('; '));
      const hana = store.rows.coach_leads.find((l) => l.id === hanaId);
      pass(`${tag}: the lead added on the device arrived whole: its stage (Call booked), its organisation, and its move on the timeline`, hana?.stage_id === CRM.stCall && hana.organisation === 'Kestrel Group' && hana.organisation_id === ID.kestrel && store.rows.coach_lead_events.some((e) => e.lead_id === hanaId && e.kind === 'stage'), JSON.stringify([hana?.stage_id === CRM.stCall, hana?.organisation]));
      pass(`${tag}: the pipeline is the device's own five stages, not a second set`, store.rows.coach_lead_stages.length === 5 && store.rows.coach_lead_stages.filter((s) => s.is_won).length === 1 && !store.calls.some((c) => /coach_lead_stages_start/.test(c)), `${store.rows.coach_lead_stages.length} stages`);
      const posts = store.calls.filter((c) => /^POST coach_leads\b/.test(c)).length;
      await settle(page, 800);
      const text = await words(page);
      pass(`${tag}: the board reads the same from the database`, ['Hana Okafor', '£31,500', '£15,750 likely', 'Quiet for 19 days'].every((w) => text.includes(w)));
      // The same device opens it again: nothing is sent a second time.
      await page.goto(`${APP}/coach/leads/${CRM.amy}`);
      await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 2500);
      pass(`${tag}: opened again, nothing is sent a second time, and the note typed on the device is on Amy's timeline`, store.calls.filter((c) => /^POST coach_leads\b/.test(c)).length === posts && TABLES.every((t) => (store.rows[t] || []).length === device[t]) && (await words(page)).includes('Typed before the tables were there.'), `${store.calls.filter((c) => /^POST coach_leads\b/.test(c)).length} against ${posts}`);
      pass(`${tag}: nothing in the console as it moved`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      pass(`${tag}: nothing was written to the test project as it moved`, blocked.length === 0, [...new Set(blocked)].slice(0, 4).join('; '));
      pass(`${tag}: Network's people went first, so the lead that names who referred her wasn't refused`, store.rows.network_people.some((p) => p.id === CRM.hannah) && store.rows.coach_leads.find((l) => l.id === CRM.amy)?.referred_by_person === CRM.hannah);
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

run().catch((e) => { console.error(String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; });
