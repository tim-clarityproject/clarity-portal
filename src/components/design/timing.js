// Timers for the shared components (portal-overhaul-decisions.md,
// "Design principles" and "Smoothness"). CSS motion lives in tokens.css;
// these are the waits JavaScript has to count itself.

// The loading crosshair only appears after this long, so fast loads never flash.
export const LOADING_DELAY_MS = 300;

// A toast stays for about 3 seconds, or about 5 when it offers Undo.
export const TOAST_MS = 3000;
export const TOAST_UNDO_MS = 5000;

// How long the panel and pop-up take to slide or fade away (match
// --dur-slow and --dur in tokens.css), so they stay on screen until then.
export const PANEL_MS = 400;
export const POPUP_MS = 250;

// Words that lift away letter by letter (Dissolve.jsx). One letter takes
// --dur-slow; the next starts a tenth of --dur-fast after it, or sooner in
// a long text, so the last letter starts within two --dur-slow. With
// reduced motion the words fade together over --dur-fade-still.
export const DISSOLVE_LETTER_MS = PANEL_MS;      // --dur-slow
export const DISSOLVE_GAP_MS = 15;               // --dur-fast / 10
export const DISSOLVE_SPREAD_MS = PANEL_MS * 2;
export const DISSOLVE_STILL_MS = POPUP_MS;       // --dur-fade-still

/** The wait between one letter starting and the next, for a text of `letters` letters. */
export function dissolveGapMs(letters) {
  return letters > 0 ? Math.min(DISSOLVE_GAP_MS, DISSOLVE_SPREAD_MS / letters) : 0;
}

/** How long the whole text takes to go. */
export function dissolveMs(letters) {
  if (prefersReducedMotion()) return DISSOLVE_STILL_MS;
  return Math.round(dissolveGapMs(letters) * letters) + DISSOLVE_LETTER_MS;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
