// No debug logging in what people run (Polish 1, Stage D, item 17). "[ProtectedLayout] …" (with the person's email on
// every render) and "Retrieved clarity-portal-auth from storage" were logged about 21,000 times in one preview session.
// This reads every file in src and fails on console.log, console.info, console.debug, console.table, console.dir or
// console.trace outside the list below, each with its reason. console.error and console.warn stay for real faults.
// Tests inside src (src/__tests__) are not shipped and are left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

/** Files allowed a console line, and why. */
export const ALLOWED = Object.freeze({
  'src/utils/diag.js': 'logs only once the device has opted in (localStorage clarity-diag set to 1) while a fault is chased',
  'src/lib/debugStorage.js': 'runs only when someone types debugStorage.… into a development build\'s console; never exposed in a live build',
});

const LOGGING = /\bconsole\s*\.\s*(log|info|debug|table|dir|trace)\s*\(/;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...files(path));
    } else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name) && !/\.test\.(js|jsx|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

/** Each logging line in a file's text, skipping whole-line comments: [{ line, text }]. */
export function loggingLines(text) {
  const hits = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
    if (LOGGING.test(line)) hits.push({ line: i + 1, text: line.slice(0, 120) });
  });
  return hits;
}

test('the finder catches a log and leaves errors, warnings and comments alone', () => {
  assert.equal(loggingLines("console.log('[ProtectedLayout] Rendered');").length, 1);
  assert.equal(loggingLines('  if (x) console.info("hi");').length, 1);
  assert.equal(loggingLines('console . debug ( 1 )').length, 1);
  assert.equal(loggingLines("console.error('That didn’t work', e);").length, 0);
  assert.equal(loggingLines("console.warn('slow');").length, 0);
  assert.equal(loggingLines("// console.log('kept as a note')").length, 0);
  assert.equal(loggingLines(" * console.log in a doc comment").length, 0);
});

test('no console.log (or info, debug, table, dir, trace) in src outside the allowed list', () => {
  const found = [];
  for (const path of files(SRC)) {
    const rel = relative(ROOT, path).split('\\').join('/');
    if (ALLOWED[rel]) continue;
    for (const hit of loggingLines(readFileSync(path, 'utf8'))) found.push(`${rel}:${hit.line}  ${hit.text}`);
  }
  assert.deepEqual(found, [], `Debug logging left in src (remove it, or add the file to ALLOWED with its reason):\n${found.join('\n')}`);
});

test('every allowed file still exists and still logs (the list never keeps a stale entry)', () => {
  for (const rel of Object.keys(ALLOWED)) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(loggingLines(text).length > 0, `${rel} no longer logs: take it off ALLOWED`);
  }
});

test('the sign-in storage adapter and ProtectedLayout log nothing and never name the person', () => {
  for (const rel of ['src/lib/supabase.js', 'src/lib/authStorage.js', 'src/components/ProtectedLayout.jsx', 'src/context/AuthContext.jsx']) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.equal(loggingLines(text).length, 0, rel);
    assert.doesNotMatch(text, /console\.\w+\([^)]*user\??\.email/, `${rel} prints the person's email`);
  }
});
