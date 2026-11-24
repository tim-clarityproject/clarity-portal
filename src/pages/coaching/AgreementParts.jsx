import { useMemo } from 'react';
import { SlidePanel } from '../../components/design';
import { agreementSections, glanceRows } from '../../lib/coaching/agreementRules';
import './coaching.css';

// The agreement's own parts (Phase 6b run 1; M13 A3): the At a glance panel and the full agreement
// in the shared side panel. Shared by the signing screens and the design gallery.

/** The full agreement in the shared side panel: each section with its number and title. */
export function FullAgreement({ open, onClose, version, title }) {
  const sections = useMemo(() => agreementSections(version), [version]);
  return (
    <SlidePanel open={open} onClose={onClose} title={title} className="ds-who-panel agree-full">
      {sections.map((c) => (
        <section key={c.key} className="agree-full-section">
          {c.title && <h3 className="agree-full-title">{`${c.number}. ${c.title}`}</h3>}
          {c.paragraphs.map((p) => <p key={p} className="agree-full-text">{p}</p>)}
        </section>
      ))}
    </SlidePanel>
  );
}

/** At a glance: the wording's Main points, a label and its value on each row (M13 .agl). */
export function GlancePanel({ version }) {
  const rows = glanceRows(version);
  return (
    <dl className="agree-glance" aria-label="At a glance">
      {rows.map((r) => (
        <div key={r.label} className="agree-glance-row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
