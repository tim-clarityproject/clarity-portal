import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';

const MAX_GOAL_LENGTH = 50;

export default function OnboardingMission() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { updateMission } = useContext(MissionContext);
  const [greeting, setGreeting] = useState('');
  const [question, setQuestion] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [mission, setMission] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState('');

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
  }, [user, navigate]);

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
      alert('Please enter your mission');
      return;
    }

    setIsSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ personal_goal: mission.trim() })
        .eq('id', user.id);

      // Update mission in context after successful save
      updateMission(mission.trim());

      setTimeout(() => {
        navigate('/welcome');
      }, 500);
    } catch (error) {
      alert('Failed to save mission. Please try again.');
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && mission.trim() && !isOverLimit) {
      handleSaveMission();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'white',
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
        @keyframes slideUpAndFade {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-60px);
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
              fontSize: '56px',
              fontWeight: 'bold',
              color: 'black',
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
              fontSize: '48px',
              fontWeight: 'bold',
              color: 'black',
              margin: '0 0 48px 0',
              lineHeight: '1.3',
              minHeight: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: showInput ? 'slideUpAndFade 0.6s ease-out forwards' : 'none',
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
                <textarea
                  value={mission}
                  onChange={(e) => setMission(e.target.value.slice(0, MAX_GOAL_LENGTH))}
                  onKeyPress={handleKeyPress}
                  placeholder="Type here"
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '16px',
                    border: 'none',
                    borderRadius: '0px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    outline: 'none',
                    marginBottom: '24px',
                    resize: 'none',
                    transition: 'all 0.2s',
                    backgroundColor: 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                  }}
                  autoFocus
                />
                <style>{`
                  textarea::placeholder {
                    color: #999;
                    text-align: center;
                  }
                `}</style>

                {/* Character Counter - Centered */}
                <div style={{
                  textAlign: 'center',
                  marginBottom: '32px',
                  fontSize: '12px',
                  color: isOverLimit ? '#F08571' : '#999',
                }}>
                  {charCount}/{MAX_GOAL_LENGTH} characters
                  {isOverLimit && (
                    <div style={{ fontWeight: '600', marginTop: '4px' }}>Limit exceeded</div>
                  )}
                </div>

                <button
                  onClick={handleSaveMission}
                  disabled={!mission.trim() || isSaving || isOverLimit}
                  style={{
                    padding: '12px 32px',
                    backgroundColor: !mission.trim() || isSaving || isOverLimit ? '#ccc' : '#F08571',
                    color: 'white',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: !mission.trim() || isSaving || isOverLimit ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (mission.trim() && !isSaving && !isOverLimit) {
                      e.target.style.backgroundColor = '#e07560';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (mission.trim() && !isSaving && !isOverLimit) {
                      e.target.style.backgroundColor = '#F08571';
                    }
                  }}
                >
                  {isSaving ? 'Saving...' : 'Get Started'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
