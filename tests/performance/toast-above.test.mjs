// A bar fixed at the foot of the screen lifts toasts clear of its buttons
// (tidy pass item 2; src/components/design/toastAbove.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { toastOffsetFor } from '../../src/components/design/toastAbove.js';

test('the toast rises to at least 16px above the bar’s top', () => {
  // The toast region sits 32px up (16px edge + 16px) plus the offset: a bar whose top is 88px from the foot lifts it by 72px, to 104px.
  assert.equal(toastOffsetFor(800, 712), 72);
  assert.equal(32 + toastOffsetFor(800, 712) - (800 - 712), 16);
});

test('a bar out of the way (or not measured) never pulls the toast down', () => {
  assert.equal(toastOffsetFor(800, 800), 0);
  assert.equal(toastOffsetFor(800, 900), 0);
});
