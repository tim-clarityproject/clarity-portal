// The Breathe orb's clock and the person's orb choice (breathe-orb.html,
// approved 29 Oct): two styles, Rings (the approved orb with fine lines)
// and Level (a round gauge that fills from the bottom). Rings is the
// starting choice. Used by the floating Breathe button now, and by
// Breathe and Sleep wind down when they are rebuilt.

// Each pattern is a list of phases: kind 'in', 'out' or 'hold', the
// phase word, its seconds, and the breath's size at its start and end
// (0 empty, 1 full). The live tool's timings, exactly (the mock-up's
// PAT): the sigh 3.5 + 1.5 + 7, box 4 x 4, vagal 4 + 6; Sleep wind down
// 4 in and 6 out; the floating button 4 in and 4 out at rest.
export const ORB_PATTERNS = {
  sigh: [
    { kind: 'in', word: 'Breathe in', seconds: 3.5, from: 0, to: 0.72 },
    { kind: 'in', word: 'Top up', seconds: 1.5, from: 0.72, to: 1 },
    { kind: 'out', word: 'Breathe out', seconds: 7, from: 1, to: 0 },
  ],
  box: [
    { kind: 'in', word: 'Breathe in', seconds: 4, from: 0, to: 1 },
    { kind: 'hold', word: 'Hold', seconds: 4, from: 1, to: 1 },
    { kind: 'out', word: 'Breathe out', seconds: 4, from: 1, to: 0 },
    { kind: 'hold', word: 'Hold', seconds: 4, from: 0, to: 0 },
  ],
  vagal: [
    { kind: 'in', word: 'Breathe in', seconds: 4, from: 0, to: 1 },
    { kind: 'out', word: 'Breathe out', seconds: 6, from: 1, to: 0 },
  ],
  wind: [
    { kind: 'in', word: 'Breathe in', seconds: 4, from: 0, to: 1 },
    { kind: 'out', word: 'Breathe out', seconds: 6, from: 1, to: 0 },
  ],
  rest: [
    { kind: 'in', word: 'Breathe in', seconds: 4, from: 0, to: 1 },
    { kind: 'out', word: 'Breathe out', seconds: 4, from: 1, to: 0 },
  ],
};

// How to breathe, under the phase word (Tim, 29 Oct, 19:45). Nothing
// during a hold, and the line keeps its height so nothing moves.
export function howToBreathe(kind) {
  if (kind === 'in') return 'through your nose';
  if (kind === 'out') return 'through your mouth';
  return '';
}

const ease = (p) => (1 - Math.cos(Math.PI * p)) / 2;

/**
 * Where the breath is, `seconds` after the pattern started: the phase
 * (index, kind, word), the breath's size (0 to 1, eased on a cosine
 * curve as in the live tool) and the whole seconds left in the phase.
 */
export function breathAt(phases, seconds) {
  const cycle = phases.reduce((sum, p) => sum + p.seconds, 0);
  const x = Math.max(0, seconds) % cycle;
  let start = 0;
  for (let i = 0; i < phases.length; i += 1) {
    const p = phases[i];
    if (x < start + p.seconds || i === phases.length - 1) {
      const q = Math.min((x - start) / p.seconds, 1);
      const left = p.seconds - (x - start);
      return {
        index: i,
        kind: p.kind,
        word: p.word,
        size: p.from + (p.to - p.from) * ease(q),
        secondsLeft: Math.max(1, Math.ceil(left - 0.001)),
      };
    }
    start += p.seconds;
  }
  return null;
}

// ---------------------------------------------------------------- the choice
// This device's copy, shown at once. The account keeps the choice in
// person_settings.page_preferences.orb_style (Phase 4 step 7), so another
// device sees it too: useOrbStyle reads and saves it.
export const ORB_STYLES = ['rings', 'level'];
export const DEFAULT_ORB_STYLE = 'rings';
const KEY = 'clarity-orb-style';
const EVENT = 'clarity-orb-style';

export function readOrbStyle() {
  try {
    const v = window.localStorage.getItem(KEY);
    return ORB_STYLES.includes(v) ? v : DEFAULT_ORB_STYLE;
  } catch {
    return DEFAULT_ORB_STYLE;
  }
}

export function saveOrbStyle(style) {
  if (!ORB_STYLES.includes(style)) return;
  try { window.localStorage.setItem(KEY, style); } catch { /* storage blocked: kept for this visit only */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: style })); } catch { /* old browser */ }
}

// Calls back when the choice changes here or in another tab.
export function watchOrbStyle(onChange) {
  const own = (e) => onChange(ORB_STYLES.includes(e.detail) ? e.detail : readOrbStyle());
  const other = (e) => { if (e.key === KEY || e.key === null) onChange(readOrbStyle()); };
  window.addEventListener(EVENT, own);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(EVENT, own);
    window.removeEventListener('storage', other);
  };
}
