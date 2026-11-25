import { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, matchPath, useLocation, useNavigate, Outlet, useNavigationType } from 'react-router-dom';
import { diag } from './utils/diag';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { MissionProvider } from './context/MissionContext';
import { FormProvider } from './context/FormContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import './lib/debugStorage'; // Make debugging utilities available
// Straight from each file, never the design index, so the opening part of
// the app holds only what it uses (the scale check, step 3).
import Crosshair from './components/design/Crosshair';
import ConnectionNotice from './components/design/ConnectionNotice';
import FloatingOrb from './components/design/FloatingOrb';
import { ToastProvider } from './components/design/Toast';
import { useToast } from './components/design/toastContext';
import { startUpdateChecks } from './lib/appUpdate';
import { startWarming } from './lib/warmDevice';
import { CoachChatProvider } from './components/coach/CoachChat';
import ProtectedLayout from './components/ProtectedLayout';
import ScrollToTop from './components/ScrollToTop';
import { claimOutsideWork } from './lib/guest/claim';
import { HEALTH_CHECKS_MOVED } from './lib/guest/claimRules';
import { GET_UNSTUCK_STEPS, MOVED, MOVED_UNDER, tabTitle } from './lib/navigation';
import { loadWithReload } from './lib/loadWithReload';

// Every page is its own part of the app (the scale check, step 3: the app
// was one 1.7 MB file, read before anything showed). A page's part loads
// when it is first shown, and the part for the address the app opens on is
// asked for at once (preloadOpeningPage, below), alongside signing in, so
// the first screen never waits for it in turn. The service worker still
// keeps every part on the device (vite.config.js), so all of it works offline.
const PAGE_FALLBACK = <div className="ui-root" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
const ALL_PAGES = [];
// Pages that follow one another within moments, a family: when one of them is
// asked for, the rest are too, so a move between them never waits for its
// part. The sign-in screens are one (the coach's code, You're in, the lost
// authenticator, set-up and the codes come straight after the password): while
// the next one's part was still coming, the screen before it stayed on show
// with the new address (fixer D, 22 Nov).
const FAMILIES = new Map();
function page(factory, name, family = null) {
  // Once its part has loaded the page shows straight away, never through
  // Suspense: React holds back what a Suspense boundary reveals by up to
  // 300 ms, which would hold up the first screen and every move.
  let Loaded = null;
  let loading = null;
  // `quiet`: asked for ahead of time (the opening page, the family, the idle
  // preload). A part that doesn't arrive then is simply asked for again when
  // the page shows. Only a page being shown reloads the app for a part that
  // won't load (loadWithReload: a deploy since the tab opened); a preload
  // that failed offline used to reload whatever page was open (fixer D, 22 Nov).
  const load = (quiet = false) => {
    if (!loading) {
      loading = factory().then((m) => {
        Loaded = name ? m[name] : m.default;
        return m;
      });
      loading.catch(() => { loading = null; });
    }
    if (family && !family.asked) {
      family.asked = true;
      for (const other of family.pages) if (other !== Page) other.preload().catch(() => {});
    }
    const now = loading;
    return quiet ? now : loadWithReload(() => now);
  };
  const Lazy = lazy(() => load().then(() => ({ default: Loaded })));
  function Page(props) {
    // Decided once, when the page first shows, so it never swaps between
    // the two (which would start the page again and lose what's on it).
    const [Ready] = useState(() => Loaded);
    if (Ready) return <Ready {...props} />;
    return (
      <Suspense fallback={PAGE_FALLBACK}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  Page.preload = () => load(true);
  ALL_PAGES.push(Page);
  if (family) family.pages.push(Page);
  return Page;
}
function family(name) {
  if (!FAMILIES.has(name)) FAMILIES.set(name, { asked: false, pages: [] });
  return FAMILIES.get(name);
}
const SIGN_IN = family('signIn');

// A few seconds after the first screen, when the device is idle, every
// other page's part is loaded too, one at a time, so moving to it never waits. They come
// from the device after the first visit (the service worker keeps them).
let preloadingAll = false;
function preloadAllPagesWhenIdle() {
  if (preloadingAll || typeof window === 'undefined') return;
  preloadingAll = true;
  const idle = (fn) => (typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback(fn, { timeout: 3000 })
    : window.setTimeout(fn, 200));
  let i = 0;
  const next = () => {
    if (i >= ALL_PAGES.length) return;
    const one = ALL_PAGES[i];
    i += 1;
    one.preload().catch(() => {}).finally(() => idle(next));
  };
  // After the first screen's own reads and the device's copies (warmDevice
  // starts at 4 s), so on a slow phone it never competes with them.
  window.setTimeout(() => idle(next), 6000);
}

const Home = page(() => import('./pages/Home'));
const About = page(() => import('./pages/About'));
const MyAccount = page(() => import('./pages/MyAccount'));
const MyJournal = page(() => import('./pages/MyJournal'));
const DailyJournal = page(() => import('./pages/DailyJournal'));
const DailyJournals = page(() => import('./pages/DailyJournals'));
const DailyJournalRead = page(() => import('./pages/DailyJournalRead'));
const MyReviews = page(() => import('./pages/MyReviews'));
const ReviewSummary = page(() => import('./pages/ReviewSummary'));
const ReviewPlan = page(() => import('./pages/ReviewPlan'));
const ReviewPlanSummary = page(() => import('./pages/ReviewPlanSummary'));
const DecisionSummary = page(() => import('./pages/DecisionSummary'));
const PlanMyDayStep1 = page(() => import('./pages/PlanMyDayStep1'));
const DailyPlanSummary = page(() => import('./pages/DailyPlanSummary'));
const MyPlans = page(() => import('./pages/MyPlans'));
const PlanMeeting = page(() => import('./pages/PlanMeeting'));
const MeetingSummary = page(() => import('./pages/MeetingSummary'));
const IfThenPlanning = page(() => import('./pages/IfThenPlanning'));
const IfThenPlanningSummary = page(() => import('./pages/IfThenPlanningSummary'));
const BreathingPage = page(() => import('./pages/BreathingPage'));
const BreathingSessionsSummary = page(() => import('./pages/BreathingSessionsSummary'));
const StopDoingAudit = page(() => import('./pages/StopDoingAudit'));
const StopDoingAuditSummary = page(() => import('./pages/StopDoingAuditSummary'));
const InversionStep1Goal = page(() => import('./pages/InversionStep1Goal'));
const InversionStep2Risks = page(() => import('./pages/InversionStep2Risks'));
const InversionStep3Plan = page(() => import('./pages/InversionStep3Plan'));
const InversionThinkingSummary = page(() => import('./pages/InversionThinkingSummary'));
const ToughConversationStep1Feedback = page(() => import('./pages/ToughConversationStep1Feedback'));
const ToughConversationSummary = page(() => import('./pages/ToughConversationSummary'));
const ToughConversationStep2Coaching = page(() => import('./pages/ToughConversationStep2Coaching'));
const EditPersonalDetails = page(() => import('./pages/EditPersonalDetails'));
const OnboardingMission = page(() => import('./pages/OnboardingMission'));
const PersonalOperatingPlan = page(() => import('./pages/PersonalOperatingPlan'));
const PersonalOperatingPlanEdit = page(() => import('./pages/PersonalOperatingPlanEdit'));
const PersonalOperatingPlanHistory = page(() => import('./pages/PersonalOperatingPlanHistory'));
const PersonalOperatingPlanHistoryVersion = page(() => import('./pages/PersonalOperatingPlanHistoryVersion'));
const PerformancePlan = page(() => import('./pages/performance/PerformancePlan'));
const PlanHistory = page(() => import('./pages/performance/PlanHistory'));
const PlanVersion = page(() => import('./pages/performance/PlanVersion'));
const PlanBuilder = page(() => import('./pages/performance/PlanBuilder'));
const SprintStart = page(() => import('./pages/performance/SprintStart'));
const SprintReview = page(() => import('./pages/performance/SprintReview'));
const SprintReviewRead = page(() => import('./pages/performance/SprintReviewRead'));
const RecoveryStart = page(() => import('./pages/performance/Recovery'));
const RecoveryCheckIn = page(() => import('./pages/performance/Recovery'), 'RecoveryCheckIn');
const RecoveryToday = page(() => import('./pages/performance/Recovery'), 'RecoveryToday');
const SprintYear = page(() => import('./pages/performance/SprintYear'));
const WeeklyDebrief = page(() => import('./pages/performance/WeeklyDebrief'));
const PerformanceSprint = page(() => import('./pages/performance/PerformanceSprint'));
const PlanMyDay = page(() => import('./pages/performance/PlanMyDay'));
const ReviewMyDay = page(() => import('./pages/performance/ReviewMyDay'));
const SleepWindDown = page(() => import('./pages/performance/SleepWindDown'));
const CheckIn = page(() => import('./pages/performance/CheckIn'));
const Dashboard = page(() => import('./pages/performance/Dashboard'));
const PersonalOperatingPlanArchived = page(() => import('./pages/PersonalOperatingPlanArchived'));
const PersonalOperatingPlanArchivedOne = page(() => import('./pages/PersonalOperatingPlanArchivedOne'));
const MissionProgressReviewDetail = page(() => import('./pages/MissionProgressReviewDetail'));
const SignIn = page(() => import('./pages/signin/SignIn'), null, SIGN_IN);
const CreateAccount = page(() => import('./pages/signin/CreateAccount'), null, SIGN_IN);
const CheckEmail = page(() => import('./pages/signin/CheckEmail'), null, SIGN_IN);
const EmailConfirmed = page(() => import('./pages/signin/EmailConfirmed'), null, SIGN_IN);
const ForgotPassword = page(() => import('./pages/signin/ForgotPassword'), null, SIGN_IN);
const NewPassword = page(() => import('./pages/signin/NewPassword'), null, SIGN_IN);
const Invite = page(() => import('./pages/signin/Invite'), null, SIGN_IN);
const GoogleReturn = page(() => import('./pages/signin/GoogleReturn'), null, SIGN_IN);
const BeforeYouStart = page(() => import('./pages/signin/BeforeYouStart'), null, SIGN_IN);
const CoachCode = page(() => import('./pages/signin/CoachCode'), null, SIGN_IN);
const CoachCodes = page(() => import('./pages/signin/CoachAuth'), 'CoachCodes', SIGN_IN);
const CoachIn = page(() => import('./pages/signin/CoachAuth'), 'CoachIn', SIGN_IN);
const CoachLost = page(() => import('./pages/signin/CoachAuth'), 'CoachLost', SIGN_IN);
const CoachSetUp = page(() => import('./pages/signin/CoachAuth'), 'CoachSetUp', SIGN_IN);
const AccountEmail = page(() => import('./pages/signin/AccountPages'), 'AccountEmail');
const AccountPassword = page(() => import('./pages/signin/AccountPages'), 'AccountPassword');
const SignInSecurity = page(() => import('./pages/signin/SignInSecurity'));
const LegalDocumentPage = page(() => import('./pages/legal/LegalDocumentPage'));
const HubPage = page(() => import('./pages/hubs/HubPage'));

// The page the app opens on, asked for straight away (see page() above).
// Only the pages people open the app on; any other page loads as it shows.
const OPENING_PAGES = [
  ['/welcome', () => Home],
  ['/daily-plan/*', () => PlanMyDay],
  ['/daily-review/*', () => ReviewMyDay],
  ['/performance-sprint/debrief/*', () => WeeklyDebrief],
  ['/performance-sprint', () => PerformanceSprint],
  ['/performance-plan', () => PerformancePlan],
  ['/dashboard', () => Dashboard],
  ['/monthly-review/*', () => CheckIn],
  ['/my-account', () => MyAccount],
  ['/my-plans', () => MyPlans],
  ['/my-reviews', () => MyReviews],
  ['/breathe', () => BreathingPage],
  ['/auth/login', () => SignIn],
  ['/coach/sign-in', () => SignIn],
  ['/coach/sign-in/code', () => CoachCode],
  // The coach portal, already its own part (CoachApp, below).
  ['/coach/*', () => ({ preload: coachAppPart })],
];
function preloadOpeningPage() {
  if (typeof window === 'undefined') return null;
  try {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    let found = null;
    if (path === '/') {
      // Signed in on this device: Home; otherwise the sign-in page.
      found = window.localStorage.getItem('clarity-portal-auth') ? Home : SignIn;
    } else {
      const hit = OPENING_PAGES.find(([pattern]) => matchPath(pattern, path));
      found = hit ? hit[1]() : null;
    }
    // Waited for (briefly) before the first screen, so it shows without
    // Suspense's hold-back; a part that doesn't load is left to the page.
    return found ? found.preload().catch(() => {}) : null;
  } catch {
    return null; // the page loads as it shows
  }
}
const OPENING_WAIT_MS = 4000;
// The two faces the first screen's words are set in (preloaded by index.html,
// vite.config.js openingPreload): waited for with the page's part, at most
// OPENING_FONTS_MS, so a first visit never draws its words in the fallback
// font and then swaps them (UI tester, scale check).
const OPENING_FONTS_MS = 1500;
function openingFonts() {
  try {
    if (typeof document === 'undefined' || !document.fonts?.load) return null;
    const both = Promise.all([document.fonts.load('400 16px "DM Sans"'), document.fonts.load('400 16px "Nekst"')]).catch(() => {});
    return Promise.race([both, new Promise((done) => { window.setTimeout(done, OPENING_FONTS_MS); })]);
  } catch {
    return null;
  }
}
const openingPage = (() => {
  const part = preloadOpeningPage();
  if (!part) return null;
  const fonts = openingFonts();
  return fonts ? Promise.all([part, fonts]) : part;
})();


// Wheel of Life (Review section, inside the portal). Lazy-loaded, like the
// Health Check, so its pages and styles stay out of the main bundle.
const GetUnstuck = lazy(() => loadWithReload(() => import('./pages/getUnstuck/GetUnstuck')));
const TeamCheck = lazy(() => loadWithReload(() => import('./pages/teamCheck/TeamCheck')));
const HealthCheckInside = lazy(() => loadWithReload(() => import('./pages/healthCheckInside/HealthCheckInside')));
const EmotionalWash = lazy(() => loadWithReload(() => import('./pages/emotionalWash/EmotionalWash')));
const Coaching = lazy(() => loadWithReload(() => import('./pages/coaching/Coaching')));
const SignAgreement = lazy(() => loadWithReload(() => import('./pages/coaching/SignAgreement')));
// Agreements, quotes and money (Phase 6b run 3; Group C's pages): settling and the welcome after signing, My Account's
// invoices, block of hours and plan (/coaching/billing now goes to My Account, Invoices), and the two public link pages.
const AgreementSettle = lazy(() => loadWithReload(() => import('./pages/coaching/Settle')));
const AgreementWelcome = lazy(() => loadWithReload(() => import('./pages/coaching/Welcome')));
const AccountInvoices = lazy(() => loadWithReload(() => import('./pages/account/Invoices')));
const AccountHours = lazy(() => loadWithReload(() => import('./pages/account/Hours')));
const AccountPlan = lazy(() => loadWithReload(() => import('./pages/account/Plan')));
const AccountCancelPlan = lazy(() => loadWithReload(() => import('./pages/account/CancelPlan')));
const QuotePage = lazy(() => loadWithReload(() => import('./pages/agreementLink/QuotePage')));
const SponsorSign = lazy(() => loadWithReload(() => import('./pages/agreementLink/SponsorSign')));
const PeakMoments = lazy(() => loadWithReload(() => import('./pages/peakMoments/PeakMoments')));
const TravelPlan = lazy(() => loadWithReload(() => import('./pages/travelPlan/TravelPlan')));
const GuestLink = lazy(() => loadWithReload(() => import('./pages/guest/GuestLink')));
// Clarity Coach, the coach portal (Phase 6a): its own lazy-loaded part, so
// none of it is in a client's bundle. The two public workshop pages too.
// Once its part has loaded (asked for as the app opens on a coach portal address) it shows straight away, never
// through Suspense, as page() does for the client pages: React holds back what a Suspense boundary reveals by up to
// 300 ms, which held a coach's first screen up by about 0.3 s (coach first screen run). It isn't among the pages every
// visit preloads when idle (page()'s ALL_PAGES): a client never downloads the coach portal.
let CoachAppLoaded = null;
function coachAppPart() {
  return import('./pages/coach/CoachApp').then((m) => { CoachAppLoaded = m.default; return m; });
}
const CoachAppLazy = lazy(() => loadWithReload(coachAppPart));
function CoachApp() {
  // Decided once, when it first shows, so it never swaps between the two.
  const [Ready] = useState(() => CoachAppLoaded);
  return Ready ? <Ready /> : lazyPage(CoachAppLazy);
}
const WorkshopRegister = lazy(() => loadWithReload(() => import('./pages/coach/WorkshopPublic').then((m) => ({ default: m.WorkshopRegister }))));
// The booking pages (Phase 6a run 3): a call type's page, a single-use link, a guest's own booking and a poll.
const BookingPage = lazy(() => loadWithReload(() => import('./pages/coach/BookingPublic').then((m) => ({ default: m.BookingPage }))));
const BookingMine = lazy(() => loadWithReload(() => import('./pages/coach/BookingPublic').then((m) => ({ default: m.BookingMine }))));
const PollVote = lazy(() => loadWithReload(() => import('./pages/coach/BookingPublic').then((m) => ({ default: m.PollVote }))));
const WorkshopSurvey = lazy(() => loadWithReload(() => import('./pages/coach/WorkshopPublic').then((m) => ({ default: m.WorkshopSurvey }))));
const WheelStart = lazy(() => loadWithReload(() => import('./pages/wheelOfLife/WheelStart')));
const WheelAreas = lazy(() => loadWithReload(() => import('./pages/wheelOfLife/WheelAreas')));
const WheelCheckIn = lazy(() => loadWithReload(() => import('./pages/wheelOfLife/WheelCheckIn')));
const WheelResults = lazy(() => loadWithReload(() => import('./pages/wheelOfLife/WheelResults')));
const WheelTargets = lazy(() => loadWithReload(() => import('./pages/wheelOfLife/WheelTargets')));
const lazyPage = (Page) => (
  <Suspense fallback={<div className="ui-root" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
    <Page />
  </Suspense>
);

// The private link carries a secret token in the path: never write it into
// the local diagnostics log.
const redactHealthCheckToken = (pathname) => pathname.replace(/^(\/health-check\/|\/guest\/).*/, '$1[token]');

// Retired in Phase 3, step 4: the Weekly momentum check-in and the POP
// review. Starting a new weekly check-in (/my-journal with reviewType
// weekly-momentum and no saved entry) opens the Weekly performance
// debrief instead; a saved one (entryId) still opens, so old check-ins
// stay viewable and their drafts can be finished. After-action reviews
// are untouched. The debrief page itself explains when no debrief is
// open or no sprint is running, and links to the sprint.
function MyJournalRoute() {
  const location = useLocation();
  if (location.state?.reviewType === 'weekly-momentum' && !location.state?.entryId) {
    return <Navigate to="/performance-sprint/debrief" replace />;
  }
  return <MyJournal />;
}

// The browser tab names the page someone is on, by its full name
// (navigation.js tabTitle): "Individual Performance Dashboard, The
// Clarity Portal". The outside Health Check sets its own.
function TabTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    // The coach portal and the workshop pages name their own tabs.
    if (/^\/(health-check|coach(?!\/sign-in)|workshop|book|poll)(\/|$)/.test(pathname)) return;
    document.title = tabTitle(pathname);
  }, [pathname]);
  return null;
}

// An old address moved to a new one (Phase 4): the query, the hash and
// any state go with it, so nothing that relied on them is lost.
function MovedTo({ to }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} state={location.state} replace />;
}

// An old address that carries something after it (a day, a month): the
// rest of the address goes with it too (the renames of 10 Nov).
function MovedUnder({ from, to }) {
  const location = useLocation();
  const rest = location.pathname.slice(from.length).replace(/\/+$/, '');
  return <Navigate to={{ pathname: `${to}${rest}`, search: location.search, hash: location.hash }} state={location.state} replace />;
}

// Two old addresses that meant two things (Phase 4, step 5). /plan-my-day
// started the old Daily plan, and still finishes an old saved day plan
// (state.decisionId); with no saved plan it opens the new Daily plan.
// /review-plan was the old Daily review and still reviews a saved plan
// (a meeting plan, a Pressure plan, a Pre-mortem, feedback or an old day
// plan, in state.plan); with no plan it opens the new Daily review.
function PlanMyDayRoute() {
  const location = useLocation();
  if (!location.state?.decisionId) {
    return <Navigate to={{ pathname: '/daily-plan', search: location.search, hash: location.hash }} replace />;
  }
  return <PlanMyDayStep1 />;
}

function ReviewPlanRoute() {
  const location = useLocation();
  if (!location.state?.plan) {
    return <Navigate to={{ pathname: '/daily-review', search: location.search, hash: location.hash }} replace />;
  }
  return <ReviewPlan />;
}

function AppContent() {
  const { isLoading, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const toast = useToast();
  // The opening page's part of the app (preloadOpeningPage): the opening
  // screen stays until it is here, at most OPENING_WAIT_MS.
  const [openingReady, setOpeningReady] = useState(() => !openingPage);
  useEffect(() => {
    if (openingReady) return undefined;
    const timer = window.setTimeout(() => setOpeningReady(true), OPENING_WAIT_MS);
    openingPage.finally(() => setOpeningReady(true));
    return () => window.clearTimeout(timer);
  }, [openingReady]);

  // The key pages' data kept on the device, once per visit (warmDevice.js).
  useEffect(() => { startWarming(user?.id ?? null); }, [user?.id]);
  // Every page's part of the app, once the first screen is up (page() above).
  useEffect(() => { if (!isLoading) preloadAllPagesWhenIdle(); }, [isLoading]);

  // Boot diagnostics
  useEffect(() => {
    try {
      const navEntry = performance.getEntriesByType('navigation')[0];
      const navType = navEntry?.type || 'unknown';
      diag('APP_BOOT', {
        navType,
        pathname: redactHealthCheckToken(location.pathname),
        historyLength: window.history.length
      });
    } catch (e) {
      // Silently ignore
    }
  }, []);

  // Route change diagnostics
  useEffect(() => {
    diag('ROUTE_CHANGE', {
      pathname: redactHealthCheckToken(location.pathname),
      key: location.key,
      navType: navigationType,
      historyLength: window.history.length
    });
  }, [location.pathname, location.key, navigationType]);

  // Each page shows dark, or follows the colour mode if it has been
  // rebuilt for both (src/lib/colourMode/boot.js), so check on every move.
  useEffect(() => {
    window.ClarityColourMode?.refresh();
  }, [location.pathname]);

  // Handle confirmation code redirects (Supabase email links may land on root with code parameter)
  useEffect(() => {
    // Check if we're on the root path with a confirmation code
    if (location.pathname === '/' && location.search) {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const error = params.get('error');

      // A code or an error on the root address: Email confirmed (/auth/confirmed) reads it
      if (code || error) {
        navigate(`/auth/confirmed${location.search}${location.hash}`, { replace: true });
      }
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  // A guest's answers, and each finished outside Health Check, move into
  // the account that signs up with the same email (035's guest_claim and
  // 044's alignment_claim, once the email is confirmed), with the guest's
  // choice of who sees them. Nothing happens, and nothing is said, until
  // those migrations have run. A Health Check that moved says so on Your
  // teams (M7's one-off tip), so it has no toast of its own.
  const claimFor = user?.id && user.email_confirmed_at ? user.id : null;
  useEffect(() => {
    if (!claimFor) return undefined;
    // Asked just after the first screen's own reads (2 seconds, then when
    // the device is idle): the claim is a write, and a write makes the reads
    // the first screen's loaders share be asked again (readShare.js).
    let live = true;
    const claim = () => {
      if (!live) return;
      claimOutsideWork(claimFor).then((moved) => {
        if (moved.guest > 0) toast.show('Your plan has moved into My Plans.');
        if (moved.healthChecks > 0) window.dispatchEvent(new window.Event(HEALTH_CHECKS_MOVED));
      });
    };
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(claim, { timeout: 2000 });
      else claim();
    }, 2000);
    return () => { live = false; window.clearTimeout(timer); };
    // Once per sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimFor]);

  if (isLoading || !openingReady) {
    // The opening screen: the turning crosshair on the page colour, the
    // same as the one index.html shows before the app has loaded (Tim,
    // 26 Oct), so the hand-over is seamless.
    return (
      <div className="ui-root ds-opening" role="status" aria-label="Loading">
        <Crosshair size="lg" tone="coral" spin />
      </div>
    );
  }

  // Determine if buttons should be hidden on current page
  const hideButtons = [
    '/',
    '/login',
    '/check-email-confirmation',
    '/auth/callback',
    '/email-confirmation',
    '/onboarding-mission',
    '/personal-operating-plan-edit',
    '/personal-operating-plan-review',
    '/personal-operating-plan-history',
    '/personal-operating-plan-archived',
    '/mission-progress-review',
    '/terms-of-service',
    '/privacy-policy',
    '/data-storage-notice',
    '/auth/login',
    '/auth/sign-up',
    '/auth/sign-up/account',
    '/auth/check-email',
    '/auth/confirmed',
    '/auth/invite',
    '/auth/google',
    '/auth/before-you-start',
    '/coach/sign-in',
    '/coach/sign-in/code',
    '/coach/sign-in/help',
    '/auth/mission',
    '/auth/finished',
    '/auth/welcome-back',
    '/forgot-password',
    '/forgot-password/check-email',
    '/auth/reset-password',
    '/breathe',
    // Life balance review screens with a pinned footer bar (as /breathe).
    '/life-balance-review/areas',
    '/life-balance-review/check-in',
    '/life-balance-review/targets'
  ].includes(location.pathname)
    || location.pathname.startsWith('/legal/')
    || location.pathname.startsWith('/health-check/')
    || location.pathname.startsWith('/guest/')
    || location.pathname === '/coach' || location.pathname.startsWith('/coach/')
    || location.pathname.startsWith('/workshop/')
    || location.pathname.startsWith('/book/') || location.pathname.startsWith('/poll/')
    || location.pathname.startsWith('/personal-operating-plan-history/')
    || location.pathname.startsWith('/personal-operating-plan-archived/');

  return (
    <>
      <TabTitle />
      <ScrollToTop />
      <ErrorBoundary>
        <Routes>
          {/* PUBLIC ROUTES - no sign-in needed. The sign-in pages (mock-up
              M26; Tim, 11 Nov) sit outside ProtectedLayout, so they never
              show the header, the menu or the phone bar. Each address an
              email link or an old bookmark may still hold keeps working. */}
          <Route path="/" element={user ? <Navigate to="/welcome" replace /> : <Navigate to="/auth/login" replace />} />
        <Route path="/login" element={<MovedTo to="/auth/login" />} />
        <Route path="/terms-of-service" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/privacy-policy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/data-storage-notice" element={<Navigate to="/legal/data-storage" replace />} />

        {/* A tool without an account, through a coach's link (M9's guest
            pages; migration 035): /guest/<token>. */}
        <Route path="/guest/:token" element={lazyPage(GuestLink)} />

        {/* A workshop's registration page and its survey (M11): no account
            needed, by the page's or the person's own key (migration 049). */}
        <Route path="/workshop/survey/:key" element={lazyPage(WorkshopSurvey)} />
        <Route path="/workshop/:key" element={lazyPage(WorkshopRegister)} />

        {/* Booking (M11's booking pages; migration 051): no account needed,
            by a call type's page key, a single-use link, the guest's own
            key, or a person's own key for a poll. */}
        <Route path="/book/link/:key" element={lazyPage(BookingPage)} />
        <Route path="/book/mine/:key" element={lazyPage(BookingMine)} />
        <Route path="/book/:key" element={lazyPage(BookingPage)} />
        <Route path="/poll/:key" element={lazyPage(PollVote)} />

        {/* A quote's page and a sponsor's signing page (Phase 6b run 3; M28 s-q-client, s-s-sign): no account needed,
            by the link's own token (065's quote_open and sponsor_link_open). */}
        <Route path="/quote/:token" element={lazyPage(QuotePage)} />
        <Route path="/sign/:token" element={lazyPage(SponsorSign)} />

        {/* Signing in and creating an account. */}
        <Route path="/auth/login" element={<SignIn />} />
        <Route path="/auth/sign-up" element={<CreateAccount />} />
        <Route path="/auth/sign-up/account" element={<MovedTo to="/auth/sign-up" />} />
        <Route path="/auth/check-email" element={<CheckEmail kind="confirm" />} />
        <Route path="/check-email-confirmation" element={<MovedTo to="/auth/check-email" />} />
        {/* Where a new account's email link lands. The two older addresses
            are in emails already sent, so they show the same page. */}
        <Route path="/auth/confirmed" element={<EmailConfirmed />} />
        <Route path="/auth/mission" element={<EmailConfirmed />} />
        <Route path="/email-confirmation" element={<EmailConfirmed />} />
        <Route path="/auth/invite" element={<Invite />} />
        {/* Where Continue with Google comes back to (and the older
            callback address), then Before you start for a Google account
            the portal has never seen. */}
        <Route path="/auth/google" element={<GoogleReturn />} />
        <Route path="/auth/callback" element={<GoogleReturn />} />
        <Route path="/auth/before-you-start" element={<BeforeYouStart />} />
        {/* The old welcome screens: straight to Home now. */}
        <Route path="/auth/finished" element={<Navigate to="/welcome" replace />} />
        <Route path="/auth/welcome-back" element={<Navigate to="/welcome" replace />} />

        {/* Coaches have their own sign-in page at its own address, with no
            Create my account link, then the code from their authenticator
            app (Tim, 11 Nov; set up first since Phase 6a run 5). */}
        <Route path="/coach/sign-in" element={<SignIn coach />} />
        <Route path="/coach/sign-in/code" element={<CoachCode />} />
        {/* The coach authenticator (Phase 6a run 5; M26 seq 7): set it up,
            save the recovery codes, lost the phone, and You're in. A coach
            with no authenticator is brought here after the password and
            can't reach the coach portal until it's done. */}
        <Route path="/coach/sign-in/set-up" element={<CoachSetUp />} />
        <Route path="/coach/sign-in/recovery-codes" element={<CoachCodes />} />
        <Route path="/coach/sign-in/help" element={<CoachLost />} />
        <Route path="/coach/sign-in/in" element={<CoachIn />} />

        {/* Passwords. /auth/reset-password is where a reset link lands. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot-password/check-email" element={<CheckEmail kind="reset" />} />
        <Route path="/auth/reset-password" element={<NewPassword />} />

        {/* Standalone, publicly reachable versions of the same three
            documents the sign-up reading pop-up shows, linked from the
            foot of the log in / sign up screens - see
            src/pages/legal/LegalDocumentPage.jsx. */}
        <Route path="/legal/:doc" element={<LegalDocumentPage />} />

        {/* The outside Health Check (/health-check/<token>) is its own page, health-check.html, which Vercel serves for
            every /health-check address; the portal's own older copy was deleted on 24 Nov (Tim). */}

        {/* PROTECTED ROUTES - ALL routes here require valid session */}
        <Route element={<ProtectedLayout />}>
          {/* Clarity Coach (Phase 6a): open only to coach accounts (CoachApp
              sends anyone else to their own Home). */}
          <Route path="/coach/*" element={<CoachApp />} />
          <Route path="/about" element={<About />} />
          <Route path="/welcome" element={<Home />} />
          {/* The hub pages (M3, Phase 4 step 1), and the old section pages
              moved onto them. */}
          <Route path="/personal" element={<HubPage hub="personal" />} />
          <Route path="/personal/plan" element={<HubPage hub="plan" />} />
          <Route path="/personal/reset" element={<HubPage hub="reset" />} />
          <Route path="/personal/review" element={<HubPage hub="review" />} />
          <Route path="/interpersonal" element={<HubPage hub="interpersonal" />} />
          <Route path="/strategic" element={<HubPage hub="strategic" />} />
          {Object.entries(MOVED).map(([from, to]) => (
            <Route key={from} path={from} element={<MovedTo to={to} />} />
          ))}
          <Route path="/onboarding-mission" element={<OnboardingMission />} />
          <Route path="/personal-operating-plan" element={<PersonalOperatingPlan />} />
          <Route path="/personal-operating-plan-edit" element={<PersonalOperatingPlanEdit />} />
          {/* Retired in Phase 3, step 4: the end-of-sprint review replaces the
              POP review. Saved POP reviews stay readable at
              /mission-progress-review. The page file is kept. */}
          <Route path="/personal-operating-plan-review" element={<Navigate to="/performance-sprint/review" replace />} />
          <Route path="/personal-operating-plan-history" element={<PersonalOperatingPlanHistory />} />
          <Route path="/personal-operating-plan-history/:version" element={<PersonalOperatingPlanHistoryVersion />} />
          <Route path="/personal-operating-plan-archived" element={<PersonalOperatingPlanArchived />} />
          <Route path="/performance-plan" element={<PerformancePlan />} />
          <Route path="/performance-plan/history" element={<PlanHistory />} />
          <Route path="/performance-plan/history/:version" element={<PlanVersion />} />
          <Route path="/performance-plan/build" element={<PlanBuilder />} />
          <Route path="/performance-plan/edit" element={<PlanBuilder editing />} />
          <Route path="/performance-sprint" element={<PerformanceSprint />} />
          <Route path="/performance-sprint/start" element={<SprintStart />} />
          <Route path="/performance-sprint/review" element={<SprintReview />} />
          <Route path="/performance-sprint/review/:sprintId" element={<SprintReviewRead />} />
          <Route path="/recovery" element={<RecoveryStart />} />
          <Route path="/recovery/today" element={<RecoveryToday />} />
          <Route path="/recovery/check-in" element={<RecoveryCheckIn />} />
          <Route path="/performance-sprint/year" element={<SprintYear />} />
          <Route path="/performance-sprint/debrief" element={<WeeklyDebrief />} />
          <Route path="/performance-sprint/debrief/:sprintId/:week" element={<WeeklyDebrief />} />
          <Route path="/daily-plan" element={<PlanMyDay />} />
          <Route path="/daily-plan/:date" element={<PlanMyDay />} />
          <Route path="/daily-review" element={<ReviewMyDay />} />
          <Route path="/daily-review/:date" element={<ReviewMyDay />} />
          {/* The old addresses (before 10 Nov), with whatever follows them. */}
          {Object.entries(MOVED_UNDER).map(([from, to]) => (
            <Route key={from} path={`${from}/*`} element={<MovedUnder from={from} to={to} />} />
          ))}
          <Route path="/sleep-wind-down" element={<SleepWindDown />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/monthly-review" element={<CheckIn />} />
          <Route path="/monthly-review/:month" element={<CheckIn />} />
          <Route path="/monthly-review/:month/answers" element={<CheckIn />} />
          <Route path="/personal-operating-plan-archived/:missionId" element={<PersonalOperatingPlanArchivedOne />} />
          <Route path="/mission-progress-review" element={<MissionProgressReviewDetail />} />
          <Route path="/my-account" element={<MyAccount />} />
          <Route path="/my-account/password" element={<AccountPassword />} />
          <Route path="/my-account/email" element={<AccountEmail />} />
          <Route path="/my-account/sign-in-security" element={<SignInSecurity />} />
          <Route path="/my-account/invoices" element={lazyPage(AccountInvoices)} />
          <Route path="/my-account/hours" element={lazyPage(AccountHours)} />
          <Route path="/my-account/plan" element={lazyPage(AccountPlan)} />
          <Route path="/my-account/plan/cancel" element={lazyPage(AccountCancelPlan)} />
          <Route path="/my-journal" element={<MyJournalRoute />} />
          <Route path="/daily-journal" element={<DailyJournal />} />
          <Route path="/daily-journals" element={<DailyJournals />} />
          <Route path="/daily-journals/:date" element={<DailyJournalRead />} />
          <Route path="/my-reviews" element={<MyReviews />} />
          <Route path="/review-summary" element={<ReviewSummary />} />
          <Route path="/review-plan" element={<ReviewPlanRoute />} />
          <Route path="/review-plan-summary" element={<ReviewPlanSummary />} />
          <Route path="/decision-summary" element={<DecisionSummary />} />
          <Route path="/life-balance-review" element={lazyPage(WheelStart)} />
          <Route path="/life-balance-review/areas" element={lazyPage(WheelAreas)} />
          <Route path="/life-balance-review/check-in" element={lazyPage(WheelCheckIn)} />
          <Route path="/life-balance-review/results" element={lazyPage(WheelResults)} />
          <Route path="/life-balance-review/targets" element={lazyPage(WheelTargets)} />
          <Route path="/plan-my-day" element={<PlanMyDayRoute />} />
          <Route path="/daily-plan-summary" element={<DailyPlanSummary />} />
          <Route path="/plan-meeting" element={<PlanMeeting />} />
          <Route path="/meeting-summary" element={<MeetingSummary />} />
          <Route path="/pressure-plan" element={<IfThenPlanning />} />
          <Route path="/pressure-plan/summary" element={<IfThenPlanningSummary />} />
          <Route path="/breathe" element={<BreathingPage />} />
          <Route path="/breathing-sessions-summary" element={<BreathingSessionsSummary />} />
          <Route path="/time-audit" element={<StopDoingAudit />} />
          <Route path="/time-audit/summary" element={<StopDoingAuditSummary />} />
          <Route path="/my-plans" element={<MyPlans />} />
          {/* Get unstuck is one guided tool (M9; Tim, 13 Nov). Its old step
              addresses come to it with their query, hash and state. */}
          <Route path="/get-unstuck" element={lazyPage(GetUnstuck)} />
          <Route path="/team-performance-check" element={lazyPage(TeamCheck)} />
          {/* The Health Check inside the portal (M7 version 8.2): teams, versions, Compare. */}
          <Route path="/strategic-alignment/*" element={lazyPage(HealthCheckInside)} />
          <Route path="/emotional-wash" element={lazyPage(EmotionalWash)} />
          {/* Peak moments (M18, Phase 8b): the list, Add, Edit and the review after. */}
          <Route path="/peak-moments/*" element={lazyPage(PeakMoments)} />
          <Route path="/coaching" element={lazyPage(Coaching)} />
          {/* Signing a coaching agreement and Billing (Phase 6b run 1, M13 A3 to A8). */}
          <Route path="/coaching/agreement/:versionId" element={lazyPage(SignAgreement)} />
          <Route path="/coaching/agreement/:versionId/settle" element={lazyPage(AgreementSettle)} />
          <Route path="/coaching/agreement/:versionId/welcome" element={lazyPage(AgreementWelcome)} />
          {/* Billing is My Account, Invoices since Phase 6b run 3: the old address goes there with its query, hash and state. */}
          <Route path="/coaching/billing" element={<MovedTo to="/my-account/invoices" />} />
          <Route path="/travel-plan/*" element={lazyPage(TravelPlan)} />
          {GET_UNSTUCK_STEPS.map((path) => (
            <Route key={path} path={path} element={<MovedTo to="/get-unstuck" />} />
          ))}
          <Route path="/pre-mortem" element={<InversionStep1Goal />} />
          <Route path="/pre-mortem/risks" element={<InversionStep2Risks />} />
          <Route path="/pre-mortem/plan" element={<InversionStep3Plan />} />
          <Route path="/pre-mortem/summary" element={<InversionThinkingSummary />} />
          <Route path="/give-difficult-feedback" element={<ToughConversationStep1Feedback />} />
          <Route path="/give-difficult-feedback/questions" element={<ToughConversationStep2Coaching />} />
          <Route path="/give-difficult-feedback/summary" element={<ToughConversationSummary />} />
          <Route path="/edit-profile" element={<EditPersonalDetails />} />
          {/* TEMP - dev-only test route for Build Prompt 5, remove when prompts 6-10 wire the real pages */}
        </Route>

          {/* Catch-all for unmatched routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      {/* The one floating button (desktop only): Breathe. Chat to the
          coach is in the header on desktop and in My Account on phone. */}
      {!hideButtons && user && (
        <div className="ui-root ds-portal no-print">
          <FloatingOrb pageKey={location.pathname} onBreathe={() => navigate('/breathe')} />
        </div>
      )}
      {/* The calm offline message, and "Saved" once saves made offline
          have gone (Tim, 26 Oct). */}
      {user && <ConnectionNotice />}
    </>
  );
}

startUpdateChecks();

export default function App() {
  return (
    <AuthProvider>
      <MissionProvider>
        <FormProvider>
          <ToastProvider>
            <CoachChatProvider>
              <BrowserRouter>
                <AppContent />
              </BrowserRouter>
            </CoachChatProvider>
          </ToastProvider>
        </FormProvider>
      </MissionProvider>
    </AuthProvider>
  );
}
