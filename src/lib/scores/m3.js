// M3. Unplanned wins (docs/scoring-methods.md, M3).
//
// A win counts as a done item (100) in every Strategy picked, at the one
// impact level chosen for the whole win (Tim, 23 Oct). Through M4 it can
// lift a Strategy's score but never above 100.
//
// A win: { id, date, impact (1 to 3), strategyIds: [] }

/**
 * M3: the wins in one week, as one item per Strategy picked.
 * @param {object[]} wins
 * @param {string[]} weekDays the week's days (any day of the week counts)
 * @param {{ soFarUntil?: string }} [opts]
 */
export function m3WinItems(wins, weekDays, opts = {}) {
  const inWeek = new Set(weekDays);
  const items = [];
  for (const w of wins || []) {
    if (w.deleted || !inWeek.has(w.date)) continue;
    if (opts.soFarUntil && w.date > opts.soFarUntil) continue;
    for (const s of new Set(w.strategyIds || [])) {
      items.push({ id: w.id, strategyId: s, impact: w.impact ?? 2, score: 100, kind: 'win' });
    }
  }
  return items;
}
