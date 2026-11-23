// Network, walked (Phase 6a run 4, step 4) as the owner in both database
// modes (device only: 049 to 052 "not yet"; and 049 to 052 answered by the
// stand-ins in shared.mjs and crm-standin.mjs), then as an associate, who
// never sees it. Nothing reaches the test project and NOTHING IS EVER SENT:
// every write is the stand-in's, or is stopped and listed; Email and
// WhatsApp are only ever links to the coach's own apps; no /api/ call is
// made by any of these pages.
//
//   net-actions    Due now most overdue first, folding after 8; Coming up soonest first, folding after 4; a catch-up logged
//                  ("I spoke to Sofia today") with Undo; Not now, in 2 weeks; Add someone (never greyed out) with Undo
//   net-archive    the Ready to archive? card; Review them with everyone ticked; one unticked, "Archive 2", Undo; the unticked
//                  one isn't suggested again; Not now; Archive on a person's panel, the archive with its own back link, Restore
//   net-table      search with the count and Clear; every heading's Sort and Show only; a rating and the rhythm in a small
//                  floating menu; cells typed over (Enter saves, Escape puts back, a wrong value is said calmly); "Saved." with
//                  Undo and Where to focus following; + adds a column; Show or hide columns
//   net-many       1,200 people: 50 rows at a time with "Show 50 more", asked in pages and never everyone at once; the table's
//                  own box keeps its headings and its Name column on a phone; how long the first page, a sort, a search and
//                  the map take
//   net-map        up to 150 with the line; a dot's pop-up card; a single dot opens the person, a numbered dot the list of names;
//                  Show; Find someone; How to read the map with "Don’t show me this again"; on a phone the nearest dot wins
//   net-person     Edit contact details, Edit ratings (kept with its date), Log what you gave, Log an ask, the count line, Move
//                  to Leads (which keeps them in Network), Email and WhatsApp as links to the coach's own apps
//   net-import     a pasted sheet with odd columns: columns matched, duplicates first, Add anyway, Undo; an Excel file read in
//                  the page; a file that can't be read said calmly; Export downloads every column
//   net-today      Today's Keep in touch lines (people due, then past clients' check-ins), the menu's count, and search
//   net-offline    049 to 052 there: a reload with no connection shows the device's last copy at once (run 6, item 9), never
//                  an empty Network or "needs a connection the first time"; back online, a reload asks the database again
//   net-associate  an associate opening Network lands on their own Today, with no Network in the menu or in search
//   net-arrive     kept on the device before 052, then 049 to 052 arrive: Network's people move across once
//
//   PARTS=net-actions,…   DB=none,there
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, seedNetworkDevice, settle, SIZES, standIn, toastText } from './shared.mjs';
import { CRM, manyNetwork, networkDeviceSeed, networkSeed, seedClock, seedWithCrm } from './seed.mjs';
import { mapProblems, readMap, tableFrozen } from './net-rules.mjs';
import { xlsxBytes, xlsxTable } from '../../src/lib/coach/xlsx.js';

export const NETWORK_PARTS = ['net-actions', 'net-archive', 'net-table', 'net-many', 'net-map', 'net-person', 'net-merge', 'net-import', 'net-today', 'net-offline', 'net-associate', 'net-arrive'];
const TUE = new Date(2026, 10, 17, 9, 0);
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const press = async (page, name, scope = page) => { await scope.getByRole('button', { name, exact: true }).first().click(); await settle(page, 600); };
const go = async (page, path) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 1300); };
const words = (page) => page.evaluate(() => (document.querySelector('.cc-main')?.innerText || '').replace(/ /g, ' '));
const panelWords = (page) => dialog(page).innerText().then((t) => t.replace(/ /g, ' ')).catch(() => '');
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 900); };
const choose = async (page, label, option, scope = page) => { await scope.getByLabel(label, { exact: true }).first().click(); await settle(page, 300); await page.getByRole('option', { name: option, exact: true }).first().click(); await settle(page, 500); };
const has = (text, list) => list.every((w) => text.toLowerCase().includes(w.toLowerCase()));
const missing = (text, list) => list.filter((w) => !text.toLowerCase().includes(w.toLowerCase())).join(' | ');
const forDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, coach_bookings: _b, coach_email_addresses: _e, coach_poll_votes: _v, coach_cal_reminder_sends: _r, network_people: _np, network_gives: _ng, network_ratings: _nr, network_merges: _nm, ...own } = rows; return own; };
const rowNames = (page) => page.locator('.cc-net-table tbody .cc-table-name').allInnerTexts();
const actionRows = (page, title) => page.locator('.cc-part', { has: page.locator('.ds-section-title', { hasText: title }) }).locator('.cc-row').evaluateAll((rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
const cell = (page, column, name) => page.locator('.cc-net-table').getByRole('button', { name: new RegExp(`^${column} for ${name}`) }).first();
const cellText = async (page, name, index) => (await page.locator('.cc-net-table tbody tr', { has: page.getByRole('button', { name, exact: true }) }).locator('td, th').nth(index).innerText()).trim();

async function run() {
  const report = makeReport('Network, the flows');
  const { pass } = report;
  const parts = (process.env.PARTS || NETWORK_PARTS.join(',')).split(',');
  const on = (p) => parts.includes(p);
  const dbs = (process.env.DB || 'none,there').split(',');
  const browser = await chromium.launch();
  const timings = [];

  /** A page signed in and standing in, its clock on M11's Tuesday, with Network in the stand-in database or on the device. */
  async function openAt({ role = 'owner', db, path, tag, many = 0, size = 1440, empty = false, keepOpen = false }) {
    const there = db === 'there';
    const ctx = await coachContext(browser, { size, theme: there ? 'light' : 'dark' });
    const page = await ctx.newPage();
    await page.setViewportSize(size === 1440 ? { width: 1440, height: 1100 } : SIZES[size]);
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
    const seed = seedWithCrm({ accounts: true });
    if (many) { seed.network_people = manyNetwork(many); seed.network_gives = []; seed.network_ratings = []; }
    if (empty) { seed.network_people = []; seed.network_gives = []; seed.network_ratings = []; }
    const people = seed.network_people;
    const store = await standIn(page, { role, db, day: there, cal: there, crm: there, strict: there, rows: there ? seed : {}, now: () => new Date(TUE) });
    // How Network was asked for: every page's size, and anything that read the people's table itself.
    const asked = { limits: [], pages: 0, maps: 0 };
    if (there && store.fn?.network_page) {
      const page0 = store.fn.network_page; const map0 = store.fn.network_map;
      store.fn.network_page = (args = {}) => { asked.limits.push(args.p_limit ?? 50); asked.pages += 1; return page0(args); };
      store.fn.network_map = (args = {}) => { asked.maps += 1; return map0(args); };
    }
    await page.route('**/api/**', (route) => { api.push(new URL(route.request().url()).pathname); return json(route, { ok: true, sent: false }); });
    await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
    await page.route('**/rest/v1/organisation_access_codes*', (route) => (route.request().method() === 'GET' ? json(route, []) : route.abort()));
    for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
    if (!there) await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    const me = await accountId(page);
    await clearDevice(page, me);
    // What the page asks from here on: the first load above may read a role this device remembered from an earlier run.
    const callsFrom = store.calls.length;
    if (!there) {
      await seedDevice(page, me, forDevice(seed));
      if (role === 'owner') await seedNetworkDevice(page, me, many || empty ? { people, gives: [], ratings: [] } : networkDeviceSeed());
    }
    if (path) await go(page, path);
    const devicePeople = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"people":{}}').people || {}), me);
    const deviceGives = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"gives":{}}').gives || {}), me);
    const deviceRows = (table) => page.evaluate(([id, t]) => {
      const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || localStorage.getItem(`clarity-cache:${id}:coach`) || '{}');
      return Object.values(kept.rows?.[t] || {});
    }, [me, table]);
    return {
      page, ctx, store, me, there, errors, seed, asked, callsFrom,
      /** Network's people as they are kept now: in the stand-in database, or on the device. */
      peopleNow: async () => (there ? store.rows.network_people || [] : devicePeople()),
      givesNow: async () => (there ? store.rows.network_gives || [] : deviceGives()),
      rowsNow: async (table) => (there ? store.rows[table] || [] : deviceRows(table)),
      async close() {
        await Promise.all(waits);
        const blocked = store.calls.filter((c) => c.startsWith('blocked'));
        pass(`${tag}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
        pass(`${tag}: nothing was written to the test project`, reached.length === 0 && blocked.length === 0, [...new Set([...reached, ...blocked])].slice(0, 4).join('; '));
        pass(`${tag}: nothing asked the server to send anything (no /api/ call at all)`, api.length === 0, [...new Set(api)].join(', '));
        if (keepOpen) return;
        await clearDevice(page, me);
        await ctx.close();
      },
    };
  }

  try {
    for (const db of dbs) {
      const mode = db === 'there' ? '049 to 052 there' : 'on the device';

      // ---------------------------------------------------------------- Actions
      if (on('net-actions')) {
        const tag = `net-actions, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network' });
        const { page } = a;
        pass(`${tag}: Network opens on Actions, the first of three underlined tabs`, (await page.getByRole('tab').allInnerTexts()).join(',') === 'Actions,Table,Map' && await page.getByRole('tab', { name: 'Actions' }).getAttribute('aria-selected') === 'true');
        let due = await actionRows(page, 'Due now');
        pass(`${tag}: Due now is the most overdue first and folds after 8`, due.length === 8 && /^Sofia Marsh Key contact Every 3 months 9 days overdue$/.test(due[0]) && /^Dana Whitfield Sponsor Every month 7 days overdue$/.test(due[1]) && /^Hannah Wells .* 5 days overdue$/.test(due[2]) && due.slice(3).every((r) => /3 days overdue$/.test(r)), due.slice(0, 3).join(' | '));
        await press(page, 'Show all 9');
        due = await actionRows(page, 'Due now');
        pass(`${tag}: Show all opens the rest (Dan Reid, 2 days overdue), and the link goes`, due.length === 9 && /^Dan Reid Referrer Every 3 months 2 days overdue$/.test(due[8]) && (await page.getByRole('button', { name: /^Show all 9$/ }).count()) === 0, due[8]);
        let coming = await actionRows(page, 'Coming up');
        pass(`${tag}: Coming up is the soonest first and folds after 4`, coming.length === 4 && /^Zara Fraser Referrer Every 6 months Due Sun 29 Nov$/.test(coming[0]) && /^Maya Kerr .* Due Mon 7 Dec$/.test(coming[1]), coming.join(' | '));
        await press(page, 'Show all 6');
        coming = await actionRows(page, 'Coming up');
        pass(`${tag}: its Show all opens all six`, coming.length === 6 && /^David Stark .* Due Fri 15 Jan 2027$/.test(coming[5]), coming[5]);

        // A catch-up logged.
        await page.locator('.cc-row', { hasText: 'Sofia Marsh' }).first().click(); await settle(page, 800);
        pass(`${tag}: a row opens the person in the side panel`, has(await panelWords(page), ['Sofia Marsh', 'Key contact, Citadel', 'You last spoke on Sat 8 Aug.', 'I spoke to Sofia today']), (await panelWords(page)).slice(0, 120));
        await press(page, 'I spoke to Sofia today', dialog(page));
        pass(`${tag}: “I spoke to Sofia today” says when next`, (await toastText(page)) === 'Logged. Next time is Wed 17 Feb 2027.', await toastText(page));
        pass(`${tag}: her panel follows`, (await panelWords(page)).includes('You last spoke today.'));
        await page.keyboard.press('Escape'); await settle(page, 700);
        due = await actionRows(page, 'Due now');
        pass(`${tag}: she leaves Due now at once`, !due.some((r) => r.startsWith('Sofia Marsh')) && /^Dana Whitfield/.test(due[0]), due[0]);
        pass(`${tag}: it is kept (last spoke today)`, (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.last_spoke_on === '2026-11-17');
        await undo(page);
        due = await actionRows(page, 'Due now');
        pass(`${tag}: Undo puts her back at the top, 9 days overdue`, /^Sofia Marsh .* 9 days overdue$/.test(due[0]) && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.last_spoke_on === '2026-08-08', due[0]);

        // Not now, in 2 weeks.
        await page.locator('.cc-row', { hasText: 'Dana Whitfield' }).first().click(); await settle(page, 800);
        await press(page, 'Not now, in 2 weeks', dialog(page));
        pass(`${tag}: “Not now, in 2 weeks” moves the catch-up`, (await toastText(page)) === 'Moved to Tue 1 Dec.', await toastText(page));
        await page.keyboard.press('Escape'); await settle(page, 700);
        coming = await actionRows(page, 'Coming up');
        pass(`${tag}: she is in Coming up for that day, and out of Due now`, coming.some((r) => /^Dana Whitfield .* Due Tue 1 Dec$/.test(r)) && !(await actionRows(page, 'Due now')).some((r) => r.startsWith('Dana')), coming.join(' | '));
        await undo(page);

        // Add someone.
        await page.locator('.cc-main .ds-addrow', { hasText: 'Add someone' }).click(); await settle(page, 700);
        pass(`${tag}: Add someone asks who, who they are to you and how often`, has(await panelWords(page), ['Add to your Network', 'Who?', 'Who are they to you?', 'Referrer', 'How often?', 'Every 3 months']), (await panelWords(page)).slice(0, 160));
        const addButton = dialog(page).getByRole('button', { name: 'Add', exact: true });
        pass(`${tag}: its button is never greyed out`, !(await addButton.isDisabled()) && (await addButton.getAttribute('aria-disabled')) !== 'true');
        await addButton.click(); await settle(page, 400);
        pass(`${tag}: pressed with no name, it says what is needed`, (await panelWords(page)).includes('Type their name to carry on.'));
        await dialog(page).getByLabel('Who?').fill('Nell Okoye');
        await choose(page, 'Who are they to you?', 'Key contact', dialog(page));
        await choose(page, 'How often?', 'Every month', dialog(page));
        await addButton.click(); await settle(page, 900);
        pass(`${tag}: she is added, with the toast`, (await toastText(page)) === 'Added. You’ll see them here when it’s time.' && (await a.peopleNow()).some((p) => p.name === 'Nell Okoye' && p.role === 'Key contact' && p.rhythm_months === 1), await toastText(page));
        // Coming up was opened in full above, and stays open as Network changes.
        if (await page.getByRole('button', { name: /^Show all \d+$/ }).count()) await press(page, /^Show all \d+$/);
        pass(`${tag}: she shows in Coming up, a month on`, (await actionRows(page, 'Coming up')).some((r) => /^Nell Okoye Key contact Every month Due Thu 17 Dec$/.test(r)), (await actionRows(page, 'Coming up')).join(' | '));
        await undo(page);
        pass(`${tag}: Undo takes her out again`, !(await a.peopleNow()).some((p) => p.name === 'Nell Okoye') && !(await words(page)).includes('Nell Okoye'));
        await a.close();
      }

      // ---------------------------------------------------------------- Ready to archive?, the archive, Restore
      if (on('net-archive')) {
        const tag = `net-archive, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network' });
        const { page } = a;
        pass(`${tag}: one quiet card says who is ready`, (await words(page)).includes('3 people have had no contact for 18 months and aren’t in a focus list.') && (await page.locator('.cc-net-card button').allInnerTexts()).join(',') === 'Review them,Not now');
        await press(page, 'Review them');
        let text = await panelWords(page);
        pass(`${tag}: Review them opens everyone, ticked`, has(text, ['Ready to archive?', '3 people', 'No contact for 18 months, and not in a focus list.', 'Bea Reeves', 'Daniel Vance', 'Zara Nash', 'Archive 3']) && (await dialog(page).getByRole('checkbox').evaluateAll((b) => b.every((x) => x.getAttribute('aria-checked') === 'true'))), missing(text, ['Archive 3']));
        await dialog(page).getByRole('checkbox', { name: /Daniel Vance/ }).click(); await settle(page, 300);
        pass(`${tag}: unticking someone keeps them: the button counts the rest`, (await dialog(page).getByRole('button', { name: 'Archive 2', exact: true }).count()) === 1);
        await press(page, 'Archive 2', dialog(page));
        pass(`${tag}: “Archive 2” archives them, with Undo`, (await toastText(page)) === 'Archived 2.' && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1, await toastText(page));
        let people = await a.peopleNow();
        const got = (id) => people.find((p) => p.id === id);
        pass(`${tag}: the two are archived with their history kept, and the one unticked is kept`, Boolean(got(CRM.beaR)?.archived_at) && Boolean(got(CRM.zaraN)?.archived_at) && !got(CRM.danielV)?.archived_at && got(CRM.danielV)?.keep === true && got(CRM.beaR)?.last_spoke_on != null);
        await settle(page, 600);
        pass(`${tag}: the card goes: the one unticked isn’t suggested again`, !(await words(page)).includes('no contact for 18 months'));
        await undo(page);
        people = await a.peopleNow();
        pass(`${tag}: Undo restores both, and the card is back for all three`, !got(CRM.beaR)?.archived_at && !got(CRM.zaraN)?.archived_at && (await words(page)).includes('3 people have had no contact for 18 months'), (await words(page)).slice(0, 80));

        // Everyone unticked: said calmly, nothing archived.
        await press(page, 'Review them');
        for (const box of await dialog(page).getByRole('checkbox').all()) await box.click();
        await press(page, 'Archive 0', dialog(page));
        pass(`${tag}: with everyone unticked it says so and archives nobody`, (await panelWords(page)).includes('Everyone is unticked, so nobody will be archived. Tick someone, or choose Cancel.'));
        await press(page, 'Cancel', dialog(page));

        // Not now.
        await press(page, 'Not now');
        pass(`${tag}: Not now hides the card for a month, with Undo`, (await toastText(page)) === 'Hidden for a month.' && !(await words(page)).includes('no contact for 18 months'), await toastText(page));
        await undo(page);
        pass(`${tag}: its Undo brings the card back`, (await words(page)).includes('3 people have had no contact for 18 months'));

        // Archive on a person's panel, the archive, Restore.
        await go(page, `/coach/network?tab=table&person=${CRM.umar}`);
        await press(page, 'Archive', dialog(page));
        pass(`${tag}: Archive on a person’s panel archives them and closes it`, (await toastText(page)) === 'Archived.' && (await dialog(page).count()) === 0 && !(await rowNames(page)).includes('Umar Young'), await toastText(page));
        pass(`${tag}: the link under the table counts the archive`, (await page.getByRole('button', { name: 'Archived, 3', exact: true }).count()) === 1);
        await press(page, 'Archived, 3');
        text = await words(page);
        pass(`${tag}: the archive lists them, with its own back link and no import or Add`, has(text, ['3 archived', 'Adam Ford', 'Priyesh Young', 'Umar Young']) && (await page.locator('.cc-backrow').innerText()).trim() === 'Network' && !text.includes('Import a spreadsheet') && !text.includes('Add someone'), text.slice(0, 120));
        pass(`${tag}: an archived person leaves Actions and the map`, !(await a.peopleNow()).find((p) => p.id === CRM.umar)?.archived_at === false);
        await press(page, 'Umar Young');
        text = await panelWords(page);
        pass(`${tag}: an archived person’s panel keeps their history and offers Restore`, has(text, ['Archived. Their history is kept.', 'Restore', 'Key contact, Westgate Schools']) && (await dialog(page).getByRole('button', { name: 'Archive', exact: true }).count()) === 0);
        await press(page, 'Restore', dialog(page));
        pass(`${tag}: Restore brings them back`, (await toastText(page)) === 'Restored.' && !(await a.peopleNow()).find((p) => p.id === CRM.umar)?.archived_at, await toastText(page));
        await page.keyboard.press('Escape'); await settle(page, 600);
        await page.locator('.cc-backrow button').click(); await settle(page, 900);
        pass(`${tag}: the back link returns to the table, where they are again`, (await rowNames(page)).includes('Umar Young') && (await page.getByRole('button', { name: 'Archived, 2', exact: true }).count()) === 1);
        await a.close();
      }

      // ---------------------------------------------------------------- the table
      if (on('net-table')) {
        const tag = `net-table, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network?tab=table' });
        const { page } = a;
        const count = () => page.locator('.cc-net-ctl .cc-net-count').innerText();
        const heads = await page.locator('.cc-net-table thead .cc-th').allInnerTexts();
        pass(`${tag}: every column of the table, the owner’s own last, then the +`, heads.join('|') === 'Name|Organisation|Role|Email|Phone|Where to focus|Influence|Trust in you|Value delivery|What you get|Rhythm|Last spoke|Next due|Given|Asked|Sector' && (await page.getByRole('button', { name: 'Add column', exact: true }).count()) === 1, heads.join('|'));
        pass(`${tag}: it opens with who is due first, and the count`, (await rowNames(page))[0] === 'Sofia Marsh' && (await count()) === '18 people', `${(await rowNames(page))[0]}, ${await count()}`);
        pass(`${tag}: there is no Columns button above the table: only the search box and the count`, (await page.locator('.cc-net-ctl button:visible').count()) === 0);

        // Search, the count and Clear.
        await page.getByRole('searchbox', { name: 'Search your network' }).fill('kestrel'); await settle(page, 900);
        pass(`${tag}: search finds by organisation, with the count and Clear`, (await rowNames(page)).sort().join(',') === 'Dana Whitfield,Maya Kerr' && (await count()) === '2 of 18 people' && (await page.locator('.cc-net-ctl').getByRole('button', { name: 'Clear', exact: true }).count()) === 1, `${(await rowNames(page)).join(',')} ${await count()}`);
        await page.getByRole('searchbox', { name: 'Search your network' }).fill('zzzz'); await settle(page, 900);
        pass(`${tag}: nobody found is said calmly`, (await words(page)).includes('Nobody matches that. Check the spelling, or choose Clear.'));
        await press(page, 'Clear', page.locator('.cc-net-ctl'));
        pass(`${tag}: Clear shows everyone again`, (await count()) === '18 people' && (await rowNames(page)).length === 18);

        // Every heading: Sort, and Show only where it fits.
        await press(page, 'Influence', page.locator('.cc-net-table thead'));
        pass(`${tag}: a rating’s heading sorts “Highest first” and “Lowest first”`, (await page.locator('.cc-pop [role^=menuitem]').allInnerTexts()).join('|') === 'Highest first|Lowest first');
        await page.getByRole('menuitemcheckbox', { name: 'Highest first' }).click(); await settle(page, 800);
        pass(`${tag}: Highest first puts 10 at the top`, (await rowNames(page))[0] === 'Erin Banks' && (await cellText(page, 'Erin Banks', 6)) === '10', (await rowNames(page)).slice(0, 3).join(','));
        pass(`${tag}: people with no rating sort last`, (await rowNames(page)).slice(-2).sort().join(',') === 'Daniel Vance,Zara Nash', (await rowNames(page)).slice(-2).join(','));
        await press(page, 'Where to focus', page.locator('.cc-net-table thead'));
        pass(`${tag}: Where to focus sorts “Keep close first” and narrows by each list`, has((await page.locator('.cc-pop').last().innerText()), ['Sort', 'Keep close first', 'Rebalance? first', 'Show only', 'Keep close', 'Maintain', 'Invest', 'Rebalance?', 'No list']));
        await page.getByRole('menuitemcheckbox', { name: 'Keep close', exact: true }).click(); await settle(page, 800);
        await page.keyboard.press('Escape'); await settle(page, 400);
        const close = await rowNames(page);
        pass(`${tag}: Show only Keep close leaves only them, the heading says “Where to focus, 1”, with the count and Clear`, close.sort().join(',') === 'Dan Reid,Dana Whitfield,Hannah Wells,Kate Banks,Maya Kerr' && (await page.locator('.cc-net-table thead .cc-th--on', { hasText: 'Where to focus, 1' }).count()) === 1 && (await count()) === '5 of 18 people', `${close.join(',')} ${await count()}`);

        // A rating in a small floating menu; Where to focus follows; Undo.
        await cell(page, 'Trust in you', 'Dana Whitfield').click(); await settle(page, 500);
        const menu = await page.evaluate(() => { const m = document.querySelector('.cc-net-rate'); const b = m.getBoundingClientRect(); const box = document.querySelector('.cc-net-box').getBoundingClientRect(); return { n: m.querySelectorAll('[role=menuitemradio]').length, on: m.querySelector('[aria-checked=true]')?.textContent, fixed: getComputedStyle(m.closest('.ds-popover, [class*=popover]') || m.parentElement.parentElement).position, inside: b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 12 && b.right <= window.innerWidth - 12, box: box.bottom, small: [...m.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width < 43.5 || x.getBoundingClientRect().height < 43.5).length }; });
        pass(`${tag}: a rating opens a small menu of 0 to 10 that floats above the table, the one it has ticked, each a 44px tap`, menu.n === 11 && menu.on === '8' && menu.inside && menu.small === 0, JSON.stringify(menu));
        await page.getByRole('menuitemradio', { name: '5', exact: true }).click(); await settle(page, 800);
        pass(`${tag}: choosing saves with “Saved.” and Undo`, (await toastText(page)) === 'Saved.' && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1, await toastText(page));
        pass(`${tag}: Where to focus follows at once (trust 5: Invest)`, (await cellText(page, 'Dana Whitfield', 5)) === 'Invest' && (await cellText(page, 'Dana Whitfield', 7)) === '5', await cellText(page, 'Dana Whitfield', 5));
        pass(`${tag}: it is kept`, (await a.peopleNow()).find((p) => p.id === CRM.dana)?.trust === 5);
        await undo(page);
        pass(`${tag}: Undo puts the rating and the list back`, (await cellText(page, 'Dana Whitfield', 5)) === 'Keep close' && (await cellText(page, 'Dana Whitfield', 7)) === '8' && (await a.peopleNow()).find((p) => p.id === CRM.dana)?.trust === 8);
        await press(page, 'Clear', page.locator('.cc-net-ctl'));

        // The rhythm's menu; Next due follows.
        await cell(page, 'Rhythm', 'Sofia Marsh').click(); await settle(page, 500);
        pass(`${tag}: the rhythm opens its choices`, (await page.locator('.cc-pop [role^=menuitem]').allInnerTexts()).join('|') === 'Every month|Every 2 months|Every 3 months|Every 6 months|Every year|No rhythm');
        await page.getByRole('menuitemcheckbox', { name: 'Every 6 months' }).click(); await settle(page, 800);
        pass(`${tag}: a new rhythm moves Next due (8 Aug and 6 months: Mon 8 Feb 2027)`, (await cellText(page, 'Sofia Marsh', 12)) === 'Mon 8 Feb 2027' && (await cellText(page, 'Sofia Marsh', 10)) === 'Every 6 months', await cellText(page, 'Sofia Marsh', 12));
        await undo(page);

        // Typed over: Enter saves, Escape puts back, a wrong value is said calmly.
        await cell(page, 'Organisation', 'Sofia Marsh').click(); await settle(page, 300);
        const box = page.locator('.cc-net-table .cc-cell-input');
        const caret = await box.evaluate((el) => [el.value, el.selectionStart, el.selectionEnd]);
        pass(`${tag}: a typed cell opens with its words and the cursor at the end`, caret[0] === 'Citadel' && caret[1] === 7 && caret[2] === 7, JSON.stringify(caret));
        await box.fill('Citadel Health'); await page.keyboard.press('Enter'); await settle(page, 800);
        pass(`${tag}: Enter saves it, with “Saved.”`, (await cellText(page, 'Sofia Marsh', 1)) === 'Citadel Health' && (await toastText(page)) === 'Saved.' && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.organisation === 'Citadel Health');
        await undo(page);
        pass(`${tag}: Undo puts it back`, (await cellText(page, 'Sofia Marsh', 1)) === 'Citadel' && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.organisation === 'Citadel');
        await cell(page, 'Role', 'Sofia Marsh').click(); await settle(page, 300);
        await box.fill('Something else'); await page.keyboard.press('Escape'); await settle(page, 500);
        pass(`${tag}: Escape puts a cell back without saving`, (await cellText(page, 'Sofia Marsh', 2)) === 'Key contact');
        await cell(page, 'Email', 'Sofia Marsh').click(); await settle(page, 300);
        await box.fill('not an email'); await page.keyboard.press('Enter'); await settle(page, 600);
        pass(`${tag}: an email that isn’t one is said calmly, the box stays open, nothing is saved`, (await toastText(page)) === 'That email doesn’t look right. Check it and try again.' && (await box.count()) === 1 && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.email === 'sofia.marsh@example.invalid', await toastText(page));
        await page.keyboard.press('Escape'); await settle(page, 400);
        await cell(page, 'Last spoke', 'Sofia Marsh').click(); await settle(page, 300);
        await box.fill('12 Oct'); await page.keyboard.press('Enter'); await settle(page, 800);
        pass(`${tag}: Last spoke is typed as a day, and Next due follows`, (await cellText(page, 'Sofia Marsh', 11)) === 'Mon 12 Oct' && (await cellText(page, 'Sofia Marsh', 12)) === 'Tue 12 Jan 2027' && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.last_spoke_on === '2026-10-12', `${await cellText(page, 'Sofia Marsh', 11)} ${await cellText(page, 'Sofia Marsh', 12)}`);
        await undo(page);
        pass(`${tag}: Where to focus, Next due, Given and Asked are worked out, so they can’t be typed`, (await page.locator('.cc-net-table tbody tr').first().locator('td').nth(4).locator('button').count()) === 0 && (await page.locator('.cc-net-table tbody tr').first().locator('td').nth(11).locator('button').count()) === 0 && (await page.locator('.cc-net-table tbody tr').first().locator('td').nth(12).locator('button').count()) === 0);

        // Your own columns: typed over; the + adds one.
        await cell(page, 'Sector', 'Sofia Marsh').click(); await settle(page, 300);
        await box.fill('Healthcare'); await page.keyboard.press('Enter'); await settle(page, 800);
        pass(`${tag}: one of your own columns is typed over the same way`, (await cellText(page, 'Sofia Marsh', 15)) === 'Healthcare' && (await a.peopleNow()).find((p) => p.id === CRM.sofia)?.own?.[CRM.colSector] === 'Healthcare');
        await press(page, 'Add column');
        pass(`${tag}: the + opens Add column`, has(await panelWords(page), ['Add column', 'What’s it called?']));
        await press(page, 'Add column', dialog(page));
        pass(`${tag}: pressed with no name, it says what is needed`, (await panelWords(page)).includes('Type the column’s name to carry on.'));
        await dialog(page).getByLabel('What’s it called?').fill('Role');
        await press(page, 'Add column', dialog(page));
        pass(`${tag}: a name already used is refused calmly`, (await panelWords(page)).includes('There’s already a column called Role. Choose another name.'));
        await dialog(page).getByLabel('What’s it called?').fill('Met at');
        await press(page, 'Add column', dialog(page));
        pass(`${tag}: the new column is the last heading`, (await page.locator('.cc-net-table thead .cc-th').allInnerTexts()).slice(-1)[0] === 'Met at' && (await a.rowsNow('network_columns')).some((c) => c.name === 'Met at'), (await page.locator('.cc-net-table thead .cc-th').allInnerTexts()).slice(-2).join('|'));

        // Show or hide columns.
        await press(page, 'Show or hide columns');
        const text = await panelWords(page);
        pass(`${tag}: Show or hide columns gives each column one line of meaning`, has(text, ['Columns', 'Where they work.', 'How you know them.', 'Their email address.', 'Worked out from the four ratings.', 'How much influence they have, 0 to 10.', 'How much they trust you, 0 to 10.', 'How much value you deliver to them, 0 to 10.', 'How much you get from it, 0 to 10.', 'How often you want to be in touch.', 'When you last spoke.', 'Worked out from the rhythm and when you last spoke.', 'How many times you’ve given something.', 'How many times you’ve asked for something.', 'The sector they work in.', 'Add column']) && !/\nName\n/.test(text), missing(text, ['The sector they work in.']));
        await dialog(page).getByRole('switch', { name: /^Phone/ }).click(); await settle(page, 600);
        await page.keyboard.press('Escape'); await settle(page, 600);
        pass(`${tag}: a column switched off leaves the table`, !(await page.locator('.cc-net-table thead .cc-th').allInnerTexts()).includes('Phone'));
        await press(page, 'Show or hide columns');
        await dialog(page).getByRole('switch', { name: /^Phone/ }).click(); await settle(page, 600);
        await page.keyboard.press('Escape'); await settle(page, 600);
        pass(`${tag}: switched on, it is back in its place`, (await page.locator('.cc-net-table thead .cc-th').allInnerTexts())[4] === 'Phone');
        await a.close();
      }

      // ---------------------------------------------------------------- 1,200 people
      if (on('net-many')) {
        const tag = `net-many, ${mode}`;
        const a = await openAt({ db, tag, many: 1200, path: '/coach/network' });
        const { page } = a;
        const count = () => page.locator('.cc-net-ctl .cc-net-count').innerText();
        const timed = async (what, act, done) => { const t0 = Date.now(); await act(); await page.waitForFunction(done, null, { timeout: 15000, polling: 'raf' }); const ms = Date.now() - t0; timings.push(`TIMING ${mode}, 1,200 people: ${what}: ${ms} ms`); return ms; };
        pass(`${tag}: Actions folds after 8 with “Show all 30”, and the card counts 36`, has(await words(page), ['Show all 30', '36 people have had no contact for 18 months and aren’t in a focus list.']) && (await actionRows(page, 'Due now')).length === 8);
        const first = await timed('the table’s first page', () => page.getByRole('tab', { name: 'Table', exact: true }).click(), () => document.querySelectorAll('.cc-net-table tbody tr').length === 50);
        pass(`${tag}: the table shows 50 rows of 1,164, with “Showing 50 of 1,164” and “Show 50 more”`, (await rowNames(page)).length === 50 && (await count()) === '1,164 people' && has(await words(page), ['Showing 50 of 1,164', 'Show 50 more', 'Archived, 36']), await count());
        const sort = await timed('a sort (Trust in you, highest first)', async () => { await page.locator('.cc-net-table thead').getByRole('button', { name: 'Trust in you', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Highest first' }).click(); }, () => { const r = document.querySelector('.cc-net-table tbody tr'); return r && r.children[7]?.innerText.trim() === '10' && document.querySelector('.cc-net-table thead th[aria-sort=descending]'); });
        pass(`${tag}: a sort is done over everyone, not only the rows showing (the first 50 are all 10s)`, (await page.locator('.cc-net-table tbody tr').evaluateAll((rows) => rows.every((r) => r.children[7].innerText.trim() === '10'))) && (await rowNames(page)).length === 50);
        const search = await timed('a search (“kestrel”, with its quarter-second wait for the typing to stop)', () => page.getByRole('searchbox', { name: 'Search your network' }).fill('kestrel'), () => /^\d+ of 1,164 people$/.test(document.querySelector('.cc-net-ctl .cc-net-count')?.innerText || ''));
        pass(`${tag}: a search is over everyone: “… of 1,164 people”, every row at Kestrel`, /^\d+ of 1,164 people$/.test(await count()) && (await page.locator('.cc-net-table tbody tr').evaluateAll((rows) => rows.length > 0 && rows.every((r) => /kestrel/i.test(r.innerText)))), await count());
        await press(page, 'Clear', page.locator('.cc-net-ctl'));
        await press(page, 'Show 50 more');
        pass(`${tag}: “Show 50 more” adds the next 50, with nobody twice`, (await rowNames(page)).length === 100 && new Set(await page.locator('.cc-net-table tbody tr').evaluateAll((rows) => rows.map((r) => r.innerText))).size === 100 && (await words(page)).includes('Showing 100 of 1,164'));
        const map = await timed('the map', () => page.getByRole('tab', { name: 'Map', exact: true }).click(), () => document.querySelectorAll('.cc-net-map .cc-net-dot').length > 20);
        pass(`${tag}: the map shows 150 of 1,164, with its one line`, (await words(page)).includes('Showing 150 of 1,164 people: your focus lists first, then who you spoke to most recently.'));
        const m = await page.evaluate(readMap);
        const problems = mapProblems(m, { phone: false });
        pass(`${tag}: one same-size dot a spot with the number inside, never coral, exactly 150 people`, problems.length === 0 && m.dots.reduce((n, d) => n + d.n, 0) === 150, problems.join('; '));
        pass(`${tag}: the first page, a sort, a search and the map each show in under 2 seconds (${first}, ${sort}, ${search} and ${map} ms)`, Math.max(first, sort, search, map) < 2000);
        if (a.there) {
          pass(`${tag}: Network is asked for in pages: no question ever asked for more than 50 rows of the table (${a.asked.pages} questions), and the people’s table was never read whole`, a.asked.limits.every((n) => n <= 50) && !a.store.calls.some((c) => /^GET network_people\b/.test(c)), [...new Set(a.asked.limits)].join(','));
        } else {
          pass(`${tag}: on the device a page still hands the table 50 rows at a time`, (await page.evaluate(() => document.querySelectorAll('.cc-net-table tbody tr').length)) === 0);
        }
        await a.close();

        // The same on a phone: the table's own box.
        const p = await openAt({ db, tag: `${tag}, a phone`, many: 1200, size: 400, path: '/coach/network?tab=table' });
        const frozen = await tableFrozen(p.page, { settle });
        pass(`${tag}, a phone: the table is still a table: its headings and its Name column stay put while the rest swipes sideways inside the box, and the page never scrolls sideways`, frozen.length === 0, frozen.join('; '));
        pass(`${tag}, a phone: 50 rows, with “Show 50 more”`, (await rowNames(p.page)).length === 50 && (await words(p.page)).includes('Show 50 more'));
        await p.close();
      }

      // ---------------------------------------------------------------- the map
      if (on('net-map')) {
        const tag = `net-map, ${mode}`;
        const a = await openAt({ db, tag, many: 1200, path: '/coach/network?tab=map' });
        const { page } = a;
        const dots = (pick = '') => page.locator(`.cc-net-map .cc-net-dot${pick}`);
        // The pop-up card.
        const single = dots(':not(:has(.cc-net-num))').first();
        await single.hover({ force: true }); await settle(page, 400);
        let tip = await page.evaluate(() => { const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden); return t ? { title: t.querySelector('.ds-tip-title')?.innerText, sub: [...t.querySelectorAll('.ds-tip-sub')].map((s) => s.innerText), rows: [...t.querySelectorAll('.ds-tip-row')].map((r) => `${r.querySelector('dt').innerText}: ${r.querySelector('dd').innerText}`), foot: t.querySelector('.ds-tip-foot')?.innerText || '' } : null; });
        pass(`${tag}: pointing at a single dot shows a card: the name, then the organisation and the list, then Influence, Trust and Catch-up as rows`, Boolean(tip?.title) && tip.sub.length >= 1 && tip.rows.length === 3 && /^Influence: \d+\/10$/.test(tip.rows[0]) && /^Trust: \d+\/10$/.test(tip.rows[1]) && /^Catch-up: /.test(tip.rows[2]) && !tip.foot, JSON.stringify(tip));
        const name = tip?.title;
        await page.mouse.move(5, 5); await settle(page, 300);
        const numbered = dots(':has(.cc-net-num)').first();
        const n = Number(await numbered.locator('.cc-net-num').textContent());
        await numbered.hover({ force: true }); await settle(page, 400);
        tip = await page.evaluate(() => { const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden); return t ? { title: t.querySelector('.ds-tip-title')?.innerText, sub: [...t.querySelectorAll('.ds-tip-sub')].map((s) => s.innerText), rows: t.querySelectorAll('.ds-tip-row').length, foot: t.querySelector('.ds-tip-foot')?.innerText || '' } : null; });
        pass(`${tag}: a numbered dot’s card says how many, the list or “Several lists”, and “Choose to see who”`, tip?.title === `${n} people` && tip.rows === 2 && tip.foot === 'Choose to see who' && tip.sub.length === 1, JSON.stringify(tip));
        await page.mouse.move(5, 5); await settle(page, 300);
        // A single dot opens the person; a numbered dot the list of names.
        await single.click({ force: true }); await settle(page, 900);
        pass(`${tag}: a single dot opens that person`, (await dialog(page).locator('.ds-dialog-title').innerText()).toLowerCase() === String(name).toLowerCase() && /[?&]person=/.test(page.url()), `${name}`);
        pass(`${tag}: its pop-up closes as the panel opens`, (await page.locator('.ds-tip:not([hidden])').count()) === 0);
        await page.keyboard.press('Escape'); await settle(page, 700);
        await numbered.focus(); await page.keyboard.press('Enter'); await settle(page, 900);
        let text = await panelWords(page);
        pass(`${tag}: a numbered dot opens the list of names at that spot (by keyboard too)`, new RegExp(`^${n} people`, 'i').test(text.trim()) && /Trust \d+\/10, influence \d+\/10/.test(text) && (await dialog(page).locator('.cc-row').count()) === n, text.slice(0, 80));
        const firstName = (await dialog(page).locator('.cc-row b').first().innerText()).trim();
        await dialog(page).locator('.cc-row').first().click(); await settle(page, 900);
        pass(`${tag}: a name in the list opens that person`, (await dialog(page).locator('.ds-dialog-title').innerText()).toLowerCase() === firstName.toLowerCase(), firstName);
        await page.keyboard.press('Escape'); await settle(page, 700);

        // Show.
        await choose(page, 'Show', 'Rebalance?');
        const m = await page.evaluate(readMap);
        pass(`${tag}: Show narrows the map to one list (every dot a dashed grey outline), with its count`, m.dots.length > 0 && m.dots.every((d) => d.style === 'rebalance') && /^(Showing 150 of \d+ people: your focus lists first, then who you spoke to most recently\.|\d+ of 1,164 people)$/.test((await page.locator('.cc-net-mapline').innerText()).trim()), (await page.locator('.cc-net-mapline').innerText()).trim());
        const options = await (async () => { await page.getByLabel('Show', { exact: true }).first().click(); await settle(page, 300); const o = await page.getByRole('option').allInnerTexts(); await page.keyboard.press('Escape'); await settle(page, 300); return o; })();
        pass(`${tag}: Show offers Everyone and the five lists`, options.map((o) => o.trim()).join('|') === 'Everyone|Keep close|Maintain|Invest|Rebalance?|No list', options.join('|'));

        // Find someone: anyone active, even outside the 150.
        const everyone = await a.peopleNow();
        const shownIds = new Set(a.there ? a.store.fn.network_map({ p_show: 'everyone', p_limit: 150 }).rows.map((r) => r.id) : []);
        const outside = everyone.find((p) => !p.archived_at && !p.merged_into && Number.isInteger(p.influence) && Number.isInteger(p.trust) && (a.there ? !shownIds.has(p.id) : p.rhythm_months === null && !p.last_spoke_on)) || everyone.find((p) => !p.archived_at && Number.isInteger(p.influence) && Number.isInteger(p.trust));
        await page.getByRole('searchbox', { name: 'Find someone' }).fill(outside.name); await settle(page, 1000);
        await page.locator('.cc-net-hits').getByRole('option', { name: new RegExp(`^${outside.name}`) }).first().click(); await settle(page, 900);
        const found = await page.evaluate(() => { const g = document.querySelector('.cc-net-dot--found'); return g ? { named: g.querySelector('.cc-net-named')?.textContent, ring: Boolean(g.querySelector('.cc-net-found')), label: g.getAttribute('aria-label') } : null; });
        pass(`${tag}: Find someone searches everyone active, goes back to Everyone, and rings and names their dot`, found?.named === outside.name && found.ring && (await page.getByLabel('Show', { exact: true }).first().innerText()).trim() === 'Everyone', JSON.stringify(found));
        const unrated = everyone.find((p) => !p.archived_at && !p.merged_into && !Number.isInteger(p.influence));
        if (unrated) {
          await page.getByRole('searchbox', { name: 'Find someone' }).fill(unrated.name); await settle(page, 1000);
          await page.locator('.cc-net-hits').getByRole('option', { name: new RegExp(`^${unrated.name}`) }).first().click(); await settle(page, 700);
          pass(`${tag}: someone with no ratings is said calmly not to be on the map yet`, /on the map yet\. Rate their influence and trust to place them\.$/.test((await words(page)).split('\n').find((l) => /on the map yet/.test(l)) || ''));
        }

        // How to read the map, and "Don't show me this again".
        await press(page, 'How to read the map');
        text = await panelWords(page);
        pass(`${tag}: How to read the map opens in the side panel: each mark and what it means, and no key on the chart`, has(text, ['How to read the map', 'Up and across', 'A green dot with a fine ring', 'An outline', 'A solid dot in the text colour', 'A dashed grey outline', 'A number', 'A pale dot with a number', 'A plain grey dot', 'Don’t show me this again']), missing(text, ['A pale dot with a number']));
        await press(page, 'Don’t show me this again', dialog(page));
        pass(`${tag}: “Don’t show me this again” hides its link, with Undo`, (await page.getByRole('button', { name: 'How to read the map', exact: true }).count()) === 0 && /^Hidden\./.test(await toastText(page)), await toastText(page));
        await undo(page);
        pass(`${tag}: Undo brings the link back`, (await page.getByRole('button', { name: 'How to read the map', exact: true }).count()) === 1);
        await a.close();

        // A phone: the same chart, full width; 44px tap areas; where they overlap the nearest dot wins.
        const p = await openAt({ db, tag: `${tag}, a phone`, many: 1200, size: 400, path: '/coach/network?tab=map' });
        const pm = await p.page.evaluate(readMap);
        const pp = mapProblems(pm, { phone: true });
        pass(`${tag}, a phone: the same chart, full width, dots only, nothing off the side`, pp.length === 0 && pm.svg.w > 300, pp.join('; '));
        // Every pair of neighbouring dots whose tap areas overlap: a tap a third of the way from one to the other opens the nearer.
        const marks = pm.dots.map((d) => ({ x: (d.o.l + d.o.r) / 2, y: (d.o.t + d.o.b) / 2, label: d.label, n: d.n }));
        const pairs = [];
        for (let i = 0; i < marks.length; i += 1) for (let j = 0; j < marks.length; j += 1) if (i !== j && Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y) < 44) pairs.push([marks[i], marks[j]]);
        const wrong = [];
        let tapped = 0;
        for (const [near, far] of pairs.slice(0, 24)) {
          const x = near.x + (far.x - near.x) * 0.36; const y = near.y + (far.y - near.y) * 0.36;
          await p.page.evaluate(([px, py]) => window.scrollTo(0, Math.max(0, window.scrollY + py - window.innerHeight / 2)), [x, y]);
          const at = await p.page.evaluate((label) => { const g = [...document.querySelectorAll('.cc-net-dot')].find((d) => d.getAttribute('aria-label') === label); const b = g.querySelector('.cc-net-o').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, near.label);
          const at2 = await p.page.evaluate((label) => { const g = [...document.querySelectorAll('.cc-net-dot')].find((d) => d.getAttribute('aria-label') === label); const b = g.querySelector('.cc-net-o').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, far.label);
          await p.page.touchscreen.tap(at.x + (at2.x - at.x) * 0.36, at.y + (at2.y - at.y) * 0.36); await settle(p.page, 700);
          const title = (await dialog(p.page).locator('.ds-dialog-title').innerText().catch(() => '')).trim().toLowerCase();
          const want = near.n > 1 ? `${near.n} people` : near.label.split(/[,.]/)[0].toLowerCase();
          tapped += 1;
          if (title !== want) wrong.push(`wanted ${want}, opened ${title || 'nothing'}`);
          await p.page.keyboard.press('Escape'); await settle(p.page, 500);
        }
        pass(`${tag}, a phone: where tap areas overlap, a tap opens the dot whose centre is nearest (${tapped} taps between neighbours, of ${pairs.length} overlapping pairs)`, tapped > 0 && wrong.length === 0, wrong.slice(0, 4).join(' | '));
        await p.close();
      }

      // ---------------------------------------------------------------- one person
      if (on('net-person')) {
        const tag = `net-person, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/network?person=${CRM.david}` });
        const { page } = a;
        let text = await panelWords(page);
        const ORDER = ['How often?', 'I spoke to David today', 'Contact', 'Edit contact details', 'How it is', 'Edit ratings', 'What you’ve given', 'Log what you gave', 'What you’ve asked', 'Log an ask', 'Move to Leads', 'Archive'];
        const at = ORDER.map((w) => text.toLowerCase().indexOf(w.toLowerCase()));
        pass(`${tag}: the person’s panel in M11’s order: how often, Contact, How it is, What you’ve given, What you’ve asked, then Move to Leads and Archive`, at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1])), ORDER.filter((_, i) => at[i] < 0 || (i > 0 && at[i] <= at[i - 1])).join(' | '));
        pass(`${tag}: How it is says the list in words, with the four ratings out of 10`, has(text, ['Invest', 'They matter, and there’s room to build trust.', 'Influence', '9/10', 'Trust in you', '6/10', 'Value delivery', '7/10', 'What you get']));
        pass(`${tag}: the count line`, text.includes('You’ve given once and haven’t asked yet.') && text.includes('Nothing asked yet.'));
        const links = await dialog(page).locator('a.ds-link').evaluateAll((list) => list.map((l) => [l.textContent, l.getAttribute('href')]));
        pass(`${tag}: Email and WhatsApp are links to the coach’s own apps (mailto: and wa.me), so nothing is sent from the portal`, links.some(([w, h]) => w === 'Email' && /^mailto:david\.stark@example\.invalid$/.test(h)) && links.some(([w, h]) => w === 'WhatsApp' && h === 'https://wa.me/12125550147'), JSON.stringify(links.map(([w]) => w)));

        // Edit contact details.
        await press(page, 'Edit contact details', dialog(page));
        pass(`${tag}: Edit contact details asks Email and Phone`, has(await panelWords(page), ['Contact details', 'David Stark', 'Email', 'Phone', 'Cancel', 'Save']));
        await dialog(page).getByLabel('Email', { exact: true }).fill('david at example');
        await press(page, 'Save', dialog(page));
        pass(`${tag}: an email that isn’t one is said calmly`, (await panelWords(page)).includes('That email doesn’t look right. Check it and try again.'));
        await dialog(page).getByLabel('Email', { exact: true }).fill('d.stark@example.invalid');
        await dialog(page).getByLabel('Phone', { exact: true }).fill('07700 900555');
        await press(page, 'Save', dialog(page));
        text = await panelWords(page);
        pass(`${tag}: saved, the panel is back on the person with the new details and “Saved.”`, has(text, ['d.stark@example.invalid', '07700 900555', 'How it is']) && (await toastText(page)) === 'Saved.' && (await a.peopleNow()).find((p) => p.id === CRM.david)?.phone === '07700 900555');
        pass(`${tag}: a UK number opens WhatsApp as +44`, (await dialog(page).locator('a.ds-link', { hasText: 'WhatsApp' }).getAttribute('href')) === 'https://wa.me/447700900555');
        await undo(page);

        // Edit ratings.
        await press(page, 'Edit ratings', dialog(page));
        pass(`${tag}: Edit ratings asks each rating as a question, with one line of help`, has(await panelWords(page), ['Edit ratings', 'How much influence do they have?', 'How much do they trust you?', 'How much value do you deliver to them?', 'How much do you get from it?', 'Every change is kept with its date.']));
        await choose(page, 'How much do they trust you?', '8', dialog(page));
        await choose(page, 'How much do you get from it?', '0', dialog(page));
        await press(page, 'Save', dialog(page));
        text = await panelWords(page);
        pass(`${tag}: ratings run from 0, and How it is follows (trust 8, what you get 0: Maintain)`, has(text, ['Maintain', 'Strong already. Keep it that way.', '8/10', '0/10']) && (await a.peopleNow()).find((p) => p.id === CRM.david)?.what_you_get === 0, text.slice(text.indexOf('HOW IT IS'), text.indexOf('HOW IT IS') + 90));
        if (a.there) pass(`${tag}: each change is kept with its date (the database’s own history)`, (a.store.rows.network_ratings || []).some((r) => r.person_id === CRM.david && r.rating === 'trust' && r.value === 8 && r.rated_on === '2026-11-17'));
        else pass(`${tag}: each change is kept with its date (on the device)`, await page.evaluate(([id, person]) => (JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`)).ratings || []).some((r) => r.person_id === person && r.rating === 'trust' && r.value === 8 && r.rated_on === '2026-11-17'), [a.me, CRM.david]));
        await undo(page);
        pass(`${tag}: Undo puts the ratings back (Invest)`, has(await panelWords(page), ['Invest', '6/10']));

        // Log what you gave, Log an ask.
        await press(page, 'Log what you gave', dialog(page));
        pass(`${tag}: Log what you gave offers the five kinds and when`, has(await panelWords(page), ['Log what you gave', 'What was it?', 'An idea', 'An article or resource', 'An introduction', 'A favour', 'Something else', 'What did you give?', 'When?', 'Today']));
        await press(page, 'Save', dialog(page));
        pass(`${tag}: saved with nothing chosen, it says what is needed`, (await panelWords(page)).includes('Choose one to carry on.'));
        await dialog(page).getByRole('radio', { name: 'An introduction' }).click();
        await dialog(page).getByLabel('What did you give?').fill('Introduced him to Dana at Kestrel.');
        await press(page, 'Save', dialog(page));
        text = await panelWords(page);
        pass(`${tag}: it is logged, and the line counts it`, (await toastText(page)) === 'Logged.' && has(text, ['You’ve given twice and haven’t asked yet.', 'An introduction', 'Introduced him to Dana at Kestrel.', 'Today']), text.slice(text.indexOf('WHAT YOU’VE GIVEN'), text.indexOf('WHAT YOU’VE GIVEN') + 120));
        await press(page, 'Log an ask', dialog(page));
        pass(`${tag}: Log an ask offers its own five kinds`, has(await panelWords(page), ['Log an ask', 'An introduction', 'A referral', 'Advice', 'A favour', 'Something else', 'What did you ask for?']));
        await dialog(page).getByRole('radio', { name: 'A referral' }).click();
        await choose(page, 'When?', 'Yesterday', dialog(page));
        await press(page, 'Save', dialog(page));
        text = await panelWords(page);
        pass(`${tag}: “You’ve given twice and asked once.”`, text.includes('You’ve given twice and asked once.') && has(text.slice(text.toLowerCase().indexOf('what you’ve asked')), ['A referral', 'Mon 16 Nov']) && !text.includes('Nothing asked yet.'));
        const gives = (await a.givesNow()).filter((g) => g.person_id === CRM.david);
        pass(`${tag}: both are kept: a give today and an ask yesterday`, gives.some((g) => g.direction === 'gave' && g.kind === 'introduction' && g.happened_on === '2026-11-17') && gives.some((g) => g.direction === 'asked' && g.kind === 'referral' && g.happened_on === '2026-11-16'), `${gives.length}`);
        await undo(page);
        pass(`${tag}: Undo takes the ask back`, (await panelWords(page)).includes('You’ve given twice and haven’t asked yet.'));

        // The table's Given and Asked follow.
        await page.keyboard.press('Escape'); await settle(page, 600);
        await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900);
        pass(`${tag}: the table’s Given column counts it`, (await cellText(page, 'David Stark', 13)) === '2' && (await cellText(page, 'David Stark', 14)) === '0', `${await cellText(page, 'David Stark', 13)} ${await cellText(page, 'David Stark', 14)}`);

        // Move to Leads, which keeps them in Network.
        await press(page, 'David Stark');
        await press(page, 'Move to Leads', dialog(page));
        pass(`${tag}: Move to Leads says they are in both`, (await toastText(page)) === 'David is in Leads now, and still in your Network.', await toastText(page));
        const lead = (await a.rowsNow('coach_leads')).find((l) => l.network_person_id === CRM.david);
        pass(`${tag}: a lead is made that points at the person, in the first stage, with its line on the timeline`, Boolean(lead) && lead.name === 'David Stark' && lead.source === 'network' && Boolean(lead.stage_id) && (await a.rowsNow('coach_lead_events')).some((e) => e.lead_id === lead.id && e.title === 'Added from your Network'), JSON.stringify(lead && [lead.name, lead.source]));
        pass(`${tag}: they stay in Network, and the link now reads “Open the lead”`, (await a.peopleNow()).some((p) => p.id === CRM.david && !p.archived_at) && (await dialog(page).getByRole('button', { name: 'Open the lead', exact: true }).count()) === 1 && (await dialog(page).getByRole('button', { name: 'Move to Leads', exact: true }).count()) === 0);
        await press(page, 'Open the lead', dialog(page));
        await settle(page, 900);
        pass(`${tag}: Open the lead opens it in Leads`, page.url().endsWith(`/coach/leads/${lead?.id}`) && (await words(page)).toLowerCase().includes('david stark'), page.url().slice(-50));
        await a.close();
      }

      // ---------------------------------------------------------------- Merge into one (tidy follow-up 3, run 6's 36)
      if (on('net-merge')) {
        const tag = `net-merge, ${mode}`;
        const a = await openAt({ db, tag, path: `/coach/network?person=${CRM.david}` });
        const { page } = a;
        await press(page, 'Merge with someone', dialog(page));
        let text = await panelWords(page);
        pass(`${tag}: Merge with someone asks who is the same person, with a search`, has(text, ['Merge into one', 'David Stark', 'Who is the same person?', 'Back']));
        await press(page, 'Merge into one', dialog(page));
        pass(`${tag}: pressed before choosing, it says what is needed (never greyed out)`, (await panelWords(page)).includes('Choose who to merge with to carry on.'));
        await dialog(page).getByLabel('Search your Network', { exact: true }).fill('Sofia');
        await settle(page, 700);
        await dialog(page).getByRole('button', { name: /^Sofia Marsh/ }).first().click();
        await settle(page, 900);
        text = await panelWords(page);
        pass(`${tag}: the two side by side, choosing where they differ`, has(text, ['Choose what to keep where they differ.', 'Name', 'David Stark', 'Sofia Marsh', 'Organisation', 'Citadel', 'Nothing is lost.']) && await dialog(page).getByRole('radiogroup', { name: 'Name' }).count() === 1);
        await dialog(page).getByRole('radiogroup', { name: 'Phone' }).getByRole('radio', { name: '+1 617 555 0122' }).click();
        await press(page, 'Merge into one', dialog(page));
        await settle(page, 900);
        pass(`${tag}: “Merged into David Stark.”, with Undo`, (await toastText(page)) === 'Merged into David Stark.' && await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count() === 1, await toastText(page));
        let people = await a.peopleNow();
        pass(`${tag}: Sofia is merged into David, who keeps the phone chosen`, people.find((p) => p.id === CRM.sofia)?.merged_into === CRM.david && people.find((p) => p.id === CRM.david)?.phone === '+1 617 555 0122', JSON.stringify(people.filter((p) => [CRM.sofia, CRM.david].includes(p.id)).map((p) => [p.name, p.merged_into, p.phone])));
        await undo(page);
        await settle(page, 900);
        people = await a.peopleNow();
        pass(`${tag}: Undo puts both back as they were`, !people.find((p) => p.id === CRM.sofia)?.merged_into && people.find((p) => p.id === CRM.david)?.phone === '+1 212 555 0147', JSON.stringify(people.filter((p) => [CRM.sofia, CRM.david].includes(p.id)).map((p) => [p.name, p.merged_into, p.phone])));
        await a.close();
      }

      // ---------------------------------------------------------------- import and export
      if (on('net-import')) {
        const tag = `net-import, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network?tab=table' });
        const { page } = a;
        const dir = mkdtempSync(join(tmpdir(), 'clarity-net-'));
        try {
          await press(page, 'Import a spreadsheet');
          pass(`${tag}: Import a spreadsheet takes Excel or CSV, with one line of help`, has(await panelWords(page), ['Import a spreadsheet', 'Drop an Excel or CSV file here', 'Choose a file', 'Duplicates show before anyone is added.']));
          await press(page, 'Add people', dialog(page));
          pass(`${tag}: pressed with nothing chosen, it says what is needed`, (await panelWords(page)).includes('Choose a spreadsheet or paste its rows to carry on.'));
          // Odd columns: a name in two columns, headings nobody knows, a column for one of the owner's own, blanks, a rating out of range.
          const sheet = ['First Name;Surname;COMPANY_NAME;e-mail address;Their influence;Trust;Cadence;Last Contacted;Sector;Shoe size;;',
            'Dana;Whitfield;Kestrel Group;DANA.WHITFIELD@example.invalid;9;8;Monthly;12/10/2026;Logistics;7;;',
            'Nell;Okoye;Harbour Lane;nell.okoye@example.invalid;6;11;Quarterly;"September 1, 2026";Property;5;;',
            ';;Nobody Ltd;;;;;;;;;',
            'sofia;marsh;Somewhere Else;;;;;;;;;',
            'Ravi;"Menon, Jr";Quillmark;ravi@example.invalid;10;0;every 2 months;not a date;;;;'].join('\n');
          await dialog(page).locator('#cc-net-paste').fill(sheet); await settle(page, 1000);
          let text = await panelWords(page);
          pass(`${tag}: duplicates show first, before anyone is added: the same email whatever its capitals, and the same name`, has(text, ['2 people to add. 2 may already be here. 1 row has no name, so it is left out.', 'Possible duplicates', 'Dana Whitfield, Kestrel Group, is already in your Network, with the same email.', 'Sofia Marsh, Citadel, is already in your Network, with the same name.', 'Add 2 people']) && text.toLowerCase().indexOf('possible duplicates') < text.toLowerCase().indexOf('your columns'), text.slice(text.indexOf('2 people'), text.indexOf('2 people') + 100));
          const matched = await dialog(page).locator('.cc-part', { hasText: 'Your columns' }).locator('.ds-dd, [role=combobox]').evaluateAll((list) => list.map((d) => d.innerText.trim()));
          pass(`${tag}: the file’s columns are matched whatever their capitals and marks, and one nobody knows is left out`, matched.slice(0, 10).join('|') === 'First name|Last name|Organisation|Email|Influence|Trust in you|Rhythm|Last spoke|Leave out|Leave out', matched.join('|'));
          await dialog(page).getByRole('button', { name: 'Add anyway: sofia marsh' }).click(); await settle(page, 400);
          pass(`${tag}: “Add anyway” adds a possible duplicate all the same, and turns to “Leave out”`, (await dialog(page).getByRole('button', { name: 'Add 3 people', exact: true }).count()) === 1 && (await dialog(page).getByRole('button', { name: 'Leave out: sofia marsh' }).count()) === 1);
          await dialog(page).getByRole('button', { name: 'Leave out: sofia marsh' }).click(); await settle(page, 400);
          await press(page, 'Add 2 people', dialog(page));
          pass(`${tag}: they are added with the toast, and the count grows`, (await toastText(page)) === '2 people added.' && (await page.locator('.cc-net-ctl .cc-net-count').innerText()) === '20 people', `${await toastText(page)} ${await page.locator('.cc-net-ctl .cc-net-count').innerText()}`);
          let people = await a.peopleNow();
          const nell = people.find((p) => p.name === 'Nell Okoye');
          const ravi = people.find((p) => p.name === 'Ravi Menon, Jr');
          pass(`${tag}: what could be read is kept (rhythm from “Quarterly”, the day from “September 1, 2026”, a month name first (run 6, item 10), the owner’s own Sector column), and what couldn’t is left blank (a rating of 11, “not a date”)`, nell?.organisation === 'Harbour Lane' && nell.influence === 6 && nell.trust == null && nell.rhythm_months === 3 && nell.last_spoke_on === '2026-09-01' && nell.own?.[CRM.colSector] === 'Property' && ravi?.influence === 10 && ravi.trust === 0 && ravi.rhythm_months === 2 && ravi.last_spoke_on == null, JSON.stringify(nell && [nell.trust, nell.rhythm_months, nell.last_spoke_on, nell.own]));
          pass(`${tag}: someone with a rating missing is in no focus list until rated`, (await cellText(page, 'Nell Okoye', 5)) === '');
          await undo(page);
          people = await a.peopleNow();
          pass(`${tag}: Undo takes everyone it added out again, and nobody else`, !people.some((p) => p.name === 'Nell Okoye' || p.name === 'Ravi Menon, Jr') && people.length === 20 && (await page.locator('.cc-net-ctl .cc-net-count').innerText()) === '18 people', `${people.length}`);

          // An Excel file, read in the page.
          const xlsx = join(dir, 'people.xlsx');
          writeFileSync(xlsx, xlsxBytes([['Name', 'Company', 'Email', 'Influence', 'Trust in you', 'Value delivery', 'What you get', 'Notes'], ['Imo Reyes', 'Arden Vale', 'imo.reyes@example.invalid', 8, 9, 7, 8, 'Met at the forum'], ['Dan Reid', 'Harbour Lane', '', 6, 9, 7, 8, '']], 'People'));
          await press(page, 'Import a spreadsheet');
          await dialog(page).locator('input[type=file]').setInputFiles(xlsx); await settle(page, 1200);
          text = await panelWords(page);
          pass(`${tag}: an Excel file is read in the page: its columns matched, its duplicate first`, has(text, ['1 person to add. 1 may already be here.', 'Dan Reid, Harbour Lane, is already in your Network, with the same name.', 'Imo Reyes', 'Add 1 person']), text.slice(0, 200).replace(/\n/g, ' '));
          await press(page, 'Add 1 person', dialog(page));
          const imo = (await a.peopleNow()).find((p) => p.name === 'Imo Reyes');
          pass(`${tag}: fully rated, she is in her focus list at once (Keep close)`, imo?.what_you_get === 8 && imo.notes === 'Met at the forum' && (await cellText(page, 'Imo Reyes', 5)) === 'Keep close', JSON.stringify(imo && [imo.influence, imo.trust, imo.notes]));
          await undo(page);

          // A file that can't be read.
          const odd = join(dir, 'people.numbers');
          writeFileSync(odd, 'not a spreadsheet');
          await press(page, 'Import a spreadsheet');
          await dialog(page).locator('input[type=file]').setInputFiles(odd); await settle(page, 600);
          pass(`${tag}: a file that can’t be read is said calmly, with what to do`, (await panelWords(page)).includes('That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.'));
          const broken = join(dir, 'broken.xlsx');
          writeFileSync(broken, 'PK not really a workbook');
          await dialog(page).locator('input[type=file]').setInputFiles(broken); await settle(page, 600);
          pass(`${tag}: so is an Excel file that is damaged`, (await panelWords(page)).includes('That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.'));
          await page.keyboard.press('Escape'); await settle(page, 600);

          // Export.
          await press(page, 'Export');
          pass(`${tag}: Export offers everyone, in Excel or CSV`, has(await panelWords(page), ['Export to a spreadsheet', 'What to export', 'Everyone, 18 people', 'Format', 'Excel', 'CSV', 'Every field comes with it, your own fields included.', 'Download']));
          const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog(page).getByRole('button', { name: 'Download', exact: true }).click()]);
          const saved = join(dir, 'out.xlsx');
          await file.saveAs(saved);
          const table = await xlsxTable(new Uint8Array(readFileSync(saved)));
          pass(`${tag}: the file is “Network, 17 Nov 2026.xlsx”: a heading row with every column and the owner’s own, then a row a person`, file.suggestedFilename() === 'Network, 17 Nov 2026.xlsx' && table.length === 19 && table[0].join('|') === 'Name|Organisation|Role|Email|Phone|Where to focus|Influence|Trust in you|Value delivery|What you get|Rhythm|Last spoke|Next due|Given|Asked|Notes|Sector' && table.some((r) => r[0] === 'Dana Whitfield' && r[5] === 'Keep close' && r[6] === '9' && r[10] === 'Every month'), `${file.suggestedFilename()}, ${table.length} rows`);
          pass(`${tag}: “Downloaded”`, (await toastText(page)) === 'Downloaded');
        } finally { rmSync(dir, { recursive: true, force: true }); }
        await a.close();
      }

      // ---------------------------------------------------------------- Today, the menu's count, search
      if (on('net-today')) {
        const tag = `net-today, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach' });
        const { page } = a;
        const section = page.locator('.cc-main section', { has: page.locator('h2', { hasText: /keep in touch/i }) });
        const rows = await section.locator('.cc-row').evaluateAll((list) => list.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}: Today’s Keep in touch shows the three most overdue, one quiet line each, then “Show all 9”, then past clients’ check-ins`, /^Sofia Marsh Key contact$/.test(rows[0]) && /^Dana Whitfield Sponsor$/.test(rows[1]) && /^Hannah Wells Client$/.test(rows[2]) && (await section.getByRole('button', { name: 'Show all 9', exact: true }).count()) === 1 && rows.slice(3).some((r) => /check-in/.test(r)), rows.join(' | '));
        pass(`${tag}: a screen reader hears the quiet line (“Sofia Marsh: 3 months since you spoke.”)`, (await section.locator('.cc-row').first().getAttribute('aria-label')) === 'Sofia Marsh: 3 months since you spoke. Open', await section.locator('.cc-row').first().getAttribute('aria-label'));
        await section.locator('.cc-row').first().click(); await settle(page, 1200);
        pass(`${tag}: a line opens that person in Network`, /\/coach\/network\?person=/.test(page.url()) && (await panelWords(page)).includes('I spoke to Sofia today'));
        await press(page, 'I spoke to Sofia today', dialog(page));
        await go(page, '/coach');
        const after = await section.locator('.cc-row').evaluateAll((list) => list.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}: once spoken to, she leaves Today’s lines and the next most overdue shows`, /^Dana Whitfield/.test(after[0]) && !after.some((r) => r.startsWith('Sofia')) && (await section.getByRole('button', { name: 'Show all 8', exact: true }).count()) === 1, after.join(' | '));
        await section.getByRole('button', { name: 'Show all 8', exact: true }).click(); await settle(page, 1000);
        pass(`${tag}: “Show all” opens Network’s Actions`, page.url().endsWith('/coach/network') && (await words(page)).toLowerCase().includes('due now'));

        // The menu's count.
        await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 900);
        const item = page.locator('.cc-menu .cc-menu-item', { hasText: 'Network' });
        pass(`${tag}: the menu shows how many are due a catch-up beside Network, said in words to a screen reader`, (await item.innerText()).replace(/\s+/g, ' ').trim() === 'Network 8' && (await item.getAttribute('aria-label')) === 'Network, 8 due a catch-up', `${(await item.innerText()).replace(/\s+/g, ' ')} / ${await item.getAttribute('aria-label')}`);
        pass(`${tag}: no keyboard shortcut is shown in the menu or the search box`, !/[⌘⌥⇧]|\bCtrl\b/.test(await page.locator('.cc-app').innerText()));
        await page.keyboard.press('Escape'); await settle(page, 500);

        // Search.
        await page.getByRole('button', { name: 'Search, or do anything' }).click();
        await page.keyboard.type('priyesh'); await settle(page, 1000);
        const hits = await page.locator('.cc-jump-item').evaluateAll((list) => list.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}: search finds Network’s people, archived ones marked`, hits.some((h) => h === 'Priyesh Young Network, archived'), hits.join(' | '));
        await page.locator('.cc-jump-input').fill('northfield'); await settle(page, 1000);
        const byOrg = await page.locator('.cc-jump-item').evaluateAll((list) => list.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}: and finds them by organisation`, byOrg.filter((h) => / Network$/.test(h)).length >= 3, byOrg.join(' | '));
        await page.locator('.cc-jump-input').fill('hannah wells'); await settle(page, 1000);
        await page.locator('.cc-jump-item', { hasText: /Network$/ }).first().click(); await settle(page, 1200);
        pass(`${tag}: choosing one opens their panel`, /person=/.test(page.url()) && (await panelWords(page)).includes('I spoke to Hannah today'), page.url().slice(-60));
        await page.keyboard.press('Escape'); await settle(page, 500);
        await page.getByRole('button', { name: 'Search, or do anything' }).click();
        await page.keyboard.type('add someone'); await settle(page, 600);
        await page.locator('.cc-jump-item', { hasText: 'Add someone to your Network' }).click(); await settle(page, 1000);
        pass(`${tag}: “Add someone to your Network” in search opens its panel`, (await panelWords(page)).toLowerCase().includes('add to your network'));
        await a.close();
      }

      // ---------------------------------------------------------------- offline after a reload, then back (run 6, item 9)
      if (on('net-offline') && db === 'there') {
        const tag = `net-offline, ${mode}`;
        const a = await openAt({ db, tag, path: '/coach/network?tab=table' });
        const { page, store } = a;
        // The device says it is offline (navigator.onLine false) while the flag is set, as a phone with no signal does.
        await page.addInitScript(() => { try { if (sessionStorage.getItem('f6-offline') === '1') Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true }); } catch { /* */ } });
        for (const tab of ['table', 'actions']) {
          await go(page, `/coach/network?tab=${tab}`);
          const online = await words(page);
          const name = tab === 'table' ? (await rowNames(page))[0] : 'Sofia Marsh';
          store.down = true;
          await page.evaluate(() => sessionStorage.setItem('f6-offline', '1'));
          await page.reload();
          await page.waitForSelector('.cc-app', { timeout: 20000 });
          const drawn = Date.now();
          let shown = null;
          try { await page.locator('.cc-main').getByText(name, { exact: true }).first().waitFor({ timeout: 10000 }); shown = Date.now() - drawn; } catch { /* checked below */ }
          const offline = await words(page);
          pass(`${tag}, ${tab}: after a reload with no connection the device copy shows as soon as the portal does (within 1.5 s), never an empty Network`, shown !== null && shown <= 1500, shown === null ? `never: ${offline.slice(0, 160)}` : `${shown} ms`);
          pass(`${tag}, ${tab}: it never says it needs a connection the first time`, !/needs a connection the first time/.test(offline) && online.includes(name));
          store.down = false;
          await page.evaluate(() => sessionStorage.removeItem('f6-offline'));
          const asked = store.calls.length;
          await page.reload();
          await page.waitForSelector('.cc-app', { timeout: 20000 });
          await settle(page, 1300);
          pass(`${tag}, ${tab}: back online, a reload asks the database again and shows the same people`, (await words(page)).includes(name) && store.calls.slice(asked).some((c) => /network_page/.test(c)), store.calls.slice(asked).filter((c) => /network/.test(c)).slice(0, 3).join('; '));
        }
        await a.close();
      }

      // ---------------------------------------------------------------- an associate
      if (on('net-associate')) {
        const tag = `net-associate, ${mode}`;
        const a = await openAt({ role: 'associate', db, tag, path: '/coach/network?tab=table' });
        const { page } = a;
        pass(`${tag}: an associate who opens Network lands on their own Today`, new URL(page.url()).pathname === '/coach' && !(await words(page)).includes('Sofia Marsh'), page.url());
        await go(page, `/coach/network?person=${CRM.david}`);
        pass(`${tag}: and so does one who opens a person’s address`, new URL(page.url()).pathname === '/coach' && (await dialog(page).count()) === 0);
        pass(`${tag}: Today has no Network people in Keep in touch`, !(await words(page)).includes('Sofia Marsh') && !(await words(page)).includes('Dana Whitfield'));
        await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 800);
        pass(`${tag}: the menu has no Network`, !(await page.locator('.cc-menu').innerText()).includes('Network'));
        await page.keyboard.press('Escape'); await settle(page, 400);
        await page.getByRole('button', { name: 'Search, or do anything' }).click();
        await page.keyboard.type('sofia'); await settle(page, 1000);
        const hits = await page.locator('.cc-jump-item').allInnerTexts();
        pass(`${tag}: search finds nobody of the owner’s Network, and offers no Network page or action`, !hits.some((h) => /Sofia|Network/.test(h)), hits.join(' | '));
        await page.locator('.cc-jump-input').fill('network'); await settle(page, 800);
        pass(`${tag}: nor by its name`, !(await page.locator('.cc-jump-item').allInnerTexts()).some((h) => /Network/.test(h)));
        pass(`${tag}: nothing asked for Network at all`, !a.store.calls.slice(a.callsFrom).some((c) => /network_(page|map|counts|people)/.test(c)), a.store.calls.slice(a.callsFrom).filter((c) => /network_(page|map|counts|people)/.test(c)).slice(0, 3).join('; '));
        await a.close();
      }
    }

    // ---------------------------------------------------------------- before 052, then 052 arrives
    if (on('net-arrive')) {
      const tag = 'net-arrive';
      const a = await openAt({ db: 'none', tag: `${tag}, on the device`, path: `/coach/network?person=${CRM.david}`, keepOpen: true });
      let { page } = a;
      await press(page, 'Log an ask', dialog(page));
      await dialog(page).getByRole('radio', { name: 'Advice' }).click();
      await press(page, 'Save', dialog(page));
      await page.keyboard.press('Escape'); await settle(page, 500);
      await page.locator('.cc-main .ds-addrow', { hasText: 'Add someone' }).click(); await settle(page, 600);
      await dialog(page).getByLabel('Who?').fill('Nell Okoye');
      await press(page, 'Add', dialog(page));
      const before = { people: (await a.peopleNow()).length, gives: (await a.givesNow()).length };
      pass(`${tag}: on the device, an ask and a new person are kept, and nothing was sent or tried`, before.people === 21 && before.gives === networkSeed().network_gives.length + 1 && a.store.calls.filter((c) => c.startsWith('blocked')).length === 0, JSON.stringify(before));
      await a.close();
      await page.close();

      // After: 049 to 052 are there, with nothing in them yet. The same device opens Network.
      page = await a.ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
      await page.clock.setFixedTime(TUE);
      const store = await standIn(page, { role: 'owner', db: 'there', day: true, cal: true, crm: true, strict: true, rows: {}, now: () => new Date(TUE) });
      await page.route('**/api/**', (route) => json(route, { ok: true, sent: false }));
      await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
      for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await page.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
      await page.evaluate(() => { for (const k of ['clarity-coach-not-yet', 'clarity-coach-crm-not-yet', 'clarity-coach-day-not-yet', 'clarity-coach-cal-not-yet']) localStorage.removeItem(k); }).catch(() => {});
      await page.goto(`${APP}/coach/network`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      const waiting = () => page.evaluate((id) => Object.keys(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"people":{}}').people || {}).length, a.me);
      for (let i = 0; i < 80; i += 1) { if ((await waiting()) === 0 && (store.rows.network_people || []).length >= before.people) break; await settle(page, 500); }
      pass(`${tag}: once 052 is there, Network’s people move across, and none is left waiting on the device`, (await waiting()) === 0 && (store.rows.network_people || []).length === before.people, `${(store.rows.network_people || []).length} of ${before.people}, ${await waiting()} waiting`);
      pass(`${tag}: what you’ve given and asked went with them`, (store.rows.network_gives || []).length === before.gives && (store.rows.network_gives || []).some((g) => g.person_id === CRM.david && g.direction === 'asked' && g.kind === 'advice'), `${(store.rows.network_gives || []).length} of ${before.gives}`);
      pass(`${tag}: the database refused none of it`, !store.calls.some((c) => c.startsWith('refused') && /network_/.test(c)), store.calls.filter((c) => c.startsWith('refused')).slice(0, 3).join('; '));
      await settle(page, 1200);
      pass(`${tag}: Network reads the same from the database: Sofia first, 9 days overdue, and the new person there`, /^Sofia Marsh .* 9 days overdue$/.test((await actionRows(page, 'Due now'))[0] || '') && store.rows.network_people.some((p) => p.name === 'Nell Okoye'), (await actionRows(page, 'Due now'))[0]);
      await go(page, '/coach/network?tab=table');
      pass(`${tag}: opened again, nobody arrives twice`, store.rows.network_people.length === before.people && (await page.locator('.cc-net-ctl .cc-net-count').innerText()) === '19 people', `${store.rows.network_people.length}, ${await page.locator('.cc-net-ctl .cc-net-count').innerText().catch(() => '')}`);
      pass(`${tag}: nothing in the console, and nothing reached the test project`, errors.length === 0 && !store.calls.some((c) => c.startsWith('blocked')), [...errors, ...store.calls.filter((c) => c.startsWith('blocked'))].slice(0, 3).join(' | '));
      await clearDevice(page, a.me);
      await a.ctx.close();
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  for (const line of timings) console.log(line);
  report.done();
}

run().catch((e) => { console.error(String(e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; });
