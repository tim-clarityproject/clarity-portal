// Phase 5 step 2: the Individual Performance Dashboard (mock-up M4 v47) in
// the running app, signed in as the invented test client on the TEST
// database only (every other host, /functions/v1/ and every email call is
// blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase5/dashboard.mjs [folder]
//
// M  Measured against M4's frames: the sizes M4 draws (the score, section
//    names, list items, fold rows, figures, week squares, mini charts),
//    taken from the mock-up file itself at its desktop and phone frames.
// D  Every width (1280, 640, 390, 360) in dark and light: one coral button
//    at most, 44px taps, mint for good and grey below (each mark's colour
//    against its class), no coral data marks, no keys, icons 6px from their
//    words and centred on them, a pop-up 12px inside the edges that never
//    moves the page, no sideways scrolling, the writing rules and no line
//    said twice.
// F  Every figure on screen against dashboardView (src/lib/scores through
//    dashboard.js), from the rows the page itself keeps on the device.
// S  States: a new person with no data (every read answered empty), a
//    mid-sprint client (the test client's running sprint, with two
//    check-ins, a month of sleep and the debriefs' stress seeded),
//    collapsing and remembering (in the account), customising (here and
//    in My Account), and a holding-back tap landing where it fixes it.
//
// Everything this test adds is deleted at the end, and the person's page
// settings are put back as they were.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { dashboardView } from '../../src/lib/performance/dashboard.js';
import { readSleepTarget } from '../../src/lib/performance/sleepChart.js';
import { addDays } from '../../src/lib/scores/dates.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCK = process.env.M4 || join(homedir(), 'Downloads', 'clarity-phase-5', 'm4-dashboard.html');
const out = process.argv[2] || join(process.cwd(), 'tmp-phase5-dashboard');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(n);

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// ---------------------------------------------------------------- the seed (small, and all removed)
const { data: settingsRow } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = settingsRow?.[0]?.page_preferences ?? null;
const { data: running } = await db.from('sprints').select('id, number, start_on, length_weeks').eq('user_id', me).eq('status', 'running').limit(1);
const sprint = running?.[0] || null;
const seeded = { checkins: [], dayPlans: [], dayPlanBefore: [], debriefs: [], debriefBefore: [] };

async function seed() {
  // Two finished check-ins, months no other test uses.
  const A = { H1: 'h6_7', H2: 'ok', H3: 'often', H4: 'under_1', H5: 'd1', H6: 'h8_10', H7: 'ok', H8: 'u8_14', H9: 'monthly', H10: 'ok', H11: 'low', H12: 'poor', H13: 'a_little', H14: 'no', S1: 'sometimes', S2: 'sometimes', S3: 'rarely', S4: 'often', S5: 'often', S6: 'sometimes' };
  const B = { ...A, H1: 'h7_8', H3: 'sometimes', H11: 'ok', S1: 'often' };
  for (const [month, answers] of [['2026-07-01', A], ['2026-08-01', B]]) {
    const { data: had } = await db.from('checkins').select('id').eq('user_id', me).eq('month', month);
    if (had?.length) continue;
    const { data, error } = await db.from('checkins').insert({ user_id: me, kind: 'monthly', month, status: 'finished', answers }).select('id');
    if (error) results.push(`NOTE  check-in seed: ${error.message}`);
    else seeded.checkins.push(data[0].id);
  }
  if (!sprint) return;
  // Sleep: 6 hours a night for the last 4 weeks and 7.5 the 4 before (M10 "average sleep down").
  const { data: plans } = await db.from('day_plans').select('id, local_date, sleep_hours, sleep_quality, sleep_to_confirm').eq('user_id', me).gte('local_date', addDays(today, -55)).lte('local_date', today);
  const byDay = new Map((plans || []).map((p) => [p.local_date, p]));
  for (let i = 0; i < 56; i += 1) {
    const date = addDays(today, -i);
    const hours = i < 28 ? 6 : 7.5;
    const quality = i % 3 ? 'fair' : 'good';
    const had = byDay.get(date);
    if (had) {
      seeded.dayPlanBefore.push(had);
      await db.from('day_plans').update({ sleep_hours: hours, sleep_quality: quality, sleep_to_confirm: false }).eq('id', had.id);
    } else {
      const { data } = await db.from('day_plans').insert({ user_id: me, local_date: date, sleep_hours: hours, sleep_quality: quality }).select('id');
      if (data?.[0]) seeded.dayPlans.push(data[0].id);
    }
  }
  // Stress in the sprint's finished weeks.
  const { data: debs } = await db.from('weekly_debriefs').select('id, sprint_week, stress, status').eq('sprint_id', sprint.id);
  const weeksDone = Math.floor((Date.parse(today) - Date.parse(sprint.start_on)) / (7 * 864e5));
  const answers = ['a_little', 'moderately', 'not_at_all', 'quite_a_lot', 'a_little', 'not_at_all', 'moderately'];
  for (let w = 1; w <= Math.min(weeksDone, sprint.length_weeks); w += 1) {
    const had = (debs || []).find((x) => x.sprint_week === w);
    if (had) {
      seeded.debriefBefore.push(had);
      await db.from('weekly_debriefs').update({ stress: answers[w - 1] }).eq('id', had.id);
    } else {
      const { data, error } = await db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: w, stress: answers[w - 1], status: 'finished', finished_at: new Date().toISOString() }).select('id');
      if (error) results.push(`NOTE  debrief seed: ${error.message}`);
      else seeded.debriefs.push(data[0].id);
    }
  }
}

async function cleanUp() {
  for (const id of seeded.checkins) await db.from('checkins').delete().eq('id', id).eq('user_id', me);
  for (const id of seeded.dayPlans) await db.from('day_plans').delete().eq('id', id).eq('user_id', me);
  for (const p of seeded.dayPlanBefore) await db.from('day_plans').update({ sleep_hours: p.sleep_hours, sleep_quality: p.sleep_quality, sleep_to_confirm: p.sleep_to_confirm }).eq('id', p.id);
  for (const id of seeded.debriefs) await db.from('weekly_debriefs').delete().eq('id', id).eq('user_id', me);
  for (const d of seeded.debriefBefore) await db.from('weekly_debriefs').update({ stress: d.stress }).eq('id', d.id);
  await db.from('person_settings').update({ page_preferences: prefsBefore ?? {} }).eq('user_id', me);
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function newContext({ width = 1280, mode = 'dark', empty = false } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    // A new person: every read answered empty (nothing in the database is touched).
    if (empty && route.request().method() === 'GET' && /\/rest\/v1\/(?!person_settings|profiles)/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (empty && /\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
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
async function dashboard(page) {
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('.dash-page .ds-page-title', { timeout: 30000 });
  await until(async () => (await page.locator('.dash-page .ds-loading').count()) === 0, 20000);
  await sleep(1500);
}
async function shot(page, name) { await page.screenshot({ path: join(out, `${name}.png`), fullPage: true }).catch(() => {}); }
async function openFolds(page) {
  await page.evaluate(() => { for (const b of document.querySelectorAll('.dash-fold-h[aria-expanded="false"]')) b.click(); });
  await sleep(600);
}

// ---------------------------------------------------------------- what is measured
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)', 'rgb(185, 61, 43)'];
const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];
const BANNED = ['journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'synergy', 'wellness', 'self-care', 'failed', 'fail', 'missed', 'sorted', 'crack on', 'reckon', 'submit', 'click', 'tap', 'purpose', 'hrs', 'wks', 'min', 'about \\d+ minutes', 'hardware first', 'weakest'];
function measure({ CORAL, MINT, BANNED }) {
  const root = document.querySelector('.dash-page');
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const style = document.createElement('style');
  // A word kept whole (keepWords: .ds-keep, never wrapping) is read as part
  // of its line: inside a flex button it would otherwise become its own
  // piece ("Add a" + "to-do"), as innerText splits flex items.
  style.textContent = '.ds-sr, [hidden], [inert], .ds-tip[hidden], table, caption { display: none !important; } body .ui-root .ds-keep { display: contents !important; }';
  document.head.appendChild(style);
  const lines = root.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  style.remove();
  const buttons = [...root.querySelectorAll('button, a, [role=button]')].filter(vis);
  const coralButtons = buttons.filter((el) => CORAL.includes(getComputedStyle(el).backgroundColor)).map(label);
  const small = [];
  for (const el of root.querySelectorAll('button, a, input, [role=switch]')) {
    if (!vis(el) || el.disabled || el.closest('[aria-hidden="true"]')) continue;
    // The shared pills reach 44px through their ::after (design.css .ds-seg-btn).
    if (el.matches('.ds-seg-btn') && el.getBoundingClientRect().height >= 38) continue;
    const b = el.getBoundingClientRect();
    if (b.height >= 43.5 && b.width >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  const probe = document.createElement('span');
  root.closest('.ui-root').appendChild(probe);
  const colourOf = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
  const good = colourOf('--good');
  const below = colourOf('--below');
  const text = colourOf('--text');
  probe.remove();
  // Each mark's colour against what its class says it is.
  const marks = [];
  const wrong = [];
  const sel = '.dash-hchart-bar, .dash-sq-i, .dash-mini rect, .dash-tbars-bar, .dash-stress-dot, .dash-goal-fill, .ds-schart-bar, .ds-cchart-dot, .ds-cchart-line, .dash-hero-value, .dash-glance, .dash-big, .dash-fv b';
  for (const el of root.querySelectorAll(sel)) {
    if (!vis(el)) continue;
    const st = getComputedStyle(el);
    const isSvg = el instanceof SVGElement;
    const c = isSvg ? (st.fill !== 'none' ? st.fill : st.stroke) : (/value|glance|big|fv/.test(String(el.className)) || el.tagName === 'B' ? st.color : st.backgroundColor);
    const cls = String(el.className?.baseVal ?? el.className);
    marks.push({ el: label(el), c, coral: CORAL.includes(c) });
    if (/--good|dash-mini-good|--up|value--good|big--good|fv-good|fill--good/.test(cls) && c !== good) wrong.push(`${cls} ${c}, not mint ${good}`);
    if (/--below|dash-mini-below/.test(cls) && c !== below) wrong.push(`${cls} ${c}, not grey ${below}`);
    if (/hchart-bar--now|sq-i--now/.test(cls) && c !== text) wrong.push(`${cls} ${c}, not the text colour`);
  }
  const keys = [...root.querySelectorAll('[class]')].filter((el) => vis(el) && /(^|\s|-)(legend|key|chart-key)(\s|$|-)/.test(String(el.className?.baseVal ?? el.className))).map(label);
  // Icons with words (26 Oct rule 5): 6px to the words, centred on them.
  const icons = [];
  for (const el of root.querySelectorAll('.ds-iconword')) {
    if (!vis(el)) continue;
    const icon = el.querySelector('.ds-iconword-icon svg') || el.querySelector('.ds-iconword-icon');
    const words = el.querySelector('.ds-iconword-text');
    if (!icon || !words) continue;
    const range = document.createRange();
    const node = [...words.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) continue;
    range.selectNodeContents(node);
    const t = range.getBoundingClientRect();
    const i = icon.getBoundingClientRect();
    const gap = t.left - i.right;
    const centre = Math.abs((i.top + i.bottom) / 2 - (t.top + t.bottom) / 2);
    if (Math.abs(gap - 6) > 1.5 || centre > 2.5) icons.push(`${label(el)} gap ${gap.toFixed(1)} off-centre ${centre.toFixed(1)}`);
  }
  const writing = [];
  const seen = new Map();
  for (const l of lines) {
    const plain = l.replace(/\be\.g\. /gi, 'eg ').replace(/\d\.\d/g, '0').replace(/\bDr\. /g, 'Dr ');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    if (/[()[\]]/.test(l)) writing.push(`brackets: ${l}`);
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    if (/…/.test(l)) writing.push(`cut off: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(l.toLowerCase().replace(/[’']/g, "'"))) writing.push(`banned "${w}": ${l}`);
    // No line said twice (part 4, 3 Nov): a sentence once per screen.
    // Each Outcome Objective's own status line (M4) is that row's fact, not a repeat.
    if (/\.$/.test(l) && l.split(' ').length > 3 && !/^The work behind it is /.test(l)) seen.set(l, (seen.get(l) || 0) + 1);
  }
  const repeats = [...seen.entries()].filter(([, n]) => n > 1).map(([l, n]) => `${n} times: ${l}`);
  for (const b of buttons) {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\b(I|me|Submit|OK|Go)\b/.test(t)) writing.push(`button words: ${t}`);
  }
  return {
    lines,
    coralButtons,
    small,
    coralMarks: [...new Set(marks.filter((m) => m.coral).map((m) => `${m.el} ${m.c}`))],
    wrong: [...new Set(wrong)],
    markCount: marks.length,
    keys,
    icons,
    writing,
    repeats,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
  };
}
const checkScreen = async (page, name) => {
  await sleep(400);
  const m = await page.evaluate(measure, { CORAL, MINT, BANNED });
  pass(`${name}: at most one coral button`, m.coralButtons.length <= 1, m.coralButtons.join(', '));
  pass(`${name}: 44px taps`, !m.small.length, m.small.join('; '));
  pass(`${name}: no coral data marks`, !m.coralMarks.length, m.coralMarks.join('; '));
  pass(`${name}: mint for good, grey below, this week in the text colour (${m.markCount} marks)`, !m.wrong.length, m.wrong.join('; '));
  pass(`${name}: no keys`, !m.keys.length, m.keys.join('; '));
  pass(`${name}: icons 6px from their words, centred`, !m.icons.length, m.icons.join('; '));
  pass(`${name}: no sideways scrolling`, m.sideways <= 0, m.sideways);
  pass(`${name}: the writing rules`, !m.writing.length, m.writing.join(' | '));
  pass(`${name}: no line said twice`, !m.repeats.length, m.repeats.join(' | '));
  await shot(page, name.replace(/[^a-z0-9]+/gi, '-'));
  return m;
};

/** A chart mark's pop-up: 12px inside both edges, and the page never moves. */
async function popUpCheck(page, name) {
  const marks = page.locator('.dash-hchart-bar[data-tip], .dash-sq-i[data-tip], .ds-schart-bar[data-tip], .dash-stress-dot[data-tip]');
  const n = await marks.count();
  if (!n) { results.push(`NOTE  ${name}: no chart marks to point at`); return; }
  const picks = [0, Math.floor(n / 2), n - 1];
  for (const i of picks) {
    const mark = marks.nth(i);
    if (!(await mark.isVisible())) continue;
    await mark.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
    await mark.focus();
    await sleep(250);
    const r = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden && x.getBoundingClientRect().width > 0);
      if (!t) return null;
      const b = t.getBoundingClientRect();
      return { left: b.left, right: window.innerWidth - b.right, display: getComputedStyle(t).display, y: window.scrollY, h: document.documentElement.scrollHeight, words: t.innerText };
    });
    pass(`${name}: pop-up ${i + 1} opens`, Boolean(r));
    if (!r) continue;
    pass(`${name}: pop-up ${i + 1} 12px inside the edges`, r.left >= 11.5 && r.right >= 11.5, `${r.left.toFixed(1)} / ${r.right.toFixed(1)}`);
    pass(`${name}: pop-up ${i + 1} never moves the page`, r.y === before.y && r.h === before.h, `${before.y}->${r.y}, ${before.h}->${r.h}`);
    await page.keyboard.press('Escape');
    await sleep(150);
  }
  const hidden = await page.evaluate(() => [...document.querySelectorAll('.ds-tip')].every((t) => t.hidden && getComputedStyle(t).display === 'none'));
  pass(`${name}: a closed pop-up is display none`, hidden);
}

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  await cleanUp().catch(() => {});
  console.log(results.join('\n'));
  process.exit(1);
});

await seed();
results.push(`NOTE  running sprint: ${sprint ? `Performance Sprint ${sprint.number}, from ${sprint.start_on}` : 'none'}; today ${today}`);

// ---------------------------------------------------------------- M: M4's own sizes
let m4 = null;
if (part('M')) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`file://${MOCK}`);
  await sleep(800);
  // Open every trend, so the folds' sizes can be read.
  await page.locator('[data-fo]').click().catch(() => {});
  await sleep(300);
  m4 = await page.evaluate(() => {
    const read = (frame) => {
      const q = (s) => frame.querySelector(s);
      const fs = (s) => (q(s) ? parseFloat(getComputedStyle(q(s)).fontSize) : null);
      const h = (s) => (q(s) ? Math.round(q(s).getBoundingClientRect().height) : null);
      const w = (s) => (q(s) ? Math.round(q(s).getBoundingClientRect().width) : null);
      return {
        hero: fs('.hxb'), glance: fs('.hxd'), section: fs('.sec2 h3'), sectionLs: q('.sec2 h3') ? getComputedStyle(q('.sec2 h3')).letterSpacing : null,
        group: fs('.grph h4 .colb'), item: fs('.si b'), itemLine: fs('.si small'), big: fs('.big'), foldTitle: fs('.mt .fold .h'), foldLine: fs('.mt .fold small'),
        foldH: Math.min(...[...frame.querySelectorAll('.mt .fold')].map((x) => Math.round(x.getBoundingClientRect().height))), foldFigure: fs('.fv b'), crowValue: fs('.crow .cv strong'), crowName: fs('.crow .cn2 b'), sq: h('.crow .sq'), sqSmallH: h('.siv .sq'), sqSmallW: w('.siv .sq'),
        mini: [w('.fv svg.mini'), h('.fv svg.mini')], lead: fs('.sec2 .lead'),
      };
    };
    return { d: read(document.querySelector('.frame.d')), p: read(document.querySelector('.frame.p')) };
  });
  await ctx.close();
  results.push(`NOTE  M4 desktop sizes ${JSON.stringify(m4.d)}`);
}
const appSizes = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const fs = (s) => (q(s) ? parseFloat(getComputedStyle(q(s)).fontSize) : null);
  const h = (s) => (q(s) ? Math.round(q(s).getBoundingClientRect().height) : null);
  const w = (s) => (q(s) ? Math.round(q(s).getBoundingClientRect().width) : null);
  return {
    hero: fs('.dash-hero-value'), glance: fs('.dash-glance'), section: fs('.dash-sec-h .dash-colb'), sectionLs: q('.dash-sec-h .dash-colb') ? getComputedStyle(q('.dash-sec-h .dash-colb')).letterSpacing : null,
    group: fs('.dash-colb--group'), item: fs('.dash-sit b'), itemLine: fs('.dash-si-line'), big: fs('.dash-big'), foldTitle: fs('.dash-fold-t'), foldLine: fs('.dash-fold-l'),
    foldH: Math.min(...[...document.querySelectorAll('.dash-fold-h')].map((x) => Math.round(x.getBoundingClientRect().height))), foldFigure: fs('.dash-fv b'), crowValue: fs('.dash-crow-v strong:not(.dash-crow-lng)'), crowName: fs('.dash-crow-n b'), sq: h('.dash-crow-c .dash-sq'), sqSmallH: h('.dash-sq--small'), sqSmallW: w('.dash-sq--small'),
    mini: [w('.dash-fv .dash-mini'), h('.dash-fv .dash-mini')], lead: fs('.dash-lead'),
  };
});
function compareSizes(name, mock, app, keys) {
  for (const k of keys) {
    const a = app[k];
    const b = mock?.[k];
    if (a == null || b == null) { results.push(`NOTE  ${name}: ${k} not on screen (app ${a}, M4 ${b})`); continue; }
    const same = Array.isArray(b) ? b.every((x, i) => Math.abs(x - a[i]) <= 1) : typeof b === 'string' ? Math.abs(parseFloat(a) - parseFloat(b)) <= 0.3 : Math.abs(a - b) <= 1;
    pass(`${name}: ${k} as M4 (${JSON.stringify(b)})`, same, `app ${JSON.stringify(a)}`);
  }
}

// ---------------------------------------------------------------- D, F: every width and mode
const WIDTHS = [1280, 640, 390, 360];
for (const mode of ['dark', 'light']) {
  if (!part('D')) break;
  for (const width of WIDTHS) {
    const { context, page } = await signedIn({ width, mode });
    try {
      await dashboard(page);
      const name = `${width}px ${mode}`;
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      pass(`${name}: the page shows ${mode}`, theme === mode, theme);
      await checkScreen(page, `${name}, closed rows`);
      await openFolds(page);
      await checkScreen(page, `${name}, every row open`);
      await popUpCheck(page, name);
      if (m4 && (width === 1280 || width === 360) && mode === 'dark') {
        const app = await appSizes(page);
        const keys = width === 1280
          ? ['hero', 'glance', 'section', 'group', 'item', 'itemLine', 'big', 'foldTitle', 'foldLine', 'foldH', 'foldFigure', 'crowValue', 'crowName', 'sq', 'sqSmallH', 'sqSmallW', 'mini', 'lead']
          : ['section', 'item', 'foldTitle', 'foldLine', 'foldFigure', 'crowName', 'lead'];
        compareSizes(name, width === 1280 ? m4.d : m4.p, app, keys);
      }
      if (width < 601) {
        const minis = await page.locator('.dash-fv .dash-mini').count();
        pass(`${name}: small charts in the rows become just the figure`, minis === 0, `${minis} mini charts`);
        const lines = await page.locator('.dash-sit .dash-si-line').count();
        const taps = await page.locator('.dash-si .dash-tapvis').count();
        pass(`${name}: lines that repeat a small chart wait for a tap`, taps === 0 || lines < taps + (await page.locator('.dash-si').count()));
        if (taps) {
          await page.locator('.dash-si .dash-tapvis').first().evaluate((el) => el.click());
          pass(`${name}: tapping a small chart shows its line`, await until(async () => (await page.locator('.dash-si .dash-tapvis[aria-expanded="true"]').count()) === 1, 3000));
        }
        const chartW = await page.evaluate(() => {
          const c = document.querySelector('.dash-hchart-plot');
          const p = document.querySelector('.dash-page');
          if (!c) return null;
          const cs = getComputedStyle(p);
          return Math.round(c.getBoundingClientRect().width) - Math.round(p.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
        });
        if (chartW != null) pass(`${name}: the big chart is full width`, Math.abs(chartW) <= 1, chartW);
      }
      if (width === 1280 && mode === 'dark' && part('F')) {
        // F: the figures on screen against dashboardView, from the page's own rows.
        const data = await page.evaluate((id) => {
          const c = JSON.parse(localStorage.getItem(`clarity-cache:${id}:performance-dashboard`) || 'null');
          const p = JSON.parse(localStorage.getItem(`clarity-cache:${id}:menu-pins`) || 'null');
          return { rows: c?.v, prefs: p?.v?.prefs || {} };
        }, me);
        pass('F: the page keeps its rows on the device', Boolean(data.rows));
        if (data.rows) {
          const v = dashboardView(data.rows, { today, target: readSleepTarget(data.prefs) });
          const screen = (await page.locator('.dash-page').innerText()).replace(/\s+/g, ' ');
          const has = (t, what) => pass(`F: ${what} "${t}"`, screen.includes(t));
          has(v.hero.value, 'the score this sprint (M6)');
          v.hero.lines.forEach((l) => has(l, 'the line against the standard'));
          if (v.hero.change) pass('F: the glance figure since last sprint (M6)', (await page.locator('.dash-glance').innerText()).trim() === v.hero.change.text);
          // Declutter (Tim, 5 Nov): the logging line and the sprint-week line are gone.
          if (v.logging) pass('F: no logging line (declutter, 5 Nov)', !screen.includes(v.logging));
          if (v.current) {
            pass('F: no sprint-week line (declutter, 5 Nov)', !screen.includes(v.current.lead));
            for (const x of [...v.current.improving, ...v.current.holdingBack]) {
              has(x.title, `an M10 item, ${x.kind}`);
              if (x.line && !x.repeats) has(x.line, 'its line');
              if (x.fix) has(x.fix.label, 'its fix');
            }
          }
          for (const r of v.chain.objectives.rows) { has(r.value, `${r.name}'s figure (M9)`); if (r.line) has(r.line, 'its pace or milestone line (M9)'); }
          for (const r of v.chain.strategies.rows) if (r.latest) has(`${r.latest.value}%`, `${r.name}'s latest week (M4)`);
          for (const r of v.behind.rows) has(r.line, `${r.title}'s line`);
          const sleepRow = v.behind.rows.find((r) => r.key === 'sleep');
          if (sleepRow?.action) sleepRow.action.lines.forEach((l) => has(l, 'the sleep action (Recovery’s rule)'));
          const hb = v.current?.holdingBack.find((x) => x.kind === 'recovery_signals');
          pass('F: the seeded month of short sleep shows under What’s holding you back (M10)', Boolean(hb));
          writeFileSync(join(out, 'view.json'), JSON.stringify({ hero: v.hero, current: v.current, rows: v.behind.rows.map((r) => ({ key: r.key, line: r.line, figure: r.figure })) }, null, 2));
        }
      }
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------- S: states
if (part('S')) {
  // A new person with no data.
  {
    const { context, page } = await signedIn({ width: 390, mode: 'light', empty: true });
    try {
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('clarity-cache:')) localStorage.removeItem(k); });
      await dashboard(page);
      const t = await page.locator('.dash-page').innerText();
      pass('new person: no "Not yet" in the figure style (declutter, 5 Nov)', !t.includes('Not yet'));
      pass('new person: one calm card with one action', t.includes('Your dashboard fills in once your first Performance Sprint starts.') && /start my first sprint/i.test(t));
      pass('new person: no Objectives and Strategies section until there is something in it', !/objectives and strategies/i.test(t));
      for (const words of ['You haven’t added an unplanned win this sprint.', 'You haven’t done a check-in yet.', 'You haven’t logged sleep yet.', 'This starts after your first weekly debrief.', 'Customise my dashboard']) {
        pass(`new person: "${words}"`, t.includes(words));
      }
      pass('new person: no Current sprint until a sprint runs', !(await page.locator('.dash-sec-h .dash-colb').allInnerTexts()).some((x) => /current sprint/i.test(x)));
      pass('new person: no Patterns row before the first pattern', !t.includes('Patterns in your numbers'));
      await openFolds(page);
      const t2 = (await page.locator('.dash-page').innerText()).replace(/\s+/g, ' ');
      for (const words of ['Your graph starts here after your second check-in.', 'Your chart starts after your second night.', 'Your first weekly debrief adds the first week here.', 'Start my check-in', 'Start my life balance review']) {
        pass(`new person, rows open: "${words}"`, t2.includes(words));
      }
      await checkScreen(page, 'new person 390px light');
    } finally {
      await context.close();
    }
  }

  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  try {
    await dashboard(page);
    // Collapsing and remembering: closed from its heading, a one-line summary, still closed after a reload, kept in the account.
    const head = page.locator('.dash-sec-h .dash-colb', { hasText: 'Current sprint' });
    if (await head.count()) {
      await head.evaluate((el) => el.click());
      pass('collapse: Current sprint closes from its heading', (await head.getAttribute('aria-expanded')) === 'false');
      pass('collapse: its one-line summary', await until(async () => /things? (is|are) improving and \d+ (is|are) holding you back\./.test(await page.locator('.dash-sec').first().innerText()), 3000));
      const saved = await until(async () => {
        const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
        return data?.[0]?.page_preferences?.dashboard?.closed?.sum === true;
      }, 10000);
      pass('collapse: remembered in the account (page_preferences.dashboard)', saved);
      await page.reload();
      await page.waitForSelector('.dash-sec-h .dash-colb', { timeout: 20000 });
      await sleep(1500);
      pass('collapse: still closed after a reload', (await page.locator('.dash-sec-h .dash-colb', { hasText: 'Current sprint' }).getAttribute('aria-expanded')) === 'false');
      await page.locator('.dash-sec-h .dash-colb', { hasText: 'Current sprint' }).evaluate((el) => el.click());
      await sleep(800);
    } else results.push('NOTE  collapse: no running sprint, so no Current sprint');
    const chain = page.locator('.dash-sec-h .dash-colb', { hasText: 'Objectives and Strategies' });
    await chain.evaluate((el) => el.click());
    pass('collapse: Objectives and Strategies closes with its summary', /Outcome Objectives? (is|are) improving this sprint\./.test(await page.locator('.dash-sec', { has: chain }).innerText()));
    await chain.evaluate((el) => el.click());
    await sleep(600);

    // Customising: switch the chart off, move What's behind up, here and in My Account.
    await page.getByRole('button', { name: 'Customise my dashboard' }).evaluate((el) => el.click());
    const panel = page.locator('.ds-dialog', { hasText: 'Which parts do you want to see, and in what order?' });
    pass('customise: the panel opens', await until(async () => panel.isVisible(), 4000));
    await panel.getByRole('switch', { name: 'Show Performance score chart' }).evaluate((el) => el.click());
    pass('customise: "Saved" after a change', await until(async () => (await page.locator('.ds-toast-text', { hasText: /^(Saved|Will sync)$/ }).count()) > 0, 6000));
    await panel.getByRole('button', { name: 'Move What’s behind your performance up' }).evaluate((el) => el.click());
    await sleep(800);
    await page.keyboard.press('Escape');
    await sleep(500);
    pass('customise: the chart is gone', (await page.locator('.dash-hero').count()) === 0);
    const order = await page.locator('.dash-sec-h .dash-colb').allInnerTexts();
    const iBehind = order.findIndex((t) => /BEHIND/i.test(t));
    const iChain = order.findIndex((t) => /OBJECTIVES AND/i.test(t));
    pass('customise: What’s behind your performance now comes first', iBehind >= 0 && iChain >= 0 && iBehind < iChain, order.join(' | '));
    await page.goto(`${APP}/my-account`);
    await page.getByRole('button', { name: 'Customise my dashboard' }).evaluate((el) => el.click());
    const panel2 = page.locator('.ds-dialog', { hasText: 'Which parts do you want to see, and in what order?' });
    pass('customise: the same panel in My Account, Settings', await until(async () => panel2.isVisible(), 4000));
    const sw = panel2.getByRole('switch', { name: 'Show Performance score chart' });
    pass('customise: My Account shows the same settings', (await sw.getAttribute('aria-checked')) === 'false');
    await sw.evaluate((el) => el.click());
    await panel2.getByRole('button', { name: 'Move Objectives and Strategies up' }).evaluate((el) => el.click());
    await sleep(900);
    await page.keyboard.press('Escape');
    await dashboard(page);
    pass('customise: back on, from My Account', (await page.locator('.dash-hero').count()) === 1);

    // A holding-back tap landing in the right place.
    const fix = page.locator('.dash-fix').first();
    if (await fix.count()) {
      const words = (await fix.innerText()).trim();
      const want = { 'Plan my sleep': '/sleep-wind-down', 'Plan some recovery': '/personal/reset', 'Review its Strategies': '/performance-plan', 'Plan it into this week': '/performance-sprint', 'Make it easier this week': '/performance-sprint' }[words];
      await fix.evaluate((el) => el.click());
      pass(`holding back: "${words}" lands on ${want}`, await until(async () => new URL(page.url()).pathname === want, 8000), page.url());
    } else pass('holding back: a fix to tap (the seeded short sleep)', false);
    // "Plan it into this week" opens Add a to-do for that Strategy, this week.
    if (sprint) {
      const { data: strat } = await db.from('plan_strategies').select('id, name').eq('plan_id', (await db.from('sprints').select('plan_id').eq('id', sprint.id).single()).data.plan_id).is('archived_at', null).order('sort_order').limit(1);
      await page.goto(`${APP}/performance-sprint`);
      await page.waitForSelector('.ds-page-title', { timeout: 20000 });
      await sleep(1200);
      await page.evaluate((id) => {
        window.history.pushState({ usr: { addTodoFor: id }, key: 'dash', idx: window.history.state?.idx + 1 || 1 }, '', '/performance-sprint');
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
      }, strat[0].id);
      await page.reload();
      await sleep(2500);
      const panelTodo = page.locator('.ds-dialog', { hasText: 'Add a to-do' });
      const opened = await until(async () => panelTodo.isVisible(), 6000);
      pass('holding back: "Plan it into this week" opens Add a to-do', opened);
      if (opened) {
        const chosen = await panelTodo.locator('[aria-checked="true"], [aria-pressed="true"]').allInnerTexts();
        pass('holding back: with that Strategy chosen', chosen.some((t) => t.includes(strat[0].name)), chosen.join(' | '));
        await page.keyboard.press('Escape');
      }
    }
  } finally {
    await context.close();
  }
}

await browser.close();
await cleanUp();
const counted = results.filter((r) => !r.startsWith('NOTE'));
results.push(`\n${counted.length - failures} of ${counted.length} passed`);
writeFileSync(join(out, 'results.txt'), results.join('\n'));
console.log(results.join('\n'));
process.exit(failures ? 1 : 0);
