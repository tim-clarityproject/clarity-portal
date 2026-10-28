// Phase 2 step 2 checks in the running app: Build your plan and editing
// it (M6), signed in as the invented test client on the TEST database only
// (every other host and every email call is blocked).
//
//   node tests/phase2/build-plan.mjs [folder for screenshots]
//
// It empties the test client's plan first (scripts/seed-test-plan.mjs
// --empty) and puts the seeded example plan back at the end (--reset), so
// the plan page still has content.
//
//  1. Every step, at 1280px, 700px, 390px and 360px, dark and light, before
//     anything is typed (which writes nothing): no sideways scroll, one
//     coral button, 44px tap areas, the % complete bar and no step list.
//  2. Build a whole plan from empty on a laptop: mission, three objectives
//     (a number, a milestone, a rating), a Strategy per objective (typed,
//     an idea, and "your other Strategies"), habits of four kinds, the
//     working days, 8 weeks, the suggested start and 80%; Saving and
//     Saved; a half-filled objective stays on the device; Ready's summary
//     and alignment check; "Start Performance Sprint 1" keeps version 1.0
//     and hands the sprint on.
//  3. Build again is refused: it opens the editor (never a second plan).
//  4. Edit: a new target (minor, 1.1), then a new objective (major, 2.0),
//     and the versions on /performance-plan/history.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

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
const count = async (table, extra = (q) => q) => {
  const { count: n } = await extra(db.from(table).select('*', { count: 'exact', head: true }).eq('user_id', me));
  return n;
};
const activePlan = async () => (await db.from('performance_plans').select('id, mission, major, minor').eq('user_id', me).eq('status', 'active')).data;

const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)'];

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

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png` }); };

async function stepChecks(page, tag) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const r = await page.evaluate((coral) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const root = document.querySelector('.ds-guide');
    const scroller = root.querySelector('.ds-guide-scroll');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [];
    for (const el of root.querySelectorAll('button, a, [role=radio], [role=option]')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const ah = parseFloat(after.height) || 0;
      const stretched = after.content !== 'none' && after.position === 'absolute' && ah >= 44;
      if ((b.height >= 43.5 && b.width >= 43.5) || stretched) continue;
      small.push(`${(el.className || el.tagName).toString().slice(0, 40)} "${el.textContent.trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const coralFills = [...root.querySelectorAll('.ds-sdial path, .ds-guide-pct-track span')]
      .filter((el) => coral.includes(getComputedStyle(el).fill) || coral.includes(getComputedStyle(el).backgroundColor)).length;
    return {
      sideways: Math.max(document.documentElement.scrollWidth - window.innerWidth, scroller.scrollWidth - scroller.clientWidth),
      primaries: primaries.length,
      primaryCoral: primaries.every((b) => coral.includes(getComputedStyle(b).backgroundColor)),
      small,
      coralFills,
      percent: Boolean(root.querySelector('.ds-guide-pct')),
      stepList: Boolean(root.querySelector('.ds-guide-steps')),
      heading: root.querySelector('.ds-guide-question, .ds-guide-title')?.textContent || '',
      theme: document.documentElement.getAttribute('data-theme'),
    };
  }, CORAL);
  const name = `${tag} "${r.heading.slice(0, 40)}"`;
  pass(`${name}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${name}: one coral button`, r.primaries === 1 && r.primaryCoral, `${r.primaries}`);
  pass(`${name}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 4).join('; '));
  pass(`${name}: % complete bar, no step list`, r.percent && !r.stepList);
  pass(`${name}: no coral in the dial or bar`, r.coralFills === 0, `${r.coralFills}`);
  return r;
}

const next = async (page) => {
  await page.locator('.ds-guide-next').click();
  await page.waitForTimeout(650);
};
const savedShown = async (page) => {
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.ds-guide-bar')?.textContent || ''), null, { timeout: 15000 });
};
const heading = (page) => page.locator('.ds-guide-question, .ds-guide-title').first().textContent();

// ------------------------------------------------------------------ 1. layout
console.log(seed('--empty'));
for (const mode of ['dark', 'light']) {
  for (const width of [1280, 700, 390, 360]) {
    const tag = `${width}px ${mode}`;
    const { context, page } = await signedIn({ width, mode });
    await page.goto(`${APP}/performance-plan/build`);
    await page.waitForSelector('.ds-guide', { timeout: 30000 });
    await page.waitForTimeout(700);
    for (let i = 0; i < 9; i += 1) {
      const r = await stepChecks(page, tag);
      if (i === 0) pass(`${tag}: the tool follows the mode`, r.theme === mode, `${r.theme}`);
      await shot(page, `build-${width}-${mode}-${i}`);
      if (i < 8) await next(page);
    }
    await context.close();
  }
}
pass('opening Build your plan and moving through it writes nothing', (await activePlan()).length === 0);

// ------------------------------------------------------------------ 2. build
try {
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await page.goto(`${APP}/performance-plan`);
  await page.getByRole('button', { name: /build my plan/i }).click();
  await page.waitForURL(/\/performance-plan\/build/);
  await page.waitForSelector('.ds-guide');
  await page.waitForTimeout(600);

  // Mission.
  await page.getByLabel('My Mission').fill('Lead a coaching practice that helps leaders stay calm and clear');
  await savedShown(page);
  pass('build: Saving then Saved in the top bar', true);
  const afterMission = await activePlan();
  pass('build: the mission saves as you go', afterMission.length === 1 && afterMission[0].mission.startsWith('Lead a coaching'), JSON.stringify(afterMission));
  await next(page);

  // Outcome Objectives.
  pass('build: objectives step', /What 2 to 4 results/.test(await heading(page)));
  pass('build: the one-off tip', (await page.locator('.ds-guide-tip').count()) === 1);
  const card = (i) => page.locator('.ds-objed').nth(i);
  const pickDate = async (i, dayLabelText, months) => {
    await card(i).locator('.ds-date').click();
    for (let m = 0; m < months; m += 1) await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByRole('button', { name: dayLabelText, exact: true }).click();
    await page.waitForTimeout(200);
  };
  await card(0).locator('textarea').fill('Coaching clients');
  await card(0).getByLabel('Where are you now?').fill('31');
  await card(0).getByLabel('What’s your target?').fill('40');
  await pickDate(0, '15 December 2026', 2);
  await page.getByRole('button', { name: 'Add an objective' }).click();
  await card(1).locator('textarea').fill('Launch the leadership programme');
  await page.waitForTimeout(1600);
  pass('build: a half-filled objective stays on the device', (await count('outcome_objectives')) === 1, `${await count('outcome_objectives')} saved`);
  await card(1).getByRole('radio', { name: 'Milestone' }).click();
  pass('build: the milestone’s two lines', (await card(1).textContent()).includes('Something you get done once, by a date.'));
  await pickDate(1, '20 January 2027', 3);
  await page.getByRole('button', { name: 'Add an objective' }).click();
  await card(2).locator('textarea').fill('Confidence leading group workshops');
  await card(2).getByRole('radio', { name: 'Rating /10' }).click();
  await card(2).getByLabel('Where are you now?').fill('6');
  await card(2).getByLabel('What’s your target?').fill('12');
  pass('build: a rating over 10 says what to type', (await card(2).textContent()).includes('Any figure from 0 to 10.'));
  await card(2).getByLabel('What’s your target?').fill('8');
  await pickDate(2, '26 February 2027', 4);
  await shot(page, 'flow-objectives');
  await page.waitForTimeout(1200);
  await savedShown(page);
  pass('build: three objectives saved', (await count('outcome_objectives')) === 3, `${await count('outcome_objectives')}`);
  await next(page);

  // Strategies, one screen per objective.
  pass('build: Strategies for the first objective', (await heading(page)) === 'How will you move “Coaching clients”?', await heading(page));
  pass('build: the help panel uses rule 40’s words', (await page.locator('.ds-help-panel').textContent()).startsWith('Strategies are medium to long-term approaches to achieving your objectives.'));
  await page.getByRole('button', { name: 'Add a Strategy' }).click();
  await page.waitForTimeout(150);
  await page.getByLabel('Strategy 1').fill('Maintain my availability to do good work');
  await page.getByRole('button', { name: 'Protect time for deep work' }).click();
  await page.waitForTimeout(150);
  pass('build: an idea becomes a Strategy to make your own', (await page.getByLabel('Strategy 2').inputValue()) === 'Protect time for deep work');
  await shot(page, 'flow-strategies-1');
  await next(page);
  pass('build: Strategies for the second objective', (await heading(page)).includes('Launch the leadership programme'));
  await page.getByRole('button', { name: 'Protect time for deep work' }).click(); // "your other Strategies"
  await page.getByRole('button', { name: 'Add a Strategy' }).click();
  await page.waitForTimeout(150);
  await page.getByLabel('Strategy 2').fill('Grow through referrals');
  await next(page);
  await page.getByRole('button', { name: 'Maintain my availability to do good work' }).click();
  await shot(page, 'flow-strategies-3');
  await page.waitForTimeout(1200);
  await savedShown(page);
  pass('build: three Strategies and their links saved', (await count('plan_strategies')) === 3 && (await count('strategy_objectives')) === 5,
    `${await count('plan_strategies')} Strategies, ${await count('strategy_objectives')} links`);
  await next(page);

  // Habits.
  pass('build: habits step', /Which habits will carry out each Strategy/.test(await heading(page)));
  const habit = (i) => page.locator('.ds-habed').nth(i);
  const measure = async (i, name) => {
    await habit(i).locator('.ds-dd').click();
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
    await page.waitForTimeout(150);
  };
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(0).locator('textarea').fill('Training sessions');
  await habit(0).getByLabel('What’s the target?').fill('4');
  await habit(0).getByRole('radio', { name: 'High' }).click();
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(1).locator('textarea').first().fill('Steps');
  await measure(1, 'Amount with a unit');
  await habit(1).getByLabel('What’s the unit?').fill('steps');
  await habit(1).getByLabel('What’s the target?').fill('10000');
  pass('build: an amount counts a day', (await habit(1).textContent()).includes('a day'));
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(2).locator('textarea').fill('Focus');
  await measure(2, 'Rating 1 to 5');
  await habit(2).getByRole('radio', { name: 'Lower is better' }).click();
  await habit(2).getByLabel('What’s the target?').fill('5');
  pass('build: a rating target out of range says what to type', (await habit(2).textContent()).includes('Any figure from 1 to 4.'));
  await habit(2).getByLabel('What’s the target?').fill('2');
  await shot(page, 'flow-habits');
  // Another Strategy's habits.
  await page.locator('.ds-guide-body > div > .ds-choice .ds-dd').first().click();
  await page.getByRole('option', { name: 'Grow through referrals' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await habit(0).locator('textarea').fill('Late finishes');
  await measure(0, 'Yes or no each day, under a limit');
  await habit(0).getByLabel('What’s the target?').fill('2');
  pass('build: a limit says days at most', (await habit(0).textContent()).includes('days at most'));
  await page.waitForTimeout(1200);
  await savedShown(page);
  pass('build: four habits saved', (await count('habits')) === 4, `${await count('habits')}`);
  await next(page);

  // Working days, length, start, standard.
  pass('build: working days step', (await heading(page)) === 'Which days do you work?');
  await page.getByRole('button', { name: 'Saturday' }).click();
  await page.waitForTimeout(1200);
  pass('build: the working days save', (await count('working_patterns')) === 1);
  await page.getByRole('button', { name: 'Saturday' }).click();
  await next(page);
  pass('build: length step', /How long is your first Performance Sprint/.test(await heading(page)));
  await page.getByRole('radio', { name: '8 weeks' }).click();
  await next(page);
  pass('build: start step', (await heading(page)) === 'When does it start?');
  pass('build: next Monday is suggested and picked', (await page.locator('[aria-checked=true]').textContent()).includes('suggested'));
  await next(page);
  pass('build: standard step', /performance standard/.test(await heading(page)));
  await page.getByRole('radio', { name: '80%' }).click();
  await next(page);

  // Ready.
  const ready = await page.locator('.ds-guide-body').textContent();
  pass('build: Ready title', (await heading(page)) === 'Your plan and first sprint');
  pass('build: Ready lists the plan', ready.includes('Coaching clients') && ready.includes('31 now, target 40, by 15 Dec 2026')
    && ready.includes('Milestone, by 20 Jan 2027') && ready.includes('6/10 now, target 8/10, by 26 Feb 2027')
    && ready.includes('4 habits across 2 Strategies') && ready.includes('Monday to Friday') && ready.includes('8 weeks') && ready.includes('80%'), ready.slice(0, 200));
  pass('build: Ready’s alignment check', ready.includes('Every objective has a Strategy') && ready.includes('Every Strategy serves an objective'));
  pass('build: the set-up dial shows 8 weeks', (await page.locator('.ds-sdial-seg').count()) === 8 && (await page.locator('.ds-sdial-big').textContent()) === '8');
  await shot(page, 'flow-ready');
  await page.getByRole('button', { name: 'Start Performance Sprint 1' }).click();
  await page.waitForURL(/\/performance-sprint\/start/, { timeout: 20000 });
  await page.waitForTimeout(800);
  pass('build: the sprint is handed to Start a sprint', (await page.locator('.ipp-coming').textContent()).includes('8 weeks'));
  await shot(page, 'flow-sprint-handover');
  const versions = (await db.from('plan_versions').select('major, minor, kind').eq('user_id', me)).data;
  pass('build: version 1.0 kept', versions.length === 1 && versions[0].major === 1 && versions[0].minor === 0 && versions[0].kind === 'start', JSON.stringify(versions));
  pass('build: no sprint is created here (Start a sprint creates it)', (await count('sprints')) === 0);

  // ---------------------------------------------------------------- 3. one plan only
  await page.goto(`${APP}/performance-plan/build`);
  await page.waitForURL(/\/performance-plan\/edit/, { timeout: 20000 });
  pass('build again opens the editor, never a second plan', (await activePlan()).length === 1);
  await page.waitForSelector('.ds-guide');
  await page.waitForTimeout(600);
  pass('edit: the editor’s name', (await page.locator('.ds-guide-name').textContent()) === 'Edit my plan');

  // ---------------------------------------------------------------- 4. edit
  // A minor change: a new target.
  await next(page);
  await card(0).getByLabel('What’s your target?').fill('45');
  pass('edit: an objective in the plan asks where it started', (await card(0).textContent()).includes('Where did you start?'));
  await page.waitForTimeout(1200);
  await savedShown(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForURL(/\/performance-plan$/, { timeout: 20000 });
  await page.waitForTimeout(500);
  pass('edit: closing says the new version', (await page.locator('body').textContent()).includes('Your plan is now Version 1.1.'));
  let plan = (await activePlan())[0];
  pass('edit: a minor change is 1.1', plan.major === 1 && plan.minor === 1, `${plan.major}.${plan.minor}`);

  // A major change: a new objective, then Save my plan on Ready.
  await page.goto(`${APP}/performance-plan/edit`);
  await page.waitForSelector('.ds-guide');
  await page.waitForTimeout(600);
  // The editor carries on where it was left (the objectives).
  pass('edit: carries on where it was left', /What 2 to 4 results/.test(await heading(page)), await heading(page));
  await page.getByRole('button', { name: 'Add an objective' }).click();
  await card(3).locator('textarea').fill('Speak at a leadership conference');
  await card(3).getByRole('radio', { name: 'Milestone' }).click();
  await pickDate(3, '30 April 2027', 6);
  pass('edit: no more than 4 objectives', (await page.getByRole('button', { name: 'Add an objective' }).count()) === 0);
  await page.waitForTimeout(1200);
  for (let i = 0; i < 6 && !/Your plan/.test(await heading(page)); i += 1) await next(page);
  const editReady = await page.locator('.ds-guide-body').textContent();
  pass('edit: Ready flags the new objective with no Strategy', editReady.includes('Speak at a leadership conference has no Strategy working on it'));
  pass('edit: Ready has no sprint rows', !editReady.includes('Performance standard') && (await page.locator('.ds-sdial').count()) === 0);
  await shot(page, 'flow-edit-ready');
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await page.waitForURL(/\/performance-plan$/, { timeout: 20000 });
  await page.waitForTimeout(500);
  pass('edit: saving says the new version', (await page.locator('body').textContent()).includes('Your plan is now Version 2.0.'));
  plan = (await activePlan())[0];
  pass('edit: a major change is 2.0', plan.major === 2 && plan.minor === 0, `${plan.major}.${plan.minor}`);

  // Version history.
  await page.goto(`${APP}/performance-plan/history`);
  await page.waitForSelector('.ds-row', { timeout: 20000 });
  const history = await page.locator('.ds-row').allTextContents();
  pass('history: three versions, newest first', history.length === 3 && /2\.0/.test(history[0]) && /1\.1/.test(history[1]) && /1\.0/.test(history[2]), history.join(' | ').slice(0, 200));
  await shot(page, 'flow-history');
  await context.close();
} catch (e) {
  pass('the build and edit flow ran to the end', false, e.message.split('\n')[0]);
}

await browser.close();
console.log(seed('--reset'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
