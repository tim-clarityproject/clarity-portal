import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
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
  const [firstName, setFirstName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);

  // Same first-name source as the Home page (src/pages/Welcome.jsx): cached
  // localStorage first, then profiles.first_name from Supabase. NOT
  // user_metadata (that's only ever populated at signup, so it's empty for
  // anyone logging back in - which is how this screen ended up showing
  // "MORNING, ." with no name). nameLoaded gates the headline so it never
  // renders without a name already resolved, one way or the other.
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
    ? (firstName
      ? `${getGreetingWord().toUpperCase()}, ${firstName.toUpperCase()}.`
      : `${getGreetingWord().toUpperCase()}.`)
    : '';

  return (
    <AuthShell
      topBar="none"
      align="center"
      logo
      headline={headline}
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
