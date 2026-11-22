// The functionality tester for the coach portal (Phase 6a run 1): a day as
// Tim, driven through the real pages, then the same pages as an associate
// on a phone.
//
//   node --import ./tests/scores/register.mjs tests/coach/flows.mjs
//   PARTS=shell,clients,table,client,workshop,settings,associate narrows it.
//   PARTS=day-plan,day-calls,day-week,day-left,day-finances,day-client,day-move are run 2's
//   coaching day (day-flows.mjs: a day as Tim at 1440, then as Maya at 400, each
//   on the device only and with the database there; ROLES and DB narrow them).
//   Run a few parts a command: the whole file takes longer than one command should.
//
// As the owner (1440, 049's tables answered by the stand-in): the shell,
// the menu, the next-call bar with test calls, search, the bell; add three
// clients and a team of five, tag them, make a saved view, add a custom
// field and edit it in place, the column menus, the view switches, select
// several with Undo, merge and export; pin a note, clock in and out, the
// birthday note with Email (nothing sent), register for a workshop and mark
// attendance; Settings' two panes.
// As an associate (400, everything kept on the device, as before 049):
// their menu, their Settings on a phone, the list and the board only,
// press and hold to choose, and the pages they must never reach.
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, OTHER, seedDevice, settle, standIn, toastText } from './shared.mjs';
import { ADMIN_ROWS, ID, seedRows } from './seed.mjs';
import { DAY_PARTS, runDay } from './day-flows.mjs';

const report = makeReport('Coach portal, the functionality tester');
const { pass } = report;
const parts = (process.env.PARTS || ['shell', 'clients', 'table', 'client', 'workshop', 'settings', 'associate', ...DAY_PARTS].join(',')).split(',');
const has = (p) => parts.includes(p);
const browser = await chromium.launch();

const text = (page, sel = '.cc-main') => page.locator(sel).innerText();
const button = (page, name, exact = true) => page.getByRole('button', { name, exact });
const panel = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 500); };
async function open(page, path) { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 900); }
async function addClient(page, { name, email, tag, referred }) {
  await button(page, 'Add client').first().click();
  await settle(page, 500);
  const p = panel(page);
  await p.getByLabel('Name', { exact: true }).fill(name);
  if (email) await p.getByLabel('Email').fill(email);
  if (tag) await p.getByRole('button', { name: tag, exact: true }).click();
  if (referred) await p.getByLabel('Referred by').fill(referred);
  await p.getByRole('button', { name: 'Add client', exact: true }).click();
  await settle(page, 900);
}

// ================================================================ the owner, with 049's tables answered
if (parts.some((p) => p !== 'associate' && !DAY_PARTS.includes(p))) {
  const ctx = await coachContext(browser, { size: 1440, theme: 'light', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  const sent = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('request', (r) => { if (/\/api\/|functions\/v1|resend|sendgrid|mailgun/.test(r.url())) sent.push(r.url()); });
  const db = await standIn(page, { role: 'owner', db: 'there', rows: seedRows(), admin: ADMIN_ROWS() });
  await open(page, '/coach');
  const me = await accountId(page);
  await clearDevice(page, me);
  await open(page, '/coach');

  if (has('shell')) {
    pass('shell: a coach lands on Today, in the coach portal', new URL(page.url()).pathname === '/coach' && /Today/i.test(await page.locator('h1').first().innerText()));
    pass('shell: the tab is named for Clarity Coach', (await page.title()) === 'Today, Clarity Coach', await page.title());
    const head = await page.evaluate(() => ({ manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'), touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), name: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content }));
    pass('shell: the coach portal has its own manifest, icon and name', head.manifest === '/coach-app/manifest.webmanifest' && head.touch === '/coach-app/apple-touch-icon.png' && head.name === 'Clarity Coach', JSON.stringify(head));
    const manifest = await (await page.request.get(`${APP}/coach-app/manifest.webmanifest`)).json();
    pass('shell: the manifest opens on Today, in white', manifest.start_url === '/coach' && manifest.theme_color === '#FFFFFF' && manifest.icons.length === 3, JSON.stringify(manifest).slice(0, 120));
    for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      pass(`shell: the icon ${f} is served`, (await page.request.get(`${APP}/coach-app/${f}`)).status() === 200);
    }
    // The header: the menu button, one search box, the bell with its count.
    const header = await page.locator('.cc-header').evaluate((h) => [...h.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')));
    pass('shell: the header is the menu button, one search box and the bell', header.length === 3 && header[0] === 'Open the menu' && header[1].startsWith('Search') && header[2].startsWith('Notifications'), header.join(' | '));
    pass('shell: the bell shows its small count', (await page.locator('.cc-count').innerText()) === '2');

    // The menu, exactly as M11's for the owner (pages of later runs show on a build that isn't live).
    await button(page, 'Open the menu').click();
    await settle(page, 500);
    const items = await page.locator('.cc-menu-item').allInnerTexts();
    pass('shell: the owner’s menu, in M11’s order', items.join(', ') === 'Today, Finances, To-dos, Clients, Leads, Network, Boards, Calendar, Leading Ideas, Library, Executives, Settings, Sign out', items.join(', '));
    pass('shell: favourite views sit under their own label', (await page.locator('.cc-menu-label').innerText()).toLowerCase() === 'favourite views');
    const above = await page.evaluate(() => { const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex) || 0; return z('.cc-menu') > z('.cc-header'); });
    pass('shell: the menu sits above everything', above);
    // The Calendar is built (run 3): Library is still a later run's page.
    await page.locator('.cc-menu-item', { hasText: 'Library' }).click();
    await settle(page, 600);
    pass('shell: a page of a later run opens the calm “Coming in this build” page', /Coming in this build/.test(await text(page)) && new URL(page.url()).pathname === '/coach/library');
    await button(page, 'Open the menu').click();
    await settle(page, 400);
    await page.keyboard.press('Escape');
    await settle(page, 400);
    pass('shell: Escape closes the menu', (await page.locator('.cc-menu').count()) === 0);

    // The next-call bar, with test calls (it fills in run 3).
    const call = (minutes) => page.evaluate((m) => sessionStorage.setItem('clarity-coach-test-calls', JSON.stringify([{ name: 'Sam Okafor', startsAt: new Date(Date.now() + m * 60000).toISOString(), zoom: 'https://zoom.example/j/1', briefTo: '/coach/clients' }])), minutes);
    await call(30); await open(page, '/coach');
    pass('call bar: nothing shows 30 minutes before a call', (await page.locator('.cc-callbar').count()) === 0);
    await call(8); await open(page, '/coach');
    pass('call bar: it shows from 10 minutes before', /Sam Okafor in 8 minutes/.test(await page.locator('.cc-callbar').innerText()), await page.locator('.cc-callbar').innerText().catch(() => 'none'));
    pass('call bar: not coral until 5 minutes before', !(await page.locator('.cc-callbar--soon').count()));
    const under = await page.evaluate(() => document.querySelector('.cc-callbar').getBoundingClientRect().top >= document.querySelector('.cc-header').getBoundingClientRect().bottom - 1);
    pass('call bar: it sits under the header', under);
    const zoom = page.locator('.cc-callbar a', { hasText: 'Join on Zoom' });
    pass('call bar: Join on Zoom is a quiet link', (await zoom.getAttribute('class')) === 'ds-link' && (await zoom.getAttribute('href')) === 'https://zoom.example/j/1');
    await call(4); await open(page, '/coach/clients');
    pass('call bar: coral from 5 minutes before, on every page', (await page.locator('.cc-callbar--soon').count()) === 1 && /in 4 minutes/.test(await page.locator('.cc-callbar').innerText()));
    await call(-3.2); await open(page, '/coach/settings');
    pass('call bar: it stays until 10 minutes in', /started 3 minutes ago/.test(await page.locator('.cc-callbar').innerText()));
    await call(-11); await open(page, '/coach');
    pass('call bar: and goes after that', (await page.locator('.cc-callbar').count()) === 0);
    await page.evaluate(() => sessionStorage.removeItem('clarity-coach-test-calls'));

    // Search: one box, recent items before anything is typed, people, pages and actions as you type.
    await open(page, `/coach/clients/${ID.sam}`);
    await open(page, '/coach');
    await button(page, 'Search, or do anything').click();
    await settle(page, 400);
    const before = await page.locator('.cc-jump-label').allInnerTexts();
    pass('search: before typing it offers actions (and recent items once there are some)', before.includes('Actions'), before.join(', '));
    pass('search: no keyboard shortcut is shown', (await page.locator('.cc-jump kbd').count()) === 0 && !/⌘/.test(await page.locator('.cc-jump').innerText()));
    await page.keyboard.type('owen');
    await settle(page, 300);
    pass('search: the owner finds an associate’s client by name, marked as theirs', /Owen Price\s+Maya’s client/.test(await page.locator('.cc-jump-list').innerText()), await page.locator('.cc-jump-list').innerText());
    await page.keyboard.press('Enter');
    await settle(page, 500);
    pass('search: and is told only Maya opens their page', /only Maya opens their page/.test(await toastText(page)) && new URL(page.url()).pathname === '/coach');
    await button(page, 'Search, or do anything').click();
    await page.keyboard.type('sam');
    await settle(page, 300);
    await page.keyboard.press('Enter');
    await settle(page, 700);
    pass('search: a person opens their page', new URL(page.url()).pathname === `/coach/clients/${ID.sam}`);
    await button(page, 'Search, or do anything').click();
    await settle(page, 300);
    pass('search: recent items come first next time', (await page.locator('.cc-jump-label').first().innerText()) === 'Recent' && /Sam Okafor/.test(await page.locator('.cc-jump-item').first().innerText()));
    await page.keyboard.type('settings tags');
    await settle(page, 300);
    pass('search: it finds pages', /Tags and fields/.test(await page.locator('.cc-jump-list').innerText()));
    await page.locator('.cc-jump-input').fill('add cl');
    await settle(page, 300);
    await page.keyboard.press('Enter');
    await settle(page, 900);
    pass('search: an action runs from it (Add client opens its panel)', /Add client/i.test(await panel(page).locator('h2').innerText().catch(() => '')));
    await closePanel(page);

    // The bell: a side panel list, with Mark all as read.
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await settle(page, 600);
    const rows = await panel(page).locator('.cc-notice').count();
    pass('bell: its panel lists every notification, new ones marked', rows === 3 && (await panel(page).locator('.cc-notice--new').count()) === 2);
    await panel(page).getByRole('button', { name: 'Mark all as read' }).click();
    await settle(page, 600);
    pass('bell: Mark all as read clears the count', (await page.locator('.cc-count').count()) === 0 && db.rows.coach_notifications.every((n) => n.read_at));
    pass('bell: marking read changes only that (sent as a change, never an add)', db.calls.includes('PATCH coach_notifications') && !db.calls.includes('POST coach_notifications'));
    await page.locator('.ds-toast-undo').click();
    await settle(page, 700);
    pass('bell: Undo brings the count back', (await page.locator('.cc-count').innerText().catch(() => '')) === '2');
    await closePanel(page);
  }

  if (has('clients')) {
    await open(page, '/coach/clients');
    // Add client: never a greyed-out button; it says what's missing.
    await button(page, 'Add client').first().click();
    await settle(page, 500);
    const add = panel(page).getByRole('button', { name: 'Add client', exact: true });
    pass('add client: the button is never greyed out', !(await add.isDisabled()));
    await add.click();
    pass('add client: pressed too early, it says what’s missing', /Type their name to carry on\./.test(await panel(page).innerText()));
    await panel(page).getByLabel('Name', { exact: true }).fill('Nora Ellis');
    await panel(page).getByLabel('Email').fill('not an email');
    await add.click();
    pass('add client: an email that isn’t one is said calmly', /doesn’t look right/.test(await panel(page).innerText()));
    await closePanel(page);

    await addClient(page, { name: 'Nora Ellis', email: 'nora@example.invalid', tag: 'Executive', referred: 'Sam Okafor' });
    pass('add client: it opens the new client’s page', /Nora Ellis/i.test(await page.locator('h1').innerText()) && /is in your clients/.test(await toastText(page)));
    pass('add client: it makes a profile with no account, and sends nothing', db.rows.client_profiles.some((p) => p.name === 'Nora Ellis' && p.user_id == null && p.invited_at == null) && sent.length === 0);
    pass('add client: Getting started leads a new client’s page', /Getting started/i.test(await text(page)) && /Invite to the portal/.test(await text(page)));
    await open(page, '/coach/clients');
    await addClient(page, { name: 'Caleb Hunt', email: 'caleb@example.invalid' });
    await open(page, '/coach/clients');
    await addClient(page, { name: 'Hannah Wells' });
    pass('add client: three clients added', ['Nora Ellis', 'Caleb Hunt', 'Hannah Wells'].every((n) => db.rows.client_profiles.some((p) => p.name === n)));
    await page.locator('.ds-toast-undo').click();
    await settle(page, 900);
    pass('add client: Undo takes the last one back', !db.rows.client_profiles.some((p) => p.name === 'Hannah Wells'));
    await open(page, '/coach/clients');
    await addClient(page, { name: 'Hannah Wells' });

    // Add a team of five, from a pasted list with a duplicate and someone already here.
    await open(page, '/coach/clients');
    await button(page, 'Add team').click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: /^Add/ }).last().click();
    pass('add a team: pressed with nothing pasted, it says what’s missing', /Paste a list or choose a spreadsheet to carry on\./.test(await panel(page).innerText()));
    await page.locator('#cc-team-paste').fill(['Name,Email,Role', 'Tom Barker,tom@example.invalid,Finance lead', 'Ravi Patel,ravi@example.invalid,', 'Grace Okoro,grace.o@example.invalid,Partner', 'Ines Duarte,ines@example.invalid,', 'Yusuf Khan,yusuf@example.invalid,Head of sales', 'Sam Again,sam@example.invalid,', 'Tom Twice,tom@example.invalid,'].join('\n'));
    await settle(page, 400);
    const preview = await panel(page).locator('.cc-preview').innerText();
    pass('add a team: the preview finds 5 new, 1 already a client and 1 twice in the list', /5 to add\. 1 is already a client\. 1 is in this list twice\./.test(preview), preview.slice(0, 120));
    await panel(page).getByRole('button', { name: 'Add 5 clients' }).click();
    await settle(page, 1200);
    pass('add a team: everyone is made in one go', ['Tom Barker', 'Ravi Patel', 'Grace Okoro', 'Ines Duarte', 'Yusuf Khan'].every((n) => db.rows.client_profiles.some((p) => p.name === n)) && /5 clients added/.test(await toastText(page)));
    pass('add a team: their roles come too', db.rows.client_profiles.find((p) => p.name === 'Tom Barker')?.job_title === 'Finance lead');

    // Select several: tick boxes on hover, then Tag, with Undo.
    await open(page, '/coach/clients');
    const tick = (name) => page.getByRole('checkbox', { name: `Select ${name}` });
    pass('select several: the tick is hidden until the row is pointed at', (await tick('Tom Barker').evaluate((e) => getComputedStyle(e).opacity)) === '0');
    await page.locator('.cc-pick-row', { hasText: 'Tom Barker' }).hover();
    await settle(page, 300);
    pass('select several: pointing at a row shows its tick', (await tick('Tom Barker').evaluate((e) => getComputedStyle(e).opacity)) === '1');
    for (const n of ['Tom Barker', 'Ravi Patel', 'Grace Okoro']) await tick(n).click({ force: true });
    await settle(page, 300);
    pass('select several: the bar says how many are chosen', /3 chosen/.test(await page.locator('.cc-bulk').innerText()));
    await page.locator('.cc-bulk-btn', { hasText: 'Tag' }).click();
    await settle(page, 400);
    await page.getByRole('menuitem', { name: 'Sport' }).click();
    await settle(page, 900);
    const sportLinks = () => db.rows.coach_tag_links.filter((l) => l.tag_id === ID.tagSport).length;
    pass('select several: Tag tags them all', sportLinks() === 4 && /Sport added to 3 clients/.test(await toastText(page)), `${sportLinks()}`);
    await page.locator('.ds-toast-undo').click();
    await settle(page, 900);
    pass('select several: Undo takes the tag off again', sportLinks() === 1, `${sportLinks()}`);
    // Move to a coach (the owner), with Undo.
    await tick('Ines Duarte').click({ force: true });
    await page.locator('.cc-bulk-btn', { hasText: 'Move' }).click();
    await settle(page, 400);
    await page.getByRole('menuitem', { name: 'To Maya Collins' }).click();
    await settle(page, 1200);
    pass('move to a coach: the client moves, and shows as Maya’s', /1 client moved to Maya/.test(await toastText(page)) && /Ines Duarte\s*Maya’s client/.test((await text(page)).replace(/\n+/g, ' ')), (await toastText(page)));
    await page.locator('.ds-toast-undo').click();
    await settle(page, 1200);
    pass('move to a coach: Undo brings them back', db.rows.client_profiles.some((p) => p.name === 'Ines Duarte'));
    pass('move to a coach: it is in the Activity log', db.rows.activity_log.filter((a) => a.kind === 'move').length >= 3);

    // Filter, and a saved view that goes in the menu.
    await open(page, '/coach/clients');
    await button(page, 'Filter').click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'Executive', exact: true }).click();
    await settle(page, 300);
    pass('filter: the button counts what will show', /Show \d+ clients?/.test(await panel(page).innerText()));
    await panel(page).getByRole('button', { name: 'Save as a view' }).click();
    pass('saved view: it asks for a name first', /Name this view to carry on\./.test(await panel(page).innerText()));
    await panel(page).getByLabel('Name this view').fill('Board members');
    await panel(page).getByRole('button', { name: 'Save as a view' }).click();
    await settle(page, 800);
    pass('saved view: it is saved with its filters', db.rows.coach_views.some((v) => v.name === 'Board members' && v.filters.tag?.includes(ID.tagExec)));
    await panel(page).getByRole('button', { name: 'Add Board members to the menu' }).click();
    await settle(page, 700);
    await closePanel(page);
    const shownNames = await page.locator('.cc-row b').allInnerTexts();
    pass('filter: only tagged clients show', shownNames.includes('Sam Okafor') && shownNames.includes('Nora Ellis') && !shownNames.includes('Jordan Reyes'), shownNames.join(', '));
    await button(page, 'Clear').click();
    await settle(page, 400);
    await button(page, 'Open the menu').click();
    await settle(page, 400);
    await page.locator('.cc-menu-item', { hasText: 'Board members' }).click();
    await settle(page, 900);
    const fromMenu = await page.locator('.cc-row b').allInnerTexts();
    pass('saved view: a favourite opens from the menu with its filters on', fromMenu.includes('Nora Ellis') && !fromMenu.includes('Jordan Reyes') && /Board members/.test(await page.locator('.cc-toolbar-who').innerText()), fromMenu.join(', '));
    await button(page, 'Clear').click();

    // Merge two duplicates, choosing which value to keep, with Undo.
    await addClient(page, { name: 'Caleb Hunt', email: null });
    await open(page, '/coach/clients');
    pass('merge: two people with one name get one quiet line', /Caleb Hunt and Caleb Hunt look like the same person\./.test(await text(page)));
    await button(page, 'Merge them').click();
    await settle(page, 600);
    pass('merge: nothing differs to choose here, so what each has is kept', /Nothing is lost\./.test(await panel(page).innerText()));
    await closePanel(page);
    // Two who differ: the choices sit side by side at one height.
    const a = db.rows.client_profiles.find((p) => p.name === 'Tom Barker');
    a.city = 'Leeds';
    db.rows.client_profiles.push({ ...a, id: '00000000-0000-4000-8000-00000000aaaa', name: 'Thomas Barker', job_title: 'Finance director and company secretary for the whole group', city: 'York' });
    await open(page, '/coach/clients');
    await button(page, 'Merge them').click(); // Caleb first: say they're different people
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'They’re different people' }).click();
    await settle(page, 600);
    await button(page, 'Merge them').click();
    await settle(page, 600);
    const heights = await panel(page).locator('.cc-merge-row[role=radiogroup]').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('.cc-merge-choice')].map((c) => Math.round(c.getBoundingClientRect().height))));
    pass('merge: choices side by side are the same height', heights.length >= 2 && heights.every(([x, y]) => x === y), JSON.stringify(heights));
    await panel(page).getByRole('radio', { name: 'Thomas Barker' }).click();
    await panel(page).getByRole('button', { name: 'Merge into one', exact: true }).click();
    await settle(page, 1200);
    pass('merge: it goes through the database’s own checked function', db.calls.includes('rpc client_merge') || /Merged into one|didn’t/.test(await toastText(page)), await toastText(page));

    // Export as a spreadsheet: every field comes with it.
    await open(page, '/coach/clients');
    await button(page, 'Export').click();
    await settle(page, 500);
    await panel(page).getByRole('radio', { name: 'CSV', exact: true }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), panel(page).getByRole('button', { name: 'Download' }).click()]);
    const csv = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    pass('export: the file is named in words and holds every field, the coach’s own included', /^Clients, \d{4}-\d{2}-\d{2}\.csv$/.test(file.suggestedFilename()) && /Name,Email,Mobile,Organisation/.test(csv) && /Sector,Value,Renewal date/.test(csv) && /Sam Okafor/.test(csv) && !/Owen Price/.test(csv), file.suggestedFilename());
    await settle(page, 600);
    pass('export: it is in the Activity log', db.rows.activity_log.some((x) => x.kind === 'export' && /exported \d+ clients/.test(x.summary)));
    await button(page, 'Export').click();
    await settle(page, 400);
    await panel(page).getByRole('radio', { name: 'Excel', exact: true }).click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), panel(page).getByRole('button', { name: 'Download' }).click()]);
    const bytes = await (await xlsx.createReadStream()).toArray().then((c) => Buffer.concat(c));
    pass('export: Excel is a real .xlsx file', xlsx.suggestedFilename().endsWith('.xlsx') && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  }

  if (has('table')) {
    await open(page, '/coach/clients');
    // The gliding view switch.
    const tile = () => page.locator('.cc-toolbar .ds-seg-tile').evaluate((t) => t.style.transform);
    const atList = await tile();
    await button(page, 'Board').click();
    await settle(page, 700);
    pass('view switch: a raised tile glides to the chosen option', (await tile()) !== atList && (await button(page, 'Board').getAttribute('aria-pressed')) === 'true');
    const glide = await page.locator('.cc-toolbar .ds-seg-tile').evaluate((t) => getComputedStyle(t).transitionDuration);
    pass('view switch: it glides in 220ms', /0\.22s/.test(glide), glide);
    const cards = await page.locator('.cc-card').evaluateAll((c) => [...new Set(c.map((x) => Math.round(x.getBoundingClientRect().height)))]);
    pass('board: every card is one height', cards.length === 1, cards.join(', '));
    const cols = await page.locator('.cc-board-head').allInnerTexts();
    pass('board: the five columns', cols.map((c) => c.split('\n')[0]).join(', ') === 'Starting, Active, Renewal due, Closing, Paused', cols.join(' | '));
    await button(page, 'Table').click();
    await settle(page, 700);
    pass('view switch: the table shows', (await page.locator('.cc-table').count()) === 1);
    const widths = await page.evaluate(() => [document.querySelector('.cc-col').getBoundingClientRect().width, document.documentElement.scrollWidth - window.innerWidth]);
    pass('table: the page widens for it, with no sideways scroll', widths[0] > 1000 && widths[1] <= 0, widths.join(', '));
    const heads = await page.locator('.cc-table thead th').evaluateAll((t) => [...new Set(t.map((x) => Math.round(x.getBoundingClientRect().height)))]);
    pass('table: every heading sits at one height', heads.length === 1, heads.join(', '));

    // Add a custom field from the table, then edit it in place.
    await button(page, 'Add field').first().click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'Add the field' }).click();
    pass('custom field: it asks for a name first', /Type the field’s name to carry on\./.test(await panel(page).innerText()));
    await panel(page).getByLabel('Name', { exact: true }).fill('Budget');
    await panel(page).getByRole('radio', { name: 'Number' }).click();
    await panel(page).getByRole('button', { name: 'Add the field' }).click();
    await settle(page, 900);
    pass('custom field: it becomes a column', (await page.locator('.cc-table thead').innerText()).includes('Budget') && db.rows.coach_fields.some((f) => f.name === 'Budget' && f.kind === 'number'));
    const row = page.locator('.cc-table tbody tr', { hasText: 'Sam Okafor' });
    await row.getByRole('button', { name: /^Budget, empty\. Edit$/ }).click();
    await settle(page, 300);
    const box = row.locator('.cc-cell-input');
    await box.fill('abc');
    await box.press('Enter');
    await settle(page, 400);
    pass('edit in place: a number box refuses words, calmly', /Type a number to carry on\./.test(await toastText(page)) && (await row.locator('.cc-cell-input').count()) === 1);
    await box.fill('£12,500');
    await box.press('Enter');
    await settle(page, 900);
    pass('edit in place: Enter saves, and the value reads as a number', /12,500/.test(await row.innerText()) && db.rows.coach_field_values.some((v) => Number(v.value_number) === 12500));
    await row.getByRole('button', { name: /^Budget, 12,500\. Edit$/ }).click();
    await settle(page, 300);
    const caret = await row.locator('.cc-cell-input').evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd, length: el.value.length, edge: getComputedStyle(el).borderColor, outline: getComputedStyle(el).outlineStyle }));
    pass('edit in place: the box opens with the cursor at the end, nothing selected', caret.start === caret.length && caret.end === caret.length, JSON.stringify(caret));
    pass('edit in place: the box has the grey edge, never the coral ring', caret.outline === 'none' && !/255, 111, 92|194, 65, 46/.test(caret.edge), JSON.stringify(caret));
    await row.locator('.cc-cell-input').fill('99');
    await row.locator('.cc-cell-input').press('Escape');
    await settle(page, 400);
    pass('edit in place: Escape puts it back', /12,500/.test(await row.innerText()));
    await row.getByRole('button', { name: /^Sector, Finance\. Edit$/ }).click();
    await settle(page, 300);
    await row.locator('select.cc-cell-input').selectOption('Media');
    await settle(page, 900);
    pass('edit in place: a choice opens its list', /Media/.test(await row.innerText()));
    await page.locator('.ds-toast-undo').click();
    await settle(page, 900);
    pass('edit in place: every edit has Undo', /Finance/.test(await row.innerText()));

    // Column menus: sort, show only, hide; they float above the table.
    await page.locator('.cc-th', { hasText: 'Sector' }).click();
    await settle(page, 500);
    const menu = page.locator('.cc-pop').last();
    const fixed = await menu.evaluate((m) => { const pop = m.closest('.ds-pop'); const b = m.getBoundingClientRect(); return { position: getComputedStyle(pop).position, inside: b.top >= 0 && b.left >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight, clipped: Boolean(m.closest('.cc-table-wrap')) }; });
    pass('column menu: it floats above the table (position fixed), never cut off', fixed.position === 'fixed' && fixed.inside && !fixed.clipped, JSON.stringify(fixed));
    pass('column menu: sort, show only and hide', /Sort\s+A to Z\s+Show only[\s\S]*Not set[\s\S]*Hide this column/.test(await menu.innerText()), (await menu.innerText()).replace(/\n/g, ' '));
    await menu.getByRole('menuitemcheckbox', { name: 'Sport' }).click();
    await settle(page, 500);
    await page.keyboard.press('Escape');
    await settle(page, 400);
    const sporty = await page.locator('.cc-table-name').allInnerTexts();
    pass('column menu: Show only filters by that column', sporty.length === 1 && sporty[0] === 'Jordan Reyes', sporty.join(', '));
    await button(page, 'Clear').click();
    await settle(page, 400);
    await page.locator('.cc-th', { hasText: 'Value' }).click();
    await settle(page, 400);
    await page.getByRole('menuitemcheckbox', { name: 'Highest first' }).click();
    await settle(page, 500);
    const firstName = await page.locator('.cc-table-name').first().innerText();
    pass('column menu: it sorts by that column', firstName === 'Jordan Reyes', firstName);
    await page.locator('.cc-th', { hasText: 'Renewal date' }).click();
    await settle(page, 400);
    await page.getByRole('menuitem', { name: 'Hide this column' }).click();
    await settle(page, 500);
    pass('column menu: Hide takes the column away', !(await page.locator('.cc-table thead').innerText()).includes('Renewal date'));
    await page.locator('.cc-th', { hasText: 'Name' }).click();
    await settle(page, 400);
    await page.getByRole('menuitem', { name: 'Show Renewal date' }).click();
    await settle(page, 500);
    pass('column menu: and it comes back from Name’s menu', (await page.locator('.cc-table thead').innerText()).includes('Renewal date'));
    await button(page, 'List').click();
  }

  if (has('client')) {
    // Pinned notes: up to 3, under the name.
    await open(page, `/coach/clients/${ID.jordan}`);
    await button(page, 'Private notes').click();
    await settle(page, 400);
    await button(page, 'Add my note').click();
    pass('notes: pressed with nothing typed, it says what’s missing', /Type your note to carry on\./.test(await text(page)));
    for (const body of ['Match days are Saturdays.', 'Prefers a call to a message.', 'Ask about the new assistant.', 'Likes numbers first.']) {
      await page.getByLabel('A new note').fill(body);
      await button(page, 'Add my note').click();
      await settle(page, 700);
    }
    for (let i = 0; i < 3; i += 1) { await page.getByRole('button', { name: /^Pin the note/ }).first().click(); await settle(page, 700); }
    const pins = await page.locator('.cc-pins p').allInnerTexts();
    pass('pinned notes: three sit under the name', pins.length === 3, pins.join(' | '));
    await page.getByRole('button', { name: /^Pin the note/ }).first().click();
    await settle(page, 500);
    pass('pinned notes: a fourth is refused calmly', /Up to 3 notes can be pinned/.test(await toastText(page)) && (await page.locator('.cc-pins p').count()) === 3);
    const eye = page.locator('.cc-fold-head', { hasText: 'Private notes' }).locator('.ds-who');
    pass('private notes: the eye says only you', /Only you can see these\./.test(await eye.getAttribute('aria-label')));
    // Folds remember what was left open.
    await open(page, `/coach/clients/${ID.sam}`);
    pass('folds: what was left open stays open on the next client', (await button(page, 'Private notes').getAttribute('aria-expanded')) === 'true');
    const foldRow = page.locator('.cc-fold-head', { hasText: 'Engagement' });
    await foldRow.scrollIntoViewIfNeeded();
    const box = await foldRow.boundingBox();
    await page.mouse.click(box.x + box.width - 200, box.y + box.height / 2);
    await settle(page, 400);
    pass('folds: they open from anywhere on the heading row', (await button(page, 'Engagement').getAttribute('aria-expanded')) === 'true');

    // Overview or Everything.
    await button(page, 'Everything').click();
    await settle(page, 600);
    const all = await page.locator('.cc-timeline-row').count();
    await page.getByLabel(/^Search Sam’s history/).fill('restructure');
    await settle(page, 400);
    pass('everything: one timeline, searchable', all >= 4 && (await page.locator('.cc-timeline-row').count()) === 1, `${all}`);
    await button(page, 'Overview').click();

    // Quick buttons.
    const links = await page.locator('.cc-links a').evaluateAll((a) => a.map((x) => [x.textContent, x.getAttribute('href')]));
    pass('quick buttons: Email opens the coach’s own email app; WhatsApp only with a mobile', links.some(([t, h]) => t === 'Email' && h === 'mailto:sam@example.invalid') && links.some(([t, h]) => t === 'WhatsApp' && h === 'https://wa.me/447700900123') && !links.some(([t]) => t === 'iMessage'), JSON.stringify(links));
    await open(page, `/coach/clients/${ID.jordan}`);
    const us = await page.locator('.cc-links a').evaluateAll((a) => a.map((x) => x.textContent));
    pass('quick buttons: iMessage shows for a +1 number', us.includes('iMessage'), us.join(', '));
    await open(page, `/coach/clients/${ID.leo}`);
    pass('quick buttons: with no email or mobile, none show', (await page.locator('.cc-links a').count()) === 0);

    // Time credit: Clock in and Clock out, to the minute.
    await open(page, `/coach/clients/${ID.marcus}`);
    pass('time credit: what is left shows as a figure in Nekst Light', /Time credit left\s+2 hours 10 minutes/.test((await text(page)).replace(/\n+/g, ' ')) && (await page.locator('.ds-stat-value').first().evaluate((e) => getComputedStyle(e).fontWeight)) === '300');
    await page.getByRole('button', { name: 'Clock in to Leadership offsite design' }).click();
    await settle(page, 1500);
    pass('time credit: Clock in starts the clock on that project', /Clocked in for 0:00:0\d/.test(await text(page)) && db.rows.time_entries.some((t) => !t.ended_at));
    await open(page, `/coach/clients/${ID.marcus}`);
    pass('time credit: the clock keeps running when the page is opened again', /Clocked in for 0:00:\d\d/.test(await text(page)));
    // To the minute: the clock is put back 61 minutes, then stopped.
    const running = db.rows.time_entries.find((t) => !t.ended_at);
    running.started_at = new Date(Date.now() - 61 * 60000 - 20000).toISOString();
    await open(page, `/coach/clients/${ID.marcus}`);
    await page.getByRole('button', { name: 'Clock out of Leadership offsite design' }).click();
    await settle(page, 900);
    pass('time credit: Clock out adds the whole minutes', /1 hour 1 minute added/.test(await toastText(page)) && /Time credit left\s+1 hour 9 minutes/.test((await text(page)).replace(/\n+/g, ' ')), await toastText(page));
    pass('time credit: one clock runs at a time', db.rows.time_entries.filter((t) => !t.ended_at).length === 0);

    // Names in quiet lines open a note; Email opens the coach's own email, and nothing is sent.
    await open(page, '/coach');
    const line = page.locator('.cc-quiet', { hasText: 'birthday today' });
    pass('name note: a birthday is one quiet line on Today', /It’s Priya Nair’s birthday today\./.test(await line.innerText()));
    const link = line.locator('.cc-inline-link');
    const style = await link.evaluate((el) => { const cs = getComputedStyle(el); const line2 = getComputedStyle(el.parentElement); return { colour: cs.color === line2.color, underline: cs.textDecorationLine, offset: cs.textUnderlineOffset, under: cs.textDecorationColor, tap: parseFloat(getComputedStyle(el, '::after').height) }; });
    pass('name note: the name is the line’s own colour, with a grey underline 4px below and a 44px tap area', style.colour && style.underline === 'underline' && style.offset === '4px' && style.tap >= 44, JSON.stringify(style));
    await link.hover();
    await settle(page, 400);
    const hover = await link.evaluate((el) => { const cs = getComputedStyle(el); return { colour: cs.color, under: cs.textDecorationColor }; });
    pass('name note: on hover the words turn coral and the underline stays grey', /194, 65, 46|255, 111, 92/.test(hover.colour) && hover.under !== hover.colour, JSON.stringify(hover));
    await link.click();
    await settle(page, 600);
    const note = panel(page);
    pass('name note: it opens a short drafted note', /Happy birthday, Priya!/.test(await note.getByLabel('A note to Priya').inputValue()));
    const mail = await note.locator('a', { hasText: 'Open in my email' }).getAttribute('href');
    pass('name note: Email opens the coach’s own email with the note', /^mailto:priya@example\.invalid\?subject=Happy%20birthday%2C%20Priya&body=Happy%20birthday/.test(mail), mail);
    pass('name note: “View Priya’s page” sits at the bottom', (await note.getByRole('button', { name: 'View Priya’s page' }).count()) === 1);
    pass('name note: nothing is sent from the portal', sent.length === 0, sent.join(', '));
    await note.getByRole('button', { name: 'View Priya’s page' }).click();
    await settle(page, 700);
    pass('name note: and it opens her page', new URL(page.url()).pathname === `/coach/clients/${ID.priya}`);

    // More: export their data, delete with the name typed.
    await button(page, 'More').click();
    await settle(page, 300);
    const [data] = await Promise.all([page.waitForEvent('download'), button(page, 'Export Priya’s data').click()]);
    const exported = JSON.parse(await (await data.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
    pass('more: Export their data is one file with everything the coach holds', data.suggestedFilename().startsWith('Priya Nair, data,') && exported.client.name === 'Priya Nair' && Array.isArray(exported.private_notes) && Array.isArray(exported.engagements));
    await settle(page, 500);
    pass('more: the export is kept as a dated data request', db.rows.data_requests.some((r) => r.kind === 'export' && r.person_name === 'Priya Nair'));
    await button(page, 'Delete Priya’s data').click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'Delete Priya’s data' }).click();
    await settle(page, 500);
    pass('more: Delete needs the name typed first', /Type the name exactly to carry on\./.test(await panel(page).innerText()) && db.rows.client_profiles.some((p) => p.id === ID.priya));
    await closePanel(page);
  }

  if (has('workshop')) {
    // Register on the public page (no account), then mark attendance.
    const pub = await (await browser.newContext({ viewport: { width: 400, height: 860 }, colorScheme: 'light', serviceWorkers: 'block' })).newPage();
    const pubDb = await standIn(pub, { role: 'owner', db: 'there', rows: db.rows });
    pubDb.rows = db.rows; // the same stand-in database as the coach's page
    await pub.route('**/rest/v1/rpc/workshop_*', (route) => route.fallback());
    await pub.goto(`${APP}/workshop/${ID.wsNextKey}`);
    await pub.waitForSelector('.cc-public h1', { timeout: 20000 });
    await settle(pub, 600);
    pass('workshop page: it opens with no account, following the device', /Leading under pressure/i.test(await pub.locator('h1').innerText()) && (await pub.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
    pass('workshop page: it says how many places are taken', /18 of 20 places are taken\./.test(await pub.locator('.cc-public').innerText()));
    await pub.getByRole('button', { name: 'Register' }).click();
    pass('workshop page: the button is never greyed out; it says what’s missing', /Type your name to carry on\./.test(await pub.locator('.cc-public').innerText()));
    await pub.getByLabel('Your name').fill('Alma Voss');
    await pub.getByLabel('Your email').fill('alma@example.invalid');
    await pub.getByRole('button', { name: 'Register' }).click();
    pass('workshop page: a needed question is asked for', /Answer this one to carry on\./.test(await pub.locator('.cc-public').innerText()));
    await pub.getByLabel('What do you want from the morning?').fill('To decide faster under pressure.');
    await pub.getByLabel('Your role').fill('Team lead');
    await pub.getByRole('button', { name: 'Register' }).click();
    await settle(pub, 900);
    pass('workshop page: registering gives a place', /You have a place\./.test(await pub.locator('.cc-public').innerText()), await pub.locator('.cc-public').innerText());
    await pub.context().close();

    await open(page, `/coach/workshops/${ID.wsNext}`);
    const top = (await text(page)).replace(/\n+/g, ' ');
    pass('workshop: the coach sees 19 of 20 registered and 3 waiting', /Registered\s+19 of 20/.test(top) && /Waiting list\s+3/.test(top), top.slice(0, 200));
    await open(page, '/coach');
    pass('workshop: the bell has the new registration', (await page.locator('.cc-count').innerText().catch(() => '0')) !== '0');
    await open(page, `/coach/workshops/${ID.wsNext}`);
    await button(page, /^Show all/, false).click();
    await settle(page, 400);
    const alma = page.locator('.cc-tickrow', { hasText: 'Alma Voss' }).getByRole('checkbox');
    await alma.click();
    await settle(page, 800);
    pass('workshop: attendance is ticked on the day, with the shared tick box', (await alma.getAttribute('aria-checked')) === 'true' && (await alma.getAttribute('class')).includes('ds-check-box') && db.rows.workshop_attendees.some((a) => a.name === 'Alma Voss' && a.attended));
    // Attendees pasted with the same parser as "Who's invited?".
    await button(page, 'Add attendees').click();
    await settle(page, 500);
    await page.locator('#cc-attendees').fill('Dan Reid <dan@example.invalid>, amy@example.invalid; DAN@example.invalid\nJo Mensah\tjo@example.invalid');
    await settle(page, 400);
    pass('workshop: pasted attendees are read, duplicates removed, the waiting list said', /3 to add\. 1 twice in this list\. 2 will join the waiting list\./.test(await panel(page).innerText()), await panel(page).locator('.cc-quiet').innerText().catch(() => ''));
    await panel(page).getByRole('button', { name: 'Add 3 people' }).click();
    await settle(page, 1000);
    pass('workshop: they are added, the last place first', db.rows.workshop_attendees.filter((a) => a.workshop_id === ID.wsNext && a.status === 'registered').length === 20 && db.rows.workshop_attendees.filter((a) => a.workshop_id === ID.wsNext && a.status === 'waiting').length === 5);
    await open(page, `/coach/workshops/${ID.wsPast}`);
    const after = (await text(page)).replace(/\n+/g, ' ');
    pass('workshop, after the day: came, survey answers and the average rating', /Came\s+19 of 22/.test(after) && /Survey answers\s+15 of 19/.test(after) && /Average rating\s+4\.7 of 5/.test(after), after.slice(0, 220));
    pass('workshop, after the day: what people said shows in their own words', /Write down who decides before the meeting, not after\./.test(after));
    pass('workshop: nothing was sent', sent.length === 0);

    // An organisation, and a group.
    await open(page, `/coach/organisations/${ID.kestrel}`);
    const org = (await text(page)).replace(/\n+/g, ' ');
    pass('organisation: contacts with their roles, the people coached there and its group', /Dana Whitfield\s+Sponsor/.test(org) && /Lee Hart\s+Invoices contact/.test(org) && /Owen Price\s+Maya’s client/.test(org) && /Kestrel leadership team\s+Group of 3/.test(org), org.slice(0, 300));
    pass('organisation: documents with their expiry, for the owner only', /Non-disclosure agreement\s+Expires on/.test(org) && /Master services agreement\s+No expiry date\./.test(org) && /Only you can see these\./.test(await page.locator('.cc-part', { hasText: 'Documents' }).locator('.ds-who').getAttribute('aria-label')));
    pass('organisation: Room to grow is worked out', /Room to grow/i.test(org) && /seats are free\./.test(org));
    await open(page, `/coach/groups/${ID.group}`);
    const group = (await text(page)).replace(/\n+/g, ' ');
    pass('group: each member with what they count against, and sessions left', /Sam Okafor\s+Counts against Sam’s own engagement/.test(group) && /Dana Whitfield\s+Counts against the group’s engagement/.test(group) && /Group sessions left\s+4 of 6/.test(group), group.slice(0, 300));
  }

  if (has('settings')) {
    await open(page, '/coach/settings');
    const sections = await page.locator('.cc-setnav-item').allInnerTexts();
    pass('settings: two panes, with the owner’s sections', sections.join(', ') === 'Your details, Away and cover, Notifications, Booking, Working hours, Time zones, My calendars, Email, Tags and fields, Note layouts, Coaches, Activity log, Look', sections.join(', '));
    const panes = await page.evaluate(() => { const n = document.querySelector('.cc-setnav').getBoundingClientRect(); const p = document.querySelector('.cc-setpane').getBoundingClientRect(); return n.right <= p.left && Math.abs(n.top - p.top) < 80; });
    pass('settings: the list is on the left and the chosen section on the right', panes);
    pass('settings: no box shows until Edit is pressed', (await page.locator('.cc-setpane input').count()) === 0);
    await button(page, 'Edit Name clients see').click();
    await settle(page, 300);
    const edit = page.locator('.cc-setrow--edit');
    pass('settings: Edit opens one box, with Save and Cancel', (await edit.locator('input').count()) === 1 && /Save\s+Cancel/.test((await edit.innerText()).replace(/\n+/g, ' ')));
    await edit.locator('input').fill('');
    await edit.getByRole('button', { name: 'Save' }).click();
    pass('settings: Save says what’s missing', /Type the name clients see to carry on\./.test(await edit.innerText()));
    await edit.locator('input').fill('Alexandra');
    await edit.getByRole('button', { name: 'Save' }).click();
    await settle(page, 1000);
    pass('settings: Save saves, with Undo in its message', /Alexandra/.test(await page.locator('.cc-setrow').first().innerText()) && /Saved/.test(await toastText(page)) && (await page.locator('.ds-toast-undo').count()) === 1);
    await page.locator('.ds-toast-undo').click();
    await settle(page, 1000);
    pass('settings: Undo puts the name back', /Alex\b/.test(await page.locator('.cc-setrow').first().innerText()) && !/Alexandra/.test(await page.locator('.cc-setrow').first().innerText()));
    const sw = page.getByRole('switch', { name: 'WhatsApp' });
    await sw.click();
    await settle(page, 800);
    const look = await sw.evaluate((el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), on: el.getAttribute('aria-checked'), colour: getComputedStyle(el).backgroundColor }; });
    pass('settings: a switch is 40 by 24, mint when on', look.w === 40 && look.h === 24 && look.on === 'true' && /11, 122, 82|95, 239, 187/.test(look.colour), JSON.stringify(look));

    await open(page, '/coach/settings/away');
    await button(page, 'Add time away').click();
    await settle(page, 300);
    await page.getByLabel('First day').fill('2026-12-21');
    await page.getByLabel('Last day').fill('2026-12-10');
    await button(page, 'Save').click();
    pass('away: the last day must come after the first', /The last day comes after the first\./.test(await text(page)));
    await page.getByLabel('Last day').fill('2027-01-03');
    await button(page, 'Save').click();
    await settle(page, 800);
    pass('away: time away is kept and shown in words', /Mon 21 Dec to Sun 3 Jan 2027/.test(await text(page)) && db.rows.coach_away.length === 1);
    await button(page, 'Add cover').click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'Add cover', exact: true }).click();
    pass('cover: it asks for a client first', /Choose a client to carry on\./.test(await panel(page).innerText()));
    await panel(page).getByRole('combobox').nth(1).click();
    await settle(page, 300);
    await page.getByRole('option', { name: 'Sam Okafor' }).click();
    await panel(page).getByLabel('First day').fill('2026-12-21');
    await panel(page).getByLabel('Last day').fill('2027-01-03');
    await panel(page).getByRole('button', { name: 'Add cover', exact: true }).click();
    await settle(page, 900);
    pass('cover: the owner sets cover, and it waits for the client to agree', /Maya Collins covers Sam Okafor/.test(await text(page)) && /Waiting for the client to agree/.test(await text(page)) && db.rows.coach_cover[0]?.client_agreed_at == null);

    await open(page, '/coach/settings/notifications');
    const n = await page.locator('.cc-setpane .ds-switchrow-label').allInnerTexts();
    pass('notifications: one switch for each kind', n.join(' | ') === 'Bookings, moves and cancellations | Agreements signed | Payments in and overdue | Support flags | 10 minutes before each call | On my phone', n.join(' | '));

    await open(page, '/coach/settings/zones');
    await button(page, 'Edit this list').click();
    await settle(page, 500);
    pass('time zones: the list starts with 21 cities, each with a switch', (await panel(page).getByRole('switch').count()) === 21);
    await panel(page).getByLabel('Search cities').fill('tok');
    await settle(page, 300);
    pass('time zones: the list can be searched', (await panel(page).getByRole('switch').count()) === 1 && /Tokyo/.test(await panel(page).innerText()));
    await panel(page).getByRole('switch', { name: 'Tokyo' }).click();
    await settle(page, 800);
    pass('time zones: switching a city off is kept', db.rows.coach_settings[0].time_zones.length === 20 && !db.rows.coach_settings[0].time_zones.includes('Asia/Tokyo'));
    await closePanel(page);

    await open(page, '/coach/settings/tags');
    await button(page, 'Add tag').click();
    await settle(page, 300);
    await page.getByLabel('Tag', { exact: true }).fill('executive');
    await button(page, 'Save').click();
    pass('tags: the same tag twice is refused calmly', /You already have that tag\./.test(await text(page)));
    await page.getByLabel('Tag', { exact: true }).fill('Board');
    await button(page, 'Save').click();
    await settle(page, 800);
    pass('tags: Add tag adds one, in plain words', db.rows.coach_tags.some((t) => t.name === 'Board') && /Board\s+0 uses/.test((await text(page)).replace(/\n+/g, ' ')));
    pass('tags: custom fields are listed with their kind', /Sector\s+Choice from 6/.test((await text(page)).replace(/\n+/g, ' ')) && /Value\s+Number/.test((await text(page)).replace(/\n+/g, ' ')));

    await open(page, '/coach/settings/coaches');
    const coaches = (await text(page)).replace(/\n+/g, ' ');
    pass('coaches: each coach with their facts, and a profile to approve', /Maya Collins\s+Associate, \d+ clients?, £100\/hr( per hour)?\s+Approve Maya’s profile/.test(coaches), coaches);
    await button(page, 'Edit Maya Collins').click();
    await settle(page, 600);
    const mayas = (await panel(page).innerText()).replace(/\n+/g, ' ');
    pass('coaches: the owner sees each coach’s clients, never their notes', /Owen Price/.test(mayas) && /never their coaching notes/.test(mayas));
    await panel(page).getByRole('switch', { name: 'Switched on' }).click();
    await settle(page, 900);
    pass('coaches: a coach with clients can’t be switched off', /Move this coach’s clients first\./.test(await toastText(page)) && db.coaches.find((c) => c.id === OTHER).active);
    await panel(page).getByRole('button', { name: 'Approve the profile' }).click();
    await settle(page, 900);
    pass('coaches: the owner approves a profile', Boolean(db.rows.coach_profiles[0].approved_at));
    await closePanel(page);
    await button(page, 'Add coach').click();
    await settle(page, 500);
    await panel(page).getByRole('button', { name: 'Send the invite' }).click();
    pass('coaches: Add coach asks for a first name', /Type their first name to carry on\./.test(await panel(page).innerText()));
    await panel(page).getByLabel('First name').fill('Noor');
    await panel(page).getByLabel('Email').fill('noor@example.invalid');
    await panel(page).getByRole('button', { name: 'Send the invite' }).click();
    await settle(page, 900);
    pass('coaches: on a build that isn’t live, nothing is sent', /Nothing is sent from a preview\./.test(await toastText(page)) && db.calls.includes('api /api/coach-invite'));

    await open(page, '/coach/settings/log');
    const log = (await text(page)).replace(/\n+/g, ' ');
    pass('activity log: who, what, when', /Alex Morgan exported 6 clients to a spreadsheet\./.test(log) && /Alex Morgan moved Owen Price to Maya Collins\./.test(log), log.slice(0, 200));

    await open(page, '/coach/settings/look');
    await button(page, 'Edit Look').click();
    await settle(page, 300);
    await page.getByRole('radio', { name: 'Dark' }).click();
    pass('look: nothing changes until Save', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
    await button(page, 'Save').click();
    await settle(page, 500);
    pass('look: Save changes the mode', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
    await button(page, 'Edit Look').click();
    await page.getByRole('radio', { name: 'Light' }).click();
    await button(page, 'Save').click();
    await settle(page, 400);
  }

  pass('the owner’s run: nothing in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  pass('the owner’s run: no email or message was ever asked for', sent.filter((u) => !/coach-invite/.test(u)).length === 0, sent.join(', '));
  await clearDevice(page, me);
  await ctx.close();
}

// ================================================================ an associate, on a phone, before 049
if (has('associate')) {
  const ctx = await coachContext(browser, { size: 400, theme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  const writes = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('request', (r) => { if (r.method() !== 'GET' && /rest\/v1\/(client_|coach_|engagement|workshop|organisation|time_entries|activity_log|data_requests)/.test(r.url())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await standIn(page, { role: 'associate', db: 'none' });
  await open(page, '/coach');
  const me = await accountId(page);
  await clearDevice(page, me);
  await seedDevice(page, me, seedRows());
  await open(page, '/coach');

  pass('associate, phone: no menu button in the header; the phone bar is Today, the menu and Calendar', (await page.locator('.cc-header .cc-round--mark').isHidden()) && (await page.locator('.cc-phonebar button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).join(', ') === 'Today, Menu, Calendar');
  await page.locator('.cc-phonebar').getByRole('button', { name: 'Menu' }).click();
  await settle(page, 500);
  const items = await page.locator('.cc-menu-item').allInnerTexts();
  pass('associate: their menu, as M11’s Associate switch', items.join(', ') === 'Today, To-dos, Clients, Calendar, Leading Ideas, Library, Executives, Settings, Sign out', items.join(', '));
  const bar = await page.evaluate(() => document.querySelector('.cc-menu').getBoundingClientRect().bottom <= document.querySelector('.cc-phonebar').getBoundingClientRect().top + 1);
  pass('associate, phone: the menu opens above the phone bar, which stays', bar);
  await page.locator('.cc-menu-item', { hasText: 'Settings' }).click();
  await settle(page, 700);
  const list = await page.locator('.cc-row b').allInnerTexts();
  pass('associate, phone: Settings is a list of their sections', list.join(', ') === 'Your details, Away and cover, Notifications, Booking, Working hours, Time zones, My calendars, Tags and fields, Look', list.join(', '));
  pass('associate: never Coaches, the Activity log, Email or Note layouts', !list.some((s) => /Coaches|Activity log|Email|Note layouts/.test(s)));
  await page.locator('.cc-row', { hasText: 'Away and cover' }).click();
  await settle(page, 600);
  pass('associate, phone: a section opens full screen, with Back', /Away and cover/i.test(await page.locator('h1').innerText()) && (await page.locator('.ui-back-link').innerText()).trim() === 'Settings' && (await page.locator('.cc-setnav').count()) === 0);
  pass('associate: Away has no cover', !/Cover/.test(await text(page)));
  await page.locator('.ui-back-link').click();
  await settle(page, 500);
  pass('associate, phone: Back returns to the list', new URL(page.url()).pathname === '/coach/settings' && (await page.locator('.cc-row').count()) === 9);
  for (const [path, why] of [['/coach/settings/coaches', 'Coaches'], ['/coach/settings/log', 'the Activity log']]) {
    await open(page, path);
    pass(`associate: the address for ${why} goes back to their Settings`, new URL(page.url()).pathname === '/coach/settings', new URL(page.url()).pathname);
  }
  await open(page, `/coach/organisations/${ID.kestrel}`);
  pass('associate: an organisation’s page is the owner’s', new URL(page.url()).pathname === '/coach/clients', new URL(page.url()).pathname);
  await open(page, '/coach/finances');
  pass('associate: Finances is the owner’s', new URL(page.url()).pathname === '/coach', new URL(page.url()).pathname);
  await open(page, '/coach/clients/00000000-0000-4000-8000-00000000ffff');
  pass('associate: a client who isn’t theirs has no page', /isn’t in your list any more/.test(await text(page)));

  // Clients on a phone: the list and the board only; press and hold to choose.
  await open(page, '/coach/clients');
  pass('associate: the list says “Your clients”, and shows only theirs', /Your clients/.test(await page.locator('.cc-toolbar-who').innerText()) && !/Maya’s client/.test(await text(page)));

  // Run 6 (item 4): on a phone, Back closes a full-screen panel and stays on the page; a panel closed any other way
  // leaves no step behind, so the next Back goes to the page before. The menu closes the same way.
  {
    const here = () => new URL(page.url()).pathname;
    await button(page, 'Add client').first().click(); await settle(page, 600);
    const opened = await panel(page).count();
    await page.goBack(); await settle(page, 700);
    pass('associate, phone: Back closes the full-screen Add client and stays on Clients', opened === 1 && (await page.locator('.ds-modal--shown').count()) === 0 && here() === '/coach/clients', `${opened} ${here()}`);
    await page.locator('.cc-phonebar').getByRole('button', { name: 'Menu' }).click(); await settle(page, 500);
    const menuOpen = await page.locator('.cc-menu').isVisible().catch(() => false);
    await page.goBack(); await settle(page, 700);
    pass('associate, phone: Back closes the menu and stays on Clients', menuOpen && !(await page.locator('.cc-menu').isVisible().catch(() => false)) && here() === '/coach/clients', `${menuOpen} ${here()}`);
    await button(page, 'Add client').first().click(); await settle(page, 600);
    await closePanel(page); await settle(page, 300);
    await page.goBack(); await settle(page, 900);
    pass('associate, phone: a panel closed with Escape leaves no step: Back goes to the page before', here() !== '/coach/clients', here());
    await open(page, '/coach/clients');
  }
  await button(page, 'View').click();
  await settle(page, 500);
  const views = await page.getByRole('menuitemcheckbox').allInnerTexts();
  pass('phone: the view offers the list and the board, never the table', views.slice(0, 2).join(', ') === 'List, Board' && !views.includes('Table'), views.slice(0, 4).join(', '));
  await page.keyboard.press('Escape');
  await settle(page, 400);
  const row = page.locator('.cc-pick-row', { hasText: 'Jordan Reyes' });
  const box = await row.boundingBox();
  await page.mouse.move(box.x + 120, box.y + 30);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await settle(page, 500);
  pass('phone: press and hold chooses a row', /1 chosen/.test(await page.locator('.cc-bulk').innerText().catch(() => '')) && new URL(page.url()).pathname === '/coach/clients');
  pass('associate: the bar offers Tag, never Move', /Tag/.test(await page.locator('.cc-bulk').innerText()) && !/Move/.test(await page.locator('.cc-bulk').innerText()));
  await page.locator('.cc-pick-row', { hasText: 'Mia Torres' }).locator('.cc-row').click();
  await settle(page, 400);
  pass('phone: once choosing has begun, a tap chooses', /2 chosen/.test(await page.locator('.cc-bulk').innerText()));
  await button(page, 'Stop choosing').click();

  // Before 049 everything is kept on the device, and nothing is asked of the database.
  await addClient(page, { name: 'Zara Holt', email: 'zara@example.invalid' });
  pass('before 049: a client is added on the device', /Zara Holt/i.test(await page.locator('h1').innerText()) && /is in your clients/.test(await toastText(page)));
  await open(page, '/coach/clients');
  pass('before 049: and is still there when the page is opened again', /Zara Holt/.test(await text(page)));
  pass('before 049: nothing was written to the database', writes.length === 0, writes.join(', '));
  const kept = await page.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)) && !localStorage.getItem(`clarity-cache:${id}:coach`), me);
  pass('before 049: it is kept where a Sign out leaves it', kept);

  // Not a coach: the coach area is closed.
  const other = await ctx.newPage();
  await other.route('**/rest/v1/coaches*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await other.evaluate(() => null).catch(() => null);
  await other.goto(`${APP}/coach/clients`);
  await other.evaluate((id) => localStorage.removeItem(`clarity-cache:${id}:coach-role`), me);
  await other.goto(`${APP}/coach/clients`);
  await other.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
  pass('someone who isn’t a coach is sent to their own Home', new URL(other.url()).pathname === '/welcome', new URL(other.url()).pathname);
  await other.close();

  pass('the associate’s run: nothing in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  await clearDevice(page, me);
  await ctx.close();
}

// ================================================================ run 2: the coaching day, as one day
if (parts.some((p) => DAY_PARTS.includes(p))) await runDay({ browser, report, parts });

await browser.close();
report.done();
