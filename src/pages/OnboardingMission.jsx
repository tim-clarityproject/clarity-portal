import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function OnboardingMission() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [greeting, setGreeting] = useState('');
  const [showQuestion, setShowQuestion] = useState(false);
  const [mission, setMission] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

    const greetingText = getTimeGreeting();
    let greetingIndex = 0;

    const greetingInterval = setInterval(() => {
      if (greetingIndex < greetingText.length) {
        setGreeting(greetingText.substring(0, greetingIndex + 1));
        greetingIndex++;
      } else {
        clearInterval(greetingInterval);
        setTimeout(() => {
          setShowQuestion(true);
        }, 800);
      }
    }, 80);

    return () => clearInterval(greetingInterval);
  }, [user, navigate]);

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

      setTimeout(() => {
        navigate('/welcome');
      }, 500);
    } catch (error) {
      alert('Failed to save mission. Please try again.');
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && mission.trim()) {
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
      <div style={{
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: 'bold',
          color: 'black',
          margin: 0,
          minHeight: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '48px',
        }}>
          {greeting}
          <span style={{
            animation: greeting && !showQuestion ? 'blink 1s infinite' : 'none',
            marginLeft: '4px',
          }}>
            |
          </span>
        </h1>

        {showQuestion && (
          <div style={{ animation: 'fadeIn 0.6s ease-in' }}>
            <p style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#333',
              marginBottom: '32px',
              margin: 0,
              marginBottom: '32px',
            }}>
              What's your big mission?
            </p>

            <textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type here"
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '16px',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
                marginBottom: '24px',
                resize: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#F08571'}
              onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              autoFocus
            />

            <button
              onClick={handleSaveMission}
              disabled={!mission.trim() || isSaving}
              style={{
                padding: '14px 32px',
                backgroundColor: !mission.trim() || isSaving ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: '600',
                border: 'none',
                borderRadius: '8px',
                cursor: !mission.trim() || isSaving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (mission.trim() && !isSaving) {
                  e.target.style.backgroundColor = '#e07560';
                }
              }}
              onMouseLeave={(e) => {
                if (mission.trim() && !isSaving) {
                  e.target.style.backgroundColor = '#F08571';
                }
              }}
            >
              {isSaving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        <style>{`
          @keyframes blink {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
