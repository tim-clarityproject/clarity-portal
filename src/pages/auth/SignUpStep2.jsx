import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField, AuthPasswordField, useShake } from '../../components/auth/AuthField';
import { AuthPrimaryButton, AuthGhostButton } from '../../components/auth/AuthButton';
import ReadingPopup from '../../components/auth/ReadingPopup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 14) score += 1;
  return score;
}

function Checkbox({ checked, onChange, error, shakeToken }) {
  const shaking = useShake(shakeToken ?? error);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`auth-checkbox${checked ? ' checked' : ''}${error ? ' error' : ''}${shaking ? ' shake' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <svg viewBox="0 0 20 20" width="12" height="12" className="auth-checkbox-tick" aria-hidden="true">
        <path d="M4 10.5l3.5 3.5L16 6" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// New Welcome-flow sign-up, step 2 of 3. Calls supabase.auth.signUp()
// directly (not AuthContext.signup()) because this step needs a
// different options.data shape (terms_accepted/_at/_documents) and a
// different options.emailRedirectTo (the new mission-step URL, not the
// old /email-confirmation) than the existing signup() function already
// provides to the old Login.jsx flow - reusing it here would mean
// branching its behaviour for two different callers. AuthContext.signup()
// itself is untouched.
export default function SignUpStep2() {
  const navigate = useNavigate();
  const location = useLocation();
  const { firstName, lastName } = location.state || {};
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [readingTab, setReadingTab] = useState(null);

  const strength = passwordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const emError = EMAIL_RE.test(email.trim()) ? '' : 'Enter a valid email address.';
    const pwError = password.length >= 8 ? '' : 'Use at least 8 characters.';
    const tError = termsAccepted ? '' : 'Please accept to continue.';

    setEmailError(emError);
    setPasswordError(pwError);
    setTermsError(tError);

    if (emError || pwError || tError) {
      setShakeToken((t) => t + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const missionStepUrl = `${window.location.origin}/auth/mission`;
      const nowIso = new Date().toISOString();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: missionStepUrl,
          data: {
            first_name: firstName || '',
            last_name: lastName || '',
            terms_accepted: true,
            terms_accepted_at: nowIso,
            terms_documents: ['Terms of Service', 'Privacy Policy', 'Data Storage Notice'],
          },
        },
      });

      if (error) {
        if (error.message?.includes('already registered') || error.status === 422) {
          setFormError('An account with this email already exists. Try logging in instead.');
        } else {
          setFormError(error.message || 'Could not create your account. Please try again.');
        }
        setShakeToken((t) => t + 1);
        return;
      }

      navigate('/auth/check-email', { state: { email: email.trim(), firstName, lastName } });
    } catch (err) {
      setFormError(err.message || 'Could not create your account. Please try again.');
      setShakeToken((t) => t + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      step={2}
      topBar="back"
      backTo="/auth/sign-up"
      backLabel="← Back"
      align="left"
      headline="CREATE YOUR LOGIN."
      sub="One email and one password. That is all."
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
          error={emailError}
          shakeToken={shakeToken}
        />

        <AuthPasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          error={passwordError}
          shakeToken={shakeToken}
        />

        <div className="auth-strength" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`auth-strength-seg${n <= strength ? ' filled' : ''}`} />
          ))}
        </div>
        <p className="auth-strength-hint">
          Use 8+ characters, upper and lower case, a number, and a symbol for the strongest password.
        </p>

        <div className="auth-terms-row">
          <Checkbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            error={termsError}
            shakeToken={shakeToken}
          />
          <p className="auth-terms-text">
            I agree to the{' '}
            <button type="button" className="auth-terms-link" onClick={() => setReadingTab('terms')}>
              Terms of Service
            </button>
            , the{' '}
            <button type="button" className="auth-terms-link" onClick={() => setReadingTab('privacy')}>
              Privacy Policy
            </button>
            , and the{' '}
            <button type="button" className="auth-terms-link" onClick={() => setReadingTab('dataStorage')}>
              Data Storage Notice
            </button>
            .
          </p>
        </div>
        {termsError && <p className="auth-field-error">{termsError}</p>}

        {formError && <p className="auth-field-error" data-testid="signup-error">{formError}</p>}

        <AuthPrimaryButton type="submit" loading={isSubmitting}>
          Create My Account
        </AuthPrimaryButton>
      </form>

      <ReadingPopup
        isOpen={readingTab !== null}
        initialTab={readingTab || 'terms'}
        onClose={() => setReadingTab(null)}
        onAgree={() => setTermsAccepted(true)}
      />
    </AuthShell>
  );
}
