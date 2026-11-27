// The Breathe orb's clock and the person's orb choice: two styles, Rings and Level (Rings is the starting choice), drawn
// in the 25 Nov style by BreathOrb (Tim, 26 Nov, decisions part 12: thin lines in the text colour, no coral or mint).
// Used by Breathe and Sleep wind down.

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

// Reduced motion: the orb holds at half a breath (the approved mock-up's .55) and fades with the breath instead.
export const ORB_STILL_SIZE = 0.55;

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

// ---------------------------------------------------------------- the drawing (BreathOrb)
// The orb's name for screen readers (point 9).
export const ORB_LABEL = 'Breathe in as it grows, and out as it shrinks.';

const NS = ' vector-effect="non-scaling-stroke"';
// The lines (the mock-up's: 1.25 for the drawn lines, 1 for the faint track), in screen pixels at any size.
const LINE = 1.25;
const TRACK = 1;

// A rounded square centred on 0,0: half its side `h`, corner radius `r` (the mock-up's rr()).
export function roundedSquare(h, r) {
  return `M${-h} ${h - r}V${-h + r}A${r} ${r} 0 0 1 ${-h + r} ${-h}H${h - r}A${r} ${r} 0 0 1 ${h} ${-h + r}V${h - r}`
    + `A${r} ${r} 0 0 1 ${h - r} ${h}H${-h + r}A${r} ${r} 0 0 1 ${-h} ${h - r}Z`;
}

const f2 = (n) => n.toFixed(2);
const op = (n) => n.toFixed(3);

/**
 * The orb's drawing at breath size `s` (0 empty, 1 full) and line strength `fade` (1, or the reduced-motion fade), as
 * SVG markup in a -100..100 frame. style 'rings' or 'level'; shape 'round' or 'square'; id: a clip path's unique name.
 */
export function orbSvg({ style = 'rings', shape = 'round', s = 0, fade = 1, id = 'ds-borb-clip' }) {
  const ink = 'style="stroke:var(--text)"';
  const track = 'style="stroke:var(--line)"';
  let body;
  if (shape === 'square') {
    if (style === 'level') {
      const H = 88;
      const y = H - 2 * H * (0.06 + 0.88 * s);
      // The level line keeps clear of the rounded corners at the very top and bottom.
      const inset = y < -H + 22 || y > H - 22 ? 14 : 0;
      body = `<defs><clipPath id="${id}"><path d="${roundedSquare(H, 22)}"/></clipPath></defs>`
        + `<rect x="-100" y="${f2(y)}" width="200" height="${f2(100 - y)}" clip-path="url(#${id})" style="fill:var(--raised)" fill-opacity="${op(fade)}"/>`
        + `<path d="${roundedSquare(H, 22)}" fill="none" ${ink} stroke-width="${LINE}"${NS}/>`
        + `<path d="M${-H + inset} ${f2(y)}H${H - inset}" ${ink} stroke-opacity="${op(fade)}" stroke-width="${LINE}" stroke-linecap="round"${NS}/>`;
    } else {
      const h = 30 + 48 * s;
      body = `<path d="${roundedSquare(88, 22)}" fill="none" ${track} stroke-width="${TRACK}"${NS}/>`
        + `<path d="${roundedSquare(h, Math.max(6, h * 0.25))}" fill="none" ${ink} stroke-opacity="${op(fade)}" stroke-width="${LINE}"${NS}/>`
        + `<path d="${roundedSquare(13, 4)}" fill="none" ${ink} stroke-width="${LINE}"${NS}/>`;
    }
  } else if (style === 'level') {
    const R = 90;
    const y = R - 2 * R * (0.06 + 0.88 * s);
    const xw = Math.sqrt(Math.max(0, R * R - y * y));
    body = `<defs><clipPath id="${id}"><circle r="${R}"/></clipPath></defs>`
      + `<rect x="-100" y="${f2(y)}" width="200" height="${f2(100 - y)}" clip-path="url(#${id})" style="fill:var(--raised)" fill-opacity="${op(fade)}"/>`
      + `<circle r="${R}" fill="none" ${ink} stroke-width="${LINE}"${NS}/>`
      + `<path d="M${f2(-xw)} ${f2(y)}H${f2(xw)}" ${ink} stroke-opacity="${op(fade)}" stroke-width="${LINE}" stroke-linecap="round"${NS}/>`;
  } else {
    body = `<circle r="92" fill="none" ${track} stroke-width="${TRACK}"${NS}/>`
      + `<circle r="${f2(34 + 52 * s)}" fill="none" ${ink} stroke-opacity="${op(fade)}" stroke-width="${LINE}"${NS}/>`
      + `<circle r="14" fill="none" ${ink} stroke-width="${LINE}"${NS}/>`;
  }
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">${body}</svg>`;
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
