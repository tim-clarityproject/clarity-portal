import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { sessionManager } from '../../lib/sessionManager';
import { dataSyncManager } from '../../lib/dataSyncManager';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField, AuthPasswordField } from '../../components/auth/AuthField';
import { AuthPrimaryButton, AuthTextLink } from '../../components/auth/AuthButton';
import LegalFooterLinks from '../../components/legal/LegalFooterLinks';

// New Welcome-flow log in screen. Calls supabase.auth.signInWithPassword()
// directly - the same underlying Supabase call AuthContext.login() makes -
// rather than going through that shared wrapper. AuthContext.login() sets
// its own isLoading flag, and App.jsx's root AppContent does
// `if (isLoading) return <Loading/>`, which unmounts the ENTIRE routed
// page (including whichever page is calling login()) for the brief
// moment isLoading is true, then remounts a fresh instance when it goes
// false again. Confirmed this with a mount/unmount log during testing:
// the login page actually unmounts and remounts around the await, so
// any setError() call made with the result lands on an instance that's
// already gone - the error silently never appeared. Calling
// signInWithPassword directly avoids ever touching that shared
// isLoading flag, so this page is never swapped out mid-submit. The
// error-message mapping below is copied from AuthContext.login()'s own
// catch block so the wording matches "the existing error handling"
// exactly; a successful sign-in still flows into AuthContext normally,
// because its onAuthStateChange listener (already subscribed app-wide)
// picks up the same SIGNED_IN event regardless of what triggered it.
export default function LogIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsConfirmation(false);
    setResendNote('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      setShakeToken((t) => t + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!signInError) {
        // Replicates the two steps AuthContext.login() does after a
        // successful signInWithPassword, which this screen otherwise skips
        // by calling supabase.auth.signInWithPassword() directly (see the
        // file-level comment above for why it can't call login() itself).
        // Wrapped separately so a caching failure here can't stop a
        // successful sign-in from reaching Welcome back.
        try {
          const session = await sessionManager.getSession();
          if (session?.user) {
            sessionManager.saveSessionMetadata(session);
            const userData = await dataSyncManager.loadUserData(session.user.id);
            localStorage.setItem('clarity-user-data', JSON.stringify(userData));
          }
        } catch (cacheErr) {
          console.error('[LogIn] Error saving session metadata / pre-caching user data:', cacheErr);
        }

        navigate('/auth/welcome-back');
        return;
      }

      // Supabase answers a wrong password and an unconfirmed email with
      // the same HTTP status (400); only the error code / message tell
      // them apart ("email_not_confirmed" / "Email not confirmed" versus
      // "invalid_credentials" / "Invalid login credentials"). Supabase
      // only returns the unconfirmed error when the password was right,
      // so this reveals nothing it did not already reveal.
      const unconfirmed = signInError.code === 'email_not_confirmed'
        || /email not confirmed/i.test(signInError.message || '');
      if (unconfirmed) {
        setNeedsConfirmation(true);
        setError('Your email address has not been confirmed yet. Open the link we sent you, or send it again below.');
      } else if (signInError.status === 400 || signInError.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(signInError.message || 'Login failed. Please try again.');
      }
      setShakeToken((t) => t + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Same redirect the original sign-up used (SignUpStep2.jsx), so the
  // resent link lands on the themed mission step.
  const handleResend = async () => {
    if (!email.trim() || isResending) return;
    setIsResending(true);
    setResendNote('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/mission` },
      });
      setResendNote(resendError
        ? (resendError.message || 'Could not send the email. Please try again.')
        : 'Done. If this address needs confirming, a new link is on its way.');
    } catch (err) {
      setResendNote(err.message || 'Could not send the email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell
      topBar="none"
      align="center"
      logo
      headline="WELCOME BACK."
      sub="Log in to continue."
    >
      <form onSubmit={handleSubmit} noValidate>
        <AuthTextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <AuthPasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />

        {error && <p className="auth-field-error" role="alert" data-testid="login-error">{error}</p>}

        {needsConfirmation && (
          <div className="auth-row2">
            <AuthTextLink onClick={handleResend} disabled={isResending}>
              {isResending ? 'Sending...' : 'Resend confirmation email'}
            </AuthTextLink>
          </div>
        )}
        {resendNote && <p className="auth-field-error" role="status" style={{ color: 'var(--text-2)' }}>{resendNote}</p>}

        <div className="auth-row2">
          <AuthTextLink to="/forgot-password">Forgot password?</AuthTextLink>
        </div>

        <AuthPrimaryButton type="submit" loading={isSubmitting}>
          Log In
        </AuthPrimaryButton>
      </form>

      <div className="auth-or-divider">
        <span />
        <span className="auth-or-label">or</span>
        <span />
      </div>

      <div style={{ textAlign: 'center' }}>
        <AuthTextLink to="/auth/sign-up">New here? Create your account</AuthTextLink>
      </div>

      <div className="auth-legal-footer-spacing">
        <LegalFooterLinks align="center" />
      </div>
    </AuthShell>
  );
}
