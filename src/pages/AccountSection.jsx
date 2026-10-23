import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useState } from 'react';
import DesignHeader from '../components/DesignHeader';
import { PageHeader, HubCard, TileGrid, useToast } from '../components/design';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearAppStorage } from '../lib/clearAppStorage';
import DeleteDialog from '../components/ui/DeleteDialog';

export default function AccountSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStage, setDeleteStage] = useState(0);
  const [deleteError, setDeleteError] = useState('');
  const toast = useToast();
  const reportDeleteError = (text) => {
    setDeleteError(text);
    toast.error(text);
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

      toast.show('Your account has been permanently deleted.');
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Delete account error:', error);
      reportDeleteError('Failed to delete account. Please try again or contact support.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <PageHeader title="Account" />
        </div>

        <TileGrid>
          <HubCard
            name="My Account"
            description="Manage your profile and settings"
            onClick={() => navigate('/my-account', { state: { ...location.state } })}
          />
          <HubCard
            name="About"
            description="Learn more about Clarity"
            onClick={() => navigate('/about', { state: { ...location.state } })}
          />
        </TileGrid>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <TileGrid>
            <HubCard
              name="Log Out"
              description="Sign out of your account"
              onClick={handleLogout}
            />
            <HubCard
              name="Delete Account"
              description="Permanently delete all data"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            />
          </TileGrid>
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
    </div>
  );
}
