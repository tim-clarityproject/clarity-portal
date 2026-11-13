import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { justSignedOut, rememberNext } from '../lib/signIn/addresses';
import { hasAuthenticator, signInStop, stopPath } from '../lib/signIn/flow';
import { needsBeforeYouStart } from '../lib/signIn/terms';
import { diag } from '../utils/diag';
import { SitePhoneNav } from './SiteMenu';

/**
 * Master auth guard - wraps ALL protected routes via React Router layout pattern.
 * Routes inside this layout are GUARANTEED to have a valid session or redirected to login.
 * This is the SINGLE enforcement point for ALL protected routes - no exceptions, no bypasses.
 */
export default function ProtectedLayout() {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  // The page they asked for, as the router has it: read here, not from the
  // address bar, which has already moved on by the time a redirect runs twice.
  const location = useLocation();
  const asked = `${location.pathname}${location.search}${location.hash}`;
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
      // Where they were heading goes with them, so signing in lands them
      // there (Tim, 11 Nov): the path with its query and hash.
      // Not after a deliberate Sign out: the next person to sign in here
      // starts at Home, not on the page the last one left from.
      navigate('/auth/login', {
        state: justSignedOut() ? { fromDirect: true } : { returnTo: asked, fromDirect: true },
        replace: true
      });
    } else {
      console.log('[ProtectedLayout] User authenticated, rendering child routes');
    }
  }, [isLoading, user, navigate, asked]);

  // A stop someone still owes before the portal opens (src/lib/signIn/flow.js):
  // a Google account the portal has never seen must tick the box on Before
  // you start, and an account with an authenticator app must give its
  // code. Whichever way they came in, no page opens until it's done.
  // Everyone else (no authenticator, already agreed) is never held up.
  const mayOwe = Boolean(user) && (hasAuthenticator(user) || needsBeforeYouStart(user));
  // What was found, and who it was found for: an answer for one account
  // never opens the portal for the next one to sign in on this tab.
  const [checked, setChecked] = useState({ id: null, stop: undefined });
  const userId = user?.id || null;
  useEffect(() => {
    if (!mayOwe) return undefined;
    let live = true;
    signInStop(supabase, user).then((owed) => {
      if (!live) return;
      if (owed) {
        rememberNext(asked);
        navigate(stopPath(owed), { replace: true });
      }
      setChecked({ id: userId, stop: owed });
    });
    return () => { live = false; };
  }, [mayOwe, user, userId, navigate]);
  const cleared = !mayOwe || (checked.id === userId && checked.stop === null);

  // During auth check, show loading screen (blocks rendering of child routes)
  if (isLoading) {
    return <div className="ui-root" role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  }

  // After auth check complete, only render child routes if user exists
  if (!user) {
    return null; // Redirect in progress
  }

  // Still checking what they owe, or on their way to it: nothing shows.
  if (!cleared) {
    return <div className="ui-root" role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  }

  // User authenticated - render the matched child route via Outlet
  return (
    <>
      <Outlet />
      <SitePhoneNav />
    </>
  );
}
