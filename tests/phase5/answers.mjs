// Tim's answers of 10 Nov, 23:22, checked in a browser on the changed
// screens, at 1280px and 390 by 844, in light and dark:
//
//   - the week grid's day boxes (the sprint page's "This week" view and the
//     weekly debrief): a rated day is a shade of mint with no number, five
//     shades told apart, each at least 3 to 1 against the page, the surface
//     and the boxes; a tap, a hover or keyboard focus shows the word; a
//     screen reader hears "Monday 9 Nov, Very good"; a day not rated stays
//     empty; and a day can still be rated and cleared from the grid;
//   - Way of being in the Daily review and on the dashboard, and Sleep
//     quality in the Daily plan, in the five words Poor, Fair, Good, Very
//     good, Excellent, with no "1 to 10", "/10" or "Very poor"; older
//     answers (saved out of 10, and the old sleep keys) read as their words;
//   - "Mission" with a capital M: "Edit my Mission", "Save my Mission".
//
// It also saves a screenshot of every screen, in both modes at both sizes,
// into the folder given.
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked. It adds five earlier days of
// answers first (scripts/seed-test-ratings.mjs) and removes them at the end,
// and anything it rates in the grid it clears again.
//
//   node --import ./tests/scores/register.mjs tests/phase5/answers.mjs [folder for screenshots]
//   SIZES=390 MODES=light …   one part of it
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
let failures = 0;
let passes = 0;
const fails = [];
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else { failures += 1; fails.push(`FAIL  ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); }
};
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => false);
    if (v) return v;
    if (Date.now() > end) return false;
    await sleep(150);
  }
};

const WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const WORD_RE = '(Poor|Fair|Good|Very good|Excellent)';
const NUMBERED = /on a scale|1 to 10|\b\d+(\.\d+)?\/10\b|out of 10|very poor|1 to 5/i;

const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw new Error('Sign-in did not work.');
const me = signIn.user.id;
const todayKey = (() => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}-${p.find((x) => x.type === 'day').value}`;
})();
// What today's review and plan looked like before, so anything this run starts is put back.
const reviewBefore = (await db.from('day_reviews').select('id').eq('user_id', me).eq('local_date', todayKey)).data || [];
const planBefore = (await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', todayKey)).data || [];
execFileSync('node', ['scripts/seed-test-ratings.mjs'], { stdio: 'ignore' });

// Contrast (WCAG) between two rgb() colours.
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const browser = await chromium.launch();
try {
  // SIZES=1280 or 390, MODES=light or dark: one part of the run (each part fits inside 10 minutes).
  for (const width of [1280, 390].filter((w) => !process.env.SIZES || process.env.SIZES.split(',').includes(String(w)))) {
    for (const mode of ['light', 'dark'].filter((m) => !process.env.MODES || process.env.MODES.split(',').includes(m))) {
      const phone = width < 600;
      const size = width === 1280 ? '1280' : '390x844';
      const tag = `${width}px ${mode}`;
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
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
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
      const shot = async (name, opts = {}) => { if (out) await page.screenshot({ path: join(out, `${name}-${size}-${mode}.png`), fullPage: true, ...opts }); };
      const settle = async () => { await page.waitForLoadState('networkidle').catch(() => null); await page.evaluate(() => document.fonts.ready); await sleep(900); };
      const pageText = () => page.evaluate(() => (document.querySelector('.ds-guide--fullscreen') || document.querySelector('.ui-root') || document.body).innerText);

      await page.goto(`${APP}/auth/login`);
      await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
      await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
      await page.keyboard.press('Enter');
      await page.waitForURL(/welcome/, { timeout: 30000 });

      // ------------------------------------------------ the week grid, sprint page
      try {
        await page.goto(`${APP}/performance-sprint`);
        await page.getByRole('button', { name: 'This week', exact: true }).first().click({ timeout: 20000 });
        await settle();
        const row = page.locator('.ds-logweek').filter({ has: page.locator('.ds-logweek-rate-box') }).first();
        await row.scrollIntoViewIfNeeded();
        const facts = await row.evaluate((el) => {
          const root = el.closest('.ui-root');
          const cs = getComputedStyle(root);
          const probe = document.createElement('i');
          root.appendChild(probe);
          const colour = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
          const tokens = ['--rate-1', '--rate-2', '--rate-3', '--rate-4', '--rate-5'].map((t) => colour(cs.getPropertyValue(t).trim()));
          const grounds = ['--bg', '--surface', '--card'].map((t) => colour(cs.getPropertyValue(t).trim()));
          probe.remove();
          const boxes = [...el.querySelectorAll('.ds-logweek-rate-box')].map((b) => {
            const r = b.getBoundingClientRect();
            return { label: b.getAttribute('aria-label'), rating: b.getAttribute('data-rating'), bg: getComputedStyle(b).backgroundColor, text: b.innerText.trim(), w: r.width, h: r.height, disabled: b.disabled };
          });
          return { tokens, grounds, boxes, name: el.querySelector('.ds-log-name')?.innerText, group: el.querySelector('[role=group]')?.getAttribute('aria-label') };
        });
        pass(`week grid ${tag}: the rated habit has a box for each day`, facts.boxes.length >= 5, JSON.stringify(facts.boxes.map((b) => b.label)));
        pass(`week grid ${tag}: five shades, each at least 3 to 1 against the page, the surface and the boxes`, facts.tokens.every((t) => facts.grounds.every((g) => contrast(t, g) >= 3)), facts.tokens.map((t) => facts.grounds.map((g) => contrast(t, g).toFixed(2)).join('/')).join(' '));
        const steps = facts.tokens.slice(1).map((t, i) => contrast(t, facts.tokens[i]));
        pass(`week grid ${tag}: each shade is told apart from the next (1.25 to 1 or more)`, steps.every((s) => s >= 1.25), steps.map((s) => s.toFixed(2)).join(' '));
        // Stronger for better days: further from the page with each step.
        const fromPage = facts.tokens.map((t) => contrast(t, facts.grounds[0]));
        pass(`week grid ${tag}: better days are stronger`, fromPage.every((c, i) => i === 0 || c > fromPage[i - 1]), fromPage.map((c) => c.toFixed(1)).join(' '));
        const rated = facts.boxes.filter((b) => b.rating);
        pass(`week grid ${tag}: a rated day is filled with its shade`, rated.length >= 2 && rated.every((b) => b.bg === facts.tokens[Number(b.rating) - 1]), JSON.stringify(rated.map((b) => [b.rating, b.bg])));
        pass(`week grid ${tag}: no number or word inside a box`, facts.boxes.every((b) => b.text === ''), facts.boxes.map((b) => b.text).join('|'));
        const empty = facts.boxes.filter((b) => !b.rating);
        pass(`week grid ${tag}: a day not rated stays empty`, empty.length >= 1 && empty.every((b) => b.bg === facts.grounds[2]), JSON.stringify(empty.map((b) => b.bg)));
        pass(`week grid ${tag}: a screen reader hears the day, then the word`, facts.boxes.every((b) => new RegExp(`^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \\d{1,2} [A-Z][a-z]{2}, (${WORD_RE}|not rated|still to come)$`).test(b.label)) && facts.group === facts.name, `${facts.group}: ${facts.boxes.map((b) => b.label).join(' | ')}`);
        pass(`week grid ${tag}: every box is 44px or more`, facts.boxes.every((b) => b.w >= 43.5 && b.h >= 43.5), facts.boxes.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(' '));

        const first = row.locator('.ds-logweek-rate-box[data-rating]').first();
        const word = WORDS[Number(await first.getAttribute('data-rating')) - 1];
        const tip = page.locator('.ds-tip:not([hidden])');
        // Keyboard focus shows the word.
        await page.evaluate(() => document.activeElement?.blur());
        await sleep(200);
        await first.focus();
        pass(`week grid ${tag}: focusing a box shows its word`, Boolean(await until(async () => (await tip.innerText()).startsWith(word), 3000)), await tip.innerText().catch(() => 'no pop-up'));
        await page.keyboard.press('Escape');
        await page.evaluate(() => document.activeElement?.blur());
        if (!phone) {
          await first.hover();
          pass(`week grid ${tag}: pointing at a box shows its word`, Boolean(await until(async () => (await tip.innerText()).startsWith(word), 3000)), await tip.innerText().catch(() => 'no pop-up'));
          await page.mouse.move(2, 2);
        }
        // A tap shows the word, and the five words to change it.
        if (phone) await first.tap(); else await first.click();
        pass(`week grid ${tag}: tapping a box shows its word`, Boolean(await until(async () => (await tip.innerText()).startsWith(word), 3000)), await tip.innerText().catch(() => 'no pop-up'));
        const chooser = row.locator('.ds-logweek-rate-choose');
        pass(`week grid ${tag}: and the five words to change it, with the day's own chosen`, (await chooser.innerText().catch(() => '')).split('\n').map((x) => x.trim()).filter(Boolean).join(',') === WORDS.join(',') && (await chooser.locator('[aria-pressed=true]').innerText().catch(() => '')) === word, await chooser.innerText().catch(() => 'no chooser'));
        const tipBox = await tip.boundingBox();
        pass(`week grid ${tag}: the pop-up stays 12px inside the screen`, Boolean(tipBox) && tipBox.x >= 11.5 && tipBox.x + tipBox.width <= width - 11.5, JSON.stringify(tipBox));
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        pass(`week grid ${tag}: no sideways scroll with the words open`, sideways <= 0, `${sideways}px`);
        const small = await chooser.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 43.5 || r.width < 43.5).length);
        pass(`week grid ${tag}: each word is 44px or more`, small === 0, `${small}`);
        const box = await row.boundingBox();
        await shot('week-grid-sprint', { fullPage: false, clip: { x: 0, y: Math.max(0, box.y - 90), width, height: Math.min(phone ? 620 : 420, box.height + 180) } });
        await page.keyboard.press('Escape');

        // Rate a day that isn't rated yet, see it fill, then clear it again (once: 1280 light).
        if (width === 1280 && mode === 'light') {
          const open = row.locator('.ds-logweek-rate-box:not([data-rating]):not([disabled])').first();
          if (await open.count()) {
            const label = await open.getAttribute('aria-label');
            const day = label.replace(/, not rated$/, '');
            const box2 = row.locator(`.ds-logweek-rate-box[aria-label^="${day},"]`);
            await open.click();
            await row.locator('.ds-logweek-rate-choose').getByRole('button', { name: 'Excellent', exact: true }).click();
            pass('week grid: rating an empty day fills it with the strongest shade', Boolean(await until(async () => (await box2.getAttribute('data-rating')) === '5' && (await box2.getAttribute('aria-label')) === `${day}, Excellent`, 5000)), await box2.getAttribute('aria-label'));
            await sleep(1500);
            await row.locator('.ds-logweek-rate-choose').getByRole('button', { name: 'Excellent', exact: true }).click();
            pass('week grid: tapping the chosen word again clears the day', Boolean(await until(async () => (await box2.getAttribute('data-rating')) == null && (await box2.getAttribute('aria-label')) === `${day}, not rated`, 5000)), await box2.getAttribute('aria-label'));
            await sleep(2500);
          } else pass('week grid: a day not yet rated to try', false, 'every day is rated');
        }
      } catch (e) {
        pass(`week grid ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      // ------------------------------------------------ the week grid, weekly debrief
      try {
        await page.goto(`${APP}/performance-sprint/debrief`);
        await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
        // The habits' week is the debrief's "numbers" step: move on until the grid shows.
        for (let i = 0; i < 4 && !(await page.locator('.ds-logweek-rate-box').count()); i += 1) {
          await page.getByRole('button', { name: /^(Next|Start|Continue)/ }).first().click({ timeout: 4000 }).catch(() => null);
          await sleep(900);
        }
        await settle();
        const labels = await page.locator('.ds-logweek-rate-box').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-label')}|${e.innerText.trim()}`));
        pass(`debrief ${tag}: the rated habit's week is boxes of mint, with the word for a screen reader and no number`, labels.length >= 5 && labels.every((l) => new RegExp(`^[A-Z][a-z]+day \\d{1,2} [A-Z][a-z]{2}, (${WORD_RE}|not rated|still to come)\\|$`).test(l)), labels.join(' ; '));
        pass(`debrief ${tag}: no numbered rating on the screen`, !NUMBERED.test(await pageText()), NUMBERED.exec(await pageText())?.[0]);
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        pass(`debrief ${tag}: no sideways scroll`, sideways <= 0, `${sideways}px`);
        await shot('week-grid-debrief');
      } catch (e) {
        pass(`debrief ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      // ------------------------------------------------ Daily plan: sleep quality
      try {
        await page.goto(`${APP}/daily-plan`);
        await page.waitForSelector('.ds-guide-question, .ds-guide-title, .ds-guide-summary', { timeout: 20000 });
        await settle();
        const quality = page.getByRole('radiogroup', { name: /Quality/ }).first();
        if (await quality.count()) {
          const words = (await quality.getByRole('radio').allInnerTexts()).map((w) => w.trim());
          pass(`daily plan ${tag}: sleep quality is the five words`, words.join(',') === WORDS.join(','), words.join(','));
          pass(`daily plan ${tag}: no "Very poor" and no numbers`, !NUMBERED.test(await pageText()), NUMBERED.exec(await pageText())?.[0]);
        } else pass(`daily plan ${tag}: the sleep question is on the first screen`, false, (await pageText()).slice(0, 120));
        await shot('daily-plan-sleep');
      } catch (e) {
        pass(`daily plan ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      // ------------------------------------------------ Daily review: way of being
      try {
        await page.goto(`${APP}/daily-review`);
        await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
        const heading = async () => (await page.locator('.ds-guide-question').first().innerText()).replace(/\s+/g, ' ').trim();
        for (let i = 0; i < 4 && !/^How (did you want to be today|.+ were you today)\?$/.test(await heading()); i += 1) {
          await page.getByRole('button', { name: 'Next', exact: true }).click({ timeout: 4000 }).catch(() => null);
          await sleep(700);
        }
        if ((await heading()) === 'How did you want to be today?') {
          await page.getByRole('textbox', { name: 'In your own words' }).fill('Calm under pressure');
          await page.getByRole('button', { name: 'Use these words' }).click();
          await until(async () => /were you today\?$/.test(await heading()), 8000);
        }
        await settle();
        const h = await heading();
        pass(`daily review ${tag}: the question names the way of being, with no "scale of 1 to 10"`, /^How .+ were you today\?$/.test(h) && !NUMBERED.test(h), h);
        const words = (await page.getByRole('radiogroup').first().getByRole('radio').allInnerTexts()).map((w) => w.trim());
        pass(`daily review ${tag}: the answers are the five words`, words.join(',') === WORDS.join(','), words.join(','));
        pass(`daily review ${tag}: no numbers and no "1 is not at all"`, !NUMBERED.test(await pageText()) && !/is not at all|is completely/.test(await pageText()), (await pageText()).slice(0, 200));
        const small = await page.getByRole('radiogroup').first().getByRole('radio').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 43.5).length);
        pass(`daily review ${tag}: each answer is 44px or more`, small === 0, `${small}`);
        await shot('daily-review-way-of-being');
      } catch (e) {
        pass(`daily review ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      // ------------------------------------------------ the dashboard
      try {
        await page.goto(`${APP}/dashboard`);
        await page.waitForSelector('.dash-fold-h', { timeout: 20000 });
        await settle();
        for (const title of ['How you want to be', 'Sleep']) {
          const fold = page.locator('.dash-fold').filter({ has: page.locator('.dash-fold-t', { hasText: new RegExp(`^${title}$`) }) }).first();
          if (!(await fold.count())) { pass(`dashboard ${tag}: "${title}" shows`, false, 'no such section'); continue; }
          if ((await fold.locator('.dash-fold-h').getAttribute('aria-expanded')) !== 'true') await fold.locator('.dash-fold-h').click();
          await sleep(500);
          const text = (await fold.innerText()).replace(/\s+/g, ' ');
          if (title === 'How you want to be') {
            // Older answers of 7, 5, 9, 8 and 6 out of 10: an average of 7, read "Very good".
            pass(`dashboard ${tag}: the way of being reads as a word, from answers saved out of 10`, /How you want to be Very good\b/.test(text), text.slice(0, 160));
            pass(`dashboard ${tag}: "Green weeks averaged Very good or better."`, text.includes('Green weeks averaged Very good or better.'), text.slice(-200));
          } else {
            // Saved as very_poor, fair, very_good, good and poor: they read Poor, Good, Excellent, Very good and Fair.
            pass(`dashboard ${tag}: sleep quality reads in the five words`, new RegExp(`Average quality ${WORD_RE}\\b`).test(text) && /\bExcellent\b/.test(text), text.slice(0, 200));
          }
          pass(`dashboard ${tag}: no number rating in "${title}"`, !NUMBERED.test(text), NUMBERED.exec(text)?.[0]);
        }
        pass(`dashboard ${tag}: no numbered rating anywhere on the page`, !/\b\d+(\.\d+)?\/10\b|out of 10|very poor/i.test((await pageText()).replace(/Lowest now[^\n]*\n?[^\n]*/g, '')), /\b\d+(\.\d+)?\/10\b|out of 10|very poor/i.exec(await pageText())?.[0]);
        await shot('dashboard-ratings');
      } catch (e) {
        pass(`dashboard ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      // ------------------------------------------------ Mission, with a capital M
      try {
        await page.goto(`${APP}/performance-plan`);
        const edit = page.getByRole('button', { name: 'Edit my Mission', exact: true });
        await edit.first().waitFor({ timeout: 20000 });
        await settle();
        pass(`mission ${tag}: the plan says "Edit my Mission"`, (await edit.first().innerText()).trim() === 'Edit my Mission', await edit.first().innerText());
        pass(`mission ${tag}: no lower-case "mission" on the plan`, !/\b(my|your|the) mission\b/.test(await pageText()), /\b(my|your|the) mission\b/.exec(await pageText())?.[0]);
        await edit.first().click();
        const panel = page.locator('.ds-panel, [role=dialog]').first();
        await panel.waitFor({ timeout: 8000 });
        await sleep(600);
        const words = (await panel.innerText()).replace(/\s+/g, ' ');
        // Titles and buttons are drawn in capitals from sentence-case words: read the words as written.
        const written = await panel.evaluate((el) => [...el.querySelectorAll('h1, h2, h3, button')].map((x) => x.textContent.trim()).filter(Boolean));
        pass(`mission ${tag}: the panel is "Edit my Mission"`, written.includes('Edit my Mission'), written.join(' | '));
        pass(`mission ${tag}: no lower-case "mission" in the panel`, !/\b(my|your|the) mission\b/.test(words), words.slice(0, 200));
        await shot('mission-panel', { fullPage: false });
        await page.keyboard.press('Escape');
        await sleep(400);
        await page.goto(`${APP}/my-account`);
        await page.getByRole('button', { name: /my Mission$/ }).first().waitFor({ timeout: 20000 });
        await settle();
        pass(`mission ${tag}: My Account says "Edit my Mission"`, (await page.getByRole('button', { name: 'Edit my Mission', exact: true }).count()) === 1, (await pageText()).slice(0, 200));
        pass(`mission ${tag}: no lower-case "mission" in My Account`, !/\b(my|your|the) mission\b/.test(await pageText()), /\b(my|your|the) mission\b/.exec(await pageText())?.[0]);
        await shot('mission-my-account');
      } catch (e) {
        pass(`mission ${tag}: checked`, false, e.message.split('\n')[0]);
      }

      pass(`no console errors (${tag})`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();
    }
  }
} finally {
  await browser.close();
  // Put the test person back: the five earlier days go, and anything started today that wasn't there before.
  execFileSync('node', ['scripts/seed-test-ratings.mjs', '--remove'], { stdio: 'ignore' });
  if (!reviewBefore.length) await db.from('day_reviews').delete().eq('user_id', me).eq('local_date', todayKey);
  if (!planBefore.length) await db.from('day_plans').delete().eq('user_id', me).eq('local_date', todayKey);
}

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
