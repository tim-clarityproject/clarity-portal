// Makes Clarity Coach's app icons (Phase 6a run 1; M11's "App icons" note):
// the bold crosshair, black on a white tile, at about 69% of the square,
// drawn from the portal's one shared drawing (src/lib/boldCrosshair.js),
// never redrawn here.
//
//   node scripts/make-coach-icons.mjs
//
// Writes public/coach-app/ (not public/coach: that address is the coach portal itself): favicon.svg, favicon.ico (16, 32 and 48),
// apple-touch-icon.png (180), icon-192.png, icon-512.png and
// icon-maskable-512.png (the crosshair smaller, inside the safe area a
// phone may crop to).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BOLD_CROSS_PATHS, BOLD_CROSS_STROKE, BOLD_CROSS_VIEWBOX } from '../src/lib/boldCrosshair.js';

const OUT = 'public/coach-app';
const SHARE = 0.69; // the crosshair's share of the square
const MASKABLE_SHARE = 0.52; // inside the 80% safe area

const paths = BOLD_CROSS_PATHS.map((p) => `<path d="${p.d}" transform="translate(${p.dx.toFixed(2)} ${p.dy.toFixed(2)})"/>`).join('');
const [vx, vy, vw, vh] = BOLD_CROSS_VIEWBOX;

/** The tile as an SVG: a white square with the black crosshair in its middle. */
function tile(size, share, radius = 0) {
  const mark = size * share;
  const at = (size - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#FFFFFF"/><svg x="${at}" y="${at}" width="${mark}" height="${mark}" viewBox="${vx} ${vy} ${vw} ${vh}"><g fill="none" stroke="#000000" stroke-width="${BOLD_CROSS_STROKE}" stroke-linejoin="round">${paths}</g></svg></svg>`;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/favicon.svg`, `${tile(64, SHARE, 12)}\n`);

const browser = await chromium.launch({ args: ['--mute-audio'] });
async function png(size, share) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${tile(size, share)}</body>`);
  const shot = await page.locator('body > svg').screenshot();
  await page.close();
  return shot;
}

writeFileSync(`${OUT}/apple-touch-icon.png`, await png(180, SHARE));
writeFileSync(`${OUT}/icon-192.png`, await png(192, SHARE));
writeFileSync(`${OUT}/icon-512.png`, await png(512, SHARE));
writeFileSync(`${OUT}/icon-maskable-512.png`, await png(512, MASKABLE_SHARE));

// favicon.ico: a small header, then the three PNGs as they are.
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(s, SHARE));
await browser.close();
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(sizes[i], at); header.writeUInt8(sizes[i], at + 1); header.writeUInt8(0, at + 2); header.writeUInt8(0, at + 3);
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(img.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += img.length;
});
writeFileSync(`${OUT}/favicon.ico`, Buffer.concat([header, ...images]));
console.log(`Made Clarity Coach's icons in ${OUT}.`);
