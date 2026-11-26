// Hover and keyboard focus on every control (polish 1, Stage B: "not walked by Tim, cover it"; rule 4a: hover and
// keyboard focus turn a control's hairline and words the text colour, the focus ring shows only for the keyboard).
//
// Three functions run in the page (page.evaluate), used by tests/design/run-focus-hover.mjs and the fixtures in
// tests/design/focus-hover.test.mjs:
//   fhMark()          numbers every control people press (buttons, links, tabs, radios, switches, tick boxes) and
//                     keeps how each looks at rest (itself, its ::before and ::after, and what's inside it);
//   fhChanged(i)      what differs now for control i against its rest (an empty list: nothing shows);
//   fhFocused()       the control that has keyboard focus, as { i, changed, focusVisible } (i is -1 when it isn't
//                     one of the marked controls).
// A control passes focus when something about it, its ::before or ::after, or what's inside it looks different while
// it has keyboard focus (outline, shadow, edge, fill, words' colour, underline); hover the same for the pointer.
// Text boxes are left out of hover (a box shows its edge on focus, not on hover), and so is a control already in
// its chosen state's look (aria-current, aria-pressed=true, aria-checked=true, aria-selected=true) for hover only.

export function fhMark() {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 1 && b.height > 1)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const SEL = 'button, a[href], [role=button], [role=tab], [role=radio]:not(input), [role=switch], [role=checkbox]:not(input), [role=menuitem], [role=option], summary, input:not([type=hidden]), select, textarea';
  const list = [...document.querySelectorAll(`.ui-root ${SEL.split(', ').join(', .ui-root ')}`)].filter((el) => vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  window.__fh = { list, rest: list.map((el) => window.__fhLook(el)) };
  return list.length;
}

// Installed by fhInstall: one function both checks share (kept on window so page.evaluate can call it by name).
export function fhInstall() {
  const PROPS = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'outline-style', 'outline-color', 'outline-width', 'box-shadow', 'text-decoration-line', 'text-decoration-color', 'opacity', 'transform', 'background-image'];
  const one = (el, pseudo) => { const st = getComputedStyle(el, pseudo); return PROPS.map((p) => st.getPropertyValue(p)).join('|'); };
  window.__fhLook = (el) => {
    const parts = [one(el), one(el, '::before'), one(el, '::after')];
    for (const k of [...el.querySelectorAll('*')].slice(0, 12)) parts.push(one(k), one(k, '::before'), one(k, '::after'));
    return parts;
  };
  window.__fhDiff = (i) => {
    const { list, rest } = window.__fh;
    const now = window.__fhLook(list[i]);
    const out = [];
    for (let k = 0; k < Math.max(now.length, rest[i].length); k++) if (now[k] !== rest[i][k]) out.push(k);
    return out;
  };
  return true;
}

export function fhChanged(i) {
  return window.__fhDiff(i);
}

export function fhFocused() {
  const el = document.activeElement;
  const i = window.__fh.list.indexOf(el);
  let focusVisible = false;
  try { focusVisible = el?.matches(':focus-visible') || false; } catch { /* old engines */ }
  const name = el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''} "${(el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"` : '';
  return { i, changed: i >= 0 ? window.__fhDiff(i).length : 0, focusVisible, name };
}

/** The names of control i (for the report). */
export function fhName(i) {
  const el = window.__fh.list[i];
  return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''} "${(el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"`;
}

/** Whether control i is one hover should change (not a text box, not already chosen, a real pointer target). */
export function fhHoverable(i) {
  const el = window.__fh.list[i];
  if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select')) return false;
  if (el.matches('[aria-current]:not([aria-current=false]), [aria-pressed=true], [aria-checked=true], [aria-selected=true]')) return false;
  // The reference's underlined link with no chevron (.lk) is itself unchanged on hover; only a chevron moves.
  const underlined = [el, ...el.children].some((k) => /underline/.test(getComputedStyle(k).textDecorationLine));
  if (underlined && !el.querySelector('.ds-chevron')) return false;
  const b = el.getBoundingClientRect();
  if (b.bottom < 0 || b.top > window.innerHeight) return false;
  // Something else on top of its middle (a panel, the header) is not this control's hover.
  const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return Boolean(top && (top === el || el.contains(top)));
}

/**
 * Runs the whole check on the open page with Playwright's `page`: Tab through every control, then point at each one.
 * Returns { checked, focus: [problems], hover: [problems] }. `maxTabs` bounds a long page; `hover` false skips it.
 */
export async function focusHoverProblems(page, { maxTabs = 80, hover = true } = {}) {
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; }' }).catch(() => {});
  await page.evaluate(fhInstall);
  await page.mouse.move(0, 0);
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  const n = await page.evaluate(fhMark);
  const focus = [];
  const seen = new Set();
  for (let t = 0; t < Math.min(maxTabs, n + 4); t++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(fhFocused);
    if (f.i < 0 || seen.has(f.i)) { if (f.i >= 0) break; continue; }
    seen.add(f.i);
    if (!f.focusVisible) focus.push(`${f.name}: keyboard focus without :focus-visible`);
    else if (!f.changed) focus.push(`${f.name}: nothing shows keyboard focus`);
  }
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  const hoverOut = [];
  if (hover) {
    await page.evaluate(fhMark);
    for (let i = 0; i < n && i < 120; i++) {
      await page.evaluate((k) => window.__fh.list[k].scrollIntoView({ block: 'center' }), i);
      if (!(await page.evaluate(fhHoverable, i))) continue;
      const box = await page.evaluate((k) => { const b = window.__fh.list[k].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, i);
      await page.mouse.move(box.x, box.y);
      const changed = await page.evaluate(fhChanged, i);
      if (!changed.length) hoverOut.push(`${await page.evaluate(fhName, i)}: nothing changes on hover`);
      await page.mouse.move(0, 0);
    }
  }
  return { checked: n, tabbed: seen.size, focus, hover: hoverOut };
}
