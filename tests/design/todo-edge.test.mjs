// A to-do's tick box sits on the rows' left edge, as every row's name does (the break-it tester, P7, 26 Nov: Home's
// Today had it 10px in), its 44px tap area reaching into the card's padding; and a card's label with its link wraps
// at large text instead of running off the card (F8). Read with the portal's real styles.
//
//   node --import ./tests/scores/register.mjs --test tests/design/todo-edge.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const css = (p) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));
const STYLES = ['styles/tokens.css', 'styles/buttons.css', 'components/design/design.css', 'components/design/blocks.css', 'pages/home.css'].map(css);
let browser;
let tab;
before(async () => { browser = await chromium.launch({ args: ['--mute-audio'] }); tab = await browser.newPage({ viewport: { width: 390, height: 844 } }); });
after(async () => { await browser?.close(); });

async function page(body, rootSize = '100%') {
  await tab.setContent(`<!doctype html><html style="font-size:${rootSize}"><body style="margin:0"><div class="ui-root" style="padding:16px">${body}</div></body></html>`);
  for (const path of STYLES) await tab.addStyleTag({ path });
  await tab.addStyleTag({ content: '.ui-root * { transition: none !important; }' });
}

const CARD = `<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Today</h2></div>
  <button class="ds-li ds-li--go" type="button"><span class="ds-li-name">Daily plan</span><span class="ds-li-value">~4 minutes</span></button>
  <div class="ds-todos" role="list"><div class="ds-todo" role="listitem"><button type="button" role="checkbox" class="ds-check-box" aria-checked="false"><span></span></button><div class="ds-todo-main"><span class="ds-todo-text">Call the venue about Friday</span></div></div></div></section>`;

test('P7: the to-do’s tick box is on the rows’ left edge, its tap area still 44px', async () => {
  await page(CARD);
  const r = await tab.evaluate(() => {
    const L = (s) => document.querySelector(s).getBoundingClientRect();
    return { row: L('.ds-li-name').left, box: L('.ds-check-box > span').left, tap: L('.ds-check-box').width, text: L('.ds-todo-text').left - L('.ds-check-box > span').right };
  });
  assert.ok(Math.abs(r.box - r.row) <= 0.5, `box ${r.box} vs row ${r.row}`);
  assert.equal(r.tap, 44);
  assert.ok(r.text >= 12 && r.text <= 20, `words ${r.text}px from the box`);
});

test('F8: at 200% text a card label and its link wrap inside the card; at 100% they share one line', async () => {
  const head = '<section class="ds-card" style="width:350px;box-sizing:border-box"><div class="ds-card-head"><h2 class="ds-label">Upcoming</h2><a class="ds-more ds-more--small" href="#"><span>View calendar</span></a></div></section>';
  for (const [size, oneLine] of [['100%', true], ['200%', false]]) {
    await page(head, size);
    const r = await tab.evaluate(() => {
      const c = document.querySelector('.ds-card').getBoundingClientRect();
      const h = document.querySelector('.ds-label').getBoundingClientRect();
      const a = document.querySelector('.ds-more').getBoundingClientRect();
      return { inside: a.right <= c.right + 0.5 && h.right <= c.right + 0.5, sameLine: Math.abs(a.top - h.top) < h.height };
    });
    assert.ok(r.inside, `${size}: inside the card`);
    if (oneLine) assert.ok(r.sameLine, `${size}: one line`);
  }
});

// Home's Log today at 200% text on a 390 phone (the lead, after FX7's report): "View your week" wraps under the label on
// the card's left edge (the empty save state's gap no longer pushes it in), and "This week" with its line never runs
// under the fold's chevron or off the card.
const LOG = `<section class="ds-card home-log" style="width:350px;box-sizing:border-box"><div class="ds-card-head"><h2 class="ds-label">Log today</h2><span class="home-log-right"><span role="status" aria-live="polite"></span><button class="ds-more ds-more--small" type="button"><span>View your week</span><span class="ds-chevron-line" aria-hidden="true"><span class="ds-chevron-base"><span class="ds-chevron ds-chevron--right"></span></span></span></button></span></div>
  <div class="home-fold"><div class="ds-collapse"><button type="button" class="ds-collapse-head" aria-expanded="false"><span><span class="home-fold-head"><span class="home-fold-title">This week</span><span class="home-fold-line">3 weekly habits, 0 done</span></span></span><span class="ds-collapse-mark"><span class="ds-chevron-line" aria-hidden="true"><span class="ds-chevron-base"><span class="ds-chevron ds-chevron--down ds-arrow"></span></span></span></span></button></div></div></section>`;

test('Home’s Log today at 200% text on a phone: the link on the label’s edge, This week clear of its chevron, all inside', async () => {
  for (const size of ['100%', '200%']) {
    await page(LOG, size);
    const r = await tab.evaluate(() => {
      const B = (s) => document.querySelector(s).getBoundingClientRect();
      const card = B('.ds-card'); const label = B('.ds-label'); const link = B('.ds-more'); const line = B('.home-fold-line'); const title = B('.home-fold-title'); const chev = B('.ds-collapse-mark');
      return { card, label, link, line, title, chev, wrapped: link.top > label.bottom - 1 };
    });
    for (const k of ['label', 'link', 'line', 'title', 'chev']) assert.ok(r[k].right <= r.card.right + 0.5, `${size}: ${k} inside the card`);
    assert.ok(r.line.right <= r.chev.left + 0.5 && r.title.right <= r.chev.left + 0.5, `${size}: This week clear of its chevron (${r.line.right} vs ${r.chev.left})`);
    if (r.wrapped) assert.ok(Math.abs(r.link.left - r.label.left) <= 0.5, `${size}: the wrapped link on the label’s edge (${r.link.left} vs ${r.label.left})`);
    if (size === '100%') assert.ok(!r.wrapped, '100%: label and link share one line');
  }
});
