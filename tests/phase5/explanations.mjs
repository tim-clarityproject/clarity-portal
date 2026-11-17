// Explanations in the side panel (Tim, 16 Nov, 23:31; explanations-panel.md
// step 3): every new kind of panel opener, with a mouse (a laptop), a touch
// (a phone) and the keyboard, in dark and light, at 1440, 768 and 400 wide.
// Each checks that focus moves in and back out, Escape and the close
// crosshair close it (and the dimmed page, where there is one), nothing
// behind it moves and nothing scrolls sideways (tests/explain-panel.mjs).
//
//   node --import ./tests/scores/register.mjs tests/phase5/explanations.mjs
//
// The openers: an ⓘ at the end of a sentence (the outside Health Check's
// "How your answers are kept"), an ⓘ beside a label (What is a Success
// Factor?), and a quiet link under a chart (How to read the chart), on the
// outside Health Check's own pages, answered by its stand-ins (never a real
// link or email); and the same three parts in the design gallery.
import { chromium } from 'playwright';
import { checkExplainOpener } from '../explain-panel.mjs';
import { APP, STEPS, appPage, signIn } from '../healthcheck/hc-shared.mjs';

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const WIDTHS = (process.env.WIDTHS || '1440,768,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const DONE = { complete: true, step: { screen: 'done' } };

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const touch = width <= 600;
      const tag = `${width} ${mode}`;
      // 1. The sign-in screen's ⓘ at the end of a sentence.
      let b = await appPage(browser, width, mode, { step: STEPS.objective });
      try {
        const begin = b.page.getByRole('button', { name: 'Begin the Health Check' });
        if (await begin.isVisible().catch(() => false)) await begin.click();
        await b.page.locator('.ds-guest-sentence .ds-guide-i').waitFor({ timeout: 15000 });
        await checkExplainOpener(b.page, b.page.locator('.ds-guest-sentence .ds-guide-i'), { tag: `${tag}: How your answers are kept`, pass, touch });
        // 2. The ⓘ beside the Success Factors label.
        await signIn(b.page, b.session);
      } catch (e) {
        pass(`${tag}: the sign-in screen`, false, `${e.message}`.split('\n')[0]);
      }
      await b.ctx.close();
      b = await appPage(browser, width, mode, { step: STEPS.csf });
      try {
        await signIn(b.page, b.session);
        await b.page.locator('.hc-flab .ds-guide-i').waitFor({ timeout: 15000 });
        await checkExplainOpener(b.page, b.page.locator('.hc-flab .ds-guide-i'), { tag: `${tag}: What is a Success Factor?`, pass, touch });
      } catch (e) {
        pass(`${tag}: the Success Factors step`, false, `${e.message}`.split('\n')[0]);
      }
      await b.ctx.close();
      // 3. The quiet link under the results chart.
      b = await appPage(browser, width, mode, DONE);
      try {
        await signIn(b.page, b.session);
        await b.page.locator('button.hc-prow').first().waitFor({ timeout: 15000 });
        await checkExplainOpener(b.page, b.page.locator('.hc-chart-section .ds-explain-link'), { tag: `${tag}: How to read the chart`, pass, touch });
        pass(`${tag}: no console errors on the Health Check`, b.problems.length === 0, b.problems.slice(0, 2).join(' | '));
      } catch (e) {
        pass(`${tag}: the results`, false, `${e.message}`.split('\n')[0]);
      }
      await b.ctx.close();
      // 4. The design gallery's example of all three parts (portal styles, its own page).
      const ctx = await browser.newContext({ viewport: { width, height: touch ? 844 : 900 }, isMobile: touch, hasTouch: touch, colorScheme: mode, reducedMotion: 'reduce', locale: 'en-GB' });
      const page = await ctx.newPage();
      try {
        await page.goto(`${APP}/design-reference#c78`);
        const section = page.locator('#c78');
        await section.waitFor({ timeout: 20000 });
        await section.scrollIntoViewIfNeeded();
        await sleep(400);
        await checkExplainOpener(page, section.locator('.ds-guide-i').nth(1), { tag: `${tag}: the gallery’s ⓘ beside a label`, pass, touch });
        await checkExplainOpener(page, section.locator('.ds-explain-link').first(), { tag: `${tag}: the gallery’s How to read the chart`, pass, touch });
      } catch (e) {
        pass(`${tag}: the gallery`, false, `${e.message}`.split('\n')[0]);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
