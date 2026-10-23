import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import pageText from '../content/pageText';
import { Loading, PageHeader, Button, useToast } from '../components/design';

export default function StopDoingAuditSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [audit, setAudit] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('decisions').delete().eq('id', audit.id).eq('user_id', user.id);
      if (error) throw error;
      navigate('/my-plans', { state: { toast: 'Deleted' } });
    } catch (error) {
      console.error('[StopDoingAuditSummary] delete failed:', error);
      setDeleteOpen(false);
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
          <PageHeader title={audit.title} info={pageText.stopDoingAuditSummary} meta={[`${totalHours} hours a week to reclaim`]} />
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
          <Button type="button" variant="outline" onClick={() => navigate('/stop-doing-audit', { state: { decisionId: audit.id } })}>
            Edit audit
          </Button>
          <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)}>
            Delete audit
          </Button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        title="Delete this audit?"
        body="This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
