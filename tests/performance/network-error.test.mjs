// "No connection" and "the server said no" must never be confused: a save
// the database refuses is told to the person, one that couldn't be sent is
// kept and tried again (src/lib/connection.js, src/lib/syncQueue.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNetworkError } from '../../src/lib/connection.js';

test('no connection: a fetch that never got an answer, however the browser words it', () => {
  for (const error of [new TypeError('Failed to fetch'), { name: 'AbortError', message: 'The operation was aborted.' }, { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
    { message: 'Load failed' }, { message: 'NetworkError when attempting to fetch resource.' }, { message: 'The request timed out' }, { message: 'You are offline' }]) {
    assert.equal(isNetworkError(error), true, error.message);
  }
});

test('the database’s own refusal is never "no connection", even when its words hold "network" (Network, Phase 6a run 4)', () => {
  for (const error of [
    { code: '23514', message: 'new row for relation "network_people" violates check constraint "network_people_trust_check"' },
    { code: '42501', message: 'new row violates row-level security policy for table "network_gives"' },
    { code: '42501', message: 'Both people must be in your Network.' },
    { code: '23505', message: 'duplicate key value violates unique constraint "network_columns_one_name"' },
    { code: 'PGRST205', message: "Could not find the table 'public.network_people' in the schema cache" },
    { code: 'PGRST202', message: 'Could not find the function public.network_page in the schema cache' },
    { code: '22023', message: 'That’s too many at once. Choose fewer and try again.' },
  ]) assert.equal(isNetworkError(error), false, error.message);
  assert.equal(isNetworkError(null), false);
  assert.equal(isNetworkError({ message: 'Something else went wrong' }), false);
});
