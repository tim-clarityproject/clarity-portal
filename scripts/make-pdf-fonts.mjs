// The fonts a PDF made on the server needs, in one folder, pdf-fonts/, so vercel.json ships them with the routers
// that make PDFs with one short pattern ("pdf-fonts/**"; Vercel refuses an includeFiles longer than 256 characters).
// They are exactly the files src/lib/pdf/assets.js fetches in the browser: Nekst (public/fonts, TTF), DM Sans 400 and
// 500 with its latin-ext part (WOFF, never WOFF2: pdfkit can't build in a WOFF2 font's letter shapes), and every
// emoji and Chinese part with their unicode.json ranges, copied as they are from the pinned packages.
//
//   node scripts/make-pdf-fonts.mjs          (re)makes pdf-fonts/ from public/ and node_modules/
//   node scripts/make-pdf-fonts.mjs --check  fails when pdf-fonts/ differs from them (run by the build)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'pdf-fonts');
const FS = join(ROOT, 'node_modules/@fontsource');

/** [source, name in pdf-fonts/] for every file. */
export function pdfFontSources() {
  const out = [
    [join(ROOT, 'public/fonts/Nekst-Regular.ttf'), 'Nekst-Regular.ttf'],
    [join(ROOT, 'public/fonts/Nekst-Light.ttf'), 'Nekst-Light.ttf'],
    ...['latin-400', 'latin-ext-400', 'latin-500', 'latin-ext-500', 'latin-300'].map((p) => [join(FS, `dm-sans/files/dm-sans-${p}-normal.woff`), `dm-sans-${p}-normal.woff`]),
    // DM Sans Light for figures and Light Italic for a signature written as a name (the 25 Nov PDFs, Polish 1).
    [join(FS, 'dm-sans/files/dm-sans-latin-300-italic.woff'), 'dm-sans-latin-300-italic.woff'],
    [join(FS, 'noto-emoji/unicode.json'), 'noto-emoji-unicode.json'],
    [join(FS, 'noto-sans-sc/unicode.json'), 'noto-sans-sc-unicode.json'],
  ];
  for (const [pkg, re] of [['noto-emoji', /^noto-emoji-\d+-400-normal\.woff$/], ['noto-sans-sc', /^noto-sans-sc-\d+-400-normal\.woff$/]]) {
    for (const f of readdirSync(join(FS, pkg, 'files')).filter((n) => re.test(n)).sort()) out.push([join(FS, pkg, 'files', f), f]);
  }
  return out;
}

const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sources = pdfFontSources();
  if (process.argv.includes('--check')) {
    const names = new Set(sources.map(([, n]) => n));
    const extra = existsSync(OUT) ? readdirSync(OUT).filter((n) => !names.has(n)) : [];
    const off = sources.filter(([src, n]) => !same(src, join(OUT, n))).map(([, n]) => n);
    if (off.length || extra.length) {
      console.error(`pdf-fonts/ is out of date (${off.length} differ or are missing, ${extra.length} extra). Run node scripts/make-pdf-fonts.mjs and commit it.`);
      process.exit(1);
    }
    console.log(`pdf-fonts/ holds the ${sources.length} files PDFs made on the server need.`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    for (const [src, n] of sources) copyFileSync(src, join(OUT, n));
    console.log(`pdf-fonts/: ${sources.length} files.`);
  }
}
