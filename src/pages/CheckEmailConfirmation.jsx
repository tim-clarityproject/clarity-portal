import { useLocation, useNavigate } from 'react-router-dom';

export default function CheckEmailConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';

  const handleStartOver = () => {
    localStorage.removeItem('pendingSignupName');
    navigate('/auth/sign-up');
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <div style={{ maxWidth: '900px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', fontWeight: '700', color: 'var(--text)', marginBottom: '3em', marginTop: '0', lineHeight: '1.3', fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif" }}>
            Check the email you signed up with to confirm your account
          </h1>

          <p style={{ fontSize: '14px', color: 'var(--label)', marginBottom: '3em', marginTop: '0' }}>
            OR
          </p>

          <button
            onClick={handleStartOver}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid var(--outline)',
              color: 'var(--text)',
              fontWeight: '600',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = 'var(--coral-text)';
              e.target.style.backgroundColor = 'var(--raised)';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = 'var(--outline)';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Sign up with a different email
          </button>
        </div>
      </div>
    </div>
  );
}
