// Phase 2 step 6 checks in the running app: the end-of-sprint review (M6),
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/review.mjs [folder for screenshots]
//
// It seeds a finished Sprint 1, a Recovery and Sprint 2 ended but not
// reviewed (scripts/seed-test-plan.mjs --ended), and leaves the usual
// seeded plan and running Sprint 1 in place at the end (--reset).
//
//  1. The sprint page's "over" state leads to the review.
//  2. Every step at 1280px, 700px, 390px and 360px, dark and light: no
//     sideways scroll, one coral button, 44px tap areas, the finished
//     dial mint and grey with no coral, no key.
//  3. The figures on the first step match src/lib/performance (reviewView)
//     on the same rows.
//  4. A draft survives a refresh ("Draft restored").
//  5. Finishing: an objective changed, one retired, one added, a habit
//     that stuck added to the plan, a double tap on finish; the sprint is
//     finished, one new version, the next stop is Start a sprint, the
//     answers stay on the device.
//  6. Recovery first: finishes the sprint and opens /recovery.
//  7. No sprint waiting, and a sprint still running.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { reviewView } from '../../src/lib/performance/sprintReview.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
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

const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)'];
const MINT = { dark: 'rgb(95, 239, 187)', light: 'rgb(11, 122, 82)' };

async function signedIn({ width, mode }) {
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
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page, phone };
}

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const heading = async (page) => (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim();
const primary = (page) => page.locator('.ds-guide .ds-btn--primary').last();
async function next(page) {
  await primary(page).click();
  await page.waitForTimeout(700);
}
const openReview = async (page) => {
  await page.goto(`${APP}/performance-sprint/review`);
  await page.waitForSelector('.ds-guide, .ipp-coming', { timeout: 30000 });
  await page.waitForTimeout(1200);
};

// The rows loadSprintReview reads, straight from the database.
async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const sprints = await q(db.from('sprints').select('*').eq('user_id', me).order('number'));
  const sprint = sprints.find((s) => s.status === 'running') || null;
  const plan = (await db.from('performance_plans').select('*').eq('user_id', me).eq('status', 'active')).data[0];
  const [weekScores, recoveries, workingPatterns, planObjectives, figures, strategies, links, planHabits, checkins, profile] = await Promise.all([
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
    q(db.from('outcome_objectives').select('*').eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    q(db.from('objective_figures').select('id, objective_id, value, recorded_on, created_at').eq('user_id', me)),
    q(db.from('plan_strategies').select('id, name').eq('plan_id', plan.id).is('archived_at', null)),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('habits').select('*').eq('plan_id', plan.id).is('archived_at', null).order('sort_order')),
    q(db.from('checkins').select('month, hardware_score').eq('user_id', me).eq('status', 'finished')),
    q(db.from('profiles').select('first_name').eq('id', me)),
  ]);
  let rest = {};
  if (sprint) {
    const sprintHabits = await q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order'));
    const ids = sprintHabits.map((h) => h.id);
    const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
      q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)),
      q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', ids)),
      q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
      q(db.from('todo_moves').select('*').eq('user_id', me)),
      q(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
      q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
    ]);
    rest = { sprintHabits, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [] };
  }
  return {
    plan, sprint, sprints, weekScores, recoveries, workingPatterns, planObjectives, figures, strategies, links, planHabits, checkins,
    objectives: planObjectives.map((o) => ({ id: o.id })), firstName: profile[0]?.first_name || '', personSettings: { units: 'metric' }, ...rest,
  };
}

async function layoutChecks(page, tag, mode, dial = false) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300); // the coral button's hover colour fades back
  const r = await page.evaluate(({ coral }) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const root = document.querySelector('.ds-guide') || document.querySelector('.plan-page');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [];
    for (const el of root.querySelectorAll('button, a, input, textarea, [role=radio], [role=checkbox]')) {
      if (!vis(el) || el.disabled) continue;
      const b = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const stretched = after.content !== 'none' && after.position === 'absolute' && (parseFloat(after.height) || 0) >= 44;
      if ((b.height >= 43.5 && b.width >= 43.5) || stretched) continue;
      small.push(`${String(el.className || el.tagName).slice(0, 40)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const fills = (sel) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).fill);
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      primaries: primaries.length,
      primaryCoral: primaries.every((b) => coral.includes(getComputedStyle(b).backgroundColor)),
      small,
      good: fills('.ds-sdial--finished .ds-sdial-seg--good'),
      below: fills('.ds-sdial--finished .ds-sdial-seg--below'),
      coral: [...document.querySelectorAll('.ds-sdial path')].filter((el) => coral.includes(getComputedStyle(el).fill)).length,
      key: document.querySelectorAll('.legend, .ds-legend').length,
    };
  }, { coral: CORAL });
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: one coral button`, r.primaries === 1 && r.primaryCoral, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  if (dial) {
    pass(`${tag}: weeks at the standard are mint`, r.good.length > 0 && r.good.every((f) => f === MINT[mode]), r.good.join(','));
    pass(`${tag}: weeks below are grey`, r.below.length > 0 && r.below.every((f) => !CORAL.includes(f) && f !== MINT[mode]), r.below.join(','));
    pass(`${tag}: no coral in the dial`, r.coral === 0);
    pass(`${tag}: no key`, r.key === 0);
  }
}

// ---------------------------------------------------------------- 1 and 2
seed('--ended');

{
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await page.goto(`${APP}/performance-sprint`);
  await page.waitForSelector('.sprint-hero--over', { timeout: 30000 });
  await page.getByRole('button', { name: 'Review this sprint' }).click();
  await page.waitForSelector('.ds-guide', { timeout: 30000 });
  pass('the sprint page’s over state leads to the review', page.url().endsWith('/performance-sprint/review'));

  // 3. Figures.
  const v = reviewView(await rowsNow(), { today });
  await page.waitForTimeout(800);
  pass('the opening follows the standard', (await heading(page)) === v.opening.question, `${await heading(page)} vs ${v.opening.question}`);
  const centre = (await page.locator('.ds-sdial-centre--finished').textContent()).trim();
  pass('the dial’s average matches M6', centre.includes(v.average) && centre.includes(`Standard ${v.standard}%`), centre);
  const facts = await page.locator('.review-facts').textContent();
  pass('weeks at the standard match M6', facts.includes(`${v.atStandard.value}${v.atStandard.of}`) || facts.includes(`${v.atStandard.value} ${v.atStandard.of}`), facts);
  pass('the best week matches M6', facts.includes(v.best.value) && facts.includes(v.best.range), facts);
  if (v.sinceLine) pass('Since you started matches', (await page.locator('.review-since').textContent()).trim() === v.sinceLine);
  const segs = await page.locator('.ds-sdial--finished [data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  pass('every week and the crosshair have a pop-up', segs.length === v.weeks.length + 1, `${segs.length}`);
  pass('last sprint’s comparison lives in the crosshair’s pop-up', !v.lastSprintLine || segs.some((t) => t.includes(v.lastSprintLine)), v.lastSprintLine);
  const frozen = await until(async () => {
    const ws = (await db.from('week_scores').select('sprint_week').eq('sprint_id', v.sprintId)).data;
    return ws.length >= v.weeks.length ? ws : null;
  });
  pass('the sprint’s weeks were frozen', Boolean(frozen));
  await context.close();
}

for (const width of [1280, 700, 390, 360]) {
  for (const mode of ['dark', 'light']) {
    const { context, page } = await signedIn({ width, mode });
    await openReview(page);
    for (let i = 0; i < 6; i += 1) {
      await layoutChecks(page, `${width}px ${mode} step ${i + 1}`, mode, i === 0);
      if (width === 390 || width === 1280) await shot(page, `review-${width}-${mode}-${i + 1}`);
      if (i < 5) await next(page);
    }
    await context.close();
  }
}

// ---------------------------------------------------------------- 4 and 5
{
  const { context, page } = await signedIn({ width: 1280, mode: 'light' });
  await openReview(page);
  await next(page);
  await page.locator('textarea').first().fill('Referral work in weeks 2 to 5. Two new clients came from it.');
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('.ds-guide', { timeout: 30000 });
  await page.waitForTimeout(1500);
  pass('a refresh keeps the step and the draft', /What worked best in this sprint\?/.test(await heading(page))
    && (await page.locator('textarea').first().inputValue()).startsWith('Referral work'));
  await next(page);
  await page.locator('textarea').first().fill('Late finishes in weeks 6 and 7.');
  await next(page);

  // Objectives: change the first, retire the milestone, add one.
  const before = await rowsNow();
  const first = before.planObjectives[0];
  const milestone = before.planObjectives.find((o) => o.kind === 'milestone');
  const objRow = (name) => page.locator('.ds-carry-row').filter({ has: page.locator('.ds-carry-name', { hasText: new RegExp(`^${name.replace(/[?]/g, '\\?')}$`) }) });
  await objRow(first.name).getByRole('radio', { name: 'Change' }).click();
  await page.waitForTimeout(300);
  await objRow(first.name).getByLabel('What’s your target?').fill('45');
  await objRow(milestone.name).getByRole('radio', { name: 'Retire' }).click();
  await page.waitForTimeout(300);
  pass('a retired objective is struck through', await objRow(milestone.name).evaluate((e) => e.classList.contains('ds-carry-row--removed')));
  await page.getByRole('button', { name: 'Add an objective' }).click();
  await page.waitForTimeout(400);
  const card = page.locator('.review-added .ds-objed').first();
  await card.locator('textarea').fill('Confidence leading group workshops');
  await card.getByRole('radio', { name: 'Rating /10' }).click();
  await card.getByLabel('Where are you now?').fill('6');
  await card.getByLabel('What’s your target?').fill('8');
  await card.locator('.ds-date').click();
  for (let m = 0; m < 8; m += 1) await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: '30 June 2027', exact: true }).click();
  await page.waitForTimeout(300);
  await shot(page, 'objectives-changed');
  await next(page);

  // Habits: add the one that stuck.
  await page.getByRole('button', { name: 'Add to my plan' }).first().click();
  await page.waitForTimeout(300);
  pass('a habit added shows In your plan', await page.locator('.ds-inplan').count() >= 1);
  await next(page);

  // What's next: Recovery changes the button, then back to the sprint.
  await page.getByRole('radio', { name: 'Recovery first' }).click();
  pass('Recovery first: the button says Start my Recovery', (await primary(page).textContent()).trim().toLowerCase() === 'start my recovery');
  await page.getByRole('radio', { name: /Straight into Performance Sprint/ }).click();
  const label = (await primary(page).textContent()).trim();
  pass('straight on: the button says Set up Performance Sprint 3', /set up performance sprint 3/i.test(label), label);
  await shot(page, 'next-step');
  const versionsBefore = (await db.from('plan_versions').select('id').eq('plan_id', before.plan.id)).data.length;
  // A double tap on finish.
  await primary(page).dblclick();
  const landed = await until(async () => page.url().endsWith('/performance-sprint/start'), 20000);
  pass('finishing opens Start a sprint', Boolean(landed), page.url());
  pass('the toast says what comes next', Boolean(await until(async () => (await page.locator('.ds-toast').textContent().catch(() => '')).includes('Saved. Set up Performance Sprint 3 next.'), 5000)));
  const after = await until(async () => {
    const s = (await db.from('sprints').select('*').eq('id', before.sprint.id)).data[0];
    return s.status === 'finished' ? s : null;
  });
  pass('the sprint is finished on its last day', after && after.actual_end_on === before.sprint.planned_end_on && Boolean(after.finished_at), JSON.stringify(after && { a: after.actual_end_on, p: before.sprint.planned_end_on }));
  const objs = (await db.from('outcome_objectives').select('*').eq('plan_id', before.plan.id)).data;
  pass('the changed objective was saved', Number(objs.find((o) => o.id === first.id).target_value) === 45);
  pass('the retired objective is archived', Boolean(objs.find((o) => o.id === milestone.id).archived_at));
  const newObj = objs.find((o) => o.name === 'Confidence leading group workshops');
  pass('the new objective was added', newObj && newObj.kind === 'rating' && Number(newObj.target_value) === 8 && newObj.by_when === '2027-06-30' && newObj.start_set_on === today, JSON.stringify(newObj && { k: newObj.kind, t: newObj.target_value, b: newObj.by_when, s: newObj.start_set_on }));
  const habit = (await db.from('habits').select('*').eq('plan_id', before.plan.id).eq('name', 'Mobility sessions')).data;
  pass('the habit that stuck is in the plan, once', habit.length === 1 && habit[0].measure === 'count' && Number(habit[0].target) === 3, JSON.stringify(habit.map((h) => h.id)));
  const linked = (await db.from('sprint_habits').select('habit_id').eq('sprint_id', before.sprint.id).eq('name', 'Mobility sessions')).data[0];
  pass('its sprint habit now points at it', habit[0] && linked?.habit_id === habit[0].id);
  const versions = (await db.from('plan_versions').select('major, minor, kind').eq('plan_id', before.plan.id).order('created_at', { ascending: false })).data;
  pass('one new version, major (objectives retired and changed)', versions.length === versionsBefore + 1 && versions[0].kind === 'major', JSON.stringify(versions[0]));
  const plan = (await db.from('performance_plans').select('major, minor').eq('id', before.plan.id)).data[0];
  pass('the plan’s version moved on', plan.major === before.plan.major + 1 && plan.minor === 0, JSON.stringify(plan));
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('performance-sprint-review-answers')).map((k) => localStorage.getItem(k)).join(''));
  pass('the two answers stay on the device', kept.includes('Referral work') && kept.includes('Late finishes'));
  pass('Start a sprint goes straight to the steps', /How long is this sprint\?/.test(await heading(page).catch(() => '')));
  await shot(page, 'after-finish');

  // 7a. Nothing waiting now.
  await openReview(page);
  pass('no sprint waiting says so', (await page.locator('.ipp-coming').textContent()).includes('No sprint is waiting for its review.'));
  await context.close();
}

// ---------------------------------------------------------------- 6. Recovery first
seed('--ended');
{
  const { context, page } = await signedIn({ width: 390, mode: 'dark' });
  await openReview(page);
  for (let i = 0; i < 5; i += 1) await next(page);
  await page.getByRole('radio', { name: 'Recovery first' }).click();
  await layoutChecks(page, '390px dark Recovery first', 'dark');
  await primary(page).click();
  pass('Recovery first opens /recovery', Boolean(await until(async () => page.url().endsWith('/recovery'), 20000)), page.url());
  const s = (await db.from('sprints').select('status').eq('user_id', me).eq('number', 2)).data[0];
  pass('Recovery first: the sprint is finished', s?.status === 'finished');
  await page.waitForSelector('.rec-question');
  await layoutChecks(page, '390px dark Take a recovery week', 'dark');
  await shot(page, 'recovery-start');
  await context.close();
}

// ---------------------------------------------------------------- 7b. a sprint still running
seed('--reset');
{
  const { context, page } = await signedIn({ width: 390, mode: 'light' });
  await openReview(page);
  const text = await page.locator('.ipp-coming').textContent();
  pass('a sprint still running says so first', text.includes('is still running.') && text.includes('Reviewing it now finishes it today.'), text);
  await layoutChecks(page, '390px light still running', 'light');
  await page.getByRole('button', { name: 'Review it now' }).click();
  await page.waitForSelector('.ds-guide', { timeout: 10000 });
  pass('Review it now opens the review', (await heading(page)).length > 0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  pass('closing goes back to the sprint, still running', Boolean(await until(async () => page.url().endsWith('/performance-sprint'), 10000)));
  const s = (await db.from('sprints').select('status').eq('user_id', me).eq('status', 'running')).data;
  pass('closing finishes nothing', s.length === 1);
  await page.goto(`${APP}/design-reference#c40`);
  await page.waitForSelector('#c40 .ds-sdial--finished', { timeout: 20000 });
  pass('gallery: the finished dial and the habit rows are shown', await page.locator('#c39 .ds-inplan').count() >= 1);
  await context.close();
}

await browser.close();
seed('--reset');
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
