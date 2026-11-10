// Phase 4 step 5: renames and redirects, in the running app, signed in as
// the invented test client on the TEST database only (every other host and
// every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/renames.mjs [folder for screenshots]
//
// 1. Every old address of a renamed tool lands on its new one, with the
//    query, the hash and the state passed on, and a saved item opened
//    through an old address is the same item (one invented item per
//    renamed tool, taken away again at the end).
// 2. /review-plan's two meanings: with no plan it is the new Daily review;
//    with a saved plan (a meeting plan here) it still reviews that plan.
//    /plan-my-day the same: the new Daily plan, or an old saved day plan.
// 3. A pin stored as an old address still opens its tool (and a pin
//    stored as a tool key, as the menu saves them, too).
// 4. No old name in the visible text, aria-labels or titles of any page in
//    the route list (App.jsx), desktop and phone. Writes to tables are
//    blocked while the pages are crawled, so nothing is saved by opening
//    a page (reads through the database's functions still run).
//
// The clock is fixed (tests/phase2/fixed-day.mjs). The seed itself is not
// changed: only the invented items and the pins, put back at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fixClock, FIXED_TODAY } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(String(n));
const STAMP = 'Renames check';

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
const made = { decisions: [], checkins: [] };
async function insert(table, row, bucket) {
  const { data, error } = await db.from(table).insert(row).select('*');
  if (error) throw new Error(`${table}: ${error.message}`);
  made[bucket].push(data[0].id);
  return data[0];
}

const { data: prefRows } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const originalPrefs = prefRows?.[0] ? (prefRows[0].page_preferences || {}) : null;
async function setPins(pins) {
  const prefs = { ...(originalPrefs || {}), menu_pins: pins };
  const q = originalPrefs
    ? db.from('person_settings').update({ page_preferences: prefs }).eq('user_id', me)
    : db.from('person_settings').upsert({ user_id: me, page_preferences: prefs }, { onConflict: 'user_id' });
  const { error } = await q;
  if (error) throw error;
}

async function cleanUp() {
  if (made.decisions.length) await db.from('decisions').delete().in('id', made.decisions).eq('user_id', me);
  if (made.checkins.length) await db.from('wheel_of_life_checkins').delete().in('id', made.checkins).eq('user_id', me);
  const prefs = { ...(originalPrefs || {}) };
  if (!originalPrefs || !('menu_pins' in originalPrefs)) delete prefs.menu_pins;
  if (originalPrefs) await db.from('person_settings').update({ page_preferences: prefs }).eq('user_id', me);
}

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n').slice(0, 4).join(' '));
  try { await cleanUp(); } catch { /* reported above */ }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

async function formFor(tool) {
  const { data } = await db.from('decisions').select('form_data').eq('user_id', me).eq('tool_type', tool).not('form_data', 'is', null).limit(1);
  return data?.[0]?.form_data || {};
}
async function decision(tool, title, extra = {}) {
  return insert('decisions', {
    user_id: me, tool_type: tool, title, form_data: { ...(await formFor(tool)), ...extra }, status: 'completed', created_at: '2026-10-14T09:00:00',
  }, 'decisions');
}
async function freeDay(from) {
  const { data } = await db.from('wheel_of_life_checkins').select('checkin_date').eq('user_id', me);
  const taken = new Set((data || []).map((r) => r.checkin_date));
  for (let i = 0; i < 60; i += 1) {
    const [y, m, d] = from.split('-').map(Number);
    const key = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (!taken.has(key)) return key;
  }
  throw new Error('No free day for a Life balance review');
}

const items = {
  grow: await decision('grow', `${STAMP}: Referral pipeline`, { goal: `${STAMP}: win two referrals a month` }),
  inversion: await decision('inversion', `${STAMP}: Harbour proposal`, { goal: `${STAMP}: land the Harbour proposal` }),
  pressure: await decision('if_then_planning', `${STAMP}: Board presentation`),
  audit: await decision('stop_doing_audit', `${STAMP}: Monday mornings`),
  feedback: await decision('tough-conversation', `${STAMP}: Late reports`),
  meeting: await decision('plan_meeting', `${STAMP}: Harbour introduction call`),
  dayPlan: await decision('daily_plan', 'Tuesday 13th October, 2026'),
};
const wheelDay = await freeDay('2026-07-01');
items.wheel = await insert('wheel_of_life_checkins', {
  user_id: me, checkin_date: wheelDay, checkin_at: `${wheelDay}T10:00:00Z`, scores: { health: 6, career: 7 },
  areas: [{ key: 'health', label: 'Health / Fitness' }, { key: 'career', label: 'Career / Work' }], notes: {}, focus_area_key: 'health',
}, 'checkins');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wheelLabel = `${+wheelDay.slice(8)} ${MON[+wheelDay.slice(5, 7) - 1]} ${wheelDay.slice(0, 4)}`;

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
let blockWrites = false;
let blocked = 0;

async function signedIn({ width = 1280, mode = 'dark' } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await fixClock(context);
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (blockWrites && url.includes(TEST_HOST) && /\/rest\/v1\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())
      && !/\/rest\/v1\/rpc\//.test(url)) {
      blocked += 1;
      return route.abort();
    }
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
  // A sign-in can stop on /auth/welcome-back first: go on to Home.
  await home(page);
  return { context, page, errors };
}

const here = (page) => { const u = new URL(page.url()); return { path: u.pathname, search: u.search, hash: u.hash }; };
const landsOn = (page, want, ms = 20000) => until(async () => here(page).path === want, ms);
async function pushRoute(page, to, state) {
  await page.evaluate(({ to: t, state: s }) => {
    window.history.pushState({ usr: s, key: `t${Date.now()}`, idx: (window.history.state?.idx ?? 0) + 1 }, '', t);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, { to, state });
}
// The page's words, typed answers included.
const pageText = (page) => page.evaluate(() => [
  document.body.innerText,
  ...[...document.querySelectorAll('textarea, input')].map((e) => e.value || ''),
].join('\n'));
// Titles are drawn in capitals (CSS), so the words are matched in any case.
const shows = (page, words, ms = 20000) => until(async () => (await pageText(page)).toLowerCase().includes(words.toLowerCase()), ms);
async function home(page) {
  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
}
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
}

// ---------------------------------------------------------------- 1: old addresses
// [old address, new address, state, words that show the same item]
const OPENS = [
  ['/grow-step-1', '/get-unstuck', { decisionId: items.grow.id }, `${STAMP}: win two referrals a month`],
  ['/inversion-step-1', '/pre-mortem', { decisionId: items.inversion.id }, `${STAMP}: land the Harbour proposal`],
  ['/inversion-thinking-summary', '/pre-mortem/summary', { decisionId: items.inversion.id }, items.inversion.title],
  ['/if-then-planning-summary', '/pressure-plan/summary', { decisionId: items.pressure.id }, items.pressure.title],
  ['/stop-doing-audit-summary', '/time-audit/summary', { decisionId: items.audit.id }, items.audit.title],
  ['/tough-conversation-summary', '/give-difficult-feedback/summary', { decisionId: items.feedback.id }, items.feedback.title],
];
// Every other old address, opened plainly: [old, new, words on the new page].
const PLAIN = [
  ['/grow-step-2', '/get-unstuck/reality'],
  ['/grow-step-3', '/get-unstuck/options'],
  ['/grow-step-3b-prioritize', '/get-unstuck/prioritise'],
  ['/grow-step-4', '/get-unstuck/will-do'],
  ['/inversion-step-2', '/pre-mortem/risks'],
  ['/inversion-step-3', '/pre-mortem/plan'],
  ['/if-then-planning', '/pressure-plan', 'Pressure plan'],
  ['/stop-doing-audit', '/time-audit', 'Time audit'],
  ['/tough-conversation-step-1', '/give-difficult-feedback', 'Give difficult feedback'],
  ['/tough-conversation-step-2', '/give-difficult-feedback/questions'],
  ['/wheel-of-life', '/life-balance-review', 'Life balance review'],
  ['/wheel-of-life/areas', '/life-balance-review/areas'],
  ['/wheel-of-life/check-in', '/life-balance-review/check-in'],
  ['/wheel-of-life/results', '/life-balance-review/results', 'Life balance review'],
  ['/wheel-of-life/targets', '/life-balance-review/targets'],
  ['/ground-section', '/personal/reset', 'Reset'],
  ['/decision-history', '/my-plans', 'My Plans'],
];

async function checkOldAddresses(page, tag) {
  for (const [from, to, state, words] of OPENS) {
    await home(page);
    await pushRoute(page, from, state);
    pass(`${tag}: ${from} lands on ${to}`, Boolean(await landsOn(page, to)), here(page).path);
    pass(`${tag}: …with the same saved item open`, Boolean(await shows(page, words)), words);
  }
  for (const [from, to, words] of PLAIN) {
    await page.goto(`${APP}${from}?probe=1#here`);
    const ok = await landsOn(page, to);
    const u = here(page);
    pass(`${tag}: ${from} lands on ${to}, keeping the query and hash`, Boolean(ok) && u.search === '?probe=1' && u.hash === '#here', `${u.path}${u.search}${u.hash}`);
    if (words) pass(`${tag}: …showing "${words}"`, Boolean(await shows(page, words)));
  }
  // A saved Life balance review opened from an old link with ?to=.
  await page.goto(`${APP}/wheel-of-life/results?to=${wheelDay}`);
  const ok = await landsOn(page, '/life-balance-review/results');
  pass(`${tag}: /wheel-of-life/results?to= lands on /life-balance-review/results?to=`, Boolean(ok) && here(page).search === `?to=${wheelDay}`, page.url());
  pass(`${tag}: …with the same review open`, Boolean(await shows(page, `One check-in in this range, ${wheelLabel}`)), wheelLabel);
  await shot(page, `${tag}-life-balance-old-link`);
}

// ---------------------------------------------------------------- 2: two meanings
async function checkTwoMeanings(page, tag) {
  await page.goto(`${APP}/review-plan`);
  pass(`${tag}: /review-plan with no plan opens the new Daily review`, Boolean(await landsOn(page, '/daily-review')), here(page).path);
  await home(page);
  await pushRoute(page, '/review-plan', { planKind: 'plan_meeting', plan: items.meeting });
  pass(`${tag}: /review-plan with a meeting plan reviews that meeting`, Boolean(await shows(page, 'Review this meeting')) && Boolean(await shows(page, 'Your meeting plan')));
  pass(`${tag}: …and stays on /review-plan`, here(page).path === '/review-plan', here(page).path);
  await shot(page, `${tag}-review-plan-meeting`);
  await home(page);
  await pushRoute(page, '/review-plan', { planKind: 'daily_plan', plan: null });
  pass(`${tag}: /review-plan for a day with no plan opens the new Daily review`, Boolean(await landsOn(page, '/daily-review')), here(page).path);

  await page.goto(`${APP}/plan-my-day`);
  pass(`${tag}: /plan-my-day with nothing saved opens the new Daily plan`, Boolean(await landsOn(page, '/daily-plan')), here(page).path);
  await home(page);
  await pushRoute(page, '/plan-my-day', { decisionId: items.dayPlan.id });
  await until(async () => (await page.locator('.ds-loading').count()) === 0 && (await page.locator('h1, h2').count()) > 0, 20000);
  pass(`${tag}: /plan-my-day with an old saved day plan still opens it`, here(page).path === '/plan-my-day', here(page).path);
}

// ---------------------------------------------------------------- 3: old pins
async function checkPins(tag, width) {
  await setPins(['/grow-step-1', 'inv', '/wheel-of-life/results']);
  const { context, page } = await signedIn({ width, mode: 'dark' });
  try {
    const phone = width < 769;
    const open = async () => {
      if (phone) {
        await page.locator('.ds-bar-menu').click();
        await page.waitForSelector('#site-tile-menu', { timeout: 5000 });
      } else {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.waitForSelector('#site-menu .ds-dmenu-area', { timeout: 5000 });
      }
    };
    const sel = phone ? '#site-tile-menu .ds-menu-pins a' : '#site-menu .ds-dmenu-pins a';
    await open();
    const names = await until(async () => {
      const t = (await page.locator(sel).allInnerTexts()).map((x) => x.trim());
      return t.length === 3 ? t : null;
    }, 20000);
    pass(`${tag}: pins stored as old addresses show by their new names`, JSON.stringify(names) === JSON.stringify(['Get unstuck', 'Pre-mortem', 'Life balance review']), JSON.stringify(names));
    await page.locator(sel, { hasText: 'Get unstuck' }).click();
    pass(`${tag}: an old pin (/grow-step-1) opens /get-unstuck`, Boolean(await landsOn(page, '/get-unstuck')), here(page).path);
    await home(page);
    await open();
    await page.locator(sel, { hasText: 'Life balance review' }).click();
    pass(`${tag}: an old pin (/wheel-of-life/results) opens /life-balance-review`, Boolean(await landsOn(page, '/life-balance-review')), here(page).path);
    await home(page);
    await open();
    await page.locator(sel, { hasText: 'Pre-mortem' }).click();
    pass(`${tag}: a pin saved as a tool opens /pre-mortem`, Boolean(await landsOn(page, '/pre-mortem')), here(page).path);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- 4: no old names
// What people may never see again. "Uses the GROW model." is the one
// allowed GROW; "Purpose / Meaning" is a Life balance area, not the Mission.
const OLD = [
  [/\bGround\b/, 'Ground'],
  [/\bGROW\b(?! model)/, 'GROW'],
  [/\bInversion\b/i, 'Inversion'],
  [/above or below the line/i, 'Above or below the line'],
  [/points of leverage/i, 'Points of leverage'],
  [/weekly momentum/i, 'Weekly momentum'],
  [/\bPurpose\b(?!\s*\/\s*Meaning)/, 'Purpose'],
  [/my decisions/i, 'My Decisions'],
  [/decision tools|decision history/i, 'Decision tools or history'],
  [/wheel of life/i, 'Wheel of Life'],
  [/if-then/i, 'If-Then'],
  [/scenario planning/i, 'Scenario Planning'],
  [/time allocation/i, 'Time Allocation Audit'],
  [/tough (conversation|feedback)/i, 'Tough conversation'],
  [/stakeholder map\b|trust, alignment|decision ownership/i, 'an old tool name'],
];

// The route list: every signed-in address in App.jsx, the params filled in.
function routeList(sprintId) {
  const app = readFileSync('src/App.jsx', 'utf8');
  const body = app.slice(app.indexOf('<ProtectedLayout'));
  const paths = [...body.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*' && !p.startsWith('/health-check'));
  const fill = {
    '/performance-sprint/review/:sprintId': `/performance-sprint/review/${sprintId}`,
    '/performance-sprint/debrief/:sprintId/:week': `/performance-sprint/debrief/${sprintId}/1`,
    '/daily-plan/:date': `/daily-plan/${FIXED_TODAY}`,
    '/daily-review/:date': `/daily-review/${FIXED_TODAY}`,
    '/daily-journals/:date': `/daily-journals/${FIXED_TODAY}`,
  };
  return [...new Set(paths.map((p) => fill[p] || p).filter((p) => !p.includes(':')))];
}

async function settled(page) {
  let last = '';
  return until(async () => {
    if (await page.locator('.ds-loading').count()) return false;
    const t = await page.evaluate(() => document.body.innerText);
    const same = t.length > 0 && t === last;
    last = t;
    return same;
  }, 15000);
}

async function crawl(tag, width, routes) {
  blockWrites = true;
  const { context, page, errors } = await signedIn({ width, mode: 'dark' });
  const found = [];
  try {
    for (const route of routes) {
      await page.goto(`${APP}${route}`);
      await settled(page);
      const words = await page.evaluate(() => [
        document.title,
        document.body.innerText,
        ...[...document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')]
          .flatMap((e) => ['aria-label', 'title', 'placeholder', 'alt'].map((a) => e.getAttribute(a) || '')),
      ].join('\n'));
      for (const [re, name] of OLD) {
        const m = re.exec(words);
        if (m) {
          const at = words.indexOf(m[0]);
          found.push(`${route} (${here(page).path}): ${name} in "${words.slice(Math.max(0, at - 30), at + 40).replace(/\s+/g, ' ')}"`);
        }
      }
    }
  } finally {
    await context.close();
    blockWrites = false;
  }
  pass(`${tag}: no old name on any of ${routes.length} pages`, found.length === 0, found.join(' | '));
  pass(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

try {
  if (part(1) || part(2)) {
    const { context, page, errors } = await signedIn({ width: 1280, mode: 'dark' });
    try {
      if (part(1)) await checkOldAddresses(page, 'desktop');
      if (part(2)) await checkTwoMeanings(page, 'desktop');
      pass('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await context.close();
    }
  }
  if (part(1)) {
    const { context, page } = await signedIn({ width: 390, mode: 'light' });
    try {
      await checkOldAddresses(page, 'phone');
    } finally {
      await context.close();
    }
  }
  if (part(3)) {
    await checkPins('desktop pins', 1280);
    await checkPins('phone pins', 390);
  }
  if (part(4)) {
    const { data: sprint } = await db.from('sprints').select('id').eq('user_id', me).eq('status', 'running').maybeSingle();
    const routes = routeList(sprint?.id || 'none');
    await crawl('desktop crawl', 1280, routes);
    await crawl('phone crawl', 390, routes);
    results.push(`NOTE  ${blocked} database writes were blocked while crawling.`);
  }
} finally {
  await browser.close();
  await cleanUp();
  const { count } = await db.from('decisions').select('id', { count: 'exact', head: true }).eq('user_id', me).like('title', `${STAMP}%`);
  pass('the invented items are taken away again', count === 0, String(count));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
