import { useEffect, useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import { clearAppStorage } from '../lib/clearAppStorage';
import DeleteDialog from '../components/ui/DeleteDialog';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import PersonalGoalModal from '../components/PersonalGoalModal';
import { SignOutLink, useSignOut } from '../components/SignOut';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useCoachName, Crosshair, PageHeader, Button, useToast, SleepTargetEditor, SleepTargetLink, useSleepTarget, keepWords } from '../components/design';
import { DashboardCustomise } from './performance/DashboardCustomise';
import { SLEEP_SUGGESTED_LINE, rangeWords } from '../lib/performance/sleepChart';
import { useStartChat } from '../components/coach/startChat';

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading } = useContext(AuthContext);
  // The mission shown here is the same one the header pill shows (the
  // missions table, through MissionContext), never a separate copy.
  const { mission: personalGoal, hasPlan, showInHeader, updateShowInHeader } = useContext(MissionContext);
  const coachName = useCoachName();
  const startChat = useStartChat();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
  // The sleep target range (Tim, 3 Nov 2026): the same control as Recovery's Home.
  const [sleepTarget, changeSleepTarget] = useSleepTarget();
  const [sleepEditing, setSleepEditing] = useState(false);
  const [customising, setCustomising] = useState(false);
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

  const signOutFlow = useSignOut();

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
        reportDeleteError('Your account didn’t delete. Check your connection and try again.');
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
        reportDeleteError('Your account didn’t delete. Check your connection and try again.');
        return;
      }

      await logout({ force: true });
      clearAppStorage();

      toast.show('Your account has been deleted.');
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Delete account error:', error);
      reportDeleteError('Your account didn’t delete. Check your connection and try again.');
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
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
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
          letter-spacing: var(--ls-section-title);
          font-size: var(--fs-section-title);
          color: var(--text);
          margin: 38px 0 6px;
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
          font-size: calc(16 * var(--u, 1px));
          color: var(--text);
        }

        .account-row-desc {
          font-family: var(--font-body);
          font-size: calc(14 * var(--u, 1px));
          color: var(--text-2);
          margin-top: 4px;
        }

        .account-row-count {
          font-family: var(--font-body);
          font-size: calc(12 * var(--u, 1px));
          color: var(--label);
          margin-top: 6px;
        }

        /* The sleep target range's steppers open in place, under its row. */
        /* The link goes under the words when they'd squeeze it (large text). */
        .account-row--sleep {
          flex-wrap: wrap;
          row-gap: var(--space-2);
        }

        .account-row--sleep .account-row-text {
          flex: 1 1 14em;
        }

        .account-row--sleep .ds-starget-link {
          flex: 0 0 auto;
        }

        .account-sleep-target {
          padding: 0 0 var(--space-4);
          border-bottom: var(--line-w) solid var(--line);
        }

        .account-sleep-target .ds-starget {
          margin-top: 0;
        }

        .account-row--sleep:has(+ .account-sleep-target) {
          border-bottom: 0;
        }

        .account-row-buttons {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .account-empty-line {
          font-family: var(--font-body);
          font-size: calc(14 * var(--u, 1px));
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
          font-family: var(--font-body);
          font-weight: 400;
          font-size: var(--fs-meta);
          letter-spacing: normal;
          color: var(--label);
        }

        .account-danger-zone {
          margin-top: 48px;
        }

        /* Phone-only rows (Chat to the coach: in the desktop header). */
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
              <div className="account-row-desc">{keepWords(personalGoal || 'No mission set yet')}</div>
            </div>
            {/* One Mission (Tim, 5 Nov): with a plan, it is changed only on
                the plan, in Edit my mission, so it reads the same everywhere. */}
            <Button
              variant="outline"
              onClick={() => (hasPlan
                ? navigate('/performance-plan', { state: { openPart: 'mission' } })
                : setShowGoalModal(true))}
            >
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

          {/* Settings: the sleep target range, the same control as
              Recovery's Home (Tim, 3 Nov 2026). */}
          <div className="account-section-label">Settings</div>
          <div className="account-row account-row--sleep">
            <div className="account-row-text">
              <div className="account-row-title">Sleep target range</div>
              <div className="account-row-desc">{rangeWords(sleepTarget)}</div>
              {!sleepTarget.own && <div className="account-row-desc">{SLEEP_SUGGESTED_LINE}</div>}
            </div>
            <SleepTargetLink open={sleepEditing} onToggle={() => setSleepEditing((v) => !v)} controls="account-sleep-target" />
          </div>
          {sleepEditing && (
            <div className="account-sleep-target">
              <SleepTargetEditor id="account-sleep-target" target={sleepTarget} onChange={changeSleepTarget} />
            </div>
          )}
          {/* The Individual Performance Dashboard's parts and order: the
              same Customise panel as the dashboard's (Phase 5). */}
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">Dashboard</div>
              <div className="account-row-desc">Choose which parts of your dashboard show, and in what order.</div>
            </div>
            <Button variant="outline" onClick={() => setCustomising(true)}>Customise my dashboard</Button>
          </div>
          <DashboardCustomise open={customising} onClose={() => setCustomising(false)} />

          {/* Portal */}
          <div className="account-section-label">Portal</div>
          {/* About: on every width now the menu lists areas only (M3). */}
          <div className="account-row">
            <div className="account-row-text">
              <div className="account-row-title">About</div>
              <div className="account-row-desc">Learn about The Clarity Project</div>
            </div>
            <Button variant="outline" onClick={() => navigate('/about')}>
              Open
            </Button>
          </div>
          {/* Chat to the coach: in the header on desktop, here on phone. */}
          {coachName && startChat && (
            <div className="account-row account-row--phone-only">
              <div className="account-row-text">
                <div className="account-row-title">{`Chat to ${coachName}`}</div>
                <div className="account-row-desc">A message to your coach</div>
              </div>
              <Button variant="outline" onClick={startChat}>
                Start a chat
              </Button>
            </div>
          )}
          {/* Sign out, as in the menu (Tim, 5 Nov): the same quiet link,
              sending anything waiting first. */}
          <div className="account-row">
            <SignOutLink onSignOut={signOutFlow.start} busy={signOutFlow.busy} />
          </div>
          {signOutFlow.choice}

          {/* Danger zone */}
          <div className="account-danger-zone">
            <div className="account-section-label">Danger zone</div>
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
        onGoalSaved={() => {}}
      />
    </div>
  );
}
