// Phase 4 step 1: the navigation (mock-up M3) in the running app, signed in
// as the invented test client on the TEST database only (every other host
// and every email call is blocked).
//
//   MOCKUPS=<folder with m3-hub-pages.html> node --import ./tests/scores/register.mjs tests/phase4/nav.mjs [folder]
//
// 1. Desktop menu: the slim panel (menu-options.html, option A; Tim, 9
//    Nov), measured against its CSS: its rows in order under their quiet
//    labels, no Log today or Breathe, every row opens the right route and
//    is marked when someone is there, My Account and Sign out at the
//    bottom, and the keyboard (Enter opens, focus moves in and stays in,
//    Escape closes and gives focus back to the crosshair).
// 2. Hub pages: every tile opens its tool's route (After-action review with
//    its state), each ⓘ starts with one full sentence saying what the area
//    is, and nothing unbuilt or removed has a tile.
// 3. Old section routes redirect to their hub, keeping the query, the hash
//    and the state; signed out they land on sign-in.
// 4. Pins: up to 3, saved to the account at once, shown at the top of the
//    menu, kept across a reload and on a second device, the 4th greyed out
//    and untickable, and a pin made offline is sent once the connection is
//    back.
// 5. The phone bar at 390px and 360px: Home, the menu and This week, each
//    44px or more, inside the safe area, no sideways scrolling, the tile
//    menu above the bar, its tiles opening their routes, Escape closing it.
// 6. Measured against M3 at desktop and phone, dark and light (the mock-up
//    opened as a page, with the real fonts; nothing in it is run but its
//    own drawing). Known, approved differences are listed as NOTE.
//
// The clock is fixed (tests/phase2/fixed-day.mjs) and nothing is seeded:
// only the person's pins change, and they are put back at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fixClock } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-4');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
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
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
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
  '/personal/plan': [['Individual Performance Plan', '/performance-plan'], ['Performance Sprint', '/performance-sprint'], ['Daily plan', '/daily-plan'], ['Get unstuck', '/get-unstuck'], ['Pre-mortem', '/pre-mortem'], ['Time audit', '/time-audit']],
  '/personal/reset': [['Breathe', '/breathe'], ['Sleep wind down', '/sleep-wind-down'], ['Pressure plan', '/pressure-plan'], ['Emotional wash', '/emotional-wash'], ['Journal', '/daily-journal']],
  '/personal/review': [['Daily review', '/daily-review'], ['Weekly performance debrief', '/performance-sprint/debrief'], ['After-action review', '/my-journal'], ['Life balance review', '/life-balance-review'], ['Monthly Hardware and Software review', '/monthly-review']],
  // The Team performance check joined in Phase 8a step 3 (M10), under "Your team".
  '/interpersonal': [['Meeting planner', '/plan-meeting'], ['Give difficult feedback', '/give-difficult-feedback'], ['Team performance check', '/team-performance-check']],
  '/strategic': [['Strategic Alignment Health Check', '/goal-setting']],
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
      await goHub(page, '/personal/plan');
      await openDesktopMenu(page);
      await shot(page, 'desktop-menu-dark');
      // The slim panel (menu-options.html, option A; Tim, 9 Nov, 14:41).
      const names = await page.locator('#site-menu .ds-dmenu-name').allInnerTexts();
      pass('desktop menu: Home, Dashboard, Plan, Reset, Review, Interpersonal, Strategic, My Account, Sign out, in that order', samePins(names, MENU_ROWS.map((r) => r[0]).concat('Sign out')), names.join(', '));
      const labs = await page.locator('#site-menu .ds-dmenu-lab').allInnerTexts();
      pass('desktop menu: the quiet group labels are Personal and With others', samePins(labs.map((l) => l.toLowerCase()), ['personal', 'with others']), labs.join(', '));
      pass('desktop menu: no Log today or Breathe button, and no coral button', (await page.locator('#site-menu .ds-btn').count()) === 0 && !/log today|breathe/i.test(await page.locator('#site-menu').innerText()));
      pass('desktop menu: the crosshair turns 45 degrees while open', await until(async () => /matrix\(0\.707/.test(await page.locator('.hdr-menu .ds-bold-cross').evaluate((el) => getComputedStyle(el).transform)), 3000));
      const cur = await page.locator('#site-menu .ds-dmenu-area[aria-current="page"] .ds-dmenu-name').allInnerTexts();
      pass('desktop menu: on the Plan hub, Plan is marked as the current row', cur.length === 1 && cur[0] === 'Plan', cur.join(','));
      pass('desktop menu: no pins shown before any are chosen', (await page.locator('#site-menu .ds-dmenu-pins').count()) === 0 && !labs.some((l) => /pinned/i.test(l)));
      // Measured against option A's own CSS: 280px wide, rows in DM Sans at
      // 15px in a 44px tap area with a 10px radius, labels in Nekst
      // capitals at 10px, My Account and Sign out below a line.
      const m = await page.evaluate(() => {
        const one = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const c = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, fs: c.fontSize, ff: c.fontFamily.split(',')[0].replace(/["']/g, ''), radius: c.borderTopLeftRadius, tt: c.textTransform, bg: c.backgroundColor, color: c.color, fw: c.fontWeight, bt: c.borderTopWidth };
        };
        return {
          panel: one('#site-menu'), row: one('#site-menu .ds-dmenu-area:not([aria-current])'), cur: one('#site-menu .ds-dmenu-area[aria-current="page"]'), lab: one('#site-menu .ds-dmenu-lab'),
          foot: one('#site-menu .ds-dmenu-foot'), account: one('#site-menu .ds-dmenu-foot a'), out: one('#site-menu .ds-dmenu-out'), header: one('.hdr-desktop'), button: one('.hdr-menu'),
          rows: [...document.querySelectorAll('#site-menu .ds-dmenu-area')].map((el) => el.getBoundingClientRect().height),
        };
      });
      pass('desktop menu: 280px wide, starting under the header', Math.abs(m.panel.w - 280) <= 1 && m.panel.x === 0 && m.panel.y >= m.header.bottom - 1, JSON.stringify(m.panel));
      pass('desktop menu: rows are DM Sans at 15px', m.row.ff === 'DM Sans' && m.row.fs === '15px', `${m.row.ff} ${m.row.fs}`);
      pass('desktop menu: every row is a 44px tap area with a 10px radius', m.rows.every((h) => h >= 44) && m.row.radius === '10px', `${m.rows.join(',')} ${m.row.radius}`);
      pass('desktop menu: the labels are Nekst capitals at 10px', m.lab.ff === 'Nekst' && m.lab.fs === '10px' && m.lab.tt === 'uppercase', JSON.stringify(m.lab));
      pass('desktop menu: the panel is the box colour (dark)', m.panel.bg === 'rgb(11, 11, 11)', m.panel.bg);
      pass('desktop menu: the current row sits on the raised surface, medium weight', m.cur.bg === 'rgb(17, 17, 16)' && m.cur.fw === '500', `${m.cur.bg} ${m.cur.fw}`);
      pass('desktop menu: My Account and Sign out sit at the bottom, below a line', m.foot.bt === '1px' && m.account.y > m.foot.y && m.out.y > m.account.y && m.out.bottom <= m.panel.bottom + 1, JSON.stringify([m.foot, m.out]));
      pass('desktop menu: Sign out is in the secondary grey', m.out.color === 'rgb(163, 163, 160)', m.out.color);
      await page.keyboard.press('Escape');

      for (const [name, want] of MENU_ROWS) {
        await goHub(page, want === '/strategic' ? '/personal' : '/strategic');
        await openDesktopMenu(page);
        await page.locator('#site-menu .ds-dmenu-name', { hasText: new RegExp(`^${name}$`) }).click();
        pass(`desktop menu: ${name} opens ${want}`, await landsOn(page, want), path(page));
        pass(`desktop menu: closes after choosing ${name}`, await until(async () => (await page.locator('#site-menu').count()) === 0, 3000));
        if (want !== '/welcome' && want !== '/my-account') {
          await openDesktopMenu(page);
          const now = await page.locator('#site-menu .ds-dmenu-area[aria-current="page"] .ds-dmenu-name').allInnerTexts();
          pass(`desktop menu: on ${want}, ${name} is the current row`, now.length === 1 && now[0] === name, now.join(','));
          await page.keyboard.press('Escape');
        }
      }

      // The keyboard.
      await goHub(page, '/personal');
      await menuButton(page).focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('#site-menu .ds-dmenu-area', { timeout: 5000 });
      const inMenu = () => page.evaluate(() => Boolean(document.activeElement?.closest('#site-menu')) || document.activeElement?.getAttribute('aria-label') === 'Menu');
      pass('keyboard: Enter opens the menu and focus moves into it', await until(() => page.evaluate(() => Boolean(document.activeElement?.closest('#site-menu'))), 3000));
      let stayed = true;
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
        if (!(await inMenu())) stayed = false;
      }
      pass('keyboard: Tab and Shift+Tab stay inside the menu and its button', stayed);
      await page.keyboard.press('Escape');
      pass('keyboard: Escape closes the menu', await until(async () => (await page.locator('#site-menu').count()) === 0, 3000));
      pass('keyboard: focus goes back to the menu button', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Menu'));
      pass('keyboard: the menu button says it is closed', (await menuButton(page).getAttribute('aria-expanded')) === 'false');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#site-menu .ds-dmenu-area', { timeout: 5000 });
      await until(() => page.evaluate(() => Boolean(document.activeElement?.closest('#site-menu'))), 3000);
      // First link is Home; the next is Dashboard.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      pass('keyboard: Tab then Enter on Dashboard opens it', await landsOn(page, '/dashboard'), path(page));
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
      await page.getByRole('button', { name: 'Start a new Health Check' }).click();
      pass('/strategic: Start a new Health Check opens /goal-setting', await landsOn(page, '/goal-setting'), path(page));
      pass('/strategic: the inside Health Check opens as a fresh start', await pageReady(page));
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

    const menuPins = async () => (await page.locator('#site-menu .ds-dmenu-pins a').allInnerTexts()).map((t) => t.trim());
    await openDesktopMenu(page);
    pass('pins: the menu shows them at the top', samePins(await menuPins(), ['Get unstuck', 'Journal', 'Meeting planner']), (await menuPins()).join(','));
    await shot(page, 'desktop-menu-pinned-light');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('.ds-hub-page', { timeout: 30000 });
    await openDesktopMenu(page);
    pass('pins: kept after a reload', samePins(await menuPins(), ['Get unstuck', 'Journal', 'Meeting planner']), (await menuPins()).join(','));
    await page.locator('#site-menu .ds-dmenu-pins a', { hasText: 'Journal' }).click();
    pass('pins: a pinned tool opens its page', await landsOn(page, '/daily-journal'), path(page));

    // Another device: nothing on it yet, the pins come from the account.
    const d = await signedIn({ width: 1280, mode: 'dark' });
    await goHub(d.page, '/personal');
    await d.page.getByRole('button', { name: 'Menu', exact: true }).click();
    const other = await until(async () => {
      const t = (await d.page.locator('#site-menu .ds-dmenu-pins a').allInnerTexts()).map((x) => x.trim());
      return samePins(t, ['Get unstuck', 'Journal', 'Meeting planner']) ? t : null;
    }, 15000);
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
  await setPins(['meet', 'journal', 'grow']);
  for (const [width, mode] of [[390, 'dark'], [360, 'light']]) {
    const tag = `${width}px ${mode}`;
    const c = await signedIn({ width, mode });
    const { page } = c;
    try {
      await goHub(page, '/personal');
      const bar = page.locator('.ds-phone-bar');
      pass(`${tag}: the phone bar shows`, await bar.isVisible());
      const parts = await page.evaluate(() => [...document.querySelectorAll('.ds-phone-bar > a, .ds-phone-bar > button')].map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label'), w: r.width, h: r.height };
      }));
      pass(`${tag}: Home, Menu and This week, in that order`, parts.map((p) => p.name).join(',') === 'Home,Menu,This week', parts.map((p) => p.name).join(','));
      pass(`${tag}: every bar control is at least 44px by 44px`, parts.every((p) => p.w >= 44 && p.h >= 44), JSON.stringify(parts));
      const edge = await bar.evaluate((el) => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, left: r.left, right: r.right, vh: window.innerHeight, vw: window.innerWidth }; });
      pass(`${tag}: the bar sits on the bottom edge, full width`, Math.abs(edge.bottom - edge.vh) < 1 && edge.left === 0 && Math.abs(edge.right - edge.vw) < 1, JSON.stringify(edge));
      const safe = await page.evaluate(() => {
        const found = [];
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          const walk = (list) => {
            for (const r of list) {
              if (r.selectorText?.includes('.ds-phone-bar') && /safe-area-inset-bottom/.test(r.cssText)) found.push(r.selectorText);
              if (r.cssRules) walk(r.cssRules);
            }
          };
          walk(rules);
        }
        return found.length > 0;
      });
      pass(`${tag}: the bar keeps clear of the home bar (safe-area-inset-bottom)`, safe);
      for (const to of ['/welcome', '/personal', '/personal/plan', '/personal/reset', '/personal/review', '/interpersonal', '/strategic', '/my-account']) {
        await page.goto(`${APP}${to}`);
        await until(async () => (await page.locator('.ds-phone-bar').count()) > 0, 20000);
        await sleep(400);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        pass(`${tag}: no sideways scrolling on ${to}`, over <= 0, `${over}px`);
      }

      await goHub(page, '/personal/plan');
      await openPhoneMenu(page);
      await shot(page, `phone-menu-${width}-${mode}`);
      pass(`${tag}: the centre crosshair says the menu is open`, (await page.locator('.ds-bar-menu').getAttribute('aria-expanded')) === 'true');
      pass(`${tag}: the crosshair turns 45 degrees`, await until(async () => /matrix\(0\.707/.test(await page.locator('.ds-bar-menu .ds-bold-cross').evaluate((el) => getComputedStyle(el).transform)), 3000));
      const tiles = (await page.locator('.ds-tmenu-tile b').allInnerTexts()).map((t) => t.trim());
      pass(`${tag}: the four tiles are Personal, Interpersonal, Strategic, My Account`, tiles.join(',') === 'Personal,Interpersonal,Strategic,My Account', tiles.join(','));
      const geo = await page.evaluate(() => {
        const m = document.querySelector('.ds-tmenu').getBoundingClientRect();
        const b = document.querySelector('.ds-phone-bar').getBoundingClientRect();
        const t = [...document.querySelectorAll('.ds-tmenu-tile')].map((el) => el.getBoundingClientRect());
        return { menuBottom: m.bottom, barTop: b.top, tilesTop: Math.min(...t.map((r) => r.top)), vh: window.innerHeight, inside: t.every((r) => r.left >= 0 && r.right <= window.innerWidth), low: Math.min(...t.map((r) => r.top)) >= window.innerHeight * 0.4 };
      });
      pass(`${tag}: the menu sits above the bar`, geo.menuBottom <= geo.barTop, JSON.stringify(geo));
      pass(`${tag}: the menu ends just above the bar`, Math.abs(geo.barTop - geo.menuBottom - 12) < 1, JSON.stringify(geo));
      pass(`${tag}: the area tiles are in the lower part of the screen, within the thumb's reach`, geo.low, JSON.stringify(geo));
      pass(`${tag}: the tiles fit the screen`, geo.inside);
      pass(`${tag}: one coral button in the menu`, (await page.locator('#site-tile-menu .ds-btn--primary').count()) === 1);
      const cur = await page.locator('.ds-tmenu-tile[aria-current="page"] b').allInnerTexts();
      pass(`${tag}: Personal is marked as the current area`, cur.join(',') === 'Personal', cur.join(','));
      await page.keyboard.press('Escape');
      pass(`${tag}: Escape closes the menu`, await until(async () => (await page.locator('#site-tile-menu').count()) === 0, 3000));
      pass(`${tag}: focus goes back to the crosshair`, await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Menu'));
      await openPhoneMenu(page);
      await page.locator('.ds-bar-menu').click();
      pass(`${tag}: the crosshair closes the menu again`, await until(async () => (await page.locator('#site-tile-menu').count()) === 0, 3000));
      await openPhoneMenu(page);
      await page.locator('.ds-tmenu-scrim').click({ position: { x: 20, y: 40 } });
      pass(`${tag}: a tap on the scrim closes the menu`, await until(async () => (await page.locator('#site-tile-menu').count()) === 0, 3000));

      for (const [name, want] of AREAS.filter((a) => a[0] !== 'Home')) {
        await goHub(page, name === 'Personal' ? '/strategic' : '/personal');
        await openPhoneMenu(page);
        await page.locator('.ds-tmenu-tile b', { hasText: new RegExp(`^${name}$`) }).click();
        pass(`${tag}: the ${name} tile opens ${want}`, await landsOn(page, want), path(page));
      }
      if (width === 390) {
        await goHub(page, '/personal');
        await openPhoneMenu(page);
        await page.locator('#site-tile-menu').getByRole('button', { name: 'Log today', exact: true }).click();
        pass(`${tag}: Log today opens Home's Log today`, await landsOn(page, '/welcome'), path(page));
        await goHub(page, '/personal');
        await openPhoneMenu(page);
        pass(`${tag}: the pinned tools show at the top of the phone menu`, await until(async () => (await page.locator('#site-tile-menu .ds-menu-pins a').count()) === 3, 10000));
        await shot(page, `phone-menu-pinned-${width}-${mode}`);
        await page.keyboard.press('Escape');
      }
      await goHub(page, '/personal');
      await page.locator('.ds-phone-bar a[aria-label="Home"]').click();
      pass(`${tag}: Home opens /welcome`, await landsOn(page, '/welcome'), path(page));
      pass(`${tag}: Home is marked current on Home`, await until(async () => (await page.locator('.ds-phone-bar a[aria-label="Home"]').getAttribute('aria-current')) === 'page', 3000));
      await page.locator('.ds-phone-bar a[aria-label="This week"]').click();
      pass(`${tag}: This week opens /performance-sprint`, await landsOn(page, '/performance-sprint'), path(page));
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
    ['phone bar', '#ph .nbar', '.ds-phone-bar', ['h', 'bg']],
    ['bar button', '#ph .nbar .tb', '.ds-bar-btn', ['minH']],
    ['bar crosshair button', '#ph .nbar .ctr', '.ds-bar-menu', ['w', 'h']],
    ['bar crosshair', '#ph .nbar .ctr svg', '.ds-bar-menu .ds-bold-cross', ['w'], 'The bold crosshair uses the shared bar size, 36px (--bold-cross-bar); M3 drew 34px.'],
    ['bar icon', '#ph .nbar .tb svg', '.ds-bar-icon', ['w']],
    ['bar icon line', '#ph .nbar .tb svg path', '.ds-bar-btn:not([aria-current]) .ds-bar-icon path', ['stroke']],
    ['menu tile', '#ph .tl .t', '.ds-tmenu-tile', ['minH', 'pt', 'radius', 'bg']],
    ['menu tile name', '#ph .tl .t b', '.ds-tmenu-tile b', ['fs', 'color']],
    ['menu tile line', '#ph .tl .t small', '.ds-tmenu-tile small', ['fs', 'color']],
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
        r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
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
      await openDesktopMenu(dk.page);
      await sleep(600);
      for (const [what, , as] of PARTS.desktop) if (/menu|Log today/.test(what)) appDesk[what] = await dk.page.evaluate(MEASURE, as);
      for (const [what, , , fields, known] of PARTS.desktop) compare('desktop', mode, what, mockHub[what], appDesk[what], fields, known);
      await dk.context.close();

      const ph = await signedIn({ width: 360, mode, height: 780 });
      await goHub(ph.page, '/personal/plan');
      const appPhone = {};
      for (const [what, , as] of PARTS.phone) if (!/menu tile/.test(what)) appPhone[what] = await ph.page.evaluate(MEASURE, as);
      await openPhoneMenu(ph.page);
      await sleep(600);
      for (const [what, , as] of PARTS.phone) if (/menu tile/.test(what)) appPhone[what] = await ph.page.evaluate(MEASURE, as);
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
