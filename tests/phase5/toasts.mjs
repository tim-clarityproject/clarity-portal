// A toast never covers a link or a button (tidy pass item 2, decided 29 Oct
// to 5 Nov): it rises above the phone bar and any bar fixed at the foot of
// the screen (a guided tool's, a page's BottomBar, the coach's Clients
// select-several bar), and stays open while the pointer is over it. Checked
// on every page by calm-rules and on the coach pages by the coach UI tester (tests/coach/ui.mjs).
//
// toastCovers runs in the page (page.evaluate(toastCovers)): it puts a
// stand-in toast with Undo ("Deleted", the widest kind) where the page's own
// toast would show, unless one is showing already, measures it against every
// visible control fixed to the screen (or inside something fixed: the page's
// own content scrolls under a toast and is not counted; an open menu or list
// is not either), then takes it away.
// It gives each control covered as `class "words"`, or an empty list.
export function toastCovers() {
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=tab], [role=radio], [role=menuitem]';
  const region = document.querySelector('.ds-toast-region');
  if (!region) return [];
  let toast = region.querySelector('.ds-toast');
  let probe = null;
  if (!toast) {
    probe = document.createElement('div');
    probe.className = 'ds-toast ds-toast--shown';
    probe.style.transition = 'none';
    probe.innerHTML = '<span class="ds-toast-text">Deleted</span><button type="button" class="ds-toast-undo">Undo</button>';
    region.appendChild(probe);
    toast = probe;
  }
  const t = toast.getBoundingClientRect();
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  // Fixed to the screen and not inside anything that scrolls on the way
  // (a full-screen guided tool is fixed, but its questions scroll inside it
  // like any page; its bottom bar doesn't).
  const fixed = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.position === 'fixed' || st.position === 'sticky') return true;
      if (p !== el && /auto|scroll/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) return false;
    }
    return false;
  };
  // A panel or full-screen tool open over the page: only what is on it counts.
  const top = [...document.querySelectorAll('.ds-guide--fullscreen, [role=dialog], [aria-modal=true]')].filter(vis).pop() || null;
  const out = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    // An open menu or list is a moment's layer that closes with the next tap, and a toast follows a choice made in it.
    // The coach portal's open menu (.cc-menu, a nav drawer, not role=menu) is one too (the UI tester, 22 Nov: its Sign out at 400px).
    if (el.closest('.ds-toast-region, [role=menu], [role=listbox], .cc-menu') || !vis(el) || !fixed(el)) continue;
    if (top && !top.contains(el)) continue;
    const b = el.getBoundingClientRect();
    // Its 44px tap area where a shared control draws one round itself.
    const after = getComputedStyle(el, '::after');
    const tapH = after.content !== 'none' && after.position === 'absolute' ? Math.max(b.height, parseFloat(after.height) || 0) : b.height;
    const mid = b.top + b.height / 2;
    const box = { left: b.left, right: b.right, top: mid - tapH / 2, bottom: mid + tapH / 2 };
    const across = Math.min(box.right, t.right) - Math.max(box.left, t.left);
    const down = Math.min(box.bottom, t.bottom) - Math.max(box.top, t.top);
    if (across > 0.5 && down > 0.5) {
      const name = String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase();
      out.push(`${name} "${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`);
    }
  }
  probe?.remove();
  return out;
}
