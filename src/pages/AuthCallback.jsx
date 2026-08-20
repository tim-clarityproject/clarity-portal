import { useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    const handleCallback = async () => {
      // For OAuth, check Supabase directly instead of relying on context
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // User authenticated via OAuth
        navigate('/welcome');
      } else if (user) {
        // User already in context
        navigate('/welcome');
      } else {
        // Auth failed, go back to login
        navigate('/');
      }
    };

    handleCallback();
  }, [navigate, user]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'white',
    }}>
      <p style={{ color: '#999', fontSize: '14px' }}>Completing sign in...</p>
    </div>
  );
}
