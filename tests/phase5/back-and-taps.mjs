// Phase 5 follow-up, finishing off (9 Nov): the last two fixes of 5 Nov
// measured in the running app, TEST database only (every other host,
// /functions/v1/, /api/ and every email call blocked).
//   node --import ./tests/scores/register.mjs tests/phase5/back-and-taps.mjs [folder]
//
// Rules 29o and 29t, Back: in every guided tool and on BackLink, the
// chevron's visible strokes (read from the screen's pixels) start on the
// content's left edge and end 14px before the label; the tap area is 44px
// and invisible; on hover only the chevron turns coral, never a shape
// behind it. CLAUDE.md 9: every switch (.ui-switch, .ds-switch) answers a
// tap anywhere in its 44px band. At 1280px, half width (700px) and a
// 390 × 844 phone, dark and light; then 360px with no sideways scroll,
// twice the text size (390 and 1280px) and reduced motion (nothing moves
// when Back or Next is used).
//
// It only opens tools and presses Next or Back; any row a tool makes on
// the way (none is expected) is listed and deleted at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { motionRecorder, motionSeen } from './measure.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const out = process.argv[2] || join(process.cwd(), 'tmp-back-and-taps');
mkdirSync(out, { recursive: true });

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? `: ${String(detail).slice(0, 300)}` : ''}`); };
const note = (s) => results.push(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');
const startedAt = new Date().toISOString();

const browser = await chromium.launch();
const storage = {};
async function signedIn(who) {
  if (storage[who]) return storage[who];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guard(context);
  const page = await context.newPage();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env[`TEST_${who}_EMAIL`]);
  await page.fill('input[type=password]', env[`TEST_${who}_PASSWORD`]);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => ['/welcome', '/auth/welcome-back'].includes(new URL(u).pathname), { timeout: 30000 });
  await sleep(1500);
  storage[who] = await context.storageState();
  await context.close();
  return storage[who];
}
async function guard(context) {
  await context.route(/\/auth\/v1\/(signup|recover|otp|magiclink|invite|resend)|\/api\/.*|\/functions\/v1\//, (r) => r.abort());
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    return route.fallback();
  });
}
async function open(who, width, mode, { scale = 1, motion = 'no-preference' } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: motion, storageState: await signedIn(who),
  });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  if (motion === 'reduce') await context.addInitScript(motionRecorder);
  if (scale !== 1) {
    await context.addInitScript((s) => {
      const add = () => { const st = document.createElement('style'); st.textContent = `html{font-size:${16 * s}px !important}`; document.head.appendChild(st); };
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    }, scale);
  }
  await guard(context);
  const page = await context.newPage();
  return { context, page };
}

// The visible strokes inside a box, from the screen's pixels: every pixel
// unlike the box's top-left corner (its background) counts. A pixel is coral
// when it is the chevron's coral or a soft edge of it: a mix of coral and the
// background, which a chevron shifted by part of a pixel has more of (12 Nov).
async function strokes(page, box) {
  const clip = { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)), width: Math.ceil(box.width), height: Math.ceil(box.height) };
  const png = (await page.screenshot({ clip })).toString('base64');
  const scan = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const bg = [px[0], px[1], px[2]];
    let left = null; let right = null; let coral = 0; let seen = 0;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
        if (d < 60) continue;
        seen += 1;
        // The colour this pixel would be at full strength, if it is a mix with the background.
        const v = [px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]];
        let most = 0;
        for (let k = 0; k < 3; k += 1) most = Math.max(most, v[k] > 0 ? v[k] / (255 - bg[k] || 1) : v[k] < 0 ? -v[k] / (bg[k] || 1) : 0);
        const full = v.map((d, k) => bg[k] + d / (most || 1));
        const isCoral = (c) => c[0] > c[1] + 50 && c[0] > c[2] + 50;
        if (isCoral([px[i], px[i + 1], px[i + 2]]) || (isCoral(full) && full[0] > 150)) coral += 1;
        left = left === null ? x : Math.min(left, x);
        right = right === null ? x + 1 : Math.max(right, x + 1);
      }
    }
    return { left, right, coral, seen, bg };
  }, png);
  return { ...scan, left: scan.left === null ? null : clip.x + scan.left, right: scan.right === null ? null : clip.x + scan.right };
}

async function measureBack(page, tag, { button, label, edge }) {
  const b = page.locator(button).first();
  if (!(await b.count()) || !(await b.isVisible())) { pass(`${tag}: Back is shown`, false, 'not found'); return; }
  const box = await b.boundingBox();
  pass(`${tag}: Back's tap area is at least 44px`, box.width >= 43.5 && box.height >= 43.5, `${box.width.toFixed(1)} × ${box.height.toFixed(1)}`);
  // The chevron's own square (the button's 44px box reaches over the name).
  const chev = await b.locator('.ds-chevron, .ui-back-link-icon, svg').first().boundingBox();
  const scanBox = { x: chev.x - 2, y: chev.y - 2, width: chev.width + 4, height: chev.height + 4 };
  const s = await strokes(page, scanBox);
  const labelLeft = await page.locator(label).first().evaluate((el) => {
    const r = document.createRange(); r.selectNodeContents(el); const rects = [...r.getClientRects()].filter((x) => x.width > 0);
    return rects.length ? Math.min(...rects.map((x) => x.left)) : el.getBoundingClientRect().left;
  });
  const edgeLeft = await page.evaluate(edge);
  pass(`${tag}: the chevron's visible edge is on the content edge`, s.left !== null && Math.abs(s.left - edgeLeft) <= 1, `strokes from ${s.left}, content edge ${edgeLeft?.toFixed(1)}`);
  pass(`${tag}: 14px from the chevron to its label`, s.right !== null && Math.abs(labelLeft - s.right - 14) <= 1, `${(labelLeft - s.right).toFixed(1)}px`);
  // Hover (a mouse only): the chevron turns coral, nothing is drawn behind it.
  if (!(await page.evaluate(() => matchMedia('(hover: hover)').matches))) return;
  await b.hover();
  await sleep(400);
  const behind = await b.evaluate((el) => { const st = getComputedStyle(el); return { bg: st.backgroundColor, shadow: st.boxShadow, outline: st.outlineStyle }; });
  const h = await strokes(page, scanBox);
  pass(`${tag}: on hover, no shape behind the chevron`, /rgba\(0, 0, 0, 0\)|transparent/.test(behind.bg) && behind.shadow === 'none', JSON.stringify(behind));
  pass(`${tag}: on hover, the chevron turns coral`, h.coral > h.seen * 0.5, `${h.coral} of ${h.seen} pixels coral`);
  pass(`${tag}: on hover, the chevron stays where it was`, h.left === s.left && h.right === s.right, `${s.left}–${s.right} then ${h.left}–${h.right}`);
  await page.mouse.move(0, 0);
}

async function measureSwitches(page, tag) {
  const found = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.ui-root .ui-switch, .ui-root .ds-switch')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || getComputedStyle(el).visibility === 'hidden') continue;
      el.scrollIntoView({ block: 'center' });
      const q = el.getBoundingClientRect();
      const cx = q.left + q.width / 2; const cy = q.top + q.height / 2;
      const misses = [];
      const hits = [[cx, cy - 21], [cx, cy + 21], [q.left + 1, cy - 21], [q.right - 1, cy + 21]].map(([x, y]) => {
        const t = document.elementFromPoint(x, y);
        const ok = Boolean(t && (t === el || el.contains(t)));
        if (!ok) misses.push(`${Math.round(y - cy)}: ${t ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : 'nothing'}`);
        return ok;
      });
      out.push({ name: el.getAttribute('aria-label') || el.closest('[class*=switchrow], .ui-row, label, li, div')?.textContent?.trim().slice(0, 40) || '', w: q.width, h: q.height, hits, misses });
    }
    return out;
  });
  if (!found.length) { note(`${tag}: no switch on screen`); return; }
  for (const s of found) {
    pass(`${tag}: switch "${s.name}" answers a tap anywhere in its 44px band`, s.hits.every(Boolean) && s.w >= 43.5, `track ${s.w.toFixed(0)} × ${s.h.toFixed(0)}, covered at ${s.misses.join('; ')}`);
  }
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// Guided tools: opened, then one Next (never an answer), so Back shows.
const GUIDED = [
  { who: 'ORG_CLIENT', path: '/monthly-review', name: 'Check-in' },
  { who: 'CLIENT', path: '/performance-sprint/debrief', name: 'Weekly debrief' },
  { who: 'CLIENT', path: '/performance-plan/edit', name: 'Plan builder (edit)' },
  { who: 'CLIENT', path: '/daily-review', name: 'Daily review' },
  { who: 'CLIENT', path: '/daily-plan', name: 'Daily plan' },
];
const BAR_EDGE = () => { const bar = document.querySelector('.ds-guide-bar'); const r = bar.getBoundingClientRect(); return r.left + parseFloat(getComputedStyle(bar).paddingLeft); };
async function toBack(page, path) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-bar', { timeout: 30000 }).catch(() => {});
  await sleep(1200);
  if (await page.locator('.ds-guide-back').count()) return 'already';
  const next = page.locator('.ds-guide-next');
  if (!(await next.count()) || !(await next.first().isEnabled())) return null;
  await next.first().click();
  await sleep(900);
  return (await page.locator('.ds-guide-back').count()) ? 'next' : null;
}

try {
  for (const width of [1280, 700, 390]) {
    for (const mode of ['dark', 'light']) {
      for (const g of GUIDED) {
        const tag = `${g.name}, ${width}px ${mode}`;
        const { context, page } = await open(g.who, width, mode);
        try {
          const how = await toBack(page, g.path);
          if (!how) { note(`${tag}: no Next on its first screen without answering, so Back wasn't reached (left alone: never answered here)`); continue; }
          await measureBack(page, tag, { button: '.ds-guide-back', label: '.ds-guide-name', edge: BAR_EDGE });
          if (width === 390 && mode === 'dark') await page.screenshot({ path: join(out, `${g.name.replace(/\W+/g, '-')}-390.png`) });
        } finally {
          await context.close();
        }
      }
      // BackLink: About's "Back to Home".
      {
        const tag = `About's BackLink, ${width}px ${mode}`;
        const { context, page } = await open('CLIENT', width, mode);
        try {
          await page.goto(`${APP}/about`);
          await page.waitForSelector('.ui-back-link', { timeout: 30000 });
          await sleep(800);
          await page.locator('.ui-back-link').first().scrollIntoViewIfNeeded();
          await measureBack(page, tag, {
            button: '.ui-back-link', label: '.ui-back-link > span:last-child',
            // Its own box's left: the visible strokes start where the link does
            // (About centres it, so the page's left edge doesn't apply).
            edge: () => document.querySelector('.ui-back-link').getBoundingClientRect().left,
          });
        } finally {
          await context.close();
        }
      }
      // Switches: My Account, and the dashboard's Customise panel.
      {
        const { context, page } = await open('CLIENT', width, mode);
        try {
          await page.goto(`${APP}/my-account`);
          await sleep(2500);
          await measureSwitches(page, `My Account, ${width}px ${mode}`);
          await page.goto(`${APP}/dashboard`);
          const cus = page.getByRole('button', { name: 'Customise my dashboard' });
          await cus.waitFor({ timeout: 30000 }).catch(() => {});
          if (await cus.count()) {
            await cus.click();
            await sleep(900);
            await measureSwitches(page, `Dashboard Customise, ${width}px ${mode}`);
          } else note(`Dashboard Customise, ${width}px ${mode}: the button wasn't found`);
        } finally {
          await context.close();
        }
      }
    }
  }

  // 360px: no sideways scroll on each of these screens.
  for (const g of [...GUIDED, { who: 'CLIENT', path: '/about', name: 'About' }, { who: 'CLIENT', path: '/my-account', name: 'My Account' }]) {
    const { context, page } = await open(g.who, 360, 'dark');
    try {
      if (g.path === '/about' || g.path === '/my-account') { await page.goto(`${APP}${g.path}`); await sleep(2000); } else await toBack(page, g.path);
      const s = await sideways(page);
      pass(`${g.name}, 360px: no sideways scroll`, s <= 0, `${s}px`);
    } finally {
      await context.close();
    }
  }

  // Twice the text size: Back still 44px, still lined up, no sideways scroll.
  for (const width of [390, 1280]) {
    for (const g of GUIDED.slice(0, 3)) {
      const tag = `${g.name}, ${width}px, twice the text size`;
      const { context, page } = await open(g.who, width, 'dark', { scale: 2 });
      try {
        const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize).catch(() => '');
        if (!(await toBack(page, g.path))) { note(`${tag}: Back wasn't reached`); continue; }
        pass(`${tag}: root text is 32px`, (await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '32px', root);
        await measureBack(page, tag, { button: '.ds-guide-back', label: '.ds-guide-name', edge: BAR_EDGE });
        const s = await sideways(page);
        pass(`${tag}: no sideways scroll`, s <= 0, `${s}px`);
      } finally {
        await context.close();
      }
    }
  }

  // Reduced motion: Next and Back move nothing.
  for (const width of [390, 1280]) {
    const tag = `Check-in, ${width}px, reduced motion`;
    const { context, page } = await open('ORG_CLIENT', width, 'dark', { motion: 'reduce' });
    try {
      if (!(await toBack(page, '/monthly-review'))) { note(`${tag}: Back wasn't reached`); continue; }
      await page.locator('.ds-guide-back').first().click();
      await sleep(800);
      const seen = await motionSeen(page);
      pass(`${tag}: nothing moves on Next and Back`, seen.length === 0, seen.slice(0, 4).join('; '));
    } finally {
      await context.close();
    }
  }
} catch (e) {
  pass('the run finished', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  // Anything a tool made on the way (none expected): listed, then deleted.
  for (const [who, tables] of [['ORG_CLIENT', ['checkins']], ['CLIENT', ['weekly_debriefs', 'day_plans', 'day_reviews']]]) {
    const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s } = await db.auth.signInWithPassword({ email: env[`TEST_${who}_EMAIL`], password: env[`TEST_${who}_PASSWORD`] });
    for (const t of tables) {
      const { data } = await db.from(t).select('id').eq('user_id', s.user.id).gte('created_at', startedAt);
      if (data?.length) {
        note(`${t}: ${data.length} row(s) made during the run, deleted`);
        await db.from(t).delete().in('id', data.map((r) => r.id));
      }
    }
  }
}
console.log(results.join('\n'));
const counted = results.filter((r) => !r.startsWith('NOTE'));
console.log(`\n${counted.length - failures} of ${counted.length} passed`);
process.exit(failures ? 1 : 0);
