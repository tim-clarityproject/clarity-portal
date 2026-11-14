// Phase 4 step 4: My Plans and My Reviews in the running app, signed in as
// the invented test client on the TEST database only (every other host and
// every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/lists.mjs [folder for screenshots]
//
// 1. A small set of invented items, one of each type, is added (old tools
//    in decisions, every review type in journal_entries, a POP review and
//    its archived plan, a journal, a Life balance review, a day plan and a
//    day review, a debrief, and an end-of-sprint review kept on the device
//    as migration 038 would leave it), and taken away again at the end. The
//    plan (v3.2) and Sprint 1 come from the seed.
// 2. Every type shows in its list with a name in words (never a date), its
//    tool under it and its date on the right.
// 3. The area filter: one Filter button, "Showing Interpersonal." with
//    Clear, the team choice under Strategic, and the hubs' links opening
//    the list already filtered.
// 4. Each row opens its own saved item, on its own page.
// 5. The hubs: the last three items on Plan, Review and Interpersonal, and
//    the Health Check's teams on Strategic.
// 6. The old routes: /decision-history (with its discard toast), /my-plans,
//    /my-reviews and /daily-journals.
// 7. 360px: no sideways scroll, every tap area 44px or more.
// 8. Dark and light.
//
// The clock is fixed at Wed 21 Oct 2026, 10:00 in London, and every
// invented item has a fixed date, so nothing depends on the day it runs.
// The seed itself is not changed.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });

const TODAY = '2026-10-21';
const STAMP = 'Lists check';

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

// "Mon 19 Oct", as the lists show a day that isn't today or yesterday this year.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel(key, plus = 0) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + plus));
  const s = `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONS[t.getUTCMonth()]}`;
  return t.getUTCFullYear() === 2026 ? s : `${s} ${t.getUTCFullYear()}`;
}

// ---------------------------------------------------------------- 1: the invented items
const made = { decisions: [], entries: [], popReviews: [], missions: [], journals: [], checkins: [], dayPlans: [], dayReviews: [], debriefs: [] };

async function freeDay(table, column, from) {
  const { data } = await db.from(table).select(column).eq('user_id', me);
  const taken = new Set((data || []).map((r) => r[column]));
  for (let i = 0; i < 60; i += 1) {
    const [y, m, d] = from.split('-').map(Number);
    const key = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (!taken.has(key)) return key;
  }
  throw new Error(`No free day in ${table}`);
}

async function insert(table, rows, bucket) {
  const { data, error } = await db.from(table).insert(rows).select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  made[bucket].push(...data.map((r) => r.id));
  return data;
}

async function cleanUp() {
  const del = async (table, ids) => { if (ids.length) await db.from(table).delete().in('id', ids).eq('user_id', me); };
  await del('journal_entries', made.entries);
  await del('mission_progress_reviews', made.popReviews);
  await del('missions', made.missions);
  await del('decisions', made.decisions);
  await del('daily_journals', made.journals);
  await del('wheel_of_life_checkins', made.checkins);
  await del('day_plans', made.dayPlans);
  await del('day_reviews', made.dayReviews);
  await del('weekly_debriefs', made.debriefs);
  // The review's answers this test puts on the device move across to
  // sprint_reviews once 038 is there (the app's own one-time move).
  await db.from('sprint_reviews').delete().eq('user_id', me).like('worked_best', `${STAMP}%`);
}

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  try { await cleanUp(); } catch { /* reported above */ }
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

const { data: plan } = await db.from('performance_plans').select('id, major, minor').eq('user_id', me).eq('status', 'active').maybeSingle();
const { data: sprint } = await db.from('sprints').select('id, number, start_on, length_weeks').eq('user_id', me).eq('status', 'running').maybeSingle();
if (!plan || !sprint) throw new Error('The seed has no plan or running sprint: run scripts/seed-test-plan.mjs first.');

// Each old tool's saved answers copied from one the seed already has, so
// its summary page opens as it would for a real one.
async function formFor(tool) {
  const { data } = await db.from('decisions').select('form_data').eq('user_id', me).eq('tool_type', tool).not('form_data', 'is', null).limit(1);
  return data?.[0]?.form_data || {};
}

const PLAN_TOOLS = [
  ['daily_plan', null, 'Daily plan', '/daily-plan-summary'],
  ['plan_meeting', `${STAMP}: Harbour introduction call`, 'Meeting planner', '/meeting-summary'],
  ['if_then_planning', `${STAMP}: Board presentation`, 'Pressure plan', '/pressure-plan/summary'],
  ['stop_doing_audit', `${STAMP}: Monday mornings`, 'Time audit', '/time-audit/summary'],
  ['grow', `${STAMP}: Referral pipeline`, 'Get unstuck', '/get-unstuck'],
  ['inversion', `${STAMP}: Harbour proposal`, 'Pre-mortem', '/pre-mortem/summary'],
  ['tough-conversation', `${STAMP}: Late reports`, 'Give difficult feedback', '/give-difficult-feedback/summary'],
];
const TEAM = `${STAMP}: Leadership team`;

const expectPlans = []; // { title, tool, date, path, area }
const expectReviews = [];

async function seed() {
  for (const [tool, title, name, path] of PLAN_TOOLS) {
    const day = tool === 'daily_plan' ? '2026-10-20' : '2026-10-14';
    const [row] = await insert('decisions', {
      user_id: me, tool_type: tool, title: title || 'Tuesday 20th October, 2026', form_data: await formFor(tool), status: 'completed', created_at: `${day}T09:00:00`,
    }, 'decisions');
    const area = ['plan_meeting', 'tough-conversation'].includes(tool) ? 'interpersonal' : 'personal';
    expectPlans.push({ id: row.id, tool: name, title: title || 'Yesterday’s plan', date: tool === 'daily_plan' ? 'Yesterday' : 'Wed 14 Oct', path, area });
    if (tool === 'daily_plan') {
      const [rev] = await insert('journal_entries', {
        user_id: me, review_type: 'plan-review', entry_date: '2026-10-20', title: 'Tuesday 20th October 2026', status: 'final',
        content: JSON.stringify({ a: `${STAMP}: the morning went to plan.`, b: '', planKind: 'daily_plan', planId: row.id, dateKey: '2026-10-20', reviewType: 'plan-review' }),
        created_at: '2026-10-20T19:00:00Z',
      }, 'entries');
      expectReviews.push({ id: rev.id, title: 'Yesterday’s review', tool: 'Daily review', date: 'Yesterday', path: '/review-plan-summary', area: 'personal' });
    }
  }
  const hcForm = await formFor('strategic-alignment');
  for (const day of ['2026-09-01', '2026-10-12']) {
    await insert('decisions', { user_id: me, tool_type: 'strategic-alignment', title: TEAM, form_data: hcForm, status: 'completed', created_at: `${day}T09:00:00` }, 'decisions');
  }
  expectPlans.push({ title: TEAM, tool: 'Strategic Alignment Health Check', date: 'Mon 12 Oct', area: 'strategic', path: '/decision-summary', version: 'Version 2' });
  expectPlans.push({ title: `Version ${plan.major}.${plan.minor}`, tool: 'Individual Performance Plan', path: '/performance-plan', area: 'personal' });
  expectPlans.push({ title: `Sprint ${sprint.number}`, tool: 'Performance Sprint', date: dayLabel(sprint.start_on), path: '/performance-sprint', area: 'personal' });

  const [mission] = await insert('missions', { user_id: me, title: `${STAMP}: Grow the studio`, archived_at: '2026-09-01T09:00:00Z', created_at: '2026-06-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' }, 'missions');
  expectPlans.push({ title: `${STAMP}: Grow the studio`, tool: 'Personal Operating Plan', date: 'Tue 1 Sep', path: `/personal-operating-plan-archived/${mission.id}`, area: 'personal' });
  await insert('mission_progress_reviews', {
    user_id: me, mission_id: mission.id, status: 'final', created_at: '2026-08-03T17:00:00Z', updated_at: '2026-08-03T17:00:00Z',
    review_data: { mission_title: `${STAMP}: Grow the studio`, strategies: [{ id: 's1', name: 'Grow through referrals', description: '', tactics: [{ id: 't1', action: 'Ask three clients for an introduction', type: 'tickable', reviewed_is_done: true, reviewed_note: 'Two asked.' }] }] },
  }, 'popReviews');
  expectReviews.push({ title: `${STAMP}: Grow the studio`, tool: 'POP review', date: 'Mon 3 Aug', path: '/mission-progress-review', area: 'personal' });

  const entry = (type, title, day, content) => ({ user_id: me, review_type: type, entry_date: day, title, status: 'final', content: JSON.stringify({ ...content, reviewType: type }), created_at: `${day}T17:00:00Z` });
  await insert('journal_entries', [
    entry('weekly-momentum', 'Weekly momentum check-in, week of 5 Oct', '2026-10-09', { q1: `${STAMP}: the week moved.`, q2: '', q3: '', momentum: 4 }),
    entry('after-action', `${STAMP}: Harbour discovery call`, '2026-10-15', { q1: 'It ran over by ten minutes.' }),
    entry('progress', `${STAMP}: Quarter progress`, '2026-07-10', { q1: 'Two of three goals moved.' }),
  ], 'entries');
  expectReviews.push({ title: 'Weekly check-in', tool: 'Weekly check-in', date: 'Fri 9 Oct', path: '/review-summary', area: 'personal' });
  expectReviews.push({ title: `${STAMP}: Harbour discovery call`, tool: 'After-action review', date: 'Thu 15 Oct', path: '/review-summary', area: 'personal' });
  expectReviews.push({ title: `${STAMP}: Quarter progress`, tool: 'Progress review', date: 'Fri 10 Jul', path: '/review-summary', area: 'personal' });

  // A meeting plan's review: Interpersonal.
  const meeting = expectPlans.find((p) => p.tool === 'Meeting planner');
  await insert('journal_entries', {
    user_id: me, review_type: 'plan-review', entry_date: '2026-10-16', title: meeting.title, status: 'final',
    content: JSON.stringify({ a: 'Both sides agreed the next step.', b: '', planKind: 'plan_meeting', planId: meeting.id, dateKey: '2026-10-16', reviewType: 'plan-review' }),
    created_at: '2026-10-16T17:00:00Z',
  }, 'entries');
  expectReviews.push({ title: meeting.title, tool: 'Meeting review', date: 'Fri 16 Oct', path: '/review-plan-summary', area: 'interpersonal' });

  const journalDay = await freeDay('daily_journals', 'journal_date', '2026-08-10');
  await insert('daily_journals', { user_id: me, journal_date: journalDay, status: 'final', body: [{ type: 'p', text: `${STAMP}: private words.` }], body_text: `${STAMP}: private words.`, created_at: `${journalDay}T20:00:00Z` }, 'journals');
  expectReviews.push({ title: 'Journal entry', tool: 'Journal', date: dayLabel(journalDay), path: `/daily-journals/${journalDay}`, area: 'personal' });

  await insert('wheel_of_life_checkins', {
    user_id: me, checkin_date: '2026-08-06', checkin_at: '2026-08-06T10:00:00Z', scores: { health: 6, career: 7 },
    areas: [{ key: 'health', label: 'Health / Fitness' }, { key: 'career', label: 'Career / Work' }], notes: {}, focus_area_key: 'health',
  }, 'checkins');
  expectReviews.push({ title: 'Focus on health', tool: 'Life balance review', date: 'Thu 6 Aug', path: '/life-balance-review/results', area: 'personal' });

  const planDay = await freeDay('day_plans', 'local_date', '2026-08-04');
  await insert('day_plans', { user_id: me, local_date: planDay, status: 'finished', finished_at: `${planDay}T08:00:00Z`, way_of_being: 'Calm and clear' }, 'dayPlans');
  expectPlans.push({ title: 'Daily plan', tool: 'Daily plan', date: dayLabel(planDay), path: `/daily-plan/${planDay}`, area: 'personal' });
  const reviewDay = await freeDay('day_reviews', 'local_date', '2026-08-04');
  await insert('day_reviews', { user_id: me, local_date: reviewDay, status: 'finished', finished_at: `${reviewDay}T19:00:00Z`, went_well: `${STAMP}: a good day.` }, 'dayReviews');
  expectReviews.push({ title: 'Daily review', tool: 'Daily review', date: dayLabel(reviewDay), path: `/daily-review/${reviewDay}`, area: 'personal' });

  const { data: debriefs } = await db.from('weekly_debriefs').select('sprint_week').eq('sprint_id', sprint.id);
  const taken = new Set((debriefs || []).map((d) => d.sprint_week));
  const week = Array.from({ length: sprint.length_weeks }, (_, i) => i + 1).find((w) => !taken.has(w));
  if (!week) throw new Error('Every week of Sprint 1 already has a debrief.');
  await insert('weekly_debriefs', { user_id: me, sprint_id: sprint.id, sprint_week: week, status: 'finished', finished_at: '2026-10-18T18:00:00Z', went_well: `${STAMP}: three calls booked.` }, 'debriefs');
  expectReviews.push({ title: `Sprint ${sprint.number}, week ${week}`, tool: 'Weekly performance debrief', date: dayLabel(sprint.start_on, week * 7 - 1), path: `/performance-sprint/debrief/${sprint.id}/${week}`, area: 'personal' });

  // Migration 038 isn't on the test database: the review's answers wait on
  // the device, as the app keeps them until it is.
  expectReviews.push({ title: `Sprint ${sprint.number}`, tool: 'End-of-sprint review', date: 'Sun 18 Oct', path: `/performance-sprint/review/${sprint.id}`, area: 'personal', shows: `${STAMP}: what worked` });
}

await seed();

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
  await context.addInitScript(({ m, userId, sprintId, worked }) => {
    try {
      localStorage.setItem('clarity-colour-mode', m);
      localStorage.setItem(`clarity-cache:${userId}:performance-sprint-review-answers`, JSON.stringify({
        v: { [sprintId]: { worked, next: '', choice: 'sprint', at: '2026-10-18', finishedAt: '2026-10-18T18:00:00Z' } },
        at: Date.now(),
      }));
    } catch { /* blocked */ }
  }, { m: mode, userId: me, sprintId: sprint.id, worked: `${STAMP}: what worked` });
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

const path = (page) => new URL(page.url()).pathname;
const landsOn = (page, want, ms = 20000) => until(async () => (want instanceof RegExp ? want.test(path(page)) : path(page) === want), ms);
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}

async function openList(page, to, want) {
  await page.goto(`${APP}${to}`);
  await page.waitForSelector('.hlist-wrap', { timeout: 30000 });
  if (want) await until(async () => (await page.locator('.hlist-row-title', { hasText: want }).count()) > 0, 20000);
}

// Every row on the page: its name, tool, date, version and tags.
const listRows = (page) => page.locator('.hlist-row').evaluateAll((els) => els.map((e) => ({
  title: e.querySelector('.hlist-row-title')?.textContent.trim(),
  tool: e.querySelector('.hlist-row-tags b')?.textContent.trim(),
  date: e.querySelector('.hlist-row-date')?.textContent.trim(),
  version: e.querySelector('.hlist-version')?.textContent.trim() || null,
})));

const rowFor = (page, x) => page.locator('.hlist-row')
  .filter({ has: page.locator('.hlist-row-title', { hasText: x.title }) })
  .filter({ has: page.locator('.hlist-row-tags b', { hasText: x.tool }) })
  .filter(x.date ? { has: page.locator('.hlist-row-date', { hasText: x.date }) } : {});

const DATE_AS_NAME = /^(today|yesterday)$|^(mon|tue|wed|thu|fri|sat|sun)(day|sday|nesday|rsday|urday)?\s+\d|^\d{1,2}(st|nd|rd|th)?\s+[a-z]{3}|^\d{4}-\d{2}-\d{2}/i;

async function checkList(page, tag, to, expected) {
  await openList(page, to, expected[0].title);
  const rows = await listRows(page);
  for (const x of expected) {
    const found = rows.filter((r) => r.title === x.title && r.tool === x.tool && (!x.date || r.date === x.date));
    pass(`${tag}: "${x.title}" (${x.tool}${x.date ? `, ${x.date}` : ''}) is listed`, found.length >= 1, JSON.stringify(rows.filter((r) => r.title === x.title)));
    if (x.version) pass(`${tag}: "${x.title}" shows ${x.version}`, found.some((r) => r.version === x.version), JSON.stringify(found));
  }
  const dated = rows.filter((r) => DATE_AS_NAME.test(r.title || ''));
  pass(`${tag}: no row is named by a date (${rows.length} rows)`, dated.length === 0, JSON.stringify(dated.slice(0, 5)));
  pass(`${tag}: every row has its tool and its date`, rows.every((r) => r.title && r.tool && r.date), JSON.stringify(rows.filter((r) => !r.tool || !r.date).slice(0, 5)));
  // The date sits on the right of the name, on its first line.
  const placed = await page.locator('.hlist-row').first().evaluate((e) => {
    const t = e.querySelector('.hlist-row-title').getBoundingClientRect();
    const d = e.querySelector('.hlist-row-date').getBoundingClientRect();
    return { right: d.left >= t.left + 40, top: Math.abs(d.top - t.top) < 12 };
  });
  pass(`${tag}: the date is on the right of the name`, placed.right && placed.top, JSON.stringify(placed));
}

async function chooseFilter(page, label, option) {
  if (await page.locator('.ds-filter-panel[hidden]').count()) await page.locator('.ds-filter > button').click();
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).first().click();
}
const appliedLine = (page) => page.locator('.ds-filter-line span').first().innerText();

async function checkFilter(page, tag, to, area, label) {
  await openList(page, to);
  await until(async () => (await page.locator('.hlist-row').count()) > 0, 20000);
  pass(`${tag}: one Filter button`, (await page.locator('.ds-filter > button', { hasText: 'Filter' }).count()) === 1);
  pass(`${tag}: nothing applied at first`, (await appliedLine(page)) === 'Showing everything.', await appliedLine(page));
  await chooseFilter(page, 'Which area?', label);
  pass(`${tag}: "Showing ${label}." once chosen`, Boolean(await until(async () => (await appliedLine(page)) === `Showing ${label}.`, 5000)), await appliedLine(page));
  pass(`${tag}: Clear shows`, (await page.locator('.ds-filter-line .ds-link', { hasText: 'Clear' }).count()) === 1);
  const shown = await listRows(page);
  const want = (to === '/my-plans' ? expectPlans : expectReviews).filter((x) => x.area === area);
  const other = (to === '/my-plans' ? expectPlans : expectReviews).filter((x) => x.area !== area);
  pass(`${tag}: the ${label} items show`, want.every((x) => shown.some((r) => r.title === x.title && r.tool === x.tool)), JSON.stringify(shown.slice(0, 6)));
  pass(`${tag}: the other areas' items don't`, !other.some((x) => x.title.startsWith(STAMP) && shown.some((r) => r.title === x.title && r.tool === x.tool)));
  await shot(page, `${tag}-filtered`);
  await page.locator('.ds-filter-line .ds-link', { hasText: 'Clear' }).click();
  pass(`${tag}: Clear shows everything again`, Boolean(await until(async () => (await appliedLine(page)) === 'Showing everything.', 5000)));
  pass(`${tag}: Clear goes once nothing is applied`, (await page.locator('.ds-filter-line .ds-link', { hasText: 'Clear' }).count()) === 0);
}

async function checkOpens(page, tag, to, expected) {
  for (const x of expected) {
    await openList(page, to, x.title);
    const row = rowFor(page, x).first();
    if (!(await row.count())) {
      pass(`${tag}: "${x.title}" (${x.tool}) opens`, false, 'row not found');
      continue;
    }
    await row.locator('.hlist-row-main').click();
    const landed = await landsOn(page, x.path);
    pass(`${tag}: "${x.title}" (${x.tool}) opens ${x.path}`, Boolean(landed), path(page));
    if (x.shows) pass(`${tag}: it shows its answers`, Boolean(await until(async () => (await page.locator('body').innerText()).includes(x.shows), 10000)));
  }
}

const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// Every control a finger uses on the page: the rows, their actions, the
// filter and the recent rows. Hidden ones (a closed panel) are skipped.
const smallTaps = (page, sel) => page.locator(sel).evaluateAll((els) => els
  .filter((e) => e.offsetParent !== null)
  .map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, text: e.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter((r) => r.w < 44 || r.h < 44));
const TAPS = '.hlist-row-main, .hlist-icon-btn, .hlist-continue-btn, .hlist-review-btn, .hlist-sort-link, .ds-filter > button, .ds-filter-line .ds-link, .ds-row, .ds-hub-team, .ds-hub-recent-link button';

async function checkHubs(page, tag) {
  for (const [hub, title, link, linkTo] of [
    ['/personal/plan', 'My Plans', 'Open My Plans', '/my-plans?area=personal'],
    ['/personal/review', 'My Reviews', 'Open My Reviews', '/my-reviews?area=personal'],
    ['/interpersonal', 'My Plans', 'Open My Plans', '/my-plans?area=interpersonal'],
  ]) {
    await page.goto(`${APP}${hub}`);
    const ok = await until(async () => (await page.locator('.ds-hub-recent .ds-row').count()) > 0, 20000);
    pass(`${tag}: ${hub} ends with ${title}`, Boolean(ok) && (await page.locator('.ds-hub-recent h2').innerText()).toLowerCase() === title.toLowerCase());
    const items = await page.locator('.ds-hub-recent .ds-row').evaluateAll((els) => els.map((e) => ({
      title: e.querySelector('.ds-row-title')?.textContent.trim(),
      tool: e.querySelector('.ds-row-type')?.textContent.trim(),
      date: e.querySelector('.ds-row-date')?.textContent.trim(),
    })));
    pass(`${tag}: ${hub} shows at most three, each with a name, tool and date`, items.length >= 1 && items.length <= 3 && items.every((i) => i.title && i.tool && i.date && !DATE_AS_NAME.test(i.title)), JSON.stringify(items));
    pass(`${tag}: ${hub} shows no journal entry`, !items.some((i) => i.tool === 'Journal'));
    if (hub === '/interpersonal') pass(`${tag}: Interpersonal shows the invented meeting plan`, items.some((i) => i.title === `${STAMP}: Harbour introduction call` && i.tool === 'Meeting planner'), JSON.stringify(items));
    pass(`${tag}: ${hub} has no sideways scroll`, await noSideways(page));
    await shot(page, `${tag}-${hub.replace(/\//g, '-').slice(1)}`);
    await page.getByRole('button', { name: link }).click();
    const want = new URL(linkTo, APP);
    pass(`${tag}: "${link}" opens ${linkTo}`, Boolean(await until(async () => {
      const u = new URL(page.url());
      return u.pathname === want.pathname && u.search === want.search;
    })), page.url());
    const area = want.searchParams.get('area');
    const label = area.charAt(0).toUpperCase() + area.slice(1);
    pass(`${tag}: …already filtered to ${label}`, Boolean(await until(async () => (await page.locator('.ds-filter-line span').count()) && (await appliedLine(page)) === `Showing ${label}.`, 15000)));
  }
  // An item on a hub opens it.
  await page.goto(`${APP}/personal/plan`);
  await until(async () => (await page.locator('.ds-hub-recent .ds-row').count()) > 0, 20000);
  await page.locator('.ds-hub-recent .ds-row').first().click();
  pass(`${tag}: a recent item opens its page`, Boolean(await landsOn(page, /^\/(daily-plan\/|daily-plan-summary|decision-summary|get-unstuck|pre-mortem\/summary|time-audit\/summary|pressure-plan\/summary|give-difficult-feedback\/summary)/)), path(page));

  // Strategic: the Health Check's teams.
  await page.goto(`${APP}/strategic`);
  const team = page.locator('.ds-hub-team', { hasText: TEAM });
  await until(async () => (await team.count()) > 0, 20000);
  pass(`${tag}: Strategic lists the team`, (await team.count()) === 1);
  pass(`${tag}: …with "2 versions, latest Mon 12 Oct"`, (await team.locator('.ds-hub-team-line').innerText()) === '2 versions, latest Mon 12 Oct', await team.innerText());
  await shot(page, `${tag}-strategic`);
  await team.click();
  pass(`${tag}: the team opens its versions in My Plans`, Boolean(await landsOn(page, '/my-plans')) && new URL(page.url()).searchParams.get('team') === TEAM, page.url());
  await until(async () => (await page.locator('.ds-filter-line span').count()) > 0, 15000);
  pass(`${tag}: "Showing Strategic, ${TEAM}."`, Boolean(await until(async () => (await appliedLine(page)) === `Showing Strategic, ${TEAM}.`, 15000)), await appliedLine(page));
  const versions = await until(async () => {
    const r = await listRows(page);
    return r.length === 2 ? r : null;
  }, 15000);
  pass(`${tag}: …its two versions only, newest first`, Boolean(versions) && versions[0].version === 'Version 2' && versions[1].version === 'Version 1', JSON.stringify(versions));
}

async function checkOldRoutes(page, tag) {
  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
  // An old tool's Discard lands on /decision-history with a toast (state).
  await page.evaluate(() => {
    window.history.pushState({ usr: { toast: 'Discarded.' }, key: `t${Date.now()}`, idx: (window.history.state?.idx ?? 0) + 1 }, '', '/decision-history');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  pass(`${tag}: /decision-history goes to My Plans`, Boolean(await landsOn(page, '/my-plans')), path(page));
  pass(`${tag}: …with its toast`, Boolean(await until(async () => (await page.locator('text=Discarded.').count()) > 0, 10000)));
  await page.goto(`${APP}/decision-history?area=strategic`);
  pass(`${tag}: /decision-history keeps its query`, Boolean(await until(async () => new URL(page.url()).pathname === '/my-plans' && new URL(page.url()).search === '?area=strategic')), page.url());
  for (const [to, title] of [['/my-plans', 'My Plans'], ['/my-reviews', 'My Reviews'], ['/daily-journals', 'My Journals']]) {
    await page.goto(`${APP}${to}`);
    const ok = await until(async () => (await page.locator('.hlist-row').count()) > 0, 20000);
    pass(`${tag}: ${to} still opens ${title}`, Boolean(ok) && path(page) === to, path(page));
  }
  const journals = await listRows(page);
  pass(`${tag}: My Journals names its rows in words`, journals.length > 0 && journals.every((r) => r.title === 'Journal entry' && r.tool === 'Journal' && r.date), JSON.stringify(journals.slice(0, 3)));
  await page.goto(`${APP}/planning-tools`);
  pass(`${tag}: /planning-tools still goes to Plan`, Boolean(await landsOn(page, '/personal/plan')), path(page));
}

async function checkMode(page, tag, mode) {
  for (const to of ['/my-plans', '/my-reviews']) {
    await openList(page, to);
    const colours = await page.evaluate(() => {
      const root = document.querySelector('.ui-root');
      const t = document.querySelector('.hlist-row-title');
      return { bg: getComputedStyle(root).backgroundColor, body: getComputedStyle(document.body).backgroundColor, text: t ? getComputedStyle(t).color : null };
    });
    const light = /249, 248, 245/.test(colours.bg) || /249, 248, 245/.test(colours.body);
    pass(`${tag}: ${to} shows in ${mode}`, mode === 'light' ? light : !light, JSON.stringify(colours));
    pass(`${tag}: ${to} names read in the text colour`, Boolean(colours.text) && colours.text !== colours.bg, JSON.stringify(colours));
  }
}

try {
  // ---------------------------------------------------------- desktop, dark
  {
    const { context, page, errors } = await signedIn({ width: 1280, mode: 'dark' });
    try {
      await checkList(page, 'desktop dark My Plans', '/my-plans', expectPlans);
      await shot(page, 'desktop-dark-my-plans');
      await checkList(page, 'desktop dark My Reviews', '/my-reviews', expectReviews);
      await shot(page, 'desktop-dark-my-reviews');
      await checkFilter(page, 'desktop dark My Plans', '/my-plans', 'interpersonal', 'Interpersonal');
      await checkFilter(page, 'desktop dark My Reviews', '/my-reviews', 'interpersonal', 'Interpersonal');
      await checkOpens(page, 'desktop dark My Plans', '/my-plans', expectPlans);
      await checkOpens(page, 'desktop dark My Reviews', '/my-reviews', expectReviews);
      await checkHubs(page, 'desktop dark');
      await checkOldRoutes(page, 'desktop dark');
      await checkMode(page, 'desktop dark', 'dark');
      pass('desktop dark: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await context.close();
    }
  }

  // ---------------------------------------------------------- phone 360, light
  {
    const { context, page, errors } = await signedIn({ width: 360, mode: 'light' });
    try {
      for (const to of ['/my-plans', '/my-reviews', '/daily-journals']) {
        await openList(page, to);
        await until(async () => (await page.locator('.hlist-row').count()) > 0, 20000);
        pass(`360 light: ${to} has no sideways scroll`, await noSideways(page));
        const small = await smallTaps(page, TAPS);
        pass(`360 light: ${to} taps are 44px or more`, small.length === 0, JSON.stringify(small.slice(0, 4)));
        await shot(page, `phone-light${to.replace(/\//g, '-')}`);
      }
      await checkList(page, '360 light My Plans', '/my-plans', expectPlans);
      await checkList(page, '360 light My Reviews', '/my-reviews', expectReviews);
      await checkFilter(page, '360 light My Reviews', '/my-reviews', 'interpersonal', 'Interpersonal');
      // The filter's panel open: its controls fit and are tappable too.
      await openList(page, '/my-plans');
      await page.locator('.ds-filter > button').click();
      pass('360 light: the open filter has no sideways scroll', await noSideways(page));
      const smallOpen = await smallTaps(page, `${TAPS}, .ds-filter-panel .ds-dd`);
      pass('360 light: the open filter\'s taps are 44px or more', smallOpen.length === 0, JSON.stringify(smallOpen.slice(0, 4)));
      for (const hub of ['/personal/plan', '/personal/review', '/interpersonal', '/strategic']) {
        await page.goto(`${APP}${hub}`);
        await until(async () => (await page.locator('.ds-hub-recent .ds-row, .ds-hub-team').count()) > 0, 20000);
        pass(`360 light: ${hub} has no sideways scroll`, await noSideways(page));
        const small = await smallTaps(page, TAPS);
        pass(`360 light: ${hub} taps are 44px or more`, small.length === 0, JSON.stringify(small.slice(0, 4)));
        await shot(page, `phone-light${hub.replace(/\//g, '-')}`);
      }
      await checkOpens(page, '360 light My Reviews', '/my-reviews', expectReviews.filter((x) => x.tool === 'End-of-sprint review' || x.tool === 'Weekly performance debrief'));
      await checkMode(page, '360 light', 'light');
      pass('360 light: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await context.close();
    }
  }

  // ---------------------------------------------------------- desktop, light
  {
    const { context, page, errors } = await signedIn({ width: 1280, mode: 'light' });
    try {
      await checkMode(page, 'desktop light', 'light');
      await shot(page, 'desktop-light-my-reviews');
      pass('desktop light: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await context.close();
    }
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
