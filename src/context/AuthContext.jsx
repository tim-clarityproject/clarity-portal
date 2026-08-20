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
        // Check if there's an existing session (persisted in localStorage)
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Session check - found session:', !!session?.user);

        if (session?.user) {
          console.log('Restoring user from session:', session.user.email);
          setUser(session.user);
          // Load user's data from Supabase
          const userData = await dataSyncManager.loadUserData(session.user.id);
          sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
        } else {
          const currentUser = await auth.getCurrentUser();
          console.log('Current user check:', currentUser?.email);
          if (currentUser) {
            setUser(currentUser);
            // Load user's data from Supabase
            const userData = await dataSyncManager.loadUserData(currentUser.id);
            sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
          } else {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error checking user:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    // Subscribe to auth state changes (handles logout, token refresh, etc)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, 'User:', session?.user?.email);
      setUser(session?.user || null);

      if (session?.user) {
        // Handle OAuth sign-in - extract name from Google/OAuth provider
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          try {
            const metadata = session.user.user_metadata || {};
            // Try different field names Google might use
            const firstName = metadata.given_name || metadata.name?.split(' ')[0] || metadata.full_name?.split(' ')[0] || '';
            const lastName = metadata.family_name || metadata.name?.split(' ').slice(1).join(' ') || metadata.full_name?.split(' ').slice(1).join(' ') || '';

            // Check current profile
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', session.user.id)
              .single();

            // If profile doesn't exist, create it (new Google OAuth user)
            if (profileError && profileError.code === 'PGRST116') {
              console.log('Creating new profile for Google OAuth user');
              await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  first_name: firstName || '',
                  last_name: lastName || '',
                  email: session.user.email || '',
                  terms_accepted: false,
                });
              console.log('New profile created:', { firstName, lastName, email: session.user.email });

              // Refresh cache with new profile data
              const userData = await dataSyncManager.loadUserData(session.user.id);
              sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
            }
            // Update only if profile exists and is completely empty (never been set)
            else if ((firstName || lastName) && !profile?.first_name && !profile?.last_name) {
              await supabase
                .from('profiles')
                .update({
                  first_name: firstName || '',
                  last_name: lastName || '',
                })
                .eq('id', session.user.id);
              console.log('Profile updated with OAuth name:', { firstName, lastName });
            }
          } catch (error) {
            console.error('Error updating profile with OAuth name:', error);
          }
        }

        // Load user data whenever auth state changes to SIGNED_IN or TOKEN_REFRESHED
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          try {
            const userData = await dataSyncManager.loadUserData(session.user.id);
            sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
          } catch (error) {
            console.error('Error loading user data:', error);
          }
        }
      } else {
        sessionStorage.removeItem('clarity-user-data');
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
        // Store user data in sessionStorage for quick access
        sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
      }
      return true;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email, password) => {
    setIsLoading(true);
    try {
      try {
        await auth.signUp(email, password);
        console.log('Signup successful, verification email sent');
        // Don't auto-login - wait for email verification
        return true;
      } catch (signupErr) {
        // If user already exists, check if they're verified
        if (signupErr.message?.includes('already registered') || signupErr.status === 422) {
          console.log('Account already exists');
          return false;
        } else {
          throw signupErr;
        }
      }
    } catch (err) {
      console.error('Signup error:', err.message || err);
      return false;
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
