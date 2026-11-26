// Phase 4 step 3: the header, the My Mission pill, the notch, the floating
// Breathe button and "Chat to [coach's first name]", in the running app,
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked). Nothing is written to the
// database: the mission and the coach are changed in the answers the app
// receives, never in the tables.
//
//   node --import ./tests/scores/register.mjs tests/phase4/header.mjs [folder for screenshots]
//
// 1. My Mission at 320, 360, 390 and 1280 wide, with the real mission, a
//    1,000-character one and none. Since Polish 1 (25 Nov reference .mission;
//    replaces the two-line pill) it is one 40px box with a thin line in the
//    frame's header: "My Mission" then the Mission on one line, ending with
//    an ellipsis when it doesn't fit (the reference's own text-overflow), no
//    sideways scroll, and it opens the full text. With no mission: grey
//    "Add your Mission when you’re ready".
// 2. With no mission, the pill opens the new plan's mission step, on a
//    phone and on desktop, never the old Personal Operating Plan page.
// 3. The notch: safe-area insets emulated through Chromium's DevTools
//    (Emulation.setSafeAreaInsetsOverride), as Safari and as a Home Screen
//    app (display-mode: standalone emulated), portrait and landscape, with
//    a notch (47px) and the Dynamic Island (59px). On every page checked,
//    nothing near the top sits under the insets. Chromium can't emulate
//    display-mode, so for the Home Screen app the app's own code is served
//    with "(display-mode: standalone)" read as always true.
// 4. The floating Breathe button: desktop only, 60px with the 44px orb
//    (breathe-orb.html), opens Breathe; on a phone too since Polish 1 Stage B,
//    at the bottom right, upright or turned.
// 5. The orb choice: Rings to start with, Level when chosen, still at half
//    a breath with reduced motion.
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
  await page.waitForSelector('.hdr', { timeout: 30000 });
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

        // It opens the full text.
        if (mission === LONG && (width === 390 || width === 1280)) {
          await page.locator(sel).click();
          const full = await until(async () => {
            const d = page.locator('[role=dialog]').filter({ hasText: LONG.slice(0, 40) });
            return (await d.count()) ? (await d.first().innerText()).replace(/\s+/g, ' ').includes(LONG.slice(-60).trim()) : false;
          }, 15000);
          pass(`pill ${at}: tapping it opens the full mission`, Boolean(full));
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
      const sel = pillSel(width);
      await until(async () => (await page.locator(sel).innerText()).includes(NO_MISSION), 10000);
      await page.locator(sel).click();
      const landed = await until(async () => /^\/performance-plan\/(build|edit)$/.test(path(page)) && new URL(page.url()).search === '?step=mission', 20000);
      pass(`no mission ${width}px: opens /performance-plan/…?step=mission`, Boolean(landed), page.url());
      const question = await until(async () => {
        const q = page.locator('.ds-guide-question');
        return (await q.count()) && (await q.first().innerText()).includes('What’s your Mission?');
      }, 20000);
      pass(`no mission ${width}px: the mission step ("What’s your Mission?")`, Boolean(question));
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
if (part(4)) {
  {
    const { context, page } = await newContext({ width: 1280 });
    try {
      await open(page);
      const b = page.locator('.ds-orb--fixed .ds-breathe');
      pass('Breathe button: on desktop', await b.isVisible());
      pass('Breathe button: the word "Breathe"', (await b.innerText()).trim().toLowerCase() === 'breathe');
      const m = await page.evaluate(() => {
        const btn = document.querySelector('.ds-orb--fixed .ds-breathe').getBoundingClientRect();
        const orb = document.querySelector('.ds-orb--fixed .ds-borb').getBoundingClientRect();
        return { h: btn.height, orb: orb.width, right: window.innerWidth - btn.right, bottom: window.innerHeight - btn.bottom, family: getComputedStyle(document.querySelector('.ds-orb--fixed .ds-breathe')).fontFamily };
      });
      pass('Breathe button: 60px pill (breathe-orb.html)', Math.abs(m.h - 60) < 0.6, `${m.h}`);
      pass('Breathe button: 44px orb (breathe-orb.html)', Math.abs(m.orb - 44) < 0.6, `${m.orb}`);
      pass('Breathe button: 24px from the right and bottom', Math.abs(m.right - 24) < 1 && Math.abs(m.bottom - 24) < 1, JSON.stringify(m));
      // Its word as every button's since 18 Nov (Tim: no Nekst capitals on buttons); the pill keeps its 60px for the orb.
      pass('Breathe button: its word in DM Sans', /^"?DM Sans/.test(m.family), m.family);
      note('Breathe button: 60px with a 44px orb, as breathe-orb.html (29 Oct), newer than M2 and M3 (56px, 48px orb).');
      await b.hover();
      const coral = await page.evaluate(() => getComputedStyle(document.querySelector('.ds-orb--fixed')).getPropertyValue('--coral').trim());
      const edge = await until(async () => {
        const e = await page.evaluate(() => getComputedStyle(document.querySelector('.ds-orb--fixed .ds-breathe')).borderColor);
        return e === hexToRgb(coral) ? e : null;
      }, 3000);
      pass('Breathe button: the edge turns coral on hover', Boolean(edge), coral);
      await shot(page, 'breathe-button-desktop');
      await b.click();
      pass('Breathe button: opens Breathe', Boolean(await until(async () => path(page) === '/breathe', 10000)));
    } finally {
      await context.close();
    }
  }
  for (const [w, h, label] of [[390, 844, 'phone upright'], [844, 390, 'phone turned']]) {
    const { context, page } = await newContext({ width: w, height: h, touch: true });
    try {
      await open(page);
      // Polish 1 Stage B (walk item 5): Breathe shows on a phone too, at the bottom right, on the screen.
      const br = await page.evaluate(() => { const els = [...document.querySelectorAll('.ds-breathe')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'); const r = els[0]?.getBoundingClientRect(); return { n: els.length, r: r && { left: r.left, right: r.right, bottom: r.bottom }, w: innerWidth, h: innerHeight }; });
      pass(`Breathe button: one on a ${label}, at the bottom right and on the screen`, br.n === 1 && br.r.right <= br.w && br.r.left > br.w / 2 && br.r.bottom <= br.h && br.r.bottom > br.h * 0.75, JSON.stringify(br));
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 5: the orb choice
if (part(5)) {
  const { context, page } = await newContext({ width: 1280 });
  try {
    await open(page);
    const style = () => page.locator('.ds-orb--fixed .ds-borb').getAttribute('data-orb-style');
    pass('orb: Rings is the starting choice', (await style()) === 'rings');
    pass('orb: Rings has the crosshair', (await page.locator('.ds-orb--fixed .ds-borb-cross').count()) === 1);
    const sizes = [];
    for (let i = 0; i < 3; i += 1) {
      sizes.push(await page.evaluate(() => document.querySelector('.ds-orb--fixed .ds-borb-art circle:last-of-type')?.getAttribute('r')));
      await sleep(700);
    }
    pass('orb: Rings breathes (its size changes)', new Set(sizes).size > 1, sizes.join(', '));
    await page.evaluate(() => localStorage.setItem('clarity-orb-style', 'level'));
    await page.reload();
    await page.waitForSelector('.ds-orb--fixed .ds-borb');
    pass('orb: Level when chosen', (await style()) === 'level');
    pass('orb: Level is a gauge (no crosshair, a clipped fill)', (await page.locator('.ds-orb--fixed .ds-borb-cross').count()) === 0 && (await page.locator('.ds-orb--fixed .ds-borb-art clipPath').count()) === 1);
    await shot(page, 'orb-level');
    await page.evaluate(() => localStorage.setItem('clarity-orb-style', 'something else'));
    await page.reload();
    await page.waitForSelector('.ds-orb--fixed .ds-borb');
    pass('orb: an unknown choice falls back to Rings', (await style()) === 'rings');
  } finally {
    await context.close();
  }
  {
    const { context, page } = await newContext({ width: 1280, reduced: true });
    try {
      await open(page);
      const read = () => page.evaluate(() => {
        const core = document.querySelector('.ds-orb--fixed .ds-borb-art circle:last-of-type');
        return { r: core?.getAttribute('r'), o: core?.getAttribute('stroke-opacity') };
      });
      const a = await read();
      await sleep(1500);
      const b = await read();
      pass('orb, reduced motion: still at half a breath', a.r === '16.50' && b.r === '16.50', `${a.r}, ${b.r}`);
      pass('orb, reduced motion: fades with the breath', a.o !== b.o, `${a.o}, ${b.o}`);
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
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Adie', ways: ['whatsapp'] } });
    try {
      await open(page);
      const b = await chatButton(page);
      await until(async () => (await b.count()) === 1, 10000);
      pass('chat, one way: "Chat to Adie"', (await b.innerText()).trim() === 'Chat to Adie', await b.innerText());
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
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Adie', ways: ['whatsapp'] } });
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
    const { context, page } = await newContext({ width: 1280, coach: { name: 'Adie', ways: ['whatsapp'] } });
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
    const { context, page } = await newContext({ width: 390, coach: { name: 'Adie', ways: ['whatsapp'] } });
    try {
      // Polish 1: My Account's Coaching tab holds it (one section at a time).
      await open(page, '/my-account?tab=coaching');
      pass('chat, phone: not in the header', (await page.locator('.hdr .ds-chat:visible').count()) === 0);
      pass('chat, phone: in My Account', Boolean(await until(async () => (await page.locator('.account-page').getByRole('button', { name: 'Chat to Adie' }).count()) === 1, 10000)));
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 7: against the 25 Nov reference
if (part(7)) {
  for (const [width, mode] of [[1280, 'dark'], [1280, 'light'], [390, 'dark'], [390, 'light']]) {
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
