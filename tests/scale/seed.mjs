// Fills a copy of the local stand-in with invented data at Tim's scale
// (1,000 clients, 15 coaches), for the scale and speed check. Local only:
// nothing hosted is touched, nothing is sent.
//
//   node tests/scale/seed.mjs --from <base-055.tar> --to <base-scale.tar> [--only 1,2]
//
// Runs tests/scale/seed/NN-*.sql in order in one PGlite, then ANALYZE, then
// keeps the result at --to. Prints each part's time and the row counts.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { refuseHostedLoad } from '../hosted-guard.mjs';

refuseHostedLoad('The scale seed');

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const from = opt('from');
const to = opt('to');
const only = opt('only') ? new Set(opt('only').split(',').map(Number)) : null;
if (!from) { console.log('Usage: node tests/scale/seed.mjs --from <base.tar> --to <out.tar>'); process.exit(2); }

const parts = readdirSync(join(HERE, 'seed')).filter((f) => /^\d\d-.*\.sql$/.test(f)).sort()
  .filter((f) => !only || only.has(Number(f.slice(0, 2))));
const t0 = Date.now();
const db = await openDb(from);
console.log(`loaded ${from.split('/').pop()} (${Date.now() - t0} ms)`);
for (const f of parts) {
  const t = Date.now();
  try {
    await db.exec(readFileSync(join(HERE, 'seed', f), 'utf8'), { onNotice: (n) => { if (/SEED/.test(n.message)) console.log(`  ${n.message}`); } });
  } catch (e) {
    console.log(`STOP ${f}: ${String(e.message).slice(0, 1500)}`);
    if (e.where) console.log(`  where: ${String(e.where).slice(0, 400)}`);
    await db.close();
    process.exit(1);
  }
  console.log(`ok   ${f} (${Math.round((Date.now() - t) / 1000)} s)`);
}
await db.exec('set session_replication_role = origin; analyze;');
const tables = await db.query(`select relname as t from pg_stat_user_tables where schemaname = 'public' and n_live_tup > 0`);
const counted = [];
for (const { t } of tables.rows) counted.push({ t, n: (await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n });
const counts = { rows: counted.filter((r) => r.n > 0).sort((a, b) => b.n - a.n) };
writeFileSync(join(HERE, 'seed-counts.json'), `${JSON.stringify(Object.fromEntries(counts.rows.map((r) => [r.t, r.n])), null, 1)}\n`);
console.log(counts.rows.slice(0, 30).map((r) => `${r.t} ${r.n}`).join(', '));
if (to) {
  const blob = await db.dumpDataDir('none');
  writeFileSync(to, Buffer.from(await blob.arrayBuffer()));
  console.log(`kept the stand-in at ${to} (${Math.round((Date.now() - t0) / 1000)} s in all)`);
}
await db.close();
