import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthGhostButton, AuthTextLink } from '../../components/auth/AuthButton';

const RESEND_SECONDS = 30;

export function EnvelopeIcon() {
  return (
    <svg
      className="auth-envelope"
      width="84"
      height="84"
      viewBox="0 0 84 84"
      fill="none"
      aria-hidden="true"
    >
      <rect x="10" y="22" width="64" height="44" rx="4" className="auth-envelope-body" />
      <path d="M10 26l32 24 32-24" className="auth-envelope-flap" />
    </svg>
  );
}

export default function CheckYourEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, firstName, lastName } = location.state || {};
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
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
    setResendMessage('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        // Same redirect as the original sign-up (SignUpStep2.jsx), so a
        // resent link lands on the themed mission step, not the Site URL.
        options: { emailRedirectTo: `${window.location.origin}/auth/mission` },
      });
      if (error) {
        setResendMessage(error.message || 'That email didn’t send. Check your connection and try again.');
      } else {
        setResendMessage('Email resent.');
        setSecondsLeft(RESEND_SECONDS);
      }
    } catch (err) {
      setResendMessage(err.message || 'That email didn’t send. Check your connection and try again.');
    } finally {
      setResending(false);
    }
  };

  const handleDifferentEmail = () => {
    navigate('/auth/sign-up/account', { state: { firstName, lastName, email } });
  };

  return (
    <AuthShell
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="center"
      columnClassName="cc"
      beforeHeadline={<EnvelopeIcon />}
      headline="CHECK YOUR EMAIL."
      sub={
        <>
          We have sent a confirmation link to <span style={{ color: 'var(--text)' }}>{email || 'your email'}</span>. Open it to confirm your account.
        </>
      }
    >
      <div className="auth-stack">
        <AuthGhostButton
          onClick={handleResend}
          disabled={secondsLeft > 0 || resending}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend Email'}
        </AuthGhostButton>

        {resendMessage && <p className="auth-field-error" style={{ color: 'var(--text-2)' }}>{resendMessage}</p>}

        <AuthTextLink onClick={handleDifferentEmail} style={{ justifyContent: 'center' }}>Use a different email</AuthTextLink>
      </div>

      <p className="auth-tip">
        Cannot see it? Check your spam or junk folder. The link works for 24 hours.
      </p>
    </AuthShell>
  );
}
