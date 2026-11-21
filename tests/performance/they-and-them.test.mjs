// They and them (Tim, 19 Nov, 21:43): every place The Clarity Portal speaks
// about a person uses they, them and their. This reads the portal's own
// wording, never anything a person saved: every string and every piece of JSX
// text in src/ (screens, pop-ups, toasts, src/content, the email examples, the
// PDF documents, the design reference's demo text), the server's emails in
// api/, the saved email templates, the Quick guide's captions, and the seeds
// and stand-ins whose invented people the screens show. It fails on she, he,
// her, his or him (whole words, any case, so "this" and "the" never count).
//
// How it reads: JavaScript and JSX are parsed (rolldown's parser, which Vite
// brings), so comments, names in code and object keys are never read, only
// the strings and the JSX text. CSS files are not read at all. SQL seeds are
// read for their quoted strings only, with -- comments taken out first. HTML
// and the captions are read as their visible text.
//
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORDS = /\b(she|he|her|hers|herself|his|him|himself)\b/i;

// Real quotes only, each with its reason. Keep it short.
const ALLOW = [
  // { file: 'src/…', text: /…/, why: 'the published title of …' },
];

const walkDir = (dir, keep, out = []) => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(rel, keep, out);
    else if (keep(entry.name)) out.push(rel);
  }
  return out;
};

const isCode = (name) => /\.(jsx?|mjs)$/.test(name);

// Where the portal's wording lives.
export function wordingFiles() {
  return [
    ...walkDir('src', (n) => isCode(n) || n.endsWith('.vtt')),
    ...walkDir('api', isCode),
    ...walkDir('email-templates', (n) => /\.(html|txt)$/.test(n)),
    'health-check.html',
    'index.html',
    // Seeds and stand-ins: the invented people the screens and PDFs show.
    'tests/coach/seed.mjs',
    ...walkDir('tests/coach', (n) => /standin|stub|shared/.test(n) && isCode(n)),
    'tests/healthcheck/inside-shared.mjs',
    'tests/healthcheck/hc-shared.mjs',
    'tests/phase8/shared.mjs',
    'tests/pdf/make-pdfs.mjs',
    'scripts/seed-test-plan.mjs',
    'scripts/seed-test-ratings.mjs',
    'scripts/seed-test-data.sql',
    'scripts/make-evidence-seed.mjs',
  ].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

const lineAt = (src, at) => src.slice(0, at).split('\n').length;

function stringsInCode(file, src) {
  let ast;
  try {
    ast = parseAst(src, { lang: file.endsWith('.jsx') ? 'jsx' : 'js' });
  } catch {
    ast = parseAst(src, { lang: 'jsx' });
  }
  const found = [];
  const walk = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration') return;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      // An object's own key and a module's address are code, never wording.
      const isKey = parent && parent.type === 'Property' && key === 'key' && !parent.computed;
      const isSource = key === 'source';
      if (!isKey && !isSource) found.push({ text: node.value, line: lineAt(src, node.start) });
    } else if (node.type === 'TemplateElement') {
      found.push({ text: node.value.cooked ?? node.value.raw, line: lineAt(src, node.start) });
    } else if (node.type === 'JSXText') {
      found.push({ text: node.value, line: lineAt(src, node.start) });
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && walk(c, node, k));
      else if (v && typeof v === 'object') walk(v, node, k);
    }
  };
  walk(ast, null, null);
  return found;
}

function stringsInSql(src) {
  const found = [];
  const lines = src.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/--.*$/, '');
    for (const m of line.matchAll(/'((?:[^']|'')*)'/g)) found.push({ text: m[1].replace(/''/g, "'"), line: i + 1 });
  });
  return found;
}

function stringsInText(file, src) {
  let body = src;
  if (file.endsWith('.html')) {
    body = body.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  }
  return body.split('\n').map((raw, i) => ({
    text: file.endsWith('.html') ? raw.replace(/<[^>]*>/g, ' ') : raw,
    line: i + 1,
  }));
}

export function wordingProblems(files = wordingFiles()) {
  const problems = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const strings = isCode(file) ? stringsInCode(file, src)
      : file.endsWith('.sql') ? stringsInSql(src)
      : stringsInText(file, src);
    for (const { text, line } of strings) {
      if (!WORDS.test(text)) continue;
      if (ALLOW.some((a) => a.file === file && a.text.test(text))) continue;
      problems.push(`${file}:${line}: ${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    }
  }
  return problems;
}

test('the scanner finds the words it should, and only whole words', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'tests/performance/.they-'));
  try {
    const sample = path.join(dir, 'sample.jsx');
    fs.writeFileSync(sample, [
      '// her notes are a comment, never wording',
      "import his from './his.js';",
      'const himself = { her: 1 };',
      "const a = 'This is the thing.';",
      "const b = 'Ask him first.';",
      'const c = `She said ${a}`;',
      'const d = <p>Then his answer.</p>;',
      "const e = { label: 'Their answer' };",
    ].join('\n'));
    const rel = path.relative(ROOT, sample);
    const got = wordingProblems([rel]).map((p) => p.split(':')[1]);
    assert.deepEqual(got, ['5', '6', '7']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every file the check reads can be read', () => {
  const files = wordingFiles();
  assert.ok(files.length > 500, `only ${files.length} files`);
  assert.ok(files.includes('src/pages/emailPreview/examples.js'));
  assert.ok(files.some((f) => f.startsWith('src/lib/pdf/docs/')));
  assert.ok(files.some((f) => f.startsWith('src/content/')));
});

test('the portal speaks of people as they, them and their (Tim, 19 Nov, 21:43)', () => {
  const problems = wordingProblems();
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});
