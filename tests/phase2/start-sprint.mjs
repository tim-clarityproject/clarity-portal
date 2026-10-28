// Phase 2 step 3 checks in the running app: Start a sprint (M6), signed in
// as the invented test client on the TEST database only (every other host
// and every email call is blocked).
//
//   node tests/phase2/start-sprint.mjs [folder for screenshots]
//
// It replaces the test client's plan with the seeded example
// (scripts/seed-test-plan.mjs --reset), takes its sprint away, and puts
// the seeded plan and its running sprint back at the end.
//
//  1. From Build your plan's hand-over, Sprint 1 is made at once, with
//     every habit in the plan, and only once (the page mounts twice in
//     development).
//  2. With a sprint running, the page says so first (review or start).
//  3. Every step at 1280px, 700px, 390px and 360px, dark and light: no
//     sideways scroll, one coral button, 44px tap areas, the % bar.
//  4. Sprint 2 through the steps: 6 weeks, a label, today, 80%, one habit
//     removed, one changed, one added; a double tap on Start makes one
//     sprint, finishes Sprint 1 and copies the habits.
//  5. A refresh mid-save sends the same rows again: no second sprint.
//  6. The review stand-in leads straight into the steps; no plan says
//     to build one.
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
const heading = (page) => page.locator('.ds-guide-question, .ds-guide-title').first().textContent();

async function pageChecks(page, tag) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const r = await page.evaluate((coral) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const main = document.querySelector('.ipp-page');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [...main.querySelectorAll('button, a')].filter(vis).filter((el) => {
      const b = el.getBoundingClientRect();
      return b.height < 43.5 || b.width < 43.5;
    }).map((el) => `"${el.textContent.trim().slice(0, 20)}"`);
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      primaries: primaries.length,
      primaryCoral: primaries.every((b) => coral.includes(getComputedStyle(b).backgroundColor)),
      small,
      text: main.textContent,
    };
  }, CORAL);
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: one coral button`, r.primaries === 1 && r.primaryCoral, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.join('; '));
  return r;
}

const sprints = async () => (await db.from('sprints').select('id, number, status, start_on, length_weeks, standard, label, actual_end_on, finished_at').eq('user_id', me).order('number')).data;
const sprintHabits = async (sprintId) => (await db.from('sprint_habits').select('id, habit_id, name, strategy_id').eq('sprint_id', sprintId).order('sort_order')).data;
const settingsOf = async (ids) => (await db.from('sprint_habit_settings').select('sprint_habit_id, target, impact, from_week').in('sprint_habit_id', ids)).data;
const dropSprints = async () => {
  for (const t of ['recovery_periods', 'wins', 'todos']) await db.from(t).delete().eq('user_id', me);
  const { error } = await db.from('sprints').delete().eq('user_id', me);
  if (error) throw error;
};
const keyDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const todayKey = keyDay(now);
const nextMonday = (() => { const d = new Date(now); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return keyDay(d); })();

console.log(seed('--reset'));
const plan = (await activePlan())[0];
const planHabits = (await db.from('habits').select('id, name, target, impact').eq('plan_id', plan.id).is('archived_at', null).order('sort_order')).data;
pass('the seeded plan has habits to copy', planHabits.length >= 3, `${planHabits.length}`);
await dropSprints();

// ------------------------------------------------------------------ 1. hand-over
try {
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await page.evaluate(([uid, monday]) => {
    localStorage.setItem(`clarity-draft:${uid}:first-sprint`, JSON.stringify({ lengthWeeks: 8, startOn: monday, standard: 80, label: null, template: false, at: Date.now() }));
  }, [me, nextMonday]);
  await page.goto(`${APP}/performance-sprint/start`);
  await page.waitForURL(/\/performance-sprint$/, { timeout: 30000 });
  await page.waitForFunction(() => /Performance Sprint 1 starts on/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
  const body = await page.locator('body').textContent();
  pass('hand-over: the toast says the sprint starts', /Saved\. Performance Sprint 1 starts/.test(body));
  pass('hand-over: the sprint page stand-in says when it starts', /Performance Sprint 1 starts on/.test(body));
  await shot(page, 'handover-sprint-page');
  const list = await sprints();
  pass('hand-over: one sprint, Sprint 1, as chosen', list.length === 1 && list[0].number === 1 && list[0].length_weeks === 8 && list[0].standard === 80 && list[0].start_on === nextMonday, JSON.stringify(list));
  const sh = await sprintHabits(list[0].id);
  pass('hand-over: every plan habit is copied', sh.length === planHabits.length && sh.every((h) => h.habit_id), `${sh.length}`);
  const st = await settingsOf(sh.map((h) => h.id));
  pass('hand-over: each habit has its settings from week 1', st.length === sh.length && st.every((s) => s.from_week === 1));
  pass('hand-over: the hand-over and the start record are cleared', await page.evaluate((uid) => !localStorage.getItem(`clarity-draft:${uid}:first-sprint`) && !localStorage.getItem(`clarity-draft:${uid}:sprint-start-pending`), me));
  await context.close();
} catch (e) {
  pass('the hand-over ran to the end', false, e.message.split('\n')[0]);
}

// ------------------------------------------------------------------ 2 and 3. running notice and layout
for (const mode of ['dark', 'light']) {
  for (const width of [1280, 700, 390, 360]) {
    const tag = `${width}px ${mode}`;
    const { context, page } = await signedIn({ width, mode });
    try {
      await page.goto(`${APP}/performance-sprint/start`);
      await page.waitForSelector('.sprint-start-running', { timeout: 30000 });
      const r = await pageChecks(page, `${tag} running notice`);
      if (width === 1280 && mode === 'dark') {
        pass('running: says Sprint 1 hasn’t started and that a new one finishes it', /Performance Sprint 1 hasn’t started yet\./.test(r.text) && /Starting a new sprint finishes Performance Sprint 1\./.test(r.text), r.text.slice(0, 200));
      }
      await shot(page, `running-${width}-${mode}`);
      await page.getByRole('button', { name: 'Start a new sprint' }).click();
      await page.waitForSelector('.ds-guide', { timeout: 10000 });
      await page.waitForTimeout(700);
      for (let i = 0; i < 5; i += 1) {
        await stepChecks(page, tag);
        if (i === 3) {
          // Open one editor, so its layout is checked too.
          await page.locator('.ds-carry-row').first().getByRole('radio', { name: 'Change' }).click();
          await page.waitForTimeout(300);
          await stepChecks(page, `${tag} with Change open`);
          await page.locator('.ds-carry-row').first().getByRole('radio', { name: 'Keep' }).click();
        }
        await shot(page, `steps-${width}-${mode}-${i}`);
        if (i < 4) await next(page);
      }
    } catch (e) {
      pass(`${tag}: the steps ran`, false, e.message.split('\n')[0]);
    }
    await context.close();
  }
}
pass('moving through the steps writes nothing', (await sprints()).length === 1);

// ------------------------------------------------------------------ 4. Sprint 2
let sprint2 = null;
try {
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  // The drafts from the layout runs are other tabs' copies: start clean.
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('performance-sprint-start')).forEach((k) => localStorage.removeItem(k)));
  await page.goto(`${APP}/performance-sprint/start`);
  await page.getByRole('button', { name: 'Start a new sprint' }).click();
  await page.waitForSelector('.ds-guide');
  await page.waitForTimeout(600);
  pass('steps: the label above is the new sprint', (await page.locator('.ds-guide').textContent()).includes('Performance Sprint 2'));
  pass('steps: How long is this sprint?', /How long is this sprint\?/.test(await heading(page)));
  await page.getByRole('radio', { name: '6 weeks', exact: true }).click();
  await page.getByLabel('What would you like to call it?').fill('Autumn push');
  await next(page);
  pass('steps: When does it start?', /When does it start\?/.test(await heading(page)));
  await page.getByRole('radio', { name: /^Today/ }).click();
  await next(page);
  pass('steps: the standard this time', /performance standard this time/.test(await heading(page)));
  await page.getByRole('radio', { name: '80%', exact: true }).click();
  await next(page);
  pass('steps: Which habits are you bringing across?', /Which habits are you bringing across\?/.test(await heading(page)));
  const rows = page.locator('.ds-carry-row');
  pass('steps: one row per plan habit', (await rows.count()) === planHabits.length);
  await rows.nth(1).getByRole('radio', { name: 'Remove' }).click();
  pass('steps: a removed habit is struck through', (await rows.nth(1).getAttribute('class')).includes('ds-carry-row--removed'));
  await rows.nth(0).getByRole('radio', { name: 'Change' }).click();
  await rows.nth(0).locator('.ds-habed').getByLabel('What’s the target?').fill('3');
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await page.locator('.sprint-start-new textarea').first().fill('Walk between meetings');
  await page.locator('.sprint-start-new').getByLabel('What’s the target?').fill('3');
  await shot(page, 'flow-habits');
  await next(page);
  const ready = await page.locator('.ds-guide-body').textContent();
  pass('Ready: title Performance Sprint 2', /Performance Sprint 2/.test(await heading(page)));
  pass('Ready: the summary rows', ready.includes('6 weeks') && ready.includes('Autumn push') && ready.includes('Today, ') && ready.includes('80%') && ready.includes(`${planHabits.length} habits`), ready.slice(0, 300));
  pass('Ready: the added habit is for this sprint only', ready.includes('Walk between meetings is for this sprint only.'));
  pass('Ready: says it finishes Sprint 1', ready.includes('Starting it finishes Performance Sprint 1.'));
  await shot(page, 'flow-ready');
  await page.getByRole('button', { name: 'Start Performance Sprint 2' }).dblclick();
  await page.waitForURL(/\/performance-sprint$/, { timeout: 30000 });
  await page.waitForTimeout(800);
  pass('start: the toast', /Saved\. Performance Sprint 2 starts/.test(await page.locator('body').textContent()));
  const list = await sprints();
  sprint2 = list.find((s) => s.number === 2);
  pass('start: a double tap makes one sprint', list.length === 2, JSON.stringify(list.map((s) => s.number)));
  pass('start: Sprint 1 is finished, and ends the day before (it never started)', list[0].status === 'finished' && list[0].finished_at && list[0].actual_end_on < list[0].start_on, JSON.stringify(list[0]));
  pass('start: Sprint 2 is running as chosen', sprint2?.status === 'running' && sprint2.length_weeks === 6 && sprint2.standard === 80 && sprint2.label === 'Autumn push' && sprint2.start_on === todayKey, JSON.stringify(sprint2));
  const sh = await sprintHabits(sprint2.id);
  pass('start: kept and changed habits from the plan, minus the removed one, plus the added one', sh.length === planHabits.length && !sh.some((h) => h.habit_id === planHabits[1].id) && sh.filter((h) => !h.habit_id).length === 1, sh.map((h) => h.name).join(', '));
  const st = await settingsOf(sh.map((h) => h.id));
  const changed = st.find((s) => s.sprint_habit_id === sh.find((h) => h.habit_id === planHabits[0].id)?.id);
  pass('start: the change is in this sprint’s settings', Number(changed?.target) === 3, JSON.stringify(changed));
  const planAfter = (await db.from('habits').select('id, target').eq('id', planHabits[0].id)).data[0];
  pass('start: the plan itself is unchanged', Number(planAfter.target) === Number(planHabits[0].target));
  await context.close();
} catch (e) {
  pass('Sprint 2 ran to the end', false, e.message.split('\n')[0]);
}

// ------------------------------------------------------------------ 5. refresh mid-save
try {
  const { context, page } = await signedIn({ width: 390, mode: 'light' });
  await page.goto(`${APP}/performance-sprint/review`);
  await page.waitForSelector('.ipp-coming', { timeout: 30000 });
  const r = await pageChecks(page, '390px light review stand-in');
  pass('review stand-in: says it is coming', /The end-of-sprint review is coming soon\./.test(r.text));
  await page.getByRole('button', { name: 'Start a sprint' }).click();
  await page.waitForSelector('.ds-guide', { timeout: 10000 });
  pass('review stand-in: leads straight into the steps', /How long is this sprint\?/.test(await heading(page)));
  // Hold the habit settings back, so the save stops part-way.
  let hold = true;
  await page.route('**/rest/v1/sprint_habit_settings*', async (route) => {
    if (hold) return; // never answered: the page is reloaded mid-save
    return route.fallback();
  });
  await page.waitForTimeout(500);
  for (let i = 0; i < 6 && !/Performance Sprint 3/.test(await heading(page)); i += 1) await next(page);
  await page.getByRole('button', { name: 'Start Performance Sprint 3' }).click();
  await page.waitForFunction(() => /Starting Performance Sprint 3/.test(document.body.textContent), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const midway = await sprints();
  pass('mid-save: Sprint 3 is made before the refresh', midway.some((s) => s.number === 3), JSON.stringify(midway.map((s) => s.number)));
  pass('mid-save: the start is kept on the device', await page.evaluate((uid) => Boolean(localStorage.getItem(`clarity-draft:${uid}:sprint-start-pending`)), me));
  // The held save dies with the page; the reloaded page's saves go through.
  hold = false;
  await page.reload();
  await page.waitForURL(/\/performance-sprint$/, { timeout: 30000 }).catch(async (e) => {
    await shot(page, 'midsave-stuck');
    console.log('STUCK', page.url(), (await page.locator('body').textContent()).replace(/\s+/g, ' ').slice(-300));
    throw e;
  });
  await page.waitForTimeout(800);
  const list = await sprints();
  const s3 = list.filter((s) => s.number === 3);
  pass('mid-save: still one Sprint 3 after the refresh', s3.length === 1 && list.filter((s) => s.status === 'running').length === 1, JSON.stringify(list.map((s) => `${s.number}:${s.status}`)));
  let sh = [];
  let st = [];
  for (let i = 0; i < 15; i += 1) {
    sh = await sprintHabits(s3[0].id);
    st = await settingsOf(sh.map((h) => h.id));
    if (sh.length === planHabits.length && st.length === sh.length) break;
    await page.waitForTimeout(1000);
  }
  pass('mid-save: every habit and its settings arrived, once', sh.length === planHabits.length && st.length === sh.length, `${sh.length} habits, ${st.length} settings`);
  pass('mid-save: Sprint 2 is finished', list.find((s) => s.number === 2).status === 'finished');
  await shot(page, 'midsave-sprint-page');
  await context.close();
} catch (e) {
  pass('the refresh mid-save ran to the end', false, e.message.split('\n').slice(0, 3).join(' '));
}

// ------------------------------------------------------------------ 6. no plan
try {
  console.log(seed('--empty'));
  const { context, page } = await signedIn({ width: 360, mode: 'dark' });
  await page.goto(`${APP}/performance-sprint/start`);
  await page.waitForSelector('.ipp-coming', { timeout: 30000 });
  const r = await pageChecks(page, '360px dark no plan');
  pass('no plan: says to build the plan first', /Build your plan first/.test(r.text) && (await page.getByRole('button', { name: 'Build my plan' }).count()) === 1);
  await shot(page, 'noplan');
  await context.close();
} catch (e) {
  pass('the no-plan state ran', false, e.message.split('\n')[0]);
}

await browser.close();
console.log(seed('--reset'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
