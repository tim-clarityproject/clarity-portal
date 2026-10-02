import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';

export default function Finished() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { mission } = useContext(MissionContext);
  const firstName = user?.user_metadata?.first_name || '';

  return (
    <AuthShell
      topBar="none"
      align="center"
      logo
      headline={`WELCOME, ${firstName.toUpperCase()}.`}
    >
      <div style={{ animationDelay: '1500ms' }}>
        <div className="auth-mission-card" style={{ marginTop: '24px' }}>
          <div className="auth-mission-card-label">Your Mission</div>
          <div className="auth-mission-card-text">{mission}</div>
        </div>
      </div>

      <div style={{ animationDelay: '2200ms', maxWidth: '300px', margin: '0 auto' }}>
        <AuthPrimaryButton onClick={() => navigate('/welcome')}>
          Enter The Portal
        </AuthPrimaryButton>
      </div>
    </AuthShell>
  );
}
