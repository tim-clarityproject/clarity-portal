// Phase 5 step 1: the Hardware and Software check-in (mock-up M12 v14) in
// the running app, signed in as the invented test client on the TEST
// database only (every other host, /functions/v1/ and every email call is
// blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase5/checkin.mjs [folder]
//
// A  The monthly check-in (no coach): Home's quiet line, the opening
//    screen, one tap moving on, the % bar, Back, a draft surviving a reload
//    (on the device and in the database), the travel pair after a Yes, the
//    results against the seeded last month (every figure checked against
//    src/lib/scores through checkin.js), the graph and Show as a table, Add
//    to my sprint (as a habit, in the database), Finish, Home's line gone,
//    My Reviews' row, and the saved results page.
// D  Measured against M12's frames at 1280, 390 and 360px, dark and light:
//    one coral button, 44px taps, no coral data marks, mint for rises, no
//    keys, no sideways scrolling, the writing rules, M12's words verbatim,
//    and the sizes M12 draws (question, statement, answer rows, % bar).
// B  Offline: after one visit, the whole check-in done with no connection,
//    then back online it is sent and finished exactly once.
// C  The First check-in (a coach, Tim, as my_coach answers): the opening
//    screen and its ⓘ, the goals with See an example, Do this later and
//    Home's question, carrying on where it was left, Your starting point
//    and My goals, and the coach's flag in the database when the test
//    client has a real coach.
//
// Everything this test adds is deleted at the end, and any check-in rows
// for the two months it uses are put back as they were.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  HARDWARE_SOFTWARE, QUESTIONS, TIPS, checkinMonth, checkinResults, monthName, cleanAnswers,
} from '../../src/lib/performance/checkin.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCK = process.env.M12 || '/private/tmp/claude-501/-Users-timdutton-code-clarity-portal/bce8960b-2199-451f-aa9d-71dcc5d6bbcb/scratchpad/mock/m12-check-in.html';
const MOCK_FULL = join(homedir(), 'Downloads', 'clarity-phase-5', 'm12-check-in.html');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || join(process.cwd(), 'tmp-phase5-checkin');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(n);

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(250);
  }
  return v;
}

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

// The months: this one (the device's own, London) and the one before.
const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUR = checkinMonth(londonToday);
const prevDate = new Date(Date.UTC(Number(CUR.slice(0, 4)), Number(CUR.slice(5, 7)) - 2, 1));
const PREV = `${prevDate.toISOString().slice(0, 7)}-01`;
const CUR_PATH = `/check-in/${CUR.slice(0, 7)}`;

// What the database held for those months, put back at the end.
const { data: before } = await db.from('checkins').select('*').eq('user_id', me).in('month', [CUR, PREV]);
const added = { habits: [], todos: [] };
const { data: coachRows } = await db.rpc('my_coach');
const realCoach = Array.isArray(coachRows) ? coachRows[0] : coachRows;
const { data: running } = await db.from('sprints').select('id, number').eq('user_id', me).eq('status', 'running').limit(1);
const sprint = running?.[0] || null;
// Finished check-ins in other months would make this a monthly one, not the First.
const { data: others } = await db.from('checkins').select('month').eq('user_id', me).eq('status', 'finished').not('month', 'in', `(${CUR},${PREV})`);
results.push(`NOTE  months ${PREV} and ${CUR}; real coach: ${realCoach ? 'yes' : 'no'}; running sprint: ${sprint ? `Performance Sprint ${sprint.number}` : 'none'}`);

async function clearMonths(...months) {
  await db.from('checkins').delete().eq('user_id', me).in('month', months);
}
async function cleanUp() {
  await clearMonths(CUR, PREV);
  if (before?.length) {
    await db.from('checkins').insert(before.map(({ hardware_score: _h, software_score: _s, area_scores: _a, methods_version: _m, ...r }) => r));
  }
  for (const id of added.habits) await db.from('sprint_habits').delete().eq('id', id).eq('user_id', me);
  for (const id of added.todos) await db.from('todos').delete().eq('id', id).eq('user_id', me);
}

// Last month, as the results compare with it: stress Often, low energy, poor health, so this month rises.
const PREV_ANS = { H1: 'h6_7', H2: 'ok', H3: 'often', H4: 'under_1', H5: 'd1', H6: 'h8_10', H7: 'ok', H8: 'u8_14', H9: 'monthly', H10: 'ok', H11: 'low', H12: 'poor', H13: 'a_little', H14: 'no', S1: 'sometimes', S2: 'sometimes', S3: 'rarely', S4: 'often', S5: 'often', S6: 'sometimes' };
// This month's taps (by the words people see). Movement stays lowest.
const NOW_WORDS = {
  H1: '7 to 8 hours', H2: 'Good', H3: 'Sometimes', H4: 'Under 1 hour', H5: '1 day', H6: '8 to 10 hours', H7: 'Fair', H8: '8 to 14 units', H9: 'Monthly',
  H10: 'High', H11: 'OK', H12: 'Good', H13: 'A little', H14: 'Yes', H15: '2', H16: 'Well', S1: 'Often', S2: 'Sometimes', S3: 'Sometimes', S4: 'Often', S5: 'Often', S6: 'Sometimes',
};
const byWords = (code, words) => QUESTIONS.find((q) => q.code === code).options.find((o) => o.label === words).value;
const NOW_ANS = Object.fromEntries(Object.entries(NOW_WORDS).map(([k, w]) => [k, byWords(k, w)]));

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const writes = []; // every write to checkins, for "sent once"

async function newContext({ width = 1280, mode = 'dark', coach = null } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (/\/rest\/v1\/rpc\/my_coach$/.test(url.split('?')[0])) {
      const body = coach ? [{ coach_id: '00000000-0000-4000-8000-000000000001', first_name: coach, mobile: null, contact_ways: [], away_until: null }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (/\/rest\/v1\/checkins/.test(url) && ['POST', 'PATCH'].includes(route.request().method())) writes.push({ at: Date.now(), body: route.request().postData() || '' });
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
  // Signing in can open the "welcome back" screen first: Home itself after it.
  await home(c.page);
  return c;
}
const path = (page) => new URL(page.url()).pathname;
const text = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).trim() : '');
// The words as written (a Nekst title shows in capitals).
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').count()) ? (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim() : '');
const pct = async (page) => Number((await text(page, '.ds-guide-pct-text')).replace('%', '')) || 0;
async function shot(page, name) { await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }).catch(() => {}); }
const toastSeen = (page, words) => until(async () => (await page.locator('.ds-toast-text', { hasText: words }).count()) > 0, 8000);
const qOf = (h, statement) => QUESTIONS.find((q) => q.question === h && (!q.statement || q.statement === statement));
async function currentQuestion(page) {
  const h = await heading(page);
  const st = await text(page, '.ds-statement');
  return qOf(h, st.replace(/^“|”$/g, '')) || null;
}
async function tapAnswer(page, words) {
  const before = await heading(page) + (await text(page, '.ds-statement'));
  await page.locator('.ds-guide-body [role=radio]', { hasText: new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
  // One tap moves on (M12: 380ms).
  return until(async () => (await heading(page)) + (await text(page, '.ds-statement')) !== before, 4000);
}
// The coral button, past the tool's double-tap guard (400ms after a move).
async function nextStep(page) {
  await sleep(450);
  await page.locator('.ds-guide-next').click();
}
async function home(page) {
  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
  await until(async () => (await page.locator('.home-page .ds-loading').count()) === 0, 20000);
  await sleep(1200);
}

// ------------------------------------------------------------ what is measured (as tests/phase4/compare.mjs)
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)', 'rgb(185, 61, 43)'];
const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];
const BANNED = ['journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'synergy', 'wellness', 'self-care', 'failed', 'fail', 'missed', 'behind', 'sorted', 'crack on', 'reckon', 'submit', 'click', 'tap', 'purpose', 'intake', 'hrs', 'wks', 'min', 'about \\d+ minutes', 'support, any time', 'hardware first', 'weakest'];
function measure({ CORAL, MINT, BANNED }) {
  const root = document.querySelector('.ds-guide') || document.querySelector('.plan-page') || document.body;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const style = document.createElement('style');
  style.textContent = '.ds-sr, [hidden], [inert], .ds-tip[hidden] { display: none !important; }';
  document.head.appendChild(style);
  const lines = root.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  style.remove();
  const buttons = [...root.querySelectorAll('button, a, [role=button]')].filter(vis);
  const coralButtons = buttons.filter((el) => CORAL.includes(getComputedStyle(el).backgroundColor)).map(label);
  const small = [];
  for (const el of root.querySelectorAll('button, a, input, textarea, [role=radio], [role=switch]')) {
    if (!vis(el) || el.disabled) continue;
    const b = el.getBoundingClientRect();
    if (b.height >= 43.5 && b.width >= 43.5) continue;
    if (el.closest('label') && el.tagName !== 'INPUT') continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  const marks = [];
  for (const el of root.querySelectorAll('.ds-cchart *, .ds-bar *, .ds-guide-pct *, .ck-improved i')) {
    if (!vis(el)) continue;
    const st = getComputedStyle(el);
    for (const c of [st.backgroundColor, el instanceof SVGElement ? st.fill : null, el instanceof SVGElement ? st.stroke : null]) {
      if (c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)') marks.push({ el: label(el), c, coral: CORAL.includes(c), mint: MINT.includes(c) });
    }
  }
  const keys = [...root.querySelectorAll('[class]')].filter((el) => vis(el) && /(^|\s|-)(legend|key|chart-key)(\s|$|-)/.test(String(el.className?.baseVal ?? el.className))).map(label);
  const writing = [];
  for (const l of lines) {
    if (/^For example: /.test(l)) continue;
    // M12's fold line, word for word ("Lowest: Movement 45/100"): a label, one of the few colons allowed (writing rule 26).
    if (/^Lowest: [A-Z][a-z ]+ \d+\/100$/.test(l)) continue;
    const plain = l.replace(/\be\.g\. /gi, 'eg ').replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    if (/[()[\]]/.test(l)) writing.push(`brackets: ${l}`);
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    if (/…/.test(l)) writing.push(`cut off: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(l.toLowerCase().replace(/[’']/g, "'"))) writing.push(`banned "${w}": ${l}`);
  }
  for (const b of buttons) {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    // An answer row isn't an action: M12's "OK" answers stay (rule 13 is about action words).
    if (b.matches('[role=radio]')) continue;
    if (/\b(I|me|Submit|OK|Go)\b/.test(t)) writing.push(`button words: ${t}`);
  }
  const probe = document.createElement('span');
  (root.closest('.ui-root') || document.querySelector('.ui-root')).appendChild(probe);
  probe.style.color = 'var(--good)';
  const good = getComputedStyle(probe).color;
  probe.remove();
  const ups = [...root.querySelectorAll('.ck-up')].map((el) => getComputedStyle(el).color);
  const dots = [...root.querySelectorAll('.ck-improved i')].map((el) => getComputedStyle(el).backgroundColor);
  const upDots = [...root.querySelectorAll('.ds-cchart-dot--up')].map((el) => getComputedStyle(el).fill);
  return {
    lines, coralButtons, small, coralMarks: [...new Set(marks.filter((m) => m.coral).map((m) => `${m.el} ${m.c}`))], keys, writing,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    good, mintOk: [...ups, ...dots, ...upDots].every((c) => c === good && MINT.includes(c)), mintCount: ups.length + dots.length + upDots.length,
    sizes: {
      question: parseFloat(getComputedStyle(document.querySelector('.ds-guide-question') || document.body).fontSize),
      statement: document.querySelector('.ds-statement') ? parseFloat(getComputedStyle(document.querySelector('.ds-statement')).fontSize) : null,
      answer: document.querySelector('.ds-guide-body [role=radio]') ? Math.round(document.querySelector('.ds-guide-body [role=radio]').getBoundingClientRect().height) : null,
      bar: document.querySelector('.ds-guide-pct-track') ? Math.round(document.querySelector('.ds-guide-pct-track').getBoundingClientRect().height) : null,
    },
    theme: document.documentElement.getAttribute('data-theme'),
  };
}
const checkScreen = async (page, name, { coral = 1 } = {}) => {
  await sleep(500);
  const m = await page.evaluate(measure, { CORAL, MINT, BANNED });
  pass(`${name}: ${coral} coral button`, m.coralButtons.length === coral, m.coralButtons.join(', '));
  pass(`${name}: 44px taps`, !m.small.length, m.small.join('; '));
  pass(`${name}: no coral data marks`, !m.coralMarks.length, m.coralMarks.join('; '));
  pass(`${name}: no keys`, !m.keys.length, m.keys.join('; '));
  pass(`${name}: no sideways scrolling`, m.sideways <= 0, m.sideways);
  pass(`${name}: the writing rules`, !m.writing.length, m.writing.join(' | '));
  if (m.mintCount) pass(`${name}: rises in mint (${m.good})`, m.mintOk);
  await shot(page, name.replace(/[^a-z0-9]+/gi, '-'));
  return m;
};

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  await cleanUp().catch(() => {});
  console.log(results.join('\n'));
  console.log(`\n${results.length - failures - results.filter((r) => r.startsWith('NOTE')).length} of ${results.length - results.filter((r) => r.startsWith('NOTE')).length} passed`);
  process.exit(1);
});

// ---------------------------------------------------------------- A: the monthly check-in
await clearMonths(CUR, PREV);
await db.from('checkins').insert({ user_id: me, kind: 'monthly', month: PREV, status: 'finished', answers: PREV_ANS });

if (part('A')) {
  const { context, page } = await signedIn({ width: 1280, mode: 'dark', coach: null });
  try {
    await home(page);
    const line = page.locator('.ds-quiet-row', { hasText: 'Ready for your monthly check-in?' });
    pass('Home: "Ready for your monthly check-in?"', (await line.count()) === 1, await text(page, '.ds-quiet'));
    pass('Home: ~3 minutes', (await line.locator('.ds-quiet-time').innerText().catch(() => '')) === '~3 minutes');
    await line.locator('button', { hasText: 'Start my check-in' }).click();
    pass('the line opens the check-in', Boolean(await until(async () => path(page) === '/check-in')));
    await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
    pass('opening: "Ready to look back on your month?"', (await heading(page)) === 'Ready to look back on your month?', await heading(page));
    pass('opening: ~3 minutes', (await text(page, '.ds-guide-label')) === '~3 minutes', await text(page, '.ds-guide-label'));
    pass('opening: "Answer for the past month, on average."', (await text(page, '.ds-guide-nudge')) === 'Answer for the past month, on average.');
    pass('opening: no Skip', (await page.locator('.ds-guide-skip').count()) === 0);
    pass('opening: never last month’s scores before answering (rule 50)', !/\/100|last month/i.test(await text(page, '.ds-guide-page')));
    await page.locator('button', { hasText: 'Who sees my answers?' }).click();
    pass('Who sees my answers? (no coach)', (await text(page, '.ck-who-lines')).replace(/\n+/g, '|') === 'Only you see your answers.|Your organisation never sees them.', await text(page, '.ck-who-lines'));
    pass('opening: Monthly check-in in the top bar', (await text(page, '.ds-guide-name')).toLowerCase() === 'monthly check-in');
    await checkScreen(page, 'A opening 1280 dark');
    await page.locator('.ds-guide-next').click();
    await until(async () => (await currentQuestion(page))?.code === 'H1');
    pass('Start my check-in opens the first question', (await currentQuestion(page))?.code === 'H1', await heading(page));
    pass('H1: the eye under the answers says Only you', (await text(page, '.ck-eye')).includes('Only you'));

    const seen = [];
    const percents = [await pct(page)];
    let travelAt = -1;
    let reloaded = false;
    let backed = false;
    for (let guard = 0; guard < 30; guard += 1) {
      const q = await currentQuestion(page);
      if (!q) break;
      seen.push(q.code);
      if (q.code === 'H8') {
        await page.locator('button', { hasText: 'What’s a unit?' }).click();
        pass('H8: What’s a unit? opens the units guide', (await text(page, '.ck-units')).startsWith('One unit is 10ml of pure alcohol.'));
        await checkScreen(page, 'A H8 units open 1280 dark');
        await page.locator('.ds-guide-label .ds-guide-i').hover();
        pass('H8: the ⓘ starts by saying what it is', (await until(async () => (await text(page, '.ds-infopop:not([hidden])')).startsWith('Alcohol counts in Fuel and alcohol'), 3000)) || false);
        await page.mouse.move(5, 5);
      }
      if (q.code === 'S1') await checkScreen(page, 'A S1 statement 1280 dark');
      if (q.code === 'H5' && !backed) {
        backed = true;
        await sleep(500); // past the tool's double-tap guard (400ms)
        await page.locator('.ds-guide-back').click();
        await until(async () => (await currentQuestion(page))?.code === 'H4');
        pass('Back: the question before, with its answer kept', (await page.locator('.ds-guide-body [role=radio][aria-checked=true]').innerText().catch(() => '')) === NOW_WORDS.H4);
        await tapAnswer(page, NOW_WORDS.H4);
        pass('the same answer again moves on', (await currentQuestion(page))?.code === 'H5');
        seen.pop();
        continue;
      }
      if (q.code === 'H10' && !reloaded) {
        reloaded = true;
        await sleep(1500); // the last answer's save
        const { data: draft } = await db.from('checkins').select('status, answers').eq('user_id', me).eq('month', CUR).limit(1);
        pass('draft: saved in the database as it goes', draft?.[0]?.status === 'draft' && Object.keys(draft[0].answers || {}).length >= 9, JSON.stringify(draft?.[0]?.answers));
        await page.reload();
        await sleep(500);
        await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
        pass('draft: a reload carries on at the same question', (await currentQuestion(page))?.code === 'H10', await heading(page));
        await sleep(500);
        await page.locator('.ds-guide-back').click();
        await until(async () => (await currentQuestion(page))?.code === 'H9');
        pass('draft: the answers so far are kept', (await page.locator('.ds-guide-body [role=radio][aria-checked=true]').innerText().catch(() => '')) === NOW_WORDS.H9);
        await tapAnswer(page, NOW_WORDS.H9);
      }
      const moved = await tapAnswer(page, NOW_WORDS[q.code]);
      percents.push(await pct(page));
      if (q.code === 'H14') travelAt = percents.length - 1;
      if (!moved) { pass(`${q.code}: one tap moves on`, false); break; }
      if ((await heading(page)) === 'Your month') break;
    }
    pass('every question once, travel after a Yes (22 screens)', seen.length === 22 && seen.includes('H15') && seen.includes('H16'), seen.join(','));
    // Yes to travel adds its two questions, so the bar steps back once there (as M12's does).
    pass('the % bar only goes up, but for the travel pair', percents.every((v, i) => i === 0 || i === travelAt || v >= percents[i - 1]), percents.join(','));
    pass('no "Last one" (rule 46)', !(await page.locator('text=Last one').count()));

    // Results, every figure from src/lib/scores through checkin.js.
    const want = checkinResults({ answers: NOW_ANS, previous: { answers: PREV_ANS } });
    await until(async () => (await heading(page)) === 'Your month');
    pass('results: "Your month"', (await heading(page)) === 'Your month', await heading(page));
    pass('results: "Here’s how this month compares with last month."', (await text(page, '.ds-guide-nudge')) === 'Here’s how this month compares with last month.');
    const stats = await page.locator('.ck-scores .ds-stat').allInnerTexts();
    pass(`results: Hardware score ${want.hardware.value}/100 and its change`, stats[0]?.replace(/\s+/g, ' ').includes(`Hardware score ${want.hardware.value}/100 ${want.hardware.change.text}`), stats[0]);
    pass(`results: Software score ${want.software.value}/100 and its change`, stats[1]?.replace(/\s+/g, ' ').includes(`Software score ${want.software.value}/100 ${want.software.change.text}`), stats[1]);
    const improved = await page.locator('.ck-improved li').allInnerTexts();
    pass('results: what improved, up to three, biggest first', JSON.stringify(improved) === JSON.stringify(want.improved.map((x) => x.line)), `${improved} vs ${want.improved.map((x) => x.line)}`);
    pass(`results: one thing to work on is ${want.workOn.name}`, (await text(page, '.ck-one-area')) === want.workOn.name && (await text(page, '.ck-one-tip')) === want.workOn.tip[0]);
    pass('results: the graph has 4 dots with pop-ups and a travel ring', (await page.locator('.ds-cchart-dot[data-tip]').count()) === 4 && (await page.locator('.ds-cchart-trip[data-tip]').count()) === 1);
    pass('results: each line named at its end, no key', (await page.locator('.ds-cchart-end').allTextContents()).join('|') === `Hardware ${want.hardware.value}|Software ${want.software.value}`);
    await page.locator('.ds-ctable-fold .ds-collapse-head').click();
    pass('results: Show as a table', (await page.locator('.ds-ctable tbody tr').count()) === 2);
    await page.locator('.ck-fold .ds-collapse-head').first().click();
    pass('results: Hardware areas fold, lowest first in its line', (await text(page, '.ck-fold-line')) === want.hardwareAreas.lowest && (await page.locator('.ck-area').count()) >= 6);
    pass('results: no Support, any time, and no note (rule 51)', !/support|samaritans|nhs/i.test(await text(page, '.ds-guide-page')));
    await page.locator('.ds-cchart-dot').last().hover();
    pass('results: a dot’s pop-up shows the score first', (await until(async () => /score \d+\/100/.test(await text(page, '.ds-tip:not([hidden])')), 3000)) || false);
    await page.mouse.move(5, 5);
    await checkScreen(page, 'A results 1280 dark');

    if (sprint) {
      await page.locator('.ck-one-add').click();
      await page.waitForSelector('.ds-dialog', { timeout: 5000 });
      pass('Add to my sprint: the panel asks which Strategy', (await page.locator('.ds-dialog .ds-field-label, .ds-dialog label, .ds-dialog .ds-choice', { hasText: 'Which Strategy' }).count()) > 0);
      await page.locator('.ds-dialog .ds-choice').last().locator('[role=radio]').first().click();
      await page.locator('.ds-dialog .ds-btn--primary').click();
      pass('Add to my sprint: says where it went', Boolean(await toastSeen(page, `Added to Performance Sprint ${sprint.number} as a habit.`)));
      pass('Add to my sprint: the line under the tip', (await text(page, '.ck-one-added')) === `It’s in Performance Sprint ${sprint.number} as a habit.`);
      const sh = await until(async () => {
        const { data } = await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id).eq('name', '30-minute training sessions');
        return data?.length ? data : null;
      });
      sh?.forEach((h) => added.habits.push(h.id));
      const { data: set } = sh?.length ? await db.from('sprint_habit_settings').select('measure, target, target_per, from_week').eq('sprint_habit_id', sh[0].id) : { data: [] };
      pass('Add to my sprint: a habit with a measure, from next week, in the database', sh?.length === 1 && set?.[0]?.measure === 'count' && Number(set[0].target) === 3 && set[0].target_per === 'week', JSON.stringify(set));
    } else {
      pass('no running sprint: the line instead of Add to my sprint', (await text(page, '.ck-one-next')) === 'You can add it to your Performance Sprint once one is running.');
    }

    await page.locator('.ds-guide-next').click();
    pass('Finish: "Saved. Your next check-in is in a month."', Boolean(await toastSeen(page, 'Saved. Your next check-in is in a month.')));
    pass('Finish: back to Home', Boolean(await until(async () => path(page) === '/welcome')));
    await sleep(1500);
    const { data: done } = await db.from('checkins').select('status, kind, hardware_score, software_score, answers').eq('user_id', me).eq('month', CUR).limit(1);
    pass('database: finished, with the scores the screen showed', done?.[0]?.status === 'finished' && Math.round(Number(done[0].hardware_score)) === want.hardware.value && Math.round(Number(done[0].software_score)) === want.software.value, JSON.stringify(done?.[0] && { s: done[0].status, h: done[0].hardware_score }));
    pass('database: the answers as tapped', JSON.stringify(done?.[0]?.answers && cleanAnswers(done[0].answers)) === JSON.stringify(cleanAnswers(NOW_ANS)) || Object.entries(cleanAnswers(NOW_ANS)).every(([k, v]) => done?.[0]?.answers?.[k] === v));
    await home(page);
    pass('Home: the line has gone once done', (await page.locator('.ds-quiet-row', { hasText: 'check-in' }).count()) === 0);
    await page.goto(`${APP}/my-reviews`);
    const name = `${monthName(CUR)} check-in`;
    pass(`My Reviews: "${name}", Hardware and Software check-in`, Boolean(await until(async () => (await page.locator('.hlist-row', { hasText: name }).filter({ hasText: 'Hardware and Software check-in' }).count()) === 1, 15000)));
    await page.goto(`${APP}/check-in`);
    pass('a finished month opens its results page', Boolean(await until(async () => path(page) === CUR_PATH)));
    await page.waitForSelector('.ck-results', { timeout: 15000 });
    pass('results page: titled in words', (await text(page, '.ds-page-title')).toLowerCase() === name.toLowerCase());
    await checkScreen(page, 'A saved results page 1280 dark', { coral: 0 });
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- D: measured against M12
if (part('D')) {
  // Without part A, this month's finished check-in is seeded as A leaves it.
  if (!part('A')) {
    await clearMonths(CUR);
    await db.from('checkins').insert({ user_id: me, kind: 'monthly', month: CUR, status: 'finished', answers: NOW_ANS });
  }
  // M12's own sizes, measured in the mock-up (copy with the real fonts).
  const mp = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await mp.route(/^https?:/, (r) => r.abort());
  await mp.goto(`file://${MOCK_FULL}`).catch(() => mp.goto(`file://${MOCK}`));
  await sleep(800);
  const mockSize = async () => mp.evaluate(() => {
    const pick = (f, sel, prop) => { const el = document.querySelector(`${f} ${sel}`); return el ? (prop === 'h' ? Math.round(el.getBoundingClientRect().height) : parseFloat(getComputedStyle(el).fontSize)) : null; };
    return {
      desktop: { question: pick('#dk', '.qh', 'f'), answer: pick('#dk', '.opts button', 'h'), bar: pick('#dk', '.pctb', 'h'), statement: pick('#dk', '.stmt', 'f') },
      phone: { question: pick('#ph', '.qh', 'f'), answer: pick('#ph', '.opts button', 'h'), bar: pick('#ph', '.pctb', 'h'), statement: pick('#ph', '.stmt', 'f') },
    };
  });
  await mp.locator('#dk .frame .btn').first().click();
  await sleep(700);
  const mockQ = await mockSize();
  // Through to the first statement: one tap each, as M12 does.
  for (let i = 0; i < 25 && !(await mp.locator('#dk .stmt').count()); i += 1) {
    await mp.locator('#dk .opts button').first().click();
    await sleep(600);
  }
  const mockS = await mockSize();
  const src = readFileSync(MOCK, 'utf8').replace(/&amp;/g, '&');
  await mp.close();
  results.push(`NOTE  M12 measured: question ${mockQ.desktop.question}/${mockQ.phone.question}px, answer rows ${mockQ.desktop.answer}/${mockQ.phone.answer}px, % bar ${mockQ.desktop.bar}px, statement ${mockS.desktop.statement}/${mockS.phone.statement}px`);

  // M12's words, verbatim (or a later rule's, listed in the report).
  const LATER = new Set(['Fair', '2 days or more']);
  for (const q of QUESTIONS) {
    const words = q.question.slice(0, 40);
    pass(`M12 words: ${q.code} question`, src.includes(q.question.replace(/^In the past month, on average, /, '')) || src.includes(words), q.question);
    for (const n of q.nudges || []) pass(`M12 words: ${q.code} "${n.slice(0, 30)}"`, src.includes(n), n);
    if (q.statement) pass(`M12 words: ${q.code} statement`, src.includes(q.statement));
    for (const o of q.options) if (!LATER.has(o.label)) pass(`M12 words: ${q.code} "${o.label}"`, src.includes(`'${o.label}'`), o.label);
  }
  for (const [k, lines] of Object.entries(TIPS)) for (const l of lines) pass(`M12 words: tip ${k} "${l.slice(0, 30)}"`, src.includes(l), l);
  for (const l of HARDWARE_SOFTWARE) pass(`M12 words: "${l.slice(0, 30)}"`, src.includes(l));

  for (const width of [1280, 390, 360]) for (const mode of ['dark', 'light']) {
    const phone = width < 769;
    const m12 = phone ? mockQ.phone : mockQ.desktop;
    const { context, page } = await signedIn({ width, mode, coach: null });
    try {
      await page.goto(`${APP}${CUR_PATH}/answers`);
      await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
      await until(async () => (await currentQuestion(page))?.code === 'H1');
      const q = await checkScreen(page, `D H1 ${width} ${mode}`);
      await sleep(300);
      pass(`D ${width} ${mode}: the page follows the mode`, q.theme === mode, q.theme);
      pass(`D ${width} ${mode}: question ${m12.question}px as M12`, Math.abs(q.sizes.question - m12.question) <= 1, q.sizes.question);
      pass(`D ${width} ${mode}: answer rows at least M12's ${m12.answer}px`, q.sizes.answer >= m12.answer, q.sizes.answer);
      pass(`D ${width} ${mode}: % bar ${m12.bar}px as M12`, q.sizes.bar === m12.bar, q.sizes.bar);
      await page.locator('.ds-guide-back').click();
      await until(async () => (await heading(page)) === 'Ready to look back on your month?');
      await checkScreen(page, `D opening ${width} ${mode}`);
      await page.locator('.ds-guide-next').click();
      for (let i = 0; i < 25; i += 1) {
        const cq = await currentQuestion(page);
        if (!cq || cq.code === 'S1') break;
        await tapAnswer(page, NOW_WORDS[cq.code]);
      }
      const s = await checkScreen(page, `D S1 ${width} ${mode}`);
      const ms = phone ? mockS.phone : mockS.desktop;
      pass(`D ${width} ${mode}: statement ${ms.statement}px as M12`, Math.abs(s.sizes.statement - ms.statement) <= 1, s.sizes.statement);
      for (let i = 0; i < 8; i += 1) {
        const cq = await currentQuestion(page);
        if (!cq) break;
        await tapAnswer(page, NOW_WORDS[cq.code]);
      }
      await until(async () => (await heading(page)) === 'Your month');
      const r = await checkScreen(page, `D results ${width} ${mode}`);
      pass(`D ${width} ${mode}: rises are mint`, r.mintCount > 0 && r.mintOk, `${r.mintCount} ${r.good}`);
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- B: offline, then sent once
if (part('B')) {
  await clearMonths(CUR);
  const { context, page } = await signedIn({ width: 390, mode: 'light', coach: null });
  try {
    await page.goto(`${APP}/check-in`);
    await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
    await sleep(1500);
    await context.setOffline(true);
    await page.locator('.ds-guide-next').click();
    const offWords = { ...NOW_WORDS, H14: 'No' };
    for (let i = 0; i < 25; i += 1) {
      const q = await currentQuestion(page);
      if (!q) break;
      await tapAnswer(page, offWords[q.code]);
    }
    await until(async () => (await heading(page)) === 'Your month');
    pass('offline: the results, worked out on the device', (await page.locator('.ck-scores .ds-stat').count()) === 2);
    pass('offline: "Will sync"', Boolean(await until(async () => /will sync/i.test(await text(page, '.ds-guide-bar')), 5000)), await text(page, '.ds-guide-bar'));
    await page.locator('.ds-guide-next').click();
    pass('offline: Finish still works', Boolean(await toastSeen(page, 'Saved. Your next check-in is in a month.')));
    const { data: none } = await db.from('checkins').select('id').eq('user_id', me).eq('month', CUR);
    pass('offline: nothing reached the database yet', !none?.length);
    const mark = writes.length;
    await context.setOffline(false);
    const landed = await until(async () => {
      const { data } = await db.from('checkins').select('id, status').eq('user_id', me).eq('month', CUR);
      return data?.length && data[0].status === 'finished' ? data : null;
    }, 30000);
    await sleep(3000);
    const { data: rows } = await db.from('checkins').select('id, status, answers').eq('user_id', me).eq('month', CUR);
    pass('back online: one row, finished', landed && rows.length === 1 && rows[0].status === 'finished', JSON.stringify(rows?.map((r) => r.status)));
    pass('back online: every answer arrived', Object.entries(cleanAnswers(Object.fromEntries(Object.entries(offWords).map(([k, w]) => [k, byWords(k, w)])))).every(([k, v]) => rows?.[0]?.answers?.[k] === v));
    const finishedSends = writes.slice(mark).filter((w) => /"status":"finished"/.test(w.body)).length;
    pass('back online: Finish sent exactly once', finishedSends === 1, finishedSends);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- C: the First check-in
if (part('C') && others?.length) results.push(`NOTE  C skipped: the test client has ${others.length} finished check-ins in other months, so its next is a monthly one.`);
if (part('C') && !others?.length) {
  await clearMonths(CUR, PREV);
  const { context, page } = await signedIn({ width: 1280, mode: 'light', coach: 'Tim' });
  try {
    await home(page);
    const homeText = await text(page, '.home-page');
    pass('Home: the First check-in is offered', /Ready for your first check-in\?/.test(homeText));
    await page.goto(`${APP}/check-in`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
    pass('first: "What would make coaching useful for you?"', (await heading(page)) === 'What would make coaching useful for you?');
    pass('first: First check-in in the top bar', (await text(page, '.ds-guide-name')).toLowerCase() === 'first check-in');
    pass('first: the two nudges', (await page.locator('.ds-guide-nudge').allInnerTexts()).map((t) => t.trim()).join('|') === 'Let’s start with 5 questions about that.|Then your first Hardware and Software check-in.');
    await page.locator('.ds-guide-nudge .ds-guide-i').click();
    pass('first: the ⓘ opens hardware and software', (await page.locator('.ds-infopop:not([hidden]) .ds-infopop-line').allInnerTexts()).join('|') === HARDWARE_SOFTWARE.join('|'));
    await page.keyboard.press('Escape');
    await page.locator('button', { hasText: 'Who sees my answers?' }).click();
    pass('first: Who sees my answers? with a coach', (await text(page, '.ck-who-lines')).split(/\n+/)[0] === 'Only you and Tim see your answers.');
    await checkScreen(page, 'C opening 1280 light');
    pass('first: Start with my goals', (await text(page, '.ds-guide-next')).toLowerCase() === 'start with my goals');
    await nextStep(page);
    await until(async () => (await heading(page)).startsWith('In 12 months’ time'));
    pass('G1: Your goals, the question, the nudge', (await text(page, '.ds-guide-label')) === 'Your goals' && (await text(page, '.ds-guide-nudge')) === 'Describe what you’d be doing and what others would notice.');
    await page.locator('.ds-guide-example-link').click();
    pass('G1: See an example', (await text(page, '.ds-guide-example')).startsWith('For example: '));
    pass('G1: the eye says You and Tim', (await text(page, '.ck-eye')).includes('You and Tim'));
    pass('first: Do this later, never Skip', (await text(page, '.ds-guide-skip')) === 'Do this later');
    await page.locator('.ds-guide-body textarea').first().fill('I’d lead the board calmly through the merger.');
    await nextStep(page);
    await page.locator('.ds-guide-body textarea').first().fill('A new role in January.');
    await nextStep(page);
    await until(async () => (await heading(page)) === 'What 3 things do you most want from coaching?');
    const boxes = page.locator('.ck-three textarea, .ck-three input');
    pass('G3: three numbered boxes', (await boxes.count()) === 3);
    for (const [i, t] of ['Lead the merger well', 'Delegate properly', 'Get my energy back'].entries()) await boxes.nth(i).fill(t);
    await nextStep(page);
    await until(async () => (await heading(page)) === 'What has got in the way of progress before?');
    await sleep(1200);
    await page.locator('.ds-guide-skip').click();
    pass('Do this later: "Saved. Home will ask you to finish before your first session."', Boolean(await toastSeen(page, 'Saved. Home will ask you to finish before your first session.')));
    await until(async () => path(page) === '/welcome');
    await home(page);
    pass('Home: "Ready to finish your first check-in?"', /Ready to finish your first check-in\?/.test(await text(page, '.home-page')));
    await page.locator('button', { hasText: 'Finish my first check-in' }).first().click();
    await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
    pass('carries on where it was left', (await heading(page)) === 'What has got in the way of progress before?', await heading(page));
    await page.locator('.ds-guide-body textarea').first().fill('I say yes to everything.');
    await nextStep(page);
    await until(async () => (await heading(page)) === 'How do you like to be challenged?');
    pass('G5: names the coach in the nudge', (await text(page, '.ds-guide-nudge')) === 'Add anything else Tim should know about you.');
    await page.locator('.ds-guide-body textarea').first().fill('Straight talking.');
    await nextStep(page);
    const risky = { ...NOW_WORDS, H3: 'Always', H14: 'No' };
    for (let i = 0; i < 25; i += 1) {
      const q = await currentQuestion(page);
      if (!q) break;
      if (q.code === 'H10') {
        await page.locator('.ds-guide-label .ds-guide-i').click();
        pass('H10: the ⓘ names the coach', (await text(page, '.ds-infopop:not([hidden])')).includes('Tim uses this to help, never to judge.'));
        await page.keyboard.press('Escape');
      }
      await tapAnswer(page, risky[q.code]);
    }
    await until(async () => (await heading(page)) === 'Your starting point');
    pass('results: "Your starting point"', (await heading(page)) === 'Your starting point');
    pass('results: the scores say what they are', (await text(page, '.ck-scores')).includes('Sleep, stress, movement, fuel, energy and health.'));
    pass('results: "Your graph starts here. Each monthly check-in adds a point."', (await page.locator('.ck-hint p').allInnerTexts()).join(' ') === 'Your graph starts here. Each monthly check-in adds a point.');
    pass('results: no What improved on the first', (await page.locator('.ck-improved').count()) === 0);
    pass('results: My goals, one per line', (await page.locator('.ck-goal-text').allInnerTexts()).join('|') === 'I’d lead the board calmly through the merger.|Lead the merger well|Delegate properly|Get my energy back');
    pass('results: no note for the client (rule 51)', !/samaritans|nhs|gp/i.test(await text(page, '.ds-guide-page')));
    await checkScreen(page, 'C results 1280 light');
    await nextStep(page);
    pass('Finish: "Saved. Tim will see this before your first session."', Boolean(await toastSeen(page, 'Saved. Tim will see this before your first session.')));
    await sleep(2000);
    const { data: first } = await db.from('checkins').select('id, kind, status, goals, answers').eq('user_id', me).eq('month', CUR).limit(1);
    pass('database: the First check-in with its goals', first?.[0]?.kind === 'first' && first[0].status === 'finished' && first[0].goals?.G3?.length === 3 && first[0].answers?.H3 === 'always', JSON.stringify(first?.[0] && { k: first[0].kind, s: first[0].status }));
    if (realCoach) {
      for (const who of ['TEST_COACH_OWNER', 'TEST_COACH_TWO']) {
        const c = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        await c.auth.signInWithPassword({ email: env[`${who}_EMAIL`], password: env[`${who}_PASSWORD`] });
        const { data: flags } = await c.from('checkin_flags').select('code, reason').eq('checkin_id', first[0].id);
        if (flags?.length) {
          pass('the coach’s flag says which answer caused it (stress Always, H3)', flags.some((f) => f.code === 'H3' && f.reason === 'stress_always'), JSON.stringify(flags));
          break;
        }
        await c.auth.signOut();
      }
    } else {
      results.push('NOTE  the test client has no real coach, so 029\'s trigger makes no flag; checked in the database tests (029_checkins_goal_checks_patterns_test.sql).');
    }
  } finally {
    await context.close();
  }
}

await browser.close();
await cleanUp();
const counted = results.filter((r) => !r.startsWith('NOTE'));
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n\n${counted.length - failures} of ${counted.length} passed\n`);
console.log(results.filter((r) => !r.startsWith('PASS')).join('\n'));
console.log(`\n${counted.length - failures} of ${counted.length} passed`);
process.exit(failures ? 1 : 0);
