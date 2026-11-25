// An id read from the address (tidy follow-up 4, part 2, item 7). The database's ids are uuids, always written in
// lower case, but an address typed, pasted or changed by hand can carry capitals ("/coach/clients/3F2A…"). Every coach
// page that looks an id up from its address reads it once through here, so "This client isn't in your list any more."
// never shows for an id that differs only in case. Anything that isn't shaped like a uuid is left as it is (a public
// page's key is matched exactly, by the database). Tests: tests/performance/coach-address.test.mjs.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The address's id as the database writes it: a uuid in lower case, trimmed; anything else unchanged. */
export function idFromAddress(raw) {
  if (raw == null) return raw;
  const s = String(raw).trim();
  return UUID.test(s) ? s.toLowerCase() : String(raw);
}
