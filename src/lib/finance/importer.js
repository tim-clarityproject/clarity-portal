import { parseCsv } from './csv.js';
import { DEFAULT_SECTORS } from './income.js';

// The Master Revenue Sheet importer's logic (Phase 6b run 2, step 8). One screen matches each column heading to a
// field (a best guess Tim can change for each), then a preview shows what would be added. Nothing here saves
// anything, and nothing reads the sheet's rows except to build that preview. "Individual" in the sheet becomes
// Personal. Checked by tests/performance/finance-import.test.mjs with an invented sheet.

export const IMPORT_FIELDS = Object.freeze([
  { key: 'day', label: 'When it was paid', required: true, words: ['date', 'paid date', 'date paid', 'payment date', 'paid on', 'received', 'date received', 'invoice date', 'month'] },
  { key: 'client', label: 'Who', required: true, words: ['client', 'client name', 'customer', 'name', 'organisation', 'organization', 'company', 'who'] },
  { key: 'description', label: 'What for', required: false, words: ['programme', 'program', 'package', 'service', 'description', 'what for', 'details', 'item', 'product', 'engagement', 'work'] },
  { key: 'sector', label: 'Sector', required: false, words: ['sector', 'category', 'segment', 'market', 'type', 'area'] },
  { key: 'amount', label: 'Amount', required: true, words: ['amount', 'value', 'total', 'fee', 'fees', 'revenue', 'income', 'net', 'gross', 'price', 'paid'] },
  { key: 'currency', label: 'Currency', required: false, words: ['currency', 'ccy', 'cur'] },
  { key: 'invoice', label: 'Invoice number', required: false, words: ['invoice', 'invoice no', 'invoice number', 'invoice ref', 'inv', 'inv no', 'reference', 'ref'] },
  { key: 'country', label: 'Where they live', required: false, words: ['country', 'location', 'where', 'based', 'region'] },
  { key: 'status', label: 'Status', required: false, words: ['status', 'paid status', 'state'] },
]);
const FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key);
const MIN_SCORE = 0.5;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[£$€%#?()[\]_./\\:-]+/g, ' ').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
const bigrams = (s) => { const t = s.replace(/ /g, ''); const out = []; for (let i = 0; i < t.length - 1; i += 1) out.push(t.slice(i, i + 2)); return out; };
function dice(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const pool = [...y];
  let hit = 0;
  for (const g of x) { const k = pool.indexOf(g); if (k >= 0) { hit += 1; pool.splice(k, 1); } }
  return (2 * hit) / (x.length + y.length);
}

/** How well a heading fits a field, 0 to 1: the same words 1; containing one of the field's words 0.8; else how alike (×0.7). */
export function headingScore(heading, field) {
  const h = norm(heading);
  if (!h) return 0;
  const f = IMPORT_FIELDS.find((x) => x.key === field);
  let best = 0;
  for (const w of f.words) {
    if (h === w) return 1;
    if (` ${h} `.includes(` ${w} `)) best = Math.max(best, 0.6 + 0.2 * Math.min(1, w.length / h.length) + (w.includes(' ') ? 0.05 : 0));
    best = Math.max(best, 0.7 * dice(h, w));
  }
  return Math.round(best * 1000) / 1000;
}

/**
 * The best guess for each heading: each field goes to at most one heading, the strongest fits first.
 * @param {string[]} headings the sheet's first row
 * @returns {{ index: number, heading: string, field: string|null, score: number }[]}
 */
export function matchHeadings(headings) {
  const pairs = [];
  (headings || []).forEach((h, index) => FIELD_KEYS.forEach((field) => { const score = headingScore(h, field); if (score >= MIN_SCORE) pairs.push({ index, field, score }); }));
  pairs.sort((a, b) => b.score - a.score || a.index - b.index);
  const takenField = new Set();
  const takenHeading = new Set();
  const chosen = new Map();
  for (const p of pairs) {
    if (takenField.has(p.field) || takenHeading.has(p.index)) continue;
    takenField.add(p.field);
    takenHeading.add(p.index);
    chosen.set(p.index, p);
  }
  return (headings || []).map((heading, index) => ({ index, heading: String(heading ?? ''), field: chosen.get(index)?.field ?? null, score: chosen.get(index)?.score ?? 0 }));
}

/** Tim's own choice for one heading (null leaves it out); another heading that had that field gives it up. */
export function setField(mapping, index, field) {
  if (field != null && !FIELD_KEYS.includes(field)) throw new Error('That isn’t one of the fields.');
  return mapping.map((m) => {
    if (m.index === index) return { ...m, field, score: field == null ? 0 : 1 };
    if (field != null && m.field === field) return { ...m, field: null, score: 0 };
    return m;
  });
}

/** The required fields not matched to any heading yet. */
export const missingFields = (mapping) => IMPORT_FIELDS.filter((f) => f.required && !mapping.some((m) => m.field === f.key)).map((f) => f.label);

/** An amount as pence: "£1,200.50" → 120050, "(450)" or "-450" → -45000; null when it isn't a number. */
export function parseAmount(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  let minus = false;
  if (/^\(.*\)$/.test(s)) { minus = true; s = s.slice(1, -1); }
  s = s.replace(/[£$€\s,]|GBP|USD|EUR/gi, '');
  if (s.startsWith('-')) { minus = !minus; s = s.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const minor = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return minus ? -minor : minor;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const real = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const key = (y, m, d) => (real(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/** A day key from the sheet's date: 2025-05-03, 03/05/2025 (day first, as in the UK), 3/5/25, 3 May 2025, 03-May-25; else null. */
export function parseSheetDay(text) {
  const s = String(text ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return key(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return key(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2}|\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mo < 0 ? null : key(fullYear(Number(m[3])), mo + 1, Number(m[1])); }
  return null;
}

/** "GBP" or "USD" from the sheet's currency or the amount's symbol; "EUR" and others as they are; GBP when there is none. */
function currencyOf(cell, amountText) {
  const c = norm(cell);
  if (!c) return /\$/.test(String(amountText)) ? 'USD' : /€/.test(String(amountText)) ? 'EUR' : 'GBP';
  if (['gbp', 'pounds', 'pound', 'sterling', 'uk'].includes(c) || String(cell).trim() === '£') return 'GBP';
  if (['usd', 'dollars', 'dollar', 'us', 'us dollars'].includes(c) || String(cell).trim() === '$') return 'USD';
  if (['eur', 'euros', 'euro'].includes(c) || String(cell).trim() === '€') return 'EUR';
  return String(cell).trim().toUpperCase().slice(0, 3);
}

/** A sector from the sheet: one of Tim's own (any case), "Individual" as Personal, else as typed (a new sector). */
export function sectorFromSheet(text, sectors = DEFAULT_SECTORS) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { sector: null, isNew: false };
  if (/^individuals?$/i.test(s)) return { sector: 'Personal', isNew: false };
  const own = sectors.find((x) => x.toLowerCase() === s.toLowerCase());
  return own ? { sector: own, isNew: false } : { sector: s.slice(0, 60), isNew: true };
}

const NOT_PAID = /^(unpaid|not paid|outstanding|due|overdue|cancelled|canceled|void|draft|pending|invoiced)$/i;

/**
 * What the import would add. Nothing is saved.
 * @param {{ rows: string[][], mapping: { index: number, field: string|null }[], existing?: { day: string, client?: string, amount_minor: number }[],
 *   sectors?: string[] }} a rows are the sheet's rows under its heading row
 * @returns {{ add: { row: number, day: string, client: string, description: string, sector: string|null, newSector: boolean,
 *   amount_minor: number, currency: 'GBP'|'USD', invoice: string, country: string }[], skipped: { row: number, reason: string }[],
 *   totals: Record<string, number>, missing: string[] }} row is the sheet's own row number (the heading is row 1)
 */
export function importPreview({ rows = [], mapping, existing = [], sectors = DEFAULT_SECTORS }) {
  const missing = missingFields(mapping);
  if (missing.length) return { add: [], skipped: [], totals: {}, missing };
  const col = Object.fromEntries(mapping.filter((m) => m.field).map((m) => [m.field, m.index]));
  const cell = (r, f) => (col[f] == null ? '' : String(r[col[f]] ?? '').trim());
  const seen = new Set((existing || []).map((e) => `${e.day}|${Number(e.amount_minor)}|${String(e.client || '').toLowerCase().trim()}`));
  const add = [];
  const skipped = [];
  const totals = {};
  (rows || []).forEach((r, i) => {
    const row = i + 2;
    if (!(r || []).some((x) => String(x ?? '').trim())) return;
    if (col.status != null && NOT_PAID.test(cell(r, 'status'))) { skipped.push({ row, reason: 'It isn’t marked as paid.' }); return; }
    const day = parseSheetDay(cell(r, 'day'));
    if (!day) { skipped.push({ row, reason: 'Its date can’t be read.' }); return; }
    const amountText = cell(r, 'amount');
    const amount = parseAmount(amountText);
    if (amount == null || amount === 0) { skipped.push({ row, reason: 'Its amount can’t be read.' }); return; }
    if (amount < 0) { skipped.push({ row, reason: 'It’s a minus amount, so add it as a refund instead.' }); return; }
    const currency = currencyOf(cell(r, 'currency'), amountText);
    if (currency !== 'GBP' && currency !== 'USD') { skipped.push({ row, reason: 'Only pounds and dollars can be added.' }); return; }
    const client = cell(r, 'client').slice(0, 160);
    if (!client) { skipped.push({ row, reason: 'It doesn’t say who it was from.' }); return; }
    const k = `${day}|${amount}|${client.toLowerCase()}`;
    if (seen.has(k)) { skipped.push({ row, reason: 'It’s already in Finances.' }); return; }
    seen.add(k);
    const { sector, isNew } = sectorFromSheet(cell(r, 'sector'), sectors);
    add.push({ row, day, client, description: cell(r, 'description').slice(0, 200), sector, newSector: isNew, amount_minor: amount, currency,
      invoice: cell(r, 'invoice').slice(0, 60), country: cell(r, 'country').slice(0, 60) });
    totals[currency] = (totals[currency] || 0) + amount;
  });
  return { add, skipped, totals, missing };
}

/** The sheet's text into its heading row and the guesses, plus the rows for the preview. */
export function readSheet(text) {
  const all = parseCsv(text, { keepBlank: true });
  const headings = all[0] || [];
  return { headings, mapping: matchHeadings(headings), rows: all.slice(1) };
}
