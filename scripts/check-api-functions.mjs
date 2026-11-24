// Stops the build when api/ holds more than 10 functions (Vercel's Hobby plan allows 12; Tim, 24 Nov 2026: no paid
// plans). Every file in api/ whose name doesn't start with _ or ., in a folder whose name doesn't either, is a function.
// New addresses join a router (api/_router.js and vercel.json's rewrites) instead of adding a function.
import { readdirSync } from 'node:fs';
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
