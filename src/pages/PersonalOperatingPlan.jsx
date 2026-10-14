import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { archivePlan, countArchivedMissions, formatVersion, loadLatestVersion } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
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
      }

      setArchivedCount(await countArchivedMissions(user.id));
    } catch (error) {
      console.error('[PersonalOperatingPlan] load failed:', error);
    } finally {
      setIsLoading(false);
    }
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
          <div className="plan-header">
            <div className="ui-title">Your personal operating plan</div>
            <p className="ui-subtitle">No plan yet. Define your mission, strategies and tactics.</p>
          </div>
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
        <div className="plan-header">
          <div className="ui-title">Your personal operating plan</div>
          <p className="ui-subtitle">{mission.title}</p>
        </div>

        {strategies.length === 0 ? (
          <p className="pop-empty">No strategies yet.</p>
        ) : (
          strategies.map((strategy) => (
            <div className="pop-view-strategy" key={strategy.id}>
              <h3 className="pop-view-strategy-name">{strategy.name}</h3>
              {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
              {(tactics[strategy.id] || []).length === 0 ? (
                <p className="pop-empty" style={{ padding: 0 }}>No tactics yet.</p>
              ) : (
                (tactics[strategy.id] || []).map((tactic) => <TacticRow tactic={tactic} key={tactic.id} />)
              )}
            </div>
          ))
        )}

        <div className="plan-actions">
          <button type="button" className="ui-btn-primary" onClick={() => navigate('/personal-operating-plan-review', { state: { missionId: mission.id } })}>
            Review plan
          </button>
          <button type="button" className="ui-btn-ghost" onClick={() => navigate('/personal-operating-plan-edit', { state: { missionId: mission.id } })}>
            Edit plan
          </button>
        </div>

        <div className="pop-links-row">
          <button type="button" className="plan-link-btn" onClick={() => navigate('/personal-operating-plan-history', { state: { missionId: mission.id } })}>
            Version history{version ? ` · ${formatVersion(version.major, version.minor)}` : ''}
          </button>
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
        message="It moves to Archived plans, where you can open it or restore it any time. Its versions and reviews are kept."
        confirmLabel={isArchiving ? 'Archiving...' : 'Archive'}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />
      <Toast message={message} />
    </div>
  );
}
