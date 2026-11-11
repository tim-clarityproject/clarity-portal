import { LoggingRow, LoggingWeekRow } from '../../components/design';

// The rows of Log today, one habit each (M1 hrow), shared by the
// Performance Sprint and Home (Phase 4 step 2), so both log the same way.

const toText = (v) => (v == null ? '' : String(v));

function entryKind(measure) {
  if (measure === 'count' || measure === 'count_limit') return 'stepper';
  if (measure === 'yes_no_days_limit' || measure === 'yes_no_days_target') return 'yesno';
  if (measure === 'rating') return 'rating';
  if (measure === 'yes_no_weekly') return 'tick';
  return 'number';
}

/** Log today: one habit, today (M1 hrow, day view). */
export function DayRow({ habit: h, view, typed, onLog, onType, onLeave, onTick, onMore }) {
  const kind = entryKind(h.measure);
  const day = view.today;
  const common = {
    name: h.name,
    detail: h.line,
    // The bar shows the same value as the line above it.
    progress: h.lineBar ?? h.bar,
    onMore,
    moreLabel: `${h.name}: week, target and impact`,
  };
  if (kind === 'number') {
    return (
      <LoggingRow
        {...common}
        kind="number"
        value={typed[`${h.id}:${day}`] ?? toText(h.todayShown)}
        onChange={(text) => onType(h, day, text)}
        unit={h.unit}
        decimals={h.decimals}
        entryLabel={`${h.name} today`}
        inputProps={{ onBlur: () => onLeave(h, day), placeholder: '0' }}
      />
    );
  }
  if (kind === 'stepper') {
    return <LoggingRow {...common} kind="stepper" value={h.today ?? 0} min={0} max={h.top} entryLabel={`${h.name} today`} onChange={(v) => onLog(h, day, v)} />;
  }
  if (kind === 'tick') {
    return <LoggingRow {...common} kind="tick" value={Boolean(Object.values(h.values).some((v) => v > 0))} entryLabel={h.name} onChange={(v) => onTick(h, v)} />;
  }
  return <LoggingRow {...common} kind={kind} value={h.today} entryLabel={`${h.name} today`} onChange={(v) => onLog(h, day, v)} />;
}

/** Log this week: one habit, every day shown so far (M1 hrow, week view). */
export function WeekRow({ habit: h, view, typed, onLog, onType, onLeave, onTick, onMore, bare = false }) {
  const kind = entryKind(h.measure);
  const common = {
    name: bare ? 'This week' : h.name,
    detail: h.weekLine,
    progress: bare ? undefined : (h.weekBar ?? h.bar),
    onMore: bare ? undefined : onMore,
    moreLabel: `${h.name}: week, target and impact`,
    days: view.shownDays,
  };
  if (kind === 'tick') {
    return <LoggingWeekRow {...common} kind="tick" value={Object.values(h.values).some((v) => v > 0)} onChange={(v) => onTick(h, v)} />;
  }
  if (kind === 'yesno') {
    return <LoggingWeekRow {...common} kind="yesno" values={h.values} onChange={(d, v) => onLog(h, d, v)} />;
  }
  // A rated habit: a mint box for each day, never a number (Tim, 10 Nov, 23:22).
  if (kind === 'rating') {
    return <LoggingWeekRow {...common} kind="rating" values={h.values} onChange={(d, v) => onLog(h, d, v)} />;
  }
  const texts = Object.fromEntries(view.shownDays.map((d) => [d.key, typed[`${h.id}:${d.key}`] ?? toText(h.shown[d.key])]));
  return (
    <LoggingWeekRow
      {...common}
      kind="boxes"
      decimals={h.decimals}
      texts={texts}
      onChange={(d, text) => onType(h, d, text)}
      onBlur={(d) => onLeave(h, d)}
    />
  );
}
