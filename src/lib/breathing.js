import { supabase } from './supabase';

// Breathing (prompt 11, per clarity-specs-9-to-11.md section E). One
// source of truth for technique keys, labels, phase timings and
// guidance copy - the old code duplicated this three times
// (BreathingPage.jsx, BreathingGuide.jsx, the sessions label map) with
// three different sets of numbers and labels; this is now the only
// place any of it is written down.
// phaseLabel (patch 3, area B): the live session view's phase name -
// its own, shorter wording distinct from GUIDANCE's resting-row labels
// below (mock-ups: breathing-tool.html's T.sigh.ph/T.vagal.ph/T.box.ph,
// confirmed identical in breathing-and-about.html's T object). Sigh's
// middle phase reads "Inhale further" here but "Top up" in GUIDANCE -
// two different, both-intentional labels for the same phase, not a
// typo.
// from/to (patch 3, areas B-D): each phase's progress value at its
// start and end (0 = fully settled/empty, 1 = fully swelled/full) -
// the mock-up's own a/b, read verbatim from its T object. The box's
// two "Hold" phases are flat (from===to), so phaseAt()'s dir is -1 for
// both - a hold doesn't push the colour chase anywhere itself, it
// keeps heading wherever the breath before it was going (patch 3B
// area D; patch 3's own isEnding flag couldn't represent this and
// chased both holds back towards coral, a bug that patch 3 had
// mistaken for an intentional mock-up quirk).
export const TECHNIQUES = {
  sigh: {
    key: 'sigh',
    label: 'Physiological Sigh',
    shape: 'circle',
    phases: [
      { name: 'inhale', seconds: 3.5, color: 'coral', phaseLabel: 'Inhale', from: 0, to: 0.72 },
      { name: 'top-up', seconds: 1.5, color: 'coral', phaseLabel: 'Inhale further', from: 0.72, to: 1 },
      { name: 'exhale', seconds: 7, color: 'mint', phaseLabel: 'Exhale', from: 1, to: 0 },
    ],
  },
  vagal: {
    key: 'vagal',
    label: 'Vagal Breathing',
    shape: 'circle',
    phases: [
      { name: 'inhale', seconds: 4, color: 'coral', phaseLabel: 'Inhale', from: 0, to: 1 },
      { name: 'exhale', seconds: 6, color: 'mint', phaseLabel: 'Exhale', from: 1, to: 0 },
    ],
  },
  box: {
    key: 'box',
    label: 'Box Breathing',
    shape: 'box',
    phases: [
      { name: 'inhale', seconds: 4, color: 'coral', phaseLabel: 'Inhale', from: 0, to: 1 },
      { name: 'hold', seconds: 4, color: 'coral', phaseLabel: 'Hold', from: 1, to: 1 },
      { name: 'exhale', seconds: 4, color: 'mint', phaseLabel: 'Exhale', from: 1, to: 0 },
      { name: 'hold', seconds: 4, color: 'mint', phaseLabel: 'Hold', from: 0, to: 0 },
    ],
  },
};

export const TECHNIQUE_ORDER = ['sigh', 'vagal', 'box'];

// Slow-fast-slow easing (mock-up's own ease(p) in both breathing-tool.html
// and breathing-and-about.html - identical in both).
export function ease(p) {
  return (1 - Math.cos(Math.PI * p)) / 2;
}

// Where the breath is at a given point in the cycle (breathe-redesign.
// html's own stt()): which phase, the eased progress value s (0-1,
// drives ring/box size), ms remaining in this phase, and this phase's
// colour direction - dir:1 descending (chase mint, exhale-like), 0
// rising (chase coral, inhale-like), -1 flat (a hold - mock's own
// P.b<P.a?1:(P.b>P.a?0:-1)). A hold's -1 is deliberately not a valid
// chase target: callers only update their persisted direction when
// dir>=0, so a hold keeps whatever colour the breath before it was
// heading towards (box's two holds: coral after inhale, mint after
// exhale) rather than snapping back to neutral mid-hold.
export function phaseAt(technique, cycleMs) {
  const phases = TECHNIQUES[technique].phases;
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const durMs = phases[i].seconds * 1000;
    if (cycleMs < acc + durMs || i === phases.length - 1) {
      const p = Math.min((cycleMs - acc) / durMs, 1);
      const phase = phases[i];
      const dir = phase.to < phase.from ? 1 : (phase.to > phase.from ? 0 : -1);
      return {
        phaseIndex: i,
        s: phase.from + (phase.to - phase.from) * ease(p),
        remainingMs: durMs - (cycleMs - acc),
        dir,
      };
    }
    acc += durMs;
  }
  return { phaseIndex: 0, s: 0, remainingMs: 0, dir: 0 };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16));
}

// Smoothed colour blend between two CSS colour tokens (mock-up's own
// mix()/hex() - reads the actual computed --coral/--mint values via
// getComputedStyle, same as the mock-up, rather than hard-coding hex
// (rule 2): if the tokens ever change, this keeps following them.
export function mixColorTokens(varA, varB, t) {
  const root = getComputedStyle(document.documentElement);
  const a = hexToRgb(root.getPropertyValue(varA).trim());
  const b = hexToRgb(root.getPropertyValue(varB).trim());
  const mixed = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${mixed.join(',')})`;
}

// Guidance row (section 7): a label + a sentence, four columns, one
// per phase. Sigh's three sentences match the tool's own long-standing
// instructions; vagal/box's "Release"/"Continue"/"Hold" sentences have
// no exact wording given in the spec, so these are written fresh in
// the same quiet, calm tone.
export const GUIDANCE = {
  sigh: [
    { label: 'Inhale', text: 'Take a deep breath in through your nose until your lungs feel full.' },
    { label: 'Top up', text: 'Without exhaling, take a quick second "top-up" breath through your nose.' },
    { label: 'Exhale', text: 'Release a long, slow exhale through your mouth.' },
    { label: 'Repeat', text: 'Repeat for as many cycles as you like.' },
  ],
  vagal: [
    { label: 'Inhale', text: 'Breathe in slowly through your nose for four seconds.' },
    { label: 'Exhale', text: 'Breathe out gently through softly pursed lips for six seconds.' },
    { label: 'Release', text: 'Keep your shoulders and jaw loose.' },
    { label: 'Continue', text: 'Continue for a few minutes.' },
  ],
  box: [
    { label: 'Inhale', text: 'Breathe in for four counts.' },
    { label: 'Hold', text: 'Hold gently for four counts.' },
    { label: 'Exhale', text: 'Breathe out for four counts.' },
    { label: 'Hold', text: 'Hold again for four counts, then repeat.' },
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
