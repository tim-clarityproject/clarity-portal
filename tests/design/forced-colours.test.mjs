// Windows high-contrast mode (forced colours; CLAUDE.md rule 8b) on the parts the break-it tester found blank (F4,
// 26 Nov): the focus-mode × (.ds-tool-x .ds-x), a joined switch's chosen part, the date picker's chosen day and
// today's ring, and the main button's edge. Read with the portal's real styles in a page with forced colours on.
//
//   node --import ./tests/scores/register.mjs --test tests/design/forced-colours.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const css = (p) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));
const STYLES = ['styles/tokens.css', 'styles/buttons.css', 'components/design/design.css', 'components/design/blocks.css', 'components/design/frame.css'].map(css);

const PARTS = `
  <div class="ds-tool-bar"><button class="ds-tool-x" aria-label="Close and save my place"><span class="ds-x" aria-hidden="true"></span></button></div>
  <div class="ds-seg ds-seg--equal" role="group" aria-label="Late"><button class="ds-seg-btn" aria-pressed="false">No</button><button class="ds-seg-btn" aria-pressed="true">Yes</button></div>
  <div class="ds-cal ds-cal--picker"><div class="ds-cal-day"><span>3</span></div><div class="ds-cal-day ds-cal-day--sel"><span>4</span></div><div class="ds-cal-day ds-cal-day--today"><span>5</span></div></div>
  <button class="ds-btn ds-btn--primary">Sign and send</button>`;

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

const read = () => {
  const q = (s) => document.querySelector(s);
  const g = (el, pseudo) => getComputedStyle(el, pseudo || null);
  const probe = document.createElement('i');
  probe.style.cssText = 'color: CanvasText; background-color: Canvas; forced-color-adjust: none;';
  document.body.append(probe);
  const text = g(probe).color;
  const canvas = g(probe).backgroundColor;
  const segs = [...document.querySelectorAll('.ds-seg-btn')];
  return {
    text,
    canvas,
    xLine: g(q('.ds-x'), '::before').backgroundColor,
    segOff: g(segs[0]).backgroundColor,
    segOn: g(segs[1]).backgroundColor,
    selDay: g(q('.ds-cal-day--sel > span')).backgroundColor,
    todayRing: `${g(q('.ds-cal-day--today > span')).outlineStyle} ${g(q('.ds-cal-day--today > span')).outlineWidth}`,
    mainEdge: `${g(q('.ds-btn--primary')).borderTopStyle} ${g(q('.ds-btn--primary')).borderTopWidth}`,
  };
};

for (const theme of ['light', 'dark']) {
  test(`forced colours (${theme}): the ×, the chosen switch part, the picker's day and today, the main button's edge`, async () => {
    await tab.emulateMedia({ forcedColors: 'active', colorScheme: theme });
    await tab.setContent(`<!doctype html><html data-theme="${theme}"><head><style>body{margin:0}</style></head><body><div class="ui-root" style="padding:20px">${PARTS}</div></body></html>`);
    for (const path of STYLES) await tab.addStyleTag({ path });
    await tab.addStyleTag({ content: '.ui-root * { transition: none !important; animation: none !important; }' });
    await tab.evaluate(() => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); }));
    const r = await tab.evaluate(read);
    const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    assert.equal(r.xLine, r.text, `the × is drawn in the system's text colour (${r.xLine})`);
    assert.ok(!clear(r.segOn) && r.segOn !== r.segOff && r.segOn !== r.canvas, `the chosen switch part stands out (${r.segOn} vs ${r.segOff})`);
    assert.ok(!clear(r.selDay) && r.selDay !== r.canvas, `the picker's chosen day is filled (${r.selDay})`);
    assert.match(r.todayRing, /^solid [1-9]/, `today keeps its ring (${r.todayRing})`);
    assert.match(r.mainEdge, /^solid [1-9]/, `the main button has an edge (${r.mainEdge})`);
  });
}
