// How pop-ups open (Tim, 28 Oct, 14:22 and 14:42; START-HERE section 5),
// checked in the running app with a real mouse, keyboard and touch screen:
//  - mouse: pointing at an ⓘ or a chart dot previews its
//    pop-up, and it closes when the pointer moves away;
//  - click: it stays open until you click away, click it again or press
//    Escape, and Escape returns focus to the icon;
//  - touch (hasTouch and isMobile): everything opens on tap, and no hover
//    preview is left behind;
//  - keyboard: focus opens it; Enter keeps it open; Escape closes it;
//  - the eye and the play icon open their panel or video on click or tap
//    only, with no hover preview;
//  - every open pop-up sits 12px inside both screen edges, flips below its
//    target when there's no room above, and is display none when closed.
//
//   node tests/popups.mjs [report file]
//   ONLY=health-check node tests/popups.mjs   (the outside Health Check alone: nothing signs in)
//
// The outside Health Check (health-check.html, rebuilt to M7b version 51):
// its two database calls are answered with invented answers, every email
// call and everything outside localhost is blocked
// (tests/healthcheck/hc-shared.mjs). Where the portal's design system
// is there (src/components/design), it also signs in as the invented test
// client on the TEST database only and checks a sample of portal pages: the
// sprint, the year, the plan, Daily plan, Daily review, the weekly
// debrief, the design gallery and older pages with an ⓘ.
// Each page lists the pop-up kinds it must have, and a page missing one
// fails on its own (Tim, 29 Oct). Every page is also checked for "Next
// coaching session", hidden until the coach portal exists.
// Exits 1 when a check fails.
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { appPage, signIn as signInHc } from './healthcheck/hc-shared.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
// ONLY=health-check runs the outside Health Check alone: nothing signs in and the test accounts are never read.
const PORTAL = existsSync('src/components/design/ChartTips.jsx') && process.env.ONLY !== 'health-check';
const out = process.argv[2] || null;
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};
// One row per pop-up kind and way of opening, for the report's table.
const table = {};
const mark = (kind, how, ok) => {
  table[kind] = table[kind] || {};
  table[kind][how] = table[kind][how] === false ? false : ok;
};
// Wait for the real condition, never a fixed time: the page has drawn the
// change (two frames) and nothing on it is still moving (pop-ups, panels
// and toasts fade or rise; reduced motion makes most of them instant).
const wait = (page) => page.evaluate(() => new Promise((done) => {
  const still = () => document.getAnimations().every((a) => a.playState !== 'running');
  let frames = 0;
  const tick = () => {
    frames += 1;
    if ((frames >= 2 && still()) || frames > 120) done();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const browser = await chromium.launch();

// ---- reading a pop-up's state ------------------------------------------------
// type 'float': a floating pop-up (the Health Check's, or ChartTips');
// type 'inline': an ⓘ whose explanation opens in place (aria-expanded).

/** Whether the target's pop-up is open, where it is, and whether every closed pop-up is display none. */
const stateOf = (loc, type) => loc.evaluate((el, t) => {
  const vw = document.documentElement.clientWidth;
  const r = el.getBoundingClientRect();
  const boxes = [...document.querySelectorAll('#hc-tip, .ds-tip')];
  const closedOk = boxes.filter((b) => b.hidden).every((b) => getComputedStyle(b).display === 'none');
  if (t === 'inline') {
    const open = el.getAttribute('aria-expanded') === 'true';
    const panel = document.getElementById(el.getAttribute('aria-controls') || '') || null;
    const pr = panel && open ? panel.getBoundingClientRect() : null;
    const shown = !!pr && pr.width > 0;
    return { open: open && (panel ? shown : true), box: pr && { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom }, vw, target: { top: r.top, bottom: r.bottom }, closedOk };
  }
  const id = el.getAttribute('aria-describedby');
  const box = id ? document.getElementById(id) : null;
  const open = !!box && !box.hidden && getComputedStyle(box).display !== 'none';
  const b = open ? box.getBoundingClientRect() : null;
  return { open, box: b && { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, vw, target: { top: r.top, bottom: r.bottom }, closedOk };
}, type);

/** Any floating pop-up open at all (a touch must leave nothing behind). */
const anyOpen = (page) => page.evaluate(() => [...document.querySelectorAll('#hc-tip, .ds-tip')].some((b) => !b.hidden && getComputedStyle(b).display !== 'none'));

const inside = (s) => !s.box || (s.box.left >= 11.5 && s.box.right <= s.vw - 11.5);

/** A spot on the page with nothing to press under it, away from the target. */
async function blankPoint(page, loc) {
  const p = await loc.evaluate((el) => {
    const t = el.getBoundingClientRect();
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const busy = (x) => !x || x.closest('button, a, input, textarea, select, label, [tabindex], [data-tip], [role=dialog], #hc-tip, .ds-tip, .ds-pop, .ds-sheet, svg');
    for (let y = 60; y < H - 20; y += 23) {
      for (let x = 6; x < W - 6; x += 29) {
        if (Math.abs(x - (t.left + t.width / 2)) < 80 && Math.abs(y - (t.top + t.height / 2)) < 80) continue;
        if (!busy(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  });
  return p || { x: 3, y: 300 };
}

/** Focus by the keyboard: focus what comes before it, then press Tab. */
async function tabTo(page, loc) {
  const ok = await loc.evaluate((el) => {
    const all = [...document.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
      .filter((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length && !x.closest('[inert], [hidden]'));
    const i = all.indexOf(el);
    if (i < 1) return false;
    all[i - 1].focus({ preventScroll: false });
    return true;
  });
  if (!ok) return false;
  await page.keyboard.press('Tab');
  await wait(page);
  return loc.evaluate((el) => document.activeElement === el);
}

// ---- the four ways of opening ------------------------------------------------

async function mouseChecks(page, t, where) {
  const loc = t.loc;
  const label = `${where}, ${t.kind}`;
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await wait(page);
  const blank = await blankPoint(page, loc);
  // Pointing previews it, and moving away closes it.
  await loc.hover();
  await wait(page);
  let s = await stateOf(loc, t.type);
  const preview = s.open;
  pass(`${label}: pointing with a mouse previews it`, preview);
  pass(`${label}: the preview sits 12px inside both edges`, inside(s), JSON.stringify(s.box));
  await page.mouse.move(blank.x, blank.y);
  await wait(page);
  s = await stateOf(loc, t.type);
  const leaves = !s.open;
  pass(`${label}: it closes when the pointer moves away`, leaves);
  pass(`${label}: a closed pop-up is display none`, s.closedOk);
  mark(t.kind, 'mouse', preview && leaves && s.closedOk);
  // A click keeps it open; a second click closes it.
  await loc.click();
  await wait(page);
  await page.mouse.move(blank.x, blank.y);
  await wait(page);
  s = await stateOf(loc, t.type);
  const kept = s.open;
  pass(`${label}: a click keeps it open after the pointer leaves`, kept);
  await loc.click();
  await wait(page);
  s = await stateOf(loc, t.type);
  const again = !s.open;
  pass(`${label}: clicking it again closes it`, again);
  // Clicking away closes it.
  await loc.click();
  await page.mouse.click(blank.x, blank.y);
  await wait(page);
  const away = !(await stateOf(loc, t.type)).open;
  pass(`${label}: clicking away closes it`, away);
  // Escape closes it and returns focus to the icon, even after focus moved.
  await loc.click();
  await wait(page);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(blank.x, blank.y);
  await page.keyboard.press('Escape');
  await wait(page);
  const esc = !(await stateOf(loc, t.type)).open;
  const back = await loc.evaluate((el) => document.activeElement === el);
  pass(`${label}: Escape closes it`, esc);
  pass(`${label}: Escape returns focus to the icon`, back);
  // and focus coming back doesn't open it again
  const stays = !(await stateOf(loc, t.type)).open;
  pass(`${label}: focus coming back after Escape leaves it closed`, stays);
  mark(t.kind, 'click', kept && again && away && esc && back && stays);
  await page.evaluate(() => document.activeElement?.blur?.());
}

async function flipCheck(page, t, where) {
  if (t.type === 'inline') return;
  const loc = t.loc;
  // Put the target near the top of the screen, where there's no room above.
  await loc.scrollIntoViewIfNeeded();
  const moved = await loc.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    window.scrollBy(0, top - 14);
    return Math.abs(el.getBoundingClientRect().top - 14) < 3;
  });
  if (!moved) return; // the page can't scroll that far; checked on another target
  await wait(page);
  // Focus opens it without scrolling (a click would scroll the target out
  // from under the sticky top bar first).
  await loc.evaluate((el) => el.focus({ preventScroll: true }));
  await wait(page);
  const s = await stateOf(loc, t.type);
  pass(`${where}, ${t.kind}: it flips below its target when there's no room above`, s.open && s.box && s.box.top >= s.target.bottom - 0.5, JSON.stringify({ box: s.box, target: s.target }));
  pass(`${where}, ${t.kind}: flipped, it still sits 12px inside both edges`, inside(s));
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
}

async function keyboardChecks(page, t, where) {
  const loc = t.loc;
  const label = `${where}, ${t.kind}`;
  await page.mouse.move(1, 1);
  const focused = await tabTo(page, loc);
  let s = await stateOf(loc, t.type);
  const opens = focused && s.open;
  pass(`${label}: keyboard focus opens it`, opens, focused ? '' : 'could not Tab to it');
  pass(`${label}: opened by the keyboard, it sits 12px inside both edges`, inside(s));
  await page.keyboard.press('Escape');
  await wait(page);
  s = await stateOf(loc, t.type);
  const esc = !s.open && (await loc.evaluate((el) => document.activeElement === el));
  pass(`${label}: Escape closes it, focus stays on the icon`, esc);
  await page.keyboard.press(t.key || 'Enter');
  await wait(page);
  const enter = (await stateOf(loc, t.type)).open;
  pass(`${label}: ${t.key || 'Enter'} opens it`, enter);
  await page.keyboard.press(t.key || 'Enter');
  await wait(page);
  const enter2 = !(await stateOf(loc, t.type)).open;
  pass(`${label}: ${t.key || 'Enter'} again closes it`, enter2);
  mark(t.kind, 'keyboard', opens && esc && enter && enter2);
  await page.evaluate(() => document.activeElement?.blur?.());
}

async function touchChecks(page, t, where, other) {
  const loc = t.loc;
  const label = `${where}, ${t.kind}`;
  await loc.scrollIntoViewIfNeeded();
  const blank = await blankPoint(page, loc);
  await loc.tap();
  await wait(page);
  let s = await stateOf(loc, t.type);
  const opens = s.open;
  pass(`${label}: a tap opens it`, opens);
  pass(`${label}: tapped open, it sits 12px inside both edges`, inside(s), JSON.stringify(s.box));
  await page.touchscreen.tap(blank.x, blank.y);
  await wait(page);
  s = await stateOf(loc, t.type);
  const away = !s.open && (t.type === 'inline' || !(await anyOpen(page)));
  pass(`${label}: a tap elsewhere closes it, and no hover pop-up is left behind`, away);
  await loc.tap();
  await wait(page);
  await loc.tap();
  await wait(page);
  const again = !(await stateOf(loc, t.type)).open;
  pass(`${label}: tapping it again closes it`, again);
  let swap = true;
  if (other) {
    await loc.tap();
    await wait(page);
    await other.scrollIntoViewIfNeeded();
    await other.tap();
    await wait(page);
    const a = await stateOf(loc, t.type);
    const b = await stateOf(other, t.type);
    swap = b.open && (t.type === 'inline' || !a.open);
    pass(`${label}: tapping another one opens that one${t.type === 'inline' ? '' : ' instead'}`, swap);
    await other.tap();
    await wait(page);
    if ((await stateOf(loc, t.type)).open) await loc.tap();
  }
  mark(t.kind, 'touch', opens && away && again && swap);
}

/** The eye and the play icon: no hover preview, their panel opens on click or tap only. */
async function actionChecks(page, loc, kind, where, touch) {
  const label = `${where}, ${kind}`;
  await loc.scrollIntoViewIfNeeded();
  // (A guided tool that covers the screen is a dialog itself; the panel an icon opens is another one, over it.)
  const dialogOpen = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]:not(.ds-guide)')].some((d) => d.getClientRects().length && getComputedStyle(d).visibility !== 'hidden' && !d.closest('[inert]')));
  if (!touch) {
    await loc.hover();
    await wait(page);
    const nothing = !(await dialogOpen()) && !(await anyOpen(page));
    pass(`${label}: pointing at it opens nothing`, nothing);
    await loc.click();
    await wait(page);
    const opens = await dialogOpen();
    pass(`${label}: a click opens its panel`, opens);
    await page.keyboard.press('Escape');
    await wait(page);
    mark(kind, 'mouse', nothing);
    mark(kind, 'click', opens);
    // The keyboard: Enter opens it, as a click does; focus alone opens nothing.
    await page.mouse.move(1, 1);
    const focused = await tabTo(page, loc);
    const still = focused && !(await dialogOpen()) && !(await anyOpen(page));
    pass(`${label}: keyboard focus alone opens nothing`, still);
    await page.keyboard.press('Enter');
    await wait(page);
    const enter = await dialogOpen();
    pass(`${label}: Enter opens its panel`, enter);
    await page.keyboard.press('Escape');
    await wait(page);
    mark(kind, 'keyboard', still && enter);
  } else {
    await loc.tap();
    await wait(page);
    const opens = await dialogOpen();
    pass(`${label}: a tap opens its panel`, opens);
    await page.keyboard.press('Escape');
    await wait(page);
    mark(kind, 'touch', opens);
  }
}

// ---- the outside Health Check (rebuilt to M7b version 51) ---------------------
// Its page, stand-ins and invented answers are the Health Check suites' own
// (tests/healthcheck/hc-shared.mjs): the two database calls and every email
// call are answered there, and everything outside localhost is blocked.

async function healthCheckPage({ width, step, complete }) {
  const b = await appPage(browser, width, 'dark', { step: step || { screen: 'objective' }, complete: !!complete });
  b.page.on('pageerror', (e) => pass(`no page errors (Health Check ${width}px)`, false, e.message));
  return b;
}
const beginHc = async (page) => {
  const begin = page.getByRole('button', { name: 'Begin the Health Check' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.locator('.ds-guest-question').first().waitFor();
};

async function healthCheck(touch) {
  const width = touch ? 390 : 1280;
  const how = touch ? 'touch' : 'desktop';
  const run = async (page, t, where, other) => {
    if (!(await t.loc.count())) { pass(`${where}: has ${t.kind}`, false); return; }
    if (touch) await touchChecks(page, t, where, other && (await other.count()) ? other : null);
    else { await mouseChecks(page, t, where); await keyboardChecks(page, t, where); if (t.flip) await flipCheck(page, t, where); }
  };
  // The email and code screen's ⓘ, at the end of its sentence.
  {
    const { ctx, page } = await healthCheckPage({ width });
    await beginHc(page);
    await run(page, { kind: 'ⓘ (Health Check)', type: 'inline', loc: page.locator('.ds-guest-sentence .ds-guide-i').first() }, `Health Check email and code ${how}`);
    await ctx.close();
  }
  // The first question: the play icon and the eye (they show there and on the results only).
  {
    const { ctx, page, session } = await healthCheckPage({ width, step: { screen: 'objective' } });
    await signInHc(page, session);
    const where = `Health Check first question ${how}`;
    await actionChecks(page, page.locator('.ds-guide-question .ds-who:not(.ds-play)').first(), 'the eye (Health Check)', where, touch);
    await actionChecks(page, page.getByRole('button', { name: 'Quick guide' }).first(), 'play, Quick guide (Health Check)', where, touch);
    await ctx.close();
  }
  // The steps' ⓘ: the Success Factors' label and the projects' line of help.
  for (const [screen, sel] of [['csf', '.hc-flab .ds-guide-i'], ['projects', '.ds-guide-nudge .ds-guide-i']]) {
    const { ctx, page, session } = await healthCheckPage({ width, step: { screen } });
    await signInHc(page, session);
    await run(page, { kind: 'ⓘ (Health Check)', type: 'inline', loc: page.locator(sel).first() }, `Health Check ${screen} step ${how}`);
    await ctx.close();
  }
  // The results: the chart's ⓘ, the column heading's ⓘ (a laptop) and the chart's dots.
  const { ctx, page, session } = await healthCheckPage({ width, step: { screen: 'done' }, complete: true });
  await signInHc(page, session);
  await page.locator('.hc-dot').first().waitFor();
  const where = `Health Check results ${how}`;
  const chartI = page.getByRole('button', { name: 'How to read the chart' }).first();
  const columnI = page.getByRole('button', { name: 'What strategic importance means' }).first();
  const dots = page.locator('.hc-dot:visible');
  await run(page, { kind: 'ⓘ (Health Check)', type: 'inline', loc: chartI }, where, touch ? null : columnI);
  // A phone's rows have no column headings, so no ⓘ there.
  if (!touch) await run(page, { kind: 'ⓘ on a column heading (Health Check)', type: 'inline', loc: columnI }, where);
  await run(page, { kind: 'chart dot (Health Check)', type: 'float', loc: dots.first(), key: 'Enter', flip: true }, where, dots.nth(1));
  await run(page, { kind: 'chart dot (Health Check)', type: 'float', loc: dots.last(), key: ' ', flip: true }, where);
  await actionChecks(page, page.locator('.ds-guide-title .ds-who:not(.ds-play)').first(), 'the eye (Health Check)', where, touch);
  await actionChecks(page, page.getByRole('button', { name: 'Quick guide' }).first(), 'play, Quick guide (Health Check)', where, touch);
  await ctx.close();
  // The example report: its ⓘ and its dots.
  {
    const { ctx: ectx, page: ep } = await healthCheckPage({ width });
    await beginHc(ep);
    await ep.getByRole('button', { name: 'See an example report' }).click();
    await ep.locator('.hc-dot').first().waitFor();
    await wait(ep);
    const ewhere = `Health Check example report ${how}`;
    const eDots = ep.locator('.hc-dot:visible');
    await run(ep, { kind: 'ⓘ (Health Check)', type: 'inline', loc: ep.getByRole('button', { name: 'How to read the chart' }).first() }, ewhere);
    if (!touch) await run(ep, { kind: 'ⓘ on a column heading (Health Check)', type: 'inline', loc: ep.getByRole('button', { name: 'What strategic importance means' }).first() }, ewhere);
    await run(ep, { kind: 'chart dot (Health Check)', type: 'float', loc: eDots.nth(0), key: 'Enter' }, ewhere, eDots.nth(7));
    await ectx.close();
  }
}

// ---- the portal (the feature branch's design system) -------------------------

const env = {};
if (PORTAL) {
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  if (!env.TEST_SUPABASE_URL?.includes(TEST_HOST)) throw new Error('Not the test project.');
}

async function signedIn(touch) {
  const width = touch ? 390 : 1280;
  const ctx = await browser.newContext({ viewport: { width, height: touch ? 844 : 900 }, hasTouch: touch, isMobile: touch, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', reducedMotion: 'reduce' });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pass(`no page errors (portal ${width}px)`, false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { ctx, page };
}

// The pages, what shows each one is ready, and the pop-up kinds each must
// have on a laptop and on a phone (Tim, 29 Oct). Every page is checked on
// its own: a kind missing from a page fails on that page, never "fine
// because another page had it". The test client is the seeded one
// (scripts/seed-test-plan.mjs --reset: plan v3.2, Sprint 1 running).
const TITLE = 'ⓘ (page title)';
const SECTION = 'ⓘ (section or step)';
const MARK = 'chart mark (ChartTips)';
const EYE = 'eye';
const PAGES = [
  { path: '/performance-sprint', name: 'the sprint', ready: '.ds-sdial--running', desktop: [MARK], touch: [MARK] },
  { path: '/performance-sprint/year', name: 'the year', ready: '.ds-ychart-col', desktop: [MARK], touch: [MARK] },
  // The test client has no coach, so the plan's eyes are words, not a tap.
  { path: '/performance-plan', name: 'the plan', ready: '.ds-stile', desktop: [MARK], touch: [MARK] },
  // The gallery has no page title of its own: its sections show each kind.
  { path: '/design-reference', name: 'the design gallery', ready: '.dr-tool-frame', desktop: [SECTION, MARK, EYE], touch: [SECTION, MARK, EYE] },
  // Phase 3's guided tools have no "i", chart mark or tappable eye (the
  // test client has no coach): each is still opened on its own, checked for
  // "Next coaching session", and any pop-up found on it is still checked.
  // The debrief shows its first step or, outside a window, when the next opens.
  { path: '/daily-plan', name: 'Daily plan', ready: '.ds-guide-question', desktop: [], touch: [] },
  { path: '/daily-review', name: 'Daily review', ready: '.ds-guide-question', desktop: [], touch: [] },
  { path: '/performance-sprint/debrief', name: 'the weekly debrief', ready: '.ds-guide-question, .deb-closed', desktop: [], touch: [] },
  // No ⓘ beside any page title (Tim, 5 Nov, declutter): checked below on every page.
  { path: '/daily-journal', name: 'an older page (Daily journal)', ready: '.ds-page-title', desktop: [], touch: [] },
  { path: '/decision-tools', name: 'an older page (Decision tools)', ready: '.ds-page-title', desktop: [], touch: [] },
];

async function portal(touch) {
  const how = touch ? 'touch' : 'desktop';
  const { ctx, page } = await signedIn(touch);
  for (const { path, name, ready, ...expect } of PAGES) {
    await page.goto(`${APP}${path}`);
    // Ready: the page's own content is in, the first-visit crosshair has
    // gone and the server's copy has arrived (the network is quiet).
    await page.waitForSelector(ready, { state: 'visible', timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.ds-loading--page'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await wait(page);
    const where = `${name} ${how}`;
    // Tim, 29 Oct: hidden until the coach portal exists.
    pass(`${where}: shows no "Next coaching session"`, !/next\s+coaching\s+session/i.test(await page.locator('body').innerText()));
    const found = [];
    const titleI = page.locator('.ds-page-info-toggle:visible');
    if (await titleI.count()) found.push({ kind: 'ⓘ (page title)', type: 'inline', loc: titleI.first() });
    const sectionI = page.locator('.ds-help-toggle:not(.ds-page-info-toggle):visible');
    if (await sectionI.count()) found.push({ kind: 'ⓘ (section or step)', type: 'inline', loc: sectionI.first(), other: (await sectionI.count()) > 1 ? sectionI.nth(1) : null });
    // The gallery's sprint tool: its fourth step has a "Why we ask" ⓘ.
    const frame = page.locator('.dr-tool-frame');
    for (let i = 0; i < 5 && (await frame.count()) && !(await frame.locator('.ds-guide-i:visible').count()); i += 1) {
      const nextBtn = frame.getByRole('button', { name: /^Next/ }).first();
      if (!(await nextBtn.count())) break;
      await nextBtn.click();
      await wait(page);
    }
    const guideI = page.locator('.ds-guide-i:visible');
    if (await guideI.count()) found.push({ kind: 'ⓘ (section or step)', type: 'inline', loc: guideI.first() });
    const marks = page.locator('.ds-tipzone [data-tip]:visible');
    const n = await marks.count();
    if (n) {
      found.push({ kind: 'chart mark (ChartTips)', type: 'float', loc: marks.first(), other: n > 1 ? marks.nth(1) : null });
      if (n > 2) found.push({ kind: 'chart mark (ChartTips)', type: 'float', loc: marks.nth(Math.floor(n / 2)) });
      if (n > 1) found.push({ kind: 'chart mark (ChartTips)', type: 'float', loc: marks.last() });
    }
    results.push(`      ${where}: ${found.map((t) => t.kind).join(', ') || 'no pop-ups'}`);
    // Only an eye that can be tapped (WhoSees with onChange, CoachSees); the others are words.
    const eye = page.locator('.ds-who[aria-haspopup]:visible');
    const has = new Set([...found.map((t) => t.kind), ...((await eye.count()) ? [EYE] : [])]);
    // A greeting ("Welcome back, Sam", the first day back from a Recovery)
    // has nothing to explain, so it has no ⓘ (Tim, 3 Nov).
    const title = (await page.locator('.ds-page-title').first().textContent().catch(() => '')) || '';
    const greeting = /^(Welcome back|Good to see you|Good (morning|afternoon|evening))/i.test(title.trim());
    if (greeting) pass(`${where}: the greeting "${title.trim()}" has no ⓘ`, !has.has(TITLE));
    pass(`${where}: no ⓘ beside the page title (declutter, 5 Nov)`, !has.has(TITLE));
    for (const kind of expect[how]) {
      if (greeting && kind === TITLE) continue;
      pass(`${where}: has ${kind}`, has.has(kind), `found ${[...has].join(', ') || 'none'}`);
    }
    for (const t of found) {
      if (touch) await touchChecks(page, t, where, t.other);
      else { await mouseChecks(page, t, where); await keyboardChecks(page, t, where); await flipCheck(page, t, where); }
    }
    if (await eye.count()) await actionChecks(page, eye.first(), 'the eye (WhoSees, CoachSees)', where, touch);
  }
  await ctx.close();
}

await healthCheck(false);
await healthCheck(true);
if (PORTAL) {
  await portal(false);
  await portal(true);
}
await browser.close();

const hows = ['mouse', 'click', 'keyboard', 'touch'];
const rows = Object.entries(table).map(([kind, r]) => `| ${kind} | ${hows.map((h) => (r[h] === undefined ? 'not tried' : r[h] ? 'pass' : 'FAIL')).join(' | ')} |`);
const report = [
  `How pop-ups open, ${APP}${PORTAL ? ' (Health Check and portal)' : ' (Health Check)'}`,
  '',
  `| Pop-up | ${hows.join(' | ')} |`,
  `|---|${hows.map(() => '---').join('|')}|`,
  ...rows,
  '',
  ...results,
  '',
  `${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed.`,
].join('\n');
if (out) writeFileSync(out, `${report}\n`);
console.log(report);
process.exit(failures ? 1 : 0);
