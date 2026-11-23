// Tidy pass, item 13: help that can be dismissed in the client portal
// (src/lib/hiddenHelp.js). Every explanation panel ends with "Don’t show me
// this again", which hides the link or ⓘ that opens it, with Undo; My
// Account, Appearance has "Hidden help" with "Show it again". Kept in
// person_settings.page_preferences.hidden_help. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIDDEN_HELP_PREFERENCE,
  HELP_KEYS,
  cleanHidden,
  helpKeyFor,
  migrateHidden,
  hiddenHelpCount,
  hiddenHelpWords,
  isHelpHidden,
  withHelpHidden,
  withHelpShown,
} from '../../src/lib/hiddenHelp.js';

test('it is kept beside the other page settings, under hidden_help', () => {
  assert.equal(HIDDEN_HELP_PREFERENCE, 'hidden_help');
});

test('a key comes from the explanation’s own key, or from its title', () => {
  assert.equal(helpKeyFor({ title: 'How to read the chart' }), 'how-to-read-the-chart');
  assert.equal(helpKeyFor({ title: 'What’s a peak moment?' }), 'what-s-a-peak-moment');
  assert.equal(helpKeyFor({ title: 'Café timing' }), 'cafe-timing');
  assert.equal(helpKeyFor({ title: 'How to read the chart' }, 'hc-chart'), 'hc-chart');
  assert.equal(helpKeyFor({}), null);
  assert.equal(helpKeyFor(null), null);
  assert.ok(helpKeyFor({ title: 'x'.repeat(300) }).length <= 80);
});

test('hiding one, then Undo, leaves the rest as they were', () => {
  const before = { 'how-to-read-the-chart': true };
  const hidden = withHelpHidden(before, 'why-we-ask');
  assert.deepEqual(hidden, { 'how-to-read-the-chart': true, 'why-we-ask': true });
  assert.equal(isHelpHidden(hidden, 'why-we-ask'), true);
  assert.equal(isHelpHidden(hidden, 'another'), false);
  assert.deepEqual(withHelpShown(hidden, 'why-we-ask'), before);
  assert.deepEqual(before, { 'how-to-read-the-chart': true }, 'the old copy is never changed');
});

test('a stray or broken saved value never hides anything', () => {
  assert.deepEqual(cleanHidden(null), {});
  assert.deepEqual(cleanHidden([]), {});
  assert.deepEqual(cleanHidden('yes'), {});
  assert.deepEqual(cleanHidden({ a: true, b: false, c: 'true', d: 1 }), { a: true });
  assert.equal(isHelpHidden({ constructor: true }, 'toString'), false);
  assert.equal(isHelpHidden({}, null), false);
});

test('My Account counts what is hidden, in the coach portal’s words', () => {
  assert.equal(hiddenHelpCount({ a: true, b: true, c: false }), 2);
  assert.equal(hiddenHelpWords(0), 'Nothing is hidden.');
  assert.equal(hiddenHelpWords(1), '1 explanation is hidden.');
  assert.equal(hiddenHelpWords(3), '3 explanations are hidden.');
});

// Tidy follow-up 3 (tidy 1's 5): each explanation has a fixed name, so a
// retitled panel stays hidden; anything hidden under its old title stays
// hidden, moved to the fixed name when it is read.
test('help hidden under an old title stays hidden, under its fixed name', () => {
  const before = { 'what-s-a-peak-moment': true, 'why-we-ask-about-alcohol': true, other: true };
  const after = migrateHidden(before);
  assert.deepEqual(after, { 'peak-moment': true, 'checkin-why-alcohol': true, other: true });
  assert.deepEqual(before, { 'what-s-a-peak-moment': true, 'why-we-ask-about-alcohol': true, other: true }, 'the old copy is never changed');
  assert.deepEqual(migrateHidden(after), after, 'reading it again changes nothing');
  // One old title for two explanations: both stay hidden.
  assert.deepEqual(migrateHidden({ 'how-to-read-the-chart': true }), { 'hc-chart': true, 'hc-compare-chart': true });
  assert.deepEqual(migrateHidden(null), {});
});

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
}

test('every client explanation that can be hidden has a fixed name in HELP_KEYS', () => {
  const root = new URL('../../src/', import.meta.url).pathname;
  const used = new Set();
  for (const file of files(root)) {
    if (file.includes('/pages/coach/') || file.includes('/lib/coach/')) continue; // the coach portal keeps its own
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/helpKey(?:=|: *)["'`]([a-z0-9-]+)(\$\{[^}]+\})?["'`]/g)) {
      if (m[2]) for (const kind of ['alcohol', 'mood', 'health']) used.add(`${m[1]}${kind}`);
      else used.add(m[1]);
    }
    // An explanation opened from TermInfo, SentenceInfo, ExplainLink or
    // ExplainInfo with no fixed name would be hidden by its title again.
    for (const m of text.matchAll(/<(TermInfo|SentenceInfo|ExplainLink|ExplainInfo)\b([^>]*)>/g)) {
      if (!/explain=/.test(m[2]) || /helpKey|action=/.test(m[2])) continue;
      if (file.endsWith('/components/design/Explain.jsx') || file.endsWith('/components/design/TermInfo.jsx') || file.endsWith('/components/design/GuidedTool.jsx')) continue;
      assert.fail(`${file.replace(root, 'src/')}: <${m[1]}> opens an explanation with no helpKey`);
    }
  }
  used.delete('sprint-todos-roll'); // Section's first-visit tip, not an explanation
  for (const key of used) assert.ok(HELP_KEYS[key], `${key} is in HELP_KEYS`);
  assert.ok(used.has('peak-moment') && used.has('checkin-why-health'));
});
