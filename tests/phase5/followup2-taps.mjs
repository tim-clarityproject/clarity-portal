// Phase 5 follow-up 2, Step 5: the screens whose tappable answers were
// reworded (rule 29aa) that no other comparison measures, at 1280px and
// 390 x 844, dark and light: 44px tap areas and no sideways scroll
// (tests/phase5/measure.mjs, as every Phase 5 comparison measures them).
//
//   the check-in's "Did you travel this month?" (three full sentences)
//   the Stop doing audit's four answers, and "Which one will you take
//     action on first?" with the new words in its brackets
//   the plan's "How will you measure it?" drop-down, open (seven "I'll" answers)
//
// The others are measured where they already were: the dashboard and the
// check-in's Add to my sprint in tests/phase5/compare.mjs; Recovery's
// "How are you feeling?", the end-of-sprint review, Start a sprint and the
// plan builder's steps in tests/phase2/compare.mjs.
//
// Signed in as the invented test client on the TEST database only; every
// other host, /functions/v1/, /api/ and every email call is blocked. The
// fixed day's seed is used; the check-in rows of its month are put back as
// they were, nothing in the audit is saved, and the seed is put back on
// the real today at the end.
//
//   node --import ./tests/scores/register.mjs tests/phase5/followup2-taps.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';
import { BANNED, CORAL, MINT, measure } from './measure.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`;
  results.push(line);
  console.log(line);
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
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return v;
}

console.log(`Fixed day: ${fixedLabel()}`);
seedFixed('--reset');
const MONTH = `${FIXED_TODAY.slice(0, 7)}-01`; // as checkins.month holds it
const { data: monthBefore } = await db.from('checkins').select('*').eq('user_id', me).eq('month', MONTH);
const clearMonth = () => db.from('checkins').delete().eq('user_id', me).eq('month', MONTH);
await clearMonth();

const browser = await chromium.launch();
async function device(width, mode) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
  await fixClock(context);
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
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
const settle = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  new Promise((r) => { setTimeout(r, 2000); }),
]));
// The statement under a question, or '' at once when the screen has none.
const statement = async (page) => ((await page.locator('.ds-statement').count()) ? await page.locator('.ds-statement').first().innerText().catch(() => '') : '');
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();

async function check(page, tag, words, scope) {
  await settle(page);
  const r = await page.evaluate(measure, { CORAL, MINT, BANNED, scope });
  const text = await page.evaluate(() => document.body.innerText);
  for (const w of words) pass(`${tag}: shows "${w}"`, text.includes(w));
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
}

const TRAVEL = ['I didn’t travel', 'I took short trips', 'I made long journeys or crossed time zones'];
const AUDIT = ['Stop it', 'Automate it', 'Delegate it', 'Do it later'];
const MEASURES = ['I’ll count it each week', 'I’ll measure an amount each day', 'I’ll say yes or no each day', 'I’ll say yes or no each day, under a limit', 'I’ll say yes or no once a week', 'I’ll keep a daily count under a limit', 'I’ll rate it each day, from Poor to Excellent'];

try {
  for (const mode of (process.env.MODES || 'dark,light').split(',')) {
    for (const width of [1280, 390]) {
      const at = `${width}px ${mode}`;
      const { context, page } = await device(width, mode);
      try {
        // The check-in, as far as the travel question (the first answer on
        // each screen; the drinks question counts and keeps Next).
        await clearMonth();
        await page.goto(`${APP}/monthly-review`);
        await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
        for (let i = 0; i < 30 && (await heading(page)) !== 'Did you travel this month?'; i += 1) {
          const before = await heading(page) + await statement(page);
          if (await page.locator('.ck-drinks').count() || !(await page.locator('.ds-guide-body [role=radio]').count())) {
            await sleep(450);
            await page.locator('.ds-guide-next').click();
          } else {
            await page.locator('.ds-guide-body [role=radio]').first().click();
          }
          await until(async () => (await heading(page)) + await statement(page) !== before, 4000);
        }
        if ((await heading(page)) === 'Did you travel this month?') await check(page, `check-in travel, ${at}`, TRAVEL, '.ds-guide');
        else pass(`check-in travel, ${at}: reached`, false, await heading(page));

        // The Stop doing audit, with one activity and an answer chosen.
        await page.goto(`${APP}/time-audit`);
        await page.getByRole('textbox', { name: 'Activity 1' }).waitFor({ timeout: 30000 });
        await page.getByRole('textbox', { name: 'Activity 1' }).fill('Weekly status reports for the board');
        await page.getByRole('radio', { name: 'Delegate it' }).first().waitFor({ timeout: 8000 });
        await page.getByRole('radio', { name: 'Delegate it' }).first().click();
        await check(page, `Stop doing audit, ${at}`, AUDIT, null);
        // "Which one will you take action on first?" is a drop-down: its answer carries the new words.
        await page.locator('.plan-field .ds-dd').first().click();
        await page.getByRole('option').first().waitFor({ timeout: 5000 });
        await check(page, `Stop doing audit, which one first open, ${at}`, ['Weekly status reports for the board (Delegate it)'], null);
        await page.keyboard.press('Escape');

        // The plan's habits: "How will you measure it?" open.
        await page.goto(`${APP}/performance-plan/edit`);
        await page.waitForSelector('.ds-guide', { timeout: 30000 });
        for (let i = 0; i < 14 && !(await page.locator('.ds-habed .ds-dd').count()); i += 1) {
          const before = await heading(page);
          await page.locator('.ds-guide-next').click();
          await until(async () => (await heading(page)) !== before, 4000);
        }
        if (await page.locator('.ds-habed .ds-dd').count()) {
          await page.locator('.ds-habed .ds-dd').first().click();
          await page.getByRole('option').first().waitFor({ timeout: 5000 });
          await check(page, `plan, How will you measure it? open, ${at}`, MEASURES, null);
          await page.keyboard.press('Escape');
        } else pass(`plan, How will you measure it?, ${at}: reached`, false, await heading(page));
      } catch (e) {
        pass(`${at}: ran to the end`, false, e.message.split('\n')[0]);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await clearMonth();
  if (monthBefore?.length) await db.from('checkins').insert(monthBefore);
  seedForReal('--reset');
}

console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
