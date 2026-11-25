// The two lasting checks of the tidy pass follow-up 1 (tests/buttons/
// buttons-check.mjs backGaps and importantMarks), read on small pages of
// their own with the portal's real tokens and shared styles, so each is
// known to fail what it should:
//
//   - backGaps: Back's chevron is 10px from its words (Tim, 18 Nov, follow-up
//     1; rule 29t): the shared BackLink and a guided tool's Back pass; the
//     old 14px gap and a 6px one fail; a calendar's Previous arrow is left
//     alone;
//   - importantMarks: Important where there's no tick box is a small soft
//     coral box before the title, drawn as the Important tick box's square
//     (Tim, 18 Nov, 12:55; buttons-followup-1.md point 5), with the titles
//     around it lined up; on a tick box only its 2px soft coral edge. No
//     box, the old thin side line, a box of the wrong size, edge, colour,
//     corners or fill, a box after the title, titles out of line, bold
//     words, a coral word, a dot, a box beside a tick box and a tick box
//     without its edge all fail;
//   - sideLines fails every coloured side line, the thin soft coral one
//     on an important item included.
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
  assert.match(r.problems[0], /"Back to Home": its label is 14\.0[01]px from the chevron, not 10px/);
  await load(GUIDE, '.ui-root .ds-guide-back { margin-right: -27.5px; }');
  r = await tab.evaluate(backGaps);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /ds-guide-back "Back": its label is [56]\.\d\dpx from the chevron, not 10px/);
});

test('Back: a calendar\'s Previous arrow is not a Back and is left alone', async () => {
  await load('<div style="display:flex;gap:30px"><button type="button" class="cc-cal-step" aria-label="Previous week"><span class="ds-chevron ds-chevron--left" aria-hidden="true"></span></button><span>Nov 2026</span></div>');
  const r = await tab.evaluate(backGaps);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 0);
});

// The shared to-do row's tick box (src/components/design/TodoRow.jsx).
const TODO = (important, extra = '') => `<div class="ds-todos" role="list"><div class="ds-todo${important ? ' ds-todo--important' : ''}" role="listitem"><button type="button" role="checkbox" class="ds-check-box" aria-checked="false" aria-label="Call Evan"><span></span></button><span class="ds-todo-words"><span class="ds-todo-text">Call Evan before 09:00${extra}</span></span></div></div>`;
// The Daily plan summary's lines (src/pages/performance/PlanMyDay.jsx): the box before the first, its space before the rest.
const ROW = (important, words) => `<span class="ds-line" style="display:block"><span class="ds-mark-row${important ? ' ds-mark-row--important' : ''}"><span class="${important ? 'ds-important-mark' : 'ds-mark-space'}" aria-hidden="true"></span><span>${words}${important ? '<span class="ds-sr">, highest priority</span>' : ''}</span></span></span>`;
const MARKED = (first = '1. Call Evan before 09:00') => `<div style="width:400px">${ROW(true, first)}${ROW(false, '2. Training sessions')}</div>`;
// The old thin line of follow-up 1, at the item's left edge.
const OLD_LINE = '<p style="width:400px;line-height:1.55"><span class="ds-old-line">1. Call Evan before 09:00<span class="ds-sr">, highest priority</span></span></p>';
const OLD_LINE_CSS = '.ui-root .ds-old-line { position: relative; display: block; padding-left: 10px; } .ui-root .ds-old-line::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #FFBD9E; }';

test('Important: the tick box\'s 2px soft coral edge, and the small soft coral box where there is no tick box, pass', async () => {
  await load(TODO(true) + MARKED());
  const r = await tab.evaluate(importantMarks);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 2);
  assert.deepEqual(await tab.evaluate(sideLines), []);
});

test('Important: the box sits on the first line of a title on two lines', async () => {
  await load(MARKED('1. Call Evan before 09:00 about the referral, and ask about the Harbour introduction while we talk'));
  assert.deepEqual((await tab.evaluate(importantMarks)).problems, []);
});

test('Important: with no tick box and no box, it fails', async () => {
  await load('<div class="cc-cal-todo--important" style="width:300px"><b style="font-weight:400">Call Evan</b></div>');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /no small soft coral box before its title/);
});

test('Important: the old thin soft coral line at the left edge fails, in importantMarks and in sideLines', async () => {
  await load(OLD_LINE.replace('ds-old-line', 'ds-old-line ds-x--important'), OLD_LINE_CSS);
  const all = (await tab.evaluate(importantMarks)).problems.join('; ');
  assert.match(all, /no small soft coral box before its title/);
  assert.match(all, /a coloured line down its side \(ds-old-line::before\)/);
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-old-line::before a 2px bar down its side/);
  // Beside the box as well, it still fails.
  await load(MARKED(), '.ui-root .ds-mark-row--important { position: relative; padding-left: 10px; } .ui-root .ds-mark-row--important::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #FFBD9E; }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a coloured line down its side \(ds-mark-row::before\)/);
  // A soft coral left edge on the row.
  await load(MARKED(), '.ui-root .ds-mark-row--important { border-left: 2px solid #FFBD9E; }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a coloured line down its side \(ds-mark-row\)/);
});

test('sideLines fails every coloured side line, with no exception', async () => {
  await load('<div class="ds-row ds-row--important" style="position:relative;height:40px;width:300px">Row</div>', '.ui-root .ds-row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #FFBD9E; }');
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-row::before a 2px bar down its side/);
  await load('<div class="ds-card" style="border-left:4px solid #FF6F5C;height:60px;width:300px">Card</div>');
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-card 4px side edge/);
  await load('<div class="ds-card" style="border-left:2px solid #FFBD9E;height:60px;width:300px">Card</div>');
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-card 2px side edge/);
});

test('Important: a box not drawn as the tick box fails (size, edge, colour, corners, fill)', async () => {
  const check = async (css, re) => { await load(MARKED(), css); assert.match((await tab.evaluate(importantMarks)).problems.join('; '), re); };
  await check('.ui-root .ds-important-mark { width: 10px; height: 10px; }', /its box is 10\.0 by 10\.0px, not the tick box's 24px/);
  await check('.ui-root .ds-important-mark { border-width: 1px; }', /its box edge is 1px, not 2px/);
  await check('.ui-root .ds-important-mark { border-color: #FF6F5C; }', /its box edge is rgb\(255, 111, 92\), not soft coral/);
  await check('.ui-root .ds-important-mark { border-radius: 50%; }', /its box corners are 50%, not the tick box's 6px/);
  await check('.ui-root .ds-important-mark { background: #FFBD9E; }', /its box is filled/);
});

test('Important: the box after the title, or titles out of line, fail', async () => {
  await load(MARKED(), '.ui-root .ds-mark-row--important { flex-direction: row-reverse; justify-content: flex-end; }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /its box is not before its title/);
  // The rows without the box keep no space for it: their titles start further left.
  await load(MARKED(), '.ui-root .ds-mark-space { display: none; }');
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /its title starts 36\.0px from the titles around it/);
});

test('Important: bold words, a coral word or a soft coral dot beside the box fail', async () => {
  await load(MARKED('<b style="font-weight:700">1. Call Evan</b>'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /bold words \("1\. Call Evan", 700\)/);
  await load(MARKED('<span style="color:#FFBD9E">Important</span> 1. Call Evan'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a coral word \("Important"\)/);
  await load(MARKED('<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF6F5C"></i>1. Call Evan'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a small dot/);
});

test('Important: a tick box without its soft coral edge, or with the box as well, fails', async () => {
  await load(TODO(true), '.ui-root .ds-todo--important .ds-check-box > span { border-width: 1.5px; border-color: var(--field-line); }');
  const all = (await tab.evaluate(importantMarks)).problems.join('; ');
  assert.match(all, /its tick box edge is 1(\.5)?px, not 2px/ /* a 1.5px edge reads as 1px at one pixel a point */);
  assert.match(all, /not soft coral/);
  await load(TODO(true, '<span class="ds-important-mark" aria-hidden="true" style="display:inline-block"></span>'));
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a soft coral box as well as the tick box edge/);
});

test('Important: a row whose tick box is hidden (choosing several on a phone) needs the box, and the line fails', async () => {
  const hide = '.ui-root .ds-check-box { display: none; }';
  await load(TODO(true), hide);
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /no small soft coral box before its title/);
  await load(TODO(true), `${hide} .ui-root .ds-todo--important .ds-todo-words { position: relative; display: block; padding-left: 10px; } .ui-root .ds-todo--important .ds-todo-words::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #FFBD9E; }`);
  assert.match((await tab.evaluate(importantMarks)).problems.join('; '), /a coloured line down its side/);
  assert.match((await tab.evaluate(sideLines)).join('; '), /ds-todo-words::before a 2px bar down its side/);
  // The coach list's own form (src/pages/coach/todoParts.jsx and todos.css): the box in the open button's first column.
  await load(TODO(true).replace('<span class="ds-todo-words">', '<span class="ds-todo-words"><span class="ds-important-mark" aria-hidden="true"></span>'), `${hide} .ui-root .ds-todo-words { display: grid; grid-template-columns: var(--checkbox-box) minmax(0, 1fr); column-gap: var(--important-mark-gap); } .ui-root .ds-todo-words .ds-important-mark { margin-top: calc((1lh - var(--checkbox-box)) / 2); }`);
  assert.deepEqual((await tab.evaluate(importantMarks)).problems, []);
  assert.deepEqual(await tab.evaluate(sideLines), []);
});
