// Two tabs on one inside Health Check version (Health Check follow-up 1,
// step 3): each save checks the version hasn't changed since the tab opened
// it. If it has, nothing is written over, and the tab says "This version
// changed in another tab." with "Reload to see it".
//
//   node --import ./tests/scores/register.mjs tests/healthcheck/two-tabs.mjs [out folder]
//
// Signed in as the test client; the Health Check's own reads and writes are
// answered by the stand-in (inside-shared.mjs), which keeps updated_at as the
// database does and honours "only if still at this version".
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { APP, BASE, IDS, insidePage, m7Rows, open, sleep } from './inside-shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-two-tabs');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const results = [];
const pass = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`);
};
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(150);
  }
}
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const resultsShown = (page) => until(async () => (await page.locator('main.hc-in-page .ds-headline').count()) > 0, 15000);
const pressNext = async (page) => { await sleep(450); await page.locator('.ds-guide-next').click({ timeout: 10000 }); await sleep(200); };
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.ds-toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | '));

async function editObjective(page, words) {
  await page.getByRole('button', { name: 'Edit the objective' }).click();
  await page.locator('.ds-guide-body textarea').first().waitFor();
  await page.locator('.ds-guide-body textarea').fill(words);
  await pressNext(page);
}

const browser = await chromium.launch();
for (const w of SIZES) {
  const tag = `${w}px`;
  const b = await insidePage(browser, w, 'dark', { rows: m7Rows(null), dir: out });
  const a = b.page;
  const second = await b.ctx.newPage();
  await open(a, `${BASE}/version/${IDS.pt1}`);
  await open(second, `${BASE}/version/${IDS.pt1}`);
  await resultsShown(a);
  await resultsShown(second);

  // Tab one edits and saves.
  await editObjective(a, 'Tab one: the product customers recommend first in Europe.');
  pass(`${tag}: the first tab's edit saves`, await until(async () => b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective.startsWith('Tab one')) && (await toastText(a)).includes('Saved'), await toastText(a));

  // Tab two, opened before that, edits the same version.
  const writesBefore = b.store.writes.length;
  await editObjective(second, 'Tab two: the product customers recommend first in Asia.');
  const said = second.getByText('This version changed in another tab.');
  pass(`${tag}: the second tab says “This version changed in another tab.”`, await until(async () => (await said.count()) > 0, 8000), await toastText(second));
  pass(`${tag}: … with “Reload to see it”`, await second.getByRole('button', { name: 'Reload to see it' }).isVisible());
  pass(`${tag}: … and never “Saved”`, !(await toastText(second)).includes('Saved'), await toastText(second));
  pass(`${tag}: nothing is written over: the first tab's edit stands`, b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective.startsWith('Tab one') && b.store.writes.length === writesBefore, `${b.store.writes.length - writesBefore} write(s)`);
  pass(`${tag}: the database refused the second tab's save`, (b.store.refused || 0) >= 1, String(b.store.refused || 0));
  await second.screenshot({ path: join(out, `two-tabs-changed-${w}.png`) });

  // Reload to see it: the other tab's version, and no typing of this tab's comes back.
  await second.getByRole('button', { name: 'Reload to see it' }).click();
  await second.waitForLoadState('domcontentloaded');
  await resultsShown(second);
  await sleep(800);
  const now = await text(second, '.hc-objective');
  pass(`${tag}: “Reload to see it” shows the first tab's version`, now.includes('Tab one') && !now.includes('Tab two'), now);
  pass(`${tag}: … and the message has gone`, (await second.getByText('This version changed in another tab.').count()) === 0);

  // After reloading, the second tab can save again (based on the version it now shows).
  await editObjective(second, 'Tab two again: first in Europe and Asia.');
  pass(`${tag}: after reloading, the second tab saves`, await until(async () => b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective.startsWith('Tab two again')));

  // And the first tab, now behind, is refused in turn.
  const before2 = b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective;
  await editObjective(a, 'Tab one, later.');
  pass(`${tag}: the first tab, now behind, is refused in turn`, await until(async () => (await a.getByText('This version changed in another tab.').count()) > 0) && b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective === before2);

  // One tab saving twice in a row is never refused by its own save.
  await a.getByRole('button', { name: 'Reload to see it' }).click();
  await a.waitForLoadState('domcontentloaded');
  await resultsShown(a);
  await sleep(600);
  await editObjective(a, 'One tab, first edit.');
  await until(async () => b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective === 'One tab, first edit.');
  await editObjective(a, 'One tab, second edit.');
  pass(`${tag}: one tab saving twice is never refused by its own save`, await until(async () => b.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective === 'One tab, second edit.') && (await a.getByText('This version changed in another tab.').count()) === 0);

  pass(`${tag}: no page errors`, b.problems.length === 0, b.problems.join(' | '));
  await b.ctx.close();

  // The break-it tester's cases (16 Nov).
  {
    // 4. An edit kept offline in one tab, sent by the other tab's queue: the other tab's change never goes over it.
    const c = await insidePage(browser, w, 'dark', { rows: m7Rows(null), dir: out });
    const one = c.page;
    const two = await c.ctx.newPage();
    await open(one, `${BASE}/version/${IDS.pt1}`);
    await open(two, `${BASE}/version/${IDS.pt1}`);
    await resultsShown(one); await resultsShown(two);
    await one.route(/\/rest\/v1\/decisions/, (r) => r.abort('internetdisconnected'));
    await editObjective(one, 'Offline in tab one.');
    pass(`${tag}, offline: the first tab keeps its edit to send later`, await until(async () => (await toastText(one)).includes('Will sync'), 8000), await toastText(one));
    await one.unroute(/\/rest\/v1\/decisions/);
    await editObjective(two, 'Tab two, while tab one waited.');
    const objective = () => c.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective;
    await until(async () => objective() === 'Offline in tab one.', 10000);
    await sleep(1500);
    pass(`${tag}, offline: tab one's waiting edit lands, and tab two never writes over it`, objective() === 'Offline in tab one.', objective());
    pass(`${tag}, offline: tab two says the version changed`, await until(async () => (await two.getByText('This version changed in another tab.').count()) > 0, 8000));
    await c.ctx.close();
  }
  {
    // 5. A new version being made in two tabs: the second Close never writes over the first.
    const c = await insidePage(browser, w, 'dark', { rows: m7Rows(null), dir: out });
    const one = c.page;
    await open(one, `${BASE}/new?team=7a000000-0000-4000-8000-00000000a002`);
    await until(async () => /\/version\//.test(new URL(one.url()).pathname), 10000);
    const path = new URL(one.url()).pathname;
    const id = path.split('/').pop();
    await one.locator('.ds-guide-next').first().waitFor();
    await pressNext(one);
    await one.locator('.ds-guide-body textarea').first().fill('New version, tab one.');
    await sleep(1200); // the typing is kept on the device
    const two = await c.ctx.newPage();
    await open(two, path);
    await two.locator('.ds-guide-body textarea').first().waitFor();
    await two.locator('.ds-guide-body textarea').first().fill('New version, tab two.');
    await one.locator('.ds-guide-close').click();
    await until(async () => c.store.rows.some((r) => r.id === id), 8000);
    await sleep(500);
    await two.locator('.ds-guide-close').click();
    await sleep(1500);
    const made = c.store.rows.find((r) => r.id === id);
    pass(`${tag}, new version: the first Close makes it, the second never writes over it`, made?.form_data?.data?.objective === 'New version, tab one.', made?.form_data?.data?.objective);
    pass(`${tag}, new version: the second tab says the version changed`, await until(async () => (await two.getByText('This version changed in another tab.').count()) > 0, 8000), await toastText(two));
    await c.ctx.close();
  }
  {
    // 6. A tab that went elsewhere and came back shows the newest version and saves on it; a later visit's first save goes too.
    const c = await insidePage(browser, w, 'dark', { rows: m7Rows(null), dir: out });
    const one = c.page;
    const two = await c.ctx.newPage();
    await open(one, `${BASE}/version/${IDS.pt1}`);
    await resultsShown(one);
    await one.getByRole('link', { name: /Back/ }).or(one.getByRole('button', { name: /^Back$/ })).first().click();
    await until(async () => /^\/strategic-alignment\/?$/.test(new URL(one.url()).pathname), 8000);
    await open(two, `${BASE}/version/${IDS.pt1}`);
    await resultsShown(two);
    await editObjective(two, 'Tab two edited it while tab one was on the list.');
    await until(async () => c.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective.startsWith('Tab two edited'));
    await one.reload(); // the list reads the newest version
    await sleep(800);
    await one.locator('.ds-version-row').filter({ hasText: 'September' }).first().click();
    await resultsShown(one);
    await sleep(800);
    pass(`${tag}, came back: tab one shows the newest version`, (await text(one, '.hc-objective')).includes('Tab two edited'), await text(one, '.hc-objective'));
    await editObjective(one, 'Tab one, on the newest version.');
    pass(`${tag}, came back: tab one saves on it, never refused`, await until(async () => c.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective === 'Tab one, on the newest version.') && (await one.getByText('This version changed in another tab.').count()) === 0);
    // A later visit opens from the device's copy first: its first save is never refused.
    await one.goto(`${APP}/welcome`);
    await open(one, `${BASE}/version/${IDS.pt1}`);
    await resultsShown(one);
    await editObjective(one, 'A later visit.');
    pass(`${tag}, a later visit: its first save goes`, await until(async () => c.store.rows.find((r) => r.id === IDS.pt1).form_data.data.objective === 'A later visit.') && (await one.getByText('This version changed in another tab.').count()) === 0);
    await c.ctx.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(join(out, 'report.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail && !r.ok ? `: ${r.detail}` : ''}`).join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed (report: ${join(out, 'report.txt')})`);
process.exit(failed ? 1 : 0);
