// How pop-ups open (Tim, 28 Oct, 14:22 and 14:42; START-HERE section 5),
// checked in the running app with a real mouse, keyboard and touch screen:
//  - mouse: pointing at an ⓘ, How it works or a chart dot previews its
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
//   APP_URL=http://localhost:5174 node tests/popups.mjs   (the release worktree)
//
// The Health Check (health-check.html) runs on any branch: its two database
// calls are answered here with invented answers, every email call and
// everything outside localhost is blocked. Where the portal's design system
// is there (src/components/design), it also signs in as the invented test
// client on the TEST database only and checks a sample of portal pages: the
// sprint, the year, the plan, the design gallery and older pages with an ⓘ.
// Exits 1 when a check fails.
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const PORTAL = existsSync('src/components/design/ChartTips.jsx');
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
const wait = (page, ms = 120) => page.waitForTimeout(ms);
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
  await wait(page, 200);
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
  await wait(page, 400);
  let s = await stateOf(loc, t.type);
  const opens = s.open;
  pass(`${label}: a tap opens it`, opens);
  pass(`${label}: tapped open, it sits 12px inside both edges`, inside(s), JSON.stringify(s.box));
  await page.touchscreen.tap(blank.x, blank.y);
  await wait(page, 300);
  s = await stateOf(loc, t.type);
  const away = !s.open && (t.type === 'inline' || !(await anyOpen(page)));
  pass(`${label}: a tap elsewhere closes it, and no hover pop-up is left behind`, away);
  await loc.tap();
  await wait(page, 300);
  await loc.tap();
  await wait(page, 300);
  const again = !(await stateOf(loc, t.type)).open;
  pass(`${label}: tapping it again closes it`, again);
  let swap = true;
  if (other) {
    await loc.tap();
    await wait(page, 250);
    await other.scrollIntoViewIfNeeded();
    await other.tap();
    await wait(page, 300);
    const a = await stateOf(loc, t.type);
    const b = await stateOf(other, t.type);
    swap = b.open && (t.type === 'inline' || !a.open);
    pass(`${label}: tapping another one opens that one${t.type === 'inline' ? '' : ' instead'}`, swap);
    await other.tap();
    await wait(page, 250);
    if ((await stateOf(loc, t.type)).open) await loc.tap();
  }
  mark(t.kind, 'touch', opens && away && again && swap);
}

/** The eye and the play icon: no hover preview, their panel opens on click or tap only. */
async function actionChecks(page, loc, kind, where, touch) {
  const label = `${where}, ${kind}`;
  await loc.scrollIntoViewIfNeeded();
  const dialogOpen = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].some((d) => d.getClientRects().length && getComputedStyle(d).visibility !== 'hidden' && !d.closest('[inert]')));
  if (!touch) {
    await loc.hover();
    await wait(page, 300);
    const nothing = !(await dialogOpen()) && !(await anyOpen(page));
    pass(`${label}: pointing at it opens nothing`, nothing);
    await loc.click();
    await wait(page, 500);
    const opens = await dialogOpen();
    pass(`${label}: a click opens its panel`, opens);
    await page.keyboard.press('Escape');
    await wait(page, 600);
    mark(kind, 'mouse', nothing);
    mark(kind, 'click', opens);
    // The keyboard: Enter opens it, as a click does; focus alone opens nothing.
    await page.mouse.move(1, 1);
    const focused = await tabTo(page, loc);
    const still = focused && !(await dialogOpen()) && !(await anyOpen(page));
    pass(`${label}: keyboard focus alone opens nothing`, still);
    await page.keyboard.press('Enter');
    await wait(page, 500);
    const enter = await dialogOpen();
    pass(`${label}: Enter opens its panel`, enter);
    await page.keyboard.press('Escape');
    await wait(page, 600);
    mark(kind, 'keyboard', still && enter);
  } else {
    await loc.tap();
    await wait(page, 600);
    const opens = await dialogOpen();
    pass(`${label}: a tap opens its panel`, opens);
    await page.keyboard.press('Escape');
    await wait(page, 600);
    mark(kind, 'touch', opens);
  }
}

// ---- the Health Check (any branch) -------------------------------------------

const PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const invented = (complete) => ({
  objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
  csfs: CSF.map((text, i) => ({ id: `f${i}`, text, level: [3, 2, 2, 1][i] })),
  projects: PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
  ratings: { owner: Object.fromEntries(PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])) },
  ...(complete ? { completedAt: '2026-10-27T09:00:00.000Z' } : {}),
});

async function healthCheckPage({ width, touch, step, complete }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 641 ? 844 : 900 }, isMobile: touch, hasTouch: touch, colorScheme: 'dark', reducedMotion: 'reduce' });
  const session = { email: 'sam.example@invented.test', code: 'ABC234', status: complete ? 'complete' : 'in_progress', data: invented(complete), current_step: step, version: 1 };
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const url = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/rpc/alignment_open')) {
      return json({ ok: true, status: session.status, current_step: session.current_step, data: session.data, version: session.version, updated_at: '2026-10-27 09:30:00.123', completed_at: complete ? '2026-10-27 09:30:00' : null, client_label: 'Kestrel Group', coach_name: 'Tim' });
    }
    if (url.endsWith('/rpc/alignment_save')) {
      const b = JSON.parse(route.request().postData() || '{}');
      session.data = b.p_data; session.version += 1;
      return json({ ok: true, version: session.version, updated_at: '2026-10-27 10:00:00', status: session.status });
    }
    return route.abort();
  });
  await ctx.route(/localhost:\d+\/health-check\/[^/.]+$/, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch({ url: `${APP}/health-check.html` });
    return route.fulfill({ response: r });
  });
  await ctx.route('**/api/alignment-email', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('hc-quick-guide-watched', '1'); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pass(`no page errors (Health Check ${width}px)`, false, e.message));
  await page.goto(`${APP}/health-check/tok-popups-0000000000000000000000000000000`);
  await page.locator('#hc-email, .wlc .btn.full').first().waitFor();
  const begin = page.getByRole('button', { name: 'Begin the Health Check' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  return { ctx, page, session };
}
async function signInHc(page, session) {
  await page.locator('#hc-email').fill(session.email);
  await page.locator('#hc-code').fill(session.code);
  await page.locator('form button[type=submit]').click();
  await page.locator('.hc-main .page h2').first().waitFor();
  await wait(page, 400);
}

async function healthCheck(touch) {
  const width = touch ? 390 : 1280;
  const how = touch ? 'touch' : 'desktop';
  // The sign-in screen's ⓘ.
  {
    const { ctx, page } = await healthCheckPage({ width, touch, step: { screen: 'objective' }, complete: false });
    const t = { kind: 'ⓘ (Health Check)', type: 'float', loc: page.locator('.privl .ipb').first() };
    if (touch) await touchChecks(page, t, `Health Check sign-in ${how}`);
    else { await mouseChecks(page, t, `Health Check sign-in ${how}`); await keyboardChecks(page, t, `Health Check sign-in ${how}`); }
    await ctx.close();
  }
  // The steps' ⓘ: the CSFs and the projects.
  for (const screen of ['csf', 'projects']) {
    const { ctx, page, session } = await healthCheckPage({ width, touch, step: { screen }, complete: false });
    await signInHc(page, session);
    const t = { kind: 'ⓘ (Health Check)', type: 'float', loc: page.locator('.hc-main .ipb').first() };
    const where = `Health Check ${screen} step ${how}`;
    if (await t.loc.count()) {
      if (touch) await touchChecks(page, t, where);
      else { await mouseChecks(page, t, where); await keyboardChecks(page, t, where); }
    } else pass(`${where}: has an ⓘ`, false);
    await actionChecks(page, page.locator('.ilink.who').first(), 'the eye (Health Check)', where, touch);
    await actionChecks(page, page.getByRole('button', { name: 'Quick guide' }).first(), 'play, Quick guide (Health Check)', where, touch);
    await ctx.close();
  }
  // The results: the ⓘ, How it works and the chart's dots.
  const { ctx, page, session } = await healthCheckPage({ width, touch, step: { screen: 'results' }, complete: true });
  await signInHc(page, session);
  await page.locator('.chart g.dot').first().waitFor();
  const where = `Health Check results ${how}`;
  const infos = page.locator('.hc-main .ipb:visible');
  const dots = page.locator('.chart g.dot:visible');
  const targets = [
    { kind: 'ⓘ (Health Check)', type: 'float', loc: infos.first(), other: infos.nth(1) },
    { kind: 'How it works (Health Check)', type: 'float', loc: page.getByRole('button', { name: 'How it works' }).first() },
    { kind: 'chart dot (Health Check)', type: 'float', loc: dots.first(), other: dots.nth(1), key: 'Enter' },
    { kind: 'chart dot (Health Check)', type: 'float', loc: dots.last(), key: ' ' },
  ];
  for (const t of targets) {
    if (!(await t.loc.count())) { pass(`${where}: has ${t.kind}`, false); continue; }
    // Before Health Check 3, How it works opened a panel (a dialog), not a pop-up.
    if (await t.loc.evaluate((el) => el.getAttribute('aria-haspopup') === 'dialog')) {
      await actionChecks(page, t.loc, `${t.kind.replace(' (Health Check)', '')}, a panel (Health Check)`, where, touch);
      continue;
    }
    if (touch) await touchChecks(page, t, where, t.other && (await t.other.count()) ? t.other : null);
    else { await mouseChecks(page, t, where); await keyboardChecks(page, t, where); await flipCheck(page, t, where); }
  }
  await actionChecks(page, page.locator('.ilink.who').first(), 'the eye (Health Check)', where, touch);
  await actionChecks(page, page.getByRole('button', { name: 'Quick guide' }).first(), 'play, Quick guide (Health Check)', where, touch);
  await ctx.close();
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

// The pages and what to try on each. A page that shows none of a kind (its
// data has none) is noted, not failed, as long as each kind is tried somewhere.
const PAGES = [
  ['/performance-sprint', 'the sprint'],
  ['/performance-sprint/year', 'the year'],
  ['/performance-plan', 'the plan'],
  ['/design-reference', 'the design gallery'],
  ['/daily-journal', 'an older page (Daily journal)'],
  ['/decision-tools', 'an older page (Decision tools)'],
];
const tried = {};

async function portal(touch) {
  const how = touch ? 'touch' : 'desktop';
  const { ctx, page } = await signedIn(touch);
  for (const [path, name] of PAGES) {
    await page.goto(`${APP}${path}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await wait(page, 1500);
    const where = `${name} ${how}`;
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
      await wait(page, 500);
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
    for (const t of found) {
      tried[t.kind] = true;
      if (touch) await touchChecks(page, t, where, t.other);
      else { await mouseChecks(page, t, where); await keyboardChecks(page, t, where); await flipCheck(page, t, where); }
    }
    // Only an eye that can be tapped (WhoSees with onChange, CoachSees); the others are words.
    const eye = page.locator('.ds-who[aria-haspopup]:visible');
    if (await eye.count()) { tried.eye = true; await actionChecks(page, eye.first(), 'the eye (WhoSees, CoachSees)', where, touch); }
  }
  await ctx.close();
}

await healthCheck(false);
await healthCheck(true);
if (PORTAL) {
  await portal(false);
  await portal(true);
  // (Section's ⓘ uses the same hook as these, but no page uses helpKey yet.)
  for (const kind of ['ⓘ (page title)', 'ⓘ (section or step)', 'chart mark (ChartTips)', 'eye']) pass(`the portal sample has ${kind}`, !!tried[kind]);
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
