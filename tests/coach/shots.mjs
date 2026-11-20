// Screenshots of every coach portal screen (Phase 6a runs 1 and 2), for
// looking through beside M11: as the owner and as an associate, the
// client's own Coaching page as the test client, and the sign-in pages
// signed out, at 1440, 768 and 400, dark and light. A page of run 2 that is
// longer than the screen is pictured whole.
//
//   node --import ./tests/scores/register.mjs tests/coach/shots.mjs [folder]
//   ONLY=clients GROUPS=todos SIZES=1440 MODES=dark ROLES=owner … narrows it (see screens.mjs).
import { mkdirSync } from 'node:fs';
import { picture, walk } from './screens.mjs';

const OUT = process.argv[2] || 'tmp-coach-shots';
mkdirSync(OUT, { recursive: true });
let taken = 0;
const problems = await walk(async (page, { name, role, size, theme, full }) => {
  await page.evaluate(() => document.fonts.ready);
  await picture(page, `${OUT}/${name}.${role}.${size}.${theme}.png`, full);
  taken += 1;
});
console.log(problems.length ? `${taken} pictures, and ${problems.length} problems while taking them:\n  ${problems.join('\n  ')}` : `${taken} pictures are in ${OUT}.`);
if (problems.length) process.exitCode = 1;
