import { BOLD_CROSS_PATHS, BOLD_CROSS_STROKE, BOLD_CROSS_VIEWBOX } from '../../lib/boldCrosshair';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { COACH_AUTH_PATHS } from '../../lib/signIn/coachAuth';
import './signin.css';

// The sign-in moment (polish 1, rule 24: B, Come together; the 25 Nov
// reference and example pages). When sign-in succeeds the page clears to
// its background; the crosshair's two halves slide in from opposite
// corners and lock together in 0.8s (easing out); it holds 0.5s, longer
// only while the first screen is still loading; then the mark fades and
// eases down slightly while the portal fades and rises 8px into place,
// 0.45s. Never twice in one visit (one opening of the portal: kept in this
// module, so nothing is stored). With reduced motion the mark appears
// still and the portal simply fades in.
//
// It is drawn straight onto the page, outside React, so it carries on
// unbroken while the router moves from the sign-in page to the portal. The
// mark is the reference's own inline SVG, two paths, never an image.

const SVG = 'http://www.w3.org/2000/svg';
const LOCK_MS = 800;
const HOLD_MS = 500;
const OUT_MS = 450;
/** The longest it waits for a slow first screen before showing the portal as it is. */
const WAIT_CAP_MS = 5000;
const POLL_MS = 50;

let played = false;

/** Whether the moment has played in this visit (for tests and the trigger). */
export function signInMomentPlayed() {
  return played;
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function drawMark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'si-moment-mark');
  svg.setAttribute('viewBox', BOLD_CROSS_VIEWBOX.join(' '));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const all = document.createElementNS(SVG, 'g');
  all.setAttribute('fill', 'none');
  all.setAttribute('stroke', 'currentColor');
  all.setAttribute('stroke-width', String(BOLD_CROSS_STROKE));
  all.setAttribute('stroke-linejoin', 'round');
  BOLD_CROSS_PATHS.forEach((p, i) => {
    const half = document.createElementNS(SVG, 'g');
    half.setAttribute('class', i === 0 ? 'si-moment-a' : 'si-moment-b');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('transform', `translate(${p.dx.toFixed(2)} ${p.dy.toFixed(2)})`);
    half.appendChild(path);
    all.appendChild(half);
  });
  svg.appendChild(all);
  return svg;
}

// The sign-in screens themselves (Home and My Account's pages are the portal).
const SIGN_IN_PLACES = [...Object.values(SIGN_IN_PATHS), ...Object.values(COACH_AUTH_PATHS)]
  .filter((p) => typeof p === 'string' && p !== SIGN_IN_PATHS.home && !p.startsWith('/my-account') && !p.startsWith('/coach/settings'));

function onSignInPage() {
  const here = window.location.pathname.replace(/\/+$/, '') || '/';
  return SIGN_IN_PLACES.includes(here);
}

/**
 * The first screen is ready: the coach portal says so itself
 * (data-first-screen), and a client page has its title with nothing still
 * loading on it.
 */
export function firstScreenReady(doc = document) {
  const root = doc.getElementById('root');
  if (!root) return true;
  if (root.querySelector('[data-first-screen="ready"]')) return true;
  if (root.querySelector('.cc-main--first, [aria-busy="true"], .ds-loading, [role="status"][aria-label="Loading"]')) return false;
  return Boolean(root.querySelector('h1'));
}

function revealPortal(reduce) {
  const root = document.getElementById('root');
  if (!root || typeof root.animate !== 'function') return;
  const frames = reduce
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
  try {
    root.animate(frames, { duration: OUT_MS, easing: reduce ? 'ease' : 'cubic-bezier(0.16, 1, 0.3, 1)' });
  } catch { /* the portal simply shows */ }
}

/**
 * Plays the moment once in this visit. Call it as sign-in succeeds, just
 * before moving to the portal's first page. Returns false when it has
 * already played (or can't, with no page to draw on).
 */
export function playSignInMoment() {
  if (played || typeof document === 'undefined' || !document.body) return false;
  played = true;
  const reduce = reducedMotion();
  const screen = document.createElement('div');
  screen.className = `ui-root si-moment${reduce ? ' si-moment--still' : ''}`;
  screen.setAttribute('aria-hidden', 'true');
  screen.dataset.signInMoment = 'together';
  screen.appendChild(drawMark());
  document.body.appendChild(screen);
  // The halves start moving on the next frame, from their corners.
  requestAnimationFrame(() => screen.classList.add('si-moment--go'));

  const started = Date.now();
  const finish = () => {
    screen.classList.add('si-moment--out');
    revealPortal(reduce);
    window.setTimeout(() => screen.remove(), OUT_MS + 20);
  };
  const waitForPortal = () => {
    const waited = Date.now() - started - LOCK_MS - HOLD_MS;
    if ((firstScreenReady() && !onSignInPage()) || waited >= WAIT_CAP_MS) return finish();
    return window.setTimeout(waitForPortal, POLL_MS);
  };
  window.setTimeout(waitForPortal, LOCK_MS + HOLD_MS);
  return true;
}
