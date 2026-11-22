import { SleepChart } from '../../components/design';
import { SLEEP_CHART_STARTS, SLEEP_SUGGESTED_LINE, SLEEP_TARGET_DEFAULT, recoverySleepView } from '../../lib/performance/sleepChart';

// The sleep chart (Recovery's Home and the dashboard; tidy pass, item 5).
// Invented nights only: a 10-day Recovery seen on its sixth day, then the
// empty frame before the second night.

const RECOVERY = { start_on: '2026-10-29', chosen_days: 10, extended_days: 0, ended_at: null, end_on: null };
const TODAY = '2026-11-03';
const NIGHTS = [
  { local_date: '2026-10-29', sleep_hours: 7.5, sleep_quality: 'good' },
  { local_date: '2026-10-30', sleep_hours: 6, sleep_quality: 'poor' },
  { local_date: '2026-10-31', sleep_hours: null, sleep_quality: 'fair' },
  { local_date: '2026-11-01', sleep_hours: 8, sleep_quality: 'very_good' },
  { local_date: '2026-11-02', sleep_hours: 9.5, sleep_quality: 'good' },
  { local_date: '2026-11-03', sleep_hours: 6.5, sleep_quality: 'fair' },
];

export function SleepChartDemo() {
  const target = SLEEP_TARGET_DEFAULT;
  const view = recoverySleepView({ recovery: RECOVERY, nights: NIGHTS, today: TODAY, target });
  const first = recoverySleepView({ recovery: RECOVERY, nights: NIGHTS.slice(0, 1), today: '2026-10-29', target });
  return (
    <div className="dr-stack">
      <SleepChart slots={view.slots} target={target} note={SLEEP_SUGGESTED_LINE} enough={view.enough} empty={SLEEP_CHART_STARTS} />
      <SleepChart slots={first.slots} target={target} note={SLEEP_SUGGESTED_LINE} enough={first.enough} empty={SLEEP_CHART_STARTS} />
    </div>
  );
}
