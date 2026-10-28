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

  // Spaced capitals keep only the PDF's own letter-spacing (Tc): the font's
  // pair kerning is switched off, so every gap is the same and readers never
  // mistake a wider one for a space ("SUM MARY").
  const opts = (style) => ({
    characterSpacing: style.tracking || 0,
    features: style.tracking ? { kern: false } : style.features,
  });
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

  /**
   * A label that must stay on one line (a chart's axis word): the style,
   * made smaller if needed, down to the 8.5pt floor (PDF rule 15). Text is
   * never cut off with "…" (Tim, 26 Oct).
   */
  function shrink(text, style, maxW) {
    const w = width(text, style);
    if (w <= maxW) return style;
    const size = Math.max(8.5, Math.floor(style.size * (maxW / w) * 10) / 10);
    return { ...style, size, lh: style.lh * (size / style.size) };
  }

  /**
   * Draws one line with its baseline at y.
   * @param {'left'|'right'} [align] right: x is the right edge
   */
  function draw(text, x, y, style, colour, align = 'left', written = null) {
    const t = style.upper ? text.toLocaleUpperCase('en-GB') : text;
    let cx = align === 'right' ? x - width(t, { ...style, upper: false }) : x;
    if (style.tracking && drawSpaced(t, cx, y, style, colour, written ?? (text !== t ? text : null))) return;
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

  // Spaced capitals, PDF rule 33 (Tim, 28 Oct): readers that don't use a
  // heading's written words guess the gaps between words from the spacing of
  // the letters, and the letter-spacing sits near where they guess a space
  // ("OBJ EC TIVE"). So the capitals are drawn with the font's own letter
  // shapes, one after another with the same spacing, and the words lie over
  // them as one run of invisible text without letter-spacing, stretched to the
  // same width: copied, searched and read-aloud text is always whole words.
  // `written` is the line as written (sentence case); without it the capitals.
  // Returns false (and draws nothing) when a font has no letter shapes to draw.
  function drawSpaced(t, x, y, style, colour, written) {
    const rs = runs(t, style);
    const laid = [];
    for (const r of rs) {
      doc.font(r.font).fontSize(style.size);
      const f = doc._font;
      if (typeof f?.layout !== 'function' || !f.font) return false;
      const run = f.layout(r.text, opts(style).features);
      if (run.glyphs.some((g) => !g.path)) return false;
      laid.push({ run, upem: f.font.unitsPerEm });
    }
    const k = style.size / 1000;
    let cx = x;
    laid.forEach(({ run, upem }) => {
      run.glyphs.forEach((g, i) => {
        const pos = run.positions[i];
        const svg = g.path.toSVG();
        if (svg) {
          const s = style.size / upem;
          doc.save();
          doc.transform(s, 0, 0, -s, cx + pos.xOffset * k, y - pos.yOffset * k);
          doc.path(svg).fill(colour);
          doc.restore();
        }
        cx += pos.xAdvance * k + style.tracking;
      });
    });
    const shown = width(t, { ...style, upper: false });
    const words = `${written ?? t} `;
    const plain = { ...style, tracking: 0, upper: false };
    const natural = runs(words, plain).reduce((w, r) => {
      doc.font(r.font).fontSize(style.size);
      return w + doc.widthOfString(r.text, { features: style.features });
    }, 0);
    const scale = natural > 0 ? (shown / natural) * 100 : 100;
    let wx = x;
    doc.addContent('3 Tr'); // invisible
    for (const r of runs(words, plain)) {
      doc.font(r.font).fontSize(style.size).fillColor(colour);
      doc.text(r.text, wx, y, { lineBreak: false, baseline: 'alphabetic', horizontalScaling: scale, features: style.features });
      wx += doc.widthOfString(r.text, { horizontalScaling: scale, features: style.features });
    }
    doc.addContent('0 Tr');
    return true;
  }

  /**
   * The written words of each wrapped line of spaced capitals, so a heading
   * keeps its sentence case under its capitals. null for a line that doesn't
   * line up word for word (a very long word broken mid-word).
   */
  function writtenLines(source, lines) {
    const words = String(source).split(/[ \t\u00a0\n]+/).filter(Boolean);
    let at = 0;
    return lines.map((line) => {
      const n = line.split(/[ \t\u00a0]+/).filter(Boolean).length;
      const part = words.slice(at, at + n);
      at += n;
      return part.join(' ').toLocaleUpperCase('en-GB') === line.trim() ? part.join(' ') : null;
    });
  }

  /** Distance from the top of a line box to its baseline. */
  const baseline = (style) => style.lh / 2 + style.size * 0.35;

  return { width, wrap, shrink, draw, baseline, writtenLines };
}
