// Writes supabase/migrations/031_evidence_library.sql from docs/claims-register.md,
// so the evidence library is seeded with the register's own wording, copied,
// never retyped (spec section 11).
//
//   node scripts/make-evidence-seed.mjs          write the migration
//   node scripts/make-evidence-seed.mjs --check  exit 1 if the migration
//                                                 doesn't match the register
//
// What it reads: Part A (claims, in their sections, and the practitioner
// models), Part B (every tool) and Part C (references), version 1.1.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = path.join(REPO, 'docs/claims-register.md');
const OUT = path.join(REPO, 'supabase/migrations/031_evidence_library.sql');
const TEMPLATE = path.join(REPO, 'scripts/evidence-library-template.sql');

export function parseRegister(md) {
  const lines = md.split('\n');
  const version = /^Version (\d+\.\d+)/m.exec(md)[1];
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const claims = [];
  const tools = [];
  const refs = [];
  let part = null;
  let section = null;
  let header = null;
  for (const line of lines) {
    if (line.startsWith('## Part A')) part = 'A';
    else if (line.startsWith('## Part B')) part = 'B';
    else if (line.startsWith('## Part C')) part = 'C';
    else if (line.startsWith('## ')) part = null;
    if (line.startsWith('### ')) section = line.slice(4).trim();
    if (!line.startsWith('|')) { header = null; continue; }
    const c = cells(line);
    if (!header) { header = c; continue; }
    if (c.every((x) => /^-+$/.test(x))) continue;
    const row = Object.fromEntries(header.map((h, i) => [h, c[i] ?? '']));
    if (part === 'A' && /^C\d+$/.test(row.ID)) {
      const practitioner = 'Model' in row;
      claims.push({
        id: row.ID,
        area: section,
        wording: practitioner ? row.Model : (row['Claim, as the portal may say it'] ?? row.Claim),
        whereItShows: row['Where it shows'],
        strength: row.Strength,
        sources: practitioner ? '' : row.Sources,
        caveat: practitioner ? '' : row.Caveat,
        practitionerModel: practitioner,
      });
    } else if (part === 'B' && row.Tool) {
      tools.push({ name: row.Tool, basedOn: row['Based on'], claims: row.Claims, strength: row.Strength, flagged: row.Flag === 'Flag' });
    } else if (part === 'C' && /^R\d+$/.test(row.ID)) {
      refs.push({
        id: row.ID,
        citation: row.Reference,
        links: row.Link.split(' ; ').map((s) => s.trim()).filter(Boolean),
        found: row['What it found'],
        effectSize: row['Size of effect'],
        checkedOn: row['Checked on'],
      });
    }
  }
  return { version, claims, tools, refs };
}

export function strengthLevel(s) {
  const t = s.toLowerCase();
  if (t.startsWith('strong')) return 'strong';
  if (t.startsWith('moderate')) return 'moderate';
  if (t.startsWith('early')) return 'early';
  if (t.startsWith('our model')) return 'our_model';
  throw new Error(`Unknown strength: ${s}`);
}

/** C1, C20 to C24 → [C1, C20, C21, C22, C23, C24] */
export function claimIds(text) {
  const out = [];
  const re = /C(\d+)(?:\s+to\s+C(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = a; i <= b; i += 1) out.push(`C${i}`);
  }
  return [...new Set(out)];
}

const refIds = (text) => [...new Set((text.match(/R\d+/g) || []))];
export const toolKey = (name) => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const q = (s) => (s == null || s === '' ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(q).join(', ')}]::text[]`;

export function seedSql(reg) {
  const out = [];
  out.push(`-- Seeded from docs/claims-register.md version ${reg.version} by scripts/make-evidence-seed.mjs.`);
  out.push('-- Added only where missing, so Tim\'s later edits in the library are never overwritten.');
  out.push('insert into public.evidence_references (id, citation, links, found, effect_size, checked_on, date_checked, added_by, register_version) values');
  out.push(reg.refs.map((r) => `  (${q(r.id)}, ${q(r.citation)}, ${arr(r.links)}, ${q(r.found)}, ${q(r.effectSize)}, ${q(r.checkedOn)}, date '2026-10-26', 'Claude, for Tim', ${q(reg.version)})`).join(',\n'));
  out.push('on conflict (id) do nothing;');
  out.push('');
  out.push('insert into public.evidence_claims (id, area, wording, where_it_shows, strength, strength_level, sources, caveat, practitioner_model, register_version, sort_order) values');
  out.push(reg.claims.map((c, i) => `  (${q(c.id)}, ${q(c.area)}, ${q(c.wording)}, ${q(c.whereItShows)}, ${q(c.strength)}, ${q(strengthLevel(c.strength))}, ${q(c.sources)}, ${q(c.caveat)}, ${c.practitionerModel}, ${q(reg.version)}, ${i + 1})`).join(',\n'));
  out.push('on conflict (id) do nothing;');
  out.push('');
  const links = reg.claims.flatMap((c) => refIds(`${c.sources} ${c.strength}`).filter((r) => reg.refs.some((x) => x.id === r)).map((r) => `(${q(c.id)}, ${q(r)})`));
  out.push('insert into public.evidence_claim_references (claim_id, reference_id) values');
  out.push(`  ${links.join(',\n  ')}`);
  out.push('on conflict do nothing;');
  out.push('');
  out.push('insert into public.evidence_tools (key, name, based_on, claims, strength, strength_level, flagged, register_version, sort_order) values');
  out.push(reg.tools.map((t, i) => `  (${q(toolKey(t.name))}, ${q(t.name)}, ${q(t.basedOn)}, ${q(t.claims)}, ${q(t.strength)}, ${q(strengthLevel(t.strength))}, ${t.flagged}, ${q(reg.version)}, ${i + 1})`).join(',\n'));
  out.push('on conflict (key) do nothing;');
  out.push('');
  const toolLinks = reg.tools.flatMap((t) => claimIds(t.claims).filter((c) => reg.claims.some((x) => x.id === c)).map((c) => `(${q(toolKey(t.name))}, ${q(c)})`));
  out.push('insert into public.evidence_tool_claims (tool_key, claim_id) values');
  out.push(`  ${toolLinks.join(',\n  ')}`);
  out.push('on conflict do nothing;');
  return out.join('\n');
}

export function counts(reg) {
  return {
    references: reg.refs.length,
    claims: reg.claims.length,
    claimReferences: reg.claims.reduce((n, c) => n + refIds(`${c.sources} ${c.strength}`).filter((r) => reg.refs.some((x) => x.id === r)).length, 0),
    tools: reg.tools.length,
    toolClaims: reg.tools.reduce((n, t) => n + claimIds(t.claims).filter((c) => reg.claims.some((x) => x.id === c)).length, 0),
    flaggedTools: reg.tools.filter((t) => t.flagged).length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reg = parseRegister(fs.readFileSync(REGISTER, 'utf8'));
  const sql = fs.readFileSync(TEMPLATE, 'utf8')
    .replace('-- @SEED@', seedSql(reg))
    .replaceAll('@VERSION@', reg.version)
    .replace('@COUNTS@', JSON.stringify(counts(reg)));
  if (process.argv.includes('--check')) {
    const now = fs.readFileSync(OUT, 'utf8');
    if (now !== sql) {
      console.log('031_evidence_library.sql does not match docs/claims-register.md. Run node scripts/make-evidence-seed.mjs.');
      process.exit(1);
    }
    console.log(`031_evidence_library.sql matches docs/claims-register.md version ${reg.version}: ${JSON.stringify(counts(reg))}.`);
  } else {
    fs.writeFileSync(OUT, sql);
    console.log(`Wrote ${path.relative(REPO, OUT)}: ${JSON.stringify(counts(reg))}.`);
  }
}
