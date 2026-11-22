// One read, shared (the scale and speed check, step 3; 22 Nov 2026).
//
// A page is built from several loaders, and each asks the database for what
// it needs, so the same read was often sent three or four times in the same
// second (Home: the active plan 4 times, settings, profile, Daily plan and
// Daily review 3 times each). Here a read of the database (a GET or HEAD to
// /rest/v1) that is exactly the same as one already on its way, or answered
// in the last moment, gets that answer instead of a new request.
//
// What makes it safe:
// - Exactly the same: the same address (which holds the person's id and
//   every filter), the same sign-in (the Authorization header, so one
//   person's answer can never reach another), and the same Accept, Prefer,
//   Range and schema headers.
// - Short-lived: a kept answer lasts SHARE_MS, enough for one page's
//   loaders, then the next read goes to the database again.
// - Writes come first: anything that isn't a read (an insert, an update, a
//   delete, an rpc, a function) forgets every kept answer before it is sent
//   and again when it is answered, and a read that was on its way while a
//   write was sent is never kept or joined, so a read after a save always
//   sees the save.
// - Only good answers are kept (2xx). A failed read is shared only with the
//   reads that were waiting on it, and the next one tries again.
// - A read with its own abort signal is never shared (stopping it must stop
//   only it).
// - Sign out (a POST to the sign-in server, so a write here) and any change
//   of sign-in forget everything: a read with a different Authorization
//   from the last one clears what was kept before it is looked up.
//
// Each caller gets its own copy of the answer (a new Response), so one
// reader using the body never empties it for another.

const SHARE_MS = 2500;
const KEY_HEADERS = ['authorization', 'apikey', 'accept', 'accept-profile', 'prefer', 'range'];
const NO_BODY = new Set([101, 204, 205, 304]);
// Database functions that only read (each is STABLE in its migration, and
// Postgres refuses a write from a STABLE function), called as POST: they
// are sent as they are (never shared) and, unlike any other POST, don't
// make the kept reads forgotten. Any function not named here does.
const READ_ONLY_RPCS = new Set(['my_coach', 'my_coach_invites', 'my_session_recaps', 'my_view_asks', 'my_cover_asks']);

function readOnlyRpc(method, url) {
  if (method !== 'POST') return false;
  const m = /\/rest\/v1\/rpc\/([a-z0-9_]+)(?:\?|$)/.exec(url);
  return Boolean(m && READ_ONLY_RPCS.has(m[1]));
}

let generation = 0; // goes up with every write
let lastAuth = null; // the sign-in the last read was made with
const inFlight = new Map(); // key -> { gen, promise }
const kept = new Map(); // key -> { at, answer }

/** Forgets every kept and shared read (sign out, a write, a test). */
export function forgetSharedReads() {
  generation += 1;
  inFlight.clear();
  kept.clear();
}

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return null; // a Request: never shared
}

function isRead(method, url) {
  return (method === 'GET' || method === 'HEAD') && /\/rest\/v1\//.test(url);
}

function keyOf(method, url, headers) {
  const h = new globalThis.Headers(headers || {});
  return [method, url, ...KEY_HEADERS.map((name) => h.get(name) || '')].join('\n');
}

function copy(answer) {
  return new globalThis.Response(NO_BODY.has(answer.status) || answer.method === 'HEAD' ? null : answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  });
}

async function take(response, method) {
  return {
    method,
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: method === 'HEAD' ? null : await response.text(),
  };
}

/**
 * Wraps a fetch so that identical database reads share one request.
 * @param {(input: any, init?: object) => Promise<Response>} send
 */
export function shareReads(send) {
  return async function sharedFetch(input, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    const url = urlOf(input);
    if (url != null && readOnlyRpc(method, url)) return send(input, init);
    if (url == null || !isRead(method, url)) {
      // A write (or anything that isn't a plain read): forget before and after.
      if (url == null || method !== 'GET') forgetSharedReads();
      try {
        return await send(input, init);
      } finally {
        if (url == null || method !== 'GET') forgetSharedReads();
      }
    }
    if (init.signal) return send(input, init);

    const auth = new globalThis.Headers(init.headers || {}).get('authorization') || '';
    if (auth !== lastAuth) {
      forgetSharedReads();
      lastAuth = auth;
    }
    const key = keyOf(method, url, init.headers);
    const now = Date.now();
    const hit = kept.get(key);
    if (hit && now - hit.at < SHARE_MS) return copy(hit.answer);
    if (hit) kept.delete(key);

    const going = inFlight.get(key);
    if (going && going.gen === generation) return copy(await going.promise);

    const gen = generation;
    const promise = (async () => {
      const response = await send(input, init);
      return take(response, method);
    })();
    inFlight.set(key, { gen, promise });
    try {
      const answer = await promise;
      // Kept only when no write was sent while it was on its way.
      if (gen === generation && answer.status >= 200 && answer.status < 300) {
        if (kept.size >= 200) {
          const at = Date.now();
          for (const [k, v] of kept) if (at - v.at >= SHARE_MS) kept.delete(k);
        }
        kept.set(key, { at: Date.now(), answer });
      }
      return copy(answer);
    } finally {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    }
  };
}
