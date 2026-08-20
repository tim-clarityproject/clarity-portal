import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase automatically handles the OAuth callback and sets the session
    // Just redirect to welcome page
    const timer = setTimeout(() => {
      navigate('/welcome');
    }, 500);

    return () => clearTimeout(timer);
  }, [navigate]);

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
