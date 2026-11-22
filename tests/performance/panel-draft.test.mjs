// Slide-in panels keep their draft (tidy pass item 3; src/lib/panelDraft.js,
// used by the shared panel through src/components/design/usePanelDraft.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPanelDraft, fieldEntry, fieldsToRestore, hasTyping, keepPanelDraft, readPanelDraft, sameFields } from '../../src/lib/panelDraft.js';

const opened = [fieldEntry(0, 'What needs doing?', ''), fieldEntry(1, 'Notes', '')];

test('a field is kept with its place, its label (tidied) and its words', () => {
  assert.deepEqual(fieldEntry(2, '  What needs\n doing? ', 'Call Sam'), { i: 2, label: 'What needs doing?', v: 'Call Sam' });
  assert.equal(fieldEntry(0, 'x', null).v, '');
});

test('only typing counts: an untouched panel, or one emptied again, keeps nothing', () => {
  assert.equal(hasTyping(opened, opened), false);
  assert.equal(hasTyping([fieldEntry(0, 'What needs doing?', 'Call Sam'), opened[1]], opened), true);
  assert.equal(hasTyping([fieldEntry(0, 'What needs doing?', '   '), opened[1]], opened), false);
  // An edit panel that opened with words: changing them is typing.
  const edit = [fieldEntry(0, 'Name', 'Sam Okafor')];
  assert.equal(hasTyping([fieldEntry(0, 'Name', 'Sam Okafor-Reid')], edit), true);
  assert.equal(sameFields(edit, [fieldEntry(0, 'Name', 'Sam Okafor')]), true);
});

test('a draft goes back only into the box it came from', () => {
  const kept = [fieldEntry(0, 'What needs doing?', 'Call Sam'), fieldEntry(1, 'Notes', 'About the offsite')];
  assert.deepEqual(fieldsToRestore(kept, opened), [{ i: 0, v: 'Call Sam' }, { i: 1, v: 'About the offsite' }]);
  // A box with another label in that place is left alone.
  assert.deepEqual(fieldsToRestore(kept, [fieldEntry(0, 'Email', ''), fieldEntry(1, 'Notes', '')]), [{ i: 1, v: 'About the offsite' }]);
  // Moved, but the only box with its label: it still goes back.
  assert.deepEqual(fieldsToRestore([fieldEntry(3, 'Notes', 'x')], opened), [{ i: 1, v: 'x' }]);
  // Already holding the same words: nothing to put back (and no "Draft restored").
  assert.deepEqual(fieldsToRestore(kept, kept), []);
  // Two boxes with one label and neither in its place: too unsure, nothing goes back.
  assert.deepEqual(fieldsToRestore([fieldEntry(5, 'Row', 'a')], [fieldEntry(0, 'Row', ''), fieldEntry(1, 'Row', '')]), []);
});

test('signed out, a draft lasts for the visit; clearing it after a save lets it go', () => {
  const fields = [fieldEntry(0, 'What needs doing?', 'Call Sam')];
  keepPanelDraft(null, 'todo:new', fields);
  assert.deepEqual(readPanelDraft(null, 'todo:new'), fields);
  assert.equal(readPanelDraft(null, 'todo:other'), null);
  clearPanelDraft(null, 'todo:new');
  assert.equal(readPanelDraft(null, 'todo:new'), null);
  // No key, nothing kept.
  keepPanelDraft(null, null, fields);
  assert.equal(readPanelDraft(null, null), null);
});
