// The coach first screen run's lasting check: nothing on a first screen is wrong while the rest loads.
//
// For each coach (owner, associate), page (Today, Clients, a client's page, the calendar's week, month and the phone's
// Schedule, and the owner's Finances: Overview, Money and Cash flow) and size, on the local stand-in (stack.mjs, with 060) and a production build (serve.mjs):
//   1. a first visit: the page's words the moment its first screen is drawn (data-first-screen="ready"), with the
//      quiet loading crosshairs' own labels left out;
//   2. the same page once everything has come in (quiet for 2 s);
//   3. a return visit (the device's copy).
// It fails when a line on the first screen isn't on the whole page in the same order (a wrong figure, a "0" or a
// "You have no …" that later changes), when the return visit differs from the whole page, or, with --before <url> (a
// build from before this run on the same stand-in), when the whole page differs from what that build shows.
// Muted, and nothing leaves this machine.
//
//   node --import ./tests/scores/register.mjs tests/scale/first-screen-check.mjs --app http://127.0.0.1:4320 \
//     [--before http://127.0.0.1:4319] [--roles owner,associate] [--sizes phone,laptop] [--pages today,clients,client,week,month,schedule,finances,money,cashflow]
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://127.0.0.1:4320');
const BEFORE = opt('before', null);
const API = opt('api', 'http://localhost:54400');
const ROLES = opt('roles', 'owner,associate').split(',');
const SIZES = opt('sizes', 'phone,laptop').split(',');
const md5uuid = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const PEOPLE = {
  associate: { email: 'scale-coach-02@example.com', client: md5uuid('cprof301') },
  owner: { email: 'scale-coach-01@example.com', client: md5uuid('cprof1') },
};
const PAGES = {
  today: '/coach',
  clients: '/coach/clients',
  client: '/coach/clients/:client',
  week: '/coach/calendar?view=week',
  month: '/coach/calendar?view=month',
  schedule: '/coach/calendar?view=schedule',
  // The owner's Finances (Phase 6b run 2): Overview, Money and Cash flow (an associate is sent to Today).
  finances: '/coach/finances',
  money: '/coach/finances/money',
  cashflow: '/coach/finances/cash-flow',
};
const ONLY = opt('pages', Object.keys(PAGES).join(',')).split(',');
const SIZE = {
  laptop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const FAST_4G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

// The page's words, as a person reads them: the frame's header and call bar, and the page. The quiet loading
// crosshairs say "Loading …" to screen readers only; those labels are left out. Lines that move with the clock
// ("in 12 minutes", "3 minutes ago") are left out too, since the visits are moments apart.
const WORDS = () => {
  const pick = [document.querySelector('.cc-callbar, .cc-bar'), document.querySelector('.cc-header'), document.querySelector('#cc-main')].filter(Boolean);
  const loading = new Set([...document.querySelectorAll('[role="status"][aria-label^="Loading"]')].flatMap((n) => [n.getAttribute('aria-label'), (n.innerText || '').trim()]).filter(Boolean));
  const out = [];
  for (const el of pick) {
    const label = [...el.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')).filter((l) => /\d/.test(l) && !loading.has(l));
    out.push(...(el.innerText || '').split('\n'), ...label);
  }
  return out.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !loading.has(l))
    .filter((l) => !/\b(minutes?|seconds?|hours?) (ago|to go)\b|\bin \d+ (minutes?|hours?)\b|Just now|^Now, \d\d:\d\d$/i.test(l));
};

async function context(browser, size, session) {
  const c = await browser.newContext({ ...SIZE[size], serviceWorkers: 'block' });
  await c.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    return route.abort('blockedbyclient');
  });
  await c.addInitScript(({ key, value }) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* none */ } },
    { key: 'clarity-portal-auth', value: JSON.stringify(session) });
  // The words at the moment the first screen is drawn, taken by the page itself so nothing later slips in.
  await c.addInitScript(`(() => {
    const WORDS = ${WORDS.toString()};
    window.__first = null;
    const look = () => {
      const main = document.querySelector('#cc-main');
      if (window.__first || !main || main.getAttribute('data-first-screen') !== 'ready' || !main.querySelector('.cc-page') || main.querySelector('[data-first-wait]')) return;
      window.__first = { at: performance.now(), words: WORDS() };
    };
    const start = () => new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();`);
  return c;
}

async function quiet(page) {
  let last = '';
  let same = 0;
  for (let i = 0; i < 120 && same < 8; i += 1) {
    await page.waitForTimeout(250);
    const now = JSON.stringify(await page.evaluate(WORDS).catch(() => []));
    same = now === last ? same + 1 : 0;
    last = now;
  }
  await page.waitForTimeout(500);
  return page.evaluate(WORDS);
}

/** Lines of `part` that aren't in `whole` in the same order. */
function notIn(part, whole) {
  const missing = [];
  let j = 0;
  for (const line of part) {
    let k = j;
    while (k < whole.length && whole[k] !== line) k += 1;
    if (k === whole.length) missing.push(line); else j = k + 1;
  }
  return missing;
}
const diff = (a, b) => ({ onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });

const session = async (email) => (await fetch(`${API}/__session?email=${encodeURIComponent(email)}`)).json();
const browser = await chromium.launch({ args: ['--mute-audio'] });
let passed = 0;
let failed = 0;
const say = (ok, what, detail = '') => { if (ok) passed += 1; else failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${ok || !detail ? '' : `\n     ${detail}`}`); };

for (const role of ROLES) {
  const who = PEOPLE[role];
  for (const size of SIZES) {
    for (const key of ONLY) {
      if (key === 'schedule' && size !== 'phone') continue; // the phone's own view
      const path = PAGES[key].replace(':client', who.client);
      const what = `${role} ${size} ${key}`;
      const c = await context(browser, size, await session(who.email));
      const page = await c.newPage();
      if (size === 'phone') {
        const cdp = await c.newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', FAST_4G);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.goto(`${APP}${path}`);
      const whole = await quiet(page);
      const first = await page.evaluate(() => window.__first);
      say(Boolean(first), `${what}: the first screen was drawn`);
      if (first) {
        const wrong = notIn(first.words, whole);
        say(wrong.length === 0, `${what}: every line of the first screen (${first.words.length} lines at ${Math.round(first.at)} ms) is on the whole page, in order`, `not on the whole page: ${JSON.stringify(wrong.slice(0, 6))}`);
      }
      await page.goto(`${APP}${path}`);
      const again = await quiet(page);
      const d = diff(again, whole);
      say(!d.onlyA.length && !d.onlyB.length, `${what}: a return visit shows the same page`, JSON.stringify({ returnVisitOnly: d.onlyA.slice(0, 5), wholeOnly: d.onlyB.slice(0, 5) }));
      await c.close();
      if (BEFORE) {
        const c2 = await context(browser, size, await session(who.email));
        const p2 = await c2.newPage();
        await p2.goto(`${BEFORE}${path}`);
        const old = await quiet(p2);
        const d2 = diff(whole, old);
        say(!d2.onlyA.length && !d2.onlyB.length, `${what}: the whole page shows what the build before this run shows`, JSON.stringify({ nowOnly: d2.onlyA.slice(0, 5), beforeOnly: d2.onlyB.slice(0, 5) }));
        await c2.close();
      }
    }
  }
}
await browser.close();
console.log(`\nfirst screen check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
