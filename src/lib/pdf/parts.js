import { STYLES } from './text';

// The shared parts of every PDF (PDF rule 20): title block, At a glance panel,
// contents list, section heading, text, question and answer, table, bar chart,
// dot chart, list and signature block. The running header and footer are drawn in render.js.
//
// Each part is turned into "units": boxes of known height that the page layout
// (layout.js) places. A unit says how much space it wants above it (`gap`,
// dropped at the top of a page), whether it must stay on the same page as the
// next unit (`keep`), how many lines of text it holds (`lines`, for the
// three-line rules) and how to draw itself.

export const SPACE = { block: 16, section: 24, para: 6 };
const COL_GAP = 16;
const ATOMIC = 99; // `lines` of a unit that never splits: counts as plenty

/** A node in the screen-reader tag tree, created when its first content is drawn. */
export const tagNode = (type, parent, opts) => ({ type, parent, opts, el: null });

const blank = (v) => v == null || String(v).trim() === '';
const paragraphs = (text) => String(text).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);

function textUnits(L, text, style, width, node, x0 = 0) {
  return paragraphs(text).map((p, i) => paraUnit(L, L.ts.wrap(p, style, width), style, node, x0, i === 0 ? 0 : SPACE.para));
}

/** One paragraph. Splits between lines only when it is taller than a whole page. */
function paraUnit(L, lines, style, parent, x0, gap, extra) {
  const node = tagNode('P', parent);
  const make = (ls, g, ex) => ({
    kind: 'para',
    h: Math.max(ls.length * style.lh, ex?.h || 0),
    gap: g,
    lines: ls.length,
    draw(ctx, x, y) {
      ex?.draw(ctx, x, y);
      ctx.mark(node, () => {
        ls.forEach((line, i) => ctx.ts.draw(line, x + x0, y + i * style.lh + ctx.ts.baseline(style), style, ctx.t.text));
      });
    },
    split(maxH) {
      const n = Math.floor(maxH / style.lh);
      if (n < 3 || ls.length - n < 3) return null;
      return [{ ...this, ...make(ls.slice(0, n), g, ex), keep: false }, { ...this, ...make(ls.slice(n), 0, null), keep: this.keep }];
    },
  });
  return make(lines, gap, extra);
}

// ---- title block (page 1) --------------------------------------------------

export function titleUnits(L, spec, parent) {
  const { ts } = L;
  let style = STYLES.title;
  let lines = [];
  for (let size = 20; size >= 14; size -= 1) {
    style = { ...STYLES.title, size, lh: size * 1.2, tracking: size * 0.08 };
    lines = ts.wrap(spec.title, style, L.contentW);
    if (lines.length <= 2) break;
  }
  const details = spec.details.filter((d) => !blank(d)).join(' · ');
  const detailLines = details ? ts.wrap(details, STYLES.details, L.contentW) : [];
  const ruleY = lines.length * style.lh + 10;
  const h = ruleY + 1.5 + (detailLines.length ? 10 + detailLines.length * STYLES.details.lh : 0);
  const h1 = tagNode('H1', parent, { actual: spec.title, title: spec.title });
  const p = tagNode('P', parent);
  return [{
    kind: 'title',
    h,
    gap: 0,
    keep: true,
    lines: ATOMIC,
    draw(ctx, x, y) {
      ctx.mark(h1, () => lines.forEach((line, i) => ts.draw(line, x, y + i * style.lh + ts.baseline(style), style, ctx.t.text)));
      ctx.artifact(() => ctx.doc.rect(x, y + ruleY, 56, 1.5).fill(ctx.t.coral));
      if (detailLines.length) {
        ctx.mark(p, () => detailLines.forEach((line, i) => (
          ts.draw(line, x, y + ruleY + 11.5 + i * STYLES.details.lh + ts.baseline(STYLES.details), STYLES.details, ctx.t.detail)
        )));
      }
    },
  }];
}

// ---- panel (At a glance, contents) ------------------------------------------

function panel(ctx, x, y, w, h) {
  ctx.artifact(() => {
    const d = ctx.doc.roundedRect(x, y, w, h, 4);
    if (ctx.t.panelEdge) d.lineWidth(0.5).fillAndStroke(ctx.t.panel, ctx.t.panelEdge);
    else d.fill(ctx.t.panel);
  });
}
const PAD = 16;

/**
 * At a glance: two to four items, each laid out the same way: a label, the
 * value (a big number when `big`), and an optional note.
 */
export function glanceUnits(L, items, parent) {
  const { ts } = L;
  const list = items.filter((it) => !blank(it.value)).slice(0, 4);
  if (!list.length) return [];
  const innerW = L.contentW - PAD * 2;
  const n = list.length;
  const colW = (innerW - COL_GAP * (n - 1)) / n;
  const cells = list.map((it) => {
    const value = String(it.value);
    const big = it.big && ts.width(value, STYLES.big) <= colW;
    const vStyle = big ? STYLES.big : STYLES.glanceText;
    return {
      label: ts.wrap(it.label, STYLES.smallMedium, colW),
      value: ts.wrap(value, vStyle, colW),
      vStyle,
      note: blank(it.note) ? [] : ts.wrap(it.note, STYLES.small, colW),
    };
  });
  const labelH = Math.max(...cells.map((c) => c.label.length)) * STYLES.smallMedium.lh;
  const valueH = Math.max(...cells.map((c) => c.value.length * c.vStyle.lh));
  const noteH = Math.max(...cells.map((c) => c.note.length)) * STYLES.small.lh;
  const headH = STYLES.panelHeading.lh;
  const h = PAD + headH + 10 + labelH + 4 + valueH + (noteH ? 4 + noteH : 0) + PAD;
  const sect = tagNode('Sect', parent);
  const head = tagNode('H2', sect, { actual: 'At a glance', title: 'At a glance' });
  return [{
    kind: 'glance',
    h,
    gap: SPACE.section,
    keep: false,
    lines: ATOMIC,
    draw(ctx, x, y) {
      panel(ctx, x, y, L.contentW, h);
      const hs = STYLES.panelHeading;
      ctx.mark(head, () => ts.draw('At a glance', x + PAD, y + PAD + ts.baseline(hs), hs, ctx.t.text));
      const top = y + PAD + headH + 10;
      cells.forEach((c, i) => {
        const cx = x + PAD + i * (colW + COL_GAP);
        const p = tagNode('P', sect);
        ctx.mark(p, () => {
          c.label.forEach((line, k) => ts.draw(line, cx, top + k * STYLES.smallMedium.lh + ts.baseline(STYLES.smallMedium), STYLES.smallMedium, ctx.t.detail));
          const vy = top + labelH + 4;
          c.value.forEach((line, k) => ts.draw(line, cx, vy + k * c.vStyle.lh + ts.baseline(c.vStyle), c.vStyle, ctx.t.text));
          const ny = vy + valueH + 4;
          c.note.forEach((line, k) => ts.draw(line, cx, ny + k * STYLES.small.lh + ts.baseline(STYLES.small), STYLES.small, ctx.t.detail));
        });
      });
    },
  }];
}

/** Contents: the sections with their page numbers (only over six pages). */
export function contentsUnits(L, entries, parent) {
  const { ts } = L;
  const s = STYLES.body;
  const numW = 40;
  const rows = entries.map((e) => ({ lines: ts.wrap(e.title, s, L.contentW - PAD * 2 - numW), page: String(e.page) }));
  const headH = STYLES.panelHeading.lh;
  const h = PAD + headH + 8 + rows.reduce((sum, r) => sum + r.lines.length * s.lh + 4, 0) + PAD - 4;
  const toc = tagNode('TOC', parent);
  return [{
    kind: 'contents',
    h,
    gap: SPACE.block,
    keep: false,
    lines: ATOMIC,
    draw(ctx, x, y) {
      panel(ctx, x, y, L.contentW, h);
      const hs = STYLES.panelHeading;
      ctx.mark(tagNode('H2', parent, { actual: 'Contents', title: 'Contents' }), () => ts.draw('Contents', x + PAD, y + PAD + ts.baseline(hs), hs, ctx.t.text));
      let ry = y + PAD + headH + 8;
      rows.forEach((r) => {
        const item = tagNode('TOCI', toc);
        ctx.mark(tagNode('P', item), () => {
          r.lines.forEach((line, k) => ts.draw(line, x + PAD, ry + k * s.lh + ts.baseline(s), s, ctx.t.text));
          ts.draw(r.page, x + L.contentW - PAD, ry + ts.baseline(s), { ...s, features: ['tnum'] }, ctx.t.detail, 'right');
        });
        ry += r.lines.length * s.lh + 4;
      });
    },
  }];
}

// ---- section heading ---------------------------------------------------------

export function headingUnit(L, title, node, { artifact = false } = {}) {
  const { ts } = L;
  const s = STYLES.heading;
  const lines = ts.wrap(title, s, L.contentW);
  return {
    kind: 'heading',
    h: lines.length * s.lh + 8,
    gap: SPACE.section,
    keep: true,
    lines: 0,
    draw(ctx, x, y) {
      const fn = () => lines.forEach((line, i) => ts.draw(line, x, y + i * s.lh + ts.baseline(s), s, ctx.t.text));
      if (artifact) ctx.artifact(fn);
      else ctx.mark(node, fn);
    },
  };
}

// ---- blocks ------------------------------------------------------------------

/** Plain text, paragraph by paragraph, no wider than about 62 characters. */
function textBlock(L, b, parent) {
  const style = b.tone === 'detail' ? STYLES.detail : STYLES.body;
  return textUnits(L, b.text, style, L.measure, parent);
}

/** A question (left) and its answer (right). The question is an H3 for screen readers. */
function fieldBlock(L, b, parent) {
  const { ts } = L;
  const valueW = L.measure; // answers keep to about 62 characters a line
  const labelW = L.contentW - COL_GAP - valueW;
  const labelLines = ts.wrap(b.label, STYLES.label, labelW);
  const h3 = tagNode('H3', parent);
  const label = {
    h: labelLines.length * STYLES.label.lh,
    draw(ctx, x, y) {
      ctx.mark(h3, () => labelLines.forEach((line, i) => (
        ts.draw(line, x, y + i * STYLES.label.lh + ts.baseline(STYLES.label) + 0.5, STYLES.label, ctx.t.text)
      )));
    },
  };
  return paragraphs(b.text).map((p, i) => paraUnit(
    L, ts.wrap(p, STYLES.body, valueW), STYLES.body, parent, labelW + COL_GAP, i === 0 ? 0 : SPACE.para, i === 0 ? label : null,
  ));
}

function listBlock(L, b, parent) {
  const { ts } = L;
  const items = b.items.filter((it) => !blank(it));
  const s = STYLES.body;
  const marks = items.map((_, i) => (b.ordered ? `${i + 1}.` : '•'));
  const markW = Math.max(...marks.map((m) => ts.width(m, s))) + 8;
  const list = tagNode('L', parent, b.ordered ? { title: 'Numbered list' } : undefined);
  return items.map((it, i) => {
    const lines = ts.wrap(it, s, L.measure - markW);
    return {
      kind: 'item',
      h: lines.length * s.lh,
      gap: i === 0 ? 0 : 4,
      lines: lines.length,
      draw(ctx, x, y) {
        const li = tagNode('LI', list);
        ctx.mark(tagNode('Lbl', li), () => ts.draw(marks[i], x, y + ts.baseline(s), s, ctx.t.detail));
        ctx.mark(tagNode('LBody', li), () => lines.forEach((line, k) => ts.draw(line, x + markW, y + k * s.lh + ts.baseline(s), s, ctx.t.text)));
      },
    };
  });
}

/**
 * A table: thin lines between rows only, the column names in grey, numbers
 * lined up on the right. Carries on with "<title>, continued" and the column
 * names when it runs onto another page.
 */
function tableBlock(L, b, parent, title) {
  const { ts } = L;
  const rows = b.rows.filter((r) => r.some((c) => !blank(c)));
  if (!rows.length) return [];
  const total = b.columns.reduce((s, c) => s + (c.width || 1), 0);
  const widths = b.columns.map((c) => ((c.width || 1) / total) * L.contentW);
  const padR = 8;
  const cellW = (i) => widths[i] - (i < widths.length - 1 ? padR : 0);
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((s, w) => s + w, 0));
  const headLines = b.columns.map((c, i) => ts.wrap(c.label, STYLES.th, cellW(i)));
  const headH = Math.max(...headLines.map((l) => l.length)) * STYLES.th.lh + 6;
  const table = tagNode('Table', parent);
  const state = { id: {}, continued: null };

  const drawCell = (ctx, lines, style, i, x, y, colour) => lines.forEach((line, k) => {
    const right = b.columns[i].align === 'right';
    ts.draw(line, right ? x + xs[i] + cellW(i) : x + xs[i], y + k * style.lh + ts.baseline(style), style, colour, right ? 'right' : 'left');
  });

  const headUnit = (artifact) => ({
    kind: 'thead',
    h: headH,
    gap: artifact ? 0 : 0,
    keep: true,
    lines: 0,
    draw(ctx, x, y) {
      const paint = (cellNodes) => headLines.forEach((lines, i) => {
        const fn = () => drawCell(ctx, lines, STYLES.th, i, x, y, ctx.t.detail);
        if (cellNodes) ctx.mark(cellNodes[i], fn);
        else fn();
      });
      if (artifact) ctx.artifact(() => paint(null));
      else {
        const tr = tagNode('TR', table);
        paint(b.columns.map(() => tagNode('TH', tr, { scope: 'Column' })));
      }
      ctx.artifact(() => ctx.doc.moveTo(x, y + headH - 0.375).lineTo(x + L.contentW, y + headH - 0.375).lineWidth(0.75).stroke(ctx.t.line));
    },
  });

  const units = [headUnit(false)];
  rows.forEach((r, ri) => {
    const cells = b.columns.map((c, i) => {
      const style = c.align === 'right' ? STYLES.cellNum : STYLES.cell;
      return { style, lines: blank(r[i]) ? [] : ts.wrap(String(r[i]), style, cellW(i)) };
    });
    const n = Math.max(1, ...cells.map((c) => c.lines.length));
    units.push({
      kind: 'row',
      table: state,
      row: ri,
      h: n * STYLES.cell.lh + 12,
      gap: 0,
      lines: n,
      draw(ctx, x, y, { first }) {
        if (!first) {
          ctx.artifact(() => ctx.doc.moveTo(x, y + 0.25).lineTo(x + L.contentW, y + 0.25).lineWidth(0.5).stroke(ctx.t.line));
        }
        const tr = tagNode('TR', table);
        cells.forEach((c, i) => ctx.mark(tagNode('TD', tr), () => drawCell(ctx, c.lines, c.style, i, x, y + 6, ctx.t.text)));
      },
    });
  });
  state.continued = () => [{ ...headingUnit(L, `${title}, continued`, null, { artifact: true }), gap: 0 }, headUnit(true)];
  return units;
}

/**
 * A bar chart: to scale from zero, the standard marked, the value at the end
 * of each bar, a key underneath and a sentence saying what it means. Bars at
 * or above the standard are green (deep green on light pages, mint on dark); below it, a grey outline, so a black and
 * white print still tells them apart. Never split across pages.
 */
function barsBlock(L, b, parent, maxH) {
  const { ts } = L;
  const W = L.contentW;
  const max = b.max || 100;
  const unit = b.unit ?? '%';
  const std = b.standard?.value;
  const labelW = Math.min(W * 0.36, 180);
  const valueW = 40;
  const barX = labelW + 12;
  const barW = W - barX - valueW;
  const sx = (v) => barX + (Math.max(0, Math.min(max, v)) / max) * barW;
  const fmt = (v) => `${Math.round(v)}${unit}`;
  const keyStyle = STYLES.small;

  const build = (maxLines, rowPad, barH) => {
    const rows = b.rows.map((r) => {
      let lines = ts.wrap(r.label, STYLES.cell, labelW);
      if (lines.length > maxLines) {
        // the full name is in the table; the chart shortens it with an ellipsis
        lines = [...lines.slice(0, maxLines - 1), ts.fit(lines.slice(maxLines - 1).join(' '), STYLES.cell, labelW)];
      }
      return { ...r, lines, h: lines.length * STYLES.cell.lh + rowPad };
    });
    return { rows, barH, rowsH: rows.reduce((s, r) => s + r.h, 0) };
  };
  let g = build(2, 6, 8);
  const topH = std != null ? 16 : 4;
  const axisH = 22;
  const keyItems = [
    { kind: 'on', text: b.keyAbove || 'At or above the standard' },
    { kind: 'off', text: b.keyBelow || 'Below the standard' },
    ...(std != null ? [{ kind: 'std', text: b.keyStandard || `The standard, ${fmt(std)}` }] : []),
  ].map((k) => ({ ...k, w: 18 + ts.width(k.text, keyStyle) }));
  // key items flow onto a second line when they don't fit
  const keyLines = [];
  keyItems.forEach((k) => {
    const line = keyLines[keyLines.length - 1];
    const used = line ? line.reduce((s, it) => s + it.w + 16, 0) : Infinity;
    if (!line || used + k.w > W) keyLines.push([k]);
    else line.push(k);
  });
  const keyH = keyLines.length * keyStyle.lh;
  const sentence = blank(b.sentence) ? [] : ts.wrap(b.sentence, STYLES.body, L.measure);
  const fixedH = topH + axisH + 12 + keyH + (sentence.length ? 10 + sentence.length * STYLES.body.lh : 0);
  if (fixedH + g.rowsH > maxH) g = build(1, 3, 7);
  if (fixedH + g.rowsH > maxH) g = build(1, 1, 6);
  const h = fixedH + g.rowsH;
  const figure = tagNode('Figure', parent, { alt: b.alt });
  const p = tagNode('P', parent);

  return [{
    kind: 'chart',
    h,
    gap: 0,
    lines: ATOMIC,
    draw(ctx, x, y) {
      const { doc, t } = ctx;
      ctx.mark(figure, () => {
        const top = y + topH;
        const bottom = top + g.rowsH;
        const values = [];
        let ry = top;
        g.rows.forEach((r) => {
          r.lines.forEach((line, k) => ts.draw(line, x, ry + k * STYLES.cell.lh + ts.baseline(STYLES.cell), STYLES.cell, t.text));
          const by = ry + STYLES.cell.lh / 2 - g.barH / 2;
          const on = std == null || r.value >= std;
          const end = sx(r.value);
          if (end - barX > 0.5) {
            if (on) doc.rect(x + barX, by, end - barX, g.barH).fill(t.good);
            else doc.rect(x + barX + 0.375, by + 0.375, Math.max(0, end - barX - 0.75), g.barH - 0.75).lineWidth(0.75).stroke(t.detail);
          }
          values.push({ text: fmt(r.value), x: x + end + 6, y: ry });
          ry += r.h;
        });
        // the scale, from zero
        doc.moveTo(x + barX, bottom + 4).lineTo(x + barX + barW, bottom + 4).lineWidth(0.5).stroke(t.line);
        [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
          const tx = x + barX + f * barW;
          doc.moveTo(tx, bottom + 4).lineTo(tx, bottom + 7).lineWidth(0.5).stroke(t.line);
          const label = fmt(f * max);
          ts.draw(label, tx - ts.width(label, STYLES.small) / 2, bottom + 8 + ts.baseline(STYLES.small), STYLES.small, t.detail);
        });
        if (std != null) {
          const lx = x + sx(std);
          doc.moveTo(lx, top - 4).lineTo(lx, bottom + 4).lineWidth(0.75).dash(2, { space: 2 }).stroke(t.text).undash();
          const label = `Standard ${fmt(std)}`;
          ts.draw(label, lx - ts.width(label, STYLES.small) / 2, y + ts.baseline(STYLES.small) - 1, STYLES.small, t.text);
        }
        // each value sits on a patch of page colour so the standard line never runs through it
        values.forEach((v) => {
          doc.rect(v.x - 2, v.y + 0.5, ts.width(v.text, STYLES.barValue) + 4, STYLES.cell.lh - 1).fill(t.page);
          ts.draw(v.text, v.x, v.y + ts.baseline(STYLES.barValue), STYLES.barValue, t.text);
        });
        // the key
        let ky = bottom + axisH + 12;
        keyLines.forEach((line) => {
          let kx = x;
          line.forEach((k) => {
            const my = ky + keyStyle.lh / 2;
            if (k.kind === 'on') doc.rect(kx, my - 4, 12, 8).fill(t.good);
            if (k.kind === 'off') doc.rect(kx + 0.375, my - 3.625, 11.25, 7.25).lineWidth(0.75).stroke(t.detail);
            if (k.kind === 'std') doc.moveTo(kx + 6, my - 5).lineTo(kx + 6, my + 5).lineWidth(0.75).dash(2, { space: 2 }).stroke(t.text).undash();
            ts.draw(k.text, kx + 18, ky + ts.baseline(keyStyle), keyStyle, t.text);
            kx += k.w + 16;
          });
          ky += keyStyle.lh;
        });
      });
      if (sentence.length) {
        const sy = y + h - sentence.length * STYLES.body.lh;
        ctx.mark(p, () => sentence.forEach((line, i) => ts.draw(line, x, sy + i * STYLES.body.lh + ts.baseline(STYLES.body), STYLES.body, t.text)));
      }
    },
  }];
}

/**
 * A dot chart: one dot per item, placed by a category along the bottom (such
 * as progress) and a value from zero up the side (such as strategic
 * importance), split into four quadrants by two centre lines (named only when
 * `quadrants` is given; the Health Check leaves them unnamed, as on its
 * results page). Dots in the good quadrant are filled green; the rest are grey outlines, so a black
 * and white print still tells them apart. Each dot holds its number. Names sit
 * beside the dots only when every one fits without touching another label, a
 * dot, a line or the edge; otherwise a numbered list sits beside or under the
 * chart. Never split across pages.
 *
 * b: { points: [{ n, label, x (1..k), y (0..yMax), good }], xLabels: [k words],
 *      yMax, xCentre, yCentre, axisX, axisY, quadrants?: { topLeft, topRight,
 *      bottomLeft, bottomRight }, keyGood, keyOther, listNote, sentence, alt }
 */
function dotsBlock(L, b, parent, maxH) {
  const { ts } = L;
  const W = L.contentW;
  const k = b.xLabels.length;
  const yMax = b.yMax || 100;
  const unit = b.unit ?? '%';
  const tick = STYLES.small;
  const numStyle = { font: 'nekst', size: 8.5, lh: 10, features: ['tnum'] };
  const nameStyle = STYLES.small;
  const R = 8; // dot radius: room for a two-figure number at 8.5pt
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const yLabW = Math.max(...yTicks.map((v) => ts.width(`${Math.round(v)}${unit}`, tick))) + 8;
  const pts0 = b.points.filter((p) => p.x != null && p.y != null);
  const listRows = pts0.slice().sort((a, c) => a.n - c.n);

  // Geometry for a plot of a given width and height, its top-left at (0, top).
  const geometry = (plotW, plotH, top) => {
    const Lx = yLabW;
    const pad = R + 3; // the scale stops short of the frame so dots never cross it
    const xs = (v) => Lx + ((v - 0.5) / k) * plotW;
    const ys = (v) => top + pad + (1 - v / yMax) * (plotH - pad * 2);
    return { Lx, plotW, plotH, top, xs, ys, mx: xs(b.xCentre), my: ys(b.yCentre) };
  };

  // Dots at their true places, then pushed apart (and kept inside the frame)
  // until none touch.
  const placeDots = (gm) => {
    const pts = pts0.map((p) => ({ ...p, cx: gm.xs(p.x), cy: gm.ys(p.y) }));
    const seen = {};
    pts.forEach((p) => {
      const key = `${p.x}|${Math.round(p.y)}`;
      seen[key] = (seen[key] || 0) + 1;
      const s = seen[key] - 1;
      if (s) p.cx += (s % 2 ? 1 : -1) * Math.ceil(s / 2) * 0.5;
    });
    const minX = gm.Lx + R + 1;
    const maxX = gm.Lx + gm.plotW - R - 1;
    const minY = gm.top + R + 1;
    const maxY = gm.top + gm.plotH - R - 1;
    const need = R * 2 + 2;
    for (let pass = 0; pass < 400; pass += 1) {
      let moved = false;
      for (let i = 0; i < pts.length; i += 1) {
        for (let j = 0; j < i; j += 1) {
          const p = pts[i];
          const o = pts[j];
          let dx = p.cx - o.cx;
          let dy = p.cy - o.cy;
          let d = Math.hypot(dx, dy);
          if (d >= need - 0.01) continue;
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (need - d) / 2 + 0.1;
          p.cx += (dx / d) * push; p.cy += (dy / d) * push;
          o.cx -= (dx / d) * push; o.cy -= (dy / d) * push;
          moved = true;
        }
      }
      pts.forEach((p) => {
        p.cx = Math.min(maxX, Math.max(minX, p.cx));
        p.cy = Math.min(maxY, Math.max(minY, p.cy));
      });
      if (!moved) break;
    }
    return pts;
  };

  // Names beside the dots, or null when any one cannot be placed cleanly.
  const placeNames = (gm, pts) => {
    if (pts.length > 12) return null;
    const boxes = pts.map((p) => [p.cx - R - 1, p.cy - R - 1, p.cx + R + 1, p.cy + R + 1]);
    const lines = [[gm.mx - 1, gm.top, gm.mx + 1, gm.top + gm.plotH], [gm.Lx, gm.my - 1, gm.Lx + gm.plotW, gm.my + 1]];
    const frame = [gm.Lx + 2, gm.top + 2, gm.Lx + gm.plotW - 2, gm.top + gm.plotH - 2];
    const clash = (bx, list) => list.some((c) => bx[0] < c[2] + 2 && bx[2] > c[0] - 2 && bx[1] < c[3] + 1 && bx[3] > c[1] - 1);
    const placed = [];
    for (const p of pts) {
      const ls = ts.wrap(p.label, nameStyle, 120);
      if (ls.length > 2) return null;
      const w = Math.max(...ls.map((l) => ts.width(l, nameStyle)));
      const h = ls.length * nameStyle.lh;
      const g = R + 4;
      const cands = [
        [p.cx + g, p.cy - h / 2], [p.cx - g - w, p.cy - h / 2],
        [p.cx - w / 2, p.cy - g - h], [p.cx - w / 2, p.cy + g],
        [p.cx + g, p.cy - h - 2], [p.cx + g, p.cy + 2], [p.cx - g - w, p.cy - h - 2], [p.cx - g - w, p.cy + 2],
      ];
      const spot = cands.map(([x0, y0]) => [x0, y0, x0 + w, y0 + h]).find((bx) => (
        bx[0] >= frame[0] && bx[2] <= frame[2] && bx[1] >= frame[1] && bx[3] <= frame[3]
        && !clash(bx, boxes) && !clash(bx, lines) && !clash(bx, placed.map((q) => q.box))
      ));
      if (!spot) return null;
      placed.push({ box: spot, lines: ls });
    }
    return placed;
  };

  // The numbered list: one line per item, shortened with an ellipsis (the
  // full names are in the table that follows).
  const listLines = (colW) => listRows.map((p) => ts.fit(`${p.n}. ${p.label}`, nameStyle, colW));

  const titleH = STYLES.smallMedium.lh + 4;
  const bandH = b.quadrants ? tick.lh + 4 : 0; // the quadrant names, when given
  const belowH = 4 + tick.lh + bandH + 4 + STYLES.smallMedium.lh;
  const keyItems = [
    { good: true, text: b.keyGood },
    { good: false, text: b.keyOther },
    ...(b.listNote ? [{ note: true, text: b.listNote }] : []),
  ].map((it) => ({ ...it, w: (it.note ? 0 : 16) + ts.width(it.text, STYLES.small) }));
  const keyLines = [];
  keyItems.forEach((it) => {
    const line = keyLines[keyLines.length - 1];
    const used = line ? line.reduce((s, x) => s + x.w + 16, 0) : Infinity;
    if (!line || used + it.w > W) keyLines.push([it]);
    else line.push(it);
  });
  const keyH = keyLines.length * STYLES.small.lh;
  const sentence = blank(b.sentence) ? [] : ts.wrap(b.sentence, STYLES.body, L.measure);
  const sentH = sentence.length ? 10 + sentence.length * STYLES.body.lh : 0;

  // Try, in order: names beside dots; a list beside the chart; a list under it.
  const plotTop = titleH + bandH;
  const fixed = plotTop + belowH + 12 + keyH + sentH;
  const plotH = Math.max(150, Math.min(240, maxH - fixed));
  let mode = 'names';
  let gm = geometry(W - yLabW, plotH, plotTop);
  let pts = placeDots(gm);
  let names = placeNames(gm, pts);
  let list = [];
  let listCols = 1;
  let listColW = 0;
  let listH = 0;
  const listW = 170;
  if (!names) {
    if (pts0.length * nameStyle.lh <= plotH) {
      mode = 'beside';
      gm = geometry(W - yLabW - 16 - listW, plotH, plotTop);
      pts = placeDots(gm);
      listColW = listW;
      list = listLines(listW);
    } else {
      mode = 'under';
      listCols = 3;
      listColW = (W - 32) / 3;
      list = listLines(listColW);
      listH = 10 + Math.ceil(list.length / listCols) * nameStyle.lh;
    }
  }
  const h = fixed + plotH + listH;
  const figure = tagNode('Figure', parent, { alt: b.alt });
  const p = tagNode('P', parent);

  return [{
    kind: 'chart',
    h,
    gap: 0,
    lines: ATOMIC,
    draw(ctx, x, y) {
      const { doc, t } = ctx;
      const X = (v) => x + v;
      const Y = (v) => y + v;
      ctx.mark(figure, () => {
        const s = STYLES.smallMedium;
        ts.draw(b.axisY, X(0), Y(ts.baseline(s)), s, t.text);
        // quadrant names: above the frame for the top two, under the
        // progress words for the bottom two, centred on their half
        const halves = [[gm.Lx, gm.mx], [gm.mx, gm.Lx + gm.plotW]];
        const qLabel = (text, [a, c], yy) => {
          const fitText = ts.fit(text, tick, c - a - 8);
          ts.draw(fitText, X((a + c) / 2 - ts.width(fitText, tick) / 2), Y(yy + ts.baseline(tick)), tick, t.detail);
        };
        if (b.quadrants) {
          qLabel(b.quadrants.topLeft, halves[0], titleH);
          qLabel(b.quadrants.topRight, halves[1], titleH);
        }
        const fTop = gm.top;
        const fBot = gm.top + gm.plotH;
        // frame: the zero line and the side, then the centre lines with a
        // small gap where they cross
        doc.moveTo(X(gm.Lx), Y(fTop)).lineTo(X(gm.Lx), Y(fBot)).lineTo(X(gm.Lx + gm.plotW), Y(fBot)).lineWidth(0.5).stroke(t.detail);
        const gap = 5;
        doc.moveTo(X(gm.Lx), Y(gm.my)).lineTo(X(gm.mx - gap), Y(gm.my))
          .moveTo(X(gm.mx + gap), Y(gm.my)).lineTo(X(gm.Lx + gm.plotW), Y(gm.my))
          .moveTo(X(gm.mx), Y(fTop)).lineTo(X(gm.mx), Y(gm.my - gap))
          .moveTo(X(gm.mx), Y(gm.my + gap)).lineTo(X(gm.mx), Y(fBot))
          .lineWidth(0.5).stroke(t.line);
        yTicks.forEach((v) => {
          const ty = gm.ys(v);
          doc.moveTo(X(gm.Lx - 3), Y(ty)).lineTo(X(gm.Lx), Y(ty)).lineWidth(0.5).stroke(t.detail);
          ts.draw(`${Math.round(v)}${unit}`, X(gm.Lx - 6), Y(ty + tick.size * 0.35), tick, t.detail, 'right');
        });
        b.xLabels.forEach((word, i) => {
          const tx = gm.xs(i + 1);
          doc.moveTo(X(tx), Y(fBot)).lineTo(X(tx), Y(fBot + 3)).lineWidth(0.5).stroke(t.detail);
          const fitWord = ts.fit(word, tick, gm.plotW / k - 2);
          ts.draw(fitWord, X(tx - ts.width(fitWord, tick) / 2), Y(fBot + 4 + ts.baseline(tick)), tick, t.detail);
        });
        const bandY = fBot + 4 + tick.lh + 4;
        if (b.quadrants) {
          qLabel(b.quadrants.bottomLeft, halves[0], bandY);
          qLabel(b.quadrants.bottomRight, halves[1], bandY);
        }
        const axisXY = bandY + bandH;
        ts.draw(b.axisX, X(gm.Lx + gm.plotW / 2 - ts.width(b.axisX, s) / 2), Y(axisXY + ts.baseline(s)), s, t.text);

        // the dots, each with its number
        pts.forEach((pt) => {
          if (pt.good) doc.circle(X(pt.cx), Y(pt.cy), R).fill(t.good);
          else doc.circle(X(pt.cx), Y(pt.cy), R - 0.375).lineWidth(0.75).fillAndStroke(t.page, t.detail);
          const num = String(pt.n);
          ts.draw(num, X(pt.cx - ts.width(num, numStyle) / 2), Y(pt.cy + numStyle.size * 0.36), numStyle, pt.good ? t.onGood : t.text);
        });
        if (names) {
          names.forEach((nm) => nm.lines.forEach((line, i) => (
            ts.draw(line, X(nm.box[0]), Y(nm.box[1] + i * nameStyle.lh + ts.baseline(nameStyle)), nameStyle, t.text)
          )));
        }
        if (mode === 'beside') {
          const lx = gm.Lx + gm.plotW + 16;
          list.forEach((line, i) => ts.draw(line, X(lx), Y(fTop + i * nameStyle.lh + ts.baseline(nameStyle)), nameStyle, t.text));
        }
        let ky = axisXY + STYLES.smallMedium.lh;
        if (mode === 'under') {
          const rowsPer = Math.ceil(list.length / listCols);
          list.forEach((line, i) => {
            const col = Math.floor(i / rowsPer);
            ts.draw(line, X(col * (listColW + 16)), Y(ky + 10 + (i % rowsPer) * nameStyle.lh + ts.baseline(nameStyle)), nameStyle, t.text);
          });
          ky += listH;
        }
        // the key
        ky += 12;
        keyLines.forEach((line) => {
          let kx = 0;
          line.forEach((it) => {
            const my = ky + STYLES.small.lh / 2;
            if (!it.note) {
              if (it.good) doc.circle(X(kx + 5), Y(my), 5).fill(t.good);
              else doc.circle(X(kx + 5), Y(my), 4.6).lineWidth(0.75).fillAndStroke(t.page, t.detail);
            }
            ts.draw(it.text, X(kx + (it.note ? 0 : 16)), Y(ky + ts.baseline(STYLES.small)), STYLES.small, t.text);
            kx += it.w + 16;
          });
          ky += STYLES.small.lh;
        });
      });
      if (sentence.length) {
        const sy = y + h - sentence.length * STYLES.body.lh;
        ctx.mark(p, () => sentence.forEach((line, i) => ts.draw(line, x, sy + i * STYLES.body.lh + ts.baseline(STYLES.body), STYLES.body, t.text)));
      }
    },
  }];
}

/** Signature block for agreements: a signature, name and date line for each person. */
function signatureBlock(L, b, parent) {
  const { ts } = L;
  const parties = b.parties.slice(0, 4);
  const colW = (L.contentW - COL_GAP * 2) / 2;
  const partyH = STYLES.label.lh + 3 * (32 + STYLES.small.lh);
  const rowsN = Math.ceil(parties.length / 2);
  const h = rowsN * partyH + (rowsN - 1) * SPACE.block;
  const sect = tagNode('Div', parent);
  return [{
    kind: 'signature',
    h,
    gap: 0,
    lines: ATOMIC,
    draw(ctx, x, y) {
      parties.forEach((pt, i) => {
        const px = x + (i % 2) * (colW + COL_GAP * 2);
        let py = y + Math.floor(i / 2) * (partyH + SPACE.block);
        ctx.mark(tagNode('P', sect), () => ts.draw(pt.role, px, py + ts.baseline(STYLES.label), STYLES.label, ctx.t.text));
        py += STYLES.label.lh;
        [['Signature', ''], ['Name', pt.name || ''], ['Date', pt.date || '']].forEach(([caption, value]) => {
          py += 32;
          if (value) ctx.mark(tagNode('P', sect), () => ts.draw(value, px, py - 6, STYLES.body, ctx.t.text));
          ctx.artifact(() => ctx.doc.moveTo(px, py).lineTo(px + colW, py).lineWidth(0.75).stroke(ctx.t.detail));
          ctx.mark(tagNode('P', sect), () => ts.draw(caption, px, py + 3 + ts.baseline(STYLES.small), STYLES.small, ctx.t.detail));
          py += STYLES.small.lh;
        });
      });
    },
  }];
}

// ---- keep rules ----------------------------------------------------------------

/**
 * Within a run of units that may split between them (paragraphs of one answer,
 * list items, table rows), a break is allowed only with at least three lines
 * before it and three after it (PDF rules 26 and 28).
 */
function threeLines(units) {
  const counts = units.map((u) => u.lines);
  const totalLines = counts.reduce((s, n) => s + n, 0);
  let before = 0;
  units.forEach((u, i) => {
    before += counts[i];
    if (i < units.length - 1 && (before < 3 || totalLines - before < 3)) u.keep = true;
  });
}

/**
 * All the units of a document, in order.
 * @param {Object} L layout context: ts, contentW, measure, pageH (a full later page)
 * @param {Object} spec the document (see render.js)
 * @param {{title: string, page: number}[]|null} contents
 * @param {Object} root the tag tree's Document node
 */
export function flatten(L, spec, contents, root) {
  const units = [...titleUnits(L, spec, root), ...glanceUnits(L, spec.glance || [], root)];
  if (contents) units.push(...contentsUnits(L, contents, root));
  const sections = [];
  (spec.sections || []).forEach((sec) => {
    const sect = tagNode('Sect', root);
    const blocks = [];
    (sec.blocks || []).forEach((b) => {
      let us = [];
      if (b.type === 'text' && !blank(b.text)) us = textBlock(L, b, sect);
      if (b.type === 'field' && !blank(b.text)) us = fieldBlock(L, b, sect);
      if (b.type === 'list' && b.items?.some((it) => !blank(it))) us = listBlock(L, b, sect);
      if (b.type === 'table' && b.rows?.length) us = tableBlock(L, b, sect, b.title || sec.title);
      if (b.type === 'bars' && b.rows?.length) us = barsBlock(L, b, sect, L.pageH - 60);
      if (b.type === 'dots' && b.points?.some((pt) => pt.x != null)) us = dotsBlock(L, b, sect, L.pageH - 60);
      if (b.type === 'signature' && b.parties?.length) us = signatureBlock(L, b, sect);
      if (!us.length) return;
      L.block = (L.block || 0) + 1;
      us.forEach((u) => { u.group = L.block; });
      if (['field', 'text', 'list'].includes(b.type)) threeLines(us);
      if (b.type === 'table') threeLines(us.slice(1));
      us[0].gap = blocks.length ? SPACE.block : 0;
      blocks.push(us);
    });
    if (!blocks.length) return; // a section with nothing in it is left out with its heading
    const heading = headingUnit(L, sec.title, tagNode('H2', sect, { actual: sec.title, title: sec.title }));
    heading.section = sections.length;
    const su = [heading, ...blocks.flat()];
    // the heading stays with at least three lines of what follows
    let after = 0;
    for (let i = 1; i < su.length - 1 && after < 3; i += 1) {
      after += su[i].lines;
      if (after < 3) su[i].keep = true;
    }
    // a table's last row stays with a short note (up to three lines) straight after it, so the note never sits alone on a page
    blocks.forEach((us, bi) => {
      if (us[0].kind === 'thead' && blocks[bi + 1]) us[us.length - 1].keep = blocks[bi + 1].length === 1 && blocks[bi + 1][0].lines <= 3;
    });
    const total = su.reduce((s, u, i) => s + u.h + (i ? u.gap : 0), 0);
    if (total < L.pageH / 3) su.forEach((u) => { u.keep = true; }); // short sections move whole
    su[su.length - 1].keep = false;
    sections.push({ title: sec.title });
    units.push(...su);
  });
  return { units, sections };
}
