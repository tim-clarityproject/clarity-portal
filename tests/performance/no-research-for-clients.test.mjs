// Clients never see research (Stage D item 18; Tim, 27 Nov): no references, evidence strengths, "Why this works" or
// citations anywhere a client reads: screens, ⓘ pop-ups and side panels, PDFs, emails, the outside Health Check and
// the public How it works page. The ⓘ explains a term or how a score is worked out, in plain words.
//
// Reads the words in every client-facing source file (string literals and JSX text, with comments left out, since
// a comment may name the source behind a choice: docs/claims-register.md is where the evidence lives) and fails any
// that reads like research. Coach-only code (src/pages/coach, src/lib/coach) and the design gallery are left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const SCAN = ['src', 'api', 'health-check.html', 'index.html'];
const SKIP = [/^src\/pages\/coach\//, /^src\/lib\/coach\//, /^src\/pages\/designReference\//, /\.test\./];
const EXT = /\.(jsx?|mjs|html|md|json)$/;

/** What reads like research: a phrase or a citation. */
export const RESEARCH = [
  [/\bresearch (shows|suggests|finds|found|says|tells us|has shown)\b/i, 'research says'],
  [/\b(studies|a study|one study|the study) (show|shows|suggest|suggests|found|find|finds)\b/i, 'a study shows'],
  [/\baccording to (a |the |recent )?(study|studies|research|scientists|researchers)\b/i, 'according to research'],
  [/\bscientifically proven\b|\bproven by science\b|\bscience (shows|says)\b/i, 'science says'],
  [/\bet al\b/i, 'et al.'],
  [/\bdoi\.org\b|\bdoi:\s*10\./i, 'a DOI'],
  [/\bwhy this works\b|\bwhy it works\b/i, 'Why this works'],
  [/\b(evidence|research) (strength|level|grade|rating)s?\b|\bstrength of (the )?evidence\b|\b(strong|moderate|weak|limited) evidence\b/i, 'an evidence strength'],
  [/\bmeta-analys[ie]s\b|\bpeer[- ]reviewed\b|\brandomi[sz]ed controlled\b/i, 'a kind of study'],
  [/\b[A-Z][a-z]+(?: and [A-Z][a-z]+)?,? \(?(19|20)\d\d[a-z]?\)/, 'an author and year'],
  [/^(references|sources|further reading|the evidence)$/i, 'a references list'],
  [/\bclaims register\b/i, 'the claims register'],
];

/** The words a file shows: its string literals and JSX text, with comments taken out first. */
export function shownWords(source) {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line.replace(/(^|[\s;,)}\]])\/\/(?!\/).*$/, '$1')))
    .join('\n');
  const out = [];
  const lit = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = lit.exec(noComments))) out.push(m[1] ?? m[2] ?? m[3]);
  const jsx = />([^<>{}]+)</g;
  while ((m = jsx.exec(noComments))) out.push(m[1]);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[a-z]/i.test(s));
}

export function researchIn(words) {
  const found = [];
  for (const w of words) for (const [re, what] of RESEARCH) if (re.test(w)) found.push(`${what}: “${w.slice(0, 120)}”`);
  return found;
}

function files(path) {
  const abs = join(ROOT, path);
  const st = statSync(abs);
  if (st.isFile()) return [path];
  return readdirSync(abs).flatMap((f) => files(join(path, f)));
}

test('the scanner finds research wording and leaves plain words alone', () => {
  assert.deepEqual(researchIn(shownWords("const a = 'Research shows sleep matters.';")).length, 1);
  assert.equal(researchIn(shownWords('<p>Why this works</p>')).length, 1);
  assert.equal(researchIn(shownWords("const c = 'Walker et al. found this.';")).length, 1);
  assert.equal(researchIn(shownWords("const d = 'Hirshkowitz, 2015)';")).length, 1);
  assert.equal(researchIn(shownWords("const e = 'Strong evidence';")).length, 1);
  // Comments may name a source; only shown words count.
  assert.equal(researchIn(shownWords("// 7 to 9 hours (Hirshkowitz et al., 2015)\nconst f = 'Your sleep target is 7 to 9 hours.';")).length, 0);
  assert.equal(researchIn(shownWords("/* Watson et al., 2015 */ const g = 'How your score is worked out.';")).length, 0);
  assert.equal(researchIn(shownWords("const h = 'Each week compares with the standard you set.';")).length, 0);
});

test('no client-facing words cite research, evidence strengths or "Why this works"', () => {
  const all = SCAN.flatMap(files)
    .map((f) => relative(ROOT, join(ROOT, f)))
    .filter((f) => EXT.test(f) && !SKIP.some((re) => re.test(f)));
  assert.ok(all.length > 200, `read ${all.length} files`);
  const found = all.flatMap((f) => researchIn(shownWords(readFileSync(join(ROOT, f), 'utf8'))).map((x) => `${f}: ${x}`));
  assert.deepEqual(found, []);
});
