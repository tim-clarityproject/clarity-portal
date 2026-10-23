import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { loadLatestVersion, restoreArchivedPlan } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Loading, PageHeader, Button, EmptyState, useToast } from '../components/design';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

export default function PersonalOperatingPlanArchivedOne() {
  const navigate = useNavigate();
  const { missionId } = useParams();
  const { user } = useContext(AuthContext);

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tactics, setTactics] = useState({});
  const [version, setVersion] = useState(null);
  const [hasLivePlan, setHasLivePlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !missionId) return;
      try {
        const { data: missionRow } = await supabase
          .from('missions')
          .select('*')
          .eq('id', missionId)
          .eq('user_id', user.id)
          .not('archived_at', 'is', null)
          .single();
        if (cancelled) return;
        if (!missionRow) {
          setIsLoading(false);
          return;
        }
        setMission(missionRow);

        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionId)
          .order('sort_order', { ascending: true });
        const withTactics = {};
        for (const strategy of strategiesData || []) {
          const { data: tacticsData } = await supabase
            .from('tactics')
            .select('*')
            .eq('strategy_id', strategy.id)
            .order('sort_order', { ascending: true });
          withTactics[strategy.id] = tacticsData || [];
        }
        if (cancelled) return;
        setStrategies(strategiesData || []);
        setTactics(withTactics);

        try {
          const latest = await loadLatestVersion(missionId);
          if (!cancelled) setVersion(latest);
        } catch (error) {
          console.error('[PlanArchivedOne] version lookup failed:', error);
        }

        const { count } = await supabase
          .from('missions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('archived_at', null);
        if (!cancelled) setHasLivePlan((count || 0) > 0);
      } catch (error) {
        console.error('[PlanArchivedOne] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, user?.id]);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restoreArchivedPlan({ userId: user.id, missionId });
      setRestoreOpen(false);
      navigate('/personal-operating-plan', { state: { toast: 'Plan restored.' } });
    } catch (error) {
      console.error('[PlanArchivedOne] restore failed:', error);
      setRestoreOpen(false);
      toast.error('That plan didn’t restore. Check your connection and try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your archived plan" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan-archived')} label="Back to archived plans" /></div>
          <p className="ui-subtitle">Plan not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan-archived')} label="Back to archived plans" /></div>

        <div className="plan-summary-head">
          <PageHeader
            title={mission.title}
            info="You can read this plan but not change it."
            meta={[
              `Archived ${new Date(mission.archived_at).toLocaleDateString('en-GB')}`,
              version ? `Last Version ${version.major}.${version.minor}` : null,
            ]}
          />
        </div>

        {strategies.length === 0 ? (
          <EmptyState question="No strategies." />
        ) : (
          strategies.map((strategy) => (
            <div className="pop-view-strategy" key={strategy.id}>
              <h3 className="pop-view-strategy-name">{strategy.name}</h3>
              {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
              {(tactics[strategy.id] || []).map((tactic) => (
                <div className="pop-view-tactic" key={tactic.id}>
                  {tactic.type === 'tickable' && (
                    <span className={`pop-tick${tactic.is_done ? ' pop-tick--done' : ''}`} aria-hidden="true"><CheckIcon /></span>
                  )}
                  <div>
                    <div className="pop-view-tactic-text">{tactic.action}</div>
                    {tactic.type === 'measurable' && (
                      <div className="pop-view-tactic-progress">{tactic.current_value ?? 0} / {tactic.target_value ?? 'No target'} {tactic.unit || ''}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}

        <div className="plan-actions">
          <Button type="button" variant="primary" onClick={() => setRestoreOpen(true)}>
            Restore this plan
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={restoreOpen}
        title="Restore this plan?"
        message={hasLivePlan
          ? 'It becomes your current plan. Your current plan moves to Archived plans, with its Versions and reviews.'
          : 'It becomes your current plan again, with its Versions and reviews.'}
        confirmLabel={isRestoring ? 'Restoring' : 'Restore'}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={handleRestore}
      />
    </div>
  );
}
