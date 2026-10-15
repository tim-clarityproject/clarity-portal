import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import { questionsFor, RATINGS, deleteReview } from '../lib/reviewTool';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import PageHeading from '../components/PageHeading';

const TAG = {
  'after-action': 'After-Action Review',
  'weekly-momentum': 'Weekly Momentum Check-in',
  progress: 'Progress Review',
};

function RatingDots({ value }) {
  return (
    <span className="rate-dots">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`rate-dot${value >= n ? ' rate-dot--on' : ''}`} aria-hidden="true" />
      ))}
      <span className="rate-dots-score">{value || 0} / 5</span>
    </span>
  );
}

export default function ReviewSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { message, showToast } = useToast();

  const entryId = location.state?.entryId;
  const legacyReviewType = location.state?.reviewType;
  const legacySelectedDate = location.state?.selectedDate;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        let data = null;
        if (entryId) {
          const { data: row, error } = await supabase
            .from('journal_entries')
            .select('*')
            .eq('id', entryId)
            .eq('user_id', user.id)
            .single();
          if (error) throw error;
          data = row;
        } else if (legacySelectedDate) {
          const { data: rows, error } = await supabase
            .from('journal_entries')
            .select('*')
            .eq('user_id', user.id)
            .eq('entry_date', legacySelectedDate)
            .eq('review_type', legacyReviewType || 'after-action')
            .order('created_at', { ascending: false })
            .limit(1);
          if (error) throw error;
          data = rows?.[0] || null;
        }
        if (!cancelled) setReview(data);
      } catch (error) {
        console.error('[ReviewSummary] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, legacySelectedDate, legacyReviewType, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: { entryId: review?.id || entryId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    try {
      await deleteReview(user.id, review.id);
      navigate('/my-reviews', { state: { toast: 'Deleted. It is gone from My Reviews.' } });
    } catch (error) {
      console.error('[ReviewSummary] delete failed:', error);
      setDeleteOpen(false);
      showToast('Could not delete - please try again.');
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

  if (!review) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/my-reviews')} label="Back to Reviews" /></div>
          <p className="ui-subtitle">Review not found.</p>
        </div>
      </div>
    );
  }

  let data = {};
  try { data = JSON.parse(review.content); } catch { /* ignore */ }
  const reviewType = review.review_type || 'after-action';
  const isWeekly = reviewType === 'weekly-momentum';
  const isProgress = reviewType === 'progress';
  const questions = questionsFor(reviewType);

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-reviews')} label="Back to Reviews" /></div>

        <div className="plan-summary-head">
          <PageHeading pageKey="reviewSummary" title={review.title || TAG[reviewType]} overline={TAG[reviewType] || 'Review'} subtitle={formatUkDate(review.entry_date)} rule={false} />
        </div>

        <div className="plan-sum">
          {isWeekly && RATINGS.map((r) => (
            <div className="plan-sum-row" key={r.key}>
              <p className="plan-sum-label">{r.label}</p>
              <div className="plan-sum-value"><RatingDots value={data[r.key]} /></div>
            </div>
          ))}

          {questions.map((q) => (
            data[q.key]?.trim() && (
              <div className="plan-sum-row" key={q.key}>
                <p className="plan-sum-label">{q.label}</p>
                <p className="plan-sum-value">{data[q.key]}</p>
              </div>
            )
          ))}
        </div>

        <div className="plan-actions">
          {!isProgress && (
            <button
              type="button"
              className="ui-btn-ghost"
              onClick={() => navigate('/my-journal', { state: { entryId: review.id, reviewType } })}
            >
              Edit review
            </button>
          )}
          <button type="button" className="ui-btn-ghost ui-btn-ghost--danger" onClick={() => setDeleteOpen(true)}>
            Delete review
          </button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        title="Delete this review?"
        body="This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <Toast message={message} />
    </div>
  );
}
