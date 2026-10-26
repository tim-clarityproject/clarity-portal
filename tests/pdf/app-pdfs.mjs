// Makes the app's PDFs the way a person does, in the running app, and saves
// them: the meeting plan (signed in as the invented test client, on the TEST
// database only) and the Health Check (its two server calls answered here with
// an invented session, so no database is read or written for it).
//
//   node tests/pdf/app-pdfs.mjs <folder for the files>
//
// Needs the dev server running against the test database. The test account
// comes from ~/.clarity-test-accounts.env and is never printed.
import { chromium, webkit, devices } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const results = [];
let wrongHost = false;

function testAccount() {
  const env = {};
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return { email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD };
}

async function open(browserType, options) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  // Only the test database may ever be reached.
  await context.route(/supabase\.co/, (route) => {
    if (!route.request().url().includes(TEST_HOST)) {
      wrongHost = true;
      return route.abort();
    }
    return route.fallback();
  });
  const page = await context.newPage();
  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  return { browser, context, page, downloads };
}

async function choose(page, downloads, trigger, look, name, { doubleTap = false } = {}) {
  const before = downloads.length;
  await trigger.click();
  const option = page.getByRole('button', { name: new RegExp(`^${look}, for`) }).first();
  if (doubleTap) {
    // two quick taps on the choice, then a tap on the button straight after
    await option.dblclick();
    await trigger.click({ force: true, timeout: 300 }).catch(() => {});
  } else {
    await option.click();
  }
  await page.waitForEvent('download', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(doubleTap ? 4000 : 800);
  await page.keyboard.press('Escape'); // close the choice if a late tap opened it
  const got = downloads.slice(before);
  for (const d of got) await d.saveAs(join(out, `${name} - ${d.suggestedFilename()}`));
  results.push(`${name}: ${look}${doubleTap ? ' (double tap)' : ''}: ${got.length} file(s): ${got.map((d) => d.suggestedFilename()).join(', ')}`);
}

// ---- the meeting plan --------------------------------------------------------------

async function meeting(name, browserType, options) {
  const { browser, page, downloads } = await open(browserType, options);
  const { email, password } = testAccount();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 20000 });
  await page.goto(`${APP}/my-plans`);
  await page.getByText(/Morrow Cycles kick-off|Routing pilot review/).first().click({ timeout: 20000 });
  await page.waitForURL(/meeting-summary/, { timeout: 15000 });
  const button = page.getByRole('button', { name: /^download pdf$/i });
  await button.waitFor({ timeout: 15000 });
  await choose(page, downloads, button, 'Light', name);
  await choose(page, downloads, button, 'Dark', name, { doubleTap: true });
  await browser.close();
}

// ---- the Health Check (outside version) ------------------------------------------------

const ids = { f: ['f1', 'f2', 'f3', 'f4'], p: ['p1', 'p2', 'p3', 'p4', 'p5'] };
const session = {
  ok: true,
  status: 'complete',
  current_step: { screen: 'done' },
  version: 3,
  updated_at: '2026-10-26T08:00:00',
  completed_at: '2026-10-20T09:00:00',
  data: {
    objective: 'Make Northbridge the most reliable regional carrier in Yorkshire by the end of next year.',
    csfs: ['On-time delivery above 97%', 'Drivers who stay with us', 'Accurate tracking for customers', 'Costs per drop under control'].map((text, i) => ({ id: ids.f[i], text })),
    projects: ['New routing system', 'Driver mentoring scheme', 'Customer tracking app', 'Electric van trial', 'Depot safety audit'].map((text, i) => ({ id: ids.p[i], text })),
    ratings: {
      owner: Object.fromEntries(ids.p.map((p, i) => [p, {
        contrib: Object.fromEntries(ids.f.map((f, j) => [f, (i + j) % 4])),
        progress: (i % 5) + 1,
        resource: ((i + 2) % 5) + 1,
      }])),
    },
  },
};

async function healthCheck(name, browserType, options, organisation = null) {
  const { browser, context, page, downloads } = await open(browserType, options);
  // with an organisation name: as alignment_open answers once migration 022 has run
  const opened = organisation ? { ...session, client_label: organisation } : session;
  await context.route(/\/rest\/v1\/rpc\/alignment_(open|save)/, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('open') ? opened : { ok: true, version: 3, updated_at: session.updated_at }),
  }));
  await page.goto(`${APP}/health-check/invented-test-token`);
  await page.getByLabel('Email').fill('respondent@example.com');
  await page.locator('form input:not([type=email])').first().fill('ABCDEF');
  await page.getByRole('button', { name: /^(begin|continue)$/i }).click();
  const footer = page.getByRole('button', { name: /^download pdf$/i });
  await footer.waitFor({ timeout: 20000 });
  await choose(page, downloads, footer, 'Light', name, { doubleTap: true });
  const card = page.getByRole('button', { name: /download a pdf/i });
  await choose(page, downloads, card, 'Dark', name);
  await browser.close();
}

const gb = { locale: 'en-GB', timezoneId: 'Europe/London' };
const us = { locale: 'en-US', timezoneId: 'America/New_York' };
await meeting('meeting, laptop, en-GB', chromium, { viewport: { width: 1280, height: 900 }, ...gb });
await meeting('meeting, laptop, en-US', chromium, { viewport: { width: 1280, height: 900 }, ...us });
await meeting('meeting, iPhone', webkit, { ...devices['iPhone 13'], ...gb });
await healthCheck('health check, laptop, en-GB', chromium, { viewport: { width: 1280, height: 900 }, ...gb }, 'Northbridge Logistics');
await healthCheck('health check, iPhone, en-US', webkit, { ...devices['iPhone 13'], ...us });
console.log(results.join('\n'));
if (wrongHost) {
  console.log('STOP: a request went to a database that is not the test project. It was blocked.');
  process.exit(2);
}
