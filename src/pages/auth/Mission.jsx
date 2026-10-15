import { useState, useEffect, useLayoutEffect, useCallback, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPrimaryButton, AuthTextLink } from '../../components/auth/AuthButton';
import { useShake } from '../../components/auth/AuthField';
import { ClockIcon } from './ResetPassword';

const MAX_MISSION_LENGTH = 70;
const IDEAS_PER_GROUP = 3;

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
function LinkState({ beforeHeadline, columnClassName, headline, sub, children }) {
  return (
    <AuthShell
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="center"
      columnClassName={columnClassName}
      beforeHeadline={beforeHeadline}
      headline={headline}
      sub={sub}
    >
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
  const [ideaGroup, setIdeaGroup] = useState(0);
  const [saveBarHeight, setSaveBarHeight] = useState(0);
  const textareaRef = useRef(null);
  const saveBarElRef = useRef(null);
  const saveBarObserverRef = useRef(null);
  const hasProcessedCodeRef = useRef(false);
  const cardShaking = useShake(shakeToken);

  // The save bar is position:fixed (see the CSS comment on
  // .auth-sticky-save for why not sticky), so it no longer occupies
  // space in the form's normal flow - this measures its real rendered
  // height and reserves that much padding at the foot of the form so
  // scrolled content (the last idea pill, the "Show other ideas" link)
  // never ends up hidden behind it, on any screen size.
  const measureSaveBar = useCallback(() => {
    if (saveBarElRef.current) {
      setSaveBarHeight(saveBarElRef.current.getBoundingClientRect().height);
    }
  }, []);

  // A callback ref, not a plain useRef + effect-with-a-dependency-array:
  // the real save bar only mounts once BOTH linkStatus is 'ready' AND
  // the existing-mission check below has resolved - a dependency array
  // was guessing which state change to watch for, and the one here
  // before this fix (just [linkStatus]) missed the second gate, so
  // saveBarElRef.current was still null every time it ran. React calls
  // a callback ref with the real node the moment it exists however
  // that came to be, and with null when it is removed, so this is
  // always attached to whatever is actually in the DOM - no dependency
  // array to get wrong, and it cleans up its own ResizeObserver on
  // every detach, including final unmount.
  const setSaveBarRef = useCallback((node) => {
    saveBarObserverRef.current?.disconnect();
    saveBarObserverRef.current = null;
    saveBarElRef.current = node;
    if (!node) return;
    measureSaveBar();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureSaveBar);
      observer.observe(node);
      saveBarObserverRef.current = observer;
    }
  }, [measureSaveBar]);

  useLayoutEffect(() => {
    measureSaveBar();
  }, [measureSaveBar]);

  useEffect(() => {
    window.addEventListener('resize', measureSaveBar);
    document.fonts?.ready?.then(measureSaveBar);
    return () => window.removeEventListener('resize', measureSaveBar);
  }, [measureSaveBar]);

  useEffect(() => {
    // StrictMode (dev) mounts, runs this effect, cleans it up, then runs
    // it again on the same component instance - this ref makes sure the
    // code exchange / session poll below only ever actually runs once per
    // real visit, not twice. (Deliberately not paired with a
    // cancelled-in-cleanup flag: that combination would cancel the one
    // real run partway through its own StrictMode-simulated cleanup,
    // since the ref then blocks the second invocation from starting a
    // replacement run - confirmed by testing, it left the screen stuck on
    // "Confirming..." forever in dev. The code exchange itself is a
    // one-shot read of the URL/session, safe to let finish regardless.)
    if (hasProcessedCodeRef.current) return;
    hasProcessedCodeRef.current = true;

    const errorCode = searchParams.get('error_code');
    const error = searchParams.get('error');
    // Whether THIS url actually carried a one-time confirmation code/token -
    // used below to tell "this code was already used or is invalid" apart
    // from "a bare visit to this page with nothing to confirm".
    const hadCodeParam = Boolean(searchParams.get('code') || searchParams.get('token_hash'));

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const finishReady = (setFlag) => {
      if (setFlag) localStorage.setItem('justConfirmedEmail', 'true');
      // Strip the one-time code/token out of the address bar now that it
      // has done its job, so a refresh (or this effect somehow running
      // again) never re-processes an already-used code. Done with the raw
      // History API, not react-router's navigate, so this is a pure URL
      // cleanup with no route transition.
      window.history.replaceState(null, '', '/auth/mission');
      setLinkStatus('ready');
    };

    const run = async () => {
      if (error || errorCode) {
        setLinkStatus('expired');
        return;
      }

      // If a valid session already exists right now - either this person
      // was already logged in, or the code in this URL was already
      // exchanged for a session (e.g. this effect is running again after
      // a refresh, or the user was bounced back here after already
      // confirming) - skip the confirming/polling dance entirely and
      // continue straight into the mission form. A real, current session
      // always wins over showing "Confirming..." or "already confirmed".
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession?.user) {
        finishReady(false);
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
      while (!sessionReady && waited < maxWait) {
        await sleep(pollInterval);
        waited += pollInterval;
      }
      subscription?.unsubscribe();

      if (sessionReady && detectedUser) {
        finishReady(true);
        return;
      }

      // One more direct check before giving up - covers a session that
      // arrived via an event this listener did not treat as SIGNED_IN
      // (e.g. INITIAL_SESSION on some timings).
      const { data: { session: lateSession } } = await supabase.auth.getSession();
      if (lateSession?.user) {
        finishReady(false);
        return;
      }

      if (hadCodeParam) {
        // A code was present in this URL but never produced a session -
        // it has already been used, or is invalid.
        setLinkStatus('already-confirmed');
      } else {
        // No code in the URL at all, and no session - a bare visit to
        // this page with nothing to confirm.
        setLinkStatus('needs-login');
      }
    };

    run();
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
          // Done with this flag - see the comment on the same line in
          // handleSave below for why it must not survive past this step.
          localStorage.removeItem('justConfirmedEmail');
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
    const next = Math.min(Math.max(textareaRef.current.scrollHeight, 30), 150);
    textareaRef.current.style.height = `${next}px`;
  }, [missionValue]);

  const handleExampleClick = (text) => {
    setMissionValue(text.slice(0, MAX_MISSION_LENGTH));
    setMissionError('');
    textareaRef.current?.focus();
  };

  const handleShowOtherIdeas = () => {
    const groupCount = Math.ceil(EXAMPLE_MISSIONS.length / IDEAS_PER_GROUP);
    setIdeaGroup((g) => (g + 1) % groupCount);
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
      // This flag's only remaining reader once we leave this screen is
      // App.jsx's leftover-flag redirect (there for the OLD
      // /email-confirmation -> /onboarding-mission handoff). If it is
      // still set once the user reaches Welcome/Home (outside /auth/),
      // that effect bounces them straight back to this screen, which is
      // exactly the "shows Confirming... then already confirmed, asking
      // to log in" bug this fixes - so it must not survive past here.
      localStorage.removeItem('justConfirmedEmail');
      navigate('/auth/finished');
    } catch (err) {
      setMissionError('Could not save your mission. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const atLimit = missionValue.length >= MAX_MISSION_LENGTH;
  const visibleIdeas = Array.from({ length: IDEAS_PER_GROUP }, (_, i) => {
    return EXAMPLE_MISSIONS[(ideaGroup * IDEAS_PER_GROUP + i) % EXAMPLE_MISSIONS.length];
  });

  if (linkStatus === 'checking') {
    return (
      <LinkState headline="CONFIRMING…" sub="One moment while we confirm your email.">
        <span />
      </LinkState>
    );
  }

  if (linkStatus === 'expired') {
    return (
      <LinkState
        columnClassName="cc"
        beforeHeadline={<ClockIcon />}
        headline="THAT LINK HAS EXPIRED."
        sub="Confirmation links only work for a little while. Go back to sign up and we will send you a fresh one."
      >
        <AuthPrimaryButton onClick={() => navigate('/auth/sign-up/account')}>Back to sign up</AuthPrimaryButton>
        <AuthTextLink className="quiet" onClick={() => navigate('/auth/login')} style={{ justifyContent: 'center', width: '100%' }}>
          Already confirmed? Log in
        </AuthTextLink>
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
    <>
    <AuthShell
      step={3}
      topBar="none"
      align="center"
      columnClassName="mc"
      beforeHeadline={(
        <div className="auth-confirmed-row">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-confirmed-tick" />
          </svg>
          <span>Email Confirmed</span>
        </div>
      )}
      headline="WHAT IS YOUR MISSION?"
      sub="One sentence about what you are here to do."
    >
      <form id="mission-form" onSubmit={handleSave} noValidate style={{ paddingBottom: saveBarHeight ? `${saveBarHeight + 16}px` : undefined }}>
        <div className={`auth-mission-card auth-mission-card--input${missionError ? ' error' : ''}${cardShaking ? ' shake' : ''}`}>
          <label htmlFor="mission-textarea" className="auth-mission-card-label">Your Mission</label>
          <textarea
            id="mission-textarea"
            ref={textareaRef}
            className="auth-mission-card-input"
            value={missionValue}
            onChange={(e) => {
              setMissionValue(e.target.value.slice(0, MAX_MISSION_LENGTH));
              if (missionError) setMissionError('');
            }}
            placeholder="Type your mission here"
            maxLength={MAX_MISSION_LENGTH}
            rows={1}
            aria-label="Your mission"
          />
        </div>

        <div className="auth-mission-counter-row">
          <span className={atLimit ? 'at-limit' : ''}>{missionValue.length}/{MAX_MISSION_LENGTH}</span>
        </div>

        {missionError && <p className="auth-field-error auth-mission-error" role="alert">{missionError}</p>}

        <p className="auth-spark-label">Need a spark?</p>
        <div className="auth-example-pills">
          {visibleIdeas.map((text) => (
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
        <div className="auth-more-ideas-wrap">
          <AuthTextLink type="button" onClick={handleShowOtherIdeas}>Show other ideas</AuthTextLink>
        </div>
      </form>
    </AuthShell>
    {/* Portaled to document.body (CLAUDE.md rule 17: a .ui-root of its
        own), not rendered inside the form above - the form picks up
        .auth-rise's entrance animation (opacity + translateY) from
        AuthShell's auto-wrapping, and an animated `transform` on an
        ancestor makes that ancestor the containing block for any
        position:fixed descendant for the animation's duration. With
        the save bar nested inside the form, "bottom:0" resolved
        against the FORM's own box instead of the viewport while that
        animation was active, leaving it floating well above the
        window's true bottom edge. Portaling it out removes it from
        that ancestor chain entirely, regardless of what AuthShell's
        shared entrance animation does. The submit button keeps working
        via the `form` attribute, which submits by form id regardless
        of DOM position. */}
    {createPortal(
      <div className="ui-root">
        <div className="auth-sticky-save" ref={setSaveBarRef}>
          <AuthPrimaryButton type="submit" form="mission-form" loading={isSaving}>
            Save my mission
          </AuthPrimaryButton>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
