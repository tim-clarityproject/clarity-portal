// Phase 2 step 5 checks in the running app: View your year (M1 R.year),
// signed in as the invented test client on the TEST database only (every
// other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/year.mjs [folder for screenshots]
//
// It seeds a finished Sprint 1, a Recovery and Sprint 2 ended but not
// reviewed (scripts/seed-test-plan.mjs --ended), then the usual running
// Sprint 1 (--reset), and leaves that in place at the end.
//
//  1. Layout at 1280px, 700px, 390px and 360px, dark and light: no
//     sideways scroll, at most one coral button, 44px tap areas, mint
//     weeks at the standard and grey below, no coral in the chart, the
//     Recovery week hatched, no key.
//  2. The figures: every week's bar and pop-up and each sprint's average
//     match src/lib/performance/year.js on the same rows; the unfrozen
//     finished weeks were frozen.
//  3. Picking a week, the pop-up 12px inside the screen, Show as a table.
//  4. The running sprint: this week so far in the text colour, Open this week.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { yearView } from '../../src/lib/performance/year.js';

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
const openYear = async (page) => {
  await page.goto(`${APP}/performance-sprint/year`);
  await page.waitForSelector('.ds-ychart-col', { timeout: 30000 });
  await page.waitForTimeout(1500);
};

// The rows the page loads (loadYearPage), read straight from the database.
async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const sprints = await q(db.from('sprints').select('*').eq('user_id', me).order('number'));
  const sprint = sprints.find((s) => s.status === 'running') || null;
  const [weekScores, recoveries, workingPatterns, allDebriefs, objectives, strategies, links] = await Promise.all([
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
    q(db.from('weekly_debriefs').select('sprint_id, sprint_week, status').eq('user_id', me)),
    q(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null)),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
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
  return { plan: { id: sprints[0]?.plan_id }, sprint, sprints, weekScores, recoveries, workingPatterns, allDebriefs, objectives, strategies, links, personSettings: { units: 'metric' }, ...rest };
}

async function layoutChecks(page, tag, mode) {
  await page.mouse.move(0, 0);
  const r = await page.evaluate(({ coral }) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const root = document.querySelector('.year-page');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [];
    for (const el of root.querySelectorAll('button, a, input, [role=radio], [role=checkbox]')) {
      if (!vis(el) || el.disabled) continue;
      const b = el.getBoundingClientRect();
      if (b.height >= 43.5 && b.width >= 43.5) continue;
      small.push(`${String(el.className || el.tagName).slice(0, 40)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const bg = (sel) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).backgroundColor);
    const chartColours = [...document.querySelectorAll('.ds-ychart *')].flatMap((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).fill, getComputedStyle(el).color]);
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      primaries: primaries.length,
      small,
      good: bg('.ds-ychart-bar--good'),
      below: bg('.ds-ychart-bar--below'),
      coral: chartColours.filter((c) => coral.includes(c)).length,
      hatched: document.querySelectorAll('.ds-ychart-rec').length,
      key: document.querySelectorAll('.ylg, .ds-legend, .legend').length,
    };
  }, { coral: CORAL });
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: at most one coral button`, r.primaries <= 1, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: weeks at the standard are mint`, r.good.length > 0 && r.good.every((c) => c === MINT[mode]), r.good.slice(0, 3).join(','));
  pass(`${tag}: weeks below are grey, not coral or mint`, r.below.length > 0 && r.below.every((c) => !CORAL.includes(c) && c !== MINT[mode]), r.below.slice(0, 3).join(','));
  pass(`${tag}: no coral in the chart`, r.coral === 0, `${r.coral}`);
  pass(`${tag}: Recovery is hatched`, r.hatched >= 1, `${r.hatched}`);
  pass(`${tag}: no key`, r.key === 0);
}

// ---------------------------------------------------------------- ended sprints
seed('--ended');

for (const width of [1280, 700, 390, 360]) {
  for (const mode of ['dark', 'light']) {
    const { context, page } = await signedIn({ width, mode });
    await openYear(page);
    await layoutChecks(page, `${width}px ${mode}`, mode);
    await shot(page, `year-${width}-${mode}`);
    await context.close();
  }
}

const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
await openYear(page);

// 2. Figures against src/lib/performance/year.js, once frozen.
const allFrozen = await until(async () => {
  const v = yearView(await rowsNow(), { today });
  return v.toFreeze.filter((w) => w.week).length === 0 ? v : null;
}, 20000);
pass('every finished week was frozen', Boolean(allFrozen));
await page.reload();
await page.waitForSelector('.ds-ychart-col');
await page.waitForTimeout(1500);
{
  const v = yearView(await rowsNow(), { today });
  const cols = await page.locator('.ds-ychart-col').evaluateAll((els) => els.map((e) => ({
    week: Number(e.dataset.week),
    label: e.getAttribute('aria-label'),
    bar: e.querySelector('.ds-ychart-bar:not(.ds-ychart-bar--stub)')?.className || null,
    height: e.querySelector('.ds-ychart-bar:not(.ds-ychart-bar--stub)')?.style.height || null,
  })));
  pass(`the chart has the year's ${v.count} weeks`, cols.length === v.count, `${cols.length}`);
  let bad = 0;
  for (const s of v.slots) {
    const c = cols[s.week - 1];
    const words = [s.tip.value, s.tip.when, ...(s.tip.extra || [])].filter(Boolean).join(', ');
    if (c.label !== words) bad += 1;
    if (s.kind === 'sprint' && s.score != null && ['good', 'below'].includes(s.state)) {
      if (!c.bar?.includes(`ds-ychart-bar--${s.state}`) || c.height !== `${s.score}%`) bad += 1;
    }
  }
  pass('every week’s bar and pop-up match src/lib/scores', bad === 0, `${bad} differ`);
  const averages = await page.locator('.year-sprint-figure').allTextContents();
  pass('each sprint’s average matches M6', JSON.stringify(averages) === JSON.stringify([...v.sprints].reverse().map((s) => s.average).filter(Boolean)), averages.join(','));
  pass('the ended sprint says its review is waiting', (await page.locator('.year-sprints').textContent()).includes('Its review is waiting for you.'));
  const rec = v.slots.find((s) => s.kind === 'recovery');
  pass('a Recovery week says so in words', Boolean(rec) && cols[rec.week - 1].label.startsWith('Recovery,'));

  // 3. Picking a week.
  const good = v.slots.find((s) => s.state === 'good');
  await page.locator(`.ds-ychart-col[data-week="${good.week}"]`).click();
  await page.waitForTimeout(300);
  const panel = await page.locator('.year-sel').textContent();
  pass('picking a week says more about it', panel.includes(`Week ${good.week}`) && panel.includes(`${good.sprintName}, week ${good.sprintWeek}`) && panel.includes(`${good.score}%`), panel);
  pass('the picked week is outlined', await page.locator(`.ds-ychart-col--picked[data-week="${good.week}"]`).count() === 1);
  const tipBox = await page.locator('.ds-tip:not([hidden])').boundingBox();
  pass('its pop-up shows, 12px inside the screen', tipBox && tipBox.x >= 12 && tipBox.x + tipBox.width <= 1280 - 12, JSON.stringify(tipBox));
  await page.keyboard.press('Escape');
  await page.locator(`.ds-ychart-col[data-week="${rec.week}"]`).focus();
  await page.keyboard.press('Enter');
  pass('Enter picks a focused week', (await page.locator('.year-sel').textContent()).includes('You were in recovery this week.'));
  await page.getByRole('button', { name: 'Show as a table' }).click();
  await page.waitForTimeout(400);
  const rowsShown = await page.locator('.year-tbl tbody tr').count();
  pass('Show as a table lists every week that holds something', rowsShown === v.slots.filter((s) => s.kind !== 'empty').length, `${rowsShown}`);
  await shot(page, 'year-picked-table');
}
await context.close();

// Phone pop-up near the right edge.
{
  const { context: c, page: p } = await signedIn({ width: 360, mode: 'light' });
  await openYear(p);
  const v = yearView(await rowsNow(), { today });
  const last = [...v.slots].reverse().find((s) => s.kind === 'sprint');
  await p.locator(`.ds-ychart-col[data-week="${last.week}"]`).tap();
  await p.waitForTimeout(300);
  const box = await p.locator('.ds-tip:not([hidden])').boundingBox();
  pass('phone: the pop-up stays 12px inside both edges', box && box.x >= 11.5 && box.x + box.width <= 360 - 11.5, JSON.stringify(box));
  await c.close();
}

// 4. The running sprint (the usual seed): this week so far in the text colour.
seed('--reset');
{
  const { context: c, page: p } = await signedIn({ width: 1280, mode: 'light' });
  await openYear(p);
  const v = yearView(await rowsNow(), { today });
  const now = v.slots.find((s) => s.state === 'now');
  const colour = await p.locator('.ds-ychart-bar--now').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  const text = await p.locator('.year-page').evaluate((e) => getComputedStyle(e).color);
  pass('this week is in the text colour', colour === text, `${colour} vs ${text}`);
  pass('this week is picked first', (await p.locator('.year-sel').textContent()).includes('This week so far') && await p.locator(`.ds-ychart-col--picked[data-week="${now.week}"]`).count() === 1);
  pass('this week’s score matches the sprint page', now.score == null || (await p.locator('.year-sel').textContent()).includes(`${now.score}%`));
  await shot(p, 'year-running');
  await p.getByRole('button', { name: 'Open this week' }).click();
  pass('Open this week opens the sprint', Boolean(await until(async () => p.url().endsWith('/performance-sprint'))));
  await p.goto(`${APP}/design-reference#c43`);
  await p.waitForSelector('#c43 .ds-ychart-col', { timeout: 20000 });
  pass('gallery: the year chart is shown', await p.locator('#c43 .ds-ychart-bar--good').count() > 0);
  if (out) await p.locator('#c43').screenshot({ path: `${out}/gallery-c43.png` });
  await c.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
