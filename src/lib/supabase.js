import { createClient } from '@supabase/supabase-js';
import { connectionFetch, setProbeUrl } from './connection';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key loaded:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  console.error('URL exists:', !!supabaseUrl);
  console.error('Key exists:', !!supabaseAnonKey);
}

// Custom storage adapter for Supabase sessions with better error handling
const customStorage = {
  getItem: (key) => {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
      const value = localStorage.getItem(key);
      if (value) {
        console.log(`Retrieved ${key} from storage`);
      }
      return value;
    } catch (e) {
      console.error(`Error retrieving ${key}:`, e);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
      console.log(`Stored ${key} in localStorage`);
    } catch (e) {
      console.error(`Error storing ${key}:`, e);
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
      localStorage.removeItem(key);
      console.log(`Removed ${key} from localStorage`);
    } catch (e) {
      console.error(`Error removing ${key}:`, e);
    }
  },
};

// Configure Supabase with persistent session storage and long token lifetime
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'clarity-portal-auth',
    storage: customStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Keep access token alive for longer periods
    tokenRefreshMarginSeconds: 60,
    // Cookie settings for cross-domain support (portal.theclarityproject.co.uk and vercel.app)
    // Note: Supabase auth cookies are set for the domain, not shared across subdomains
    // Each domain maintains its own session separately
  },
  // Every request knows at once when the device is offline, and gives up
  // on one that hangs (src/lib/connection.js).
  global: { fetch: connectionFetch },
});
if (supabaseUrl) setProbeUrl(`${supabaseUrl}/auth/v1/health`);

// Auth functions
export const auth = {
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return subscription;
  },

};
