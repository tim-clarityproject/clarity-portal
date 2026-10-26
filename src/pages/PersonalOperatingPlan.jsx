import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import { archivePlan, countArchivedMissions, formatVersion, loadLatestVersion } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { DisclosureArrow, ErrorMessage, Loading, PageHeader, Button, EmptyState, useToast } from '../components/design';
import { useCachedLoad } from '../lib/pageCache';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.3 1.5" />
    </svg>
  );
}

function TacticRow({ tactic }) {
  if (tactic.type === 'tickable') {
    return (
      <div className="pop-view-tactic">
        <span className={`pop-tick${tactic.is_done ? ' pop-tick--done' : ''}`} aria-hidden="true"><CheckIcon /></span>
        <div>
          <div className="pop-view-tactic-text">{tactic.action}</div>
          {tactic.last_reviewed_at && (
            <div className="pop-view-tactic-reviewed">Last reviewed {new Date(tactic.last_reviewed_at).toLocaleDateString('en-GB')}</div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="pop-view-tactic">
      <div>
        <div className="pop-view-tactic-text">{tactic.action}</div>
        <div className="pop-view-tactic-progress">{tactic.current_value ?? 0} / {tactic.target_value ?? 'No target'} {tactic.unit || ''}</div>
        {tactic.last_reviewed_at && (
          <div className="pop-view-tactic-reviewed">Last reviewed {new Date(tactic.last_reviewed_at).toLocaleDateString('en-GB')}</div>
        )}
      </div>
    </div>
  );
}

export default function PersonalOperatingPlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  const [collapsed, setCollapsed] = useState({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Instant page (Tim, 26 Oct): the plan shown last time appears at once
  // from the device, then refreshes quietly in the background. A plan
  // that didn't load says so, rather than looking like no plan at all.
  const loaded = useCachedLoad({
    userId: user?.id,
    name: 'personal-operating-plan',
    load: async () => {
      const plan = { mission: null, strategies: [], tactics: {}, version: null, lastReviewedAt: null, archivedCount: 0 };
      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (missionError) throw missionError;

      if (missionData) {
        plan.mission = missionData;

        const { data: strategiesData, error: strategiesError } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionData.id)
          .order('sort_order', { ascending: true });
        if (strategiesError) throw strategiesError;

        plan.strategies = strategiesData || [];
        for (const strategy of plan.strategies) {
          const { data: tacticsData, error: tacticsError } = await supabase
            .from('tactics')
            .select('*')
            .eq('strategy_id', strategy.id)
            .order('sort_order', { ascending: true });
          if (tacticsError) throw tacticsError;
          plan.tactics[strategy.id] = tacticsData || [];
        }

        try {
          plan.version = await loadLatestVersion(missionData.id);
        } catch (error) {
          console.error('[PersonalOperatingPlan] version lookup failed:', error);
        }

        try {
          const { data: lastReview } = await supabase
            .from('mission_progress_reviews')
            .select('created_at')
            .eq('mission_id', missionData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastReview) plan.lastReviewedAt = lastReview.created_at;
        } catch (error) {
          console.error('[PersonalOperatingPlan] last-reviewed lookup failed:', error);
        }
      }

      plan.archivedCount = await countArchivedMissions(user.id);
      return plan;
    },
  });
  const isLoading = loaded.loading;
  const { mission = null, strategies = [], tactics = {}, version = null, lastReviewedAt = null, archivedCount = 0 } = loaded.data || {};

  const toggleStrategy = (strategyId) => {
    setCollapsed((prev) => ({ ...prev, [strategyId]: !prev[strategyId] }));
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      await archivePlan({ userId: user.id, missionId: mission.id });
      setArchiveOpen(false);
      // Already on /personal-operating-plan - reload in place (the
      // same empty-state branch below renders once mission is cleared)
      // rather than navigating to the same path, which React Router
      // would not remount.
      const count = await countArchivedMissions(user.id);
      loaded.setData((prev) => ({ ...prev, mission: null, strategies: [], tactics: {}, version: null, archivedCount: count }));
      toast.show('Plan archived. Find it in Archived plans.');
    } catch (error) {
      console.error('[PersonalOperatingPlan] archive failed:', error);
      setArchiveOpen(false);
      toast.error('That plan didn’t archive. Check your connection and try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your plan" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (loaded.error) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <PageHeader title="Personal operating plan" info={pageText.personalOperatingPlan} />
          <ErrorMessage keepsHappening>Your plan didn’t load. Check your connection and try again.</ErrorMessage>
          <div className="pop-links-row">
            <Button type="button" variant="outline" onClick={loaded.reload}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <PageHeader title="Personal operating plan" info={pageText.personalOperatingPlan} />
          <EmptyState
            question="You don't have a plan yet. Start with your mission, add the strategies that bring it to life, then the tactics you will do every day."
            action={{ label: 'Create your plan', onClick: () => navigate('/personal-operating-plan-edit', { state: { isNew: true } }) }}
          />
          {archivedCount > 0 && (
            <div className="pop-links-row">
              <Button type="button" variant="text" onClick={() => navigate('/personal-operating-plan-archived')}>
                Archived plans · {archivedCount}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .pop-view-tactic-reviewed { font-size: var(--fs-meta); }
      `}</style>
      <DesignHeader />

      <div className="plan-page">
        <PageHeader
          title="Personal operating plan"
          info={pageText.personalOperatingPlan}
          meta={[
            version ? formatVersion(version.major, version.minor) : null,
            lastReviewedAt ? `Last reviewed ${formatUkDate(lastReviewedAt)}` : null,
          ]}
        />

        <div className="plan-actions">
          <Button type="button" variant="primary" onClick={() => navigate('/personal-operating-plan-review', { state: { missionId: mission.id } })}>
            Review plan
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/personal-operating-plan-edit', { state: { missionId: mission.id } })}>
            Edit plan
          </Button>
          {version && (
            <Button type="button" variant="text" style={{ marginLeft: 'auto' }} onClick={() => navigate('/personal-operating-plan-history', { state: { missionId: mission.id } })}>
              <ClockIcon />
              <span style={{ marginLeft: 'var(--space-2)' }}>Version history</span>
            </Button>
          )}
        </div>

        <div className="pop-mission-card">
          <span className="ui-section-heading" style={{ marginTop: 0 }}>Your mission</span>
          <p className="pop-mission-text">{mission.title}</p>
        </div>

        {strategies.length === 0 ? (
          <EmptyState question="No strategies yet." />
        ) : (
          strategies.map((strategy, index) => {
            const isOpen = !collapsed[strategy.id];
            return (
              <div className="pop-view-strategy" key={strategy.id}>
                <button type="button" className="pop-strategy-header" aria-expanded={isOpen} onClick={() => toggleStrategy(strategy.id)}>
                  <span className="pop-strategy-number">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="pop-view-strategy-name">{strategy.name}</h3>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><DisclosureArrow open={isOpen} /></span>
                </button>
                {isOpen && (
                  <>
                    {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
                    {(tactics[strategy.id] || []).length === 0 ? (
                      <EmptyState question="No tactics yet." as="p" />
                    ) : (
                      (tactics[strategy.id] || []).map((tactic) => <TacticRow tactic={tactic} key={tactic.id} />)
                    )}
                  </>
                )}
              </div>
            );
          })
        )}


        <div className="pop-links-row">
          {archivedCount > 0 && (
            <Button type="button" variant="text" onClick={() => navigate('/personal-operating-plan-archived')}>
              Archived plans · {archivedCount}
            </Button>
          )}
          <Button type="button" variant="text" onClick={() => setArchiveOpen(true)}>
            Archive this plan
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title="Archive this plan?"
        message="It moves to Archived plans, where you can open it or restore it any time. Its Versions and reviews are kept. You can start a new plan straight away."
        confirmLabel={isArchiving ? 'Archiving' : 'Archive'}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />
    </div>
  );
}
