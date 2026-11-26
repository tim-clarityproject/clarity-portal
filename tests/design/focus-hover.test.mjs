// The hover and keyboard-focus check (tests/design/focus-hover.mjs) on small pages of its own, with the portal's real
// tokens and shared styles: the reference's controls pass; a control that shows nothing on focus or hover fails.
//
//   node --import ./tests/scores/register.mjs --test tests/design/focus-hover.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { focusHoverProblems } from './focus-hover.mjs';

const css = (p) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));
const STYLES = ['styles/tokens.css', 'styles/buttons.css', 'components/design/design.css', 'components/design/blocks.css', 'components/design/frame.css'].map(css);

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

async function check(body, extra = '') {
  await tab.setContent(`<!doctype html><html data-theme="light"><head><style>body{margin:0}</style></head><body><div class="ui-root" style="padding:40px">${body}</div></body></html>`);
  for (const path of STYLES) await tab.addStyleTag({ path });
  if (extra) await tab.addStyleTag({ content: extra });
  return focusHoverProblems(tab);
}

test('the reference’s main button, outlined button, link and joined switch show hover and keyboard focus', async () => {
  const r = await check('<button class="ds-btn ds-btn--primary">Start my daily plan</button> <button class="ds-btn ds-btn--outline">Today</button> <a class="ds-more ds-more--small" href="#x"><span>View all</span><span class="ds-chevron ds-chevron--right" aria-hidden="true"></span></a> <div class="ds-seg" role="group" aria-label="View"><button class="ds-seg-btn" aria-pressed="true">List</button><button class="ds-seg-btn" aria-pressed="false">Calendar</button></div>');
  assert.equal(r.tabbed, 5);
  assert.deepEqual(r.focus, []);
  assert.deepEqual(r.hover, []);
});

test('a control that shows nothing on keyboard focus or hover fails, named', async () => {
  const r = await check('<button class="bare">Plain</button>', '.ui-root .bare { all: unset; cursor: pointer; } .ui-root .bare:focus-visible { outline: none; }');
  assert.equal(r.focus.length, 1);
  assert.match(r.focus[0], /button\.bare "Plain": nothing shows keyboard focus/);
  assert.equal(r.hover.length, 1);
  assert.match(r.hover[0], /button\.bare "Plain": nothing changes on hover/);
});

test('a text box is left out of hover, and a chosen option too', async () => {
  const r = await check('<input class="ds-field" aria-label="Name"> <div class="ds-seg" role="group" aria-label="View"><button class="ds-seg-btn" aria-pressed="true">List</button><button class="ds-seg-btn" aria-pressed="false">Calendar</button></div>');
  assert.deepEqual(r.hover, []);
  assert.deepEqual(r.focus, []);
});
