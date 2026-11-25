// Tim's answers of 11 Nov (16:35) and the approved sweeps, checked in a
// browser at 1280px and 390 by 844, in light and dark:
//
//   - edges people rely on reach 3 to 1 against what they sit on: an answer
//     row at rest (Daily plan), a dashed empty day box (weekly debrief), and
//     the outside Health Check's outlined buttons and answer rows. Measured
//     from the colours the browser used;
//   - sleep's most common answer is labelled "Usual quality", never "Average
//     quality" (dashboard);
//   - "Edit", never "Change", on links and buttons, with screen reader labels
//     to match (the plan's eye, My Account, the Monthly review, the outside
//     Health Check's results). "Change it" stays where it is an answer;
//   - countdowns read "to go", never "left" (dashboard);
//   - no 1 to 10 scale is left in the design gallery.
//
// (The chevrons and the "no repeated second line" rule are measured on every
// page by tests/phase5/calm-rules.mjs; "Save my edit" by change-kept.mjs.)
//
// It also saves a screenshot of every changed screen, in both modes at both
// sizes, into the folder given.
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked, and nothing is saved.
//
//   node --import ./tests/scores/register.mjs tests/phase5/answers2.mjs [folder for screenshots]
//   SIZES=390 MODES=light …   one part of it
import { accountsText, TEST_HOST as TARGET_HOST } from '../target.mjs';
import { STEPS as HC_STEPS, appPage as hcPage, signIn as hcSignIn } from '../healthcheck/hc-shared.mjs';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = TARGET_HOST;
const TEST_HOST = TARGET_HOST;
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
for (const line of accountsText().split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Contrast (WCAG) between two rgb() colours.
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Runs in the page: each matching part's edge colour and the first solid colour behind it. */
function edges(selector) {
  const solid = (c) => c && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(c);
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!(b.width > 0 && b.height > 0) || st.visibility === 'hidden' || el.closest('[hidden],[inert]')) continue;
    let behind = null;
    for (let p = el.parentElement; p && !behind; p = p.parentElement) { const bg = getComputedStyle(p).backgroundColor; if (solid(bg)) behind = bg; }
    out.push({ words: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30), edge: st.borderTopColor, width: parseFloat(st.borderTopWidth), style: st.borderTopStyle, behind: behind || getComputedStyle(document.documentElement).backgroundColor, opacity: Number(st.opacity), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' });
  }
  return out;
}
const edgeCheck = (name, found, { least = 1 } = {}) => {
  const live = found.filter((e) => !e.disabled && e.opacity > 0.9);
  const low = live.filter((e) => !(e.width >= 1) || e.style === 'none' || contrast(e.edge, e.behind) < 3);
  pass(`${name}: the edge reaches 3 to 1 (${live.length} measured, lowest ${live.length ? Math.min(...live.map((e) => contrast(e.edge, e.behind))).toFixed(2) : 'none'})`, live.length >= least && low.length === 0, live.length ? low.slice(0, 3).map((e) => `"${e.words}" ${contrast(e.edge, e.behind).toFixed(2)} (${e.edge} on ${e.behind})`).join('; ') : 'none found');
};


execFileSync('node', ['scripts/seed-test-ratings.mjs'], { stdio: 'ignore' });
const browser = await chromium.launch();
try {
  for (const width of [1280, 390].filter((w) => !process.env.SIZES || process.env.SIZES.split(',').includes(String(w)))) {
    for (const mode of ['light', 'dark'].filter((m) => !process.env.MODES || process.env.MODES.split(',').includes(m))) {
      const phone = width < 600;
      const size = width === 1280 ? '1280' : '390x844';
      const tag = `${width}px ${mode}`;
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: 'reduce' });
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
        if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
        if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
        // Nothing is saved: a write is answered here and goes nowhere.
        if (/supabase\.co\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return route.fallback();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
      const shot = async (name, opts = {}) => { if (out) await page.screenshot({ path: join(out, `${name}-${size}-${mode}.png`), fullPage: true, ...opts }); };
      const settle = async () => { await page.waitForLoadState('networkidle').catch(() => null); await page.evaluate(() => document.fonts.ready); await sleep(900); };
      const pageText = () => page.evaluate(() => (document.querySelector('.ds-guide--fullscreen') || document.querySelector('.ui-root') || document.body).innerText);
      // Every link and button whose words begin "Change" (an answer "Change it" is not a link to edit something).
      const changeControls = () => page.evaluate(() => [...document.querySelectorAll('button, a, [role=button]')]
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest('[hidden],[inert]'); })
        .map((el) => [(el.innerText || '').replace(/\s+/g, ' ').trim(), el.getAttribute('aria-label') || ''])
        .filter(([words, label]) => (/^change\b/i.test(words) && !/^change it$/i.test(words)) || /\bChange (who|what|how|my|your|the)\b/.test(label))
        .map(([words, label]) => words || label));

      await page.goto(`${APP}/auth/login`);
      await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
      await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
      await page.keyboard.press('Enter');
      await page.waitForURL(/welcome/, { timeout: 30000 });

      // ------------------------------------------------ an answer row at rest (Daily plan)
      try {
        await page.goto(`${APP}/daily-plan`);
        await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
        await settle();
        edgeCheck(`answer rows at rest, Daily plan ${tag}`, await page.evaluate(edges, '.ds-answer:not([aria-checked=true]):not([aria-pressed=true])'), { least: 5 });
        await shot('answer-rows-daily-plan');
      } catch (e) { pass(`answer rows ${tag}: checked`, false, e.message.split('\n')[0]); }

      // ------------------------------------------------ dashed empty day boxes (weekly debrief)
      try {
        await page.goto(`${APP}/performance-sprint/debrief`);
        await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
        for (let i = 0; i < 4 && !(await page.locator('.ds-logweek').count()); i += 1) {
          await page.getByRole('button', { name: /^(Next|Start|Continue)/ }).first().click({ timeout: 4000 }).catch(() => null);
          await sleep(900);
        }
        await settle();
        const dashed = await page.evaluate(edges, '.ds-logweek-yn--empty, .ds-logweek-box--empty input, .ds-logweek-rate-box--empty');
        pass(`dashed empty day boxes, weekly debrief ${tag}: they are dashed`, dashed.length >= 3 && dashed.every((e) => e.style === 'dashed'), `${dashed.length} found, ${[...new Set(dashed.map((e) => e.style))].join(', ')}`);
        edgeCheck(`dashed empty day boxes, weekly debrief ${tag}`, dashed, { least: 3 });
        await shot('dashed-boxes-debrief');
      } catch (e) { pass(`dashed boxes ${tag}: checked`, false, e.message.split('\n')[0]); }

      // ------------------------------------------------ the dashboard: Usual quality, "to go"
      try {
        await page.goto(`${APP}/dashboard`);
        await page.waitForSelector('.dash-fold-h', { timeout: 20000 });
        await settle();
        const sleepFold = page.locator('.dash-fold').filter({ has: page.locator('.dash-fold-t', { hasText: /^Sleep$/ }) }).first();
        if ((await sleepFold.locator('.dash-fold-h').getAttribute('aria-expanded')) !== 'true') await sleepFold.locator('.dash-fold-h').click();
        await sleep(500);
        const text = (await sleepFold.innerText()).replace(/\s+/g, ' ');
        pass(`dashboard ${tag}: sleep's most common answer is "Usual quality"`, /Usual quality (Poor|Fair|Good|Very good|Excellent)\b/.test(text), text.slice(0, 160));
        const all = await pageText();
        pass(`dashboard ${tag}: no "Average quality"`, !/average quality/i.test(all));
        pass(`dashboard ${tag}: a countdown reads "to go"`, /\b\d+ (days?|weeks?|months?)\s+to go\b/.test(all.replace(/\s+/g, ' ')), (all.match(/\b\d+ (days?|weeks?|months?)[^\n]{0,12}/) || [''])[0]);
        pass(`dashboard ${tag}: no countdown reads "left"`, !/\b\d+ (days?|weeks?|months?)\s+left\b/.test(all.replace(/\s+/g, ' ')), (/\b\d+ (days?|weeks?|months?)\s+left\b/.exec(all.replace(/\s+/g, ' ')) || [''])[0]);
        pass(`dashboard ${tag}: no link or button says "Change"`, (await changeControls()).length === 0, (await changeControls()).join(' | '));
        await shot('dashboard');
      } catch (e) { pass(`dashboard ${tag}: checked`, false, e.message.split('\n')[0]); }

      // ------------------------------------------------ Edit, not Change
      try {
        await page.goto(`${APP}/performance-plan`);
        await page.getByRole('button', { name: 'Edit my Mission', exact: true }).first().waitFor({ timeout: 20000 });
        await settle();
        const eyes = await page.evaluate(() => [...document.querySelectorAll('button.ds-who[aria-label]')].map((b) => b.getAttribute('aria-label')));
        // An eye that can be changed there says "Edit who can see this." or "Edit what … sees."; none says "Change".
        pass(`plan ${tag}: no eye says "Change"`, eyes.length >= 1 && eyes.every((l) => !/\bChange\b/.test(l) && (!/\b(who can see this|what .+ sees)\.$/.test(l.replace(/^.*?\. /, '')) || /Edit (who can see this|what .+ sees)\.$/.test(l))), eyes.slice(0, 3).join(' | '));
        pass(`plan ${tag}: no link or button says "Change"`, (await changeControls()).length === 0, (await changeControls()).join(' | '));
        pass(`plan ${tag}: no countdown reads "left"`, !/\b\d+ (days?|weeks?|months?) left\b/.test(await pageText()));
        await page.goto(`${APP}/my-account`);
        await page.getByRole('button', { name: /my Mission$/ }).first().waitFor({ timeout: 20000 });
        await settle();
        pass(`My Account ${tag}: "Edit my target range"`, (await page.getByRole('button', { name: 'Edit my target range', exact: true }).count()) === 1);
        pass(`My Account ${tag}: no link or button says "Change"`, (await changeControls()).length === 0, (await changeControls()).join(' | '));
        await shot('my-account');
        await page.goto(`${APP}/monthly-review`);
        await settle();
        const edit = page.getByRole('button', { name: 'Edit my answers', exact: true });
        pass(`Monthly review ${tag}: "Edit my answers"`, (await edit.count()) === 1, (await pageText()).slice(0, 160));
        pass(`Monthly review ${tag}: no link or button says "Change"`, (await changeControls()).length === 0, (await changeControls()).join(' | '));
        await shot('monthly-review');
        await page.goto(`${APP}/performance-sprint`);
        await page.waitForSelector('.ds-collapse-head', { timeout: 20000 });
        await settle();
        pass(`sprint page ${tag}: no link or button says "Change"`, (await changeControls()).length === 0, (await changeControls()).join(' | '));
        await shot('sprint-page');
      } catch (e) { pass(`Edit, not Change ${tag}: checked`, false, e.message.split('\n')[0]); }

      // ------------------------------------------------ the design gallery: no 1 to 10 scale
      try {
        await page.goto(`${APP}/design-reference`);
        await page.waitForSelector('#c45', { timeout: 20000 });
        const levels = page.locator('#c45');
        await levels.scrollIntoViewIfNeeded();
        await sleep(400);
        pass(`design gallery ${tag}: no 1 to 10 scale demo`, (await page.locator('.ds-scale, .ds-scale-btn').count()) === 0 && !/1 is not at all|10 is completely/.test(await levels.innerText()), (await levels.innerText()).slice(0, 120));
      } catch (e) { pass(`design gallery ${tag}: checked`, false, e.message.split('\n')[0]); }

      pass(`no console errors (${tag})`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await context.close();

      // ------------------------------------------------ the outside Health Check
      // (Rebuilt to M7b version 51 from the portal's shared parts. Its stand-ins are the Health Check
      // suites' own, tests/healthcheck/hc-shared.mjs: nothing signs in and nothing is saved.)
      for (const screen of ['question', 'results']) {
        const complete = screen === 'results';
        let hc = null;
        try {
          // A question screen: the second project's contribution, with its answer rows.
          hc = await hcPage(browser, width, mode, complete ? { complete: true, step: { screen: 'done' } } : { step: HC_STEPS.contrib });
          const p2 = hc.page;
          await hcSignIn(p2, hc.session);
          await p2.locator(complete ? 'button.hc-prow' : '.ds-guide .ds-answer').first().waitFor({ timeout: 15000 });
          await p2.evaluate(() => document.fonts.ready);
          await p2.mouse.move(2, 2);
          await sleep(800);
          if (complete) {
            edgeCheck(`Health Check results, outlined buttons ${tag}`, await p2.evaluate(edges, '.hc-keep .ds-btn--outline, .ds-calm-card .ds-btn--outline'), { least: 2 });
            edgeCheck(`Health Check results, the drop-downs ${tag}`, await p2.evaluate(edges, '.hc-ctl .ds-dd'), { least: 2 });
            const words = await p2.evaluate(() => [...document.querySelectorAll('.ds-results-headrow .ds-link')].map((b) => b.innerText.trim()));
            pass(`Health Check results ${tag}: the three links say "Edit"`, words.length === 3 && words.every((w) => w === 'Edit'), words.join(' | '));
            pass(`Health Check results ${tag}: no link or button says "Change"`, !(await p2.evaluate(() => [...document.querySelectorAll('button, a')].some((el) => /^change\b/i.test((el.innerText || '').trim()) && el.getBoundingClientRect().width > 0))));
          } else {
            const rows = await p2.evaluate(edges, '.ds-guide .ds-answer:not([aria-checked=true])');
            if (rows.length) edgeCheck(`Health Check question, answer rows at rest ${tag}`, rows, { least: 3 });
            else pass(`Health Check question ${tag}: opened on a question with answer rows`, false, (await p2.locator('.ds-guide').innerText()).slice(0, 120));
          }
          if (out) await p2.screenshot({ path: join(out, `health-check-${screen}-${size}-${mode}.png`), fullPage: true });
        } catch (e) { pass(`Health Check ${screen} ${tag}: checked`, false, e.message.split('\n')[0]); }
        if (hc) await hc.ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  execFileSync('node', ['scripts/seed-test-ratings.mjs', '--remove'], { stdio: 'ignore' });
}

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
