import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPasswordField, useShake } from '../../components/auth/AuthField';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';

const NEW_PASSWORD_FIELD_ID = 'reset-password-new';
const CONFIRM_PASSWORD_FIELD_ID = 'reset-password-confirm';

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 14) score += 1;
  return score;
}

function ClockIcon() {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r="32" className="auth-clock-face" />
      <path d="M42 24v18l14 8" className="auth-clock-hands" />
    </svg>
  );
}

// Screens 3 (form), 4 (success) and 5 (expired) of the password reset
// journey all live on this one route, /auth/reset-password - mirroring
// how src/pages/auth/Mission.jsx already handles several distinct
// outcomes of a single emailed link (checking/expired/needs-login/
// already-confirmed/ready) under one route rather than separate ones.
function Centered({ topBar = 'back', headline, sub, children }) {
  return (
    <AuthShell topBar={topBar} backTo="/auth/login" backLabel="← Log in" align="center" headline={headline} sub={sub}>
      {children}
    </AuthShell>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // checking | ready | updated | expired
  const [status, setStatus] = useState('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const hasProcessedRef = useRef(false);

  const strength = passwordStrength(newPassword);

  // Detects the recovery session two ways, per the task brief: the
  // PASSWORD_RECOVERY auth event (fired when supabase-js exchanges the
  // emailed link's code/token for a session), and/or a session that
  // already exists by the time this effect runs (covers detectSessionInUrl
  // having already processed the URL before this component mounted, and
  // also covers a user who already has an ordinary logged-in session -
  // see the mini-audit note on that in the task summary). Checks both the
  // query string AND the hash fragment for an error/error_code, since an
  // expired or already-used link can arrive either way depending on
  // Supabase's flow and template configuration.
  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const linkError = searchParams.get('error') || searchParams.get('error_code')
      || hashParams.get('error') || hashParams.get('error_code');

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const run = async () => {
      if (linkError) {
        setStatus('expired');
        return;
      }

      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession?.user) {
        setStatus('ready');
        return;
      }

      let resolved = false;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session?.user) {
          resolved = true;
          setStatus('ready');
        }
      });

      const maxWait = 6000;
      const pollInterval = 150;
      let waited = 0;
      while (!resolved && waited < maxWait) {
        await sleep(pollInterval);
        waited += pollInterval;
        if (resolved) break;
        const { data: { session: late } } = await supabase.auth.getSession();
        if (late?.user) {
          resolved = true;
          setStatus('ready');
          break;
        }
      }
      subscription?.unsubscribe();

      if (!resolved) setStatus('expired');
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const pwError = newPassword.length >= 8 ? '' : 'Use at least 8 characters.';
    let confirmError = '';
    if (!confirmPassword) {
      confirmError = 'Type your new password again.';
    } else if (newPassword !== confirmPassword) {
      confirmError = 'The two passwords do not match.';
    }

    setNewPasswordError(pwError);
    setConfirmPasswordError(confirmError);

    if (pwError || confirmError) {
      setShakeToken((t) => t + 1);
      document.getElementById(pwError ? NEW_PASSWORD_FIELD_ID : CONFIRM_PASSWORD_FIELD_ID)?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setFormError(error.message || 'Could not update your password. Please try again.');
        setShakeToken((t) => t + 1);
        return;
      }

      await supabase.auth.signOut();
      setStatus('updated');
    } catch (err) {
      setFormError(err.message || 'Could not update your password. Please try again.');
      setShakeToken((t) => t + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'checking') {
    return (
      <Centered topBar="none" headline="ONE MOMENT…" sub="Checking your link.">
        <span />
      </Centered>
    );
  }

  if (status === 'expired') {
    return (
      <Centered
        headline="THIS LINK HAS EXPIRED."
        sub="Reset links work once, for one hour. Request a new one and we will send it straight away."
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ClockIcon />
        </div>

        <AuthPrimaryButton onClick={() => navigate('/forgot-password')}>
          Send me a new link
        </AuthPrimaryButton>
      </Centered>
    );
  }

  if (status === 'updated') {
    return (
      <Centered
        topBar="none"
        headline="YOU ARE ALL SET."
        sub="Your new password is saved. Log in to continue."
      >
        <div className="auth-confirmed-row">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-confirmed-tick" />
          </svg>
          <span>Password updated</span>
        </div>

        <AuthPrimaryButton onClick={() => navigate('/auth/login')}>
          Log In
        </AuthPrimaryButton>
      </Centered>
    );
  }

  return (
    <AuthShell
      topBar="none"
      align="left"
      headline="SET A NEW PASSWORD."
      sub="Choose something you have not used here before."
    >
      <form onSubmit={handleSubmit} noValidate>
        <AuthPasswordField
          id={NEW_PASSWORD_FIELD_ID}
          label="New password"
          autoComplete="new-password"
          autoFocus
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (newPasswordError) setNewPasswordError('');
          }}
          placeholder="At least 8 characters"
          error={newPasswordError}
          shakeToken={shakeToken}
          visible={passwordVisible}
          onToggleVisible={setPasswordVisible}
        />

        <div className="auth-strength" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`auth-strength-seg${n <= strength ? ' filled' : ''}`} />
          ))}
        </div>
        <p className="auth-strength-hint">
          Use 8+ characters, upper and lower case, a number, and a symbol for the strongest password.
        </p>

        <AuthPasswordField
          id={CONFIRM_PASSWORD_FIELD_ID}
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (confirmPasswordError) setConfirmPasswordError('');
          }}
          placeholder="Type it again"
          error={confirmPasswordError}
          shakeToken={shakeToken}
          visible={passwordVisible}
          onToggleVisible={setPasswordVisible}
        />

        {formError && <p className="auth-field-error" role="alert" data-testid="reset-password-error">{formError}</p>}

        <AuthPrimaryButton type="submit" loading={isSubmitting}>
          Update password
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
