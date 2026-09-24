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
          localStorage.setItem('clarity-user-data', JSON.stringify(userData));
        } else {
          // Session is invalid or missing - clear cached data and logout
          localStorage.removeItem('clarity-user-data');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('clarity-user-data');
        setUser(null);
      } finally {
        setIsLoading(false);
        console.log('[AuthContext] Initial auth check complete - user:', session?.user?.email || 'null', 'isLoading: false');
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
    let authUserCreated = false;
    let userSession = null;

    try {
      try {
        // STEP 1: Create Auth user
        await auth.signUp(email, password);
        authUserCreated = true;
        console.log('✓ Step 1: Auth user created');

        // STEP 2: Sign in to get session
        await auth.signIn(email, password);
        console.log('✓ Step 2: User signed in');

        // STEP 3: Get session info
        userSession = await sessionManager.getSession();
        if (!userSession?.user) {
          throw new Error('Failed to get session after signup');
        }
        console.log('✓ Step 3: Session retrieved');

        // STEP 4: Create profile record
        if (firstName || lastName) {
          await supabase
            .from('profiles')
            .upsert({
              id: userSession.user.id,
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
              id: userSession.user.id,
              email: email,
              terms_accepted: true,
            })
            .select();
        }
        console.log('✓ Step 4: Profile created');

        // STEP 5: Save session metadata
        sessionManager.saveSessionMetadata(userSession);
        console.log('✓ Step 5: Session metadata saved');

        // STEP 6: Load user data
        const userData = await dataSyncManager.loadUserData(userSession.user.id);
        localStorage.setItem('clarity-user-data', JSON.stringify(userData));
        console.log('✓ Step 6: User data loaded');

        return { success: true };
      } catch (signupErr) {
        console.error('Signup error at step:', signupErr);

        // ROLLBACK: If Auth user was created but later steps failed, delete it to prevent orphaning
        if (authUserCreated && userSession?.user) {
          console.log('⚠️  Rolling back: Deleting orphaned Auth user...');
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.access_token) {
              const response = await fetch(
                `${new URL(supabase.supabaseUrl).origin}/functions/v1/delete-user`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${currentSession.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              if (response.ok) {
                console.log('✓ Rollback: Orphaned Auth user deleted');
              } else {
                console.error('⚠️  Rollback failed: Could not delete Auth user');
                // Continue anyway - at least profile/session won't exist
              }
            }
          } catch (rollbackErr) {
            console.error('⚠️  Rollback exception:', rollbackErr);
            // Continue - user will need manual cleanup but email will be free after logout
          }

          // Always logout to clear the session
          try {
            await auth.signOut();
            console.log('✓ User logged out');
          } catch (logoutErr) {
            console.error('Logout during rollback failed:', logoutErr);
          }
        }

        // Provide user-facing error
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
