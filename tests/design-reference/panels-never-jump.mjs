// Panels never jump (Tim, 23 Oct): a panel animates only when it opens.
// Changing anything inside it updates only that part; the panel must not
// be rebuilt, slide or fade again, lose focus or lose its scroll position.
//
// Also checks that the slide panel and pop-up do animate when they open.
// Checks the slide panel (to-do and unplanned win), the pop-up, the
// drop-down's phone panel, the calendar (laptop and phone) and focus mode
// on /design-reference. Needs the dev server running:
//   npm run dev        (then, in another window)
//   npm run test:panels
// GALLERY_URL overrides the address (default http://localhost:5173/design-reference).

import { chromium, devices } from 'playwright';

const URL = process.env.GALLERY_URL || 'http://localhost:5173/design-reference';
const SETTLE_MS = 700;
const results = [];

// Watch one panel element: mark it, count animations and transitions that
// start on the element itself (not on controls inside it), and note its
// scroll position and where focus is.
async function watch(page, selector, scrollerSelector) {
  return page.evaluate(({ selector, scrollerSelector }) => {
    const panel = document.querySelector(selector);
    if (!panel) return false;
    panel.dataset.watched = 'yes';
    window.__starts = 0;
    const count = (e) => { if (e.target === panel || e.target === panel.parentElement) window.__starts += 1; };
    ['animationstart', 'transitionstart', 'transitionrun'].forEach((t) => {
      panel.addEventListener(t, count);
      panel.parentElement?.addEventListener(t, count);
    });
    const scroller = scrollerSelector ? document.querySelector(scrollerSelector) : null;
    if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = 40;
    window.__scroll = scroller ? scroller.scrollTop : null;
    return true;
  }, { selector, scrollerSelector });
}

async function verdict(page, name, selector, scrollerSelector) {
  const r = await page.evaluate(({ selector, scrollerSelector }) => {
    const panel = document.querySelector(selector);
    const scroller = scrollerSelector ? document.querySelector(scrollerSelector) : null;
    return {
      same: !!panel && panel.dataset.watched === 'yes',
      starts: window.__starts,
      scrollHeld: !scroller || scroller.scrollTop === window.__scroll,
      focusInside: !!panel && panel.contains(document.activeElement),
    };
  }, { selector, scrollerSelector });
  const ok = r.same && r.starts === 0 && r.scrollHeld && r.focusInside;
  results.push({ name, ok, ...r });
}

const wait = (page, ms = SETTLE_MS) => page.waitForTimeout(ms);

// The other half of the rule: the panel does animate when it opens (also
// on the very first open after the page loads).
async function expectOpening(page) {
  await page.evaluate(() => {
    window.__opened = 0;
    const count = (e) => { if (e.target.classList?.contains('ds-dialog')) window.__opened += 1; };
    document.addEventListener('transitionrun', count, true);
  });
}

async function openingRan(page, name) {
  const ran = await page.evaluate(() => window.__opened > 0);
  results.push({ name, ok: ran, same: true, starts: ran ? 'ran' : 'none', scrollHeld: true, focusInside: true });
}

async function open(page) {
  await page.goto(URL);
  await page.waitForSelector('#c15');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#c15');
  await wait(page);
}

const browser = await chromium.launch();

// Laptop, short window so the panels scroll.
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 560 } })).newPage();
  await open(page);
  const pane = page.locator('#c15 .dr-pane').first();

  await expectOpening(page);
  await pane.getByRole('button', { name: 'Add a to-do' }).click();
  await wait(page);
  await openingRan(page, 'Slide panel slides in on the first open');
  await watch(page, '.ds-panel', '.ds-panel .ds-dialog-body');
  const panel = page.locator('.ds-panel');
  // Pressed where they are (a click from the test would first scroll them
  // into view, which is the test moving the panel, not the panel jumping).
  await panel.getByRole('radio', { name: 'High' }).dispatchEvent('click');
  await panel.getByRole('radio', { name: 'Next week' }).dispatchEvent('click');
  await panel.getByRole('radio', { name: 'Low' }).dispatchEvent('click');
  await wait(page);
  await verdict(page, 'Slide panel: to-do (impact, week)', '.ds-panel', '.ds-panel .ds-dialog-body');
  await page.keyboard.press('Escape');
  await wait(page);

  await pane.getByRole('button', { name: 'Add an unplanned win' }).click();
  await wait(page);
  await watch(page, '.ds-panel', '.ds-panel .ds-dialog-body');
  const win = page.locator('.ds-panel');
  for (const name of ['Maintain my availability to do good work', 'Protect deep work every morning', 'Lead the team through the restructure']) {
    await win.getByRole('button', { name }).dispatchEvent('click');
  }
  await win.getByRole('radio', { name: 'Low' }).dispatchEvent('click');
  await wait(page);
  await verdict(page, 'Slide panel: unplanned win (several Strategies, impact)', '.ds-panel', '.ds-panel .ds-dialog-body');
  await page.keyboard.press('Escape');
  await wait(page);

  await expectOpening(page);
  await pane.getByRole('button', { name: 'See how it fits together' }).click();
  await wait(page);
  await openingRan(page, 'Pop-up fades in when it opens');
  await watch(page, '.ds-popup', '.ds-popup .ds-dialog-body');
  // The pop-up is now the real Individual Performance System (M1's
  // "How the system fits together", Phase 2 step 1), which has no choice
  // inside (the old stand-in had a "The plan / The sprint" switch). What a
  // person can do inside it is move between its controls and hover them,
  // so the check does that: the pop-up must stay put, unrebuilt, with its
  // scroll and focus held.
  const popup = page.locator('.ds-popup');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await popup.getByRole('button', { name: 'Close' }).last().hover();
  await wait(page);
  await verdict(page, 'Pop-up (moving between its controls)', '.ds-popup', '.ds-popup .ds-dialog-body');
  await page.keyboard.press('Escape');
  await wait(page);

  const field = page.locator('#c28 .dr-pane').first().locator('.ds-date');
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await wait(page);
  await watch(page, '.ds-pop--panel', null);
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.keyboard.press('ArrowRight');
  await wait(page);
  await verdict(page, 'Calendar on a laptop (months, days)', '.ds-pop--panel', null);
  await page.keyboard.press('Escape');
}

// Phone.
{
  const { defaultBrowserType: _engine, ...iphone } = devices['iPhone 13'];
  const page = await (await browser.newContext(iphone)).newPage();
  await open(page);

  const box = page.locator('#c20 .dr-pane').first().locator('.ds-dd').first();
  await box.scrollIntoViewIfNeeded();
  await box.tap();
  await wait(page);
  await watch(page, '.ds-sheet', '.ds-sheet-body');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await wait(page);
  await verdict(page, 'Drop-down phone panel (moving through options)', '.ds-sheet', '.ds-sheet-body');
  await page.keyboard.press('Escape');
  await wait(page);

  const field = page.locator('#c28 .dr-pane').first().locator('.ds-date');
  await field.scrollIntoViewIfNeeded();
  await field.tap();
  await wait(page);
  await watch(page, '.ds-sheet', '.ds-sheet-body');
  await page.getByRole('button', { name: 'Next month' }).tap();
  await page.getByRole('button', { name: 'Next month' }).tap();
  await wait(page);
  await page.locator('.ds-cal-day:not([aria-disabled])').nth(3).focus();
  await page.keyboard.press('ArrowRight');
  await wait(page);
  await verdict(page, 'Calendar phone panel (months, days)', '.ds-sheet', '.ds-sheet-body');
  await page.keyboard.press('Escape');
  await wait(page);

  const writing = page.locator('#c26 .dr-pane').first().locator('textarea');
  await writing.scrollIntoViewIfNeeded();
  await writing.tap();
  await wait(page);
  await watch(page, '.ds-focus', '.ds-focus-scroll');
  await page.keyboard.type('Finish by 18:30 on four nights a week, so training does not slip. '.repeat(12));
  await wait(page, 1600);
  await verdict(page, 'Focus mode (typing, Saving then Saved)', '.ds-focus', null);
  await page.locator('.ds-focus-done').tap();
}

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (same panel: ${r.same}, new animations: ${r.starts}, scroll held: ${r.scrollHeld}, focus inside: ${r.focusInside})`}`);
}
process.exit(failed ? 1 : 0);
