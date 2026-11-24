// CSV for Finances' exports (Phase 6b run 2, steps 7 and 8): written and read by RFC 4180, with formulas neutralised.
// Checked by tests/performance/finance-export.test.mjs.
//
// - A field holding a comma, a double quote, a carriage return or a line feed is quoted, and its quotes doubled.
// - Lines end with CRLF.
// - A text cell starting with = + - @ (or a tab or carriage return, which spreadsheets also read as a formula's start)
//   gets a leading apostrophe, so a name like "=HYPERLINK(…)" opens as text, never as a formula. A cell that is a
//   number (a JavaScript number) is written as the number itself, so −450.5 stays a number.

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as CSV text. */
export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows (arrays of cells) as one CSV text, CRLF between lines and after the last. */
export const toCsv = (rows) => (rows || []).map((r) => r.map(csvCell).join(',')).join('\r\n') + ((rows || []).length ? '\r\n' : '');

/**
 * CSV text as rows of strings, by RFC 4180 (quoted fields may hold commas, doubled quotes and line breaks). A byte
 * order mark at the start is dropped; blank lines are skipped, or with { keepBlank: true } kept (as []), so each row's
 * place matches the spreadsheet's own row numbers (a last line break never makes a row).
 * @returns {string[][]}
 */
export function parseCsv(text, { keepBlank = false } = {}) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      else if (keepBlank) rows.push([]);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
