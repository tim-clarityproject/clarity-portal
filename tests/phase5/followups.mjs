// Phase 5 step 4, the Phase 4 follow-ups, in the running app, signed in as
// the invented test client on the TEST database only (every other host and
// every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase5/followups.mjs [folder for screenshots]
//
// 1. During Recovery, Daily review and Daily plan say Recovery's calm
//    line, never "No sprint is running".
// 2. The search in My Plans and My Reviews: it sits with the Filter button
//    (not at the top of the page), finds by name and by tool, works with
//    the area filter, says "Nothing matches “…”." when nothing does, clears
//    with the 45 degree crosshair, opens from ?q=, and works offline on
//    what's on the device after one visit.
// 3. Recovery's button says "Ready to go again", never "I’m ready to go
//    again".
//
// The clock is fixed at Wed 21 Oct 2026, 10:00 in London (the seed's
// Sprint 1 runs from Mon 12 Oct). A few invented items and one open
// Recovery are added, and taken away again at the end. The seed itself is
// not changed.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { RECOVERY_DAY_LINE, RECOVERY_NUMBERS_LINE } from '../../src/lib/performance/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });

const TODAY = '2026-10-21';
const STAMP = 'Followups check';

const results = [];
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

// ---------------------------------------------------------------- the invented items
const made = { decisions: [], entries: [], recoveries: [], dayPlans: [], dayReviews: [] };
const before = {};

async function insert(table, rows, bucket) {
  const { data, error } = await db.from(table).insert(rows).select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  made[bucket].push(...data.map((r) => r.id));
  return data;
}

async function cleanUp() {
  const del = async (table, ids) => { if (ids.length) await db.from(table).delete().in('id', ids).eq('user_id', me); };
  await del('recovery_periods', made.recoveries);
  await del('decisions', made.decisions);
  await del('journal_entries', made.entries);
  // Anything the day pages made for the fixed day, when there was none before.
  for (const table of ['day_reviews', 'day_plans']) {
    if (before[table]) continue;
    await db.from(table).delete().eq('user_id', me).eq('local_date', TODAY);
  }
}

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  try { await cleanUp(); } catch { /* reported above */ }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

const { data: sprint } = await db.from('sprints').select('id, start_on').eq('user_id', me).eq('status', 'running').maybeSingle();
if (!sprint) throw new Error('The seed has no running sprint: run scripts/seed-test-plan.mjs first.');
const { data: openRec } = await db.from('recovery_periods').select('id').eq('user_id', me).is('ended_at', null);
if (openRec?.length) throw new Error('A Recovery is already open: run scripts/seed-test-plan.mjs --reset first.');
for (const table of ['day_reviews', 'day_plans']) {
  const { data } = await db.from(table).select('id').eq('user_id', me).eq('local_date', TODAY);
  before[table] = Boolean(data?.length);
}

const PLANS = [
  ['inversion', `${STAMP}: Harbour proposal`, 'Pre-mortem'],
  ['grow', `${STAMP}: Referral pipeline`, 'Get unstuck'],
  ['strategic-alignment', `${STAMP}: Café team`, 'Strategic Alignment Health Check'],
];
for (const [tool, title] of PLANS) {
  const { data } = await db.from('decisions').select('form_data').eq('user_id', me).eq('tool_type', tool).not('form_data', 'is', null).limit(1);
  await insert('decisions', { user_id: me, tool_type: tool, title, form_data: data?.[0]?.form_data || {}, status: 'completed', created_at: '2026-10-14T09:00:00' }, 'decisions');
}
await insert('journal_entries', [
  { user_id: me, review_type: 'after-action', entry_date: '2026-10-15', title: `${STAMP}: Harbour discovery call`, status: 'final', content: JSON.stringify({ q1: 'It ran over.', reviewType: 'after-action' }), created_at: '2026-10-15T17:00:00Z' },
  { user_id: me, review_type: 'progress', entry_date: '2026-10-16', title: `${STAMP}: Quarter progress`, status: 'final', content: JSON.stringify({ q1: 'Two of three moved.', reviewType: 'progress' }), created_at: '2026-10-16T17:00:00Z' },
], 'entries');

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function signedIn({ width = 1280, mode = 'dark' } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 780 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await context.clock.install({ time: new Date(`${TODAY}T09:00:00Z`) });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page, errors };
}

async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
const bodyText = (page) => page.locator('body').innerText();
const titles = (page) => page.locator('.hlist-row-title').allInnerTexts();
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const NO_SPRINT = /No sprint is running/;

// ---------------------------------------------------------------- 2: search
async function checkSearch(page, tag, to, { label, mine, byTool, toolWord, other }) {
  await page.goto(`${APP}${to}`);
  await page.waitForSelector('.hlist-wrap', { timeout: 30000 });
  await until(async () => (await titles(page)).some((t) => t === mine[0]), 20000);
  const box = page.getByRole('searchbox', { name: label });
  pass(`${tag}: one search box, "${label}"`, (await box.count()) === 1);
  const all = (await titles(page)).length;

  // Placed with the list: under the page title, just above the Filter button.
  const place = await page.evaluate(() => {
    const s = document.querySelector('.ds-search').getBoundingClientRect();
    const f = document.querySelector('.ds-filter > button').getBoundingClientRect();
    const h = document.querySelector('.hlist-head').getBoundingClientRect();
    return { belowTitle: s.top >= h.bottom - 1, aboveFilter: s.bottom <= f.top, gap: Math.round(f.top - s.bottom), left: Math.abs(s.left - f.left) < 1 };
  });
  pass(`${tag}: it sits with the Filter button, under the title, on the same left edge`, place.belowTitle && place.aboveFilter && place.left && place.gap <= 24, JSON.stringify(place));
  const style = await box.evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height, cls: e.className }));
  pass(`${tag}: the shared field (.ds-field), 16px or more, 44px or more high`, style.cls.includes('ds-field') && style.size >= 16 && style.h >= 44, JSON.stringify(style));
  pass(`${tag}: no clear button before anything is typed`, (await page.locator('.ds-search-clear').count()) === 0);

  // By name.
  await box.fill('harbour');
  await until(async () => (await titles(page)).length < all, 5000);
  const byName = await titles(page);
  pass(`${tag}: "harbour" finds by name`, byName.length >= 1 && byName.every((t) => /harbour/i.test(t)) && byName.includes(mine[0]), JSON.stringify(byName));
  pass(`${tag}: the count follows the search`, (await page.locator('.hlist-tools span').first().innerText()) === `${byName.length} ${byName.length === 1 ? 'entry' : 'entries'}`);
  await shot(page, `${tag}-search`);

  // By tool.
  await box.fill(`${STAMP} ${toolWord}`);
  const tool = await until(async () => { const t = await titles(page); return t.includes(byTool) && !t.includes(mine[0]) ? t : null; }, 5000);
  pass(`${tag}: "${toolWord}" finds by the tool`, Array.isArray(tool) && tool.includes(byTool) && tool.every((t) => t.startsWith(STAMP)), JSON.stringify(tool));

  // The clear button: the 45 degree crosshair, 44px, which empties the box.
  const clear = page.locator('.ds-search-clear');
  pass(`${tag}: a clear button once something is typed, named for screen readers`, (await clear.count()) === 1 && (await clear.getAttribute('aria-label')) === 'Clear the search');
  const cross = await clear.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const c = e.querySelector('.ds-cross--close');
    return { w: Math.round(r.width), h: Math.round(r.height), close: Boolean(c) };
  });
  pass(`${tag}: it is the 45 degree crosshair in a 44px tap area`, cross.close && cross.w >= 44 && cross.h >= 44, JSON.stringify(cross));
  await clear.click();
  pass(`${tag}: it clears the box and every row comes back`, (await box.inputValue()) === '' && Boolean(await until(async () => (await titles(page)).length === all, 5000)));
  pass(`${tag}: the cursor goes back into the box`, await box.evaluate((e) => document.activeElement === e));

  // With the area filter: both apply together.
  await page.locator('.ds-filter > button').click();
  await page.getByRole('combobox', { name: 'Which area?' }).click();
  await page.getByRole('option', { name: /^Strategic/ }).first().click();
  await box.fill('harbour');
  const none = page.locator('.hlist-empty');
  pass(`${tag}: Strategic and "harbour" together: nothing`, Boolean(await until(async () => (await none.count()) && (await none.innerText()).trim() === 'Nothing matches “harbour”.', 5000)), await none.count() ? await none.innerText() : 'no line');
  await shot(page, `${tag}-nothing`);
  if (other) {
    await box.fill(other);
    const t = await until(async () => { const r = await titles(page); return r.length ? r : null; }, 5000);
    pass(`${tag}: Strategic and "${other}" together: the Strategic item only`, Array.isArray(t) && t.every((x) => /caf/i.test(x)), JSON.stringify(t));
  }
  await page.locator('.ds-filter-line .ds-link', { hasText: 'Clear' }).click();
  await clear.click().catch(() => {});

  // ?q= opens it searched, with ?area= too.
  await page.goto(`${APP}${to}?area=personal&q=harbour`);
  await page.waitForSelector('.hlist-wrap', { timeout: 30000 });
  const q = await until(async () => { const t = await titles(page); return t.length ? t : null; }, 20000);
  pass(`${tag}: ?area=personal&q=harbour opens filtered and searched`, (await box.inputValue()) === 'harbour'
    && (await page.locator('.ds-filter-line span').first().innerText()) === 'Showing Personal.'
    && Array.isArray(q) && q.every((t) => /harbour/i.test(t)), JSON.stringify(q));
  pass(`${tag}: no sideways scroll`, await noSideways(page));
}

async function checkOffline(context, page, tag, to, label, want) {
  // One visit online fills the device copy; then offline, the page opens
  // from it (client side, as the app moves between pages) and searches it.
  await page.goto(`${APP}${to}`);
  await until(async () => (await titles(page)).includes(want), 20000);
  // Away to Home inside the app (no reload: the app is already loaded,
  // as it would be from the service worker), then offline.
  await page.evaluate(() => { window.history.pushState({}, '', '/welcome'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await until(async () => (await page.locator('.hlist-wrap').count()) === 0, 10000);
  await context.setOffline(true);
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, to);
  const shown = await until(async () => (await titles(page)).includes(want), 15000);
  pass(`${tag}: offline, the list opens from the device`, Boolean(shown));
  const box = page.getByRole('searchbox', { name: label });
  if (await box.count()) {
    await box.fill('harbour');
    const t = await until(async () => { const r = await titles(page); return r.length && r.every((x) => /harbour/i.test(x)) ? r : null; }, 5000);
    pass(`${tag}: offline, the search finds "harbour"`, Array.isArray(t) && t.includes(want), JSON.stringify(t));
    await box.fill('zzzz');
    pass(`${tag}: offline, "Nothing matches “zzzz”."`, Boolean(await until(async () => (await page.locator('.hlist-empty').count()) && (await page.locator('.hlist-empty').innerText()).trim() === 'Nothing matches “zzzz”.', 5000)));
  } else pass(`${tag}: offline, the search box shows`, false);
  await shot(page, `${tag}-offline`);
  await context.setOffline(false);
}

// ---------------------------------------------------------------- 1 and 3: Recovery
// A paused tool is a gate (Tim, 5 Nov): only the calm screen, with "Back to
// recovery" and "<tool> anyway". Going on "anyway" opens the tool itself.
async function throughGate(page, tag, tool) {
  const gate = await until(async () => (await bodyText(page)).includes('Your daily tools are paused while you recharge.'), 20000);
  pass(`${tag}: ${tool} opens on the paused gate`, Boolean(gate), (await bodyText(page)).slice(0, 300));
  pass(`${tag}: the gate offers Back to recovery`, (await page.getByRole('button', { name: 'Back to recovery' }).count()) === 1);
  const anyway = page.getByRole('button', { name: `${tool} anyway` });
  pass(`${tag}: the gate offers "${tool} anyway"`, (await anyway.count()) === 1);
  if (await anyway.count()) await anyway.click();
  await sleep(600);
}

async function checkRecovery(page, tag) {
  // Daily review: the to-dos screen.
  await page.goto(`${APP}/daily-review`);
  await page.waitForSelector('.ui-root h1, .ui-root h2', { timeout: 30000 });
  await throughGate(page, tag, 'Daily review');
  const line = await until(async () => (await bodyText(page)).includes(RECOVERY_DAY_LINE), 20000);
  const text = await bodyText(page);
  pass(`${tag}: Daily review says Recovery's calm line`, Boolean(line), text.slice(0, 400));
  pass(`${tag}: …and never "No sprint is running"`, !NO_SPRINT.test(text));
  pass(`${tag}: Daily review has no sideways scroll`, await noSideways(page));
  await shot(page, `${tag}-review-my-day`);
  // On to the numbers screen.
  let numbers = false;
  for (let i = 0; i < 4 && !numbers; i += 1) {
    const next = page.getByRole('button', { name: /^(Next|Skip)/ }).first();
    if (!(await next.count())) break;
    await next.click();
    numbers = Boolean(await until(async () => (await bodyText(page)).includes(RECOVERY_NUMBERS_LINE), 3000));
  }
  pass(`${tag}: the numbers screen says Recovery's line`, numbers);
  pass(`${tag}: …and never "No sprint is running"`, !NO_SPRINT.test(await bodyText(page)));
  await shot(page, `${tag}-review-numbers`);

  // Daily plan: the to-dos screen.
  await page.goto(`${APP}/daily-plan`);
  await page.waitForSelector('.ui-root h1, .ui-root h2', { timeout: 30000 });
  await throughGate(page, tag, 'Daily plan');
  let planLine = false;
  for (let i = 0; i < 6 && !planLine; i += 1) {
    planLine = Boolean(await until(async () => (await bodyText(page)).includes(RECOVERY_DAY_LINE), i ? 3000 : 15000));
    if (planLine) break;
    pass(`${tag}: Daily plan, screen ${i + 1}, never "No sprint is running"`, !NO_SPRINT.test(await bodyText(page)));
    const next = page.getByRole('button', { name: /^(Next|Skip|Start)/ }).first();
    if (!(await next.count())) break;
    await next.click();
  }
  pass(`${tag}: Daily plan's to-dos screen says Recovery's calm line`, planLine);
  pass(`${tag}: …and never "No sprint is running"`, !NO_SPRINT.test(await bodyText(page)));
  await shot(page, `${tag}-plan-my-day`);

  // The button words, on Recovery's day page and the paused sprint.
  for (const [to, sel] of [['/recovery/today', '.rec-banner'], ['/performance-sprint', '.ds-sdial--paused']]) {
    await page.goto(`${APP}${to}`);
    await page.waitForSelector(sel, { timeout: 30000 }).catch(() => {});
    const ready = page.getByRole('button', { name: 'Ready to go again', exact: true });
    pass(`${tag}: ${to} has "Ready to go again"`, Boolean(await until(async () => (await ready.count()) === 1, 10000)));
    pass(`${tag}: ${to} never says "I’m ready to go again"`, !/I[’']m ready to go again/.test(await bodyText(page)));
    const withI = await page.locator('button').evaluateAll((els) => els.map((e) => e.textContent.trim()).filter((t) => /\b(I|I’m|I'm)\b/.test(t)));
    pass(`${tag}: ${to} has no button that says "I"`, withI.length === 0, JSON.stringify(withI));
  }
  await shot(page, `${tag}-sprint-paused`);
}

try {
  // Search, online, both lists, desktop and phone.
  for (const [width, mode] of [[1280, 'dark'], [360, 'light']]) {
    const { context, page, errors } = await signedIn({ width, mode });
    const tag = `${width}px ${mode}`;
    await checkSearch(page, `${tag} My Plans`, '/my-plans', {
      label: 'Search my plans', mine: [`${STAMP}: Harbour proposal`], byTool: `${STAMP}: Referral pipeline`, toolWord: 'get unstuck', other: 'cafe',
    });
    await checkSearch(page, `${tag} My Reviews`, '/my-reviews', {
      label: 'Search my reviews', mine: [`${STAMP}: Harbour discovery call`], byTool: `${STAMP}: Quarter progress`, toolWord: 'progress review',
    });
    if (width === 1280) {
      await checkOffline(context, page, `${tag} My Plans`, '/my-plans', 'Search my plans', `${STAMP}: Harbour proposal`);
      await checkOffline(context, page, `${tag} My Reviews`, '/my-reviews', 'Search my reviews', `${STAMP}: Harbour discovery call`);
    }
    pass(`${tag}: no page errors in the lists`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }

  // Recovery: one open, from yesterday, for a week.
  await insert('recovery_periods', { id: randomUUID(), user_id: me, sprint_id: sprint.id, start_on: '2026-10-20', chosen_days: 7, extended_days: 0, let_coach_know: false }, 'recoveries');
  for (const [width, mode] of [[1280, 'dark'], [360, 'light']]) {
    const { context, page, errors } = await signedIn({ width, mode });
    await checkRecovery(page, `${width}px ${mode} Recovery`);
    pass(`${width}px ${mode}: no page errors in Recovery`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await cleanUp();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
