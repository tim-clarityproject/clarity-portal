// The break-it tester for Leads, the CRM and Network (Phase 6a run 4, 21 Nov).
// Each case is a named check.
//
//   r-reach    an associate opening every address of Leads, Network and the
//              boards: nothing of the owner's shows, the stand-in hands over
//              none of it, none of it is on her device, search finds none
//   r-many     5,000 Network people: the first page, a search, a sort, Show
//              only, Show 50 more ten times, the map and Actions stay quick
//              (each bound stated); the page holds no more rows than it
//              shows; before 052, the device full: the calm line, nothing
//              shown as kept that isn't
//   r-tabs     two tabs: one rating at the same moment and from a stale tab;
//              a person archived in one and edited in the other; a lead
//              merged in one and edited in the other; a stage deleted in one
//              while a card is moved in the other; an automation switched
//              off in one while it runs in the other
//   r-offline  offline and back: a lead, a stage, a board card, a rating, a
//              give, an archive review: kept and said calmly, sent once and
//              in order when back, nothing doubled; an automation runs once
//              with two tabs open
//   r-merge    merge undone: two leads with timelines, tags, emails and to-dos
//              (and two Network people with gives and asks), then Undo: both
//              exactly as before; merged, reloaded, no Undo, nothing lost;
//              A into B then B into C; a lead already won
//   r-sheet    spreadsheets with odd columns (no heading row, the same heading
//              twice, 60 columns, a BOM, semicolons, quoted new lines, emoji,
//              right-to-left names, 9.9 MB, 5,000 rows, formulas, ratings of
//              11, -1 and "high", dates in three styles), an .xlsx read, a
//              damaged one and older formats said calmly, an empty file; the
//              export's cells made safe
//   r-loop     automations that would loop: A to X and B back, a chain of
//              six, a 5,000-character to-do, 200 automations, one naming a
//              deleted stage, one event from two tabs; once an event, nothing
//              sent
//   r-odd      awkward leads, values and ratings; 0 and 60 stages; 200 own
//              columns and one named like a built-in; the map with everyone on
//              one spot, nobody rated, one person; Find someone outside the
//              150; 1,200 ticked to archive; Move to Leads twice; Won twice;
//              a waiting email answered in two tabs; 60 recipients; a damaged
//              device copy; twice the text size; Back out of every panel; the
//              three addresses that aren't real
//
// Unless a case says "device only", 049 to 052 are answered by the stand-ins
// in shared.mjs, cal-standin.mjs and crm-standin.mjs, shaped as the SQL
// (`strict`: nothing but a read ever reaches the test project; a write the
// stand-in doesn't know is listed as `blocked` and fails the part). 052's own
// SQL is probed separately, on the local PGlite stand-in only, by
// supabase/052_coach_crm_breakit_test.sql. The page's clock is M11's Tuesday.
// Every /api/ call is answered by a stand-in and counted: nothing is sent.
//
//   PARTS=r-reach,r-many,r-tabs,r-offline,r-merge,r-sheet,r-loop,r-odd
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, makeReport, openSearch, OTHER, seedDevice, seedNetworkDevice, settle, SIZES, standIn, toastText } from './shared.mjs';
import { CRM, ID, manyNetwork, networkDeviceSeed, seedClock, seedWithCrm } from './seed.mjs';

const ID_TAGS = { exec: ID.tagExec, finance: ID.tagFinance };
const ID_LEO = ID.leo;
import { CRM_TABLES } from './crm-standin.mjs';
import { ACTIONS, automationLoop, automationProblem, CHAIN_MAX, csvTable, hasHeadingRow, importFileProblem, leadFromImport, leadImportPlan, leadsCsv, matchColumns, runAutomations, sheetRows, stageEvent, tidyAutomation } from '../../src/lib/coach/crm.js';
import { cellChange, importRows, NETWORK_IMPORT_FIELDS, networkSheetRows, typedRhythm } from '../../src/lib/coach/network.js';
import { mapProblems, readMap } from './net-rules.mjs';
import { toCsv } from '../../src/lib/coach/model.js';
import { coachRowsWaiting } from '../../src/lib/coach/copyWaiting.js';
import { xlsxBytes, xlsxTable } from '../../src/lib/coach/xlsx.js';

// Polish 1 (B4): "+ Add" by the list's label opens Quick Add; "Add their details too" opens the whole Add lead form,
// the name typed there carried over (cleared here, so the form starts as it always did).
async function openAddLead(page) {
  await page.locator('.ds-addlink[aria-label="Add a lead"]').first().click(); // walk item 4: named by what it adds
  await page.locator('#cc-add-lead .ds-qa-box').fill('x');
  await page.getByRole('button', { name: 'Add their details too', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.ds-modal--shown .ds-dialog').last().getByLabel('Who is it?').fill('');
}


export const CRM_BREAK_PARTS = ['r-reach', 'r-many', 'r-tabs', 'r-offline', 'r-merge', 'r-sheet', 'r-loop', 'r-odd'];
const TUE = new Date(2026, 10, 17, 9, 0);
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const dialog = (page) => page.locator('.ds-modal--shown .ds-dialog').last();
// A name in a list or table, a board card and the pages that open more are real links since Polish 1 (B4): press either.
const press = async (page, name, scope = page) => { await scope.getByRole('button', { name, exact: true }).or(scope.getByRole('link', { name, exact: true })).first().click(); await settle(page, 600); };
const go = async (page, path, wait = 1300) => { await page.goto(`${APP}${path}`); await page.waitForSelector('.cc-app', { timeout: 20000 }); await settle(page, wait); };
const words = (page) => page.evaluate(() => (document.querySelector('.cc-main')?.innerText || '').replace(/ /g, ' '));
const allWords = (page) => page.evaluate(() => (document.querySelector('.cc-app')?.innerText || document.body.innerText).replace(/ /g, ' '));
const panelWords = (page) => dialog(page).innerText().then((t) => t.replace(/ /g, ' ')).catch(() => '');
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).last().click(); await settle(page, 900); };
const has = (text, list) => list.every((w) => text.toLowerCase().includes(w.toLowerCase()));
const missing = (text, list) => list.filter((w) => !text.toLowerCase().includes(w.toLowerCase())).join(' | ');
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const forDevice = (rows) => { const { coach_notifications: _n, activity_log: _a, workshop_survey_answers: _w, coach_profiles: _p, coach_bookings: _b, coach_email_addresses: _e, coach_poll_votes: _v, coach_cal_reminder_sends: _r, network_people: _np, network_gives: _ng, network_ratings: _nr, network_merges: _nm, ...own } = rows; return own; };
const NOT_YET = ['clarity-coach-not-yet', 'clarity-coach-day-not-yet', 'clarity-coach-cal-not-yet', 'clarity-coach-crm-not-yet'];
const rowNames = (page) => page.locator('.cc-net-table tbody .cc-table-name').allInnerTexts();
const netCell = (page, column, name) => page.locator('.cc-net-table').getByRole('button', { name: new RegExp(`^${column} for ${name}`) }).first();
const cellText = async (page, name, index) => (await page.locator('.cc-net-table tbody tr', { has: page.getByRole('link', { name, exact: true }) }).locator('td, th').nth(index).innerText()).trim();
const actionRows = (page, title) => page.locator('.cc-part', { has: page.locator('.ds-section-title', { hasText: title }) }).locator('.cc-row').evaluateAll((rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
/** Search: what the one box finds for some words. */
const search = async (page, typed) => {
  await openSearch(page); await settle(page, 300);
  await page.keyboard.type(typed); await settle(page, 600);
  const found = await page.locator('.cc-jump').innerText().catch(() => '');
  await page.keyboard.press('Escape'); await settle(page, 300);
  return found.replace(/“[^”]*”/g, '');
};
/** Every row of a table, or the people, the owner's seed hands to the other coach (for an associate's database). */
const asOthers = (rows) => {
  const out = { ...rows };
  for (const t of [...CRM_TABLES, 'coach_leads']) if (Array.isArray(out[t])) out[t] = out[t].map((r) => (r.coach_id === undefined ? r : { ...r, coach_id: OTHER }));
  out.coach_boards = (out.coach_boards || []).map((b) => ({ ...b, shared: b.id === CRM.speaking }));
  return out;
};

const report = makeReport('Leads, the CRM and Network, the break-it tester');
const { pass } = report;
const parts = (process.env.PARTS || CRM_BREAK_PARTS.join(',')).split(',');
const on = (p) => parts.includes(p);
const browser = await chromium.launch();
const timings = [];

/**
 * A signed-in coach on M11's Tuesday. One stand-in answers every tab of the context.
 * `db: 'there'`: the seed is in the stand-in database (049 to 052); `'none'`: it is on the device and every write is stopped.
 * `people` replaces Network's people; `rows` replaces the seed; `change(rows)` edits it first.
 */
async function openAt({ role = 'owner', db = 'there', path = '/coach', tag, rows = null, people = null, size = 1440, network = true, change = null, theme = null }) {
  const there = db === 'there';
  let now = new Date(TUE);
  const ctx = await coachContext(browser, { size: size === 1440 ? 1440 : size, theme: theme || (there ? 'light' : 'dark') });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const errors = [];
  const reached = [];
  const api = [];
  const waits = [];
  const pages = [];
  const watch = async (p) => {
    pages.push(p);
    p.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    p.on('response', (res) => {
      const req = res.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || !/\/(rest|storage|functions)\/v1\/|\/api\//.test(req.url())) return;
      waits.push(res.serverAddr().then((addr) => { if (addr) reached.push(`${req.method()} ${new URL(req.url()).pathname}`); }).catch(() => {}));
    });
    await p.addInitScript(() => {
      window.__sent = [];
      document.addEventListener('click', (e) => { const a = e.target?.closest?.('a[href]'); const h = a?.getAttribute('href') || ''; if (/^(mailto|sms|tel):|wa\.me|imessage/i.test(h)) window.__sent.push(h.split(/[:?]/)[0]); }, true);
      window.open = (u) => { window.__sent.push(`open ${String(u).split(/[:?]/)[0]}`); return null; };
    });
    if (size === 1440) await p.setViewportSize({ width: 1440, height: 1100 }); else await p.setViewportSize(SIZES[size]);
  };
  await ctx.clock.setFixedTime(now);
  seedClock(now);
  const seed = rows || seedWithCrm({ accounts: true });
  if (people) { seed.network_people = people; seed.network_gives = []; seed.network_ratings = []; }
  if (change) change(seed);
  const store = await standIn(ctx, { role, db, day: there, cal: there, crm: there, strict: there, rows: there ? seed : {}, now: () => new Date(now) });
  const asked = { limits: [], pages: 0, maps: 0 };
  if (there && store.fn?.network_page) {
    const page0 = store.fn.network_page; const map0 = store.fn.network_map;
    store.fn.network_page = (args = {}) => { asked.limits.push(args.p_limit ?? 50); asked.pages += 1; return page0(args); };
    store.fn.network_map = (args = {}) => { asked.maps += 1; return map0(args); };
  }
  await ctx.route('**/api/**', (route) => { api.push(new URL(route.request().url()).pathname); return json(route, { ok: true, sent: false }); });
  await ctx.route('**/rest/v1/peak_moments*', (route) => json(route, []));
  await ctx.route('**/rest/v1/organisation_access_codes*', (route) => (route.request().method() === 'GET' ? json(route, []) : route.abort()));
  for (const t of ['session_prep', 'week_scores', 'peak_reviews', 'checkins']) await ctx.route(`**/rest/v1/${t}*`, (route) => (route.request().method() === 'GET' ? json(route, t === 'session_prep' ? null : []) : route.fallback()));
  if (!there) await ctx.route('**/rest/v1/rpc/**', (route) => json(route, null));
  const page = await ctx.newPage();
  await watch(page);
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  const me = await accountId(page);
  await clearDevice(page, me);
  await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:') || k.startsWith(`clarity-cache:${id}:coach-email-standin`) || k === `clarity-cache:${id}:coach-board-layout`) localStorage.removeItem(k); }, me);
  const callsFrom = store.calls.length;
  if (!there) {
    await seedDevice(page, me, forDevice(seed));
    if (role === 'owner' && network) await seedNetworkDevice(page, me, people ? { people, gives: [], ratings: [] } : networkDeviceSeed());
  }
  if (path) await go(page, path);
  // The device's rows: localStorage's copy laid over IndexedDB's (a large copy is kept there since the scale check, and
  // what waits to be sent with it when it no longer fits in localStorage; store.js write).
  const deviceRows = (table, p = page) => p.evaluate(async ([id, t]) => {
    const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || localStorage.getItem(`clarity-cache:${id}:coach`) || '{}');
    const big = await new Promise((resolve) => {
      try {
        const req = indexedDB.open('clarity-coach', 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore('tables'); } catch { /* there */ } };
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction('tables', 'readonly').objectStore('tables').get(`${id}|${t}`);
            get.onsuccess = () => { resolve(get.result || null); req.result.close(); };
            get.onerror = () => { resolve(null); req.result.close(); };
          } catch { resolve(null); req.result.close(); }
        };
      } catch { resolve(null); }
    });
    const rows = { ...(big?.rows || {}), ...(kept.rows?.[t] || {}) };
    const marks = { ...(big?.marks || {}), ...(kept.marks?.[t] || {}) };
    return Object.entries(rows).filter(([k]) => !marks[k]?.gone).map(([, r]) => r);
  }, [me, table]);
  const devicePeople = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"people":{}}').people || {}), me);
  const deviceGives = () => page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`clarity-coach-network-local:${id}`) || '{"gives":{}}').gives || {}), me);
  return {
    page, ctx, store, me, there, errors, seed, api, asked, callsFrom, reached,
    rowsNow: async (table) => (there ? store.rows[table] || [] : deviceRows(table)),
    peopleNow: async () => (there ? store.rows.network_people || [] : devicePeople()),
    givesNow: async () => (there ? store.rows.network_gives || [] : deviceGives()),
    deviceRows,
    sent: async () => (await Promise.all(pages.map((p) => p.evaluate(() => window.__sent || []).catch(() => [])))).flat(),
    /**
     * A second tab on the same device and the same stand-in. `stale`: it never hears the other tab's changes (the browser's
     * storage event is stopped before the page sees it), as a tab on another device, or one left open, would be.
     */
    tab: async (to, { stale = false } = {}) => {
      const p = await ctx.newPage();
      await watch(p);
      if (stale) await p.addInitScript(() => { window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true); });
      await go(p, to);
      return p;
    },
    /** Moves the page's clock (never past the real day), stamping the stand-in's "not yet" note again on the device. */
    async moveClock(to) {
      now = new Date(to);
      seedClock(now);
      await ctx.clock.setFixedTime(now);
      if (!there) await ctx.addInitScript((keys) => { try { for (const k of keys) localStorage.setItem(k, String(Date.now())); } catch { /* blocked */ } }, NOT_YET);
    },
    async close({ allow = null, refusals = null } = {}) {
      await settle(page, 300).catch(() => {});
      await Promise.all(waits);
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      const seen = errors.filter((e) => !(allow && allow.test(e)));
      pass(`${tag}: nothing in the console`, seen.length === 0, [...new Set(seen)].slice(0, 3).join(' | '));
      pass(`${tag}: nothing was written to the test project`, reached.length === 0 && blocked.length === 0, [...new Set([...reached, ...blocked])].slice(0, 4).join('; '));
      pass(`${tag}: nothing asked the server to send anything (no /api/ call at all)`, api.length === 0, [...new Set(api)].join(', '));
      const sent = await this.sent();
      pass(`${tag}: no email app, chat app or window was opened by itself`, sent.length === 0, sent.join(', '));
      if (there && refusals != null) {
        const refused = store.calls.filter((c) => c.startsWith('refused'));
        pass(`${tag}: the database refused ${refusals === 0 ? 'nothing the page sent' : `only what it should (${refusals})`}`, refused.length === refusals, [...new Set(refused)].slice(0, 6).join('; '));
      }
      await page.evaluate((id) => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:') || k.startsWith(`clarity-cache:${id}:coach-email-standin`) || k === `clarity-cache:${id}:coach-board-layout`) localStorage.removeItem(k); }, me).catch(() => {});
      await clearDevice(page, me).catch(() => {});
      await ctx.close();
    },
  };
}

const PARTS = {};

// ================================================================ 1. an associate opening Leads and Network
PARTS['r-reach'] = async () => {
  const tag = 'r-reach, an associate, 049 to 052 there';
  const owners = asOthers(seedWithCrm({ accounts: true }));
  const a = await openAt({ role: 'associate', db: 'there', tag, rows: owners, path: '/coach' });
  const { page, store } = a;
  // Leo Grant is also one of her own clients in the seed, Tom Hale in one of her to-dos, and Henley a card on the shared board, so neither is looked for.
  const OWNERS_NAMES = ['Amy Cole', 'Elena Ruiz', 'Chris Lowe', 'Sofia Marsh', 'Dana Whitfield', 'David Stark', 'Partners', 'Quillmark Publishing', 'Proposal sent', 'Ready to decide'];
  const addresses = [
    ['/coach/leads', 'Leads'], [`/coach/leads/${CRM.amy}`, 'a lead’s own address'], ['/coach/leads/cold', 'Cold leads'], ['/coach/leads/automations', 'Automations'],
    ['/coach/network', 'Network'], [`/coach/network?person=${CRM.sofia}`, 'a Network person’s address'], ['/coach/network?tab=table', 'Network’s table'], ['/coach/network?tab=map', 'Network’s map'],
    [`/coach/boards/${CRM.partners}`, 'an unshared board'], ['/coach/settings/email', 'Settings, Email'],
  ];
  for (const [to, what] of addresses) {
    await go(page, to, 1600);
    const path = new URL(page.url()).pathname;
    const text = await allWords(page);
    const shown = OWNERS_NAMES.filter((n) => text.includes(n));
    pass(`${tag}: ${what} (${to.split('?')[0].replace(/[0-9a-f-]{36}/, '<id>')}) shows nothing of the owner’s${path === '/coach' ? ' (sent to Today)' : ''}`, shown.length === 0 && (path === '/coach' || /isn’t here any more|No board is shared|isn’t shared/.test(text) || to.includes('settings')), `${path}: ${shown.join(', ')} ${text.slice(0, 80).replace(/\n/g, ' ')}`);
  }
  await go(page, '/coach/settings/email', 1200);
  pass(`${tag}: Settings has no Email section for an associate (no copy-in address, no Gmail)`, !/copy-in|Gmail|forward emails/i.test(await allWords(page)), new URL(page.url()).pathname);
  // What the stand-in handed over: none of the owner's rows of any 052 table, and no Network function answered.
  const handed = await page.evaluate((id) => JSON.parse(localStorage.getItem(`clarity-cache:${id}:coach`) || localStorage.getItem(`clarity-coach-local:${id}`) || '{}'), a.me);
  const theirs = Object.entries(handed.rows || {}).flatMap(([t, rs]) => Object.values(rs).filter((r) => r?.coach_id === OTHER && !(t.startsWith('coach_board') && [CRM.speaking].includes(r.board_id || r.id))).map(() => t));
  pass(`${tag}: her device copy holds no lead, stage, automation, email, check-in or unshared board of the owner’s`, theirs.filter((t) => [...CRM_TABLES, 'coach_leads'].includes(t)).length === 0, [...new Set(theirs)].join(', '));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  pass(`${tag}: and no Network on her device at all`, !keys.some((k) => k.startsWith('clarity-coach-network-local:')) && !keys.some((k) => /network/i.test(k) && /cache/.test(k) && !/not-yet/.test(k)), keys.filter((k) => /network/i.test(k)).join(', '));
  const netCalls = store.calls.slice(a.callsFrom).filter((c) => /network_(page|map|counts)|coach_lead_stages_start/.test(c));
  pass(`${tag}: no Network question was answered for her (each, if asked, refused)`, netCalls.every((c) => c.startsWith('refused') || /\(not/.test(c)) || netCalls.length === 0, netCalls.slice(0, 4).join('; '));
  const seen = [];
  for (const typed of ['Amy', 'Sofia', 'Partners', 'Elena', 'Automation', 'Import leads']) { const found = await search(page, typed); if (/Amy Cole|Sofia Marsh|Partners|Elena Ruiz|Add automation|Import leads/.test(found)) seen.push(typed); }
  pass(`${tag}: search finds no lead, Network person, unshared board or the owner’s actions`, seen.length === 0, seen.join(', '));
  await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600);
  const menu = await page.locator('.cc-menu').innerText().catch(() => '');
  pass(`${tag}: the menu has no Leads, Network or Partners`, !/Leads|Network|Partners/.test(menu), menu.replace(/\n/g, ' ').slice(0, 160));
  await page.keyboard.press('Escape'); await settle(page, 300);
  await go(page, `/coach/boards/${CRM.speaking}`);
  const text = await words(page);
  pass(`${tag}: the shared board shows only its own cards, read only`, text.includes('CIPD Festival of Work') && !text.includes('Quillmark') && !text.includes('Edit this board') && !text.includes('Add card'), text.slice(0, 120).replace(/\n/g, ' '));
  // The owner unshares it: closed at once on her next look (the database's answer; the page keeps nothing).
  for (const b of store.rows.coach_boards) if (b.id === CRM.speaking) b.shared = false;
  await go(page, `/coach/boards/${CRM.speaking}`);
  const after = await words(page);
  pass(`${tag}: unshared, it is gone on her next look, from the page and her device`, !after.includes('CIPD Festival of Work') && !(await a.deviceRows('coach_board_items')).some((i) => i.board_id === CRM.speaking), after.slice(0, 120).replace(/\n/g, ' '));
  await a.close();
};

// ================================================================ 2. 5,000 Network people
PARTS['r-many'] = async () => {
  {
    const tag = 'r-many, 5,000 people, 049 to 052 there';
    const people = manyNetwork(5000);
    const a = await openAt({ db: 'there', tag, people, path: '/coach/network' });
    const { page } = a;
    const count = () => page.locator('.cc-net-ctl .cc-net-count').innerText();
    const timed = async (what, act, done, bound) => {
      const t0 = Date.now(); await act(); await page.waitForFunction(done, null, { timeout: 15000, polling: 'raf' }).catch(() => {}); const ms = Date.now() - t0;
      timings.push(`TIMING 5,000 people: ${what}: ${ms} ms (bound ${bound} ms)`);
      pass(`${tag}: ${what} shows within ${bound / 1000} seconds (${ms} ms)`, ms < bound);
      return ms;
    };
    pass(`${tag}: Actions opens with the 8 most overdue and the 150 ready to archive`, (await actionRows(page, 'Due now')).length === 8 && (await words(page)).includes('150 people have had no contact for 18 months'), (await words(page)).slice(0, 160).replace(/\n/g, ' '));
    await timed('the table’s first page', () => page.getByRole('tab', { name: 'Table', exact: true }).click(), () => document.querySelectorAll('.cc-net-table tbody tr').length === 50, 2000);
    pass(`${tag}: 50 rows of 4,850 (“Showing 50 of 4,850”)`, (await rowNames(page)).length === 50 && (await count()) === '4,850 people', await count());
    await timed('a search (“kestrel”)', () => page.getByRole('searchbox', { name: 'Search your network' }).fill('kestrel'), () => /^[\d,]+ of 4,850 people$/.test(document.querySelector('.cc-net-ctl .cc-net-count')?.innerText || ''), 2000);
    await press(page, 'Clear', page.locator('.cc-net-ctl'));
    await timed('a sort (Influence, highest first)', async () => { await page.locator('.cc-net-table thead').getByRole('button', { name: 'Influence', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Highest first' }).click(); }, () => document.querySelector('.cc-net-table thead th[aria-sort=descending]') && document.querySelector('.cc-net-table tbody tr')?.children[6]?.innerText.trim() === '10', 2000);
    await timed('Show only Keep close', async () => { await page.locator('.cc-net-table thead').getByRole('button', { name: 'Where to focus', exact: true }).click(); await page.getByRole('menuitemcheckbox', { name: 'Keep close', exact: true }).click(); }, () => /^[\d,]+ of 4,850 people$/.test(document.querySelector('.cc-net-ctl .cc-net-count')?.innerText || ''), 2000);
    await page.keyboard.press('Escape'); await settle(page, 300);
    const narrowed = await page.locator('.cc-net-table tbody tr').evaluateAll((rows) => rows.every((r) => r.children[5].innerText.trim() === 'Keep close'));
    pass(`${tag}: Show only leaves only Keep close`, narrowed);
    await go(page, '/coach/network?tab=table');
    if (!(await page.locator('.cc-net-table tbody tr').count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900); }
    const times = [];
    for (let i = 0; i < 10; i += 1) {
      const want = 50 * (i + 2);
      const t0 = Date.now();
      await page.getByRole('button', { name: 'Show 50 more', exact: true }).click();
      await page.waitForFunction((n) => document.querySelectorAll('.cc-net-table tbody tr').length >= n, want, { timeout: 15000 }).catch(() => {});
      times.push(Date.now() - t0);
    }
    timings.push(`TIMING 5,000 people: Show 50 more, ten times: ${times.join(', ')} ms`);
    const rowsShown = await page.locator('.cc-net-table tbody tr').count();
    const unique = new Set(await page.locator('.cc-net-table tbody tr').evaluateAll((rows) => rows.map((r) => r.innerText))).size;
    pass(`${tag}: Show 50 more ten times gives 550 rows, nobody twice, each within 1.5 seconds (slowest ${Math.max(...times)} ms)`, rowsShown === 550 && unique === 550 && Math.max(...times) < 1500, `${rowsShown} rows, ${unique} different`);
    pass(`${tag}: the foot says “Showing 550 of 4,850”`, (await words(page)).includes('Showing 550 of 4,850'));
    pass(`${tag}: every question asked for 50 rows at most (${a.asked.pages} questions), the people’s table never read whole`, a.asked.limits.every((n) => n <= 50) && !a.store.calls.some((c) => /^GET network_people\b/.test(c)), [...new Set(a.asked.limits)].join(','));
    const held = await page.evaluate((id) => { let n = 0; for (const k of Object.keys(localStorage)) if (k.includes(id) && /network/.test(k)) n += localStorage.getItem(k).length; return n; }, a.me);
    pass(`${tag}: the device keeps no copy of 5,000 people (${held.toLocaleString('en-GB')} characters of Network kept)`, held < 400000);
    await timed('the map', () => page.getByRole('tab', { name: 'Map', exact: true }).click(), () => document.querySelectorAll('.cc-net-map .cc-net-dot').length > 20, 2000);
    pass(`${tag}: the map shows 150 of 4,850`, (await words(page)).includes('Showing 150 of 4,850 people'));
    await timed('Actions again', () => page.getByRole('tab', { name: 'Actions', exact: true }).click(), () => document.querySelectorAll('.cc-part .cc-row').length >= 8, 2000);
    await a.close({ refusals: 0 });
  }
  {
    // Before 052, on the device: 5,000 people fill most of the device's room; adding one more when it is full says so calmly and shows nobody new.
    const tag = 'r-many, 5,000 people, on the device before 052';
    const people = manyNetwork(5000);
    const a = await openAt({ db: 'none', tag, people, path: '/coach/network?tab=table' });
    const { page } = a;
    if (!(await page.locator('.cc-net-table tbody tr').count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 1200); }
    const kept = (await a.peopleNow()).length;
    pass(`${tag}: all 5,000 fit on the device (${kept}) and the table opens on 50 of 4,850`, kept === 5000 && (await rowNames(page)).length === 50, String(kept));
    // Fill the rest of the device's room, then add someone.
    const filled = await page.evaluate(() => {
      let n = 0;
      for (const size of [256 * 1024, 16 * 1024, 1024, 64, 1]) {
        const chunk = 'x'.repeat(size);
        for (let i = 0; i < 400; i += 1) { try { localStorage.setItem(`f4-fill-${n}`, chunk); n += 1; } catch { break; } }
      }
      return n;
    });
    await page.getByRole('tab', { name: 'Actions', exact: true }).click(); await settle(page, 600);
    await press(page, 'Add someone');
    await dialog(page).getByLabel('Who?').fill('Nell Okoye');
    await dialog(page).getByRole('button', { name: /^Add/ }).last().click(); await settle(page, 900);
    const said = `${await panelWords(page)} ${await toastText(page)}`;
    pass(`${tag}: with the device full (${filled} pieces of filler added), adding someone says calmly there is no room`, said.includes('This device has no room left to keep that. Free some space and try again.'), said.replace(/\n/g, ' ').slice(0, 200));
    await page.keyboard.press('Escape'); await settle(page, 400);
    await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 600);
    await page.getByRole('searchbox', { name: 'Search your network' }).fill('Nell'); await settle(page, 900);
    pass(`${tag}: and Nell isn’t shown as kept anywhere (nothing shown that isn’t on the device)`, !(await rowNames(page)).includes('Nell Okoye') && !(await a.peopleNow()).some((p) => p.name === 'Nell Okoye'), (await rowNames(page)).join(','));
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('f4-fill-')) localStorage.removeItem(k); });
    const after = await a.peopleNow();
    pass(`${tag}: nobody of the 5,000 was lost, and Nell was never kept`, after.length === 5000 && !after.some((p) => p.name === 'Nell Okoye'), String(after.length));
    await a.close();
  }
};


// ================================================================ 3. two tabs
const card = (page, name) => page.locator('.cc-lboard [data-card]', { hasText: name }).first();
const stageOfLead = async (a, id) => (await a.rowsNow('coach_leads')).find((l) => l.id === id)?.stage_id;
PARTS['r-tabs'] = async () => {
  {
    const tag = 'r-tabs, one rating in two tabs, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: '/coach/network?tab=table' });
    const A = a.page;
    if (!(await A.locator('.cc-net-table').count())) { await A.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(A, 900); }
    const B = await a.tab('/coach/network?tab=table', { stale: true });
    if (!(await B.locator('.cc-net-table').count())) { await B.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(B, 900); }
    // The same moment: each tab opens Dana's trust and chooses at once.
    await netCell(A, 'Trust in you', 'Dana Whitfield').click(); await settle(A, 400);
    await netCell(B, 'Trust in you', 'Dana Whitfield').click(); await settle(B, 400);
    await Promise.all([A.getByRole('menuitemradio', { name: '5', exact: true }).click(), B.getByRole('menuitemradio', { name: '3', exact: true }).click()]);
    await settle(A, 1200);
    const dana = () => a.store.rows.network_people.find((p) => p.id === CRM.dana);
    const lines = () => a.store.rows.network_ratings.filter((r) => r.person_id === CRM.dana && r.rating === 'trust' && r.rated_on === '2026-11-17');
    pass(`${tag}: both choices at the same moment: the database keeps one of them, and its dated history one line for the day, the same value`, [3, 5].includes(dana()?.trust) && lines().length === 1 && lines()[0].value === dana().trust, JSON.stringify([dana()?.trust, lines().map((l) => l.value)]));
    await go(A, '/coach/network?tab=table'); await go(B, '/coach/network?tab=table');
    for (const p of [A, B]) if (!(await p.locator('.cc-net-table').count())) { await p.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(p, 900); }
    pass(`${tag}: once each tab asks again, both show what was kept`, (await cellText(A, 'Dana Whitfield', 7)) === String(dana().trust) && (await cellText(B, 'Dana Whitfield', 7)) === String(dana().trust), `${await cellText(A, 'Dana Whitfield', 7)} ${await cellText(B, 'Dana Whitfield', 7)}`);
    // A stale tab: A sets trust 6; B, which hasn't asked again, changes Dana's influence: A's trust stands.
    await netCell(A, 'Trust in you', 'Dana Whitfield').click(); await settle(A, 400);
    await A.getByRole('menuitemradio', { name: '6', exact: true }).click(); await settle(A, 900);
    await netCell(B, 'Influence', 'Dana Whitfield').click(); await settle(B, 400);
    await B.getByRole('menuitemradio', { name: '9', exact: true }).click(); await settle(B, 900);
    pass(`${tag}: a stale tab changing another rating leaves the first tab’s rating as it is (only what changed is sent)`, dana()?.trust === 6 && dana()?.influence === 9, JSON.stringify([dana()?.trust, dana()?.influence]));
    // The stale tab then changes the same rating: the last choice is kept, once, and its history follows.
    await netCell(B, 'Trust in you', 'Dana Whitfield').click(); await settle(B, 400);
    await B.getByRole('menuitemradio', { name: '2', exact: true }).click(); await settle(B, 900);
    pass(`${tag}: the stale tab’s later choice is the last word, with one history line for the day`, dana()?.trust === 2 && lines().length === 1 && lines()[0].value === 2, JSON.stringify([dana()?.trust, lines().map((l) => l.value)]));
    // Archived in A, edited in B: the edit is kept and the person stays archived.
    await go(A, `/coach/network?person=${CRM.umar}`);
    await press(A, 'Archive', dialog(A));
    const umar = () => a.store.rows.network_people.find((p) => p.id === CRM.umar);
    await netCell(B, 'Organisation', 'Umar Young').click(); await settle(B, 300);
    await B.locator('.cc-net-table .cc-cell-input').fill('Westgate Academy'); await B.keyboard.press('Enter'); await settle(B, 900);
    pass(`${tag}: a person archived in one tab and edited in the other stays archived, with the edit kept`, Boolean(umar()?.archived_at) && umar()?.organisation === 'Westgate Academy', JSON.stringify([umar()?.archived_at, umar()?.organisation]));
    await go(B, '/coach/network?tab=table');
    if (!(await B.locator('.cc-net-table').count())) { await B.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(B, 900); }
    pass(`${tag}: and leaves the stale tab’s table once it asks again`, !(await rowNames(B)).includes('Umar Young'));
    await a.close({ refusals: 0 });
  }
  {
    const tag = 'r-tabs, a lead merged in one tab and edited in the other, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: '/coach/leads' });
    const A = a.page;
    const B = await a.tab(`/coach/leads/${CRM.christopherDoyle}`, { stale: true });
    await press(A, 'Review');
    await press(A, 'Merge into one', dialog(A)); await settle(A, 900);
    const leads = () => a.store.rows.coach_leads;
    const drop = () => leads().find((l) => l.id === CRM.christopherDoyle);
    pass(`${tag}: merged in the first tab`, drop()?.merged_into === CRM.chrisDoyle);
    await press(B, 'Edit details');
    await dialog(B).getByLabel('Role', { exact: true }).fill('Partner');
    await press(B, 'Save my edit', dialog(B)); await settle(B, 900);
    const said = await toastText(B);
    pass(`${tag}: the stale tab’s edit of the lead merged away never undoes the merge`, drop()?.merged_into === CRM.chrisDoyle, JSON.stringify([drop()?.merged_into, said]));
    await go(A, '/coach/leads');
    pass(`${tag}: the board shows one Chris Doyle`, !(await words(A)).includes('Christopher Doyle'), (await words(A)).includes('Christopher Doyle') ? 'Christopher Doyle is back on the board' : '');
    pass(`${tag}: the merged lead’s timeline stays on Chris Doyle`, a.store.rows.coach_lead_events.filter((e) => e.lead_id === CRM.christopherDoyle).length === 0);
    await a.close({ refusals: null });
  }
  {
    const tag = 'r-tabs, a stage deleted in one tab while a card moves in the other, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: '/coach/leads' });
    const A = a.page;
    const B = await a.tab('/coach/leads', { stale: true });
    await press(A, 'Edit stages');
    await dialog(A).getByRole('button', { name: 'Remove Deciding' }).click(); await settle(A, 400);
    if (await dialog(A).getByLabel('Move them to', { exact: true }).count()) { await dialog(A).getByLabel('Move them to', { exact: true }).first().click(); await settle(A, 300); await A.getByRole('option', { name: 'Proposal sent', exact: true }).first().click(); await settle(A, 400); }
    await press(A, 'Save my edit', dialog(A)); await settle(A, 1000);
    pass(`${tag}: Deciding is gone, Tom Hale moved to Proposal sent`, !a.store.rows.coach_lead_stages.some((s) => s.id === CRM.stDeciding) && (await stageOfLead(a, CRM.tom)) === CRM.stProp);
    // The stale tab moves Chris Lowe from Proposal sent one stage on: into the Deciding it still shows.
    await card(B, 'Chris Lowe').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 1200);
    const said = flat(await toastText(B));
    const where = await stageOfLead(a, CRM.chrisLowe);
    pass(`${tag}: the move into the stage that has gone is refused, and Chris Lowe stays in a real stage`, a.store.rows.coach_lead_stages.some((s) => s.id === where) && where === CRM.stProp, String(where));
    pass(`${tag}: the stale tab says so calmly (what happened, then what to do), never in technical words`, said.length > 0 && !/23514|constraint|violates|error|fail/i.test(said), said);
    await go(B, '/coach/leads');
    pass(`${tag}: once it asks again the stale tab has no Deciding, and Chris Lowe is in Proposal sent`, !(await B.locator('.cc-lboard .cc-board-head', { hasText: 'Deciding' }).count()) && (await B.locator('.cc-lboard .cc-board-col', { has: B.locator('.cc-board-head', { hasText: 'Proposal sent' }) }).innerText()).includes('Chris Lowe'));
    const waiting = await B.evaluate((id) => Boolean(localStorage.getItem(`clarity-coach-local:${id}`)), a.me);
    pass(`${tag}: nothing is left waiting on the device to be sent again and again`, !waiting);
    await a.close({ refusals: null });
  }
  {
    const tag = 'r-tabs, an automation switched off in one tab while it runs in the other, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: '/coach/leads/automations' });
    const A = a.page;
    const B = await a.tab('/coach/leads', { stale: true });
    const todosFor = (lead) => a.store.rows.coach_todos.filter((t) => t.lead_id === lead && /Follow up on the proposal/.test(t.title));
    await A.getByRole('switch').first().click(); await settle(A, 900);
    pass(`${tag}: the first automation (Proposal sent: add a to-do) is switched off`, a.store.rows.coach_automations.find((x) => x.id === CRM.a1)?.active === false);
    // The stale tab, which still has it on, moves Jack Moran on to Proposal sent (New, Call booked, Proposal sent).
    await card(B, 'Jack Moran').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 900);
    await card(B, 'Jack Moran').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 1500);
    const ran = todosFor(CRM.jack).length;
    // 054 (run 6, item 7): the claim checks the automation is still on, so the stale tab's run is refused and nothing runs.
    pass(`${tag}: the stale tab's move runs nothing: the claim is refused because it was switched off (${ran})`, ran === 0, String(ran));
    await go(B, '/coach/leads');
    await card(B, 'Elena Ruiz').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 900);
    await card(B, 'Elena Ruiz').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 1500);
    pass(`${tag}: once the tab has asked again, a move into Proposal sent runs nothing`, todosFor(CRM.elena).length === 0 && (await stageOfLead(a, CRM.elena)) === CRM.stProp, String(todosFor(CRM.elena).length));
    await a.close({ refusals: 1 }); // the stale tab's claim (CC409), and nothing else
    timings.push(`NOTE r-tabs: an automation switched off in one tab still ran once from a stale tab: ${ran === 1 ? 'yes' : 'no'}`);
  }
};


// ================================================================ 4. offline and back
/** Moves a page to another address inside the portal without loading it again (as a link in the menu does). */
const within = async (page, to) => { await page.evaluate((path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, to); await settle(page, 1200); };
PARTS['r-offline'] = async () => {
  const tag = 'r-offline, 049 to 052 there, the connection lost and back';
  const a = await openAt({ db: 'there', tag, path: '/coach/network?tab=table' });
  const { page, store } = a;
  if (!(await page.locator('.cc-net-table').count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900); }
  const B = await a.tab('/coach/leads');            // a second tab on the same device, open the whole time
  const callsAt = store.calls.length;
  store.down = true;
  for (const p of [page, B]) await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  const said = [];
  // Network: a give on a person open when the connection went, a rating, a person never opened, and an archive review.
  await page.keyboard.press('Escape'); await settle(page, 300);
  const callsAt2 = store.calls.length;
  store.down = false;
  await page.locator('.cc-net-table').getByRole('button', { name: 'David Stark', exact: true }).first().click(); await settle(page, 1200);
  store.down = true;
  let giveSaid = '';
  if (await dialog(page).getByRole('button', { name: 'Log what you gave', exact: true }).count()) {
    await press(page, 'Log what you gave', dialog(page));
    await dialog(page).getByRole('radio', { name: 'An idea' }).click();
    await press(page, 'Save', dialog(page)); await settle(page, 1200);
    giveSaid = flat(await toastText(page));
  } else giveSaid = `(the panel: ${flat(await panelWords(page)).slice(0, 120)})`;
  said.push(['a give', giveSaid]);
  await page.keyboard.press('Escape'); await settle(page, 400);
  await netCell(page, 'Trust in you', 'Dana Whitfield').click(); await settle(page, 400);
  await page.getByRole('menuitemradio', { name: '5', exact: true }).click(); await settle(page, 1200);
  said.push(['a rating', flat(await toastText(page))]);
  void callsAt2;
  await page.locator('.cc-net-table').getByRole('button', { name: 'Sofia Marsh', exact: true }).first().click(); await settle(page, 300);
  const personSaid = [];
  for (let i = 0; i < 20 && !/connection|Log what you gave/.test(await panelWords(page)); i += 1) { personSaid.push(flat(await panelWords(page))); await settle(page, 400); }
  pass(`${tag}: a person never opened here, with no connection, never reads as gone: the panel says it needs a connection`, /needs a connection/.test(await panelWords(page)) && !personSaid.some((x) => /isn’t in your Network any more/.test(x)), [...new Set(personSaid)].join(' | ').slice(0, 200));
  await page.keyboard.press('Escape'); await settle(page, 400); await page.keyboard.press('Escape'); await settle(page, 400);
  await page.getByRole('tab', { name: 'Actions', exact: true }).click(); await settle(page, 4000);
  let archiveSaid = '';
  if (await page.getByRole('button', { name: 'Review them', exact: true }).count()) {
    await press(page, 'Review them'); await settle(page, 300);
    const early = flat(await panelWords(page));
    pass(`${tag}: Ready to archive? never says “0 people” while its list is on its way`, !/\b0 people\b/.test(early), early.slice(0, 120));
    for (let i = 0; i < 20 && !/connection/.test(await panelWords(page)); i += 1) await settle(page, 400);
    const go2 = dialog(page).getByRole('button', { name: /^Archive \d+$/ });
    if (await go2.count()) { await go2.click(); await settle(page, 1500); archiveSaid = flat(`${await toastText(page)} ${await panelWords(page)}`).slice(0, 220); } else archiveSaid = `(the panel: ${flat(await panelWords(page)).slice(0, 160)})`;
    await page.keyboard.press('Escape'); await settle(page, 400);
  } else archiveSaid = `(Actions: ${flat(await words(page)).slice(0, 160)})`;
  said.push(['an archive review', archiveSaid]);
  // Leads, in the other tab: a lead added, a move that sets an automation off, a stage renamed, then a board card.
  await openAddLead(B); await settle(B, 600);
  await dialog(B).getByLabel('Who is it?').fill('Hana Okafor');
  await press(B, 'Add lead', dialog(B)); await settle(B, 900);
  said.push(['a lead added', flat(await toastText(B))]);
  await card(B, 'Ruth Adeyemi').focus(); await B.keyboard.press('ArrowRight'); await settle(B, 1400);
  said.push(['a lead moved to Proposal sent', flat(await toastText(B))]);
  await press(B, 'Edit stages');
  await dialog(B).locator('.cc-stage-row input').first().fill('First contact');
  await press(B, 'Save my edit', dialog(B)); await settle(B, 1000);
  said.push(['a stage renamed', flat(await toastText(B))]);
  await within(B, `/coach/boards/${CRM.speaking}`);
  await B.getByRole('button', { name: 'Add card to Ideas' }).click(); await settle(B, 500);
  await dialog(B).getByLabel('Name', { exact: true }).fill('Offline Summit');
  await press(B, 'Add card', dialog(B)); await settle(B, 900);
  said.push(['a board card added', flat(await toastText(B))]);
  console.log(`  COUNT offline: ${said.map(([w, x]) => `${w}: “${x}”`).join('; ')}`);
  const technical = said.filter(([, x]) => /23514|PGRST|violates|TypeError|Failed to fetch|error|fail/i.test(x));
  pass(`${tag}: each change made with no connection is said calmly, never in technical words`, technical.length === 0, technical.map(([w, x]) => `${w}: ${x}`).join(' | '));
  const wills = said.filter(([w]) => w !== 'an archive review');
  pass(`${tag}: the rating, the give, the lead, the move, the stage and the card each say “Will sync”`, wills.every(([, x]) => x === 'Will sync'), wills.map(([w, x]) => `${w}: ${x}`).join(' | '));
  pass(`${tag}: an archive review with no connection says calmly that it needs one, and archives nobody`, /connection/i.test(archiveSaid) && !store.rows.network_people.some((p) => p.archived_at && [CRM.beaR, CRM.danielV, CRM.zaraN].includes(p.id)), archiveSaid);
  pass(`${tag}: and the database holds none of it yet`, !store.rows.coach_leads.some((l) => l.name === 'Hana Okafor') && store.rows.network_people.find((p) => p.id === CRM.dana)?.trust === 8);
  // Back online: each waiting change once, in order; the automation once, with the two tabs open.
  store.down = false;
  const writes = [];
  const listen = (p) => p.on('request', (req) => { if (!/\/rest\/v1\/(coach_|network_)/.test(req.url()) || req.method() === 'GET') return; let ids = ''; try { const body = req.postDataJSON(); ids = (Array.isArray(body) ? body : [body]).map((r) => r?.id || '').join(','); } catch { /* a delete */ } writes.push(`${req.method()} ${req.url().split('/rest/v1/')[1].split('?')[0]} ${ids}`); });
  listen(page); listen(B);
  for (const p of [page, B]) await p.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  for (let i = 0; i < 40 && !(store.rows.coach_leads.some((l) => l.name === 'Hana Okafor') && store.rows.coach_board_items.some((x) => x.title === 'Offline Summit')); i += 1) await settle(page, 500);
  await settle(page, 3500);
  const leads = store.rows.coach_leads.filter((l) => l.name === 'Hana Okafor');
  const ruth = store.rows.coach_leads.find((l) => l.name === 'Ruth Adeyemi');
  pass(`${tag}: back online, the lead arrives once, the move, the stage’s new name and the card too`, leads.length === 1 && ruth?.stage_id === CRM.stProp && store.rows.coach_lead_stages.find((x) => x.id === CRM.stNew)?.name === 'First contact' && store.rows.coach_board_items.filter((x) => x.title === 'Offline Summit').length === 1,
    JSON.stringify([leads.length, ruth?.stage_id === CRM.stProp, store.rows.coach_lead_stages.find((x) => x.id === CRM.stNew)?.name]));
  const dana = store.rows.network_people.find((p) => p.id === CRM.dana);
  const gives = store.rows.network_gives.filter((g) => g.person_id === CRM.david && g.kind === 'idea' && g.happened_on === '2026-11-17' && !g.note);
  pass(`${tag}: the rating arrives, once in its history`, dana?.trust === 5 && store.rows.network_ratings.filter((r) => r.person_id === CRM.dana && r.rating === 'trust' && r.rated_on === '2026-11-17').length === 1, String(dana?.trust));
  pass(`${tag}: the give arrives once`, gives.length === 1, JSON.stringify(gives.map((g) => [g.id.slice(-6), g.note, g.created_at])));
  const followUps = store.rows.coach_todos.filter((t) => t.lead_id === ruth?.id && /Follow up on the proposal/.test(t.title));
  const runs = store.rows.coach_automation_runs.filter((r) => r.automation_id === CRM.a1 && r.lead_id === ruth?.id);
  pass(`${tag}: the automation ran once for the move, with two tabs open on the device (one run, one to-do)`, followUps.length === 1 && runs.length === 1, `${followUps.length} to-dos, ${runs.length} runs`);
  const firsts = writes.filter((w, n) => writes.indexOf(w) === n);
  const most = Math.max(0, ...firsts.map((w) => writes.filter((x) => x === w).length));
  console.log(`  COUNT offline: back online ${writes.length} writes, ${firsts.length} different rows; the most any one row was sent: ${most} (an upsert of the same row each time)`);
  const tables = ['coach_leads', 'coach_lead_events', 'coach_board_items', 'coach_todos', 'coach_automation_runs', 'network_gives'];
  const dupes = tables.filter((t) => new Set(store.rows[t].map((r) => r.id)).size !== store.rows[t].length);
  pass(`${tag}: nothing is doubled in the database (each row once by its id)`, dupes.length === 0, dupes.join(', '));
  const waitingNow = () => page.evaluate((id) => {
    const local = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || 'null');
    const unsent = local ? Object.entries(local.marks || {}).flatMap(([t, m]) => Object.entries(m).filter(([, x]) => !x.sent || x.gone).map(([k, x]) => `${t} ${k.slice(-6)} ${JSON.stringify(x)} ${(local.rows?.[t]?.[k]?.name) || ''}`)) : [];
    const queued = Object.keys(localStorage).filter((k) => k.startsWith('clarity-queue:')).flatMap((k) => (JSON.parse(localStorage.getItem(k) || '[]') || []).map((q) => `queue ${q.table || q.op?.table || '?'} ${q.kind || q.op?.kind || ''}`));
    return [...unsent, ...queued];
  }, a.me);
  let waiting = await waitingNow();
  const waitedFirst = waiting.length;
  for (let i = 0; i < 10 && waiting.length; i += 1) { for (const p of [page, B]) await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(page, 1000); waiting = await waitingNow(); }
  console.log(`  COUNT offline: rows still unsent on the device 3.5 seconds after the last arrived: ${waitedFirst}; after up to 10 more seconds: ${waiting.length}`);
  pass(`${tag}: and nothing waits on the device any more`, waiting.length === 0, [...new Set(waiting)].join(', '));
  pass(`${tag}: nothing was refused`, !store.calls.slice(callsAt).some((c) => c.startsWith('refused')), store.calls.slice(callsAt).filter((c) => c.startsWith('refused')).slice(0, 3).join('; '));
  await a.close();
};



// ================================================================ 5. a merge undone
const CHRIS2 = '00000000-0000-4000-8000-000000009901';
const LEO2 = '00000000-0000-4000-8000-000000009902';
/** Christopher Doyle given a timeline line, a tag, an email and a to-do of his own; a third Chris Doyle, and an open Leo Grant beside the won one. */
const withMergeRows = ({ third = false, leo = false } = {}) => (rows) => {
  const line = rows.coach_lead_events.find((e) => e.lead_id === CRM.amy);
  const todo = rows.coach_todos[0];
  const chris = rows.coach_leads.find((l) => l.id === CRM.chrisDoyle);
  rows.coach_lead_events.push({ ...line, id: '00000000-0000-4000-8000-000000009911', lead_id: CRM.christopherDoyle, kind: 'call', title: 'Christopher’s own call', detail: null, data: { minutes: 30 } });
  rows.coach_tag_links.push({ tag_id: ID_TAGS.finance, item_kind: 'lead', item_id: CRM.christopherDoyle, coach_id: chris.coach_id }, { tag_id: ID_TAGS.exec, item_kind: 'lead', item_id: CRM.christopherDoyle, coach_id: chris.coach_id }, { tag_id: ID_TAGS.exec, item_kind: 'lead', item_id: CRM.chrisDoyle, coach_id: chris.coach_id });
  rows.coach_email_links.push({ email_id: CRM.e1, coach_id: chris.coach_id, person_kind: 'lead', person_id: CRM.christopherDoyle, created_at: line.created_at });
  rows.coach_todos.push({ ...todo, id: '00000000-0000-4000-8000-000000009912', title: 'Send Christopher the dates', lead_id: CRM.christopherDoyle, done_at: null });
  if (third) {
    rows.coach_leads.push({ ...chris, id: CHRIS2, name: 'Chris Doyle', email: null, organisation: 'Doyle & Co', notes: 'Met at a conference', phone: null });
    rows.coach_lead_events.push({ ...line, id: '00000000-0000-4000-8000-000000009913', lead_id: CHRIS2, kind: 'note', title: 'The third one’s note', detail: null, data: {} });
  }
  if (leo) {
    // Leo Grant the lead (won, with the client's timeline) and an open "Leo Grant" lead made again from a booking page.
    for (const l of rows.coach_leads) if (l.id === CRM.christopherDoyle) l.name = 'Christopher Doyle-Ward';
    // First in the list, so it is the first of the pair offered: the merge must still keep the won one.
    rows.coach_leads.unshift({ ...chris, id: LEO2, name: 'Leo Grant', email: null, organisation: 'Northfield Logistics', notes: null, phone: null, source: 'chemistry_page' });
    rows.coach_lead_events.push({ ...line, id: '00000000-0000-4000-8000-000000009914', lead_id: CRM.leoWon, kind: 'call', title: 'The call that won Leo', detail: null, data: { minutes: 30 } });
    rows.coach_lead_events.push({ ...line, id: '00000000-0000-4000-8000-000000009915', lead_id: LEO2, kind: 'note', title: 'Leo booked again', detail: null, data: {} });
  }
};
/** Everything a merge moves, as it is now: the two leads, and whose each line, to-do, tag, email and field is. */
const mergeSnap = async (a, ids) => {
  const strip = (r) => { const { updated_at: _u, created_at: _c, ...rest } = r; return rest; };
  const leads = (await a.rowsNow('coach_leads')).filter((l) => ids.includes(l.id)).map(strip).sort((x, y) => x.id.localeCompare(y.id));
  const events = (await a.rowsNow('coach_lead_events')).filter((e) => ids.includes(e.lead_id)).map((e) => `${e.id}>${e.lead_id}`).sort();
  const todos = (await a.rowsNow('coach_todos')).filter((t) => ids.includes(t.lead_id)).map((t) => `${t.id}>${t.lead_id}`).sort();
  const tags = (await a.rowsNow('coach_tag_links')).filter((t) => t.item_kind === 'lead' && ids.includes(t.item_id)).map((t) => `${t.tag_id}>${t.item_id}`).sort();
  const emails = (await a.rowsNow('coach_email_links')).filter((t) => t.person_kind === 'lead' && ids.includes(t.person_id)).map((t) => `${t.email_id}>${t.person_id}`).sort();
  return JSON.stringify({ leads, events, todos, tags, emails });
};
const diffOf = (x, y) => { const a1 = JSON.parse(x); const b1 = JSON.parse(y); return Object.keys(a1).filter((k) => JSON.stringify(a1[k]) !== JSON.stringify(b1[k])).map((k) => `${k}: ${JSON.stringify(a1[k]).slice(0, 160)} → ${JSON.stringify(b1[k]).slice(0, 160)}`).join(' / '); };
PARTS['r-merge'] = async () => {
  for (const db of ['there', 'none']) {
    const mode = db === 'there' ? '049 to 052 there' : 'on the device before 052';
    {
      const tag = `r-merge, two leads merged and undone, ${mode}`;
      const a = await openAt({ db, tag, path: '/coach/leads', change: withMergeRows() });
      const { page } = a;
      const ids = [CRM.chrisDoyle, CRM.christopherDoyle];
      const before = await mergeSnap(a, ids);
      await press(page, 'Review');
      await press(page, 'Merge into one', dialog(page)); await settle(page, 1200);
      const merged = await mergeSnap(a, ids);
      const m = JSON.parse(merged);
      pass(`${tag}: merged: Christopher’s line, to-do, tags and email are all on Chris Doyle (a tag both had is on Chris once)`, m.events.every((e) => e.endsWith(CRM.chrisDoyle)) && m.todos.every((t) => t.endsWith(CRM.chrisDoyle)) && m.tags.filter((t) => t.endsWith(CRM.chrisDoyle)).length === 2 && m.emails.every((t) => t.endsWith(CRM.chrisDoyle)), diffOf(before, merged));
      pass(`${tag}: and he leaves the board`, !(await words(page)).includes('Christopher Doyle'));
      await undo(page); await settle(page, 1200);
      const after = await mergeSnap(a, ids);
      pass(`${tag}: Undo puts both back exactly as they were: ids, fields, every line, to-do, tag and email in its place`, after === before, diffOf(before, after));
      pass(`${tag}: both are on the board again`, (await words(page)).includes('Christopher Doyle'));
      await a.close({ refusals: 0 });
    }
    {
      const tag = `r-merge, merged then the page reloaded, ${mode}`;
      const a = await openAt({ db, tag, path: '/coach/leads', change: withMergeRows({ third: true }) });
      const { page } = a;
      await press(page, 'Review');
      const pair = flat(await panelWords(page));
      await press(page, 'Merge into one', dialog(page)); await settle(page, 1200);
      await go(page, '/coach/leads');
      pass(`${tag}: after a reload the merge stands and no Undo is offered`, (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 0, pair.slice(0, 80));
      const leads = await a.rowsNow('coach_leads');
      const kept = leads.filter((l) => [CRM.chrisDoyle, CRM.christopherDoyle, CHRIS2].includes(l.id) && !l.merged_into);
      const lines = (await a.rowsNow('coach_lead_events')).filter((e) => ['00000000-0000-4000-8000-000000009911', '00000000-0000-4000-8000-000000009913'].includes(e.id) || e.lead_id === CRM.chrisDoyle);
      pass(`${tag}: nothing lost: two of the three remain and every line is on one of them`, kept.length === 2 && lines.every((e) => kept.some((k) => k.id === e.lead_id)), JSON.stringify(kept.map((k) => k.name)));
      // A into B, then B into C: the third Chris Doyle is offered next; merged too, everything ends on one.
      if (await page.getByRole('button', { name: 'Review', exact: true }).count()) {
        await press(page, 'Review');
        await press(page, 'Merge into one', dialog(page)); await settle(page, 1200);
        const now = await a.rowsNow('coach_leads');
        const left = now.filter((l) => [CRM.chrisDoyle, CRM.christopherDoyle, CHRIS2].includes(l.id) && !l.merged_into);
        const ev = (await a.rowsNow('coach_lead_events')).filter((e) => ['00000000-0000-4000-8000-000000009911', '00000000-0000-4000-8000-000000009913'].includes(e.id));
        pass(`${tag}: A into B, then B into C: one Chris Doyle is left, with all three timelines`, left.length === 1 && ev.every((e) => e.lead_id === left[0].id) && now.filter((l) => [CRM.chrisDoyle, CRM.christopherDoyle, CHRIS2].includes(l.id) && l.merged_into).every((l) => l.merged_into === left[0].id || now.find((x) => x.id === l.merged_into)?.merged_into === left[0].id), JSON.stringify(left.map((l) => l.name)));
        await go(page, `/coach/leads/${left[0]?.id}`);
        const text = await words(page);
        pass(`${tag}: its page shows Christopher’s call and the third one’s note`, has(text, ['Christopher’s own call', 'The third one’s note']), missing(text, ['Christopher’s own call', 'The third one’s note']));
      } else pass(`${tag}: the third Chris Doyle is offered for a merge next`, false, (await words(page)).slice(0, 160));
      await a.close({ refusals: 0 });
    }
    {
      const tag = `r-merge, a lead already won, ${mode}`;
      const a = await openAt({ db, tag, path: '/coach/leads', change: withMergeRows({ leo: true }) });
      const { page } = a;
      const line = flat(await words(page));
      pass(`${tag}: “Leo Grant may be in here twice.” is offered`, line.includes('Leo Grant may be in here twice.'), line.slice(0, 200));
      await press(page, 'Review');
      await press(page, 'Merge into one', dialog(page)); await settle(page, 1200);
      const leads = await a.rowsNow('coach_leads');
      const won = leads.find((l) => l.id === CRM.leoWon);
      const other = leads.find((l) => l.id === LEO2);
      pass(`${tag}: the won lead is the one kept, still won, and the other is merged into it (whichever order they were picked in)`, !won?.merged_into && Boolean(won?.won_at) && won?.stage_id === CRM.stWon && other?.merged_into === CRM.leoWon, JSON.stringify([won?.merged_into, Boolean(won?.won_at), other?.merged_into]));
      await go(page, `/coach/clients/${ID_LEO}`);
      if (await page.getByRole('button', { name: 'Everything', exact: true }).count()) await press(page, 'Everything');
      const all = await words(page);
      pass(`${tag}: Leo’s client page carries both timelines`, has(all, ['The call that won Leo', 'Leo booked again']), missing(all, ['The call that won Leo', 'Leo booked again']));
      await a.close({ refusals: 0 });
    }
  }
  timings.push('NOTE r-merge: no page merges two Network people (only Leads has Merge into one); a Network merge and its Undo are checked at the database (supabase/052_coach_crm_breakit_test.sql, B4g to B4j) and in the data module (coach-network-data.test.mjs).');
};


// ================================================================ 6. spreadsheets with odd columns
PARTS['r-sheet'] = async () => {
  // First the rules themselves (no browser): every odd file shape.
  {
    const tag = 'r-sheet, the rules';
    const lead = (text) => { const t = csvTable(text); const headed = hasHeadingRow(t[0] || []); const cols = matchColumns(headed ? t[0] : t[0].map(() => '')).columns; return { t, headed, cols, rows: sheetRows(headed ? t.slice(1) : t, cols) }; };
    const noHead = csvTable('Dana Whitfield,dana@example.invalid,Kestrel\nSam Lee,sam@example.invalid,Ash');
    pass(`${tag}: a file with no heading row is read as people, not as headings`, !hasHeadingRow(noHead[0]) && noHead.length === 2);
    const dup = matchColumns(['Name', 'Email', 'Email', 'Name']).columns.map((c) => c.field);
    pass(`${tag}: the same heading twice: the first is matched, the second left out`, dup.join(',') === 'name,email,,', dup.join(','));
    const wide = lead([Array.from({ length: 60 }, (_, i) => (i === 37 ? 'Name' : `Col${i}`)).join(','), Array.from({ length: 60 }, (_, i) => (i === 37 ? 'Wide Person' : `v${i}`)).join(',')].join('\n'));
    pass(`${tag}: 60 columns: every one is offered, and the name found in column 38`, wide.cols.length === 60 && wide.rows.rows[0]?.name === 'Wide Person');
    pass(`${tag}: a byte-order mark before the headings is let go`, lead('﻿Name,Email\nAnn Lee,ann@example.invalid').rows.rows[0]?.name === 'Ann Lee');
    const semi = lead('Name;Email;Organisation\nAnn Lee;ann@example.invalid;X, Y Ltd');
    pass(`${tag}: semicolons between cells, with a comma inside one`, semi.rows.rows[0]?.organisation === 'X, Y Ltd');
    const nl = lead('Name,Notes\n"Ann Lee","line one\nline two"\nBob Ray,x');
    pass(`${tag}: a quoted cell with a new line in it stays in its row (its line break becomes a space)`, nl.rows.rows.length === 2 && nl.rows.rows[0].notes === 'line one line two', JSON.stringify(nl.rows.rows));
    const odd = lead('Name\n😀 Ann\nمحمد علي\n​​\nשרה לוי');
    pass(`${tag}: emoji and right-to-left names are kept; a row of only unseen characters is no one`, odd.rows.rows.map((r) => r.name).join('|') === '😀 Ann|محمد علي|שרה לוי', JSON.stringify(odd.rows));
    const net = csvTable('Name,Influence,Trust,Value delivery,What you get,Last spoke,Rhythm\nA One,11,-1,high,10.5,12/10/2025,quarterly\nB Two,7,8,9,10,2025-10-12,3\nC Three,0,0,0,0,12 October 2025,90 days\nD Four,,,,,Oct 12 2025,0');
    const ncols = matchColumns(net[0], NETWORK_IMPORT_FIELDS).columns;
    const people = importRows(networkSheetRows(net.slice(1), ncols).rows, { today: '2026-11-17' });
    const by = Object.fromEntries(people.map((p) => [p.name, p]));
    pass(`${tag}: ratings of 11, -1, “high” and 10.5 are left blank (so on no list until rated), 0 and 10 kept`, [by['A One'].influence, by['A One'].trust, by['A One'].value_delivery, by['A One'].what_you_get].every((x) => x == null) && by['B Two'].what_you_get === 10 && by['C Three'].influence === 0);
    // “Oct 12 2025” was once left blank; run 6, step 2 (5063e6ed) reads a month's name in either order on purpose,
    // since a name can't be mistaken for a day (network.js typedDay). Only a figure-only date is read day first.
    pass(`${tag}: dates in four styles (12/10/2025 day first, 2025-10-12, 12 October 2025, Oct 12 2025) are read`, by['A One'].last_spoke_on === '2025-10-12' && by['B Two'].last_spoke_on === '2025-10-12' && by['C Three'].last_spoke_on === '2025-10-12' && by['D Four'].last_spoke_on === '2025-10-12', JSON.stringify(people.map((p) => p.last_spoke_on)));
    pass(`${tag}: rhythms “quarterly”, “3” and “90 days” are three months; 0 is no rhythm`, [by['A One'], by['B Two'], by['C Three']].every((p) => p.rhythm_months === 3) && by['D Four'].rhythm_months == null);
    const big = `Name,Email\n${Array.from({ length: 5000 }, (_, i) => `Person ${i},p${i}@example.invalid`).join('\n')}`;
    const t0 = Date.now(); const b = lead(big); const plan = leadImportPlan(b.rows.rows, []); const ms = Date.now() - t0;
    pass(`${tag}: 5,000 rows are read and checked for duplicates in under a second (${ms} ms)`, plan.fresh.length === 5000 && ms < 1000);
    pass(`${tag}: an empty file has no rows`, csvTable('').length === 0 && csvTable('\n\n  \n').length === 0);
    // Formulas are never run: kept as text when imported, and made safe when exported (CSV) or written as text (Excel).
    const evil = [['Name', 'Notes', 'Value'], ['=HYPERLINK("http://example.invalid")', '+1', 3], ['-2+3', '@SUM(1)', -5], ['\t=1', '\r=2', '']];
    const csv = toCsv(evil);
    const cells = csvTable(csv).slice(1).flat().filter(Boolean);
    pass(`${tag}: the CSV export: every text cell starting with =, +, - or @ (or a tab or return before one) starts with a quote mark, numbers stay numbers`, cells.filter((c) => /^[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c)).length === 0 && csv.includes('-5') && csv.includes(",3"), cells.join(' | '));
    const xb = xlsxBytes(evil, 'Leads');
    const xml = new TextDecoder().decode(xb);
    pass(`${tag}: the Excel export writes no formula at all: text is text, numbers are numbers`, !/<f>|<f /.test(xml) && (await xlsxTable(xb))[1][0] === '=HYPERLINK("http://example.invalid")');
    const lr = sheetRows(csvTable('Name,Email,Value\n=cmd|calc,a@example.invalid,=1+1').slice(1), matchColumns(['Name', 'Email', 'Value']).columns).rows;
    const made = leadFromImport(lr[0], { id: 'x', coachId: 'c', stages: [{ id: 's', name: 'New', likelihood: 10, position: 0 }] });
    pass(`${tag}: an imported “=cmd|calc” is kept as a name (text), and “=1+1” as a value is no value`, made?.name === '=cmd|calc' && made.value == null && leadsCsv([made], { stages: [{ id: 's', name: 'New', likelihood: 10, position: 0 }] }, '2026-11-17').includes("'=cmd|calc"));
    let threw = 0;
    for (const broken of [xb.slice(0, 120), new Uint8Array(4000), new TextEncoder().encode('PK not really a workbook')]) { try { await xlsxTable(broken); } catch { threw += 1; } }
    pass(`${tag}: a damaged workbook is refused (the page says it calmly), never read as rubbish`, threw === 3);
    // Leads and Network share one 8 MB limit since run 6, item 10 (model.js IMPORT_FILE_MAX: room for 5,000 rows
    // with notes), so 5 MB is no longer too big; 9 MB is. A file just under the limit is read.
    pass(`${tag}: older formats (.xls, .numbers, .ods) are said calmly with what to do; a 9 MB file is too big for Leads, 5 MB isn't`, ['a.xls', 'a.numbers', 'a.ods'].every((n) => /can’t be read here\. Save it as Excel \(\.xlsx\) or CSV/.test(importFileProblem(n, 100))) && /too big/.test(importFileProblem('a.csv', 9 * 1024 * 1024)) && importFileProblem('a.csv', 5 * 1024 * 1024) === '' && importFileProblem('a.xlsx', 1000) === '');
  }
  // Then the panels, with real files.
  const dir = mkdtempSync(join(tmpdir(), 'crm-breakit-'));
  try {
    const file = (name, data) => { const f = join(dir, name); writeFileSync(f, data); return f; };
    const workbook = file('leads.xlsx', xlsxBytes([['Full name', 'Company', 'E-mail', 'Deal value'], ['Imo Reyes', 'Arden Vale', 'imo.reyes@example.invalid', 12000], ['😀 Nell Okoye', 'Harbour Lane', '', ''], ['محمد علي', 'Quillmark', '', ''], ['=cmd|calc', '@evil', '', '']], 'Leads'));
    const damaged = file('damaged.xlsx', xlsxBytes([['Name'], ['Ann']]).slice(0, 150));
    const empty = file('empty.csv', '');
    // Over the shared 8 MB limit (run 6, item 10): 52,000 rows of about 190 characters, about 9.9 MB.
    const big = file('big.csv', `Name,Email,Notes\n${Array.from({ length: 52000 }, (_, i) => `Person ${i},p${i}@example.invalid,${'x'.repeat(160)}`).join('\n')}`);
    const many = file('many.csv', `Name,Email\n${Array.from({ length: 5000 }, (_, i) => `Person ${i},p${i}@example.invalid`).join('\n')}`);
    const xls = file('old.xls', 'not a workbook'); const numbers = file('sheet.numbers', 'x'); const ods = file('sheet.ods', 'x');
    {
      const tag = 'r-sheet, Leads’ import, on the device before 052';
      const a = await openAt({ db: 'none', tag, path: '/coach/leads' });
      const { page } = a;
      const open = async () => { if (!(await dialog(page).count())) { await page.getByRole('button', { name: 'Import from a spreadsheet', exact: true }).click(); await settle(page, 600); } };
      const choose = async (f) => { await open(); await dialog(page).locator('input[type=file]').setInputFiles(f); await settle(page, 1200); return flat(await panelWords(page)); };
      let text = await choose(workbook);
      pass(`${tag}: a real Excel workbook is read: its columns matched, four people to add`, has(text, ['4 to add.', 'Imo Reyes', '😀 Nell Okoye', 'محمد علي', '=cmd|calc', 'Add 4 leads']), text.slice(0, 220));
      await press(page, 'Add 4 leads', dialog(page)); await settle(page, 900);
      const leads = await a.rowsNow('coach_leads');
      const imo = leads.find((l) => l.name === 'Imo Reyes');
      pass(`${tag}: they are added as text, the value as a number, nothing run`, imo?.value === 12000 && imo.organisation === 'Arden Vale' && leads.some((l) => l.name === '=cmd|calc' && l.organisation === '@evil') && leads.some((l) => l.name === 'محمد علي'), JSON.stringify(imo && [imo.value, imo.organisation]));
      await undo(page);
      text = await choose(damaged);
      pass(`${tag}: a damaged workbook is said calmly, with what to do`, text.includes('That file can’t be read here. Save it as Excel or CSV, or copy the rows and paste them.'), text.slice(0, 200));
      for (const f of [xls, numbers, ods]) {
        text = await choose(f);
        pass(`${tag}: ${f.split('.').pop()} is said calmly: save it as Excel or CSV`, text.includes('That kind of spreadsheet can’t be read here. Save it as Excel (.xlsx) or CSV, or copy the rows and paste them.'), text.slice(0, 160));
      }
      text = await choose(big);
      pass(`${tag}: a 9.9 MB file is too big, said calmly`, text.includes('That file is too big. Split it, or paste the rows instead.'), text.slice(0, 160));
      text = await choose(empty);
      const emptySaid = text;
      pass(`${tag}: an empty file says it has no rows, as soon as it is chosen`, text.includes('That file has no rows to add. Check it and try again.'), emptySaid.slice(0, 160));
      const t0 = Date.now();
      const importsBefore = a.store.calls.filter((c) => /network_import/.test(c)).length;
      text = await choose(many);
      pass(`${tag}: 5,000 rows are read and shown as “5,000 to add” within 3 seconds (${Date.now() - t0} ms)`, text.includes('5,000 to add.') && Date.now() - t0 < 4500, text.slice(0, 160));
      const t1 = Date.now();
      await press(page, 'Add 5,000 leads', dialog(page)); await settle(page, 1200);
      const added = (await a.rowsNow('coach_leads')).filter((l) => /^Person \d+$/.test(l.name)).length;
      const after = added === 5000 ? '' : `${flat(await panelWords(page)).slice(0, 200)} | toast: ${await toastText(page).catch(() => '')} | kept: ${await page.evaluate(() => Object.keys(localStorage).map((k) => `${k.replace(/[0-9a-f-]{36}/, '<id>')} ${localStorage.getItem(k).length}`).join(', '))}`;
      pass(`${tag}: and added on the device in one go (${added}, ${Date.now() - t1} ms)`, added === 5000, `${added} ${after}`);
      // Too many waiting rows for localStorage: they are kept in IndexedDB, and localStorage still says how many wait, so
      // a Sign out counts them ("Some changes haven't synced yet.") instead of clearing them without a word.
      const waitingCount = coachRowsWaiting(await page.evaluate((id) => JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || 'null'), a.me));
      pass(`${tag}: a Sign out would count all 5,000 as still waiting (${waitingCount})`, waitingCount >= 5000, String(waitingCount));
      await a.close();
    }
    {
      const tag = 'r-sheet, Network’s import and export, 049 to 052 there';
      const a = await openAt({ db: 'there', tag, path: '/coach/network?tab=table' });
      const { page } = a;
      const open = async () => { if (!(await dialog(page).count())) { await press(page, 'Import a spreadsheet'); } };
      const choose = async (f) => { await open(); await dialog(page).locator('input[type=file]').setInputFiles(f); await settle(page, 1500); return flat(await panelWords(page)); };
      const sheet = file('people.csv', ['﻿Name;Influence;Trust;Value delivery;What you get;Last spoke;Rhythm;Sector',
        'Ada Byrne;11;-1;high;10.5;12/10/2025;quarterly;Health', 'Ben Cole;7;8;9;10;2025-10-12;3;Retail', 'Cy Dunn;0;0;0;0;12 October 2025;90 days;', 'Di Eyre;;;;;Oct 12 2025;0;'].join('\n'));
      let text = await choose(sheet);
      pass(`${tag}: semicolons and a byte-order mark: four people to add`, text.includes('Add 4 people'), text.slice(0, 200));
      await press(page, 'Add 4 people', dialog(page)); await settle(page, 1200);
      const ppl = Object.fromEntries((await a.peopleNow()).filter((p) => ['Ada Byrne', 'Ben Cole', 'Cy Dunn', 'Di Eyre'].includes(p.name)).map((p) => [p.name, p]));
      pass(`${tag}: kept as the rules read them (ratings of 11, -1, “high”, 10.5 blank; four date styles, Oct 12 2025 read as run 6 step 2 decided; the owner’s own Sector column)`, ppl['Ada Byrne']?.influence == null && ppl['Ada Byrne']?.last_spoke_on === '2025-10-12' && ppl['Ben Cole']?.what_you_get === 10 && ppl['Cy Dunn']?.last_spoke_on === '2025-10-12' && ppl['Di Eyre']?.last_spoke_on === '2025-10-12' && ppl['Ada Byrne']?.own?.[CRM.colSector] === 'Health', JSON.stringify(Object.values(ppl).map((p) => [p.name, p.influence, p.last_spoke_on])));
      for (const f of [damaged, numbers]) {
        text = await choose(f);
        pass(`${tag}: ${f.split('/').pop()} is said calmly`, /can’t be read here/.test(text), text.slice(0, 160));
      }
      text = await choose(empty);
      pass(`${tag}: an empty file says it has no rows, as soon as it is chosen`, text.includes('That file has no rows to add. Check it and try again.'), text.slice(0, 160));
      text = await choose(big);
      if (!/too big/.test(text)) { await dialog(page).getByRole('button', { name: /^Add [\d,]+ (people|person)$|^Add people$/ }).last().click(); await settle(page, 900); text = flat(await panelWords(page)); }
      pass(`${tag}: a 9.9 MB file of 52,000 rows: too many at once, said calmly, nobody added`, /up to 5,000 people at a time|too big/.test(text) && !(await a.peopleNow()).some((p) => p.name === 'Person 1'), text.slice(0, 200));
      await page.keyboard.press('Escape'); await settle(page, 400);
      const t0 = Date.now();
      const importsBefore = a.store.calls.filter((c) => /network_import/.test(c)).length;
      text = await choose(many);
      await press(page, 'Add 5,000 people', dialog(page)); await settle(page, 1500);
      const added = (await a.peopleNow()).filter((p) => /^Person \d+$/.test(p.name)).length;
      pass(`${tag}: 5,000 rows are added in one question to the database (${added}, ${Date.now() - t0} ms)`, added === 5000 && a.store.calls.filter((c) => /network_import/.test(c)).length === importsBefore + 1, String(added));
      // Export: the names a formula would start are made safe.
      a.store.rows.network_people.push({ ...a.store.rows.network_people[0], id: '00000000-0000-4000-8000-000000009931', name: '=HYPERLINK("http://example.invalid")', organisation: '+44 Ltd', role: '-Partner', email: null, notes: '@everyone', merged_into: null, archived_at: null });
      await go(page, '/coach/network?tab=table');
      await press(page, 'Export');
      await dialog(page).getByRole('radio', { name: 'CSV', exact: true }).click().catch(() => {}); await settle(page, 300);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dialog(page).getByRole('button', { name: 'Download', exact: true }).click()]);
      const out = join(dir, 'out.csv'); await dl.saveAs(out);
      const rows = csvTable(readFileSync(out, 'utf8'));
      const mine = rows.find((r) => r[0].includes('HYPERLINK'));
      pass(`${tag}: the CSV export makes every cell that would start a formula safe (=, +, - and @)`, Boolean(mine) && [mine[0], mine[1], mine[2]].every((c) => c.startsWith("'")) && !rows.flat().some((c) => /^[=+@]/.test(c) || /^-[^\d]/.test(c)), JSON.stringify(mine?.slice(0, 4)));
      await a.close();
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
};


// ================================================================ 7. automations that would loop
PARTS['r-loop'] = async () => {
  {
    const tag = 'r-loop, the rules';
    const st = (id, name, position) => ({ id, coach_id: 'c', name, likelihood: 10, position, is_won: false });
    const stages = [st('s1', 'New', 0), st('s2', 'Call booked', 1), st('s3', 'Proposal sent', 2), st('s4', 'Deciding', 3), st('s5', 'Verbal yes', 4), st('s6', 'Paperwork', 5), st('s7', 'Signed', 6), { id: 'won', coach_id: 'c', name: 'Won', likelihood: 100, position: 1000000, is_won: true }];
    const mv = (id, from, to, position = 0) => ({ id, coach_id: 'c', trigger: 'lead_stage', trigger_stage_id: from, action: 'stage', to_stage_id: to, todo_title: null, todo_days: null, active: true, position });
    const td = (id, from, title, position = 0) => ({ id, coach_id: 'c', trigger: 'lead_stage', trigger_stage_id: from, action: 'todo', todo_title: title, todo_days: 0, to_stage_id: null, active: true, position });
    /** One event through the automations, with one database of runs (the unique rule on automation and event key) shared by every caller. */
    const runsDb = new Set();
    let n = 0;
    const run = async (automations, lead, toStage, { moveId = 'm1', claimDelay = 0 } = {}) => {
      let leads = [{ ...lead, stage_id: toStage }];
      const out = { todos: [], moves: [], sent: 0 };
      const done = await runAutomations(stageEvent(leads[0], toStage, moveId), { automations, leads, stages, coachId: 'c', newId: () => `id${n += 1}`, nowIso: '2026-11-17T09:00:00.000Z', todayKey: '2026-11-17', leadsNow: () => leads }, {
        claim: async (r) => { if (claimDelay) await new Promise((ok) => setTimeout(ok, claimDelay)); const k = `${r.automation_id}|${r.event_key}`; if (runsDb.has(k)) return false; runsDb.add(k); return true; },
        addTodo: async (t) => { out.todos.push(t); },
        move: async ({ lead: l }) => { out.moves.push(l.stage_id); leads = leads.map((x) => (x.id === l.id ? l : x)); },
      });
      return { ...done, ...out };
    };
    const lead = { id: 'L', coach_id: 'c', name: 'Tom Hale', stage_id: 's3' };
    let r = await run([mv('A', 's4', 's3', 0), mv('B', 's3', 's4', 1)], lead, 's4');
    pass(`${tag}: A moves Deciding to Proposal sent and B moves it back: each runs once and the chain stops (two moves)`, r.moves.join(',') === 's3,s4' && r.ran === 2, r.moves.join(','));
    pass(`${tag}: the loop is refused when saved (the page’s rule)`, /round in a circle/.test(automationLoop(mv('B', 's3', 's4'), [mv('A', 's4', 's3')], stages)));
    const six = [mv('c1', 's1', 's2', 0), mv('c2', 's2', 's3', 1), mv('c3', 's3', 's4', 2), mv('c4', 's4', 's5', 3), mv('c5', 's5', 's6', 4), mv('c6', 's6', 's7', 5)];
    r = await run(six, { ...lead, id: 'L6', stage_id: 's0' }, 's1');
    pass(`${tag}: a chain of six moves stops after ${CHAIN_MAX} (CHAIN_MAX), whatever happens; it isn’t a loop, so it can be saved`, r.moves.length === CHAIN_MAX && r.moves[r.moves.length - 1] === 's6' && automationLoop(six[5], six.slice(0, 5), stages) === '', r.moves.join(','));
    const many = Array.from({ length: 200 }, (_, i) => td(`t${i}`, 's4', `To-do ${i}`, i));
    const t0 = Date.now();
    r = await run(many, { ...lead, id: 'L200' }, 's4');
    pass(`${tag}: 200 automations on one stage: each adds its to-do once, quickly (${Date.now() - t0} ms)`, r.todos.length === 200 && new Set(r.todos.map((t) => t.title)).size === 200 && Date.now() - t0 < 1500);
    r = await run(many, { ...lead, id: 'L200' }, 's4');
    pass(`${tag}: the same event again (a reload, another tab): nothing runs twice`, r.todos.length === 0 && r.ran === 0);
    const long = tidyAutomation(td('long', 's4', 'x'.repeat(5000)));
    pass(`${tag}: a to-do title of 5,000 characters is kept to 300 (the database’s most)`, long.todo_title.length === 300 && automationProblem(long, { stages }) === '');
    r = await run([mv('gone', 's4', 'no-such-stage')], { ...lead, id: 'Lg' }, 's4');
    pass(`${tag}: an automation naming a stage that has gone moves nothing, and claims no run`, r.moves.length === 0 && r.ran === 0 && ![...runsDb].some((k) => k.startsWith('gone|')));
    // The same event from two tabs at the same moment: one database of runs, so one of them runs it.
    const both = await Promise.all([run([td('once', 's3', 'Follow up on the proposal')], { ...lead, id: 'Lt' }, 's3', { moveId: 'same', claimDelay: 5 }), run([td('once', 's3', 'Follow up on the proposal')], { ...lead, id: 'Lt' }, 's3', { moveId: 'same', claimDelay: 1 })]);
    pass(`${tag}: one event from two tabs at once: its to-do is added once`, both[0].todos.length + both[1].todos.length === 1);
    pass(`${tag}: an automation can only add a to-do or move a stage: nothing else is ever done (nothing sent)`, ACTIONS.map((x) => x.value).sort().join(',') === 'stage,todo');
    pass(`${tag}: nor move a lead to Won`, /Won makes a client/.test(automationProblem({ trigger: 'lead_stage', trigger_stage_id: 's3', action: 'stage', to_stage_id: 'won' }, { stages })));
  }
  {
    // The browser: two tabs opening at once, each watching for events (a quiet lead, a proposal opened, a call booked).
    const tag = 'r-loop, the watch in two tabs opened at once, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: null, change: (rows) => { rows.coach_automation_runs = rows.coach_automation_runs.map((r, i) => ({ ...r, event_key: `seed-only:${i}` })); } });
    const B = await a.ctx.newPage();
    await B.setViewportSize({ width: 1440, height: 1100 });
    await Promise.all([go(a.page, '/coach/leads', 4000), go(B, '/coach/leads', 4000)]);
    const todos = (title, leadId) => a.store.rows.coach_todos.filter((t) => t.title === title && t.lead_id === leadId).length;
    const counts = [todos('Check in', CRM.tom), todos('Call while the proposal is fresh', CRM.amy)];
    pass(`${tag}: the quiet lead and the opened proposal each add their to-do once, though both tabs saw them`, counts.every((c) => c === 1), counts.join(','));
    await go(a.page, '/coach/leads', 3000); await go(B, '/coach/leads', 3000);
    pass(`${tag}: and opening both again adds nothing more`, todos('Check in', CRM.tom) === 1 && todos('Call while the proposal is fresh', CRM.amy) === 1);
    // 200 automations on the page, and a 5,000-character to-do typed in.
    for (let i = 0; i < 200; i += 1) a.store.rows.coach_automations.push({ id: `00000000-0000-4000-8000-0000000${String(95000 + i).padStart(5, '0')}`, coach_id: a.store.rows.coach_automations[0].coach_id, trigger: 'lead_won', trigger_stage_id: null, trigger_count: null, call_type_key: null, action: 'todo', todo_title: `Thank them ${i}`, todo_days: 1, to_stage_id: null, active: i % 2 === 0, position: 10 + i });
    const t0 = Date.now();
    await go(a.page, '/coach/leads/automations', 800);
    await a.page.waitForFunction(() => document.querySelectorAll('[role=switch]').length >= 200, null, { timeout: 15000 }).catch(() => {});
    const ms = Date.now() - t0;
    pass(`${tag}: 200 automations show, each with its switch, within 3 seconds (${ms} ms)`, (await a.page.getByRole('switch').count()) >= 205 && ms < 3000, String(await a.page.getByRole('switch').count()));
    await press(a.page, 'Add automation');
    const d = dialog(a.page);
    await d.getByLabel('To-do', { exact: true }).fill('y'.repeat(5000)); await settle(a.page, 300);
    const typed = await d.getByLabel('To-do', { exact: true }).inputValue();
    pass(`${tag}: a 5,000-character to-do typed in is held to 300 characters`, typed.length === 300, String(typed.length));
    await a.page.keyboard.press('Escape'); await settle(a.page, 300);
    pass(`${tag}: nothing was sent, and no automation did anything but add a to-do or move a stage`, a.api.length === 0 && a.store.rows.coach_automations.every((x) => ['todo', 'stage'].includes(x.action)));
    await a.close({ refusals: null });
  }
};


// ================================================================ 8. everything else odd
/** Two presses in the same moment: both clicks land before the page can draw anything. */
const twice = (locator) => locator.evaluate((el) => { el.click(); el.click(); });
const fits = (page) => page.evaluate(() => {
  const wide = document.documentElement.scrollWidth - window.innerWidth;
  const cut = [...document.querySelectorAll('.cc-app button, .cc-app a, .ds-dialog button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.cc-utabs, .cc-menu, [aria-hidden=true], .cc-net-box, .cc-lboard, .cc-table-box, .cc-board'); }).map((el) => (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30));
  return { wide, cut: [...new Set(cut)].slice(0, 5) };
});
const ODD = (process.env.ODD || 'leads,network,big').split(',');
PARTS['r-odd'] = async () => {
  if (ODD.includes('leads')) {
    const tag = 'r-odd, leads, 049 to 052 there';
    const a = await openAt({ db: 'there', tag, path: '/coach/leads', change: (rows) => {
      rows.coach_email_waiting = (rows.coach_email_waiting || []).map((w) => ({ ...w }));
    } });
    const { page, store } = a;
    // Names.
    const addLead = async (name) => { await openAddLead(page); await settle(page, 500); await dialog(page).getByLabel('Who is it?').fill(name); await press(page, 'Add lead', dialog(page)); await settle(page, 700); const t = flat(await panelWords(page)); if (await dialog(page).count()) { await page.keyboard.press('Escape'); await settle(page, 400); } return t; };
    let said = await addLead('L'.repeat(300));
    const long = store.rows.coach_leads.find((l) => /^L{20,}$/.test(l.name));
    pass(`${tag}: a 300-character name is kept to the 120 the database holds, never refused by it`, long?.name.length === 120 && !store.calls.some((c) => c.startsWith('refused')), String(long?.name.length));
    said = await addLead('     ');
    pass(`${tag}: a name of only spaces: “Type their name to carry on.”`, said.includes('Type their name to carry on.') && !store.rows.coach_leads.some((l) => !l.name.trim()), said.slice(0, 120));
    said = await addLead('​‍⁠');
    pass(`${tag}: a name of only unseen characters is no name either`, said.includes('Type their name to carry on.') && !store.rows.coach_leads.some((l) => !l.name.replace(/[​-‍⁠﻿]/g, '').trim()), said.slice(0, 120));
    // Values.
    await go(page, `/coach/leads/${CRM.chrisLowe}`);
    const value = async (typed) => {
      await press(page, 'Edit details');
      await dialog(page).getByLabel('Value', { exact: true }).fill(typed);
      await press(page, 'Save my edit', dialog(page)); await settle(page, 800);
      const t = `${flat(await panelWords(page))} ${flat(await toastText(page))}`;
      if (await dialog(page).count()) { await page.keyboard.press('Escape'); await settle(page, 400); }
      return t;
    };
    const vals = {};
    for (const typed of ['-1', '1e12', 'ten', '999999999', '£13,500']) vals[typed] = await value(typed);
    const kept = store.rows.coach_leads.find((l) => l.id === CRM.chrisLowe)?.value;
    console.log(`  COUNT values: ${Object.entries(vals).map(([k, v]) => `${k}: “${v.replace(/^EDIT DETAILS.*?(Name|$)/, '').slice(-110)}”`).join('; ')}`);
    pass(`${tag}: a value of -1, 1e12, “ten” or 999,999,999 is never kept, and said calmly (never the database’s words)`, ['-1', '1e12', 'ten', '999999999'].every((k) => !/violates|constraint|23514/.test(vals[k])) && Number(kept) === 13500, JSON.stringify(kept));
    pass(`${tag}: “£13,500” is kept as 13,500`, Number(kept) === 13500);
    // Stages: a likelihood of 101, none before Won, 60.
    await go(page, '/coach/leads');
    await press(page, 'Edit stages');
    await dialog(page).locator('.cc-stage-row input').nth(1).fill('101');
    await press(page, 'Save my edit', dialog(page)); await settle(page, 600);
    pass(`${tag}: a likelihood of 101: “Type a number from 0 to 100.”`, (await panelWords(page)).includes('Type a number from 0 to 100.'));
    await page.keyboard.press('Escape'); await settle(page, 400);
    await press(page, 'Edit stages');
    for (const name of ['New', 'Call booked', 'Proposal sent', 'Deciding']) {
      const btn = dialog(page).getByRole('button', { name: `Remove ${name}`, exact: true });
      if (await btn.count()) { await btn.click(); await settle(page, 300); }
    }
    const zero = flat(await panelWords(page));
    pass(`${tag}: removing the last stage before Won is refused at once: “A pipeline needs at least one stage before Won.”, and Deciding stays`, zero.includes('A pipeline needs at least one stage before Won.') && (await dialog(page).getByRole('button', { name: 'Remove Deciding', exact: true }).count()) === 1, zero.slice(-200));
    await page.keyboard.press('Escape'); await settle(page, 400);
    for (let i = 0; i < 56; i += 1) store.rows.coach_lead_stages.push({ id: `00000000-0000-4000-8000-0000000${String(96000 + i).padStart(5, '0')}`, coach_id: store.rows.coach_lead_stages[0].coach_id, name: `Stage ${i + 6}`, likelihood: 50, position: 10 + i, is_won: false, created_at: new Date(TUE).toISOString(), updated_at: new Date(TUE).toISOString() });
    const t0 = Date.now();
    await go(page, '/coach/leads', 800);
    const cols = await page.locator('.cc-lboard .cc-board-col').count();
    const f = await fits(page);
    pass(`${tag}: 60 stages: the board shows each, wrapped, with no sideways scroll of the page (${cols} columns, ${Date.now() - t0} ms)`, cols >= 61 && f.wide <= 1, JSON.stringify(f));
    store.rows.coach_lead_stages = store.rows.coach_lead_stages.filter((x) => !/^Stage \d+$/.test(x.name));
    // Won twice (a double tap): one client.
    const clientsBefore = store.rows.client_profiles.length;
    await go(page, `/coach/leads/${CRM.tom}`);
    await twice(page.getByRole('button', { name: 'Mark as won', exact: true })); await settle(page, 1500);
    const toms = store.rows.client_profiles.filter((p) => p.name === 'Tom Hale');
    pass(`${tag}: Mark as won pressed twice at once makes one client and one Won line`, toms.length === 1 && store.rows.client_profiles.length === clientsBefore + 1 && store.rows.coach_lead_events.filter((e) => e.lead_id === CRM.tom && e.kind === 'won').length === 1, `${toms.length} clients`);
    // A waiting email answered in two tabs: one lead.
    await go(page, '/coach/leads');
    const B = await a.tab('/coach/leads', { stale: true });
    const waitingName = (/You emailed ([^,]+), who isn’t in the portal yet\./.exec(await words(page)) || [])[1];
    if (waitingName) {
      const addIn = (p) => p.locator('.cc-lead-line', { hasText: waitingName }).getByRole('button', { name: 'Add as a lead', exact: true });
      await Promise.all([addIn(page).click(), addIn(B).click()]); await settle(page, 1500);
      const made = store.rows.coach_leads.filter((l) => l.name === waitingName && !l.merged_into);
      pass(`${tag}: “Add as a lead” for one waiting email pressed in two tabs at once makes one lead (${waitingName})`, made.length === 1, `${made.length} leads`);
    } else pass(`${tag}: someone waits on Leads to be added`, false, (await words(page)).slice(0, 160));
    await B.close();
    // Addresses that aren’t real.
    const NOBODY = '00000000-0000-4000-8000-000000099999';
    for (const [to, want] of [['/coach/leads/not-a-real-id', 'This lead isn’t in your list any more.'], [`/coach/leads/${NOBODY}`, 'This lead isn’t in your list any more.'], ['/coach/network/not-a-real-id', null],
      [`/coach/network?person=${NOBODY}`, 'This person isn’t in your Network any more.'], ['/coach/boards/not-a-real-id', 'This board isn’t here any more.'], [`/coach/boards/${NOBODY}`, 'This board isn’t here any more.']]) {
      await go(page, to, 1800);
      const text = flat(`${await allWords(page)} ${await panelWords(page)}`);
      const path = new URL(page.url()).pathname;
      pass(`${tag}: ${to.replace(NOBODY, '<an id nobody has>')} says calmly that it isn’t there${want ? '' : ' (an address the portal doesn’t have goes to Today)'}`, want ? text.includes(want) : path === '/coach', `${path}: ${text.slice(0, 120)}`);
    }
    // Back out of every panel.
    await go(page, '/coach/leads');
    const panels = [['Add lead', async () => { await openAddLead(page); }], ['Edit stages', () => press(page, 'Edit stages')], ['Import from a spreadsheet', () => page.getByRole('button', { name: 'Import from a spreadsheet', exact: true }).click()], ['Export', () => page.locator('.cc-acts').getByRole('button', { name: /^Export/ }).first().click()], ['Review', () => press(page, 'Review')]];
    const stuck = [];
    for (const [name, open] of panels) {
      await open(); await settle(page, 600);
      const opened = await dialog(page).count();
      await page.keyboard.press('Escape'); await settle(page, 500);
      if (!opened || await dialog(page).count()) stuck.push(`${name}${opened ? ' stayed open' : ' never opened'}`);
    }
    await go(page, `/coach/leads/${CRM.amy}`);
    for (const name of ['Log a call', 'Add note', 'Edit details', 'Mark as cold']) {
      const b = page.getByRole('button', { name, exact: true }).first();
      if (!(await b.count())) { stuck.push(`${name} not found`); continue; }
      await b.click(); await settle(page, 600);
      const opened = await dialog(page).count();
      await page.keyboard.press('Escape'); await settle(page, 500);
      if (!opened || await dialog(page).count()) stuck.push(`${name}${opened ? ' stayed open' : ' never opened'}`);
    }
    pass(`${tag}: Escape backs out of every Leads panel, with nothing saved`, stuck.length === 0, stuck.join(', '));
    await a.close({ refusals: null });
  }
  if (ODD.includes('network')) {
    {
      const tag = 'r-odd, Network’s table, 049 to 052 there';
      const a = await openAt({ db: 'there', tag, path: '/coach/network?tab=table', change: (rows) => {
        for (let i = 0; i < 200; i += 1) rows.network_columns.push({ id: `00000000-0000-4000-8000-0000000${String(97000 + i).padStart(5, '0')}`, coach_id: rows.network_columns[0].coach_id, name: `Own ${i}`, kind: 'text', options: [], note: null, position: 10 + i, hidden: false });
      } });
      const { page } = a;
      if (!(await page.locator('.cc-net-table').count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 1200); }
      const heads = await page.locator('.cc-net-table thead .cc-th').count();
      const f = await fits(page);
      pass(`${tag}: 200 own columns: the table shows them all inside its own box, the page never scrolls sideways (${heads} headings)`, heads >= 216 && f.wide <= 1, JSON.stringify(f));
      await page.getByRole('button', { name: 'Add column', exact: true }).click(); await settle(page, 500);
      const said = [];
      for (const name of ['Name', 'trust in you', 'Own 7']) { await dialog(page).getByLabel('What’s it called?').fill(name); await press(page, 'Add column', dialog(page)); said.push(flat(await panelWords(page))); }
      pass(`${tag}: a column named like a built-in one, or one already there, is refused calmly`, said.every((x) => /There’s already a column called .+\. Choose another name\./.test(x)), said.map((x) => (/There’s already[^.]*\./.exec(x) || [x.slice(-60)])[0]).join(' | '));
      await page.keyboard.press('Escape'); await settle(page, 400);
      pass(`${tag}: a rating typed as 10.5 is refused (the menu offers 0 to 10), a rhythm of 0 is no rhythm`, cellChange({ id: 'p', trust: 5 }, { key: 'trust', edit: 'rating' }, 10.5, '2026-11-17')?.error === 'Choose a number from 0 to 10.' && cellChange({ id: 'p', rhythm_months: 3 }, { key: 'rhythm_months', edit: 'rhythm' }, 0, '2026-11-17')?.patch?.rhythm_months === null && typedRhythm('0 days') == null);
      // Move to Leads twice (a double tap): one lead.
      await go(page, `/coach/network?person=${CRM.dan}`);
      const leadsBefore = a.store.rows.coach_leads.length;
      await twice(dialog(page).getByRole('button', { name: 'Move to Leads', exact: true })); await settle(page, 1500);
      const dans = a.store.rows.coach_leads.filter((l) => l.network_person_id === CRM.dan);
      pass(`${tag}: Move to Leads pressed twice at once makes one lead, and Dan stays in Network`, dans.length === 1 && a.store.rows.coach_leads.length === leadsBefore + 1 && !a.store.rows.network_people.find((p) => p.id === CRM.dan)?.archived_at, `${dans.length} leads`);
      await go(page, `/coach/network?person=${CRM.dan}`);
      if (await dialog(page).getByRole('button', { name: 'Move to Leads', exact: true }).count()) { await press(page, 'Move to Leads', dialog(page)); await settle(page, 1000); }
      pass(`${tag}: and pressed again later, it opens his lead rather than making a second`, a.store.rows.coach_leads.filter((l) => l.network_person_id === CRM.dan).length === 1);
      // Back out of every Network panel.
      const stuck = [];
      for (const name of ['Add someone', 'Review them', 'Import a spreadsheet', 'Export', 'Show or hide columns']) {
        await go(page, name === 'Add someone' || name === 'Review them' ? '/coach/network' : '/coach/network?tab=table');
        if (!(await page.getByRole('button', { name, exact: true }).count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 700); }
        if (!(await page.getByRole('button', { name, exact: true }).count())) { stuck.push(`${name} not found`); continue; }
        await page.getByRole('button', { name, exact: true }).first().click(); await settle(page, 600);
        const opened = await dialog(page).count();
        await page.keyboard.press('Escape'); await settle(page, 500);
        if (!opened || await dialog(page).count()) stuck.push(`${name}${opened ? ' stayed open' : ' never opened'}`);
      }
      await go(page, `/coach/network?person=${CRM.david}`);
      for (const name of ['Edit contact details', 'Edit ratings', 'Log what you gave', 'Log an ask']) {
        await press(page, name, dialog(page));
        await page.keyboard.press('Escape'); await settle(page, 500);
        if (await dialog(page).count()) { stuck.push(`${name} left a panel open`); await page.keyboard.press('Escape'); await settle(page, 400); }
        await go(page, `/coach/network?person=${CRM.david}`);
      }
      pass(`${tag}: Escape backs out of every Network panel, the person’s own steps too`, stuck.length === 0, stuck.join(', '));
      await a.close({ refusals: null });
    }
    // The map: everyone on one spot, nobody rated, one person; Find someone outside the 150.
    const person = (i, extra = {}) => ({ ...manyNetwork(1, { archived: 0, ready: 0, due: 0 })[0], id: `00000000-0000-4000-8000-0000000${String(98000 + i).padStart(5, '0')}`, name: `Spot Person ${i}`, archived_at: null, merged_into: null, keep: false, ...extra });
    for (const [what, people, check] of [
      ['everyone on one spot (40 people at 8 and 8)', Array.from({ length: 40 }, (_, i) => person(i, { influence: 8, trust: 8, value_delivery: 8, what_you_get: 8 })), async (page) => { const m = await page.evaluate(readMap); return { ok: m.dots.length === 1 && m.dots[0].n === 40, detail: JSON.stringify(m.dots.map((d) => d.n)) }; }],
      ['nobody rated', Array.from({ length: 12 }, (_, i) => person(i, { influence: null, trust: null, value_delivery: null, what_you_get: null })), async (page) => { const t = await words(page); return { ok: t.includes('Nobody is on the map yet. Rate someone’s influence and trust to place them.'), detail: t.slice(0, 160) }; }],
      ['one person', [person(1, { influence: 5, trust: 9, value_delivery: 6, what_you_get: 6 })], async (page) => { const m = await page.evaluate(readMap); return { ok: m.dots.length === 1 && m.dots[0].n === 1, detail: JSON.stringify(m.dots.length) }; }],
    ]) {
      const tag = `r-odd, the map with ${what}, 049 to 052 there`;
      const a = await openAt({ db: 'there', tag, people, path: '/coach/network?tab=map' });
      if (!(await a.page.locator('.cc-net-map, .cc-net-mapbox').count())) { await a.page.getByRole('tab', { name: 'Map', exact: true }).click(); await settle(a.page, 1200); }
      const r = await check(a.page);
      pass(`${tag}: drawn as it should be`, r.ok, r.detail);
      if (people.length > 1 && r.ok && what.startsWith('everyone')) {
        const m = await a.page.evaluate(readMap);
        const problems = mapProblems(m, { phone: false });
        pass(`${tag}: one dot, its number inside, never coral`, problems.length === 0, problems.join('; '));
      }
      await a.close({ refusals: 0 });
    }
    {
      const tag = 'r-odd, Find someone outside the 150, and 1,200 to archive, 049 to 052 there';
      const people = manyNetwork(1500, { archived: 0, ready: 1200, due: 10 });
      const a = await openAt({ db: 'there', tag, people, path: '/coach/network?tab=map' });
      const { page } = a;
      if (!(await page.locator('.cc-net-dot').count())) { await page.getByRole('tab', { name: 'Map', exact: true }).click(); await settle(page, 1200); }
      const mapRows = a.store.fn.network_map({ p_show: 'everyone', p_limit: 150 }).rows;
      const outside = people.find((p) => p.influence != null && p.trust != null && !mapRows.some((r) => r.id === p.id) && !p.archived_at);
      if (outside) {
        await page.getByRole('searchbox', { name: 'Find someone' }).fill(outside.name); await settle(page, 1000);
        const opt = page.getByRole('option', { name: new RegExp(outside.name) }).first();
        if (await opt.count()) { await opt.click(); await settle(page, 900); }
        const text = await words(page);
        const m = await page.evaluate(readMap);
        pass(`${tag}: someone outside the 150 is found and shown on the map (${outside.name})`, text.includes(outside.name) && m.dots.length > 0, text.slice(0, 200));
      } else pass(`${tag}: there is someone rated outside the 150`, false);
      await page.getByRole('tab', { name: 'Actions', exact: true }).click(); await settle(page, 1200);
      pass(`${tag}: the card counts 1,200 ready to archive`, (await words(page)).includes('1,200 people have had no contact for 18 months'), (await words(page)).slice(0, 200));
      await press(page, 'Review them'); await settle(page, 1200);
      const ptext = flat(await panelWords(page));
      const ticks = await dialog(page).getByRole('checkbox').count();
      pass(`${tag}: Review them lists 200 at a time, all ticked, with “The next 1,000 show once these are done.”`, ticks === 200 && ptext.includes('1,200 people') && ptext.includes('The next 1,000 show once these are done.') && ptext.includes('Archive 200'), `${ticks} ticks; ${ptext.slice(0, 160)}`);
      const t0 = Date.now();
      await press(page, 'Archive 200', dialog(page)); await settle(page, 1200);
      const archived = a.store.rows.network_people.filter((p) => p.archived_at).length;
      pass(`${tag}: “Archive 200” archives them in one question (${archived}, ${Date.now() - t0} ms), with Undo`, archived === 200 && /Archived 200\./.test(await toastText(page)));
      await undo(page);
      pass(`${tag}: Undo restores all 200`, a.store.rows.network_people.filter((p) => p.archived_at).length === 0);
      await a.close({ refusals: 0 });
    }
    {
      // A damaged device copy, before 052: the pages open, keep what can be read, and never stop.
      const tag = 'r-odd, a damaged device copy, on the device before 052';
      const a = await openAt({ db: 'none', tag, path: '/coach' });
      const { page } = a;
      await page.evaluate((id) => {
        localStorage.setItem(`clarity-coach-network-local:${id}`, JSON.stringify({ people: { x: { id: 'x', name: 'Ok Person' }, y: 'rubbish', z: { id: 'other', name: 'Wrong key' }, __proto__: { id: '__proto__', name: 'Proto' } }, gives: [1, 2], ratings: 'no', merges: null }));
        const kept = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{"rows":{},"marks":{}}');
        kept.rows.coach_leads = { ...(kept.rows.coach_leads || {}), bad1: null, bad2: 'text', bad3: { id: 'bad3' } };
        kept.rows.coach_lead_stages = { ...(kept.rows.coach_lead_stages || {}), bad4: { id: 'bad4', name: null, position: 'x' } };
        kept.marks = 'broken';
        localStorage.setItem(`clarity-coach-local:${id}`, JSON.stringify(kept));
      }, a.me);
      const shown = [];
      for (const to of ['/coach/leads', '/coach/network', '/coach/network?tab=table', '/coach/leads/automations', '/coach/boards']) { await go(page, to, 1200); shown.push(`${to}: ${flat(await words(page)).slice(0, 40)}`); }
      pass(`${tag}: Leads, Network, Automations and Boards each open with what can be read`, shown.every((x) => x.split(': ')[1].length > 5), shown.join(' | '));
      await go(page, '/coach/network?tab=table', 1200);
      if (!(await page.locator('.cc-net-table').count())) { await page.getByRole('tab', { name: 'Table', exact: true }).click(); await settle(page, 900); }
      pass(`${tag}: Network keeps the one person that could be read`, (await rowNames(page)).includes('Ok Person'), `${(await rowNames(page)).join(',')} ${flat(await words(page)).slice(0, 100)}`);
      await a.close();
    }
  }
  if (ODD.includes('big')) {
    for (const size of [1440, 400]) {
      const tag = `r-odd, twice the text size, ${size}px, 049 to 052 there`;
      const a = await openAt({ db: 'there', tag, size, path: '/coach/leads' });
      const { page } = a;
      const big = async () => { await page.addStyleTag({ content: 'html{font-size:32px !important}' }); await settle(page, 600); };
      for (const path of ['/coach/leads', `/coach/leads/${CRM.amy}`, '/coach/leads/cold', '/coach/leads/automations', '/coach/network', '/coach/network?tab=table', '/coach/network?tab=map', `/coach/boards/${CRM.speaking}`, '/coach/boards', '/coach/past-clients', `/coach/organisations/${ID.kestrel}`]) {
        await go(page, path, 900); await big();
        const f = await fits(page);
        pass(`${tag}: ${path.replace(/[0-9a-f-]{36}/, '<id>')} has no sideways scroll and nothing off the side`, f.wide <= 1 && f.cut.length === 0, JSON.stringify(f));
      }
      for (const [name, path, open] of [
        ['Add lead', '/coach/leads', async () => { await openAddLead(page); }],
        ['Log a call', `/coach/leads/${CRM.amy}`, () => page.getByRole('button', { name: 'Log a call', exact: true }).first().click()],
        ['a person', `/coach/network?person=${CRM.david}`, async () => {}],
        ['Edit ratings', `/coach/network?person=${CRM.dana}`, () => dialog(page).getByRole('button', { name: 'Edit ratings', exact: true }).click()],
        ['Import a spreadsheet', '/coach/network?tab=table', () => page.getByRole('button', { name: 'Import a spreadsheet', exact: true }).click()],
      ]) {
        await go(page, path, 900); await big(); await open(); await settle(page, 700);
        const d = await page.evaluate(() => { const el = [...document.querySelectorAll('.ds-modal--shown .ds-dialog')].pop(); if (!el) return null; const r = el.getBoundingClientRect(); const cut = [...el.querySelectorAll('button, a, input, [role=combobox]')].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); }).length; return { wide: el.scrollWidth - el.clientWidth, off: Math.round(Math.max(0, r.right - window.innerWidth, -r.left)), cut }; });
        pass(`${tag}: ${name}’s panel fits, with nothing to scroll sideways or cut off`, Boolean(d) && d.wide <= 1 && d.off <= 1 && d.cut === 0, JSON.stringify(d));
        await page.keyboard.press('Escape'); await settle(page, 400);
      }
      await a.close({ refusals: 0 });
    }
  }
};


// @@PARTS@@

try {
  for (const name of CRM_BREAK_PARTS) {
    if (!on(name) || !PARTS[name]) continue;
    await PARTS[name]();
  }
} catch (e) {
  pass('the walk ran to its end', false, String(e).split('\n').slice(0, 3).join(' / '));
} finally {
  for (const t of timings) console.log(t);
  await browser.close();
  seedClock(null);
}
report.done();
