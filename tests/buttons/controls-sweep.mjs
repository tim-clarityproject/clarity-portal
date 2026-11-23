// The controls check (controlsFamily, tests/buttons/buttons-check.mjs; Tim,
// 22 Nov: one controls family across the whole built portal) on every
// page the calm-rules suite and the coach portal's UI tester don't open:
// the older tools not rebuilt yet, the Life balance review, the Journal,
// the older Health Check route, and the signed-out pages with the terms
// panel. Dark and light, a laptop and a phone.
//
// Signed in as the invented test client on the TEST database only. It only
// reads: every write to the database is stopped, every other host and
// every email or /api/ call is blocked. Nothing is saved.
//
//   APP_URL=http://localhost:4327 node --import ./tests/scores/register.mjs tests/buttons/controls-sweep.mjs
//   (ONLY=<regex on the page name>, WIDTHS=1280,390, MODES=dark,light narrow it)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { backGaps, controlsFamily, importantMarks } from './buttons-check.mjs';

const APP = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const TEST_REF = 'gqtqljngeenqzxneucoc';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const WIDTHS = (process.env.WIDTHS || '1280,390').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const press = (words) => async (page) => { await page.getByRole('button', { name: words }).first().click(); await sleep(600); };
const pressLink = (words) => async (page) => { await page.getByText(words, { exact: true }).first().click(); await sleep(600); };

// [name, address, what to do once it's open (optional)]
const SIGNED_IN = [
  ['life-balance-start', '/life-balance-review'],
  ['life-balance-areas', '/life-balance-review/areas'],
  ['life-balance-check-in', '/life-balance-review/check-in'],
  ['life-balance-results', '/life-balance-review/results'],
  ['life-balance-targets', '/life-balance-review/targets'],
  ['my-journal', '/my-journal'],
  ['daily-journal', '/daily-journal'],
  ['daily-journals', '/daily-journals'],
  ['sleep-wind-down', '/sleep-wind-down'],
  ['sprint-start', '/performance-sprint/start'],
  ['recovery-today', '/recovery/today'],
  ['recovery-check-in', '/recovery/check-in'],
  ['plan-history', '/performance-plan/history'],
  ['pressure-plan', '/pressure-plan'],
  ['time-audit', '/time-audit'],
  ['pre-mortem', '/pre-mortem'],
  ['give-difficult-feedback', '/give-difficult-feedback'],
  ['plan-meeting', '/plan-meeting'],
  ['breathe', '/breathe'],
  ['mission-progress-review', '/mission-progress-review'],
  ['personal-operating-plan', '/personal-operating-plan'],
  ['personal-operating-plan-edit', '/personal-operating-plan-edit'],
  ['edit-profile', '/edit-profile'],
  ['about', '/about'],
  ['coaching', '/coaching'],
  ['dashboard-customise', '/dashboard', press(/^Customise/)],
  ['my-account-security', '/my-account/sign-in-security'],
];
const SIGNED_OUT = [
  ['sign-in', '/auth/login'],
  ['create-account', '/auth/sign-up'],
  ['terms-panel', '/auth/sign-up', pressLink('terms')],
  ['forgot-password', '/forgot-password'],
  ['legal-terms', '/legal/terms'],
  ['old-health-check', '/health-check/not-a-real-link'],
];

let failures = 0;
let passes = 0;
let toggles = 0;
const fails = [];
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else { failures += 1; fails.push(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

const browser = await chromium.launch({ args: ['--mute-audio'] });
for (const signedIn of [true, false]) {
  const pages = (signedIn ? SIGNED_IN : SIGNED_OUT).filter(([name]) => !ONLY || ONLY.test(name));
  if (!pages.length) continue;
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const phone = width < 600;
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, serviceWorkers: 'block' });
      await context.route('**/*', (route) => {
        const req = route.request();
        const url = req.url();
        if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
          if (/\/api\//.test(url)) return route.abort();
          return route.fallback();
        }
        if (!url.includes(`${TEST_REF}.supabase.co`)) return /fonts\.(googleapis|gstatic)\.com/.test(url) ? route.fallback() : route.abort();
        // Reads and signing in only: nothing is written.
        if (/\/auth\/v1\//.test(url)) return route.fallback();
        // Every call that isn't a plain read (functions too, which can write) is answered empty, never sent.
        if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        if (/\/functions\/v1\//.test(url)) return route.abort();
        return route.fallback();
      });
      // The portal on this device follows the mode asked for.
      await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* none */ } }, mode);
      const page = await context.newPage();
      if (signedIn) {
        await page.goto(`${APP}/auth/login`);
        await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
        await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
        await page.keyboard.press('Enter');
        await page.waitForURL(/welcome/, { timeout: 30000 });
      }
      for (const [name, path, act] of pages) {
        const tag = `${name} ${width}px ${mode}`;
        try {
          await page.goto(`${APP}${path}`);
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
          await page.evaluate(() => document.fonts.ready);
          await sleep(900);
          if (act) await act(page);
          await page.mouse.move(1, 1);
          const r = await page.evaluate(controlsFamily, { phone, scale: 1 });
          toggles += r.toggles;
          pass(`${tag}: one controls family (${r.toggles} toggles read)`, r.problems.length === 0, r.problems.slice(0, 5).join('; '));
          // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the small soft coral box before the title (tidy pass follow-ups 1 and 2).
          const backs = await page.evaluate(backGaps);
          pass(`${tag}: Back's chevron is 10px from its words (${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
          const imp = await page.evaluate(importantMarks);
          pass(`${tag}: Important is the soft coral tick box edge or the small soft coral box, and nothing else (${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
        } catch (e) {
          pass(`${tag}: opened`, false, String(e.message).split('\n')[0].slice(0, 160));
        }
      }
      await context.close();
    }
  }
}
await browser.close();
for (const f of fails) console.log(f);
console.log(`\n${passes} passed, ${failures} failed (${toggles} toggles read)`);
process.exit(failures ? 1 : 0);
