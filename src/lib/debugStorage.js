import { forgetAuthCopy } from './authStorage';

// Debugging utility for session storage issues
export const debugStorage = {
  checkSessionStorage() {
    if (typeof window === 'undefined') return null;

    const session = localStorage.getItem('clarity-portal-auth');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        console.log('Session stored in localStorage:', {
          hasSession: !!parsed,
          keys: parsed ? Object.keys(parsed) : [],
          expiresAt: parsed?.session?.expires_at,
        });
        return parsed;
      } catch (e) {
        console.error('Failed to parse session:', e);
        return null;
      }
    }
    console.log('No session found in localStorage');
    return null;
  },

  listAllStorage() {
    if (typeof window === 'undefined') return {};

    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('auth') || key?.includes('clarity')) {
        items[key] = localStorage.getItem(key);
      }
    }
    console.table(items);
    return items;
  },

  clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('clarity-portal-auth');
    forgetAuthCopy('clarity-portal-auth');
    console.log('Cleared session from localStorage');
  },

  async testSessionPersistence() {
    console.log('=== Session Persistence Test ===');
    this.checkSessionStorage();
    this.listAllStorage();
  },
};

// Available in the browser's console in development only: never in a build people use (Polish 1, Stage D, item 17),
// since listAllStorage prints what the device keeps for the sign-in.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.debugStorage = debugStorage;
}
