// Phase 5 step 5: every new Phase 5 screen and state measured, in the
// running app on the TEST database only, signed in as the invented test
// client (every other host, /functions/v1/, /api/ and every email call is
// blocked). The mock-up comparisons themselves (M4's and M12's sizes and
// words) are in tests/phase5/dashboard.mjs and checkin.mjs; the pattern
// cards' in tests/phase5/patterns.mjs (with this file's rules). Together
// they measure every screen against tests/phase5/measure.mjs.
//
//   node --import ./tests/scores/register.mjs tests/phase5/compare.mjs [folder]
//
// Screens: the dashboard (as it opens, every part open, Show as a table
// open, Customise), the check-in (the opening, a question, a statement,
// the results, Add to my sprint, the saved results, the First review's
// opening and its goals), and the follow-ups (the search in My Plans and
// My Reviews, found and nothing found).
//
// For each, at 1280, 640, 390 and 360px, dark and light: one coral button
// (or none, or at most one), 44px taps, no coral marks, mint for good and
// grey below, no keys, icons centred on the capitals 6px from their words,
// pop-ups (chart and "i") 12px inside the edges that never move the page,
// no sideways scroll, the writing rules (one sentence a line, no colons or
// brackets, banned words, rules 60, 62, 64, 65) and no line said twice.
// Then, for every screen: twice the text size (360 and 1280px), reduced
// motion (390 and 1280px: nothing animates, even while parts open), and
// the safe area (Home Screen app on a notch 47px and a Dynamic Island 59px
// phone, dark and light).
//
// Seeded (small, and all removed or put back at the end): two finished
// check-ins (last month and this month), a month of sleep, the finished
// weeks' stress; the person's page settings are put back as they were.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { checkinMonth } from '../../src/lib/performance/checkin.js';
import { addDays } from '../../src/lib/scores/dates.js';
import { BANNED, CORAL, MINT, bigText, insideInsets, measure, motionRecorder, motionSeen, popups, ruleChecks } from './measure.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || join(process.cwd(), 'tmp-phase5-compare');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['screens', 'big', 'motion', 'safe'];
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1280, 640, 390, 360];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(250);
  }
  return v;
}

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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUR = checkinMonth(today);
const prevDate = new Date(Date.UTC(Number(CUR.slice(0, 4)), Number(CUR.slice(5, 7)) - 2, 1));
const PREV = `${prevDate.toISOString().slice(0, 7)}-01`;
const CUR_PATH = `/monthly-review/${CUR.slice(0, 7)}`;

// ---------------------------------------------------------------- the seed
const { data: settingsRow } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = settingsRow?.[0]?.page_preferences ?? null;
const { data: running } = await db.from('sprints').select('id, number, start_on, length_weeks').eq('user_id', me).eq('status', 'running').limit(1);
const sprint = running?.[0] || null;
const { data: checkinsBefore } = await db.from('checkins').select('*').eq('user_id', me).in('month', [CUR, PREV]);
const seeded = { dayPlans: [], dayPlanBefore: [], debriefs: [], debriefBefore: [], habits: [], todos: [] };
const PREV_ANS = { H1: 'h6_7', H2: 'ok', H3: 'often', H4: 'under_1', H5: 'd1', H6: 'h8_10', H7: 'ok', H8: 'u8_14', H9: 'monthly', H10: 'ok', H11: 'low', H12: 'poor', H13: 'a_little', H14: 'no', S1: 'sometimes', S2: 'sometimes', S3: 'rarely', S4: 'often', S5: 'often', S6: 'sometimes' };
const NOW_ANS = { ...PREV_ANS, H1: 'h7_8', H3: 'sometimes', H11: 'ok', H12: 'good', S1: 'often' };

async function seed() {
  await db.from('checkins').delete().eq('user_id', me).in('month', [CUR, PREV]);
  for (const [month, answers] of [[PREV, PREV_ANS], [CUR, NOW_ANS]]) {
    const { error } = await db.from('checkins').insert({ user_id: me, kind: 'monthly', month, status: 'finished', answers });
    if (error) results.push(`NOTE  check-in seed: ${error.message}`);
  }
  if (!sprint) return;
  // Sleep: 6 hours a night for the last 4 weeks and 7.5 the 4 before (as dashboard.mjs).
  const { data: plans } = await db.from('day_plans').select('id, local_date, sleep_hours, sleep_quality, sleep_to_confirm').eq('user_id', me).gte('local_date', addDays(today, -27)).lte('local_date', today);
  const byDay = new Map((plans || []).map((p) => [p.local_date, p]));
  for (let i = 0; i < 28; i += 1) {
    const date = addDays(today, -i);
    const hours = i < 14 ? 6 : 7.5;
    const quality = i % 3 ? 'fair' : 'good';
    const had = byDay.get(date);
    if (had) {
      seeded.dayPlanBefore.push(had);
      await db.from('day_plans').update({ sleep_hours: hours, sleep_quality: quality, sleep_to_confirm: false }).eq('id', had.id);
    } else {
      const { data } = await db.from('day_plans').insert({ user_id: me, local_date: date, sleep_hours: hours, sleep_quality: quality }).select('id');
      if (data?.[0]) seeded.dayPlans.push(data[0].id);
    }
  }
  const { data: debs } = await db.from('weekly_debriefs').select('id, sprint_week, stress, status').eq('sprint_id', sprint.id);
  const weeksDone = Math.floor((Date.parse(today) - Date.parse(sprint.start_on)) / (7 * 864e5));
  const answers = ['a_little', 'moderately', 'not_at_all', 'quite_a_lot', 'a_little', 'not_at_all', 'moderately'];
  for (let w = 1; w <= Math.min(weeksDone, sprint.length_weeks); w += 1) {
    const had = (debs || []).find((x) => x.sprint_week === w);
    if (had) {
      seeded.debriefBefore.push(had);
      await db.from('weekly_debriefs').update({ stress: answers[w - 1] }).eq('id', had.id);
    } else {
      const { data, error } = await db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: w, stress: answers[w - 1], status: 'finished', finished_at: new Date().toISOString() }).select('id');
      if (error) results.push(`NOTE  debrief seed: ${error.message}`);
      else seeded.debriefs.push(data[0].id);
    }
  }
}
async function cleanUp() {
  await db.from('checkins').delete().eq('user_id', me).in('month', [CUR, PREV]);
  if (checkinsBefore?.length) await db.from('checkins').insert(checkinsBefore.map(({ hardware_score: _h, software_score: _s, area_scores: _a, methods_version: _m, ...r }) => r));
  for (const id of seeded.dayPlans) await db.from('day_plans').delete().eq('id', id).eq('user_id', me);
  for (const p of seeded.dayPlanBefore) await db.from('day_plans').update({ sleep_hours: p.sleep_hours, sleep_quality: p.sleep_quality, sleep_to_confirm: p.sleep_to_confirm }).eq('id', p.id);
  for (const id of seeded.debriefs) await db.from('weekly_debriefs').delete().eq('id', id).eq('user_id', me);
  for (const d of seeded.debriefBefore) await db.from('weekly_debriefs').update({ stress: d.stress }).eq('id', d.id);
  // Anything Add to my sprint made (the test cancels it, so this is a safety net).
  await db.from('todos').delete().eq('user_id', me).eq('source', 'other_tool').gte('created_on', today);
  await db.from('person_settings').update({ page_preferences: prefsBefore ?? {} }).eq('user_id', me);
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
let storage = null;
async function signInOnce() {
  if (storage) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await guard(ctx, {});
  const p = await ctx.newPage();
  await p.goto(`${APP}/auth/login`);
  await p.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await p.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await p.keyboard.press('Enter');
  await p.waitForURL(/welcome/, { timeout: 30000 });
  const s = await ctx.storageState();
  // Only the sign-in itself: no page's device copy, draft or step is carried over.
  storage = { cookies: s.cookies, origins: s.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((x) => !/^(clarity-cache|clarity-draft|ds-guide|clarity-queue|clarity-sending)/.test(x.name)) })) };
  await ctx.close();
}
// first: the First review (a coach, Tim; no check-ins yet, and nothing it writes reaches the database).
async function guard(context, { first = false } = {}) {
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (/\/rest\/v1\/rpc\/my_coach$/.test(url.split('?')[0])) {
      const body = first ? [{ coach_id: '00000000-0000-4000-8000-000000000001', first_name: 'Tim', mobile: null, contact_ways: [], away_until: null }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (first && /\/rest\/v1\/checkins/.test(url)) {
      if (req.method() === 'GET' || req.method() === 'HEAD') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    return route.fallback();
  });
}
async function appContext(width, mode, { height, touch, motion = 'no-preference', first = false, scale = 1, inset = null } = {}) {
  await signInOnce();
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: height || (phone ? 844 : 900) }, hasTouch: touch ?? phone, isMobile: touch ?? phone,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: motion, storageState: storage,
  });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  if (motion === 'reduce') await context.addInitScript(motionRecorder);
  if (scale !== 1) {
    // The device's text-size setting, as a root size (16px is standard), as tests/phase0e does.
    await context.addInitScript((s) => {
      const add = () => { const st = document.createElement('style'); st.textContent = `html{font-size:${16 * s}px !important}`; document.head.appendChild(st); };
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    }, scale);
  }
  await guard(context, { first });
  if (inset) {
    // Chromium can't emulate display-mode: the app's code is served with
    // "(display-mode: standalone)" read as true (as tests/phase4 does).
    await context.route(`${APP}/src/**`, async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      return route.fulfill({ response: res, body: body.replaceAll('(display-mode: standalone)', '(min-width: 0px)') });
    });
  }
  const page = await context.newPage();
  if (inset) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: inset });
  }
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page, phone };
}

const settle = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  new Promise((r) => { setTimeout(r, 3000); }),
]));
const quiet = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
  await until(async () => (await page.locator('.ds-loading').count()) === 0, 15000);
  await settle(page);
  await sleep(300);
};
async function go(page, to, sel) {
  await page.goto(`${APP}${to}`);
  await page.waitForSelector(sel, { timeout: 30000 });
  await quiet(page);
}
// Read at once (a locator's textContent would wait for a part that isn't there).
const heading = (page) => page.evaluate(() => (document.querySelector('.ds-guide-question, .ds-guide-title')?.textContent || '').trim()).catch(() => '');
const statement = (page) => page.evaluate(() => (document.querySelector('.ds-statement')?.textContent || '').trim()).catch(() => '');
async function tapThrough(page, stop, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    if (await stop()) return true;
    if (process.env.VERBOSE) console.log(`  at "${await heading(page)}" (${await page.locator('.ds-guide-body [role=radio]').count()} answers)`);
    const before = (await heading(page)) + (await statement(page));
    // An answer not already chosen (tapping the chosen one again keeps the screen).
    const radio = page.locator('.ds-guide-body [role=radio]:not([aria-checked="true"])');
    const n = await radio.count();
    if (n) await radio.nth(Math.min(1, n - 1)).click({ timeout: 3000 }).catch(() => {});
    else { await sleep(450); await page.locator('.ds-guide-next').click({ timeout: 3000 }).catch(() => {}); }
    await until(async () => (await heading(page)) + (await statement(page)) !== before, 4000);
  }
  return stop();
}
const isStatement = async (p) => (await p.locator('.ds-statement').count()) > 0;
const isResults = async (p) => /^(Your month|Your starting point)$/.test(await heading(p)) || (await p.locator('.ck-one-add, .ck-results').count()) > 0;

const dashboard = (p) => go(p, '/dashboard', '.dash-page .ds-page-title');
const openFolds = async (p) => {
  await p.evaluate(() => { for (const b of document.querySelectorAll('.dash-fold-h[aria-expanded="false"]')) b.click(); });
  await sleep(500);
  await settle(p);
};
const openTables = async (p) => {
  await p.evaluate(() => { for (const s of document.querySelectorAll('.ds-ctable-fold summary, .ds-ctable-fold button[aria-expanded="false"]')) s.click(); });
  await sleep(500);
  await settle(p);
};
async function search(p, to, words) {
  await go(p, to, '.hlist-wrap');
  await until(async () => (await p.locator('.hlist-row, .hlist-empty').count()) > 0, 20000);
  const box = p.locator('.ds-search-input');
  await box.waitFor({ timeout: 10000 });
  const w = typeof words === 'function' ? await words(p) : words;
  await box.fill(w);
  await sleep(500);
  await settle(p);
}
const firstWord = async (p) => ((await p.locator('.hlist-row-title').first().textContent()) || 'plan').trim().split(/\s+/)[0].replace(/[’'].*$/, '');

// ---------------------------------------------------------------- the screens
// coral: 'one', 'none' or 'atMost'. scope: one part measured. Screens run
// in order in one browser per width and mode (the check-in's walk follows on).
const SCREENS = [
  { id: 'dashboard', coral: 'atMost', open: dashboard, act: openFolds },
  { id: 'dashboard, every part open', coral: 'atMost', open: async (p) => { await dashboard(p); await openFolds(p); } },
  { id: 'dashboard, Show as a table open', coral: 'atMost', open: async (p) => { await openFolds(p); await openTables(p); } },
  { id: 'dashboard, Customise', coral: 'atMost', scope: '[role=dialog]', open: async (p) => { await dashboard(p); await p.getByRole('button', { name: 'Customise my dashboard' }).first().click(); await p.locator('[role=dialog]').first().waitFor({ timeout: 8000 }); await settle(p); await sleep(400); } },
  { id: 'check-in, a question', coral: 'atMost', open: async (p) => { await go(p, `${CUR_PATH}/answers`, '.ds-guide-question'); await until(async () => (await p.locator('.ds-guide-body [role=radio]').count()) > 0); } },
  { id: 'check-in, the opening', coral: 'one', open: async (p) => { await p.locator('.ds-guide-back').click(); await until(async () => /^Ready /.test(await heading(p))); await settle(p); } },
  { id: 'check-in, a statement', coral: 'atMost', open: async (p) => { await sleep(450); await p.locator('.ds-guide-next').click(); await tapThrough(p, () => isStatement(p)); await settle(p); } },
  { id: 'check-in, the results', coral: 'atMost', open: async (p) => { await tapThrough(p, () => isResults(p)); await quiet(p); }, act: openTables },
  { id: 'check-in, Add to my sprint', coral: 'one', scope: '[role=dialog]', open: async (p) => { await p.locator('.ck-one-add').click(); await p.locator('[role=dialog]').first().waitFor({ timeout: 8000 }); await settle(p); await sleep(400); }, after: async (p) => { await p.locator('[role=dialog]').getByRole('button', { name: 'Cancel' }).click().catch(() => {}); await sleep(400); } },
  { id: 'check-in, the saved results', coral: 'atMost', open: async (p) => { await go(p, CUR_PATH, '.ds-guide, .ds-page-title, .ck-results'); await until(async () => isResults(p)); await quiet(p); } },
  { id: 'My Plans, search found', coral: 'atMost', open: (p) => search(p, '/my-plans', firstWord) },
  { id: 'My Plans, search nothing found', coral: 'atMost', open: (p) => search(p, '/my-plans', 'zzqx') },
  { id: 'My Reviews, search found', coral: 'atMost', open: (p) => search(p, '/my-reviews', 'check-in') },
  { id: 'First review, the opening', first: true, coral: 'one', open: async (p) => { await go(p, '/monthly-review', '.ds-guide-question, .ds-guide-title'); await until(async () => /first review/i.test(await heading(p))); } },
  { id: 'First review, the goals', first: true, coral: 'atMost', open: async (p) => { await sleep(450); await p.locator('.ds-guide-next').click(); await until(async () => !/^Ready /.test(await heading(p)), 6000); await settle(p); } },
];
const wanted = SCREENS.filter((s) => !ONLY || ONLY.test(s.id));
// A screen's own exemption from "no line said twice" (each objective's status line is its own fact, as dashboard.mjs).
const EXEMPT = '^The work behind it is ';

async function runScreens(width, mode, opts, each) {
  for (const first of [false, true]) {
    const list = wanted.filter((s) => Boolean(s.first) === first);
    if (!list.length) continue;
    const own = await appContext(width, mode, { ...opts, first });
    try {
      for (const s of list) {
        const tag = `${s.id}, ${width}px ${mode}${opts.label || ''}`;
        try {
          await s.open(own.page, own.phone);
        } catch (e) {
          pass(`${tag}: opens`, false, `${e.message.split('\n')[0]} (on ${new URL(own.page.url()).pathname})`);
          continue;
        }
        await own.page.mouse.move(0, 0);
        await own.page.evaluate(() => document.fonts.ready);
        await each(s, tag, own);
        if (s.after) await s.after(own.page);
      }
    } finally {
      await own.context.close();
    }
  }
}

// A time limit (limit.sh sends TERM): put everything back first.
process.on('SIGTERM', async () => {
  console.log('Stopped by the time limit: putting the seed back.');
  await cleanUp().catch(() => null);
  writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n\nSTOPPED BY THE TIME LIMIT\n`);
  console.log(results.filter((r) => !r.startsWith('PASS')).join('\n'));
  process.exit(124);
});
process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  await cleanUp().catch(() => null);
  console.log(results.filter((r) => !r.startsWith('PASS')).join('\n'));
  process.exit(1);
});

try {
  await seed();
  results.push(`NOTE  months ${PREV} and ${CUR}; running sprint: ${sprint ? `Performance Sprint ${sprint.number}` : 'none'}`);

  // ------------------------------------------------------------ every width, both modes
  if (PARTS.includes('screens')) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        await runScreens(width, mode, {}, async (s, tag, { page, phone }) => {
          const r = await page.evaluate(measure, { CORAL, MINT, BANNED, scope: s.scope, exempt: EXEMPT });
          ruleChecks(pass, tag, r, s.coral);
          pass(`${tag}: follows the mode`, r.theme === mode, r.theme);
          // A panel's own screen: the page behind it is covered, so its marks aren't pointed at.
          if (s.scope !== '[role=dialog]') await popups(page, phone, pass, tag);
          if (width === 1280 || width === 360) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${width}-${mode}.png`), fullPage: !s.scope }).catch(() => {});
        });
      }
    }
  }

  // ------------------------------------------------------------ twice the text size
  if (PARTS.includes('big')) {
    for (const width of [360, 1280]) {
      await runScreens(width, 'dark', { scale: 2, label: ', twice the text size' }, async (s, tag, { page }) => {
        const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
        const b = await page.evaluate(bigText);
        const r = await page.evaluate(measure, { CORAL, MINT, BANNED, scope: s.scope, exempt: EXEMPT });
        pass(`${tag}: the text is twice the size (root ${root})`, root === '32px', root);
        pass(`${tag}: no sideways scroll`, b.sideways <= 0, `${b.sideways}px`);
        pass(`${tag}: no text cut off in its box`, b.clipped.length === 0, b.clipped.join('; '));
        pass(`${tag}: spaced capitals never split inside a word`, b.split.length === 0, b.split.join(', '));
        pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
        if (width === 360) await page.screenshot({ path: join(out, `big-${s.id.replace(/\W+/g, '-')}-${width}.png`), fullPage: !s.scope }).catch(() => {});
      });
    }
  }

  // ------------------------------------------------------------ reduced motion
  if (PARTS.includes('motion')) {
    for (const width of [390, 1280]) {
      await runScreens(width, 'dark', { motion: 'reduce', label: ', reduced motion' }, async (s, tag, { page, phone }) => {
        // Open what opens on the screen (folds, tables, a pop-up, the "i") while recording.
        if (s.act) await s.act(page).catch(() => {});
        const tip = page.locator('[data-tip]:visible').first();
        if (await tip.count()) { if (phone) await tip.tap().catch(() => {}); else await tip.hover().catch(() => {}); await sleep(300); await page.mouse.move(1, 1); }
        const info = page.locator('button:has(.ds-info):visible').first();
        if (await info.count()) { await info.click().catch(() => {}); await sleep(300); await info.click().catch(() => {}); }
        await sleep(300);
        const seen = await motionSeen(page);
        pass(`${tag}: nothing animates`, seen.length === 0, seen.slice(0, 5).join('; '));
        await page.evaluate(() => { window.__motion = []; });
      });
    }
  }

  // ------------------------------------------------------------ the safe area
  if (PARTS.includes('safe')) {
    const CASES = [
      { name: 'notch', width: 390, height: 844, inset: { top: 47, left: 0, right: 0, bottom: 34 } },
      { name: 'Dynamic Island', width: 393, height: 852, inset: { top: 59, left: 0, right: 0, bottom: 34 } },
    ];
    for (const c of CASES) {
      for (const mode of ['dark', 'light']) {
        await runScreens(c.width, mode, { height: c.height, touch: true, inset: c.inset, label: `, Home Screen app on a ${c.name} (${c.inset.top}px)` }, async (s, tag, { page }) => {
          // The top of every scrolling part (the page and a guided tool's own scroller).
          await page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0; });
          await sleep(200);
          const r = await insideInsets(page, c.inset);
          pass(`${tag}: inside the insets`, r.bad.length === 0 && !r.sideways, `${r.bad.join('; ')}${r.sideways ? ' sideways' : ''}`);
          if (mode === 'dark' && c.inset.top === 59) await page.screenshot({ path: join(out, `safe-${s.id.replace(/\W+/g, '-')}.png`) }).catch(() => {});
        });
      }
    }
  }
} catch (e) {
  pass('the run finished', false, e.stack || e.message);
} finally {
  await cleanUp();
  const { data: back } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
  pass('the person’s page settings are put back as they were', JSON.stringify(back?.[0]?.page_preferences ?? {}) === JSON.stringify(prefsBefore ?? {}));
  const { data: ck } = await db.from('checkins').select('month').eq('user_id', me).in('month', [CUR, PREV]);
  pass('the check-ins for the two months are put back as they were', (ck?.length || 0) === (checkinsBefore?.length || 0));
  await browser.close();
}

const report = `${results.join('\n')}\n\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed\n`;
writeFileSync(join(out, 'report.txt'), report);
console.log(results.filter((r) => !r.startsWith('PASS')).join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed; report in ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
