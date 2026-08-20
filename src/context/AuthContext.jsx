import { createContext, useEffect, useState } from 'react';
import { supabase, auth } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      try {
        // Check if there's an existing session (persisted in localStorage)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
        } else {
          const currentUser = await auth.getCurrentUser();
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Error checking user:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      // Handle token refresh events to keep session alive
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        console.log('Session active:', session?.user?.email);
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
      if (session) {
        sessionManager.saveSessionMetadata(session);
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
      await auth.signUp(email, password);
      return true;
    } catch (err) {
      console.error('Signup error:', err);
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
