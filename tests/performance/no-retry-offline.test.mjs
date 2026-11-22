// Scale check, step 3 (22 Nov): a read that fails for want of a connection is
// answered at once, not tried again after 1, 2 and 4 seconds (the coach portal
// reloaded offline waited 7 seconds). A server that answers "busy" (503) is
// still tried again, as postgrest-js does. Nothing here reaches a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgrestClient } from '@supabase/postgrest-js';

const { noRetryOnConnectionLoss } = await import('../../src/lib/noRetry.js');
const { isNetworkError } = await import('../../src/lib/connection.js');

const offline = (on) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: !on }, configurable: true, writable: true });

test('offline: a read is answered at once, as a network error, and tried only once', async () => {
  offline(true);
  const client = new PostgrestClient('http://127.0.0.1:9/rest/v1', { fetch: noRetryOnConnectionLoss });
  const t0 = Date.now();
  const { data, error } = await client.from('coaches').select('id').limit(1);
  assert.ok(Date.now() - t0 < 300, `took ${Date.now() - t0} ms`);
  assert.equal(data, null);
  assert.ok(isNetworkError(error), 'read as no connection');
  assert.match(error.message, /Failed to fetch/);
  offline(false);
});

test('a connection that drops mid-read is not tried again either; a thrown read keeps its name', async () => {
  offline(false);
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; throw new TypeError('Failed to fetch'); };
  try {
    const client = new PostgrestClient('http://example.invalid/rest/v1', { fetch: noRetryOnConnectionLoss });
    const t0 = Date.now();
    const answer = await client.from('coaches').select('id');
    assert.equal(calls, 1);
    assert.ok(Date.now() - t0 < 300);
    assert.ok(isNetworkError(answer.error));
    await assert.rejects(async () => { await client.from('coaches').select('id').throwOnError(); }, (e) => e.name === 'TypeError' && isNetworkError(e));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a server that says it is busy (503) is still tried again', async () => {
  offline(false);
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('busy', { status: 503, headers: { 'Retry-After': '0' } })
      : new Response('[{"id":"c1"}]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const client = new PostgrestClient('http://example.invalid/rest/v1', { fetch: noRetryOnConnectionLoss });
    const { data, error } = await client.from('coaches').select('id');
    assert.equal(error, null);
    assert.deepEqual(data, [{ id: 'c1' }]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});
