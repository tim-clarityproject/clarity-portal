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
const STYLES = ['styles/tokens.css', 'styles/buttons.css', 'components/design/design.css', 'components/design/blocks.css'].map(css);
const FONTS = "@font-face{font-family:'Nekst';src:local('Arial')}";

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

async function check(body, { phone = false, theme = 'light', extra = '' } = {}) {
  await tab.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1280, height: 800 });
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
