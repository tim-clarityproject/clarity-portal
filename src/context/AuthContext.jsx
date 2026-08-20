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
        console.log('Signup successful, new account created');
      } catch (signupErr) {
        // If user already exists, that's ok - we'll log them in
        if (signupErr.message?.includes('already registered') || signupErr.status === 422) {
          console.log('Account already exists, logging in instead');
        } else {
          throw signupErr;
        }
      }

      // Wait a moment for account to be fully initialized in database
      await new Promise(resolve => setTimeout(resolve, 500));

      // Log in the user
      await auth.signIn(email, password);
      console.log('Login successful');

      // Get session and load user data
      const session = await sessionManager.getSession();
      if (session?.user) {
        sessionManager.saveSessionMetadata(session);
        const userData = await dataSyncManager.loadUserData(session.user.id);
        sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
      }
      return true;
    } catch (err) {
      console.error('Signup/login error:', err.message || err);
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
