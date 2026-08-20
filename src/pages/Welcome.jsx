import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    const fetchUserName = async () => {
      if (!user || isGuest) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (data && data.first_name) {
          setFirstName(data.first_name);
        }
      } catch (err) {
        console.error('Error fetching user name:', err);
      }
    };

    fetchUserName();
  }, [user, isGuest]);

  // Typing animation effect
  useEffect(() => {
    if (!firstName) return;

    const text = `Welcome, ${firstName}.`;
    let index = 0;

    const typeTimer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.substring(0, index + 1));
        index++;
      } else {
        clearInterval(typeTimer);
        // Show subtitle after title finishes
        setTimeout(() => setShowSubtitle(true), 400);
        // Show buttons after subtitle delay
        setTimeout(() => setShowButtons(true), 1200);
      }
    }, 50);

    return () => clearInterval(typeTimer);
  }, [firstName]);

  const displayName = firstName || null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 32px 32px' }}>
        <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center', marginTop: '32px' }}>
          <div style={{ marginBottom: '64px', minHeight: '140px' }}>
            <h1 style={{
              fontSize: '48px',
              fontWeight: 'bold',
              color: 'black',
              marginBottom: '16px',
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {displayedText || 'Welcome.'}
              {displayedText && displayedText.length < `Welcome, ${firstName}.`.length && (
                <span style={{ animation: 'blink 1s infinite', marginLeft: '4px' }}>|</span>
              )}
            </h1>
            {showSubtitle && (
              <p style={{
                fontSize: '24px',
                color: '#666',
                margin: 0,
                animation: 'fadeIn 0.6s ease-in'
              }}>
                What's on your mind?
              </p>
            )}
            <style>{`
              @keyframes blink {
                0%, 49%, 100% { opacity: 1; }
                50% { opacity: 0; }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: showButtons ? 1 : 0, transition: 'opacity 0.6s ease-in' }}>
            <button
              onClick={() => navigate('/decision-tools', { state: { ...location.state, isGuest } })}
              style={{
                padding: '16px 48px',
                backgroundColor: '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Make a Decision
            </button>

            <button
              onClick={() => navigate('/my-journal', { state: { ...location.state, isGuest } })}
              style={{
                padding: '16px 48px',
                backgroundColor: 'transparent',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '16px',
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
              Log a Reflection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
