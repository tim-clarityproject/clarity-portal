import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  AlignmentCheck,
  Button,
  EmptyState,
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
  LoadError,
  keepWords,
  titleWithAside,
} from '../../components/design';
import { usePlanPage } from '../../lib/performance/hooks';
import { loadPlanEditor, saveMilestoneReached, saveSharing } from '../../lib/performance/api';
import { readCache, writeCache } from '../../lib/pageCache';
import { isNetworkError } from '../../lib/connection';
import { notifyPlanChanged } from '../../lib/performance/planChanged';
import PlanPartPanel, { partSavedMessage } from './PlanPartPanel';
import { recoveryLead } from '../../lib/performance';
import { friendlyError } from '../../lib/friendlyError';
import pageText from '../../content/pageText';
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
const EDITOR_CACHE = 'performance-plan-editor';

export default function PerformancePlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isPhone = useIsPhone();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  // "Show my results" in Recovery: this visit only, never stored (M15).
  const [showResults, setShowResults] = useState(false);
  const { view, loading, error, setData, reload } = usePlanPage(userId, { showResults });
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

  // Change one part on its own (Tim, 3 Nov; PlanPartPanel). The editor's
  // rows are read when the page opens and again after each change, so a
  // panel always starts from the plan as saved (offline: the device's copy,
  // as Edit my plan).
  const [part, setPart] = useState(null);
  const [editorData, setEditorData] = useState(null);
  // Where the last panel got to (its saves and version). The next panel
  // starts from it until the database has caught up, so offline a second
  // change never starts from the older copy (break-it tester, 3 Nov).
  const [carry, setCarry] = useState(null);
  const carryRef = useRef(null);
  carryRef.current = carry;
  const editorLoad = useRef(null);
  const readEditor = useCallback(() => {
    if (!userId) return null;
    editorLoad.current = loadPlanEditor(userId).then((d) => {
      writeCache(userId, EDITOR_CACHE, d);
      const c = carryRef.current;
      const caughtUp = c && d.plan && (d.plan.major > c.version.major || (d.plan.major === c.version.major && d.plan.minor >= c.version.minor));
      if (caughtUp) setCarry(null);
      return d;
    }).catch((e) => {
      const cached = isNetworkError(e) ? readCache(userId, EDITOR_CACHE) : null;
      if (cached) return cached.v;
      throw e;
    });
    return editorLoad.current;
  }, [userId]);
  useEffect(() => { readEditor()?.catch(() => {}); }, [readEditor]);
  const openPart = async (next) => {
    try {
      const d = await (editorLoad.current || readEditor());
      if (!d?.plan) return;
      setEditorData(d);
      setPart(next);
    } catch (e) {
      toast.error(friendlyError(e, 'Your plan didn’t open. Check your connection and try again.'));
    }
  };
  // My Account's Mission "Edit" opens the plan's own Edit my mission (one
  // Mission, Tim, 5 Nov).
  const askedPart = location.state?.openPart;
  useEffect(() => {
    if (askedPart !== 'mission' || !view) return;
    navigate(location.pathname, { replace: true, state: {} });
    openPart({ kind: 'mission', id: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedPart, Boolean(view)]);
  const partDone = (v, how, position) => {
    setPart(null);
    if (how !== 'unchanged' && position) setCarry(position);
    const message = partSavedMessage(v, how);
    if (!message) return;
    toast.show(message);
    readEditor()?.catch(() => {});
    reload();
    notifyPlanChanged();
  };

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
    // A Strategy with no score yet this week says nothing (5e rule 6).
    return null;
  };
  // The dashboard's "Review its Strategies" lands on the Strategies (#strategies).
  const strategiesShown = Boolean(view);
  useEffect(() => {
    if (location.hash !== '#strategies' || !strategiesShown) return undefined;
    const frame = requestAnimationFrame(() => document.getElementById('strategies')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [location.hash, strategiesShown]);

  const hideScores = view?.inRecovery && !showResults;
  const scoreLabel = view?.pausedWeek ? `Performance score in week ${view.pausedWeek}, before your recovery` : SCORE_LABEL;

  // No version or "Changed" line under the title (Tim, 10 Nov): the version
  // history is one tap away, at the foot of the page.
  const meta = [];

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
            <LoadError>Your plan didn’t load. Check your connection and try again.</LoadError>
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
                {/* The eye beside the title it belongs to (5e rules 10 and 29d). */}
                <h2 id="ipp-mission" className="ds-mission-card-label">{titleWithAside('My Mission', <WhoSees {...who('mission', 'Your Mission')} />)}</h2>
              </div>
              {view.mission
                ? <p className="ds-mission-card-text">{keepWords(view.mission)}</p>
                : <p className="ds-mission-card-text ipp-muted">Your Mission isn’t written yet.</p>}
              <Button variant="text" className="ds-part-edit" onClick={() => openPart({ kind: 'mission', id: null })}>Edit my Mission</Button>
            </section>

            <AlignmentCheck lines={view.alignment} className="ipp-align" />

            <Section
              title="Outcome Objectives"
              eye={<WhoSees {...who('progress', 'Your Outcome Objective figures and scores')} />}
              className="ipp-section"
            >
              {view.objectives.length ? (
                <ObjectiveGrid>
                  {view.objectives.map((o) => (
                    <ObjectiveCard
                      key={o.id}
                      objective={o}
                      onMarkDone={o.kind === 'milestone' ? (done) => markMilestone(o, done) : undefined}
                      onEdit={() => openPart({ kind: 'objective', id: o.id })}
                    />
                  ))}
                </ObjectiveGrid>
              ) : (
                <EmptyState question="Set your first Outcome Objective." action={{ label: 'Set my first objective', onClick: () => navigate('/performance-plan/build') }} />
              )}
            </Section>

            {/* Only the first missing step shows; the rest wait (Tim, 5 Nov, 11:06). */}
            {view.objectives.length > 0 && (
            <Section
              id="strategies"
              title="Strategies"
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
                <EmptyState question="Set your first Strategy." action={{ label: 'Set my first Strategy', onClick: () => navigate('/performance-plan/build') }} />
              )}
              {open && !isPhone && (
                <StrategyDetail
                  id="ipp-strategy-detail"
                  strategy={open}
                  sprintRunning={view.sprintRunning}
                  onClose={() => setOpenId(null)}
                  onEdit={() => openPart({ kind: 'strategy', id: open.id })}
                  onEditHabit={(h) => openPart({ kind: 'habit', id: h.id })}
                />
              )}
            </Section>
            )}

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
      >
        {open && (
          <>
            <p className="ipp-panel-serves">{open.servesLine}</p>
            <StrategyDetailBody
              strategy={open}
              sprintRunning={view.sprintRunning}
              headingLevel="h3"
              onEditHabit={(h) => openPart({ kind: 'habit', id: h.id })}
            />
            <Button variant="text" className="ds-part-edit ds-sdetail-edit" onClick={() => openPart({ kind: 'strategy', id: open.id })}>
              Edit this Strategy
            </Button>
          </>
        )}
      </SlidePanel>

      <PlanPartPanel userId={userId} part={part} data={editorData} start={carry} onDone={partDone} />

      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
    </div>
  );
}
