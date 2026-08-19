import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function DecisionTools() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/welcome', { state: { isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>Decision Tools</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            <button
              onClick={() => navigate('/grow-step-1', { state: { isGuest } })}
              style={{
                padding: '20px',
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: '#333',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f9f9f9';
                e.target.style.borderColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#e5e5e5';
              }}
            >
              GROW Model
            </button>

            <button
              onClick={() => navigate('/inversion-step-1', { state: { isGuest } })}
              style={{
                padding: '20px',
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: '#333',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f9f9f9';
                e.target.style.borderColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#e5e5e5';
              }}
            >
              Inversion
            </button>

            <button
              onClick={() => navigate('/choose-focus', { state: { isGuest } })}
              style={{
                padding: '20px',
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                color: '#333',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f9f9f9';
                e.target.style.borderColor = '#F08571';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#e5e5e5';
              }}
            >
              Strategic Alignment
            </button>
          </div>

          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
            style={{
              padding: '12px 24px',
              backgroundColor: '#F08571',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#e07560';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#F08571';
            }}
          >
            View Decision History
          </button>
      </div>
    </div>
  );
}
