import './design.css';

// The thin bar under a stat or a logging row. `value` is 0 to 1.
// Decorative: the words beside it already say the numbers.
export function Bar({ value = 0, className = '' }) {
  const percent = Math.max(0, Math.min(1, Number(value) || 0)) * 100;
  return (
    <span className={`ds-bar ${className}`.trim()} aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}

// Stat (design reference: Stats). Label first, then the number (Nekst
// Light), then one grey line saying what it means. Never a number on its
// own.
//
// good: the number is mint (Tim, 26 Oct): the live score at or above the
//       standard, or a rise. Below the standard it stays the text colour.
// unit: a full word, small and grey, beside the number ("7.1 hours",
//       "6 weeks"; never "h" or "wks"). A unit starting with "/" sits
//       right against the number ("8/10").
// bar:  optional 0 to 1 for the thin bar underneath (mint: progress).
// panel: the stat sits in a soft panel (a summary's facts, M1 .fact).
// celebrate: the mint celebration glow (M1 debrief summary at or above
//       the standard; mint, never coral, Tim 26 Oct): a thin mint edge
//       that fades in once and stays. With reduced motion it is simply
//       there. Implies panel.
export function Stat({ label, value, unit, note, good = false, bar, panel = false, celebrate = false, className = '' }) {
  const box = celebrate ? ' ds-stat--panel ds-stat--celebrate' : panel ? ' ds-stat--panel' : '';
  return (
    <div className={`ds-stat${box} ${className}`.trim()}>
      <span className="ds-stat-label">{label}</span>
      <strong className={`ds-stat-value${good ? ' ds-stat-value--good' : ''}`}>
        {value}
        {unit && <span className={`ds-unit${unit.startsWith('/') ? ' ds-unit--tight' : ''}`}>{unit}</span>}
      </strong>
      {note && <span className="ds-stat-note">{note}</span>}
      {bar != null && <Bar value={bar} />}
    </div>
  );
}

export function StatGroup({ children, className = '' }) {
  return <div className={`ds-stats ${className}`.trim()}>{children}</div>;
}
