// The side panel for longer explanations (src/components/design/Explain.jsx;
// Tim, 16 Nov, 23:31), as the browser suites read it.
//
//   explainWords(page)        the open panel's words in reading order (title,
//                             then each line, term and meaning), or null
//   checkExplainOpener(page, opener, { tag, pass, words, touch })
//                             opens the panel from `opener` with the mouse
//                             (or a tap), checks its words, that focus moved
//                             in, that nothing behind it moved and there's no
//                             sideways scroll, closes it with the crosshair;
//                             then opens it with the keyboard and closes it
//                             with Escape, focus back on the opener; then
//                             the dimmed page closes it.
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export function explainWords(page) {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll('.ds-explain-panel')].find((p) => p.getBoundingClientRect().width > 0 && getComputedStyle(p).visibility !== 'hidden');
    if (!panel) return null;
    const title = panel.querySelector('.ds-dialog-title')?.textContent.trim() || '';
    const parts = [...panel.querySelectorAll('.ds-explain-line, .ds-explain-word, .ds-explain-meaning')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
    return [title, ...parts];
  });
}

async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}

export async function checkExplainOpener(page, opener, { tag, pass, words = null, touch = false }) {
  await opener.scrollIntoViewIfNeeded();
  await sleep(250);
  const behind = () => page.evaluate(() => ({ y: window.scrollY, w: document.documentElement.scrollWidth - window.innerWidth }));
  const before = await behind();
  if (touch) await opener.tap(); else await opener.click();
  const opened = await until(async () => (await explainWords(page)) !== null, 4000);
  pass(`${tag}: it opens the side panel`, opened);
  if (!opened) return;
  await sleep(450);
  const got = await explainWords(page);
  if (words) pass(`${tag}: the panel reads as agreed`, JSON.stringify(got) === JSON.stringify(words), JSON.stringify(got));
  const facts = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.ds-explain-panel')].pop();
    const r = panel.getBoundingClientRect();
    const st = getComputedStyle(panel.querySelector('.ds-dialog-title'));
    return {
      inside: panel.contains(document.activeElement),
      width: Math.round(r.width), right: Math.round(window.innerWidth - r.right), full: Math.round(r.width) >= window.innerWidth - 1,
      titleSize: st.fontSize, titleCase: st.textTransform,
      bullets: panel.querySelectorAll('ul, ol, li, b, strong, .ds-info').length,
    };
  });
  const after = await behind();
  pass(`${tag}: focus moves into the panel`, facts.inside);
  pass(`${tag}: from the right, 460px on a laptop, full screen on a phone`, facts.right === 0 && (facts.full || facts.width === 460), JSON.stringify(facts));
  pass(`${tag}: its title is a sentence in DM Sans 20px, with no bullets, bold or ⓘ`, facts.titleSize === '20px' && facts.titleCase === 'none' && facts.bullets === 0, JSON.stringify(facts));
  pass(`${tag}: nothing behind it moves, and no sideways scroll`, after.y === before.y && after.w <= 0, `${JSON.stringify(before)} ${JSON.stringify(after)}`);
  // Closed with the close crosshair.
  await page.locator('.ds-explain-panel [aria-label="Close"]').last().click();
  pass(`${tag}: the close crosshair closes it`, await until(async () => (await explainWords(page)) === null, 3000));
  pass(`${tag}: focus goes back to what opened it`, await until(() => opener.evaluate((el) => el === document.activeElement), 2000));
  // The keyboard: Enter opens, Escape closes.
  await opener.focus();
  await page.keyboard.press('Enter');
  const keyOpen = await until(async () => (await explainWords(page)) !== null, 3000);
  pass(`${tag}: the keyboard opens it`, keyOpen);
  if (keyOpen) {
    await sleep(400);
    await page.keyboard.press('Escape');
    pass(`${tag}: Escape closes it`, await until(async () => (await explainWords(page)) === null, 3000));
    pass(`${tag}: focus goes back to what opened it after Escape`, await until(() => opener.evaluate((el) => el === document.activeElement), 2000));
  }
  // The dimmed page closes it (a laptop; on a phone the panel fills the screen).
  if (!facts.full) {
    await opener.click();
    await until(async () => (await explainWords(page)) !== null, 3000);
    await sleep(400);
    await page.mouse.click(8, Math.round((await page.viewportSize()).height / 2));
    pass(`${tag}: the dimmed page closes it`, await until(async () => (await explainWords(page)) === null, 3000));
  }
}
