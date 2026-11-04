import { ChartTable, CheckinChart } from '../../components/design';
import { checkinPoints, tripsWords } from '../../lib/performance/checkin';

// The check-in's two-line graph and Show as a table (Phase 5 step 1,
// mock-up M12 "Over time"). Invented answers only.

const BASE = { H1: 'h6_7', H2: 'ok', H3: 'often', H4: 'under_1', H5: 'd1', H6: 'h8_10', H7: 'ok', H8: 'u8_14', H9: 'monthly', H10: 'ok', H11: 'low', H12: 'good', H13: 'a_little', S1: 'sometimes', S2: 'sometimes', S3: 'rarely', S4: 'often', S5: 'often', S6: 'sometimes' };
const ROWS = [
  { month: '2026-06-01', status: 'finished', answers: BASE },
  { month: '2026-07-01', status: 'finished', answers: { ...BASE, H3: 'sometimes', H14: 'yes', H15: '1' } },
  { month: '2026-08-01', status: 'finished', answers: { ...BASE, H3: 'sometimes', H4: 'h1_2_5', S3: 'sometimes' } },
  { month: '2026-09-01', status: 'finished', answers: { ...BASE, H11: 'very_low', H14: 'yes', H15: '3' } },
  { month: '2026-10-01', status: 'finished', answers: { ...BASE, H1: 'h7_8', H2: 'good', H3: 'sometimes', H4: 'h2_5_5', S3: 'often', S4: 'always' } },
];

export function CheckinChartDemo() {
  const points = checkinPoints(ROWS);
  return (
    <div className="dr-stack">
      <CheckinChart points={points} />
      <ChartTable
        caption="Hardware score and Software score by month"
        columns={[{ key: 'month', label: 'Month' }, { key: 'hw', label: 'Hardware score' }, { key: 'sw', label: 'Software score' }, { key: 'trips', label: 'Travel' }]}
        rows={points.map((p) => ({ key: p.month, cells: { month: p.when, hw: `${p.hardware}/100`, sw: `${p.software}/100`, trips: tripsWords(p.trips) } }))}
      />
      <CheckinChart points={points.slice(-1)} />
    </div>
  );
}
