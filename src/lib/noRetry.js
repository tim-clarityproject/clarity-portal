import { connectionFetch } from './connection';

// supabase-js (postgrest-js 2.112) tries a failed read 3 more times, after
// 1, 2 and 4 seconds, even when the device is offline and connectionFetch
// has already said so at once: a coach portal reloaded offline waited 7
// seconds on one read before its page opened (scale check, 22 Nov). A
// read that fails for want of a connection is now answered at once; the
// pages fall back to the device's copy, and the offline queue and the
// online event try again (syncQueue.js's backoff). A real "server busy"
// answer (503, 520) is still tried again by postgrest-js as before. The
// marker is postgrest-js's own "don't retry" (an abort's code): the error
// keeps its name (TypeError) and its words, so isNetworkError and
// friendlyError read it exactly as before.
export async function noRetryOnConnectionLoss(input, init) {
  try {
    return await connectionFetch(input, init);
  } catch (error) {
    if (error && typeof error === 'object' && error.name !== 'AbortError' && error.code == null) {
      try { error.code = 'ABORT_ERR'; } catch { /* a frozen error is retried as before */ }
    }
    throw error;
  }
}

