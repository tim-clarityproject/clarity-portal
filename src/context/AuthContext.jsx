import { createContext, useEffect, useState } from 'react';
import { supabase, auth } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { dataSyncManager } from '../lib/dataSyncManager';

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
          // Session exists and is valid
          console.log('[AuthContext] - Session valid, setting user:', session.user.email);
          setUser(session.user);
          const userData = await dataSyncManager.loadUserData(session.user.id);
          localStorage.setItem('clarity-user-data', JSON.stringify(userData));
        } else {
          // Session is invalid or missing - clear cached data and logout
          console.log('[AuthContext] - No session or error, logging out. Error:', error?.message);
          localStorage.removeItem('clarity-user-data');
          setUser(null);
        }
      } catch (error) {
        console.error('[AuthContext] Auth check error:', error);
        localStorage.removeItem('clarity-user-data');
        setUser(null);
      } finally {
        setIsLoading(false);
        console.log('[AuthContext] Initial auth check complete - isLoading: false');
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth state changed:', event, 'has user?', !!session?.user);
      setUser(session?.user || null);

      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          try {
            const metadata = session.user.user_metadata || {};
            // Prefer names from user_metadata (set during signup) over OAuth provider metadata
            const firstName = metadata.first_name || metadata.given_name || metadata.name?.split(' ')[0] || metadata.full_name?.split(' ')[0] || '';
            const lastName = metadata.last_name || metadata.family_name || metadata.name?.split(' ').slice(1).join(' ') || metadata.full_name?.split(' ').slice(1).join(' ') || '';

            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', session.user.id)
              .single();

            if (profileError && profileError.code === 'PGRST116') {
              // Profile doesn't exist - only create if terms were already accepted
              // (e.g., from email confirmation flow). Don't create with terms_accepted=false
              // as that would trigger the accept-terms redirect
              const justConfirmedEmail = localStorage.getItem('justConfirmedEmail');
              if (justConfirmedEmail) {
                await supabase
                  .from('profiles')
                  .insert({
                    id: session.user.id,
                    first_name: firstName || '',
                    last_name: lastName || '',
                    email: session.user.email || '',
                    terms_accepted: true,
                  });
              } else {
                // For other sign-in methods, create with terms_accepted=false
                await supabase
                  .from('profiles')
                  .insert({
                    id: session.user.id,
                    first_name: firstName || '',
                    last_name: lastName || '',
                    email: session.user.email || '',
                    terms_accepted: false,
                  });
              }

              const userData = await dataSyncManager.loadUserData(session.user.id);
              localStorage.setItem('clarity-user-data', JSON.stringify(userData));
            }
            else if ((firstName || lastName) && !profile?.first_name && !profile?.last_name) {
              await supabase
                .from('profiles')
                .update({
                  first_name: firstName || '',
                  last_name: lastName || '',
                })
                .eq('id', session.user.id);
            }
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
      } else {
        // No valid session - clear all cached user data
        localStorage.removeItem('clarity-user-data');
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Handle session refresh on tab visibility change and periodic refresh
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh session to extend expiry
        await sessionManager.refreshSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodically refresh session every 12 hours to keep it alive
    const refreshInterval = setInterval(() => {
      sessionManager.refreshSession();
    }, 12 * 60 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
        return { success: false, error: 'Invalid email or password. Please try again.' };
      } else if (err.status === 401) {
        return { success: false, error: 'Email not confirmed. Check your email for verification link.' };
      } else {
        return { success: false, error: err.message || 'Login failed. Please try again.' };
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
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            redirectTo: `${window.location.origin}/email-confirmation`,
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
          return { success: false, error: 'Invalid email or password. Please try again.' };
        } else if (signupErr.status === 429) {
          return { success: false, error: 'Too many requests. Please wait a moment and try again.' };
        } else {
          return { success: false, error: signupErr.message || 'Signup failed. Please try again.' };
        }
      }
    } catch (err) {
      console.error('Signup exception:', err);
      return { success: false, error: err.message || 'An error occurred. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
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
