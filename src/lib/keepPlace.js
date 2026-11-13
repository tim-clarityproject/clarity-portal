// Anything that opens on the same page keeps your place (Tim, 13 Nov,
// 12:36): "Show as a table", "See an example", "Show more", a folded
// section. The page never jumps to the top. It scrolls just enough to
// show what opened, and the link that opened it stays in view.
//
// One listener does this for every part that says it opens something in
// place (aria-expanded going to "true"), so no page or part has its own
// way. Pop-ups, menus and panels place themselves and are left alone.

const GAP = 16;
const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const shown = (el) => {
  if (!el || !el.isConnected) return false;
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
};

// Fixed to the screen, or a layer of its own (a pop-up, a menu, a panel):
// these place themselves.
const floats = (el) => {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === 'fixed') return true;
    if (node.matches('[role=dialog], [role=menu], [role=listbox], [role=tooltip], [aria-modal=true]')) return true;
  }
  return getComputedStyle(el).position === 'absolute';
};

// The box that scrolls round `el`: the nearest one of its own, else the page.
function scrollerOf(el) {
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

// The part of the screen that shows the page: under a bar fixed to the
// top (the header) and above one fixed to the bottom (the phone bar).
function viewOf(scroller, x) {
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    return { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, window.innerHeight) };
  }
  const edge = (y) => {
    for (const el of document.elementsFromPoint(Math.min(Math.max(x, 1), window.innerWidth - 1), y)) {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') {
          const box = node.getBoundingClientRect();
          // A bar, not a whole-screen layer.
          if (box.height < window.innerHeight / 2) return box;
        }
      }
    }
    return null;
  };
  const head = edge(1);
  const foot = edge(window.innerHeight - 2);
  return { top: head ? head.bottom : 0, bottom: foot ? foot.top : window.innerHeight };
}

/**
 * How far to scroll so what opened shows: enough to bring its end into
 * view, but never so far that the link that opened it leaves the top.
 * @returns {number} px to scroll down (0 when nothing is needed)
 */
export function scrollNeeded({ triggerTop, regionBottom, viewTop, viewBottom, gap = GAP }) {
  const need = regionBottom + gap - viewBottom;
  if (!(need > 1)) return 0;
  const room = triggerTop - viewTop - gap;
  return Math.max(0, Math.min(need, room));
}

function keepInView(trigger, region) {
  if (!shown(trigger) || !shown(region) || floats(region)) return;
  const scroller = scrollerOf(trigger);
  const t = trigger.getBoundingClientRect();
  const view = viewOf(scroller, t.left + t.width / 2);
  const by = scrollNeeded({ triggerTop: t.top, regionBottom: region.getBoundingClientRect().bottom, viewTop: view.top, viewBottom: view.bottom });
  if (by < 1) return;
  (scroller || window).scrollBy({ top: by, left: 0, behavior: reducedMotion() ? 'instant' : 'smooth' });
}

// What a trigger opened: the part it names (aria-controls), otherwise the
// first thing that appeared on the page because of the press.
function regionFor(trigger, appeared) {
  const named = (trigger.getAttribute('aria-controls') || '').split(/\s+/).map((id) => (id ? document.getElementById(id) : null)).find(shown);
  if (named) return named;
  return appeared.find((el) => shown(el) && !el.contains(trigger) && !trigger.contains(el)) || null;
}

let installed = false;

/** Starts it, once, for the whole page. */
export function keepPlaceOnReveal() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', (event) => {
    const trigger = event.target?.closest?.('[aria-expanded]');
    if (!trigger || trigger.getAttribute('aria-expanded') === 'true' || trigger.hasAttribute('aria-haspopup')) return;
    const appeared = [];
    let watch = null;
    try {
      watch = new MutationObserver((changes) => {
        for (const change of changes) {
          if (change.type === 'childList') for (const node of change.addedNodes) if (node.nodeType === 1) appeared.push(node);
          if (change.type === 'attributes' && change.target !== trigger) appeared.push(change.target);
        }
      });
      watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'aria-hidden', 'data-open'] });
    } catch { /* the part it names is enough */ }
    const settle = (last) => {
      if (last) watch?.disconnect();
      if (trigger.getAttribute('aria-expanded') !== 'true') return;
      const region = regionFor(trigger, appeared);
      if (region) keepInView(trigger, region);
    };
    // Once the page has drawn what opened, and again when a part that
    // grows open has finished growing.
    requestAnimationFrame(() => requestAnimationFrame(() => settle(false)));
    setTimeout(() => settle(true), 320);
  }, true);
}
