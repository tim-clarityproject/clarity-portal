// Tidy pass, item 13: help that can be dismissed in the client portal
// (src/lib/hiddenHelp.js). Every explanation panel ends with "Don’t show me
// this again", which hides the link or ⓘ that opens it, with Undo; My
// Account, Appearance has "Hidden help" with "Show it again". Kept in
// person_settings.page_preferences.hidden_help. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDDEN_HELP_PREFERENCE,
  cleanHidden,
  helpKeyFor,
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
