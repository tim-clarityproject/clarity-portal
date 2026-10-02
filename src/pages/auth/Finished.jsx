import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import { supabase } from '../../lib/supabase';
import AuthShell from '../../components/auth/AuthShell';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';

export default function Finished() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { mission } = useContext(MissionContext);
  const [firstName, setFirstName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);

  // Same first-name source as the Home page (src/pages/Welcome.jsx) and
  // WelcomeBack.jsx: cached localStorage first, then profiles.first_name
  // from Supabase - not user_metadata. nameLoaded gates the headline so it
  // never renders without a name already resolved, one way or the other.
  useEffect(() => {
    if (!user) {
      setNameLoaded(true);
      return;
    }

    let cancelled = false;

    const loadUserName = async () => {
      try {
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !currentUser) {
          if (!cancelled) setNameLoaded(true);
          return;
        }

        const cachedData = localStorage.getItem('clarity-user-data');
        if (cachedData) {
          const userData = JSON.parse(cachedData);
          if (userData.first_name) {
            if (!cancelled) {
              setFirstName(userData.first_name);
              setNameLoaded(true);
            }
            return;
          }
        }

        const { data } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (!cancelled) {
          if (data && data.first_name) setFirstName(data.first_name);
          setNameLoaded(true);
        }
      } catch (err) {
        console.error('Error loading user name:', err);
        if (!cancelled) setNameLoaded(true);
      }
    };

    loadUserName();
    return () => { cancelled = true; };
  }, [user]);

  const headline = nameLoaded
    ? (firstName ? `WELCOME, ${firstName.toUpperCase()}.` : 'WELCOME.')
    : '';

  return (
    <AuthShell
      topBar="none"
      align="center"
      logo
      headline={headline}
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
