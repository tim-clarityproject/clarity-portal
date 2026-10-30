// Phase 3 step 5: 5-digit amounts (12,500 steps) are never cut off in the
// day boxes (LoggingWeekRow), on the weekly debrief's Numbers and on the
// sprint page's week view, signed in as the invented test client on the
// TEST database only (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/number-box.mjs
//
// The fixed day (tests/phase2/fixed-day.mjs) is Wed 21 Oct 2026: week 3's
// debrief window is open and week 4 is running. At 360px and 390px, at the
// standard text size and at twice it, dark and light, with 12500 and
// 1234567 typed into a Steps box: every box shows all of its text (the
// field is as wide as its text needs), every box keeps its 44px tap area,
// the boxes keep design rule 9's gaps (4px or 8px, the 2px of the narrowest
// phones), a row that no longer fits wraps instead of scrolling sideways,
// and each box is put back as it was before moving on.
// The laptop keeps its single row of seven. Ends with the seed on the real today.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
console.log(`Fixed day: ${fixedLabel()}`);
seedFixed('--reset');

const browser = await chromium.launch();
let storage = null;
async function signedIn(width, mode, scale) {
  const phone = width < 769;
  if (!storage) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await guard(ctx);
    const p = await ctx.newPage();
    await p.goto(`${APP}/auth/login`);
    await p.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await p.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await p.keyboard.press('Enter');
    await p.waitForURL(/welcome/, { timeout: 30000 });
    storage = await ctx.storageState();
    await ctx.close();
  }
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, storageState: storage,
  });
  await fixClock(context);
  await context.addInitScript(([m, s]) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
    // Twice the text size, as the device's text-size setting does (the one global rule).
    if (s !== 1) {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = `html{font-size:${16 * s}px !important}`;
        document.head.appendChild(st);
      });
    }
  }, [mode, scale]);
  await guard(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page };
}
async function guard(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_REF)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
}

/** Types a value into the Steps row's first box and measures every box in that row. */
async function measureRow(page, value) {
  const row = page.locator('.ds-logweek', { hasText: 'Steps' }).first();
  const input = row.locator('.ds-logweek-box input:not(:disabled)').first();
  await input.scrollIntoViewIfNeeded();
  const was = await input.inputValue();
  await input.fill(value);
  await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); }));
  const r = await row.evaluate((el) => {
    const boxes = [...el.querySelectorAll('.ds-logweek-box')];
    const inputs = boxes.map((b) => b.querySelector('input'));
    const rects = boxes.map((b) => b.getBoundingClientRect());
    const rows = [...new Set(rects.map((r) => Math.round(r.top)))];
    // The gaps between neighbours on the same line.
    const gaps = [];
    for (let i = 1; i < rects.length; i += 1) {
      if (Math.round(rects[i].top) === Math.round(rects[i - 1].top)) gaps.push(+(rects[i].left - rects[i - 1].right).toFixed(2));
    }
    // A field's text fits when the text is no wider than the field's inside.
    const cut = inputs.map((inp) => {
      const cs = getComputedStyle(inp);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const textW = ctx.measureText(inp.value).width;
      const inside = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { v: inp.value, textW: +textW.toFixed(1), inside: +inside.toFixed(1), cut: inp.value !== '' && (textW > inside + 0.5 || inp.scrollWidth > inp.clientWidth + 1) };
    }).filter((c) => c.cut);
    const small = inputs.map((inp) => inp.getBoundingClientRect()).filter((r) => r.width < 43.5 || r.height < 43.5).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`);
    // Inside the days' own area (on the narrowest phones the debrief lets
    // it reach 4px into the side margin, by design) and inside the screen.
    const host = el.querySelector('.ds-logweek-days').getBoundingClientRect();
    return {
      cut,
      small,
      gaps: [...new Set(gaps)],
      lines: rows.length,
      outside: rects.filter((r) => r.right > host.right + 0.5 || r.left < host.left - 0.5 || r.left < 0 || r.right > window.innerWidth).length,
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      widths: rects.map((r) => Math.round(r.width)),
    };
  });
  // The box goes back to what it held, so the log saved on leaving it is unchanged.
  await input.fill(was);
  return r;
}

const GAPS = [2, 4, 8]; // --space-px2 (the narrowest phones), --space-1, --space-2
const SCREENS = [
  { id: 'debrief Numbers', open: async (p) => { await p.goto(`${APP}/performance-sprint/debrief`); await p.waitForSelector('.ds-logweek-box input', { timeout: 30000 }); } },
  {
    id: 'sprint page, this week',
    open: async (p) => {
      await p.goto(`${APP}/performance-sprint`);
      await p.waitForSelector('.ds-sdial--running', { timeout: 30000 });
      await p.getByRole('button', { name: 'This week', exact: true }).first().click();
      await p.waitForSelector('.ds-logweek-box input', { timeout: 15000 });
    },
  },
];

for (const mode of ['dark', 'light']) {
  for (const width of [1280, 390, 360]) {
    for (const scale of width === 1280 ? [1] : [1, 2]) {
      const { context, page } = await signedIn(width, mode, scale);
      for (const s of SCREENS) {
        const tag = `${s.id}, ${width}px ${mode}${scale === 2 ? ', twice the text size' : ''}`;
        try {
          await s.open(page);
        } catch (e) {
          pass(`${tag}: opens`, false, e.message.split('\n')[0]);
          continue;
        }
        for (const value of ['12500', '1234567']) {
          const r = await measureRow(page, value);
          pass(`${tag}, ${value}: every box shows all its text`, r.cut.length === 0, JSON.stringify(r.cut));
          pass(`${tag}, ${value}: every box keeps 44px`, r.small.length === 0, r.small.join(' '));
          pass(`${tag}, ${value}: the gaps are on the spacing scale`, r.gaps.every((g) => GAPS.some((x) => Math.abs(g - x) < 0.6)), r.gaps.join(' '));
          pass(`${tag}, ${value}: no box outside its row, no sideways scroll`, r.outside === 0 && r.sideways <= 0, `${r.outside} outside, ${r.sideways}px`);
          if (width === 1280 && value === '12500') pass(`${tag}: the laptop keeps one line of days`, r.lines === 1, `${r.lines} lines`);
          results.push(`      ${tag}, ${value}: ${r.lines} line(s), widths ${r.widths.join(' ')}`);
        }
      }
      await context.close();
    }
  }
}

await browser.close();
console.log(seedForReal('--reset'));
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => /^(PASS|FAIL)/.test(r)).length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
