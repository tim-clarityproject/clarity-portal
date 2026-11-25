// What a client shares with their coach (their Mission, their latest week score), read through 032's checked
// function coach_client_list (054's version), for the client's page (tidy follow-up 4, part 2, item 1).
//
// The page holds the Overview's parts that depend on it until it is known, so nothing moves once drawn: the Mission
// card above everything and the Progress fold's "Performance score this week". The answer is kept on the device per
// client (the page's copy, cleared by Sign out with every clarity-cache key), so a return visit draws it at once and
// refreshes it quietly. The function lists a coach's clients 200 at a time in name order, so in a practice of more
// than 200 the client may not be on the first page: the client's own name is asked for first (one row, quick), then
// every page in turn until the client is found. Tests: tests/performance/coach-tidy4.test.mjs.

const PAGE = 200;

/** The parts of a row the client's page shows (nothing else is kept on the device). */
export const shareOf = (row) => (row ? { mission: row.mission || null, latest_week_score: row.latest_week_score ?? null } : null);

/**
 * Find what the client shares. `rpc(name, args)` answers `{ data, error }` (supabase.rpc). Answers
 * `{ known: true, shared }` (shared null when the client shares nothing or isn't a listed client), or
 * `{ known: false }` when the database couldn't be asked (offline): the page then keeps its copy.
 */
export async function findClientShare(rpc, clientId, name) {
  if (!clientId) return { known: true, shared: null };
  const ask = (args) => rpc('coach_client_list', { p_coach: null, p_search: null, p_organisation: null, p_limit: PAGE, p_offset: 0, ...args });
  const hit = (rows) => (rows || []).find((r) => String(r.client_id).toLowerCase() === String(clientId).toLowerCase()) || null;
  const typed = String(name || '').trim();
  if (typed) {
    const { data, error } = await ask({ p_search: typed });
    if (error) return { known: false };
    const row = hit(data);
    if (row) return { known: true, shared: shareOf(row) };
  }
  for (let offset = 0; offset < 100000; offset += PAGE) {
    const { data, error } = await ask({ p_offset: offset });
    if (error) return { known: false };
    const row = hit(data);
    if (row) return { known: true, shared: shareOf(row) };
    const total = Number(data?.[0]?.total) || 0;
    if (!data?.length || offset + PAGE >= total) break;
  }
  return { known: true, shared: null };
}
