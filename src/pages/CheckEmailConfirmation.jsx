import { useLocation, useNavigate } from 'react-router-dom';

export default function CheckEmailConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';

  const handleStartOver = () => {
    localStorage.removeItem('pendingSignupName');
    navigate('/login', { state: { signup: true } });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <div style={{ maxWidth: '900px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', fontWeight: '700', color: '#333', marginBottom: '3em', marginTop: '0', lineHeight: '1.3', fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif" }}>
            Check the email you signed up with to confirm your account
          </h1>

          <p style={{ fontSize: '14px', color: '#999', marginBottom: '3em', marginTop: '0' }}>
            OR
          </p>

          <button
            onClick={handleStartOver}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              color: '#333',
              fontWeight: '600',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Sign Up with a Different Email
          </button>
        </div>
      </div>
    </div>
  );
}
