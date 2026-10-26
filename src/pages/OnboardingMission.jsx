import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import { useDraft } from '../lib/drafts';
import { TextBox, Button, useToast } from '../components/design';

const MAX_GOAL_LENGTH = 70;

export default function OnboardingMission() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const { updateMission } = useContext(MissionContext);
  const [greeting, setGreeting] = useState('');
  const [question, setQuestion] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [mission, setMission] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState('');

  // Typing survives a refresh or a closed tab (Tim, 26 Oct).
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: 'onboarding-mission',
    value: { mission },
    ready: true,
    onRestore: (draft) => {
      if (typeof draft?.mission === 'string') setMission(draft.mission.slice(0, MAX_GOAL_LENGTH));
    },
  });

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 4) return "You're a night owl";
    if (hour >= 4 && hour < 7) return 'Rise and shine';
    if (hour >= 7 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 22) return 'Evening';
    return "You're a night owl";
  };

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    // Fetch first name
    const fetchFirstName = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        if (data?.first_name) {
          setFirstName(data.first_name);
        }
      } catch (error) {
        console.error('Error fetching name:', error);
      }
    };

    fetchFirstName();
  }, [user?.id, navigate]);

  useEffect(() => {
    if (!firstName) return;

    // Animate greeting
    const timeGreeting = getTimeGreeting();
    let charIndex = 0;

    const greetingInterval = setInterval(() => {
      if (charIndex <= timeGreeting.length) {
        setGreeting(timeGreeting.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(greetingInterval);
        // After greeting finishes, fade it out and show question
        setTimeout(() => {
          setGreeting('');
          // Now animate the question
          animateQuestion();
        }, 1200);
      }
    }, 80);

    const animateQuestion = () => {
      const questionText = 'What\'s your big mission?';
      let qIndex = 0;

      const questionInterval = setInterval(() => {
        if (qIndex <= questionText.length) {
          setQuestion(questionText.substring(0, qIndex));
          qIndex++;
        } else {
          clearInterval(questionInterval);
          // Show input after question finishes
          setTimeout(() => {
            setShowInput(true);
          }, 300);
        }
      }, 80);
    };

    return () => clearInterval(greetingInterval);
  }, [firstName]);

  const charCount = mission.length;
  const isOverLimit = charCount > MAX_GOAL_LENGTH;

  const handleSaveMission = async () => {
    if (!mission.trim()) {
      toast.error('Your mission is empty. Type your mission, then save.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ personal_goal: mission.trim() })
        .eq('id', user.id);
      if (error) throw error;

      // Update mission in context after successful save
      await updateMission(mission.trim());
      clearDraft();

      setTimeout(() => {
        navigate('/welcome');
      }, 500);
    } catch (error) {
      console.error('Error saving mission:', error);
      toast.error('Your mission didn’t save. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && mission.trim() && !isOverLimit) {
      handleSaveMission();
    }
  };

  return (
    <div className="ui-root" style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
    }}>
      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(-100px);
          }
        }
      `}</style>

      <div style={{
        maxWidth: '600px',
        width: '100%',
      }}>
        {/* Welcome Greeting - Types in and disappears */}
        {greeting && (
          <div style={{
            textAlign: 'center',
            marginBottom: '80px',
            minHeight: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <h1 style={{
              fontSize: 'calc(56 * var(--u, 1px))',
              fontWeight: 'bold',
              color: 'var(--text)',
              margin: 0,
              lineHeight: '1.2',
            }}>
              Welcome, {firstName || 'there'}
              <span style={{
                animation: 'blink 1s infinite',
                marginLeft: '8px',
              }}>
                |
              </span>
            </h1>
          </div>
        )}

        {/* Question - Types in after greeting disappears */}
        {!greeting && (
          <div style={{
            animation: 'fadeIn 0.6s ease-in',
            textAlign: 'center',
          }}>
            <h2 style={{
              fontSize: 'calc(48 * var(--u, 1px))',
              fontWeight: 'bold',
              color: 'var(--text)',
              margin: '0 0 24px 0',
              lineHeight: '1.3',
              minHeight: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: showInput ? 'slideUp 0.6s ease-out forwards' : 'none',
            }}>
              {question}
              {question.length < "What's your big mission?".length && (
                <span style={{
                  animation: 'blink 1s infinite',
                  marginLeft: '8px',
                }}>
                  |
                </span>
              )}
            </h2>

            {/* Input Section - Shows after question types in */}
            {showInput && (
              <div style={{ animation: 'fadeIn 0.6s ease-in' }}>
                <TextBox
                  className="onboarding-mission-box"
                  ariaLabel="Your mission"
                  who="me"
                  lines="one"
                  value={mission}
                  onChange={(text) => setMission(text.slice(0, MAX_GOAL_LENGTH))}
                  onKeyDown={handleKeyPress}
                  placeholder="Type here"
                  autoFocus
                />
                <style>{`
                  .ui-root .onboarding-mission-box {
                    margin-bottom: 24px;
                    text-align: left;
                  }
                `}</style>

                {/* Character Counter - Centered */}
                <div style={{
                  textAlign: 'center',
                  marginBottom: '32px',
                  fontSize: 'calc(12 * var(--u, 1px))',
                  color: isOverLimit ? 'var(--coral-soft-text)' : 'var(--label)',
                }}>
                  {charCount}/{MAX_GOAL_LENGTH} characters
                  {isOverLimit && (
                    <div style={{ marginTop: '4px' }}>Limit exceeded</div>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <Button
                    variant="primary"
                    onClick={handleSaveMission}
                    disabled={!mission.trim() || isSaving || isOverLimit}
                  >
                    {isSaving ? 'Saving' : 'Get Started'}
                  </Button>

                  <Button variant="text" onClick={() => { clearDraft(); navigate('/welcome'); }}>
                    I'll do this later in settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
