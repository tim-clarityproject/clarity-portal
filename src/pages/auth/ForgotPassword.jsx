import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField } from '../../components/auth/AuthField';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_FIELD_ID = 'forgot-password-email';

// Screen 1 of the password reset journey. Always navigates to screen 2
// (/forgot-password/check-email) on any syntactically valid email,
// whether or not an account exists for it - resetPasswordForEmail()
// itself never reveals that either way, by design.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Enter a valid email address.');
      setShakeToken((t) => t + 1);
      document.getElementById(EMAIL_FIELD_ID)?.focus();
      return;
    }
    setEmailError('');

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        setFormError('Something went wrong. Please try again.');
        setShakeToken((t) => t + 1);
        return;
      }

      navigate('/forgot-password/check-email', { state: { email: trimmed } });
    } catch (err) {
      setFormError('Something went wrong. Please try again.');
      setShakeToken((t) => t + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="center"
      headline="FORGOT YOUR PASSWORD?"
      sub="Enter your email and we will send you a link to set a new one."
    >
      <form onSubmit={handleSubmit} noValidate>
        <AuthTextField
          id={EMAIL_FIELD_ID}
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError('');
          }}
          placeholder="you@example.com"
          error={emailError}
          shakeToken={shakeToken}
        />

        {formError && <p className="auth-field-error" role="alert" data-testid="forgot-password-error">{formError}</p>}

        <AuthPrimaryButton type="submit" loading={isSubmitting}>
          Send reset link
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
