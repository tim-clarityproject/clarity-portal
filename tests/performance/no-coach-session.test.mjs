// Tim, 29 Oct: "Next coaching session" stays hidden until the coach portal
// exists (M15's coach view). Nothing a person can see may show it: every
// source file, page and piece of page text is searched. The browser side
// is checked too: tests/popups.mjs reads every page it opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const TEXT = /next\s+coaching\s+session/i;
const KINDS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.html', '.css', '.json', '.md']);

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return KINDS.has(extname(name)) ? [path] : [];
  });
}

test('"Next coaching session" is shown nowhere until the coach portal exists', () => {
  const found = [...files('src'), ...files('public'), 'index.html', 'health-check.html']
    .filter((f) => existsSync(f) && TEXT.test(readFileSync(f, 'utf8')));
  assert.deepEqual(found, [], `found in ${found.join(', ')}`);
});
