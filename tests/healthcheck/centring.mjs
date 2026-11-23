// One alignment per page, each row centred as a group (sign-in rule 49;
// Tim, 23 Nov 2026), on the outside Health Check's own single-column
// screens (the welcome, before and once watched, and the email and code
// screen, with and without its calm line), phone and laptop, light and dark,
// at the standard text size and twice it. The check is the sign-in pages'
// own (tests/signin/centring.mjs): the column's alignment is read from it,
// so a left-aligned screen is checked for every row on its left edge.
//
//   APP_URL=http://localhost:5341 node --import ./tests/scores/register.mjs tests/healthcheck/centring.mjs
//   SIZES=400,1440  MODES=light,dark  TEXT=1,2  narrow a run.
//
// The page's database calls are answered by stand-ins and everything else
// outside localhost is blocked (tests/healthcheck/hc-shared.mjs).
import { chromium } from 'playwright';
import { appPage } from './hc-shared.mjs';
import { centredGroups, centringProblems } from '../signin/centring.mjs';

const SIZES = (process.env.SIZES || '400,1440').split(',').map(Number);
const MODES = (process.env.MODES || 'light,dark').split(',');
const TEXT = (process.env.TEXT || '1,2').split(',').map(Number);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const begin = (p) => p.getByRole('button', { name: 'Begin the Health Check' }).click();
const SCREENS = [
  ['welcome', { watched: false }, async () => {}],
  ['welcome once watched', { watched: true }, async () => {}],
  ['email and code', {}, begin],
  ['email and code with its calm line', {}, async (p) => { await begin(p); await p.locator('.hc-wide-btn').click(); await p.locator('.ds-error').waitFor(); }],
];
// Waiting for Tim (23 Nov): the legal links under the email and code form are
// centred, as M7b (and M9's guest pages, which share the row) draw them, on a
// screen whose other rows are on the left. The mock-up wins until Tim says
// which way (CLAUDE.md rule 22), so it is reported, not failed.
const KNOWN = /ds-guest-legal|\.ds-link /;
const KNOWN_WHY = 'centred as M7b draws it; one alignment per page would put it on the left: Tim to decide';
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
        for (const [name, opts, reach] of SCREENS) {
          const tag = `${name}, ${w} ${mode}${scale === 1 ? '' : `, text ×${scale}`}`;
          let b = null;
          try {
            b = await appPage(browser, w, mode, { ...opts, textTwice: scale === 2 });
            await reach(b.page, b.session);
            await b.page.evaluate(() => document.fonts.ready);
            await b.page.mouse.move(2, 2);
            await sleep(600);
            const found = await b.page.evaluate(centredGroups, { root: '.ds-guest-col', column: 'children' });
            const all = centringProblems(found);
            const off = all.filter((x) => !KNOWN.test(x));
            for (const x of all.filter((y) => KNOWN.test(y))) console.log(`NOTE  ${tag}: ${x} (${KNOWN_WHY})`);
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
