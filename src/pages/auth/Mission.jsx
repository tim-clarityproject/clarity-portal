import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPrimaryButton, AuthGhostButton } from '../../components/auth/AuthButton';
import { useShake } from '../../components/auth/AuthField';

const MAX_MISSION_LENGTH = 70;

const EXAMPLE_MISSIONS = [
  'Build a team that wins when it matters most.',
  'Set the standard, then coach everyone to exceed it.',
  'Make everyone around me better, every single day.',
  'Build a company people are proud to work for.',
  'Win the day, then win the season.',
  'Turn good people into a great team.',
];

// Reached ONLY from the email confirmation link
// (options.emailRedirectTo = `${window.location.origin}/auth/mission`,
// set in SignUpStep2.jsx). Supabase's client processes the token in the
// URL and fires a SIGNED_IN auth event once a session is established -
// this page waits for that event (same proven polling pattern already
// used in src/pages/EmailConfirmation.jsx) rather than calling
// getSession() immediately, which can return null while the token
// exchange is still in flight.
//
// Four link states, per the task brief:
//   a) normal: a SIGNED_IN event fires with a user -> show the mission form
//   b) different device / no session: no error params, but no session
//      ever arrives and there was no existing session either -> "log in
//      to finish" screen
//   c) expired or invalid link: Supabase puts error/error_code in the
//      URL (this is also what Supabase sends for an already-used link -
//      it does not distinguish the two cases with a different code)
//   d) already confirmed: no error params, no fresh SIGNED_IN event, but
//      the browser already has a valid session (e.g. still logged in
//      from before) -> "you are already confirmed" screen
function LinkState({ icon, headline, sub, children }) {
  return (
    <AuthShell topBar="back" backTo="/auth/login" backLabel="← Log in" align="center" headline={headline} sub={sub}>
      {children}
    </AuthShell>
  );
}

export default function Mission() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useContext(AuthContext);
  const { mission: existingMission, updateMission } = useContext(MissionContext);

  const [linkStatus, setLinkStatus] = useState('checking'); // checking | expired | needs-login | already-confirmed | ready
  const [missionValue, setMissionValue] = useState('');
  const [missionError, setMissionError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [checkedExistingMission, setCheckedExistingMission] = useState(false);
  const textareaRef = useRef(null);
  const hadUserOnMount = useRef(!!user);
  const textareaShaking = useShake(shakeToken);

  useEffect(() => {
    const errorCode = searchParams.get('error_code');
    const error = searchParams.get('error');
    if (error || errorCode) {
      setLinkStatus('expired');
      return;
    }

    let sessionReady = false;
    let detectedUser = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        detectedUser = session.user;
        sessionReady = true;
      }
    });

    const maxWait = 8000;
    const pollInterval = 150;
    let waited = 0;

    const poll = setInterval(() => {
      waited += pollInterval;
      if (sessionReady || waited >= maxWait) {
        clearInterval(poll);
        subscription?.unsubscribe();

        if (sessionReady && detectedUser) {
          localStorage.setItem('justConfirmedEmail', 'true');
          setLinkStatus('ready');
        } else if (hadUserOnMount.current) {
          setLinkStatus('already-confirmed');
        } else {
          setLinkStatus('needs-login');
        }
      }
    }, pollInterval);

    return () => {
      clearInterval(poll);
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If this person already has a mission saved, skip straight to Finished.
  useEffect(() => {
    if (linkStatus !== 'ready' || checkedExistingMission || !user) return;

    const checkMission = async () => {
      try {
        const { data } = await supabase
          .from('missions')
          .select('id, title')
          .eq('user_id', user.id)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const found = data?.[0];
        if (found?.title?.trim()) {
          navigate('/auth/finished', { replace: true });
          return;
        }
      } catch (err) {
        // If the check fails, fall through to showing the form - saving
        // is still safe (it's an upsert-style update), just not able to
        // skip ahead.
      }
      setCheckedExistingMission(true);
    };

    checkMission();
  }, [linkStatus, user, checkedExistingMission, navigate]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    const next = Math.min(Math.max(textareaRef.current.scrollHeight, 96), 150);
    textareaRef.current.style.height = `${next}px`;
  }, [missionValue]);

  const handleExampleClick = (text) => {
    setMissionValue(text.slice(0, MAX_MISSION_LENGTH));
    setMissionError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = missionValue.trim();
    if (!trimmed) {
      setMissionError('Write your mission to continue.');
      setShakeToken((t) => t + 1);
      return;
    }

    setIsSaving(true);
    try {
      await updateMission(trimmed, true);
      navigate('/auth/finished');
    } catch (err) {
      setMissionError('Could not save your mission. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const atLimit = missionValue.length >= MAX_MISSION_LENGTH;
  const firstName = user?.user_metadata?.first_name || '';

  if (linkStatus === 'checking') {
    return (
      <LinkState headline="CONFIRMING…" sub="One moment while we confirm your email.">
        <span />
      </LinkState>
    );
  }

  if (linkStatus === 'expired') {
    return (
      <LinkState headline="THAT LINK HAS EXPIRED." sub="Confirmation links only work for a little while. Send a new one from the sign-up screen.">
        <AuthGhostButton to="/auth/sign-up/account">Back to sign up</AuthGhostButton>
      </LinkState>
    );
  }

  if (linkStatus === 'needs-login') {
    return (
      <LinkState headline="EMAIL CONFIRMED." sub="Log in to finish setting up.">
        <AuthPrimaryButton onClick={() => navigate('/auth/login')}>Log In</AuthPrimaryButton>
      </LinkState>
    );
  }

  if (linkStatus === 'already-confirmed') {
    return (
      <LinkState headline="YOU ARE ALREADY CONFIRMED." sub="Log in to continue to your account.">
        <AuthPrimaryButton onClick={() => navigate('/auth/login')}>Log In</AuthPrimaryButton>
      </LinkState>
    );
  }

  if (!checkedExistingMission) {
    return (
      <LinkState headline="EMAIL CONFIRMED." sub="One moment.">
        <span />
      </LinkState>
    );
  }

  return (
    <AuthShell
      step={3}
      topBar="none"
      align="center"
      headline="WHAT IS YOUR MISSION?"
      sub="One sentence about what you are here to do. It stays with you at the top of every page."
    >
      <div className="auth-confirmed-row">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-confirmed-tick" />
        </svg>
        <span>Email Confirmed</span>
      </div>

      <div className="auth-mission-card">
        <div className="auth-mission-card-label">Your Mission</div>
        <div className="auth-mission-card-text">
          {missionValue.trim() ? missionValue : <span className="auth-mission-card-placeholder">It will appear here as you type.</span>}
        </div>
      </div>

      <form onSubmit={handleSave} noValidate>
        <div className="auth-field">
          <label htmlFor="mission-textarea" className="auth-field-label">Your Mission</label>
          <textarea
            id="mission-textarea"
            ref={textareaRef}
            className={`auth-input auth-mission-textarea${missionError ? ' error' : ''}${textareaShaking ? ' shake' : ''}`}
            value={missionValue}
            onChange={(e) => {
              setMissionValue(e.target.value.slice(0, MAX_MISSION_LENGTH));
              if (missionError) setMissionError('');
            }}
            placeholder="Type here"
            maxLength={MAX_MISSION_LENGTH}
          />
          <div className="auth-mission-counter-row">
            <span>Short and clear works best.</span>
            <span className={atLimit ? 'at-limit' : ''}>{missionValue.length}/{MAX_MISSION_LENGTH}</span>
          </div>
          {missionError && <p className="auth-field-error">{missionError}</p>}
        </div>

        <p className="auth-spark-label">Need a spark?</p>
        <div className="auth-example-pills">
          {EXAMPLE_MISSIONS.map((text) => (
            <button
              key={text}
              type="button"
              className="auth-example-pill"
              onClick={() => handleExampleClick(text)}
            >
              {text}
            </button>
          ))}
        </div>

        <AuthPrimaryButton type="submit" loading={isSaving}>
          Save My Mission
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
