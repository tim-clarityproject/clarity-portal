import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import { archivePlan, countArchivedMissions, formatVersion, loadLatestVersion } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import PageHeading from '../components/PageHeading';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

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
        <div className="pop-view-tactic-progress">{tactic.current_value ?? 0} / {tactic.target_value ?? '—'} {tactic.unit || ''}</div>
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

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tactics, setTactics] = useState({});
  const [version, setVersion] = useState(null);
  const [archivedCount, setArchivedCount] = useState(0);
  const [lastReviewedAt, setLastReviewedAt] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (user) loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPlan = async () => {
    try {
      const { data: missionData } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (missionData) {
        setMission(missionData);

        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionData.id)
          .order('sort_order', { ascending: true });

        if (strategiesData) {
          setStrategies(strategiesData);
          const tacticsByStrategy = {};
          for (const strategy of strategiesData) {
            const { data: tacticsData } = await supabase
              .from('tactics')
              .select('*')
              .eq('strategy_id', strategy.id)
              .order('sort_order', { ascending: true });
            tacticsByStrategy[strategy.id] = tacticsData || [];
          }
          setTactics(tacticsByStrategy);
        }

        try {
          const latest = await loadLatestVersion(missionData.id);
          setVersion(latest);
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
            .single();
          if (lastReview) setLastReviewedAt(lastReview.created_at);
        } catch (error) {
          console.error('[PersonalOperatingPlan] last-reviewed lookup failed:', error);
        }
      }

      setArchivedCount(await countArchivedMissions(user.id));
    } catch (error) {
      console.error('[PersonalOperatingPlan] load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      setMission(null);
      setStrategies([]);
      setTactics({});
      setVersion(null);
      setArchivedCount(await countArchivedMissions(user.id));
      showToast('Plan archived. Find it in Archived plans.');
    } catch (error) {
      console.error('[PersonalOperatingPlan] archive failed:', error);
      setArchiveOpen(false);
      showToast('Could not archive this plan - please try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <PageHeading pageKey="personalOperatingPlan" title="Personal operating plan" />
          <p className="pop-empty">
            You don't have a plan yet. Start with your mission, add the strategies that bring it to life, then the tactics you will do every day.
          </p>
          <div className="plan-actions">
            <button type="button" className="ui-btn-primary" onClick={() => navigate('/personal-operating-plan-edit', { state: { isNew: true } })}>
              Create your plan
            </button>
          </div>
          {archivedCount > 0 && (
            <div className="pop-links-row">
              <button type="button" className="plan-link-btn" onClick={() => navigate('/personal-operating-plan-archived')}>
                Archived plans · {archivedCount}
              </button>
            </div>
          )}
        </div>
        <Toast message={message} />
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <PageHeading pageKey="personalOperatingPlan" title="Personal operating plan" />

        <div className="plan-actions">
          <button type="button" className="ui-btn-primary" onClick={() => navigate('/personal-operating-plan-review', { state: { missionId: mission.id } })}>
            Review plan
          </button>
          <button type="button" className="ui-btn-ghost" onClick={() => navigate('/personal-operating-plan-edit', { state: { missionId: mission.id } })}>
            Edit plan
          </button>
          {version && (
            <button type="button" className="plan-link-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/personal-operating-plan-history', { state: { missionId: mission.id } })}>
              <ClockIcon />
              <span style={{ marginLeft: 'var(--space-2)' }}>Version history · {formatVersion(version.major, version.minor)}</span>
            </button>
          )}
        </div>

        <div className="pop-mission-card">
          <span className="ui-section-heading" style={{ marginTop: 0 }}>Your mission</span>
          <p className="pop-mission-text">{mission.title}</p>
        </div>

        {strategies.length === 0 ? (
          <p className="pop-empty">No strategies yet.</p>
        ) : (
          strategies.map((strategy, index) => {
            const isOpen = !collapsed[strategy.id];
            return (
              <div className="pop-view-strategy" key={strategy.id}>
                <button type="button" className="pop-strategy-header" aria-expanded={isOpen} onClick={() => toggleStrategy(strategy.id)}>
                  <span className="pop-strategy-number">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="pop-view-strategy-name">{strategy.name}</h3>
                  <span className={`ui-cross ui-cross--sm ui-cross--open${isOpen ? ' open' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <>
                    {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
                    {(tactics[strategy.id] || []).length === 0 ? (
                      <p className="pop-empty" style={{ padding: 0 }}>No tactics yet.</p>
                    ) : (
                      (tactics[strategy.id] || []).map((tactic) => <TacticRow tactic={tactic} key={tactic.id} />)
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        {lastReviewedAt && <p className="pop-last-reviewed">Last reviewed {formatUkDate(lastReviewedAt)}</p>}

        <div className="pop-links-row">
          {archivedCount > 0 && (
            <button type="button" className="plan-link-btn" onClick={() => navigate('/personal-operating-plan-archived')}>
              Archived plans · {archivedCount}
            </button>
          )}
          <button type="button" className="plan-link-btn" onClick={() => setArchiveOpen(true)}>
            Archive this plan
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        title="Archive this plan?"
        message="It moves to Archived plans, where you can open it or restore it any time. Its Versions and reviews are kept. You can start a new plan straight away."
        confirmLabel={isArchiving ? 'Archiving...' : 'Archive'}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />
      <Toast message={message} />
    </div>
  );
}
