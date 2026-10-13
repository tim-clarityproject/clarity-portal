import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

export default function IfThenPlanningSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [planning, setPlanning] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { message, showToast } = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadPlanning();
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
          <p className="ui-subtitle">Loading...</p>
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
          <BackLink onClick={() => navigate('/my-plans')} label="Back to my plans" />
        </div>

        <div className="plan-summary-head">
          <span className="plan-overline">If-Then plan</span>
          <div className="ui-title">{planning.title || 'If-Then plan'}</div>
        </div>

        <div className="plan-sum">
          {data.situation && data.situation.trim() && (
            <div className="plan-sum-row">
              <div className="plan-sum-label">Which situation are you concerned about?</div>
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

        <div className="plan-actions">
          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => navigate('/if-then-planning', { state: { decisionId: planning.id } })}
          >
            Edit
          </button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
