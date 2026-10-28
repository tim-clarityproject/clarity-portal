// Phase 2 step 8: the figures on the Phase 2 screens against the worked
// examples in docs/scoring-methods.md, with invented data on the TEST
// database (scripts/seed-test-plan.mjs --worked), signed in as the test
// client (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/figures.mjs
//
// M5-1: Sam works Monday to Friday, standard 85%. Week 1 of Sprint 1 holds
// exactly M5-1's items, so
//  - src/lib/scores on the database rows: Grow through referrals 83.3%,
//    Sustain my energy 80.0%, Deepen my coaching craft 25.0%, the week
//    67.9%, shown as 68%, below the standard;
//  - the sprint page's dial: week 1's pop-up says 68%, the week is grey
//    (never mint, never coral); Sprint details' average is 68%, "Week 1.";
//  - the database's frozen copy (freeze_week, public.score_week_raw) is 68;
//  - View your year: week 1's bar says 68%, grey;
//  - M8: fewer than 6 finished weeks, so "Your usual range appears after 6 weeks.";
//  - the plan: M9-1's objective (start 20, target 38, now 31) reads 31 of
//    38 and its bar fills 31 ÷ 38 from zero (M9.1); the milestone's time
//    left (M9.2) and every Strategy tile's score this week so far equal
//    src/lib on the same rows.
// Ends with the usual seeded plan and running sprint (--reset).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { sprintPageView, sprintWeekResult, sprintWeekSoFar, objectiveResults } from '../../src/lib/performance/index.js';
import { m0Round, m9TimeLeft } from '../../src/lib/scores/index.js';

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
const seed = (...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags], { stdio: 'pipe' }).toString().trim();
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
const until = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
};

console.log(seed('--worked'));
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')).data[0];

async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const [objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns, figures] = await Promise.all([
    q(db.from('outcome_objectives').select('*').eq('user_id', me).is('archived_at', null).order('sort_order')),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null)),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
    q(db.from('objective_figures').select('*').eq('user_id', me)),
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
  return { plan: { id: sprint.plan_id }, sprint, objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, figures, debriefs: [], personSettings: { units: 'metric' } };
}

// ---------------------------------------------------------------- the library on the rows
const d = await rowsNow();
const v = sprintPageView(d, { today });
const { result } = sprintWeekResult(d, v.calendar || { weeks: v.weeks }, 1);
const byName = Object.fromEntries(d.strategies.map((s) => [s.name, (result.strategies.find((x) => x.id === s.id) || {}).score]));
const near = (a, b) => a != null && Math.abs(a - b) < 0.06;
pass('M5-1 Grow through referrals = 83.3%', near(byName['Grow through referrals'], 83.33), `${byName['Grow through referrals']}`);
pass('M5-1 Sustain my energy = 80.0%', near(byName['Sustain my energy'], 80), `${byName['Sustain my energy']}`);
pass('M5-1 Deepen my coaching craft = 25.0%', near(byName['Deepen my coaching craft'], 25), `${byName['Deepen my coaching craft']}`);
pass('M5-1 the week = 67.9%', near(result.score, 67.92), `${result.score}`);
pass('M5-1 shown as 68%, below the standard (grey)', m0Round(result.score) === 68 && v.weeks[0].score === 68 && v.weeks[0].state === 'below', `${v.weeks[0].score} ${v.weeks[0].state}`);

// ---------------------------------------------------------------- the app
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_REF)) return route.abort();
  if (/\/functions\/v1\//.test(url)) return route.abort();
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', (e) => pass('no page errors', false, e.message));
await page.goto(`${APP}/auth/login`);
await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL(/welcome/, { timeout: 30000 });

// The sprint page.
await page.goto(`${APP}/performance-sprint`);
await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
await page.waitForTimeout(900);
const week1 = await page.evaluate(() => {
  const el = document.querySelector('.ds-sdial [data-tip]');
  const tip = JSON.parse(el.getAttribute('data-tip'));
  return { tip, cls: el.getAttribute('class'), stroke: getComputedStyle(el).stroke };
});
pass('sprint page: week 1’s pop-up says 68%', week1.tip.value === 'Performance score 68%' && /Week 1/.test(week1.tip.when), JSON.stringify(week1.tip));
pass('sprint page: week 1 is grey, below the standard', /ds-sdial-seg--below/.test(week1.cls) && !['rgb(95, 239, 187)', 'rgb(255, 111, 92)'].includes(week1.stroke), `${week1.cls} ${week1.stroke}`);
await page.getByRole('button', { name: /Sprint details/ }).first().click();
await page.waitForTimeout(500);
const details = (await page.locator('.ds-collapse-body').first().textContent()).replace(/\s+/g, ' ');
pass('sprint page: the average is 68%, from week 1', /68%/.test(details) && /Week 1\./.test(details) && v.average.value === '68%', details.slice(0, 160));
const usual = await page.locator('body').textContent();
pass('sprint page (M8): fewer than 6 weeks, so the usual range waits', usual.includes('Your usual range appears after 6 weeks.'));
const centre = (await page.locator('.ds-sdial-big').first().textContent()).trim();
const soFar = sprintWeekSoFar(d, today);
pass('sprint page: this week so far equals src/lib/scores', soFar?.result?.score == null ? !/\d+%/.test(centre) : centre === `${m0Round(soFar.result.score)}%`, `${centre} vs ${soFar?.result?.score}`);

// The database's frozen copy.
const frozen = await until(async () => {
  const ws = (await db.from('week_scores').select('sprint_week, score, final').eq('sprint_id', sprint.id).eq('sprint_week', 1)).data;
  return ws?.[0] || null;
});
pass('database (freeze_week): week 1 frozen at 68', frozen && m0Round(Number(frozen.score)) === 68, JSON.stringify(frozen));

// View your year.
await page.goto(`${APP}/performance-sprint/year`);
await page.waitForSelector('.ds-ychart-col', { timeout: 30000 });
await page.waitForTimeout(700);
const yearCol = await page.evaluate(() => {
  for (const el of document.querySelectorAll('.ds-ychart-col')) {
    const tip = JSON.parse(el.getAttribute('data-tip'));
    if (/Sprint 1, week 1\b/.test(tip.when || '') || /Sprint 1, week 1\b/.test((tip.extra || []).join(' '))) {
      const bar = el.querySelector('[class*="ds-ychart-bar"]');
      return { tip, bar: bar?.getAttribute('class'), bg: bar ? getComputedStyle(bar).backgroundColor : null };
    }
  }
  return null;
});
pass('year: week 1’s bar says 68%', yearCol && /68%/.test(yearCol.tip.value || ''), JSON.stringify(yearCol?.tip));
pass('year: week 1’s bar is grey', yearCol && !['rgb(95, 239, 187)', 'rgb(255, 111, 92)'].includes(yearCol.bg), `${yearCol?.bar} ${yearCol?.bg}`);

// The plan.
await page.goto(`${APP}/performance-plan`);
await page.waitForSelector('.ds-stile', { timeout: 30000 });
await page.waitForTimeout(700);
const cards = await page.evaluate(() => [...document.querySelectorAll('.ds-objective')].map((c) => ({
  text: c.textContent.replace(/\s+/g, ' '),
  bar: (() => { const s = c.querySelector('.ds-bar > span'); return s ? s.style.width || getComputedStyle(s).width : null; })(),
  barTrack: (() => { const b = c.querySelector('.ds-bar'); return b ? b.getBoundingClientRect().width : null; })(),
  barFill: (() => { const s = c.querySelector('.ds-bar > span'); return s ? s.getBoundingClientRect().width : null; })(),
})));
const clients = cards.find((c) => c.text.includes('Coaching clients'));
pass('plan (M9-1): Coaching clients reads 31 of 38', clients && /31\s*of 38/.test(clients.text), clients?.text.slice(0, 120));
const fill = clients && clients.barTrack ? clients.barFill / clients.barTrack : null;
pass('plan (M9.1): its bar fills 31 ÷ 38 from zero', fill != null && Math.abs(fill - 31 / 38) < 0.01, `${fill?.toFixed(3)}`);
const objs = objectiveResults(d.objectives, d.figures, today, sprint.start_on);
const ms = d.objectives.find((o) => o.kind === 'milestone');
const left = m9TimeLeft(today, ms.due_on);
const msCard = cards.find((c) => c.text.includes(ms.name));
pass('plan (M9.2): the milestone’s time left equals src/lib/scores', msCard && objs.length === 3 && msCard.text.toLowerCase().includes(left.text), `${JSON.stringify(left)} in ${msCard?.text.slice(0, 120)}`);
const tiles = await page.evaluate(() => [...document.querySelectorAll('.ds-stile')].map((t) => t.textContent.replace(/\s+/g, ' ')));
for (const s of d.strategies) {
  const want = soFar?.result?.strategies?.find((x) => x.id === s.id)?.score;
  const tile = tiles.find((t) => t.includes(s.name)) || '';
  const ok = want == null ? /no score yet/.test(tile) : tile.includes(`${m0Round(want)}%`);
  pass(`plan: "${s.name}" tile equals src/lib/scores this week so far`, ok, `${want == null ? 'none' : m0Round(want)} in ${tile.slice(0, 100)}`);
}

await browser.close();
console.log(seed('--reset'));
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
