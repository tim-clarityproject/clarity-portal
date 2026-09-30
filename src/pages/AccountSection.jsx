import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useState } from 'react';
import HomeHeader from '../components/HomeHeader';
import { designTokens } from '../lib/designTokens';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AccountSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure? This will permanently delete your account and all data.')) {
      return;
    }

    const doubleConfirm = window.confirm('This cannot be undone. All your data including missions, decisions, and reviews will be permanently deleted. Are you absolutely sure?');
    if (!doubleConfirm) {
      return;
    }

    setIsDeleting(true);
    try {
      await supabase.from('missions').delete().eq('user_id', user.id);
      await supabase.from('decisions').delete().eq('user_id', user.id);
      await supabase.from('reflections').delete().eq('user_id', user.id);

      const { error: profileError } = await supabase.from('profiles').delete().eq('id', user.id);
      if (profileError) {
        alert('Failed to delete account: ' + profileError.message);
        setIsDeleting(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No active session for account deletion');
        }

        const response = await fetch(
          `${new URL(supabase.supabaseUrl).origin}/functions/v1/delete-user`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const responseData = await response.json();
        if (!response.ok) {
          console.error('Delete auth user error:', responseData);
          throw new Error(responseData.error || 'Failed to delete account from authentication system');
        }
      } catch (authError) {
        console.error('Error deleting auth user:', authError);
        setIsDeleting(false);
        alert('Failed to delete account: ' + (authError.message || 'Unknown error occurred'));
        return;
      }

      await logout();
      sessionStorage.clear();
      localStorage.clear();

      alert('Your account has been permanently deleted.');
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Delete account error:', error);
      alert('Failed to delete account. Please try again or contact support.');
      setIsDeleting(false);
    }
  };

  const cardStyle = {
    padding: '16px',
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
    gap: '6px',
    minHeight: 'auto',
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
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
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '2px' }}>Log Out</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Sign out of your account</div>
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            style={{
              ...cardStyle,
              color: '#ffffff',
              backgroundColor: '#d32f2f',
              borderColor: '#d32f2f',
              opacity: isDeleting ? 0.6 : 1,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.backgroundColor = '#b71c1c';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(211, 47, 47, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.backgroundColor = '#d32f2f';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '2px' }}>Delete Account</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.9 }}>Permanently delete all data</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
