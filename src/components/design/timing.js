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

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
