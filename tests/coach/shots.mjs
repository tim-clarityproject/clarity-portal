// Screenshots of every coach portal screen of Phase 6a run 1, for looking
// through beside M11: as the owner and as an associate, at 1440, 768 and
// 400, dark and light.
//
//   node --import ./tests/scores/register.mjs tests/coach/shots.mjs [folder]
//   ONLY=clients SIZES=1440 MODES=dark ROLES=owner … narrows it.
import { mkdirSync } from 'node:fs';
import { walk } from './screens.mjs';

const OUT = process.argv[2] || 'tmp-coach-shots';
mkdirSync(OUT, { recursive: true });
const problems = await walk((page, { name, role, size, theme }) => page.screenshot({ path: `${OUT}/${name}.${role}.${size}.${theme}.png` }));
console.log(problems.length ? `${problems.length} problems while taking the screenshots:\n  ${problems.join('\n  ')}` : `Screenshots are in ${OUT}.`);
if (problems.length) process.exitCode = 1;
