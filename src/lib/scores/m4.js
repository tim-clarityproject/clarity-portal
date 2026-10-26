// M4. Strategy score: one Strategy, one week (docs/scoring-methods.md, M4).
//
// The impact-weighted average of the Strategy's habits, to-dos and wins
// that week. Weights: Low 1, Medium 2, High 3 (default Medium).

export const IMPACT = Object.freeze({ low: 1, medium: 2, high: 3 });

/** An impact as its weight: 1 to 3, or 'low' / 'medium' / 'high'; default Medium. */
export function m4Weight(impact) {
  if (typeof impact === 'string') return IMPACT[impact.toLowerCase()] ?? 2;
  return impact === 1 || impact === 2 || impact === 3 ? impact : 2;
}

/**
 * M4: Σ(weight × item score) ÷ Σ(weight). Items with a null score (nothing
 * expected) are left out. A Strategy with nothing in it that week scores
 * null ("Nothing planned this week"), not 0 (Claude).
 * @param {{impact: number|string, score: number|null}[]} items
 * @returns {number|null}
 */
export function m4StrategyScore(items) {
  let num = 0;
  let den = 0;
  for (const it of items || []) {
    if (it.score == null) continue;
    const w = m4Weight(it.impact);
    num += w * it.score;
    den += w;
  }
  return den ? num / den : null;
}
