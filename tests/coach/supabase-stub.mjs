// A stand-in for src/lib/supabase.js in unit tests that load a module which
// asks the database (tests/performance/coach-network-data.test.mjs). The
// test puts its own database on globalThis.__db ({ rpc(name, args),
// from(table) }); nothing here ever reaches a real one.
export const supabase = {
  rpc: (name, args) => globalThis.__db.rpc(name, args),
  from: (table) => globalThis.__db.from(table),
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
};
