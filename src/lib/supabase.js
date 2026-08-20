import { createClient } from '@supabase/supabase-js';

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
    flowType: 'implicit',
    // Keep access token alive for longer periods
    tokenRefreshMarginSeconds: 60,
  },
});

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

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  },

  async signInWithFacebook() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  },
};

// Plans functions
export const plans = {
  async savePlan(userId, name, type, formData) {
    const { data, error } = await supabase
      .from('plans')
      .insert([
        {
          user_id: userId,
          name,
          type,
          form_data: formData,
          status: 'in_progress',
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updatePlan(planId, formData, progressPercent = 0) {
    const { data, error } = await supabase
      .from('plans')
      .update({
        form_data: formData,
        progress_percent: progressPercent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async completePlan(planId) {
    const { data, error } = await supabase
      .from('plans')
      .update({
        status: 'completed',
        progress_percent: 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async getUserPlans(userId) {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getPlanById(planId) {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (error) throw error;
    return data;
  },

  async deletePlan(planId) {
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', planId);
    if (error) throw error;
  },
};

// Decisions functions (GROW & Inversion models)
export const decisions = {
  async saveDecision(userId, toolType, formData, title = null) {
    const { data, error } = await supabase
      .from('decisions')
      .insert([
        {
          user_id: userId,
          tool_type: toolType, // 'grow' or 'inversion'
          title: title || formData.goal || 'Untitled Decision',
          form_data: formData,
          status: 'draft',
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateDecision(decisionId, formData) {
    const { data, error } = await supabase
      .from('decisions')
      .update({
        form_data: formData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async completeDecision(decisionId) {
    const { data, error } = await supabase
      .from('decisions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async getUserDecisions(userId) {
    const { data, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getDecisionById(decisionId) {
    const { data, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('id', decisionId)
      .single();
    if (error) throw error;
    return data;
  },

  async deleteDecision(decisionId) {
    const { error } = await supabase
      .from('decisions')
      .delete()
      .eq('id', decisionId);
    if (error) throw error;
  },
};

// Reflections/Journal functions
export const reflections = {
  async saveReflection(userId, content, title = null, linkedDecisionId = null) {
    const { data, error } = await supabase
      .from('reflections')
      .insert([
        {
          user_id: userId,
          title: title || 'Journal Entry',
          content,
          linked_decision_id: linkedDecisionId,
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateReflection(reflectionId, content, title = null) {
    const { data, error } = await supabase
      .from('reflections')
      .update({
        content,
        title: title || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reflectionId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async getUserReflections(userId) {
    const { data, error } = await supabase
      .from('reflections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getReflectionById(reflectionId) {
    const { data, error } = await supabase
      .from('reflections')
      .select('*')
      .eq('id', reflectionId)
      .single();
    if (error) throw error;
    return data;
  },

  async deleteReflection(reflectionId) {
    const { error } = await supabase
      .from('reflections')
      .delete()
      .eq('id', reflectionId);
    if (error) throw error;
  },
};

// Strategic Alignment (team planning)
export const strategicAlignments = {
  async saveAlignment(userId, formData, title = null) {
    const { data, error } = await supabase
      .from('strategic_alignments')
      .insert([
        {
          user_id: userId,
          title: title || formData.goal || 'Strategic Alignment',
          form_data: formData,
          status: 'draft',
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateAlignment(alignmentId, formData) {
    const { data, error } = await supabase
      .from('strategic_alignments')
      .update({
        form_data: formData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alignmentId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async getUserAlignments(userId) {
    const { data, error } = await supabase
      .from('strategic_alignments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async deleteAlignment(alignmentId) {
    const { error } = await supabase
      .from('strategic_alignments')
      .delete()
      .eq('id', alignmentId);
    if (error) throw error;
  },
};

// Guest sessions functions
export const guestSessions = {
  async createSession(sessionId, formData = {}) {
    const { data, error } = await supabase
      .from('guest_sessions')
      .insert([
        {
          session_id: sessionId,
          form_data: formData,
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async getSession(sessionId) {
    const { data, error } = await supabase
      .from('guest_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) throw error;
    return data;
  },

  async updateSession(sessionId, formData) {
    const { data, error } = await supabase
      .from('guest_sessions')
      .update({
        form_data: formData,
      })
      .eq('session_id', sessionId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async deleteSession(sessionId) {
    const { error } = await supabase
      .from('guest_sessions')
      .delete()
      .eq('session_id', sessionId);
    if (error) throw error;
  },
};
