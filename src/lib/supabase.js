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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
