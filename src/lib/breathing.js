import { supabase } from './supabase';

// Breathing (prompt 11, per clarity-specs-9-to-11.md section E). One
// source of truth for technique keys, labels, phase timings and
// guidance copy - the old code duplicated this three times
// (BreathingPage.jsx, BreathingGuide.jsx, the sessions label map) with
// three different sets of numbers and labels; this is now the only
// place any of it is written down.
export const TECHNIQUES = {
  sigh: {
    key: 'sigh',
    label: 'Physiological Sigh',
    shape: 'circle',
    phases: [
      { name: 'inhale', seconds: 3.5, color: 'coral' },
      { name: 'top-up', seconds: 1.5, color: 'coral' },
      { name: 'exhale', seconds: 7, color: 'mint' },
    ],
  },
  vagal: {
    key: 'vagal',
    label: 'Vagal Breathing',
    shape: 'circle',
    phases: [
      { name: 'inhale', seconds: 4, color: 'coral' },
      { name: 'exhale', seconds: 6, color: 'mint' },
    ],
  },
  box: {
    key: 'box',
    label: 'Box Breathing',
    shape: 'box',
    phases: [
      { name: 'inhale', seconds: 4, color: 'coral' },
      { name: 'hold', seconds: 4, color: 'coral' },
      { name: 'exhale', seconds: 4, color: 'mint' },
      { name: 'hold', seconds: 4, color: 'mint' },
    ],
  },
};

export const TECHNIQUE_ORDER = ['sigh', 'vagal', 'box'];

// Guidance row (section 7): a label + a sentence, four columns, one
// per phase. Sigh's three sentences match the tool's own long-standing
// instructions; vagal/box's "Release"/"Continue"/"Hold" sentences have
// no exact wording given in the spec, so these are written fresh in
// the same quiet, calm tone.
export const GUIDANCE = {
  sigh: [
    { label: 'Inhale', text: 'Breathe in through your nose until your lungs feel full.' },
    { label: 'Top up', text: 'Without exhaling, take a quick second "top-up" breath through your nose.' },
    { label: 'Exhale', text: 'Release a long, slow exhale through your mouth.' },
    { label: 'Repeat', text: 'Repeat for as many cycles as you like.' },
  ],
  vagal: [
    { label: 'Inhale', text: 'Breathe in slowly through your nose for 4 seconds.' },
    { label: 'Exhale', text: 'Breathe out slowly through your mouth for 6 seconds.' },
    { label: 'Release', text: 'Let your shoulders and jaw soften a little more with every breath.' },
    { label: 'Continue', text: 'Repeat for as many cycles as you like.' },
  ],
  box: [
    { label: 'Inhale', text: 'Breathe in through your nose for 4 seconds.' },
    { label: 'Hold', text: 'Hold your breath gently for 4 seconds.' },
    { label: 'Exhale', text: 'Breathe out through your mouth for 4 seconds.' },
    { label: 'Hold', text: 'Hold again for 4 seconds, then begin the next cycle.' },
  ],
};

export const MIN_SESSION_SECONDS = 10;

export function cycleDuration(technique) {
  return TECHNIQUES[technique].phases.reduce((sum, p) => sum + p.seconds, 0);
}

// Technique preference lives inside profiles.breathing_settings (jsonb)
// as a "technique" key, alongside its existing inhale/hold/exhale keys
// (the old cycle-duration customiser, still reachable - see
// BreathingSettingsModal.jsx) - profiles has no breathing_preference
// column on the live database, confirmed directly, so this is read
// with a quiet default rather than a visible error if anything about
// it is ever missing.
export async function loadBreathingPreference(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('breathing_settings').eq('id', userId).single();
    if (error) throw error;
    return data?.breathing_settings?.technique || 'sigh';
  } catch (error) {
    console.error('[breathing] preference load failed:', error);
    return 'sigh';
  }
}

export async function saveBreathingPreference(userId, technique) {
  try {
    const { data } = await supabase.from('profiles').select('breathing_settings').eq('id', userId).single();
    const settings = { ...(data?.breathing_settings || {}), technique };
    const { error } = await supabase.from('profiles').update({ breathing_settings: settings }).eq('id', userId);
    if (error) throw error;
  } catch (error) {
    console.error('[breathing] preference save failed:', error);
  }
}

export async function saveBreathingSession(userId, technique, durationSeconds) {
  const { error } = await supabase.from('breathing_sessions').insert({
    user_id: userId,
    breathing_mode: technique,
    duration: durationSeconds,
    date: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadBreathingSessions(userId) {
  const { data, error } = await supabase
    .from('breathing_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function loadLatestBreathingSession(userId) {
  const { data, error } = await supabase
    .from('breathing_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteBreathingSession(userId, id) {
  const { error } = await supabase
    .from('breathing_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// Existing rows may have an empty duration - show them without a
// length rather than "-" (spec 3).
export function formatSessionLength(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
