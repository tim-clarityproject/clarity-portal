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
import { useSignOut } from '../components/SignOut';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import OwnQuestionsSection from '../components/ownQuestions/OwnQuestionsSection';
import { useCoachName, Button, Chevron, ColourModeChoice, MoreLink, PageOpening, Row, Rows, SectionTabs, SwitchRow, useToast, SleepTargetEditor, useSleepTarget, keepWords, useHiddenHelp } from '../components/design';
import { ACCOUNT_LINE } from '../content/pageLines/client';
import { useClientPreparing } from '../lib/clientPreparing';
import AccountCoaching from './account/AccountCoaching';
import ProfileFields from './account/ProfileFields';
import './account/account.css';
import { hiddenHelpWords } from '../lib/hiddenHelp';
import './performance/performance.css';
import { DashboardCustomise } from './performance/DashboardCustomise';
import { SLEEP_SUGGESTED_LINE, rangeWords } from '../lib/performance/sleepChart';
import { useStartChat } from '../components/coach/startChat';
import { useCoachRole } from '../lib/coach/role';
import { COACH_AUTH_PATHS, COACH_AUTH_WORDS } from '../lib/signIn/coachAuth';

// My Account's underlined tabs (Polish 1; example-pages-25nov.html "My Account"): one section at a
// time, the chosen one kept in the address (?tab=), so Back from a page it opened returns to it.
export const ACCOUNT_TABS = Object.freeze([
  { key: 'profile', label: 'Profile' },
  { key: 'coaching', label: 'Coaching' },
  { key: 'mission', label: 'Mission' },
  { key: 'look', label: 'Look' },
  { key: 'settings', label: 'Settings' },
  { key: 'questions', label: 'Questions' },
]);
// Older links into the one long page land on their tab.
const HASH_TABS = { '#mission-section': 'mission', '#own-questions': 'questions', '#settings': 'settings' };

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading } = useContext(AuthContext);
  // The mission shown here is the same one the header pill shows (the
  // missions table, through MissionContext), never a separate copy.
  const { mission: personalGoal, missionKnown, hasPlan, showInHeader, updateShowInHeader } = useContext(MissionContext);
  const coachName = useCoachName();
  const startChat = useStartChat();
  // Coaches only: the authenticator and recovery codes (Phase 6a run 5).
  const { coach: coachRow } = useCoachRole();
  const [firstName, setFirstName] = useState('');
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
  const hiddenHelp = useHiddenHelp();
  const [sleepEditing, setSleepEditing] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [archivedMissionsCount, setArchivedMissionsCount] = useState(0);
  const [loadingArchivedMissions, setLoadingArchivedMissions] = useState(false);

  // The brand-new client's two-item menu (src/lib/clientPreparing.js), when My Account is opened first.
  useClientPreparing(user?.id);
  const asked = new URLSearchParams(location.search).get('tab');
  const fromLink = HASH_TABS[location.hash] || (location.state?.scrollTo === 'mission-section' ? 'mission' : null);
  const tab = ACCOUNT_TABS.some((t) => t.key === asked) ? asked : (fromLink || 'profile');
  const chooseTab = (key) => navigate({ pathname: location.pathname, search: key === 'profile' ? '' : `?tab=${key}` }, { replace: true });

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
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
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

  // While the Mission is still on its way (the first visit on this device), its row keeps its place
  // with no words, never "isn't written yet" for a moment (UI tester, scale check).
  const missionPending = !personalGoal && !missionKnown;

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
  const tabs = ACCOUNT_TABS;
  const panes = {
    profile: (
      <div className="acct-pane">
        {/* The example page's two questions with their boxes (walk item 25, 27 Nov), in place of the rows. */}
        <ProfileFields user={user} firstName={firstName} loading={loading} onNameSaved={setFirstName} />
        {/* How they sign in (M26; Tim, 11 Nov). Someone who signs in with Google has no Password page, and is told so instead. */}
        {signsInWithGoogle(user)
          ? <p className="acct-line">{YOU_SIGN_IN_WITH_GOOGLE}</p>
          : <div className="acct-link"><MoreLink onClick={() => navigate('/my-account/password')}>Change my password</MoreLink></div>}
        {coachRow ? <div className="acct-link"><MoreLink onClick={() => navigate(COACH_AUTH_PATHS.security)}>{COACH_AUTH_WORDS.security.linkButton}</MoreLink></div> : null}
        {/* Sign out, a real button sending anything waiting first (Tim, 5 Nov), then Delete my account. */}
        <div className="acct-foot">
          <Button variant="outline" onClick={signOutFlow.start} disabled={signOutFlow.busy} aria-busy={signOutFlow.busy || undefined}>Sign out</Button>
          <Button variant="text" className="acct-delete" onClick={handleDeleteAccount} disabled={isDeleting}>
            {isDeleting ? 'Deleting my account' : 'Delete my account'}
          </Button>
        </div>
        {signOutFlow.choice}
        {deleteError && <p className="plan-save-error" role="alert">{deleteError}</p>}
      </div>
    ),
    coaching: <AccountCoaching userId={user?.id} coachName={coachName} startChat={startChat} />,
    mission: (
      <div className="acct-pane" id="mission-section">
        <Rows label="My Mission">
          <Row
            name={missionPending ? ' ' : keepWords(personalGoal || 'Your Mission isn’t written yet.')}
            value={personalGoal ? 'Edit my Mission' : 'Write my Mission'}
            onClick={editMission}
            className={missionPending ? 'account-pending' : ''}
          />
        </Rows>
        <SwitchRow
          label="Show my Mission at the top of every page"
          checked={Boolean(showInHeader)}
          onChange={handleToggleGoalVisibility}
        />
      </div>
    ),
    look: (
      <div className="acct-pane acct-pane--look">
        <ColourModeChoice />
      </div>
    ),
    settings: (
      <div className="acct-pane">
        <Rows label="Settings">
          <Row
            name="Sleep target"
            sub={sleepTarget.own ? undefined : SLEEP_SUGGESTED_LINE}
            value={rangeWords(sleepTarget)}
            onClick={() => setSleepEditing((v) => !v)}
          />
        </Rows>
        {sleepEditing && (
          <div className="account-sleep-target">
            <SleepTargetEditor id="account-sleep-target" target={sleepTarget} onChange={changeSleepTarget} />
          </div>
        )}
        <Rows>
          <Row name="Customise my dashboard" value={<Chevron direction="right" />} onClick={() => setCustomising(true)} />
          {/* Only when there is one: a section with nothing in it stays hidden. */}
          {!loadingArchivedMissions && archivedMissionsCount > 0 && (
            <Row name={`Open my archived plans (${archivedMissionsCount})`} value={<Chevron direction="right" />} onClick={() => navigate('/personal-operating-plan-archived')} />
          )}
          <Row name="About The Clarity Portal" value={<Chevron direction="right" />} onClick={() => navigate('/about')} />
          {/* Hidden help (tidy pass, item 13): only once an explanation has been hidden. */}
          {hiddenHelp.count > 0 && (
            <Row name="Hidden help" sub={hiddenHelpWords(hiddenHelp.count)} value="Show it again" onClick={hiddenHelp.showAll} />
          )}
        </Rows>
        <DashboardCustomise open={customising} onClose={() => setCustomising(false)} />
      </div>
    ),
    questions: (
      <div className="acct-pane acct-pane--questions">
        {/* Your own questions (run 7, mock-up version 3): set here and nowhere else. */}
        <OwnQuestionsSection userId={user?.id} />
      </div>
    ),
  };

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="account-page">
        <PageOpening title="My Account" line={ACCOUNT_LINE} />
        <EmailVerificationBanner />
        <SectionTabs tabs={tabs} value={tab} onChange={chooseTab} label="My Account" className="acct-tabs" />
        <div role="tabpanel" aria-label={tabs.find((t) => t.key === tab)?.label} className="acct-panel">
          {panes[tab]}
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
