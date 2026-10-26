import dm400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url';
import dm400x from '@fontsource/dm-sans/files/dm-sans-latin-ext-400-normal.woff?url';
import dm500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url';
import dm500x from '@fontsource/dm-sans/files/dm-sans-latin-ext-500-normal.woff?url';
import emojiRanges from '@fontsource/noto-emoji/unicode.json';
import e0 from '@fontsource/noto-emoji/files/noto-emoji-0-400-normal.woff?url';
import e1 from '@fontsource/noto-emoji/files/noto-emoji-1-400-normal.woff?url';
import e2 from '@fontsource/noto-emoji/files/noto-emoji-2-400-normal.woff?url';
import e3 from '@fontsource/noto-emoji/files/noto-emoji-3-400-normal.woff?url';
import e4 from '@fontsource/noto-emoji/files/noto-emoji-4-400-normal.woff?url';
import e5 from '@fontsource/noto-emoji/files/noto-emoji-5-400-normal.woff?url';
import e6 from '@fontsource/noto-emoji/files/noto-emoji-6-400-normal.woff?url';
import e7 from '@fontsource/noto-emoji/files/noto-emoji-7-400-normal.woff?url';
import e8 from '@fontsource/noto-emoji/files/noto-emoji-8-400-normal.woff?url';
import e9 from '@fontsource/noto-emoji/files/noto-emoji-9-400-normal.woff?url';
import e10 from '@fontsource/noto-emoji/files/noto-emoji-10-400-normal.woff?url';
import { emojiPartsFor, textOf } from './emoji';

// The fonts and logo files a PDF needs, fetched when a PDF is asked for (and
// kept for the next one). The logo files are the supplied ones, used as they are.
// Fonts are TTF or WOFF, never WOFF2: pdfkit cannot build in a WOFF2 font's
// letter shapes, so text set in one comes out blank. Nekst-Light.ttf is the
// supplied Nekst-Light.woff2 unpacked, nothing else changed.

const EMOJI = { '[0]': e0, '[1]': e1, '[2]': e2, '[3]': e3, '[4]': e4, '[5]': e5, '[6]': e6, '[7]': e7, '[8]': e8, '[9]': e9, '[10]': e10 };
const FILES = {
  Nekst: '/fonts/Nekst-Regular.ttf',
  NekstLight: '/fonts/Nekst-Light.ttf',
  DMSans: dm400,
  DMSansExt: dm400x,
  DMSansMedium: dm500,
  DMSansMediumExt: dm500x,
  positive: '/brand/logomark-positive.png',
  negative: '/brand/logomark-negative.png',
};

const cache = new Map();
function bytes(url) {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${url}`);
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b));
    p.catch(() => cache.delete(url)); // a failed load is tried again next time
    cache.set(url, p);
  }
  return cache.get(url);
}

/** @param {Object} spec the document, to find which emoji it uses */
export async function loadPdfAssets(spec) {
  const parts = emojiPartsFor(textOf(spec), emojiRanges);
  const names = ['Nekst', 'NekstLight', 'DMSans', 'DMSansExt', 'DMSansMedium', 'DMSansMediumExt'];
  const [fontBytes, emoji, positive, negative] = await Promise.all([
    Promise.all(names.map((n) => bytes(FILES[n]))),
    Promise.all(parts.map((k) => bytes(EMOJI[k]))),
    bytes(FILES.positive),
    bytes(FILES.negative),
  ]);
  const fonts = Object.fromEntries(names.map((n, i) => [n, fontBytes[i]]));
  fonts.emoji = emoji;
  return { fonts, logos: { positive, negative } };
}
