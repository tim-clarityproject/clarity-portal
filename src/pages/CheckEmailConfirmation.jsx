import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Button } from '../components/design';

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

          <p style={{ fontSize: 'calc(14 * var(--u, 1px))', color: 'var(--label)', marginBottom: '3em', marginTop: '0' }}>
            OR
          </p>

          <Button variant="outline" onClick={handleStartOver}>
            Sign up with a different email
          </Button>
        </div>
      </div>
    </div>
  );
}
