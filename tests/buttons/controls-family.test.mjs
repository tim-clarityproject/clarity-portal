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
  .btn { height: 40px; padding: 0 16px; border-radius: 8px; box-shadow: inset 0 0 0 1px #3C3C3B; }
  .main { height: 40px; padding: 0 16px; border-radius: 8px; background: #FF6F5C; color: #000; }
  .glide { display: inline-flex; padding: 3px; border-radius: 8px; background: #111110; height: 40px; box-sizing: border-box; }
  .glide button { height: 34px; padding: 0 16px; border-radius: 6px; }
  .glide button[aria-pressed=true] { background: #262626; }
  .pilltoggle { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid #636362; height: 40px; box-sizing: border-box; }
  .pilltoggle button { height: 32px; padding: 0 16px; border-radius: 999px; }
  .pilltoggle button[aria-pressed=true] { background: #fff; color: #000; }
  .sw { width: 40px; height: 24px; border-radius: 999px; background: #3C3C3B; }
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

test('the gliding switch, an outlined button, one coral button and the switch pass', async () => {
  const r = await check(`${GLIDE}<button class="btn">Edit</button><button class="main">Save my plan</button>
    <button class="sw" role="switch" aria-checked="true" aria-label="Weekends"></button><button class="sw" role="switch" aria-checked="false" aria-label="Family"></button>`);
  assert.deepEqual(r.problems, []);
  assert.equal(r.toggles, 1);
});

test('a round pill toggle fails', async () => {
  const r = await check('<div class="pilltoggle" role="group" aria-label="Show"><button aria-pressed="true">Board</button><button aria-pressed="false">List</button></div>');
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /not the gliding switch: round ends on its track/);
  assert.match(r.problems[0], /no soft grey track/);
  assert.match(r.problems[0], /an edge round its track/);
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
  assert.match(all, /"Delete": corners 14px, not 8px/);
});

test('a pill inside a control fails', async () => {
  const r = await check('<button class="btn" style="border-radius:999px">Add to calendar</button>');
  assert.match(r.problems.join('; '), /a pill \(round ends\)/);
});

test('a second coral button fails, whatever its class', async () => {
  const r = await check('<button class="main">Save my plan</button><a href="#" class="main" style="display:inline-flex;align-items:center">Book a call</a>');
  assert.match(r.problems.join('; '), /2 coral buttons on one screen/);
});

test('a switch that is not 40 by 24, or not mint when on, fails', async () => {
  const r = await check('<button class="sw" role="switch" aria-checked="true" aria-label="Big" style="width:52px;height:30px"></button><button class="sw" role="switch" aria-checked="true" aria-label="Coral" style="background:#FF6F5C"></button>');
  const all = r.problems.join('; ');
  assert.match(all, /"Big": 52 by 30, not 40 by 24/);
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
