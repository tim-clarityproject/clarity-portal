import { useEffect, useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import { clearAppStorage } from '../lib/clearAppStorage';
import DeleteDialog from '../components/ui/DeleteDialog';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import PersonalGoalModal, { MAX_GOAL_LENGTH } from '../components/PersonalGoalModal';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useCoachName, Crosshair, PageHeader, Button, useToast } from '../components/design';
import { useStartChat } from '../components/coach/startChat';

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading } = useContext(AuthContext);
  const { showInHeader, updateShowInHeader } = useContext(MissionContext);
  const coachName = useCoachName();
  const startChat = useStartChat();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalGoal, setPersonalGoal] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStage, setDeleteStage] = useState(0);
  const [deleteError, setDeleteError] = useState('');
  const toast = useToast();
  const reportDeleteError = (text) => {
    setDeleteError(text);
    toast.error(text);
  };
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [archivedMissionsCount, setArchivedMissionsCount] = useState(0);
  const [loadingArchivedMissions, setLoadingArchivedMissions] = useState(false);

  // Handle scrolling to sections when navigated with state.scrollTo
  useEffect(() => {
    if (location.state?.scrollTo) {
      const element = document.getElementById(location.state.scrollTo);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [location.state?.scrollTo]);

  // Handle opening Edit Mission pop-up from header link
  useEffect(() => {
    if (location.state?.openEditMission) {
      setShowGoalModal(true);
      // Clear the state to prevent reopening on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location.state?.openEditMission]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Two stages in one shared DeleteDialog (the same two confirmations the
  // old window.confirm chain asked): "Are you sure?" then "This cannot be
  // undone". Only the second one's Delete runs performDeleteAccount.
  const handleDeleteAccount = () => {
    setDeleteError('');
    setDeleteStage(1);
  };

  const performDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Delete all user data from public tables first
      // Delete missions and their data
      await supabase
        .from('missions')
        .delete()
        .eq('user_id', user.id);

      // Delete decisions
      await supabase
        .from('decisions')
        .delete()
        .eq('user_id', user.id);

      // Delete reflections/journal
      await supabase
        .from('reflections')
        .delete()
        .eq('user_id', user.id);

      // Delete profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profileError) {
        reportDeleteError('Failed to delete account: ' + profileError.message);
        setIsDeleting(false);
        return;
      }

      // Delete from Supabase Auth (auth.users table) using Edge Function
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

        console.log('✓ Auth user deleted successfully');
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

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, personal_goal')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setPersonalGoal(profile.personal_goal || '');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user?.id]);

  // Archived plans now have their own dedicated page (prompt 9 spec:
  // "NOT in profile settings") - this only keeps a live count for the
  // redirect row below, not the restore/delete UI that used to live
  // here.
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingArchivedMissions(true);
      try {
        const { count } = await supabase
          .from('missions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('archived_at', 'is', null);
        setArchivedMissionsCount(count || 0);
      } catch (error) {
        console.error('Error loading archived missions count:', error);
      } finally {
        setLoadingArchivedMissions(false);
      }
    })();
  }, [user?.id]);

  // Re-fetch goal when modal closes (to show updated value immediately).
  // show_mission_in_header is no longer read here: it lives in
  // MissionContext (showInHeader), the same shared source of truth the
  // header pill reads from.
  useEffect(() => {
    if (!showGoalModal && user) {
      const refetchGoal = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('personal_goal')
            .eq('id', user.id)
            .single();

          if (profile) {
            setPersonalGoal(profile.personal_goal || '');
          }
        } catch (error) {
          console.error('Error refetching goal:', error);
        }
      };

      refetchGoal();
    }
  }, [showGoalModal, user]);

  const handleToggleGoalVisibility = () => {
    updateShowInHeader(!showInHeader);
  };

  // Handle hash-based scrolling to sections
  useEffect(() => {
    if (location.hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.querySelector(location.hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash]);

  const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Your Name';

  return (
    <div className="ui-root account-root">
      <style>{`
        .account-root {
          width: 100%;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        .account-content {
          flex: 1;
          width: 100%;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .account-content {
            min-height: calc(100dvh - var(--tabbar-height, 81px));
          }
        }

        .account-column {
          width: 100%;
          box-sizing: border-box;
          padding: 0 20px;
        }

        @media (min-width: 769px) {
          .account-column {
            max-width: 620px;
            margin: 0 auto;
            padding: 44px 24px 40px;
          }
        }

        @media (max-width: 768px) {
          .account-column {
            padding-top: 34px;
            padding-bottom: 40px;
          }
        }

        .account-section-label {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 11px;
          color: var(--coral-text);
          margin: 38px 0 6px;
        }

        .account-section-label--muted {
          color: var(--text-2);
        }


        .account-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 20px 0;
          border-bottom: 1px solid var(--line);
        }

        .account-row-text {
          min-width: 0;
        }

        .account-row-title {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 16px;
          color: var(--text);
        }

        .account-row-desc {
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--text-2);
          margin-top: 4px;
        }

        .account-row-count {
          font-family: var(--font-body);
          font-size: 12px;
          color: var(--label);
          margin-top: 6px;
        }

        .account-row-buttons {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .account-empty-line {
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--text-2);
          padding: 18px 0;
          border-bottom: 1px solid var(--line);
        }

        .account-switch-row {
          min-height: 44px;
        }

        .account-switch-control {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .account-switch-state-label {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-2);
        }

        .account-danger-zone {
          margin-top: 48px;
        }

        /* About row: phone only. Desktop reaches About via the menu
           drawer, so this row would be a duplicate there - hidden at
           769px+ and shown only at 768px and below. */
        .account-row--phone-only {
          display: none;
        }

        @media (max-width: 768px) {
          .account-row--phone-only {
            display: flex;
          }
        }
      `}</style>

      <DesignHeader />

      <div className="account-content">
        <div className="account-column">
          <PageHeader title="My Account" info={pageText.myAccount} />

          <EmailVerificationBanner />

          {/* Profile */}
          <div className="account-section-label">Profile</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">{fullName}</div>
              <div className="account-row-desc">{user?.email}</div>
            </div>
            <Button variant="outline" onClick={() => navigate('/edit-profile')}>
              Edit
            </Button>
          </div>

          {/* Mission */}
          <div id="mission-section" className="account-section-label">Mission</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Statement</div>
              <div className="account-row-desc">{personalGoal || 'No mission set yet'}</div>
              <div className="account-row-count">{personalGoal.length}/{MAX_GOAL_LENGTH} characters</div>
            </div>
            <Button variant="outline" onClick={() => setShowGoalModal(true)}>
              Edit
            </Button>
          </div>
          <div className="account-row account-switch-row">
            <div className="account-row-text">
              <div className="account-row-title">Show in header</div>
              <div className="account-row-desc">Display your mission in the page heading</div>
            </div>
            <div className="account-switch-control">
              <span className="account-switch-state-label">
                {showInHeader ? 'Visible' : 'Hidden'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showInHeader}
                aria-label="Show mission in header"
                className={`ui-switch${showInHeader ? ' ui-switch--on' : ''}`}
                onClick={handleToggleGoalVisibility}
              />
            </div>
          </div>

          {/* Archived missions: redirects to the dedicated Archived
              plans page (prompt 9 spec - restore/view live there now,
              not in profile settings). */}
          <div className="account-section-label">Archived missions</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Archived plans</div>
              <div className="account-row-desc">
                {loadingArchivedMissions ? (
                  <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Crosshair size="sm" tone="label" spin />
                    Loading
                  </span>
                ) : `${archivedMissionsCount} archived`}
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/personal-operating-plan-archived')}>
              Open
            </Button>
          </div>

          {/* Portal */}
          <div className="account-section-label">Portal</div>
          <div className="account-row account-row--phone-only">
            <div className="account-row-text">
              <div className="account-row-title">About</div>
              <div className="account-row-desc">Learn about The Clarity Project</div>
            </div>
            <Button variant="outline" onClick={() => navigate('/about')}>
              Open
            </Button>
          </div>
          {/* Chat to the coach: in the header on desktop, here on phone. */}
          {coachName && (
            <div className="account-row account-row--phone-only">
              <div className="account-row-text">
                <div className="account-row-title">{`Chat to ${coachName}`}</div>
                <div className="account-row-desc">A message on WhatsApp or iMessage</div>
              </div>
              <Button variant="outline" onClick={startChat}>
                Start a chat
              </Button>
            </div>
          )}
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Log out</div>
              <div className="account-row-desc">Sign out of this device</div>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              Log out
            </Button>
          </div>

          {/* Danger zone */}
          <div className="account-danger-zone">
            <div className="account-section-label account-section-label--muted">Danger zone</div>
            <div className="account-row">
              <div className="account-row-text">
                <div className="account-row-title">Delete account</div>
                <div className="account-row-desc">Permanently delete your account and all data</div>
              </div>
              <Button
                variant="outline"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting' : 'Delete'}
              </Button>
            </div>
            {deleteError && <p className="plan-save-error" role="alert">{deleteError}</p>}
          </div>
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
      <PersonalGoalModal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        currentGoal={personalGoal}
        onGoalSaved={(newGoal) => setPersonalGoal(newGoal)}
      />
    </div>
  );
}
