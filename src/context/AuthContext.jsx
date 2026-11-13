import { createContext, useEffect, useState } from 'react';
import { supabase, auth } from '../lib/supabase';
import { hasAgreed } from '../lib/signIn/terms';
import { noteSignedOut } from '../lib/signIn/addresses';
import { sessionManager } from '../lib/sessionManager';
import { diag } from '../utils/diag';
import { clearAppStorage } from '../lib/clearAppStorage';
import { flush as flushQueue, queueState, retrySyncQueue, startSyncQueue, stopSyncQueue } from '../lib/syncQueue';

// The session kept on this device (supabase.js storageKey), read directly
// so that being offline, or a sign-in refresh that fails for want of a
// connection, never counts as being signed out (Tim, 26 Oct). People stay
// signed in on their own devices until they choose Sign out.
function storedSessionUser() {
  try {
    const raw = localStorage.getItem('clarity-portal-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.refresh_token && parsed?.user ? parsed.user : null;
  } catch {
    return null;
  }
}

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      try {
        // DIAGNOSTIC: Check what's in localStorage at app launch
        const storedAuthToken = localStorage.getItem('clarity-portal-auth');
        console.log('[AuthContext] APP LAUNCH DIAGNOSTIC:');
        console.log('[AuthContext] - clarity-portal-auth token in localStorage?', !!storedAuthToken);
        if (storedAuthToken) {
          try {
            const parsed = JSON.parse(storedAuthToken);
            console.log('[AuthContext] - Token expires at:', parsed.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : 'unknown');
            console.log('[AuthContext] - Token refresh token present?', !!parsed.refresh_token);
          } catch (e) {
            console.log('[AuthContext] - Could not parse stored token');
          }
        }

        // A session that needs refreshing over a slow or absent connection
        // can take many seconds; after 2 the app opens from the session on
        // the device instead (Tim, 26 Oct: a calm screen within 2 seconds).
        const settled = await Promise.race([
          supabase.auth.getSession(),
          new Promise((resolve) => { setTimeout(() => resolve(null), 2000); }),
        ]);
        if (!settled && storedSessionUser()) {
          console.log('[AuthContext] - Session refresh still waiting; opening from the device.');
          setUser(storedSessionUser());
          return;
        }
        const { data: { session }, error } = settled || { data: { session: null }, error: null };
        console.log('[AuthContext] - getSession() returned:', !!session, 'error:', error?.message || 'none');
        if (session) {
          console.log('[AuthContext] - Session user email:', session.user?.email);
          console.log('[AuthContext] - Session token present?', !!session.access_token);
        }

        // Check session validity
        if (session?.user && !error) {
          // Session exists and is valid. The page shows straight away.
          console.log('[AuthContext] - Session valid, setting user:', session.user.email);
          setUser(session.user);
        } else if (storedSessionUser()) {
          // The refresh could not reach the server (offline, or a slow
          // connection): still signed in, from the session on the device.
          // Supabase refreshes it once the connection is back.
          console.log('[AuthContext] - Session kept on the device while the refresh waits for a connection.');
          setUser(storedSessionUser());
        } else {
          // Genuinely signed out: nothing kept on the device is cleared
          // here; only a deliberate Sign out does that.
          console.log('[AuthContext] - No session. Error:', error?.message);
          setUser(null);
        }
      } catch (error) {
        console.error('[AuthContext] Auth check error:', error);
        setUser(storedSessionUser());
      } finally {
        setIsLoading(false);
        console.log('[AuthContext] Initial auth check complete - isLoading: false');
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth state changed:', event, 'has user?', !!session?.user);

      // Use functional update to preserve user object reference when ID unchanged
      // This prevents unnecessary re-renders in components with [user] in dependencies
      setUser(prevUser => {
        // No session in the event, but one still on the device: the
        // refresh is waiting for a connection, so stay signed in.
        const nextUser = session?.user || storedSessionUser() || null;
        const userIdShort = nextUser?.id?.substring(0, 8) || 'null';
        let outcome = 'replaced';

        // For any event, if user ID is same and not a USER_UPDATED event, preserve reference
        // This prevents refetch chains in child components across all auth state transitions
        // A new email is the exception (a change-of-email link has just
        // been opened, here or on another device): My Account shows the
        // account's email from this copy, so it takes the newer one.
        if (
          prevUser?.id === nextUser?.id &&
          event !== 'USER_UPDATED' &&
          (prevUser?.email || '') === (nextUser?.email || '')
        ) {
          outcome = 'kept';
          diag('AUTH_EVENT', { event, userIdShort, outcome });
          return prevUser;
        }

        // For actual user changes (login, logout, initial session), always update
        if (!nextUser) {
          outcome = 'null';
        }
        diag('AUTH_EVENT', { event, userIdShort, outcome });
        return nextUser;
      });

      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          try {
            const metadata = session.user.user_metadata || {};
            // Prefer names from user_metadata (set during signup) over OAuth provider metadata
            const firstName = metadata.first_name || metadata.given_name || metadata.name?.split(' ')[0] || metadata.full_name?.split(' ')[0] || '';
            const lastName = metadata.last_name || metadata.family_name || metadata.name?.split(' ').slice(1).join(' ') || metadata.full_name?.split(' ').slice(1).join(' ') || '';

            // Fill in the profile only where it is still empty. A name the
            // person has changed in Edit profile is never put back to the
            // sign-up name. The profile's terms_accepted is only ever set
            // to true, and only from the account's own record of the tick
            // box (src/lib/signIn/terms.js): an email sign-up sends it with
            // the sign-up, a Google sign-up and an invite save it when the
            // box is ticked. It no longer depends on a flag left on the
            // device, which a link opened elsewhere never had.
            const justConfirmedEmail = hasAgreed(session.user);
            const { data: existing, error: readError } = await supabase
              .from('profiles')
              .select('email, first_name, last_name, terms_accepted')
              .eq('id', session.user.id)
              .maybeSingle();

            if (readError) {
              console.error('[AuthContext] Profile read error:', readError);
            } else if (!existing) {
              // No row yet (the sign-up trigger normally makes one). If the
              // trigger wins the race, the row it made is left alone.
              const insertPayload = {
                id: session.user.id,
                email: session.user.email || '',
                first_name: firstName,
                last_name: lastName,
              };
              if (justConfirmedEmail) insertPayload.terms_accepted = true;
              const { error: insertError } = await supabase
                .from('profiles')
                .upsert(insertPayload, { onConflict: 'id', ignoreDuplicates: true });
              if (insertError) console.error('[AuthContext] Profile create error:', insertError);
            } else {
              const changes = {};
              if (session.user.email && existing.email !== session.user.email) changes.email = session.user.email;
              if (!existing.first_name && firstName) changes.first_name = firstName;
              if (!existing.last_name && lastName) changes.last_name = lastName;
              if (justConfirmedEmail && existing.terms_accepted !== true) changes.terms_accepted = true;
              if (Object.keys(changes).length > 0) {
                const { error: updateError } = await supabase
                  .from('profiles')
                  .update(changes)
                  .eq('id', session.user.id);
                if (updateError) console.error('[AuthContext] Profile update error:', updateError);
              }
            }
          } catch (error) {
            // Silently handle profile update errors
          }
        }

        // A refreshed sign-in: send whatever waited for it.
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') retrySyncQueue();
      } else if (!storedSessionUser()) {
        // Signed out (here, in another tab, or the session ended). Drafts,
        // page copies and waiting saves stay on the device: only a
        // deliberate Sign out clears them (Tim, 26 Oct). They carry the
        // person's id, so nobody else signing in here is shown them.
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Saves made offline are sent for whoever is signed in.
  useEffect(() => {
    startSyncQueue(user?.id ?? null);
  }, [user?.id]);

  // Handle session refresh on tab visibility change and periodic refresh
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh session to extend expiry
        diag('VISIBILITY_CHANGE', { state: 'visible' });
        const result = await sessionManager.refreshSession();
        diag('REFRESH_SESSION', { result: result ? 'success' : 'null' });
      }
    };

    const handleVisibilityChangeAll = () => {
      if (document.visibilityState !== 'visible') {
        diag('VISIBILITY_CHANGE', { state: document.visibilityState });
      }
    };

    const handlePageShow = (e) => {
      diag('PAGESHOW', { persisted: e.persisted });
      // A page the browser brings back whole (Back, after leaving for
      // another site) heard nothing while it was away. If the person signed
      // out since, or someone else signed in, it must not go on showing
      // what it showed before (the break-it tester, 13 Nov): it starts
      // again, at Sign in or at the new person's Home.
      if (e.persisted) {
        const kept = storedSessionUser();
        if ((kept?.id || null) !== user.id) window.location.replace(kept ? '/welcome' : '/auth/login');
      }
    };

    const handleBeforeUnload = () => {
      diag('BEFOREUNLOAD', {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChangeAll);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Periodically refresh session every 12 hours to keep it alive
    const refreshInterval = setInterval(() => {
      sessionManager.refreshSession();
    }, 12 * 60 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChangeAll);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(refreshInterval);
    };
  }, [user]);

  // Signing in and creating an account live in the sign-in pages
  // (src/pages/signin, M26): they call Supabase themselves, so the terms
  // record and the first name always go with a new account. The older
  // login and signup helpers that sat here are gone (nothing used them).

  // Helper: clear everything the app keeps in the browser (drafts,
  // legacy tool autosaves, cached profile data) - see clearAppStorage.js.
  const clearUserDrafts = () => {
    clearAppStorage();
  };

  // Sign out. Saves still waiting are sent first; if any can't be sent
  // (no connection), the person stays signed in and is told, so nothing
  // is thrown away (Tim, 26 Oct). force: deleting the account.
  // Resolves { signedOut: true } or { pending: n }.
  const logout = async ({ force = false } = {}) => {
    if (!force) {
      await Promise.race([flushQueue(), new Promise((resolve) => { setTimeout(resolve, 20000); })]);
      const { waiting } = queueState();
      if (waiting > 0) return { pending: waiting };
    }
    setIsLoading(true);
    try {
      stopSyncQueue();
      // A deliberate sign-out: the page it was pressed on is not kept as
      // the place to land after the next sign-in (ProtectedLayout).
      noteSignedOut();
      clearUserDrafts();
      await auth.signOut();
      // Again once signed out: a page still open can finish a read while
      // the sign-out is on its way and put its copy back on the device.
      clearUserDrafts();
      sessionManager.clearSession();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
    return { signedOut: true };
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
