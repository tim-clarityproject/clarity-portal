// No two tap areas overlap (Tim, 11 Nov, with the sign-in pages: "Text
// links stacked one above another never share a tap area. Each keeps its
// own 44px."). Checked on every page of the portal by calm-rules.
//
// A tap area is the whole box a tap or a click lands on: the control's
// own box, with any invisible part a shared control adds round itself to
// reach 44px (its ::before or ::after). Two overlap when their boxes share
// more than 2px each way.
//
// What is not an overlap:
//   - one control inside another (a row that opens, with a button in it);
//   - a control drawn inside the box it belongs to ("Show" in a password
//     box, the cross that clears a search box);
//   - parts that are not on the same layer: something fixed to the screen
//     (the phone bar, the Breathe button, a toast) passes over the page as
//     it scrolls, and a page under an open panel can't be tapped at all;
//   - anything hidden, switched off, scrolled out of sight inside a box
//     that scrolls, or that taps pass straight through.
//
// overlappingTaps runs in the page (page.evaluate(overlappingTaps)) and
// gives each overlapping pair as `first "words" + second "words" (w by h)`.
export function overlappingTaps() {
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=tab], [role=radio], [role=menuitem], [role=option]';
  const top = [...document.querySelectorAll('.ds-guide--fullscreen, [role=dialog], [aria-modal=true]')].filter((d) => {
    const b = d.getBoundingClientRect();
    const st = getComputedStyle(d);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  }).pop() || document.body;
  const seen = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
      if (p === el && st.pointerEvents === 'none') return false;
    }
    return true;
  };
  // The layer a control sits on: the nearest part fixed or stuck to the screen, or the page.
  const layer = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') return p;
    }
    return document.body;
  };
  // The control's box, with any invisible part it adds round itself.
  const boxes = (el) => {
    const st = getComputedStyle(el);
    const rects = st.display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    const out = rects.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
    if (!out.length) return out;
    if (st.position !== 'static') {
      const own = el.getBoundingClientRect();
      for (const which of ['::before', '::after']) {
        const ps = getComputedStyle(el, which);
        if (ps.content === 'none' || ps.position !== 'absolute' || ps.pointerEvents === 'none' || ps.display === 'none') continue;
        const [t, r, b, l] = [ps.top, ps.right, ps.bottom, ps.left].map(parseFloat);
        if ([t, r, b, l].some((v) => !Number.isFinite(v))) continue;
        out.push({ l: own.left + l, t: own.top + t, r: own.right - r, b: own.bottom - b });
      }
    }
    return out;
  };
  // Only what can be seen: a part scrolled out of sight inside a box that
  // scrolls (a guided tool's page under its bottom bar) can't be tapped there.
  const clipped = (el, box) => {
    let { l, t, r, b } = box;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      if (st.overflowX !== 'visible') { l = Math.max(l, c.left); r = Math.min(r, c.right); }
      if (st.overflowY !== 'visible') { t = Math.max(t, c.top); b = Math.min(b, c.bottom); }
    }
    return r - l > 0 && b - t > 0 ? { l, t, r, b } : null;
  };
  const words = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const typed = (el) => el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select');
  const within = (a, b) => a.l >= b.l - 1 && a.r <= b.r + 1 && a.t >= b.t - 1 && a.b <= b.b + 1;

  const list = [...top.querySelectorAll(CONTROLS)].filter(seen).map((el) => ({ el, layer: layer(el), boxes: boxes(el).map((x) => clipped(el, x)).filter(Boolean) })).filter((c) => c.boxes.length);
  const found = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a.layer !== b.layer) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // A label and the control it names are one tap area.
      if ((a.el.labels && [...a.el.labels].some((l) => l.contains(b.el))) || (b.el.labels && [...b.el.labels].some((l) => l.contains(a.el)))) continue;
      let worst = null;
      for (const x of a.boxes) {
        for (const y of b.boxes) {
          const w = Math.min(x.r, y.r) - Math.max(x.l, y.l);
          const h = Math.min(x.b, y.b) - Math.max(x.t, y.t);
          if (w <= 2 || h <= 2) continue;
          // A control drawn inside the box it belongs to.
          if ((typed(a.el) && within(y, a.boxes[0])) || (typed(b.el) && within(x, b.boxes[0]))) continue;
          if (!worst || w * h > worst.w * worst.h) worst = { w, h };
        }
      }
      if (worst) found.push(`${words(a.el)} + ${words(b.el)} (${worst.w.toFixed(0)} by ${worst.h.toFixed(0)})`);
    }
  }
  return found;
}
