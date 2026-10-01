import { useEffect, useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import PageHeading from '../components/PageHeading';
import BreathingSettingsModal from '../components/BreathingSettingsModal';
import PersonalGoalModal, { MAX_GOAL_LENGTH } from '../components/PersonalGoalModal';
import EmailVerificationBanner from '../components/EmailVerificationBanner';

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading } = useContext(AuthContext);
  const { showInHeader, updateShowInHeader, refetchMission } = useContext(MissionContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalGoal, setPersonalGoal] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBreathingSettings, setShowBreathingSettings] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [archivedMissions, setArchivedMissions] = useState([]);
  const [showArchivedMissions, setShowArchivedMissions] = useState(false);
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
        alert('Failed to delete account: ' + profileError.message);
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

  // Load archived missions on component mount to prevent stale count
  useEffect(() => {
    if (user) {
      loadArchivedMissions();
    }
  }, [user?.id]);

  // Reload when section is expanded (in case new archives happened)
  useEffect(() => {
    if (showArchivedMissions && user) {
      loadArchivedMissions();
    }
  }, [showArchivedMissions, user]);

  const loadArchivedMissions = async () => {
    setLoadingArchivedMissions(true);
    try {
      const { data } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

      setArchivedMissions(data || []);
    } catch (error) {
      console.error('Error loading archived missions:', error);
    } finally {
      setLoadingArchivedMissions(false);
    }
  };

  const handleRestoreMission = async (missionId) => {
    try {
      await supabase
        .from('missions')
        .update({ archived_at: null })
        .eq('id', missionId)
        .eq('user_id', user.id);

      // Immediately refetch mission in MissionContext to update header
      await refetchMission();

      loadArchivedMissions();
    } catch (error) {
      console.error('Error restoring mission:', error);
      alert('Failed to restore mission');
    }
  };

  const handleDeleteArchivedMission = async (missionId) => {
    const confirmed = window.confirm(
      'Permanently delete this archived mission? This cannot be undone. All reviews will be lost.'
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'Are you absolutely sure? This is permanent and cannot be recovered.'
    );
    if (!doubleConfirm) return;

    try {
      await supabase
        .from('missions')
        .delete()
        .eq('id', missionId)
        .eq('user_id', user.id);

      loadArchivedMissions();
    } catch (error) {
      console.error('Error deleting mission:', error);
      alert('Failed to delete mission');
    }
  };

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
          color: var(--coral);
          margin: 38px 0 6px;
        }

        .account-section-label--muted {
          color: var(--text-2);
        }

        /* Archived Missions' label doubles as a toggle button.
           src/styles/mobile.css has button:not(.breathe-button) {
           padding: 12px 16px !important; font-size: 14px !important; }
           at max-width: 768px. .account-root .account-archived-toggle
           (0,2,0) already out-ranks that (0,1,1) on specificity, but
           padding/font-size need matching !important regardless. */
        .account-root .account-archived-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          margin: 38px 0 6px;
          padding: 0 !important;
          cursor: pointer;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 11px !important;
          color: var(--coral);
        }

        .account-archived-count {
          font-family: var(--font-body);
          font-size: 13px;
          letter-spacing: 0;
          text-transform: none;
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
          color: var(--placeholder);
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
          <PageHeading pageKey="myAccount" title="My Account" />

          <EmailVerificationBanner />

          {/* Profile */}
          <div className="account-section-label">Profile</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">{fullName}</div>
              <div className="account-row-desc">{user?.email}</div>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={() => navigate('/edit-profile')}>
              Edit
            </button>
          </div>

          {/* Mission */}
          <div id="mission-section" className="account-section-label">Mission</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Statement</div>
              <div className="account-row-desc">{personalGoal || 'No mission set yet'}</div>
              <div className="account-row-count">{personalGoal.length}/{MAX_GOAL_LENGTH} characters</div>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={() => setShowGoalModal(true)}>
              Edit
            </button>
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

          {/* Advanced */}
          <div className="account-section-label">Advanced</div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Breathing settings</div>
              <div className="account-row-desc">Customise your breathing cycle duration</div>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={() => setShowBreathingSettings(true)}>
              Edit
            </button>
          </div>

          {/* Archived Missions */}
          <button
            type="button"
            className="account-archived-toggle"
            onClick={() => setShowArchivedMissions(!showArchivedMissions)}
            aria-expanded={showArchivedMissions}
          >
            Archived missions
            <span className="account-archived-count">({archivedMissions.length})</span>
          </button>

          {showArchivedMissions && (
            loadingArchivedMissions ? (
              <div className="account-empty-line">Loading archived missions...</div>
            ) : archivedMissions.length === 0 ? (
              <div className="account-empty-line">No archived missions</div>
            ) : (
              archivedMissions.map((mission) => (
                <div key={mission.id} className="account-row">
                  <div className="account-row-text">
                    <div className="account-row-title">{mission.title}</div>
                    <div className="account-row-desc">
                      Archived {new Date(mission.archived_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="account-row-buttons">
                    <button type="button" className="ui-btn-ghost" onClick={() => handleRestoreMission(mission.id)}>
                      Restore
                    </button>
                    <button type="button" className="ui-btn-ghost ui-btn-ghost--danger" onClick={() => handleDeleteArchivedMission(mission.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* Portal */}
          <div className="account-section-label">Portal</div>
          <div className="account-row account-row--phone-only">
            <div className="account-row-text">
              <div className="account-row-title">About</div>
              <div className="account-row-desc">Learn about The Clarity Project</div>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={() => navigate('/about')}>
              Open
            </button>
          </div>
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Log out</div>
              <div className="account-row-desc">Sign out of this device</div>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>

          {/* Danger zone */}
          <div className="account-danger-zone">
            <div className="account-section-label account-section-label--muted">Danger zone</div>
            <div className="account-row">
              <div className="account-row-text">
                <div className="account-row-title">Delete account</div>
                <div className="account-row-desc">Permanently delete your account and all data</div>
              </div>
              <button
                type="button"
                className="ui-btn-ghost ui-btn-ghost--danger"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <BreathingSettingsModal isOpen={showBreathingSettings} onClose={() => setShowBreathingSettings(false)} />
      <PersonalGoalModal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        currentGoal={personalGoal}
        onGoalSaved={(newGoal) => setPersonalGoal(newGoal)}
      />
    </div>
  );
}
