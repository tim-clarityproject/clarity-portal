import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatPlanCounts, formatVersion, loadArchivedMissions, restoreArchivedPlan } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import PageHeading from '../components/PageHeading';
import { BackLink } from '../components/ui/DiscardLink';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

export default function PersonalOperatingPlanArchived() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [missions, setMissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [hasLivePlan, setHasLivePlan] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const { message, showToast } = useToast();

  const load = async () => {
    try {
      const data = await loadArchivedMissions(user.id);
      setMissions(data);
      const { count } = await supabase
        .from('missions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('archived_at', null);
      setHasLivePlan((count || 0) > 0);
    } catch (error) {
      console.error('[PlanArchived] load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restoreArchivedPlan({ userId: user.id, missionId: restoreTarget.id });
      setRestoreTarget(null);
      navigate('/personal-operating-plan', { state: { toast: 'Plan restored.' } });
    } catch (error) {
      console.error('[PlanArchived] restore failed:', error);
      setRestoreTarget(null);
      showToast('Could not restore this plan - please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan')} label="Back to your plan" /></div>

        <PageHeading pageKey="personalOperatingPlanArchived" title="Archived plans" />

        {isLoading ? (
          <p className="ui-subtitle">Loading...</p>
        ) : missions.length === 0 ? (
          <p className="pop-empty">Nothing archived yet. When you archive a plan it will be kept here.</p>
        ) : (
          missions.map((mission) => (
            <div className="pop-version-row" key={mission.id}>
              <span>
                <span className="pop-version-label">{mission.title}</span>
                <span className="pop-version-date" style={{ display: 'block' }}>Archived {new Date(mission.archived_at).toLocaleDateString('en-GB')}</span>
                <span className="pop-version-date" style={{ display: 'block' }}>
                  {mission.latestVersion ? `${formatVersion(mission.latestVersion.major, mission.latestVersion.minor)} · ` : ''}
                  {formatPlanCounts(mission.latestVersion?.snapshot)}
                  {' · '}{mission.reviewCount} review{mission.reviewCount === 1 ? '' : 's'}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button type="button" className="ui-btn-ghost" onClick={() => navigate(`/personal-operating-plan-archived/${mission.id}`)}>
                  View plan
                </button>
                <button type="button" className="ui-btn-ghost" onClick={() => setRestoreTarget(mission)}>
                  Restore
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore this plan?"
        message={hasLivePlan
          ? 'It becomes your current plan. Your current plan moves to Archived plans, with its Versions and reviews.'
          : 'It becomes your current plan again, with its Versions and reviews.'}
        confirmLabel={isRestoring ? 'Restoring...' : 'Restore'}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
      />
      <Toast message={message} />
    </div>
  );
}
