// Downloads the design gallery's sample PDF in Chromium (desktop) and WebKit
// (iPhone), light and dark, with a double tap and a slow network.
//   node tests/pdf/gallery-download.mjs <folder for the files>
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5173/design-reference';
const results = [];

async function run(name, browserType, contextOptions, { slow = false } = {}) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...contextOptions, acceptDownloads: true });
  const page = await context.newPage();
  if (slow) {
    await page.route(/\.(woff|ttf|png)(\?.*)?$/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
  }
  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.goto(BASE);
  const section = page.locator('#c31');
  await section.scrollIntoViewIfNeeded();
  const button = section.getByRole('button', { name: /download pdf/i }).first();
  for (const look of ['Light', 'Dark']) {
    await button.click();
    const option = page.getByRole('button', { name: new RegExp(`^${look},`) }).first();
    await option.click();
    if (slow) {
      const busy = await section.getByText('Making your PDF').first().isVisible().catch(() => false);
      results.push(`${name}: busy label while making (${look}): ${busy ? 'shown' : 'NOT shown'}`);
      // a second tap while busy does nothing
      await button.click({ force: true, timeout: 1000 }).catch(() => {});
    }
    const before = downloads.length;
    await page.waitForEvent('download', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(slow ? 1500 : 500);
    const got = downloads.slice(before);
    for (const d of got) await d.saveAs(join(out, `${name} - ${d.suggestedFilename()}`));
    results.push(`${name}: ${look}: ${got.length} file(s): ${got.map((d) => d.suggestedFilename()).join(', ')}`);
  }
  const error = await section.locator('.ds-pdfmessage').count();
  if (error) results.push(`${name}: error message shown`);
  await browser.close();
}

await run('chromium-desktop', chromium, { viewport: { width: 1280, height: 900 } });
await run('webkit-iphone', webkit, { ...devices['iPhone 13'] });
await run('chromium-slow', chromium, { viewport: { width: 1280, height: 900 } }, { slow: true });
console.log(results.join('\n'));
