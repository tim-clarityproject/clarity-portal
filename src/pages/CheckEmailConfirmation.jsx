import { useLocation, useNavigate } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function CheckEmailConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';

  const handleStartOver = () => {
    localStorage.removeItem('pendingSignupName');
    navigate('/create-account');
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <div style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', marginBottom: '16px' }}>
              The Clarity Project
            </h1>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
              Let's confirm your email so you can start exploring your clarity tools.
            </p>
          </div>

          <div style={{
            marginBottom: '32px',
            padding: '32px 24px',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px',
            border: '1px solid #4caf50'
          }}>
            <h2 style={{ color: '#2e7d32', fontSize: '20px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
              ✓ Account Created!
            </h2>
            <p style={{ color: '#2e7d32', fontSize: '14px', margin: '0 0 12px 0', lineHeight: '1.6' }}>
              We've sent a confirmation email to <strong>{email}</strong>
            </p>
            <p style={{ color: '#2e7d32', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>
              Click the confirmation link in the email to activate your account and start exploring The Clarity Project.
            </p>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px 0', fontWeight: 'bold' }}>
              Didn't receive the email?
            </p>
            <ul style={{ color: '#666', fontSize: '12px', margin: '0 0 12px 0', paddingLeft: '20px', lineHeight: '1.8', textAlign: 'left' }}>
              <li>Check your spam or junk folder</li>
              <li>The link expires in 24 hours — if it has, you can sign up again</li>
              <li>Make sure you entered the correct email address</li>
            </ul>
          </div>

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

          <p style={{ color: '#999', fontSize: '12px', marginTop: '32px', lineHeight: '1.6' }}>
            This page is part of The Clarity Project. We never share your data and your privacy is important to us.
          </p>
        </div>
      </div>
    </div>
  );
}
