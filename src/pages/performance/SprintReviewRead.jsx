import { useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDocDate } from '../../lib/dateFormatter';
import { readCache, useCachedLoad } from '../../lib/pageCache';
import { tableReady } from '../../lib/performance/tableReady';
import { ANSWERS_ON_DEVICE } from '../../lib/performance/sprintReviewAnswers';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { EmptyState, Loading, PageHeader, LoadError } from '../../components/design';
import './performance.css';

// A finished end-of-sprint review, read only (Phase 4 step 4; not mocked):
// how My Reviews opens one. Its written answers, in the review's own words,
// from sprint_reviews once migration 038 is there, otherwise from this
// device, where the review keeps them until then. The figures it showed
// are the sprint's, on View your year; the plan changes are in the plan's
// version history.

const QUESTIONS = [
  ['worked', 'What worked best in this sprint?'],
  ['next', 'What would make the next sprint even better?'],
];
const CHOICE = { sprint: 'Straight into the next sprint.', recovery: 'Recovery first.' };

async function loadReview(userId, sprintId) {
  const { data: sprint, error } = await supabase.from('sprints')
    .select('id, number, actual_end_on, planned_end_on').eq('id', sprintId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  let answers = null;
  if (await tableReady('sprint_reviews').catch(() => null)) {
    const { data } = await supabase.from('sprint_reviews')
      .select('worked_best, next_better, next_choice, finished_at').eq('sprint_id', sprintId).eq('user_id', userId).maybeSingle();
    if (data) answers = { worked: data.worked_best, next: data.next_better, choice: data.next_choice, finishedAt: data.finished_at };
  }
  if (!answers) {
    const kept = readCache(userId, ANSWERS_ON_DEVICE)?.v?.[sprintId];
    if (kept) answers = { worked: kept.worked, next: kept.next, choice: kept.choice, finishedAt: kept.finishedAt };
  }
  return { sprint, answers };
}

export default function SprintReviewRead() {
  const navigate = useNavigate();
  const { sprintId } = useParams();
  const { user } = useContext(AuthContext);
  const loaded = useCachedLoad({ userId: user?.id, name: `sprint-review-read:${sprintId}`, load: () => loadReview(user.id, sprintId), deps: [sprintId] });
  const sprint = loaded.data?.sprint;
  const answers = loaded.data?.answers;
  const shown = answers ? QUESTIONS.filter(([key]) => (answers[key] || '').trim()) : [];
  const back = () => navigate('/my-reviews');

  let body;
  if (!loaded.data && loaded.loading) body = <Loading label="Loading your review" className="ds-loading--page" />;
  else if (!loaded.data) {
    body = <div className="ipp-gap"><LoadError>Your review didn’t load. Check your connection and try again.</LoadError></div>;
  } else if (!sprint || !answers) {
    body = (
      <div className="ipp-gap">
        <EmptyState question="That review isn’t saved on this device or in your account." action={{ label: 'Open My Reviews', onClick: back, variant: 'outline' }} />
      </div>
    );
  } else {
    body = (
      <div className="plan-sum">
        {shown.map(([key, question]) => (
          <div className="plan-sum-row" key={key}>
            <p className="plan-sum-label">{question}</p>
            <p className="plan-sum-value">{answers[key]}</p>
          </div>
        ))}
        {CHOICE[answers.choice] && (
          <div className="plan-sum-row">
            <p className="plan-sum-label">What’s next?</p>
            <p className="plan-sum-value">{CHOICE[answers.choice]}</p>
          </div>
        )}
        {!shown.length && !CHOICE[answers.choice] && <p className="ipp-muted">Nothing was written in this review.</p>}
      </div>
    );
  }

  const meta = sprint ? [`Performance Sprint ${sprint.number}`, answers?.finishedAt ? formatDocDate(answers.finishedAt) : null].filter(Boolean) : [];
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={back} label="My Reviews" /></div>
        <PageHeader title="End-of-sprint review" meta={meta} />
        {body}
      </div>
    </div>
  );
}
