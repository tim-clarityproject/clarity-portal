// A fuller stand-in for supabase-js's query builder over plain arrays, for Phase 6b run 3's server tests (Group E):
// eq, neq, is, in, gt, gte, lt, lte, or (PostgREST's a.is.null,a.lt.X), order (with ascending), limit, maybeSingle,
// insert / update / upsert / delete with .select(), unique keys that refuse a second row (23505), and rpc handlers given
// by the test. Not a test itself (no .test. in its name). The real database's rules are checked on the local stand-in.
import { randomUUID } from 'node:crypto';

export function fakeDb065(seed = {}, { unique = {}, rpc = {}, partialUnique = {} } = {}) {
  const t = structuredClone(seed);
  const files = new Map();
  const clash = (table, row, rows) => [...(unique[table] || [])].some((keys) => keys.every((k) => row[k] != null)
    && rows.some((r) => r !== row && keys.every((k) => r[k] === row[k]) && (partialUnique[table]?.(r) ?? true)));
  const q = (table) => {
    const rows = (t[table] ||= []);
    const where = [];
    let op = 'select'; let values = null; let opts = {}; let order = null; let asc = true; let lim = null; let wantRows = false;
    const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
    const orPart = (r, part) => {
      const [k, o, ...rest] = part.split('.');
      const v = rest.join('.');
      if (o === 'is') return (r[k] ?? null) === null;
      if (o === 'lt') return r[k] != null && String(r[k]) < v;
      return String(r[k]) === v;
    };
    const test = (r, [k, v, how]) => {
      if (how === 'or') return v.split(',').some((p) => orPart(r, p));
      if (how === 'is') return (r[k] ?? null) === v;
      if (how === 'in') return v.includes(r[k]);
      if (how === 'neq') return r[k] !== v;
      if (how === 'gt') return r[k] != null && cmp(r[k], v) > 0;
      if (how === 'gte') return r[k] != null && cmp(r[k], v) >= 0;
      if (how === 'lt') return r[k] != null && cmp(r[k], v) < 0;
      if (how === 'lte') return r[k] != null && cmp(r[k], v) <= 0;
      return r[k] === v;
    };
    const match = (r) => where.every((w) => test(r, w));
    const run = () => {
      let out;
      if (op === 'insert' || op === 'upsert') {
        out = [];
        for (const v of [values].flat()) {
          const row = { id: v.id || randomUUID(), created_at: new Date().toISOString(), ...v };
          if (clash(table, row, rows)) {
            if (op === 'upsert' && opts.ignoreDuplicates) continue;
            if (op === 'upsert') {
              const hit = rows.find((r) => (unique[table] || []).some((keys) => keys.every((k) => r[k] === row[k])));
              Object.assign(hit, v); out.push(hit); continue;
            }
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows.push(row); out.push(row);
        }
      } else if (op === 'update') { out = rows.filter(match); out.forEach((r) => Object.assign(r, values)); }
      else if (op === 'delete') { out = rows.filter(match); const keep = rows.filter((r) => !match(r)); rows.length = 0; rows.push(...keep); }
      else out = rows.filter(match);
      if (order) out = [...out].sort((a, b) => cmp(a[order], b[order]) * (asc ? 1 : -1));
      if (lim != null) out = out.slice(0, lim);
      return { data: op === 'select' || wantRows ? out.map((r) => ({ ...r })) : null, error: null };
    };
    const b = {
      insert(v) { op = 'insert'; values = v; return b; },
      upsert(v, o = {}) { op = 'upsert'; values = v; opts = o; return b; },
      update(v) { op = 'update'; values = v; return b; },
      delete() { op = 'delete'; return b; },
      select() { if (op !== 'select') wantRows = true; return b; },
      eq(k, v) { where.push([k, v]); return b; },
      neq(k, v) { where.push([k, v, 'neq']); return b; },
      is(k, v) { where.push([k, v, 'is']); return b; },
      in(k, v) { where.push([k, v, 'in']); return b; },
      gt(k, v) { where.push([k, v, 'gt']); return b; },
      gte(k, v) { where.push([k, v, 'gte']); return b; },
      lt(k, v) { where.push([k, v, 'lt']); return b; },
      lte(k, v) { where.push([k, v, 'lte']); return b; },
      or(expr) { where.push([null, expr, 'or']); return b; },
      order(k, o = {}) { order = k; asc = o.ascending !== false; return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.error ? null : (r.data || [])[0] || null, error: r.error }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return {
    tables: t,
    files,
    from: q,
    rpc: async (name, args = {}) => (rpc[name] ? rpc[name](args, t) : { data: null, error: { code: 'PGRST202', message: 'no such function' } }),
    storage: {
      from: () => ({
        download: async (path) => (files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: 'not found' } }),
        upload: async (path, bytes) => { files.set(path, bytes); return { data: { path }, error: null }; },
      }),
    },
  };
}

/** 064's invoice_take_number over the fake's invoices: the invoice's own number, or the next (from 1201). */
export function numberRpc(start = 1200) {
  let n = start;
  return (args, t) => {
    const inv = (t.invoices || []).find((i) => i.id === args.p_invoice);
    if (!inv) return { data: null, error: { code: 'P0002', message: 'not there' } };
    if (inv.number == null) inv.number = (n += 1);
    return { data: inv.number, error: null };
  };
}
