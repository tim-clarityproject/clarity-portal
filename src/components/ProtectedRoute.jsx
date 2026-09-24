import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Higher-order component that protects routes by checking auth before rendering
export default function ProtectedRoute({ children, allowGuest = false }) {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only check after auth is loaded
    if (isLoading) return;

    // If user exists, allow access - no action needed
    if (user) {
      return;
    }

    // No user found
    // If guest mode allowed and explicitly in guest state, allow access
    if (allowGuest && location.state?.isGuest) {
      return;
    }

    // No valid session and not in guest mode - redirect to login immediately
    if (!user && !allowGuest) {
      navigate('/login', {
        state: {
          returnTo: location.pathname,
          fromDirect: true
        },
        replace: true // Use replace to prevent back button returning to protected page
      });
      return;
    }
  }, [user, isLoading, navigate, location, allowGuest]);

  // During auth check, show loading screen
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // After auth check complete:
  // If user is logged in, render children
  if (user) {
    return children;
  }

  // If guest mode allowed and in guest state, render children
  if (allowGuest && location.state?.isGuest) {
    return children;
  }

  // No access - redirect in progress, show nothing
  return null;
}
