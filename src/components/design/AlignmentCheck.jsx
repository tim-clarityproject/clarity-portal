import './design.css';

// The alignment check (M1 .align, M6 .align2; decisions "Alignment
// rules"): every objective has a Strategy, and every Strategy serves an
// objective. When the plan lines up, two quiet lines each with a small
// mint dot. Each gap is its own line in soft coral with an outlined ring
// ("Annual revenue has no Strategy working on it"): needs you is words and
// an outline, never a fill, so it is never told from good by colour alone.
//
// lines: [{ good, text }] (alignmentLines in src/lib/performance).
export default function AlignmentCheck({ lines = [], className = '' }) {
  if (!lines.length) return null;
  return (
    <ul className={`ds-align ${className}`.trim()} aria-label="Alignment check">
      {lines.map((l) => (
        <li key={l.text} className={l.good ? 'ds-align-good' : 'ds-align-gap'}>
          <span className="ds-align-mark" aria-hidden="true" />
          {l.text}
        </li>
      ))}
    </ul>
  );
}
