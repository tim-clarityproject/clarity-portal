// Phase 4 step 1: the navigation (mock-up M3) in the running app, signed in
// as the invented test client on the TEST database only (every other host
// and every email call is blocked).
//
//   MOCKUPS=<folder with m3-hub-pages.html> node --import ./tests/scores/register.mjs tests/phase4/nav.mjs [folder]
//
// 1. The laptop's menu (Polish 1, Stage B, "Frame and menu"; replaces the
//    slim panel of 9 Nov): the frame's column, always in view, its items in
//    their groups, Breathe, My Account, Sign out and Privacy at the foot,
//    the page you're on in the text colour at 500, every item opening its
//    route, and the keyboard (its links take focus, Enter opens).
// 2. Hub pages: every tile opens its tool's route (After-action review with
//    its state), each ⓘ starts with one full sentence saying what the area
//    is, and nothing unbuilt or removed has a tile.
// 3. Old section routes redirect to their hub, keeping the query, the hash
//    and the state; signed out they land on sign-in.
// 4. Pins: up to 3, saved to the account at once, shown at the top of the
//    menu, kept across a reload and on a second device, the 4th greyed out
//    and untickable, and a pin made offline is sent once the connection is
//    back.
// 5. The phone at 390px and 360px (Polish 1, "Frame and menu"; the phone bar
//    and its tile menu are gone): the header's crosshair, 44px, opens the
//    frame's menu (Home, pins, the areas, the foot), no sideways scrolling,
//    each item opening its route, Escape and the × closing it.
// 6. Measured against M3 at desktop and phone, dark and light (the mock-up
//    opened as a page, with the real fonts; nothing in it is run but its
//    own drawing). Known, approved differences are listed as NOTE.
//
// The clock is fixed (tests/phase2/fixed-day.mjs) and nothing is seeded:
// only the person's pins change, and they are put back at the end.
import { accountsText, TEST_HOST as TARGET_HOST } from '../target.mjs';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fixClock } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = TARGET_HOST;
const TEST_HOST = TARGET_HOST;
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-4');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
// The portal's DM Sans (Phase 8a follow-up, 17 Nov): the variable font with optical sizes Google Fonts serves,
// self-hosted; the mock-up is given the same file for both weights, so both sides measure one font.
const DM_SANS_FILE = join(process.cwd(), 'node_modules', '@fontsource-variable', 'dm-sans', 'files', 'dm-sans-latin-opsz-normal.woff2');
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(String(n));

const results = [];
const notes = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};

const env = {};
for (const line of accountsText().split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = signIn.user.id;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return v;
}

// ---------------------------------------------------------------- the pins on the account
async function readPrefs() {
  const { data, error } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
  if (error) throw error;
  return data?.[0] ? (data[0].page_preferences || {}) : null;
}
const original = await readPrefs();
async function setPins(pins) {
  const prefs = { ...(original || {}), menu_pins: pins };
  if (original) {
    const { error } = await db.from('person_settings').update({ page_preferences: prefs }).eq('user_id', me);
    if (error) throw error;
  } else {
    const { error } = await db.from('person_settings').upsert({ user_id: me, page_preferences: prefs }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}
async function restore() {
  const prefs = { ...(original || {}) };
  if (!original || !('menu_pins' in original)) delete prefs.menu_pins;
  await db.from('person_settings').update({ page_preferences: prefs }).eq('user_id', me);
}
const savedPins = async () => (await readPrefs())?.menu_pins || [];
const samePins = (a, b) => JSON.stringify(a) === JSON.stringify(b);
await setPins([]);

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function newContext({ width, mode, height }) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: height || (phone ? 844 : 900) },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await fixClock(context);
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page };
}

async function signedIn(opts) {
  const c = await newContext(opts);
  await c.page.goto(`${APP}/auth/login`);
  await c.page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await c.page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await c.page.keyboard.press('Enter');
  await c.page.waitForURL(/welcome/, { timeout: 30000 });
  return c;
}

const path = (page) => new URL(page.url()).pathname;
const landsOn = (page, want, ms = 20000) => until(async () => path(page) === want, ms);
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
}
async function pushRoute(page, to, state) {
  await page.evaluate(({ to: t, state: s }) => {
    window.history.pushState({ usr: s, key: `t${Date.now()}`, idx: (window.history.state?.idx ?? 0) + 1 }, '', t);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, { to, state });
}
async function goHub(page, to) {
  await page.goto(`${APP}${to}`);
  await page.waitForSelector('.ds-hub-page .ds-page-title', { timeout: 30000 });
}
const menuButton = (page) => page.getByRole('button', { name: 'Menu', exact: true });
async function openDesktopMenu(page) {
  await menuButton(page).click();
  await page.waitForSelector('#site-menu .ds-dmenu-area', { timeout: 5000 });
  await until(async () => (await page.locator('.ds-dmenu').evaluate((el) => getComputedStyle(el).opacity)) === '1', 3000);
}
async function openPhoneMenu(page) {
  await page.locator('.ds-bar-menu').click();
  await page.waitForSelector('#site-tile-menu .ds-tmenu-tile', { timeout: 5000 });
  await until(async () => (await page.locator('.ds-tmenu').evaluate((el) => getComputedStyle(el).opacity)) === '1', 3000);
}
async function pageReady(page) {
  return until(async () => (await page.locator('h1, h2').count()) > 0, 20000);
}

// What M3 says, and what may not appear (brief: no tile for tools not built
// yet, Points of leverage removed).
// The desktop menu's rows (option A, the slim panel) and where each goes.
const MENU_ROWS = [
  ['Home', '/welcome'],
  ['Dashboard', '/dashboard'],
  ['Plan', '/personal/plan'],
  ['Reset', '/personal/reset'],
  ['Review', '/personal/review'],
  ['Interpersonal', '/interpersonal'],
  ['Strategic', '/strategic'],
  ['My Account', '/my-account'],
];
const AREAS = [
  ['Home', '/welcome'],
  ['Personal', '/personal'],
  ['Interpersonal', '/interpersonal'],
  ['Strategic', '/strategic'],
  ['My Account', '/my-account'],
];
// The Monthly Hardware and Software review joined Review in Phase 5 step 1.
const HUB_TILES = {
  '/personal': [['Dashboard', '/dashboard'], ['Plan', '/personal/plan'], ['Reset', '/personal/reset'], ['Review', '/personal/review']],
  '/personal/plan': [['Individual Performance Plan', '/performance-plan'], ['Performance Sprint', '/performance-sprint'], ['Daily plan', '/daily-plan'], ['Travel plan', '/travel-plan'], ['Get unstuck', '/get-unstuck'], ['Pre-mortem', '/pre-mortem'], ['Time audit', '/time-audit']],
  '/personal/reset': [['Breathe', '/breathe'], ['Sleep wind down', '/sleep-wind-down'], ['Pressure plan', '/pressure-plan'], ['Emotional wash', '/emotional-wash'], ['Journal', '/daily-journal']],
  '/personal/review': [['Daily review', '/daily-review'], ['Weekly performance debrief', '/performance-sprint/debrief'], ['After-action review', '/my-journal'], ['Life balance review', '/life-balance-review'], ['Monthly Hardware and Software review', '/monthly-review']],
  // The Team performance check joined in Phase 8a step 3 (M10), under "Your people" (Draft 5, Stage D item 5).
  '/interpersonal': [['Meeting planner', '/plan-meeting'], ['Give difficult feedback', '/give-difficult-feedback'], ['Team performance check', '/team-performance-check']],
  // The Health Check inside the portal (M7): one address for its teams and versions.
  '/strategic': [['Strategic Alignment Health Check', '/strategic-alignment']],
};
const HUB_TITLES = { '/personal': 'Personal', '/personal/plan': 'Plan', '/personal/reset': 'Reset', '/personal/review': 'Review', '/interpersonal': 'Interpersonal', '/strategic': 'Strategic' };
const NOT_BUILT = ['Find my sweet spot', 'Deliberate vs default', 'Travel and jet lag plan', 'Delegation audit', 'Identity beyond the role', 'Above or below the line', 'Stay deliberate under pressure', 'Confidence Bank', 'Prepare for a difficult conversation', 'Prepare for a pitch', 'Map my stakeholders', 'Map my team', 'Understand their sweet spot', 'Decide who decides', 'Strategy on a page', 'Points of leverage', 'Pre-mortem for an initiative'];
const MOVED = [
  ['/plan-section', '/personal/plan'],
  ['/planning-tools', '/personal/plan'],
  ['/decide-section', '/personal/plan'],
  ['/decision-tools', '/personal/plan'],
  ['/ground-section', '/personal/reset'],
  ['/review-section', '/personal/review'],
  ['/account-section', '/my-account'],
  ['/points-of-leverage', '/strategic'],
];

// ---------------------------------------------------------------- 1 to 3: desktop
if (part(1) || part(2) || part(3)) {
  const c = await signedIn({ width: 1280, mode: 'dark' });
  const { page } = c;
  try {
    if (part(1)) {
      // Polish 1, Stage B ("Frame and menu"; the 25 Nov reference): on a laptop the menu is the frame's column, always in
      // view, plain grey words with the page you're on in the text colour at 500, groups by gaps, Breathe, My Account,
      // Sign out (a real button) and Privacy at the foot. There is no Menu button, panel or open state to test any more.
      await goHub(page, '/personal/plan');
      await shot(page, 'desktop-menu-dark');
      const side = page.locator('.ds-frame-side');
      pass('frame menu: the menu column is in view on a laptop, with no Menu button', await side.isVisible() && (await menuButton(page).count()) === 0);
      const groups = await side.locator('.ds-mgroup').evaluateAll((gs) => gs.map((g) => [...g.querySelectorAll('.ds-mi')].map((a) => a.textContent.trim())));
      pass('frame menu: Home, then Dashboard, Plan, Reset, Review, then Interpersonal and Strategic, in groups', JSON.stringify(groups) === JSON.stringify([['Home'], ['Dashboard', 'Plan', 'Reset', 'Review'], ['Interpersonal', 'Strategic']]), JSON.stringify(groups));
      const foot = (await side.locator('.ds-mfoot .ds-mi, .ds-mfoot .ds-mlegal').allInnerTexts()).map((t) => t.trim());
      pass('frame menu: Breathe, My Account, Sign out and Privacy at the foot', JSON.stringify(foot) === JSON.stringify(['Breathe', 'My Account', 'Sign out', 'Privacy']), foot.join(', '));
      pass('frame menu: Sign out is a real button, the rest are links', (await side.locator('button.ds-mi--out').count()) === 1 && (await side.locator('.ds-mgroup .ds-mi').evaluateAll((as) => as.every((a) => a.tagName === 'A' && a.getAttribute('href')))));
      pass('frame menu: no counts and no coral button', (await side.locator('.ds-mi-n').count()) === 0 && (await side.locator('.ds-btn').count()) === 0);
      const cur = await side.locator('.ds-mi[aria-current="page"]').allInnerTexts();
      pass('frame menu: on the Plan hub, Plan is the page you’re on', cur.length === 1 && cur[0].trim() === 'Plan', cur.join(','));
      const look = await side.evaluate((el) => {
        const one = (a) => { const c = getComputedStyle(a); return { color: c.color, fw: c.fontWeight, ff: c.fontFamily.split(',')[0].replace(/["']/g, ''), h: a.getBoundingClientRect().height }; };
        const rest = el.querySelector('.ds-mgroup .ds-mi:not([aria-current])');
        const on = el.querySelector('.ds-mi[aria-current="page"]');
        const ui = getComputedStyle(el.closest('.ui-root'));
        // Each item's tap area: its box, or the invisible ::after laid round it (frame.css: 44px round a 40px item).
        const tap = (a) => { const r = a.getBoundingClientRect(); const af = getComputedStyle(a, '::after'); return af.content !== 'none' && af.position === 'absolute' ? Math.max(r.height, parseFloat(af.height) || 0) : r.height; };
        return { rest: one(rest), on: one(on), text: ui.getPropertyValue('--text').trim(), grey: ui.getPropertyValue('--text-2').trim(), heights: [...el.querySelectorAll('.ds-mi')].map(tap) };
      });
      pass('frame menu: DM Sans, the page you’re on at 500 and the others at 400', look.rest.ff === 'DM Sans' && look.on.fw === '500' && look.rest.fw === '400', JSON.stringify(look));
      pass('frame menu: the others in grey, the page you’re on in the text colour', look.rest.color !== look.on.color, JSON.stringify([look.rest.color, look.on.color]));
      pass('frame menu: every item a 44px tap area', look.heights.every((h) => h >= 43.5), look.heights.join(','));

      for (const [name, want] of MENU_ROWS) {
        await goHub(page, want === '/strategic' ? '/personal' : '/strategic');
        await side.locator('.ds-mi', { hasText: new RegExp(`^${name}$`) }).first().click();
        pass(`frame menu: ${name} opens ${want}`, await landsOn(page, want), path(page));
        if (want !== '/welcome' && want !== '/my-account') {
          const now = await until(async () => { const t = await side.locator('.ds-mi[aria-current="page"]').allInnerTexts(); return t.length === 1 && t[0].trim() === name ? t : null; }, 5000);
          pass(`frame menu: on ${want}, ${name} is the page you’re on`, Boolean(now), (await side.locator('.ds-mi[aria-current="page"]').allInnerTexts()).join(','));
        }
      }

      // The keyboard: the menu's links are ordinary links, reached with Tab, opened with Enter.
      await goHub(page, '/personal');
      await side.locator('.ds-mi', { hasText: /^Dashboard$/ }).first().focus();
      pass('keyboard: a menu link takes keyboard focus', await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Dashboard'));
      await page.keyboard.press('Enter');
      pass('keyboard: Enter on Dashboard opens it', await landsOn(page, '/dashboard'), path(page));
    }

    if (part(2)) {
      for (const [hub, tiles] of Object.entries(HUB_TILES)) {
        await goHub(page, hub);
        const shown = (await page.locator('.ds-hub-tile .ds-hub-tile-name').allInnerTexts()).map((t) => t.trim().toLowerCase());
        pass(`${hub}: the tiles are ${tiles.map((t) => t[0]).join(', ')}`, samePins(shown, tiles.map((t) => t[0].toLowerCase())), shown.join(', '));
        const text = (await page.locator('.ds-hub-page').innerText()).toLowerCase();
        const unbuilt = NOT_BUILT.filter((n) => text.includes(n.toLowerCase()));
        pass(`${hub}: no tile for a tool not built yet, and none for Points of leverage`, unbuilt.length === 0, unbuilt.join(', '));
        // No ⓘ on hub pages (Tim, 5 Nov, declutter).
        pass(`${hub}: no ⓘ beside the title`, (await page.locator('.ds-page-info-toggle').count()) === 0);
        pass(`${hub}: "Pin tools to my menu" ${hub === '/personal' ? 'is not on Personal' : 'is at the foot'}`, (await page.getByRole('button', { name: 'Pin tools to my menu' }).count()) === (hub === '/personal' ? 0 : 1));
        if (hub === '/personal/plan' || hub === '/personal') await shot(page, `hub${hub.replace(/\//g, '-')}-dark`);
        for (const [name, want] of tiles) {
          await goHub(page, hub);
          await page.locator('.ds-hub-tile', { hasText: name }).first().click();
          const landed = await landsOn(page, want);
          pass(`${hub}: ${name} opens ${want}`, landed, path(page));
          if (landed) pass(`${name}: its page shows`, await pageReady(page));
          if (name === 'After-action review') {
            const state = await page.evaluate(() => window.history.state?.usr?.reviewType);
            pass('After-action review opens as an after-action review', state === 'after-action', state);
          }
        }
      }
      await goHub(page, '/strategic');
      await page.getByRole('button', { name: 'Add a team' }).click(); // walk item 4: the card's square, named by what it adds
      // A new team's first question (M7), at its own version's address.
      pass('/strategic: Start a new Health Check opens a new team', await until(async () => /^\/strategic-alignment\/version\/[0-9a-f-]{36}$/.test(path(page)), 20000), path(page));
      pass('/strategic: the inside Health Check opens as a fresh start', await until(async () => (await page.locator('.ds-guide-question').innerText().catch(() => '')).includes('Which team is this Health Check for?'), 15000));
      await page.locator('.ds-guide-close').click();
      await goHub(page, '/personal/review');
      pass('desktop: no back link on a hub (M3)', !(await page.locator('.ds-hub-back').isVisible()));
    }

    if (part(3)) {
      for (const [from, to] of MOVED) {
        await page.goto(`${APP}${from}?probe=1#here`);
        const ok = await landsOn(page, to);
        const u = new URL(page.url());
        pass(`${from} redirects to ${to}, keeping the query and hash`, ok && u.search === '?probe=1' && u.hash === '#here', `${u.pathname}${u.search}${u.hash}`);
      }
      await goHub(page, '/personal');
      await pushRoute(page, '/review-section', { probe: 42 });
      await landsOn(page, '/personal/review');
      pass('/review-section passes its state on', (await page.evaluate(() => window.history.state?.usr?.probe)) === 42);
      await pushRoute(page, '/decision-tools', { probe: 7 });
      await landsOn(page, '/personal/plan');
      pass('/decision-tools passes its state on', (await page.evaluate(() => window.history.state?.usr?.probe)) === 7);
    }
  } finally {
    await c.context.close();
  }
  if (part(3)) {
    const s = await newContext({ width: 1280, mode: 'dark' });
    for (const route of ['/plan-section', '/personal', '/strategic', '/points-of-leverage']) {
      await s.page.goto(`${APP}${route}`);
      pass(`signed out: ${route} lands on sign-in`, await landsOn(s.page, '/auth/login'), path(s.page));
    }
    await s.context.close();
  }
}

// ---------------------------------------------------------------- 4: pins
if (part(4)) {
  const c = await signedIn({ width: 1280, mode: 'light' });
  const { page, context } = c;
  try {
    await goHub(page, '/personal/review');
    await page.getByRole('button', { name: 'Pin tools to my menu' }).click();
    const panel = page.getByRole('dialog', { name: 'Pin tools' });
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    pass('pins: the panel asks the question and says "Pick up to 3."', (await panel.innerText()).includes('Which tools do you want at the top of your menu?') && (await panel.innerText()).includes('Pick up to 3.'));
    const groups = await panel.locator('.ds-pin-group-title').allInnerTexts();
    pass('pins: grouped Plan, Reset, Review, Interpersonal, Strategic', groups.join(',') === 'Plan,Reset,Review,Interpersonal,Strategic', groups.join(','));
    const box = (name) => panel.getByRole('checkbox', { name, exact: true });
    for (const name of ['Get unstuck', 'Journal', 'Meeting planner']) {
      await box(name).click();
      await until(async () => (await box(name).getAttribute('aria-checked')) === 'true', 3000);
    }
    await shot(page, 'pins-panel-full-light');
    pass('pins: three saved to the account, in the order chosen', await until(async () => samePins(await savedPins(), ['grow', 'journal', 'meet'])), JSON.stringify(await savedPins()));
    pass('pins: once 3 are pinned it says so', /You’ve pinned 3\.\s+Unpin one to pin another\./.test(await panel.innerText()));
    pass('pins: the rest are greyed out', await box('Breathe').isDisabled());
    await box('Breathe').click({ force: true });
    await sleep(600);
    pass('pins: a 4th can’t be ticked', (await box('Breathe').getAttribute('aria-checked')) === 'false' && samePins(await savedPins(), ['grow', 'journal', 'meet']));
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 5000 });

    // Polish 1, Stage B: the pinned tools are the frame menu's own group after Home, by their short names (menuName()).
    const pinGroup = (p) => p.locator('.ds-frame-side .ds-mgroup').nth(1).locator('.ds-mi');
    const menuPins = async (p = page) => (await pinGroup(p).allInnerTexts()).map((t) => t.trim());
    pass('pins: the menu shows them after Home', Boolean(await until(async () => samePins(await menuPins(), ['Get unstuck', 'Journal', 'Meeting planner']), 5000)), (await menuPins()).join(','));
    await shot(page, 'desktop-menu-pinned-light');
    await page.reload();
    await page.waitForSelector('.ds-hub-page', { timeout: 30000 });
    pass('pins: kept after a reload', Boolean(await until(async () => samePins(await menuPins(), ['Get unstuck', 'Journal', 'Meeting planner']), 5000)), (await menuPins()).join(','));
    await pinGroup(page).filter({ hasText: /^Journal$/ }).click();
    pass('pins: a pinned tool opens its page', await landsOn(page, '/daily-journal'), path(page));

    // Another device: nothing on it yet, the pins come from the account.
    const d = await signedIn({ width: 1280, mode: 'dark' });
    await goHub(d.page, '/personal');
    const other = await until(async () => (samePins(await menuPins(d.page), ['Get unstuck', 'Journal', 'Meeting planner']) ? true : null), 15000);
    pass('pins: another device shows the same pins', Boolean(other));
    await d.context.close();

    // Unpin one, then pin one with no connection.
    await goHub(page, '/personal/reset');
    await page.getByRole('button', { name: 'Pin tools to my menu' }).click();
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    await box('Journal').click();
    pass('pins: unpinning saves at once', await until(async () => samePins(await savedPins(), ['grow', 'meet'])), JSON.stringify(await savedPins()));
    pass('pins: with 2 pinned the others can be ticked again', !(await box('Breathe').isDisabled()));
    await context.setOffline(true);
    await box('Breathe').click();
    pass('pins: offline, the tick still shows', await until(async () => (await box('Breathe').getAttribute('aria-checked')) === 'true', 3000));
    await sleep(800);
    pass('pins: offline, nothing reached the account yet', samePins(await savedPins(), ['grow', 'meet']));
    await context.setOffline(false);
    pass('pins: back online, the pin is sent', await until(async () => samePins(await savedPins(), ['grow', 'meet', 'breathe']), 20000), JSON.stringify(await savedPins()));
    await page.keyboard.press('Escape');
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- 5: the phone bar
if (part(5)) {
  // Polish 1, Stage B ("Frame and menu"; the 25 Nov reference; replaces the phone bar and its tile menu): on a phone
  // the header's crosshair opens the frame's menu over the page; there is no phone bar. The menu lists Home, the
  // pinned tools, the areas and the foot as the laptop's column does; Escape, the × or choosing an item closes it.
  await setPins(['meet', 'journal', 'grow']);
  for (const [width, mode] of [[390, 'dark'], [360, 'light']]) {
    const tag = `${width}px ${mode}`;
    const c = await signedIn({ width, mode });
    const { page } = c;
    try {
      await goHub(page, '/personal');
      pass(`${tag}: no phone bar`, (await page.locator('.ds-phone-bar').count()) === 0);
      const cross = page.locator('.hdr-frame .hdr-frame-menu, .ds-frame-phead .ds-mbtn').filter({ visible: true }).first();
      const cb = await cross.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, vw: window.innerWidth }; });
      pass(`${tag}: the header's crosshair opens the menu, a 44px tap area at the left`, cb.w >= 43.5 && cb.h >= 43.5 && cb.left >= 0 && cb.left < cb.vw / 2 && cb.top >= 0, JSON.stringify(cb));
      for (const to of ['/welcome', '/personal', '/personal/plan', '/personal/reset', '/personal/review', '/interpersonal', '/strategic', '/my-account']) {
        await page.goto(`${APP}${to}`);
        await until(async () => (await page.locator('.hdr-frame-menu, .ds-frame-phead .ds-mbtn').count()) > 0, 20000);
        await sleep(400);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        pass(`${tag}: no sideways scrolling on ${to}`, over <= 0, `${over}px`);
      }

      const openMenu = async () => {
        await page.locator('.hdr-frame .hdr-frame-menu, .ds-frame-phead .ds-mbtn').filter({ visible: true }).first().click();
        await page.waitForSelector('#ds-phone-menu .ds-mi', { timeout: 5000 });
      };
      const shut = () => until(async () => (await page.locator('#ds-phone-menu').count()) === 0, 3000);
      await goHub(page, '/personal/plan');
      await openMenu();
      await shot(page, `phone-menu-${width}-${mode}`);
      const menu = page.locator('#ds-phone-menu');
      pass(`${tag}: the crosshair says the menu is open, and is now the thin ×`, (await page.locator('#ds-phone-menu .ds-mbtn').getAttribute('aria-expanded')) === 'true' && (await page.locator('#ds-phone-menu .ds-mbtn .ds-x').count()) === 1);
      const groups = await menu.locator('.ds-mgroup').evaluateAll((gs) => gs.map((g) => [...g.querySelectorAll('.ds-mi')].map((a) => a.textContent.trim())));
      pass(`${tag}: Home first, the pinned tools next, then the areas`, groups[0]?.join(',') === 'Home' && groups[1]?.length === 3 && groups.some((g) => g.join(',') === 'Dashboard,Plan,Reset,Review') && groups.some((g) => g.join(',') === 'Interpersonal,Strategic'), JSON.stringify(groups));
      const foot = (await menu.locator('.ds-mfoot .ds-mi, .ds-mfoot .ds-mlegal').allInnerTexts()).map((t) => t.trim());
      pass(`${tag}: Breathe, My Account, Sign out and Privacy at the foot`, JSON.stringify(foot) === JSON.stringify(['Breathe', 'My Account', 'Sign out', 'Privacy']), foot.join(', '));
      const geo = await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, vw: window.innerWidth, wide: el.scrollWidth - el.clientWidth }; });
      pass(`${tag}: the menu fits the screen`, geo.left >= 0 && geo.right <= geo.vw + 0.5 && geo.wide <= 0, JSON.stringify(geo));
      pass(`${tag}: no counts and no coral button in the menu`, (await menu.locator('.ds-mi-n').count()) === 0 && (await menu.locator('.ds-btn--primary').count()) === 0);
      const cur = await menu.locator('.ds-mi[aria-current="page"]').allInnerTexts();
      pass(`${tag}: Plan is marked as the page you’re on`, cur.map((t) => t.trim()).join(',') === 'Plan', cur.join(','));
      await page.keyboard.press('Escape');
      pass(`${tag}: Escape closes the menu`, await shut());
      await openMenu();
      await page.locator('#ds-phone-menu .ds-mbtn').click();
      pass(`${tag}: the × closes the menu again`, await shut());

      for (const [name, want] of MENU_ROWS) {
        await goHub(page, want === '/strategic' ? '/personal' : '/strategic');
        await openMenu();
        await page.locator('#ds-phone-menu .ds-mi', { hasText: new RegExp(`^${name}$`) }).first().click();
        pass(`${tag}: ${name} opens ${want}, and the menu closes`, (await landsOn(page, want)) && (await shut()), path(page));
      }
      if (width === 390) {
        await goHub(page, '/personal');
        await openMenu();
        pass(`${tag}: the pinned tools show in the phone menu`, (await page.locator('#ds-phone-menu .ds-mgroup').nth(1).locator('.ds-mi').count()) === 3);
        await shot(page, `phone-menu-pinned-${width}-${mode}`);
        await page.keyboard.press('Escape');
      }
      await goHub(page, '/personal/review');
      pass(`${tag}: Personal's hubs have a back link to Personal on phone`, await page.locator('.ds-hub-back').isVisible());
      await page.locator('.ds-hub-back button').click();
      pass(`${tag}: the back link opens /personal`, await landsOn(page, '/personal'), path(page));
      await shot(page, `hub-personal-${width}-${mode}`);
    } finally {
      await c.context.close();
    }
  }
}

// ---------------------------------------------------------------- 6: measured against M3
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;

const MEASURE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    w: r.width, h: r.height, fs: parseFloat(s.fontSize), ls: s.letterSpacing, ff: s.fontFamily.split(',')[0].replace(/["']/g, ''),
    pt: parseFloat(s.paddingTop), pl: parseFloat(s.paddingLeft), radius: parseFloat(s.borderTopLeftRadius), minH: parseFloat(s.minHeight) || 0,
    bg: s.backgroundColor, color: s.color, stroke: s.stroke, tt: s.textTransform, gap: parseFloat(s.columnGap) || 0,
  };
};

// [what, mock selector, app selector, fields, known difference]
const PARTS = {
  desktop: [
    // The desktop menu is measured against option A in part 1 (it replaced M3's menu on 9 Nov).
    ['hub tile', '#dk .page .hub .ht:not(.big)', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big)', ['minH', 'pt', 'radius', 'bg']],
    ['hub tile name', '#dk .page .hub .ht:not(.big) b', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big) .ds-hub-tile-name', ['fs', 'color']],
    ['hub tile line', '#dk .page .hub .ht:not(.big) small', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big) .ds-hub-tile-line', ['fs', 'color']],
    ['hub tile time', '#dk .page .hub .ht:not(.big) .tm', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big) .ds-hub-tile-foot', ['fs', 'color']],
    ['hub grid', '#dk .page .hub', '.ds-hub-grid', ['gap']],
    ['group title', '#dk .page .grp h3', '.ds-hub-group-title', ['fs', 'ff', 'tt']],
    ['page title', '#dk .page h2.t', '.ds-hub-page .ds-page-title', ['fs', 'ff'], 'The shared PageHeader title is 24px on every page (rule 7); M3 drew 28px.'],
  ],
  phone: [
    ['hub tile (phone)', '#ph .page .hub .ht:not(.big)', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big)', ['pt', 'pl', 'radius', 'bg']],
    ['hub tile name (phone)', '#ph .page .hub .ht:not(.big) b', '.ds-hub-grid .ds-hub-tile:not(.ds-hub-tile--big) .ds-hub-tile-name', ['fs']],
  ],
};

function compare(view, mode, what, mock, app, fields, known) {
  if (!mock || !app) {
    pass(`M3 ${view} ${mode}: ${what} found on both sides`, false, `mock ${Boolean(mock)}, app ${Boolean(app)}`);
    return;
  }
  const diffs = fields.filter((f) => (typeof mock[f] === 'number' ? Math.abs(mock[f] - app[f]) > 0.6 : mock[f] !== app[f]))
    .map((f) => `${f} mock ${mock[f]} app ${app[f]}`);
  if (known && diffs.length) {
    notes.push(`NOTE  M3 ${view} ${mode}: ${what}: ${diffs.join('; ')}. ${known}`);
    pass(`M3 ${view} ${mode}: ${what} (known difference noted)`, true);
    return;
  }
  pass(`M3 ${view} ${mode}: ${what} matches (${fields.join(', ')})`, diffs.length === 0, diffs.join('; '));
}

if (part(6)) {
  const file = join(MOCKS, 'm3-hub-pages.html');
  if (!existsSync(file)) {
    pass('M3 found', false, file);
  } else {
    for (const mode of ['dark', 'light']) {
      // The mock-up's frames.
      const mp = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
      await mp.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
      await mp.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
        const w = /500/.test(r.request().url()) ? 500 : 400;
        r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(DM_SANS_FILE) });
      });
      await mp.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
      await mp.goto(`file://${file}`);
      await mp.evaluate(() => document.fonts.ready);
      await mp.click(`button[data-m="${mode === 'dark' ? 1 : 0}"]`);
      await mp.click('button[data-k="plan"]');
      const mockHub = {};
      for (const [what, ms] of [...PARTS.desktop, ...PARTS.phone].map((p) => [p[0], p[1]])) mockHub[what] = await mp.evaluate(MEASURE, ms);
      await mp.click('button[data-om]');
      await sleep(900);
      for (const [what, ms] of [...PARTS.desktop, ...PARTS.phone].map((p) => [p[0], p[1]])) if (!mockHub[what] || /menu|Log today/.test(what)) mockHub[what] = await mp.evaluate(MEASURE, ms);
      await mp.close();

      // The app: desktop at 1280, phone at 360.
      const dk = await signedIn({ width: 1280, mode });
      await goHub(dk.page, '/personal/plan');
      const appDesk = {};
      for (const [what, , as] of PARTS.desktop) if (!/menu|Log today/.test(what)) appDesk[what] = await dk.page.evaluate(MEASURE, as);
      // No menu to open on a laptop (Polish 1, Stage B: the frame's column), and no M3 menu rows are measured.
      for (const [what, , , fields, known] of PARTS.desktop) compare('desktop', mode, what, mockHub[what], appDesk[what], fields, known);
      await dk.context.close();

      const ph = await signedIn({ width: 360, mode, height: 780 });
      await goHub(ph.page, '/personal/plan');
      const appPhone = {};
      for (const [what, , as] of PARTS.phone) if (!/menu tile/.test(what)) appPhone[what] = await ph.page.evaluate(MEASURE, as);
      // The phone bar and M3's tile menu are gone (Polish 1, "Frame and menu"): part 5 checks the phone menu.
      for (const [what, , , fields, known] of PARTS.phone) compare('phone', mode, what, mockHub[what], appPhone[what], fields, known);
      await ph.context.close();
    }
  }
}

// ---------------------------------------------------------------- the end
await browser.close();
await restore();
console.log(results.join('\n'));
if (notes.length) console.log(`\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
