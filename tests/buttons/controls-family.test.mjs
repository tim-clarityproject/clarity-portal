// Brought to the 25 Nov design reference (polish 1): the joined switch with a 1px line and 12px corners,
// 12px corners on every control, a 52 by 32 switch.
// The lasting controls check (Tim, 22 Nov; tests/buttons/buttons-check.mjs
// controlsFamily) read on small pages of its own, so it is known to fail
// what it should: a round pill toggle, Nekst inside a control, a control of
// the wrong height or corners, a switch that isn't 40 by 24 and mint when
// on, and a second coral button; and to pass the gliding switch, the
// quiet precision switch and one coral button.
//
//   node --import ./tests/scores/register.mjs --test tests/buttons/controls-family.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { controlsFamily } from './buttons-check.mjs';

// Only the parts the check reads, with the design's own values written out.
const STYLE = `
  .ui-root { --coral: #FF6F5C; --coral-hover: #FF8A7A; --mint: #5FEFBB; --mint-text: #5FEFBB; --good: #5FEFBB;
    background: #000; color: #fff; font-family: 'DM Sans', sans-serif; padding: 24px; }
  :where(.ui-root button) { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    font-size: 16px; font-family: 'DM Sans', sans-serif; }
  .btn { height: 40px; padding: 0 18px; border-radius: 12px; box-shadow: inset 0 0 0 1px #262626; }
  .main { height: 40px; padding: 0 20px; border-radius: 12px; background: #FF6F5C; color: #000; }
  .glide { display: inline-flex; border-radius: 12px; border: 1px solid #262626; height: 40px; box-sizing: border-box; overflow: hidden; }
  .glide button { height: 38px; padding: 0 16px; }
  .glide button[aria-pressed=true], .glide button[aria-checked=true] { background: #fff; color: #000; }
  .grey { display: inline-flex; padding: 3px; border-radius: 8px; background: #111110; height: 40px; box-sizing: border-box; }
  .grey button { height: 34px; padding: 0 16px; border-radius: 6px; }
  .pilltoggle { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid #636362; height: 40px; box-sizing: border-box; }
  .pilltoggle button { height: 32px; padding: 0 16px; border-radius: 999px; }
  .pilltoggle button[aria-pressed=true] { background: #fff; color: #000; }
  .sw { width: 52px; height: 32px; border-radius: 16px; background: #262626; }
  .sw[aria-checked=true] { background: #5FEFBB; }
`;
const page = (body) => `<!doctype html><html><head><style>${STYLE}</style></head><body><div class="ui-root">${body}</div></body></html>`;
const GLIDE = '<div class="glide" role="group" aria-label="Show"><button aria-pressed="true">Board</button><button aria-pressed="false">List</button></div>';

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => { await browser?.close(); });

async function check(body, { phone = false } = {}) {
  await tab.setContent(page(body));
  return tab.evaluate(controlsFamily, { phone, scale: 1 });
}

test('the joined switch, an outlined button, one main button and the switch pass', async () => {
  const r = await check(`${GLIDE}<button class="btn">Edit</button><button class="main">Save my plan</button>
    <button class="sw" role="switch" aria-checked="true" aria-label="Weekends"></button><button class="sw" role="switch" aria-checked="false" aria-label="Family"></button>`);
  assert.deepEqual(r.problems, []);
  assert.equal(r.toggles, 1);
});

test('the old soft grey track (the gliding switch of 22 Nov) fails', async () => {
  const r = await check('<div class="grey" role="group" aria-label="Show"><button aria-pressed="true">Board</button><button aria-pressed="false">List</button></div>');
  assert.match(r.problems.join('; '), /no line round it/);
});

test('a round pill toggle fails', async () => {
  const r = await check('<div class="pilltoggle" role="group" aria-label="Show"><button aria-pressed="true">Board</button><button aria-pressed="false">List</button></div>');
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /not the joined switch: round ends on its track/);
  assert.match(r.problems[0], /not the joined switch/);
});

test('the retired .seg fails by its name', async () => {
  const r = await check('<div class="seg"><button aria-pressed="true" class="btn">Today</button></div>');
  assert.ok(r.problems.some((p) => /retired round pill toggle/.test(p)), r.problems.join('; '));
});

test('a toggle whose chosen option is filled coral, or in Nekst, fails', async () => {
  const r = await check(`<div class="glide" role="radiogroup" aria-label="How much"><button role="radio" aria-checked="true" style="background:#FF6F5C;font-family:Nekst">Low</button><button role="radio" aria-checked="false">High</button></div>`);
  assert.match(r.problems.join('; '), /chosen option filled coral/);
  assert.match(r.problems.join('; '), /Nekst/);
});

test('a toggle of the wrong height fails, and is 44px on a phone', async () => {
  const r = await check(GLIDE, { phone: true });
  assert.match(r.problems.join('; '), /40px high, not 44/);
});

test('Nekst inside a button fails', async () => {
  const r = await check('<button class="btn" style="font-family:Nekst;text-transform:uppercase">Start</button>');
  assert.match(r.problems.join('; '), /"Start": Nekst inside a control/);
});

test('a button of the wrong height or corners fails', async () => {
  const r = await check('<button class="btn" style="height:34px">Edit</button><button class="btn" style="border-radius:14px">Delete</button>');
  const all = r.problems.join('; ');
  assert.match(all, /"Edit": 34px high, not 40/);
  assert.match(all, /"Delete": corners 14px, not 12px/);
});

test('a pill inside a control fails', async () => {
  const r = await check('<button class="btn" style="border-radius:999px">Add to calendar</button>');
  assert.match(r.problems.join('; '), /a pill \(round ends\)/);
});

test('a second coral button fails, whatever its class', async () => {
  const r = await check('<button class="main">Save my plan</button><a href="#" class="main" style="display:inline-flex;align-items:center">Book a call</a>');
  assert.match(r.problems.join('; '), /2 coral buttons on one screen/);
});

test('a switch that is not 52 by 32, or not mint when on, fails', async () => {
  const r = await check('<button class="sw" role="switch" aria-checked="true" aria-label="Small" style="width:40px;height:24px"></button><button class="sw" role="switch" aria-checked="true" aria-label="Coral" style="background:#FF6F5C"></button>');
  const all = r.problems.join('; ');
  assert.match(all, /"Small": 40 by 24, not 52 by 32/);
  assert.match(all, /"Coral": on, but rgb\(255, 111, 92\), not mint, coral/);
});

test('underlined tabs are left to themselves', async () => {
  const r = await check('<div role="tablist"><button role="tab" aria-selected="true" style="border-bottom:2px solid #fff;height:44px">Today</button><button role="tab" aria-selected="false" style="height:44px">Upcoming</button></div>');
  assert.deepEqual(r.problems, []);
});

test('a tab drawn as a round pill fails', async () => {
  const r = await check('<div role="tablist" style="border:1px solid #636362;border-radius:999px;display:flex;padding:3px"><button role="tab" aria-selected="true" style="border-radius:999px;background:#FF6F5C;height:38px;padding:0 16px">Terms</button><button role="tab" aria-selected="false" style="border-radius:999px;height:38px;padding:0 16px">Privacy</button></div>');
  assert.match(r.problems.join('; '), /a round pill, not an underlined tab/);
  assert.match(r.problems.join('; '), /a round pill strip/);
});

test('an option running out of its track fails (five words that should wrap; UI tester, 22 Nov)', async () => {
  const r = await check(`<div class="glide" role="radiogroup" aria-label="Focus" style="width:300px;display:flex;flex-wrap:nowrap">${['Poor', 'Fair', 'Good', 'Very good', 'Excellent'].map((w, i) => `<button role="radio" aria-checked="${i === 0}" style="flex:none">${w}</button>`).join('')}</div>`);
  assert.match(r.problems.join('; '), /runs out of its track/);
});
