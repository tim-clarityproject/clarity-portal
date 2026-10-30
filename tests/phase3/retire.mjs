// Phase 3 step 4 checks in the running app: the Weekly momentum check-in
// and the POP review are retired, signed in as the invented test client on
// the TEST database only (every other host and every email call is
// blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/retire.mjs [folder for screenshots]
//
// The seed is built around one fixed day and every browser's clock starts
// on it (tests/phase2/fixed-day.mjs). Home's weekly card shows only from
// Friday to Sunday, so the Home and menu checks run on the Friday of the
// fixed day's week (same seed, clock moved on).
//
// 1. The old routes land on the new tools: /personal-operating-plan-review
//    on the end-of-sprint review, a new weekly check-in (/my-journal with
//    reviewType weekly-momentum) on the Weekly performance debrief; an
//    after-action review still opens. Signed out, both land on the sign-in
//    page, the same as the new tools do.
// 2. Old saved items still open: a finished and a draft weekly check-in
//    (from My Reviews, their summary, Edit review and Continue) and a
//    finished and a draft POP review (read only: no pencil, no Continue,
//    no Edit review), at 1280px dark and 360px light.
// 3. Home's cards, the desktop menu's Review links and the phone's Review
//    section all lead somewhere sensible.
//
// The invented items (and an invented mission, when the client has none)
// are removed at the end, and the seed is put back on the real today.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel, londonInstant, weekdayOf } from '../phase2/fixed-day.mjs';

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
const dayKey = (n, from = FIXED_TODAY) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const FRIDAY = dayKey(4 - weekdayOf(FIXED_TODAY));
const FRIDAY_CLOCK = londonInstant(FRIDAY, '12:30');
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

// Invented old items, written as the old tools wrote them
// (src/lib/reviewTool.js saveReview, src/lib/missionPlan.js saveReview).
const OLD_WEEK = dayKey(-24);
const WEEKLY = {
  title: 'Weekly momentum check-in, invented old week',
  q1: 'The Harbour proposal moved to its second draft.',
  q2: 'I blocked out Friday mornings for deep work.',
  q3: 'Send the Harbour proposal and book two referral calls.',
};
const WEEKLY_DRAFT = { title: 'Weekly momentum check-in, invented draft week', q1: 'Two calls booked, one still to land.' };
const POP = { mission: 'Invented mission for the retire test', strategy: 'Grow through referrals', tactic: 'Ask three clients for an introduction', note: 'Two asked, one introduction so far.' };
const POP_DRAFT_TACTIC = 'Write the referral thank-you note';

let madeMission = null;
const created = { journal: [], pop: [] };

async function seedOld() {
  const { data: missions } = await db.from('missions').select('id, title').eq('user_id', me).is('archived_at', null).order('created_at', { ascending: false }).limit(1);
  let missionId = missions?.[0]?.id;
  if (!missionId) {
    const { data, error } = await db.from('missions').insert({ user_id: me, title: POP.mission }).select('id').single();
    if (error) throw error;
    missionId = data.id;
    madeMission = missionId;
  }
  const weekly = (title, content, status, date) => ({
    user_id: me,
    review_type: 'weekly-momentum',
    entry_date: date,
    title,
    content: JSON.stringify({ ...content, reviewType: 'weekly-momentum' }),
    status,
    created_at: `${date}T17:00:00Z`,
    updated_at: `${date}T17:00:00Z`,
  });
  const j = await db.from('journal_entries').insert([
    weekly(WEEKLY.title, { q1: WEEKLY.q1, q2: WEEKLY.q2, q3: WEEKLY.q3, momentum: 4, intentionality: 3, communication: 4, performanceUnderPressure: 3 }, 'final', OLD_WEEK),
    weekly(WEEKLY_DRAFT.title, { q1: WEEKLY_DRAFT.q1, q2: '', q3: '', momentum: 3 }, 'draft', dayKey(-17)),
  ]).select('id, title');
  if (j.error) throw j.error;
  created.journal = j.data;
  const popData = (tactics) => ({
    mission_title: POP.mission,
    strategies: [{ id: 's1', name: POP.strategy, description: 'Referrals from happy clients.', tactics }],
  });
  const p = await db.from('mission_progress_reviews').insert([
    { user_id: me, mission_id: missionId, status: 'final', created_at: `${dayKey(-31)}T17:00:00Z`, updated_at: `${dayKey(-31)}T17:00:00Z`, review_data: popData([{ id: 't1', action: POP.tactic, type: 'tickable', reviewed_is_done: true, reviewed_note: POP.note }]) },
    { user_id: me, mission_id: missionId, status: 'draft', created_at: `${dayKey(-10)}T17:00:00Z`, updated_at: `${dayKey(-10)}T17:00:00Z`, review_data: popData([{ id: 't2', action: POP_DRAFT_TACTIC, type: 'tickable', reviewed_is_done: false, reviewed_note: null }]) },
  ]).select('id, status');
  if (p.error) throw p.error;
  created.pop = p.data;
}

async function tidy() {
  if (created.journal.length) await db.from('journal_entries').delete().in('id', created.journal.map((r) => r.id)).eq('user_id', me);
  if (created.pop.length) await db.from('mission_progress_reviews').delete().in('id', created.pop.map((r) => r.id)).eq('user_id', me);
  // Anything a failed run left behind, by its invented words.
  await db.from('journal_entries').delete().eq('user_id', me).in('title', [WEEKLY.title, WEEKLY_DRAFT.title]);
  if (madeMission) await db.from('missions').delete().eq('id', madeMission).eq('user_id', me);
  await db.from('missions').delete().eq('user_id', me).eq('title', POP.mission);
}

await tidy();
await seedOld();

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function newContext({ width, mode, clock }) {
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
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page };
}

async function signedIn(opts) {
  const c = await newContext(opts);
  await c.page.goto(`${APP}/auth/login`);
  await c.page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await c.page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await c.page.keyboard.press('Enter');
  await c.page.waitForURL(/welcome/, { timeout: 30000 });
  return c;
}

const path = (page) => new URL(page.url()).pathname;
// What a person sees (innerText), compared without case: titles show in
// Nekst capitals.
const textOf = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ').toLowerCase();
const has = (text, s) => text.includes(s.toLowerCase());
async function landsOn(page, want, ms = 20000) {
  return until(async () => path(page) === want, ms);
}
async function shot(page, name) {
  if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

// An in-app link with router state, as Home, the menu and the Review
// section send it (react-router keeps its state under "usr").
async function pushRoute(page, to, state) {
  await page.evaluate(({ to: t, state: s }) => {
    window.history.pushState({ usr: s, key: `t${Date.now()}`, idx: (window.history.state?.idx ?? 0) + 1 }, '', t);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, { to, state });
}

const OLD_POP_TITLE = 'Review your plan';

// ---------------------------------------------------------------- 1. signed out
{
  const c = await newContext({ width: 1280, mode: 'dark' });
  try {
    for (const route of ['/personal-operating-plan-review', '/performance-sprint/review', '/performance-sprint/debrief']) {
      await c.page.goto(`${APP}${route}`);
      pass(`signed out: ${route} lands on sign-in`, await landsOn(c.page, '/auth/login'), path(c.page));
    }
    await c.page.goto(`${APP}/auth/login`);
    await c.page.waitForSelector('input[type=email]');
    await pushRoute(c.page, '/my-journal', { reviewType: 'weekly-momentum' });
    pass('signed out: a new weekly check-in lands on sign-in', await landsOn(c.page, '/auth/login'), path(c.page));
  } catch (e) {
    pass('signed out', false, e.message);
  }
  await c.context.close();
}

// ---------------------------------------------------------------- 2. signed in: the redirects
async function checkRedirects(page, tag) {
  await page.goto(`${APP}/personal-operating-plan-review`);
  const toReview = await landsOn(page, '/performance-sprint/review');
  pass(`${tag}: /personal-operating-plan-review opens the end-of-sprint review`, toReview, path(page));
  await until(async () => /review/i.test(await textOf(page)) && !(await page.locator('.ds-loading--page').count()));
  pass(`${tag}: the old POP review never shows`, !has(await textOf(page), OLD_POP_TITLE));
  await shot(page, `${tag}-pop-redirect`);
  // Back does not loop through the old route.
  await page.goBack();
  await until(async () => path(page) !== '/performance-sprint/review', 5000);
  pass(`${tag}: Back leaves the redirect behind`, path(page) !== '/personal-operating-plan-review', path(page));

  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-tiles', { timeout: 30000 });
  await pushRoute(page, '/my-journal', { reviewType: 'weekly-momentum' });
  pass(`${tag}: a new weekly check-in opens the debrief`, await landsOn(page, '/performance-sprint/debrief'), path(page));
  await until(async () => (await page.locator('.ds-guide, .plan-page').count()) > 0);
  pass(`${tag}: the debrief shows, not the old check-in`, !has(await textOf(page), 'Weekly Momentum Check-in'));
  await shot(page, `${tag}-weekly-redirect`);

  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-tiles', { timeout: 30000 });
  await pushRoute(page, '/my-journal', { reviewType: 'after-action' });
  await until(async () => has(await textOf(page), 'After-Action Review'));
  pass(`${tag}: an after-action review still opens`, path(page) === '/my-journal' && has(await textOf(page), 'After-Action Review'), path(page));
}

// ---------------------------------------------------------------- 3. old saved items
const row = (page, title) => page.locator('.hlist-row', { has: page.locator('.hlist-row-title', { hasText: title }) });

async function openMyReviews(page) {
  await page.goto(`${APP}/my-reviews`);
  await page.waitForSelector('.hlist-row', { timeout: 30000 });
  await until(async () => (await row(page, WEEKLY.title).count()) > 0);
}

async function checkOldItems(page, tag) {
  await openMyReviews(page);
  const noSideways = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  pass(`${tag}: My Reviews has no sideways scroll`, noSideways);

  // Weekly, finished: listed, opens its summary with its answers.
  const w = row(page, WEEKLY.title);
  pass(`${tag}: the old weekly check-in is listed`, (await w.count()) === 1);
  pass(`${tag}: its type label`, (await w.locator('.hlist-row-tags b').textContent()).trim() === 'Weekly momentum check-in');
  pass(`${tag}: the finished weekly check-in has a pencil`, (await w.locator('.hlist-icon-btn:not(.hlist-icon-btn--del)').count()) === 1);
  await w.locator('.hlist-row-main').click();
  pass(`${tag}: it opens its summary`, await landsOn(page, '/review-summary'), path(page));
  await until(async () => has(await textOf(page), WEEKLY.q1));
  const summary = await textOf(page);
  pass(`${tag}: the summary shows every answer`, [WEEKLY.title, WEEKLY.q1, WEEKLY.q2, WEEKLY.q3].every((x) => has(summary, x)));
  await shot(page, `${tag}-weekly-summary`);
  // Edit review still opens the old check-in with its answers (no redirect).
  await page.getByRole('button', { name: 'Edit review' }).click();
  pass(`${tag}: Edit review opens the old check-in`, await landsOn(page, '/my-journal'), path(page));
  const edited = await until(async () => {
    const vals = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value));
    return vals.includes(WEEKLY.q1) ? vals : null;
  });
  pass(`${tag}: the old check-in shows its answers to edit`, Boolean(edited) && has(await textOf(page), 'Weekly Momentum Check-in'));

  // Weekly, draft: Continue opens it with its draft answer.
  await openMyReviews(page);
  const wd = row(page, WEEKLY_DRAFT.title);
  pass(`${tag}: the weekly draft is listed with Draft`, (await wd.locator('.hlist-draft-tag').count()) === 1);
  await wd.getByRole('button', { name: 'Continue' }).click();
  pass(`${tag}: Continue opens the weekly draft`, await landsOn(page, '/my-journal'), path(page));
  const draftVals = await until(async () => {
    const vals = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value));
    return vals.includes(WEEKLY_DRAFT.q1) ? vals : null;
  });
  pass(`${tag}: the weekly draft shows its answer`, Boolean(draftVals));

  // POP, finished: read only.
  await openMyReviews(page);
  const pops = row(page, POP.mission).filter({ has: page.locator('.hlist-row-tags b', { hasText: 'POP review' }) });
  await until(async () => (await pops.count()) >= 2);
  const popRows = await pops.evaluateAll((els) => els.map((e) => ({
    draft: Boolean(e.querySelector('.hlist-draft-tag')),
    pencil: e.querySelectorAll('.hlist-icon-btn:not(.hlist-icon-btn--del)').length,
    cont: Boolean(e.querySelector('.hlist-continue-btn')),
    bin: e.querySelectorAll('.hlist-icon-btn--del').length,
  })));
  pass(`${tag}: both POP reviews are listed`, popRows.length === 2 && popRows.some((r) => r.draft) && popRows.some((r) => !r.draft), JSON.stringify(popRows));
  pass(`${tag}: POP reviews have no pencil and no Continue`, popRows.every((r) => r.pencil === 0 && !r.cont), JSON.stringify(popRows));
  pass(`${tag}: POP reviews keep their bin`, popRows.every((r) => r.bin === 1));
  await shot(page, `${tag}-my-reviews`);

  for (const kind of ['final', 'draft']) {
    await openMyReviews(page);
    await until(async () => (await pops.count()) >= 2);
    const target = kind === 'draft' ? pops.filter({ has: page.locator('.hlist-draft-tag') }) : pops.filter({ hasNot: page.locator('.hlist-draft-tag') });
    await target.first().locator('.hlist-row-main').click();
    pass(`${tag}: the ${kind} POP review opens`, await landsOn(page, '/mission-progress-review'), path(page));
    const want = kind === 'draft' ? POP_DRAFT_TACTIC : POP.tactic;
    await until(async () => has(await textOf(page), want));
    const t = await textOf(page);
    pass(`${tag}: the ${kind} POP review shows its content`, has(t, POP.strategy) && has(t, want) && (kind === 'draft' || has(t, POP.note)));
    pass(`${tag}: the ${kind} POP review is read only`, (await page.getByRole('button', { name: 'Edit review' }).count()) === 0);
    pass(`${tag}: the ${kind} POP review ${kind === 'draft' ? 'says it is a draft' : 'has no draft line'}`, has(t, 'This review was saved as a draft and not finished.') === (kind === 'draft'));
    pass(`${tag}: the ${kind} POP review can still be deleted`, (await page.getByRole('button', { name: 'Delete review' }).count()) === 1);
    await shot(page, `${tag}-pop-${kind}`);
  }
}

// ---------------------------------------------------------------- 4. Home and the menus
const SENSIBLE = {
  'Plan my day': ['/plan-my-day'],
  'Review my day': ['/review-plan'],
  'Refine my personal operating plan': ['/personal-operating-plan', '/onboarding-mission'],
};

async function checkHome(page, tag) {
  for (const [title, want] of Object.entries(SENSIBLE)) {
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-tiles', { timeout: 30000 });
    await page.locator('.home-tiles a, .home-tiles button', { hasText: title }).first().click();
    const ok = await until(async () => want.includes(path(page)));
    pass(`${tag}: Home's "${title}" opens ${want[0]}`, Boolean(ok), path(page));
  }
  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-tiles', { timeout: 30000 });
  const card = page.locator('.home-weekly-card');
  pass(`${tag}: Home shows the weekly card on a Friday`, (await card.count()) === 1);
  if (await card.count()) {
    await card.click();
    pass(`${tag}: Home's weekly card opens the debrief`, await landsOn(page, '/performance-sprint/debrief'), path(page));
  }
}

async function checkDrawer(page, tag) {
  const cases = [
    ['Weekly Momentum Check-in', '/performance-sprint/debrief'],
    ['Personal Operating Plan Review', '/performance-sprint/review'],
    ['After-Action Review', '/my-journal'],
    ['My Reviews', '/my-reviews'],
  ];
  for (const [label, want] of cases) {
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-tiles', { timeout: 30000 });
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.locator('.design-drawer');
    const link = drawer.getByRole('link', { name: label, exact: true });
    if (!(await link.isVisible())) await drawer.getByRole('button', { name: 'Review', exact: true }).click();
    await link.waitFor({ state: 'visible', timeout: 5000 });
    await link.click();
    pass(`${tag}: the menu's ${label} opens ${want}`, await landsOn(page, want), path(page));
  }
}

async function checkReviewSection(page, tag) {
  const cases = [
    ['Weekly momentum check-in', '/performance-sprint/debrief'],
    ['Review my personal operating plan', '/performance-sprint/review'],
    ['Review a situation', '/my-journal'],
  ];
  for (const [title, want] of cases) {
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-tiles', { timeout: 30000 });
    await page.locator('.design-tabbar a', { hasText: 'Review' }).click();
    await landsOn(page, '/review-section');
    await page.locator('.dt-card', { hasText: title }).click();
    pass(`${tag}: the Review tab's "${title}" opens ${want}`, await landsOn(page, want), path(page));
  }
}

for (const [width, mode] of [[1280, 'dark'], [360, 'light']]) {
  const tag = `${width}px ${mode}`;
  {
    const c = await signedIn({ width, mode });
    try {
      await checkRedirects(c.page, tag);
    } catch (e) {
      pass(`${tag}: the redirects`, false, e.message);
    }
    try {
      await checkOldItems(c.page, tag);
    } catch (e) {
      pass(`${tag}: old saved items`, false, e.message);
    }
    await c.context.close();
  }
  {
    const c = await signedIn({ width, mode, clock: FRIDAY_CLOCK });
    try {
      await checkHome(c.page, `${tag} Friday`);
      if (width >= 769) await checkDrawer(c.page, `${tag} Friday`);
      else await checkReviewSection(c.page, `${tag} Friday`);
    } catch (e) {
      pass(`${tag}: Home and the menus`, false, e.message);
    }
    await c.context.close();
  }
}

await browser.close();
await tidy();
const left = (await db.from('journal_entries').select('id').eq('user_id', me).in('title', [WEEKLY.title, WEEKLY_DRAFT.title])).data || [];
pass('the invented items are removed', left.length === 0);
seedForReal('--reset');

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
