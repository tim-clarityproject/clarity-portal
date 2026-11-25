// One alignment per page (sign-in rule 49; since polish 1 the 25 Nov
// reference's centred sign-in pages, their forms marked data-form="centred",
// and My Account's pages on one left edge), on every sign-in and account screen, client and
// coach (SCREENS and COACH_SCREENS, as measure.mjs opens them), dark and
// light, at 1280 and at 390 by 844, at the standard text size and at twice
// it. The check itself is tests/signin/centring.mjs (`centredGroups`).
//
//   APP_URL=http://localhost:5341 node tests/signin/centring-pages.mjs
//   ONLY=auth-codes,auth-setup  MODES=dark  SIZES=390  TEXT=1,2  narrow a run.
//
// TEST project only; no real email, and Google's own page is never opened.
import { chromium } from 'playwright';
import { SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { SCREENS } from './screens.mjs';
import { COACH_SCREENS } from './coachScreens.mjs';
import { centredGroups, centringProblems } from './centring.mjs';

const env = testEnv();
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1280,390').split(',').map(Number);
const TEXT = (process.env.TEXT || '1,2').split(',').map(Number);
const { pass, done } = makeChecks();

const browser = await chromium.launch();
for (const mode of MODES) {
  for (const width of SIZES) {
    const phone = width < 700;
    for (const screen of [...SCREENS, ...COACH_SCREENS]) {
      if (ONLY && !ONLY.includes(screen.key)) continue;
      const answers = {};
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, deviceScaleFactor: 2, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
      await guard(ctx, [], answers);
      const page = await ctx.newPage();
      const root = screen.acct ? '.si-col--account' : '.si-col';
      try {
        await screen.open(page, { env, answers, SAM, phone, ctx });
        await page.waitForSelector(root, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(1, 1);
        await page.evaluate(() => document.activeElement?.blur?.());
        await sleep(450);
      } catch (e) {
        pass(`${screen.name}, ${width}px ${mode}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      for (const scale of TEXT) {
        const tag = `${screen.name}, ${width}px ${mode}${scale === 1 ? '' : `, text ×${scale}`}`;
        if (scale !== 1) {
          await page.addStyleTag({ content: `html{font-size:${16 * scale}px !important}` });
          await sleep(300);
        }
        const found = await page.evaluate(centredGroups, { root });
        const off = centringProblems(found);
        pass(`${tag}: each row ${found.align === 'centre' ? 'centred as a group' : 'on the column’s left edge'}, and boxes even inside (${found.rows.length} rows, ${found.boxes.length} boxes)`, off.length === 0, off.slice(0, 6).join('; '));
      }
      await ctx.close();
    }
  }
}
await browser.close();
done();
