import { clauseTitle } from '../../lib/agreements/clauses';
import './agreements.css';

// The agreement as its reader sees it (M28's agreement render; s-c-sign, s-preview, s-q-client, s-s-sign, s-agr):
// Main points, a contents list, then every clause with its number, its paragraphs and each paragraph's reason in a
// quieter line under it. `after(clause)` puts something under a clause (the client's "Ask for a change" and its box,
// Group C); the signatures clause never has one. Pass clauses with the client's choice already applied
// (resolveChoice) and points from mainPoints / teamPoints / hoursPoints.
//   points:   [{ label, value }]
//   clauses:  [{ key, number, title, paragraphs: [{ text, why }] }]
//   idPrefix: the clauses' ids, so two views on one page never share one ("ag" by default)
export default function AgreementView({ points = [], clauses = [], after, contents = true, idPrefix = 'ag', pointsLabel = 'Main points' }) {
  const jump = (key) => {
    const el = typeof document !== 'undefined' ? document.getElementById(`${idPrefix}-${key}`) : null;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus?.({ preventScroll: true });
  };
  return (
    <div className="ag-view">
      {points.length > 0 && (
        <dl className="ag-points" aria-label={pointsLabel}>
          {points.map((r) => (
            <div key={r.label} className="ag-point">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {contents && clauses.length > 0 && (
        <nav className="ag-contents" aria-label="Contents">
          <p className="ag-contents-label">Contents</p>
          <ol>
            {clauses.map((c) => (
              <li key={c.key}>
                <button type="button" className="ag-contents-link" onClick={() => jump(c.key)}>{clauseTitle(c)}</button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {clauses.map((c) => (
        <section key={c.key} id={`${idPrefix}-${c.key}`} className="ag-clause" tabIndex={-1} aria-labelledby={`${idPrefix}-${c.key}-t`}>
          <h3 id={`${idPrefix}-${c.key}-t`} className="ag-clause-title">{clauseTitle(c)}</h3>
          {(c.paragraphs || []).map((p, i) => (
            // A paragraph and its reason: the reason quieter, under it, with no side line (risk 3).
            <div key={`${c.key}-${i}`}>
              <p className="ag-para">{typeof p === 'string' ? p : p.text}</p>
              {p?.why && <p className="ag-why">{p.why}</p>}
            </div>
          ))}
          {after && c.key !== 'signatures' && <div className="ag-clause-after">{after(c)}</div>}
        </section>
      ))}
    </div>
  );
}
