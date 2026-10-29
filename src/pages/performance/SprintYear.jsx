import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  Button,
  Collapsible,
  EmptyState,
  ErrorMessage,
  Loading,
  PageHeader,
  PerformanceSystem,
  RecoveryNotice,
  Section,
  YearChart,
} from '../../components/design';
import { useYearPage } from '../../lib/performance/hooks';
import { freezeWeek } from '../../lib/performance/api';
import { localToday, openRecovery, recoveryLead, selectedWeek, yearView } from '../../lib/performance';
import { useQueueState } from '../../lib/syncQueue';
import { isOnline } from '../../lib/connection';
import pageText from '../../content/pageText';
import './performance.css';

// View your year (mock-up M1, R.year): every week of the year as a slim
// bar, the sprints named above them and Recovery hatched, the standard as
// a labelled line; picking a week says more about it underneath; then the
// sprints this year with their averages. Every figure comes from
// src/lib/scores through src/lib/performance (yearView): the running
// sprint's weeks exactly as the sprint page shows them, the others from
// the frozen week_scores.
//
// Rules followed over M1: mint for weeks at the standard (M1 coral), no
// legend (every week has a pop-up, Recovery says so in words), labels in
// DM Sans sentence case (M1 Nekst capitals), "Show as a table" (graphs
// rule), the phone shows the chart full width with no sideways scroll
// (M1 scrolls a 640px chart), no dots between words, and "Open the week
// summary" waits for the debrief summary (Phase 3).
//
// Finished weeks not yet frozen are frozen here when online (freeze_week,
// best effort), then the year loads again with them.

export default function SprintYear() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { data, loading, error, reload } = useYearPage(userId);
  const today = localToday(data?.personSettings?.time_zone);
  // "Show my results" in Recovery: this visit only, never stored (M15).
  const [showResults, setShowResults] = useState(false);
  const view = useMemo(() => (data ? yearView(data, { today, showResults }) : null), [data, today, showResults]);
  const recovery = openRecovery(data?.recoveries || []);
  const queue = useQueueState();
  const [picked, setPicked] = useState(null);
  const [system, setSystem] = useState(false);
  const tried = useRef(new Set());

  // Finished weeks into week_scores (R3), so every sprint shows its scores.
  useEffect(() => {
    if (!view?.toFreeze?.length || !isOnline() || queue.waiting > 0) return;
    const todo = view.toFreeze.filter((w) => !tried.current.has(`${w.sprintId}:${w.week}`));
    if (!todo.length) return;
    todo.forEach((w) => tried.current.add(`${w.sprintId}:${w.week}`));
    let live = true;
    (async () => {
      let froze = 0;
      for (const w of todo) {
        try {
          await freezeWeek(w.sprintId, w.week);
          froze += 1;
        } catch {
          // Best effort: tried again on the next visit.
        }
      }
      if (live && froze) reload();
    })();
    return () => { live = false; };
  }, [view?.toFreeze, queue.waiting, reload]);

  const week = picked ?? view?.selected;
  const sel = view ? selectedWeek(view, week) : null;
  const selSlot = view?.slots[week - 1];

  let body;
  if (!data && loading) body = <Loading label="Loading your year" className="ds-loading--page" />;
  else if (!data || error) {
    body = (
      <div className="ipp-gap">
        <ErrorMessage keepsHappening>Your year didn’t load. Check your connection and try again.</ErrorMessage>
      </div>
    );
  } else if (!data.plan) {
    // No plan yet: the plan comes before any sprint.
    body = (
      <div className="ipp-gap">
        <EmptyState
          question="Ready to build your Individual Performance Plan?"
          action={{ label: 'Build my plan', onClick: () => navigate('/performance-plan/build') }}
        />
      </div>
    );
  } else if (!data.sprints?.length) {
    body = (
      <div className="ipp-gap">
        <EmptyState
          question="Ready to start a Performance Sprint?"
          action={{ label: 'Start a sprint', onClick: () => navigate('/performance-sprint/start') }}
        />
      </div>
    );
  } else {
    body = (
      <>
        {recovery && (
          <RecoveryNotice
            className="ipp-recovery"
            lead={recoveryLead(recovery, today)}
            lines={[showResults ? 'Your results show as normal for this visit.' : 'Your scores and standards are hidden until you’re back.']}
            action={showResults ? null : { label: 'Show my results', onClick: () => setShowResults(true) }}
          />
        )}
        <div className="year-chart">
          <YearChart
            slots={view.slots}
            sprints={view.sprints}
            standardLines={view.standardLines}
            months={view.months}
            selected={week}
            onSelect={setPicked}
            label={`Performance score by week, ${view.year}`}
          />
        </div>

        {sel && (
          <div className="year-sel" aria-live="polite">
            <div className="year-sel-text">
              <p className="year-sel-title">{sel.title}</p>
              {sel.lines.map((l) => <p key={l} className="year-sel-line">{l}</p>)}
              {sel.score != null && (
                <p className="year-sel-score">
                  Performance score
                  <span className={`year-sel-figure${selSlot?.state === 'good' ? ' year-sel-figure--good' : ''}`}>{`${sel.score}%`}</span>
                </p>
              )}
              {sel.nothing && <p className="year-sel-line">{sel.nothing}</p>}
            </div>
            {sel.open && <Button onClick={() => navigate('/performance-sprint')}>Open this week</Button>}
          </div>
        )}

        <div className="year-table">
          <Collapsible summary="Show as a table">
            <YearTable view={view} />
          </Collapsible>
        </div>

        <Section title="Sprints this year" className="ipp-section">
          {view.sprints.length ? (
            <ul className="year-sprints">
              {[...view.sprints].reverse().map((s) => (
                <li key={s.id} className="year-sprint">
                  <div className="year-sprint-text">
                    <span className="year-sprint-name">{s.name}</span>
                    {s.label && <span className="year-sprint-line">{s.label}</span>}
                    <span className="year-sprint-line">{s.weeksText}</span>
                    {s.waiting && <span className="year-sprint-line">Its review is waiting for you.</span>}
                    {s.running && !s.waiting && <span className="year-sprint-line">Running</span>}
                  </div>
                  <div className="year-sprint-avg">
                    {view.hidden ? null : (
                      <>
                        <span className="year-sprint-line">Average performance score</span>
                        {s.average
                          ? <span className="year-sprint-figure">{s.average}</span>
                          : <span className="year-sprint-line">Your average appears after your first week.</span>}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ipp-muted">No sprint has run this year yet.</p>
          )}
        </Section>

        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-sprint')}>Open my sprint</Button>
          <Button onClick={() => navigate('/performance-plan')}>Open my plan</Button>
        </div>
      </>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page year-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-sprint')} label="Performance Sprint" /></div>
        <PageHeader
          title="View your year"
          meta={view ? [`${view.year}, week by week`] : []}
          info={pageText.performanceYear}
          onSystemLink={() => setSystem(true)}
        />
        {body}
      </div>
      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
    </div>
  );
}

// "Show as a table" (graphs rule): every week that holds something, in
// words, so the chart never has to be read by colour or by pointing.
function YearTable({ view }) {
  const rows = view.slots.filter((s) => s.kind !== 'empty');
  if (!rows.length) return <p className="ipp-muted">No week this year holds a sprint or Recovery yet.</p>;
  return (
    <table className="year-tbl">
      <thead>
        <tr><th scope="col">Week</th><th scope="col">What</th><th scope="col">Performance score</th></tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const what = s.kind === 'recovery' ? 'Recovery' : `${s.sprintName}, week ${s.sprintWeek}`;
          let score;
          if (s.kind === 'recovery') score = 'Nothing is tracked';
          else if (s.state === 'hidden') score = 'Hidden in recovery';
          else if (s.state === 'next') score = 'To come';
          else if (s.score == null) score = s.tip?.value || 'Not scored yet';
          else score = `${s.score}%${s.state === 'now' ? ', so far' : ''}`;
          return (
            <tr key={s.week}>
              <td data-label="Week">{`Week ${s.week}`}</td>
              <td data-label="What">{what}</td>
              <td data-label="Performance score">{score}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
