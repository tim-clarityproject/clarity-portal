import { incomeByMonth } from './income.js';
import { targetsByMonth } from './targets.js';
import { DEFAULT_YEAR_START_MONTH, financialYear, monthKey, monthName } from './year.js';
import { poundsWords, toNearestHundredPounds } from './words.js';

// The one chart on Overview (Phase 6b run 2, step 2; M11 "Income by month"). Each month or Running total, All income
// or one sector; what's paid solid, what's projected (repeating income, signed instalments not invoiced, drafted and
// sent invoices) dashed and separate; each month's own target; a month at or over its target in mint; a finished
// month below the minimum (measured after that month's associate pay) as an outline. Targets and the minimum show
// with All income only. Every bar reads out its figure in M11's words. Checked by tests/performance/finance-chart.test.mjs.
//
// "At this rate, the year ends around £36,500.": everything paid so far this financial year plus everything projected
// for the rest of it (this month's projected part included; likely deals never), rounded to the nearest £100, half up.

/**
 * @param {{ today: string, lines: object[], expected?: { month: string, pounds: number|null, sector?: string|null }[], targets?: object[],
 *   minimumMinor?: number, associatePay?: Record<string, number>, sector?: string|null, mode?: 'month'|'running',
 *   showProjected?: boolean, startMonth?: number }} a
 * @returns {{ title: string, bars: { month: string, label: string, letter: string, state: 'past'|'current'|'future', paid: number,
 *   projected: number, target: number|null, reached: boolean, belowMinimum: boolean, readout: string }[], scaleMax: number,
 *   line: { value: number, words: string }|null, yearEnds: number, note: string, toggle: string }}
 */
export function incomeChart({ today, lines, expected = [], targets = [], minimumMinor = 0, associatePay = {}, sector = null,
  mode = 'month', showProjected = true, startMonth = DEFAULT_YEAR_START_MONTH }) {
  const { months } = financialYear(today, startMonth);
  const now = monthKey(today);
  const all = !sector;
  const paid = incomeByMonth(lines, months, { sector });
  const projected = Object.fromEntries(months.map((m) => [m, 0]));
  for (const e of expected || []) {
    if (e.pounds == null || !(e.month in projected) || e.month < now) continue;
    if (sector && e.sector !== sector) continue;
    projected[e.month] += e.pounds;
  }
  const target = all ? targetsByMonth(targets, months) : null;
  const yearEnds = toNearestHundredPounds(months.reduce((a, m) => a + paid[m] + projected[m], 0));

  let runPaid = 0;
  let runAll = 0;
  let runTarget = 0;
  const bars = months.map((m) => {
    const state = m < now ? 'past' : m === now ? 'current' : 'future';
    const p = state === 'future' ? 0 : paid[m];
    const pr = state === 'past' || !showProjected ? 0 : projected[m];
    const t = all ? target[m] : null;
    runPaid += p;
    runAll += p + pr;
    runTarget += t || 0;
    const name = state === 'current' ? `${monthName(m)} so far` : monthName(m);
    const parts = [name];
    let figure;
    let goal;
    if (mode === 'running') {
      figure = state === 'future' ? runAll : runPaid;
      goal = all ? runTarget : null;
      if (state === 'future') parts.push(pr || runAll !== runPaid ? `running total ${poundsWords(runAll)} projected` : `running total ${poundsWords(runAll)}`);
      else {
        parts.push(`running total ${poundsWords(runPaid)}`);
        if (pr) parts.push(`${poundsWords(pr)} more projected`);
      }
      if (all && goal > 0) parts.push(`target ${poundsWords(goal)}`);
    } else {
      figure = p;
      goal = t;
      if (state === 'future') { if (pr) parts.push(`${poundsWords(pr)} projected`); } else {
        parts.push(poundsWords(p));
        if (pr) parts.push(`${poundsWords(pr)} more projected`);
      }
      if (all && t > 0) parts.push(state !== 'future' && p > t ? `${poundsWords(p - t)} over the target` : `target ${poundsWords(t)}`);
    }
    const reached = all && t > 0 && state !== 'future' && p >= t;
    const belowMinimum = all && minimumMinor > 0 && state === 'past' && p - (Number(associatePay[m]) || 0) < minimumMinor;
    return { month: m, label: monthName(m, { short: true }), letter: monthName(m, { letter: true }), state, paid: mode === 'running' ? runPaid : p,
      projected: mode === 'running' ? (state === 'past' ? 0 : runAll - runPaid) : pr, target: goal, reached, belowMinimum, figure, readout: parts.join(', ') };
  });
  const scaleMax = Math.max(1, ...bars.map((b) => Math.max(b.paid + b.projected, b.target || 0)));
  let line = null;
  if (all && mode === 'running' && runTarget > 0) line = { value: runTarget, words: `Year target ${poundsWords(runTarget)}` };
  else if (all && mode === 'month' && minimumMinor > 0) line = { value: minimumMinor, words: `Minimum ${poundsWords(minimumMinor)}` };
  return {
    title: mode === 'running' ? 'Income, running total' : 'Income by month',
    bars,
    scaleMax,
    line,
    yearEnds,
    note: all ? `At this rate, the year ends around ${poundsWords(yearEnds)}.` : 'Targets show with All income.',
    toggle: showProjected ? 'Hide projected income' : 'Show projected income',
  };
}
