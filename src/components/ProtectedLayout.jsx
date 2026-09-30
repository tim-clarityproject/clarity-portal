import { useContext, useEffect, useRef } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { diag } from '../utils/diag';

/**
 * Master auth guard - wraps ALL protected routes via React Router layout pattern.
 * Routes inside this layout are GUARANTEED to have a valid session or redirected to login.
 * This is the SINGLE enforcement point for ALL protected routes - no exceptions, no bypasses.
 */
export default function ProtectedLayout() {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const prevStateRef = useRef({ isLoading: true, userExists: false });

  console.log('[ProtectedLayout] Rendered - user:', user?.email || 'null', 'isLoading:', isLoading);

  // Log state changes
  useEffect(() => {
    const prevIsLoading = prevStateRef.current.isLoading;
    const prevUserExists = prevStateRef.current.userExists;
    const currentUserExists = !!user;

    if (prevIsLoading !== isLoading) {
      diag('PROTECTED_LAYOUT_LOADING', { isLoading });
      prevStateRef.current.isLoading = isLoading;
    }

    if (prevUserExists !== currentUserExists) {
      diag('PROTECTED_LAYOUT_USER', { userExists: currentUserExists });
      prevStateRef.current.userExists = currentUserExists;
    }
  }, [isLoading, user]);

  useEffect(() => {
    // Only check after auth is fully loaded
    if (isLoading) {
      console.log('[ProtectedLayout] Auth loading, showing spinner');
      return;
    }

    console.log('[ProtectedLayout] Auth check complete - user:', user?.email || 'null');

    // If no valid user after auth check complete, redirect to login immediately
    if (!user) {
      console.log('[ProtectedLayout] No user, redirecting to login');
      navigate('/login', {
        state: { returnTo: window.location.pathname, fromDirect: true },
        replace: true
      });
    } else {
      console.log('[ProtectedLayout] User authenticated, rendering child routes');
    }
  }, [isLoading, user, navigate]);

  // During auth check, show loading screen (blocks rendering of child routes)
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // After auth check complete, only render child routes if user exists
  if (!user) {
    return null; // Redirect in progress
  }

  // User authenticated - render the matched child route via Outlet
  return <Outlet />;
}
