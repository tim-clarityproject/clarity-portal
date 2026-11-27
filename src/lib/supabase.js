import { createClient } from '@supabase/supabase-js';
import { setProbeUrl } from './connection';
import { noRetryOnConnectionLoss } from './noRetry';
import { authStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  console.error('URL exists:', !!supabaseUrl);
  console.error('Key exists:', !!supabaseAnonKey);
}

// The sign-in's storage: an in-memory copy kept in step with every write, other tabs and Sign out, so the many
// reads supabase-js makes (one before every request) don't each go to the device, and nothing is logged
// (src/lib/authStorage.js; Polish 1, Stage D, item 17).
const customStorage = authStorage;

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
  global: { fetch: noRetryOnConnectionLoss },
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

  // Sign out on this device only (sign-in rule 10: people stay signed in
  // on their own devices; run 6, item 15). Other tabs on this device follow
  // (Supabase's storage event, and rule 40's leftJustNow). Ending every
  // session is the owner's Reset authenticator's alone, on the server.
  async signOut({ scope = 'local' } = {}) {
    const { error } = await supabase.auth.signOut({ scope });
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
