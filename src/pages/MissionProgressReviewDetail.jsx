import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatShortDate } from '../lib/dateFormatter';
import { formatVersion, deleteReview } from '../lib/missionPlan';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import PageHeading from '../components/PageHeading';
import { Loading } from '../components/design';

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

export default function MissionProgressReviewDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const reviewId = location.state?.reviewId;

  const [review, setReview] = useState(null);
  const [version, setVersion] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { message, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reviewId || !user) {
        setIsLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('mission_progress_reviews')
          .select('*')
          .eq('id', reviewId)
          .eq('user_id', user.id)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setReview(data);

        if (data.plan_version_id) {
          const { data: versionRow } = await supabase
            .from('mission_versions')
            .select('*')
            .eq('id', data.plan_version_id)
            .single();
          if (!cancelled && versionRow) setVersion(versionRow);
        }
      } catch (error) {
        console.error('[MissionProgressReviewDetail] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: { reviewId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    try {
      await deleteReview(user.id, review.id);
      setDeleteOpen(false);
      navigate('/my-reviews', { state: { toast: 'Review deleted.' } });
    } catch (error) {
      console.error('[MissionProgressReviewDetail] delete failed:', error);
      setDeleteOpen(false);
      showToast('Could not delete this review - please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your review" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!review || !review.review_data) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/my-reviews')} label="Back to my reviews" /></div>
          <p className="ui-subtitle">Review not found.</p>
        </div>
      </div>
    );
  }

  const data = review.review_data;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-reviews')} label="Back to my reviews" /></div>

        <div className="plan-summary-head">
          {/* "POP review" (Personal Operating Plan review), Tim's
              explicit wording (patch 2d) overriding my-reviews.html's
              own "Plan review" - matches My Reviews' filter/row label
              for this same review type. */}
          <PageHeading pageKey="missionProgressReviewDetail" title={`POP review, ${formatShortDate(review.created_at)}`} overline="POP review" subtitle="" rule={false} />
        </div>

        {version && (
          <div className="pop-links-row">
            <button type="button" className="plan-link-btn" onClick={() => navigate(`/personal-operating-plan-history/${version.major}.${version.minor}`, { state: { missionId: review.mission_id } })}>
              Version reviewed: {formatVersion(version.major, version.minor)}
            </button>
          </div>
        )}

        {(data.strategies || []).map((strategy, si) => (
          <div className="pop-view-strategy" key={strategy.id || si}>
            <h3 className="pop-view-strategy-name">{strategy.name}</h3>
            {strategy.description && <p className="pop-view-strategy-desc">{strategy.description}</p>}
            {(strategy.tactics || []).map((tactic, ti) => (
              <div className="pop-view-tactic" key={tactic.id || ti}>
                {tactic.type === 'tickable' && (
                  <span className={`pop-tick${tactic.reviewed_is_done ? ' pop-tick--done' : ''}`} aria-hidden="true"><CheckIcon /></span>
                )}
                <div>
                  <div className="pop-view-tactic-text">{tactic.action}</div>
                  {tactic.type === 'measurable' && (
                    <div className="pop-view-tactic-progress">{tactic.reviewed_value ?? 0} / {tactic.target_value ?? '—'} {tactic.unit || ''}</div>
                  )}
                  {tactic.reviewed_note && <p className="pop-view-strategy-desc" style={{ marginTop: 'var(--space-2)' }}>{tactic.reviewed_note}</p>}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="plan-actions">
          <button type="button" className="ui-btn-ghost" onClick={() => navigate('/personal-operating-plan-review', { state: { missionId: review.mission_id, reviewId: review.id } })}>
            Edit review
          </button>
        </div>

        <div className="plan-discard-row" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="ui-btn-ghost ui-btn-ghost--danger" onClick={() => setDeleteOpen(true)}>
            Delete review
          </button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        title="Delete this review?"
        body="It will be deleted for good and removed from My Reviews. Your plan and its Versions are not affected."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <Toast message={message} />
    </div>
  );
}
