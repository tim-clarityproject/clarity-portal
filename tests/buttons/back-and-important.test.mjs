// The two lasting checks of the tidy pass follow-up 1 (tests/buttons/
// buttons-check.mjs backGaps and importantMarks), read on small pages of
// their own with the portal's real tokens and shared styles, so each is
// known to fail what it should:
//
//   - backGaps: Back's chevron is 10px from its words (Tim, 18 Nov, follow-up
//     1; rule 29t): the shared BackLink and a guided tool's Back pass; the
//     old 14px gap and a 6px one fail; a calendar's Previous arrow is left
//     alone;
//   - importantMarks: Important where there's no tick box is the thin soft
//     coral line at the item's left edge (Tim, 18 Nov, 12:30), and on a tick
//     box only its 2px soft coral edge: the old small box, bold words, a coral
//     word, a line that is too thick or another colour, a line beside a tick
//     box and a tick box without its edge all fail;
//   - sideLines lets exactly that thin line through and still fails a thick
//     coloured side line.
//
//   node --import ./tests/scores/register.mjs --test tests/buttons/back-and-important.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { backGaps, importantMarks, sideLines } from './buttons-check.mjs';

const css = (p) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));
const STYLES = ['styles/tokens.css', 'components/design/design.css', 'styles/components.css'].map(css);

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

async function load(body, extra = '') {
  await tab.setContent(`<!doctype html><html><head></head><body><div class="ui-root" data-theme="dark" style="padding:24px">${body}</div></body></html>`);
  for (const path of STYLES) await tab.addStyleTag({ path });
  // Colours read at rest, not part way through a part's own transition.
  await tab.addStyleTag({ content: '.ui-root * { transition: none !important; }' });
  if (extra) await tab.addStyleTag({ content: extra });
}

// The shared BackLink's markup (src/components/ui/DiscardLink.jsx), with the real Chevron's.
const CHEVRON = '<span class="ds-chevron-line ds-chevron-line--sm" aria-hidden="true"><span class="ds-chevron-base"><span class="ds-chevron ds-chevron--left ds-chevron--sm ui-back-link-icon" aria-hidden="true"></span></span></span>';
const BACKLINK = `<button type="button" class="ui-back-link">${CHEVRON}<span>Back to Home</span></button>`;
// A guided tool's Back: the chevron alone, the tool's name after it on its row.
const GUIDE = '<div class="ds-guide-bar"><button type="button" class="ds-guide-back" aria-label="Back"><span class="ds-chevron-line ds-chevron-line--sm ds-chevron-line--caps" aria-hidden="true"><span class="ds-chevron-base"><span class="ds-chevron ds-chevron--left ds-chevron--sm" aria-hidden="true"></span></span></span></button><span class="ds-guide-name">Daily plan</span></div>';

test('Back: the shared BackLink and a guided tool\'s Back are 10px from their words', async () => {
  await load(BACKLINK + GUIDE);
  const r = await tab.evaluate(backGaps);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 2);
});

test('Back: the old 14px gap fails, and so does 6px', async () => {
  await load(BACKLINK, '.ui-root .ui-back-link { gap: 14px; }');
  let r = await tab.evaluate(backGaps);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /"Back to Home": its label is 14\.00px from the chevron, not 10px/);
  await load(GUIDE, '.ui-root .ds-guide-back { margin-right: -27.5px; }');
  r = await tab.evaluate(backGaps);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /ds-guide-back "Back": its label is 6\.\d\dpx from the chevron, not 10px/);
});

test('Back: a calendar\'s Previous arrow is not a Back and is left alone', async () => {
  await load('<div style="display:flex;gap:30px"><button type="button" class="cc-cal-step" aria-label="Previous week"><span class="ds-chevron ds-chevron--left" aria-hidden="true"></span></button><span>Nov 2026</span></div>');
  const r = await tab.evaluate(backGaps);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 0);
});

// The shared to-do row's tick box (src/components/design/TodoRow.jsx).
const TODO = (important, extra = '') => `<div class="ds-todos" role="list"><div class="ds-todo${important ? ' ds-todo--important' : ''}" role="listitem"><button type="button" role="checkbox" class="ds-check-box" aria-checked="false" aria-label="Call Evan"><span></span></button><span class="ds-todo-words"><span class="ds-todo-text">Call Evan before 09:00${extra}</span></span></div></div>`;
const LINE = (inner = '1. Call Evan before 09:00') => `<p style="width:400px"><span class="ds-important">${inner}<span class="ds-sr">, highest priority</span></span></p>`;

test('Important: the tick box\'s 2px soft coral edge, and the thin line where there is no tick box, pass', async () => {
  await load(TODO(true) + LINE());
  const r = await tab.evaluate(importantMarks);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 2);
  assert.deepEqual(await tab.evaluate(sideLines), []);
});

test('Important: the thin line runs the full height of its words, also on two lines', async () => {
  await load(LINE('1. Call Evan before 09:00 about the referral, and ask about the Harbour introduction while we talk'));
  const r = await tab.evaluate(importantMarks);
  assert.deepEqual(r.problems, []);
});

test('Important: the retired small soft coral box fails', async () => {
  await load('<p><span class="ds-important-mark" aria-hidden="true" style="display:inline-block;width:10px;height:10px;border:2px solid var(--coral-soft-text);box-sizing:border-box"></span>1. Call Evan</p>');
  const r = await tab.evaluate(importantMarks);
  assert.match(r.problems.join('; '), /the small soft coral box \(\.ds-important-mark\), not the thin line/);
});

test('Important: with no tick box and no line, it fails', async () => {
  await load('<div class="cc-cal-todo--important" style="width:300px"><b style="font-weight:400">Call Evan</b></div>');
  const r = await tab.evaluate(importantMarks);
  assert.match(r.problems.join('; '), /no thin soft coral line at its left edge/);
});

test('Important: bold words, a coral word or a soft coral dot beside the line fail', async () => {
  await load(LINE('<b style="font-weight:700">1. Call Evan</b>'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /bold words \("1\. Call Evan", 700\)/);
  await load(LINE('<span style="color:var(--coral-soft-text)">Important</span> 1. Call Evan'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a coral word \("Important"\)/);
  await load(LINE('<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--coral)"></i>1. Call Evan'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a small dot/);
});

test('Important: a line too thick or in another colour fails, and sideLines still fails a thick side line', async () => {
  await load(LINE(), '.ui-root .ds-important::before { width: 4px; }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /its line is 4px wide, not 2px/);
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-important::before a 4px bar down its side/);
  await load(LINE(), '.ui-root .ds-important::before { background: var(--coral); }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /its line is rgb\(255, 111, 92\), not soft coral/);
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-important::before a 2px bar down its side/);
  // The same thin soft coral line on something not marked important is a side line.
  await load('<div class="ds-row" style="position:relative;height:40px;width:300px">Row</div>', '.ui-root .ds-row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--coral-soft-text); }');
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-row::before a 2px bar down its side/);
  // And a thick coloured left edge on a card.
  await load('<div class="ds-card" style="border-left:4px solid var(--coral);height:60px;width:300px">Card</div>');
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-card 4px side edge/);
});

test('Important: a tick box without its soft coral edge, or with the line as well, fails', async () => {
  await load(TODO(true), '.ui-root .ds-todo--important .ds-check-box > span { border-width: 1.5px; border-color: var(--field-line); }');
  const all = (await tab.evaluate(importantMarks)).problems.join('; ');
  assert.match(all, /its tick box edge is 1(\.5)?px, not 2px/ /* a 1.5px edge reads as 1px at one pixel a point */);
  assert.match(all, /not soft coral/);
  await load(TODO(true).replace('<span class="ds-todo-text">', '<span class="ds-todo-text ds-important">'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a soft coral line as well as the tick box edge/);
});

test('Important: a row whose tick box is hidden (choosing several on a phone) needs the thin line', async () => {
  const hide = '.ui-root .ds-check-box { display: none; }';
  await load(TODO(true), hide);
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /no thin soft coral line at its left edge/);
  await load(TODO(true), `${hide} .ui-root .ds-todo--important .ds-todo-words { position: relative; display: block; padding-left: 10px; } .ui-root .ds-todo--important .ds-todo-words::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--coral-soft-text); }`);
  assert.deepEqual((await tab.evaluate(importantMarks)).problems, []);
  assert.deepEqual(await tab.evaluate(sideLines), []);
});
