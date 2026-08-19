import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }}>
        <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
          <div style={{ marginBottom: '64px' }}>
            <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: 'black' }}>
              Welcome to The Clarity Portal
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
              Reflect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
