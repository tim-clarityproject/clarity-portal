import { useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import HomeHeader from '../components/HomeHeader';

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;

  const getUserName = () => {
    if (!user || isGuest) return null;
    const email = user.email || '';
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const displayName = getUserName();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 32px 32px' }}>
        <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center', marginTop: '32px' }}>
          <div style={{ marginBottom: '64px' }}>
            <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: 'black' }}>
              {displayName ? `Hi ${displayName}, let's do this` : "Let's do this"}
            </h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              onClick={() => navigate('/decisions-log', { state: { ...location.state, isGuest } })}
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
