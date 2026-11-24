// One left edge (sign-in rule 49; Tim, 23 Nov 2026, 17:40) on the outside
// Health Check's own screens: the welcome (before and once watched), the
// email and code screen (with and without its calm line, and as Welcome
// back), the example report and the results, each with the crosshair in the
// bar above on the column's left edge, and the loading screen, a message
// centred throughout; phone and laptop, light and dark, at the standard text
// size and twice it. The check is the sign-in pages' own
// (tests/signin/centring.mjs): the column says which kind of page it is, so
// a form or list page is checked for every row on its left edge and a
// message page for every row centred. On the example report and the
// results every row is read; the chart is passed by, a drawing whose axis
// words sit on its own grid (measured by compare-m7b.mjs). The projects
// table's heading row starts where the table does (the check reads a grid
// with an empty corner cell so).
//
//   APP_URL=http://localhost:5341 node --import ./tests/scores/register.mjs tests/healthcheck/centring.mjs
//   SIZES=400,1440  MODES=light,dark  TEXT=1,2  narrow a run.
//
// The page's database calls are answered by stand-ins and everything else
// outside localhost is blocked (tests/healthcheck/hc-shared.mjs).
import { chromium } from 'playwright';
import { appPage, signIn } from './hc-shared.mjs';
import { centredGroups, centringProblems } from '../signin/centring.mjs';

const SIZES = (process.env.SIZES || '400,1440').split(',').map(Number);
const MODES = (process.env.MODES || 'light,dark').split(',');
const TEXT = (process.env.TEXT || '1,2').split(',').map(Number);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const begin = (p) => p.getByRole('button', { name: 'Begin the Health Check' }).click();
const GUEST = { root: '.ds-guest-col', column: 'children', also: '.ds-guest-top-row' };
const SCREENS = [
  ['welcome', { watched: false }, async () => {}, GUEST],
  ['welcome once watched', { watched: true }, async () => {}, GUEST],
  ['email and code', {}, begin, GUEST],
  ['email and code with its calm line', {}, async (p) => { await begin(p); await p.locator('.hc-wide-btn').click(); await p.locator('.ds-error').waitFor(); }, GUEST],
  ['example report', {}, async (p) => { await begin(p); await p.getByRole('button', { name: 'See an example report' }).click(); await p.locator('.ds-guest-title').waitFor(); }, { ...GUEST, report: true }],
  ['results', { complete: true, step: { screen: 'done' } }, async (p, s) => { await signIn(p, s); await p.locator('.hc-results .ds-guide-title').waitFor({ timeout: 20000 }); }, { root: '.hc-results .ds-guide-page', also: '.ds-guide-top', report: true }],
];
// On a report: the chart's drawing (see above).
const REPORT_OWN = /^svg “/;
let passed = 0;
let failed = 0;
const pass = (name, ok, detail) => {
  if (ok) passed += 1; else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: ${detail}`}`);
};

const browser = await chromium.launch();
try {
  for (const w of SIZES) {
    for (const mode of MODES) {
      for (const scale of TEXT) {
        for (const [name, opts, reach, how] of SCREENS) {
          const tag = `${name}, ${w} ${mode}${scale === 1 ? '' : `, text ×${scale}`}`;
          let b = null;
          try {
            b = await appPage(browser, w, mode, { ...opts, textTwice: scale === 2 });
            await reach(b.page, b.session);
            await b.page.evaluate(() => document.fonts.ready);
            await b.page.mouse.move(2, 2);
            await sleep(600);
            const found = await b.page.evaluate(centredGroups, how);
            if (how.report) found.rows = found.rows.filter((r) => !REPORT_OWN.test(r.name));
            const off = centringProblems(found);
            pass(`${tag}: each row ${found.align === 'centre' ? 'centred as a group' : 'on the column’s left edge'}, and boxes even inside (${found.rows.length} rows)`, off.length === 0, off.slice(0, 5).join('; '));
          } catch (error) {
            pass(`${tag}: opened`, false, `${error.message}`.split('\n')[0]);
          }
          if (b) await b.ctx.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
