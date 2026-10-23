import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatPlanCounts, formatVersion, loadArchivedMissions, restoreArchivedPlan } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import { BackLink } from '../components/ui/DiscardLink';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Loading, PageHeader, Button, EmptyState, useToast } from '../components/design';

export default function PersonalOperatingPlanArchived() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [missions, setMissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [hasLivePlan, setHasLivePlan] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const toast = useToast();

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
      toast.error('Could not restore this plan. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .pop-version-label {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          font-size: var(--fs-label-row);
        }
      `}</style>
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan')} label="Back to your plan" /></div>

        <PageHeader title="Archived plans" info={pageText.personalOperatingPlanArchived} />

        {isLoading ? (
          <Loading label="Loading your archived plans" className="ds-loading--page" />
        ) : missions.length === 0 ? (
          <EmptyState question="Nothing archived yet. When you archive a plan it will be kept here." />
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
                <Button type="button" variant="outline" onClick={() => navigate(`/personal-operating-plan-archived/${mission.id}`)}>
                  View plan
                </Button>
                <Button type="button" variant="outline" onClick={() => setRestoreTarget(mission)}>
                  Restore
                </Button>
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
        confirmLabel={isRestoring ? 'Restoring' : 'Restore'}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
      />
    </div>
  );
}
