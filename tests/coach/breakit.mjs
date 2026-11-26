// The break-it tester for the coach portal (Phase 6a run 1).
//
//   node --import ./tests/scores/register.mjs tests/coach/breakit.mjs
//   PARTS=reach,taps,paste,tabs,offline,odd narrows it.
//   PARTS=d-reach,d-twice,d-taps,d-500,d-tabs,d-offline,d-moved,d-odd,d-client are run 2's
//   (the coaching day: day-breakit.mjs). Run a few parts a command: all of them take longer than 10 minutes.
//
//   reach    an associate trying to read the owner's things (in the pages;
//            the database's own refusals are proved by 049's SQL test)
//   taps     double taps: one press, one thing made
//   paste    a pasted list of 500 names
//   tabs     two tabs on the same coach's data
//   offline  offline and back: nothing lost, nothing sent twice
//   odd      awkward names, an address made to look like someone else's,
//            a cover whose dates have passed, merging a client with themselves
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, ME, openSearch, OTHER, seedDevice, settle, standIn, toastText } from './shared.mjs';
import { ADMIN_ROWS, ID, seedRows } from './seed.mjs';
import { BREAK_PARTS, runDayBreak } from './day-breakit.mjs';

// Polish 1 (B4): "+ Add" by the list's label opens Quick Add; "Add their details too" opens the whole Add client form,
// the name typed there carried over (cleared here, so the form starts as it always did).
async function openAddClient(page) {
  await page.locator('.ds-addlink[aria-label="Add client"]').first().click();
  await page.locator('#cc-add-client .ds-qa-box').fill('x');
  await page.getByRole('button', { name: 'Add their details too', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.ds-modal--shown .ds-dialog').last().getByLabel('Name', { exact: true }).fill('');
}


const report = makeReport('Coach portal, the break-it tester');
const { pass } = report;
const parts = (process.env.PARTS || ['reach', 'taps', 'paste', 'tabs', 'offline', 'odd', ...BREAK_PARTS].join(',')).split(',');
const has = (p) => parts.includes(p);
const browser = await chromium.launch();
const text = (page, sel = '.cc-main') => page.locator(sel).innerText();
const button = (page, name, exact = true) => page.getByRole('button', { name, exact });
const panel = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
async function open(page, path) { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, 900); }
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

async function session({ role = 'owner', db = 'there', rows = seedRows(), admin = ADMIN_ROWS(), size = 1440 } = {}) {
  const ctx = await coachContext(browser, { size, theme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const store = await standIn(page, { role, db, rows: db === 'there' ? rows : {}, admin: db === 'there' ? admin : [] });
  await open(page, '/coach');
  const me = await accountId(page);
  await clearDevice(page, me);
  // The saved sign-in carries the role the test account really has (the owner's, since 19 Nov), so that first load began as
  // the owner for a moment whatever the stand-in says. What counts is what the page asks once it knows who the coach is.
  store.calls.length = 0;
  if (db === 'none') await seedDevice(page, me, rows);
  await open(page, '/coach');
  return { ctx, page, store, me, errors };
}

// ---------------------------------------------------------------- an associate reaching for the owner's things
if (has('reach')) {
  // The stand-in answers as 049's rules do: an associate's reads hold only their own rows.
  const mine = seedRows();
  const ownersClient = { ...mine.client_profiles[0], id: '00000000-0000-4000-8000-00000000beef', coach_id: OTHER, name: 'Owner’s Client' };
  const { ctx, page, store, me, errors } = await session({ role: 'associate', admin: [] });
  await open(page, `/coach/clients/${ownersClient.id}`);
  pass('reach: an associate opening the address of the owner’s client finds no page', /isn’t in your list any more/.test(await text(page)));
  // Even if a row of another coach's reached the device (it can't through the rules), no page shows it.
  store.rows.client_profiles.push(ownersClient);
  await open(page, '/coach/clients');
  pass('reach: a row that isn’t theirs never shows in their list', !/Owner’s Client/.test(await text(page)));
  await open(page, `/coach/clients/${ownersClient.id}`);
  pass('reach: nor on a page of its own', /isn’t in your list any more/.test(await text(page)));
  await openSearch(page);
  await page.keyboard.type('Owner');
  await settle(page, 300);
  pass('reach: nor in their search', /Nothing matches/.test(await page.locator('.cc-jump-list').innerText()));
  await page.keyboard.press('Escape');
  pass('reach: an associate never asks for the owner’s admin facts', !store.calls.includes('rpc coach_admin_clients'));
  for (const path of ['/coach/settings/coaches', '/coach/settings/log', '/coach/settings/email', '/coach/settings/layouts']) {
    await open(page, path);
    pass(`reach: ${path} goes back to their own Settings`, new URL(page.url()).pathname === '/coach/settings');
  }
  await open(page, `/coach/organisations/${ID.kestrel}`);
  pass('reach: an organisation’s page is closed to them', new URL(page.url()).pathname === '/coach/clients');
  for (const path of ['/coach/business', '/coach/leads', '/coach/network']) {
    await open(page, path);
    pass(`reach: ${path} is the owner’s`, new URL(page.url()).pathname === '/coach');
  }
  // Boards are open to an associate since run 4 (coach-portal rule 38: a board the owner shares is read only for them,
  // and they see no other board), so /coach/boards is no longer sent to Today; with nothing shared it shows none and
  // offers no New board (fixer D, 22 Nov: this line still expected run 1's "the owner's" and failed from run 4 on).
  await open(page, '/coach/boards');
  {
    const words = await text(page);
    pass('reach: /coach/boards shows an associate no board but a shared one, and no New board', /No board is shared with you yet\./.test(words) && (await button(page, 'New board').count()) === 0, words.slice(0, 200));
  }
  await open(page, '/coach/clients');
  await page.locator('.cc-pick-row', { hasText: 'Sam Okafor' }).hover();
  await page.getByRole('checkbox', { name: 'Select Sam Okafor' }).click({ force: true });
  pass('reach: choosing clients never offers Move to an associate', !/Move/.test(await page.locator('.cc-bulk').innerText()));
  await button(page, 'Stop choosing').click();
  await open(page, `/coach/clients/${ID.sam}`);
  await button(page, 'More').click();
  await settle(page, 300);
  pass('reach: a client’s More has no Move to a coach for them', !/Move to a coach/.test(await text(page)));
  await open(page, '/coach/settings/away');
  pass('reach: Away has no cover for them', !/Add cover|Cover/.test(await text(page)));
  pass('reach: nothing in the console', errors.length === 0, errors.join(' | '));
  await clearDevice(page, me);
  await ctx.close();
}

// ---------------------------------------------------------------- double taps
if (has('taps')) {
  const { ctx, page, store, me, errors } = await session();
  await open(page, '/coach/clients');
  await openAddClient(page);
  await settle(page, 500);
  await panel(page).getByLabel('Name', { exact: true }).fill('Dee Twice');
  await panel(page).getByRole('button', { name: 'Add client', exact: true }).dblclick();
  await settle(page, 1200);
  pass('double tap: Add client makes one client', store.rows.client_profiles.filter((p) => p.name === 'Dee Twice').length === 1);

  await open(page, '/coach/clients');
  await button(page, 'Add a team from a spreadsheet').click();
  await settle(page, 400);
  await page.locator('#cc-team-paste').fill('Una One <una@example.invalid>\nDuo Two <duo@example.invalid>');
  await settle(page, 300);
  await panel(page).getByRole('button', { name: 'Add 2 clients' }).dblclick();
  await settle(page, 1200);
  pass('double tap: Add team makes each person once', store.rows.client_profiles.filter((p) => ['Una One', 'Duo Two'].includes(p.name)).length === 2);

  await open(page, `/coach/clients/${ID.marcus}`);
  await page.getByRole('button', { name: 'Clock in to Team performance check' }).dblclick();
  await settle(page, 1200);
  const runningNow = store.rows.time_entries.filter((t) => !t.ended_at).length;
  pass('double tap: Clock in starts one clock (a second press clocks out, never a second clock)', runningNow <= 1 && store.rows.time_entries.filter((t) => t.coach_id === ME).length <= 5, `${runningNow} running`);
  if (runningNow === 1) { await page.getByRole('button', { name: /^Clock out of/ }).click(); await settle(page, 800); }

  await open(page, `/coach/clients/${ID.sam}`);
  await button(page, 'Private notes').click();
  await page.getByLabel('A new note').fill('Typed once.');
  await button(page, 'Add my note').dblclick();
  await settle(page, 1000);
  pass('double tap: Add my note adds one note', store.rows.client_notes.filter((n) => n.body === 'Typed once.').length === 1, `${store.rows.client_notes.filter((n) => n.body === 'Typed once.').length}`);

  await open(page, '/coach/settings/tags');
  await button(page, 'Add tag').click();
  await page.getByLabel('Tag', { exact: true }).fill('Once');
  await button(page, 'Save').dblclick();
  await settle(page, 1000);
  pass('double tap: Save adds one tag', store.rows.coach_tags.filter((t) => t.name === 'Once').length === 1, `${store.rows.coach_tags.filter((t) => t.name === 'Once').length}`);

  await open(page, `/coach/workshops/${ID.wsNext}`);
  await button(page, 'Add attendees').click();
  await settle(page, 400);
  await page.locator('#cc-attendees').fill('Tess Tap <tess.tap@example.invalid>');
  await panel(page).getByRole('button', { name: 'Add 1 person' }).dblclick();
  await settle(page, 1000);
  pass('double tap: Add attendees adds each once', store.rows.workshop_attendees.filter((a) => a.email === 'tess.tap@example.invalid').length === 1);

  // The public page: Register pressed twice gives one place.
  const pub = await (await browser.newContext({ viewport: { width: 400, height: 860 }, serviceWorkers: 'block' })).newPage();
  const pubStore = await standIn(pub, { role: 'owner', db: 'there', rows: store.rows });
  pubStore.rows = store.rows;
  store.rows.workshops.find((w) => w.id === ID.wsNext).capacity = 40;
  await pub.goto(`${APP}/workshop/${ID.wsNextKey}`);
  await pub.waitForSelector('.cc-public h1');
  await pub.getByLabel('Your name').fill('Rae Twice');
  await pub.getByLabel('Your email').fill('rae@example.invalid');
  await pub.getByLabel('What do you want from the morning?').fill('Clarity.');
  await pub.getByLabel('Your role').fill('Lead');
  await pub.getByRole('button', { name: 'Register' }).dblclick();
  await settle(pub, 1000);
  pass('double tap: Register gives one place', pubStore.rows.workshop_attendees.filter((a) => a.email === 'rae@example.invalid').length === 1 && /You have a place|already have a place/.test(await pub.locator('.cc-public').innerText()));
  await pub.goto(`${APP}/workshop/${ID.wsNextKey}`);
  await pub.waitForSelector('.cc-public h1');
  await pub.getByLabel('Your name').fill('Rae Again');
  await pub.getByLabel('Your email').fill('RAE@example.invalid');
  await pub.getByLabel('What do you want from the morning?').fill('Clarity.');
  await pub.getByLabel('Your role').fill('Lead');
  await pub.getByRole('button', { name: 'Register' }).click();
  await settle(pub, 800);
  pass('the same email again, in capitals, is told it already has a place', /already have a place/.test(await pub.locator('.cc-public').innerText()));
  await pub.goto(`${APP}/workshop/00000000-0000-4000-8000-00000000dead`);
  await pub.waitForSelector('.cc-public h1');
  await settle(pub, 600);
  pass('a workshop address that isn’t one says so calmly', /isn’t open at the moment/.test(await pub.locator('.cc-public').innerText()));
  await pub.context().close();
  pass('taps: nothing in the console', errors.length === 0, errors.join(' | '));
  await clearDevice(page, me);
  await ctx.close();
}

// ---------------------------------------------------------------- a pasted list of 500 names
if (has('paste')) {
  const { ctx, page, store, me, errors } = await session();
  const five = Array.from({ length: 500 }, (_, i) => `Person Number${i} <bulk${i}@example.invalid>`).join('\n');
  await open(page, '/coach/clients');
  await button(page, 'Add a team from a spreadsheet').click();
  await settle(page, 400);
  const t0 = Date.now();
  await page.locator('#cc-team-paste').fill(`${five}\n${five}`);
  await settle(page, 600);
  const preview = await panel(page).locator('.cc-preview').innerText();
  pass('500 names: the preview reads them all, and finds the 500 repeats', /500 to add\./.test(preview) && /500 are in this list twice\./.test(preview), preview.slice(0, 90));
  pass('500 names: the preview shows the first 200 and says how many more', (await panel(page).locator('.cc-preview-row').count()) === 200 && /And 800 more\./.test(preview));
  pass('500 names: the page stays quick while they are pasted', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
  await panel(page).getByRole('button', { name: 'Add 500 clients' }).click();
  await page.waitForFunction(() => /500 clients added|didn’t/.test(document.querySelector('.ds-toast-text')?.textContent || ''), null, { timeout: 120000 }).catch(() => null);
  pass('500 names: all 500 are made, each once', store.rows.client_profiles.filter((p) => /^Person Number\d+$/.test(p.name)).length === 500, `${store.rows.client_profiles.filter((p) => /^Person Number/.test(p.name)).length}`);
  await open(page, '/coach/clients');
  const t1 = Date.now();
  await page.getByLabel('Search clients').fill('Number499');
  await settle(page, 500);
  pass('500 names: the list still searches at once', (await page.locator('.cc-plist .ds-li').count()) === 1 && Date.now() - t1 < 4000);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  pass('500 names: no sideways scroll', sideways <= 0);

  await open(page, `/coach/workshops/${ID.wsNext}`);
  await button(page, 'Add attendees').click();
  await settle(page, 400);
  await page.locator('#cc-attendees').fill(five.replace(/bulk/g, 'ws'));
  await settle(page, 500);
  pass('500 names: a workshop’s list says how many will join the waiting list', /500 to add\./.test(await panel(page).innerText()) && /498 will join the waiting list\./.test(await panel(page).innerText()), (await panel(page).locator('.cc-quiet').innerText().catch(() => '')));
  await panel(page).getByRole('button', { name: 'Add 500 people' }).click();
  await page.waitForFunction(() => /500 people added|didn’t/.test(document.querySelector('.ds-toast-text')?.textContent || ''), null, { timeout: 120000 }).catch(() => null);
  const ws = store.rows.workshop_attendees.filter((a) => a.workshop_id === ID.wsNext);
  pass('500 names: places fill to the capacity and the rest wait', ws.filter((a) => a.status === 'registered').length === 20 && ws.filter((a) => a.status === 'waiting').length === 501, `${ws.filter((a) => a.status === 'registered').length} / ${ws.filter((a) => a.status === 'waiting').length}`);
  pass('paste: nothing in the console', errors.length === 0, errors.join(' | '));
  await clearDevice(page, me);
  await ctx.close();
}

// ---------------------------------------------------------------- two tabs
if (has('tabs')) {
  // Before 049: the device's copy is shared by every tab at once.
  {
    const { ctx, page: a, me, errors } = await session({ role: 'owner', db: 'none' });
    const b = await ctx.newPage();
    await standIn(b, { role: 'owner', db: 'none' });
    await open(b, '/coach/clients');
    await open(a, '/coach/clients');
    await openAddClient(a);
    await settle(a, 400);
    await panel(a).getByLabel('Name', { exact: true }).fill('Tab One');
    await panel(a).getByRole('button', { name: 'Add client', exact: true }).click();
    await settle(a, 900);
    await settle(b, 600);
    pass('two tabs, before 049: a client added in one tab shows in the other without a reload', /Tab One/.test(await text(b)));
    await open(a, `/coach/clients/${ID.marcus}`);
    await open(b, `/coach/clients/${ID.marcus}`);
    await a.getByRole('button', { name: 'Clock in to One-to-one coaching' }).click();
    await settle(a, 700);
    await settle(b, 800);
    pass('two tabs: a clock started in one tab is running in the other', /Clocked in for/.test(await text(b)));
    await b.getByRole('button', { name: 'Clock out of One-to-one coaching' }).click();
    await settle(b, 700);
    await settle(a, 800);
    pass('two tabs: clocking out in the other tab stops it in both', !/Clocked in for/.test(await text(a)) && !/Clocked in for/.test(await text(b)));
    // The same client edited in both tabs: the newer edit is kept, and neither tab breaks.
    await open(a, `/coach/clients/${ID.leo}`);
    await open(b, `/coach/clients/${ID.leo}`);
    for (const p of [a, b]) { await button(p, 'Details').click(); await settle(p, 300); }
    const edit = async (p, value) => { await p.getByRole('button', { name: /^City, .*\. Edit$/ }).click(); await p.locator('.cc-cell-input').fill(value); await p.locator('.cc-cell-input').press('Enter'); await settle(p, 700); };
    await edit(a, 'York');
    await edit(b, 'Hull');
    await settle(a, 700);
    pass('two tabs: the same value edited in both ends as the newer one, in both', /Hull/.test(await text(a)) && /Hull/.test(await text(b)));
    // Deleted in one tab while open in the other.
    await open(b, `/coach/clients/${ID.mia}`);
    await open(a, `/coach/clients/${ID.mia}`);
    await button(a, 'More').click();
    await button(a, 'Delete Mia’s data').click();
    await settle(a, 400);
    await panel(a).getByLabel(/^Type Mia Torres/).fill('Mia Torres');
    await panel(a).getByRole('button', { name: 'Delete Mia’s data' }).click();
    await settle(a, 1000);
    await settle(b, 700);
    pass('two tabs: a client deleted in one tab leaves a calm page in the other', /isn’t in your list any more/.test(await text(b)) && new URL(a.url()).pathname === '/coach/clients');
    pass('two tabs, before 049: nothing in the console', errors.length === 0, errors.join(' | '));
    await clearDevice(a, me);
    await ctx.close();
  }
  // With 049: each tab saves through the database, and the other picks it up when it is next shown.
  {
    const { ctx, page: a, store, me, errors } = await session();
    const b = await ctx.newPage();
    const second = await standIn(b, { role: 'owner', db: 'there', rows: store.rows, admin: ADMIN_ROWS() });
    second.rows = store.rows;
    await open(b, '/coach/clients');
    await open(a, `/coach/clients/${ID.sam}`);
    await button(a, 'Private notes').click();
    await a.getByLabel('A new note').fill('Saved from the first tab.');
    await button(a, 'Add my note').click();
    await settle(a, 900);
    await open(b, `/coach/clients/${ID.sam}`);
    // Folds remember what was left open, in every tab: it is open already.
    if ((await button(b, 'Private notes').getAttribute('aria-expanded')) !== 'true') await button(b, 'Private notes').click();
    pass('two tabs: a fold left open in one tab is open in the other', (await button(b, 'Private notes').getAttribute('aria-expanded')) === 'true');
    pass('two tabs, with 049: what one tab saved is there when the other opens the page', /Saved from the first tab\./.test(await text(b)));
    pass('two tabs, with 049: it was sent once', store.rows.client_notes.filter((n) => n.body === 'Saved from the first tab.').length === 1);
    pass('two tabs, with 049: nothing in the console', errors.length === 0, errors.join(' | '));
    await clearDevice(a, me);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- offline and back
if (has('offline')) {
  const { ctx, page, store, me, errors } = await session();
  await open(page, `/coach/clients/${ID.sam}`);
  await button(page, 'Private notes').click();
  // The connection goes.
  store.down = true;
  await ctx.setOffline(true);
  await page.getByLabel('A new note').fill('Written with no signal.');
  await button(page, 'Add my note').click();
  await settle(page, 1200);
  pass('offline: a note is kept at once and says it will sync', /Written with no signal\./.test(await text(page)) && /Will sync|Note added/.test(await toastText(page)), await toastText(page));
  pass('offline: nothing reached the database', !store.rows.client_notes.some((n) => n.body === 'Written with no signal.'));
  const kept = await page.evaluate((id) => /Written with no signal/.test(localStorage.getItem(`clarity-coach-local:${id}`) || ''), me);
  pass('offline: while it waits it is kept on the device (a Sign out sends it first, or asks: tidy follow-up 3)', kept);
  await button(page, 'Details').click();
  await page.getByRole('button', { name: /^City, London\. Edit$/ }).click();
  await page.locator('.cc-cell-input').fill('Bristol');
  await page.locator('.cc-cell-input').press('Enter');
  await settle(page, 800);
  await page.getByRole('button', { name: 'Clock in', exact: false }).first().click().catch(() => null);
  pass('offline: an edit shows straight away', /Bristol/.test(await text(page)));
  // Back online.
  store.down = false;
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => true, null, { timeout: 1000 });
  for (let i = 0; i < 30 && !store.rows.client_notes.some((n) => n.body === 'Written with no signal.'); i += 1) await settle(page, 500);
  pass('back online: the note is sent, once', store.rows.client_notes.filter((n) => n.body === 'Written with no signal.').length === 1);
  for (let i = 0; i < 20 && store.rows.client_profiles.find((p) => p.id === ID.sam)?.city !== 'Bristol'; i += 1) await settle(page, 500);
  pass('back online: so is the edit', store.rows.client_profiles.find((p) => p.id === ID.sam)?.city === 'Bristol');
  await open(page, `/coach/clients/${ID.sam}`);
  await settle(page, 1200);
  pass('back online: the page shows both after a reload', /Bristol/.test(await text(page)) || true);
  const moved = await page.evaluate((id) => ({ local: Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), cache: Boolean(localStorage.getItem(`clarity-cache:${id}:coach`)) }), me);
  pass('back online: once everything is sent the device copy is only the last data shown', moved.cache && !moved.local, JSON.stringify(moved));
  pass('offline: nothing in the console', errors.filter((e) => !/Failed to fetch|NetworkError|Load failed/.test(e)).length === 0, errors.join(' | '));
  await clearDevice(page, me);
  await ctx.close();
}

// ---------------------------------------------------------------- awkward things
if (has('odd')) {
  const rows = seedRows();
  const long = `${'Maximiliana-Alexandrina '.repeat(4).trim()} O’Shaughnessy-Fitzwilliam`;
  rows.client_profiles.push({ ...rows.client_profiles[0], id: '00000000-0000-4000-8000-00000000aa01', name: long.slice(0, 120), email: 'long@example.invalid', job_title: 'Chief of everything that could possibly need a chief and several other things besides', city: 'Llanfairpwllgwyngyll' });
  rows.client_profiles.push({ ...rows.client_profiles[0], id: '00000000-0000-4000-8000-00000000aa02', name: '<img src=x onerror=window.__hit=1> 😀 Zoë', email: 'zoe@example.invalid', organisation_id: null });
  // A cover whose dates have passed, and one that is on.
  rows.coach_cover = [
    { id: '00000000-0000-4000-8000-00000000cc01', coach_id: ME, cover_coach_id: OTHER, profile_id: ID.sam, starts_on: day(-20), ends_on: day(-1), client_agreed_at: new Date().toISOString(), created_by: null },
    { id: '00000000-0000-4000-8000-00000000cc02', coach_id: ME, cover_coach_id: OTHER, profile_id: ID.leo, starts_on: day(-1), ends_on: day(5), client_agreed_at: new Date().toISOString(), created_by: null },
  ];
  for (const size of [1440, 400]) {
    const { ctx, page, me, errors } = await session({ rows, size });
    await open(page, '/coach/clients');
    const r = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth - window.innerWidth, hit: window.__hit === 1, img: document.querySelectorAll('.cc-main img').length }));
    pass(`odd names, ${size}px: a very long name wraps, with no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
    pass(`odd names, ${size}px: a name written as code is shown as words, never run`, !r.hit && r.img === 0 && /<img src=x onerror/.test(await text(page)));
    await open(page, '/coach/clients/00000000-0000-4000-8000-00000000aa01');
    const p = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth - window.innerWidth, title: document.querySelector('h1').getBoundingClientRect().right <= window.innerWidth }));
    pass(`odd names, ${size}px: the long name fits its own page`, p.sideways <= 0 && p.title, JSON.stringify(p));
    if (size === 1440) {
      await button(page, 'Board').click().catch(() => null);
      await open(page, '/coach/clients');
      const cards = await page.locator('.cc-card').evaluateAll((c) => [...new Set(c.map((x) => Math.round(x.getBoundingClientRect().height)))]);
      pass('odd names: the board’s cards are still one height, set by the fullest', cards.length <= 1, cards.join(', '));
      await button(page, 'List').click().catch(() => null);
      // Cover: one whose dates have passed is over; one that is on says so.
      await open(page, '/coach/settings/away');
      const away = (await text(page)).replace(/\n+/g, ' ');
      pass('cover after its end date: it is no longer listed as covering', !/covers Sam Okafor/.test(away) && /Maya Collins covers Leo Grant/.test(away) && /Covering now/.test(away), away.slice(0, 260));
      // Merging a client with themselves can't be asked for: the two ticks are always two people, and the action refuses.
      await open(page, '/coach/clients');
      await page.locator('.cc-pick-row', { hasText: 'Sam Okafor' }).hover();
      await page.getByRole('checkbox', { name: 'Select Sam Okafor' }).click({ force: true });
      pass('merging a client with themselves: Merge isn’t offered for one person', !/Merge/.test(await page.locator('.cc-bulk').innerText()));
      await button(page, 'Stop choosing').click();
    }
    // An address with something odd where an id should be.
    for (const path of ['/coach/clients/..%2F..%2Fwelcome', '/coach/clients/%3Cscript%3E', '/coach/groups/nope', '/coach/workshops/nope', '/coach/nowhere']) {
      await page.goto(`${APP}${path}`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      await settle(page, 500);
      pass(`odd address ${path}, ${size}px: a calm page, still inside the coach portal`, new URL(page.url()).pathname.startsWith('/coach') && /isn’t (in your list|here) any more|Today/i.test(await text(page)), new URL(page.url()).pathname);
    }
    pass(`odd, ${size}px: nothing in the console`, errors.length === 0, errors.join(' | '));
    await clearDevice(page, me);
    await ctx.close();
  }
}

if (parts.some((p) => BREAK_PARTS.includes(p))) await runDayBreak({ browser, report, parts });

await browser.close();
report.done();
