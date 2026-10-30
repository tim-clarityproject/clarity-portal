// Phase 3 step 3 checks in the running app: the Weekly performance
// debrief (mock-up M1), signed in as the invented test client on the TEST
// database only (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/debrief.mjs [folder for screenshots]
//
// The seed is built around one fixed day and every browser's clock starts
// on it (tests/phase2/fixed-day.mjs): Wed 21 Oct 2026 by default, the last
// day of week 3's debrief window (week 3 is Mon 12 to Sun 18 Oct). Weeks 1
// and 2 are marked debriefed first, so the streak has something to count.
//
// A full play-through from the first screen to Finish my debrief at
// 1280px, 700px, 390px and 360px, in dark and light. On every screen: one
// coral button, 44px tap areas, no sideways scroll, the writing rules and
// the eye; each habit's % mint at or above the standard and grey below,
// never coral. At 1280px dark, with a coach (my_coach answered by the
// test, as the test client has none), the saved rows are checked too: the
// debrief's answers and stress, the habit log typed, the objective figures
// (objective_figures) and the milestone, the to-do added for next week (in
// the sprint), the score finalised in week_scores and matching
// src/lib/scores, the streak, sharing on and off (and what the shared row
// holds; stress stays "Only you"), and a refresh mid-step restoring the
// draft. Then the window: closed before the last 3 days, open on each day
// it should be, open on its last day, closed the day after; and a missed
// week resetting the streak. The seed is put back on the real today at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel, londonInstant } from '../phase2/fixed-day.mjs';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';
import { m0Round, m0AtStandard } from '../../src/lib/scores/index.js';

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
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const WEEK = 3;
const weekStart = dayKey(14, sprint.start_on);
const weekEnd = dayKey(20, sprint.start_on);
if (!(today > weekEnd && today <= dayKey(3, weekEnd))) throw new Error(`The fixed day ${today} must be inside week 3's window (it ends ${weekEnd}); use a Monday to Wednesday.`);
const SAT = dayKey(5, weekStart);
const WIN = 'Ran a workshop that led to two referrals';
const TODO = 'Send the Harbour proposal';
const ANSWERS = { well: 'Two referral calls landed and the Harbour proposal is close.', way: 'Late finishes on Tuesday and Thursday.', adjust: 'Stop work by 18:30 on weekdays.' };
const strategies = (await db.from('plan_strategies').select('id, name').eq('plan_id', sprint.plan_id).is('archived_at', null)).data;
const sid = (name) => strategies.find((s) => s.name === name).id;
const objectives = (await db.from('outcome_objectives').select('id, name, kind').eq('plan_id', sprint.plan_id).is('archived_at', null)).data;
const oid = (name) => objectives.find((o) => o.name === name).id;
const sprintHabits = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data;
const hid = (name) => sprintHabits.find((h) => h.name === name).id;
const focusBefore = (await db.from('habit_logs').select('value').eq('sprint_habit_id', hid('Focus')).eq('local_date', SAT)).data?.[0]?.value ?? null;

// Weeks 1 and 2 debriefed, as if done in their windows.
async function earlierDebriefs(weeks = [1, 2]) {
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  if (weeks.length) {
    await db.from('weekly_debriefs').insert(weeks.map((w) => ({ user_id: me, sprint_id: sprint.id, sprint_week: w, status: 'finished', finished_at: `${dayKey(7 * w + 1, sprint.start_on)}T18:00:00Z` })));
  }
}
async function cleanRun() {
  await earlierDebriefs();
  await db.from('objective_figures').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  await db.from('todos').delete().eq('user_id', me).eq('source', 'debrief');
  await db.from('wins').delete().eq('user_id', me).eq('what', WIN);
  await db.from('outcome_objectives').update({ reached_on: null }).eq('id', oid('Publish my coaching book'));
  await db.from('habit_logs').delete().eq('sprint_habit_id', hid('Focus')).eq('local_date', SAT);
  if (focusBefore != null) await db.from('habit_logs').insert({ user_id: me, sprint_habit_id: hid('Focus'), local_date: SAT, value: focusBefore });
  await db.from('day_reviews').delete().eq('user_id', me);
}

async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const [objs, strategyRows, links, shs, weekScores, recoveries, workingPatterns] = await Promise.all([
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
  return { plan: { id: sprint.plan_id }, sprint, objectives: objs, strategies: strategyRows, links, sprintHabits: shs, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)'];
const COACH = 'Alex';

async function signedIn({ width, mode, clock, coach = false }) {
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
  if (coach) {
    // The test client has no coach on the test database: my_coach answers
    // with an invented one, so the share switch shows. Nothing is written.
    await context.route('**/rest/v1/rpc/my_coach*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ coach_id: '00000000-0000-4000-8000-00000000c0ac', first_name: COACH, mobile: null, contact_ways: [], away_until: null }]),
    }));
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
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

async function next(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    const moved = await until(async () => (await heading(page)) !== before, 1200);
    if (moved) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
async function back(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-back').click();
    const moved = await until(async () => (await heading(page)) !== before, 1200);
    if (moved) return;
  }
  throw new Error(`Back didn't move on from "${before}"`);
}

async function open(page, path) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
}

// One screen: one coral button, 44px tap areas, no sideways scroll, the writing rules, the eye.
async function checkScreen(page, tag, { eye = 'Only you' } = {}) {
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
        // A tap area made bigger than the look by an absolute ::before or ::after (the switch, the segmented pills).
        const extra = ['::before', '::after'].map((p) => getComputedStyle(el, p)).filter((a) => a.content !== 'none' && a.position === 'absolute');
        const grow = (side) => Math.max(0, ...extra.map((a) => -parseFloat(a[side]) || 0));
        // A day box's tap area is its whole labelled box (the day's name and the field).
        const label = el.closest('label.ds-logweek-box');
        const lr = label ? label.getBoundingClientRect() : r;
        return { w: Math.round(Math.max(r.width, lr.width) + grow('left') + grow('right')), h: Math.round(Math.max(r.height, lr.height) + grow('top') + grow('bottom')), what: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) };
      })
      .filter((b) => b.w < 44 || b.h < 44);
    const page = root.querySelector('.ds-guide-page');
    const lines = [...page.querySelectorAll('.ds-guide-question, .ds-guide-nudge, .day-quiet p, .day-quiet-line, .deb-carry p, .ds-stat-note, .ds-switchrow-note, .ds-section-line')]
      .filter(shown).map((el) => el.textContent.trim());
    const copy = page.cloneNode(true);
    copy.querySelectorAll('.ds-sr, .ds-todo-text, .ds-expand-summary, .deb-day, textarea, input').forEach((el) => el.remove());
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
  pass(`${tag}: no banned words`, !/\bmissed\b|\bfail(ed)?\b|\bstep \d+ of\b|\babout \d+ minutes?\b|\btap\b|\bclick\b|\bpurpose\b|…|\bhrs?\b|\bwks\b/i.test(facts.text), facts.text.slice(0, 80));
  const bad = facts.lines.filter((l) => !/[.?!]$/.test(l));
  pass(`${tag}: every sentence ends with a full stop or a question mark`, bad.length === 0, bad.join(' | '));
  if (eye) pass(`${tag}: the eye says ${eye}`, facts.eye.length > 0 && facts.eye.every((e) => e.endsWith(eye)), JSON.stringify(facts.eye));
}

// The streak's figure and its unit, as read: "3 weeks".
const streakShown = (page) => page.locator('.ds-stat', { hasText: 'Debrief streak' }).locator('.ds-stat-value')
  .evaluate((el) => `${el.firstChild.textContent.trim()} ${el.querySelector('.ds-unit')?.textContent.trim()}`);

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); };

// Each habit's %: mint at or above the standard, grey below, never coral.
async function checkHabitColours(page, tag) {
  const cols = await page.evaluate(() => {
    const rgb = (v) => getComputedStyle(document.querySelector('.ds-guide')).getPropertyValue(v).trim();
    const probe = document.createElement('span');
    document.querySelector('.ds-guide').appendChild(probe);
    const resolve = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
    const good = resolve('--good');
    const grey = resolve('--text-2');
    probe.remove();
    return {
      good,
      grey,
      rows: [...document.querySelectorAll('.ds-logweek-total strong')].map((s) => ({ text: s.textContent.trim(), cls: s.className, color: getComputedStyle(s).color })),
      unused: rgb('--good'),
    };
  });
  const bad = cols.rows.filter((r) => {
    if (r.cls.includes('--good')) return r.color !== cols.good;
    if (r.cls.includes('--below')) return r.color !== cols.grey;
    return r.text !== 'Not logged';
  });
  pass(`${tag}: each habit's % is mint at or above the standard and grey below`, cols.rows.length > 5 && bad.length === 0, JSON.stringify(bad));
  pass(`${tag}: habits at the standard are mint`, cols.rows.some((r) => r.cls.includes('--good') && r.color === cols.good));
  pass(`${tag}: no habit % is coral`, cols.rows.every((r) => !CORAL.includes(r.color)));
}

// The whole tool, first screen to Finish my debrief.
async function playThrough(page, tag, { deep = false } = {}) {
  await open(page, '/performance-sprint/debrief');
  // 1. Numbers
  pass(`${tag}: opens on week 3 with ~5 minutes`, (await heading(page)) === `How did week ${WEEK} go?` && (await page.locator('.ds-guide-label').first().textContent()).trim() === '~5 minutes', await heading(page));
  pass(`${tag}: the % complete bar, never a step count`, await page.locator('.ds-guide-pct').isVisible());
  pass(`${tag}: rule 5 over M1: no "missed"`, (await page.locator('.ds-guide-nudge').allInnerTexts()).includes('Fill in any day you didn’t log, or leave it empty.'));
  pass(`${tag}: grouped by Strategy`, (await page.locator('.deb-group-name').allInnerTexts()).join('|').startsWith('Maintain my availability to do good work'));
  pass(`${tag}: every day of the finished week is open, a day not logged is dashed`, (await page.locator('.ds-logweek-box input:disabled').count()) === 0 && (await page.locator('.ds-logweek-box--empty').count()) > 0);
  await checkHabitColours(page, tag);
  if (deep) {
    // Sharing is off until switched on (decisions: private by default).
    await checkScreen(page, `${tag} numbers`, { eye: 'Only you' });
  } else {
    await checkScreen(page, `${tag} numbers`);
  }
  const focus = page.getByRole('textbox', { name: `Focus, Saturday ${Number(SAT.slice(8))} Oct` });
  await focus.fill('4');
  await focus.blur();
  pass(`${tag}: a day filled in loses its dashed edge`, !(await focus.locator('xpath=..').getAttribute('class')).includes('--empty'));
  await shot(page, `${tag}-1-numbers`);
  await next(page);

  // 2. Stress
  pass(`${tag}: Stress, the agreed question`, (await heading(page)) === 'This past week, how much did you feel tense, restless, nervous or anxious?', await heading(page));
  await checkScreen(page, `${tag} stress`);
  await page.getByRole('radio', { name: 'A little', exact: true }).click();
  await shot(page, `${tag}-2-stress`);
  await next(page);

  // 3. Objectives
  pass(`${tag}: Objectives`, (await heading(page)) === 'Where are your Outcome Objectives now?');
  await checkScreen(page, `${tag} objectives`, { eye: deep ? 'Only you' : 'Only you' });
  const clients = page.getByRole('textbox', { name: 'Coaching clients now' });
  pass(`${tag}: the box starts on last week's figure`, (await clients.inputValue()) === '31', await clients.inputValue());
  pass(`${tag}: "Last week 31"`, (await page.locator('.ds-objfig', { hasText: 'Coaching clients' }).innerText()).includes('Last week 31'));
  await clients.fill('33');
  const change = await until(async () => (await page.locator('.ds-objfig', { hasText: 'Coaching clients' }).locator('.ds-objfig-change--good').count()) === 1, 4000);
  pass(`${tag}: the change at a glance, mint`, Boolean(change) && (await page.locator('.ds-objfig', { hasText: 'Coaching clients' }).locator('.ds-objfig-change').innerText()) === '+2');
  await page.getByRole('textbox', { name: 'How world-class is my coaching? now' }).fill('8');
  if (deep) {
    await page.locator('.ds-objfig', { hasText: 'Publish my coaching book' }).getByRole('button', { name: 'Mark as done' }).click();
    pass(`${tag}: a milestone marked as reached says so`, Boolean(await until(async () => (await page.getByText('Publish my coaching book is marked as reached.').count()) > 0, 6000)));
  }
  await shot(page, `${tag}-3-objectives`);
  await next(page);

  // 4. Went well
  pass(`${tag}: Went well`, (await heading(page)) === 'What went well this week?');
  if (deep) {
    pass(`${tag}: Your days folds the week's Review my day entries`, (await page.getByText('1 Review my day entry this week').count()) === 1);
    await page.locator('.deb-days .ds-collapse-summary, .deb-days button').first().click();
    await page.getByRole('button', { name: /Wed 14 Oct/ }).click();
    pass(`${tag}: a day opens to its answers`, Boolean(await until(async () => (await page.locator('.deb-day').first().innerText()).includes('Grow through referrals, High'), 4000)));
  }
  await body(page).locator('textarea').last().fill(ANSWERS.well);
  await checkScreen(page, `${tag} went well`);
  await shot(page, `${tag}-4-well`);
  await next(page);

  // 5. In the way, with a refresh mid-step
  pass(`${tag}: In the way`, (await heading(page)) === 'What got in the way?');
  await checkScreen(page, `${tag} in the way`);
  await body(page).locator('textarea').first().fill(ANSWERS.way);
  if (deep) {
    await page.reload();
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    pass(`${tag}: a refresh mid-step stays on the step`, (await heading(page)) === 'What got in the way?', await heading(page));
    const kept = await until(async () => (await body(page).locator('textarea').first().inputValue()) === ANSWERS.way, 8000);
    pass(`${tag}: a refresh mid-step restores the draft`, Boolean(kept), await body(page).locator('textarea').first().inputValue());
  }
  await next(page);

  // 6. Adjust
  pass(`${tag}: Adjust`, (await heading(page)) === 'What will you adjust next week?');
  await body(page).locator('textarea').first().fill(ANSWERS.adjust);
  await checkScreen(page, `${tag} adjust`);
  await next(page);

  // 7. Next week, with a to-do added
  pass(`${tag}: Next week`, (await heading(page)) === 'What’s planned for next week?');
  const rolled = page.locator('.ds-todo', { hasText: 'Book a physio assessment' });
  pass(`${tag}: an open to-do rolls over`, (await rolled.count()) === 1 && (await rolled.innerText()).includes('Rolls over from week 3'));
  pass(`${tag}: next week's to-dos aren't ticked here`, (await page.locator('.ds-todos [role=checkbox]').count()) === 0);
  await checkScreen(page, `${tag} next week`);
  await page.getByRole('button', { name: 'Add a to-do' }).click();
  const panel = page.getByRole('dialog', { name: 'Add a to-do' });
  await panel.locator('textarea').first().waitFor();
  await panel.locator('textarea').first().fill(TODO);
  await panel.getByRole('radio', { name: 'Grow through referrals' }).click();
  await panel.getByRole('button', { name: 'Add my to-do' }).click();
  pass(`${tag}: the to-do is added to week 4`, Boolean(await until(async () => (await page.getByText('Added to week 4.').count()) > 0, 8000)));
  pass(`${tag}: it shows in next week's list`, (await page.locator('.ds-todo', { hasText: TODO }).count()) === 1);
  await shot(page, `${tag}-7-next`);
  await next(page);

  // 8. The summary
  const h = await heading(page);
  pass(`${tag}: the summary greets by first name`, /^(Here’s your week, \S+\.|Great week, \S+! You smashed your standard\.)$/.test(h), h);
  pass(`${tag}: the streak counts this one`, (await page.locator('.ds-stat', { hasText: 'Debrief streak' }).innerText()).includes('You’ve debriefed 3 weeks in a row, including this one.'));
  await checkScreen(page, `${tag} summary`, { eye: null });
  if (deep) {
    const v = sprintPageView(await rowsNow(), { today });
    const raw = v.weeks[WEEK - 1].raw;
    const shown = (await page.locator('.ds-stat', { hasText: 'performance score' }).locator('.ds-stat-value').textContent()).trim();
    pass('the summary\'s score is src/lib/scores\'', shown === `${m0Round(raw)}%`, `${shown} vs ${m0Round(raw)}%`);
    const good = await page.locator('.ds-stat', { hasText: 'performance score' }).locator('.ds-stat-value').evaluate((el) => el.classList.contains('ds-stat-value--good'));
    pass('the score is mint only at or above the standard', good === m0AtStandard(raw, sprint.standard));
    pass('the heading follows the standard', (h.startsWith('Great week')) === m0AtStandard(raw, sprint.standard), h);
    // Share with [coach]: off to start; on, then off, then on, each saved at once.
    const sw = page.getByRole('switch', { name: `Share with ${COACH}` });
    pass('Share with the coach starts off', (await sw.getAttribute('aria-checked')) === 'false');
    pass('off, it says only you can see it', (await page.locator('.ds-switchrow-note').innerText()) === 'Only you can see this debrief.');
    const sharedNow = async (want) => until(async () => (await db.from('weekly_debriefs').select('shared_with_coach').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data?.[0]?.shared_with_coach === want, 8000);
    await sw.click();
    pass('switched on: saved at once', Boolean(await sharedNow(true)));
    pass('on, it says what the coach will see', (await page.locator('.ds-switchrow-note').innerText()) === `${COACH} will see this week’s scores, your objective figures and your three answers.`);
    await back(page);
    await back(page);
    await checkScreen(page, `${tag} adjust, shared`, { eye: `You and ${COACH}` });
    for (let i = 0; i < 3; i += 1) await back(page);
    await checkScreen(page, `${tag} objectives, shared`, { eye: `You and ${COACH}` });
    await back(page);
    pass('shared: Stress is still the stress question', (await heading(page)).startsWith('This past week'));
    await checkScreen(page, `${tag} stress, shared`, { eye: 'Only you' });
    await back(page);
    await checkScreen(page, `${tag} numbers, shared`, { eye: `You and ${COACH}` });
    for (let i = 0; i < 7; i += 1) await next(page);
    await sw.click();
    pass('switched off: saved at once', Boolean(await sharedNow(false)));
    await sw.click();
    pass('switched on again', Boolean(await sharedNow(true)));
    await shot(page, `${tag}-8-summary`);
  }
  const gone = await until(async () => {
    if (/performance-sprint$/.test(new URL(page.url()).pathname)) return true;
    await page.getByRole('button', { name: 'Finish my debrief' }).click({ timeout: 2000 }).catch(() => null);
    return page.waitForURL((u) => u.pathname === '/performance-sprint', { timeout: 1500 }).then(() => true, () => false);
  }, 15000);
  if (!gone) throw new Error('Finish my debrief did not go back');
  const toastRe = deep ? new RegExp(`^Week 3 debriefed at \\d+%\\. Shared with ${COACH}\\.$`) : /^Week 3 debriefed at \d+%\.$/;
  pass(`${tag}: Finish my debrief says so and goes back`, Boolean(await until(async () => (await page.getByText(toastRe).count()) > 0, 8000)));
  const row = await until(async () => {
    const r = (await db.from('weekly_debriefs').select('*').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass(`${tag}: the debrief is saved as finished`, Boolean(row?.finished_at));
  pass(`${tag}: the sprint page's debrief line goes once it's done`, Boolean(await until(async () => (await page.getByText('Your weekly debrief is ready.').count()) === 0 && (await page.locator('.ds-sdial, .sprint-hero').count()) > 0, 10000)));
  return row;
}

const sizes = [[1280, 'dark'], [1280, 'light'], [700, 'dark'], [700, 'light'], [390, 'dark'], [390, 'light'], [360, 'dark'], [360, 'light']];
const only = process.env.SIZES ? process.env.SIZES.split(',') : null;
for (const [width, mode] of sizes.filter(([w, m]) => !only || only.includes(`${w}-${m}`))) {
  await cleanRun();
  const tag = `${width}px ${mode}`;
  const deep = width === 1280 && mode === 'dark';
  if (deep) {
    // One Review my day entry in week 3, for "Your days".
    const r = (await db.from('day_reviews').insert({ user_id: me, local_date: dayKey(2, weekStart), went_well: 'The Harbour call landed.', differently: 'Leave ten minutes between calls.', status: 'finished', finished_at: `${dayKey(2, weekStart)}T20:00:00Z` }).select('id').single()).data;
    await db.from('day_review_strategies').insert({ day_review_id: r.id, strategy_id: sid('Grow through referrals'), level: 3, user_id: me });
  }
  const { context, page } = await signedIn({ width, mode, coach: deep });
  try {
    if (deep) {
      // The sprint page offers the debrief while its window is open (M1 "Start my debrief").
      await page.goto(`${APP}/performance-sprint`);
      pass('the sprint page says the weekly debrief is ready', Boolean(await until(async () => (await page.getByText('Your weekly debrief is ready.').count()) === 1, 20000)));
      await page.getByRole('button', { name: 'Start my debrief' }).click();
      await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
      pass('Start my debrief opens the debrief', (await heading(page)) === `How did week ${WEEK} go?`);
    }
    const row = await playThrough(page, tag, { deep });
    if (deep) {
      pass('saved: stress and the three answers', row.stress === 'a_little' && row.went_well === ANSWERS.well && row.got_in_way === ANSWERS.way && row.adjust === ANSWERS.adjust, JSON.stringify(row));
      // What the shared row holds (Phase 6a reads it through a checked read that leaves stress out).
      pass('shared: the row is marked shared, by the person\'s choice', row.shared_with_coach === true);
      pass('the habit log typed in the debrief is in the sprint', Number((await db.from('habit_logs').select('value').eq('sprint_habit_id', hid('Focus')).eq('local_date', SAT)).data?.[0]?.value) === 4);
      const figs = (await db.from('objective_figures').select('objective_id, value, recorded_on, sprint_id, sprint_week').eq('user_id', me).eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data;
      const fig = (name) => figs.find((f) => f.objective_id === oid(name));
      pass('objective figures saved for the week, on its last day (M9)', figs.length === 2 && Number(fig('Coaching clients')?.value) === 33 && Number(fig('How world-class is my coaching?')?.value) === 8 && figs.every((f) => f.recorded_on === weekEnd), JSON.stringify(figs));
      const reached = (await db.from('outcome_objectives').select('reached_on').eq('id', oid('Publish my coaching book'))).data?.[0]?.reached_on;
      pass('the milestone is reached on the week\'s last day', reached === weekEnd, reached);
      const todo = (await db.from('todos').select('sprint_id, planned_week, source, source_id, strategy_id, created_on').eq('user_id', me).eq('text', TODO)).data;
      pass('next week\'s to-do is in the sprint, week 4, from the debrief', todo.length === 1 && todo[0].sprint_id === sprint.id && todo[0].planned_week === 4 && todo[0].source === 'debrief' && todo[0].source_id === row.id && todo[0].strategy_id === sid('Grow through referrals'), JSON.stringify(todo));
      // The score finalised in week_scores, matching src/lib/scores.
      const ws = await until(async () => (await db.from('week_scores').select('score, final, frozen_at').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data?.[0], 10000);
      const v = sprintPageView(await rowsNow(), { today });
      const raw = v.weeks[WEEK - 1].raw;
      pass('the week\'s score is finalised in week_scores', ws?.final === true, JSON.stringify(ws));
      pass('week_scores matches src/lib/scores', ws && Math.abs(Number(ws.score) - raw) < 0.01, `${ws?.score} vs ${raw}`);
      pass('the frozen score includes the log typed in the debrief', ws && new Date(ws.frozen_at) > new Date(row.finished_at) - 60000, JSON.stringify(ws));
      // A finished debrief opens on its summary, still changeable.
      await open(page, '/performance-sprint/debrief');
      pass('a finished debrief opens on its summary', /^(Here’s your week|Great week)/.test(await heading(page)), await heading(page));
      pass('the streak shows 3 weeks', (await streakShown(page)) === '3 weeks', await streakShown(page));
      // Sharing off: the row says so.
      await page.getByRole('switch', { name: `Share with ${COACH}` }).click();
      const off = await until(async () => (await db.from('weekly_debriefs').select('shared_with_coach').eq('id', row.id)).data?.[0]?.shared_with_coach === false, 8000);
      pass('sharing switched off afterwards is saved', Boolean(off));
    }
  } catch (e) {
    pass(`${tag}: the play-through finished`, false, e.message);
    await shot(page, `${tag}-error`);
  }
  await context.close();
}

// ---------------------------------------------------------------- the window
// Closed before the last 3 days, open on each day it should be, open on its
// last day, closed the day after (M0.4, audit 2.4).
await cleanRun();
const windowDays = [
  [dayKey(3, weekStart), 'closed'],   // Thursday of week 3
  [dayKey(4, weekStart), 'open'],     // Friday: the last 3 days start
  [dayKey(6, weekStart), 'open'],     // Sunday: the week's last day
  [dayKey(7, weekStart), 'open'],     // Monday after
  [dayKey(9, weekStart), 'open'],     // Wednesday: its last day
  [dayKey(10, weekStart), 'after'],   // Thursday: closed the day after
];
for (const [day, want] of windowDays) {
  const w = await signedIn({ width: 390, mode: 'dark', clock: londonInstant(day, '12:30') });
  try {
    await w.page.goto(`${APP}/performance-sprint/debrief`);
    await w.page.waitForSelector('.ds-guide-question, .deb-closed', { timeout: 30000 });
    if (want === 'open') {
      pass(`window on ${day}: open on week 3`, (await heading(w.page)) === `How did week ${WEEK} go?`, await w.page.locator('body').innerText().then((t) => t.slice(0, 80)));
    } else {
      const words = await w.page.locator('.deb-closed').innerText();
      pass(`window on ${day}: closed, and it says when the next opens`, words.includes('No debrief is open today.') && words.includes('Your next debrief opens on'), words);
      pass(`window on ${day}: nothing to fill in`, (await w.page.locator('.ds-guide-question').count()) === 0);
    }
    if (want === 'after') {
      await w.page.goto(`${APP}/performance-sprint/debrief/${sprint.id}/${WEEK}`);
      await w.page.waitForSelector('.deb-closed', { timeout: 30000 });
      const words = await w.page.locator('.deb-closed').innerText();
      pass(`window on ${day}: week 3's own page says it closed, with its score`, words.includes(`The debrief for week 3 closed on Wed ${Number(dayKey(9, weekStart).slice(8))} Oct.`) && (await w.page.locator('.deb-closed-score .ds-stat-value').count()) === 1, words);
      await shot(w.page, 'window-closed');
    }
  } catch (e) {
    pass(`window on ${day}`, false, e.message);
  }
  await w.context.close();
}

// ---------------------------------------------------------------- a missed week
// Week 2 not debriefed and its window closed: the streak starts again, quietly.
await earlierDebriefs([1]);
await db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: WEEK, status: 'finished', finished_at: `${today}T09:00:00Z` });
{
  const m = await signedIn({ width: 390, mode: 'light' });
  try {
    await open(m.page, `/performance-sprint/debrief/${sprint.id}/${WEEK}`);
    const streak = await streakShown(m.page);
    const line = await m.page.locator('.ds-stat', { hasText: 'Debrief streak' }).locator('.ds-stat-note').innerText();
    pass('a missed week resets the streak to this one', streak === '1 week' && line === 'This week starts your streak.', `${streak} ${line}`);
    pass('a missed week says nothing about it', !/miss|broke|lost|reset/i.test(await m.page.locator('.ds-guide').innerText()));
    await shot(m.page, 'missed-week');
  } catch (e) {
    pass('a missed week', false, e.message);
  }
  await m.context.close();
}

await browser.close();
await cleanRun();
await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
seedForReal('--reset');

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
