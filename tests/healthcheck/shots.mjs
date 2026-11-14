import { chromium } from 'playwright';
import { appPage, signIn, STEPS } from './hc-shared.mjs';
// Screenshots of every outside Health Check screen (M7b's switcher), for looking at.
//   node tests/healthcheck/shots.mjs <folder>   SIZES=1440,400  MODES=dark,light  ONLY=<regex>
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'tmp-hc-shots';
mkdirSync(out, { recursive: true });
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const browser = await chromium.launch();
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
for (const w of SIZES) for (const mode of MODES) {
  const shot = async (page, name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${name}-${w}-${mode}.png`, fullPage: true }); };
  const run = async (name, opts, fn) => {
    if (only && !only.test(name)) return;
    const { ctx, page, session, problems } = await appPage(browser, w, mode, opts);
    try { await fn(page, session); await shot(page, name); } catch (e) { console.log('FAIL', name, w, mode, e.message.split('\n')[0]); await shot(page, name + '-FAILED').catch(() => {}); }
    if (problems.length) console.log(name, w, mode, problems.map((x) => x.slice(0, 400)).slice(0, 4));
    await ctx.close();
  };
  await run('01-welcome', { watched: false }, async () => {});
  await run('02-signin', {}, async (p) => { await p.getByRole('button', { name: 'Begin the Health Check' }).click(); });
  for (const [k, step] of Object.entries(STEPS)) await run(`04-${k}`, { step }, async (p, s) => { await signIn(p, s); });
  await run('12-results', { complete: true, step: { screen: 'done' } }, async (p, s) => { await signIn(p, s); await p.locator('button.hc-prow').first().waitFor(); });
  await run('12-results-whole', { complete: true, step: { screen: 'done' }, height: w <= 600 ? 4200 : 2600 }, async (p, s) => { await signIn(p, s); await p.locator('button.hc-prow').first().waitFor(); });
  await run('13-example', {}, async (p) => { await p.getByRole('button', { name: 'Begin the Health Check' }).click(); await p.getByRole('button', { name: 'See an example report' }).click(); await p.locator('button.hc-prow').first().waitFor(); });
  await run('14-guide', { complete: true, step: { screen: 'done' } }, async (p, s) => { await signIn(p, s); await p.getByRole('button', { name: 'Quick guide' }).click(); await p.waitForTimeout(800); });
  await run('15-who', { step: STEPS.objective }, async (p, s) => { await signIn(p, s); await p.locator('.ds-who--eye').last().click(); await p.waitForTimeout(500); });
  await run('16-pdf', { complete: true, step: { screen: 'done' } }, async (p, s) => { await signIn(p, s); await p.getByRole('button', { name: 'Download my PDF' }).click(); await p.waitForTimeout(500); });
}
await browser.close();
