// Phase 5 step 3: Patterns in your numbers (methods M14; mock-up M4 v47's
// pattern cards) in the running app, signed in as the invented test client
// on the TEST database only (every other host, /functions/v1/ and every
// email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase5/patterns.mjs [folder]
//
// Nothing is seeded in the database: each client's weeks are invented and
// served to the page in place of the database's answers (an in-test copy
// of the reads the pages make, filtered as the database would), so the
// test is gentle on the test database. The one thing written is the
// pattern state in the person's own page settings
// (person_settings.page_preferences.patterns), which is real, and is put
// back as it was at the end.
//
// T  Too little data (4 weeks): no Patterns row on the dashboard, and the
//    debrief explains the logging gap once (rule 22).
// F  Enough data with no real link (25 weeks): the row says "No clear link
//    yet." (rule 21).
// P  A planted link (25 weeks in which the weekly strategic block and its
//    Strategy's score, worked out without it, go together): the check runs
//    on the device, the card arrives in the weekly debrief first (rule 17),
//    then shows on the dashboard with Strong or Clear link, "In weeks
//    you…", the open question, How was this worked out? and the one-tap
//    action landing on the sprint; opening the debrief again introduces
//    nothing more (at most one a week); Not useful hides it. Laptop and
//    phone, dark and light: the writing rules, 44px taps, at most one coral
//    button, no sideways scrolling; and every one of tests/phase5/measure.mjs's
//    rules on the dashboard with its card at 1280, 640, 390 and 360px, dark
//    and light (pop-ups that never move the page included), on the
//    debrief's card, at twice the text size and with reduced motion.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { addDays } from '../../src/lib/scores/dates.js';
import { m14Rng } from '../../src/lib/scores/m14.js';
import { BANNED, CORAL as CORALS, MINT, bigText, measure, motionRecorder, motionSeen, popups, ruleChecks } from './measure.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || join(process.cwd(), 'tmp-phase5-patterns');
mkdirSync(out, { recursive: true });

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(300);
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

const { data: settingsRow } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = settingsRow?.[0]?.page_preferences ?? {};
async function readPatterns() {
  const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
  return data?.[0]?.page_preferences?.patterns ?? null;
}
async function clearPatterns() {
  const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
  const p = { ...(data?.[0]?.page_preferences || {}) };
  delete p.patterns;
  await db.from('person_settings').update({ page_preferences: p }).eq('user_id', me);
}

// ---------------------------------------------------------------- the invented clients

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLAN = uuid(1);
const STRATEGY = uuid(2);
/**
 * Two sprints: Sprint 1 (10 weeks, finished) and Sprint 2 (16 weeks,
 * running), each week starting on today's weekday, so yesterday ended
 * Sprint 2's week 15 and its debrief is open. `weeks` finished weeks of
 * logs (the latest ones); `planted` makes client calls run high in weeks
 * the weekly strategic block was kept.
 */
function world({ weeks, planted }) {
  const s2Start = addDays(today, -15 * 7);
  const s1Start = addDays(s2Start, -10 * 7);
  const S1 = { id: uuid(11), user_id: me, plan_id: PLAN, number: 1, label: null, start_on: s1Start, length_weeks: 10, standard: 85, status: 'finished', planned_end_on: addDays(s2Start, -1), actual_end_on: addDays(s2Start, -1), finished_at: `${addDays(s2Start, -1)}T20:00:00`, updated_at: '2026-01-01T00:00:00' };
  const S2 = { id: uuid(12), user_id: me, plan_id: PLAN, number: 2, label: null, start_on: s2Start, length_weeks: 16, standard: 85, status: 'running', planned_end_on: addDays(s2Start, 16 * 7 - 1), actual_end_on: null, finished_at: null, updated_at: '2026-01-01T00:00:00' };
  const rng = m14Rng(planted ? 7 : 19);
  const t = {
    sprints: [S1, S2],
    performance_plans: [{ id: PLAN, user_id: me, status: 'active', mission: 'Grow a coaching practice people recommend', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }],
    plan_strategies: [{ id: STRATEGY, user_id: me, plan_id: PLAN, name: 'Grow through referrals', description: null, sort_order: 0, archived_at: null }],
    habits: [],
    sprint_habits: [],
    sprint_habit_settings: [],
    habit_logs: [],
    day_plans: [],
  };
  let n = 0;
  const total = 25;
  for (const s of [S1, S2]) {
    const a = { id: uuid(100 + s.number), user_id: me, sprint_id: s.id, habit_id: uuid(201), strategy_id: STRATEGY, name: 'Weekly strategic block', sort_order: 0 };
    const b = { id: uuid(110 + s.number), user_id: me, sprint_id: s.id, habit_id: uuid(202), strategy_id: STRATEGY, name: 'Client calls', sort_order: 1 };
    t.sprint_habits.push(a, b);
    t.sprint_habit_settings.push(
      { id: uuid(300 + s.number), sprint_habit_id: a.id, user_id: me, from_week: 1, measure: 'yes_no_weekly', unit: null, target: null, target_per: null, limit_value: null, limit_per: null, direction: null, top_number: null, impact: 2 },
      { id: uuid(310 + s.number), sprint_habit_id: b.id, user_id: me, from_week: 1, measure: 'count', unit: 'calls', target: 5, target_per: 'week', limit_value: null, limit_per: null, direction: null, top_number: null, impact: 2 },
    );
    const finished = s.number === 1 ? 10 : 15;
    for (let w = 1; w <= finished; w += 1) {
      n += 1;
      const kept = rng() < 0.5;
      const sum = planted ? (kept ? 5 : 2 + Math.floor(rng() * 2)) : 2 + Math.floor(rng() * 4);
      if (n <= total - weeks) continue;
      const start = addDays(s.start_on, (w - 1) * 7);
      const working = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i)).filter((d) => { const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); return wd >= 1 && wd <= 5; });
      if (kept) t.habit_logs.push({ id: uuid(10000 + n * 10), sprint_habit_id: a.id, user_id: me, local_date: working[0], value: 1, to_confirm: false, updated_at: '2026-01-01T00:00:00' });
      const per = [1, 1, 1, 1];
      for (let k = 4; k < sum; k += 1) per[k % 4] += 1;
      if (sum < 4) per[3] = 0;
      if (sum < 3) per[2] = 0;
      per.forEach((v, i) => t.habit_logs.push({ id: uuid(10001 + n * 10 + i), sprint_habit_id: b.id, user_id: me, local_date: working[i], value: v, to_confirm: false, updated_at: '2026-01-01T00:00:00' }));
    }
  }
  return t;
}

// A small copy of the database's reads (PostgREST filters), for the invented tables.
function cmp(a, b) {
  const na = Number(a); const nb = Number(b);
  if (a !== null && b !== null && a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && !/^\d{4}-/.test(String(a))) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function answer(tables, url) {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  let list = [...(tables[table] || [])];
  for (const [k, raw] of u.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const neg = raw.startsWith('not.');
    const v = neg ? raw.slice(4) : raw;
    const dot = v.indexOf('.');
    const op = v.slice(0, dot);
    const val = v.slice(dot + 1);
    const test = (r) => {
      const x = r[k] === undefined ? null : r[k];
      if (op === 'eq') return String(x) === val;
      if (op === 'neq') return String(x) !== val;
      if (op === 'gte') return x != null && cmp(x, val) >= 0;
      if (op === 'gt') return x != null && cmp(x, val) > 0;
      if (op === 'lte') return x != null && cmp(x, val) <= 0;
      if (op === 'lt') return x != null && cmp(x, val) < 0;
      if (op === 'is') return val === 'null' ? x == null : String(x) === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(x));
      return true;
    };
    list = list.filter((r) => (neg ? !test(r) : test(r)));
  }
  const order = u.searchParams.get('order');
  if (order) {
    const [col, dir] = order.split(',')[0].split('.');
    list.sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[col], b[col]));
  }
  const limit = Number(u.searchParams.get('limit'));
  if (limit) list = list.slice(0, limit);
  return list;
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function newContext({ width = 1280, mode = 'dark', tables, motion = 'no-preference', scale = 1 }) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: motion });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  if (motion === 'reduce') await context.addInitScript(motionRecorder);
  if (scale !== 1) {
    await context.addInitScript((sc) => {
      const add = () => { const st = document.createElement('style'); st.textContent = `html{font-size:${16 * sc}px !important}`; document.head.appendChild(st); };
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    }, scale);
  }
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (/\/rest\/v1\//.test(url) && !/\/rest\/v1\/(person_settings|profiles)\b/.test(url)) {
      if (/\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        const body = answer(tables, url);
        const single = /vnd\.pgrst\.object/.test(req.headers().accept || '');
        if (single) {
          return body.length
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body[0]) })
            : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, body.length - 1)}/${body.length}` }, body: JSON.stringify(body) });
      }
      // Writes to the invented tables go nowhere (nothing is written to the database).
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page };
}
async function dashboard(page) {
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('.dash-page .ds-page-title', { timeout: 30000 });
  await until(async () => (await page.locator('.dash-page .ds-loading').count()) === 0);
  await sleep(1500);
}
async function debriefSummary(page) {
  await page.goto(`${APP}/performance-sprint/debrief`);
  await until(async () => (await page.getByRole('button', { name: 'Skip' }).count()) > 0 || (await page.getByRole('button', { name: 'Finish my debrief' }).count()) > 0, 30000);
  for (let i = 0; i < 14; i += 1) {
    if (await page.getByRole('button', { name: 'Finish my debrief' }).count()) break;
    const next = page.getByRole('button', { name: 'Next', exact: true });
    if (await next.count()) await next.first().click();
    else await page.getByRole('button', { name: 'Skip' }).first().click();
    await sleep(350);
  }
  await sleep(1500);
}
async function shot(page, name) { await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }).catch(() => {}); }
async function openPatternsFold(page) {
  const head = page.locator('.dash-fold-h', { hasText: 'Patterns in your numbers' });
  if (!(await head.count())) return false;
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
  await sleep(400);
  return true;
}

/** The pattern cards' own checks: one sentence a line, no colons or brackets, 44px taps, no sideways scrolling. */
async function cardChecks(page, name) {
  const m = await page.evaluate(() => {
    const CORAL = ['rgb(255, 111, 92)'];
    const cards = [...document.querySelectorAll('.ds-pattern')];
    const lines = cards.flatMap((c) => c.innerText.split('\n').map((l) => l.trim()).filter(Boolean));
    const small = [];
    for (const b of document.querySelectorAll('.ds-pattern button')) {
      const r = b.getBoundingClientRect();
      if (r.height < 43.5) small.push(`${b.textContent} ${Math.round(r.height)}`);
    }
    const coral = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width && CORAL.includes(getComputedStyle(b).backgroundColor)).length;
    const cols = cards.length ? new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size : 0;
    return { lines, small, coral, cols, sideways: document.documentElement.scrollWidth - window.innerWidth };
  });
  const writing = m.lines.filter((l) => /:(?!\d)|[()[\]]|[–—;…]|\bbecause\b/i.test(l) || l.split(/(?<=[.!?][”’]?)\s+(?=[A-Z“])/).length > 1);
  pass(`${name}: the writing rules in the cards`, !writing.length, writing.join(' | '));
  pass(`${name}: 44px taps in the cards`, !m.small.length, m.small.join('; '));
  pass(`${name}: at most one coral button`, m.coral <= 1, m.coral);
  pass(`${name}: no sideways scrolling`, m.sideways <= 0, m.sideways);
  return m;
}

try {
  // ------------------------------------------------------------ T: too little data
  await clearPatterns();
  {
    const tables = world({ weeks: 4, planted: true });
    const { context, page } = await newContext({ tables });
    await dashboard(page);
    const state = await until(readPatterns, 20000);
    pass('T: the check ran on the device and saved its state', Boolean(state?.week), JSON.stringify(state)?.slice(0, 200));
    pass('T: nothing to check yet with 4 weeks', state?.evaluated === 0, state?.evaluated);
    const text = await page.locator('.dash-page').innerText();
    pass('T: no Patterns row on the dashboard', !text.includes('Patterns in your numbers'));
    await shot(page, 'T-dashboard');
    await debriefSummary(page);
    const deb = await page.locator('body').innerText();
    pass('T: the debrief explains the gap once', deb.includes('Patterns in your numbers appear once there’s enough data, usually after 8 to 12 weeks.'), deb.slice(-600));
    await shot(page, 'T-debrief');
    const after = await until(async () => ((await readPatterns())?.gapNoted ? readPatterns() : null), 15000);
    pass('T: the gap is marked as explained', Boolean(after?.gapNoted));
    await context.close();
    const again = await newContext({ tables });
    await debriefSummary(again.page);
    const deb2 = await again.page.locator('body').innerText();
    pass('T: and never again', !deb2.includes('appear once there’s enough data'));
    await again.context.close();
  }

  // ------------------------------------------------------------ F: no real link
  await clearPatterns();
  {
    const tables = world({ weeks: 25, planted: false });
    const { context, page } = await newContext({ tables });
    await dashboard(page);
    const state = await until(async () => { const s = await readPatterns(); return s?.week ? s : null; }, 25000);
    pass('F: the check ran', Boolean(state?.week));
    pass('F: links were checked', state?.evaluated > 0, state?.evaluated);
    pass('F: no card from no real link', (state?.cards || []).length === 0, JSON.stringify(state?.cards));
    await page.reload();
    await dashboard(page);
    const opened = await openPatternsFold(page);
    pass('F: the Patterns row shows once there is enough data', opened);
    const text = await page.locator('.dash-page').innerText();
    pass('F: "No clear link yet" as an honest answer', text.includes('No clear link yet.') && text.includes('A card only shows when a link is strong enough that it’s very unlikely to be chance.'));
    await shot(page, 'F-dashboard');
    await context.close();
  }

  // ------------------------------------------------------------ P: a planted link
  await clearPatterns();
  {
    const tables = world({ weeks: 25, planted: true });
    const { context, page } = await newContext({ tables });
    await dashboard(page);
    const state = await until(async () => { const s = await readPatterns(); return s?.week ? s : null; }, 25000);
    pass('P: one new card at the weekly check (at most one a week)', (state?.cards || []).length === 1, JSON.stringify(state?.cards));
    const card = state?.cards?.[0];
    pass('P: the planted link was found (L3, the habit and its Strategy)', card?.id === 'L3', card?.key);
    pass('P: Strong link or Clear link, corrected chance under 2.6%', ['strong', 'clear'].includes(card?.strength) && card?.q < 0.026, `${card?.strength} ${card?.q}`);
    await page.reload();
    await dashboard(page);
    let text = await page.locator('.dash-page').innerText();
    pass('P: not on the dashboard before the debrief introduces it', !text.includes('A habit and its Strategy') && !text.includes('No clear link yet'));

    await debriefSummary(page);
    const deb = page.locator('.deb-pattern');
    pass('P: the card arrives in the weekly debrief', (await deb.count()) === 1 && /a new pattern in your numbers/i.test(await deb.innerText()));
    const dt = (await deb.innerText().catch(() => '')) || '';
    pass('P: the debrief card says "In weeks you kept"', /In weeks you kept “(Weekly strategic block|Client calls)”, “Grow through referrals” scored \d+ points? higher\./.test(dt), dt);
    await cardChecks(page, 'P debrief');
    ruleChecks(pass, 'P debrief card (measured)', await page.evaluate(measure, { CORAL: CORALS, MINT, BANNED, scope: '.deb-pattern' }), 'atMost');
    await shot(page, 'P-debrief');
    const marked = await until(async () => { const s = await readPatterns(); return s?.introKey ? s : null; }, 15000);
    pass('P: the debrief marks it introduced', marked?.introKey === card?.key, JSON.stringify(marked?.intro));

    for (const [width, mode] of [1280, 640, 390, 360].flatMap((w) => [[w, 'dark'], [w, 'light']])) {
      const c = width === 1280 && mode === 'dark' ? { context, page } : await newContext({ width, mode, tables });
      await dashboard(c.page);
      await until(async () => (await c.page.locator('.dash-fold-h', { hasText: 'Patterns in your numbers' }).count()) > 0, 20000);
      await openPatternsFold(c.page);
      await shot(c.page, `P-${width}-${mode}-before`);
      { const st = await readPatterns(); results.push(`NOTE  ${width} ${mode} state: week ${st?.week} on ${st?.on} cards ${st?.cards?.map((x) => x.key).join()} intro ${JSON.stringify(st?.intro)} hidden ${st?.hidden}`); }
      text = await c.page.locator('.dash-page').innerText();
      const n = `P ${width}px ${mode}`;
      pass(`${n}: the row line`, text.includes('1 pattern has been found in your own numbers.'));
      pass(`${n}: the card with its strength and open question`, (await c.page.locator('.ds-pattern').count()) === 1 && /(Strong|Clear) link/.test(text) && /\?\n/.test(`${text}\n`));
      const how = c.page.locator('.ds-pattern').getByRole('button', { name: 'How was this worked out?' });
      await how.click();
      await sleep(400);
      const h = await c.page.locator('.ds-pattern-how').innerText().catch(() => '');
      pass(`${n}: How was this worked out? gives the groups, averages, swing, chance and both halves`,
        /^Compared \d+ weeks with “.+” kept with \d+ weeks without\./m.test(h) && /Average \d+% against \d+%\./.test(h) && /usually swings about/.test(h) && /by chance/.test(h) && /both halves/.test(h), h);
      pass(`${n}: How was this worked out? opens in place`, (await how.getAttribute('aria-expanded')) === 'true');
      const m = await cardChecks(c.page, n);
      pass(`${n}: ${width < 600 ? 'one column on a phone' : 'cards in the grid'}`, m.cols === 1, m.cols);
      // Every measured rule on the whole dashboard with its card, and its pop-ups.
      await c.page.mouse.move(0, 0);
      const r = await c.page.evaluate(measure, { CORAL: CORALS, MINT, BANNED, exempt: '^The work behind it is ' });
      ruleChecks(pass, `${n} (measured)`, r, 'atMost');
      pass(`${n}: follows the mode`, r.theme === mode, r.theme);
      await popups(c.page, width < 769, pass, `${n} (measured)`);
      await shot(c.page, n.replace(/[^a-z0-9]+/gi, '-'));
      if (c.page !== page) await c.context.close();
    }

    // Twice the text size (360px) and reduced motion (390px), with the card open.
    {
      const big = await newContext({ width: 360, mode: 'dark', tables, scale: 2 });
      await dashboard(big.page);
      await openPatternsFold(big.page);
      await big.page.locator('.ds-pattern').getByRole('button', { name: 'How was this worked out?' }).click().catch(() => {});
      await sleep(400);
      const b = await big.page.evaluate(bigText);
      pass('P 360px twice the text size: no sideways scroll', b.sideways <= 0, b.sideways);
      pass('P 360px twice the text size: no text cut off in its box', !b.clipped.length, b.clipped.join('; '));
      pass('P 360px twice the text size: spaced capitals never split inside a word', !b.split.length, b.split.join(', '));
      pass('P 360px twice the text size: 44px taps in the cards', !(await cardChecks(big.page, 'P 360px twice the text size')).small.length);
      await shot(big.page, 'P-360-big');
      await big.context.close();
      const still = await newContext({ width: 390, mode: 'dark', tables, motion: 'reduce' });
      await dashboard(still.page);
      await openPatternsFold(still.page);
      await still.page.locator('.ds-pattern').getByRole('button', { name: 'How was this worked out?' }).click().catch(() => {});
      await sleep(600);
      const seen = await motionSeen(still.page);
      pass('P 390px reduced motion: nothing animates as the row and the card open', !seen.length, seen.slice(0, 5).join('; '));
      await still.context.close();
    }

    // One tap to act, worded as the action, landing where it is done.
    await dashboard(page);
    await openPatternsFold(page);
    await page.locator('.ds-pattern').getByRole('button', { name: 'Plan it into this week' }).click();
    await page.waitForURL(/\/performance-sprint/, { timeout: 15000 }).catch(() => {});
    pass('P: Plan it into this week opens the sprint', /\/performance-sprint/.test(page.url()), page.url());

    // At most one a week: the debrief opened again shows the same card, and nothing more is introduced.
    await debriefSummary(page);
    const again = await readPatterns();
    pass('P: the same debrief again introduces nothing more', Object.keys(again?.intro || {}).length === 1 && again?.introKey === card?.key, JSON.stringify(again?.intro));

    // Not useful hides it for this person.
    await dashboard(page);
    await openPatternsFold(page);
    await page.locator('.ds-pattern').getByRole('button', { name: 'Not useful' }).click();
    const hidden = await until(async () => { const s = await readPatterns(); return s?.hidden?.length ? s : null; }, 15000);
    pass('P: Not useful hides the card', hidden?.hidden?.includes(card?.key));
    await sleep(600);
    pass('P: the card has gone', (await page.locator('.ds-pattern').count()) === 0);
    await context.close();
  }
} catch (e) {
  pass('the run finished', false, e.stack || e.message);
} finally {
  await db.from('person_settings').update({ page_preferences: prefsBefore }).eq('user_id', me);
  const back = await readPatterns();
  pass('the person’s page settings are put back as they were', JSON.stringify(back ?? null) === JSON.stringify(prefsBefore?.patterns ?? null));
  await browser.close();
}

const report = `${results.join('\n')}\n\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed\n`;
writeFileSync(join(out, 'report.txt'), report);
console.log(report);
process.exit(failures ? 1 : 0);
