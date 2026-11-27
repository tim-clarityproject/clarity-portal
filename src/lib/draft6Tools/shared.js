// What Draft 6's rebuilt tools share (Polish 1, Stage D item 1; Pre-mortem,
// Pressure plan, Meeting planner): lists kept with their own ids, so an
// answer picked or written about one row stays with that row when another is
// added or taken out, and their own words quoted back in a question
// (question rule 19: "You said “the board meeting”…").

/** A list as the person sees it: the texts of its rows, at least one box. */
export function rowTexts(list) {
  const rows = (Array.isArray(list) ? list : []).map((r) => (typeof r === 'string' ? r : r?.text || ''));
  return rows.length ? rows : [''];
}

/** Only the rows with words in them. */
export function filled(list) {
  return (Array.isArray(list) ? list : []).filter((r) => `${r?.text || ''}`.trim());
}

/**
 * The list after RowList's onChange(rows, change): each row keeps its id;
 * `change.removed` takes that row's id out, `change.restored` (Undo) puts a
 * new one back at its place, and a row added at the end gets a new id.
 */
export function withRows(list, rows, change, makeId) {
  const before = Array.isArray(list) ? list.filter((r) => r && typeof r === 'object') : [];
  let ids = before.map((r) => r.id);
  if (change?.removed != null) ids = ids.filter((_, i) => i !== change.removed);
  if (change?.restored != null) ids.splice(change.restored, 0, makeId());
  return rows.map((text, i) => ({ ...(before.find((r) => r.id === ids[i]) || {}), id: ids[i] || makeId(), text }));
}

/** A list read back from a save (strings from an older version, or rows): rows with ids. */
export function asRows(list, makeId) {
  return (Array.isArray(list) ? list : [])
    .map((r) => (typeof r === 'string' ? { id: makeId(), text: r } : r && typeof r === 'object' ? { ...r, id: r.id || makeId(), text: `${r.text || ''}` } : null))
    .filter(Boolean);
}

/** Their own words in a question: trimmed, without a last full stop, question or exclamation mark, and at most 80 characters. */
export function quote(text, max = 80) {
  const t = `${text || ''}`.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** A saved item's name from its first answer: at most 60 characters, or the tool's own words. */
export function titleFrom(text, fallback) {
  const t = `${text || ''}`.trim().replace(/\s+/g, ' ');
  if (!t) return fallback;
  return t.length > 60 ? t.slice(0, 60).trimEnd() : t;
}

/** A plain text answer, whatever was saved. */
export const text = (v) => (typeof v === 'string' ? v : '');
/** A date key (YYYY-MM-DD), or ''. */
export const dateKey = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
/** A time of day (HH:MM), or ''. */
export const clock = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');
/** True when any of the values has words in it. */
export const anyWords = (...values) => values.some((v) => `${v || ''}`.trim());
