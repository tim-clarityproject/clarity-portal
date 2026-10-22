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
// own. Only the live score is coral (`live`); other numbers are white.
//
// bar: optional 0 to 1 for the thin bar underneath.
export function Stat({ label, value, note, live = false, bar, className = '' }) {
  return (
    <div className={`ds-stat ${className}`.trim()}>
      <span className="ds-stat-label">{label}</span>
      <strong className={`ds-stat-value${live ? ' ds-stat-value--live' : ''}`}>{value}</strong>
      {note && <span className="ds-stat-note">{note}</span>}
      {bar != null && <Bar value={bar} />}
    </div>
  );
}

export function StatGroup({ children, className = '' }) {
  return <div className={`ds-stats ${className}`.trim()}>{children}</div>;
}
