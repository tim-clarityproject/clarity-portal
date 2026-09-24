import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowGuest = false }) {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) return;

    // If user is logged in, allow access
    if (user) {
      setIsChecking(false);
      return;
    }

    // If no user and guest mode is allowed, check if explicitly in guest mode
    if (allowGuest && location.state?.isGuest) {
      setIsChecking(false);
      return;
    }

    // If no user and not in guest mode, redirect to login with return path
    if (!user && !allowGuest) {
      navigate('/login', {
        state: {
          returnTo: location.pathname,
          fromDirect: true
        }
      });
      return;
    }

    // No valid session and guest mode not allowed
    if (!user) {
      navigate('/login', {
        state: {
          returnTo: location.pathname,
          fromDirect: true
        }
      });
      return;
    }

    setIsChecking(false);
  }, [user, isLoading, navigate, location, allowGuest]);

  // Show loading state while checking auth
  if (isLoading || isChecking) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // Allow access if:
  // 1. User is logged in, OR
  // 2. Guest mode allowed and explicitly in guest state
  const hasAccess = user || (allowGuest && location.state?.isGuest);

  if (!hasAccess) {
    return null; // Will redirect in useEffect above
  }

  return children;
}
