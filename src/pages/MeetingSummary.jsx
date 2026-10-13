import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

// "Fri, 2 Oct" - UK order, device local time. Plain input[type=date]
// string ("YYYY-MM-DD"), so noon is used to dodge UTC/local day-shift.
function formatMeetingDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function calcEndTime(time, flowItems) {
  if (!time || !flowItems?.length) return '—';
  const totalMinutes = flowItems.reduce((sum, item) => sum + (parseInt(item.length, 10) || 0), 0);
  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + totalMinutes * 60000);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
}

export default function MeetingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadMeeting();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
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
          <p className="ui-subtitle">Loading...</p>
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

  return (
    <div className="ui-root meeting-summary-root">
      {/* Printing the dark theme would waste ink and read poorly, so these
          tokens are overridden to print-safe light values for @media print
          only - every .plan-* class below already reads off these vars, so
          nothing else needs a print-specific rule. */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 0.5in;
        }
        @media print {
          .meeting-summary-root {
            --bg: #ffffff;
            --surface: #ffffff;
            --line: #dddddd;
            --text: #000000;
            --text-2: #333333;
            --placeholder: #666666;
            --coral-text: #000000;
          }
          .no-print {
            display: none !important;
          }
          .design-tabbar {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print"><DesignHeader /></div>

      <div className="plan-page">
        <div className="plan-back-row no-print">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to my plans" />
        </div>

        <div className="plan-summary-head">
          <span className="plan-overline">Meeting planner</span>
          <div className="ui-title">{data.title || 'Meeting plan'}</div>
        </div>

        <div className="plan-facts">
          <div>
            <b>Date</b>
            <span>{formatMeetingDate(data.date)}</span>
          </div>
          <div>
            <b>Start time</b>
            <span>{data.time || '—'}</span>
          </div>
          <div>
            <b>End time</b>
            <span>{calcEndTime(data.time, data.flowItems)}</span>
          </div>
          <div>
            <b>Chair</b>
            <span>{data.chair || '—'}</span>
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
              <div className="plan-sum-label">Objectives (in priority order)</div>
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
          <button type="button" className="ui-btn-primary" onClick={() => navigate('/plan-meeting', { state: { decisionId: meeting.id } })}>
            Edit
          </button>
          <button type="button" className="ui-btn-ghost" onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </div>

      <div className="no-print"><Toast message={message} /></div>
    </div>
  );
}
