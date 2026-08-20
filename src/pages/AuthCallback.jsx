import { useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    // Wait for auth context to recognize the user, then redirect
    const timer = setTimeout(() => {
      if (user) {
        navigate('/welcome');
      } else {
        // If auth failed, go back to login
        navigate('/');
      }
    }, 1000);

    return () => clearTimeout(timer);
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
