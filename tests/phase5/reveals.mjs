// Anything that opens on the same page keeps your place (Tim, 13 Nov,
// 12:36): "Show as a table", "See an example", "Show more", a folded
// section. It never jumps to the top, it scrolls just enough to show what
// opened, and the link that opened it stays in view. Checked on every
// page of the portal by calm-rules.
//
// checkReveals runs in the page (page.evaluate(checkReveals)). It finds
// each part that opens something in place: one that says so
// (aria-expanded="false") and any plain button or summary whose words say
// so ("Show …", "See an example", "… more"). Each is put at the foot of
// the screen, where what it opens would land out of sight, then pressed.
// It fails when:
//   - the page jumped to the top;
//   - the link that was pressed is no longer in view;
//   - what opened is out of view (none of it shows; or it would fit and
//     its end is cut off);
//   - a part says it opened something (aria-expanded) but nothing
//     appeared and it names nothing (no aria-controls): what opened can't
//     be found, so it could not be checked or kept in view;
//   - a part whose words say it opens something doesn't say so to a
//     screen reader (no aria-expanded). A button that goes to another
//     page is not a reveal, and ends the pressing on that page.
// Pop-ups, menus and panels (aria-haspopup, a dialog, anything fixed to
// the screen) place themselves and are not pressed. Each part is closed
// again afterwards. Gives { checked, problems }.
export async function checkReveals({ limit = 14 } = {}) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // "View …" and "Read …" go to another page, so they are not pressed.
  const WORDS = /^show\b.*|^see an? example\b.*|^.*\bmore$|^hide\b.*/i;
  const shown = (el) => {
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.pointerEvents !== 'none';
  };
  const fixed = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
      if (n.matches('[role=dialog], [role=menu], [role=listbox], [aria-modal=true], header, nav')) return true;
    }
    return false;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  // A layer over the page (an open panel or guide): only what is on it can be pressed.
  const layer = [...document.querySelectorAll('.ds-guide--fullscreen, [role=dialog], [aria-modal=true]')].filter(shown).pop() || null;
  const scrollerOf = (el) => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  };
  const viewOf = (scroller, x) => {
    if (scroller) { const b = scroller.getBoundingClientRect(); return { top: Math.max(b.top, 0), bottom: Math.min(b.bottom, innerHeight) }; }
    const edge = (y) => {
      for (const el of document.elementsFromPoint(Math.min(Math.max(x, 1), innerWidth - 1), y)) {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const p = getComputedStyle(n).position;
          if (p === 'fixed' || p === 'sticky') { const b = n.getBoundingClientRect(); if (b.height < innerHeight / 2) return b; }
        }
      }
      return null;
    };
    const head = edge(1); const foot = edge(innerHeight - 2);
    return { top: head ? head.bottom : 0, bottom: foot ? foot.top : innerHeight };
  };

  const all = [...document.querySelectorAll('.ui-root [aria-expanded="false"], .ui-root details:not([open]) > summary, .ui-root button, .hc [aria-expanded="false"], .hc button')];
  const triggers = [];
  const problems = [];
  for (const el of all) {
    if (triggers.includes(el) || !shown(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (layer ? !layer.contains(el) : fixed(el)) continue;
    if (el.hasAttribute('aria-haspopup') || el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'tab') continue;
    const says = el.getAttribute('aria-expanded') === 'false' || el.tagName === 'SUMMARY';
    if (!says && !(el.tagName === 'BUTTON' && el.type !== 'submit' && WORDS.test(label(el)) && !/^(show|hide)$/i.test(label(el)))) continue;
    triggers.push(el);
  }

  // Those that say they open something first; plain buttons after.
  triggers.sort((x, y) => Number(y.hasAttribute('aria-expanded') || y.tagName === 'SUMMARY') - Number(x.hasAttribute('aria-expanded') || x.tagName === 'SUMMARY'));
  let checked = 0;
  for (const el of triggers.slice(0, limit)) {
    if (!el.isConnected || !shown(el)) continue;
    const name = label(el);
    const says = el.hasAttribute('aria-expanded') || el.tagName === 'SUMMARY';
    const scroller = scrollerOf(el);
    const scrolled = () => (scroller ? scroller.scrollTop : window.scrollY);
    // At the foot of the screen, just above any bar fixed there.
    el.scrollIntoView({ block: 'end', behavior: 'instant' });
    let box = el.getBoundingClientRect();
    let view = viewOf(scroller, box.left + box.width / 2);
    const lift = box.bottom - (view.bottom - 12);
    if (lift > 0) (scroller || window).scrollBy({ top: lift, left: 0, behavior: 'instant' });
    await wait(60);
    const before = scrolled();
    const path = location.pathname + location.search;
    const appeared = [];
    const watch = new MutationObserver((changes) => {
      for (const c of changes) {
        // A part that redraws itself (the breathing orb) swaps old for new in one go: not a reveal.
        if (c.type === 'childList' && c.removedNodes.length === 0) for (const n of c.addedNodes) if (n.nodeType === 1) appeared.push(n);
        if (c.type === 'attributes' && c.target !== el) appeared.push(c.target);
      }
    });
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'aria-hidden', 'data-open'] });
    el.click();
    await wait(950);
    watch.disconnect();
    // It went to another page: not a reveal. Nothing more can be pressed here.
    if (location.pathname !== path.split('?')[0]) break;
    if (!el.isConnected) continue;
    const opened = el.getAttribute('aria-expanded') === 'true' || el.parentElement?.open === true;
    const named = (el.getAttribute('aria-controls') || '').split(/\s+/).map((id) => (id ? document.getElementById(id) : null)).find((n) => n && shown(n));
    // The part it names is a pop-up (the eye's or an ⓘ's words): it places
    // itself over the page, as keepPlace leaves it to, so it is not a reveal.
    if (named && (fixed(named) || ['absolute', 'fixed'].includes(getComputedStyle(named).position) || named.matches('[role=tooltip]'))) {
      if (el.getAttribute('aria-expanded') === 'true') el.click();
      await wait(120);
      continue;
    }
    const region = named || appeared.find((n) => n.isConnected && shown(n) && !n.contains(el) && !el.contains(n) && !fixed(n) && getComputedStyle(n).position !== 'absolute') || null;
    // Nothing opened in place (it opened a pop-up, or did something else): not a reveal.
    if (!region || (says && !opened)) {
      // It says it opened something, yet nothing appeared anywhere and it
      // names nothing: what opened was only un-hidden by a style, which
      // neither this check nor keepPlace can see, so it would pass unread.
      if (says && opened && !appeared.some((n) => n.isConnected && shown(n))) {
        checked += 1;
        problems.push(`"${name}" says it opened something, but what opened can't be found (name it with aria-controls)`);
      }
      if (opened) el.click();
      await wait(120);
      continue;
    }
    checked += 1;
    if (!says) problems.push(`"${name}" opens something in place but has no aria-expanded`);
    const after = scrolled();
    box = el.getBoundingClientRect();
    view = viewOf(scroller, box.left + box.width / 2);
    const r = region.getBoundingClientRect();
    const room = view.bottom - view.top;
    if (before > 40 && after < 4) problems.push(`"${name}" jumped to the top (from ${Math.round(before)}px)`);
    else if (box.bottom <= view.top + 1 || box.top >= view.bottom - 1) problems.push(`"${name}" is no longer in view after opening (its top at ${Math.round(box.top)}, the view ${Math.round(view.top)} to ${Math.round(view.bottom)})`);
    else {
      const showing = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top);
      const fits = r.bottom - box.top + 32 <= room;
      if (showing < Math.min(r.height, 24)) problems.push(`"${name}" opens out of view (what opened starts at ${Math.round(r.top)}, the view ends at ${Math.round(view.bottom)})`);
      else if (fits && r.bottom > view.bottom + 2) problems.push(`"${name}" opens with its end cut off by ${Math.round(r.bottom - view.bottom)}px though it would fit`);
    }
    // Closed again, so the next part starts from the page as it was.
    if (el.isConnected && (el.getAttribute('aria-expanded') === 'true' || el.parentElement?.open)) { el.click(); await wait(350); }
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  return { checked, problems };
}
