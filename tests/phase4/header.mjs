// Phase 4 step 3: the header, the My Mission pill, the notch, the floating
// Breathe button and "Chat to [coach's first name]", in the running app,
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked). Nothing is written to the
// database: the mission and the coach are changed in the answers the app
// receives, never in the tables.
//
//   node --import ./tests/scores/register.mjs tests/phase4/header.mjs [folder for screenshots]
//
// 1. My Mission at 320, 360 and 390 wide, with the real mission, a
//    1,000-character one and none. Since Polish 1 (25 Nov reference .mission;
//    replaces the two-line pill) it is one 40px box with a thin line in the
//    phone header: "My Mission" then the Mission on one line, ending with
//    an ellipsis when it doesn't fit (the reference's own text-overflow), no
//    sideways scroll. With no mission: grey "Add your Mission when you’re
//    ready". Since Tim's walk fixes (27 Nov, item 5) a laptop has no box: at
//    1280 Home shows the Mission line under the title instead (one line, "…"),
//    and the box and the line open the Individual Performance Plan at its My
//    Mission card (/performance-plan#my-mission, missionPlace.js).
// 2. With no mission, the box (390) and the Mission line (1280) open the same
//    place, the plan's My Mission card, never the old Personal Operating Plan
//    page (the plan's own Mission step only when there is no plan at all).
// 3. The notch: safe-area insets emulated through Chromium's DevTools
//    (Emulation.setSafeAreaInsetsOverride), as Safari and as a Home Screen
//    app (display-mode: standalone emulated), portrait and landscape, with
//    a notch (47px) and the Dynamic Island (59px). On every page checked,
//    nothing near the top sits under the insets. Chromium can't emulate
//    display-mode, so for the Home Screen app the app's own code is served
//    with "(display-mode: standalone)" read as always true.
// 4. Breathe (Tim, 26 Nov; NEXT-BREATHE.md, option D): on a laptop the menu's
//    plain item above My Account, nothing floating; on a phone a 48px round
//    button bottom right with no word, upright or turned; both open Breathe.
// 5. The button's fine ring: breathing over 8 seconds, no coral, still with
//    reduced motion.
// 6. Chat to [coach]: with one way (opens it), two ways (a small list),
//    no coach, a coach with no way the portal can open, and offline.
// 7. Measured against the 25 Nov reference (.mission, .phonehead; Polish 1
//    replaced M2 and M3's header): the box 40px high with 14px sides, 13px
//    words, 12px corners and a 1px line; on a phone the crosshair beside it.
//
// The header doesn't depend on the day or the time, so the clock isn't
// fixed and the seed isn't changed.
import { accountsText, TEST_HOST as TARGET_HOST } from '../target.mjs';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = TARGET_HOST;
const TEST_HOST = TARGET_HOST;
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
const note = (s) => notes.push(`NOTE  ${s}`);

const env = {};
for (const line of accountsText().split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return v;
}

const LONG = Array.from({ length: 40 }, (_, i) => `Lead with clarity and care in season ${i + 1}`).join(' ').slice(0, 1000);
if (LONG.length !== 1000) throw new Error('The long mission should be 1,000 characters.');
const NO_MISSION = 'Add your Mission when you’re ready';
const COACH_ID = '00000000-0000-4000-8000-000000000001';
const MOBILE = '+447700900123'; // an invented number (Ofcom's drama range)

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
let storage = null;

// mission: undefined leaves the plan as saved; null or text replaces it in
// the answers. coach: undefined, the database's answer (no coach on the
// test database); null, none; or { name, ways, mobile }.
async function newContext({ width = 1280, height, mode = 'dark', touch, mission, coach, reduced = false } = {}) {
  const phone = touch ?? width < 769;
  const context = await browser.newContext({
    viewport: { width, height: height || (width < 769 ? 844 : 900) },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    storageState: storage || undefined,
  });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
    // Chat links are recorded, never opened.
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  }, mode);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    const method = route.request().method();
    if (url.includes(TEST_HOST) && /\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Nothing in this test writes; a write would be a bug.
      pass(`no writes (${method} ${new URL(url).pathname})`, false);
      return route.abort();
    }
    if (coach !== undefined && /\/rest\/v1\/rpc\/my_coach/.test(url)) {
      const body = coach ? [{ coach_id: COACH_ID, first_name: coach.name, mobile: 'mobile' in coach ? coach.mobile : MOBILE, contact_ways: coach.ways, away_until: null }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (mission !== undefined && /\/rest\/v1\/performance_plans\?/.test(url) && /status=eq\.active/.test(url)) {
      // A read still on its way when the page is closed has nowhere to go: leave it.
      const res = await route.fetch().catch(() => null);
      if (!res) return null;
      let body = await res.json();
      const set = (r) => (r && typeof r === 'object' ? { ...r, mission } : r);
      body = Array.isArray(body) ? body.map(set) : set(body);
      return route.fulfill({ response: res, body: JSON.stringify(body) });
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px)`, false, e.message));
  return { context, page };
}

// Signs in once; later contexts start from that session.
async function signIn() {
  const { context, page } = await newContext({ width: 1280 });
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  storage = await context.storageState();
  await context.close();
}

const path = (page) => new URL(page.url()).pathname;
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`) });
}
async function open(page, route = '/welcome') {
  await page.goto(`${APP}${route}`);
  // The header is hidden on a laptop since Polish 1 (the frame's menu column instead): wait for it to be drawn.
  await page.waitForSelector('.hdr', { state: 'attached', timeout: 30000 });
  await until(async () => (await page.locator('.ds-loading').count()) === 0, 20000);
  await sleep(400);
}
// Polish 1: My Mission is the frame header's box on every width (DesignHeader's .hdr-mbox).
const pillSel = () => '.hdr-frame .hdr-mbox';

// Everything about the box as laid out.
function readPill(page, sel) {
  return page.evaluate((s) => {
    const pill = document.querySelector(s);
    if (!pill) return null;
    const words = pill.querySelector('b');
    const cs = words ? getComputedStyle(words) : null;
    const hdr = pill.closest('.hdr');
    const pr = pill.getBoundingClientRect();
    const frameMain = document.querySelector('.ds-frame-main');
    return {
      wordsShown: Boolean(words) && cs.visibility !== 'hidden' && words.getBoundingClientRect().width > 0,
      labelShown: /^My Mission/.test(pill.textContent.trim()),
      oneLine: words ? Math.abs(words.getBoundingClientRect().height - parseFloat(cs.lineHeight || words.getBoundingClientRect().height)) < 2 || words.getBoundingClientRect().height < 24 : true,
      cut: words ? words.scrollWidth > words.clientWidth + 1 : false,
      ellipsisWhenCut: words ? cs.textOverflow === 'ellipsis' : false,
      text: words ? words.textContent : '',
      colour: cs ? cs.color : '',
      // Polish 1 Stage B: small grey words are the secondary grey (--text-2), not the placeholder grey.
      grey: getComputedStyle(pill.closest('.ui-root')).getPropertyValue('--text-2').trim(),
      pageSideways: document.documentElement.scrollWidth > window.innerWidth,
      pillHeight: pr.height,
      inside: hdr ? pr.bottom <= hdr.getBoundingClientRect().bottom + 0.5 || (frameMain && pr.bottom <= frameMain.getBoundingClientRect().bottom) : false,
      inRow: pr.right <= window.innerWidth + 0.5 && pr.left >= -0.5,
    };
  }, sel);
}
function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

await signIn();

// ---------------------------------------------------------------- 1: the pill
if (part(1)) {
  for (const width of [320, 360, 390, 1280]) {
    for (const [kind, mission] of [['saved', undefined], ['1,000 characters', LONG], ['none', null]]) {
      const { context, page } = await newContext({ width, mission });
      // A laptop (walk fixes, 27 Nov, item 5): no My Mission box in the header; the Mission line under Home's title.
      if (width >= 1024) {
        try {
          await open(page);
          const at = `${width}px, ${kind}`;
          await page.waitForSelector('.ds-mline', { timeout: 15000 });
          if (mission === null) await until(async () => (await page.locator('.ds-mline-v').innerText()).includes(NO_MISSION), 10000);
          if (mission === LONG) await until(async () => (await page.locator('.ds-mline-v').textContent()) === LONG, 10000);
          const l = await page.evaluate(() => {
            const box = document.querySelector('.hdr-frame .hdr-mbox');
            const v = document.querySelector('.ds-mline-v');
            const cs = getComputedStyle(v);
            return {
              boxShown: Boolean(box) && box.getBoundingClientRect().width > 0 && getComputedStyle(box).display !== 'none',
              text: v.textContent,
              oneLine: v.getBoundingClientRect().height < parseFloat(cs.lineHeight) * 1.5,
              cut: v.scrollWidth > v.clientWidth + 1,
              ellipsis: cs.textOverflow === 'ellipsis',
              sideways: document.documentElement.scrollWidth > window.innerWidth,
            };
          });
          pass(`My Mission ${at}: no box in the header on a laptop (walk fixes, item 5)`, !l.boxShown, JSON.stringify(l));
          pass(`My Mission ${at}: the Mission line on one line, ending with "…" when it doesn't fit`, l.oneLine && (!l.cut || l.ellipsis) && !l.sideways, JSON.stringify(l));
          if (mission === null) pass(`My Mission ${at}: "${NO_MISSION}" shows`, l.text === NO_MISSION, l.text);
          else if (mission === LONG) pass(`My Mission ${at}: the long Mission is cut with "…"`, l.cut && l.ellipsis, JSON.stringify(l));
          else pass(`My Mission ${at}: the Mission shows`, l.text.length > 0, l.text);
          await shot(page, `mline-${width}-${kind.replace(/\W+/g, '')}`);
        } finally {
          await context.close();
        }
        continue;
      }
      try {
        await open(page);
        const sel = pillSel(width);
        await page.waitForSelector(sel, { timeout: 15000 });
        if (mission === null) await until(async () => (await page.locator(sel).innerText()).includes(NO_MISSION), 10000);
        if (mission === LONG) await until(async () => (await page.locator(`${sel} b`).textContent()) === LONG, 10000);
        const p = await readPill(page, sel);
        const at = `${width}px, ${kind}`;
        pass(`My Mission ${at}: a 40px box`, Math.abs(p.pillHeight - 40) < 0.5, `${p.pillHeight}`);
        pass(`My Mission ${at}: no sideways scroll, and the box stays on the screen`, !p.pageSideways && p.inRow, JSON.stringify(p));
        pass(`My Mission ${at}: one line, ending with "…" when it doesn't fit`, p.oneLine && (!p.cut || p.ellipsisWhenCut), JSON.stringify(p));
        pass(`My Mission ${at}: inside the header`, p.inside);
        pass(`My Mission ${at}: "My Mission" first`, p.labelShown);
        if (mission === null) {
          pass(`My Mission ${at}: "${NO_MISSION}" shows`, p.wordsShown && p.text === NO_MISSION, JSON.stringify(p));
          pass(`My Mission ${at}: in grey (--text-2)`, p.colour === hexToRgb(p.grey), `${p.colour} vs ${p.grey}`);
        } else if (mission === LONG) {
          pass(`My Mission ${at}: the long Mission is cut with "…"`, p.cut && p.ellipsisWhenCut, JSON.stringify(p));
        } else {
          pass(`My Mission ${at}: the Mission shows`, p.wordsShown && p.text.length > 0, JSON.stringify(p));
        }
        await shot(page, `pill-${width}-${kind.replace(/\W+/g, '')}`);

        // It opens the plan at its My Mission card (walk fixes, 27 Nov, item 5; missionPlace.js), where the Mission is in full.
        if (mission === LONG && width === 390) {
          await page.locator(sel).click();
          const landed = await until(async () => path(page) === '/performance-plan' && new URL(page.url()).hash === '#my-mission', 15000);
          pass(`pill ${at}: tapping it opens the plan at My Mission (/performance-plan#my-mission)`, Boolean(landed), page.url());
          await shot(page, `pill-${width}-long-open`);
        }
      } finally {
        await context.close();
      }
    }
  }
}

// ---------------------------------------------------------------- 2: no mission opens the plan's mission step
if (part(2)) {
  for (const width of [390, 1280]) {
    const { context, page } = await newContext({ width, mission: null });
    try {
      await open(page);
      // The box on a phone, the Mission line under Home's title on a laptop (walk fixes, 27 Nov, item 5).
      const sel = width >= 1024 ? '.ds-mline' : pillSel(width);
      await until(async () => (await page.locator(sel).innerText()).includes(NO_MISSION), 10000);
      await page.locator(sel).click();
      // The test client has a plan, so it opens the plan's My Mission card, where the Mission is added (missionPlace.js).
      const landed = await until(async () => path(page) === '/performance-plan' && new URL(page.url()).hash === '#my-mission', 20000);
      pass(`no mission ${width}px: opens the plan at My Mission (/performance-plan#my-mission)`, Boolean(landed), page.url());
      const card = await until(async () => page.evaluate(() => {
        const el = document.getElementById('my-mission');
        if (!el) return false;
        const b = el.getBoundingClientRect();
        return b.top < window.innerHeight && b.bottom > 0;
      }), 20000);
      pass(`no mission ${width}px: the My Mission card is in view`, Boolean(card));
      pass(`no mission ${width}px: never the old Personal Operating Plan page`, !path(page).startsWith('/personal-operating-plan'));
      await shot(page, `no-mission-step-${width}`);
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 3: the notch
// Every element near the top that people see or tap, outside the insets.
function outsideInsets(page, inset) {
  return page.evaluate((s) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const bad = [];
    const seen = document.querySelectorAll('button, a, h1, h2, h3, img, svg, input, [role=button], p, label, .ds-page-title, .ds-guide-bar *');
    for (const e of seen) {
      const r = e.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      if (r.bottom <= 0 || r.top >= Math.min(H, 220) || r.right <= 0 || r.left >= W) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.closest('[inert], [aria-hidden="true"]')) continue;
      if (r.top < s.top - 0.5 || r.left < s.left - 0.5 || r.right > W - s.right + 0.5) {
        bad.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} (${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)})`);
      }
    }
    return { bad: bad.slice(0, 4), count: bad.length, sideways: document.documentElement.scrollWidth > W };
  }, inset);
}

if (part(3)) {
  const CASES = [
    { name: 'Safari, upright, notch', width: 390, height: 844, inset: { top: 0, left: 0, right: 0, bottom: 34 }, standalone: false },
    { name: 'Safari, turned, notch', width: 844, height: 390, inset: { top: 0, left: 47, right: 47, bottom: 21 }, standalone: false },
    { name: 'Safari, upright, top inset given', width: 393, height: 852, inset: { top: 59, left: 0, right: 0, bottom: 34 }, standalone: false, headerOnly: true },
    { name: 'Home Screen app, upright, notch', width: 390, height: 844, inset: { top: 47, left: 0, right: 0, bottom: 34 }, standalone: true },
    { name: 'Home Screen app, upright, Dynamic Island', width: 393, height: 852, inset: { top: 59, left: 0, right: 0, bottom: 34 }, standalone: true },
    { name: 'Home Screen app, turned, Dynamic Island', width: 852, height: 393, inset: { top: 0, left: 59, right: 59, bottom: 21 }, standalone: true },
  ];
  const PAGES = ['/welcome', '/personal', '/performance-sprint', '/performance-plan', '/my-account', '/breathe', '/plan-my-day'];
  const HEADER_PAGES = ['/welcome', '/personal', '/performance-sprint', '/my-account'];
  for (const c of CASES) {
    const { context, page } = await newContext({ width: c.width, height: c.height, touch: true });
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.inset });
      if (c.standalone) {
        await context.route(`${APP}/src/**`, async (route) => {
          const res = await route.fetch();
          const body = await res.text();
          return route.fulfill({ response: res, body: body.replaceAll('(display-mode: standalone)', '(min-width: 0px)') });
        });
      }
      await page.goto(`${APP}/welcome`);
      await page.waitForSelector('.hdr', { timeout: 30000 });
      const media = await page.evaluate(() => ({
        rootTop: Number.parseFloat(getComputedStyle(document.getElementById('root')).paddingTop),
        coarse: matchMedia('(pointer: coarse)').matches,
      }));
      pass(`notch, ${c.name}: emulated (${c.standalone ? 'the page starts below the top inset, ' : ''}coarse pointer)`,
        media.coarse && media.rootTop === (c.standalone ? c.inset.top : 0), JSON.stringify(media));
      for (const route of (c.headerOnly ? HEADER_PAGES : PAGES)) {
        await page.goto(`${APP}${route}`);
        await until(async () => (await page.locator('.ds-page-title, .ds-guide-bar, .hdr').count()) > 0, 20000);
        await until(async () => (await page.locator('.ds-loading').count()) === 0, 15000);
        await sleep(400);
        const r = await outsideInsets(page, c.inset);
        pass(`notch, ${c.name}, ${route}: nothing under the insets`, r.count === 0, r.bad.join('; '));
        pass(`notch, ${c.name}, ${route}: no sideways scroll`, !r.sideways);
      }
      await page.goto(`${APP}/welcome`);
      await page.waitForSelector('.hdr');
      await sleep(400);
      const top = await page.evaluate(() => Math.round(document.querySelector('.hdr').getBoundingClientRect().top + Number.parseFloat(getComputedStyle(document.querySelector('.hdr')).paddingTop)));
      pass(`notch, ${c.name}: the top bar's content starts below the top inset`, top >= c.inset.top, `${top}px`);
      await shot(page, `notch-${c.name.replace(/\W+/g, '-')}`);
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 4: the floating Breathe button
// Tim, 26 Nov (decisions part 12; NEXT-BREATHE.md, option D): on a laptop Breathe is the menu's plain item above My
// Account and nothing floats; under 1024px a 48px round button bottom right (the card colour, a 1px line, no word,
// aria-label "Breathe", the fine two-circle ring breathing 0.7 to 1.15 over 8 seconds), no coral.
if (part(4)) {
  {
    const { context, page } = await newContext({ width: 1280 });
    try {
      await open(page);
      pass('Breathe: nothing floats on a laptop', (await page.locator('.ds-orb--fixed .ds-breathe:visible').count()) === 0);
      const items = await page.evaluate(() => [...document.querySelectorAll('.ds-frame-side .ds-mi')].map((e) => ({ t: e.textContent.trim(), l: Math.round(e.getBoundingClientRect().left) })));
      const at = items.findIndex((i) => i.t === 'Breathe');
      pass('Breathe: a plain menu item above My Account, lined up', at >= 0 && items[at + 1]?.t === 'My Account' && items.every((i) => i.l === items[0].l), JSON.stringify(items.map((i) => i.t)));
      await shot(page, 'breathe-menu-desktop');
      await page.locator('.ds-frame-side .ds-mi', { hasText: 'Breathe' }).click();
      pass('Breathe: the menu item opens Breathe', Boolean(await until(async () => path(page) === '/breathe', 10000)));
    } finally {
      await context.close();
    }
  }
  for (const [w, h, label] of [[390, 844, 'phone upright'], [844, 390, 'phone turned']]) {
    const { context, page } = await newContext({ width: w, height: h, touch: true });
    try {
      await open(page);
      const br = await page.evaluate(() => { const els = [...document.querySelectorAll('.ds-breathe')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'); const r = els[0]?.getBoundingClientRect(); const s = els[0] && getComputedStyle(els[0]); return { n: els.length, r: r && { left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height }, radius: s?.borderRadius, label: els[0]?.getAttribute('aria-label'), text: els[0]?.innerText.trim(), w: innerWidth, h: innerHeight }; });
      pass(`Breathe button: one on a ${label}, at the bottom right and on the screen`, br.n === 1 && br.r.right <= br.w && br.r.left > br.w / 2 && br.r.bottom <= br.h && br.r.bottom > br.h * 0.75, JSON.stringify(br));
      pass(`Breathe button: a 48px circle with no word, named "Breathe" (${label})`, Math.abs(br.r.w - 48) < 0.6 && Math.abs(br.r.h - 48) < 0.6 && br.radius === '50%' && !br.text && br.label === 'Breathe', JSON.stringify(br));
      if (label === 'phone upright') {
        pass('Breathe button: 20px from the right and bottom', Math.abs(br.w - br.r.right - 20) < 1 && Math.abs(br.h - br.r.bottom - 20) < 1, JSON.stringify(br.r));
        await shot(page, 'breathe-button-phone');
        await sleep(500);
        await page.locator('.ds-orb--fixed .ds-breathe').click();
        pass('Breathe button: opens Breathe', Boolean(await until(async () => path(page) === '/breathe', 10000)));
      }
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 5: the button's ring
if (part(5)) {
  const { context, page } = await newContext({ width: 390, height: 844, touch: true });
  try {
    await open(page);
    const read = () => page.evaluate(() => {
      const ring = document.querySelector('.ds-orb--fixed .ds-breathe-ring');
      const s = ring && getComputedStyle(ring);
      return { w: ring?.getBoundingClientRect().width, anim: s && `${s.animationName} ${s.animationDuration}`, stroke: s?.stroke, edge: getComputedStyle(ring.closest(".ds-breathe")).boxShadow };
    });
    const sizes = [];
    for (let i = 0; i < 3; i += 1) { sizes.push((await read()).w); await sleep(700); }
    const r = await read();
    pass('ring: breathes over 8 seconds (its size changes)', r.anim === 'ds-breathe-ring 8s' && new Set(sizes).size > 1, `${r.anim}; ${sizes.join(', ')}`);
    // The brand coral and light mode's deeper coral, in either mode.
    pass('ring: no coral in the button', ![r.stroke, r.edge].some((c) => /rgb\((255, 111, 92|194, 65, 46|168, 78, 40)\)/.test(c)), JSON.stringify(r));
  } finally {
    await context.close();
  }
  {
    const { context, page } = await newContext({ width: 390, height: 844, touch: true, reduced: true });
    try {
      await open(page);
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.ds-orb--fixed .ds-breathe-ring')).animationName);
      pass('ring, reduced motion: still', anim === 'none', anim);
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 6: Chat to [coach]
// Polish 1 (25 Nov reference, the lead's call): inside the frame, Chat sits at the laptop panel's top right beside My
// Mission (DesignHeader's .hdr-frame-chat), out of the page's flow; the older .hdr-desktop header isn't drawn there.
async function chatButton(page) {
  return page.locator('.hdr-frame-chat .ds-chat');
}
if (part(6)) {
  {
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Rhys', ways: ['whatsapp'] } });
    try {
      await open(page);
      const b = await chatButton(page);
      await until(async () => (await b.count()) === 1, 10000);
      pass('chat, one way: "Chat to Rhys"', (await b.innerText()).trim() === 'Chat to Rhys', await b.innerText());
      const pos = await page.evaluate(() => {
        const r = document.querySelector('.hdr-frame-chat .ds-chat').getBoundingClientRect();
        const h = document.querySelector('.ds-frame-main').getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(document.querySelector('.ds-frame-main')).paddingRight);
        return { right: h.right - r.right, pad, top: r.top - h.top, height: r.height };
      });
      pass('chat: top right of the laptop panel, on its padding', Math.abs(pos.right - pos.pad) <= 1 && pos.top > 0 && pos.top < pos.pad, JSON.stringify(pos));
      pass('chat: a 44px tap area', pos.height >= 44, `${pos.height}`);
      note('Chat: 44px tall with a coral edge on hover, as breathe-orb.html (29 Oct); M2 draws it 40px with a grey hover edge.');
      await b.click();
      const opened = await until(async () => (await page.evaluate(() => window.__opened))[0], 5000);
      pass('chat, one way: opens WhatsApp at once', /^https:\/\/wa\.me\/447700900123\?text=/.test(opened || ''), opened);
      pass('chat, one way: no list', (await page.locator('[role=dialog]').count()) === 0);
      await shot(page, 'chat-one-way');
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Tim', ways: ['email', 'whatsapp', 'imessage'] } });
    try {
      await open(page);
      const b = await chatButton(page);
      await until(async () => (await b.count()) === 1, 10000);
      pass('chat, two ways: "Chat to Tim", never "Dr."', (await b.innerText()).trim() === 'Chat to Tim');
      await b.click();
      const list = page.locator('[role=dialog]');
      await until(async () => (await list.count()) === 1, 5000);
      const words = (await list.innerText()).replace(/\s+/g, ' ');
      pass('chat, two ways: a small list of WhatsApp and iMessage', words.includes('WhatsApp') && words.includes('iMessage') && !/email/i.test(words), words);
      await shot(page, 'chat-two-ways');
      await list.getByText('WhatsApp', { exact: true }).click();
      const opened = await until(async () => (await page.evaluate(() => window.__opened))[0], 5000);
      pass('chat, two ways: the chosen one opens', /^https:\/\/wa\.me\//.test(opened || ''), opened);
    } finally {
      await context.close();
    }
  }
  for (const [label, coach] of [['no coach', null], ['a coach with only email stored', { name: 'Tim', ways: ['email'] }], ['a coach with no mobile', { name: 'Tim', ways: ['whatsapp'], mobile: null }], ['no coach on the test database', undefined]]) {
    const { context, page } = await newContext({ width: 1280, coach });
    try {
      await open(page);
      await sleep(1500);
      pass(`chat, ${label}: nothing shows`, (await page.locator('.ds-chat').count()) === 0);
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Rhys', ways: ['whatsapp'] } });
    try {
      await open(page);
      const b = await chatButton(page);
      await until(async () => (await b.count()) === 1, 10000);
      await context.setOffline(true);
      await b.click();
      const toast = await until(async () => {
        const t = page.locator('.ds-toast');
        return (await t.count()) ? (await t.first().innerText()) : '';
      }, 5000);
      pass('chat, offline: says calmly that it needs a connection', (toast || '').includes('Chat needs a connection, so try again when you’re back online.'), toast);
      pass('chat, offline: nothing opens', (await page.evaluate(() => window.__opened)).length === 0);
      await shot(page, 'chat-offline');
      await page.reload().catch(() => null);
      await context.setOffline(false);
    } finally {
      await context.close();
    }
  }
  {
    // The coach can't be fetched (no connection): the device's copy from
    // the last visit still shows the button. (Opening the whole portal
    // with no connection comes in Step 8.)
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Rhys', ways: ['whatsapp'] } });
    try {
      await open(page);
      await until(async () => (await page.locator('.hdr-frame-chat .ds-chat').count()) === 1, 10000);
      const again = await context.newPage();
      await again.route('**/rest/v1/rpc/my_coach*', (route) => route.abort('internetdisconnected'));
      await open(again);
      await sleep(1500);
      pass('chat, coach not reachable: the device’s copy still shows the button', (await again.locator('.hdr-frame-chat .ds-chat').count()) === 1);
    } finally {
      await context.close();
    }
  }
  {
    // A phone: in My Account, not the header.
    const { context, page } = await newContext({ width: 390, coach: { name: 'Rhys', ways: ['whatsapp'] } });
    try {
      // Polish 1: My Account's Coaching tab holds it (one section at a time).
      await open(page, '/my-account?tab=coaching');
      pass('chat, phone: not in the header', (await page.locator('.hdr .ds-chat:visible').count()) === 0);
      pass('chat, phone: in My Account', Boolean(await until(async () => (await page.locator('.account-page').getByRole('button', { name: 'Chat to Rhys' }).count()) === 1, 10000)));
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 7: against the 25 Nov reference
if (part(7)) {
  // The box is the phone header's only (walk fixes, 27 Nov, item 5): a laptop has the Mission line instead (part 1).
  for (const [width, mode] of [[390, 'dark'], [390, 'light']]) {
    const { context, page } = await newContext({ width, mode, coach: { name: 'Tim', ways: ['whatsapp'] } });
    try {
      await open(page);
      await page.waitForSelector('.hdr-frame .hdr-mbox', { timeout: 15000 });
      const m = await page.evaluate(() => {
        const px = (v) => Math.round(Number.parseFloat(v) * 10) / 10;
        const box = document.querySelector('.hdr-frame .hdr-mbox');
        const bs = getComputedStyle(box);
        const menu = document.querySelector('.hdr-frame .hdr-frame-menu');
        const menuShown = Boolean(menu) && getComputedStyle(menu).display !== 'none' && menu.getBoundingClientRect().width > 0;
        return {
          height: px(box.getBoundingClientRect().height),
          padX: [px(bs.paddingLeft), px(bs.paddingRight)],
          size: px(bs.fontSize),
          radius: px(bs.borderTopLeftRadius),
          line: px(bs.borderTopWidth),
          family: bs.fontFamily,
          menuShown,
        };
      });
      const at = `${width}px ${mode}`;
      pass(`reference ${at}: My Mission is 40px high`, m.height === 40, `${m.height}`);
      pass(`reference ${at}: 14px in at each side`, m.padX[0] === 14 && m.padX[1] === 14, JSON.stringify(m.padX));
      pass(`reference ${at}: 13px words in DM Sans`, m.size === 13 && /DM Sans/.test(m.family) && !/Nekst/.test(m.family), `${m.size} ${m.family}`);
      pass(`reference ${at}: 12px corners and a 1px line`, m.radius === 12 && m.line === 1, JSON.stringify(m));
      pass(`reference ${at}: ${width < 1024 ? 'the crosshair beside it opens the menu' : 'no crosshair in the header (the menu is the frame\'s column)'}`, m.menuShown === (width < 1024), JSON.stringify(m));
      await shot(page, `reference-header-${width}-${mode}`);
    } finally {
      await context.close();
    }
  }
  note('My Mission: one line with "…" when it doesn\'t fit, as the 25 Nov reference draws it (replaces the two-line pill); its edge keeps rule 8a\'s 3 to 1 (--field-line), where the reference draws --line (the lead\'s call).');
}

console.log(results.join('\n'));
if (notes.length) console.log(`\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
await browser.close();
process.exit(failures ? 1 : 0);
