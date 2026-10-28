import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, Loading, PageHeader, dayLabel, useToast } from '../../components/design';
import { usePlanPage } from '../../lib/performance/hooks';
import { localToday } from '../../lib/performance';
import './performance.css';

// The stand-in for the end-of-sprint review (Phase 2 step 6), at its own
// route, so finishing a sprint never leads to nothing in the meantime. It
// says where the person's sprint stands, with the one next step. (The
// Performance Sprint page itself is PerformanceSprint.jsx, step 4; the
// 'sprint' form here is no longer routed.) Step 6 replaces this.
//
// page: 'sprint' (/performance-sprint) or 'review' (/performance-sprint/review)
export default function SprintStandIn({ page = 'sprint' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const { data, loading } = usePlanPage(user?.id);

  useEffect(() => {
    if (location.state?.toast) toast.show(location.state.toast);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sprint = data?.sprint || null;
  const today = localToday(data?.personSettings?.time_zone);
  const name = sprint ? `Performance Sprint ${sprint.number}` : null;
  const review = page === 'review';

  let lines;
  if (!data && loading) lines = null;
  else if (!data) lines = ['Your sprint didn’t load.', 'Check your connection and try again.'];
  else if (review) lines = ['The end-of-sprint review is coming soon.', 'You can start your next sprint now.'];
  else if (!sprint) lines = ['No sprint is running.', 'Start one to carry out your plan.'];
  else if (sprint.start_on > today) lines = [`${name} starts on ${dayLabel(sprint.start_on)}.`, 'Your sprint page is coming soon.'];
  else lines = [`${name} has started.`, 'Your sprint page is coming soon.'];

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-plan')} label="Individual Performance Plan" /></div>
        <PageHeader title={review ? 'End-of-sprint review' : (name || 'Performance Sprint')} />
        {lines ? (
          <div className="ipp-gap ipp-coming">
            {lines.map((l) => <p key={l}>{l}</p>)}
          </div>
        ) : <Loading label="Loading your sprint" />}
        <div className="ds-actions ipp-actions">
          {review || (lines && !sprint) ? (
            <Button variant="primary" onClick={() => navigate('/performance-sprint/start', { state: { skipReview: review } })}>Start a sprint</Button>
          ) : (
            <Button variant="primary" onClick={() => navigate('/performance-plan')}>Open my plan</Button>
          )}
        </div>
      </div>
    </div>
  );
}
