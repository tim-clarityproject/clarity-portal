// Phase 5 end-to-end functionality checks (step 5c), TEST database only.
//   node --import ./tests/scores/register.mjs tests/phase5/functional.mjs   (ONLY=N,C,D,H,R)
// N  a new person (the org client, no sprint): dashboard, check-in opening, My Plans/Reviews search
// C  a monthly check-in with Health lowest: results against src/lib/scores/m13.js directly,
//    Add to my sprint as a to-do (source other_tool), saved, My Reviews row, saved results page
// D  closing a dashboard section is remembered on a second device (page_preferences.dashboard)
// H  where Review its Strategies and Make it easier this week land
// R  Recovery (seed --reset --recovery, then seed --reset): no numbers asked for, the calm lines
// Everything added is deleted; half-done check-in drafts for the two months are dropped.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { QUESTIONS, checkinMonth, monthName } from '../../src/lib/performance/checkin.js';
import { m13CheckinScores, m13Results } from '../../src/lib/scores/m13.js';

const APP = 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(n);
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`); };
const note = (s) => results.push(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(250); } return v; }
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');
async function client(email, password) {
  const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db, me: data.user.id };
}
const browser = await chromium.launch();
async function signedIn(email, password, { width = 1280 } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass('no page errors', false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  await sleep(2500);
  return { context, page };
}
const bodyText = async (page) => (await page.locator('.ui-root').allInnerTexts().catch(() => [])).join('\n');
const path = (page) => new URL(page.url()).pathname;
async function open(page, url, sel = '.ds-page-title') { await page.goto(`${APP}${url}`); await page.waitForSelector(sel, { timeout: 30000 }).catch(() => {}); await until(async () => (await page.locator('.ds-loading').count()) === 0, 20000); await sleep(1500); }
const junk = (t) => /NaN|undefined|null\b|Infinity|\[object/.test(t);

const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUR = checkinMonth(londonToday);
const prevDate = new Date(Date.UTC(Number(CUR.slice(0, 4)), Number(CUR.slice(5, 7)) - 2, 1));
const PREV = `${prevDate.toISOString().slice(0, 7)}-01`;

// ------------------------------------------------ N: a new person (org client, checked to have no plan)
if (part('N')) {
  const { db, me } = await client(env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
  const { data: plans } = await db.from('sprints').select('id').eq('user_id', me);
  const { data: cks } = await db.from('checkins').select('id, status').eq('user_id', me);
  note(`new person: ${plans?.length ?? 0} sprints, ${cks?.length ?? 0} check-ins`);
  const { context, page } = await signedIn(env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
  try {
    await open(page, '/dashboard', '.dash-page .ds-page-title');
    const t = await bodyText(page);
    note(`N dashboard: ${t.replace(/\s+/g, ' ').slice(0, 700)}`);
    pass('N dashboard: no junk values', !junk(t), t.match(/NaN|undefined|null|Infinity/)?.[0]);
    pass('N dashboard: no invented score (/100 or %)', !/\d+\/100|\d+%/.test(t), t.match(/\d+\/100|\d+%/)?.[0]);
    await open(page, '/check-in', '.ds-guide-question');
    const c = await bodyText(page);
    note(`N check-in ${path(page)}: ${c.replace(/\s+/g, ' ').slice(0, 300)}`);
    pass('N check-in opens on its opening screen', /Ready/.test(c) && !junk(c));
    pass('N check-in: no last-month figures', !/\/100|last month/i.test(c));
    for (const url of ['/my-plans', '/my-reviews']) {
      await open(page, url);
      const x = await bodyText(page);
      note(`N ${url}: ${x.replace(/\s+/g, ' ').slice(0, 250)}`);
      pass(`N ${url}: no junk, search hidden when no rows`, !junk(x) && ((await page.locator('.hlist-row').count()) > 0 || (await page.locator('input[type=search]').count()) === 0));
      await open(page, `${url}?q=zzzz`);
      pass(`N ${url}?q=: no error`, !junk(await bodyText(page)));
    }
  } finally { await context.close(); }
}

// ------------------------------------------------ the test client
const { db, me } = await client(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
const { data: running } = await db.from('sprints').select('id, number, plan_id').eq('user_id', me).eq('status', 'running').limit(1);
const sprint = running?.[0] || null;
note(`test client: running sprint ${sprint ? sprint.number : 'none'}; months ${PREV}, ${CUR}`);

// ------------------------------------------------ C: monthly check-in with Health lowest, to-do added
const W = { H1: '7 to 8 hours', H2: 'Very good', H3: 'Rarely', H4: '2½ to 5 hours', H5: '2 days or more', H6: '4 to 6 hours', H7: 'Good', H8: '1 to 7 units', H9: 'Never', H10: 'High', H11: 'High', H12: 'Poor', H13: 'Quite a lot', H14: 'No', S1: 'Often', S2: 'Often', S3: 'Sometimes', S4: 'Often', S5: 'Always', S6: 'Rarely' };
const PREV_ANS = { H1: 'h6_7', H2: 'ok', H3: 'often', H4: 'under_1', H5: 'd1', H6: 'h8_10', H7: 'ok', H8: 'u8_14', H9: 'monthly', H10: 'ok', H11: 'low', H12: 'poor', H13: 'a_little', H14: 'no', S1: 'sometimes', S2: 'sometimes', S3: 'rarely', S4: 'often', S5: 'often', S6: 'sometimes' };
const val = (k, w) => QUESTIONS.find((q) => q.code === k).options.find((o) => o.label === w).value;
const NOW = Object.fromEntries(Object.entries(W).map(([k, w]) => [k, val(k, w)]));
if (part('C')) {
  const { data: before } = await db.from('checkins').select('*').eq('user_id', me).in('month', [CUR, PREV]);
  note(`C: check-in rows before for these months: ${before?.map((r) => `${r.month} ${r.status} ${r.kind}`).join(', ') || 'none'}`);
  const addedTodos = [];
  await db.from('checkins').delete().eq('user_id', me).in('month', [CUR, PREV]);
  await db.from('checkins').insert({ user_id: me, kind: 'monthly', month: PREV, status: 'finished', answers: PREV_ANS });
  const a = m13CheckinScores(NOW); const b = m13CheckinScores(PREV_ANS); const r = m13Results(a, b);
  const exp = { hw: Math.round(a.hardware), sw: Math.round(a.software), hwc: r.hardwareChange, swc: r.softwareChange, improved: r.improved.map((x) => x.name), workOn: r.workOn.name, areas: a };
  note(`C expected from m13.js: ${JSON.stringify({ ...exp, areas: undefined })}`);
  const { context, page } = await signedIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  try {
    // any half-done draft on the device: none in a fresh context; clear any device keys anyway
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/check-?in/i.test(k)) localStorage.removeItem(k); });
    await open(page, '/check-in', '.ds-guide-question');
    await page.locator('.ds-guide-next').click();
    for (let g = 0; g < 30; g += 1) {
      await sleep(450);
      const h = (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim();
      if (h === 'Your month') break;
      const st = ((await page.locator('.ds-statement').count()) ? await page.locator('.ds-statement').first().innerText() : '').trim().replace(/^“|”$/g, '');
      const q = QUESTIONS.find((x) => x.question === h && (!x.statement || x.statement === st));
      if (!q) { pass(`C: knows the question "${h}"`, false); break; }
      const words = W[q.code];
      await page.locator('.ds-guide-body [role=radio]', { hasText: new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
      await until(async () => (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim() + (await page.locator('.ds-statement').count()) !== h + 1 || true, 1000);
      await sleep(400);
    }
    await until(async () => (await page.locator('.ck-scores .ds-stat').count()) >= 2, 10000);
    const stats = (await page.locator('.ck-scores .ds-stat').allInnerTexts()).map((s) => s.replace(/\s+/g, ' '));
    note(`C results on screen: ${stats.join(' || ')}`);
    pass(`C Hardware ${exp.hw}/100 matches m13`, stats[0]?.includes(`${exp.hw}/100`), stats[0]);
    pass(`C Software ${exp.sw}/100 matches m13`, stats[1]?.includes(`${exp.sw}/100`), stats[1]);
    pass(`C Hardware change ${exp.hwc} matches m13`, stats[0]?.includes(exp.hwc > 0 ? `up ${exp.hwc}` : exp.hwc < 0 ? `down ${-exp.hwc}` : 'same'), stats[0]);
    pass(`C Software change ${exp.swc} matches m13`, stats[1]?.includes(exp.swc > 0 ? `up ${exp.swc}` : exp.swc < 0 ? `down ${-exp.swc}` : 'same'), stats[1]);
    const improved = await page.locator('.ck-improved li').allInnerTexts();
    pass('C what improved matches m13 (names, order)', JSON.stringify(improved.map((l) => exp.improved.find((n) => l.startsWith(n)))) === JSON.stringify(exp.improved), `${improved} vs ${exp.improved}`);
    const one = (await page.locator('.ck-one-area').innerText().catch(() => '')).trim();
    pass(`C one thing to work on is ${exp.workOn}`, one === exp.workOn, one);
    if (sprint) {
      await page.locator('.ck-one-add').click();
      await page.waitForSelector('.ds-dialog', { timeout: 5000 });
      const dlg = (await page.locator('.ds-dialog').innerText()).replace(/\s+/g, ' ');
      note(`C add panel: ${dlg.slice(0, 300)}`);
      if (await page.locator('.ds-dialog .ds-choice [role=radio]').count()) await page.locator('.ds-dialog .ds-choice').last().locator('[role=radio]').first().click();
      await page.locator('.ds-dialog .ds-btn--primary').click();
      const line = await until(async () => (await page.locator('.ck-one-added').innerText()).trim(), 8000);
      pass('C Add to my sprint says a to-do', line === `It’s in Performance Sprint ${sprint.number} as a to-do.`, line);
      const rows = await until(async () => { const { data } = await db.from('todos').select('id, text, source, planned_week, sprint_id, strategy_id').eq('user_id', me).ilike('text', '%check-up%').order('created_at', { ascending: false }).limit(3); return data?.length ? data : null; }, 10000);
      rows?.forEach((x) => addedTodos.push(x.id));
      note(`C to-do rows: ${JSON.stringify(rows?.map(({ id: _i, ...x }) => x))}`);
      pass('C to-do in the database, source other_tool, one row', rows?.length === 1 && rows[0].source === 'other_tool', JSON.stringify(rows?.map((x) => x.source)));
    }
    await page.locator('.ds-guide-next').click();
    await until(async () => path(page) === '/welcome', 10000);
    await sleep(1500);
    const { data: done } = await db.from('checkins').select('status, hardware_score, software_score').eq('user_id', me).eq('month', CUR).limit(1);
    pass('C saved finished with m13 scores', done?.[0]?.status === 'finished' && Math.round(done[0].hardware_score) === exp.hw && Math.round(done[0].software_score) === exp.sw, JSON.stringify(done));
    await open(page, '/my-reviews');
    const name = `${monthName(CUR)} check-in`;
    const row = page.locator('.hlist-row', { hasText: name });
    pass(`C My Reviews has "${name}"`, Boolean(await until(async () => (await row.count()) === 1, 15000)));
    await row.locator('a, button').first().click();
    await until(async () => (await page.locator('.ck-scores .ds-stat').count()) >= 2, 15000);
    const saved = (await page.locator('.ck-scores .ds-stat').allInnerTexts()).map((s) => s.replace(/\s+/g, ' '));
    note(`C saved page ${path(page)}: ${saved.join(' || ')}`);
    pass('C saved results page shows the same scores', saved[0]?.includes(`${exp.hw}/100`) && saved[1]?.includes(`${exp.sw}/100`), saved.join('|'));
  } finally {
    await context.close();
    for (const id of addedTodos) await db.from('todos').delete().eq('id', id).eq('user_id', me);
    await db.from('checkins').delete().eq('user_id', me).in('month', [CUR, PREV]);
    const keep = (before || []).filter((x) => x.status === 'finished'); // half-done drafts are not put back
    if (keep.length) await db.from('checkins').insert(keep.map(({ hardware_score: _h, software_score: _s, area_scores: _a, methods_version: _m, ...x }) => x));
    note(`C cleanup: ${addedTodos.length} to-dos removed, drafts dropped: ${(before || []).filter((x) => x.status !== 'finished').length}`);
  }
}

// ------------------------------------------------ D: dashboard taps, collapse remembered on a second device
if (part('D')) {
  const { data: s0 } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
  const prefsBefore = s0?.[0]?.page_preferences ?? {};
  const want = { 'Plan my sleep': '/sleep-wind-down', 'Plan some recovery': '/personal/reset', 'Review its Strategies': '/performance-plan', 'Plan it into this week': '/performance-sprint', 'Make it easier this week': '/performance-sprint' };
  let c1 = await signedIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  try {
    await open(c1.page, '/dashboard', '.dash-page .ds-page-title');
    const fixes = await c1.page.locator('.dash-fix').allInnerTexts();
    note(`D fixes on the dashboard: ${fixes.join(' | ') || 'none'}`);
    for (let i = 0; i < fixes.length; i += 1) {
      await open(c1.page, '/dashboard', '.dash-page .ds-page-title');
      const f = c1.page.locator('.dash-fix').nth(i);
      const words = (await f.innerText()).trim();
      await f.evaluate((el) => el.click());
      const ok = await until(async () => path(c1.page) === want[words], 8000);
      let extra = '';
      if (ok && words === 'Plan it into this week') extra = (await until(async () => c1.page.locator('.ds-dialog', { hasText: 'Add a to-do' }).isVisible(), 6000)) ? '' : ' (no Add a to-do panel)';
      if (ok && words === 'Review its Strategies') extra = (await until(async () => new URL(c1.page.url()).hash === '#strategies', 3000)) ? '' : ` (hash ${new URL(c1.page.url()).hash})`;
      pass(`D "${words}" lands on ${want[words]}${extra}`, ok && !extra, c1.page.url() + extra);
    }
    await open(c1.page, '/dashboard', '.dash-page .ds-page-title');
    const heads = c1.page.locator('.dash-sec-h .dash-colb');
    const n = await heads.count();
    const target = heads.nth(n - 1);
    const label = (await target.innerText()).trim();
    await target.evaluate((el) => el.click());
    await sleep(500);
    await until(async () => { const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1); return JSON.stringify(data?.[0]?.page_preferences?.dashboard) !== JSON.stringify(prefsBefore?.dashboard); }, 10000);
    const { data: s1 } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
    note(`D page_preferences.dashboard after closing "${label}": ${JSON.stringify(s1?.[0]?.page_preferences?.dashboard)}`);
  } finally { await c1.context.close(); }
  const c2 = await signedIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD, { width: 390 });
  try {
    await open(c2.page, '/dashboard', '.dash-page .ds-page-title');
    const heads = c2.page.locator('.dash-sec-h .dash-colb');
    const last = heads.nth((await heads.count()) - 1);
    pass('D a second device (phone) shows that section closed', (await last.getAttribute('aria-expanded')) === 'false', await last.getAttribute('aria-expanded'));
  } finally {
    await c2.context.close();
    await db.from('person_settings').update({ page_preferences: prefsBefore }).eq('user_id', me);
  }
}


// ------------------------------------------------ H: where the other holding-back fixes land (no seeded weeks needed)
if (part('H') && sprint) {
  const c = await signedIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  try {
    await open(c.page, '/dashboard', '.dash-page .ds-page-title');
    const { data: habits } = await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id).limit(1);
    // As Dashboard.jsx's go(): navigate(to + hash, { state })
    const nav = (to, state) => c.page.evaluate(([t, st]) => { window.history.pushState({ usr: st, key: 'fx', idx: (window.history.state?.idx || 0) + 1 }, '', t); window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })); }, [to, state]);
    await nav('/performance-plan#strategies', null);
    await until(async () => (await c.page.locator('#strategies').count()) > 0, 15000);
    await sleep(1500);
    const top = await c.page.locator('#strategies').evaluate((el) => el.getBoundingClientRect().top).catch(() => null);
    pass('H "Review its Strategies": the plan opens at its Strategies', top != null && top >= -5 && top < 300, String(top));
    if (habits?.[0]) {
      await nav('/performance-sprint', { openHabit: habits[0].id });
      const opened = await until(async () => (await c.page.locator('.ds-dialog, .ds-sheet', { hasText: habits[0].name }).count()) > 0, 10000);
      pass('H "Make it easier this week": the sprint opens that habit', Boolean(opened), (await bodyText(c.page)).slice(0, 200));
    } else note('H no habit in the sprint');
  } finally { await c.context.close(); }
}

// ------------------------------------------------ R: Recovery
if (part('R')) {
  execFileSync('node', ['scripts/seed-test-plan.mjs', '--reset', '--recovery'], { stdio: 'pipe' });
  const LINE = 'You’re in recovery, so there are no numbers to log today.';
  const c = await signedIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  try {
    for (const [url, sel] of [['/welcome', '.home-page .ds-page-title'], ['/my-day/plan', '.ui-root h1, .ui-root h2'], ['/my-day/review', '.ui-root h1, .ui-root h2']]) {
      await open(c.page, url, sel);
      await sleep(1500);
      let t = await bodyText(c.page);
      let numbers0 = 0;
      for (let i = 0; url !== '/welcome' && i < 6; i += 1) {
        numbers0 += await c.page.locator('input[type=number], input[inputmode=decimal], input[inputmode=numeric]').count();
        const next = c.page.getByRole('button', { name: /^(Next|Skip|Start)/ }).first();
        if (!(await next.count())) break;
        await next.click(); await sleep(1200);
        t += `\n${await bodyText(c.page)}`;
      }
      note(`R ${url} number boxes across screens: ${numbers0}`);
      note(`R ${url}: ${t.replace(/\s+/g, ' ').slice(0, 400)}`);
      pass(`R ${url}: "${LINE}" or the calm day line`, t.includes(LINE) || t.includes('Your daily tools are paused while you recharge'), t.slice(-300));
      note(`R ${url}: numbers line shown: ${t.includes(LINE)}`);
      const numbers = await c.page.locator('input[type=number], input[inputmode=decimal], input[inputmode=numeric]').count();
      pass(`R ${url}: nothing asks for numbers (${numbers} number boxes)`, numbers === 0);
      pass(`R ${url}: no junk`, !junk(t));
      note(`R ${url}: "Ready to go again" buttons: ${await c.page.getByRole('button', { name: 'Ready to go again', exact: true }).count()}`);
    }
  } finally {
    await c.context.close();
    execFileSync('node', ['scripts/seed-test-plan.mjs', '--reset'], { stdio: 'pipe' });
    note('R cleanup: seed --reset run');
  }
}

await browser.close();
const counted = results.filter((x) => !x.startsWith('NOTE'));
results.push(`\n${counted.length - failures} of ${counted.length} passed`);
console.log(results.join('\n'));
process.exit(failures ? 1 : 0);
