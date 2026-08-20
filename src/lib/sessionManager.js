import { supabase } from './supabase';

// Session management for persistent login (30+ days)
export const sessionManager = {
  // Initialize session recovery on app load
  async initializeSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session) {
        // Session exists - it will be automatically refreshed by autoRefreshToken
        return session;
      }
      return null;
    } catch (error) {
      console.error('Failed to initialize session:', error);
      return null;
    }
  },

  // Get current session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  },

  // Refresh the current session (extend expiry)
  async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return data?.session;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return null;
    }
  },

  // Check if session is still valid
  async isSessionValid() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return !!user;
    } catch (error) {
      console.error('Error checking session validity:', error);
      return false;
    }
  },

  // Persist session metadata
  saveSessionMetadata(session) {
    if (session) {
      const metadata = {
        lastActive: Date.now(),
        expiresAt: session.expires_at ? session.expires_at * 1000 : null,
      };
      localStorage.setItem('clarity-portal-session-meta', JSON.stringify(metadata));
    }
  },

  // Get session metadata
  getSessionMetadata() {
    try {
      const meta = localStorage.getItem('clarity-portal-session-meta');
      return meta ? JSON.parse(meta) : null;
    } catch {
      return null;
    }
  },

  // Clear all session data
  clearSession() {
    localStorage.removeItem('clarity-portal-auth');
    localStorage.removeItem('clarity-portal-session-meta');
  },
};
