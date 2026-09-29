import { useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import HomeHeader from '../components/HomeHeader';
import { designTokens } from '../lib/designTokens';
import { AuthContext } from '../context/AuthContext';

export default function AccountSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useContext(AuthContext);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleVisitWebsite = () => {
    window.open('https://theclarityproject.co.uk/', '_blank');
  };

  const cardStyle = {
    padding: '20px',
    backgroundColor: 'white',
    border: '2px solid #e5e5e5',
    borderRadius: '12px',
    color: '#333',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '140px',
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: designTokens.colors.text.primary, marginTop: '0', marginBottom: '0' }}>Account</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          <button
            onClick={() => navigate('/my-account', { state: { ...location.state } })}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>My Account</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Manage your profile and settings</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/about', { state: { ...location.state } })}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>About</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Learn more about Clarity</div>
            </div>
          </button>

          <button
            onClick={handleVisitWebsite}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Visit Website</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Explore The Clarity Project</div>
            </div>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <button
            onClick={handleLogout}
            style={{
              ...cardStyle,
              color: '#F08571',
              backgroundColor: '#fafafa',
              borderColor: '#F08571',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f0f0';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fafafa';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Log Out</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Sign out of your account</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
