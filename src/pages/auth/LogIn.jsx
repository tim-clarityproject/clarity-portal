import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField, AuthPasswordField } from '../../components/auth/AuthField';
import { AuthPrimaryButton, AuthTextLink } from '../../components/auth/AuthButton';

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
//
// "Forgot password?" - there is no existing forgot-password flow
// anywhere in this codebase (confirmed by searching the repo before
// building this). Rather than invent a new multi-screen reset flow
// that wasn't specified anywhere in this task's screen list, this
// wires the link directly to Supabase's own
// supabase.auth.resetPasswordForEmail(), which is the standard,
// already-available building block - and shows a small inline
// confirmation in this same screen's style. See the final summary for
// the one thing this does NOT include: a page to actually set a new
// password after clicking the reset email's link.
export default function LogIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetSending, setResetSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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
        navigate('/auth/welcome-back');
        return;
      }

      if (signInError.status === 400 || signInError.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (signInError.status === 401) {
        setError('Email not confirmed. Check your email for verification link.');
      } else {
        setError(signInError.message || 'Login failed. Please try again.');
      }
      setShakeToken((t) => t + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setResetMessage('Enter your email above first.');
      return;
    }
    setResetSending(true);
    setResetMessage('');
    try {
      await supabase.auth.resetPasswordForEmail(email.trim());
    } catch (err) {
      // Deliberately don't reveal whether the email exists.
    } finally {
      setResetSending(false);
      setResetMessage('If an account exists for that email, a reset link has been sent.');
    }
  };

  return (
    <AuthShell
      topBar="mark"
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
          labelExtra={
            <AuthTextLink type="button" onClick={handleForgotPassword}>
              {resetSending ? 'Sending…' : 'Forgot password?'}
            </AuthTextLink>
          }
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />

        {resetMessage && <p className="auth-field-error" style={{ color: 'var(--text-2)' }}>{resetMessage}</p>}
        {error && <p className="auth-field-error" data-testid="login-error">{error}</p>}

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
    </AuthShell>
  );
}
