// Phase 4 step 3: the header, the My Mission pill, the notch, the floating
// Breathe button and "Chat to [coach's first name]", in the running app,
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked). Nothing is written to the
// database: the mission and the coach are changed in the answers the app
// receives, never in the tables.
//
//   node --import ./tests/scores/register.mjs tests/phase4/header.mjs [folder for screenshots]
//
// 1. The pill at 320, 360, 390 and 1280 wide, with the real mission, a
//    1,000-character one and none: never "…" (no text-overflow: ellipsis,
//    no "…" character), at most two lines, "My Mission" alone when it
//    doesn't fit or under 360px, no sideways scroll, and it opens the full
//    text. With no mission: grey "Add your mission when you’re ready".
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
//    (breathe-orb.html), opens Breathe; none on a phone, upright or turned.
// 5. The orb choice: Rings to start with, Level when chosen, still at half
//    a breath with reduced motion.
// 6. Chat to [coach]: with one way (opens it), two ways (a small list),
//    no coach, a coach with no way the portal can open, and offline.
// 7. Measured against M2 and M3 (and breathe-orb.html, newer, for the
//    button); approved differences are listed as NOTE.
//
// The header doesn't depend on the day or the time, so the clock isn't
// fixed and the seed isn't changed.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
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
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
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
const NO_MISSION = 'Add your mission when you’re ready';
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
      const res = await route.fetch();
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
const pillSel = (width) => (width < 769 ? '.hdr-phone .hdr-mis' : '.hdr-desktop .hdr-mis');

// Everything about the pill as laid out.
function readPill(page, sel) {
  return page.evaluate((s) => {
    const pill = document.querySelector(s);
    if (!pill) return null;
    const words = pill.querySelector('.hdr-mis-text');
    const label = pill.querySelector('.hdr-mis-label');
    const cs = words ? getComputedStyle(words) : null;
    const line = cs ? Number.parseFloat(cs.lineHeight) : 0;
    const pad = cs ? Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom) : 0;
    const hdr = document.querySelector('.hdr');
    const ellipsis = [...hdr.querySelectorAll('*')].some((e) => getComputedStyle(e).textOverflow === 'ellipsis');
    const pr = pill.getBoundingClientRect();
    return {
      wordsShown: Boolean(words) && cs.visibility !== 'hidden' && words.getBoundingClientRect().height > 0,
      labelShown: Boolean(label) && getComputedStyle(label).display !== 'none',
      lines: words && line ? Math.round((words.getBoundingClientRect().height - pad) / line) : 0,
      clipped: words ? words.scrollHeight > words.clientHeight + 1 && cs.visibility !== 'hidden' : false,
      sideways: words ? words.scrollWidth > words.clientWidth + 1 && cs.visibility !== 'hidden' : false,
      text: words ? words.textContent : '',
      colour: cs ? cs.color : '',
      grey: getComputedStyle(pill.closest('.ui-root')).getPropertyValue('--placeholder').trim(),
      hasDots: (hdr.innerText || '').includes('…'),
      ellipsis,
      pageSideways: document.documentElement.scrollWidth > window.innerWidth,
      pillRight: pr.right,
      pillHeight: pr.height,
      hdrBottom: hdr.getBoundingClientRect().bottom,
      pillBottom: pr.bottom,
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
        if (mission === LONG) await until(async () => (await page.locator(`${sel} .hdr-mis-text`).textContent()) === LONG, 10000);
        const p = await readPill(page, sel);
        const at = `${width}px, ${kind}`;
        pass(`pill ${at}: no "…" character`, !p.hasDots);
        pass(`pill ${at}: no text-overflow ellipsis in the header`, !p.ellipsis);
        pass(`pill ${at}: no sideways scroll`, !p.pageSideways);
        pass(`pill ${at}: the words aren't clipped`, !p.clipped && !p.sideways);
        pass(`pill ${at}: at most two lines`, !p.wordsShown || p.lines <= 2, `${p.lines} lines`);
        pass(`pill ${at}: inside the header`, p.pillBottom <= p.hdrBottom + 0.5);
        if (mission === null) {
          pass(`pill ${at}: "${NO_MISSION}" shows`, p.wordsShown && p.text === NO_MISSION, JSON.stringify(p));
          pass(`pill ${at}: in grey (--placeholder)`, p.colour === hexToRgb(p.grey), `${p.colour} vs ${p.grey}`);
          pass(`pill ${at}: ${width < 360 ? 'the grey words alone' : 'with the label'}`, p.labelShown === (width >= 360));
        } else if (mission === LONG) {
          pass(`pill ${at}: "My Mission" alone`, p.labelShown && !p.wordsShown, JSON.stringify(p));
        } else {
          pass(`pill ${at}: ${width < 360 ? '"My Mission" alone' : 'the mission shows, or the label alone if it needs more than two lines'}`,
            width < 360 ? p.labelShown && !p.wordsShown : p.labelShown && (p.wordsShown || p.lines === 0));
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
        return (await q.count()) && (await q.first().innerText()).includes('What’s your mission?');
      }, 20000);
      pass(`no mission ${width}px: the mission step ("What’s your mission?")`, Boolean(question));
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
      pass('Breathe button: Nekst capitals', /Nekst/.test(m.family), m.family);
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
      pass(`Breathe button: none on a ${label}`, (await page.locator('.ds-breathe:visible').count()) === 0);
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
async function chatButton(page) {
  return page.locator('.hdr-desktop .ds-chat');
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
        const r = document.querySelector('.hdr-desktop .ds-chat').getBoundingClientRect();
        const h = document.querySelector('.hdr-desktop').getBoundingClientRect();
        return { right: h.right - r.right, top: r.top - h.top, bottom: h.bottom - r.bottom, height: r.height };
      });
      pass('chat: top right of the desktop header', pos.right <= 29 && pos.top > 0 && pos.bottom > 0, JSON.stringify(pos));
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
      await until(async () => (await page.locator('.hdr-desktop .ds-chat').count()) === 1, 10000);
      const again = await context.newPage();
      await again.route('**/rest/v1/rpc/my_coach*', (route) => route.abort('internetdisconnected'));
      await open(again);
      await sleep(1500);
      pass('chat, coach not reachable: the device’s copy still shows the button', (await again.locator('.hdr-desktop .ds-chat').count()) === 1);
    } finally {
      await context.close();
    }
  }
  {
    // A phone: in My Account, not the header.
    const { context, page } = await newContext({ width: 390, coach: { name: 'Adie', ways: ['whatsapp'] } });
    try {
      await open(page, '/my-account');
      pass('chat, phone: not in the header', (await page.locator('.hdr .ds-chat:visible').count()) === 0);
      pass('chat, phone: in My Account', Boolean(await until(async () => (await page.locator('.account-page').getByRole('button', { name: 'Chat to Adie' }).count()) === 1, 10000)));
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- 7: against M2 and M3
if (part(7)) {
  for (const [width, mode] of [[1280, 'dark'], [1280, 'light'], [390, 'dark'], [390, 'light']]) {
    const { context, page } = await newContext({ width, mode, coach: { name: 'Tim', ways: ['whatsapp'] } });
    try {
      await open(page);
      const m = await page.evaluate((w) => {
        const px = (v) => Math.round(Number.parseFloat(v) * 10) / 10;
        const hdr = document.querySelector(w < 769 ? '.hdr-phone' : '.hdr-desktop');
        const pill = hdr.querySelector('.hdr-mis');
        const hs = getComputedStyle(hdr);
        const ps = getComputedStyle(pill);
        const ls = getComputedStyle(pill.querySelector('.hdr-mis-label'));
        const ts = getComputedStyle(pill.querySelector('.hdr-mis-text'));
        return {
          height: px(hdr.getBoundingClientRect().height),
          pad: [hs.paddingTop, hs.paddingRight, hs.paddingBottom, hs.paddingLeft].map(px),
          pillMin: px(ps.minHeight),
          pillPadX: px(ps.paddingLeft),
          radius: ps.borderRadius,
          labelSize: px(ls.fontSize),
          labelFamily: ls.fontFamily,
          textSize: px(ts.fontSize),
          border: hs.borderBottomWidth,
        };
      }, width);
      const at = `${width}px ${mode}`;
      if (width > 768) {
        pass(`M2 ${at}: header 79px high`, Math.abs(m.height - 79) < 1, `${m.height}`);
        pass(`M2 ${at}: 28px side padding`, m.pad[1] === 28 && m.pad[3] === 28, JSON.stringify(m.pad));
        pass(`M2 ${at}: a line under the header`, m.border === '1px');
        pass(`M2 ${at}: mission 15px`, m.textSize === 15, `${m.textSize}`);
      } else {
        pass(`M2 ${at}: phone header padding 22, 18, 10`, m.pad[0] === 22 && m.pad[1] === 18 && m.pad[2] === 10 && m.pad[3] === 18, JSON.stringify(m.pad));
        pass(`M2 ${at}: mission 14px`, m.textSize === 14, `${m.textSize}`);
      }
      pass(`M2 ${at}: pill at least 50px`, m.pillMin >= 50, `${m.pillMin}`);
      pass(`M2 ${at}: pill 22px side padding`, m.pillPadX === 22, `${m.pillPadX}`);
      pass(`M2 ${at}: label in Nekst`, /Nekst/.test(m.labelFamily), m.labelFamily);
      note(`M2 ${at}: label ${m.labelSize}px (M2 9.5px; Nekst never below 10px, rule 4).`);
      await shot(page, `m2-header-${width}-${mode}`);
    } finally {
      await context.close();
    }
  }
  note('Pill: up to two lines and "My Mission" alone when longer, where M2 and M3 cut one line with "…" (the Mission pill decision).');
  note('Phone top bar: inside the safe area (the notch rule, 30 Oct), where M2 and M3 draw a fixed 22px top.');
}

console.log(results.join('\n'));
if (notes.length) console.log(`\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
await browser.close();
process.exit(failures ? 1 : 0);
