import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/design';

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
          <div style={{ marginBottom: '3em' }}>
            <PageHeader title="Check the email you signed up with to confirm your account" />
          </div>

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
