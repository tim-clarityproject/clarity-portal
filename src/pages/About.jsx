import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function About() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '56px' }} className="page-container">
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>About The Clarity Portal</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', lineHeight: '1.7', color: '#333' }}>
          <section>
            <p style={{ fontSize: '16px', margin: 0, marginBottom: '20px', lineHeight: '1.8', color: '#333' }}>
              You won't find an AI chatbot here giving you the easy answers.
            </p>
            <p style={{ fontSize: '16px', margin: 0, marginBottom: '20px', lineHeight: '1.8', color: '#333' }}>
              This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.
            </p>
            <p style={{ fontSize: '16px', margin: 0, lineHeight: '1.8', color: '#333' }}>
              The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.
            </p>
          </section>

          <section style={{ paddingTop: '24px', borderTop: '1px solid #e5e5e5' }}>
            <button
              onClick={() => navigate('/welcome', { state: { isGuest } })}
              style={{
                padding: '12px 24px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Back to Home
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
