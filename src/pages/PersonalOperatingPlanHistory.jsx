import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateAndTime } from '../lib/dateFormatter';
import { formatVersion, loadVersions } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';

export default function PersonalOperatingPlanHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const stateMissionId = location.state?.missionId || null;

  const [missionId, setMissionId] = useState(stateMissionId);
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
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
          const data = await loadVersions(resolvedId);
          if (!cancelled) setVersions(data);
        }
      } catch (error) {
        console.error('[PlanHistory] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, stateMissionId]);

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
        ) : !missionId ? (
          <p className="pop-empty">You do not have a personal operating plan yet.</p>
        ) : versions.length === 0 ? (
          <p className="pop-empty">No versions saved yet.</p>
        ) : (
          versions.map((version, index) => (
            <div className="pop-version-row" key={version.id}>
              <button
                type="button"
                className="plan-link-btn"
                onClick={() => navigate(`/personal-operating-plan-history/${version.major}.${version.minor}`, { state: { missionId } })}
              >
                <span>
                  <span className="pop-version-label">{formatVersion(version.major, version.minor)}</span>
                  {index === 0 && <span className="pop-version-current">Current</span>}
                  <span className="pop-version-date" style={{ display: 'block' }}>{version.change_note} · {formatDateAndTime(version.created_at)}</span>
                </span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
