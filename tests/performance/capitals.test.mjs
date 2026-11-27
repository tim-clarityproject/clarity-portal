// The capitals rule (Tim, 27 Nov 2026; Stage D, item 6) and its lasting check,
// scripts/check-capitals.mjs, which the build runs first. Fixtures for each
// rule and each exception, then the whole portal.
//
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_CAPITALS, EXCEPTIONS, KEEPS_CAPITAL_MID_SENTENCE, LIST_NAMES, OLD_FORMS, SKIPPED_FILES, THIRD_PARTY,
  capitalsFiles, capitalsProblems, midSentence, problemsIn, toolNames,
} from '../../scripts/check-capitals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const names = [...new Set([...LIST_NAMES, ...toolNames()])].sort((a, b) => b.length - a.length);
const rules = (text, pageLine = false) => problemsIn(text, { names, pageLine }).map((p) => `${p.rule}: ${p.found}`);

test('item 6: a tool or list name with a later word in capitals fails', () => {
  for (const [text, found] of [
    ['Daily Plan', 'Daily Plan'],
    ['Open the Life Balance Review', 'Life Balance Review'],
    ['Saved to your Confidence Bank.', 'Confidence Bank'],
    ['Weekly Performance Debrief', 'Weekly Performance Debrief'],
    ['Pressure Plan', 'Pressure Plan'],
    ['Emotional Wash', 'Emotional Wash'],
    ['Team Performance Check', 'Team Performance Check'],
    ['Get Unstuck', 'Get Unstuck'],
    ['Monthly Review', 'Monthly Review'],
    ['Peak Moments', 'Peak Moments'],
    ['Travel Plan', 'Travel Plan'],
    ['Sleep Wind Down', 'Sleep Wind Down'],
    ['Quick Add', 'Quick Add'],
    ['After-Action Review', 'After-Action Review'],
    ['Your Performance Score', 'Performance Score'],
    ['Monthly Hardware and Software Review', 'Monthly Hardware and Software Review'],
  ]) assert.ok(rules(text).includes(`capitals: ${found}`), `${text}: ${rules(text)}`);
});

test('item 6: a tool name inside a sentence is lower case', () => {
  for (const [text, found] of [
    ['Start your Daily plan', 'Daily plan'],
    ['Your Pressure plan is ready.', 'Pressure plan'],
    ['They’re waiting in tomorrow’s Daily plan.', 'Daily plan'],
    ['Tonight, Sleep wind down could help.', 'Sleep wind down'],
    ['has finished a Monthly review and shares it.', 'Monthly review'],
  ]) assert.ok(rules(text).includes(`mid-sentence: ${found}`), `${text}: ${rules(text)}`);
  for (const text of ['Start your daily plan', 'Your pressure plan is ready.', 'Tonight, a sleep wind down could help.']) {
    assert.deepEqual(rules(text), [], text);
  }
});

test('item 6: the allowed terms keep their capitals, inside a sentence too', () => {
  for (const text of [
    'Edit my Mission', 'Your Mission isn’t written yet.', 'Open your Individual Performance Plan.',
    'Each of your Outcome Objectives has its Strategies.', 'This week in your Performance Sprint.',
    'Your Individual Performance Dashboard shows it.', 'Your Performance score rose.',
    'Check your Hardware and Software are supporting you.', 'Start your monthly Hardware and Software review',
    'Take the Strategic Alignment Health Check', 'Start a new Health Check',
  ]) assert.deepEqual(rules(text), [], text);
  for (const t of ['My Mission', 'Outcome Objectives', 'Strategies', 'Performance Sprint', 'Individual Performance Plan', 'Individual Performance Dashboard', 'Performance score', 'Hardware', 'Software', 'Strategic Alignment Health Check']) {
    assert.ok(ALLOWED_CAPITALS.includes(t), t);
  }
});

test('item 6: a name at the start of a sentence, a label or a string keeps its capital', () => {
  for (const text of [
    'Daily plan', 'Daily review', 'Confidence bank', 'Life balance review',
    'It’s done. Daily review opens at 17:00.', 'Next: Sleep wind down', '“Daily plan” on the card',
    'Weekly performance debrief — Sprint 4, week 3',
  ]) assert.deepEqual(rules(text), [], text);
  assert.equal(midSentence('Start your '), true);
  assert.equal(midSentence('Done. '), false);
  assert.equal(midSentence(''), false);
  assert.equal(midSentence('Next: '), false);
});

test('item 6: page lines use contractions', () => {
  for (const [text, found] of [
    ['Here is your day.', 'Here is'],
    ['It is ready when you are.', 'It is'],
    ['You are on track.', 'You are'],
    ['Do not worry about it.', 'Do not'],
    ['Your coach does not see this.', 'does not'],
    ['Saved. Here is what’s next.', 'Here is'],
  ]) assert.ok(rules(text, true).includes(`contraction: ${found}`), `${text}: ${rules(text, true)}`);
  for (const text of ['Here’s your day.', 'See how satisfied you are across your life.', 'This session stays as it is.']) {
    assert.deepEqual(rules(text, true), [], text);
  }
  // Only page lines are held to it.
  assert.deepEqual(rules('Here is your day.'), []);
});

test('Tim’s answers (27 Nov): “your confidence bank” inside a sentence, as Draft 9’s line now reads', () => {
  assert.ok(!KEEPS_CAPITAL_MID_SENTENCE.has('Confidence bank'));
  for (const text of ['Your Confidence bank keeps a record of your wins.', 'It counts as done and is saved to your Confidence bank.', 'Win added to 2 Strategies and your Confidence bank.']) {
    assert.ok(rules(text).includes('mid-sentence: Confidence bank'), `${text}: ${rules(text)}`);
  }
  for (const text of ['Your confidence bank keeps a record of your wins.', 'Confidence bank', 'Saved. Confidence bank has it.']) assert.deepEqual(rules(text), [], text);
});

test('Tim’s answers (27 Nov): the old names fail wherever they are', () => {
  for (const [text, found] of [
    ['My Plans', 'My Plans'], ['Back to My Reviews', 'My Reviews'], ['My Journals', 'My Journals'],
    ['Booked a Connection Call', 'Connection Call'], ['Personal Growth / Learning', 'Personal Growth / Learning'],
    ['Purpose / Meaning', 'Purpose / Meaning'], ['This is your Personal Operating Plan.', 'Personal Operating Plan'], ['POP review', 'POP review'],
  ]) assert.ok(rules(text).includes(`old-name: ${found}`), `${text}: ${rules(text)}`);
  assert.ok(rules('My Plans').includes('capitals: My Plans'), 'and the capitals rule names it too');
  for (const text of [
    'My plans', 'Back to My plans', 'Search my reviews', 'My journals', 'My Account', 'Booked a Connection call',
    'From your Connection call page.', 'the Discovery call page', 'Personal growth and learning', 'Leading Ideas', 'Success Factors',
    'This is your Individual Performance Plan, as you wrote it.',
  ]) assert.deepEqual(rules(text), [], text);
  assert.ok(OLD_FORMS.length >= 17);
});

test('the exceptions: Breathe and the call types, other companies’ words, all capitals, legal text', () => {
  assert.deepEqual(rules('Show the Breathe button'), []);
  assert.ok(KEEPS_CAPITAL_MID_SENTENCE.has('Breathe'));
  for (const w of THIRD_PARTY) assert.deepEqual(rules(`Settle with ${w} today`), [], w);
  assert.deepEqual(rules('DAILY PLAN'), [], 'drawn in capitals');
  assert.ok(SKIPPED_FILES.every((s) => s.why && fs.existsSync(path.join(ROOT, s.file))), 'each skipped file exists, with its reason');
  assert.ok(EXCEPTIONS.every((e) => e.why && e.text instanceof RegExp && fs.existsSync(path.join(ROOT, e.file))), 'each exception has its reason');
});

test('the check reads strings and JSX text, never comments, imports or keys', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'tests/performance/.capitals-'));
  try {
    const sample = path.join(dir, 'sample.jsx');
    fs.writeFileSync(sample, [
      '// the Daily Plan in a comment is never read',
      "import x from './Daily Plan.js';",
      "const keys = { 'Daily Plan': 1 };",
      "const a = 'Open your Daily plan.';",
      'const b = <p>Your Confidence Bank</p>;',
      "const c = 'daily_plan';",
      'const d = `Start your ${x} Life Balance Review`;',
      'const e = <PageOpening title="Daily plan" line="Here is your day." />;',
    ].join('\n'));
    const rel = path.relative(ROOT, sample);
    const got = capitalsProblems([rel]).map((p) => p.split(':').slice(1, 3).join(':').trim());
    assert.deepEqual(got.sort(), ['4: mid-sentence', '5: capitals', '7: capitals', '8: contraction'].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the check reads the whole portal: pages, page lines, emails, PDFs and the server', () => {
  const files = capitalsFiles().map((f) => f.split(path.sep).join('/'));
  assert.ok(files.length > 500, `only ${files.length} files`);
  for (const f of ['src/lib/navigation.js', 'src/content/pageLines/client.js', 'src/lib/email/template.js']) assert.ok(files.includes(f), f);
  assert.ok(files.some((f) => f.startsWith('src/lib/pdf/docs/')));
  assert.ok(files.some((f) => f.startsWith('src/pages/coach/')));
  assert.ok(files.some((f) => f.startsWith('api/')));
  // Every tool's name, short name and menu name is checked, and each is sentence case.
  const tools = toolNames();
  assert.ok(tools.includes('Daily plan') && tools.includes('Weekly performance debrief') && tools.includes('Debrief'), tools.join(', '));
  for (const n of tools) assert.deepEqual(rules(n), [], n);
});

test('the portal follows the capitals rule (Tim, 27 Nov; Stage D, item 6)', () => {
  const problems = capitalsProblems();
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});
