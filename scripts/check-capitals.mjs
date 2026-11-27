// The capitals rule (Tim, 27 Nov 2026; Stage D, item 6). Stops the build, and
// tests/performance/capitals.test.mjs fails, when the words people see break it:
//
// 1. Capitals only for My Mission and Mission, Outcome Objectives, Strategies,
//    Performance Sprint, Individual Performance Plan, Individual Performance
//    Dashboard, Performance score (a capital P only), Hardware, Software and
//    the Strategic Alignment Health Check (`ALLOWED_CAPITALS`). Every tool and
//    list name is sentence case ("Daily plan", "Confidence bank"), so a name
//    with a later word in capitals ("Daily Plan", "Quick Add") fails.
// 2. Inside a sentence a tool's name is lower case ("Start your daily plan",
//    "Your pressure plan"), so "your Daily plan" fails. A name at the start of
//    a sentence, a label or a string keeps its capital.
// 3. Page lines use contractions ("Here's", never "Here is"): every string in
//    src/content/pageLines and every PageOpening `line`.
//
// Nekst titles are drawn in capitals by CSS and are unaffected: their source
// text is sentence case like everything else.
//
// What it reads: every string and piece of JSX text in src/ (client and coach
// pages, src/content, the emails in src/lib/email, the PDFs in src/lib/pdf)
// and in api/ (the server's emails),
// parsed with rolldown's parser, so comments, imports, object keys and names
// in code are never read. Strings with no space (code identifiers, keys,
// stored values) and addresses never hold a two-word name, so they never fail.
// The few real exceptions are in `EXCEPTIONS`, each with its reason.
//
// Run: node scripts/check-capitals.mjs (the build runs it first).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Words that keep their capital wherever they are (item 6). */
export const ALLOWED_CAPITALS = [
  'My Mission', 'Mission', 'Missions',
  'Outcome Objectives', 'Outcome Objective', 'Objectives', 'Objective',
  'Strategies', 'Strategy',
  'Performance Sprint', 'Performance Sprints',
  'Individual Performance Plan', 'Performance Plan',
  'Individual Performance Dashboard', 'Performance Dashboard', 'Dashboard',
  'Performance score',
  'Hardware', 'Software',
  'Strategic Alignment Health Check', 'Health Check', 'Health Checks',
];

/**
 * Tool and list names, written as they should be (sentence case). TOOLS' own
 * names, short names and menu names in src/lib/navigation.js join these when
 * the check runs (`toolNames`), so a new tool is covered without a change here.
 */
export const LIST_NAMES = [
  'Daily plan', 'Daily review', 'Weekly performance debrief', 'Weekly debrief',
  'Life balance review', 'Confidence bank', 'After-action review',
  'Pressure plan', 'Emotional wash', 'Team performance check', 'Team check',
  'Get unstuck', 'Monthly review', 'Monthly Hardware and Software review',
  'Peak moments', 'Peak moment', 'Travel plan', 'Sleep wind down', 'Quick add',
  'Time audit', 'Meeting planner', 'Give difficult feedback', 'Difficult feedback',
  'First check-in', 'Plan my day', 'Review my day', 'Daily journal',
  'Find my sweet spot', 'Understand their sweet spot', 'Delegation audit',
  'Identity beyond the role', 'Stay deliberate under pressure', 'New idea check',
  'Prepare for a difficult conversation', 'Prepare for a pitch',
  'Map my stakeholders', 'Map my team', 'Decide who decides', 'Strategy on a page',
  'Pre-mortem for an initiative', 'Recovery mode', 'Weekly momentum check',
  'Performance evidence', 'Work’s done for today', 'Success leaves clues',
  'Performance score',
  // Tim's answers of 27 Nov (item 6's follow-up): the saved-item lists and the coach's second call type.
  'My plans', 'My reviews', 'My journals', 'Connection call', 'Discovery call',
];

/**
 * Names whose capital stays mid-sentence too, besides the allowed terms:
 * Breathe (the floating button's own name, "Show the Breathe button") and the
 * coach's two call types, each a named page ("Booked a Connection call", "the
 * Discovery call page"). The Confidence bank is not one of them: inside a
 * sentence it is "your confidence bank" (Tim, 27 Nov: the capitals rule wins
 * over Draft 9's "Your Confidence bank keeps a record of your wins").
 */
export const KEEPS_CAPITAL_MID_SENTENCE = new Set(['Breathe', 'Connection call', 'Discovery call']);

/**
 * Old forms that fail wherever they are, as written (Tim's answers, 27 Nov):
 * the lists' old capitals, the old call type's, the life balance areas' old
 * names (sentence case with "and" for the slash), and the old plan's name,
 * which is never shown: it reads as the Individual Performance Plan. Saved
 * values that still hold them are read through the display (shownTitle,
 * shownCallName, areaName), never shown as stored.
 */
export const OLD_FORMS = [
  'My Plans', 'My Reviews', 'My Journals', 'Connection Call', 'Connection Calls',
  'Career / Work', 'Financial / Money', 'Health / Fitness', 'Relationships / Family', 'Romance / Partner',
  'Personal Growth / Learning', 'Fun / Recreation', 'Physical Environment / Home', 'Contribution / Community',
  'Purpose / Meaning', 'Personal Operating Plan', 'POP review',
];

/**
 * Uncontracted forms a page line never uses (question rules 5; item 6). A
 * sentence's opening ("Here is", "You are") always contracts; inside a
 * sentence only the negatives are checked, since "how satisfied you are" and
 * "stays as it is" can't contract.
 */
export const UNCONTRACTED = [
  'Here is', 'It is', 'You are', 'We are', 'They are', 'I am', 'That is', 'There is',
  'What is', 'Who is', 'Where is', 'Let us', 'You will', 'We will', 'It will',
];
export const UNCONTRACTED_NEGATIVES = [
  'do not', 'does not', 'did not', 'is not', 'are not', 'was not', 'were not',
  'will not', 'would not', 'could not', 'should not', 'cannot', 'can not',
  'have not', 'has not', 'had not',
];

/**
 * The real exceptions, each with its reason. `file` is the path from the repo's
 * root; `text` matches the string; `rule` is the rule it is excused from.
 */
export const EXCEPTIONS = [
  // Legal text: the agreement's clauses are the contract both sides sign, kept
  // word for word until the lawyer's draft (as CLAUDE.md rule 8's "mission
  // statement"); "your First check-in" names the session in them.
  { file: 'src/lib/agreements/standardWording.js', rule: 'mid-sentence', text: /First check-in/, why: 'legal text: the agreement clauses' },
  { file: 'src/lib/billing/agreementText.js', rule: 'mid-sentence', text: /First check-in/, why: 'legal text: the agreement clauses' },
];

/**
 * Files never read, each with its reason. (The outside Health Check's approved
 * Quick guide wording is its captions file, src/pages/healthCheck/media/*.vtt,
 * and health-check.html, which the check doesn't read: only code is read.)
 */
export const SKIPPED_FILES = [
  // Legal text: the privacy notice and terms, word for word until the lawyer's draft.
  { file: 'src/content/legal.js', why: 'legal text' },
];

/**
 * Other companies' own words, taken out of a string before it is checked, so
 * their capitals never count: Stripe's and Apple's names for their products.
 */
export const THIRD_PARTY = ['Apple Pay', 'Google Pay', 'Apple Wallet', 'Direct Debit', 'Stripe Checkout', 'Customer Portal', 'Sign in with Apple', 'App Store'];

// ---------------------------------------------------------------------------

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

/** The files people's words live in. */
export function capitalsFiles() {
  const code = (n) => /\.(jsx?|mjs)$/.test(n) && !/\.test\./.test(n);
  return [...walkDir('src', code), ...walkDir('api', code)]
    .filter((f) => !f.startsWith(path.join('src', '__tests__')));
}

/** TOOLS' names, short names and menu names, read from navigation.js's source. */
export function toolNames() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/navigation.js'), 'utf8');
  const block = src.slice(src.indexOf('export const TOOLS'), src.indexOf('export const HUBS'));
  return [...block.matchAll(/^\s+(?:name|short|menu):\s*'([^']+)'/gm)].map((m) => m[1]);
}

const lineAt = (src, at) => src.slice(0, at).split('\n').length;

/** Every string and JSX text in a file: { text, line, lineProp }. */
export function stringsIn(file, src) {
  let ast;
  try {
    ast = parseAst(src, { lang: file.endsWith('.jsx') ? 'jsx' : 'js' });
  } catch {
    ast = parseAst(src, { lang: 'jsx' });
  }
  const found = [];
  const walk = (node, parent, key, inLine) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return;
    // A PageOpening's `line`: a page line, so its contractions are checked.
    let lineHere = inLine;
    if (node.type === 'JSXAttribute' && node.name?.name === 'line' && parent?.type === 'JSXOpeningElement'
      && /PageOpening/.test(parent.name?.name || '')) lineHere = true;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const isKey = parent && parent.type === 'Property' && key === 'key' && !parent.computed;
      if (!isKey && key !== 'source') found.push({ text: node.value, line: lineAt(src, node.start), lineProp: lineHere });
    } else if (node.type === 'TemplateElement') {
      found.push({ text: node.value.cooked ?? node.value.raw, line: lineAt(src, node.start), lineProp: lineHere });
    } else if (node.type === 'JSXText') {
      found.push({ text: node.value, line: lineAt(src, node.start), lineProp: lineHere });
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && walk(c, node, k, lineHere));
      else if (v && typeof v === 'object') walk(v, node, k, lineHere);
    }
  };
  walk(ast, null, null, false);
  return found;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The allowed terms' capitalised words ("Performance score" gives Performance, never score).
const allowedWords = new Set(ALLOWED_CAPITALS.flatMap((t) => t.split(' ')).filter((w) => /^\p{Lu}/u.test(w)));

/** A name's words that must stay lower case after its first word. */
function lowerWords(name) {
  return name.split(' ').slice(1).filter((w) => !allowedWords.has(w) && /^[a-z]/.test(w));
}

const isAllCaps = (s) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

/**
 * Problems in one string: { rule, found }. `names` are the sentence-case tool
 * and list names; `pageLine` says whether contractions are checked.
 */
export function problemsIn(text, { names, pageLine = false }) {
  const out = [];
  if (!text || isAllCaps(text)) return out;
  const flat = THIRD_PARTY.reduce((t, w) => t.split(w).join(' '.repeat(w.length)), text.replace(/\s+/g, ' '));
  for (const name of names) {
    const words = name.split(' ');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}-])(${words.map(escape).join(' ')})(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of flat.matchAll(re)) {
      const got = m[2];
      const gotWords = got.split(' ');
      const lowers = new Set(lowerWords(name));
      // 1. A later word in capitals that should be lower case.
      const badLater = gotWords.slice(1).some((w, i) => lowers.has(words[i + 1]) && /^\p{Lu}/u.test(w));
      if (badLater) { out.push({ rule: 'capitals', found: got }); continue; }
      // 2. A capital first letter inside a sentence.
      if (!/^\p{Lu}/u.test(got)) continue;
      if (allowedWords.has(words[0]) || ALLOWED_CAPITALS.includes(name) || KEEPS_CAPITAL_MID_SENTENCE.has(name)) continue;
      const before = flat.slice(0, m.index + m[1].length);
      if (midSentence(before)) out.push({ rule: 'mid-sentence', found: got });
    }
  }
  for (const form of OLD_FORMS) {
    if (new RegExp(`(^|[^\\p{L}])${escape(form)}(?![\\p{L}])`, 'u').test(flat)) out.push({ rule: 'old-name', found: form });
  }
  if (pageLine) {
    for (const form of UNCONTRACTED) {
      // Case as written: a sentence's opening.
      const m = flat.match(new RegExp(`(^|[.!?…]\\s+|[“"‘(]\\s*)(${escape(form)})(?![\\p{L}’'])`, 'u'));
      if (m) out.push({ rule: 'contraction', found: m[2] });
    }
    for (const form of UNCONTRACTED_NEGATIVES) {
      const m = flat.match(new RegExp(`(^|[^\\p{L}])(${escape(form)})(?![\\p{L}’'])`, 'iu'));
      if (m) out.push({ rule: 'contraction', found: m[2] });
    }
  }
  return out;
}

/**
 * Whether what comes before a name puts it inside a sentence: a word or comma
 * before it, then a space, with no sentence end, colon, dash or opening quote.
 */
export function midSentence(before) {
  const tail = before.replace(/\s+$/, '');
  if (!tail) return false;
  if (/[.!?:;…“"‘(\[–—•·|/>]$/.test(tail)) return false;
  // A space-less join (a template's `${x}Daily`) can't be judged: let it be.
  if (!/\s$/.test(before)) return false;
  return /[\p{L}\p{N},’']$/u.test(tail);
}

const isPageLineFile = (file) => file.startsWith(path.join('src', 'content', 'pageLines') + path.sep);

/** Every problem in the given files: "file:line: rule: found in “text”". */
export function capitalsProblems(files = capitalsFiles(), { names } = {}) {
  const allNames = [...new Set([...(names || [...LIST_NAMES, ...toolNames()])])]
    .sort((a, b) => b.length - a.length);
  const problems = [];
  for (const file of files) {
    if (SKIPPED_FILES.some((x) => x.file === file.split(path.sep).join('/'))) continue;
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const { text, line, lineProp } of stringsIn(file, src)) {
      if (!/\s/.test(text.trim()) && text.trim().length < 3) continue;
      if (/^(\/|https?:|mailto:)/.test(text.trim())) continue;
      const found = problemsIn(text, { names: allNames, pageLine: lineProp || isPageLineFile(file) });
      // A longer name found takes the place of the shorter ones inside it.
      const kept = found.filter((p, i) => !found.some((q, j) => j !== i && q.found.length > p.found.length
        && q.found.toLowerCase().includes(p.found.toLowerCase()) && q.rule === p.rule));
      for (const p of kept) {
        if (EXCEPTIONS.some((e) => e.file === file.split(path.sep).join('/') && (!e.rule || e.rule === p.rule) && e.text.test(text))) continue;
        problems.push(`${file}:${line}: ${p.rule}: “${p.found}” in “${text.replace(/\s+/g, ' ').trim().slice(0, 140)}”`);
      }
    }
  }
  return [...new Set(problems)];
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const problems = capitalsProblems();
  if (problems.length) {
    console.error(`The capitals rule (Stage D, item 6): ${problems.length} place${problems.length === 1 ? '' : 's'} to fix.\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Capitals: every tool and list name is sentence case, and every page line uses contractions.');
}
