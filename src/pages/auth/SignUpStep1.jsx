import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell';
import { AuthTextField } from '../../components/auth/AuthField';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';
import LegalFooterLinks from '../../components/legal/LegalFooterLinks';

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
      state: { firstName: firstName.trim(), lastName: lastName.trim() },
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
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            error={firstNameError}
            shakeToken={shakeToken}
            autoComplete="given-name"
          />
          <AuthTextField
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
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
