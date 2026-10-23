import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField } from '../../components/auth/AuthField';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';
import LegalFooterLinks from '../../components/legal/LegalFooterLinks';
import { limitName, NAME_MAX, NAME_TOO_LONG } from '../../lib/nameLimit';

export default function SignUpStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const [firstName, setFirstName] = useState(location.state?.firstName || '');
  const [lastName, setLastName] = useState(location.state?.lastName || '');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [shakeToken, setShakeToken] = useState(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const fnError = firstName.trim() ? '' : 'Enter your first name.';
    const lnError = lastName.trim() ? '' : 'Enter your last name.';
    setFirstNameError(fnError);
    setLastNameError(lnError);

    if (fnError || lnError) {
      setShakeToken((t) => t + 1);
      return;
    }

    navigate('/auth/sign-up/account', {
      state: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // From the Strategic Alignment Health Check's "Create your account" link.
        email: new URLSearchParams(location.search).get('email') || undefined,
      },
    });
  };

  return (
    <AuthShell
      step={1}
      topBar="back"
      backTo="/auth/login"
      backLabel="← Log in"
      align="left"
      headline="WHAT SHOULD WE CALL YOU?"
      sub="Your first and last name, please."
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-field-row">
          <AuthTextField
            label="First name"
            value={firstName}
            onChange={(e) => {
              const { value, over } = limitName(e.target.value);
              setFirstName(value);
              if (over) setFirstNameError(NAME_TOO_LONG);
              else if (firstNameError === NAME_TOO_LONG) setFirstNameError('');
            }}
            maxLength={NAME_MAX + 1}
            placeholder="John"
            error={firstNameError}
            shakeToken={shakeToken}
            autoComplete="given-name"
          />
          <AuthTextField
            label="Last name"
            value={lastName}
            onChange={(e) => {
              const { value, over } = limitName(e.target.value);
              setLastName(value);
              if (over) setLastNameError(NAME_TOO_LONG);
              else if (lastNameError === NAME_TOO_LONG) setLastNameError('');
            }}
            maxLength={NAME_MAX + 1}
            placeholder="Doe"
            error={lastNameError}
            shakeToken={shakeToken}
            autoComplete="family-name"
          />
        </div>

        <AuthPrimaryButton type="submit">
          Continue
        </AuthPrimaryButton>
      </form>

      <div style={{ marginTop: '24px' }}>
        <LegalFooterLinks />
      </div>
    </AuthShell>
  );
}
