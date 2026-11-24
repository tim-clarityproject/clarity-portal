import { incomeIn } from './income.js';
import { targetFor } from './targets.js';
import { monthKey, monthName } from './year.js';
import { poundsWords } from './words.js';

// Today's Finances line (Phase 6b run 2, step 2; M11 C1): this month against its target, then one urgent note. Low
// cash takes the urgent spot first, then overdue invoices ("1 overdue"). Owner only. Checked by
// tests/performance/finance-today.test.mjs.

/**
 * @param {{ today: string, lines: object[], targets?: object[], cashShort?: string|null, overdueCount?: number }} a
 *   cashShort is the cash flow's todayShort ("Cash dips in May"), null when cash stays above the level Tim keeps
 * @returns {{ figure: string, urgent: string|null, text: string, aria: string }} text "November £2,300 of £5,000 · 1 overdue";
 *   aria "Finances. November £2,300 of £5,000. Cash dips in May."
 */
export function todayFinanceLine({ today, lines, targets = [], cashShort = null, overdueCount = 0 }) {
  const month = monthKey(today);
  const paid = incomeIn(lines, [month]);
  const target = targetFor(targets, [month]);
  const figure = `${monthName(month)} ${poundsWords(paid)}${target > 0 ? ` of ${poundsWords(target)}` : ''}`;
  const urgent = cashShort || (overdueCount > 0 ? `${overdueCount} overdue` : null);
  return {
    figure,
    urgent,
    text: urgent ? `${figure} · ${urgent}` : figure,
    aria: `Finances. ${figure}.${urgent ? ` ${urgent.charAt(0).toUpperCase()}${urgent.slice(1)}.` : ''}`,
  };
}

/** How many sent invoices are overdue on `today`. */
export const overdueCount = (invoices, today) => (invoices || []).filter((i) => i.status === 'sent' && i.due_on && i.due_on < today && Number(i.total_minor) > Number(i.paid_minor || 0) && !i.waived_at).length;
