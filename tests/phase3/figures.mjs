// Phase 3 step 5: the figures on the Phase 3 screens against the worked
// examples in docs/scoring-methods.md, with invented data on the TEST
// database, signed in as the test client (every other host and every email
// call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/figures.mjs
//
// Every date is FIXED (tests/phase2/fixed-day.mjs): Wed 21 Oct 2026, 12:30
// London, so 3 of the 5 working days of the week are gone.
//
// 1. M5, the worked example M5-1 (seed --worked: week 1, Mon 12 to Sun 18
//    Oct, holds exactly M5-1's items; its debrief window is open until
//    today). The debrief's Numbers show each habit's M1 score (Referral
//    conversations 67% grey, Training sessions 100% mint, Late finishes 50%
//    grey, Reading 100% mint, capped); its summary shows week 1 at 68%, grey
//    (67.9%, below the standard of 85%); finishing it freezes 68 as final.
// 2. M5 "This week so far" (week 2): invented logs and to-dos worked by
//    hand with the method's two changes (habit targets pro rata to the
//    working days gone, 3 of 5; to-dos counted only once done; nothing
//    after today counted):
//      Grow through referrals: referrals 2 against 3 × 3/5 = 1.8, capped
//        100 (impact 3); a to-do done today 100 (impact 2) = 100
//      Sustain my energy: training 1 against 1.8 = 55.6 (impact 3); late
//        finishes on 1 day against a limit of 2 = 100 (impact 2) = 73.3
//      Deepen my coaching craft: reading 30 against 100 × 3/5 = 60, 50
//        (impact 1); its open to-do isn't counted yet = 50
//      Week: (2 × 100 + 1 × 73.3 + 1 × 50) ÷ 4 = 80.8, shown as 81%, grey.
//    Then a second training session on Tuesday: Sustain 100, the week
//    (200 + 100 + 50) ÷ 4 = 87.5, shown as 88% (halves round up), mint.
//    Each time: src/lib/scores on the database rows, Plan my day's and
//    Review my day's summaries and the sprint page all agree.
// 3. M11: the debrief streak (seed --reset, week 3's window open): weeks 1
//    and 2 done = 3 including this one; week 2 missed = 1 ("This week
//    starts your streak."); week 1 missed = 2. Logging: week 1 of M5-1 has
//    a log on all 5 working days; week 2 on 4 of 5 ("You logged on 4 of
//    your 5 working days this week."). Kept up: Training sessions in 1 of
//    1 finished weeks, Referral conversations in 0 of 1.
// 4. M12: nights of 7, 6.5, 7.5 and 20 hours saved by the client: the
//    database asks about the 20 once (sleep_to_confirm, and Plan my day asks
//    "Is 20 hours right?"), so the average is 7.0 over 3 nights, 2 of them
//    green; quality Poor, Good, Fair is a three-way tie, so Fair (not
//    green); ways of being 6, 7, 7 average 7, green; the debrief's stress
//    "A little", chosen in the app, is green.
// Ends with the usual seeded plan and running sprint on the real today.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';
import { sprintPageView, sprintWeekResult, sprintWeekSoFar } from '../../src/lib/performance/index.js';
import {
  m0Round, m0AtStandard, m11DebriefStreak, m11HabitKeptUp, m11LoggedWorkingDays,
  m12SleepHours, m12SleepQuality, m12WayOfBeing, m12StressGreen, m1HabitScore,
} from '../../src/lib/scores/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
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
console.log(`Fixed day: ${fixedLabel()}`);
const today = FIXED_TODAY;
if (today !== '2026-10-21') throw new Error('The hand-worked figures are for Wed 21 Oct 2026 (3 of 5 working days gone).');
const dayKey = (n, from = today) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const near = (a, b, e = 0.06) => a != null && Math.abs(a - b) < e;
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => { setTimeout(r, 300); });
  }
  return null;
};
const check = async (what, p) => {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

let sprint = null;
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
const loadSprint = async () => { sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')).data[0]; };
const habitId = async (name) => (await db.from('sprint_habits').select('id').eq('sprint_id', sprint.id).eq('name', name)).data[0].id;
const strategyId = async (name) => (await db.from('plan_strategies').select('id').eq('user_id', me).eq('name', name).is('archived_at', null)).data[0].id;

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
let context;
let page;
async function signIn2() {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await fixClock(context);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_REF)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
  page = await context.newPage();
  page.on('pageerror', (e) => pass('no page errors', false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
}
// A fresh device for each check, so no page shows an older device copy.
async function freshDevice() {
  if (context) await context.close();
  await signIn2();
}
const heading = async () => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()) || '').trim();
// Next, pressed again if the tool's double-tap guard swallowed it.
async function nextOnce() {
  const before = await heading();
  for (let i = 0; i < 8; i += 1) {
    await page.locator('.ds-guide-next').click();
    if (await until(async () => (await heading()) !== before, 1200)) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
async function toLastStep() {
  for (let n = 0; n < 12; n += 1) {
    const pct = Number(await page.locator('.ds-guide-pct').first().getAttribute('aria-valuenow'));
    if (pct >= 100) return;
    await nextOnce();
  }
}
// The colour tokens, resolved on the page, and a stat's figure with its colour.
const stat = (label) => page.locator('.ds-stat', { hasText: label }).first().evaluate((el) => {
  const v = el.querySelector('.ds-stat-value');
  const probe = document.createElement('span');
  el.appendChild(probe);
  const resolve = (x) => { probe.style.color = `var(${x})`; return getComputedStyle(probe).color; };
  const out = { text: v.textContent.replace(/\s+/g, ' ').trim(), good: v.classList.contains('ds-stat-value--good'), color: getComputedStyle(v).color, mint: resolve('--good'), coral: resolve('--coral') };
  probe.remove();
  return out;
});
const statOk = (s, shown, good) => s && s.text.startsWith(`${shown}%`) && s.good === good && (good ? s.color === s.mint : s.color !== s.mint) && s.color !== s.coral;

// ================================================================ 1. M5-1
console.log(seedFixed('--worked'));
await loadSprint();
const d1 = await rowsNow();
const v1 = sprintPageView(d1, { today });
const week1 = sprintWeekResult(d1, v1.calendar || { weeks: v1.weeks }, 1).result;
pass('M5-1 (src/lib on the rows): the week is 67.9%, shown as 68%, below the standard', near(week1.score, 67.92) && m0Round(week1.score) === 68 && !m0AtStandard(week1.score, 85), `${week1.score}`);
// Each habit's M1 score in week 1, by hand: referrals 2 of 3, training 3 of 3,
// late finishes 3 days against 2 (50), reading 120 of 100 minutes (capped).
const HAND1 = { 'Referral conversations': 67, 'Training sessions': 100, 'Late finishes': 50, Reading: 100 };

await freshDevice();
await page.goto(`${APP}/performance-sprint/debrief`);
await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
pass('debrief: week 1 is open on its last day (M0.4)', (await heading()) === 'How did week 1 go?', await heading());
const totals = await page.evaluate(() => [...document.querySelectorAll('.ds-logweek')].map((row) => {
  const s = row.querySelector('.ds-logweek-total strong');
  return { name: row.querySelector('.ds-log-name')?.textContent.trim(), text: s?.textContent.trim(), cls: s?.className || '' };
}));
for (const [name, pct] of Object.entries(HAND1)) {
  const row = totals.find((t) => t.name === name);
  const good = pct >= 85;
  pass(`debrief Numbers (M1): ${name} ${pct}%, ${good ? 'mint' : 'grey'}`, row && row.text.endsWith(`${pct}%`) && row.cls.includes(good ? '--good' : '--below'), JSON.stringify(row));
}
// Stress, chosen in the app (M12).
await nextOnce();
pass('debrief: the stress question comes second', (await heading()).startsWith('This past week'), await heading());
await page.getByRole('radio', { name: 'A little', exact: true }).click();
await toLastStep();
const s1 = await stat('Week 1 performance score');
pass('debrief summary (M5-1): week 1 is 68%, grey, never coral', statOk(s1, 68, false), JSON.stringify(s1));
const streak1 = await stat('Debrief streak');
pass('debrief summary (M11): a first debrief starts the streak, 1 week', streak1 && /^1\s*week$/.test(streak1.text) && (await page.getByText('This week starts your streak.').count()) === 1, JSON.stringify(streak1));
pass('M11 by hand: one week done = 1', m11DebriefStreak([{ debriefDone: true }]) === 1);
// Finish, pressed again if the double-tap guard swallowed it, until the
// tool closes and the debrief row says finished.
for (let i = 0; i < 6; i += 1) {
  await page.getByRole('button', { name: 'Finish my debrief' }).click({ timeout: 2000 }).catch(() => null);
  if (await until(async () => (await db.from('weekly_debriefs').select('status').eq('sprint_id', sprint.id).eq('sprint_week', 1)).data?.[0]?.status === 'finished', 1500)) break;
}
const frozen = await until(async () => (await db.from('week_scores').select('score, final').eq('sprint_id', sprint.id).eq('sprint_week', 1)).data?.[0]?.final && (await db.from('week_scores').select('score, final').eq('sprint_id', sprint.id).eq('sprint_week', 1)).data[0]);
pass('finishing the debrief freezes week 1 at 68, final (M0.4, M5)', frozen && m0Round(Number(frozen.score)) === 68 && frozen.final === true, JSON.stringify(frozen));
const stressRow = (await db.from('weekly_debriefs').select('stress').eq('sprint_id', sprint.id).eq('sprint_week', 1)).data?.[0];
pass('M12: the stress chosen in the debrief ("A little") is saved and is green', stressRow?.stress === 'a_little' && m12StressGreen(stressRow.stress), JSON.stringify(stressRow));

// M11 logging and kept up, on the database rows.
const days1 = v1.calendar.weeks[0].days.slice(0, 5);
const logged1 = [...new Set(d1.logs.filter((l) => days1.includes(l.local_date)).map((l) => l.local_date))];
pass('M11 logging: week 1 has a log on 5 of 5 working days', JSON.stringify(m11LoggedWorkingDays(days1, logged1)) === JSON.stringify({ logged: 5, of: 5 }));
const settingsOf = (name) => {
  const sh = d1.sprintHabits.find((h) => h.name === name);
  const st = d1.sprintSettings.find((x) => x.sprint_habit_id === sh.id);
  return { sh, habit: { measure: st.measure, target: st.target == null ? null : Number(st.target), targetPer: st.target_per, limit: st.limit_value == null ? null : Number(st.limit_value), limitPer: st.limit_per, direction: st.direction } };
};
const weekScoreOf = (name) => {
  const { sh, habit } = settingsOf(name);
  const logs = d1.logs.filter((l) => l.sprint_habit_id === sh.id).map((l) => ({ date: l.local_date, value: Number(l.value), toConfirm: l.to_confirm }));
  return m1HabitScore(habit, logs, { days: v1.calendar.weeks[0].days, workingDays: days1 }).score;
};
pass('M11 kept up: Training sessions in 1 of 1 finished weeks', JSON.stringify(m11HabitKeptUp([weekScoreOf('Training sessions')])) === JSON.stringify({ keptUp: 1, of: 1 }));
pass('M11 kept up: Referral conversations in 0 of 1', JSON.stringify(m11HabitKeptUp([weekScoreOf('Referral conversations')])) === JSON.stringify({ keptUp: 0, of: 1 }));

// ================================================================ 2. M5 so far
const H = { ref: await habitId('Referral conversations'), train: await habitId('Training sessions'), late: await habitId('Late finishes'), read: await habitId('Reading') };
const S = { grow: await strategyId('Grow through referrals'), energy: await strategyId('Sustain my energy'), craft: await strategyId('Deepen my coaching craft') };
const mon = dayKey(-2);
const tue = dayKey(-1);
const thu = dayKey(1);
const log = (h, date, value) => ({ user_id: me, sprint_habit_id: h, local_date: date, value });
await check('logs', db.from('habit_logs').insert([
  log(H.ref, mon, 1), log(H.ref, today, 1),
  log(H.train, mon, 1), log(H.train, thu, 2), // Thursday's is after today: not counted so far
  log(H.late, mon, 1), log(H.late, tue, 0), log(H.late, today, 0),
  log(H.read, tue, 30),
]));
await check('to-dos', db.from('todos').insert([
  { user_id: me, sprint_id: sprint.id, strategy_id: S.grow, text: 'Send the Harbour proposal', impact: 2, planned_week: 2, created_on: mon, done_on: today, source: 'manual' },
  { user_id: me, sprint_id: sprint.id, strategy_id: S.craft, text: 'Book a supervision session', impact: 3, planned_week: 2, created_on: mon, source: 'manual' },
  { user_id: me, sprint_id: sprint.id, strategy_id: S.energy, text: 'Book the physio', impact: 2, planned_week: 2, created_on: mon, done_on: thu, source: 'manual' },
]));
// Plan my day and Review my day show the score on their summaries; a
// finished plan for today lets Review my day open on its own list.
await db.from('day_plans').delete().eq('user_id', me);
await db.from('day_reviews').delete().eq('user_id', me);

async function soFarEverywhere(tag, hand, handShown, good) {
  const d = await rowsNow();
  const lib = sprintWeekSoFar(d, today)?.result;
  pass(`${tag} (src/lib on the rows): ${hand.toFixed(1)}%, by hand`, lib && near(lib.score, hand, 0.05), `${lib?.score}`);
  pass(`${tag}: shown as ${handShown}%, ${good ? 'at' : 'below'} the standard`, lib && m0Round(lib.score) === handShown && m0AtStandard(lib.score, 85) === good);
  await freshDevice();
  await page.goto(`${APP}/my-day/plan`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  await toLastStep();
  const p = await stat('Performance score this week so far');
  pass(`${tag}: Plan my day's summary says ${handShown}%, ${good ? 'mint' : 'not mint'}, labelled so far`, statOk(p, handShown, good), JSON.stringify(p));
  await page.goto(`${APP}/my-day/review`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  await toLastStep();
  const r = await stat('Performance score this week so far');
  pass(`${tag}: Review my day's summary says ${handShown}%, ${good ? 'mint' : 'not mint'}, labelled so far`, statOk(r, handShown, good), JSON.stringify(r));
  await page.goto(`${APP}/performance-sprint`);
  await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
  const centre = await until(async () => {
    const t = ((await page.locator('.ds-sdial-big').first().textContent()) || '').trim();
    return t.endsWith('%') ? t : null;
  }, 10000);
  pass(`${tag}: the sprint page says ${handShown}% so far`, centre === `${handShown}%`, centre);
}
await soFarEverywhere('M5 so far, Wednesday of week 2', 80.833, 81, false);
pass('M11 logging: week 2 has logs on 4 of its 5 working days (Thursday’s included)', (() => {
  const days = sprintPageView({ ...d1 }, { today }).calendar.weeks[1].days.slice(0, 5);
  return JSON.stringify(m11LoggedWorkingDays(days, [mon, tue, today, thu])) === JSON.stringify({ logged: 4, of: 5 });
})());
await check('a second session', db.from('habit_logs').insert([log(H.train, tue, 1)]));
await soFarEverywhere('M5 so far, with a second training session', 87.5, 88, true);

// ================================================================ 3. M11 streak
console.log(seedFixed('--reset'));
await loadSprint();
async function streakWith(done, hand, words) {
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  if (done.length) await check('debriefs', db.from('weekly_debriefs').insert(done.map((w) => ({ user_id: me, sprint_id: sprint.id, sprint_week: w, status: 'finished', finished_at: `${dayKey(7 * w + 1, sprint.start_on)}T18:00:00Z` }))));
  const weeks = [1, 2].map((w) => ({ debriefDone: done.includes(w) })).concat([{ debriefDone: true }]);
  pass(`M11 by hand, weeks ${done.join(' and ') || 'none'} done before week 3: ${hand}`, m11DebriefStreak(weeks) === hand);
  await freshDevice();
  await page.goto(`${APP}/performance-sprint/debrief`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  await toLastStep();
  const s = await stat('Debrief streak');
  pass(`debrief summary: the streak is ${hand} ${hand === 1 ? 'week' : 'weeks'}${words ? `, "${words}"` : ''}`, s && new RegExp(`^${hand}\\s*weeks?$`).test(s.text) && (!words || (await page.getByText(words).count()) === 1) && s.color !== s.coral, JSON.stringify(s));
}
await streakWith([1, 2], 3);
await streakWith([1], 1, 'This week starts your streak.');
await streakWith([2], 2);

// ================================================================ 4. M12 signals
await db.from('day_plans').delete().eq('user_id', me);
await db.from('day_reviews').delete().eq('user_id', me);
const nights = [[dayKey(-4), 7, 'poor'], [dayKey(-3), 6.5, 'good'], [dayKey(-2), 7.5, 'fair'], [today, 20, 'good']];
await check('day plans', db.from('day_plans').insert(nights.map(([date, h, q]) => ({ user_id: me, local_date: date, sleep_hours: h, sleep_quality: q, status: date === today ? 'draft' : 'finished', finished_at: date === today ? null : `${date}T07:30:00Z` }))));
const plans = await check('read day plans', db.from('day_plans').select('local_date, sleep_hours, sleep_quality, sleep_to_confirm').eq('user_id', me).order('local_date'));
pass('M12: the database asks about the 20 hours, and only that night', plans.length === 4 && plans.every((p) => p.sleep_to_confirm === (Number(p.sleep_hours) === 20)), JSON.stringify(plans.map((p) => [p.sleep_hours, p.sleep_to_confirm])));
const sleep = m12SleepHours(plans.map((p) => ({ value: Number(p.sleep_hours), toConfirm: p.sleep_to_confirm })));
pass('M12 sleep hours: 7.0 a night over 3 nights, 2 green (the 20 left out until confirmed)', sleep && near(sleep.average, 7, 1e-9) && sleep.nights === 3 && sleep.greenNights === 2, JSON.stringify(sleep));
const quality = m12SleepQuality(plans.map((p) => ({ value: p.sleep_quality, toConfirm: p.sleep_to_confirm })));
pass('M12 sleep quality: Poor, Good, Fair tie, so Fair, not green', quality?.answer === 'fair' && quality.green === false, JSON.stringify(quality));
await freshDevice();
await page.goto(`${APP}/my-day/plan`);
await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
pass('M12: Plan my day asks about the odd night once ("Is 20 hours right?")', Boolean(await until(async () => (await page.getByText('Is 20 hours right?').count()) === 1, 8000)));
await check('day reviews', db.from('day_reviews').insert([6, 7, 7].map((r, i) => ({ user_id: me, local_date: dayKey(-4 + i), way_of_being_rating: r, status: 'finished', finished_at: `${dayKey(-4 + i)}T20:00:00Z` }))));
const ratings = (await check('read reviews', db.from('day_reviews').select('way_of_being_rating').eq('user_id', me))).map((r) => r.way_of_being_rating);
const wob = m12WayOfBeing(ratings);
pass('M12 way of being: 6, 7 and 7 average 7, green', wob?.shown === 7 && wob.green === true, JSON.stringify(wob));
await db.from('day_plans').delete().eq('user_id', me);
await db.from('day_reviews').delete().eq('user_id', me);

await context.close();
await browser.close();
console.log(seedForReal('--reset'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
