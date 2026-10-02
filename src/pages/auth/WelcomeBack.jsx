import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';

function getGreetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

// Only ever reached by an explicit navigate('/auth/welcome-back') call
// right after a successful login (see LogIn.jsx) - never shown on a
// normal page load/refresh, matching the brief's "only after an
// explicit log in" requirement.
export default function WelcomeBack() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const firstName = user?.user_metadata?.first_name || '';

  return (
    <AuthShell
      topBar="none"
      align="center"
      logo
      headline={`${getGreetingWord().toUpperCase()}, ${firstName.toUpperCase()}.`}
      sub="Let's make it a good one."
    >
      <div style={{ animationDelay: '1700ms' }}>
        <AuthPrimaryButton onClick={() => navigate('/welcome')}>
          Continue
        </AuthPrimaryButton>
      </div>
    </AuthShell>
  );
}
