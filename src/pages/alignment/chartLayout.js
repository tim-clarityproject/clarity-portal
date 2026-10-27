// Strategic Alignment Health Check: chart layout. A direct port of the
// mock-up's chart() geometry (dot field, point separation, label placement),
// with the drawing left to AlignmentChart.jsx. Pure and DOM-free except for
// the optional text measuring function passed in.

import { healthCheckState } from '../../lib/alignmentScore.js';

export const PROGRESS_WORDS = ['Embryonic', 'Bad', 'Fair', 'Good', 'Excellent'];

// Today's three drawn areas, from the four states (healthCheckState): moving
// well is the good area, needs attention the behind area, and needs managing
// and less important (Embryonic included) the neutral ring. The restyle draws
// the four states on their own.
const AREA = { moving_well: 'mi', needs_attention: 'co', needs_managing: 'n', less_important: 'n' };

/** Quadrant colour key: 'mi' mint, 'co' coral, 'n' white ring. */
export function quadrant(progress, importancePct) {
  return AREA[healthCheckState(progress, importancePct)] ?? 'n';
}

/** Shorten very long names so a label cannot run off the chart. */
export function shortLabel(text, max) {
  // Counted and cut in whole characters, so an emoji is never split in half.
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

/** Break a name into lines of at most `max` characters, at spaces. */
export function wrapLabel(text, max) {
  // A word longer than a line is cut into line-sized pieces.
  const words = text.split(/\s+/).filter(Boolean).flatMap((w) => (Array.from(w).length > max ? w.match(new RegExp(`.{1,${max}}`, 'gu')) : [w]));
  const lines = [];
  let line = '';
  words.forEach((w) => {
    if (line && (line + ' ' + w).length > max) { lines.push(line); line = w; } else { line = line ? `${line} ${w}` : w; }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

/**
 * @param {{n: number, text: string, importance: number, progress: number|null}[]} rows
 *   ranked projects; n is the attention rank (the number shown in the dot)
 * @param {'d'|'p'} mode desktop or phone geometry
 * @param {(text: string, fontSize: number) => number} measure text width
 * @param {{wrapChars?: number, height?: number, fontSize?: number, avoidLines?: boolean}} [opts]
 *   Options used by the PDF (the page uses none): wrapChars wraps names onto
 *   lines of that length instead of shortening them with an ellipsis; height
 *   and fontSize override the plot height and label size; avoidLines keeps
 *   labels off the centre lines.
 */
export function layoutChart(rows, mode, measure, opts = {}) {
  const D = mode === 'd';
  const W = D ? 780 : 300;
  const H = opts.height ?? (D ? 470 : 330);
  const L = D ? 58 : 34;
  const Rm = D ? 14 : 8;
  const T = D ? 10 : 24;
  const B = D ? 50 : 40;
  const pw = W - L - Rm;
  const ph = H - T - B;
  const xs = (v) => L + ((v - 0.5) / 5) * pw;
  const ys = (p) => T + ph - ((6 + p * 0.88) / 100) * ph;
  const mx = xs(3);
  const my = ys(50);
  const gap = D ? 9 : 7;
  const sp = D ? 13 : 10;
  const r = D ? 14 : 11;

  // Points, with identical scores nudged sideways.
  const pts = [];
  const seen = {};
  rows.forEach((p) => {
    if (p.progress == null) return;
    let x = xs(p.progress);
    const y = ys(p.importance);
    const key = `${p.progress}|${Math.round(p.importance)}`;
    seen[key] = (seen[key] || 0) + 1;
    const k = seen[key] - 1;
    if (k) x += (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.6);
    pts.push({ ...p, x, y, r, q: quadrant(p.progress, p.importance) });
  });
  // Push overlapping dots apart: the mock-up's single pass (later dots move
  // away from earlier ones)...
  pts.forEach((p, i) => {
    for (let j = 0; j < i; j += 1) {
      const o = pts[j];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const need = p.r + o.r + 3;
      if (d < need) {
        const push = Math.sqrt(Math.max(0, need * need - dy * dy)) - Math.abs(dx);
        p.x += (dx >= 0 ? 1 : -1) * (push + 1);
      }
    }
  });
  // ...then, only if dots still touch (three or more identical scores that
  // squeeze between neighbours), spread both dots of each touching pair.
  for (let pass = 0; pass < 200; pass += 1) {
    let moved = false;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const p = pts[i];
        const o = pts[j];
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const need = p.r + o.r + 3;
        if (d < need - 0.01) {
          const sideways = Math.sqrt(Math.max(0, need * need - dy * dy));
          const shift = (sideways - Math.abs(dx)) / 2 + 0.5;
          const dir = dx >= 0 ? 1 : -1;
          p.x += dir * shift;
          o.x -= dir * shift;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Labels: choose the least-overlapping spot around each dot.
  const fs = opts.fontSize ?? (D ? 12 : 10);
  const lh = fs + 3;
  const labs = [];
  const boxes = pts.map((p) => [p.x - p.r - 1, p.y - p.r - 1, p.x + p.r + 1, p.y + p.r + 1]);
  const hit = (b) => {
    let o = 0;
    boxes.concat(labs.map((l) => l.b)).forEach((c) => {
      const w = Math.min(b[2], c[2]) - Math.max(b[0], c[0]);
      const h = Math.min(b[3], c[3]) - Math.max(b[1], c[1]);
      if (w > -2 && h > -1) o += (w + 2) * (h + 1);
    });
    if (opts.avoidLines) {
      // A label that crosses a centre line is as bad as one touching a dot.
      if (b[0] < mx + 1 && b[2] > mx - 1 && b[3] > T && b[1] < T + ph) o += 40 * (b[3] - b[1]);
      if (b[1] < my + 1 && b[3] > my - 1 && b[2] > L && b[0] < L + pw) o += 40 * (b[2] - b[0]);
    }
    if (b[0] < L - 6) o += (L - 6 - b[0]) * 60;
    if (b[2] > W + 4) o += (b[2] - W - 4) * 60;
    if (b[1] < T) o += (T - b[1]) * 60;
    if (b[3] > T + ph) o += (b[3] - T - ph) * 60;
    return o;
  };
  const neighbours = (p) => pts.filter((q) => Math.abs(q.x - p.x) < 90 && Math.abs(q.y - p.y) < 40).length;
  const order = pts.slice().sort((a, b) => neighbours(b) - neighbours(a));
  const maxChars = D ? 34 : 22;
  order.forEach((p) => {
    const lines = opts.wrapChars ? wrapLabel(p.text, opts.wrapChars) : [shortLabel(p.text, maxChars)];
    const w = Math.max(...lines.map((l) => measure(l, fs))) + 2;
    const hh = lines.length * lh;
    const extra = (hh - lh) / 2;
    const g = 7;
    const c = [];
    [0, -lh * 0.8, lh * 0.8].forEach((dy, i) => {
      const y = p.y + dy;
      const gg = g + (i ? -2 : 0);
      c.push({ x: p.x + p.r + gg, y, a: 'start', b: [p.x + p.r + gg, y - hh / 2, p.x + p.r + gg + w, y + hh / 2], pen: i ? 8 : 0 });
      c.push({ x: p.x - p.r - gg, y, a: 'end', b: [p.x - p.r - gg - w, y - hh / 2, p.x - p.r - gg, y + hh / 2], pen: i ? 10 : 2 });
    });
    [p.y - p.r - g - 1 - extra, p.y + p.r + g + 1 + extra].forEach((y, i) => {
      [0, -w / 2 + p.r, w / 2 - p.r].forEach((dx, j) => {
        const cx = p.x + dx;
        c.push({ x: cx, y, a: 'middle', b: [cx - w / 2, y - hh / 2, cx + w / 2, y + hh / 2], pen: 4 + i + j * 3 });
      });
    });
    let best = null;
    let bestScore = 1e9;
    c.forEach((k) => {
      const sc = hit(k.b) * 10 + k.pen;
      if (sc < bestScore) { bestScore = sc; best = k; }
    });
    labs.push({ ...best, p, text: lines.join(' '), lines });
  });

  return { W, H, L, T, pw, ph, mx, my, gap, sp, fs, D, pts, labs, xs, ys };
}
