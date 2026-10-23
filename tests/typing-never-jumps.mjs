// Typing never jumps (Tim, 21 Oct: the live journal bug). On a phone, in
// Safari's engine, type more than 300 words into the journal and into a
// review answer, first at the end and then in the middle, and check the
// page never scrolls back and forth while typing.
//
// It signs in as the invented test client on the TEST database only, and
// stops at once if any Supabase request goes anywhere else. Nothing is
// saved: the journal keeps only a draft on the device, and the review is
// never finished.
//
// Needs the dev server running against the test database, then:
//   npm run test:typing
// APP_URL overrides the address (default http://localhost:5173).
// ENGINE=chromium runs it in Chrome's engine instead of Safari's.
// The accounts come from ~/.clarity-test-accounts.env (never printed).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium, devices, webkit } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const WORDS = 320;
const MIDDLE_WORDS = 40;
// A scroll that moves the other way by more than this counts as a jump.
const JUMP_PX = 2;

function testAccount() {
  const env = {};
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^(?:export\s+)?([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return { email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD };
}

const SENTENCE = 'Today I kept the main thing the main thing and noticed where my attention went next.';
function words(n) {
  const out = [];
  const pool = SENTENCE.split(' ');
  for (let i = 0; i < n; i += 1) out.push(pool[i % pool.length]);
  return out;
}

// Every scrolling box the person could see move: the page and any
// scroller around the focused box (focus mode's writing page).
async function scrollState(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    let scroller = el?.parentElement;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    return {
      page: Math.round(window.scrollY),
      box: scroller && scroller !== document.body ? Math.round(scroller.scrollTop) : 0,
      field: el?.tagName === 'TEXTAREA' ? Math.round(el.scrollTop) : 0,
    };
  });
}

function reversals(series) {
  let dir = 0;
  let count = 0;
  for (let i = 1; i < series.length; i += 1) {
    const d = series[i] - series[i - 1];
    if (Math.abs(d) <= JUMP_PX) continue;
    const s = Math.sign(d);
    if (dir && s !== dir) count += 1;
    dir = s;
  }
  return count;
}

async function typeAndWatch(page, list) {
  const samples = [await scrollState(page)];
  for (const word of list) {
    await page.keyboard.type(`${word} `);
    samples.push(await scrollState(page));
  }
  return {
    page: reversals(samples.map((s) => s.page)),
    box: reversals(samples.map((s) => s.box)),
    field: Math.max(...samples.map((s) => s.field)),
  };
}

async function check(page, name, open) {
  await open();
  const textarea = page.locator('textarea:focus');
  await textarea.waitFor({ timeout: 10000 });

  // At the end.
  await page.evaluate(() => {
    const el = document.activeElement;
    el.setSelectionRange(el.value.length, el.value.length);
  });
  const end = await typeAndWatch(page, words(WORDS));

  // In the middle.
  await page.evaluate(() => {
    const el = document.activeElement;
    const mid = Math.floor(el.value.length / 2);
    el.setSelectionRange(mid, mid);
  });
  const middle = await typeAndWatch(page, words(MIDDLE_WORDS));

  const typed = await page.evaluate(() => document.activeElement.value.split(/\s+/).filter(Boolean).length);
  const ok = end.page === 0 && end.box === 0 && middle.page === 0 && middle.box === 0
    && end.field === 0 && middle.field === 0 && typed >= WORDS;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${typed} words; back-and-forth scrolls at the end ${end.page + end.box}, in the middle ${middle.page + middle.box}; scrolling inside the box ${Math.max(end.field, middle.field)}px`);
  return ok;
}

const engine = process.env.ENGINE === 'chromium' ? chromium : webkit;
const browser = await engine.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await context.newPage();
let wrongHost = false;
page.on('request', (r) => {
  const host = new URL(r.url()).host;
  if (/supabase/.test(host) && !host.startsWith(TEST_REF)) wrongHost = true;
});

const { email, password } = testAccount();
await page.goto(`${APP}/auth/login`);
await page.waitForTimeout(800);
if (wrongHost) {
  console.log('STOP: a request went to a database that is not the test project.');
  process.exit(2);
}
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', password);
await page.keyboard.press('Enter');
await page.waitForURL(/welcome/, { timeout: 20000 });

// Tapping a long-writing box on a phone opens focus mode; type there.
const openBox = (path) => async () => {
  await page.goto(`${APP}${path}`);
  const box = page.locator('textarea').first();
  await box.waitFor({ timeout: 15000 });
  await box.tap();
  await page.waitForTimeout(500);
};

const results = [
  await check(page, 'Journal', openBox('/daily-journal')),
  await check(page, 'After-action review', openBox('/my-journal')),
];

await browser.close();
if (wrongHost) {
  console.log('STOP: a request went to a database that is not the test project.');
  process.exit(2);
}
const passed = results.filter(Boolean).length;
console.log(`${passed} of ${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
