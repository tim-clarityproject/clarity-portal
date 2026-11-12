// Every outlined edge reaches 3 to 1 (Tim, 12 Nov): anything to tap or
// type into that is drawn as an outline (an edge all the way round, in a
// colour of its own) is read against the first solid colour behind it, and
// against its own colour where it has one. Filled parts (a coral button, a
// ticked box) and plain lines between rows are not outlines.
//
// What it also reads (functionality tester, 12 Nov):
//   - a text box whose edge is drawn on the box around it (a `div` or a
//     `label` that holds the field) is read from that box;
//   - a box to type into never counts as "filled" just because its edge is
//     the same colour as its fill: if the fill doesn't stand out from what
//     is behind it, the box has no edge to see, and it is listed;
//   - a colour the browser gives in the `color(srgb …)` form (a mixed or
//     see-through colour) is read as the colour it is, not as near black.
//   - a part that is faded (its own opacity, or a box around it) has its
//     edge read as faded; and anything with a button's, link's or switch's
//     role is read like a button (break-it).
// What it does not read: an edge drawn with `outline` or a shadow instead
// of a border, an edge on some sides only (an underline is a line, not an
// outline), a field's edge drawn more than two boxes out from it, and the
// hover and focus states.
//
// outlinedEdges runs in the page (page.evaluate(outlinedEdges)) and gives
// the ones under 3 to 1, each as `name "words" ratio`. With `all` it gives
// every outline it measured, for a count.
export function outlinedEdges(all = false) {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  const root = document.querySelector('.ds-guide--fullscreen') || document.body;
  const lowEdges = [];
  const every = [];
  const rgba = (c) => {
    // "color(srgb 0.5 0.5 0.5 / 0.4)": parts from 0 to 1 (a percentage alpha too).
    const mixed = /^color\(\s*srgb\s+([^)]+)\)/.exec(c);
    if (mixed) {
      const [rgb, alpha] = mixed[1].split('/');
      const m = rgb.trim().split(/\s+/).map((v) => (v === 'none' ? 0 : Number(v)));
      const a = alpha == null ? 1 : alpha.trim().endsWith('%') ? parseFloat(alpha) / 100 : Number(alpha);
      return { r: m[0] * 255, g: m[1] * 255, b: m[2] * 255, a: Number.isFinite(a) ? a : 1 };
    }
    const m = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
  };
  const lum = ({ r, g, b }) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const behind = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c.a > 0.95) return c; } return rgba(getComputedStyle(document.documentElement).backgroundColor); };
  // An edge all the way round that can be seen: its colours, one a side
  // where the sides differ (each is then read, and the faintest counts: an
  // outline with one side in another faint colour was passed over before;
  // break-it, 12 Nov). A side that is see-through is no side, so a line
  // under a row is still a line, not an outline.
  const outline = (el) => {
    const st = getComputedStyle(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ w: parseFloat(st[`border${s}Width`]), style: st[`border${s}Style`], c: st[`border${s}Color`] }));
    if (!sides.every((s) => s.w >= 0.5 && s.style !== 'none' && s.style !== 'hidden' && rgba(s.c).a >= 0.05)) return null;
    return [...new Set(sides.map((s) => s.c))].map(rgba);
  };
  const TYPED = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), textarea, select';
  const parts = new Set();
  // (Anything else made to be tapped or typed into, whatever it is built from: break-it, 12 Nov.
  // Not everything that takes the keyboard: a chart mark or an objective's
  // number that only opens a pop-up is a mark, and rule 8a leaves marks their own line colours.)
  for (const el of root.querySelectorAll(`button, a, summary, label, ${TYPED}, [role=button], [role=link], [role=switch], [role=combobox], [role=menuitem], [role=radio], [role=checkbox], [role=tab], [role=option], [role=radiogroup], [role=tablist], [role=group], [contenteditable=true], [contenteditable=""], .ds-seg`)) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    parts.add(el);
    // A box to type into with no edge of its own: the edge may be on the box
    // that holds it (up to two boxes out, and only one that fits the field:
    // a card that happens to hold a field is not the field's outline).
    if (!el.matches(TYPED) || outline(el)) continue;
    const fb = el.getBoundingClientRect();
    for (let p = el.parentElement, n = 0; p && p !== root && n < 2; p = p.parentElement, n += 1) {
      const pb = p.getBoundingClientRect();
      if (pb.height > fb.height + 24) break;
      if (vis(p) && outline(p)) { parts.add(p); break; }
    }
  }
  for (const el of parts) {
    const st = getComputedStyle(el);
    const edges = outline(el);
    if (!edges) continue;
    const own = rgba(st.backgroundColor);
    const back = behind(el);
    // Filled: its own colour already stands out from what is behind it, or
    // the edge is the fill's own colour (a filled pill). A box to type into
    // is never let off the second way: with a fill that doesn't stand out
    // and an edge of the same colour, it has no edge to see.
    const typed = el.matches(TYPED) || (!el.matches('button, a, [role]') && Boolean(el.querySelector(TYPED)));
    if (own.a > 0.95 && (ratio(own, back) >= 3 || (!typed && edges.every((edge) => ratio(edge, own) < 1.05)))) continue;
    // A see-through edge is read as it lands on what is behind it; so is an
    // edge on a part that is itself faded, or inside one (opacity).
    let fade = 1;
    for (let p = el; p; p = p.parentElement) fade *= Number(getComputedStyle(p).opacity) || 1;
    // Against what is outside it and, where it has a colour of its own, what is inside it.
    const got = Math.min(...edges.map((edge) => {
      const alpha = edge.a * fade;
      const mix = { r: edge.r * alpha + back.r * (1 - alpha), g: edge.g * alpha + back.g * (1 - alpha), b: edge.b * alpha + back.b * (1 - alpha) };
      return Math.min(ratio(mix, back), own.a > 0.95 ? ratio(mix, own) : Infinity);
    }));
    every.push(`${label(el)} ${got.toFixed(2)}`);
    if (got < 3) lowEdges.push(`${label(el)} ${got.toFixed(2)}`);
  }
  return all ? [...new Set(every)] : [...new Set(lowEdges)];
}
