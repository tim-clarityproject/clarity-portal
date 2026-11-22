// Back closes a full-screen panel on a phone (run 6, item 4):
// src/components/design/panelHistory.js, against a small stand-in for the
// browser's history (entries, back() arriving later as a popstate, and the
// router's own listener after ours).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeBrowser(start = 'https://portal.test/coach/clients') {
  const entries = [{ href: start, state: { idx: 0 } }];
  let at = 0;
  const listeners = [];
  const routerSaw = [];
  const win = {
    location: { get href() { return entries[at].href; } },
    history: {
      get state() { return entries[at].state; },
      pushState(state, _t, href) { entries.splice(at + 1); entries.push({ href, state }); at += 1; },
      back() { queue.push(-1); },
    },
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture: Boolean(capture) }); },
  };
  const queue = [];
  // The router listens in the bubble phase, after anything in the capture phase.
  listeners.push({ type: 'popstate', capture: false, fn: () => routerSaw.push(entries[at].href) });
  const fire = () => {
    let stopped = false;
    const e = { state: entries[at].state, stopImmediatePropagation() { stopped = true; } };
    const ordered = [...listeners.filter((l) => l.capture), ...listeners.filter((l) => !l.capture)];
    for (const l of ordered) { if (l.type !== 'popstate') continue; l.fn(e); if (stopped) break; }
  };
  return {
    win,
    entries,
    get at() { return at; },
    routerSaw,
    /** The person presses Back. */
    pressBack() { if (at > 0) { at -= 1; fire(); } },
    /** The router moves to another page. */
    navigate(href) { entries.splice(at + 1); entries.push({ href, state: { idx: entries[at].state?.idx + 1 } }); at += 1; },
    /** Lets every history.back() made here arrive. */
    async settle() { await new Promise((r) => { setTimeout(r, 5); }); while (queue.length) { queue.shift(); if (at > 0) { at -= 1; fire(); } } },
  };
}

async function load(b) {
  globalThis.window = b.win;
  return import(`../../src/components/design/panelHistory.js?case=${Math.random()}`);
}

test('Back with a panel open closes the panel and stays on the page', async () => {
  const b = fakeBrowser();
  const { pushPanelEntry, panelEntries } = await load(b);
  let closed = 0;
  pushPanelEntry(() => { closed += 1; });
  assert.equal(b.entries.length, 2);
  assert.equal(b.entries[1].href, b.entries[0].href, 'the entry keeps the same address');
  b.pressBack();
  assert.equal(closed, 1);
  assert.equal(panelEntries(), 0);
  assert.deepEqual(b.routerSaw, [], 'the router never hears of it');
});

test('Closing it any other way takes its entry away, quietly', async () => {
  const b = fakeBrowser();
  const { pushPanelEntry } = await load(b);
  let closed = 0;
  const remove = pushPanelEntry(() => { closed += 1; });
  remove();
  await b.settle();
  assert.equal(b.at, 0, 'back on the page’s own entry');
  assert.equal(closed, 0);
  assert.deepEqual(b.routerSaw, []);
  remove();
  await b.settle();
  assert.equal(b.at, 0, 'a second close does nothing');
});

test('Two panels: Back closes the top one only', async () => {
  const b = fakeBrowser();
  const { pushPanelEntry, panelEntries } = await load(b);
  const closed = [];
  pushPanelEntry(() => closed.push('first'));
  pushPanelEntry(() => closed.push('second'));
  b.pressBack();
  assert.deepEqual(closed, ['second']);
  assert.equal(panelEntries(), 1);
  b.pressBack();
  assert.deepEqual(closed, ['second', 'first']);
  assert.deepEqual(b.routerSaw, []);
});

test('A panel left by moving to another page: Back from there steps over its entry to the page under it', async () => {
  const b = fakeBrowser();
  const { pushPanelEntry } = await load(b);
  const remove = pushPanelEntry(() => {});
  b.navigate('https://portal.test/coach/clients/abc');
  remove();
  await b.settle();
  assert.equal(b.at, 2, 'nothing is taken away under the new page');
  b.pressBack();
  await b.settle();
  assert.equal(b.at, 0);
  assert.deepEqual(b.routerSaw, ['https://portal.test/coach/clients'], 'the router goes back to the page, once');
});

test('Back past the page while a panel is open is the router’s, and the panel closes', async () => {
  const b = fakeBrowser();
  b.navigate('https://portal.test/coach/leads');
  const { pushPanelEntry, panelEntries } = await load(b);
  let closed = 0;
  pushPanelEntry(() => { closed += 1; });
  const at = b.at;
  b.pressBack(); // lands on the page under the panel (closes it)
  assert.equal(closed, 1);
  assert.equal(panelEntries(), 0);
  b.pressBack(); // then the page before: the router's
  assert.equal(b.at, at - 2);
  assert.deepEqual(b.routerSaw, ['https://portal.test/coach/clients']);
});

test('Closed and moved to another page in the same moment: the step back is never taken off the new page', async () => {
  const b = fakeBrowser();
  const { pushPanelEntry } = await load(b);
  const remove = pushPanelEntry(() => {});
  remove();
  b.navigate('https://portal.test/coach/todos');
  await b.settle();
  assert.equal(b.entries[b.at].href, 'https://portal.test/coach/todos');
  assert.deepEqual(b.routerSaw, []);
});
