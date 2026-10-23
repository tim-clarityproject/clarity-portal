import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatShortDate } from '../lib/dateFormatter';
import { CHANGE_KIND_LABEL, formatPlanCounts, formatVersion, loadReviewedVersionDates, loadVersions } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import { BackLink } from '../components/ui/DiscardLink';
import { Loading, PageHeader } from '../components/design';

export default function PersonalOperatingPlanHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const stateMissionId = location.state?.missionId || null;

  const [missionId, setMissionId] = useState(stateMissionId);
  const [versions, setVersions] = useState([]);
  const [reviewedDates, setReviewedDates] = useState({});
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
          try {
            const dates = await loadReviewedVersionDates(resolvedId);
            if (!cancelled) setReviewedDates(dates);
          } catch (error) {
            console.error('[PlanHistory] reviewed-dates lookup failed:', error);
          }
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

        <PageHeader title="Version history" info={pageText.personalOperatingPlanHistory} />

        {isLoading ? (
          <Loading label="Loading your version history" className="ds-loading--page" />
        ) : !missionId ? (
          <p className="pop-empty">You do not have a personal operating plan yet.</p>
        ) : versions.length === 0 ? (
          <p className="pop-empty">No Versions yet. Your first one is created when you save your plan.</p>
        ) : (
          versions.map((version, index) => {
            const reviewedAt = reviewedDates[version.id];
            const isCurrent = index === 0;
            return (
              <div className="pop-version-row" key={version.id}>
                <span>
                  <span className="pop-version-label">{formatVersion(version.major, version.minor)}</span>
                  {isCurrent && <span className="pop-version-current">Current</span>}
                  <span className="pop-version-date" style={{ display: 'block' }}>{version.change_note}</span>
                  <span className="pop-version-date" style={{ display: 'block' }}>
                    {CHANGE_KIND_LABEL[version.change_type] || 'Start'} · {formatPlanCounts(version.snapshot)}
                    {reviewedAt ? ` · Reviewed ${formatShortDate(reviewedAt)}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="ui-btn-ghost"
                  onClick={() => navigate(`/personal-operating-plan-history/${version.major}.${version.minor}`, { state: { missionId } })}
                >
                  {isCurrent ? 'View' : 'View Version'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
