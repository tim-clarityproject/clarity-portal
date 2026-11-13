// The break-it tester, 13 Nov: Supabase's "Email link is invalid or has
// expired" was read as a wrong email address, because it holds both words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../../src/lib/friendlyError.js';

test('"Email link is invalid" is about a link, never called a wrong email address', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(friendlyError({ code: 'otp_expired', message: 'Email link is invalid or has expired' }, 'The page’s own line.'), 'The page’s own line.');
    assert.equal(friendlyError({ message: 'Unable to validate email address: invalid format' }, 'The page’s own line.'), 'That email address doesn’t look right. Check it and try again.');
  } finally {
    console.error = quiet;
  }
});
