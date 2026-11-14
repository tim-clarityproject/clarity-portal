import { useEffect, useState, useContext } from 'react';
import { signsInWithGoogle, YOU_SIGN_IN_WITH_GOOGLE } from '../lib/signIn/account';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import { clearAppStorage } from '../lib/clearAppStorage';
import DeleteDialog from '../components/ui/DeleteDialog';
import DesignHeader from '../components/DesignHeader';
import PersonalGoalModal from '../components/PersonalGoalModal';
import { SignOutLink, useSignOut } from '../components/SignOut';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useCoachName, PageHeader, Button, ColourModeChoice, Section, SwitchRow, useToast, SleepTargetEditor, SleepTargetLink, useSleepTarget, keepWords } from '../components/design';
import './performance/performance.css';
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

      // The account is gone: nothing of it waits on this device either.
      const deletedAccount = user?.id || null;
      await logout({ force: true });
      clearAppStorage({ deletedAccount });

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
    // Offline or refused, the switch goes back: say so (rule 28), never silently.
    Promise.resolve(updateShowInHeader(!showInHeader)).then((ok) => {
      if (ok === false) toast.error('That didn’t save. Check your connection and try again.');
    });
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

  // The calm layout (design reference version 28; Tim's rules of 5 Nov, and
  // Claude's call of 10 Nov that My Account gets it before go-live): one
  // title, section names with the line above, quiet text links in place
  // of big outlined buttons, the reference's switch with no word beside
  // it, and nothing shown that has nothing in it.
  const editMission = () => (hasPlan
    // One Mission (Tim, 5 Nov): with a plan it is changed in the plan's own
    // Mission panel, so it reads the same everywhere.
    ? navigate('/performance-plan', { state: { openPart: 'mission' } })
    : setShowGoalModal(true));
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page account-page">
        <PageHeader title="My Account" />
        <EmailVerificationBanner />

        <Section title="Profile" className="ipp-section account-section">
          <div className="account-row">
            <div className="account-row-text">
              <p className="account-row-title">{fullName}</p>
              <p className="account-row-note">{user?.email}</p>
            </div>
            <Button variant="text" onClick={() => navigate('/edit-profile')}>Edit my profile</Button>
          </div>
          {/* How they sign in (M26; Tim, 11 Nov). Someone who signs in with
              Google has no Password page, and is told so instead. */}
          {signsInWithGoogle(user) ? (
            <div className="account-row">
              <div className="account-row-text">
                <p className="account-row-title">{YOU_SIGN_IN_WITH_GOOGLE}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="account-row">
                <div className="account-row-text">
                  <p className="account-row-title">Email</p>
                  <p className="account-row-note">{user?.email}</p>
                </div>
                <Button variant="text" onClick={() => navigate('/my-account/email')}>Edit my email</Button>
              </div>
              <div className="account-row">
                <div className="account-row-text">
                  <p className="account-row-title">Password</p>
                </div>
                <Button variant="text" onClick={() => navigate('/my-account/password')}>Edit my password</Button>
              </div>
            </>
          )}
        </Section>

        <Section id="mission-section" title="My Mission" className="ipp-section account-section">
          <div className="account-row">
            <div className="account-row-text">
              <p className="account-row-title">{keepWords(personalGoal || 'Your Mission isn’t written yet.')}</p>
            </div>
            <Button variant="text" onClick={editMission}>{personalGoal ? 'Edit my Mission' : 'Write my Mission'}</Button>
          </div>
          <SwitchRow
            label="Show my Mission at the top of every page"
            checked={Boolean(showInHeader)}
            onChange={handleToggleGoalVisibility}
          />
        </Section>

        <Section title="Appearance" className="ipp-section account-section">
          <div className="account-choice">
            <ColourModeChoice />
          </div>
        </Section>

        <Section title="Settings" className="ipp-section account-section">
          <div className="account-row account-row--sleep">
            <div className="account-row-text">
              <p className="account-row-title">Sleep target range</p>
              <p className="account-row-note">{rangeWords(sleepTarget)}</p>
              {!sleepTarget.own && <p className="account-row-note">{SLEEP_SUGGESTED_LINE}</p>}
            </div>
            <SleepTargetLink open={sleepEditing} onToggle={() => setSleepEditing((v) => !v)} controls="account-sleep-target" />
          </div>
          {sleepEditing && (
            <div className="account-sleep-target">
              <SleepTargetEditor id="account-sleep-target" target={sleepTarget} onChange={changeSleepTarget} />
            </div>
          )}
          <div className="account-links">
            <Button variant="text" onClick={() => setCustomising(true)}>Customise my dashboard</Button>
            {/* Only when there is one: a section with nothing in it stays hidden. */}
            {!loadingArchivedMissions && archivedMissionsCount > 0 && (
              <Button variant="text" onClick={() => navigate('/personal-operating-plan-archived')}>
                {`Open my archived plans (${archivedMissionsCount})`}
              </Button>
            )}
            <Button variant="text" onClick={() => navigate('/about')}>About The Clarity Portal</Button>
            {/* Chat to the coach: in the header on desktop, here on phone. */}
            {coachName && startChat && (
              <Button variant="text" className="account-phone-only" onClick={startChat}>{`Chat to ${coachName}`}</Button>
            )}
          </div>
          <DashboardCustomise open={customising} onClose={() => setCustomising(false)} />
        </Section>

        {/* Sign out, as in the menu (Tim, 5 Nov): the same quiet link,
            sending anything waiting first. */}
        <div className="account-signout">
          <SignOutLink onSignOut={signOutFlow.start} busy={signOutFlow.busy} />
        </div>
        {signOutFlow.choice}

        <Section title="Delete my account" className="ipp-section account-section">
          <div className="account-row">
            <div className="account-row-text">
              <p className="account-row-note">This removes your account and everything in it, for good.</p>
            </div>
            <Button variant="text" onClick={handleDeleteAccount} disabled={isDeleting}>
              {isDeleting ? 'Deleting my account' : 'Delete my account'}
            </Button>
          </div>
          {deleteError && <p className="plan-save-error" role="alert">{deleteError}</p>}
        </Section>
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
