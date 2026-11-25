// Phase 8a, shared by the Get unstuck suites: the test project only, the
// invented test client, every other host and every email call blocked,
// M9's own example answers, and stand-in answers for the guest functions
// of migration 035 (and 042), shaped exactly as the SQL builds them.
import { accountsText, TEST_HOST as TARGET_HOST } from '../target.mjs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

export const APP = process.env.APP_URL || 'http://localhost:5173';
export const TEST_REF = TARGET_HOST;
export const TEST_HOST = TARGET_HOST;
export const M9_FILE = process.env.M9_FILE || `${homedir()}/Downloads/clarity-phase-8a/m9-get-unstuck.html`;
export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await Promise.resolve().then(fn).catch(() => null);
    if (v) return v;
    await sleep(200);
  }
  return v;
}

export function readEnv() {
  const env = {};
  for (const line of accountsText().split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
  return env;
}

/** The test client's own database session (their rows only), for seeding and cleaning up. */
export async function clientDb(env) {
  const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
  if (error) throw error;
  return { db, me: data.user.id };
}

// M9's own example (invented).
export const M9 = {
  name: 'Jordan',
  coach: 'Tim',
  goal: 'Cut our time to hire to 30 days by March',
  cons: ['Hiring managers take a week to give interview feedback.', 'We have one recruiter for 40 open roles.', 'Every offer needs sign-off from two directors.'],
  opps: ['Priya’s team already runs one-day interview loops.', 'Referral hires start faster and stay longer.'],
  opts: ['Agree a 48-hour feedback rule with hiring managers.', 'Pilot one-day interview loops in two teams.', 'Let one director sign off offers up to an agreed salary.', 'Double the referral bonus for hard-to-fill roles.', 'Bring in a contract recruiter for 3 months.'],
  acts: ['Agree a 48-hour feedback rule at Monday’s operations meeting.', 'Pilot one-day interview loops in two teams, starting with Priya’s.'],
  guestEmail: 'alex@example.com',
  guestCode: 'K7Q2RM',
};

/** Every other host, every server function and every email call is blocked. */
export async function block(context, { api = null } = {}) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (/\/api\//.test(url)) return api ? api(route) : route.abort();
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('file:') || url.startsWith('data:')) return route.fallback();
    if (url.includes(TEST_HOST)) return route.fallback();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fallback();
    return route.abort();
  });
}

export async function signIn(page, env) {
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
}

export const question = (page) => page.locator('.ds-guide-question').first();
export const questionText = async (page) => (await question(page).innerText()).replace(/\s+/g, ' ').trim();
export async function onQuestion(page, starts, ms = 15000) {
  return until(async () => (await questionText(page)).startsWith(starts), ms);
}
export const next = (page) => page.locator('.ds-guide-next');
/** Press the bottom bar's button once the tool will take a press (it ignores a second tap within 400ms). */
export async function pressNext(page) {
  await sleep(450);
  await next(page).click();
}

/** Types a list screen's rows (the first box is there already). */
export async function typeRows(page, rows, noun) {
  for (let i = 0; i < rows.length; i += 1) {
    if (i > 0) await page.getByRole('button', { name: `Add another ${noun}` }).click();
    await page.locator('.ds-rowlist .ds-text').nth(i).fill(rows[i]);
  }
}

/**
 * Works through the tool with M9's answers as far as `to`:
 * 'goal' | 'cons' | 'opps' | 'opts' | 'will' | 'steps' | 'sum'. The tool
 * must be open on its first screen.
 */
export async function fillTo(page, to, { pick = [0, 1] } = {}) {
  const order = ['goal', 'cons', 'opps', 'opts', 'will', 'steps', 'sum'];
  const stop = order.indexOf(to);
  await onQuestion(page, 'What do you want to achieve?');
  await page.locator('.ds-guide-body .ds-text').first().fill(M9.goal);
  if (stop === 0) return;
  await pressNext(page);
  await onQuestion(page, 'What’s in the way of');
  await typeRows(page, M9.cons, 'constraint');
  if (stop === 1) return;
  await pressNext(page);
  await onQuestion(page, 'What’s already working');
  await typeRows(page, M9.opps, 'opportunity');
  if (stop === 2) return;
  await pressNext(page);
  await onQuestion(page, 'What could you do to reach');
  await typeRows(page, M9.opts, 'option');
  if (stop === 3) return;
  await pressNext(page);
  await onQuestion(page, 'Which options will you act on?');
  for (const k of pick) await page.locator('.ds-answer').nth(k).click();
  if (stop === 4) return;
  await pressNext(page);
  await onQuestion(page, 'What exactly will you do?');
  for (let j = 0; j < pick.length; j += 1) if (M9.acts[j]) await page.locator('.ds-nextstep .ds-text').nth(j).fill(M9.acts[j]);
  if (stop === 5) return;
  await pressNext(page);
  await onQuestion(page, 'Here’s your plan');
}

// ------------------------------------------------------------ guest stand-ins
export const GUEST_TOKEN = 'a1'.repeat(32);
export const GUEST_VISIT = 'b2'.repeat(32);

/**
 * Answers the guest functions as migrations 035, 042 and 044 would (checked
 * against the SQL and tests/rules/guests.mjs), keeping the saved rows in
 * memory. `opts.missing` answers as a database that hasn't run 035 yet;
 * `opts.no044` as one with 035 and 042 but not 044 (no sharing functions).
 * Returns { rows, calls, shared } to read what the page asked for; `shared`
 * is the link's shared_with_coach (044), and `coachReads()` answers as
 * coach_guest_answers would (false: refused with 42501).
 */
/** The 6-digit code the stand-in's server 'emails' a guest (046). */
export const GUEST_EMAIL_CODE = '482913';

export async function guestStandIn(context, opts = {}) {
  const state = { rows: [], calls: [], finished: false, copies: 0, codes: 0, shared: true, hidden: false, confirmed: false, coachReads: () => state.shared };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route(/\/rest\/v1\/rpc\/guest_[a-z_]+/, async (route) => {
    const name = /rpc\/(guest_[a-z_]+)/.exec(route.request().url())[1];
    let args = {};
    try { args = JSON.parse(route.request().postData() || '{}'); } catch { /* none */ }
    state.calls.push({ name, args });
    if (opts.missing) {
      return json(route, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${name} in the schema cache` }, 404);
    }
    if (name === 'guest_link_info') {
      return json(route, args.p_token === GUEST_TOKEN ? { ok: true, tool: 'grow', tool_label: 'Get unstuck', coach_name: M9.coach, open: true } : { ok: false });
    }
    if (name === 'guest_open') {
      const right = args.p_token === GUEST_TOKEN && String(args.p_email).trim().toLowerCase() === M9.guestEmail && String(args.p_code).trim().toUpperCase() === M9.guestCode;
      if (!right) return json(route, { ok: false, error: 'invalid', message: 'That link, email or code isn\'t right. Check them and try again.' });
      // 046: a link chosen Only you that holds earlier answers hides them until the email is confirmed
      state.hidden = !opts.no046 && !state.shared && state.rows.length > 0;
      state.confirmed = false;
      return json(route, { ok: true, visit: GUEST_VISIT, tool: 'grow', tool_label: 'Get unstuck', coach_name: M9.coach, link_expires_at: '2026-12-14T10:00:00+00:00', confirmed: false, ...(opts.no046 ? {} : { earlier_hidden: state.hidden }) });
    }
    if (args.p_visit !== GUEST_VISIT) return json(route, { code: '42501', details: null, hint: null, message: 'That visit has ended. Open your link again.' }, 403);
    if (name === 'guest_email_confirm') {
      if (String(args.p_code) !== GUEST_EMAIL_CODE) return json(route, { ok: false, error: 'invalid', message: 'That code isn\'t right, or it has run out. Ask for a new one and try again.' });
      state.confirmed = true;
      return json(route, { ok: true });
    }
    if (name === 'guest_rows') {
      if (state.hidden && !state.confirmed) return json(route, []);
      return json(route, state.rows.map((r) => ({ ...r, _from: { link_id: '11111111-1111-4111-8111-111111111111', tool: 'grow', coach_first_name: M9.coach } })));
    }
    if (name === 'guest_save') {
      const row = args.p_row || {};
      const now = new Date().toISOString();
      const at = state.rows.findIndex((r) => r.id === row.id);
      const saved = { created_at: now, ...(at >= 0 ? state.rows[at] : {}), ...row, tool_type: 'grow', updated_at: now };
      if (at >= 0) state.rows[at] = saved; else state.rows.push(saved);
      return json(route, saved);
    }
    if (name === 'guest_finish') { state.finished = true; return json(route, true); }
    if (name === 'guest_sharing' || name === 'guest_set_sharing') {
      if (opts.no044) return json(route, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${name} in the schema cache` }, 404);
      if (name === 'guest_set_sharing') {
        if (typeof args.p_shared !== 'boolean') return json(route, { code: '22023', message: 'Choose Only you or You and your coach, then try again.' }, 400);
        state.shared = args.p_shared;
        // 044 writes the choice into the link's saved items too (_guest_share_items)
        state.rows = state.rows.map((r) => ({ ...r, form_data: { ...(r.form_data || {}), shared_with_coach: state.shared } }));
      }
      return json(route, { ok: true, shared_with_coach: state.shared });
    }
    if (name === 'guest_delete_link_answers') { const n = state.rows.length; state.rows = []; state.finished = false; return json(route, n); }
    return json(route, { code: 'PGRST202', message: 'no such function' }, 404);
  });
  return state;
}

export const guestApi = (state, { sent = true } = {}) => (route) => {
  if (/\/api\/guest-copy/.test(route.request().url())) {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* none */ }
    // 046: the code that shows earlier answers, emailed by the server (here: GUEST_EMAIL_CODE)
    if (body.kind === 'code') {
      state.codes += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent }) });
    }
    state.copies += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent }) });
  }
  return route.abort();
};

export async function guestStart(page) {
  await page.goto(`${APP}/guest/${GUEST_TOKEN}?email=${encodeURIComponent(M9.guestEmail)}`);
  await page.waitForSelector('.ds-guest-title', { timeout: 20000 });
}
export async function guestOpenTool(page) {
  await guestStart(page);
  await page.getByLabel('Access code').fill(M9.guestCode);
  await page.getByRole('button', { name: 'Start my plan' }).click();
  await onQuestion(page, 'What do you want to achieve?');
}

/**
 * The add panel ("Add to-do"), open: picks the first Strategy, then
 * where it should go ('This week', 'Backlog' or 'Don’t add it'), and
 * presses the panel's button.
 */
export async function addPanel(page, where = 'This week') {
  const panel = page.locator('[role=dialog]:not(.ds-guide)').last();
  await panel.waitFor({ timeout: 10000 });
  await sleep(500);
  await panel.getByRole('radio', { name: where, exact: true }).or(panel.getByRole('button', { name: where, exact: true })).first().click();
  if (where !== 'Don’t add it') {
    // M9: How much chosen (it starts unchosen), then the Strategy in the
    // branded drop-down. On a phone the drop-down opens as a panel of its
    // own, so How much is chosen first, while the add panel is the last one.
    const medium = panel.getByRole('radio', { name: 'Medium', exact: true }).or(panel.getByRole('button', { name: 'Medium', exact: true }));
    if (await medium.count()) await medium.first().click();
    const dd = panel.locator('[aria-haspopup=listbox]');
    if (await dd.count()) {
      await dd.first().click();
      await page.locator('[role=option]').first().click();
      await sleep(500);
    } else {
      const rows = panel.locator('.ds-answer');
      if (await rows.count()) await rows.first().click();
    }
  }
  await panel.locator('.ds-btn--primary').click();
  if (!(await until(async () => (await page.locator('[role=dialog]:not(.ds-guide)').count()) === 0, 8000))) {
    throw new Error(`the add panel stayed open: ${(await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}

/** The page is told the person's coach is Tim, as in M9 (my_coach's own shape; nothing in the database changes). */
export async function withCoach(context, firstName = M9.coach) {
  await context.route(/\/rest\/v1\/rpc\/my_coach/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ coach_id: '22222222-2222-4222-8222-222222222222', first_name: firstName, away_until: null, mobile: null, contact_ways: ['email'] }]),
  }));
}

// ------------------------------------------------------------ M10 Visual tools
// Shared by the Team performance check's suites (and the Emotional wash's,
// when it is built): M10's own file, its invented team, and the steps
// through the built tool.
export const M10_FILE = process.env.M10_FILE || `${homedir()}/Downloads/clarity-phase-8a/m10-visual-tools.html`;

/** M10's invented direct reports: [now, at the last check], 1 to 5 (lowest first). */
export const M10 = {
  coach: 'Tim',
  lastMonth: 'October',
  people: [
    { name: 'Priya Shah', first: 'Priya', role: 'Head of Operations', t: [5, 4], a: [4, 3], u: [4, 4] },
    { name: 'Tom Ellis', first: 'Tom', role: 'Sales Director', t: [2, 4], a: [4, 4], u: [3, 3] },
    { name: 'Grace Okafor', first: 'Grace', role: 'Finance Lead', t: [5, 5], a: [5, 4], u: [2, 2] },
    { name: 'Daniel Reyes', first: 'Daniel', role: 'Product Lead', t: [4, 4], a: [2, 2], u: [4, 4] },
    { name: 'Leila Haddad', first: 'Leila', role: 'People Lead', t: [3, 3], a: [2, 2], u: [2, 1] },
  ],
};

export const TEAM_PATH = '/team-performance-check';
export const title = (page) => page.locator('.ds-guide-title').first();
export const panel = (page) => page.locator('[role=dialog]:not(.ds-guide)').last();
export const panelGone = (page, ms = 8000) => until(async () => (await page.locator('[role=dialog]:not(.ds-guide)').count()) === 0, ms);

/** A saved Team performance check as the app keeps it (savedAnswers), for seeding the device. `which` 0 is now, 1 the last check. */
export function m10Answers(which = 0, { last = null, ids = null } = {}) {
  return {
    version: 1,
    people: M10.people.map((p, i) => ({ id: ids?.[i] || `m10-person-${i + 1}`, name: p.name, role: p.role, trust: p.t[which], alignment: p.a[which], autonomy: p.u[which] })),
    last,
  };
}

/**
 * Puts a finished check from October on the device (as a check saved
 * before migration 043 has run is kept), so the next one has a last check.
 * The page must be signed in. Returns the person's id.
 */
export async function seedLastCheck(page, { at = '2026-10-14T09:00:00.000Z', id = '55555555-5555-4555-8555-555555555555' } = {}) {
  return page.evaluate(({ at: when, id: rid, answers }) => {
    let uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
    if (!uid) { try { uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id; } catch { /* none */ } }
    const key = `clarity-cache:${uid}:tool-answers`;
    let map = {};
    try { map = JSON.parse(localStorage.getItem(key))?.v || {}; } catch { /* none */ }
    map[rid] = { id: rid, tool: 'team_check', title: 'October team check', status: 'completed', answers, shared: false, createdAt: when, updatedAt: when, finishedAt: when, sent: false };
    localStorage.setItem(key, JSON.stringify({ v: map, at: Date.now() }));
    return uid;
  }, { at, id, answers: m10Answers(1) });
}

/**
 * The test client's saved rows of one tool are taken off the database
 * (migration 043's tool_answers, on the test project since 16 Nov), so a run
 * never starts with an earlier run's checks or washes. Only this tool's rows
 * of the test client are touched; before 043 there is no table, and nothing to do.
 */
export async function clearToolRows(db, me, tool) {
  const { error } = await db.from('tool_answers').delete().eq('user_id', me).eq('tool', tool);
  if (error && !/^(PGRST205|42P01)$/.test(error.code || '')) throw new Error(`tool_answers: ${error.code}`);
}

/** Everything the Team performance check keeps on this device is taken off. */
export async function clearTeamCheck(page) {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/team-check|:tool-answers$/.test(k)) localStorage.removeItem(k); });
}

/** Adds one person through the "Add person" panel. */
export async function addPerson(page, name, role = '') {
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  const p = panel(page);
  await p.waitFor({ timeout: 10000 });
  await p.getByLabel('What’s their name?').fill(name);
  if (role) await p.getByLabel('What’s their role?').fill(role);
  await sleep(450);
  await p.getByRole('button', { name: 'Add this person' }).click();
  await panelGone(page);
}

/**
 * Answers the three questions for each of M10's people in turn, from the
 * first question on screen, as far as the results ("Your team").
 * `stopAfter`: how many questions to answer before stopping (all by default).
 */
export async function rateTeam(page, { stopAfter = Infinity, people = M10.people } = {}) {
  let n = 0;
  for (const p of people) {
    for (const [kind, starts] of [['t', 'How much does'], ['a', 'How well does'], ['u', 'How much autonomy does']]) {
      if (n >= stopAfter) return;
      await until(async () => { const q = await questionText(page); return q.startsWith(starts) && q.includes(p.name); }, 15000);
      await sleep(450);
      await page.locator('.ds-guide-body .ds-answer').nth(p[kind][0] - 1).click();
      n += 1;
    }
  }
  await title(page).waitFor({ timeout: 15000 });
}

// ------------------------------------------------------------ M10's Emotional wash
export const WASH_PATH = '/emotional-wash';

/** M10's own invented wash (its script's `A`). */
export const EW = {
  what: 'The chair backed the board member who undermined my plan in front of everyone.',
  kind: 'Present angst',
  words: ['Disappointment', 'Anger', 'Contempt'],
  rel: ['Respect', 'Loyalty'],
  thoughts: ['The chair has never rated me.', 'If I push back, I’ll look weak.', 'I need to win the board back before the next meeting.'],
  step: 'Ask the chair for 20 minutes before the next board meeting.',
  question: 'What would show me where I stand with the chair?',
};

/**
 * M10's wash as the tool keeps it while it is open. `at`: how far it has
 * got, as M10 draws each screen: 'steps' (the first thought judged not
 * true and parked with no question yet, the second not washed, the third
 * acted on) or 'sum' (every screen answered, the second thought trashed,
 * the step's to-do in this week).
 */
export function m10Wash(at = 'steps') {
  const sum = at === 'sum';
  const th = (id, text, more) => ({ id, text, t: null, l: null, h: null, wash: null, step: '', question: '', where: null, strategyId: null, ...more });
  return {
    what: EW.what,
    kind: 'pa',
    words: [...EW.words],
    rel: [...EW.rel],
    thoughts: [
      th('m10-thought-1', EW.thoughts[0], { t: 'no', l: sum ? 'unsure' : null, h: sum ? 'no' : null, wash: 'park', question: sum ? EW.question : '' }),
      th('m10-thought-2', EW.thoughts[1], sum ? { t: 'unsure', l: 'no', h: 'no', wash: 'trash' } : {}),
      th('m10-thought-3', EW.thoughts[2], { t: sum ? 'yes' : null, l: sum ? 'yes' : null, h: sum ? 'yes' : null, wash: 'act', step: EW.step, where: 'week' }),
    ],
    todos: sum ? { 'm10-thought-3': { id: '99999999-9999-4999-8999-999999999999', text: EW.step, where: 'week', strategyId: null } } : {},
  };
}

/**
 * The seeded wash's to-do (m10Wash('sum')) is told to the page as one of
 * this week's, as M10 draws it: the tool asks the sprint's own rows where
 * each of its to-dos is now, and one it has never heard of has gone
 * (14 Nov). Only the answer to the page changes; nothing is written.
 */
export const SEEDED_TODO = '99999999-9999-4999-8999-999999999999';
export async function withSeededTodo(context) {
  await context.route(/\/rest\/v1\/todos\?/, async (route) => {
    const req = route.request();
    // The sprint's own read (sprint_id=eq.…), or since the scale check (fixer C, pageReads.js runningTodosRead)
    // the running sprint's to-dos read in one round with the sprint joined (sprints!inner).
    const asked = /sprint_id=eq\.([0-9a-f-]{36})/.exec(req.url())?.[1];
    const joined = /sprints(%21|!)inner/.test(req.url());
    if (req.method() !== 'GET' || (!asked && !joined)) return route.fallback();
    const res = await route.fetch();
    let rows = null;
    try { rows = await res.json(); } catch { /* not rows */ }
    if (!res.ok() || !Array.isArray(rows)) return route.fulfill({ response: res });
    const sprint = asked || rows.find((r) => r.sprint_id)?.sprint_id;
    if (!sprint) return route.fulfill({ response: res });
    const row = { id: SEEDED_TODO, strategy_id: rows[0]?.strategy_id ?? null, text: EW.step, impact: 2, sprint_id: sprint, planned_week: 1, created_on: '2026-01-01', done_on: null, source: 'other_tool', source_id: null, move_on: null, deleted_at: null, updated_at: new Date().toISOString() };
    return route.fulfill({ response: res, json: [...rows.filter((r) => r.id !== SEEDED_TODO), row] });
  });
}

/** The place of each screen in the tool, with M10's three thoughts typed. */
export const WASH_INDEX = { what: 0, kind: 1, words: 2, rel: 3, story: 4, true: 5, logical: 6, helpful: 7, wash1: 8, wash2: 12, wash3: 16, sum: 17 };

/** Everything the Emotional wash keeps on this device is taken off. */
export async function clearWash(page) {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/emotional-wash|:tool-answers$/.test(k)) localStorage.removeItem(k); });
}

/**
 * Puts a wash on the device as the tool itself keeps one while it is open,
 * with the screen it was left on, so the tool opens there. The page must
 * be signed in and away from the tool (or the screen before rewrites it).
 */
export async function seedWash(page, { wash, index = 0, id = '88888888-8888-4888-8888-888888888888' }) {
  await page.evaluate(({ w, at, rid }) => {
    let uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
    if (!uid) { try { uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id; } catch { /* none */ } }
    localStorage.setItem(`clarity-draft:${uid}:emotional-wash:new`, JSON.stringify({ v: { id: rid, wash: w, status: 'new', saved: false, createdAt: null, finishedAt: null }, at: Date.now() }));
    localStorage.setItem(`ds-guide:emotional-wash-${uid}-new`, JSON.stringify({ index: at, skipped: [] }));
    // The table isn't on the test project yet (migration 043): not asked about on every screen.
    localStorage.setItem('clarity-tool-answers-not-yet', String(Date.now()));
  }, { w: wash, at: index, rid: id });
}
