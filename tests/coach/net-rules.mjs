// Network's own rules for the UI tester (Phase 6a run 4, step 4; the
// prompt's step 4 and the handover of 19 Nov), each read from the page:
// the table in its own box with its headings and its Name column staying
// put, and the map (one shared 0, a faint point a spot, "7 or more" once on
// each line and outside the chart, one same-size dot a spot, never coral,
// at most 150 people, 44px tap areas).

/** Runs in the page: what the map draws. */
export function readMap() {
  const svg = document.querySelector('.cc-net-map svg');
  if (!svg) return { none: true };
  // A dot that holds the keyboard wears the coral focus ring, as every control does: the dots are read at rest.
  if (svg.contains(document.activeElement)) document.activeElement.blur();
  const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const dots = [...svg.querySelectorAll('.cc-net-dot')].map((g) => {
    const o = g.querySelector('.cc-net-o');
    const cs = getComputedStyle(o);
    return { style: (g.getAttribute('class').match(/cc-net-dot--([a-z_]+)/) || [])[1], n: Number(g.querySelector('.cc-net-num')?.textContent || 1), r: Number(o.getAttribute('r')), fill: cs.fill, stroke: cs.stroke, dash: cs.strokeDasharray,
      tap: box(g.querySelector('.cc-net-tap')), o: box(o), ring: Boolean(g.querySelector('.cc-net-ring')), label: g.getAttribute('aria-label') || '', role: g.getAttribute('role'), tab: g.getAttribute('tabindex') };
  });
  const texts = [...svg.querySelectorAll('text')].map((t) => ({ words: t.textContent.trim(), cls: t.getAttribute('class') || '', box: box(t), size: parseFloat(getComputedStyle(t).fontSize) }));
  const points = [...svg.querySelectorAll('.cc-net-point')].map(box);
  const frame = { l: Math.min(...points.map((p) => p.l)), r: Math.max(...points.map((p) => p.r)), t: Math.min(...points.map((p) => p.t)), b: Math.max(...points.map((p) => p.b)) };
  return { dots, texts, points: points.length, frame, lines: svg.querySelectorAll('.cc-net-seven').length, svg: box(svg), page: document.documentElement.clientWidth, keys: document.querySelectorAll('.cc-net-map [class*=legend], .cc-net-map [class*=key]').length };
}

const CORAL = /rgb\((255, 111, 92|255, 133, 116|240, 96, 78|255, 189, 158|168, 78, 40|233, 91, 72)\)/;

/** What the map gets wrong, as a list of plain lines (empty when it is right). */
export function mapProblems(m, { phone, cap = 150 }) {
  if (m.none) return ['no map on the screen'];
  const out = [];
  const zeros = m.texts.filter((t) => t.words === '0');
  if (zeros.length !== 1) out.push(`the 0 is written ${zeros.length} times`);
  if (m.points !== 121) out.push(`${m.points} faint points, not one at each of the 121 spots`);
  const sevens = m.texts.filter((t) => t.words === '7 or more');
  if (m.lines !== 2 || sevens.length !== 2) out.push(`${m.lines} lines at 7 and ${sevens.length} “7 or more” labels`);
  const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  for (const s of sevens) if (m.dots.some((d) => overlaps(s.box, d.o))) out.push('a “7 or more” label sits on a dot');
  if (!phone && sevens.some((s) => s.box.l > m.frame.l + 4 && s.box.r < m.frame.r - 4 && s.box.t > m.frame.t + 4 && s.box.b < m.frame.b - 4)) out.push('a “7 or more” label is inside the chart');
  for (const want of ['Influence', 'Trust']) if (m.texts.filter((t) => t.words === want).length !== 1) out.push(`${want} isn’t written once`);
  if (m.texts.filter((t) => t.words === '10').length !== 2) out.push('10 isn’t at each far end');
  const sizes = [...new Set(m.dots.map((d) => d.r))];
  if (sizes.length > 1) out.push(`dots of ${sizes.length} sizes (${sizes.join(', ')})`);
  if (sizes.length === 1 && sizes[0] !== (phone ? 8.5 : 9.5)) out.push(`dots of radius ${sizes[0]}`);
  const coral = m.dots.filter((d) => CORAL.test(d.fill) || CORAL.test(d.stroke));
  if (coral.length) out.push(`${coral.length} coral dots`);
  const small = m.dots.filter((d) => d.tap.w < 43.5 || d.tap.h < 43.5);
  if (small.length) out.push(`${small.length} dots with a tap area under 44px (${small[0].tap.w.toFixed(0)})`);
  const people = m.dots.reduce((n, d) => n + d.n, 0);
  if (people > cap) out.push(`${people} people on the map, over ${cap}`);
  const spots = new Set(m.dots.map((d) => `${Math.round(d.o.l)}:${Math.round(d.o.t)}`));
  if (spots.size !== m.dots.length) out.push('two dots share a spot');
  if (m.dots.some((d) => d.role !== 'button' || d.tab !== '0' || !/ Open$/.test(d.label))) out.push('a dot can’t be opened by keyboard, or doesn’t say it opens');
  // Each style differs by shape, not by colour alone.
  const by = (style) => m.dots.filter((d) => d.style === style);
  if (by('keep_close').some((d) => !d.ring)) out.push('a Keep close dot has no ring');
  if (by('invest').some((d) => d.stroke === 'none')) out.push('an Invest dot has no outline');
  if (by('rebalance').some((d) => d.dash === 'none')) out.push('a Rebalance? dot isn’t dashed');
  if (by('maintain').some((d) => d.stroke !== 'none')) out.push('a Maintain dot isn’t solid');
  if (m.keys) out.push('a key is on the screen');
  if (m.svg.r > m.page + 0.5) out.push(`the chart runs off the side (${Math.round(m.svg.r)} of ${m.page})`);
  if (m.texts.some((t) => t.size < 9.5)) out.push('text under 10px on the map');
  return out;
}

/**
 * The table's own box: scrolled down and sideways, the heading row stays at
 * the top of the box and the Name column at its left, with nothing showing
 * through either; and the page itself never scrolls sideways.
 */
export async function tableFrozen(page, { settle }) {
  const read = () => page.evaluate(() => {
    const box = document.querySelector('.cc-net-box');
    if (!box) return null;
    const b = box.getBoundingClientRect();
    const heads = [...box.querySelectorAll('thead th')].map((x) => x.getBoundingClientRect());
    const names = [...box.querySelectorAll('tbody .cc-net-name')].map((x) => x.getBoundingClientRect());
    const cs = (el) => getComputedStyle(el).backgroundColor;
    return { top: b.top, left: b.left, x: box.scrollLeft, y: box.scrollTop, maxX: box.scrollWidth - box.clientWidth, maxY: box.scrollHeight - box.clientHeight, headTops: heads.map((h) => Math.round(h.top - b.top)), nameLefts: [...new Set(names.map((n) => Math.round(n.left - b.left)))],
      headLeft: Math.round(heads[0].left - b.left), headFill: cs(box.querySelector('thead th')), nameFill: cs(box.querySelector('tbody .cc-net-name')), sideways: document.documentElement.scrollWidth - window.innerWidth,
      under: names.filter((n) => n.bottom > b.top + 1 && n.top < heads[0].bottom - 1).length };
  });
  const out = [];
  const before = await read();
  if (!before) return ['no table box on the screen'];
  if (before.maxX < 40) out.push('the table doesn’t scroll sideways in its box');
  await page.locator('.cc-net-box').evaluate((b) => { b.scrollTop = Math.min(400, b.scrollHeight); b.scrollLeft = 320; });
  await settle(page, 250);
  const a = await read();
  if (a.x < 100) out.push(`the box only scrolled ${a.x}px sideways`);
  if (a.maxY > 100 && a.y < 100) out.push(`the box only scrolled ${a.y}px down`);
  if (a.headTops.some((t) => Math.abs(t) > 1)) out.push(`the heading row moved (${[...new Set(a.headTops)].join(', ')})`);
  if (a.nameLefts.length !== 1 || Math.abs(a.nameLefts[0]) > 1 || Math.abs(a.headLeft) > 1) out.push(`the Name column moved (${a.nameLefts.join(', ')}; its heading ${a.headLeft})`);
  if (/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(a.headFill) || /rgba\(\d+, \d+, \d+, 0\)|transparent/.test(a.nameFill)) out.push('rows show through the heading row or the Name column');
  if (a.sideways > 0) out.push(`the page scrolls sideways (${a.sideways}px)`);
  return out;
}
