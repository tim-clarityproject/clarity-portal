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
import { BASE, IDS, insidePage, m7Rows, open, sleep } from './inside-shared.mjs';

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
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(join(out, 'report.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail && !r.ok ? `: ${r.detail}` : ''}`).join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed (report: ${join(out, 'report.txt')})`);
process.exit(failed ? 1 : 0);
