// Which parts of the emoji font a document needs. The font comes in eleven
// parts by character range; only the parts holding characters the document
// uses are loaded, so a PDF with no emoji loads none.

/** Every character of every string in a document description. */
export function textOf(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => textOf(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => textOf(v, out));
  return out;
}

const parseRanges = (spec) => spec.split(',').map((r) => {
  const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
  return [parseInt(a, 16), parseInt(b || a, 16)];
});

/** Chinese, Japanese and Korean characters (and full-width punctuation). */
const isCjk = (cp) => (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef)
  || (cp >= 0x20000 && cp <= 0x2fa1f);

/**
 * Which parts of the Chinese font (Noto Sans SC, in parts by character range,
 * like the emoji font) a document needs: none unless it has Chinese text.
 * @param {string[]} strings
 * @param {Object<string, string>} ranges the font's unicode.json
 * @returns {string[]} the parts needed, such as ["[12]"]
 */
export function cjkPartsFor(strings, ranges) {
  const cps = new Set();
  strings.forEach((s) => { for (const ch of s) { const cp = ch.codePointAt(0); if (isCjk(cp)) cps.add(cp); } });
  if (!cps.size) return [];
  return Object.entries(ranges)
    .filter(([, spec]) => {
      const rs = parseRanges(spec);
      for (const cp of cps) if (rs.some(([a, b]) => cp >= a && cp <= b)) return true;
      return false;
    })
    .map(([key]) => key);
}

/**
 * @param {string[]} strings
 * @param {Object<string, string>} ranges the emoji font's unicode.json
 * @returns {string[]} the parts needed, such as ["[3]", "[7]"]
 */
export function emojiPartsFor(strings, ranges) {
  const cps = new Set();
  strings.forEach((s) => {
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      // plain Latin text and punctuation are drawn by DM Sans
      if (cp >= 0x2100 || cp === 0x200d || cp === 0x203c || cp === 0x2049 || cp === 0x20e3) cps.add(cp);
    }
  });
  if (!cps.size) return [];
  return Object.entries(ranges)
    .filter(([, spec]) => {
      const rs = parseRanges(spec);
      for (const cp of cps) if (rs.some(([a, b]) => cp >= a && cp <= b)) return true;
      return false;
    })
    .map(([key]) => key);
}
