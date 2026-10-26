// Measuring, wrapping and drawing text for the PDF template. Every line is
// broken here, before anything is drawn, so the page layout knows exactly how
// tall each block is. Lines break only between words (no hyphens); a single
// word too long for its column is split between letters so it cannot run off.
//
// Each style names a chain of fonts. A character the first font lacks (an
// emoji, a rare accent) is drawn in the next font in the chain that has it.

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('en', { granularity: 'grapheme' })
  : null;

/** Characters as people see them (an emoji with its joiners stays whole). */
export const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

/** Text styles, in points. `font` names a chain in FONT_CHAINS. */
export const STYLES = {
  title: { font: 'nekst', size: 20, lh: 24, tracking: 1.6, upper: true },
  heading: { font: 'nekst', size: 11, lh: 15, tracking: 1.1, upper: true },
  panelHeading: { font: 'nekst', size: 9, lh: 12, tracking: 1, upper: true },
  details: { font: 'body', size: 9, lh: 13.5 },
  body: { font: 'body', size: 10, lh: 15 },
  label: { font: 'medium', size: 9.5, lh: 14 },
  detail: { font: 'body', size: 9, lh: 13.5 },
  cell: { font: 'body', size: 9.5, lh: 13.5 },
  cellNum: { font: 'body', size: 9.5, lh: 13.5, features: ['tnum'] },
  th: { font: 'medium', size: 8.5, lh: 12 },
  small: { font: 'body', size: 8.5, lh: 12 },
  smallMedium: { font: 'medium', size: 8.5, lh: 12 },
  big: { font: 'light', size: 24, lh: 28, features: ['tnum'] },
  glanceText: { font: 'medium', size: 12, lh: 16 },
  barValue: { font: 'medium', size: 9, lh: 12, features: ['tnum'] },
};

/**
 * @param {import('pdfkit')} doc a document with every font in `chains` registered
 * @param {Object<string, string[]>} chains style font name -> registered font names, in order
 */
export function createTypesetter(doc, chains) {
  const fonts = new Map();
  const fontkitFont = (name) => {
    if (!fonts.has(name)) {
      doc.font(name);
      fonts.set(name, doc._font.font);
    }
    return fonts.get(name);
  };
  const has = (name, g) => {
    const f = fontkitFont(name);
    for (const ch of g) {
      const cp = ch.codePointAt(0);
      if (cp === 0x200d || cp === 0xfe0f || cp === 0xfe0e) continue; // joiners and selectors
      if (!f.hasGlyphForCodePoint(cp)) return false;
    }
    return true;
  };
  const pickCache = new Map();
  const pick = (chainName, g) => {
    const key = `${chainName}\u0000${g}`;
    if (pickCache.has(key)) return pickCache.get(key);
    const chain = chains[chainName];
    // An emoji sequence (with a joiner or selector) goes to the first font that
    // draws all of it; otherwise the first font with the character.
    let name = chain.find((n) => has(n, g)) || chain[0];
    if (/\p{Cf}|\p{Mn}|\p{Me}/u.test(g)) { // a joiner, selector or keycap mark
      const emoji = chain.find((n) => n.startsWith('Emoji') && has(n, g));
      if (emoji) name = emoji;
    }
    pickCache.set(key, name);
    return name;
  };

  /** The text split into runs that each use one font. */
  function runs(text, style) {
    const out = [];
    for (const g of graphemes(text)) {
      const last = out[out.length - 1];
      const name = pick(style.font, g);
      if (last && last.font === name) last.text += g;
      else out.push({ font: name, text: g });
    }
    return out;
  }

  const opts = (style) => ({ characterSpacing: style.tracking || 0, features: style.features });
  const widthCache = new Map();

  /** Width of one line of text, in points. */
  function width(text, style) {
    const t = style.upper ? text.toLocaleUpperCase('en-GB') : text;
    const key = `${style.font}|${style.size}|${style.tracking || 0}|${t}`;
    const hit = widthCache.get(key);
    if (hit !== undefined) return hit;
    let w = 0;
    const rs = runs(t, style);
    rs.forEach((r, i) => {
      doc.font(r.font).fontSize(style.size);
      w += doc.widthOfString(r.text, opts(style)) + (i > 0 ? style.tracking || 0 : 0);
    });
    widthCache.set(key, w);
    return w;
  }

  /** Breaks text into lines no wider than maxW. A blank line inside the text is kept. */
  function wrap(text, style, maxW) {
    const lines = [];
    const source = style.upper ? String(text).toLocaleUpperCase('en-GB') : String(text);
    for (const hard of source.split('\n')) {
      const words = hard.split(/[ \t\u00a0]+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const cand = line ? `${line} ${word}` : word;
        if (width(cand, style) <= maxW) {
          line = cand;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        if (width(word, style) <= maxW) {
          line = word;
          continue;
        }
        // too long for one line: break after a hyphen or slash it already has,
        // and only between letters when a piece is still too long
        const pieces = word.split(/(?<=[-/\u2010\u2013])/);
        let part = '';
        for (const piece of pieces) {
          const cand2 = part + piece;
          if (width(cand2, style) <= maxW) {
            part = cand2;
            continue;
          }
          if (part) lines.push(part);
          part = '';
          if (width(piece, style) <= maxW) {
            part = piece;
            continue;
          }
          for (const g of graphemes(piece)) {
            if (part && width(part + g, style) > maxW) {
              lines.push(part);
              part = g;
            } else {
              part += g;
            }
          }
        }
        line = part;
      }
      if (line) lines.push(line);
    }
    // a run of blank lines is never left at the start or end
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /** One line, shortened with an ellipsis if it is wider than maxW. */
  function fit(text, style, maxW) {
    if (width(text, style) <= maxW) return text;
    const gs = graphemes(text);
    let lo = 0;
    let hi = gs.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (width(`${gs.slice(0, mid).join('').trimEnd()}…`, style) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return `${gs.slice(0, lo).join('').trimEnd()}…`;
  }

  /**
   * Draws one line with its baseline at y.
   * @param {'left'|'right'} [align] right: x is the right edge
   */
  function draw(text, x, y, style, colour, align = 'left') {
    const t = style.upper ? text.toLocaleUpperCase('en-GB') : text;
    let cx = align === 'right' ? x - width(t, { ...style, upper: false }) : x;
    // An invisible space ends every line, so copied, searched or read-aloud
    // text never runs the last word of one line into the next.
    const rs = runs(t, style);
    if (rs.length) rs[rs.length - 1].text += ' ';
    for (const r of rs) {
      doc.font(r.font).fontSize(style.size).fillColor(colour);
      doc.text(r.text, cx, y, { lineBreak: false, baseline: 'alphabetic', ...opts(style) });
      cx += doc.widthOfString(r.text, opts(style)) + (style.tracking || 0);
    }
  }

  /** Distance from the top of a line box to its baseline. */
  const baseline = (style) => style.lh / 2 + style.size * 0.35;

  return { width, wrap, fit, draw, baseline };
}
