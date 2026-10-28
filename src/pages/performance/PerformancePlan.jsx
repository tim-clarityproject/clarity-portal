import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  AlignmentCheck,
  Button,
  EmptyState,
  ErrorMessage,
  Loading,
  ObjectiveCard,
  ObjectiveGrid,
  PageHeader,
  PerformanceSystem,
  RecoveryNotice,
  Section,
  SlidePanel,
  StrategyDetail,
  StrategyDetailBody,
  StrategyTile,
  StrategyTiles,
  WhoSees,
  useIsPhone,
  useToast,
} from '../../components/design';
import { usePlanPage } from '../../lib/performance/hooks';
import { saveMilestoneReached, saveSharing } from '../../lib/performance/api';
import { recoveryLead, versionLabel } from '../../lib/performance';
import { friendlyError } from '../../lib/friendlyError';
import pageText from '../../content/pageText';
import { dayWords } from './planDates';
import './performance.css';

// The Individual Performance Plan (mock-up M1, R.ipp): My Mission, the
// alignment check, the Outcome Objectives, the Strategies with their
// detail, and links to edit the plan and see its versions. Every figure
// comes from src/lib/scores through src/lib/performance (planView).
//
// Who sees it (spec section 5): the mission is shared with the coach by
// default, and progress (objective figures and scores) is not; both eyes
// can be tapped to change that there and then. Without a coach, everything
// is "Only you". In Recovery the scores are hidden (M15).

const SCORE_LABEL = 'Performance score this week so far';

export default function PerformancePlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isPhone = useIsPhone();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  // "Show my results" in Recovery: this visit only, never stored (M15).
  const [showResults, setShowResults] = useState(false);
  const { view, loading, error, setData } = usePlanPage(userId, { showResults });
  const [openId, setOpenId] = useState(null);
  const [system, setSystem] = useState(false);

  // A toast passed from the page before (e.g. after building the plan).
  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = view?.strategies.find((s) => s.id === openId) || null;

  const changeRow = (table, match, patch) => setData((d) => ({
    ...d,
    [table]: (d[table] || []).map((r) => (match(r) ? { ...r, ...patch } : r)),
  }));

  const setSwitch = async (part, isOn) => {
    await saveSharing(userId, part, isOn);
    setData((d) => ({
      ...d,
      switches: [...(d.switches || []).filter((s) => s.part !== part), { part, is_on: isOn }],
    }));
  };

  const markMilestone = async (objective, done) => {
    const reachedOn = done ? view.today : null;
    const before = objective.reachedOn ?? null;
    changeRow('objectives', (r) => r.id === objective.id, { reached_on: reachedOn });
    try {
      await saveMilestoneReached(userId, objective.id, reachedOn);
      if (done) {
        toast.saved({
          message: `Done. ${objective.name}.`,
          onUndo: async () => {
            changeRow('objectives', (r) => r.id === objective.id, { reached_on: before });
            try {
              await saveMilestoneReached(userId, objective.id, before);
            } catch (e) {
              toast.error(friendlyError(e, 'That didn’t undo. Check your connection and try again.'));
            }
          },
        });
      }
    } catch (e) {
      changeRow('objectives', (r) => r.id === objective.id, { reached_on: before });
      toast.error(friendlyError(e, 'That didn’t save. Check your connection and try again.'));
    }
  };

  const who = (part, name) => {
    if (!view?.coachName) return { audience: 'me' };
    const shared = part === 'mission' ? view.missionShared : view.progressShared;
    return {
      audience: shared ? 'coach' : 'me',
      coachName: view.coachName,
      name,
      onChange: (next) => setSwitch(part, next === 'coach'),
    };
  };

  const scoreNote = (s) => {
    if (view.pausedWeek) return s.score ? null : `This Strategy had no score in week ${view.pausedWeek}.`;
    if (!view.sprintRunning || s.score) return null;
    return 'This Strategy has no score yet this week.';
  };
  const hideScores = view?.inRecovery && !showResults;
  const scoreLabel = view?.pausedWeek ? `Performance score in week ${view.pausedWeek}, before your recovery` : SCORE_LABEL;

  const editStrategy = (id) => navigate(`/performance-plan/edit?strategy=${encodeURIComponent(id)}`);
  const meta = view
    ? [versionLabel(view.version), view.changedAt ? `Changed ${dayWords(view.changedAt)}` : null]
    : [];

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/plan-section')} label="Plan" /></div>
        <PageHeader
          title="Individual Performance Plan"
          meta={meta}
          info={pageText.performancePlan}
          onSystemLink={() => setSystem(true)}
        />

        {loading ? (
          <Loading label="Loading your plan" className="ds-loading--page" />
        ) : error ? (
          <div className="ipp-gap">
            <ErrorMessage keepsHappening>Your plan didn’t load. Check your connection and try again.</ErrorMessage>
          </div>
        ) : !view ? (
          <div className="ipp-gap">
            <EmptyState
              question="Ready to build your Individual Performance Plan?"
              action={{ label: 'Build my plan', onClick: () => navigate('/performance-plan/build') }}
            />
          </div>
        ) : (
          <>
            {view.inRecovery && (
              <RecoveryNotice
                className="ipp-recovery"
                lead={recoveryLead(view.recovery, view.today)}
                lines={[showResults ? 'Your results show as normal for this visit.' : 'Your scores and standards are hidden until you’re back.']}
                action={showResults ? null : { label: 'Show my results', onClick: () => setShowResults(true) }}
              />
            )}
            <section className="ds-mission-card" aria-labelledby="ipp-mission">
              <div className="ds-mission-card-head">
                <h2 id="ipp-mission" className="ds-mission-card-label">My Mission</h2>
                <WhoSees {...who('mission', 'Your mission')} />
              </div>
              {view.mission
                ? <p className="ds-mission-card-text">{view.mission}</p>
                : <p className="ds-mission-card-text ipp-muted">Your mission isn’t written yet.</p>}
              <p className="ds-mission-card-note">This is the big aim that drives your daily performance.</p>
              <p className="ds-mission-card-note">Progress on your mission is measured by your Outcome Objectives.</p>
            </section>

            <AlignmentCheck lines={view.alignment} className="ipp-align" />

            <Section
              title="Outcome Objectives"
              line="Outcome Objectives are the results by which progress on your mission is measured."
              aside={<WhoSees {...who('progress', 'Your Outcome Objective figures and scores')} />}
              className="ipp-section"
            >
              {view.objectives.length ? (
                <ObjectiveGrid>
                  {view.objectives.map((o) => (
                    <ObjectiveCard
                      key={o.id}
                      objective={o}
                      onMarkDone={o.kind === 'milestone' ? (done) => markMilestone(o, done) : undefined}
                    />
                  ))}
                </ObjectiveGrid>
              ) : (
                <p className="ipp-muted">Your plan has no Outcome Objectives yet.</p>
              )}
            </Section>

            <Section
              title="Strategies"
              line="Strategies are medium to long-term approaches to achieving your objectives."
              className="ipp-section"
            >
              {view.strategies.length ? (
                <StrategyTiles>
                  {view.strategies.map((s) => (
                    <StrategyTile
                      key={s.id}
                      strategy={hideScores ? { ...s, score: null } : s}
                      open={openId === s.id}
                      controls={!isPhone && openId === s.id ? 'ipp-strategy-detail' : undefined}
                      onOpen={() => setOpenId((id) => (id === s.id ? null : s.id))}
                      scoreLabel={scoreLabel}
                      scoreNote={hideScores ? null : scoreNote(s)}
                    />
                  ))}
                </StrategyTiles>
              ) : (
                <p className="ipp-muted">Your plan has no Strategies yet.</p>
              )}
              {open && !isPhone && (
                <StrategyDetail
                  id="ipp-strategy-detail"
                  strategy={open}
                  sprintRunning={view.sprintRunning}
                  onClose={() => setOpenId(null)}
                  onEdit={() => editStrategy(open.id)}
                />
              )}
            </Section>

            <div className="ds-actions ipp-actions">
              <Button onClick={() => navigate('/performance-plan/edit')}>Edit my plan</Button>
              <Button onClick={() => navigate('/performance-plan/history')}>See version history</Button>
            </div>
          </>
        )}
      </div>

      <SlidePanel
        open={Boolean(open && isPhone)}
        onClose={() => setOpenId(null)}
        title={<span className="ipp-panel-title">{open?.name || ''}</span>}
        closeLabel="Back to the plan"
        footer={open ? <Button onClick={() => editStrategy(open.id)}>Edit this Strategy</Button> : null}
      >
        {open && (
          <>
            <p className="ipp-panel-serves">{open.servesLine}</p>
            <StrategyDetailBody strategy={open} sprintRunning={view.sprintRunning} headingLevel="h3" />
          </>
        )}
      </SlidePanel>

      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
    </div>
  );
}
