import { useId, useMemo, useState } from 'react';
import { Card, DisclosureArrow, InlineChoice, QuickAdd, Row, SlidePanel } from '../../components/design';
import { agreementSections, glanceRows } from '../../lib/coaching/agreementRules';
import { clauseTitle } from '../../lib/agreements/clauses';
import { settleOptions } from '../../lib/agreements/settling';
import { canChoose } from '../../lib/agreements/upfront';
import { FLOW, clauseCount, settleSwitchOptions } from '../../lib/coaching/clientMoney';
import './coaching.css';
import './clientAgreement.css';

// The agreement's own parts (Phase 6b run 1; M13 A3), and since Polish 1, Stage C (C3; M28 v6 "sign" and "quote") the
// cards the client's Read step, the quote and the sponsor's page are built from: The main points as rows, The
// agreement with its clauses opening one at a time (the first open), each with Ask for a change as Quick Add, and the
// short Up front or Monthly switch. Shared by the signing screens and the design gallery.

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

/** The main points (M28 "The main points"): a card of rows, the label left and its value grey on the right. */
export function PointsCard({ points = [], label = FLOW.points }) {
  if (!points.length) return null;
  return (
    <Card label={label} className="cl-points">
      {points.map((r) => <Row key={r.label} name={r.label} value={r.value} />)}
    </Card>
  );
}

/**
 * The agreement (M28 "The agreement", its details.cl): the clause count beside the label, then each clause as a row that
 * opens in place, one at a time, the first open to start with. Each paragraph's reason sits under it in a quieter line.
 * `ask` ({ coachFirst, onSend(clause, words) }) adds "Ask for a change" under each open clause, opening Quick Add with
 * "What would you like changed?"; leave it out where nothing can be asked (signed, a change already asked, a sponsor).
 */
export function ClausesCard({ clauses = [], ask = null, idPrefix = 'cl' }) {
  const [open, setOpen] = useState(() => clauses[0]?.key ?? null);
  const [asking, setAsking] = useState(null);
  const baseId = useId();
  if (!clauses.length) return null;
  return (
    <section className="ds-card cl-clauses" aria-labelledby={`${baseId}-l`}>
      <div className="ds-card-head">
        <h2 className="ds-label" id={`${baseId}-l`}>{FLOW.agreement}</h2>
        <span className="cl-count">{clauseCount(clauses.length)}</span>
      </div>
      <div className="ds-rows-list">
        {clauses.map((c) => {
          const isOpen = open === c.key;
          const bodyId = `${idPrefix}-${c.key}`;
          const canAsk = ask && c.key !== 'signatures';
          return (
            <div key={c.key} className="cl-clause">
              <button
                type="button"
                className="ds-li ds-li--go cl-fold"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => { setOpen(isOpen ? null : c.key); setAsking(null); }}
              >
                <span className="ds-li-name">{clauseTitle(c)}</span>
                <span className="ds-li-value"><DisclosureArrow open={isOpen} /></span>
              </button>
              {isOpen && (
                <div id={bodyId} className="cl-clause-body">
                  {(c.paragraphs || []).map((p, i) => (
                    <div key={`${c.key}-${i}`}>
                      <p className="cl-para">{typeof p === 'string' ? p : p.text}</p>
                      {p?.why && <p className="cl-why">{p.why}</p>}
                    </div>
                  ))}
                  {canAsk && (
                    <>
                      <button
                        type="button"
                        className="cl-asklink"
                        aria-expanded={asking === c.key}
                        aria-controls={`${bodyId}-ask`}
                        onClick={() => setAsking(asking === c.key ? null : c.key)}
                      >
                        {FLOW.ask}
                      </button>
                      <QuickAdd
                        id={`${bodyId}-ask`}
                        open={asking === c.key}
                        onClose={() => setAsking(null)}
                        onAdd={(words) => ask.onSend(c, words)}
                        placeholder={FLOW.askPlaceholder}
                        label={FLOW.askLabel}
                        addLabel={FLOW.askSend(ask.coachFirst)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Up front or the plan (M28 quote's .seg.wide): the joined switch with short words ("Up front, 5% off", "Monthly"), and
 * under it the full words of the one chosen ("Up front, £9,956, 5% off"), so nothing wraps inside the switch. Only where
 * the client chooses (canChoose); `value` is 'upfront' | 'plan'. `bare`: no words above or under it (the quotation, whose
 * In all line says it).
 */
export function SettleSwitch({ terms, value = 'upfront', onChange, chosenExtras, label = FLOW.settleWhen, bare = false }) {
  if (!canChoose(terms)) return null;
  const planLabel = (settleOptions(terms, chosenExtras).find((o) => o.value === terms.settle) || {}).label;
  const options = settleSwitchOptions(terms, planLabel, chosenExtras);
  const chosen = options.find((o) => o.value === value) || options[0];
  return (
    <div className="cl-switch">
      <InlineChoice label={bare ? undefined : label} ariaLabel={bare ? label : undefined} options={options.map((o) => ({ value: o.value, label: o.short }))} value={chosen.value} onChange={onChange} form="pills" className="cl-switch-seg" />
      {!bare && <p className="cl-hint">{chosen.long}</p>}
    </div>
  );
}
