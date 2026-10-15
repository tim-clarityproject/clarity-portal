import { useEffect, useContext, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/auth/AuthShell';
import { AuthPrimaryButton, AuthTextLink } from '../components/auth/AuthButton';
import { ClockIcon } from './auth/ResetPassword';

export default function EmailConfirmation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useContext(AuthContext);
  const [status, setStatus] = useState('confirming'); // 'confirming', 'success', 'error'
  const [message, setMessage] = useState('');
  const hasProcessedCodeRef = useRef(false);

  useEffect(() => {
    // StrictMode (dev) mounts, unmounts and remounts every component once -
    // this guard means the code exchange / session poll below only ever
    // runs its logic once per real visit, not twice.
    if (hasProcessedCodeRef.current) return;
    hasProcessedCodeRef.current = true;

    const succeed = () => {
      // Strip the one-time code/token out of the address bar now that it
      // has done its job, so a refresh never re-processes an already-used
      // code. Done with the raw History API, not react-router's navigate,
      // so this is a pure URL cleanup with no route transition.
      window.history.replaceState(null, '', '/email-confirmation');
      localStorage.removeItem('pendingSignupName');
      setStatus('success');
      setMessage('Email confirmed.');
      setTimeout(() => {
        navigate('/auth/mission');
      }, 1000);
    };

    const handleEmailConfirmation = async () => {
      try {
        // Check for error parameters in URL (from Supabase if something went wrong)
        const errorCode = searchParams.get('error_code');
        const error = searchParams.get('error');
        if (error || errorCode) {
          console.error('[EmailConfirmation] Error in URL:', { error, errorCode });
          setStatus('error');
          setMessage(
            errorCode === 'otp_expired'
              ? 'The confirmation link has expired. Please sign up again.'
              : error || 'Email confirmation failed. Please try signing up again.'
          );
          return;
        }

        // If a valid session already exists right now - either this
        // person was already logged in, or the code in this URL was
        // already exchanged for a session (e.g. this effect is running
        // again after a refresh) - skip straight to the success path
        // instead of showing "Confirming..." or an "already confirmed"
        // error over a session that is actually valid.
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession?.user) {
          succeed();
          return;
        }

        // CRITICAL: Set the justConfirmedEmail flag FIRST, before anything else
        // This ensures it's available in localStorage even before session is fully processed
        localStorage.setItem('justConfirmedEmail', 'true');
        console.log('[EmailConfirmation] Flag set: justConfirmedEmail = true');

        // CRITICAL: Wait for the onAuthStateChange event to fire
        // Supabase's detectSessionInUrl processes the token asynchronously
        // We need to wait for the session to actually be created and the listener to fire
        // Rather than calling getSession() immediately (which might return null if still processing)
        let sessionReady = false;
        let sessionError = null;
        let detectedUser = null;

        // Listen for the auth state change event (fired when token is processed)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[EmailConfirmation] Auth state changed:', event, 'has session?', !!session?.user);

            if (event === 'SIGNED_IN' && session?.user) {
              // Token was successfully exchanged for a session
              console.log('✓ Email confirmed and session established');
              console.log('[EmailConfirmation] User:', session.user.email, 'ID:', session.user.id);
              detectedUser = session.user;
              sessionReady = true;
            } else if (event === 'SIGNED_IN') {
              // SIGNED_IN but no user - something is wrong
              sessionError = 'Session created but no user data';
              sessionReady = true;
            }
          }
        );

        // Poll for session ready or timeout after 10 seconds
        let waitTime = 0;
        const maxWait = 10000; // 10 second timeout
        const pollInterval = 100;

        while (!sessionReady && waitTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          waitTime += pollInterval;
        }

        // Clean up the subscription
        subscription?.unsubscribe();

        if (sessionError || !detectedUser) {
          // One more direct check before giving up - covers a session
          // that arrived via an event this listener did not treat as
          // SIGNED_IN (e.g. INITIAL_SESSION on some timings). Only show
          // the dead-end "already confirmed" error if there really is no
          // session now.
          const { data: { session: lateSession } } = await supabase.auth.getSession();
          if (lateSession?.user) {
            succeed();
            return;
          }

          console.error('[EmailConfirmation] Session error or timeout:', sessionError);
          setStatus('error');
          setMessage(
            sessionError || 'Email confirmation timed out. The link may have expired. Please try signing up again.'
          );
          return;
        }

        // CRITICAL: Don't do profile UPSERT here - AuthContext handles it
        // Multiple simultaneous UPSERT calls cause 409 conflicts
        // AuthContext's onAuthStateChange listener will:
        // 1. See the SIGNED_IN event (from detectSessionInUrl)
        // 2. Read justConfirmedEmail flag from localStorage
        // 3. Do the profile UPSERT with names from user_metadata and terms_accepted=true
        // 4. Call loadUserData to sync other tables
        succeed();
      } catch (err) {
        console.error('Email confirmation exception:', err);
        setStatus('error');
        setMessage(err.message || 'An error occurred during email confirmation. Please try again.');
      }
    };

    handleEmailConfirmation();
  }, [navigate]);

  // Presentation only - the confirmation logic above is untouched. The
  // wording follows the welcome-flow mock-up's "expired" screen; the
  // other states reuse the same AuthShell layout as the rest of the
  // sign-up flow (see ResetPassword.jsx for the same pattern).
  const isExpired = status === 'error' && /expired|timed out/i.test(message);

  if (status === 'confirming') {
    return (
      <AuthShell topBar="none" align="center" columnClassName="cc" headline="ONE MOMENT…" sub="Confirming your email address.">
        <span />
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell
        topBar="none"
        align="center"
        columnClassName="cc"
        beforeHeadline={(
          <div className="auth-confirmed-row">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-confirmed-tick" />
            </svg>
            <span>Email confirmed</span>
          </div>
        )}
        headline="YOU ARE IN."
        sub="Taking you to your mission."
      >
        <span />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="center"
      columnClassName="cc"
      beforeHeadline={<ClockIcon />}
      headline={isExpired ? 'THAT LINK HAS EXPIRED.' : 'WE COULD NOT CONFIRM YOUR EMAIL.'}
      sub={isExpired
        ? 'Confirmation links only work for a little while. If you have not confirmed yet, go back to sign up and we will send you a fresh one.'
        : (message || 'Something went wrong while confirming your email.')}
    >
      <AuthPrimaryButton onClick={() => navigate('/auth/login')}>
        Log in
      </AuthPrimaryButton>
      <p className="auth-tip">
        If you opened the link on a different device, your email may already be confirmed - try logging in.
      </p>
      <div>
        <AuthTextLink onClick={() => navigate('/auth/sign-up')} style={{ justifyContent: 'center' }}>
          Back to sign up
        </AuthTextLink>
      </div>
    </AuthShell>
  );
}
