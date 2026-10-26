import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview, isPlanReviewDraft } from '../lib/planReview';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import pageText from '../content/pageText';
import { Loading, PageHeader, Button, PdfDownload, useToast } from '../components/design';
import { meetingPlanPdf, meetingEndTime } from '../lib/pdf/docs/meetingPlan';

// "Fri, 2 Oct" - UK order, device local time. Plain input[type=date]
// string ("YYYY-MM-DD"), so noon is used to dodge UTC/local day-shift.
function formatMeetingDate(dateStr) {
  if (!dateStr) return 'Not set';
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MeetingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewEntryId, setReviewEntryId] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadMeeting();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (!meeting || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const reviews = await loadPlanReviews(user.id);
        if (cancelled) return;
        const dateKey = getLocalDateKey(parseDbTimestamp(meeting.created_at));
        const existing = findPlanReview(reviews, { planKind: 'plan_meeting', planId: meeting.id, dateKey });
        if (existing && !isPlanReviewDraft(existing)) setReviewEntryId(existing.id);
      } catch (error) {
        console.error('[MeetingSummary] review check failed:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [meeting, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: { decisionId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMeeting = async () => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      if (data) setMeeting(data);
    } catch (error) {
      console.error('[MeetingSummary] load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <Loading label="Loading your meeting plan" className="ds-loading--page" />
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <p className="ui-subtitle">Meeting not found.</p>
        </div>
      </div>
    );
  }

  const data = meeting.form_data || {};
  const objectives = (data.objectives || []).filter((o) => o.text && o.text.trim());
  const agenda = (data.flowItems || []).filter((r) => `${r.item || ''}${r.aim || ''}${r.lead || ''}${r.length || ''}`.trim());
  const total = agenda.reduce((sum, item) => sum + (parseInt(item.length, 10) || 0), 0);

  // The PDF names whose plan it is; it still downloads if the name can't load.
  const getMeetingPdf = async () => {
    let personName = '';
    try {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      personName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
    } catch (error) {
      console.error('[MeetingSummary] name for the PDF did not load:', error);
    }
    if (!personName) personName = [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ');
    return meetingPlanPdf({ meeting, personName });
  };

  return (
    <div className="ui-root">
      <div className="no-print"><DesignHeader /></div>

      <div className="plan-page">
        <div className="plan-back-row no-print">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to my plans" />
        </div>

        <div className="plan-summary-head">
          <PageHeader title={data.title || 'Meeting plan'} info={pageText.meetingSummary} />
        </div>

        <div className="plan-facts">
          <div>
            <b>Date</b>
            <span>{formatMeetingDate(data.date)}</span>
          </div>
          <div>
            <b>Start time</b>
            <span>{data.time || 'Not set'}</span>
          </div>
          <div>
            <b>End time</b>
            <span>{meetingEndTime(data.time, data.flowItems) || 'Not set'}</span>
          </div>
          <div>
            <b>Chair</b>
            <span>{data.chair || 'Not set'}</span>
          </div>
        </div>

        {data.meetingContext && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <div className="plan-sum-label">Meeting context</div>
              <p className="plan-sum-value">{data.meetingContext}</p>
            </div>
          </div>
        )}

        {data.preReads && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <div className="plan-sum-label">Attendee preparation</div>
              <p className="plan-sum-value">{data.preReads}</p>
            </div>
          </div>
        )}

        {objectives.length > 0 && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <div className="plan-sum-label">Objectives in priority order</div>
              <ol className="plan-olist plan-sum-value plan-sum-value--list">
                {objectives.map((o) => <li key={o.id}>{o.text}</li>)}
              </ol>
            </div>
          </div>
        )}

        {agenda.length > 0 && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <div className="plan-sum-label">Meeting agenda</div>
              <div className="plan-sum-value">
                <div className="plan-table-wrap">
                  <table className="plan-table">
                    <colgroup>
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '44%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '12%' }} />
                    </colgroup>
                    <thead>
                      <tr><th>Item</th><th>Aim</th><th>Lead</th><th>Min</th></tr>
                    </thead>
                    <tbody>
                      {agenda.map((r) => (
                        <tr key={r.id}>
                          <td data-label="Item">{r.item}</td>
                          <td data-label="Aim">{r.aim}</td>
                          <td data-label="Lead">{r.lead}</td>
                          <td data-label="Min">{r.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="plan-table-total">Total: {total} minutes</p>
              </div>
            </div>
          </div>
        )}

        <div className="plan-actions no-print">
          <Button
            type="button"
            variant="primary"
            onClick={() => (
              reviewEntryId
                ? navigate('/review-plan-summary', { state: { entryId: reviewEntryId, planKind: 'plan_meeting', plan: meeting } })
                : navigate('/review-plan', { state: { planKind: 'plan_meeting', plan: meeting } })
            )}
          >
            {reviewEntryId ? 'View my review' : 'Review this meeting'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/plan-meeting', { state: { decisionId: meeting.id } })}>
            Edit
          </Button>
          <PdfDownload getDocument={getMeetingPdf} />
        </div>
      </div>
    </div>
  );
}
