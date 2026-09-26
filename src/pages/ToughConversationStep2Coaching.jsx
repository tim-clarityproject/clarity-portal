import { useState, useCallback, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import NamingModal from '../components/NamingModal';
import { Edit2, Copy, Check } from 'lucide-react';

const COACHING_QUESTIONS = [
  "What's already working that we can build upon?",
  "What part of this is within your control?",
  "What would others notice first if things improved?",
  "What's one behaviour you'd keep, start, or stop?",
  "When have you handled this well before?",
  "What's the simplest next step you could take?",
  "What strengths could you use here?",
  "What support would help you the most?",
];

export default function ToughConversationStep2Coaching() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { updateFormData } = useContext(FormContext);
  const decisionId = location.state?.decisionId;

  useLoadDecision(updateFormData);

  const isFreshStart = !location.state?.decisionId && !location.state?.observation;

  const [observation, setObservation] = useState(isFreshStart ? '' : (location.state?.observation || ''));
  const [impact, setImpact] = useState(isFreshStart ? '' : (location.state?.impact || ''));
  const [need, setNeed] = useState(isFreshStart ? '' : (location.state?.need || ''));
  const [selectedQuestions, setSelectedQuestions] = useState(isFreshStart ? [] : (location.state?.selectedQuestions || []));
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [customQuestion, setCustomQuestion] = useState(isFreshStart ? '' : (location.state?.customQuestion || ''));
  const [copied, setCopied] = useState(false);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(location.state?.title || '');

  // Clear localStorage on fresh start
  useEffect(() => {
    if (isFreshStart) {
      localStorage.removeItem('clarity_form_data');
    }
  }, [isFreshStart]);

  const cleanPhrase = (text, phrasesToRemove, lowercaseFirst = false) => {
    let cleaned = text.trim();
    for (const phrase of phrasesToRemove) {
      const regex = new RegExp(`^${phrase}\\s*`, 'i');
      cleaned = cleaned.replace(regex, '');
    }
    cleaned = cleaned.trim();
    if (lowercaseFirst && cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
    }
    return cleaned;
  };

  const displayObservation = cleanPhrase(observation, ['i\'ve noticed', 'i noticed', 'observed']);
  const displayImpact = cleanPhrase(impact, ['the impact of that is', 'the impact is', 'impact:', 'impacts:'], true);
  const displayNeed = cleanPhrase(need, ['so, what i need from you is', 'what i need is', 'what i need', 'i need you'], true);

  const handleToggleQuestion = (index) => {
    setSelectedQuestions((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };


  const startEdit = (field) => {
    setEditingField(field);
    if (field === 'observation') setEditValue(observation);
    if (field === 'impact') setEditValue(impact);
    if (field === 'need') setEditValue(need);
  };

  const saveEdit = () => {
    if (editingField === 'observation') setObservation(editValue);
    if (editingField === 'impact') setImpact(editValue);
    if (editingField === 'need') setNeed(editValue);
    setEditingField(null);
    setEditValue('');
  };

  const copyScriptToClipboard = () => {
    const scriptText = `I've noticed ${displayObservation}. The impact of that is ${displayImpact}. So, what I need from you is ${displayNeed}.`;
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const needsNaming = !currentTitle || currentTitle.match(/^\w{3},\s\w{3}\s\d{1,2},\s\d{4}$/);

  const handleCompleteClick = useCallback(() => {
    if (!user) {
      alert('Please log in to save decisions');
      return;
    }
    if (needsNaming) {
      setShowNamingModal(true);
    } else {
      handleCompleteConfirmed(currentTitle);
    }
  }, [user, needsNaming, currentTitle]);

  const handleSaveAsDraftClick = useCallback(() => {
    if (!user) {
      alert('Please log in to save decisions');
      return;
    }
    if (needsNaming) {
      setShowNamingModal(true);
    } else {
      handleSaveAsDraftConfirmed(currentTitle);
    }
  }, [user, needsNaming, currentTitle]);

  const handleCompleteConfirmed = useCallback(async (decisionName) => {
    setShowNamingModal(false);
    if (!user) return;

    try {
      const data = {
        observation,
        impact,
        need,
        selectedQuestions,
        customQuestion,
      };

      console.log('Saving tough conversation:', { decisionId, data });

      let savedDecisionId = decisionId;

      if (savedDecisionId) {
        const { error } = await supabase
          .from('decisions')
          .update({ form_data: data, title: decisionName, draft: false, status: 'completed' })
          .eq('id', savedDecisionId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { data: insertedData, error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'tough-conversation',
            title: decisionName,
            form_data: data,
            draft: false,
            status: 'completed',
          })
          .select();
        if (error) throw error;
        if (insertedData && insertedData.length > 0) {
          savedDecisionId = insertedData[0].id;
        }
      }
      setCurrentTitle(decisionName);
      clearProgress();
      console.log('Save successful, navigating to tough-conversation-summary');
      navigate('/tough-conversation-summary', { state: { decisionId: savedDecisionId } });
    } catch (error) {
      console.error('Error saving:', error);
      alert(`Failed to save: ${error.message || error}`);
    }
  }, [user, observation, impact, need, selectedQuestions, customQuestion, decisionId, navigate]);

  const handleSaveAsDraftConfirmed = useCallback(async (decisionName) => {
    setShowNamingModal(false);
    if (!user) return;

    try {
      const data = {
        observation,
        impact,
        need,
        selectedQuestions,
        customQuestion,
      };

      if (decisionId) {
        const { error } = await supabase
          .from('decisions')
          .update({ form_data: data, title: decisionName, draft: true, status: 'draft' })
          .eq('id', decisionId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'tough-conversation',
            title: decisionName,
            form_data: data,
            draft: true,
            status: 'draft',
          });
        if (error) throw error;
      }
      setCurrentTitle(decisionName);
      clearProgress();
      alert('Saved as draft');
    } catch (error) {
      console.error('Error saving draft:', error);
      alert(`Failed to save draft: ${error.message || error}`);
    }
  }, [user, observation, impact, need, selectedQuestions, customQuestion, decisionId]);

  const handleBack = useCallback(() => {
    navigate('/tough-conversation-step-1', {
      state: {
        problemTitle: location.state?.problemTitle,
        decisionId,
        observation,
        impact,
        need,
        selectedQuestions,
        customQuestion,
      },
    });
  }, [observation, impact, need, decisionId, navigate, selectedQuestions, customQuestion, location.state?.problemTitle]);

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>Have a Tough Conversation</h1>
            <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>Plan your coaching and follow-up questions</p>
          </div>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>

        <div style={{ marginBottom: '48px', width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginBottom: '48px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #F08571' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#F08571', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your conversation script
            </p>
            <button
              onClick={copyScriptToClipboard}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#F08571',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(240, 133, 113, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {copied ? (
                <>
                  <Check size={16} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy
                </>
              )}
            </button>
          </div>

          {editingField && (
            <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(240, 133, 113, 0.2)' }}>
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Type here"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '12px',
                  border: '1px solid #F08571',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={saveEdit}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F08571',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    color: '#F08571',
                    border: '1px solid #F08571',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p style={{ fontSize: '16px', lineHeight: '1.8', color: '#333', margin: 0 }}>
            I've noticed{' '}
            <span
              style={{
                fontWeight: '600',
                color: displayObservation ? '#333' : '#ccc',
                cursor: 'pointer',
                borderBottom: '2px solid rgba(240, 133, 113, 0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'rgba(240, 133, 113, 0.3)';
              }}
              onClick={() => startEdit('observation')}
            >
              {displayObservation || '_______________'}
            </span>
            . The impact of that is{' '}
            <span
              style={{
                fontWeight: '600',
                color: displayImpact ? '#333' : '#ccc',
                cursor: 'pointer',
                borderBottom: '2px solid rgba(240, 133, 113, 0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'rgba(240, 133, 113, 0.3)';
              }}
              onClick={() => startEdit('impact')}
            >
              {displayImpact || '_______________'}
            </span>
            . So, what I need from you is{' '}
            <span
              style={{
                fontWeight: '600',
                color: displayNeed ? '#333' : '#ccc',
                cursor: 'pointer',
                borderBottom: '2px solid rgba(240, 133, 113, 0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = 'rgba(240, 133, 113, 0.3)';
              }}
              onClick={() => startEdit('need')}
            >
              {displayNeed || '_______________'}
            </span>
            .
          </p>
        </div>

        <div style={{ marginBottom: '48px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#666', margin: 0 }}>
            Now you have delivered your feedback, it's time to coach your staff member to find their own solutions. Choose the coaching questions that are most relevant to this conversation.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: '0 0 8px 0' }}>Coaching Questions</h3>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Asking questions is an art. Select a few from below that might work for you, or type your own in the text box below.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '48px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          {COACHING_QUESTIONS.map((question, index) => (
            <label
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                cursor: 'pointer',
                padding: '12px',
                borderRadius: '6px',
                transition: 'all 0.2s',
                backgroundColor: selectedQuestions.includes(index) ? '#f9f9f9' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!selectedQuestions.includes(index)) {
                  e.currentTarget.style.backgroundColor = '#f0f0f0';
                }
              }}
              onMouseLeave={(e) => {
                if (!selectedQuestions.includes(index)) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <input
                type="checkbox"
                checked={selectedQuestions.includes(index)}
                onChange={() => handleToggleQuestion(index)}
                style={{
                  marginTop: '4px',
                  cursor: 'pointer',
                  width: '18px',
                  height: '18px',
                  accentColor: '#F08571',
                }}
              />
              <span style={{ fontSize: '14px', color: '#333', lineHeight: '1.5' }}>{question}</span>
            </label>
          ))}

          <textarea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Type here"
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '12px',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              marginTop: '12px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#F08571';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e5e5';
            }}
          />
        </div>

        <div style={{ marginBottom: '48px' }} />

        <SaveDiscardButtons
          onBack={handleBack}
          onNext={handleCompleteClick}
          onSaveAsDraft={handleSaveAsDraftClick}
          nextLabel="Finish"
          canNext={true}
        />

        <NamingModal
          isOpen={showNamingModal}
          itemType="decision"
          onConfirm={handleCompleteConfirmed}
          onCancel={() => setShowNamingModal(false)}
        />
      </div>
    </div>
  );
}
