import './toolFocus/formTool.css';
import { useContext, useEffect, useState } from 'react';
import { B3_LINES } from '../content/pageLines/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { deleteSavedItemWithUndo } from '../lib/savedItemDelete';
import { savedItemsChanged } from '../lib/savedItemsChanged';
import { Loading, PageOpening, Button, useToast } from '../components/design';

export default function StopDoingAuditSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [audit, setAudit] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!decisionId || !user) {
        setIsLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();
        if (error) throw error;
        if (!cancelled) setAudit(data);
      } catch (error) {
        console.error('[StopDoingAuditSummary] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: { decisionId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deleted straight away, with "Deleted" and Undo (writing rule 14; Phase
  // 8a follow-up, step 2): no "Delete this audit?".
  const handleDelete = async () => {
    try {
      const undo = await deleteSavedItemWithUndo(user.id, { dbId: audit.id, source: 'decision' });
      savedItemsChanged();
      navigate('/my-plans');
      toast.saved({
        message: 'Deleted',
        onUndo: async () => {
          try {
            const r = await undo();
            savedItemsChanged();
            if (r === 'queued') toast.show('Will sync');
          } catch (error) {
            console.error('[StopDoingAuditSummary] undo failed:', error);
            toast.error('That didn’t bring it back. Check your connection and try again.');
          }
        },
      });
    } catch (error) {
      console.error('[StopDoingAuditSummary] delete failed:', error);
      toast.error('That didn’t delete. Check your connection and try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your audit" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/my-plans')} label="Back to My Plans" /></div>
          <p className="ui-subtitle">Audit not found.</p>
        </div>
      </div>
    );
  }

  const data = audit.form_data || {};
  const items = data.items || [];
  const totalHours = items.reduce((sum, item) => sum + (parseFloat(item.timePerWeek) || 0), 0);
  // Back-compat: old rows stored firstAction as the activity text.
  const firstActionItem = items.find((item) => item.id === data.firstAction) || items.find((item) => item.activity === data.firstAction);

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-plans')} label="Back to My Plans" /></div>

        <div className="plan-summary-head">
          <PageOpening label={`Time audit, ${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} a week to reclaim`} title={audit.title} line={B3_LINES.timeAuditSummary} />
        </div>

        <div className="plan-sum">
          <div className="plan-sum-row">
            <p className="plan-sum-label">Time-sink activities</p>
            <div className="plan-sum-value">
              {items.map((item, index) => (
                <p key={item.id || index}>{item.activity} · {item.action || 'No action chosen'} · {parseFloat(item.timePerWeek) || 0}h/week</p>
              ))}
            </div>
          </div>

          {firstActionItem && (
            <div className="plan-sum-row">
              <p className="plan-sum-label">Taking action first</p>
              <p className="plan-sum-value">{firstActionItem.activity} ({firstActionItem.action || 'No action chosen'})</p>
            </div>
          )}

          {data.actionHow && (
            <div className="plan-sum-row">
              <p className="plan-sum-label">How specifically</p>
              <p className="plan-sum-value">{data.actionHow}</p>
            </div>
          )}

          {data.timeUse && (
            <div className="plan-sum-row">
              <p className="plan-sum-label">What you will do with the time instead</p>
              <p className="plan-sum-value">{data.timeUse}</p>
            </div>
          )}
        </div>

        <div className="plan-actions">
          <Button type="button" variant="outline" onClick={() => navigate('/time-audit', { state: { decisionId: audit.id } })}>
            Edit audit
          </Button>
          <Button type="button" variant="outline" onClick={handleDelete}>
            Delete audit
          </Button>
        </div>
      </div>
    </div>
  );
}
