// The lasting design check (tests/design/design-rules.mjs designProblems) read on small pages of its own, with the
// portal's real tokens and shared styles (tokens.css, buttons.css, design.css, blocks.css), so each rule is known to
// pass the 25 Nov reference's own parts and to fail what it should (polish 1, "A lasting check").
//
//   node --import ./tests/scores/register.mjs --test tests/design/design-rules.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { designProblems } from './design-rules.mjs';

const css = (p) => fileURLToPath(new URL(`../../src/${p}`, import.meta.url));
const STYLES = ['styles/tokens.css', 'styles/buttons.css', 'components/design/design.css', 'components/design/blocks.css', 'components/design/frame.css'].map(css);
const FONTS = "@font-face{font-family:'Nekst';src:local('Arial')}";

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

async function check(body, { phone = false, theme = 'light', extra = '', width } = {}) {
  await tab.setViewportSize(width ? { width, height: 800 } : phone ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await tab.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${FONTS} body{margin:0}</style></head><body><div class="ui-root" style="padding:20px">${body}</div></body></html>`);
  for (const path of STYLES) await tab.addStyleTag({ path });
  await tab.addStyleTag({ content: `.ui-root * { transition: none !important; animation: none !important; } ${extra}` });
  return tab.evaluate(designProblems, { phone, scale: 1 });
}
const rules = (r) => r.problems.map((p) => p.split(':')[0]);

// The reference's own parts, built as the shared components draw them.
const OPENING = '<header class="ds-open"><div class="ds-open-label">Wednesday 25 November</div><h1 class="ds-page-title ds-open-title">Good morning, Sam</h1><p class="ds-open-line">Two things need you today.</p><div class="ds-open-act"><button class="ds-btn ds-btn--primary">Start my daily plan</button></div></header>';
const CARD = '<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">What needs you</h2><a class="ds-more ds-more--small" href="#"><span>View all</span></a></div><div class="ds-li"><span class="ds-li-name">Sign your coaching agreement</span><span class="ds-li-value">Fri 27 Nov</span></div><div class="ds-li"><span class="ds-li-name">Prepare for tomorrow’s session</span><span class="ds-li-value">~2 minutes</span></div></section>';
const CONTROLS = '<div style="display:flex;gap:12px;align-items:center"><button class="ds-btn ds-btn--outline">Today</button><div class="ds-count"><button aria-label="Less">−</button><span>7</span><button aria-label="More">+</button></div><div class="ds-seg" role="group" aria-label="Late"><button class="ds-seg-btn" aria-pressed="false">No</button><button class="ds-seg-btn" aria-pressed="true">Yes</button></div></div>';

test('the reference’s page opening, card and controls pass, laptop and phone, light and dark', async () => {
  for (const phone of [false, true]) {
    for (const theme of ['light', 'dark']) {
      const r = await check(OPENING + CARD + CONTROLS, { phone, theme });
      assert.deepEqual(r.problems, [], `${phone ? 'phone' : 'laptop'} ${theme}: ${r.problems.join('; ')}`);
    }
  }
});

test('nekst: Nekst on a figure, mixed case or a label fails; the title and THE CLARITY PORTAL pass', async () => {
  const r = await check('<header class="ds-open"><h1 class="ds-page-title ds-open-title">Today</h1></header><div style="font-family:Nekst;font-size:24px">72%</div><div style="font-family:Nekst;font-size:13px;text-transform:uppercase">Section</div><div style="font-family:Nekst;font-size:13px">THE CLARITY PORTAL</div>');
  const all = r.problems.join('; ');
  assert.match(all, /nekst: Nekst on words or figures: "72%"/);
  assert.match(all, /nekst: Nekst on something that isn't a page title or the product's name: "Section"/);
  assert.equal(r.problems.filter((p) => /CLARITY PORTAL|Today/.test(p)).length, 0);
});

test('size: 14px, 15px and 17px text fail; 13, 16, 20, 22 and 24 pass', async () => {
  const r = await check(['13', '14', '15', '16', '17', '20', '22', '24'].map((s) => `<p style="font-size:${s}px">Size ${s}</p>`).join(''));
  assert.deepEqual(r.problems.filter((p) => p.startsWith('size')).map((p) => p.match(/(\d+)px/)[1]), ['14', '15', '17']);
});

test('radius: a control with 8px corners beside 12px ones fails, and a pill does too', async () => {
  const r = await check('<button class="ds-btn ds-btn--outline">Edit</button><button class="ds-btn ds-btn--outline" style="border-radius:8px !important">Share</button><button class="ds-btn ds-btn--outline" style="border-radius:999px !important">Book</button>');
  assert.match(r.problems.join('; '), /radius: 12px ×1.*8px ×1.*pill ×1|radius: .*12px.*8px.*pill/);
});

test('row-heights and short: a 34px button beside a 40px one fails both', async () => {
  const r = await check('<div style="display:flex;gap:12px;align-items:center"><button class="ds-btn ds-btn--outline">Today</button><button class="ds-btn ds-btn--outline" style="min-height:34px !important;height:34px">This week</button></div>');
  assert.ok(rules(r).includes('row-heights'), r.problems.join('; '));
  assert.match(r.problems.join('; '), /short: 34px control "This week"/);
});

test('short: a 40px control on a phone fails (44px there)', async () => {
  const r = await check('<div class="ds-seg" role="group" aria-label="Late" style="min-height:40px !important;height:40px"><button class="ds-seg-btn" aria-pressed="true" style="min-height:38px !important">Yes</button><button class="ds-seg-btn" aria-pressed="false" style="min-height:38px !important">No</button></div>', { phone: true });
  assert.match(r.problems.join('; '), /short: 40px control/);
});

test('coral: a coral button and coral words fail; a mistake in coral passes', async () => {
  const r = await check('<button class="ds-btn" style="background:#FF6F5C;color:#000">Save</button><p style="color:#C2412E">Needs you</p><p role="alert" style="color:#C2412E">That code didn’t work.</p><input aria-invalid="true" class="ds-field" style="border-color:#FF6F5C" aria-label="Code">');
  const all = r.problems.join('; ');
  assert.match(all, /coral: coral that isn't a mistake: filled "Save", words "Needs you"/);
  assert.doesNotMatch(all, /That code/);
});

test('arrow: "→" in a link fails', async () => {
  const r = await check('<a href="#">View all →</a>');
  assert.match(r.problems.join('; '), /arrow: "→" in "View all →"/);
});

test('card: a label off the padding, or a last row with room under it, fails', async () => {
  const r = await check(CARD, { extra: '.ui-root .ds-card-head { margin-top: 6px; } .ui-root .ds-card > .ds-li:last-child { padding-bottom: 14px; }' });
  const all = r.problems.join('; ');
  assert.match(all, /card: label "WHAT NEEDS YOU" is 30px from the card's top, not 24/);
  assert.match(all, /card: the last row of .* ends 38px from the card's bottom, not 24/);
});

test('width: on a phone a card narrower than the column fails', async () => {
  const r = await check(CARD + CARD.replace('class="ds-card"', 'class="ds-card" style="margin-right:30px"'), { phone: true });
  assert.ok(rules(r).includes('width'), r.problems.join('; '));
});

test('centre-icon: a link with a chevron centred under a full-width button fails; words only pass', async () => {
  const chev = '<span class="ds-chevron ds-chevron--left"></span>';
  const foot = (link) => `<div style="display:flex;flex-direction:column;align-items:stretch;width:350px"><button class="ds-btn ds-btn--primary" style="width:100%">Next</button><button class="ds-more" style="justify-content:center">${link}</button></div>`;
  let r = await check(foot(`${chev}<span>Back</span>`), { phone: true });
  assert.match(r.problems.join('; '), /centre-icon: "Back" is centred under "Next" with an icon/);
  r = await check(foot('<span>Back</span>'), { phone: true });
  assert.ok(!rules(r).includes('centre-icon'), r.problems.join('; '));
});

test('wrap: words on two lines inside a button fail', async () => {
  const r = await check('<button class="ds-btn ds-btn--outline" style="width:90px;white-space:normal !important">Start my daily plan</button>');
  assert.match(r.problems.join('; '), /wrap: words wrap inside "Start my daily plan"/);
});

test('repeat: a row whose first two lines are the same fails', async () => {
  const r = await check('<a href="#" style="display:block">Daily plan<br>Daily plan<br>Today</a>');
  assert.match(r.problems.join('; '), /repeat: "Daily plan" twice/);
});

test('main: two main buttons fail', async () => {
  const r = await check('<button class="ds-btn ds-btn--primary">Start my daily plan</button> <button class="ds-btn ds-btn--primary">Book a session</button>');
  assert.match(r.problems.join('; '), /main: 2 main buttons/);
});

test('scroll: a page wider than the window fails', async () => {
  const r = await check('<div style="width:1600px;height:10px"></div>');
  assert.match(r.problems.join('; '), /scroll: the page is \d+px wide at 1280px/);
});

test('rows: an opening list row (a hairline, no box) and its grey sub-line are a row, not a control', async () => {
  const rows = '<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">What needs you</h2></div><button class="ds-li ds-li--go"><span class="ds-li-name">Sign your coaching agreement<span class="ds-li-sub">Sent by Robin on Monday</span></span><span class="ds-li-value">Fri 27 Nov</span></button></section>';
  for (const phone of [false, true]) {
    const r = await check(OPENING + rows + CONTROLS, { phone });
    assert.ok(!rules(r).some((x) => ['radius', 'wrap', 'short'].includes(x)), `${phone ? 'phone' : 'laptop'}: ${r.problems.join('; ')}`);
  }
});

test('calendar tiles: a coach calendar tile (4px corners, short, peach) is an event, not a control', async () => {
  const tile = '<div style="position:relative;width:120px"><div class="cc-cal-tile" role="button" tabindex="0" style="border-radius:4px;height:22px;background:#FF6F5C;color:#000;font-size:13px;width:60px">Sam Carter, coaching session</div><button class="cc-cal-more" style="border-radius:4px;height:20px;font-size:13px;border:1px solid #999">2 more</button></div>';
  const r = await check(CONTROLS + tile);
  assert.ok(!rules(r).some((x) => ['radius', 'wrap', 'short', 'coral'].includes(x)), r.problems.join('; '));
});

// Tim's walk of Stage A (25 Nov), items 4 to 33: each new rule passes the shared parts and fails what it should.

test('contrast (item 4): 13px text in the placeholder grey fails; --text-2 passes; a disabled control is left out', async () => {
  for (const theme of ['light', 'dark']) {
    const r = await check('<p style="font-size:13px;color:var(--placeholder)">Habit, 0 of 4 this week</p><p style="font-size:13px;color:var(--text-2)">Suggested for adults</p><p style="font-size:16px;color:var(--label)">A label</p><button class="ds-btn ds-btn--outline" disabled style="color:var(--placeholder)">Later</button>', { theme });
    const all = r.problems.filter((p) => p.startsWith('contrast')).join('; ');
    if (theme === 'light') assert.match(all, /contrast: text under 4.5 to 1: 4\.\d\d to 1 for 13px "Habit, 0 of 4 this week"/);
    assert.doesNotMatch(all, /Suggested|A label|Later/, `${theme}: ${all}`);
  }
});

const GO_ROW = (name, value) => `<button class="ds-li ds-li--go" type="button"><span class="ds-li-name">${name}</span><span class="ds-li-value">${value}<span class="ds-chevron ds-chevron--right" aria-hidden="true"></span></span></button>`;
test('chevron-line (item 8): on a phone an opening row keeps its chevron on the name’s line; dropped under it fails', async () => {
  const list = `<div class="ds-rows-list">${GO_ROW('Customise my dashboard', '')}${GO_ROW('About The Clarity Portal', '')}</div>`;
  let r = await check(list, { phone: true });
  assert.ok(!rules(r).includes('chevron-line'), r.problems.join('; '));
  r = await check(list, { phone: true, extra: '.ui-root .ds-li.ds-li--go { flex-direction: column !important; }' });
  assert.match(r.problems.join('; '), /chevron-line: the chevron of "Customise my dashboard" is off the name's line/);
  r = await check(list, { extra: '.ui-root .ds-li.ds-li--go { justify-content: flex-start; }' });
  assert.match(r.problems.join('; '), /chevron-line: the chevron of .* from the row's right end/);
});

test('divider (item 8): lists one after another keep one divider; a first row with none fails', async () => {
  const rows = '<div class="acct"><div class="ds-rows-list"><div class="ds-li"><span class="ds-li-name">Sleep target</span></div></div><div class="ds-rows-list"><div class="ds-li"><span class="ds-li-name">Customise my dashboard</span></div><div class="ds-li"><span class="ds-li-name">About</span></div></div></div>';
  let r = await check(rows);
  assert.ok(!rules(r).includes('divider'), r.problems.join('; '));
  r = await check(rows, { extra: '.ui-root .acct .ds-rows-list > .ds-li:first-child { border-top: 0 !important; }' });
  assert.match(r.problems.join('; '), /divider: rows of one list differ in their dividers: "Customise my dashboar[^,]* none, "About" line/);
});

test('bare-zero (item 9): a 24px "0", "0%" or "£0" fails; a real figure and the empty sentence pass', async () => {
  const r = await check('<div class="ds-fig">£0<span class="ds-fig-unit"> of £18,000</span></div><div class="ds-fig">0%</div><div class="ds-fig">0</div><div class="ds-fig">72<span class="ds-fig-unit">%</span></div><p class="ds-fig-empty">Nothing settled yet this month.</p>');
  const zeros = r.problems.filter((p) => p.startsWith('bare-zero'));
  assert.equal(zeros.length, 3, zeros.join('; '));
  assert.match(zeros.join('; '), /"£0"/);
});

test('figures (item 13): two 24px figures in one card fail; one passes', async () => {
  const card = (figs) => `<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Your weeks</h2></div>${figs}</section>`;
  let r = await check(card('<div class="ds-fig">72<span class="ds-fig-unit">%</span></div><div class="ds-li"><span class="ds-li-name">Revenue</span><span class="ds-li-value">Up £32k</span></div>'));
  assert.ok(!rules(r).includes('figures'), r.problems.join('; '));
  r = await check(card('<div class="ds-fig">72<span class="ds-fig-unit">%</span></div><div class="ds-li"><span class="ds-li-name">Revenue</span><span class="ds-fig">+£32k</span></div>'));
  assert.match(r.problems.join('; '), /figures: 2 24px figures in one card \("72", "\+£32k"\)/);
});

const FOLD = (id, title, body, open = true) => `<div class="ds-collapse${open ? ' ds-collapse--open' : ''}"><button type="button" class="ds-collapse-head" aria-expanded="${open}" aria-controls="${id}"><h2 class="ds-label">${title}</h2></button><div id="${id}" class="ds-collapse-body"${open ? '' : ' inert'}><div class="ds-collapse-inner">${body}</div></div></div>`;
test('fold-in-fold (item 15): a fold inside a fold fails, shut or open; folds side by side pass', async () => {
  let r = await check(FOLD('f1', 'Objectives and strategies', '<p>Outcome Objectives</p>') + FOLD('f2', 'Habits', '<p>Sleep</p>'));
  assert.ok(!rules(r).includes('fold-in-fold'), r.problems.join('; '));
  for (const open of [true, false]) {
    r = await check(FOLD('f1', 'Objectives and strategies', FOLD('f3', 'Outcome Objectives', '<p>Grow revenue</p>', open)));
    assert.match(r.problems.join('; '), /fold-in-fold: "OUTCOME OBJECTIVES" folds inside "OBJECTIVES AND STRATEGIES"/);
  }
});

test('card-gap (item 22): 20px between cards and 32px under the opening pass, laptop and phone; 32px between cards fails', async () => {
  for (const phone of [false, true]) {
    const r = await check(OPENING + CARD + CARD, { phone });
    assert.ok(!rules(r).includes('card-gap'), r.problems.join('; '));
  }
  const r = await check(OPENING + CARD + CARD.replace('class="ds-card"', 'class="ds-card" style="margin-top:32px"'));
  assert.match(r.problems.join('; '), /card-gap: 32px between/);
});

test('empty-box (item 31): an empty outlined box with no role fails; the important mark and a tick box pass', async () => {
  const r = await check('<div style="width:80px;height:12px;border:1px solid var(--field-line);border-radius:12px"></div><span class="ds-mark-row"><span class="ds-important-mark" aria-hidden="true"></span>Call Robin</span><span class="ds-check-box" role="checkbox" aria-checked="false" aria-label="Done"><span></span></span>');
  const boxes = r.problems.filter((p) => p.startsWith('empty-box'));
  assert.equal(boxes.length, 1, boxes.join('; '));
  assert.match(boxes[0], /an empty outlined box, 82 by 14px/);
});

test('empty-box: the code’s six squares, drawn over their one input, are that field’s and pass', async () => {
  const sq = '<span style="display:inline-block;width:48px;height:56px;border:1px solid var(--field-line);border-radius:12px"></span>';
  const r = await check(`<div class="si-code"><input class="si-code-input" aria-label="Code" style="position:absolute;opacity:0;width:1px;height:1px"><div class="si-code-squares" aria-hidden="true">${sq.repeat(6)}</div></div>`);
  assert.deepEqual(r.problems.filter((p) => p.startsWith('empty-box')), []);
});

const PHEAD = (mission) => `<div class="ds-frame"><div class="ds-frame-main"><div class="ui-root hdr-frame-root"><div class="hdr hdr-frame"><button type="button" class="ds-mbtn hdr-frame-menu" aria-label="Menu"><svg class="ds-bold-cross" viewBox="0 0 10 10"><path d="M0 5h10M5 0v10" stroke="currentColor"/></svg></button><button type="button" class="hdr-mbox">My Mission<b>${mission}</b></button></div></div></div></div>`;
test('overlap (item 32): a button over the header’s crosshair fails at 600, 768, 960 and 1023px; the header alone passes', async () => {
  for (const width of [600, 768, 960, 1023]) {
    let r = await check(PHEAD('Lead well'), { width, extra: '.ui-root { padding: 0 !important; }' });
    assert.ok(!rules(r).includes('overlap'), `${width}: ${r.problems.join('; ')}`);
    r = await check(`${PHEAD('Lead well')}<button class="ds-btn ds-btn--outline" style="position:fixed;left:16px;top:16px" aria-label="Menu">≡</button>`, { width, extra: '.ui-root { padding: 0 !important; }' });
    assert.match(r.problems.join('; '), /overlap: button.ds-btn .* is drawn over the menu's crosshair/, `${width}`);
  }
});

test('mission (item 33): in the phone header My Mission fills the row, 40px high; sized to its words there fails', async () => {
  for (const width of [390, 600, 768, 960]) {
    for (const theme of ['light', 'dark']) {
      let r = await check(PHEAD('Lead well'), { width, theme, extra: '.ui-root { padding: 0 !important; }' });
      assert.ok(!rules(r).includes('mission'), `${width} ${theme}: ${r.problems.join('; ')}`);
      r = await check(PHEAD('Lead well'), { width, theme, extra: '.ui-root { padding: 0 !important; } .ui-root .hdr-frame .hdr-mbox:not(#_):not(#_) { flex: none; }' });
      assert.match(r.problems.join('; '), /mission: My Mission ends \d+px short of the header's right margin/, `${width} ${theme}`);
    }
  }
  // On a laptop with the frame it stays at the panel's top right, sized to its words.
  let r = await check(PHEAD('Lead well'), { width: 1280 });
  assert.ok(!rules(r).includes('mission'), r.problems.join('; '));
  r = await check(PHEAD('Lead well'), { width: 1280, extra: '.ui-root .hdr-frame .hdr-mbox:not(#_):not(#_) { min-width: 400px; }' });
  assert.match(r.problems.join('; '), /mission: My Mission is 400px wide on a laptop/, r.problems.join('; '));
});
