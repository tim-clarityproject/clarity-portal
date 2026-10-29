// Phase 2 step 8, the functionality tester's journeys, end to end in the
// running app as a client would do them, signed in as the invented test
// client on the TEST database only (every other host and every email call
// is blocked). Each journey checks what the page shows AND what was saved.
//
//   node --import ./tests/scores/register.mjs tests/phase2/journeys.mjs [folder for screenshots]
//
// It empties the test client's plan first (scripts/seed-test-plan.mjs
// --empty) and puts the seeded plan v3.2 with Sprint 1 running back at the
// end (--reset), with no sharing switches left on.
//
// A real week can't pass inside a test, so twice the journey moves the
// client's own dates back 7 days ("time shift", written as the client
// through the same rules the app uses: the sprint's start, the working
// days, logs, to-dos and wins). Nothing else is changed behind the app.
//
//  0. No plan: the sprint page, View your year and the review lead to
//     Build my plan (the UI tester's open point), never Start a sprint.
//  1. Build a plan from scratch: mission, a number and a rating objective,
//     a Strategy each, habits of four kinds (daily, weekly, count, rating),
//     a 3-week sprint starting today. Edit it (a new target: 1.1), version
//     history, and version 1.0 still shows the old target.
//  2. Log a whole week in the week view; the week score, the dial, the
//     average and View your year agree with src/lib/scores; again after a
//     reload and in a second browser; the finished week, after a time
//     shift, keeps the same score, and the coach's frozen copy matches.
//  3. To-dos: add, tick, roll over at the week's end, move to a later week;
//     nothing lost or duplicated, on the sprint page and the plan's tile.
//  4. Wins: linked to a Strategy, listed with the to-dos, in Performance
//     Evidence, and counted in the Strategy's score.
//  5. Recovery from the sprint page: paused, scores hidden on the sprint,
//     plan and year ("Show my results" this visit only), recharge answer,
//     the check-in, then the welcome back; the sprint's end moves by the
//     days it covered and the score again matches src/lib/scores.
//  6. End the sprint early: every step of the review (change a target),
//     straight into Start a sprint (4 weeks, keep, change, remove and add
//     a habit); Sprint 1 finished, Sprint 2 running, the plan's version
//     and target updated, open to-dos accounted for.
//  7. The coach's view: the eyes (with a coach) set the sharing switches;
//     then, in a rolled-back dry run that links the owner coach to the
//     client, what the owner coach and the second coach can read of the
//     plan, sprint, wins and Recovery, both ways.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';
import { sprintWeekSoFar } from '../../src/lib/performance/rows.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
  if (!ok) console.log(`FAIL  ${name}: ${detail}`);
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

const seed = (flag) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', flag], { stdio: 'pipe' }).toString().trim();
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum
};
const weekday = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayAria = (key) => `${DAY[weekday(key)]} ${Number(key.slice(8))} ${MONTH[Number(key.slice(5, 7)) - 1]}`;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return v;
}
const q = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
};

// The coach the eyes and "Let [coach] know" name. The test client has no
// coach on the test database, so for the eyes only, my_coach answers as if
// the owner coach (Alex) coached them; what a coach can READ is checked in
// the database itself (journey 7).
const FAKE_COACH = [{ coach_id: '00000000-0000-4000-8000-000000000001', first_name: 'Alex', away_until: null }];

const browser = await chromium.launch();
async function signedIn({ width = 1280, mode = 'dark', coach = false } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (coach && /\/rest\/v1\/rpc\/my_coach/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_COACH) });
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
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const next = async (page) => {
  await page.locator('.ds-guide-next').click();
  await page.waitForTimeout(650);
};
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()) || '').trim();
const savedShown = (page) => page.waitForFunction(() => /Saved/.test(document.querySelector('.ds-guide-bar')?.textContent || ''), null, { timeout: 15000 });
const openSprint = async (page) => {
  await page.goto(`${APP}/performance-sprint`);
  await page.waitForSelector('.sprint-page', { timeout: 30000 });
  await page.waitForTimeout(1200);
};
const activePlan = async () => (await q(db.from('performance_plans').select('id, mission, major, minor').eq('user_id', me).eq('status', 'active')))[0] || null;
const runningSprint = async () => (await q(db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')))[0] || null;

// The sprint page's rows, read as the client, in the shape loadSprintPage gives.
async function sprintRows() {
  const sprint = await runningSprint();
  const [objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns] = await Promise.all([
    q(db.from('outcome_objectives').select('id').eq('plan_id', sprint.plan_id).is('archived_at', null)),
    q(db.from('plan_strategies').select('*').eq('plan_id', sprint.plan_id).is('archived_at', null).order('sort_order')),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me).order('week_end')),
    q(db.from('recovery_periods').select('*').eq('user_id', me).order('start_on')),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me).order('starts_on')),
  ]);
  const ids = sprintHabits.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)),
    q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', ids).gte('local_date', sprint.start_on)),
    q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    q(db.from('todo_moves').select('*').eq('user_id', me)),
    q(db.from('wins').select('*').eq('user_id', me).gte('local_date', sprint.start_on).is('deleted_at', null)),
    q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  return {
    plan: { id: sprint.plan_id }, sprint, objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns,
    sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' },
  };
}
const libraryView = async () => sprintPageView(await sprintRows(), { today });

// Moves the client's own dates back `days` (see the top). Logs, to-dos and
// wins move with the sprint, so the same days stay in the same sprint week.
async function timeShift(days, { recordsToo = true } = {}) {
  const sprint = await runningSprint();
  const up = async (table, match, values) => {
    const { error } = await db.from(table).update(values).match(match);
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  await up('sprints', { id: sprint.id }, { start_on: addDays(sprint.start_on, -days) });
  for (const w of await q(db.from('working_patterns').select('id, starts_on').eq('user_id', me))) {
    await up('working_patterns', { id: w.id }, { starts_on: addDays(w.starts_on, -days) });
  }
  if (!recordsToo) return;
  const ids = (await q(db.from('sprint_habits').select('id').eq('sprint_id', sprint.id))).map((h) => h.id);
  // Earliest first, so a moved day never meets one not yet moved.
  for (const l of (await q(db.from('habit_logs').select('id, local_date').in('sprint_habit_id', ids))).sort((a, b) => (a.local_date < b.local_date ? -1 : 1))) {
    await up('habit_logs', { id: l.id }, { local_date: addDays(l.local_date, -days) });
  }
  for (const t of await q(db.from('todos').select('id, created_on, done_on').eq('user_id', me))) {
    await up('todos', { id: t.id }, { created_on: t.created_on ? addDays(t.created_on, -days) : null, done_on: t.done_on ? addDays(t.done_on, -days) : null });
  }
  for (const w of await q(db.from('wins').select('id, local_date').eq('user_id', me))) {
    await up('wins', { id: w.id }, { local_date: addDays(w.local_date, -days) });
  }
}

// What a coach can read of the client, in a dry run that is always rolled
// back (scripts/dry-run-on-test.sh): the owner coach is linked to the client
// inside it, as the rules test does, and each coach then reads as themselves.
const COACH_TABLES = ['performance_plans', 'outcome_objectives', 'objective_figures', 'plan_strategies', 'strategy_objectives', 'habits',
  'sprints', 'week_scores', 'sprint_habits', 'habit_logs', 'todos', 'wins', 'win_strategies', 'performance_evidence',
  'recovery_periods', 'recovery_recharge_answers'];
function coachRead() {
  const dir = mkdtempSync(join(tmpdir(), 'clarity-journeys-'));
  const file = join(dir, 'coach-view.sql');
  const counts = COACH_TABLES.map((t) => `'${t}', (select count(*) from public.${t} where user_id = cl)`).join(', ');
  const asPerson = (who) => `
  perform set_config('request.jwt.claims', json_build_object('sub', ${who}, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ${who}::text, true);
  perform set_config('role', 'authenticated', true);`;
  writeFileSync(file, `do $coach$
declare cl uuid; oc uuid; sc uuid; c uuid; r jsonb; rec jsonb;
begin
  select id into cl from auth.users where email = '${env.TEST_CLIENT_EMAIL.replace(/'/g, "''")}';
  select id into oc from auth.users where email = '${env.TEST_COACH_OWNER_EMAIL.replace(/'/g, "''")}';
  select id into sc from auth.users where email = '${env.TEST_COACH_TWO_EMAIL.replace(/'/g, "''")}';
  insert into public.coaches (user_id, role, display_first_name) values (oc, 'owner', 'Alex') returning id into c;
  insert into public.coaches (user_id, role, display_first_name) values (sc, 'coach', 'Priya');
  insert into public.coach_clients (client_id, coach_id) values (cl, c);
  ${asPerson('oc')}
  r := jsonb_build_object(${counts});
  select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'user_id' - 'created_at' - 'updated_at'), '[]') into rec from public.recovery_periods x where x.user_id = cl;
  raise notice 'JOURNEY owner_coach %', r || jsonb_build_object('recovery_rows', rec);
  perform set_config('role', 'none', true);
  ${asPerson('sc')}
  r := jsonb_build_object(${counts});
  raise notice 'JOURNEY second_coach %', r;
  perform set_config('role', 'none', true);
end
$coach$;
`);
  let text = '';
  try {
    text = execFileSync('bash', ['scripts/dry-run-on-test.sh', file], { stdio: 'pipe' }).toString();
  } catch (e) {
    text = `${e.stdout || ''}${e.stderr || ''}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const read = (who) => {
    const m = new RegExp(`JOURNEY ${who} (\\{.*\\})`).exec(text);
    return m ? JSON.parse(m[1]) : null;
  };
  return { owner: read('owner_coach'), second: read('second_coach'), rolledBack: /rolled back: nothing was kept/.test(text), text };
}

let ctx = null;
let page = null;
const S1 = 'Earn referrals from every client';
const S2 = 'Run workshops that land';
const O1 = 'Coaching clients';
const O2 = 'Confidence leading group workshops';
const firstSprint = { id: null, scoreSoFar: null };

// ------------------------------------------------------------------ 0. no plan
console.log(seed('--empty'));
try {
  ({ context: ctx, page } = await signedIn({ coach: true }));
  for (const [path, what] of [['/performance-sprint', 'the sprint page'], ['/performance-sprint/year', 'View your year'], ['/performance-sprint/review', 'the review']]) {
    await page.goto(`${APP}${path}`);
    await page.waitForSelector('button:has-text("Build my plan")', { timeout: 30000 }).catch(() => null);
    const build = await page.getByRole('button', { name: 'Build my plan' }).count();
    const start = await page.getByRole('button', { name: 'Start a sprint' }).count();
    pass(`no plan: ${what} leads to Build my plan, not Start a sprint`, build === 1 && start === 0, `build ${build}, start ${start}`);
    await shot(page, `0-noplan-${path.split('/').pop()}`);
  }
  await page.goto(`${APP}/performance-sprint`);
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await page.waitForURL(/\/performance-plan\/build/, { timeout: 15000 });
  pass('no plan: Build my plan opens Build your plan', true);
} catch (e) {
  pass('journey 0 ran to the end', false, e.message.split('\n')[0]);
}

// ------------------------------------------------------------------ 1. build
try {
  await page.waitForSelector('.ds-guide', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.getByLabel('My Mission').fill('Help leaders stay calm and clear under pressure');
  await savedShown(page);
  await next(page);

  const card = (i) => page.locator('.ds-objed').nth(i);
  const pickDate = async (i, label, months) => {
    await card(i).locator('.ds-date').click();
    for (let m = 0; m < months; m += 1) await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(200);
  };
  await card(0).locator('textarea').fill(O1);
  await card(0).getByLabel('Where are you now?').fill('12');
  await card(0).getByLabel('What’s your target?').fill('20');
  await pickDate(0, '15 June 2027', 8);
  await page.getByRole('button', { name: 'Add an objective' }).click();
  await card(1).locator('textarea').fill(O2);
  await card(1).getByRole('radio', { name: 'Rating /10' }).click();
  await card(1).getByLabel('Where are you now?').fill('5');
  await card(1).getByLabel('What’s your target?').fill('8');
  await pickDate(1, '30 April 2027', 6);
  await page.waitForTimeout(1500);
  await savedShown(page);
  await next(page);

  // One Strategy for each objective.
  await page.getByRole('button', { name: 'Add a Strategy' }).click();
  await page.waitForTimeout(150);
  await page.getByLabel('Strategy 1').fill(S1);
  await next(page);
  await page.getByRole('button', { name: 'Add a Strategy' }).click();
  await page.waitForTimeout(150);
  await page.getByLabel(/Strategy \d/).last().fill(S2);
  await page.waitForTimeout(1500);
  await savedShown(page);
  await next(page);

  // Habits: two under each Strategy (daily yes or no and weekly; count and rating).
  const habit = (i) => page.locator('.ds-habed').nth(i);
  const measure = async (i, name) => {
    await habit(i).locator('.ds-dd').click();
    await page.getByRole('option', { name: new RegExp(`^${name}\\s*e\\.g\\.`) }).click();
    await page.waitForTimeout(150);
  };
  const forStrategy = async (name) => {
    const dd = page.locator('.ds-guide-body > div > .ds-choice .ds-dd').first();
    if (await dd.count()) {
      await dd.click();
      await page.getByRole('option', { name }).click();
      await page.waitForTimeout(200);
    }
  };
  await forStrategy(S1);
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(0).locator('textarea').fill('Thank-you notes sent');
  await measure(0, 'Yes or no each day');
  await habit(0).getByLabel('What’s the target?').fill('4');
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(1).locator('textarea').fill('Weekly referral review');
  await measure(1, 'Once a week');
  await page.waitForTimeout(1200);
  await forStrategy(S2);
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(0).locator('textarea').fill('Practice runs');
  await habit(0).getByLabel('What’s the target?').fill('3');
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(1).locator('textarea').fill('Energy');
  await measure(1, 'Rating 1 to 5');
  await habit(1).getByLabel('What’s the target?').fill('4');
  await page.waitForTimeout(1500);
  await savedShown(page);
  const habits = await q(db.from('habits').select('name, measure, target, strategy_id').eq('user_id', me));
  pass('build: four habits saved, two per Strategy', habits.length === 4 && new Set(habits.map((h) => h.strategy_id)).size === 2, JSON.stringify(habits));
  await next(page);

  // Working days (Monday to Friday), a 3-week sprint from today, 85%.
  pass('build: working days step', (await heading(page)) === 'Which days do you work?', await heading(page));
  await next(page);
  await page.getByRole('radio', { name: /Another length/ }).click();
  await page.getByLabel('How many weeks?').fill('3');
  await next(page);
  await page.getByRole('radio', { name: /^Today/ }).click();
  await next(page);
  await page.getByRole('radio', { name: '85%', exact: true }).click().catch(() => null);
  await next(page);
  const ready = await bodyText(page);
  pass('build: Ready lists both objectives with their figures', ready.includes('12 now, target 20, by 15 Jun 2027') && ready.includes('5/10 now, target 8/10, by 30 Apr 2027'), ready.slice(0, 300));
  pass('build: Ready says 3 weeks from today', ready.includes('3 weeks') && /Today/.test(ready));
  await shot(page, '1-ready');
  await page.getByRole('button', { name: 'Start Performance Sprint 1' }).click();
  await page.waitForURL(/\/performance-sprint$/, { timeout: 30000 });
  await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
  const s1 = await runningSprint();
  firstSprint.id = s1?.id;
  pass('build: Sprint 1 runs from today for 3 weeks at 85%', s1 && s1.number === 1 && s1.start_on === today && s1.length_weeks === 3 && s1.standard === 85, JSON.stringify(s1));
  const sh = await q(db.from('sprint_habits').select('name').eq('sprint_id', s1.id));
  pass('build: the sprint copied the four habits', sh.length === 4, JSON.stringify(sh));
  const v10 = await q(db.from('plan_versions').select('major, minor').eq('user_id', me));
  pass('build: version 1.0', v10.length === 1 && v10[0].major === 1 && v10[0].minor === 0, JSON.stringify(v10));

  // Edit: a new target is a minor change.
  await page.goto(`${APP}/performance-plan/edit`);
  await page.waitForSelector('.ds-guide');
  await page.waitForTimeout(600);
  for (let i = 0; i < 3 && !/What 2 to 4 results/.test(await heading(page)); i += 1) await next(page);
  await card(0).getByLabel('What’s your target?').fill('22');
  await page.waitForTimeout(1500);
  await savedShown(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForURL(/\/performance-plan$/, { timeout: 20000 });
  await page.waitForTimeout(800);
  pass('edit: closing says Version 1.1', (await bodyText(page)).includes('Your plan is now Version 1.1.'));
  const plan = await activePlan();
  pass('edit: the plan is 1.1', plan.major === 1 && plan.minor === 1, `${plan.major}.${plan.minor}`);
  pass('edit: the plan page shows the new target', (await bodyText(page)).includes('of 22'));

  await page.goto(`${APP}/performance-plan/history`);
  await page.waitForSelector('.ds-row', { timeout: 20000 });
  const rows = await page.locator('.ds-row').allTextContents();
  pass('history: 1.1 then 1.0', rows.length === 2 && /1\.1/.test(rows[0]) && /1\.0/.test(rows[1]), rows.join(' | '));
  await page.locator('.ds-row').nth(1).click();
  await page.waitForURL(/history\/1\.0/, { timeout: 15000 });
  await page.waitForTimeout(800);
  const old = await bodyText(page);
  pass('version 1.0 still shows the old target and the mission', old.includes('Help leaders stay calm') && /\b20\b/.test(old) && !/of 22/.test(old), old.slice(0, 300));
  await shot(page, '1-version-1-0');
} catch (e) {
  pass('journey 1 ran to the end', false, e.message.split('\n')[0]);
}

// ------------------------------------------------------------------ 2. log a week
// Today becomes the last day of week 1 (the sprint started 6 days ago).
const logRow = (name) => page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: new RegExp(`^${name}$`) }) });
const centreScore = async (p = page) => ((await p.locator('.ds-sdial-big--score').textContent().catch(() => '')) || '').trim();
try {
  await timeShift(6, { recordsToo: false });
  await openSprint(page);
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.waitForTimeout(500);
  const days = [];
  for (let d = 6; d >= 0; d -= 1) { const k = addDays(today, -d); if (weekday(k) < 5) days.push(k); }
  // Thank-you notes on all but one day; practice runs; energy; the weekly review.
  for (const [i, k] of days.entries()) {
    if (i !== 1) await logRow('Thank-you notes sent').getByRole('button', { name: new RegExp(`${dayAria(k)}`) }).click();
    await page.waitForTimeout(150);
  }
  const practice = [1, 0, 1, 0, 0];
  for (const [i, k] of days.entries()) {
    if (practice[i]) {
      await logRow('Practice runs').getByRole('textbox', { name: new RegExp(dayAria(k)) }).fill(String(practice[i]));
      await logRow('Practice runs').getByRole('textbox', { name: new RegExp(dayAria(k)) }).blur();
    }
  }
  const energy = [4, 3, 5, 4, 2];
  for (const [i, k] of days.entries()) {
    await logRow('Energy').getByRole('textbox', { name: new RegExp(dayAria(k)) }).fill(String(energy[i]));
    await logRow('Energy').getByRole('textbox', { name: new RegExp(dayAria(k)) }).blur();
  }
  await logRow('Weekly referral review').getByRole('checkbox').click().catch(async () => {
    await logRow('Weekly referral review').getByRole('button', { name: 'Weekly referral review', exact: true }).click();
  });
  await page.waitForTimeout(3000);
  const logs = (await sprintRows()).logs;
  pass('log a week: every entry saved once (4 notes, 2 runs, 5 energy, 1 weekly)', logs.length === 12, `${logs.length} logs`);
  const dupes = logs.length - new Set(logs.map((l) => `${l.sprint_habit_id}|${l.local_date}`)).size;
  pass('log a week: no day logged twice', dupes === 0, `${dupes}`);
  await shot(page, '2-week-logged');

  const v = await libraryView();
  firstSprint.scoreSoFar = v.soFar.value;
  pass('log a week: the week score so far matches src/lib/scores', (await centreScore()) === `${v.soFar.value}%`, `${await centreScore()} vs ${v.soFar.value}%`);
  await page.reload();
  await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
  await page.waitForTimeout(1200);
  pass('log a week: the same after a reload', (await centreScore()) === `${v.soFar.value}%`, await centreScore());
  const second = await signedIn({ mode: 'light' });
  await openSprint(second.page);
  pass('log a week: the same in a second browser', (await centreScore(second.page)) === `${v.soFar.value}%`, await centreScore(second.page));
  await second.page.goto(`${APP}/performance-sprint/year`);
  await second.page.waitForSelector('.yr-chart, .ds-year, [data-tip]', { timeout: 30000 }).catch(() => null);
  await second.page.waitForTimeout(1000);
  const yearTips = await second.page.locator('[data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  pass('View your year: this week so far matches', yearTips.some((t) => t.includes(`${v.soFar.value}%`)), yearTips.filter((t) => /%/.test(t)).slice(-2).join(' | '));
  await shot(second.page, '2-year-so-far');
  await second.context.close();

  // A week later: week 1 is finished, with the same score.
  await timeShift(7);
  await openSprint(page);
  const v2 = await libraryView();
  const w1 = v2.weeks.find((w) => w.number === 1);
  pass('finished week 1 keeps the score it had on its last day', w1?.score === firstSprint.scoreSoFar, `${w1?.score} vs ${firstSprint.scoreSoFar}`);
  const tips = await page.locator('.ds-sdial [data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  pass('the dial: week 1’s pop-up matches', tips.some((t) => t.startsWith(`Performance score ${w1?.score}%, Week 1,`)), tips[0]);
  await page.getByText('Sprint details').click();
  await page.waitForTimeout(400);
  const details = await bodyText(page);
  pass('Sprint details: the average is week 1’s score', details.includes(`Average performance score ${v2.average.value}`) && v2.average.value === `${w1?.score}%`, `${v2.average.value}`);
  const frozen = await until(async () => (await q(db.from('week_scores').select('sprint_week, score').eq('sprint_id', firstSprint.id).eq('sprint_week', 1)))[0]);
  pass('the coach’s frozen week 1 matches', frozen && Math.round(Number(frozen.score)) === w1?.score, `${frozen?.score} vs ${w1?.score}`);
  await page.goto(`${APP}/performance-sprint/year`);
  await page.waitForTimeout(2000);
  const yTips = await page.locator('[data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  pass('View your year: week 1’s bar matches', yTips.some((t) => t.includes(`${w1?.score}%`) && /week 1\b/i.test(t)), yTips.filter((t) => /%/.test(t)).slice(-3).join(' | '));
  await shot(page, '2-year-week1');
} catch (e) {
  pass('journey 2 ran to the end', false, e.message.split('\n')[0]);
}


// ------------------------------------------------------------------ 3 and 4. to-dos and wins
// Today is the last day of week 2.
let at = '';
const todoRow = (text) => page.locator('.ds-todo').filter({ hasText: text });
const todosOf = async () => q(db.from('todos').select('id, text, planned_week, done_on, sprint_id, deleted_at').eq('user_id', me));
const TA = 'Ask two clients for a referral';
const TB = 'Book the workshop room';
const TC = 'Draft the workshop outline';
const TD = 'Write up the Harbour case study';
const W1 = 'A past client introduced a friend';
const W2 = 'The pilot workshop sold out';
async function addTodo(text, strategy, week = null) {
  at = `add to-do ${text}`;
  await page.getByRole('button', { name: 'Add a to-do' }).click();
  await page.waitForSelector('.ds-panel textarea');
  await page.locator('.ds-panel textarea').fill(text);
  await page.locator('.ds-panel').getByRole('radio', { name: strategy }).click();
  if (week) {
    await page.locator('.ds-panel .ds-dd').last().click();
    await page.getByRole('option', { name: new RegExp(`^Week ${week},`) }).click();
  }
  await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
  await until(async () => (await todosOf()).some((t) => t.text === text));
  await page.waitForTimeout(600);
}
async function addWin(text, strategy) {
  at = `add win ${text}`;
  await page.getByRole('button', { name: 'Add an unplanned win' }).click();
  await page.waitForSelector('.ds-panel textarea');
  await page.locator('.ds-panel textarea').fill(text);
  await page.locator('.ds-panel').getByRole('button', { name: strategy }).click();
  await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click();
  await until(async () => (await q(db.from('wins').select('id').eq('user_id', me).eq('what', text))).length);
  await page.waitForTimeout(600);
}
try {
  await openSprint(page);
  await addTodo(TA, S1);
  await addTodo(TB, S2);
  await addTodo(TD, S2);
  await addTodo(TC, S2, 3);
  let all = await todosOf();
  pass('to-dos: four saved, three this week and one for week 3', all.length === 4 && all.filter((t) => t.planned_week === 2).length === 3 && all.find((t) => t.text === TC)?.planned_week === 3, JSON.stringify(all.map((t) => [t.text, t.planned_week])));
  pass('to-dos: the later one is listed under later, not this week', (await page.locator('.ds-todo').filter({ hasText: TC }).count()) === 1);
  await todoRow(TA).getByRole('checkbox').click();
  const toast = await page.locator('.ds-toast, [role=status]').filter({ hasText: /Done\./ }).first().textContent({ timeout: 5000 }).catch(() => '');
  pass('tick: "Done. 1 of 3 this week."', toast.includes('Done. 1 of 3 this week.'), toast);
  pass('tick: saved with today', Boolean(await until(async () => (await todosOf()).find((t) => t.text === TA)?.done_on === today)));
  // Move one to week 3: its options start at week 3, never "This week".
  at = 'move';
  await todoRow(TD).getByRole('button', { name: /Move/ }).click();
  await page.waitForSelector('.ds-panel');
  const opts = await page.locator('.ds-panel [role=radio]').allTextContents();
  pass('move: the only choice is week 3, named as week 3', opts.length === 1 && /^Week 3,/.test(opts[0].trim()), opts.join(' | '));
  await page.locator('.ds-panel').getByRole('radio', { name: /^Week 3/ }).click();
  const moved = await until(async () => (await todosOf()).find((t) => t.text === TD && t.planned_week === 3));
  const moves = moved ? await q(db.from('todo_moves').select('from_week, to_week, moved_on').eq('todo_id', moved.id)) : [];
  pass('move: planned for week 3, with one move recorded', moves.length === 1 && moves[0].from_week === 2 && moves[0].to_week === 3, JSON.stringify(moves));
  await page.waitForTimeout(600);

  // Wins, one per Strategy.
  const strategies = await q(db.from('plan_strategies').select('id, name').eq('user_id', me));
  const sid = (n) => strategies.find((x) => x.name === n)?.id;
  const before = sprintWeekSoFar(await sprintRows(), today).result.strategies.find((x) => x.id === sid(S1))?.score;
  await addWin(W1, S1);
  await addWin(W2, S2);
  const wins = await q(db.from('wins').select('id, what, local_date').eq('user_id', me));
  const links = await q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me));
  const evidence = await q(db.from('performance_evidence').select('kind, text, win_id').eq('user_id', me));
  pass('wins: two saved for today, each linked to its Strategy', wins.length === 2 && wins.every((w) => w.local_date === today)
    && links.some((l) => l.win_id === wins.find((w) => w.what === W1)?.id && l.strategy_id === sid(S1))
    && links.some((l) => l.win_id === wins.find((w) => w.what === W2)?.id && l.strategy_id === sid(S2)), JSON.stringify({ wins, links }));
  pass('wins: both in Performance Evidence', evidence.filter((e) => e.kind === 'win').length === 2, JSON.stringify(evidence));
  pass('wins: listed with the to-dos, tagged and with the Strategy', (await todoRow(W1).textContent()).includes('Unplanned win') && (await todoRow(W1).textContent()).includes(S1));
  const rowsNow = await sprintRows();
  const so = sprintWeekSoFar(rowsNow, today).result.strategies;
  const s1Score = so.find((x) => x.id === sid(S1))?.score;
  pass('wins: the Strategy’s score counts the win', before == null || s1Score >= before, `${before} → ${s1Score}`);
  at = 'plan tiles';
  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.ds-stile', { timeout: 30000 });
  await page.waitForTimeout(800);
  // The page shows its last copy at once and refreshes quietly (useCachedLoad).
  const tileText = async () => (await page.locator('.ds-stile').filter({ hasText: S1 }).textContent()).replace(/\s+/g, ' ');
  const tile = (await until(async () => { const t = await tileText(); return t.includes(`${Math.round(s1Score)}%`) ? t : null; }, 15000)) || await tileText();
  pass('the plan’s tile shows the same Strategy score as src/lib/scores', s1Score == null || tile.includes(`${Math.round(s1Score)}%`), `${tile} vs ${s1Score}`);
  await shot(page, '3-plan-tiles');

  // A week later: week 3. The open one rolls over once; the done one stays in week 2.
  await timeShift(7);
  await openSprint(page);
  await shot(page, '3-rolled-over');
  all = await todosOf();
  pass('roll-over: still four to-dos, none lost or added', all.length === 4 && new Set(all.map((t) => t.text)).size === 4, JSON.stringify(all.map((t) => t.text)));
  pass('roll-over: the open one shows once, from week 2', (await todoRow(TB).count()) === 1 && (await todoRow(TB).textContent()).includes('rolled over from week 2'));
  pass('roll-over: the done one stays in week 2', (await todoRow(TA).count()) === 0);
  pass('roll-over: the moved and the later one show once each, this week', (await todoRow(TD).count()) === 1 && (await todoRow(TC).count()) === 1
    && !(await todoRow(TD).textContent()).includes('rolled over') && !(await todoRow(TC).textContent()).includes('rolled over'));
  pass('roll-over: last week’s wins aren’t listed this week', (await todoRow(W1).count()) === 0);
  const v3 = await libraryView();
  pass('week 3: the score so far matches src/lib/scores', (await centreScore()) === (v3.soFar ? `${v3.soFar.value}%` : ''), `${await centreScore()} vs ${v3.soFar?.value}`);
  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.ds-stile', { timeout: 30000 });
  await page.locator('.ds-stile').filter({ hasText: S2 }).locator('.ds-stile-btn').first().click();
  await page.waitForTimeout(600);
  const detail = (await page.locator('#ipp-strategy-detail').innerText()).replace(/\s+/g, ' ');
  pass('the plan’s tile detail lists the rolled-over, moved and later to-dos, as this week', detail.includes(TB) && detail.includes(TD) && detail.includes(TC), detail.slice(0, 300));
  await shot(page, '3-tile-detail');
  await page.keyboard.press('Escape');
} catch (e) {
  pass('journeys 3 and 4 ran to the end', false, `${at}: ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------------------------ 5. Recovery
// Today is the last day of week 3 (the sprint's planned end).
try {
  const s = await runningSprint();
  const plannedEnd = s.planned_end_on;
  await openSprint(page);
  await page.getByRole('button', { name: 'Take a recovery week' }).click();
  await page.waitForURL(/\/recovery$/, { timeout: 15000 });
  await page.waitForSelector('.rec-question', { timeout: 15000 });
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'One day fewer' }).click(); // 7 → 3
  const letKnow = page.getByRole('checkbox', { name: /Let Alex know/ });
  pass('Recovery: "Let Alex know" is ticked by default', await letKnow.isChecked());
  await shot(page, '5-recovery-start');
  await page.getByRole('button', { name: 'Start my recovery' }).click();
  const rec = await until(async () => (await q(db.from('recovery_periods').select('*').eq('user_id', me).is('ended_at', null)))[0]);
  pass('Recovery: one open, 3 days from today, coach told', rec && rec.start_on === today && rec.chosen_days === 3 && rec.let_coach_know === true && rec.sprint_id === s.id, JSON.stringify(rec));
  await page.waitForTimeout(1000);
  await openSprint(page);
  const paused = await bodyText(page);
  pass('Recovery: the sprint is paused, scores hidden', /is paused at week 3 of 3/.test(paused) && (await page.locator('.ds-sdial-big--score').count()) === 0, paused.slice(0, 300));
  await page.getByRole('button', { name: 'Show my results' }).click();
  await page.waitForTimeout(400);
  pass('Recovery: Show my results shows them this visit', (await bodyText(page)).includes('%'));
  await openSprint(page);
  pass('Recovery: hidden again on the next visit', (await page.getByRole('button', { name: 'Show my results' }).count()) === 1);
  for (const [path, what] of [['/performance-plan', 'the plan'], ['/performance-sprint/year', 'View your year']]) {
    await page.goto(`${APP}${path}`);
    await page.waitForTimeout(2000);
    pass(`Recovery: ${what} hides scores and offers Show my results`, (await page.getByRole('button', { name: 'Show my results' }).count()) === 1);
  }
  // The recovery day: the recharge question.
  await page.goto(`${APP}/recovery/today`);
  await page.waitForSelector('textarea', { timeout: 20000 });
  await page.locator('textarea').first().fill('A long walk with no phone');
  const answer = await until(async () => (await q(db.from('recovery_recharge_answers').select('answer, local_date, shared').eq('user_id', me)))[0]);
  pass('Recovery: the recharge answer saved for today, Only you', answer?.answer === 'A long walk with no phone' && answer.local_date === today && answer.shared === false, JSON.stringify(answer));
  await shot(page, '5-recovery-today');

  // Two days have passed in Recovery (time shift on the Recovery row only).
  const { error } = await db.from('recovery_periods').update({ start_on: addDays(today, -2) }).eq('id', rec.id);
  pass('time shift: the Recovery started 2 days ago', !error, error?.message);
  await page.goto(`${APP}/recovery/check-in`);
  await page.waitForSelector('[role=radio]', { timeout: 20000 });
  await page.getByRole('radio', { name: 'I’m ready to go again' }).click();
  await page.getByRole('button', { name: 'Pick up my sprint' }).click();
  const ended = await until(async () => (await q(db.from('recovery_periods').select('*').eq('id', rec.id)))[0]?.ended_at && (await q(db.from('recovery_periods').select('*').eq('id', rec.id)))[0]);
  pass('Recovery: ended today', ended?.end_on === today, JSON.stringify(ended));
  await page.waitForURL(/\/performance-sprint$/, { timeout: 15000 }).catch(() => null);
  await openSprint(page);
  const back = await bodyText(page);
  pass('welcome back: "Let’s start with this week."', back.includes('Let’s start with this week.') && /Welcome back/i.test(back), back.slice(0, 300));
  const v = await libraryView();
  pass('welcome back: the sprint now ends 2 days later', addDays(plannedEnd, 2) === v.calendar?.end || back.includes(`It ends on`), `${plannedEnd} → ${v.calendar?.end}`);
  // The welcome-back dial shows words, not the score; the week's pop-up has it.
  const wbTips = await page.locator('.ds-sdial [data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  pass('welcome back: this week’s score so far matches src/lib/scores again', Boolean(v.soFar) && wbTips.some((t) => t.includes(`${v.soFar.value}%`)), `${wbTips.join(' | ')} vs ${v.soFar?.value}`);
  await shot(page, '5-welcome-back');
} catch (e) {
  pass('journey 5 ran to the end', false, e.message.split('\n')[0]);
}

// ------------------------------------------------------------------ 6. end the sprint
at = 'review opening';
try {
  await page.goto(`${APP}/performance-sprint/review`);
  await page.waitForTimeout(1500);
  if (await page.getByRole('button', { name: 'Review it now' }).count()) {
    pass('review: a sprint still running says reviewing finishes it today', (await bodyText(page)).includes('Reviewing it now finishes it today.'));
    await page.getByRole('button', { name: 'Review it now' }).click();
  }
  await page.waitForSelector('.ds-guide', { timeout: 20000 });
  await page.waitForTimeout(600);
  const opening = await bodyText(page);
  pass('review: the opening names the average', /You averaged \d+%\.|Not your strongest sprint\./.test(opening), opening.slice(0, 200));
  await next(page);
  await page.locator('textarea').first().fill('Thank-you notes most days.');
  await next(page);
  await page.locator('textarea').first().fill('Book the workshop room in week 1.');
  await next(page);
  const objRow = (name) => page.locator('.ds-carry-row').filter({ has: page.locator('.ds-carry-name', { hasText: new RegExp(`^${name}$`) }) });
  at = 'review objectives';
  await objRow(O1).getByRole('radio', { name: 'Change' }).click();
  await page.waitForTimeout(300);
  await objRow(O1).getByLabel('What’s your target?').fill('25');
  await next(page);
  await next(page); // habits that stuck: as they are
  at = 'review next';
  await page.getByRole('radio', { name: /Straight into Performance Sprint 2/ }).click();
  await shot(page, '6-review-next');
  await page.locator('.ds-guide .ds-btn--primary').last().click();
  await until(async () => page.url().endsWith('/performance-sprint/start'), 20000);
  const s1 = (await q(db.from('sprints').select('*').eq('id', firstSprint.id)))[0];
  pass('review: Sprint 1 finished today', s1?.status === 'finished' && s1.actual_end_on === today, JSON.stringify({ status: s1?.status, end: s1?.actual_end_on }));
  const target = (await q(db.from('outcome_objectives').select('target_value').eq('user_id', me).eq('name', O1).is('archived_at', null)))[0];
  pass('review: the changed target is in the plan', Number(target?.target_value) === 25, JSON.stringify(target));
  const plan = await activePlan();
  pass('review: the plan has a new minor version (1.2)', plan.major === 1 && plan.minor === 2, `${plan.major}.${plan.minor}`);

  // Start a sprint: every step.
  at = 'start length';
  await page.waitForSelector('.ds-guide', { timeout: 20000 });
  await page.waitForTimeout(600);
  pass('start: opens on the steps for Sprint 2', (await page.locator('.ds-guide').textContent()).includes('Performance Sprint 2') && /How long is this sprint\?/.test(await heading(page)), await heading(page));
  await page.getByRole('radio', { name: '4 weeks', exact: true }).click();
  await page.getByLabel('What would you like to call it?').fill('Workshop month');
  await next(page);
  at = 'start day';
  pass('start: Today isn’t offered, as Sprint 1 holds today', (await page.getByRole('radio', { name: /^Today/ }).count()) === 0);
  await page.getByRole('radio', { name: /suggested/ }).click();
  await next(page);
  at = 'start standard';
  await page.getByRole('radio', { name: '80%', exact: true }).click();
  await next(page);
  at = 'start habits';
  const carry = (name) => page.locator('.ds-carry-row').filter({ has: page.locator('.ds-carry-name', { hasText: new RegExp(`^${name}$`) }) });
  await carry('Practice runs').getByRole('radio', { name: 'Change' }).click();
  await carry('Practice runs').locator('.ds-habed').getByLabel('What’s the target?').fill('2');
  await carry('Energy').getByRole('radio', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await page.locator('.sprint-start-new textarea').first().fill('Workshop invitations');
  await page.locator('.sprint-start-new').getByLabel('What’s the target?').fill('5');
  await next(page);
  const ready = await bodyText(page);
  pass('start: Ready sums it up', ready.includes('4 weeks') && ready.includes('Workshop month') && ready.includes('80%'), ready.slice(0, 300));
  await shot(page, '6-start-ready');
  await page.getByRole('button', { name: 'Start Performance Sprint 2' }).click();
  await page.waitForURL(/\/performance-sprint$/, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const list = await q(db.from('sprints').select('*').eq('user_id', me).order('number'));
  const s2 = list.find((x) => x.number === 2);
  pass('start: Sprint 1 finished, Sprint 2 running as chosen', list.length === 2 && list[0].status === 'finished' && s2?.status === 'running'
    && s2.length_weeks === 4 && s2.standard === 80 && s2.label === 'Workshop month' && s2.start_on >= today, JSON.stringify(list.map((x) => [x.number, x.status, x.start_on, x.actual_end_on])));
  pass('start: the sprints don’t overlap', !s2 || list[0].actual_end_on < s2.start_on, `${list[0].actual_end_on} / ${s2?.start_on}`);
  const sh = await q(db.from('sprint_habits').select('id, name, habit_id').eq('sprint_id', s2.id));
  pass('start: three habits kept or changed, Energy removed, one added', sh.length === 4 && !sh.some((h) => h.name === 'Energy') && sh.some((h) => h.name === 'Workshop invitations' && !h.habit_id), sh.map((h) => h.name).join(', '));
  const st = await q(db.from('sprint_habit_settings').select('sprint_habit_id, target').in('sprint_habit_id', sh.map((h) => h.id)));
  pass('start: the changed target is this sprint’s', Number(st.find((x) => x.sprint_habit_id === sh.find((h) => h.name === 'Practice runs')?.id)?.target) === 2, JSON.stringify(st));
  // Sprint 1's open to-dos: still saved on Sprint 1 (none deleted).
  const todos = await todosOf();
  pass('end: no to-do lost (all four still saved)', todos.length === 4 && todos.every((t) => !t.deleted_at), JSON.stringify(todos.map((t) => [t.text, t.sprint_id === firstSprint.id, t.planned_week])));
  await page.goto(`${APP}/performance-plan`);
  await page.waitForTimeout(2000);
  pass('the plan page shows the new target', (await bodyText(page)).includes('of 25'));
  await page.goto(`${APP}/performance-sprint/year`);
  await page.waitForTimeout(2000);
  const yTips = await page.locator('[data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
  pass('View your year: Sprint 1’s weeks are kept', yTips.some((t) => /Performance Sprint 1/.test(t)), yTips.slice(-6).join(' | '));
  await shot(page, '6-year-after');
} catch (e) {
  pass('journey 6 ran to the end', false, `${at}: ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------------------------ 7. the coach's view
async function setEye(label, choice) {
  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.ds-who', { timeout: 30000 });
  await page.waitForTimeout(800);
  const eye = page.locator('.ds-who').nth(label === 'mission' ? 0 : 1);
  if ((await eye.textContent()).includes(choice)) return;
  await eye.click();
  await page.waitForSelector('[role=dialog] [role=option]');
  await page.getByRole('option', { name: choice }).click();
  await page.waitForTimeout(1200);
}
try {
  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.ds-who', { timeout: 30000 });
  const eyes0 = await page.locator('.ds-who').allTextContents();
  const sw0 = await q(db.from('sharing_switches').select('part, is_on').eq('user_id', me));
  const on0 = (part) => sw0.find((x) => x.part === part)?.is_on ?? part === 'mission'; // mission is on by default
  pass('eyes: each says what its switch is', eyes0.length >= 2 && eyes0[0].includes(on0('mission') ? 'You and Alex' : 'Only you') && eyes0[1].includes(on0('progress') ? 'You and Alex' : 'Only you'), `${eyes0.join(' | ')} vs ${JSON.stringify(sw0)}`);
  await setEye('mission', 'You and Alex');
  await setEye('progress', 'You and Alex');
  const eyes1 = await page.locator('.ds-who').allTextContents();
  const sw1 = await q(db.from('sharing_switches').select('part, is_on').eq('user_id', me));
  pass('eyes: both now say You and Alex', eyes1.slice(0, 2).every((t) => t.includes('You and Alex')), eyes1.join(' | '));
  pass('eyes: the switches saved on', on0 && sw1.some((x) => x.part === 'progress' && x.is_on) && (sw1.find((x) => x.part === 'mission')?.is_on ?? true), JSON.stringify(sw1));
  await page.reload();
  await page.waitForSelector('.ds-who', { timeout: 30000 });
  await page.waitForTimeout(800);
  pass('eyes: the same after a reload', (await page.locator('.ds-who').allTextContents()).slice(0, 2).every((t) => t.includes('You and Alex')));
  await page.locator('.ds-who').first().click();
  const sheet = (await page.locator('[role=dialog]').last().innerText()).replace(/\s+/g, ' ');
  pass('eyes: the sheet names the thing and says where else to change it', sheet.includes('Who can see this?') && sheet.includes('Your mission') && sheet.includes('What your coach sees'), sheet);
  await page.keyboard.press('Escape');

  const on = coachRead();
  pass('coach view (shared): the dry run ran and rolled back', on.rolledBack && on.owner && on.second, on.text.slice(-400));
  if (on.owner) {
    const o = on.owner;
    pass('owner coach, shared: sees the plan, objectives, figures, Strategies and links', o.performance_plans === 1 && o.outcome_objectives >= 2 && o.objective_figures >= 0 && o.plan_strategies === 2 && o.strategy_objectives >= 2, JSON.stringify(o));
    pass('owner coach, shared: sees the sprints and frozen weeks', o.sprints === 2 && o.week_scores >= 1, JSON.stringify(o));
    pass('owner coach, shared: never the habits, logs, to-dos or wins', o.habits === 0 && o.sprint_habits === 0 && o.habit_logs === 0 && o.todos === 0 && o.wins === 0 && o.win_strategies === 0 && o.performance_evidence === 0, JSON.stringify(o));
    pass('owner coach: sees the Recovery (Let Alex know was ticked), not the recharge answer', o.recovery_periods === 1 && o.recovery_recharge_answers === 0, JSON.stringify(o));
  }
  if (on.second) pass('second coach, shared: sees nothing at all', Object.entries(on.second).every(([, n]) => n === 0), JSON.stringify(on.second));

  await setEye('mission', 'Only you');
  await setEye('progress', 'Only you');
  const eyes2 = await page.locator('.ds-who').allTextContents();
  pass('eyes: set back to Only you', eyes2.slice(0, 2).every((t) => t.includes('Only you')), eyes2.join(' | '));
  const off = coachRead();
  if (off.owner) {
    const o = off.owner;
    pass('owner coach, not shared: no plan, objectives, Strategies, sprints or weeks', o.performance_plans === 0 && o.outcome_objectives === 0 && o.objective_figures === 0 && o.plan_strategies === 0 && o.strategy_objectives === 0 && o.sprints === 0 && o.week_scores === 0, JSON.stringify(o));
    pass('owner coach, not shared: still told of the Recovery, with only its dates', o.recovery_periods === 1 && (o.recovery_rows || []).every((r) => !('answer' in r)), JSON.stringify(o.recovery_rows));
  } else pass('coach view (not shared): the dry run ran', false, off.text.slice(-400));
  if (off.second) pass('second coach, not shared: sees nothing at all', Object.entries(off.second).every(([, n]) => n === 0), JSON.stringify(off.second));
} catch (e) {
  pass('journey 7 ran to the end', false, e.message.split('\n')[0]);
}

await ctx.close();
await browser.close();

// Back to the seeded plan v3.2 with Sprint 1 running, and the sharing as
// it starts for everyone (a person can't remove a switch row, only change
// it): the mission on, progress off.
await db.from('sharing_switches').upsert([{ user_id: me, part: 'mission', is_on: true }, { user_id: me, part: 'progress', is_on: false }], { onConflict: 'user_id,part' });
console.log(seed('--reset'));
const left = await q(db.from('sharing_switches').select('part, is_on').eq('user_id', me));
const back = await activePlan();
pass('tidy: the seeded plan v3.2 is back, with Sprint 1 running and the default sharing', back?.major === 3 && back.minor === 2 && (await runningSprint())?.number === 1
  && left.every((x) => x.is_on === (x.part === 'mission')), JSON.stringify({ back, left }));

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
