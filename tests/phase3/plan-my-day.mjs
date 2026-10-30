// Phase 3 step 1 checks in the running app: Plan my day (mock-up M5),
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/plan-my-day.mjs [folder for screenshots]
//
// The seed is built around one fixed day and every browser's clock starts
// on it (tests/phase2/fixed-day.mjs), so nothing depends on the day or time
// the test runs (TEST_TODAY and TEST_TIME pick another). Last night's
// Review my day is written as the client (its list and its note), and an
// earlier plan's way of being, so "recently" has something.
//
// A full play-through from the first screen to Set my day at 1280px,
// 700px, 390px and 360px, in dark and light. On every screen: one coral
// button, 44px tap areas, no sideways scroll, the writing rules and the
// eye. At 1280px dark, the saved rows are checked too: the day's row, its
// to-dos (one from last night's list, one added in the panel) and the top,
// its Strategies, the habit kept on the device; the to-dos then show on
// /performance-sprint and its score changes, matching src/lib/scores; a
// refresh mid-step restores the draft and the step; a set plan opens on
// its summary. The seed is put back on the real today at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';
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
const dayKey = (n) => {
  const [y, m, d] = today.split('-').map(Number);
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
const NIGHT = 'Call Evan before 09:00 about the referral';
const NOTE = 'Idea: a short workshop for the Harbour leadership team.';
const PANEL_TODO = 'Ring the Harbour team about the workshop';
await db.from('day_reviews').delete().eq('user_id', me);
await db.from('day_plans').delete().eq('user_id', me);
const reviewId = (await db.from('day_reviews').insert({
  user_id: me, local_date: dayKey(-1), status: 'finished', finished_at: `${dayKey(-1)}T20:30:00Z`, tomorrow: [NIGHT], on_my_mind: NOTE,
}).select('id').single()).data.id;
await db.from('day_plans').insert({ user_id: me, local_date: dayKey(-2), way_of_being: 'Calm under pressure', status: 'finished' });
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;

async function cleanToday() {
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'plan_my_day']);
}

async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const [objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns] = await Promise.all([
    q(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null).order('sort_order')),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
  ]);
  const ids = sprintHabits.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)),
    q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', ids)),
    q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    q(db.from('todo_moves').select('*').eq('user_id', me)),
    q(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
    q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  return { plan: { id: sprint.plan_id }, sprint, objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}
const scoreBefore = sprintPageView(await rowsNow(), { today }).soFar;

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)'];

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
  await fixClock(context);
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

async function openPlan(page, path = '/my-day/plan') {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
}

// One screen: one coral button, 44px tap areas, no sideways scroll, the writing rules, the eye.
async function checkScreen(page, tag, { eye = true } = {}) {
  // Away from any button, and once any hover fade has settled.
  await page.mouse.move(1, 1);
  // The step slides in from the side: measure once it has arrived.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
    new Promise((r) => { setTimeout(r, 3000); }),
  ]));
  await until(() => page.evaluate((list) => [...document.querySelectorAll('.ds-guide-next')].some((b) => list.includes(getComputedStyle(b).backgroundColor)), CORAL), 3000);
  const facts = await page.evaluate(() => {
    const root = document.querySelector('.ds-guide');
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (el.closest('[aria-hidden="true"], .ds-seg-measure, [inert]')) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };
    const all = [...root.querySelectorAll('*')].filter(shown);
    const coral = all.filter((el) => ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)'].includes(getComputedStyle(el).backgroundColor)).length;
    const coralText = all.filter((el) => el.matches('.ds-guide-page *') && !el.closest('button') && ['rgb(255, 111, 92)', 'rgb(194, 65, 46)'].includes(getComputedStyle(el).color) && el.textContent.trim()).map((el) => el.textContent.trim().slice(0, 30));
    const small = [...root.querySelectorAll('button, [role=radio], [role=checkbox], [role=switch], input, textarea')]
      .filter(shown)
      .filter((el) => !el.closest('.ds-textbox-measure'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        // A button's tap area may be wider than its look (padding or ::before); measure the element.
        return { w: Math.round(r.width), h: Math.round(r.height), what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) };
      })
      .filter((b) => b.w < 44 || b.h < 44);
    const page = root.querySelector('.ds-guide-page');
    // Sentences only: labels without a full stop are allowed (26 Oct rule 9).
    const lines = [...page.querySelectorAll('.ds-guide-question, .ds-guide-nudge, .day-sgh, .day-quiet p, .day-quiet-line, .ds-note p, .day-confirm p, .ds-panel-note')]
      .filter(shown).map((el) => el.textContent.trim());
    // What a person sees (screen-reader words such as "Who can see this:" left out).
    const copy = page.cloneNode(true);
    copy.querySelectorAll('.ds-sr, .ds-note-text, .ds-guide-summary-value, .ds-pick-name').forEach((el) => el.remove()); // and what people typed
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
  });
  pass(`${tag}: one coral button`, facts.coral === 1, `${facts.coral}`);
  pass(`${tag}: nothing coral is a label or a figure`, facts.coralText.length === 0, facts.coralText.join(' | '));
  pass(`${tag}: 44px tap areas`, facts.small.length === 0, JSON.stringify(facts.small));
  pass(`${tag}: no sideways scroll`, facts.sideways <= 0 && facts.scrollSideways <= 0, `${facts.sideways} ${facts.scrollSideways}`);
  const text = facts.text.replace(/\d{1,2}:\d{2}/g, '');
  pass(`${tag}: no colons or brackets in its words`, !/[:()[\]]/.test(text), (text.match(/.{0,20}[:()[\]].{0,20}/) || [''])[0]);
  pass(`${tag}: no banned words`, !/\bmissed\b|\bfail(ed)?\b|\bstep \d+ of\b|\babout \d+ minutes?\b|\btap\b|\bclick\b|\bpurpose\b|…/i.test(facts.text), facts.text.slice(0, 80));
  const bad = facts.lines.filter((l) => !/[.?!]$/.test(l));
  pass(`${tag}: every sentence ends with a full stop or a question mark`, bad.length === 0, bad.join(' | '));
  if (eye) pass(`${tag}: the eye says Only you`, facts.eye.includes('Who can see this: Only you') || facts.eye.includes('Only you'), JSON.stringify(facts.eye));
}

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); };

// The whole tool, first screen to Set my day.
async function playThrough(page, tag, { deep = false } = {}) {
  await openPlan(page);
  // 1. Sleep
  pass(`${tag}: opens on Sleep with ~4 minutes`, (await heading(page)) === 'How did you sleep last night?' && (await page.locator('.ds-guide-label').first().textContent()).trim() === '~4 minutes');
  pass(`${tag}: the % complete bar, never a step count`, await page.locator('.ds-guide-pct').isVisible());
  await checkScreen(page, `${tag} sleep`);
  await shot(page, `${tag}-1-sleep`);
  await page.getByRole('button', { name: 'Half an hour more' }).click();
  pass(`${tag}: the first press starts from 7 hours`, (await page.locator('.ds-stepper-value').textContent()).trim() === '7.5');
  await page.getByRole('radio', { name: 'Good', exact: true }).click();
  await next(page);

  // 2. Gratitude
  pass(`${tag}: Gratitude`, (await heading(page)) === 'What’s one thing you’re grateful for today?');
  await checkScreen(page, `${tag} gratitude`);
  await body(page).locator('textarea').first().fill('Breakfast with my daughter before school.');
  if (deep) {
    // A refresh mid-step: the step and the typing come back.
    await page.reload();
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    pass(`${tag}: a refresh mid-step stays on the step`, (await heading(page)) === 'What’s one thing you’re grateful for today?', await heading(page));
    const kept = await until(async () => (await body(page).locator('textarea').first().inputValue()) === 'Breakfast with my daughter before school.', 8000);
    pass(`${tag}: a refresh mid-step restores the draft`, Boolean(kept), await body(page).locator('textarea').first().inputValue());
  }
  await shot(page, `${tag}-2-gratitude`);
  await next(page);

  // 3. Be
  pass(`${tag}: Be`, (await heading(page)) === 'How do you want to be today?');
  pass(`${tag}: a way of being used recently is offered`, await page.getByRole('radio', { name: 'Calm under pressure' }).isVisible());
  await checkScreen(page, `${tag} be`);
  await page.getByRole('radio', { name: 'Decisive' }).click();
  pass(`${tag}: a suggestion fills the box`, (await body(page).locator('textarea').first().inputValue()) === 'Decisive');
  await next(page);

  // 4. Do
  pass(`${tag}: Do`, (await heading(page)) === 'What will you do today?');
  pass(`${tag}: last night's thing is first, tagged`, ((await page.locator('.ds-answer--pick').first().textContent()) || '').includes(NIGHT) && ((await page.locator('.ds-answer--pick').first().textContent()) || '').includes('On last night’s list'));
  pass(`${tag}: last night's note is a note, not a task`, (await page.locator('.ds-note').textContent()).includes(NOTE) && (await page.locator('.ds-note button, .ds-note [role=checkbox]').count()) === 0);
  await checkScreen(page, `${tag} do`);
  const pick = (name) => page.locator('.ds-answer--pick', { hasText: name }).first();
  await pick(NIGHT).click();
  await until(async () => (await page.locator('.ds-answer--pick[aria-pressed="true"]', { hasText: NIGHT }).count()) === 1, 10000);
  await pick('Draft the Harbour case study').click();
  await pick('Training sessions').click();
  pass(`${tag}: three chosen, the rest grey out`, (await page.locator('.ds-answer--pick[aria-pressed="true"]').count()) === 3 && await page.locator('.ds-answer--pick', { hasText: 'Reflective notes' }).isDisabled());
  await shot(page, `${tag}-4-do`);
  // Add a to-do from the panel: no "Which week?", and today is full.
  await page.getByRole('button', { name: 'Add a to-do' }).click();
  const panel = page.locator('[role=dialog]').last();
  await panel.locator('textarea').first().fill(PANEL_TODO);
  pass(`${tag}: the panel has no Which week`, (await panel.getByText('Which week?').count()) === 0 && (await panel.getByText('It’s added to today and to this week’s sprint.').count()) === 1);
  await panel.getByRole('button', { name: 'Add my to-do' }).click();
  const toast = await until(async () => (await page.getByText('Added to this week’s sprint. Today already has three to-dos.').count()) > 0, 10000);
  pass(`${tag}: a to-do added when today is full goes to the sprint only`, Boolean(toast));
  await next(page);

  // 5. Priority
  pass(`${tag}: Priority on its own screen`, (await heading(page)) === 'Which one is your highest priority?');
  await checkScreen(page, `${tag} priority`);
  await page.getByRole('radio', { name: 'Draft the Harbour case study' }).click();
  await next(page);

  // 6. Strategy
  pass(`${tag}: Strategy`, (await heading(page)) === 'Which Strategies does today serve most?');
  await page.getByRole('button', { name: 'Grow through referrals' }).click();
  await page.getByRole('button', { name: 'Deepen my coaching craft' }).click();
  pass(`${tag}: two Strategies at most`, await page.getByRole('button', { name: 'Build The Clarity Portal' }).isDisabled());
  await checkScreen(page, `${tag} strategy`);
  await next(page);

  // 7. Risk
  pass(`${tag}: Risk`, (await heading(page)) === 'What’s the biggest risk to today?');
  await checkScreen(page, `${tag} risk`);
  await body(page).locator('textarea').nth(0).fill('Back-to-back calls run over and the proposal slips.');
  await body(page).locator('textarea').nth(1).fill('Block 11:00 to 12:00 and move the 11:30 call.');
  await next(page);

  // 8. The summary
  pass(`${tag}: the summary greets by first name`, /^Here’s your day, \S+\.$/.test(await heading(page)), await heading(page));
  await checkScreen(page, `${tag} summary`, { eye: false });
  await shot(page, `${tag}-8-summary`);
  const summary = await page.locator('.ds-guide-summary').innerText();
  for (const words of ['7.5 hours, good', 'Breakfast with my daughter before school.', 'Decisive', '1. Draft the Harbour case study', 'Highest priority', NIGHT, 'Training sessions', 'Grow through referrals', 'If it happens, block 11:00 to 12:00']) {
    pass(`${tag}: the summary shows "${words}"`, summary.includes(words));
  }
  const tagColour = await page.locator('.day-tag').evaluate((el) => getComputedStyle(el).color);
  pass(`${tag}: Highest priority is never coral`, !CORAL.includes(tagColour), tagColour);
  if (deep) {
    const v = sprintPageView(await rowsNow(), { today });
    const shown = (await page.locator('.day-score .ds-stat-value').textContent()).trim();
    pass(`${tag}: the summary's score is the sprint's (src/lib/scores)`, shown === `${v.soFar.value}%`, `${shown} vs ${v.soFar.value}%`);
    const good = await page.locator('.day-score .ds-stat-value').evaluate((el) => el.classList.contains('ds-stat-value--good'));
    pass(`${tag}: the score is mint only at or above the standard`, good === v.soFar.good);
  }
  // Set my day: tapped until it goes (a tap in the first moment after a move is ignored on purpose).
  const gone = await until(async () => {
    if (/performance-sprint/.test(page.url())) return true;
    await page.getByRole('button', { name: 'Set my day' }).click({ timeout: 2000 }).catch(() => null);
    return /performance-sprint/.test(page.url()) || page.waitForURL(/performance-sprint/, { timeout: 1500 }).then(() => true, () => false);
  }, 15000);
  if (!gone) throw new Error('Set my day did not go back');
  const set = await until(async () => (await page.getByText('Your day is set, and your to-dos are in this week’s sprint.').count()) > 0, 8000);
  pass(`${tag}: Set my day says so and goes back`, Boolean(set));
  const row = await until(async () => {
    const r = (await db.from('day_plans').select('*').eq('user_id', me).eq('local_date', today)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass(`${tag}: the day is saved as set`, Boolean(row?.finished_at));
  return row;
}

const sizes = [[1280, 'dark'], [1280, 'light'], [700, 'dark'], [700, 'light'], [390, 'dark'], [390, 'light'], [360, 'dark'], [360, 'light']];
for (const [width, mode] of sizes) {
  await cleanToday();
  const tag = `${width}px ${mode}`;
  const deep = width === 1280 && mode === 'dark';
  const { context, page } = await signedIn({ width, mode });
  try {
    const row = await playThrough(page, tag, { deep });
    if (deep) {
      pass('saved: sleep, gratitude, way of being and risk', Number(row.sleep_hours) === 7.5 && row.sleep_quality === 'good' && row.grateful_for === 'Breakfast with my daughter before school.'
        && row.way_of_being === 'Decisive' && row.biggest_risk.startsWith('Back-to-back') && row.risk_response.startsWith('Block 11:00'), JSON.stringify(row));
      const todos = (await db.from('todos').select('*').eq('user_id', me).in('source', ['review_my_day', 'plan_my_day'])).data;
      const night = todos.find((t) => t.text === NIGHT);
      const added = todos.find((t) => t.text === PANEL_TODO);
      pass('last night\'s thing became a sprint to-do when chosen', night?.source === 'review_my_day' && night.source_id === reviewId && night.sprint_id === sprint.id && night.planned_week === 4, JSON.stringify(night));
      pass('the panel\'s to-do is in this week of the sprint, from this plan', added?.source === 'plan_my_day' && added.source_id === row.id && added.sprint_id === sprint.id && added.planned_week === 4, JSON.stringify(added));
      const dpt = (await db.from('day_plan_todos').select('todo_id, is_top').eq('day_plan_id', row.id)).data;
      const draft = (await db.from('todos').select('id').eq('user_id', me).eq('text', 'Draft the Harbour case study')).data[0];
      pass('the day holds two to-dos (the habit stays on the device)', dpt.length === 2 && dpt.some((t) => t.todo_id === night?.id), JSON.stringify(dpt));
      pass('the highest priority is marked', dpt.filter((t) => t.is_top).length === 1 && dpt.find((t) => t.is_top).todo_id === draft.id, JSON.stringify(dpt));
      const dps = (await db.from('day_plan_strategies').select('strategy_id').eq('day_plan_id', row.id)).data;
      pass('two Strategies of the day', dps.length === 2);
      const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('day-plan-local')).map((k) => localStorage.getItem(k)).join(''));
      pass('the habit chosen for the day is kept on the device', kept.includes('"habits":[') && !kept.includes('"habits":[]'), kept.slice(0, 120));

      // The sprint page: the to-dos show and its score moved, as src/lib/scores says.
      await page.waitForSelector('.ds-sdial-big--score', { timeout: 30000 });
      const list = await until(async () => {
        const t = await page.locator('.ds-todos').first().innerText();
        return t.includes(NIGHT) && t.includes(PANEL_TODO) ? t : null;
      }, 15000);
      pass('the sprint page lists the day\'s new to-dos', Boolean(list));
      const v = sprintPageView(await rowsNow(), { today });
      const centre = (await page.locator('.ds-sdial-big--score').textContent()).trim();
      pass('the sprint\'s score matches src/lib/scores', centre === `${v.soFar.value}%`, `${centre} vs ${v.soFar.value}%`);
      pass('an open to-do doesn\'t count until done (M5 so far)', v.soFar.value === scoreBefore.value, `${scoreBefore.value} then ${v.soFar.value}`);
      // Ticked on the sprint page, the day's to-do changes the score, as src/lib/scores says.
      await page.getByRole('checkbox', { name: NIGHT }).click();
      const ticked = await until(async () => (await db.from('todos').select('done_on').eq('id', night.id)).data?.[0]?.done_on === today, 10000);
      pass('ticked on the sprint page, the day\'s to-do is done today', Boolean(ticked));
      const after = sprintPageView(await rowsNow(), { today });
      const centre2 = await until(async () => {
        const t = (await page.locator('.ds-sdial-big--score').textContent()).trim();
        return t === `${after.soFar.value}%` ? t : null;
      }, 8000);
      pass('the sprint\'s score changed with the day\'s to-do, matching src/lib/scores', Boolean(centre2) && after.soFar.value !== scoreBefore.value, `${scoreBefore.value} then ${after.soFar.value}, page ${centre2}`);

      // A set plan opens on its summary, still changeable.
      await openPlan(page);
      pass('a set plan opens on its summary', /^Here’s your day/.test(await heading(page)), await heading(page));
      pass('its answers can still be changed', (await page.getByRole('button', { name: 'Change Gratitude' }).count()) === 1);
    }
  } catch (e) {
    pass(`${tag}: the play-through finished`, false, e.message);
    await shot(page, `${tag}-error`);
  }
  await context.close();
}

await browser.close();
await cleanToday();
await db.from('day_reviews').delete().eq('user_id', me);
await db.from('day_plans').delete().eq('user_id', me);
seedForReal('--reset');

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
