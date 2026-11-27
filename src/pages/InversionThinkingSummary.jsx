import './toolFocus/formTool.css';
import { useState, useContext, useEffect } from 'react';
import { B3_LINES } from '../content/pageLines/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { Loading, PageOpening, Button, useToast } from '../components/design';
import SavedItemActions from '../components/SavedItemActions';
import { dayLabel } from '../components/design/dates';
import { filled } from '../lib/draft6Tools/shared';
import { VERSION, causes as allCauses, fromForm, ranked } from '../lib/draft6Tools/preMortem';

export default function InversionThinkingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [thinking, setThinking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const decisionId = location.state?.decisionId;
  const toast = useToast();

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
      toast.show(location.state.toast);
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
        <div className="plan-page"><Loading label="Loading your pre-mortem" className="ds-loading--page" /></div>
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
  const risks = data.risks || [];
  const hasRiskAnswers = Array.isArray(data.riskAnswers) && data.riskAnswers.length === risks.length;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to My plans" />
        </div>

        <div className="plan-summary-head">
          <PageOpening label={`Pre-mortem, ${dayLabel(getLocalDateKey(parseDbTimestamp(thinking.created_at)))}`} title={thinking.title || 'Pre-mortem'} line={B3_LINES.preMortemSummary} />
        </div>

        {data.v >= VERSION ? <Draft6Summary data={data} /> : (
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
        )}

        <div className="plan-actions">
          <Button
            variant="primary"
            onClick={() => navigate('/pre-mortem', { state: { decisionId: thinking.id } })}
          >
            Edit
          </Button>
        </div>
        <SavedItemActions />
      </div>
    </div>
  );
}

// A pre-mortem made to Draft 6 (Polish 1, Stage D item 1): the plan, what's
// going for it, the ranked causes with what will stop each and its early
// warning sign, and your first step.
function Draft6Summary({ data }) {
  const a = fromForm(data, () => '');
  const top = ranked(a);
  const shown = top.length ? top : allCauses(a);
  const going = filled(a.going);
  return (
    <div className="plan-sum">
      <div className="plan-sum-row">
        <p className="plan-sum-label">The plan</p>
        <p className="plan-sum-value">{a.plan || <span className="plan-none">Not answered yet.</span>}</p>
      </div>
      {going.length > 0 && (
        <div className="plan-sum-row">
          <p className="plan-sum-label">What’s going for it</p>
          <div className="plan-sum-value">{going.map((g) => <p key={g.id}>{g.text}</p>)}</div>
        </div>
      )}
      <div className="plan-sum-row">
        <p className="plan-sum-label">What could go wrong</p>
        <div className="plan-sum-value">
          {shown.length > 0 ? shown.map((c, index) => (
            <div key={c.id}>
              <p>{`${index + 1}. ${c.text}`}</p>
              {top.length > 0 && <p className="plan-none">{`What will stop it: ${a.prevent[c.id] || 'not answered yet.'}`}</p>}
              {top.length > 0 && a.warn[c.id] && <p className="plan-none">{`Early warning sign: ${a.warn[c.id]}`}</p>}
            </div>
          )) : <p className="plan-none">No causes listed.</p>}
        </div>
      </div>
      <div className="plan-sum-row">
        <p className="plan-sum-label">Your first step</p>
        <div className="plan-sum-value">
          <p>{a.first.text || <span className="plan-none">Not answered yet.</span>}</p>
          {a.first.date && <p className="plan-none">{dayLabel(a.first.date)}</p>}
        </div>
      </div>
    </div>
  );
}
