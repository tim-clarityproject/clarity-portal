// The PDF template's fonts on the server (follow-up 5): the same files src/lib/pdf/assets.js
// fetches in the browser, read from disk. Nekst from public/fonts (TTF), DM Sans from
// @fontsource/dm-sans (WOFF, never WOFF2: pdfkit can't build in a WOFF2 font's letter shapes),
// and only the emoji and Chinese parts a document's own text needs (src/lib/pdf/emoji.js), as
// tests/pdf/make-pdfs.mjs reads them under Node. vercel.json's `functions` → `includeFiles`
// ships these files with the routers that make PDFs (api/guest.js, api/coach.js).
//
// No Vite here: no `?url` imports and no import.meta.env, so plain `node` loads it. The file name
// starts with an underscore so Vercel never publishes it as a function.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cjkPartsFor, emojiPartsFor, textOf } from '../src/lib/pdf/emoji.js';
import { renderPdf } from '../src/lib/pdf/render.js';
import { PAPER, paperFor, regionOf } from '../src/lib/pdf/paper.js';

// The project's root: next to api/ (where Vercel keeps the included files), else the working folder.
// Every file is in pdf-fonts/ (scripts/make-pdf-fonts.mjs copies them there from public/ and node_modules/, and the
// build checks they still match), so vercel.json ships them with one short pattern.
const HERE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = existsSync(join(HERE_ROOT, 'pdf-fonts')) ? HERE_ROOT : process.cwd();
const DIR = 'pdf-fonts/';

export const FONT_FILES = Object.freeze({
  Nekst: `${DIR}Nekst-Regular.ttf`,
  NekstLight: `${DIR}Nekst-Light.ttf`,
  DMSans: `${DIR}dm-sans-latin-400-normal.woff`,
  DMSansExt: `${DIR}dm-sans-latin-ext-400-normal.woff`,
  DMSansMedium: `${DIR}dm-sans-latin-500-normal.woff`,
  DMSansMediumExt: `${DIR}dm-sans-latin-ext-500-normal.woff`,
  DMSansLight: `${DIR}dm-sans-latin-300-normal.woff`,
  DMSansLightItalic: `${DIR}dm-sans-latin-300-italic.woff`,
});
const emojiFile = (key) => `${DIR}noto-emoji-${key.replace(/\D/g, '')}-400-normal.woff`;
const cjkFile = (key) => `${DIR}noto-sans-sc-${key.replace(/\D/g, '')}-400-normal.woff`;

const cache = new Map();
/** A file's bytes, kept for the next PDF this instance makes. */
function bytes(path) {
  if (!cache.has(path)) cache.set(path, new Uint8Array(readFileSync(join(ROOT, path))));
  return cache.get(path);
}
let ranges = null;
function rangesOf() {
  if (!ranges) {
    ranges = {
      emoji: JSON.parse(readFileSync(join(ROOT, `${DIR}noto-emoji-unicode.json`), 'utf8')),
      cjk: JSON.parse(readFileSync(join(ROOT, `${DIR}noto-sans-sc-unicode.json`), 'utf8')),
    };
  }
  return ranges;
}

/**
 * The fonts a document needs, as loadPdfAssets gives them in the browser.
 * @param {Object} spec the document description (src/lib/pdf/render.js)
 * @returns {{ fonts: Object }}
 */
export function serverPdfAssets(spec) {
  const strings = textOf(spec);
  const r = rangesOf();
  const fonts = Object.fromEntries(Object.entries(FONT_FILES).map(([name, path]) => [name, bytes(path)]));
  fonts.emoji = emojiPartsFor(strings, r.emoji).map((k) => bytes(emojiFile(k)));
  // As the browser's: a part with no file of its own is left out.
  fonts.cjk = cjkPartsFor(strings, r.cjk).filter((k) => existsSync(join(ROOT, cjkFile(k)))).map((k) => bytes(cjkFile(k)));
  return { fonts };
}

/** The glob vercel.json's includeFiles names for a router that makes PDFs (checked by tests/pdf/server-pdf.test.mjs). */
export const PDF_INCLUDE_FILES = 'pdf-fonts/**';

/**
 * The paper for a PDF made on the server (PDF rule 3, the one helper paperFor): what the server
 * knows in paperFor's own order. No country setting exists yet; the region is the first region
 * the browser's Accept-Language names (the same list as the device's navigator.languages), then
 * the time zone the page sent; anything else is A4. Never the server's own region or zone.
 * @param {{ acceptLanguage?: string, timeZone?: string|null }} known
 */
export function serverPaper({ acceptLanguage = '', timeZone = null } = {}) {
  const tags = String(acceptLanguage || '').slice(0, 500).split(',').map((t) => t.split(';')[0].trim()).filter(Boolean);
  const region = tags.map(regionOf).find(Boolean) || null;
  const zone = typeof timeZone === 'string' && timeZone.length <= 64 ? timeZone : '';
  return paperFor({ country: null, region, timeZone: zone });
}

/**
 * A light PDF made on the server from a document description, with the template the browser uses.
 * @returns {Promise<{ bytes: Uint8Array, fileName: string }>}
 */
export async function makeServerPdf(spec, { paper = PAPER.A4 } = {}) {
  const { bytes, fileName } = await renderPdf(spec, { variant: 'light', paper, assets: serverPdfAssets(spec) });
  return { bytes, fileName };
}
