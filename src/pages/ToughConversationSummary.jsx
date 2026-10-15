import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import { COACHING_QUESTIONS } from '../content/coachingQuestions';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import PageHeading from '../components/PageHeading';

export default function ToughConversationSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [conversation, setConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const decisionId = location.state?.decisionId;
  const { message, showToast } = useToast();

  useEffect(() => {
    if (decisionId && user) {
      loadConversation();
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

  const loadConversation = async () => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      if (data) setConversation(data);
    } catch (error) {
      console.error('[ToughConversationSummary] load failed:', error);
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

  if (!conversation) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Decision not found.</p></div>
      </div>
    );
  }

  const data = conversation.form_data || {};
  const chosenQuestions = (data.selectedQuestions || []).map((i) => COACHING_QUESTIONS[i]).filter(Boolean);

  const copyScript = () => {
    const scriptText = `I've noticed ${data.observation}. The impact of that is ${data.impact}. So, what I need from you is ${data.need}.`;
    navigator.clipboard?.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/decision-history')} label="Back to my decisions" />
        </div>

        <div className="plan-summary-head">
          <PageHeading pageKey="toughConversationSummary" title={conversation.title || 'Tough conversation'} overline="Tough conversation" subtitle={`Created ${formatUkDate(conversation.created_at)}`} rule={false} />
        </div>

        <div className="tc-script">
          <p className="tc-script-sent">
            I've noticed <span className="tc-filled">{data.observation || '—'}</span>. The impact of that is{' '}
            <span className="tc-filled">{data.impact || '—'}</span>. So, what I need from you is{' '}
            <span className="tc-filled">{data.need || '—'}</span>.
          </p>
        </div>

        <div className="plan-sum">
          <div className="plan-sum-row">
            <p className="plan-sum-label">Coaching questions</p>
            <div className="plan-sum-value plan-sum-value--list">
              {chosenQuestions.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStylePosition: 'inside' }}>
                  {chosenQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              ) : (
                <span className="plan-none">No coaching questions chosen.</span>
              )}
            </div>
          </div>

          {data.customQuestion && (
            <div className="plan-sum-row">
              <p className="plan-sum-label">Your own question</p>
              <p className="plan-sum-value">{data.customQuestion}</p>
            </div>
          )}
        </div>

        <div className="plan-actions">
          <button type="button" className="ui-btn-primary" onClick={copyScript}>
            {copied ? 'Copied' : 'Copy script'}
          </button>
          <button
            type="button"
            className="ui-btn-ghost"
            onClick={() => navigate('/tough-conversation-step-1', { state: { decisionId: conversation.id, ...data, problemTitle: conversation.title } })}
          >
            Edit
          </button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
