import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, PageHeader, Stat, useIsPhone } from '../../components/design';
import { leadReport, REPORT_LIKELY_NOTE, REPORT_PERIOD } from '../../lib/coach/associatePay';
import { networkPath } from '../../lib/coach/network';
import { Back, Row, useCoachPortal } from './parts';
import './pay.css';

// Lead reports (Phase 6b run 2; M11 C10), the owner's alone, from the quiet Reports link under the Leads title, at
// /coach/leads/reports: the pipeline, what's likely by stage, the win rate and the time to win, each stage's value,
// where won work came from and who referred it. Sales figures live here, never on Finances (M11's note).

function Section({ title, aside, children }) {
  return (
    <section className="ds-section cc-part cc-pay-part">
      <div className="ds-section-head cc-pay-head"><h2 className="ds-section-title">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

/** A slim bar with its name and its value (M11 .bzh): the bar is decoration, the words say the figures. */
function BarRow({ name, share, value, label }) {
  return (
    <div className="cc-rep-bar" role="listitem" aria-label={label}>
      <span className="cc-rep-bar-name" aria-hidden="true">{name}</span>
      <Bar value={share} />
      <span className="cc-rep-bar-value" aria-hidden="true">{value}</span>
    </div>
  );
}

export default function LeadReports() {
  const { leads, leadStages, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const r = useMemo(() => leadReport({ leads, stages: leadStages, today: todayKey }), [leads, leadStages, todayKey]);
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to="Leads" onClick={() => navigate('/coach/leads')} />
        <PageHeader title="Lead reports" meta={[REPORT_PERIOD]} />
        <div className="cc-pay-figures cc-rep-figures" role="group" aria-label="Lead figures">
          <Stat label="Pipeline" value={r.pipeline} />
          <Stat label="Likely, by stage" value={r.likely} />
          {r.winRate && <Stat label="Win rate, last 12 months" value={r.winRate} />}
          {r.timeToWin && !isPhone && <Stat label="Time to win" value={r.timeToWin} unit="on average" />}
        </div>

        {r.byStage.length > 0 && (
          <Section title="By stage">
            <div className="cc-rep-bars" role="list" aria-label="By stage">
              {r.byStage.map((s) => (
                <BarRow key={s.key} name={s.name} share={s.share} value={`${s.valueWords}  ${s.count}`} label={`${s.name}, ${s.valueWords}, ${s.count === 1 ? '1 lead' : `${s.count} leads`}`} />
              ))}
            </div>
            <p className="cc-note cc-rep-note">{REPORT_LIKELY_NOTE}</p>
          </Section>
        )}

        {r.sources.length > 0 && (
          <Section title="Where work comes from" aside={isPhone ? null : <span className="cc-pay-aside">{REPORT_PERIOD}</span>}>
            <div className="cc-rep-bars" role="list" aria-label="Where work comes from">
              {r.sources.map((s) => <BarRow key={s.key} name={s.name} share={s.share} value={s.words} label={`${s.name}, ${s.words}`} />)}
            </div>
          </Section>
        )}

        {r.referrers.length > 0 && (
          <Section title="Referrers">
            <div className="cc-rows cc-pay-rows">
              {r.referrers.map((p) => (
                <Row
                  key={p.key}
                  title={p.name}
                  facts={[p.line]}
                  when={p.right}
                  label={[p.name, p.line, p.right].filter(Boolean).join(', ')}
                  onClick={p.personId ? () => navigate(networkPath({ person: p.personId })) : undefined}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
