// Just enough of supabase-js's query builder over plain arrays for the billing tests, with 061's unique keys, the
// invoice number counter (061's sequence, 064's invoice_take_number), and the one-invoice-per-instalment rule. Not a test itself (no .test. in its name).
import { randomUUID } from 'node:crypto';

const UNIQUE = {
  stripe_events: [['id']], payments: [['stripe_id']], credit_notes: [['stripe_id'], ['number']], portal_subscriptions: [['stripe_subscription_id']],
  invoices: [['number'], ['stripe_invoice_id'], ['agreement_id', 'kind', 'instalment_n']], invoice_reminders: [['invoice_id', 'stage']],
};

export function fakeDb(seed = {}) {
  const t = structuredClone(seed);
  let invoiceNo = 1200;
  let cnNo = 0;
  const clash = (table, row, rows) => (UNIQUE[table] || []).some((keys) => keys.every((k) => row[k] != null)
    && rows.some((r) => r !== row && keys.every((k) => r[k] === row[k]) && !(table === 'invoices' && keys.length === 3 && r.status === 'void')));
  const defaults = (table, v) => {
    const r = { id: v.id || randomUUID(), created_at: new Date().toISOString(), ...v };
    if (table === 'credit_notes' && !r.number) r.number = `CLARITY-CN-${String((cnNo += 1)).padStart(4, '0')}`;
    if (table === 'invoices') { r.paid_minor ??= 0; r.status ??= 'draft'; }
    if (table === 'invoice_reminders') { r.sent_at ??= null; r.sending_at ??= null; } // 064's column
    return r;
  };
  const q = (table) => {
    const rows = (t[table] ||= []);
    const where = [];
    let op = 'select'; let values = null; let opts = {}; let order = null; let lim = null; let wantRows = false;
    const match = (r) => where.every(([k, v, how]) => (how === 'is' ? (r[k] ?? null) === v : r[k] === v));
    const run = () => {
      let out;
      if (op === 'insert' || op === 'upsert') {
        out = [];
        for (const v of [values].flat()) {
          const row = defaults(table, v);
          // 061's credit_notes_within_paid: never more refunded and credited than was settled on the invoice.
          if (table === 'credit_notes') {
            const inv = (t.invoices || []).find((i) => i.id === row.invoice_id);
            const before = rows.filter((c) => c.invoice_id === row.invoice_id).reduce((n, c) => n + Number(c.amount_minor), 0);
            if (before + Number(row.amount_minor) > Number(inv?.paid_minor || 0)) return { data: null, error: { code: '23514', message: 'more than was settled' } };
          }
          if (clash(table, row, rows)) {
            if (op === 'upsert' && opts.ignoreDuplicates) continue;
            if (op === 'upsert') { const hit = rows.find((r) => (UNIQUE[table] || []).some((keys) => keys.every((k) => r[k] === row[k]))); Object.assign(hit, v); out.push(hit); continue; }
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows.push(row); out.push(row);
        }
      } else if (op === 'update') { out = rows.filter(match); out.forEach((r) => Object.assign(r, values)); }
      else if (op === 'delete') { out = rows.filter(match); const keep = rows.filter((r) => !match(r)); rows.length = 0; rows.push(...keep); }
      else { out = rows.filter(match); }
      if (order) out = [...out].sort((a, b) => String(a[order]).localeCompare(String(b[order])));
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
      is(k, v) { where.push([k, v, 'is']); return b; },
      order(k) { order = k; return b; },
      limit(n) { lim = n; return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.error ? null : (r.data || [])[0] || null, error: r.error }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return {
    tables: t,
    from: q,
    // 064's invoice_take_number: the invoice's own number, or the next one given to it now (the same counter as 061's).
    rpc: async (name, args = {}) => {
      if (name === 'next_invoice_number') return { data: (invoiceNo += 1), error: null };
      if (name === 'invoice_take_number') {
        const inv = (t.invoices || []).find((i) => i.id === args.p_invoice);
        if (!inv) return { data: null, error: { code: 'P0002', message: 'not there' } };
        if (inv.number == null) inv.number = (invoiceNo += 1);
        return { data: inv.number, error: null };
      }
      return { data: null, error: { code: 'PGRST202' } };
    },
  };
}
