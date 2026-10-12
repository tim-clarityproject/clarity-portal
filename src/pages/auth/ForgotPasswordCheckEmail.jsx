import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthGhostButton, AuthTextLink } from '../../components/auth/AuthButton';
import { EnvelopeIcon } from './CheckYourEmail';

const RESEND_SECONDS = 30;

// Screen 2 of the password reset journey. Same shape as the sign-up
// CheckYourEmail.jsx (same envelope icon, same resend-cooldown
// mechanic) - calls resetPasswordForEmail again instead of
// auth.resend(), and never reveals whether the account exists, matching
// screen 1's own behaviour.
export default function ForgotPasswordCheckEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = location.state || {};
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [hasResent, setHasResent] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch (err) {
      // Deliberately don't reveal whether the email exists - same as
      // screen 1, a resend failure here isn't shown differently either.
    } finally {
      setHasResent(true);
      setSecondsLeft(RESEND_SECONDS);
      setResending(false);
    }
  };

  const buttonLabel = secondsLeft > 0
    ? (hasResent ? `Sent. Resend in ${secondsLeft}s` : `Resend in ${secondsLeft}s`)
    : 'Resend Email';

  return (
    <AuthShell
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="center"
      headline="CHECK YOUR EMAIL."
      sub={
        <>
          If there is an account for <span style={{ color: 'var(--text)' }}>{email || 'that email'}</span>, we have sent a link to set a new password.
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <EnvelopeIcon />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <AuthGhostButton
          onClick={handleResend}
          disabled={secondsLeft > 0 || resending}
        >
          {buttonLabel}
        </AuthGhostButton>

        <AuthTextLink to="/forgot-password">Use a different email</AuthTextLink>
      </div>

      <p className="auth-tip">
        Cannot see it? Check your spam or junk folder. The link works once and expires after an hour.
      </p>
    </AuthShell>
  );
}
