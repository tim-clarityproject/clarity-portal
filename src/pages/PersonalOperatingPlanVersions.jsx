import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { formatDateAndTime } from '../lib/dateFormatter';
import { formatVersion, loadVersions, restorePlanFromVersion } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

export default function PersonalOperatingPlanVersions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const missionId = location.state?.missionId || null;

  const [versions, setVersions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const { message, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!missionId || !user) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await loadVersions(missionId);
        if (!cancelled) setVersions(data);
      } catch (error) {
        console.error('[PlanVersions] load failed:', error);
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
      await restorePlanFromVersion({ userId: user.id, missionId, snapshot: restoreTarget.snapshot });
      setRestoreTarget(null);
      navigate('/personal-operating-plan', { state: { toast: `Restored ${formatVersion(restoreTarget.version_major, restoreTarget.version_minor)}.` } });
    } catch (error) {
      console.error('[PlanVersions] restore failed:', error);
      setRestoreTarget(null);
      showToast('Could not restore this version - please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!missionId) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan')} label="Back to your plan" /></div>
          <p className="ui-subtitle">Open this from your personal operating plan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/personal-operating-plan')} label="Back to your plan" /></div>

        <div className="plan-summary-head">
          <span className="plan-overline">Plan</span>
          <div className="ui-title">Version history</div>
        </div>

        {isLoading ? (
          <p className="ui-subtitle">Loading...</p>
        ) : versions.length === 0 ? (
          <p className="pop-empty">No versions saved yet.</p>
        ) : (
          versions.map((version, index) => (
            <div key={version.id}>
              <div className="pop-version-row">
                <button type="button" className="plan-link-btn" onClick={() => setExpandedId(expandedId === version.id ? null : version.id)}>
                  <span>
                    <span className="pop-version-label">{formatVersion(version.version_major, version.version_minor)}</span>
                    {index === 0 && <span className="pop-version-current">Current</span>}
                    <span className="pop-version-date" style={{ display: 'block' }}>{formatDateAndTime(version.created_at)}</span>
                  </span>
                </button>
                {index !== 0 && (
                  <button type="button" className="ui-btn-ghost" onClick={() => setRestoreTarget(version)}>
                    Restore
                  </button>
                )}
              </div>

              {expandedId === version.id && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
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
                              <div className="pop-view-tactic-progress">Target: {tactic.target_value ?? '—'} {tactic.unit || ''}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title={restoreTarget ? `Restore ${formatVersion(restoreTarget.version_major, restoreTarget.version_minor)}?` : ''}
        message="Your current strategies and tactics will be replaced with this version's content. This itself becomes a new version, so nothing is lost."
        confirmLabel={isRestoring ? 'Restoring...' : 'Restore'}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
      />
      <Toast message={message} />
    </div>
  );
}
