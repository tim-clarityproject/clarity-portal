import { useState, useCallback, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

export default function ToughConversationStep1Feedback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [observation, setObservation] = useState(location.state?.observation || '');
  const [impact, setImpact] = useState(location.state?.impact || '');
  const [need, setNeed] = useState(location.state?.need || '');

  // Clear fields only on true fresh start (no decisionId AND coming from Welcome)
  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.observation) {
      setObservation('');
      setImpact('');
      setNeed('');
    }
  }, []);

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

  const handleNext = useCallback(() => {
    navigate('/tough-conversation-step-2', {
      state: {
        isGuest,
        decisionId,
        observation,
        impact,
        need,
        selectedQuestions: location.state?.selectedQuestions || [],
        customQuestion: location.state?.customQuestion || '',
      },
    });
  }, [observation, impact, need, decisionId, isGuest, navigate, location.state]);

  const handleSaveAsDraft = useCallback(async () => {
    if (!user || isGuest) return;

    try {
      const data = {
        observation,
        impact,
        need,
      };

      if (decisionId) {
        await supabase
          .from('decisions')
          .update({ tough_conversation_data: data, draft: true })
          .eq('id', decisionId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'tough-conversation',
            tough_conversation_data: data,
            draft: true,
          });
      }
      alert('Saved as draft');
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Failed to save draft');
    }
  }, [user, isGuest, observation, impact, need, decisionId]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>Have a tough conversation</h1>
            <p style={{ fontSize: '14px', color: '#999', margin: '8px 0 0 0' }}>Feedback & Coaching Conversations</p>
          </div>
          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
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
              e.target.style.backgroundColor = '#FEE5DE';
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
          <div style={{ height: '100%', width: '50%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '48px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
              I've noticed...
            </label>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px', margin: '0 0 12px 0' }}>
              Name the thing you've observed. This can either be one big thing, or a pattern of 3+ smaller things.
            </p>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Enter your observation..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
              The impact of that is...
            </label>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px', margin: '0 0 12px 0' }}>
              Describe in a non-emotional manner the tangible impact of their actions.
            </p>
            <textarea
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="Describe the impact..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
              So, what I need from you is...
            </label>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px', margin: '0 0 12px 0' }}>
              Name the change or outcome that is required.
            </p>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder="Describe what you need..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '100px', padding: '24px', backgroundColor: '#FEE5DE', borderRadius: '8px', border: '1px solid #F08571' }}>
          <p style={{ fontSize: '12px', fontWeight: '600', color: '#F08571', marginBottom: '16px', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Your conversation script
          </p>
          <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#333', margin: 0 }}>
            I've noticed{' '}
            <span style={{ fontWeight: '600', color: displayObservation ? '#333' : '#ccc' }}>
              {displayObservation || '_______________'}
            </span>
            . The impact of that is{' '}
            <span style={{ fontWeight: '600', color: displayImpact ? '#333' : '#ccc' }}>
              {displayImpact || '_______________'}
            </span>
            . So, what I need from you is{' '}
            <span style={{ fontWeight: '600', color: displayNeed ? '#333' : '#ccc' }}>
              {displayNeed || '_______________'}
            </span>
            .
          </p>
        </div>

        <SaveDiscardButtons
          onNext={handleNext}
          onSaveAsDraft={handleSaveAsDraft}
          isGuest={isGuest}
        />
      </div>
    </div>
  );
}
