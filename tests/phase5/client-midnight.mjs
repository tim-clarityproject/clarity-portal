// "Today" runs on the client's own midnight (time-zone-safeguards.md, rule
// 12; Tim, 10 Nov): the test client in Los Angeles and in Sydney, a few
// minutes either side of their own midnight, while the UK and UTC are on a
// different day. On the TEST database only (every other host and every
// email call is blocked); Sam is seeded again at the end.
//
// For each place, just before and just after its own midnight:
//   - Home's date is the client's own day, not the UK's or UTC's;
//   - a to-do added on Home is saved on the client's own day;
//   - a habit logged on Home is saved on the client's own day;
//   - the Daily plan and the Daily review open on the client's own day
//     (before 04:00 the review is still yesterday's, by the 04:00 rule);
//   - opening the sprint page puts the client's zone on their row before
//     the server is asked to close a week, so the server's own today
//     (person_today) is the client's day too.
//
//   node --import ./tests/scores/register.mjs tests/phase5/client-midnight.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { dayIn, dayWords, instantAt, addDays } from '../../src/lib/time/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(300); }
  return null;
}
let passes = 0;
const fails = [];
const pass = (name, ok, detail = '') => { if (ok) passes += 1; else fails.push(`FAIL  ${name}${detail ? `: ${String(detail).slice(0, 240)}` : ''}`); };

const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: who, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = who.user.id;

// The day before yesterday, so every instant used is in the past (a clock
// ahead of the real one ends the sign-in).
const realUtcDay = new Date().toISOString().slice(0, 10);
const NIGHT = addDays(realUtcDay, -3); // the local day that ends at the midnight under test
const PLACES = [
  { name: 'Los Angeles', zone: 'America/Los_Angeles' }, // behind the UK: at its midnight the UK is already on the next day
  { name: 'Sydney', zone: 'Australia/Sydney' },          // ahead of the UK: at its midnight the UK and UTC are still on the day before
];

const browser = await chromium.launch();
const TAG = `Midnight check ${Date.now()}`;
try {
  for (const place of PLACES) {
    for (const [label, date, time] of [['just before midnight', NIGHT, '23:40'], ['just after midnight', addDays(NIGHT, 1), '00:20']]) {
      const now = instantAt(date, time, place.zone);
      const tag = `${place.name}, ${label}`;
      const ownDay = dayIn(place.zone, now);
      const ukDay = dayIn('Europe/London', now);
      const utcDay = now.toISOString().slice(0, 10);
      // The two moments that tell the midnights apart: Los Angeles before its midnight (the UK and UTC are already on the next day) and Sydney after its midnight (they are still on the day before).
      const tellsApart = (place.name === 'Los Angeles') === (label === 'just before midnight');
      pass(`${tag}: the client's day is ${ownDay}${tellsApart ? `, while the UK and UTC are on ${ukDay}` : ''}`, ownDay === date && (!tellsApart || (ukDay !== ownDay && utcDay !== ownDay)), `${ownDay} uk ${ukDay} utc ${utcDay}`);

      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: place.zone });
      await context.clock.install({ time: now });
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
        if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
        if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
        return route.fallback();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await page.goto(`${APP}/auth/login`);
        await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
        await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
        await page.keyboard.press('Enter');
        await page.waitForURL(/welcome/, { timeout: 30000 });
        await page.goto(`${APP}/welcome`);
        await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
        await until(async () => (await page.locator('.home-page .ds-loading').count()) === 0, 20000);
        await sleep(800);

        // Home's own date.
        const shown = (await page.locator('.ds-mdial-date, .home-page .ds-page-meta').first().innerText().catch(() => '')).trim();
        pass(`${tag}: Home shows the client's own day (${dayWords(now, place.zone)})`, shown.includes(dayWords(now, place.zone)), shown);

        // A to-do added on Home.
        const words = `${TAG} ${place.name} ${label}`;
        await page.locator('.home-add').click();
        await page.waitForSelector('.ds-panel textarea, .ds-panel input', { timeout: 8000 });
        await page.getByLabel('What needs doing?').fill(words);
        await page.locator('.ds-panel').getByText('Grow through referrals', { exact: true }).click();
        await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
        const todo = await until(async () => (await db.from('todos').select('created_on').eq('user_id', me).eq('text', words)).data?.[0], 15000);
        pass(`${tag}: a to-do added on Home is saved on the client's own day`, todo?.created_on === ownDay, JSON.stringify(todo));

        // A habit logged on Home.
        const water = page.getByLabel('Water today').first();
        const amount = label === 'just before midnight' ? '1.5' : '0.5';
        await water.fill(amount);
        await water.blur();
        const log = await until(async () => {
          const { data } = await db.from('habit_logs').select('local_date, value, updated_at').eq('user_id', me).eq('local_date', ownDay).eq('value', Number(amount));
          return data?.[0];
        }, 15000);
        pass(`${tag}: a habit logged on Home is saved on the client's own day`, Boolean(log), `${ownDay} ${amount}`);
        const wrong = [...new Set([ukDay, utcDay])].filter((d) => d !== ownDay);
        if (wrong.length) {
          const { data: stray } = await db.from('todos').select('created_on').eq('user_id', me).eq('text', words).in('created_on', wrong);
          pass(`${tag}: nothing was saved on the UK's or UTC's day instead`, (stray || []).length === 0, JSON.stringify(stray));
        }

        // The daily tools open on the client's own day.
        await page.goto(`${APP}/daily-plan`);
        await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
        await sleep(1200);
        const planKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /day-plan/.test(k)).join(' '));
        pass(`${tag}: the Daily plan is for the client's own day`, planKeys.includes(ownDay) && !wrong.some((d) => planKeys.includes(d)), planKeys.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>'));
        await page.goto(`${APP}/daily-review`);
        await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
        await sleep(1200);
        // Before 04:00 the review is still for the evening just gone (the 04:00 rule), on the client's clock.
        const reviewDay = time < '04:00' ? addDays(ownDay, -1) : ownDay;
        const reviewKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /day-review/.test(k)).join(' '));
        pass(`${tag}: the Daily review is for ${time < '04:00' ? 'the evening just gone, by the client’s own clock' : 'the client’s own day'}`, reviewKeys.includes(reviewDay), reviewKeys.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>'));

        // The sprint page: the zone reaches the person's row before the server closes a week.
        await page.goto(`${APP}/performance-sprint`);
        await page.waitForSelector('.sprint-page', { timeout: 30000 });
        const saved = await until(async () => {
          const { data } = await db.from('person_settings').select('time_zone').eq('user_id', me).limit(1);
          return data?.[0]?.time_zone === place.zone ? data[0].time_zone : null;
        }, 15000);
        pass(`${tag}: the client's zone is saved, so the server's own today is the client's day`, saved === place.zone, String(saved));
        pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
      } catch (e) {
        pass(`${tag}: ran to the end`, false, e.message.split('\n')[0]);
      } finally {
        await context.close();
      }
      await sleep(1500);
    }
  }
} finally {
  await browser.close();
  // Sam back to the seeded state (plan, sprint, zone and settings).
  await db.from('todos').delete().eq('user_id', me).like('text', `${TAG}%`);
  execFileSync('node', ['scripts/seed-test-plan.mjs', '--reset'], { stdio: 'pipe' });
}

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
