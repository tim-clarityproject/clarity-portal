import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatShortDate } from '../lib/dateFormatter';
import { formatVersion, loadVersions, restorePlanFromVersion } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Loading, PageHeader, Button, useToast } from '../components/design';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

function parseVersionParam(param) {
  const [majorStr, minorStr] = String(param || '').split('.');
  const major = Number(majorStr);
  const minor = minorStr !== undefined ? Number(minorStr) : 0;
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

export default function PersonalOperatingPlanHistoryVersion() {
  const navigate = useNavigate();
  const location = useLocation();
  const { version: versionParam } = useParams();
  const { user } = useContext(AuthContext);
  const stateMissionId = location.state?.missionId || null;

  const [missionId, setMissionId] = useState(stateMissionId);
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const toast = useToast();

  const parsed = parseVersionParam(versionParam);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !parsed) {
        setIsLoading(false);
        return;
      }
      try {
        let resolvedId = stateMissionId;
        if (!resolvedId) {
          const { data } = await supabase
            .from('missions')
            .select('id')
            .eq('user_id', user.id)
            .is('archived_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          resolvedId = data?.id || null;
        }
        if (cancelled) return;
        setMissionId(resolvedId);
        if (resolvedId) {
          const all = await loadVersions(resolvedId);
          if (cancelled) return;
          setVersions(all);
          const found = all.find((v) => v.major === parsed.major && v.minor === parsed.minor);
          setVersion(found || null);
        }
      } catch (error) {
        console.error('[PlanHistoryVersion] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, stateMissionId, versionParam]);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restorePlanFromVersion({ userId: user.id, missionId, version });
      setRestoreOpen(false);
      navigate('/personal-operating-plan', { state: { toast: `${formatVersion(version.major, version.minor)} restored as a new version.` } });
    } catch (error) {
      console.error('[PlanHistoryVersion] restore failed:', error);
      setRestoreOpen(false);
      toast.error('Could not restore this version. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading this version" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan-history', { state: { missionId } })} label="Back to version history" /></div>
          <p className="ui-subtitle">Version not found.</p>
        </div>
      </div>
    );
  }

  const isCurrent = versions.length > 0 && versions[0].id === version.id;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan-history', { state: { missionId } })} label="Back to version history" /></div>

        <div className="plan-summary-head">
          <PageHeader
            title={formatVersion(version.major, version.minor)}
            info={isCurrent ? 'This is your current plan.' : 'This is an older Version. You can read it but not change it.'}
            meta={[formatShortDate(version.created_at), version.change_note]}
          />
        </div>

        <div className="pop-mission-card">
          <span className="ui-section-heading" style={{ marginTop: 0 }}>Your mission</span>
          <p className="pop-mission-text">{version.snapshot.mission?.title}</p>
        </div>

        {(version.snapshot.strategies || []).map((strategy, si) => (
          <div className="pop-view-strategy" key={si}>
            <h3 className="pop-view-strategy-name">{strategy.name}</h3>
            {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
            {(strategy.tactics || []).map((tactic, ti) => (
              <div className="pop-view-tactic" key={ti}>
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
        ))}

        {!isCurrent && (
          <div className="plan-actions">
            <Button type="button" variant="primary" onClick={() => setRestoreOpen(true)}>
              Restore this Version
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={restoreOpen}
        title={`Restore ${formatVersion(version.major, version.minor)}?`}
        message={`Your current plan stays in your history. ${formatVersion(version.major, version.minor)} is copied forward as a new main Version, so nothing is lost.`}
        confirmLabel={isRestoring ? 'Restoring' : 'Restore'}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={handleRestore}
      />
    </div>
  );
}
