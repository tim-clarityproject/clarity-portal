import { STYLES } from './text';

// The shared parts of every PDF (PDF rule 20): title block, At a glance panel,
// contents list, section heading, text, question and answer, table, bar chart,
// list and signature block. The running header and footer are drawn in render.js.
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
  const h1 = tagNode('H1', parent);
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
  const head = tagNode('H2', sect);
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
      ctx.mark(tagNode('H2', parent), () => ts.draw('Contents', x + PAD, y + PAD + ts.baseline(hs), hs, ctx.t.text));
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
 * or above the standard are coral; below it, a grey outline, so a black and
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
            if (on) doc.rect(x + barX, by, end - barX, g.barH).fill(t.coral);
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
            if (k.kind === 'on') doc.rect(kx, my - 4, 12, 8).fill(t.coral);
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
    const heading = headingUnit(L, sec.title, tagNode('H2', sect));
    heading.section = sections.length;
    const su = [heading, ...blocks.flat()];
    // the heading stays with at least three lines of what follows
    let after = 0;
    for (let i = 1; i < su.length - 1 && after < 3; i += 1) {
      after += su[i].lines;
      if (after < 3) su[i].keep = true;
    }
    // a table's last row stays with a note straight after it
    blocks.forEach((us, bi) => {
      if (us[0].kind === 'thead' && blocks[bi + 1]) us[us.length - 1].keep = blocks[bi + 1].length === 1 && blocks[bi + 1][0].lines <= 2;
    });
    const total = su.reduce((s, u, i) => s + u.h + (i ? u.gap : 0), 0);
    if (total < L.pageH / 3) su.forEach((u) => { u.keep = true; }); // short sections move whole
    su[su.length - 1].keep = false;
    sections.push({ title: sec.title });
    units.push(...su);
  });
  return { units, sections };
}
