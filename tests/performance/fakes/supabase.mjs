// A tiny stand-in for the Supabase client, for the offline queue's unit
// tests (tests/performance/save-version.test.mjs): tables in memory, the
// few query calls syncQueue.js makes, and updated_at moved on by every
// write, as the database's p1_touch trigger does.
export const db = { tables: {}, clock: 0, calls: [], missing: new Set(), down: null, hold: null };

const stamp = () => {
  db.clock += 1;
  return `2026-10-30T09:00:${String(db.clock).padStart(2, '0')}.000001+00:00`;
};

export function reset() {
  db.tables = {};
  db.clock = 0;
  db.calls = [];
  db.missing = new Set();
  db.down = null;
  db.hold = null;
}

export function put(table, row) {
  db.tables[table] = db.tables[table] || [];
  const full = { ...row, updated_at: row.updated_at || stamp() };
  db.tables[table].push(full);
  return { ...full };
}

/** Another window's save: the row changes and its version moves on. */
export function changeElsewhere(table, match, values) {
  const row = (db.tables[table] || []).find((r) => Object.entries(match).every(([k, v]) => r[k] === v));
  Object.assign(row, values, { updated_at: stamp() });
  return row;
}

function query(table) {
  const filters = [];
  let action = { kind: 'select' };
  const rowsOf = () => (db.tables[table] = db.tables[table] || []);
  const matches = (r) => filters.every(([k, v, op]) => {
    if (op === 'gte') return `${r[k]}` >= `${v}`;
    if (op === 'is') return (r[k] ?? null) === v;
    if (op === 'in') return v.map(String).includes(`${r[k]}`);
    return `${r[k]}` === `${v}`;
  });
  const builder = {
    select() { if (action.kind === 'none') action = { kind: 'select' }; return builder; },
    update(values) { action = { kind: 'update', values }; return builder; },
    delete() { action = { kind: 'delete' }; return builder; },
    upsert(values, options = {}) { action = { kind: 'upsert', values, options }; return builder; },
    eq(k, v) { filters.push([k, v]); return builder; },
    gte(k, v) { filters.push([k, v, 'gte']); return builder; },
    is(k, v) { filters.push([k, v, 'is']); return builder; },
    in(k, v) { filters.push([k, v, 'in']); return builder; },
    limit() { return builder; },
    order() { return builder; },
    then(resolve, reject) {
      try {
        db.calls.push({ table, kind: action.kind, filters: [...filters] });
        // The database not answering (sync back-off tests): the gateway's
        // answer, e.g. { status: 503 } or { status: 504, code: 'PGRST003' }.
        if (db.down) {
          resolve({ data: null, error: { code: db.down.code || '', message: db.down.message || 'Service Unavailable' }, status: db.down.status || 503 });
          return;
        }
        // A table a migration hasn't made yet, as PostgREST answers.
        if (db.missing.has(table)) {
          resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } });
          return;
        }
        let data;
        if (action.kind === 'select') data = rowsOf().filter(matches).map((r) => ({ ...r }));
        else if (action.kind === 'update') {
          data = rowsOf().filter(matches).map((r) => Object.assign(r, action.values, { updated_at: stamp() })).map((r) => ({ ...r }));
        } else if (action.kind === 'delete') {
          data = rowsOf().filter(matches).map((r) => ({ ...r }));
          db.tables[table] = rowsOf().filter((r) => !matches(r));
        } else {
          const keys = (action.options.onConflict || 'id').split(',');
          const hit = rowsOf().find((r) => keys.every((k) => r[k] != null && `${r[k]}` === `${action.values[k]}`));
          if (hit && action.options.ignoreDuplicates) data = [];
          else if (hit) data = [{ ...Object.assign(hit, action.values, { updated_at: stamp() }) }];
          else data = [put(table, { ...action.values, updated_at: undefined })];
        }
        // A slow connection (db.hold): the server has done the work now, and
        // the answer arrives when the promise db.hold returns resolves.
        const late = db.hold?.({ table, kind: action.kind, filters: [...filters] });
        if (late) late.then(() => resolve({ data, error: null }));
        else resolve({ data, error: null });
      } catch (error) {
        reject(error);
      }
    },
  };
  return builder;
}

export const supabase = {
  from: (table) => query(table),
  auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
};
