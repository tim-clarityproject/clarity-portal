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
                padding: '24px 32px',
                backgroundColor: '#f9f9f9',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: '#333',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f0f0f0';
                e.target.style.borderColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#f9f9f9';
                e.target.style.borderColor = '#e5e5e5';
              }}
            >
              Make a decision
            </button>

            <button
              onClick={() => navigate('/my-journal', { state: { ...location.state, isGuest } })}
              style={{
                padding: '24px 32px',
                backgroundColor: '#f9f9f9',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: '#333',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f0f0f0';
                e.target.style.borderColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#f9f9f9';
                e.target.style.borderColor = '#e5e5e5';
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
