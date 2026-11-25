// The coach portal's design imports, each from its own file (scripts/build/designImports.mjs; tidy follow-up 4, part 1,
// item 1): every name the index gives is found, a rewritten import names the same thing under the same name, the
// lines keep their count, and anything else is left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { designIndex, rewriteDesignImports } from '../../scripts/build/designImports.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_DIR = join(ROOT, 'src/components/design');
const index = designIndex(readFileSync(join(INDEX_DIR, 'index.js'), 'utf8'));
const FROM = join(ROOT, 'src/pages/coach');

test('the design index is read whole, and every file it names is there', () => {
  assert.ok(index.size > 50);
  assert.deepEqual(index.get('Button'), { file: './Button', name: 'Button' });
  assert.deepEqual(index.get('Crosshair'), { file: './Crosshair', name: 'default' });
  assert.deepEqual(index.get('useColourMode'), { file: '../../lib/colourMode/useColourMode', name: 'default' });
  for (const [name, { file }] of index) {
    const base = resolve(INDEX_DIR, file);
    const there = ['.js', '.jsx', '/index.js'].some((end) => { try { readFileSync(base + end); return true; } catch { return false; } });
    assert.ok(there, `${name}: ${file}`);
  }
});

test('an import from the index takes each name from its own file, keeping its line count', () => {
  const code = "import { Button, Crosshair as Mark,\n  Loading } from '../../components/design';\nconst x = 1;\n";
  const out = rewriteDesignImports(code, FROM, INDEX_DIR, index);
  assert.equal(out.split('\n').length, code.split('\n').length);
  assert.match(out, /import \{ Button as Button \} from '\.\.\/\.\.\/components\/design\/Button';/);
  assert.match(out, /import \{ default as Mark \} from '\.\.\/\.\.\/components\/design\/Crosshair';/);
  assert.match(out, /import \{ Loading as Loading \} from '\.\.\/\.\.\/components\/design\/Status';/);
  assert.ok(out.endsWith('const x = 1;\n'));
});

test('anything else is left as it is, and an unknown name stops the build', () => {
  const other = "import { useState } from 'react';\nimport { Row } from './parts';\nimport { deviceZone } from '../../lib/time/index.js';\n";
  assert.equal(rewriteDesignImports(other, FROM, INDEX_DIR, index), other);
  const sub = "import { isPhoneWidth } from '../../components/design/pageLock';\n";
  assert.equal(rewriteDesignImports(sub, FROM, INDEX_DIR, index), sub);
  assert.throws(() => rewriteDesignImports("import { NoSuchPart } from '../../components/design';", FROM, INDEX_DIR, index), /no NoSuchPart/);
  assert.throws(() => designIndex("export * from './Button';"), /can't read/);
});
