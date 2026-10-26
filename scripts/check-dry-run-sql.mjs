// Used by dry-run-on-test.sh. Exits 1, naming the file and line, if a SQL
// file holds anything that could end the dry run's transaction early (so a
// change might be kept): commit, rollback, end, abort, begin or start
// transaction, prepare transaction, or a psql command (a line starting \).
// Text inside comments, quotes and function bodies ($tag$ ... $tag$) is
// ignored, so plpgsql's own begin and end are fine.
//
// Usage: node scripts/check-dry-run-sql.mjs FILE...

import fs from 'node:fs';

const FORBIDDEN = /^(commit|rollback|end|abort|begin|start\s+transaction|prepare\s+transaction|savepoint|release)\b/i;

function topLevelStatements(sql) {
  const statements = [];
  let current = '';
  let line = 1;
  let startLine = 1;
  let i = 0;
  const push = () => {
    if (current.trim()) statements.push({ text: current.trim(), line: startLine });
    current = '';
  };
  while (i < sql.length) {
    const ch = sql[i];
    if (!current.trim()) startLine = line;
    if (ch === '\n') line += 1;
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      line += (sql.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
      current += ' ';
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j += 1;
      }
      line += (sql.slice(i + 1, j).match(/\n/g) || []).length;
      current += ' x ';
      i = j + 1;
      continue;
    }
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i, i + 64));
    if (tag && !/[A-Za-z_0-9]/.test(sql[i - 1] || '')) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      const stop = end === -1 ? sql.length : end + tag[0].length;
      line += (sql.slice(i, stop).match(/\n/g) || []).length;
      current += ' x ';
      i = stop;
      continue;
    }
    if (ch === '\\' && !current.trim()) {
      statements.push({ text: sql.slice(i, sql.indexOf('\n', i) === -1 ? sql.length : sql.indexOf('\n', i)), line, meta: true });
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === ';') {
      push();
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  push();
  return statements;
}

let bad = 0;
for (const file of process.argv.slice(2)) {
  const sql = fs.readFileSync(file, 'utf8');
  for (const s of topLevelStatements(sql)) {
    if (s.meta || FORBIDDEN.test(s.text)) {
      const what = s.meta ? 'a psql command' : `"${s.text.split(/\s+/).slice(0, 2).join(' ')}"`;
      console.log(`${file}, line ${s.line}: ${what} could end the dry run early, so nothing was run.`);
      bad += 1;
    }
  }
}
process.exit(bad ? 1 : 0);
