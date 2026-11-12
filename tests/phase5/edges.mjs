// Every outlined edge reaches 3 to 1 (Tim, 12 Nov): anything to tap or
// type into that is drawn as an outline (an edge all the way round, in a
// colour of its own) is read against the first solid colour behind it, and
// against its own colour where it has one. Filled parts (a coral button, a
// ticked box) and plain lines between rows are not outlines.
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
  const rgba = (c) => { const m = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const behind = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c.a > 0.95) return c; } return rgba(getComputedStyle(document.documentElement).backgroundColor); };
  for (const el of root.querySelectorAll('button, a, input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [role=radio], [role=checkbox], [role=tab], [role=option], [role=radiogroup], [role=tablist], [role=group], .ds-seg')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const st = getComputedStyle(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ w: parseFloat(st[`border${s}Width`]), style: st[`border${s}Style`], c: st[`border${s}Color`] }));
    if (!sides.every((s) => s.w >= 0.5 && s.style !== 'none' && s.style !== 'hidden' && s.c === sides[0].c)) continue;
    const edge = rgba(sides[0].c);
    if (edge.a < 0.05) continue;
    const own = rgba(st.backgroundColor);
    const back = behind(el);
    // Filled: its own colour already stands out from what is behind it, or the edge is the fill's own colour.
    if (own.a > 0.95 && (ratio(own, back) >= 3 || ratio(edge, own) < 1.05)) continue;
    // A see-through edge is read as it lands on what is behind it.
    const mix = { r: edge.r * edge.a + back.r * (1 - edge.a), g: edge.g * edge.a + back.g * (1 - edge.a), b: edge.b * edge.a + back.b * (1 - edge.a) };
    // Against what is outside it and, where it has a colour of its own, what is inside it.
    const got = Math.min(ratio(mix, back), own.a > 0.95 ? ratio(mix, own) : Infinity);
    every.push(`${label(el)} ${got.toFixed(2)}`);
    if (got < 3) lowEdges.push(`${label(el)} ${got.toFixed(2)}`);
  }
  return all ? [...new Set(every)] : [...new Set(lowEdges)];
}
