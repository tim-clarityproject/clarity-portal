import { useContext, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { EmptyState, ErrorMessage, Loading, ObjectiveNumbers, PageHeader, Section } from '../../components/design';
import { usePlanVersions } from '../../lib/performance/hooks';
import { VERSION_KIND_LABEL, parseVersion, versionLabel, versionView } from '../../lib/performance';
import { dayAndTime } from './planDates';
import './performance.css';

// One version of the Individual Performance Plan, read only (not mocked):
// what the plan said then, in the plan page's order and words. A version
// keeps the plan only, never figures or scores.
export default function PlanVersion() {
  const navigate = useNavigate();
  const { version: param } = useParams();
  const { user } = useContext(AuthContext);
  const { data, loading, error } = usePlanVersions(user?.id);
  const wanted = parseVersion(param);
  const row = wanted && (data?.versions || []).find((v) => v.major === wanted.major && v.minor === wanted.minor);
  const view = useMemo(() => (row ? versionView(row.snapshot) : null), [row]);
  const back = () => navigate('/performance-plan/history');

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={back} label="Version history" /></div>
        <PageHeader
          title={row ? versionLabel(row) : 'Plan version'}
          meta={row ? [VERSION_KIND_LABEL[row.kind], dayAndTime(row.created_at)] : []}
        />
        {loading ? (
          <Loading label="Loading this version" className="ds-loading--page" />
        ) : error ? (
          <div className="ipp-gap"><ErrorMessage keepsHappening>This version didn’t load. Check your connection and try again.</ErrorMessage></div>
        ) : !view ? (
          <div className="ipp-gap">
            <EmptyState question="That version isn’t in your plan’s history." action={{ label: 'See version history', onClick: back, variant: 'outline' }} />
          </div>
        ) : (
          <>
            <section className="ds-mission-card" aria-labelledby="ipp-v-mission">
              <div className="ds-mission-card-head"><h2 id="ipp-v-mission" className="ds-mission-card-label">My Mission</h2></div>
              <p className="ds-mission-card-text">{view.mission || 'No mission was written in this version.'}</p>
            </section>

            <Section title="Outcome Objectives" className="ipp-version-block">
              {view.objectives.length ? (
                <ul className="ipp-version-rows">
                  {view.objectives.map((o) => (
                    <li key={o.id}>
                      <span className="ipp-version-line">{[`Outcome Objective ${o.number}`, o.kindLabel, o.dateText].filter(Boolean).join(', ')}</span>
                      {o.name}
                      {o.target && <span className="ipp-version-line">{o.target}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="ipp-muted">This version had no Outcome Objectives.</p>}
            </Section>

            <Section title="Strategies" className="ipp-version-block">
              {view.strategies.length ? (
                <ul className="ipp-version-rows">
                  {view.strategies.map((s) => (
                    <li key={s.id}>
                      {s.serves.length
                        ? <ObjectiveNumbers items={s.serves.map((n) => ({ number: n, name: view.objectives[n - 1]?.name }))} />
                        : <span className="ipp-version-line">{s.servesLine}</span>}
                      {s.name}
                      {s.habits.length > 0 && (
                        <ul className="ipp-version-habits" aria-label={`Habits for ${s.name}`}>
                          {s.habits.map((h) => (
                            <li key={h.id}>{h.name}<span className="ipp-version-line">{h.line}</span></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="ipp-muted">This version had no Strategies.</p>}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
