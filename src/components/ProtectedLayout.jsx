import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { justSignedOut, rememberNext, sessionEndedJustNow, SIGN_IN_PATHS } from '../lib/signIn/addresses';
import { goToStop, hasAuthenticator, signInStop } from '../lib/signIn/flow';
import { COACH_AUTH_PATHS, isCoachPlace, SIGN_IN_AGAIN } from '../lib/signIn/coachAuth';
import { needsBeforeYouStart } from '../lib/signIn/terms';
import { knownNotCoach, refreshCoachRole } from '../lib/coach/role';
import { diag } from '../utils/diag';
import { ClientFrame } from './SiteMenu';

/** How often, at most, the coach portal asks again what a coach owes (a reset since, say). */
const RECHECK_MS = 10 * 1000;

/**
 * Master auth guard - wraps ALL protected routes via React Router layout pattern.
 * Routes inside this layout are GUARANTEED to have a valid session or redirected to login.
 * This is the SINGLE enforcement point for ALL protected routes - no exceptions, no bypasses.
 */
export default function ProtectedLayout() {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  // The page they asked for, as the router has it: read here, not from the
  // address bar, which has already moved on by the time a redirect runs twice.
  const location = useLocation();
  const asked = `${location.pathname}${location.search}${location.hash}`;
  const prevStateRef = useRef({ isLoading: true, userExists: false });

  // Log state changes
  useEffect(() => {
    const prevIsLoading = prevStateRef.current.isLoading;
    const prevUserExists = prevStateRef.current.userExists;
    const currentUserExists = !!user;

    if (prevIsLoading !== isLoading) {
      diag('PROTECTED_LAYOUT_LOADING', { isLoading });
      prevStateRef.current.isLoading = isLoading;
    }

    if (prevUserExists !== currentUserExists) {
      diag('PROTECTED_LAYOUT_USER', { userExists: currentUserExists });
      prevStateRef.current.userExists = currentUserExists;
    }
  }, [isLoading, user]);

  useEffect(() => {
    // Only check after auth is fully loaded
    if (isLoading) return;

    // If no valid user after auth check complete, redirect to login immediately
    if (!user) {
      // Where they were heading goes with them, so signing in lands them
      // there (Tim, 11 Nov): the path with its query and hash.
      // Not after a deliberate Sign out: the next person to sign in here
      // starts at Home, not on the page the last one left from.
      // A coach portal address goes to Coach sign in (sign-in rule 23). A
      // sign-in the server ended there (its refresh refused) says only
      // "Please sign in again." and keeps the place they were on: from here
      // nothing tells an owner's reset from a sign-in that ran out, so it
      // never says the authenticator was reset (follow-up 5, item 13). A
      // reset seen by the coach portal's own check says so (goToStop).
      const coach = isCoachPlace(location.pathname);
      const ended = coach && sessionEndedJustNow();
      navigate(coach ? SIGN_IN_PATHS.coach : '/auth/login', {
        state: justSignedOut() ? { fromDirect: true } : { returnTo: asked, fromDirect: true, ...(ended ? { message: SIGN_IN_AGAIN } : {}) },
        replace: true
      });
    }
  }, [isLoading, user, navigate, asked, location.pathname]);

  // A stop someone still owes before the portal opens (src/lib/signIn/flow.js):
  // a Google account the portal has never seen must tick the box on Before
  // you start, and an account with an authenticator app must give its
  // code. Whichever way they came in, no page opens until it's done.
  // Everyone else (no authenticator, already agreed) is never held up.
  // The coach portal holds every coach too (Phase 6a run 5): set up the
  // authenticator, give its code, save the recovery codes; a sign-in from
  // before the owner's reset is let go. Typing the coach portal's address
  // is asked the same way, so it never skips a stop. Clients' pages never
  // ask about any of this.
  const coachPlace = isCoachPlace(location.pathname);
  // A client opening the coach portal goes Home at once (polish 1): never the coach checks, never a blank page.
  const clientInCoachPlace = coachPlace && Boolean(user) && !isLoading && knownNotCoach(user.id);
  useEffect(() => { if (clientInCoachPlace) refreshCoachRole(user?.id); }, [clientInCoachPlace, user?.id]);
  const mayOwe = Boolean(user) && !clientInCoachPlace && (coachPlace || hasAuthenticator(user) || needsBeforeYouStart(user));
  // What was found, who it was found for, and for which part of the
  // portal: an answer for one account never opens the portal for the next
  // one to sign in on this tab, and a client page's answer never opens
  // the coach portal.
  const [checked, setChecked] = useState({ id: null, coach: false, stop: undefined });
  const userId = user?.id || null;
  // In the coach portal it is asked again as the coach moves between its
  // pages and comes back to the tab, at most once in RECHECK_MS: a tab left
  // open when the owner reset the authenticator is let go then, not only on
  // its next reload (the break-it tester, 21 Nov). What was found stays on
  // screen meanwhile, so asking again never blanks the page.
  const [nudge, setNudge] = useState(0);
  const lastAsked = useRef(0);
  const checkedNow = useRef(checked);
  checkedNow.current = checked;
  useEffect(() => {
    if (!coachPlace || !userId) return undefined;
    const again = () => { if (document.visibilityState !== 'hidden') setNudge((n) => n + 1); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [coachPlace, userId]);
  const askAgain = coachPlace ? `${location.pathname}|${nudge}` : '';
  // Back from new recovery codes made in Sign-in security returns there (the Stage D break-it tester): the codes still
  // owed don't send that one step straight back to the codes, which wait in the tab. Any other address, typed or
  // moved to, still asks for them (sign-in rule 24).
  const codesBack = useRef(false);
  codesBack.current = location.pathname === COACH_AUTH_PATHS.security && location.state?.from === 'codes';
  useEffect(() => {
    if (!mayOwe) return undefined;
    const held = checkedNow.current;
    const clearedHere = held.id === userId && held.coach === coachPlace && held.stop === null;
    if (coachPlace && clearedHere && Date.now() - lastAsked.current < RECHECK_MS) return undefined;
    lastAsked.current = Date.now();
    let live = true;
    signInStop(supabase, user, { coach: coachPlace }).then(async (found) => {
      if (!live) return;
      const owed = found === 'codes' && codesBack.current ? null : found;
      // Let through on that one step only: the next move in the coach portal asks again at once.
      if (owed !== found) lastAsked.current = 0;
      if (owed) {
        if (owed !== 'signedOut') rememberNext(asked);
        await goToStop(supabase, navigate, owed);
      }
      if (live) setChecked({ id: userId, coach: coachPlace, stop: owed });
    });
    return () => { live = false; };
  }, [mayOwe, user, userId, navigate, coachPlace, askAgain]);
  const cleared = !mayOwe || (checked.id === userId && checked.coach === coachPlace && checked.stop === null);

  // During auth check, show loading screen (blocks rendering of child routes)
  if (isLoading) {
    return <div className="ui-root" role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  }

  // After auth check complete, only render child routes if user exists
  if (!user) {
    return null; // Redirect in progress
  }

  if (clientInCoachPlace) return <Navigate to="/welcome" replace />;

  // Still checking what they owe, or on their way to it: nothing shows.
  if (!cleared) {
    return <div className="ui-root" role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  }

  // User authenticated - render the matched child route via Outlet. The coach
  // portal draws its own frame; every client page sits in the client frame
  // (polish 1, rules 18 to 21: the menu column on a laptop, the crosshair's
  // menu in the phone header; it replaced the phone bar).
  if (coachPlace) return <Outlet />;
  return (
    <ClientFrame>
      <Outlet />
    </ClientFrame>
  );
}
