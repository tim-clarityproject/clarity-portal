import './toolFocus/formTool.css';
import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { Loading, PageOpening, Button } from '../components/design';
import SavedItemActions from '../components/SavedItemActions';

// Types with their own dedicated, design-system summary page now - an
// old bookmark/link that still points here gets sent on rather than
// trying to re-render (and risk drifting from) that page's content.
const REDIRECT_ROUTE = {
  inversion: '/pre-mortem/summary',
  'tough-conversation': '/give-difficult-feedback/summary',
  if_then_planning: '/pressure-plan/summary',
  stop_doing_audit: '/time-audit/summary',
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
  // The Health Check opens inside its own tool (M7), on that version.
  'strategic-alignment': '/strategic-alignment',
};

// A saved Health Check (strategic-alignment) never shows here: it is sent
// on to its own tool above (tidy follow-up 3 took out the old summary part
// that could never show).
const TYPE_LABEL = {
  grow: 'Get unstuck',
};

const EDIT_ROUTE = {
  grow: '/get-unstuck',
};

export default function DecisionSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decision, setDecision] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const decisionId = location.state?.decisionId;

  useEffect(() => {
    const loadDecision = async () => {
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
        if (error) {
          console.error('[DecisionSummary] load failed:', error);
          setIsLoading(false);
          return;
        }
        if (REDIRECT_ROUTE[data.tool_type]) {
          navigate(REDIRECT_ROUTE[data.tool_type], { replace: true, state: { decisionId } });
          return;
        }
        setDecision(data);
      } catch (err) {
        console.error('[DecisionSummary] load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadDecision();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><Loading label="Loading your decision" className="ds-loading--page" /></div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Decision not found.</p></div>
      </div>
    );
  }

  const formData = decision.form_data || {};
  const toolType = decision.tool_type;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/my-plans')} label="Back to My Plans" />
        </div>

        <div className="plan-summary-head">
          <PageOpening label={`${TYPE_LABEL[toolType] || toolType}, ${formatUkDate(decision.created_at)}`} title={decision.title || 'Untitled decision'} />
        </div>

        {toolType === 'grow' && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <p className="plan-sum-label">Your goal</p>
              <p className="plan-sum-value">{formData.goal || decision.title || <span className="plan-none">Not recorded.</span>}</p>
            </div>
            {formData.constraints && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Constraints</p>
                <p className="plan-sum-value">{formData.constraints}</p>
              </div>
            )}
            {formData.opportunities && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Opportunities</p>
                <p className="plan-sum-value">{formData.opportunities}</p>
              </div>
            )}
            {formData.options?.length > 0 && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Your options, prioritised</p>
                <div className="plan-sum-value plan-sum-value--list">
                  <ol style={{ margin: 0, padding: 0, listStylePosition: 'inside' }}>
                    {formData.options.map((option, idx) => <li key={idx}>{option}</li>)}
                  </ol>
                </div>
              </div>
            )}
            {formData.will_do && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">What you said you'd do</p>
                <p className="plan-sum-value">{formData.will_do}</p>
              </div>
            )}
          </div>
        )}

        {toolType !== 'grow' && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <p className="plan-sum-label">Details</p>
              <p className="plan-sum-value" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(formData, null, 2)}
              </p>
            </div>
          </div>
        )}

        <div className="plan-actions">
          <Button
            variant="primary"
            type="button"
            onClick={() => navigate(EDIT_ROUTE[toolType] || '/decision-tools', { state: { decisionId: decision.id, ...formData, problemTitle: decision.title } })}
          >
            Edit
          </Button>
        </div>
        <SavedItemActions />
      </div>
    </div>
  );
}
