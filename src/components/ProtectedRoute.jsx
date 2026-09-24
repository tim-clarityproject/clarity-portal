import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Higher-order component that protects routes by checking auth before rendering
export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only check after auth is loaded
    if (isLoading) return;

    // If user exists, allow access
    if (user) {
      return;
    }

    // No user - redirect to login
    navigate('/login', {
      state: {
        returnTo: location.pathname,
        fromDirect: true
      },
      replace: true
    });
  }, [user, isLoading, navigate, location]);

  // During auth check, show loading screen
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // After auth check complete, only render if user exists
  if (user) {
    return children;
  }

  // No access - redirect in progress
  return null;
}
