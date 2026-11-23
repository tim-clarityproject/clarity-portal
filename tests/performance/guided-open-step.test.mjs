// A finished guided tool opens on its summary even when the person's own
// questions arrive after the first screen is drawn (scale check, step 4,
// functionality tester, 23 Nov): GuidedTool keeps the step it was asked to
// open on by its key until the person moves (openStepIndex in guideDraft.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStepIndex } from '../../src/components/design/guideDraft.js';

const core = [{ key: 'sleep' }, { key: 'grateful' }, { key: 'risk' }];
const summary = { key: 'summary' };

test('the summary asked for is found again after own questions arrive before it', () => {
  const before = [...core, summary];
  const at = openStepIndex(before, 'summary', 0);
  assert.equal(at, 3);
  const after = [...core, { key: 'own-1' }, { key: 'own-2' }, summary];
  // Without the key the index would stay 3, the first own question.
  assert.equal(after[at].key, 'own-1');
  assert.equal(openStepIndex(after, 'summary', at), 5);
});

test('nothing asked for, or a key that is not there, keeps the index', () => {
  assert.equal(openStepIndex([...core, summary], null, 2), 2);
  assert.equal(openStepIndex([...core, summary], undefined, 1), 1);
  assert.equal(openStepIndex(core, 'summary', 2), 2);
});
