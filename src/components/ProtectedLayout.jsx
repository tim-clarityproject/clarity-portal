import { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

/**
 * Master auth guard - wraps ALL protected routes.
 * Routes inside this layout are GUARANTEED to have a valid session
 * or will be redirected to login. No exceptions, no bypasses.
 */
export default function ProtectedLayout({ children }) {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    // Only check after auth is fully loaded
    if (isLoading) return;

    // If no valid user after auth check complete, redirect to login
    if (!user) {
      navigate('/login', {
        state: { returnTo: window.location.pathname, fromDirect: true },
        replace: true
      });
    }
  }, [isLoading, user, navigate]);

  // During auth check, show loading
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // After auth check, only render if user exists
  if (!user) {
    return null; // Redirect in progress
  }

  return children;
}
