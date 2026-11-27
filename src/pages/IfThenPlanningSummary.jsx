import './toolFocus/formTool.css';
import './toolFocus/draft6.css';
import { useState, useContext, useEffect } from 'react';
import { B3_LINES } from '../content/pageLines/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview, isPlanReviewDraft } from '../lib/planReview';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { Loading, PageOpening, Button, useToast } from '../components/design';
import SavedItemActions from '../components/SavedItemActions';
import { dayLabel } from '../components/design/dates';
import { formatClockTime } from '../lib/dateFormatter';
import { MoreLink } from '../components/design';
import { NO_DATE, ROUTINE, VERSION, controlled, fromForm, ifThens } from '../lib/draft6Tools/pressurePlan';

export default function IfThenPlanningSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [planning, setPlanning] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewEntryId, setReviewEntryId] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadPlanning();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (!planning || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const reviews = await loadPlanReviews(user.id);
        if (cancelled) return;
        const dateKey = getLocalDateKey(parseDbTimestamp(planning.created_at));
        const existing = findPlanReview(reviews, { planKind: 'if_then_planning', planId: planning.id, dateKey });
        if (existing && !isPlanReviewDraft(existing)) setReviewEntryId(existing.id);
      } catch (error) {
        console.error('[IfThenPlanningSummary] review check failed:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [planning, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: { decisionId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPlanning = async () => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      if (data) setPlanning(data);
    } catch (error) {
      console.error('[IfThenPlanningSummary] load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <Loading label="Loading your plan" className="ds-loading--page" />
        </div>
      </div>
    );
  }

  if (!planning) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <p className="ui-subtitle">Plan not found.</p>
        </div>
      </div>
    );
  }

  const data = planning.form_data || {};
  const items = (data.items || []).filter((i) => `${i.ifCondition || ''}${i.thenAction || ''}`.trim());

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to My plans" />
        </div>

        <div className="plan-summary-head">
          <PageOpening label="Pressure plan" title={planning.title || 'Pressure plan'} line={B3_LINES.pressurePlanSummary} />
        </div>

        {data.v >= VERSION ? <Draft6Summary data={data} /> : (
          <div className="plan-sum">
            {data.situation && data.situation.trim() && (
              <div className="plan-sum-row">
                <div className="plan-sum-label">The moment</div>
                <p className="plan-sum-value">{data.situation}</p>
              </div>
            )}

            <div className="plan-sum-row">
              <div className="plan-sum-label">Scenarios</div>
              <div className="plan-sum-value">
                {items.length > 0 ? (
                  items.map((item, index) => (
                    <div className="plan-pair2" key={index}>
                      <small>If...</small>
                      <p>{item.ifCondition}</p>
                      <small>Then I will</small>
                      <p>{item.thenAction}</p>
                    </div>
                  ))
                ) : (
                  <p className="plan-none">No scenarios planned yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="plan-actions">
          <Button
            variant="primary"
            onClick={() => (
              reviewEntryId
                ? navigate('/review-plan-summary', { state: { entryId: reviewEntryId, planKind: 'if_then_planning', plan: planning } })
                : navigate('/review-plan', { state: { planKind: 'if_then_planning', plan: planning } })
            )}
          >
            {reviewEntryId ? 'View my review' : 'Review this plan'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/pressure-plan', { state: { decisionId: planning.id } })}
          >
            Edit
          </Button>
        </div>
        <SavedItemActions />
      </div>
    </div>
  );
}

/** "Mon 30 Nov, 07:30" (times only through formatClockTime, rule 19). */
function whenWords(date, time) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time || '').split(':').map(Number);
  return time ? `${dayLabel(date)}, ${formatClockTime(new Date(y, m - 1, d, h, min))}` : dayLabel(date);
}

const after = (word, text) => `${text || ''}`.trim().replace(new RegExp(`^${word}\\b[,\\s]*`, 'i'), '');

// A Pressure plan made to Draft 6 (Polish 1, Stage D item 1): the moment and
// its date, what you control, your if-then plans and your routine, with
// Breathe one tap away.
function Draft6Summary({ data }) {
  const navigate = useNavigate();
  const a = fromForm(data, () => '');
  const mine = controlled(a);
  const plans = ifThens(a);
  const routine = ROUTINE.filter((r) => a.routine[r.key].trim());
  const rehearse = whenWords(a.rehearse.date, a.rehearse.time);
  return (
    <>
      <div className="plan-sum">
        <div className="plan-sum-row">
          <div className="plan-sum-label">The moment</div>
          <div className="plan-sum-value">
            <p>{a.moment || <span className="plan-none">Not answered yet.</span>}</p>
            <p className="plan-none">{a.noDate ? NO_DATE : a.date ? dayLabel(a.date) : ''}</p>
          </div>
        </div>
        {mine.length > 0 && (
          <div className="plan-sum-row">
            <div className="plan-sum-label">What you control</div>
            <div className="plan-sum-value">
              {mine.map((m) => (
                <div key={m.id}>
                  <p>{m.text}</p>
                  {a.acts[m.id] && <p className="plan-none">{`What you’ll do: ${a.acts[m.id]}`}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="plan-sum-row">
          <div className="plan-sum-label">If it happens</div>
          <div className="plan-sum-value">
            {plans.length > 0 ? plans.map((item) => (
              <div key={item.id}>
                <p>{`If ${after('if', item.ifCondition)}`}</p>
                {after('then', item.thenAction) && <p className="plan-none">{`Then ${after('then', item.thenAction)}`}</p>}
              </div>
            )) : <p className="plan-none">No plans yet.</p>}
          </div>
        </div>
        {routine.length > 0 && (
          <div className="plan-sum-row">
            <div className="plan-sum-label">Your routine</div>
            <div className="plan-sum-value">
              {routine.map((r) => <p key={r.key}>{`${r.label}: ${a.routine[r.key]}`}</p>)}
            </div>
          </div>
        )}
        {rehearse && (
          <div className="plan-sum-row">
            <div className="plan-sum-label">When you’ll rehearse</div>
            <p className="plan-sum-value">{rehearse}</p>
          </div>
        )}
      </div>
      <div className="d6-sum-links">
        <MoreLink onClick={() => navigate('/breathe')}>Breathe</MoreLink>
      </div>
    </>
  );
}
