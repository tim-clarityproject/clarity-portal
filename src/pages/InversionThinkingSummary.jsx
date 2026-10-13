import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

export default function InversionThinkingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [thinking, setThinking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const decisionId = location.state?.decisionId;
  const { message, showToast } = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadThinking();
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

  const loadThinking = async () => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      if (data) setThinking(data);
    } catch (error) {
      console.error('[InversionThinkingSummary] load failed:', error);
    } finally {
      setIsLoading(false);
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

  if (!thinking) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Decision not found.</p></div>
      </div>
    );
  }

  const data = thinking.form_data || {};
  const risks = data.fuckups || [];
  const hasRiskAnswers = Array.isArray(data.riskAnswers) && data.riskAnswers.length === risks.length;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/decision-history')} label="Back to my decisions" />
        </div>

        <div className="plan-summary-head">
          <span className="plan-overline">Inversion thinking</span>
          <div className="ui-title">{thinking.title || 'Inversion thinking'}</div>
          <p className="ui-subtitle">Created {formatUkDate(thinking.created_at)}</p>
        </div>

        <div className="plan-sum">
          <div className="plan-sum-row">
            <p className="plan-sum-label">Goal</p>
            <p className="plan-sum-value">{data.goal || <span className="plan-none">No goal recorded.</span>}</p>
          </div>

          {hasRiskAnswers ? (
            <div className="plan-sum-row">
              <p className="plan-sum-label">Risks &amp; plans</p>
              <div className="plan-sum-value">
                {risks.length > 0 ? (
                  risks.map((risk, index) => (
                    <div className="inv-sum-risk-row" key={index}>
                      <div>
                        <span className="inv-sum-risk-label">Risk {String(index + 1).padStart(2, '0')}</span>
                        <p>{risk}</p>
                      </div>
                      <div>
                        <span className="inv-sum-risk-label">What you'll do</span>
                        <p>{data.riskAnswers[index] || <span className="plan-none">Not answered.</span>}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="plan-none">No risks recorded.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="plan-sum-row">
                <p className="plan-sum-label">Ways this could go wrong</p>
                <div className="plan-sum-value plan-sum-value--list">
                  {risks.length > 0 ? (
                    <ol style={{ margin: 0, padding: 0, listStylePosition: 'inside' }}>
                      {risks.map((risk, index) => <li key={index}>{risk}</li>)}
                    </ol>
                  ) : (
                    <span className="plan-none">No risks recorded.</span>
                  )}
                </div>
              </div>
              <div className="plan-sum-row">
                <p className="plan-sum-label">Your plan</p>
                <p className="plan-sum-value">{data.plan || <span className="plan-none">No plan recorded.</span>}</p>
              </div>
            </>
          )}
        </div>

        <div className="plan-actions">
          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => navigate('/inversion-step-1', { state: { decisionId: thinking.id, goal: data.goal, risks: data.fuckups, riskAnswers: data.riskAnswers, legacyPlan: hasRiskAnswers ? '' : data.plan, problemTitle: thinking.title } })}
          >
            Edit
          </button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
