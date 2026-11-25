// Stops the build when api/ holds more than 10 functions (Vercel's Hobby plan allows 12; Tim, 24 Nov 2026: no paid
// plans). Every file in api/ whose name doesn't start with _ or ., in a folder whose name doesn't either, is a function.
// New addresses join a router (api/_router.js and vercel.json's rewrites) instead of adding a function.
// It also stops the build when any function's includeFiles in vercel.json is longer than 256 characters, which Vercel
// refuses (follow-up 5: the PDF fonts' pattern was 591), and when pdf-fonts/ no longer matches its sources.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX = 10;
const API = new URL('../api/', import.meta.url).pathname;
const functionsIn = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('_') || e.name.startsWith('.')) return [];
  if (e.isDirectory()) return functionsIn(join(dir, e.name));
  return /\.(js|mjs|cjs|ts)$/.test(e.name) ? [e.name] : [];
});
const found = functionsIn(API);
if (found.length > MAX) {
  console.error(`api/ has ${found.length} functions (at most ${MAX}): ${found.join(', ')}. Join the new one to a router in api/_router.js.`);
  process.exit(1);
}
console.log(`api/ has ${found.length} functions (at most ${MAX}).`);

export const MAX_INCLUDE = 256;
/** Each function whose includeFiles Vercel would refuse: [name, length]. */
export function longIncludes(vercel) {
  return Object.entries(vercel?.functions || {}).map(([name, f]) => [name, String(f?.includeFiles ?? '').length]).filter(([, n]) => n > MAX_INCLUDE);
}
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const long = longIncludes(vercel);
if (long.length) {
  console.error(`vercel.json: includeFiles longer than ${MAX_INCLUDE} characters, which Vercel refuses: ${long.map(([n, l]) => `${n} (${l})`).join(', ')}. Put the files in one folder and name it.`);
  process.exit(1);
}
console.log(`vercel.json: every includeFiles is ${MAX_INCLUDE} characters or fewer.`);
execFileSync(process.execPath, [new URL('./make-pdf-fonts.mjs', import.meta.url).pathname, '--check'], { stdio: 'inherit' });
