// Tidy follow-up 3 (tidy 1's 6; Tim, 23 Oct): the chat button says "Chat to"
// and the coach's first name, never "Dr.": "Chat to Tim". "Dr. Tim" is
// only ever the start of the full name, "Dr. Tim Dutton".
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainFirstName } from '../../src/lib/coachName.js';

test('a title before the coach’s first name is left off', () => {
  assert.equal(plainFirstName('Tim'), 'Tim');
  assert.equal(plainFirstName('Dr. Tim'), 'Tim');
  assert.equal(plainFirstName('Dr Tim'), 'Tim');
  assert.equal(plainFirstName(' dr.Tim '), 'Tim');
  assert.equal(plainFirstName('Professor Adie'), 'Adie');
  assert.equal(plainFirstName('Drew'), 'Drew', 'a name that starts with the letters is kept');
  assert.equal(plainFirstName('Dr.'), null);
  assert.equal(plainFirstName(''), null);
  assert.equal(plainFirstName(null), null);
});
