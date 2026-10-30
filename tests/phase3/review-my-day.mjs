// Phase 3 step 2 checks in the running app: Review my day (mock-up M5),
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/review-my-day.mjs [folder for screenshots]
//
// The seed is built around one fixed day and every browser's clock starts
// on it (tests/phase2/fixed-day.mjs), so nothing depends on the day or time
// the test runs (TEST_TODAY and TEST_TIME pick another). The morning's
// plan is written as the client: the way of being, two to-dos (one the
// highest priority) and two Strategies of the day; the habit chosen for
// the day is put on the device, where Plan my day keeps it.
//
// A full play-through from the first screen to Finish my review at
// 1280px, 700px, 390px and 360px, in dark and light. On every screen: one
// coral button, 44px tap areas, no sideways scroll, the writing rules and
// the eye. At 1280px dark, the saved rows are checked too: the ticks
// (todos.done_on), the habit logs (a tick and the numbers screen), the
// review's row and its Strategies, the unplanned win and its Performance
// Evidence row; the sprint page and its score match src/lib/scores; a
// refresh mid-step restores the draft and the step; the next day's Plan my
// day lists the three things for tomorrow (the clock moved on a day); and
// a review just after midnight is for the day before. The seed is put
// back on the real today at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel, londonInstant } from '../phase2/fixed-day.mjs';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';

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

console.log(`Fixed day: ${fixedLabel()}`);
const today = FIXED_TODAY;
const dayKey = (n, from = today) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return v;
}

// ---------------------------------------------------------------- the data
seedFixed('--reset');
const DRAFT = 'Draft the Harbour case study';
const SHORT = 'Shortlist breathing sound loops';
const PHYSIO = 'Book a physio assessment';
const WIN = 'Ran a workshop that led to two referrals';
const THINGS = ['Call Evan before 09:00 about the referral', 'Send the Harbour proposal', 'Book the physio'];
const NOTE = 'Idea: a short workshop for the Harbour leadership team.';
await db.from('day_reviews').delete().eq('user_id', me);
await db.from('day_plans').delete().eq('user_id', me);
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const strategies = (await db.from('plan_strategies').select('id, name').eq('plan_id', sprint.plan_id).is('archived_at', null)).data;
const sid = (name) => strategies.find((s) => s.name === name).id;
const todoId = async (text) => (await db.from('todos').select('id').eq('user_id', me).eq('text', text).eq('sprint_id', sprint.id)).data[0].id;
const ids = { draft: await todoId(DRAFT), short: await todoId(SHORT), physio: await todoId(PHYSIO) };
const sprintHabits = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data;
const hid = (name) => sprintHabits.find((h) => h.name === name).id;

// The morning's plan, as Plan my day saves it.
const dayPlanId = (await db.from('day_plans').insert({ user_id: me, local_date: today, way_of_being: 'Calm under pressure', status: 'finished', finished_at: `${today}T08:00:00Z` }).select('id').single()).data.id;
await db.from('day_plan_todos').insert([
  { day_plan_id: dayPlanId, todo_id: ids.draft, user_id: me, is_top: true },
  { day_plan_id: dayPlanId, todo_id: ids.short, user_id: me, is_top: false },
]);
await db.from('day_plan_strategies').insert([
  { day_plan_id: dayPlanId, strategy_id: sid('Grow through referrals'), user_id: me },
  { day_plan_id: dayPlanId, strategy_id: sid('Deepen my coaching craft'), user_id: me },
]);
const planLocal = { habits: [hid('Training sessions')], order: [`todo:${ids.draft}`, `todo:${ids.short}`, `habit:${hid('Training sessions')}`], top: `todo:${ids.draft}` };
const logsBefore = (await db.from('habit_logs').select('sprint_habit_id, local_date, value').eq('user_id', me).eq('local_date', today)).data;

async function cleanRun() {
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('todos').update({ done_on: null }).in('id', Object.values(ids));
  await db.from('wins').delete().eq('user_id', me).eq('what', WIN);
  await db.from('habit_logs').delete().eq('user_id', me).eq('local_date', today);
  if (logsBefore.length) await db.from('habit_logs').insert(logsBefore.map((l) => ({ ...l, user_id: me })));
}

async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const [objectives, strategyRows, links, shs, weekScores, recoveries, workingPatterns] = await Promise.all([
    q(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null).order('sort_order')),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
  ]);
  const hids = shs.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', hids)),
    q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', hids)),
    q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    q(db.from('todo_moves').select('*').eq('user_id', me)),
    q(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
    q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  return { plan: { id: sprint.plan_id }, sprint, objectives, strategies: strategyRows, links, sprintHabits: shs, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}
const scoreBefore = sprintPageView(await rowsNow(), { today }).soFar;
const logOf = async (name, day = today) => (await db.from('habit_logs').select('value').eq('sprint_habit_id', hid(name)).eq('local_date', day)).data?.[0]?.value ?? null;
const trainBefore = await logOf('Training sessions');

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)'];

async function signedIn({ width, mode, clock, withPlanLocal = true }) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await fixClock(context, clock);
  await context.addInitScript(([m, key, local]) => {
    try {
      localStorage.setItem('clarity-colour-mode', m);
      if (key && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(local));
    } catch { /* blocked */ }
  }, [mode, withPlanLocal ? `clarity-day-plan-local:${me}:${today}` : null, planLocal]);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  // A save refused as superseded shows this; one window alone must never see it.
  await page.exposeFunction('reportSuperseded', () => pass(`no save is refused as from another window (${width}px ${mode})`, false));
  await context.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.innerText.includes('This was changed in another window')) window.reportSuperseded?.();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page };
}

const heading = async (page) => (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim();
const body = (page) => page.locator('.ds-guide-body');

// Next: tapped until the question changes (a tap in the first moment
// after a move is ignored on purpose, so it is tried again).
async function next(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    const moved = await until(async () => (await heading(page)) !== before, 1200);
    if (moved) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}

async function open(page, path) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
}

// One screen: one coral button, 44px tap areas, no sideways scroll, the writing rules, the eye.
async function checkScreen(page, tag, { eye = true } = {}) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
    new Promise((r) => { setTimeout(r, 3000); }),
  ]));
  await until(() => page.evaluate((list) => [...document.querySelectorAll('.ds-guide-next')].some((b) => list.includes(getComputedStyle(b).backgroundColor)), CORAL), 3000);
  const facts = await page.evaluate((coralList) => {
    const root = document.querySelector('.ds-guide');
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (el.closest('[aria-hidden="true"], .ds-seg-measure, [inert]')) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };
    const all = [...root.querySelectorAll('*')].filter(shown);
    const coral = all.filter((el) => coralList.includes(getComputedStyle(el).backgroundColor)).length;
    const coralText = all.filter((el) => el.matches('.ds-guide-page *') && !el.closest('button') && coralList.slice(0, 2).includes(getComputedStyle(el).color) && el.textContent.trim()).map((el) => el.textContent.trim().slice(0, 30));
    const small = [...root.querySelectorAll('button, [role=radio], [role=checkbox], [role=switch], input, textarea')]
      .filter(shown)
      .filter((el) => !el.closest('.ds-textbox-measure'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        // A tap area made bigger than the look by an absolute ::after (the segmented pills).
        const a = getComputedStyle(el, '::after');
        const grow = (v) => (a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(v) || 0) : 0);
        return { w: Math.round(r.width + grow(a.left) + grow(a.right)), h: Math.round(r.height + grow(a.top) + grow(a.bottom)), what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) };
      })
      .filter((b) => b.w < 44 || b.h < 44);
    const page = root.querySelector('.ds-guide-page');
    // Sentences only: labels without a full stop are allowed (26 Oct rule 9).
    const lines = [...page.querySelectorAll('.ds-guide-question, .ds-guide-nudge, .day-quiet p, .day-quiet-line, .rev-more p, .rev-week p, .rev-wins > p, .ds-note p, .ds-panel-note')]
      .filter(shown).map((el) => el.textContent.trim());
    // What a person sees (screen-reader words and what people typed left out).
    const copy = page.cloneNode(true);
    copy.querySelectorAll('.ds-sr, .ds-note-text, .ds-guide-summary-value, .ds-todo-text, textarea, input').forEach((el) => el.remove());
    document.body.appendChild(copy);
    copy.style.position = 'absolute';
    copy.style.left = '-99999px';
    const text = copy.innerText;
    copy.remove();
    return {
      coral,
      coralText,
      small,
      lines,
      text,
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      scrollSideways: (() => { const s = root.querySelector('.ds-guide-scroll'); return s ? s.scrollWidth - s.clientWidth : 0; })(),
      eye: [...root.querySelectorAll('.ds-who')].filter(shown).map((e) => e.textContent.trim()),
    };
  }, CORAL);
  pass(`${tag}: one coral button`, facts.coral === 1, `${facts.coral}`);
  pass(`${tag}: nothing coral is a label or a figure`, facts.coralText.length === 0, facts.coralText.join(' | '));
  pass(`${tag}: 44px tap areas`, facts.small.length === 0, JSON.stringify(facts.small));
  pass(`${tag}: no sideways scroll`, facts.sideways <= 0 && facts.scrollSideways <= 0, `${facts.sideways} ${facts.scrollSideways}`);
  const text = facts.text.replace(/\d{1,2}:\d{2}/g, '');
  pass(`${tag}: no colons or brackets in its words`, !/[:()[\]]/.test(text), (text.match(/.{0,20}[:()[\]].{0,20}/) || [''])[0]);
  pass(`${tag}: no banned words`, !/\bmissed\b|\bfail(ed)?\b|\bstep \d+ of\b|\babout \d+ minutes?\b|\btap\b|\bclick\b|\bpurpose\b|…/i.test(facts.text), facts.text.slice(0, 80));
  const bad = facts.lines.filter((l) => !/[.?!]$/.test(l));
  pass(`${tag}: every sentence ends with a full stop or a question mark`, bad.length === 0, bad.join(' | '));
  if (eye) pass(`${tag}: the eye says Only you`, facts.eye.some((e) => /Only you$/.test(e)), JSON.stringify(facts.eye));
}

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); };
const checkbox = (page, name) => page.getByRole('checkbox', { name, exact: true }).first();
async function tickAndWait(page, name) {
  await checkbox(page, name).click();
  await until(async () => (await checkbox(page, name).getAttribute('aria-checked')) === 'true', 5000);
}

// The whole tool, first screen to Finish my review.
async function playThrough(page, tag, { deep = false } = {}) {
  await open(page, '/my-day/review');
  // 1. Do
  pass(`${tag}: opens on today's to-dos with ~5 minutes`, (await heading(page)) === 'Which of today’s to‑dos did you do?' && (await page.locator('.ds-guide-label').first().textContent()).trim() === '~5 minutes', await heading(page));
  pass(`${tag}: the % complete bar, never a step count`, await page.locator('.ds-guide-pct').isVisible());
  pass(`${tag}: the top bar has the tool's name only for today`, (await page.locator('.ds-guide-name').textContent()).trim() === 'Review my day');
  const first = (await page.locator('.ds-todo').first().innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: the highest priority comes first, tagged`, first.includes(DRAFT) && first.includes('Highest priority'), first);
  pass(`${tag}: the habit chosen in the morning is on today's list`, (await page.locator('.ds-todo', { hasText: 'Training sessions' }).count()) === 1);
  await checkScreen(page, `${tag} do`);
  await tickAndWait(page, DRAFT);
  await tickAndWait(page, 'Training sessions');
  await page.getByRole('button', { name: 'Show this week’s list' }).click();
  await page.getByRole('button', { name: 'Hide this week’s list' }).waitFor();
  pass(`${tag}: this week's list opens with the rest of the week`, (await page.locator('.ds-todo', { hasText: PHYSIO }).count()) === 1 && (await page.locator('.ds-todo', { hasText: 'Rolled over from week 3' }).count()) >= 1);
  await tickAndWait(page, PHYSIO);
  await checkScreen(page, `${tag} do, with this week's list`);
  await shot(page, `${tag}-1-do`);
  await next(page);

  // 2. Be
  pass(`${tag}: Be names the way of being`, (await heading(page)) === 'On a scale of 1 to 10, how calm under pressure were you today?', await heading(page));
  await checkScreen(page, `${tag} be`);
  await page.getByRole('radio', { name: '7', exact: true }).click();
  await body(page).locator('textarea').first().fill('In the Harbour call, when the price question came up.');
  pass(`${tag}: the scale's ends are in words`, (await page.locator('.ds-scale-ends').innerText()).includes('1 is not at all'));
  await shot(page, `${tag}-2-be`);
  await next(page);

  // 3. Numbers
  pass(`${tag}: Numbers`, (await heading(page)) === 'What are today’s numbers?');
  const weekly = (await page.locator('.rev-week').innerText()).trim();
  pass(`${tag}: the weekly habits in one sentence`, /^So far this week you have .+\.\n?/.test(weekly) && weekly.includes('training sessions at'), weekly);
  await checkScreen(page, `${tag} numbers`);
  await page.getByRole('textbox', { name: 'Steps today' }).fill('9800');
  await page.getByRole('textbox', { name: 'Water today' }).fill('1.5');
  await page.getByRole('textbox', { name: 'Water today' }).blur();
  await page.getByRole('group', { name: 'Focus today' }).getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('group', { name: 'Late finishes today' }).getByRole('button', { name: 'No', exact: true }).click();
  await shot(page, `${tag}-3-numbers`);
  await next(page);

  // 4. Went well, with an unplanned win
  pass(`${tag}: Went well`, (await heading(page)) === 'What went well today?');
  await body(page).locator('textarea').first().fill('The Harbour call landed and the proposal went out at 11:50.');
  await checkScreen(page, `${tag} went well`);
  await page.getByRole('button', { name: 'Add an unplanned win' }).click();
  const panel = page.getByRole('dialog', { name: 'Add an unplanned win' });
  await panel.locator('textarea').first().waitFor();
  await panel.locator('textarea').first().fill(WIN);
  await panel.getByRole('button', { name: 'Grow through referrals' }).click();
  await panel.getByRole('button', { name: 'Add my win' }).click();
  const winToast = await until(async () => (await page.getByText('Win added to Grow through referrals and your Performance Evidence.').count()) > 0, 10000);
  pass(`${tag}: the win's toast names its Strategy and Performance Evidence`, Boolean(winToast));
  pass(`${tag}: the win shows under the question, ticked`, (await page.locator('.ds-todo--win', { hasText: WIN }).count()) === 1);
  await shot(page, `${tag}-4-well`);
  await next(page);

  // 5. Differently
  pass(`${tag}: Differently`, (await heading(page)) === 'What would you do differently next time?');
  await checkScreen(page, `${tag} differently`);
  await body(page).locator('textarea').first().fill('Leave ten minutes between calls.');
  if (deep) {
    // A refresh mid-step: the step and the typing come back.
    await page.reload();
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    pass(`${tag}: a refresh mid-step stays on the step`, (await heading(page)) === 'What would you do differently next time?', await heading(page));
    const kept = await until(async () => (await body(page).locator('textarea').first().inputValue()) === 'Leave ten minutes between calls.', 8000);
    pass(`${tag}: a refresh mid-step restores the draft`, Boolean(kept), await body(page).locator('textarea').first().inputValue());
  }
  await next(page);

  // 6. Strategies
  pass(`${tag}: Strategies`, (await heading(page)) === 'Which Strategies moved today?');
  const nudges = await page.locator('.ds-guide-nudge').allInnerTexts();
  pass(`${tag}: the morning's reminder names both Strategies`, nudges.includes('This morning you said today would serve Deepen my coaching craft and Grow through referrals most.'), nudges.join(' | '));
  await page.getByRole('button', { name: 'Grow through referrals' }).click();
  await page.getByRole('radiogroup', { name: 'How much did “Grow through referrals” move?' }).getByRole('radio', { name: 'High' }).click();
  await checkScreen(page, `${tag} strategies`);
  await shot(page, `${tag}-6-strategies`);
  await next(page);

  // 7. Tomorrow, as rows
  pass(`${tag}: Tomorrow`, (await heading(page)) === 'What are the most important things to do tomorrow?');
  for (let i = 0; i < 3; i += 1) {
    if (i) await page.getByRole('button', { name: 'Add another' }).click();
    await page.getByRole('textbox', { name: `Important thing ${i + 1} for tomorrow` }).fill(THINGS[i]);
  }
  pass(`${tag}: three at most (Add another goes)`, (await page.getByRole('button', { name: 'Add another' }).count()) === 0);
  await page.getByRole('textbox', { name: 'Is there anything else on your mind?' }).fill(NOTE);
  await checkScreen(page, `${tag} tomorrow`);
  await shot(page, `${tag}-7-tomorrow`);
  await next(page);

  // 8. The summary
  pass(`${tag}: the summary greets by first name`, /^Here’s your day, \S+\.$/.test(await heading(page)), await heading(page));
  await checkScreen(page, `${tag} summary`, { eye: false });
  await shot(page, `${tag}-8-summary`);
  const summary = await page.locator('.ds-guide-summary').innerText();
  for (const words of ['2 of 3 done', 'Plus 1 more from this week’s list.', 'Calm under pressure, 7/10', 'In the Harbour call', 'The Harbour call landed', 'Plus 1 unplanned win.', 'Leave ten minutes between calls.', 'Grow through referrals, High', `1. ${THINGS[0]}`, `3. ${THINGS[2]}`, NOTE]) {
    pass(`${tag}: the summary shows "${words}"`, summary.includes(words), summary.slice(0, 300));
  }
  if (deep) {
    const v = sprintPageView(await rowsNow(), { today });
    const shown = (await page.locator('.day-score .ds-stat-value').textContent()).trim();
    pass(`${tag}: the summary's score is the sprint's (src/lib/scores)`, shown === `${v.soFar.value}%`, `${shown} vs ${v.soFar.value}%`);
    const good = await page.locator('.day-score .ds-stat-value').evaluate((el) => el.classList.contains('ds-stat-value--good'));
    pass(`${tag}: the score is mint only at or above the standard`, good === v.soFar.good);
  }
  // Finish my review: tapped until it goes.
  const gone = await until(async () => {
    if (/performance-sprint/.test(page.url())) return true;
    await page.getByRole('button', { name: 'Finish my review' }).click({ timeout: 2000 }).catch(() => null);
    return /performance-sprint/.test(page.url()) || page.waitForURL(/performance-sprint/, { timeout: 1500 }).then(() => true, () => false);
  }, 15000);
  if (!gone) throw new Error('Finish my review did not go back');
  const said = await until(async () => (await page.getByText('Your review is saved, and tomorrow’s Plan my day has your list ready.').count()) > 0, 8000);
  pass(`${tag}: Finish my review says so and goes back`, Boolean(said));
  const row = await until(async () => {
    const r = (await db.from('day_reviews').select('*').eq('user_id', me).eq('local_date', today)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass(`${tag}: the review is saved as finished`, Boolean(row?.finished_at));
  return row;
}

const sizes = [[1280, 'dark'], [1280, 'light'], [700, 'dark'], [700, 'light'], [390, 'dark'], [390, 'light'], [360, 'dark'], [360, 'light']];
// SIZES=1280-dark,390-light runs only those (while working on the page).
const only = process.env.SIZES ? process.env.SIZES.split(',') : null;
for (const [width, mode] of sizes.filter(([w, m]) => !only || only.includes(`${w}-${m}`))) {
  await cleanRun();
  const tag = `${width}px ${mode}`;
  const deep = width === 1280 && mode === 'dark';
  const { context, page } = await signedIn({ width, mode });
  try {
    const row = await playThrough(page, tag, { deep });
    if (deep) {
      pass('saved: the rating, where it showed, the answers and three things for tomorrow', row.way_of_being_rating === 7 && row.where_it_showed.startsWith('In the Harbour call')
        && row.went_well.startsWith('The Harbour call') && row.differently === 'Leave ten minutes between calls.' && JSON.stringify(row.tomorrow) === JSON.stringify(THINGS) && row.on_my_mind === NOTE, JSON.stringify(row));
      const drs = (await db.from('day_review_strategies').select('strategy_id, level').eq('day_review_id', row.id)).data;
      pass('saved: the Strategy that moved, High', drs.length === 1 && drs[0].strategy_id === sid('Grow through referrals') && drs[0].level === 3, JSON.stringify(drs));
      const done = (await db.from('todos').select('id, done_on').in('id', Object.values(ids))).data;
      const doneOn = (id) => done.find((t) => t.id === id)?.done_on;
      pass('the ticks are the sprint\'s own to-dos, done today', doneOn(ids.draft) === today && doneOn(ids.physio) === today && doneOn(ids.short) == null, JSON.stringify(done));
      // The habit logs: the tick (a count, one more) and the numbers screen.
      pass('a ticked count habit logs one more today', Number(await logOf('Training sessions')) === Number(trainBefore || 0) + 1, `${trainBefore} then ${await logOf('Training sessions')}`);
      pass('the numbers screen logs into the sprint', Number(await logOf('Steps')) === 9800 && Number(await logOf('Water')) === 1.5 && Number(await logOf('Focus')) === 4 && Number(await logOf('Late finishes')) === 0,
        `${await logOf('Steps')} ${await logOf('Water')} ${await logOf('Focus')} ${await logOf('Late finishes')}`);
      // The win, and its Performance Evidence row (the database's own trigger).
      const win = (await db.from('wins').select('id, local_date, impact').eq('user_id', me).eq('what', WIN)).data?.[0];
      const ws = win ? (await db.from('win_strategies').select('strategy_id').eq('win_id', win.id)).data : [];
      pass('the unplanned win is saved on today, on its Strategy', win?.local_date === today && ws.length === 1 && ws[0].strategy_id === sid('Grow through referrals'), JSON.stringify({ win, ws }));
      const ev = win ? (await db.from('performance_evidence').select('kind, text, local_date, deleted_at').eq('win_id', win.id)).data : [];
      pass('the win appears in Performance Evidence', ev.length === 1 && ev[0].kind === 'win' && ev[0].text === WIN && ev[0].local_date === today && !ev[0].deleted_at, JSON.stringify(ev));

      // The sprint page: the ticks and logs are there, and its score is src/lib/scores'.
      await page.waitForSelector('.ds-sdial-big--score', { timeout: 30000 });
      const v = sprintPageView(await rowsNow(), { today });
      const centre = await until(async () => {
        const t = (await page.locator('.ds-sdial-big--score').textContent()).trim();
        return t === `${v.soFar.value}%` ? t : null;
      }, 10000);
      pass('the sprint\'s score matches src/lib/scores', Boolean(centre), `${centre} vs ${v.soFar.value}%`);
      pass('the review moved the sprint\'s score', v.soFar.value !== scoreBefore.value, `${scoreBefore.value} then ${v.soFar.value}`);
      const listed = (await page.locator('.ds-todos').first().innerText());
      pass('the sprint page shows the to-do ticked in the review as done', (await page.getByRole('checkbox', { name: DRAFT }).first().getAttribute('aria-checked')) === 'true', listed.slice(0, 120));

      // A finished review opens on its summary, still changeable.
      await open(page, '/my-day/review');
      pass('a finished review opens on its summary', /^Here’s your day/.test(await heading(page)), await heading(page));
      pass('its answers can still be changed', (await page.getByRole('button', { name: 'Change Differently' }).count()) === 1);
    }
  } catch (e) {
    pass(`${tag}: the play-through finished`, false, e.message);
    await shot(page, `${tag}-error`);
  }
  await context.close();

  if (deep) {
    // ---------------------------------------- the next day's Plan my day (the clock moved on a day)
    const tomorrow = dayKey(1);
    const next1 = await signedIn({ width: 1280, mode: 'dark', clock: londonInstant(tomorrow, '08:30'), withPlanLocal: false });
    try {
      await open(next1.page, '/my-day/plan');
      for (let i = 0; i < 3; i += 1) await next(next1.page);
      pass('the next day: Plan my day is on What will you do today?', (await heading(next1.page)) === 'What will you do today?', await heading(next1.page));
      const picks = await next1.page.locator('.ds-answer--pick').allInnerTexts();
      for (let i = 0; i < 3; i += 1) {
        const at = picks.findIndex((p) => p.includes(THINGS[i]));
        pass(`the next day: "${THINGS[i]}" is on last night's list`, at === i && picks[i].includes('On last night’s list'), picks.slice(0, 4).join(' | '));
      }
      pass('the next day: last night\'s note is a note', (await next1.page.locator('.ds-note').innerText()).includes(NOTE));
      await shot(next1.page, 'next-day-plan');
    } catch (e) {
      pass('the next day\'s Plan my day', false, e.message);
    }
    await next1.context.close();

    // ---------------------------------------- a review just after midnight
    // Thursday was planned and not reviewed; at 00:30 on Friday the review is Thursday's.
    const thursday = dayKey(1);
    const friday = dayKey(2);
    await db.from('day_plans').insert({ user_id: me, local_date: thursday, way_of_being: 'Patient', status: 'finished' });
    const late = await signedIn({ width: 390, mode: 'dark', clock: londonInstant(friday, '00:30'), withPlanLocal: false });
    try {
      await open(late.page, '/my-day/review');
      const name = (await late.page.locator('.ds-guide-name').textContent()).trim();
      pass('just after midnight: the review is the day before\'s, its date in the top bar', /^Review my day, Thu \d+ \w+$/.test(name), name);
      await next(late.page);
      pass('just after midnight: it asks about the day before\'s way of being', (await heading(late.page)) === 'On a scale of 1 to 10, how patient were you today?', await heading(late.page));
      await late.page.getByRole('radio', { name: '6', exact: true }).click();
      const saved = await until(async () => (await db.from('day_reviews').select('local_date, way_of_being_rating').eq('user_id', me).eq('local_date', thursday)).data?.[0]?.way_of_being_rating === 6, 10000);
      pass('just after midnight: the answer is saved on the day before', Boolean(saved));
      const none = (await db.from('day_reviews').select('id').eq('user_id', me).eq('local_date', friday)).data;
      pass('just after midnight: nothing is saved on the new day', none.length === 0);
      // Once the day before is reviewed, just after midnight is the new day.
      await db.from('day_reviews').update({ status: 'finished', finished_at: `${thursday}T23:50:00Z` }).eq('user_id', me).eq('local_date', thursday);
      await late.page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('day-review-which')).forEach((k) => localStorage.removeItem(k)));
      await open(late.page, '/my-day/review');
      pass('just after midnight, with the day before reviewed: the review is the new day\'s', (await late.page.locator('.ds-guide-name').textContent()).trim() === 'Review my day');
      await shot(late.page, 'after-midnight');
    } catch (e) {
      pass('a review just after midnight', false, e.message);
    }
    await late.context.close();
    await db.from('day_reviews').delete().eq('user_id', me).in('local_date', [thursday, friday]);
    await db.from('day_plans').delete().eq('user_id', me).in('local_date', [thursday, friday]);
  }
}

await browser.close();
await cleanRun();
await db.from('day_reviews').delete().eq('user_id', me);
await db.from('day_plans').delete().eq('user_id', me);
seedForReal('--reset');

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
