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
        const { data: { session }, error } = await supabase.auth.getSession();

        // Check session validity
        if (session?.user && !error) {
          // Session exists and is valid
          setUser(session.user);
          const userData = await dataSyncManager.loadUserData(session.user.id);
          sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
        } else {
          // Session is invalid or missing - clear cached data and logout
          sessionStorage.removeItem('clarity-user-data');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        sessionStorage.removeItem('clarity-user-data');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);

      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          try {
            const metadata = session.user.user_metadata || {};
            const firstName = metadata.given_name || metadata.name?.split(' ')[0] || metadata.full_name?.split(' ')[0] || '';
            const lastName = metadata.family_name || metadata.name?.split(' ').slice(1).join(' ') || metadata.full_name?.split(' ').slice(1).join(' ') || '';

            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', session.user.id)
              .single();

            if (profileError && profileError.code === 'PGRST116') {
              await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  first_name: firstName || '',
                  last_name: lastName || '',
                  email: session.user.email || '',
                  terms_accepted: false,
                });

              const userData = await dataSyncManager.loadUserData(session.user.id);
              sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
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
            sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
          } catch (error) {
            // Silently handle data sync errors
          }
        }
      } else {
        // No valid session - clear all cached user data
        sessionStorage.removeItem('clarity-user-data');
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

  const signup = async (email, password, firstName = '', lastName = '') => {
    setIsLoading(true);
    try {
      try {
        await auth.signUp(email, password);
        await auth.signIn(email, password);
        const session = await sessionManager.getSession();
        if (session?.user) {
          if (firstName || lastName) {
            await supabase
              .from('profiles')
              .upsert({
                id: session.user.id,
                first_name: firstName,
                last_name: lastName,
                email: email,
                terms_accepted: true,
              })
              .select();
          } else {
            await supabase
              .from('profiles')
              .upsert({
                id: session.user.id,
                email: email,
                terms_accepted: true,
              })
              .select();
          }
          sessionManager.saveSessionMetadata(session);
          const userData = await dataSyncManager.loadUserData(session.user.id);
          sessionStorage.setItem('clarity-user-data', JSON.stringify(userData));
        }
        return true;
      } catch (signupErr) {
        if (signupErr.message?.includes('already registered') || signupErr.status === 422) {
          return false;
        } else {
          throw signupErr;
        }
      }
    } catch (err) {
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
