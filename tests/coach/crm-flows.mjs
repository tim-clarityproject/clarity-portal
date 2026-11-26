// Automations, Boards, emails logged, past clients' check-ins and the
// account map, walked (Phase 6a run 4, step 3) as the owner on a laptop in
// both database modes (device only: 049 to 052 "not yet"; and 049 to 052
// answered by the stand-ins in shared.mjs and crm-standin.mjs), then as an
// associate, who sees only a shared board. Nothing reaches the test project
// and NOTHING IS EVER SENT: every write is the stand-in's, or is stopped and
// listed; the emails are invented and "arrive" through the device's own
// stand-ins (window.__clarityEmailSync, which only a build that isn't live
// has); no /api/ call is made by any of these pages.
//
//   crm-auto     an automation that adds a to-do (after a stage move, claimed once, with Undo); one that moves a stage (a
//                proposal opened, asked about by the watch) and what its own move sets off; one that would loop is refused
//                when saved and when switched on; nothing can be chosen but a to-do or a stage
//   crm-watch    with the portal open: a quiet lead, a proposal opened three times and a call booked each add their to-do
//                once, and opening again adds nothing
//   crm-keep     keep in touch (run 8's 3): listed and off until switched on; switched on, a past client due a check-in
//                today gets one "Catch up with Ben", due today, and tomorrow's gets nothing yet; a reload and a second tab
//                add nothing; before 059 the automation and its run stay on the device; switched off, nothing more runs
//   crm-ended    coaching ends: the "when coaching ends" to-do and the 3, 6 and 12 month check-ins, with Undo
//   crm-board    New board from a template; a card added, moved with the arrow keys, typed over in the table; Edit this board
//                (a stage taken out with its cards moved, one added, shared) with Undo; Delete the board with Undo
//   crm-shared   an associate sees the shared board and not the unshared one, can't change it, and has no Automations
//   crm-email    Settings, Email: calm until set up, the stand-in's addresses with Copy; an email copied in lands on a lead's,
//                a client's and a contact's timeline, and someone unknown waits on Leads; once only; Hide this thread; a
//                forwarded email makes one to-do with its line; Gmail's stand-in logs only while the switch is on
//   crm-past     past clients' check-ins due, the note with its ask, Open in my email (a mailto link), Not now, the switch,
//                and Today's Keep in touch lines
//   crm-map      an organisation's account map: Who's who, Agreements and proposals (add, edit), Room to grow into the pipeline
//
//   PARTS=crm-auto,…   DB=none,there
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, openSearch, seedDevice, settle, standIn, toastText } from './shared.mjs';
import { CAL, CRM, ID, seedClock, seedWithCrm } from './seed.mjs';
import { withSharedBoard } from './screens.mjs';
import { addDays } from '../../src/lib/time/index.js';

export const CRM_PARTS = ['crm-auto', 'crm-watch', 'crm-keep', 'crm-ended', 'crm-board', 'crm-shared', 'crm-email', 'crm-past', 'crm-map'];
const TUE = new Date(2026, 10, 17, 9, 0);
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
// A name in a list or table, a board card and the pages that open more are real links since Polish 1 (B4): press either.
const press = async (page, name, scope = page) => { await scope.getByRole('button', { name, exact: true }).or(scope.getByRole('link', { name, exact: true })).first().click(); await settle(page, 600); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const words = (page) => page.evaluate(() => (document.querySelector('.cc-main')?.innerText || '').replace(/ /g, ' '));
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const choose = async (page, label, option, scope = page) => { await scope.getByLabel(label, { exact: true }).first().click(); await settle(page, 300); await page.getByRole('option', { name: option, exact: true }).first().click(); await settle(page, 400); };
const has = (text, list) => list.every((w) => text.toLowerCase().includes(w.toLowerCase()));
const missing = (text, list) => list.filter((w) => !text.toLowerCase().includes(w.toLowerCase())).join(' | ');
// Rows only the database ever makes, and another coach's own, are never on a device before the tables are there.
const forDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, coach_bookings: _b, coach_email_addresses: _e, coach_poll_votes: _v, coach_cal_reminder_sends: _r, ...own } = rows; return own; };

async function run() {
  const report = makeReport('Automations, boards, emails, past clients and the account map, the flows');
  const { pass } = report;
  const parts = (process.env.PARTS || CRM_PARTS.join(',')).split(',');
  const on = (p) => parts.includes(p);
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();

  /** A page signed in and standing in, its clock on M11's Tuesday, with the seed in the stand-in database or on the device. */
  async function openAt({ role = 'owner', db, path, tag, rows = null }) {
    const there = db === 'there';
    const ctx = await coachContext(browser, { size: 1440, theme: there ? 'light' : 'dark' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 1200 });
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
    await page.clock.setFixedTime(TUE);
    seedClock(TUE);
    const seed = rows || seedWithCrm({ accounts: true, network: false });
    const store = await standIn(page, { role, db, day: there, cal: there, crm: there, strict: there, rows: there ? seed : {}, now: () => new Date(TUE) });
    // Nothing here may ask the server for anything (no email, no send): any /api/ call is answered "not sent" and listed.
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
    if (!there) await seedDevice(page, me, forDevice(seed));
    await go(page, path);
    const deviceRows = (table) => page.evaluate(([id, t]) => {
      const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || localStorage.getItem(`clarity-cache:${id}:coach`) || '{}');
      return Object.values(kept.rows?.[t] || {});
    }, [me, table]);
    return {
      page, ctx, store, me, there, errors, seed,
      /** The rows as they are kept now: in the stand-in database, or on the device. */
      rowsNow: async (table) => (there ? store.rows[table] || [] : deviceRows(table)),
      deviceRows,
      async close() {
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
        pass(`${tag}: nothing was written to the test project`, reached.length === 0 && blocked.length === 0, [...new Set([...reached, ...blocked])].slice(0, 4).join('; '));
        pass(`${tag}: nothing asked the server to send anything (no /api/ call at all)`, api.length === 0, [...new Set(api)].join(', '));
        await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.startsWith(`clarity-cache:${id}:coach-email-standin`) || k === `clarity-cache:${id}:coach-board-layout`) localStorage.removeItem(k); }, me).catch(() => {});
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  try {
    for (const db of dbs) {
      const mode = db === 'there' ? '049 to 052 there' : 'on the device';

      // ---------------------------------------------------------------- automations
      if (on('crm-auto')) {
        const tag = `crm-auto, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads/automations' });
        const { page } = a;
        let text = await words(page);
        const SENTENCES = ['When a lead moves to Proposal sent, add the to-do “Follow up on the proposal”, 3 days later.', 'When a proposal is opened 3 times, add the to-do “Call while the proposal is fresh”, the same day.',
          'When a lead has been quiet for 14 days, add the to-do “Check in”, the same day.', 'When a Discovery call is booked, add the to-do “Read their booking answers”, the day before.', 'When coaching ends, add the to-do “Ask for a testimonial”, 2 weeks later.'];
        pass(`${tag}: each automation reads as one sentence, with how often it ran this month`, has(text, [...SENTENCES, 'Ran 4 times in November', 'Ran 2 times in November', 'Ran 3 times in November', 'Ran 5 times in November', 'Off']), missing(text, [...SENTENCES, 'Ran 4 times in November', 'Ran 2 times in November', 'Ran 3 times in November', 'Ran 5 times in November']));
        pass(`${tag}: the help says they add to-dos and move stages and never send (never tags or keep in touch)`, text.includes('Automations add to-dos and move stages. They never send anything.') && !/add tags|keep people in touch|keep in touch every/.test(text));

        // Add one that adds a to-do. Pressed too early, it says what's missing.
        await press(page, 'Add automation');
        let d = dialog(page);
        const whens = await (async () => { await d.getByLabel('When', { exact: true }).click(); await settle(page, 300); const o = await page.getByRole('option').allInnerTexts(); await page.keyboard.press('Escape'); await settle(page, 300); return o; })();
        pass(`${tag}: what can start one: a stage, a proposal opened, a quiet lead, a call booked, won, coaching ends`, JSON.stringify(whens) === JSON.stringify(['A lead moves to a stage', 'A proposal is opened', 'A lead goes quiet', 'A call is booked', 'A lead is won', 'Coaching ends']), whens.join(', '));
        const thens = await (async () => { await d.getByLabel('Then', { exact: true }).click(); await settle(page, 300); const o = await page.getByRole('option').allInnerTexts(); await page.keyboard.press('Escape'); await settle(page, 300); return o; })();
        pass(`${tag}: it can only add a to-do or move a stage: nothing else can be chosen`, JSON.stringify(thens) === JSON.stringify(['Add a to-do', 'Move the lead to a stage']), thens.join(', '));
        await press(page, 'Save', d);
        pass(`${tag}: Save pressed with no to-do says what's missing`, (await d.innerText()).includes('Type the to-do to carry on.'));
        await choose(page, 'Which stage?', 'Deciding', d);
        await d.getByLabel('To-do', { exact: true }).fill('Send the contract');
        await choose(page, 'When?', '2 days later', d);
        pass(`${tag}: the panel reads the automation back as one sentence`, (await d.locator('.cc-auto-sentence').innerText()).trim() === 'When a lead moves to Deciding, add the to-do “Send the contract”, 2 days later.', await d.locator('.cc-auto-sentence').innerText());
        await press(page, 'Save', d);
        pass(`${tag}: saved: “Added”, with Undo`, /Added/.test(await toastText(page)) && await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count() === 1);
        text = await words(page);
        pass(`${tag}: it is on the list, switched on, and hasn't run yet`, text.includes('When a lead moves to Deciding, add the to-do “Send the contract”, 2 days later.') && text.includes('Hasn’t run in November'));
        const mine = (await a.rowsNow('coach_automations')).find((r) => r.todo_title === 'Send the contract');

        // A stage move the coach makes: the to-do is added, the run is claimed once.
        await go(page, '/coach/leads');
        await page.locator(`[data-card="${CRM.amy}"]`).focus();
        await page.keyboard.press('ArrowRight'); await settle(page, 1600);
        const said = await toastText(page);
        pass(`${tag}: Amy moved to Deciding and the message says an automation added a to-do`, said.includes('Moved to Deciding.') && said.includes('An automation added a to-do.'), said);
        let todos = (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id);
        pass(`${tag}: the to-do is there once: “Send the contract”, for Amy, 2 days later`, todos.length === 1 && todos[0].title === 'Send the contract' && todos[0].lead_id === CRM.amy && todos[0].planned_on === '2026-11-19', JSON.stringify(todos.map((t) => [t.title, t.lead_id, t.planned_on])));
        let runs = (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mine?.id);
        pass(`${tag}: its run is claimed once, under the move's own key`, runs.length === 1 && /^stage:/.test(runs[0].event_key) && runs[0].todo_id === todos[0]?.id, JSON.stringify(runs.map((r) => r.event_key)));
        await undo(page);
        todos = (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id);
        pass(`${tag}: Undo takes the move and the automation's to-do back`, todos.length === 0 && (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy)?.stage_id === CRM.stProp, `${todos.length} to-dos`);

        // Run 6 (item 7): switched off, it runs nothing; switched on again, it runs once more.
        await go(page, '/coach/leads/automations');
        const mineSentence = 'When a lead moves to Deciding, add the to-do “Send the contract”, 2 days later.';
        await page.getByRole('switch', { name: `On: ${mineSentence}` }).click(); await settle(page, 700);
        pass(`${tag}: switched off: “Switched off”, and kept off`, /Switched off/.test(await toastText(page)) && (await a.rowsNow('coach_automations')).find((r) => r.id === mine?.id)?.active === false);
        const runsBefore = (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mine?.id).length;
        await go(page, '/coach/leads');
        await page.locator(`[data-card="${CRM.amy}"]`).focus();
        await page.keyboard.press('ArrowRight'); await settle(page, 1600);
        const offSaid = await toastText(page);
        todos = (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id);
        runs = (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mine?.id);
        pass(`${tag}: with it off, moving Amy to Deciding adds no to-do, claims no run, and the message says only the move`, offSaid.includes('Moved to Deciding.') && !offSaid.includes('automation') && todos.length === 0 && runs.length === runsBefore, `${offSaid} / ${todos.length} to-dos / ${runs.length - runsBefore} new runs`);
        await undo(page);
        await go(page, '/coach/leads/automations');
        await page.getByRole('switch', { name: `On: ${mineSentence}` }).click(); await settle(page, 700);
        pass(`${tag}: switched on again`, (await a.rowsNow('coach_automations')).find((r) => r.id === mine?.id)?.active === true);

        // One that moves a stage: a proposal opened once moves the lead to Deciding. The watch asks about it while the portal is
        // open; its own move then sets off the automation above (a follow-on), once.
        await go(page, '/coach/leads/automations');
        await press(page, 'Add automation');
        d = dialog(page);
        await choose(page, 'When', 'A proposal is opened', d);
        await choose(page, 'How many times?', 'Once', d);
        await choose(page, 'Then', 'Move the lead to a stage', d);
        const tos = await (async () => { await d.getByLabel('Which stage does it move to?', { exact: true }).click(); await settle(page, 300); const o = await page.getByRole('option').allInnerTexts(); await page.keyboard.press('Escape'); await settle(page, 300); return o; })();
        pass(`${tag}: an automation can't move a lead to Won (it isn't offered)`, tos.length > 0 && !tos.includes('Won'), tos.join(', '));
        await choose(page, 'Which stage does it move to?', 'Deciding', d);
        pass(`${tag}: its sentence: “When a proposal is opened once, move the lead to Deciding.”`, (await d.locator('.cc-auto-sentence').innerText()).trim() === 'When a proposal is opened once, move the lead to Deciding.', await d.locator('.cc-auto-sentence').innerText());
        await press(page, 'Save', d);
        const mover = (await a.rowsNow('coach_automations')).find((r) => r.action === 'stage' && r.trigger === 'proposal_opened');
        await settle(page, 4500); // the watch asks a moment after anything changes
        const amy = (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy);
        pass(`${tag}: the automation moved Amy (her proposal was opened three times) to Deciding`, Boolean(mover) && amy?.stage_id === CRM.stDeciding, amy?.stage_id);
        const moveLines = (await a.rowsNow('coach_lead_events')).filter((e) => e.lead_id === CRM.amy && e.kind === 'stage');
        pass(`${tag}: with the move on her timeline`, moveLines.length >= 1, `${moveLines.length}`);
        runs = (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mover?.id);
        pass(`${tag}: claimed once for Amy's proposal`, runs.length === 1 && runs[0].event_key === `opened:${CRM.amy}:leadership accelerator`, JSON.stringify(runs.map((r) => r.event_key)));
        todos = (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id);
        pass(`${tag}: and its own move set off “Send the contract” once (a follow-on), never twice`, todos.length === 1 && todos[0].lead_id === CRM.amy, `${todos.length}`);
        await go(page, '/coach/leads/automations'); await settle(page, 4000);
        pass(`${tag}: opened again, nothing runs twice`, (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mover?.id).length === 1 && (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id).length === 1);
        pass(`${tag}: Tom, already in Deciding, wasn't moved and got no line`, (await a.rowsNow('coach_lead_events')).filter((e) => e.lead_id === CRM.tom && e.kind === 'stage' && e.data?.by === mover?.id).length === 0);
        // Once for each lead and stage (tidy follow-up 3, run 6's 30; the functionality tester): Amy moved by hand back to
        // Proposal sent, then to Deciding again, runs “Send the contract” nothing more.
        await go(page, '/coach/leads');
        await page.locator(`[data-card="${CRM.amy}"]`).focus();
        await page.keyboard.press('ArrowLeft'); await settle(page, 1600);
        const backSaid = await toastText(page);
        await page.locator(`[data-card="${CRM.amy}"]`).focus();
        await page.keyboard.press('ArrowRight'); await settle(page, 1600);
        const againSaid = await toastText(page);
        pass(`${tag}: Amy moved back to Proposal sent and on to Deciding again by hand`, backSaid.includes('Moved to Proposal sent.') && againSaid.includes('Moved to Deciding.') && (await a.rowsNow('coach_leads')).find((l) => l.id === CRM.amy)?.stage_id === CRM.stDeciding, `${backSaid} / ${againSaid}`);
        pass(`${tag}: reaching Deciding a second time runs “Send the contract” nothing more: still one to-do and one run`,
          (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === mine?.id).length === 1 && (await a.rowsNow('coach_automation_runs')).filter((r) => r.automation_id === mine?.id).length === 1 && !againSaid.includes('automation'), againSaid);
        await go(page, '/coach/leads/automations');

        // One that would loop is refused, calmly, when saved and when switched on.
        const addMove = async (from, to) => { await press(page, 'Add automation'); d = dialog(page); await choose(page, 'Which stage?', from, d); await choose(page, 'Then', 'Move the lead to a stage', d); await choose(page, 'Which stage does it move to?', to, d); await press(page, 'Save', d); };
        const count = async () => (await a.rowsNow('coach_automations')).length;
        const before = await count();
        await addMove('Deciding', 'Proposal sent');
        pass(`${tag}: Deciding to Proposal sent is saved`, await count() === before + 1);
        await addMove('Proposal sent', 'Deciding');
        const refused = await dialog(page).innerText().catch(() => '');
        pass(`${tag}: the one that would close the circle is refused, calmly, and the panel stays`, refused.includes('That would send a lead round in a circle: another automation moves it back to Proposal sent. Choose another stage.') && await count() === before + 1, refused.slice(-200));
        await choose(page, 'Which stage does it move to?', 'Proposal sent', d);
        await press(page, 'Save', d);
        pass(`${tag}: nor can it move a lead to the stage that starts it`, (await dialog(page).innerText().catch(() => '')).includes('That’s the stage that starts it. Choose another stage.'));
        await page.keyboard.press('Escape'); await settle(page, 500);
        // Switched off, the other way round can be saved; switching it back on is then refused.
        const first = 'When a lead moves to Deciding, move the lead to Proposal sent.';
        await page.getByRole('switch', { name: `On: ${first}` }).click(); await settle(page, 700);
        pass(`${tag}: switched off: “Switched off”`, /Switched off/.test(await toastText(page)));
        await addMove('Proposal sent', 'Deciding');
        pass(`${tag}: with it off, the other way round is saved`, await count() === before + 2);
        await page.getByRole('switch', { name: `On: ${first}` }).click(); await settle(page, 700);
        text = await words(page);
        pass(`${tag}: switching the first back on is refused with the same calm line, and it stays off`, text.includes('That would send a lead round in a circle') && (await a.rowsNow('coach_automations')).find((r) => r.trigger_stage_id === CRM.stDeciding && r.to_stage_id === CRM.stProp)?.active === false);
        // Edit and delete.
        await page.getByRole('button', { name: /^Edit: When a lead moves to Deciding, add the to-do/ }).click(); await settle(page, 600);
        d = dialog(page);
        await d.getByLabel('To-do', { exact: true }).fill('Send the contract and the invoice');
        await press(page, 'Save', d);
        pass(`${tag}: an automation is edited from its sentence: “Saved”`, /Saved/.test(await toastText(page)) && (await words(page)).includes('“Send the contract and the invoice”'));
        await page.getByRole('button', { name: /^Edit: When a lead moves to Deciding, add the to-do/ }).click(); await settle(page, 600);
        await press(page, 'Delete', dialog(page));
        pass(`${tag}: Delete: “Deleted”, with Undo`, /Deleted/.test(await toastText(page)) && !(await words(page)).includes('Send the contract and the invoice'));
        await undo(page);
        pass(`${tag}: Undo brings it back`, (await words(page)).includes('Send the contract and the invoice'));
        await a.close();
      }

      if (on('crm-keep')) {
        const tag = `crm-keep, ${mode}`;
        // Ben's 3-month check-in is due today (M11's Tuesday); Leah's 12-month one is still to come.
        const rows = seedWithCrm({ accounts: true, network: false });
        rows.client_check_ins = rows.client_check_ins.map((c) => (c.id === CRM.ciBen ? { ...c, due_on: '2026-11-17' } : c));
        const a = await openAt({ db, tag, path: '/coach/leads/automations', rows });
        const { page } = a;
        const SENTENCE = 'When someone is due a catch-up, add the to-do “Catch up with [first name]”, due that day.';
        const sw = () => page.getByRole('switch', { name: `On: ${SENTENCE}` });
        const catchUps = async () => (await a.rowsNow('coach_todos')).filter((t) => /^Catch up with /.test(t.title || ''));
        const keepRuns = async () => (await a.deviceRows('coach_automation_runs')).filter((r) => String(r.event_key).startsWith('catchup:'));
        pass(`${tag}: Automations lists keep in touch as one sentence, Off, its switch off`, (await words(page)).includes(SENTENCE) && await sw().count() === 1 && await sw().getAttribute('aria-checked') === 'false', await sw().count());
        await settle(page, 2500);
        pass(`${tag}: off, it adds nothing`, (await catchUps()).length === 0);
        await sw().click(); await settle(page, 600);
        pass(`${tag}: switched on: “Switched on”`, /Switched on/.test(await toastText(page)) && await sw().getAttribute('aria-checked') === 'true');
        await settle(page, 3500);
        let made = await catchUps();
        pass(`${tag}: Ben (due today) gets one “Catch up with Ben”, due today, on Ben; Leah (still to come) gets nothing`,
          made.length === 1 && made[0].title === 'Catch up with Ben' && made[0].due_on === '2026-11-17' && made[0].planned_on === '2026-11-17' && made[0].profile_id === CRM.ben,
          JSON.stringify(made.map((t) => [t.title, t.due_on, t.planned_on])));
        pass(`${tag}: its run is claimed once, for Ben and that day`, (await keepRuns()).map((r) => r.event_key).join() === `catchup:client:${CRM.ben}:2026-11-17`, (await keepRuns()).map((r) => r.event_key).join());
        if (a.there) {
          pass(`${tag}: before 059 the automation and its run stay on the device (the database never sees catch_up_due)`,
            !(a.store.rows.coach_automations || []).some((r) => r.trigger === 'catch_up_due') && !(a.store.rows.coach_automation_runs || []).some((r) => String(r.event_key).startsWith('catchup:')));
        }
        await go(page, '/coach/leads/automations'); await settle(page, 3500);
        const second = await a.ctx.newPage();
        await second.goto(`${APP}/coach/leads/automations`); await second.waitForSelector('.cc-app', { timeout: 20000 }); await settle(second, 4000);
        await second.close();
        made = await catchUps();
        pass(`${tag}: a reload and a second tab add nothing more`, made.length === 1 && (await keepRuns()).length === 1, `${made.length} to-dos, ${(await keepRuns()).length} runs`);
        pass(`${tag}: still on after the reload`, await sw().getAttribute('aria-checked') === 'true');
        await sw().click(); await settle(page, 600);
        pass(`${tag}: switched off: “Switched off”, and it reads Off`, /Switched off/.test(await toastText(page)) && await sw().getAttribute('aria-checked') === 'false');
        await a.close();
      }

      if (on('crm-watch')) {
        const tag = `crm-watch, ${mode}`;
        // The seed, with none of its runs carrying a real event's key: nothing has yet run for what is true today.
        const rows = seedWithCrm({ accounts: true, network: false });
        rows.coach_automation_runs = rows.coach_automation_runs.map((r, i) => ({ ...r, event_key: `seed-only:${i}` }));
        const a = await openAt({ db, tag, path: '/coach', rows });
        const { page } = a;
        await settle(page, 5000);
        const made = async () => (await a.rowsNow('coach_todos')).filter((t) => [CRM.a2, CRM.a3, CRM.a4].includes(t.automation_id)).map((t) => [t.title, t.lead_id, t.planned_on]).sort((x, y) => x[0].localeCompare(y[0]));
        // The call's own day: the booking's start once bookings are on the device (051), the lead's next step's day before that.
        const booking = rows.coach_bookings.find((b) => b.id === CAL.bookRuth);
        const local = (at) => { const dt = new Date(at); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
        const callDay = db === 'there' ? local(booking.starts_at) : rows.coach_leads.find((l) => l.id === CAL.leadRuth).next_step_on;
        const dayBefore = [addDays(callDay, -1), '2026-11-17'].sort().pop(); // never before today
        const want = [['Call while the proposal is fresh', CRM.amy, '2026-11-17'], ['Check in', CRM.tom, '2026-11-17'], ['Read their booking answers', CAL.leadRuth, dayBefore]];
        let got = await made();
        pass(`${tag}: with the portal open, a quiet lead, a proposal opened three times and a Discovery call booked each add their to-do (the call's the day before it)`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
        await go(page, '/coach/todos'); await settle(page, 4500);
        got = await made();
        pass(`${tag}: opened again, each is still there once`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
        pass(`${tag}: a lead quiet for 12 days, a cold lead and a Connection Call set nothing off`, !(await a.rowsNow('coach_todos')).some((t) => t.automation_id && [CRM.chrisDoyle, CRM.coldLead, CAL.leadNadia].includes(t.lead_id)));
        pass(`${tag}: the to-dos are on To-dos, for today`, has(await words(page), ['Check in', 'Call while the proposal is fresh']));
        await a.close();
      }

      if (on('crm-ended')) {
        const tag = `crm-ended, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/leads/automations' });
        const { page } = a;
        await page.getByRole('switch', { name: 'On: When coaching ends, add the to-do “Ask for a testimonial”, 2 weeks later.' }).click(); await settle(page, 700);
        pass(`${tag}: “When coaching ends” is switched on: “Switched on”`, /Switched on/.test(await toastText(page)));
        await go(page, `/coach/clients/${ID.sam}/close`);
        await press(page, 'Move to Past clients'); await settle(page, 1500);
        const todo = (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === CRM.a6);
        pass(`${tag}: coaching ended: “Ask for a testimonial” is a to-do for Sam, two weeks on`, todo.length === 1 && todo[0].profile_id === ID.sam && todo[0].planned_on === '2026-12-01', JSON.stringify(todo.map((t) => [t.title, t.profile_id, t.planned_on])));
        let checks = (await a.rowsNow('client_check_ins')).filter((c) => c.profile_id === ID.sam).map((c) => [c.months, c.due_on]).sort((x, y) => x[0] - y[0]);
        pass(`${tag}: check-ins are suggested at 3, 6 and 12 months from today`, JSON.stringify(checks) === JSON.stringify([[3, '2027-02-17'], [6, '2027-05-17'], [12, '2027-11-17']]), JSON.stringify(checks));
        await undo(page);
        checks = (await a.rowsNow('client_check_ins')).filter((c) => c.profile_id === ID.sam);
        pass(`${tag}: Undo takes the to-do and the check-ins back, and Sam is a client again`, checks.length === 0 && (await a.rowsNow('coach_todos')).filter((t) => t.automation_id === CRM.a6).length === 0 && (await a.rowsNow('client_profiles')).find((p) => p.id === ID.sam)?.status !== 'past', `${checks.length} check-ins`);
        await a.close();
      }

      // ---------------------------------------------------------------- boards
      if (on('crm-board')) {
        const tag = `crm-board, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/boards' });
        const { page } = a;
        let text = await words(page);
        pass(`${tag}: Boards lists Speaking (4 stages, 5 cards) and Partners (3 stages, 2 cards)`, has(text, ['Speaking', '4 stages', '5 cards', 'Partners', '3 stages', '2 cards']), text.slice(0, 200));
        await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600);
        const menu = await page.locator('.cc-menu').innerText();
        pass(`${tag}: the menu has Boards with each board under it`, /Boards\s+Speaking\s+Partners/.test(menu), menu.replace(/\n/g, ' ').slice(0, 200));
        await page.keyboard.press('Escape'); await settle(page, 400);

        // New board, from a template.
        await press(page, 'New board');
        let d = dialog(page);
        await d.getByLabel('What’s it called?').fill('speaking');
        await press(page, 'Make the board', d);
        pass(`${tag}: a name already used is refused calmly`, (await d.innerText()).includes('There’s already a board called Speaking. Choose another name.'));
        await d.getByLabel('What’s it called?').fill('Podcast guests 2027');
        await d.getByRole('button', { name: 'Podcast guests', exact: true }).click(); await settle(page, 300);
        pass(`${tag}: a template shows its stages and fields`, has(await d.innerText(), ['To ask, Asked, Booked, Published', 'Show, Recording', 'You can edit the stages and fields at any time.']));
        await press(page, 'Make the board', d); await settle(page, 800);
        const made = (await a.rowsNow('coach_boards')).find((b) => b.name === 'Podcast guests 2027');
        pass(`${tag}: the board is made, not shared, and opens`, Boolean(made) && made.shared === false && new URL(page.url()).pathname === `/coach/boards/${made?.id}` && has(await words(page), ['To ask', 'Asked', 'Booked', 'Published']));

        // A card: added, moved with the arrow keys.
        await page.getByRole('button', { name: 'Add card to To ask' }).click(); await settle(page, 600);
        d = dialog(page);
        await press(page, 'Add card', d);
        pass(`${tag}: a card with no name says what's missing`, (await d.innerText()).includes('Type the card’s name to carry on.'));
        await d.getByLabel('Name', { exact: true }).fill('The Leadership Hour');
        await d.getByLabel('Show', { exact: true }).fill('Weekly, 12,000 listeners');
        await press(page, 'Add card', d);
        pass(`${tag}: the card is added: “Added”`, /Added/.test(await toastText(page)) && has(await words(page), ['The Leadership Hour', 'Weekly, 12,000 listeners']));
        const card = (await a.rowsNow('coach_board_items')).find((i) => i.title === 'The Leadership Hour');
        const stagesOf = async (boardId) => (await a.rowsNow('coach_board_stages')).filter((s) => s.board_id === boardId).sort((x, y) => x.position - y.position);
        const podStages = await stagesOf(made.id);
        await page.locator(`[data-card="${card?.id}"]`).focus();
        await page.keyboard.press('ArrowRight'); await settle(page, 900);
        pass(`${tag}: the right arrow moves the card to the next stage: “Moved to Asked.”`, /Moved to Asked\./.test(await toastText(page)) && (await a.rowsNow('coach_board_items')).find((i) => i.id === card?.id)?.stage_id === podStages[1]?.id);
        pass(`${tag}: and the keyboard stays on the card`, await page.evaluate((id) => document.activeElement?.dataset?.card === id, card?.id));
        await undo(page);
        pass(`${tag}: Undo puts it back`, (await a.rowsNow('coach_board_items')).find((i) => i.id === card?.id)?.stage_id === podStages[0]?.id);

        // Speaking as a table: a field typed over, a stage chosen.
        await go(page, `/coach/boards/${CRM.speaking}`);
        await press(page, 'Table');
        const heads = await page.locator('.cc-brd-table thead th').allInnerTexts();
        pass(`${tag}: the table's headings are Name, Stage and the board's own fields`, JSON.stringify(heads.map((h) => h.trim()).filter(Boolean)) === JSON.stringify(['Name', 'Stage', 'Date', 'Fee', 'Audience']), heads.join(', '));
        await page.getByRole('button', { name: 'Fee, £4,500. Edit' }).click(); await settle(page, 300);
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('£5,250'); await page.keyboard.press('Enter'); await settle(page, 800);
        const cipd = async () => (await a.rowsNow('coach_board_items')).find((i) => i.title === 'CIPD Festival of Work');
        pass(`${tag}: a fee typed over saves: “Saved”, £5,250`, /Saved/.test(await toastText(page)) && (await cipd())?.field_values?.fee === 5250, JSON.stringify((await cipd())?.field_values));
        await undo(page);
        pass(`${tag}: Undo puts £4,500 back`, (await cipd())?.field_values?.fee === 4500);
        await page.getByRole('button', { name: 'Fee, empty. Edit' }).first().click(); await settle(page, 300);
        await page.keyboard.type('lots'); await page.keyboard.press('Enter'); await settle(page, 700);
        pass(`${tag}: a fee that isn't an amount is refused calmly`, /Type an amount in numbers/.test(await toastText(page)));
        await page.keyboard.press('Escape'); await settle(page, 300);
        await page.getByRole('button', { name: 'Stage, Ideas. Edit' }).click(); await settle(page, 400);
        await page.getByRole('menuitemcheckbox', { name: 'Confirmed' }).click(); await settle(page, 900);
        pass(`${tag}: a stage is chosen from the stage list: “Moved to Confirmed.”`, /Moved to Confirmed\./.test(await toastText(page)) && (await a.rowsNow('coach_board_items')).find((i) => i.title === 'League Managers Association')?.stage_id === CRM.spConfirmed);
        await undo(page);

        // Edit this board: a stage taken out (its cards move), one added, shared.
        await press(page, 'Edit this board');
        d = dialog(page);
        pass(`${tag}: sharing is off until the owner turns it on`, await d.getByRole('switch').getAttribute('aria-checked') === 'false' && (await d.innerText()).includes('Off means only you can see this board.'));
        await d.getByRole('button', { name: 'Remove Pitched' }).click(); await settle(page, 300);
        await press(page, 'Add stage', d);
        await d.getByLabel('Stage 4’s name').fill('Invoiced');
        await d.getByRole('switch').click(); await settle(page, 300);
        await press(page, 'Save', d); await settle(page, 700);
        let board = (await a.rowsNow('coach_boards')).find((b) => b.id === CRM.speaking);
        let names = (await stagesOf(CRM.speaking)).map((s) => s.name);
        pass(`${tag}: saved in one go: shared, Pitched gone, Invoiced last`, /^Shared\./.test((await toastText(page)).trim()) && board?.shared === true && JSON.stringify(names) === JSON.stringify(['Ideas', 'Confirmed', 'Done', 'Invoiced']), `${await toastText(page)} ${names.join(', ')}`);
        let inIdeas = (await a.rowsNow('coach_board_items')).filter((i) => i.board_id === CRM.speaking && i.stage_id === CRM.spIdeas).map((i) => i.title).sort();
        pass(`${tag}: Pitched's two cards moved to Ideas, the stage before it`, JSON.stringify(inIdeas) === JSON.stringify(['CIPD Festival of Work', 'Henley Business School alumni', 'League Managers Association']), inIdeas.join(', '));
        await undo(page);
        board = (await a.rowsNow('coach_boards')).find((b) => b.id === CRM.speaking);
        names = (await stagesOf(CRM.speaking)).map((s) => s.name);
        inIdeas = (await a.rowsNow('coach_board_items')).filter((i) => i.board_id === CRM.speaking && i.stage_id === CRM.spIdeas).map((i) => i.title);
        pass(`${tag}: Undo: not shared, Pitched back with its cards, Invoiced gone`, board?.shared === false && JSON.stringify(names) === JSON.stringify(['Ideas', 'Pitched', 'Confirmed', 'Done']) && inIdeas.length === 1, `${board?.shared} ${names.join(', ')} ${inIdeas.length}`);

        // Delete the board (set aside, so Undo brings it back whole).
        await go(page, `/coach/boards/${made.id}`);
        await press(page, 'Edit this board');
        await press(page, 'Delete the board', dialog(page)); await settle(page, 700);
        pass(`${tag}: Delete the board: “Deleted”, back on Boards, and it is gone from the list`, /Deleted/.test(await toastText(page)) && new URL(page.url()).pathname === '/coach/boards' && !(await words(page)).includes('Podcast guests 2027'));
        await undo(page);
        pass(`${tag}: Undo brings it back with its card`, (await words(page)).includes('Podcast guests 2027') && has(await words(page), ['4 stages', '1 card']));
        await a.close();
      }

      if (on('crm-shared')) {
        const tag = `crm-shared, ${mode}`;
        const a = await openAt({ role: 'associate', db, tag, path: '/coach/boards', rows: withSharedBoard() });
        const { page } = a;
        let text = await words(page);
        pass(`${tag}: an associate's Boards has the shared board and not the unshared one, and no New board`, text.includes('Speaking') && !text.includes('Partners') && !text.includes('New board'), text.slice(0, 160));
        if (db === 'there') pass(`${tag}: the database handed over only the shared board, its stages and its cards`, JSON.stringify((await a.deviceRows('coach_boards')).map((b) => b.name)) === JSON.stringify(['Speaking']) && (await a.deviceRows('coach_board_stages')).every((s) => s.board_id === CRM.speaking) && (await a.deviceRows('coach_board_items')).every((i) => i.board_id === CRM.speaking), (await a.deviceRows('coach_boards')).map((b) => b.name).join(', '));
        await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600);
        const menu = await page.locator('.cc-menu').innerText();
        pass(`${tag}: the menu has Boards with Speaking under it, and no Partners, Leads or Network`, /Boards\s+Speaking/.test(menu) && !/Partners|Leads|Network/.test(menu), menu.replace(/\n/g, ' ').slice(0, 200));
        await page.keyboard.press('Escape'); await settle(page, 400);
        await go(page, `/coach/boards/${CRM.speaking}`);
        text = await words(page);
        pass(`${tag}: the shared board says whose it is and that it can't be edited`, /(Alex’s|The owner’s) board\. You can see it and can’t edit it\./.test(text) && text.includes('CIPD Festival of Work'), text.slice(0, 200));
        pass(`${tag}: with no Edit this board and no Add card`, !text.includes('Edit this board') && !text.includes('Add card'));
        const before = JSON.stringify((await a.deviceRows('coach_board_items')).map((i) => [i.id, i.stage_id]).sort());
        await page.locator('[data-card]').first().focus(); await page.keyboard.press('ArrowRight'); await settle(page, 700);
        pass(`${tag}: the arrow keys move nothing`, JSON.stringify((await a.deviceRows('coach_board_items')).map((i) => [i.id, i.stage_id]).sort()) === before);
        await page.getByRole('button', { name: /CIPD Festival of Work/ }).first().click(); await settle(page, 600);
        const d = dialog(page);
        pass(`${tag}: a card opens to read, with nothing to save or delete`, has(await d.innerText(), ['Stage', 'Pitched', 'Fee', '£4,500']) && await d.getByRole('button', { name: /^(Save|Delete|Add card)$/ }).count() === 0, (await d.innerText()).replace(/\n/g, ' ').slice(0, 160));
        await page.keyboard.press('Escape'); await settle(page, 400);
        await go(page, `/coach/boards/${CRM.partners}`);
        pass(`${tag}: the unshared board's own address shows nothing of it`, (await words(page)).includes('This board isn’t here any more.') && !(await words(page)).includes('Quillmark'));
        await go(page, '/coach/leads/automations');
        pass(`${tag}: Automations sends an associate to their own Today`, new URL(page.url()).pathname === '/coach');
        await openSearch(page); await page.keyboard.type('board'); await settle(page, 500);
        let found = await page.locator('.cc-jump').innerText();
        pass(`${tag}: search offers an associate no New board and no Automations`, !/New board|Automation/.test(found), found.replace(/\n/g, ' ').slice(0, 160));
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('speaking'); await settle(page, 500);
        found = await page.locator('.cc-jump').innerText();
        pass(`${tag}: search finds the shared board by name`, found.includes('Speaking') && /Board/.test(found), found.replace(/\n/g, ' ').slice(0, 160));
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('partners'); await settle(page, 500);
        pass(`${tag}: and never the unshared one`, !(await page.locator('.cc-jump').innerText()).replace('“partners”', '').includes('Partners'));
        await page.keyboard.press('Escape');
        await a.close();
        // With nothing shared, an associate has no Boards in the menu at all.
        const b = await openAt({ role: 'associate', db, tag: `${tag}, nothing shared`, path: '/coach', rows: (() => { const r = withSharedBoard(); r.coach_boards = r.coach_boards.map((x) => ({ ...x, shared: false })); return r; })() });
        await b.page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(b.page, 600);
        pass(`${tag}: with nothing shared, the menu has no Boards`, !/Boards|Speaking/.test(await b.page.locator('.cc-menu').innerText()));
        await b.page.keyboard.press('Escape');
        await go(b.page, '/coach/boards');
        pass(`${tag}: and Boards' own address says calmly that nothing is shared`, (await words(b.page)).includes('No board is shared with you yet.'));
        await b.close();
      }

      // ---------------------------------------------------------------- emails logged by themselves
      if (on('crm-email')) {
        const tag = `crm-email, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/settings/email' });
        const { page } = a;
        const sam = a.seed.client_profiles.find((p) => p.id === ID.sam);
        let text = await words(page);
        pass(`${tag}: before the email service is set up, each address says so calmly, and so does Gmail`, (text.match(/This address is ready once the email service is set up\./g) || []).length === 2 && text.includes('Gmail isn’t set up yet. The copy-in address does the same job in the meantime.') && !/@in\./.test(text), text.replace(/\n/g, ' ').slice(0, 300));
        await page.getByRole('switch', { name: 'Use stand-in addresses on this device' }).click(); await settle(page, 800);
        text = await words(page);
        const logAddress = (/log\.[a-z0-9.]+@in\.example\.invalid/.exec(text) || [''])[0];
        const todoAddress = (/todo\.[a-z0-9.]+@in\.example\.invalid/.exec(text) || [''])[0];
        pass(`${tag}: with the stand-in on (this build only), the two addresses show, each with Copy`, Boolean(logAddress) && Boolean(todoAddress) && await page.getByRole('button', { name: /^Copy the / }).count() === 2, `${logAddress ? 'log' : ''} ${todoAddress ? 'todo' : ''}`);
        await page.getByRole('button', { name: 'Copy the copy-in address' }).click(); await settle(page, 500);
        pass(`${tag}: Copy says “Copied”`, /Copied/.test(await toastText(page)), await toastText(page));
        const logKey = logAddress.split('@')[0];
        const todoKey = todoAddress.split('@')[0];

        // The stand-in database is told the signed-in account's own address, as the real one knows it (kept in memory, never printed).
        if (a.there) a.store.accountEmail = await page.evaluate(() => JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}')?.user?.email || null);
        // An email the owner sent with the address copied in: to a lead and someone unknown, with a contact and a client copied.
        const arrive = (key, email) => page.evaluate(async ([k, e]) => {
          // The owner's own address (the saved test sign-in's; it never leaves the page).
          const own = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}')?.user?.email || 'owner@example.invalid';
          const s = window.__clarityEmailSync;
          s.copyIn().arrive(k, { ...e, from: e.from === 'me' ? { name: 'Alex Morgan', email: own } : e.from });
          return s.round();
        }, [key, email]);
        const sent = { from: 'me', to: [{ name: 'Amy Cole', email: 'amy.cole@example.invalid' }, { name: 'Priya Shah', email: 'priya.shah@example.invalid' }], cc: [{ name: 'Jo Mensah', email: 'jo@example.invalid' }, { name: sam.name, email: sam.email }],
          subject: 'Dates for January', text: 'Here are three dates for January.\n\nAlex', message_id: 'd4-flow-1@example.invalid' };
        let done = await arrive(logKey, sent); await settle(page, 900);
        pass(`${tag}: an email copied in is logged once, with one person waiting`, done.logged === 1 && done.waiting === 1, JSON.stringify(done));
        const kept = (await a.rowsNow('coach_emails')).filter((e) => e.subject === 'Dates for January');
        const links = (await a.rowsNow('coach_email_links')).filter((l) => l.email_id === kept[0]?.id).map((l) => `${l.person_kind}:${l.person_id}`).sort();
        pass(`${tag}: it belongs to the lead, the client and the organisation's contact it names`, kept.length === 1 && JSON.stringify(links) === JSON.stringify([`client:${ID.sam}`, `contact:${a.seed.organisation_contacts.find((c) => c.name === 'Jo Mensah').id}`, `lead:${CRM.amy}`].sort()), links.join(', '));
        done = await arrive(logKey, sent); await settle(page, 600);
        pass(`${tag}: the same email arriving again is kept once`, done.logged === 0 && (await a.rowsNow('coach_emails')).filter((e) => e.subject === 'Dates for January').length === 1, JSON.stringify(done));
        await go(page, `/coach/leads/${CRM.amy}`);
        pass(`${tag}: it is on the lead's timeline: “You emailed: Dates for January”`, (await words(page)).includes('You emailed: Dates for January'));
        await go(page, `/coach/clients/${ID.sam}`);
        await press(page, 'Everything');
        pass(`${tag}: and on the client's timeline`, (await words(page)).includes('You emailed: Dates for January'));
        await page.getByRole('button', { name: /You emailed: Dates for January/ }).click(); await settle(page, 700);
        let d = dialog(page);
        pass(`${tag}: it opens with what it says`, has(await d.innerText(), ['Dates for January', 'Here are three dates for January.', 'Hide this thread']), (await d.innerText()).replace(/\n/g, ' ').slice(0, 200));
        pass(`${tag}: nothing in it replies or sends`, await d.getByRole('button', { name: /reply|send|forward/i }).count() === 0);
        await press(page, 'Hide this thread', d);
        pass(`${tag}: Hide this thread takes it off the timeline, with Undo`, /Hidden from this timeline\./.test(await toastText(page)) && !(await words(page)).includes('You emailed: Dates for January'));
        await undo(page);
        pass(`${tag}: Undo shows it again`, (await words(page)).includes('You emailed: Dates for January'));
        await go(page, `/coach/organisations/${ID.kestrel}`);
        const joRow = await page.getByRole('button', { name: 'Edit Jo Mensah' }).innerText();
        pass(`${tag}: the contact's row in Who's who says when they were emailed`, joRow.includes('Emailed Tue 17 Nov'), joRow.replace(/\n/g, ' '));
        await go(page, '/coach/leads');
        pass(`${tag}: the person who isn't in the portal waits on Leads, with Add as a lead and Not now`, has(await words(page), ['You emailed Priya Shah, who isn’t in the portal yet.', 'Add as a lead', 'Not now']));
        await press(page, 'Add as a lead'); await settle(page, 600);
        const priya = (await a.rowsNow('coach_leads')).find((l) => l.name === 'Priya Shah');
        pass(`${tag}: Add as a lead makes the lead, with the email on her timeline`, Boolean(priya) && priya.source === 'email' && (await a.rowsNow('coach_email_links')).some((l) => l.person_kind === 'lead' && l.person_id === priya.id), priya?.source);

        // An email forwarded to the to-do address makes one to-do.
        const fwd = { from: { name: 'Ruth Adams', email: 'ruth.adams@example.invalid' }, subject: 'Fwd: Reply to Ruth about the January start', text: 'Can we start in January?', message_id: 'd4-flow-2@example.invalid' };
        done = await arrive(todoKey, fwd); await settle(page, 700);
        const again = await arrive(todoKey, fwd); await settle(page, 700);
        const todos = (await a.rowsNow('coach_todos')).filter((t) => t.from_email_ref === 'd4-flow-2@example.invalid');
        pass(`${tag}: forwarded to the to-do address, it makes one to-do, once`, done.todos === 1 && again.todos === 0 && todos.length === 1 && todos[0].title === 'Reply to Ruth about the January start' && todos[0].from_email_sender === 'Ruth Adams', JSON.stringify([done, again, todos.map((t) => t.title)]));
        await go(page, '/coach/todos');
        await page.getByRole('tab', { name: 'Someday' }).click().catch(() => page.getByRole('button', { name: 'Someday', exact: true }).click()); await settle(page, 600);
        await page.getByText('Reply to Ruth about the January start', { exact: true }).first().click(); await settle(page, 700);
        d = dialog(page);
        pass(`${tag}: the to-do says where it came from: “Email from Ruth Adams”, “Forwarded by email”, “Sent you this by email”`, has(await d.innerText(), ['Attachments', 'Email from Ruth Adams', 'Forwarded by email', 'Linked to', 'Sent you this by email']), (await d.innerText()).replace(/\n/g, ' ').slice(-300));
        await page.keyboard.press('Escape'); await settle(page, 400);

        // Gmail's stand-in: read only, and only while "Log Gmail with clients and leads" is on.
        await go(page, '/coach/settings/email');
        await page.getByRole('switch', { name: 'Use a stand-in Gmail on this device' }).click(); await settle(page, 600);
        const inGmail = (email) => page.evaluate(async (e) => { const s = window.__clarityEmailSync; s.gmail().inGmail.receive(e); return s.round(); }, email);
        done = await inGmail({ from: { name: 'Amy Cole', email: 'amy.cole@example.invalid' }, subject: 'Re: Dates for January', text: 'The 14th works for us.' }); await settle(page, 600);
        pass(`${tag}: with the switch off, nothing in Gmail is read or logged`, done.logged === 0 && !(await a.rowsNow('coach_emails')).some((e) => e.source === 'gmail'), JSON.stringify(done));
        await page.getByRole('switch', { name: 'Log Gmail with clients and leads' }).click(); await settle(page, 900);
        done = await page.evaluate(() => window.__clarityEmailSync.round()); await settle(page, 800);
        pass(`${tag}: switched on, the email from Gmail is logged once`, done.logged === 1 && (await a.rowsNow('coach_emails')).filter((e) => e.source === 'gmail').length === 1, JSON.stringify(done));
        pass(`${tag}: a second round logs nothing twice`, (await page.evaluate(() => window.__clarityEmailSync.round())).logged === 0);
        await go(page, `/coach/leads/${CRM.amy}`);
        pass(`${tag}: it is on Amy's timeline as her reply`, (await words(page)).includes('Amy replied: Dates for January'));
        await page.getByRole('button', { name: /Amy replied: Dates for January/ }).click(); await settle(page, 700);
        d = dialog(page);
        pass(`${tag}: opened, it offers Open in Gmail (a link, nothing more)`, await d.getByRole('link', { name: 'Open in Gmail' }).count() === 1 && (await d.innerText()).includes('The 14th works for us.'));
        await page.keyboard.press('Escape');
        await a.close();
      }

      // ---------------------------------------------------------------- past clients stay warm
      if (on('crm-past')) {
        const tag = `crm-past, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/clients/past' });
        const { page } = a;
        let text = await words(page);
        pass(`${tag}: Past clients has the switch, Check-ins due and Everyone`, has(text, ['Suggest check-ins at 3, 6 and 12 months', 'Check-ins due', 'Everyone', 'Omar Haddad']), missing(text, ['Suggest check-ins at 3, 6 and 12 months', 'Check-ins due', 'Everyone', 'Omar Haddad']));
        const dueRows = async () => (await page.locator('.ds-card', { hasText: /check-ins due/i }).locator('.ds-li').allInnerTexts()).map((r) => r.replace(/\s*\n\s*/g, ' | '));
        let due = await dueRows();
        pass(`${tag}: three are due, the soonest first, each with which check-in and when`, due.length === 3 && /^Ben Ortiz \| 3-month check-in.*Due Wed 18 Nov$/.test(due[0]) && /^Leah Moran \| 12-month check-in.*Harbour City FC.*Due Mon 23 Nov$/.test(due[1]) && /^Grace Liu \| 6-month check-in.*Due Thu 10 Dec$/.test(due[2]), due.join(' || '));
        await page.locator('.ds-li', { hasText: 'Grace Liu' }).filter({ hasText: '6-month check-in' }).click(); await settle(page, 700);
        let d = dialog(page);
        const note = () => d.getByLabel('A note to Grace').inputValue();
        pass(`${tag}: a check-in opens a drafted note`, has(await d.innerText(), ['6-month check-in, due Thu 10 Dec', 'A note to Grace', 'Nothing is sent until you send it from your own email.']) && (await note()).includes('It’s been 6 months since we finished working together'), (await note()).slice(0, 80));
        await press(page, 'Add referral ask', d);
        pass(`${tag}: Add referral ask puts the gentle ask in the note`, (await note()).includes('If anyone you know is facing something similar, I’d be glad to be introduced.') && await d.getByRole('button', { name: 'Take out the referral ask' }).count() === 1);
        const href = await d.getByRole('link', { name: 'Open in my email' }).getAttribute('href');
        pass(`${tag}: Open in my email is a mailto link carrying the note (the coach's own email app; nothing is sent from here)`, /^mailto:/.test(href || '') && decodeURIComponent(href).includes('glad to be introduced') && decodeURIComponent(href).includes('subject=How are things?'), (href || '').slice(0, 30).replace(/:.*@/, ':…@'));
        await d.getByRole('link', { name: 'Open in my email' }).click(); await settle(page, 900);
        const grace = async () => (await a.rowsNow('client_check_ins')).find((c) => c.id === CRM.ciGrace);
        pass(`${tag}: the check-in is then done, with its note kept, and leaves the list`, Boolean((await grace())?.done_at) && ((await grace())?.note || '').includes('glad to be introduced') && (await dueRows()).length === 2, `${(await dueRows()).length} due`);
        await undo(page);
        pass(`${tag}: Undo brings it back`, !(await grace())?.done_at && (await dueRows()).length === 3);
        await page.locator('.ds-li', { hasText: 'Ben Ortiz' }).filter({ hasText: '3-month check-in' }).click(); await settle(page, 700);
        d = dialog(page);
        pass(`${tag}: at 3 months the ask offered is a testimonial`, await d.getByRole('button', { name: 'Add testimonial ask' }).count() === 1);
        await press(page, 'Not now', d);
        due = await dueRows();
        pass(`${tag}: Not now moves it two weeks on: “Moved to Tue 1 Dec.”`, /Moved to Tue 1 Dec\./.test(await toastText(page)) && due.some((r) => /^Ben Ortiz .*Due Tue 1 Dec$/.test(r)), due.join(' || '));

        // Today's Keep in touch: one quiet line each.
        await go(page, '/coach');
        text = await words(page);
        const keep = (await page.locator('.cc-today-keep').locator('.ds-li').allInnerTexts()).map((r) => r.replace(/\s*\n\s*/g, ' | '));
        pass(`${tag}: Today's Keep in touch has one quiet line for each check-in due, the soonest first`, keep.length === 3 && /^Leah Moran \| 12-month check-in \| Due Mon 23 Nov$/.test(keep[0]) && /^Ben Ortiz/.test(keep[1]) && /^Grace Liu/.test(keep[2]), keep.join(' || '));
        await page.getByRole('button', { name: /^Leah Moran: 12-month check-in/ }).click(); await settle(page, 700);
        pass(`${tag}: a line opens the same note`, has(await dialog(page).innerText(), ['12-month check-in', 'A note to Leah']) && (await dialog(page).getByLabel('A note to Leah').inputValue()).includes('It’s been a year since we finished working together'), (await dialog(page).getByLabel('A note to Leah').inputValue()).slice(0, 80));
        await page.keyboard.press('Escape'); await settle(page, 400);

        // The switch.
        await go(page, '/coach/clients/past');
        await page.getByRole('switch', { name: 'Suggest check-ins at 3, 6 and 12 months' }).click(); await settle(page, 800);
        pass(`${tag}: switched off: “Check-ins won’t be suggested.”, and Check-ins due goes`, /Check-ins won’t be suggested\./.test(await toastText(page)) && !/check-ins due/i.test(await words(page)));
        await go(page, '/coach');
        pass(`${tag}: and Today has no Keep in touch`, !/keep in touch/i.test(await words(page)));
        await go(page, '/coach/clients/past');
        await page.getByRole('switch', { name: 'Suggest check-ins at 3, 6 and 12 months' }).click(); await settle(page, 900);
        const omar = (await a.rowsNow('client_check_ins')).filter((c) => c.profile_id === CRM.omar).map((c) => c.months).sort((x, y) => x - y);
        pass(`${tag}: switched on again, the check-ins still to come are suggested for someone who had none (Omar: 3, 6 and 12 months)`, /Check-ins will be suggested\./.test(await toastText(page)) && JSON.stringify(omar) === JSON.stringify([3, 6, 12]), omar.join(', '));
        const leah = (await a.rowsNow('client_check_ins')).filter((c) => c.profile_id === CRM.leah).map((c) => c.months);
        pass(`${tag}: and none that has already passed (Leah keeps only her 12-month one)`, JSON.stringify(leah) === JSON.stringify([12]), leah.join(', '));
        await a.close();
      }

      // ---------------------------------------------------------------- the account map
      if (on('crm-map')) {
        const tag = `crm-map, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/organisations/${ID.kestrel}` });
        const { page } = a;
        let text = await words(page);
        const MAP = ['Who’s who', 'Dana Whitfield', 'Sponsor', 'Decides on renewals', 'Jo Mensah', 'HR', 'Asked about team workshops', 'Spoke Sun 1 Nov', 'Agreements and proposals', 'Leadership Accelerator for Sam', 'Active', '£13,460', 'Portal seats', '20 seats', '£640/month',
          'Team workshops for the leadership team', 'Proposal sent', '£5,640', 'Opened 2 times', 'Room to grow', '6 of 20 seats are free.', 'Offer the seats', 'Plan a renewal', 'No workshop is booked for next quarter.', 'Add to the pipeline', 'Next renewal'];
        pass(`${tag}: the account map has its three parts as M11 draws them`, has(text, MAP), missing(text, MAP));
        pass(`${tag}: a monthly rate is spoken as “per month”`, await page.locator('.cc-map-deal b[aria-label="£640 per month"]').count() === 1);

        await press(page, 'Add agreement or proposal');
        let d = dialog(page);
        await press(page, 'Add to this organisation', d);
        pass(`${tag}: an agreement with no name says what's missing`, (await d.innerText()).includes('Type its name to carry on.'));
        await d.getByLabel('What is it called?').fill('Board retreat');
        await choose(page, 'What is it?', 'Proposal', d);
        await d.getByLabel('Value', { exact: true }).fill('7.2k');
        await press(page, 'Add to this organisation', d);
        text = await words(page);
        pass(`${tag}: a proposal is added: “Added”, sent, £7,200`, /Added/.test(await toastText(page)) && has(text, ['Board retreat', '£7,200']) && (await a.rowsNow('organisation_deals')).find((x) => x.name === 'Board retreat')?.status === 'sent');
        await page.getByRole('button', { name: 'Edit Portal seats' }).click(); await settle(page, 600);
        d = dialog(page);
        await d.getByLabel('Value', { exact: true }).fill('£700');
        await press(page, 'Save my edit', d);
        pass(`${tag}: an agreement's value is edited: £700/month`, (await words(page)).includes('£700/month'));
        await undo(page);
        pass(`${tag}: Undo puts £640/month back`, (await words(page)).includes('£640/month'));

        // Room to grow: its one thing to do next goes into the pipeline.
        const leadsBefore = (await a.rowsNow('coach_leads')).length;
        await page.getByRole('button', { name: 'Add to the pipeline: No workshop is booked for next quarter.' }).click(); await settle(page, 900);
        const lead = (await a.rowsNow('coach_leads')).find((l) => l.next_step === 'No workshop is booked for next quarter');
        pass(`${tag}: Add to the pipeline makes a lead for the organisation, with its sponsor as the person and the line as the next step`, (await a.rowsNow('coach_leads')).length === leadsBefore + 1 && lead?.name === 'Dana Whitfield' && lead?.organisation === 'Kestrel Group' && lead?.organisation_id === ID.kestrel && lead?.stage_id === CRM.stNew, JSON.stringify([lead?.name, lead?.organisation]));
        const line = page.locator('.cc-line', { hasText: 'No workshop is booked for next quarter.' });
        pass(`${tag}: the line then opens that lead`, (await line.innerText()).includes('Open the lead'));
        await undo(page);
        pass(`${tag}: Undo takes the lead out and puts the line back`, (await a.rowsNow('coach_leads')).length === leadsBefore && (await line.innerText()).includes('Add to the pipeline'));

        // Who's who: the roles on offer follow the database (Buyer, HR and Participant arrive with 052).
        await press(page, 'Add someone');
        const roles = await dialog(page).locator('.ds-chip').allInnerTexts();
        pass(`${tag}: Add someone offers ${db === 'there' ? 'Sponsor, Buyer, HR, Participant and Invoices' : 'Sponsor and Invoices until 052 is there (the older rule would refuse the others)'}`, JSON.stringify(roles) === JSON.stringify(db === 'there' ? ['Sponsor', 'Buyer', 'HR', 'Participant', 'Invoices'] : ['Sponsor', 'Invoices']), roles.join(', '));
        await page.keyboard.press('Escape');
        await a.close();
      }
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  report.done();
}

run().catch((e) => { console.error(`STOPPED: ${String(e).split("\n")[0].slice(0, 300)}`, e.stack?.split("\n").slice(0, 4).join(" | ")); process.exit(1); });
