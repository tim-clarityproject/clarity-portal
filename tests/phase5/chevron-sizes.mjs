// Chevrons at every text size (Tim, 12 Nov): with no rounding in the shift,
// a chevron beside one line of text stays within 0.5px of the middle of
// that text from the standard text size up to twice it (the most the
// portal grows to), closed and open; one beside a name with a line under
// it within 1px. Read from the screen's own pixels at twice the pixels a
// point (tests/phase5/chevrons.mjs), on the pages that hold every kind of
// chevron, at 1280px and 390 by 844.
//
// calm-rules measures every page at the standard size; this adds the sizes.
// It is long (about 25 minutes in full), so run it in parts:
//
//   TEXT=16,20 WIDTHS=1280 node --import ./tests/scores/register.mjs tests/phase5/chevron-sizes.mjs
//   TEXT       root text sizes in px (16 is standard, 32 is twice it)
//   WIDTHS     1280, 390 or both;  PATHS  pages;  ALL=1 prints every reading
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked. Nothing is saved.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chevronsOff, measureChevrons } from './chevrons.mjs';
const APP = 'http://localhost:5173';
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = (process.env.TEXT || '16,20,24,28,32').split(',').map(Number);
const WIDTHS = (process.env.WIDTHS || '1280,390').split(',').map(Number);
const DSF = Number(process.env.DSF || 2);
const PATHS = (process.env.PATHS || '/welcome,/performance-sprint,/performance-plan,/dashboard,/daily-plan,/monthly-review,/my-plans,/my-account,/life-balance-review,/personal/plan,/recovery,/performance-sprint/debrief').split(',');
const browser = await chromium.launch();
const worst = {};
let failures = 0;
let readings = 0;
for (const width of WIDTHS) {
  const phone = width < 600;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: DSF, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light', reducedMotion: 'reduce' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes('gqtqljngeenqzxneucoc')) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (/supabase\.co\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fallback();
  });
  const page = await context.newPage();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  for (const size of SIZES) {
    for (const path of PATHS) {
      await page.goto(`${APP}${path}`);
      await page.waitForLoadState('networkidle').catch(() => null);
      if (size !== 16) await page.addStyleTag({ content: `html{font-size:${size}px !important}` });
      await page.evaluate(() => document.fonts.ready);
      await sleep(900);
      const lists = [['closed', await measureChevrons(page)]];
      if (process.env.OPEN !== '0') {
        let opened = 0;
        for (let i = 0; i < 14; i += 1) {
          const next = page.locator('[aria-expanded=false]:has(.ds-chevron)').first();
          if (!(await next.count())) break;
          if (!(await next.click({ timeout: 1500 }).then(() => true).catch(() => false))) break;
          opened += 1; await sleep(300);
          if (await page.locator('[role=listbox]').count()) { lists.push(['list', await measureChevrons(page)]); await page.keyboard.press('Escape'); await sleep(200); break; }
        }
        if (opened) { await sleep(450); lists.push(['open', await measureChevrons(page)]); }
      }
      for (const [state, list] of lists) {
        readings += list.length;
        for (const off of chevronsOff(list)) { failures += 1; console.log(`FAIL  ${width}px, text ${size}px, ${path}, ${state}: ${off}`); }
        for (const c of list) {
          const kind = `${c.label.split(' ')[0]}|${c.block ? 'BLOCK' : c.capitals ? 'caps' : 'lower'}|${c.dir}|${c.font}`;
          const key = `${kind}`;
          (worst[key] ||= {})[`${width}/${size}`] = [...((worst[key] || {})[`${width}/${size}`] || []), Number(c.off.toFixed(2))];
          if (process.env.ALL) console.log(`     w${width} t${size} ${path} ${state}: ${c.label} ${c.off.toFixed(2)} [${c.read}; ${c.font}; ${c.dir}; line ${c.line}]`);
        }
        if (process.env.ALL) for (const s of list.skipped) if (s.why !== 'no words' && s.why !== 'covered') console.log(`     skipped w${width} t${size} ${path} ${state}: ${s.label}: ${s.why}`);
      }
    }
  }
  await context.close();
}
await browser.close();
console.log('\nBy kind (width/text: min..max of the offsets):');
for (const [k, v] of Object.entries(worst).sort()) {
  console.log(k);
  console.log('   ' + Object.entries(v).map(([s, a]) => `${s}: ${Math.min(...a).toFixed(2)}..${Math.max(...a).toFixed(2)} (${a.length})`).join('  '));
}
console.log(`\n${readings - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
