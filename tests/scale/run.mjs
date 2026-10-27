// npm run test:scale: speed at Tim's scale (1,000 clients, 15 coaches).
//
// Inside one rolled-back transaction on the TEST database
// (scripts/dry-run-on-test.sh): runs migrations 024 onwards, loads invented
// data (tests/scale/seed.sql: 15 coaches, 1,000 clients, 20 organisations
// with nested teams and viewers, a year of logs, to-dos, debriefs and
// check-ins), then times the main reads (tests/scale/measure.sql) as the
// people who would run them. Nothing is kept. Results print and go to
// tests/scale/results.json.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const MIGRATIONS = path.join(REPO, 'supabase/migrations');
const pending = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 24).sort().map((f) => path.join(MIGRATIONS, f));
const started = Date.now();
const run = spawnSync('bash', [path.join(REPO, 'scripts/dry-run-on-test.sh'), ...pending, path.join(HERE, 'seed.sql'), path.join(HERE, 'measure.sql')],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
if (run.status !== 0 || !out.includes('Dry run finished and rolled back')) {
  console.log(out.split('\n').filter((l) => !/NOTICE:  (relation|column|trigger|policy|function|index|constraint|extension)/.test(l)).join('\n').slice(-3000));
  console.log('The scale test could not run (see above). Nothing was kept.');
  process.exit(1);
}
const reads = [];
let rows = '';
for (const line of out.split('\n')) {
  const t = /TIMING\|(.*?)\|([\d.]+)\|(.*)$/.exec(line);
  if (t) reads.push({ read: t[1], ms: Number(t[2]), fullScans: t[3] || null });
  const r = /ROWS\|(.*)$/.exec(line);
  if (r) rows = r[1].split('|').join(', ');
}
const width = Math.max(...reads.map((r) => r.read.length));
console.log(`Invented data: ${rows}.`);
for (const r of reads) console.log(`${r.read.padEnd(width)}  ${String(r.ms).padStart(8)} ms${r.fullScans ? `  (full scan: ${r.fullScans})` : ''}`);
const slow = reads.filter((r) => r.ms > 200);
console.log(slow.length ? `${slow.length} reads over 200 ms.` : 'Every read under 200 ms.');
fs.writeFileSync(path.join(HERE, 'results.json'), `${JSON.stringify({ run: new Date().toISOString(), rows, reads, minutes: Number(((Date.now() - started) / 60000).toFixed(1)) }, null, 2)}\n`);
console.log('Nothing was kept on the test database. Results in tests/scale/results.json.');
