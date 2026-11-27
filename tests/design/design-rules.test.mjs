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

async function check(body, { phone = false, theme = 'light', extra = '', width, route = null } = {}) {
  await tab.setViewportSize(width ? { width, height: 800 } : phone ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await tab.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${FONTS} body{margin:0}</style></head><body><div class="ui-root" style="padding:20px">${body}</div></body></html>`);
  for (const path of STYLES) await tab.addStyleTag({ path });
  await tab.addStyleTag({ content: `.ui-root * { transition: none !important; animation: none !important; } ${extra}` });
  return tab.evaluate(designProblems, { phone, scale: 1, route });
}
const rules = (r) => r.problems.map((p) => p.split(':')[0]);

// The reference's own parts, built as the shared components draw them (the joined switch with equal parts, as
// InlineChoice gives it since Tim's walk of Stage B, item 7).
const OPENING = '<header class="ds-open"><div class="ds-open-label">Wednesday 25 November</div><h1 class="ds-page-title ds-open-title">Good morning, Sam</h1><p class="ds-open-line">Two things need you today.</p><div class="ds-open-act"><button class="ds-btn ds-btn--primary">Start my daily plan</button></div></header>';
const CARD = '<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">What needs you</h2><a class="ds-more ds-more--small" href="#"><span>View all</span></a></div><div class="ds-li"><span class="ds-li-name">Sign your coaching agreement</span><span class="ds-li-value">Fri 27 Nov</span></div><div class="ds-li"><span class="ds-li-name">Prepare for tomorrow’s session</span><span class="ds-li-value">~2 minutes</span></div></section>';
const CONTROLS = '<div style="display:flex;gap:12px;align-items:center"><button class="ds-btn ds-btn--outline">Today</button><div class="ds-count"><button aria-label="Less">−</button><span>7</span><button aria-label="More">+</button></div><div class="ds-seg ds-seg--equal" role="group" aria-label="Late"><button class="ds-seg-btn" aria-pressed="false">No</button><button class="ds-seg-btn" aria-pressed="true">Yes</button></div></div>';

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
  // The name grows to fill its row since walk item 17 (27 Nov), so the fault is a name that doesn't, packed to the left.
  r = await check(list, { extra: '.ui-root .ds-li.ds-li--go { justify-content: flex-start; } .ui-root .ds-li.ds-li--go > .ds-li-name { flex: none; }' });
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
    r = await check(`${PHEAD('Lead well')}<button class="ds-btn ds-btn--outline" style="position:fixed;left:16px;top:16px;z-index:10" aria-label="Menu">≡</button>`, { width, extra: '.ui-root { padding: 0 !important; }' });
    assert.match(r.problems.join('; '), /overlap: button.ds-btn .* is drawn over the menu's crosshair/, `${width}`);
  }
});

test('overlap (Stage C): a row scrolled under the header, with a full-screen panel over both, is not drawn over the crosshair', async () => {
  const ROW = '<button class="ds-li" style="position:fixed;left:8px;top:12px;width:300px;height:56px;z-index:1">Sign your coaching agreement</button>';
  const PANEL = '<div style="position:fixed;inset:0;z-index:20;background:var(--bg)"><button class="ds-btn ds-btn--outline" style="margin:200px 20px">Send it</button></div>';
  const lift = '.ui-root { padding: 0 !important; } .ui-root .hdr-frame { position: relative; z-index: 5; background: var(--bg); }';
  let r = await check(`${PHEAD('Lead well')}${ROW}`, { width: 390, extra: lift });
  assert.ok(!rules(r).includes('overlap'), `under the header: ${r.problems.join('; ')}`);
  r = await check(`${PHEAD('Lead well')}${ROW}${PANEL}`, { width: 390, extra: lift });
  assert.ok(!rules(r).includes('overlap'), `under a panel: ${r.problems.join('; ')}`);
  // The same row lifted above the header is drawn over the crosshair and still fails.
  r = await check(`${PHEAD('Lead well')}${ROW.replace('z-index:1', 'z-index:9')}`, { width: 390, extra: lift });
  assert.match(r.problems.join('; '), /overlap: button.ds-li .* is drawn over the menu's crosshair/);
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
  // On a laptop there is no box (walk item 5, 27 Nov): frame.css hides it, and one drawn there fails.
  let r = await check(PHEAD('Lead well'), { width: 1280 });
  assert.ok(!rules(r).includes('mission'), r.problems.join('; '));
  r = await check(PHEAD('Lead well'), { width: 1280, extra: '.ui-root .hdr-frame .hdr-mbox:not(#_):not(#_) { display: inline-flex; }' });
  assert.match(r.problems.join('; '), /mission: a My Mission box is drawn in the laptop header/, r.problems.join('; '));
});

// ------------------------------------------------------------------ Tim's walk fixes (27 Nov)
const MLINE = (mission, more = '') => `<div class="ds-frame"><div class="ds-frame-main"><header class="ds-open ds-open--mission"><div class="ds-open-label">Friday 27 November</div><h1 class="ds-page-title ds-open-title">Good morning, Sam</h1><a class="ds-mline${mission ? '' : ' ds-mline--none'}" href="#" aria-label="My Mission"${more}><span class="ds-mline-k">My Mission</span><span class="ds-mline-gap" aria-hidden="true">\u00a0\u00a0</span><span class="ds-mline-v">${mission || 'Add your Mission when you’re ready'}</span></a><p class="ds-open-line">Two things need you today.</p></header></div></div>`;

test('mission (walk item 5): the laptop line under the title passes, light and dark; a long Mission ends in "…" on one line', async () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [1024, 1280, 1440]) {
      const r = await check(MLINE('Lead well and stay well'), { width, theme });
      assert.ok(!has(r, 'mission'), `${width} ${theme}: ${all(r)}`);
    }
    const long = await check(MLINE('To lead with clarity and calm, '.repeat(12)), { width: 1280, theme });
    assert.ok(!has(long, 'mission'), all(long));
  }
  const geom = await tab.evaluate(() => {
    const ml = document.querySelector('.ds-mline');
    const t = document.querySelector('.ds-open-title').getBoundingClientRect();
    const b = ml.getBoundingClientRect();
    return { gapAbove: b.top - t.bottom, h: b.height, fs: getComputedStyle(ml).fontSize, after: getComputedStyle(ml, '::after').height, ell: getComputedStyle(ml.querySelector('.ds-mline-v')).textOverflow };
  });
  assert.equal(geom.fs, '13px');
  assert.equal(geom.after, '44px');
  assert.equal(geom.ell, 'ellipsis');
});

test('mission (walk item 5): the line under 1024px, one off the title, wrapping, or without its gap or hairline fails', async () => {
  let r = await check(MLINE('Lead well'), { width: 1280, extra: '.ui-root .ds-mline { display: flex !important; }' });
  assert.ok(!has(r, 'mission'), all(r));
  r = await check(MLINE('Lead well'), { width: 768, extra: '.ui-root .ds-mline { display: flex !important; }' });
  assert.match(all(r), /mission: the laptop's Mission line shows under 1024px/);
  r = await check(MLINE('Lead well'), { width: 1280, extra: '.ui-root .ds-mline { border-bottom: 0 !important; }' });
  assert.match(all(r), /mission: the Mission line has no hairline under it/);
  r = await check(MLINE('Lead well'), { width: 1280, extra: '.ui-root .ds-mline { margin-bottom: 8px !important; }' });
  assert.match(all(r), /mission: 8px from the Mission line's hairline/);
  r = await check(MLINE('To lead with clarity and calm, '.repeat(12)), { width: 1280, extra: '.ui-root .ds-mline, .ui-root .ds-mline-v { white-space: normal !important; }' });
  assert.match(all(r), /mission: the Mission line wraps/);
  r = await check(MLINE('Lead well'), { width: 1280, extra: '.ui-root .ds-mline-k, .ui-root .ds-mline-gap { color: var(--text) !important; }' });
  assert.match(all(r), /mission: "My Mission" and the Mission are the same colour/);
});

const ADDCARD = (add) => `<section class="ds-card" style="max-width:520px"><div class="ds-card-head"><h2 class="ds-label">Today</h2>${add}</div><div class="ds-li ds-li--go"><span class="ds-li-name">Daily plan</span><span class="ds-li-value">~4 minutes</span></div><div class="ds-li"><span class="ds-li-name">Daily review</span><span class="ds-li-value">This evening</span></div></section>`;
const SQUARE = (label = 'Add a to-do') => `<button type="button" class="ds-addsq ds-addlink" aria-label="${label}"><span class="ds-addsq-plus" aria-hidden="true"></span></button>`;
const WORDS = '<button type="button" class="ds-addrow ds-addlink" aria-label="Add a to-do"><span class="ds-addrow-mark" aria-hidden="true"></span><span class="ds-addrow-words">Add</span></button>';

test('add (walk item 4): the square in a card’s head passes, laptop and phone, light and dark; its size, corners, level and tap measured', async () => {
  for (const phone of [false, true]) {
    for (const theme of ['light', 'dark']) {
      const r = await check(ADDCARD(SQUARE()), { phone, theme });
      assert.deepEqual(r.problems, [], `${phone ? 'phone' : 'laptop'} ${theme}: ${all(r)}`);
    }
  }
  const m = await tab.evaluate(() => {
    const sq = document.querySelector('.ds-addsq').getBoundingClientRect();
    const lab = document.querySelector('.ds-label').getBoundingClientRect();
    const head = document.querySelector('.ds-card-head').getBoundingClientRect();
    return { w: sq.width, h: sq.height, mid: (sq.top + sq.height / 2) - (lab.top + lab.height / 2), headH: head.height, labH: lab.height };
  });
  assert.equal(m.w, 32);
  assert.equal(m.h, 32);
  assert.ok(Math.abs(m.mid) <= 1, `off the label's middle by ${m.mid}`);
  assert.ok(m.headH - m.labH < 1, `the head grew by ${m.headH - m.labH}px`);
});

test('add (walk item 4): "+ Add" as words, a square with an outline, 12px corners or no name for what it adds fails', async () => {
  let r = await check(ADDCARD(WORDS));
  assert.match(all(r), /add: "\+ Add" in the head of "Today" is drawn as words/i);
  r = await check(ADDCARD(SQUARE()), { extra: '.ui-root .ds-addsq:not(#_):not(#_) { border: 1px solid var(--field-line); border-radius: 12px; }' });
  assert.match(all(r), /add: the "\+ Add" square of "Today" has 12px corners/i);
  assert.match(all(r), /add: the "\+ Add" square of "Today" has an outline/i);
  r = await check(ADDCARD(SQUARE('Add')));
  assert.match(all(r), /add: the "\+ Add" square of "Today" isn't named by what it adds/i);
  r = await check(ADDCARD(SQUARE()), { extra: '.ui-root .ds-card-head .ds-addsq:not(#_):not(#_) { margin-block: 0 -24px; }' });
  assert.match(all(r), /add: the "\+ Add" square of "Today" isn't level with the label/i);
});

const COLS = (main) => `<div style="width:${main}px"><div class="ds-cols ds-cols--needs-first"><div><section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Log today</h2></div><div class="ds-li"><span class="ds-li-name">Performance score this week</span><span class="ds-li-value">40%, usually 66 to 86%</span></div></section></div><div><section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">What needs you</h2></div><div class="ds-li"><span class="ds-li-name">Sign your agreement</span><span class="ds-li-value">Thu 26 Nov</span></div></section></div></div></div>`;

test('squeeze (walk item 17): the columns stack under a 560px main column, in the phone order, at 1024 to 1280', async () => {
  for (const width of [1024, 1100, 1180, 1280]) {
    for (const theme of ['light', 'dark']) {
      // The holder as Home's page is between the frame's padding: the window less the menu column and padding.
      const r = await check(COLS(width - 330), { width, theme });
      assert.ok(!has(r, 'squeeze'), `${width} ${theme}: ${all(r)}`);
    }
  }
  await check(COLS(700), { width: 1280 });
  const stacked = await tab.evaluate(() => { const [a, b] = [...document.querySelectorAll('.ds-cols > div')].map((d) => d.getBoundingClientRect()); return { aboveIsNeeds: b.bottom <= a.top + 1, sameLeft: Math.abs(a.left - b.left) < 1 }; });
  assert.deepEqual(stacked, { aboveIsNeeds: true, sameLeft: true });
  await check(COLS(1000), { width: 1280 });
  const side = await tab.evaluate(() => { const [a, b] = [...document.querySelectorAll('.ds-cols > div')].map((d) => d.getBoundingClientRect()); return a.right <= b.left && a.width >= 560; });
  assert.ok(side, 'two columns with a main column of at least 560px');
});

test('squeeze (walk item 17): a forced 340px side column squeezing the main one fails; a row name narrower than its word fails; the value moves under instead', async () => {
  let r = await check(COLS(800), { width: 1280, extra: '.ui-root .ds-cols:not(#_) { display: grid !important; grid-template-columns: minmax(0, 1fr) 340px !important; }' });
  assert.match(all(r), /squeeze: two columns with the main one \d+px wide/);
  r = await check('<section class="ds-card" style="width:200px"><div class="ds-li"><span class="ds-li-name" style="flex:0 0 40px;min-width:0;overflow-wrap:anywhere">Performance score</span><span class="ds-li-value">40%, usually 66 to 86%</span></div></section>');
  assert.match(all(r), /squeeze: "Performance score" is \d+px wide, narrower than its word "Performance"/);
  r = await check('<section class="ds-card" style="width:240px"><div class="ds-li"><span class="ds-li-name">Performance score this week</span><span class="ds-li-value">40%, usually 66 to 86%</span></div></section>');
  assert.ok(!has(r, 'squeeze'), all(r));
  const moved = await tab.evaluate(() => { const n = document.querySelector('.ds-li-name').getBoundingClientRect(); const v = document.querySelector('.ds-li-value').getBoundingClientRect(); return v.top >= n.bottom - 1; });
  assert.ok(moved, 'the value sits under the name');
});

// ------------------------------------------------------------------ Tim's walk of Stage B (26 Nov; WALK-B.md)
const has = (r, rule) => rules(r).includes(rule);
const all = (r) => r.problems.join('; ');
const year = new Date().getFullYear();

test('who-line (walk B, item 5): a page line saying who can see it fails; the eye beside the title and a plain line pass', async () => {
  let r = await check('<header class="ds-open"><h1 class="ds-page-title ds-open-title">To-dos</h1><p class="ds-open-line">Everything you plan to do, by day. Only you can see it.</p></header>');
  assert.match(all(r), /who-line: "Everything you plan to do, by day\./);
  r = await check('<header class="ds-open"><h1 class="ds-page-title ds-open-title">To-dos</h1><p class="ds-open-line">Everything you plan to do, by day.</p></header>');
  assert.ok(!has(r, 'who-line'), all(r));
});

test('who-line, widened (FX7): "who can read", "sees the same" and "shared with" fail; a line about the page passes', async () => {
  const open = (line) => `<header class="ds-open"><h1 class="ds-page-title ds-open-title">Board</h1><p class="ds-open-line">${line}</p></header>`;
  for (const line of [
    'Shared with your associates, who can read it but not change it.',
    'Imogen sees the same balance and every entry in their portal.',
    'They see the same balance in their portal.',
    'Your team’s plan, shared with everyone in it.',
    'Notes who can see them is up to you.',
  ]) assert.ok(has(await check(open(line)), 'who-line'), line);
  for (const line of ['The cards on this board move through it stage by stage.', 'Each entry here comes off the block, and the balance shows what’s left.', 'Here is what you shared last week.']) {
    assert.ok(!has(await check(open(line)), 'who-line'), line);
  }
});

test('label-wrap (walk B, item 9): a card label on two lines fails; on one line it passes', async () => {
  const card = (label, w) => `<section class="ds-card" style="width:${w}px"><div class="ds-card-head"><h2 class="ds-label">${label}</h2></div><div class="ds-fig">£5,605</div></section>`;
  let r = await check(card('Income in November so far', 180));
  assert.match(all(r), /label-wrap: the label "Income in November so far" wraps onto \d+ lines/i);
  r = await check(card('This month so far', 260));
  assert.ok(!has(r, 'label-wrap'), all(r));
});

const TABS = '<div role="tablist" aria-label="To-dos" style="display:flex;gap:16px"><button role="tab" class="ds-tab" aria-selected="true">Today</button><button role="tab" class="ds-tab" aria-selected="false">Upcoming</button></div>';
const SEG = (cls = 'ds-seg ds-seg--equal', style = '') => `<div class="${cls}" role="group" aria-label="Show as" style="${style}"><button class="ds-seg-btn" aria-pressed="true">List</button><button class="ds-seg-btn" aria-pressed="false">Calendar</button></div>`;
test('switch (walk B, item 7): unequal parts, or stretched across a row it shares, fail; equal parts sized to the words pass', async () => {
  for (const phone of [false, true]) {
    const bar = (seg) => `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px">${TABS}${seg}</div>`;
    let r = await check(bar(SEG()), { phone });
    assert.ok(!has(r, 'switch'), `equal ${phone}: ${all(r)}`);
    r = await check(bar(SEG('ds-seg')), { phone });
    assert.match(all(r), /switch: the joined switch "List Calendar" has unequal parts/, `${phone}`);
    // On a phone the switch wraps under the tabs (its basis the whole line, now that its parts keep the reference's
    // 16px sides and would otherwise fit beside them), the only control on its line, where it may span the column.
    r = await check(bar(SEG('ds-seg ds-seg--equal', phone ? 'flex:1 1 100%' : 'flex:1 1 auto')), { phone });
    if (phone) assert.ok(!has(r, 'switch'), `alone on its line: ${all(r)}`);
    else assert.match(all(r), /switch: the joined switch "List Calendar" is \d+px wide, stretched past its parts/);
  }
});

test('tap (walk B, items 6 and 8): a link or a fold under 44px fails; a 44px ::after or a 44px box passes; a link in a sentence is left out', async () => {
  const link = (style, after = '') => `<style>.t-link{all:unset;cursor:pointer;position:relative;font-size:13px;line-height:20px;text-decoration:underline;${style}} ${after}</style><div><button type="button" class="t-link">Mark as done</button></div>`;
  let r = await check(link(''), { phone: true });
  assert.match(all(r), /tap: the link "Mark as done" has a 20px tap area/);
  r = await check(link('', '.t-link::after{content:"";position:absolute;left:0;right:0;top:-12px;height:44px}'), { phone: true });
  assert.ok(!has(r, 'tap'), all(r));
  r = await check(link('display:inline-flex;align-items:center;min-height:44px'), { phone: true });
  assert.ok(!has(r, 'tap'), all(r));
  r = await check('<section><h2 class="cc-fold-title"><button type="button" aria-expanded="false" aria-controls="x" style="all:unset">Done</button></h2><div id="x" hidden></div></section>', { phone: true });
  assert.match(all(r), /tap: the fold "Done" has a \d+px tap area/);
  r = await check('<p>Read <a href="#">the terms</a> before you sign, then come back here to carry on.</p>', { phone: true });
  assert.ok(!has(r, 'tap'), all(r));
});

test('bare-zero in a row (walk B, item 9): a row’s value of £0 or £0/month fails; a sentence passes', async () => {
  const row = (v) => `<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Your targets</h2></div><div class="ds-li"><span class="ds-li-name">This year, from 1 May<small class="ds-li-sub">${v[1]}</small></span>${v[0] ? `<span class="ds-li-value">${v[0]}</span>` : ''}</div></section>`;
  for (const v of ['£0', '£0/month', '0%']) assert.match(all(await check(row([v, 'So far']))), /bare-zero: a row's value reads a bare/, v);
  assert.ok(!has(await check(row(['', 'Nothing settled yet, and no target set.'])), 'bare-zero'));
});

test('breathe (walk B, item 2): Breathe over a fixed bar’s button fails; lifted over the bar it passes', async () => {
  const page = '<div style="position:fixed;left:0;right:0;bottom:0;display:flex;gap:12px;padding:12px 20px;background:var(--bg)"><button class="ds-btn ds-btn--primary" style="flex:1">Save journal</button><button class="ds-btn ds-btn--outline" style="flex:1">Save as draft</button></div><div class="ds-orb ds-orb--fixed"><button type="button" class="ds-breathe">Breathe</button></div>';
  let r = await check(page, { phone: true });
  assert.match(all(r), /breathe: Breathe is drawn over "Save as draft" in a fixed bar/);
  r = await check(page, { phone: true, extra: '.ui-root .ds-orb--fixed { --bottom-bar-h: 72px; }' });
  assert.ok(!has(r, 'breathe'), all(r));
});

test('breathe (FX8): a side panel drawn over Breathe hides it, so its foot’s button passes; Breathe over the panel fails', async () => {
  const panel = (z) => `<div role="dialog" aria-modal="true" style="position:fixed;top:0;right:0;bottom:0;width:390px;background:var(--bg);z-index:${z};display:flex;flex-direction:column;justify-content:flex-end"><div style="display:flex;padding:12px 20px"><button class="ds-btn ds-btn--primary" style="flex:1">Done</button></div></div>`;
  const orb = '<div class="ds-orb ds-orb--fixed" style="z-index:100"><button type="button" class="ds-breathe">Breathe</button></div>';
  let r = await check(panel(5200) + orb, { phone: true });
  assert.ok(!has(r, 'breathe'), all(r));
  r = await check(panel(10) + orb, { phone: true });
  assert.match(all(r), /breathe: Breathe is drawn over "Done" in a fixed bar/);
});

test('year (walk B, item 4): a date this year with its year fails; without it, or last year’s, passes', async () => {
  assert.match(all(await check(`<div class="ds-open-label">Thursday 26 November ${year}</div>`)), new RegExp(`year: "26 November ${year}"`));
  assert.ok(!has(await check('<div class="ds-open-label">Thursday 26 November</div>'), 'year'));
  assert.ok(!has(await check(`<div class="ds-open-label">Wednesday 26 November ${year - 1}</div>`), 'year'));
});

test('focus (walk B, item 1): a tool’s address with the menu’s crosshair, My Mission or Breathe showing fails; in focus mode it passes', async () => {
  const header = '<div class="hdr-frame"><button type="button" class="ds-mbtn" aria-label="Menu"><svg class="ds-bold-cross" viewBox="0 0 10 10" width="20" height="20"><path d="M0 5h10M5 0v10" stroke="currentColor"/></svg></button></div>';
  const tool = '<div class="ds-tool"><div class="ds-tool-bar"><button type="button" class="ds-tool-x" aria-label="Close and save my place"><span class="ds-x"></span></button></div></div>';
  let r = await check(header + tool, { phone: true, route: '/daily-journal' });
  assert.match(all(r), /focus: the tool at \/daily-journal isn't in focus mode: \.ds-mbtn shows/);
  r = await check(tool, { phone: true, route: '/daily-journal' });
  assert.ok(!has(r, 'focus'), all(r));
  r = await check(header, { phone: true, route: '/daily-journals' });
  assert.ok(!has(r, 'focus'), all(r));
});

test('duplicate (walk B, item 10): one action offered twice fails; each row’s own action passes', async () => {
  let r = await check('<p>No leads yet.</p><button class="ds-more ds-more--bare">Import from a spreadsheet</button><div class="cc-pfoot"><button class="ds-more ds-more--bare">Import from a spreadsheet</button></div>');
  assert.match(all(r), /duplicate: "Import from a spreadsheet" is offered 2 times/);
  r = await check('<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Needs you</h2></div><div class="ds-li"><span class="ds-li-name">Invoice 1031</span><button class="ds-more ds-more--bare">View the invoice</button></div><div class="ds-li"><span class="ds-li-name">Invoice 1032</span><button class="ds-more ds-more--bare">View the invoice</button></div></section>');
  assert.ok(!has(r, 'duplicate'), all(r));
});

test('card with no label (walk B, item 11): its first row starts at the padding; pushed down it fails', async () => {
  const card = (style = '') => `<section class="ds-card"><a class="ds-li ds-li--go" href="#a" style="${style}"><span class="ds-li-name">Your details</span></a><a class="ds-li ds-li--go" href="#b"><span class="ds-li-name">Booking</span></a></section>`;
  for (const phone of [false, true]) {
    let r = await check(card(), { phone });
    assert.ok(!has(r, 'card'), `${phone}: ${all(r)}`);
    r = await check(card('padding-top:16px'), { phone });
    assert.match(all(r), /card: the first row of a card with no label, "Your details", starts \d+px from the card's top/, `${phone}`);
  }
});

// The UI tester's findings (FX2, 26 Nov).
test('focus (F1): in focus mode the next-session strip or the coach’s Search showing fails, on any address; hidden it passes', async () => {
  const frame = (inner) => `<div class="ui-root ds-frame-root ds-frame-root--focus"><div class="ds-frame"><div class="ds-frame-main">${inner}<div class="ds-tool"><h1 class="ds-q ds-tool-q">Who is paying?</h1></div></div></div></div>`;
  const strip = '<div class="cc-callbar" style="display:block"><span>Elena Vasquez is starting now</span></div>';
  let r = await check(frame(strip), { route: '/coach/agreements/x/edit' });
  assert.ok(rules(r).includes('focus'), r.problems.join('; '));
  r = await check(frame(strip.replace('display:block', 'display:none')), { route: '/coach/agreements/x/edit' });
  assert.ok(!rules(r).includes('focus'), r.problems.join('; '));
});

test('title-wrap (F12): a title kept off half its column wraps and fails; with its whole column, one line, it passes', async () => {
  const title = (pad) => `<header class="ds-open" style="width:760px"><h1 class="ds-page-title ds-open-title" style="padding-right:${pad}px">Strategic alignment health check</h1></header>`;
  let r = await check(title(344));
  assert.ok(rules(r).includes('title-wrap'), r.problems.join('; '));
  r = await check(title(0));
  assert.ok(!rules(r).includes('title-wrap'), r.problems.join('; '));
});

test('edge (F15): at 768px an opening 20px in passes; centred in the window it fails', async () => {
  const page = (style) => `<div class="ds-frame-root"><div class="ds-frame"><div class="ds-frame-main" style="padding:0"><div style="${style}"><header class="ds-open"><h1 class="ds-page-title ds-open-title">Peak moments</h1></header></div></div></div></div>`;
  const extra = '.ui-root[style]{padding:0!important}';
  let r = await check(page('padding:0 20px'), { width: 768, extra });
  assert.ok(!rules(r).includes('edge'), r.problems.join('; '));
  r = await check(page('max-width:696px;margin:0 auto;padding:0 32px'), { width: 768, extra });
  assert.ok(rules(r).includes('edge'), r.problems.join('; '));
});

test('progress (P15): a progress line empty at step 1 fails; a short filled start passes', async () => {
  const line = (pct) => `<div class="ds-tool" style="width:560px"><div class="ds-tool-prog"><i style="width:${pct}%"></i></div></div>`;
  let r = await check(line(0));
  assert.ok(rules(r).includes('progress'), r.problems.join('; '));
  r = await check(line(11));
  assert.ok(!rules(r).includes('progress'), r.problems.join('; '));
});

test('bare-zero (F8): "0 minutes" as a headline figure fails; a sentence instead passes', async () => {
  let r = await check('<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Time credit left</h2></div><div class="ds-fig">0 minutes</div></section>');
  assert.ok(rules(r).includes('bare-zero'), r.problems.join('; '));
  r = await check('<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Time credit left</h2></div><p class="ds-fig-empty">No time credit is set for this engagement yet.</p></section>');
  assert.ok(!rules(r).includes('bare-zero'), r.problems.join('; '));
});

test('duplicate: each card’s own action ("Show as a table" under two charts) passes; twice in one card fails', async () => {
  const card = (n) => `<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Chart ${n}</h2></div><button class="ds-more ds-more--bare">Show as a table</button></section>`;
  let r = await check(card(1) + card(2));
  assert.ok(!rules(r).includes('duplicate'), r.problems.join('; '));
  r = await check('<section class="ds-card"><div class="ds-card-head"><h2 class="ds-label">Chart</h2></div><button class="ds-more ds-more--bare">Show as a table</button><button class="ds-more ds-more--bare">Show as a table</button></section>');
  assert.ok(rules(r).includes('duplicate'), r.problems.join('; '));
});

test('duplicate (FX8): each objective’s own answers and date, and each carried row’s answers, pass; an action twice still fails', async () => {
  const answers = (n) => `<div class="ds-rows" role="radiogroup" aria-label="How will you track it?"><button role="radio" aria-checked="${n === 1}" class="ds-row">I’ll track a number</button><button role="radio" aria-checked="${n !== 1}" class="ds-row">I’ll track a milestone</button></div>`;
  const objed = (n) => `<div class="ds-objed">${answers(n)}<div class="ds-objed-date"><button type="button" class="ds-dd">14 Jun 2027</button></div></div>`;
  let r = await check(objed(1) + objed(2) + objed(3));
  assert.ok(!has(r, 'duplicate'), all(r));
  const carry = (name) => `<div class="ds-carry-row"><span class="ds-carry-name">${name}</span><div class="ds-seg" role="radiogroup" aria-label="What happens to ${name}?"><button role="radio" aria-checked="true" class="ds-seg-btn">Keep it as it is</button><button role="radio" aria-checked="false" class="ds-seg-btn">Change it</button></div></div>`;
  r = await check(carry('Sleep 7 hours') + carry('Run three times a week'));
  assert.ok(!has(r, 'duplicate'), all(r));
  r = await check(`${objed(1)}<button class="ds-more ds-more--bare">Add another objective</button><button class="ds-more ds-more--bare">Add another objective</button>`);
  assert.match(all(r), /duplicate: "Add another objective" is offered 2 times/);
});

test('coral-fill (Tim, 26 Nov): a mistake in a coral or soft coral box fails, light and dark; ErrorMessage’s coral line passes', async () => {
  for (const theme of ['light', 'dark']) {
    let r = await check('<div class="ds-error" role="alert" style="background:var(--error);padding:12px">That didn’t save.</div>', { theme });
    assert.ok(rules(r).includes('coral-fill'), `${theme}: ${r.problems.join('; ')}`);
    r = await check('<div class="ds-error" role="alert" style="background:var(--coral-soft-tint);padding:12px">That didn’t save.</div>', { theme });
    assert.ok(rules(r).includes('coral-fill'), `${theme} tint: ${r.problems.join('; ')}`);
    r = await check('<div class="ds-error" role="alert"><span class="ds-error-mark" aria-hidden="true">!</span><span>That didn’t save. Check your connection and try again.</span></div>', { theme });
    assert.ok(!rules(r).includes('coral-fill') && !rules(r).includes('coral'), `${theme} line: ${r.problems.join('; ')}`);
  }
});
