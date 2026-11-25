// The lasting "boxes side by side in one row are the same height" check (CLAUDE.md rule 4a; tests/buttons/buttons-check.mjs
// sideBySide) read on small pages of its own (follow-up 5, item 16): it measures a control inside a plain container
// (a search box in a wrapper with no edge or fill) as the box it is, so one taller than the button beside it fails;
// and it still passes boxes of one height, and leaves a group of boxes in one wrapper to its own row.
//
//   node --import ./tests/scores/register.mjs --test tests/buttons/side-by-side.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { sideBySide } from './buttons-check.mjs';

const STYLE = `
  .ui-root { background: #000; color: #fff; font-family: sans-serif; padding: 24px; }
  .row { display: flex; gap: 12px; align-items: flex-start; }
  .box { border: 1px solid #636362; border-radius: 8px; box-sizing: border-box; }
  .wrap { position: relative; }
`;
const page = (body) => `<!doctype html><html><head><style>${STYLE}</style></head><body><div class="ui-root">${body}</div></body></html>`;

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });
const check = async (body) => { await tab.setContent(page(body)); return tab.evaluate(sideBySide); };

test('a search box in a plain wrapper, taller than the Filter beside it, fails', async () => {
  const out = await check('<div class="row"><div class="wrap"><input class="box" style="height:56px" placeholder="Search"></div><button class="box" style="height:40px">Filter</button></div>');
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.match(out[0], /56\.0/);
});

test('the same box and button at one height pass, wrapped twice over too', async () => {
  assert.deepEqual(await check('<div class="row"><div class="wrap"><div><input class="box" style="height:40px"></div></div><button class="box" style="height:40px">Filter</button></div>'), []);
});

test('boxes sitting directly in the row are still measured', async () => {
  assert.equal((await check('<div class="row"><input class="box" style="height:52px"><button class="box" style="height:40px">Go</button></div>')).length, 1);
});

test('a wrapper holding two boxes is a group, not one box to match', async () => {
  assert.deepEqual(await check('<div class="row"><div class="wrap"><input class="box" style="height:56px"><input class="box" style="height:56px"></div><button class="box" style="height:40px">Filter</button></div>'), []);
});
