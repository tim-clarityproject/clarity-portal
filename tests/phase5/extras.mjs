// Phase 5 follow-up, step 1: the answers once kept on the device only, now
// kept with their rows once migration 040 is there (answerExtras.js):
// the drinks counted and the trip on the check-in, and the way of being
// chosen in Review my day when the day had no plan. TEST database only.
//   node --import ./tests/scores/register.mjs tests/phase5/extras.mjs [folder]
//
// With 040's columns there, it checks:
//   - a new device sees the same answers (a second browser profile);
//   - signing out and back in keeps them;
//   - an offline change syncs once the connection is back.
// Without them (before Tim has run 040), it checks the fallback instead:
// the answers stay on the device with no error, a new device shows the
// answer as it was saved ("You answered …"), and nothing is lost on this
// device. Either way it says which it ran.
//
// The check-in is made by the organisation test client (no running
// sprint), for this month, only when it has none; the way of being uses a
// past day of the mid-sprint client's with no plan and no review. Both are
// deleted at the end. Every email call and every other host is blocked.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { checkinMonth } from '../../src/lib/performance/checkin.js';
import { addDays } from '../../src/lib/scores/dates.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const out = process.argv[2] || join(process.cwd(), 'tmp-phase5-extras');
mkdirSync(out, { recursive: true });

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`); };
const note = (s) => results.push(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(250); } return v; }

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');
async function client(email, password) {
  const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db, me: data.user.id };
}

const browser = await chromium.launch();
// One browser profile is one device: its own storage, nothing shared.
async function device(email, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await context.route(/\/auth\/v1\/(signup|recover|otp|magiclink|invite|resend)|\/api\/.*|\/functions\/v1\//, (r) => r.abort());
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass('no page errors', false, e.message));
  await signIn(page, email, password);
  return { context, page };
}
async function signIn(page, email, password) {
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  await sleep(2500);
}
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const text = async (page, sel) => ((await page.locator(sel).first().innerText().catch(() => '')) || '').trim();
const errorShown = async (page) => (await page.locator('.ds-toast--error, [role=alert]').count()) > 0;

const DRINKS_Q = 'On average, what do you drink in a week?';
const TRAVEL_Q = 'Did you travel this month?';
const PINT = 'One more: pint of beer or cider';
const pints = (page) => text(page, `.ds-stepper[aria-label="Pint of beer or cider"] .ds-stepper-value`);

// To the drinks question: the opening's Next, then each chosen answer again
// (one tap moves on), or the first answer where none is chosen yet.
async function toDrinks(page) {
  await page.goto(`${APP}/check-in`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  await sleep(800);
  for (let i = 0; i < 20; i += 1) {
    const h = await heading(page);
    if (h === DRINKS_Q) return true;
    const before = h + (await text(page, '.ds-statement'));
    if (await page.locator('.ds-guide-next').count()) await page.locator('.ds-guide-next').click();
    else {
      const chosen = page.locator('.ds-guide-body [role=radio][aria-checked=true]');
      await ((await chosen.count()) ? chosen.first() : page.locator('.ds-guide-body [role=radio]').first()).click();
    }
    await until(async () => (await heading(page)) + (await text(page, '.ds-statement')) !== before, 4000);
    await sleep(250);
  }
  return (await heading(page)) === DRINKS_Q;
}

// ------------------------------------------------ is 040 there?
const org = await client(env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
const probe = await org.db.from('checkins').select('id, drinks, trip').limit(1);
const ready = !probe.error;
note(ready ? '040 is there: checking the answers are saved with their rows' : `040 isn't there yet (${probe.error?.code || 'no column'}): checking the device fallback`);

const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUR = checkinMonth(londonToday);
const { data: hadCheckin } = await org.db.from('checkins').select('id').eq('user_id', org.me).eq('month', CUR);
const madeCheckin = !hadCheckin?.length;

const cleanUps = [];
try {
  // ---------------------------------------------- the check-in's drinks and trip
  if (!madeCheckin) note('C skipped: the organisation client already has this month’s check-in, which is never changed here');
  else {
    cleanUps.push(() => org.db.from('checkins').delete().eq('user_id', org.me).eq('month', CUR));
    const a = await device(env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
    try {
      pass('C device A reaches the drinks question', await toDrinks(a.page), await heading(a.page));
      for (let i = 0; i < 4; i += 1) await a.page.getByRole('button', { name: PINT }).click();
      pass('C device A: 4 pints, about 9 units', (await text(a.page, '.ck-drinks-total')) === 'That’s about 9 units a week.', await text(a.page, '.ck-drinks-total'));
      await sleep(450);
      await a.page.locator('.ds-guide-next').click();
      // On to the travel question, and Long journeys.
      for (let i = 0; i < 8 && (await heading(a.page)) !== TRAVEL_Q; i += 1) {
        const before = await heading(a.page) + (await text(a.page, '.ds-statement'));
        await a.page.locator('.ds-guide-body [role=radio]').first().click();
        await until(async () => (await heading(a.page)) + (await text(a.page, '.ds-statement')) !== before, 4000);
      }
      pass('C device A reaches the travel question', (await heading(a.page)) === TRAVEL_Q, await heading(a.page));
      await a.page.locator('.ds-guide-body [role=radio]', { hasText: 'Long journeys or time zones' }).click();
      await sleep(2500); // the answers' save
      pass('C device A: no error shown', !(await errorShown(a.page)));
      const row = async () => (await org.db.from('checkins').select(ready ? 'answers, drinks, trip' : 'answers').eq('user_id', org.me).eq('month', CUR).limit(1)).data?.[0];
      const saved = await until(async () => { const r = await row(); return r?.answers?.H8 ? r : null; }, 10000);
      pass('C the band is saved in the answers (H8, 8 to 14 units)', saved?.answers?.H8 === 'u8_14', JSON.stringify(saved?.answers));
      if (ready) {
        pass('C the drinks counted are saved with the row', saved?.drinks?.pint === 4, JSON.stringify(saved?.drinks));
        pass('C the trip is saved with the row', saved?.trip === 'long', saved?.trip);
        const kept = await a.page.evaluate((k) => localStorage.getItem(k), `clarity-checkin-extras:${org.me}:${CUR}`);
        pass('C the device keeps no copy of its own once the row holds them', kept === null, kept);
      } else {
        const kept = JSON.parse(await a.page.evaluate((k) => localStorage.getItem(k), `clarity-checkin-extras:${org.me}:${CUR}`) || 'null');
        pass('C (before 040) the device keeps the drinks and the trip', kept?._drinks?.pint === 4 && kept?._trip === 'long', JSON.stringify(kept));
      }

      // A new device (a second browser profile).
      const b = await device(env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
      try {
        pass('C device B reaches the drinks question', await toDrinks(b.page), await heading(b.page));
        if (ready) pass('C device B sees the same drinks (4 pints)', (await pints(b.page)) === '4', await pints(b.page));
        else pass('C (before 040) device B shows the answer as saved', (await text(b.page, '.ck-drinks-total')) === 'You answered “8 to 14 units”.', await text(b.page, '.ck-drinks-total'));
        pass('C device B: no error shown', !(await errorShown(b.page)));
      } finally {
        await b.context.close();
      }

      // Signing out and back in, on device A.
      await a.page.goto(`${APP}/my-account`);
      await a.page.getByRole('button', { name: 'Sign out' }).first().click();
      await until(async () => !/my-account/.test(a.page.url()), 15000);
      await signIn(a.page, env.TEST_ORG_CLIENT_EMAIL, env.TEST_ORG_CLIENT_PASSWORD);
      pass('C after signing in again, back at the drinks question', await toDrinks(a.page), await heading(a.page));
      if (ready) pass('C signing out and in keeps the drinks (4 pints)', (await pints(a.page)) === '4', await pints(a.page));
      else pass('C (before 040) after signing in again, the answer as saved', (await text(a.page, '.ck-drinks-total')).startsWith('You answered'), await text(a.page, '.ck-drinks-total'));

      // An offline change syncs later.
      await a.context.setOffline(true);
      if (!ready) for (let i = 0; i < 4; i += 1) await a.page.getByRole('button', { name: PINT }).click();
      await a.page.getByRole('button', { name: PINT }).click();
      await sleep(2500);
      pass('C offline: "Will sync", no error', /will sync/i.test(await text(a.page, '.ds-guide-bar')) && !(await errorShown(a.page)), await text(a.page, '.ds-guide-bar'));
      await a.context.setOffline(false);
      if (ready) {
        const synced = await until(async () => ((await row())?.drinks?.pint === 5 ? true : null), 30000);
        pass('C back online: the offline change reaches the row (5 pints)', Boolean(synced), JSON.stringify((await row())?.drinks));
      } else {
        const synced = await until(async () => ((await row())?.answers?.H8 === 'u8_14' ? true : null), 30000);
        pass('C (before 040) back online: the band syncs', Boolean(synced));
        const kept = JSON.parse(await a.page.evaluate((k) => localStorage.getItem(k), `clarity-checkin-extras:${org.me}:${CUR}`) || 'null');
        pass('C (before 040) the device keeps the new count (5 pints)', kept?._drinks?.pint === 5, JSON.stringify(kept));
      }
      await a.page.screenshot({ path: join(out, 'checkin-drinks.png') });
    } finally {
      await a.context.close();
    }
  }

  // ---------------------------------------------- Review my day's way of being
  const sam = await client(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  let day = null;
  for (let i = 3; i < 12 && !day; i += 1) {
    const d = addDays(londonToday, -i);
    const [{ data: p }, { data: r }] = await Promise.all([
      sam.db.from('day_plans').select('id').eq('user_id', sam.me).eq('local_date', d),
      sam.db.from('day_reviews').select('id').eq('user_id', sam.me).eq('local_date', d),
    ]);
    if (!p?.length && !r?.length) day = d;
  }
  if (!day) note('W skipped: no recent day without a plan or a review');
  else {
    cleanUps.push(() => sam.db.from('day_reviews').delete().eq('user_id', sam.me).eq('local_date', day));
    const WAY = 'Calm under pressure';
    const toBe = async (page) => {
      await page.goto(`${APP}/my-day/review/${day}`);
      await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 30000 });
      await sleep(1000);
      const change = page.getByRole('button', { name: /^(Change|Add) How you showed up/ });
      if (await change.count()) await change.first().click();
      await sleep(800);
      return heading(page);
    };
    const a = await device(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
    try {
      pass('W device A: "How did you want to be today?"', (await toBe(a.page)) === 'How did you want to be today?', await heading(a.page));
      const own = a.page.getByRole('textbox', { name: 'In your own words' });
      await own.fill(WAY);
      const done = a.page.getByRole('button', { name: 'Use these words' });
      await done.click();
      await sleep(2500);
      pass('W device A: the rating now names the way of being', /calm under pressure/i.test(await heading(a.page)), await heading(a.page));
      pass('W device A: no error shown', !(await errorShown(a.page)));
      const row = async () => (await sam.db.from('day_reviews').select(ready ? 'id, way_of_being' : 'id').eq('user_id', sam.me).eq('local_date', day).limit(1)).data?.[0];
      if (ready) {
        const saved = await until(async () => ((await row())?.way_of_being === WAY ? true : null), 10000);
        pass('W the way of being is saved with the review', Boolean(saved), JSON.stringify(await row()));
        const b = await device(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
        try {
          await b.page.goto(`${APP}/my-day/review/${day}`);
          await b.page.waitForSelector('.ds-guide-summary', { timeout: 30000 });
          pass('W device B sees the same way of being', (await b.page.locator('.ds-guide-summary').innerText()).includes(WAY));
        } finally {
          await b.context.close();
        }
      } else {
        const kept = JSON.parse(await a.page.evaluate((k) => localStorage.getItem(k), `clarity-day-review-local:${sam.me}:${day}`) || 'null');
        pass('W (before 040) the device keeps the way of being', kept?.way === WAY, JSON.stringify(kept));
      }
      await a.page.screenshot({ path: join(out, 'review-way.png') });
    } finally {
      await a.context.close();
    }
  }
} catch (e) {
  pass('the run finished', false, e.message.split('\n')[0]);
} finally {
  for (const fn of cleanUps) await fn().catch(() => {});
  await browser.close();
}
console.log(results.join('\n'));
const counted = results.filter((r) => !r.startsWith('NOTE'));
console.log(`\n${counted.length - failures} of ${counted.length} passed`);
process.exit(failures ? 1 : 0);
