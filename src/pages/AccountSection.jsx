import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useState } from 'react';
import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearAppStorage } from '../lib/clearAppStorage';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

export default function AccountSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStage, setDeleteStage] = useState(0);
  const [deleteError, setDeleteError] = useState('');
  const { message, showToast } = useToast();
  const reportDeleteError = (text) => {
    setDeleteError(text);
    showToast(text);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Two stages in one shared DeleteDialog (the same two confirmations the
  // old window.confirm chain asked), then the unchanged delete below.
  const handleDeleteAccount = () => {
    setDeleteError('');
    setDeleteStage(1);
  };

  const performDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await supabase.from('missions').delete().eq('user_id', user.id);
      await supabase.from('decisions').delete().eq('user_id', user.id);
      await supabase.from('reflections').delete().eq('user_id', user.id);

      const { error: profileError } = await supabase.from('profiles').delete().eq('id', user.id);
      if (profileError) {
        reportDeleteError('Failed to delete account: ' + profileError.message);
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
        reportDeleteError('Failed to delete account: ' + (authError.message || 'Unknown error occurred'));
        return;
      }

      await logout();
      clearAppStorage();

      showToast('Your account has been permanently deleted.');
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Delete account error:', error);
      reportDeleteError('Failed to delete account. Please try again or contact support.');
      setIsDeleting(false);
    }
  };

  const cardStyle = {
    padding: '16px',
    backgroundColor: 'var(--raised)',
    border: '2px solid var(--line)',
    borderRadius: '12px',
    color: 'var(--text)',
    fontWeight: 'var(--fw-medium)',
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
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <PageHeader title="Account" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          <button
            onClick={() => navigate('/my-account', { state: { ...location.state } })}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--coral-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'var(--fw-medium)', marginBottom: '4px' }}>My Account</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Manage your profile and settings</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/about', { state: { ...location.state } })}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--coral-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'var(--fw-medium)', marginBottom: '4px' }}>About</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Learn more about Clarity</div>
            </div>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={handleLogout}
            style={{
              ...cardStyle,
              color: 'var(--coral-text)',
              backgroundColor: 'var(--raised)',
              borderColor: 'var(--coral-text)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--card)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--raised)';
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'var(--fw-medium)', marginBottom: '2px' }}>Log Out</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>Sign out of your account</div>
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            style={{
              ...cardStyle,
              color: 'var(--text)',
              backgroundColor: 'var(--coral-soft-tint)',
              borderColor: 'var(--coral-soft-text)',
              opacity: isDeleting ? 0.6 : 1,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.borderColor = 'var(--coral-text)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDeleting) {
                e.currentTarget.style.borderColor = 'var(--coral-soft-text)';
              }
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'var(--fw-medium)', marginBottom: '2px' }}>Delete Account</div>
              <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.9 }}>Permanently delete all data</div>
            </div>
          </button>
          {deleteError && <p className="plan-save-error" role="alert">{deleteError}</p>}
        </div>
      </div>

      <DeleteDialog
        open={deleteStage > 0}
        title={deleteStage === 2 ? 'Are you absolutely sure?' : 'Delete your account?'}
        body={deleteStage === 2
          ? 'This cannot be undone. All your data including missions, decisions, and reviews will be permanently deleted.'
          : 'This will permanently delete your account and all data.'}
        onConfirm={() => {
          if (deleteStage === 1) {
            setDeleteStage(2);
          } else {
            setDeleteStage(0);
            performDeleteAccount();
          }
        }}
        onCancel={() => setDeleteStage(0)}
      />
      <Toast message={message} />
    </div>
  );
}
