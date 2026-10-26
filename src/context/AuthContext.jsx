import { createContext, useEffect, useState } from 'react';
import { supabase, auth } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { dataSyncManager } from '../lib/dataSyncManager';
import { diag } from '../utils/diag';
import { clearAppStorage } from '../lib/clearAppStorage';
import { flush as flushQueue, startSyncQueue } from '../lib/syncQueue';
import { friendlyError } from '../lib/friendlyError';

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
        const storedUserData = localStorage.getItem('clarity-user-data');
        const storedAuthToken = localStorage.getItem('clarity-portal-auth');
        console.log('[AuthContext] APP LAUNCH DIAGNOSTIC:');
        console.log('[AuthContext] - clarity-user-data in localStorage?', !!storedUserData);
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

        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[AuthContext] - getSession() returned:', !!session, 'error:', error?.message || 'none');
        if (session) {
          console.log('[AuthContext] - Session user email:', session.user?.email);
          console.log('[AuthContext] - Session token present?', !!session.access_token);
        }

        // Check session validity
        if (session?.user && !error) {
          // Session exists and is valid. The page shows straight away;
          // the cached profile data refreshes in the background.
          console.log('[AuthContext] - Session valid, setting user:', session.user.email);
          setUser(session.user);
          dataSyncManager.loadUserData(session.user.id)
            .then((userData) => localStorage.setItem('clarity-user-data', JSON.stringify(userData)))
            .catch(() => { /* offline: the cached copy stays */ });
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
        if (
          prevUser?.id === nextUser?.id &&
          event !== 'USER_UPDATED'
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
            // sign-up name, and loading a page never changes whether the
            // terms are accepted: terms_accepted is only ever set to true,
            // and only straight after confirming a new sign-up.
            const justConfirmedEmail = localStorage.getItem('justConfirmedEmail');
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

            // Wait 500ms for session to fully settle before querying other tables
            // This prevents 406 errors on SELECT queries that depend on RLS checks
            await new Promise(resolve => setTimeout(resolve, 500));

            const userData = await dataSyncManager.loadUserData(session.user.id);
            localStorage.setItem('clarity-user-data', JSON.stringify(userData));
          } catch (error) {
            // Silently handle profile update errors
          }
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          try {
            const userData = await dataSyncManager.loadUserData(session.user.id);
            localStorage.setItem('clarity-user-data', JSON.stringify(userData));
          } catch (error) {
            // Silently handle data sync errors
          }
        }
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

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      await auth.signIn(email, password);
      // Get and save session metadata after successful login
      const session = await sessionManager.getSession();
      if (session?.user) {
        sessionManager.saveSessionMetadata(session);
        // Load user's data from Supabase
        const userData = await dataSyncManager.loadUserData(session.user.id);
        // Store user data in localStorage for quick access
        localStorage.setItem('clarity-user-data', JSON.stringify(userData));
      }
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      // Provide user-facing error messages
      if (err.status === 400 || err.message?.includes('Invalid login credentials')) {
        return { success: false, error: 'That email and password didn’t match. Check them and try again.' };
      } else if (err.status === 401) {
        return { success: false, error: 'Your email address hasn’t been confirmed yet. Open the link we sent you, then sign in.' };
      } else {
        return { success: false, error: friendlyError(err, 'That didn’t sign you in. Check your connection and try again.') };
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email, password, firstName = '', lastName = '') => {
    setIsLoading(true);

    try {
      try {
        // STEP 1: Create Auth user (sends confirmation email)
        // Save firstName/lastName in user_metadata (server-side) instead of relying on localStorage
        // This ensures names persist across browser closures, device switches, etc.
        const redirectToUrl = `${window.location.origin}/email-confirmation`;
        console.log('[AuthContext.signup] Setting redirectTo:', redirectToUrl);
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            redirectTo: redirectToUrl,
            data: {
              first_name: firstName || '',
              last_name: lastName || '',
            },
          },
        });

        if (signupError) throw signupError;
        if (!data.user) throw new Error('No user returned from signup');

        console.log('✓ Step 1: Auth user created with name, confirmation email sent to:', email);
        console.log('[AuthContext.signup] Names saved to user_metadata:', { first_name: firstName, last_name: lastName });

        // Note: User email is NOT confirmed yet - they must click the confirmation link
        // Do NOT attempt to sign in here - that will fail until email is confirmed
        // The confirmation page will handle post-confirmation logic
        // Names are now safely stored server-side in user_metadata

        return { success: true };
      } catch (signupErr) {
        console.error('Signup error:', signupErr);

        // Provide user-facing error messages
        if (signupErr.message?.includes('already registered') || signupErr.status === 422) {
          return { success: false, error: 'An account with this email already exists. Try logging in instead.' };
        } else if (signupErr.status === 400) {
          return { success: false, error: 'That email and password didn’t match. Check them and try again.' };
        } else if (signupErr.status === 429) {
          return { success: false, error: 'That was tried too many times. Wait a moment and try again.' };
        } else {
          return { success: false, error: friendlyError(signupErr, 'Your account wasn’t created. Check your connection and try again.') };
        }
      }
    } catch (err) {
      console.error('Signup exception:', err);
      return { success: false, error: friendlyError(err, 'That didn’t work. Check your connection and try again.') };
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: clear everything the app keeps in the browser (drafts,
  // legacy tool autosaves, cached profile data) - see clearAppStorage.js.
  const clearUserDrafts = () => {
    clearAppStorage();
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Send anything still waiting before the device is cleared.
      await Promise.race([flushQueue(), new Promise((resolve) => { setTimeout(resolve, 4000); })]);
      clearUserDrafts();
      await auth.signOut();
      sessionManager.clearSession();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
