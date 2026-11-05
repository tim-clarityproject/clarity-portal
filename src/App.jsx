import { lazy, Suspense, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet, useNavigationType } from 'react-router-dom';
import { diag } from './utils/diag';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { MissionProvider } from './context/MissionContext';
import { FormProvider } from './context/FormContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import './lib/debugStorage'; // Make debugging utilities available
import { ConnectionNotice, Crosshair, FloatingOrb, ToastProvider } from './components/design';
import { startUpdateChecks } from './lib/appUpdate';
import { startWarming } from './lib/warmDevice';
import { CoachChatProvider } from './components/coach/CoachChat';
import ProtectedLayout from './components/ProtectedLayout';
import Home from './pages/Home';
import About from './pages/About';
import MyAccount from './pages/MyAccount';
import GoalSetting from './pages/GoalSetting';
import RisksAssessment from './pages/RisksAssessment';
import Strategies from './pages/Strategies';
import CriticalSuccessFactors from './pages/CriticalSuccessFactors';
import ProjectList from './pages/ProjectList';
import ProjectMatrix from './pages/ProjectMatrix';
import ProjectProgress from './pages/ProjectProgress';
import ProjectScatter from './pages/ProjectScatter';
import MyJournal from './pages/MyJournal';
import DailyJournal from './pages/DailyJournal';
import DailyJournals from './pages/DailyJournals';
import DailyJournalRead from './pages/DailyJournalRead';
import MyReviews from './pages/MyReviews';
import ReviewSummary from './pages/ReviewSummary';
import ReviewPlan from './pages/ReviewPlan';
import ReviewPlanSummary from './pages/ReviewPlanSummary';
import DecisionSummary from './pages/DecisionSummary';
import PlanMyDayStep1 from './pages/PlanMyDayStep1';
import DailyPlanSummary from './pages/DailyPlanSummary';
import MyPlans from './pages/MyPlans';
import PlanMeeting from './pages/PlanMeeting';
import MeetingSummary from './pages/MeetingSummary';
import IfThenPlanning from './pages/IfThenPlanning';
import IfThenPlanningSummary from './pages/IfThenPlanningSummary';
import BreathingPage from './pages/BreathingPage';
import BreathingSessionsSummary from './pages/BreathingSessionsSummary';
import StopDoingAudit from './pages/StopDoingAudit';
import StopDoingAuditSummary from './pages/StopDoingAuditSummary';
import GrowStep1Goal from './pages/GrowStep1Goal';
import GrowStep2Reality from './pages/GrowStep2Reality';
import GrowStep3Options from './pages/GrowStep3Options';
import GrowStep3bPrioritize from './pages/GrowStep3bPrioritize';
import GrowStep4WillDo from './pages/GrowStep4WillDo';
import InversionStep1Goal from './pages/InversionStep1Goal';
import InversionStep2Risks from './pages/InversionStep2Risks';
import InversionStep3Plan from './pages/InversionStep3Plan';
import InversionThinkingSummary from './pages/InversionThinkingSummary';
import ToughConversationStep1Feedback from './pages/ToughConversationStep1Feedback';
import ToughConversationSummary from './pages/ToughConversationSummary';
import ToughConversationStep2Coaching from './pages/ToughConversationStep2Coaching';
import AuthCallback from './pages/AuthCallback';
import EmailConfirmation from './pages/EmailConfirmation';
import CheckEmailConfirmation from './pages/CheckEmailConfirmation';
import EditPersonalDetails from './pages/EditPersonalDetails';
import OnboardingMission from './pages/OnboardingMission';
import PersonalOperatingPlan from './pages/PersonalOperatingPlan';
import PersonalOperatingPlanEdit from './pages/PersonalOperatingPlanEdit';
import PersonalOperatingPlanHistory from './pages/PersonalOperatingPlanHistory';
import PersonalOperatingPlanHistoryVersion from './pages/PersonalOperatingPlanHistoryVersion';
import PerformancePlan from './pages/performance/PerformancePlan';
import PlanHistory from './pages/performance/PlanHistory';
import PlanVersion from './pages/performance/PlanVersion';
import PlanBuilder from './pages/performance/PlanBuilder';
import SprintStart from './pages/performance/SprintStart';
import SprintReview from './pages/performance/SprintReview';
import SprintReviewRead from './pages/performance/SprintReviewRead';
import RecoveryStart, { RecoveryCheckIn, RecoveryToday } from './pages/performance/Recovery';
import SprintYear from './pages/performance/SprintYear';
import WeeklyDebrief from './pages/performance/WeeklyDebrief';
import PerformanceSprint from './pages/performance/PerformanceSprint';
import PlanMyDay from './pages/performance/PlanMyDay';
import ReviewMyDay from './pages/performance/ReviewMyDay';
import SleepWindDown from './pages/performance/SleepWindDown';
import CheckIn from './pages/performance/CheckIn';
import Dashboard from './pages/performance/Dashboard';
import PersonalOperatingPlanArchived from './pages/PersonalOperatingPlanArchived';
import PersonalOperatingPlanArchivedOne from './pages/PersonalOperatingPlanArchivedOne';
import MissionProgressReviewDetail from './pages/MissionProgressReviewDetail';
import AuthLogIn from './pages/auth/LogIn';
import AuthSignUpStep1 from './pages/auth/SignUpStep1';
import AuthSignUpStep2 from './pages/auth/SignUpStep2';
import AuthCheckYourEmail from './pages/auth/CheckYourEmail';
import AuthMission from './pages/auth/Mission';
import AuthFinished from './pages/auth/Finished';
import AuthWelcomeBack from './pages/auth/WelcomeBack';
import ForgotPassword from './pages/auth/ForgotPassword';
import ForgotPasswordCheckEmail from './pages/auth/ForgotPasswordCheckEmail';
import ResetPassword from './pages/auth/ResetPassword';
import LegalDocumentPage from './pages/legal/LegalDocumentPage';
import ScrollToTop from './components/ScrollToTop';
import HubPage from './pages/hubs/HubPage';
import { MOVED } from './lib/navigation';
import { loadWithReload } from './lib/loadWithReload';

// Strategic Alignment Health Check: a standalone page for people with no
// portal account. Lazy-loaded so none of it is in the portal's main bundle.
const HealthCheck = lazy(() => loadWithReload(() => import('./pages/alignment/HealthCheck')));

// Wheel of Life (Review section, inside the portal). Lazy-loaded, like the
// Health Check, so its pages and styles stay out of the main bundle.
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
const redactHealthCheckToken = (pathname) => pathname.replace(/^(\/health-check\/).*/, '$1[token]');

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

// An old address moved to a new one (Phase 4): the query, the hash and
// any state go with it, so nothing that relied on them is lost.
function MovedTo({ to }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} state={location.state} replace />;
}

// Two old addresses that meant two things (Phase 4, step 5). /plan-my-day
// started the old Plan my day, and still finishes an old saved day plan
// (state.decisionId); with no saved plan it opens the new Plan my day.
// /review-plan was the old Review my day and still reviews a saved plan
// (a meeting plan, a Pressure plan, a Pre-mortem, feedback or an old day
// plan, in state.plan); with no plan it opens the new Review my day.
function PlanMyDayRoute() {
  const location = useLocation();
  if (!location.state?.decisionId) {
    return <Navigate to={{ pathname: '/my-day/plan', search: location.search, hash: location.hash }} replace />;
  }
  return <PlanMyDayStep1 />;
}

function ReviewPlanRoute() {
  const location = useLocation();
  if (!location.state?.plan) {
    return <Navigate to={{ pathname: '/my-day/review', search: location.search, hash: location.hash }} replace />;
  }
  return <ReviewPlan />;
}

function AppContent() {
  const { isLoading, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  // The key pages' data kept on the device, once per visit (warmDevice.js).
  useEffect(() => { startWarming(user?.id ?? null); }, [user?.id]);

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
      const type = params.get('type');
      const error = params.get('error');

      // If there's a code or error parameter, redirect to email-confirmation to handle it properly
      if (code || error) {
        console.log('[App] Detected confirmation code/error on root, redirecting to /email-confirmation');
        console.log('[App] Code:', code, 'Type:', type, 'Error:', error);
        navigate(`/email-confirmation${location.search}${location.hash}`, { replace: true });
      }
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  // Handle post-signup redirect to mission page. Retargeted from the old
  // /onboarding-mission to /auth/mission (the new Welcome-flow mission
  // step) - src/pages/auth/Mission.jsx sets the same justConfirmedEmail
  // flag itself (so AuthContext's own profile-upsert logic, which reads
  // this flag, is unaffected), and is also the direct emailRedirectTo
  // target, so in the normal case this effect and Mission.jsx's own
  // navigation agree on the same destination.
  useEffect(() => {
    if (isLoading || !user) return;

    // Check if user just confirmed their email (new signup flow). Guards
    // on the whole /auth/ namespace, not just /auth/mission: AuthContext's
    // own onAuthStateChange listener (which reads this same flag to decide
    // terms_accepted) can finish its async profile upsert well after
    // Mission.jsx has already saved the mission and moved the user on to
    // /auth/finished - a narrower guard let this effect fire late and
    // yank the user back to the mission screen after they'd already left it.
    const justConfirmedEmail = localStorage.getItem('justConfirmedEmail');
    if (justConfirmedEmail && !location.pathname.startsWith('/auth/') && !location.pathname.startsWith('/health-check/')) {
      console.log('[App] New signup confirmed, redirecting to mission page');
      navigate('/auth/mission', { replace: true });
      localStorage.removeItem('justConfirmedEmail');
    }
  }, [user, isLoading, location.pathname, navigate]);

  if (isLoading) {
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
    || location.pathname.startsWith('/personal-operating-plan-history/')
    || location.pathname.startsWith('/personal-operating-plan-archived/');

  return (
    <>
      <ScrollToTop />
      <ErrorBoundary>
        <Routes>
          {/* PUBLIC ROUTES - No auth required. "/" and "/login" used to
              render the old Login page unconditionally. They now gate on
              auth state instead: a logged-out visitor goes to the new
              Welcome-flow log in screen, a logged-in visitor goes straight
              to Home. The old Login page (src/pages/Login.jsx) is kept in
              the codebase but is no longer routed to from here. */}
          <Route path="/" element={user ? <Navigate to="/welcome" replace /> : <Navigate to="/auth/login" replace />} />
        <Route path="/login" element={user ? <Navigate to="/welcome" replace /> : <Navigate to="/auth/login" replace />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/email-confirmation" element={<EmailConfirmation />} />
        <Route path="/check-email-confirmation" element={<CheckEmailConfirmation />} />
        <Route path="/terms-of-service" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/privacy-policy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/data-storage-notice" element={<Navigate to="/legal/data-storage" replace />} />

        {/* NEW WELCOME FLOW - public routes (log in, sign up, check email,
            mission, finished, welcome back). Deliberately NOT nested under
            ProtectedLayout even where a session exists (Mission, Finished,
            Welcome back) - these screens must never show the header pill,
            drawer or tab bar that ProtectedLayout always renders. Each
            page that needs a session checks AuthContext itself. */}
        <Route path="/auth/login" element={<AuthLogIn />} />
        <Route path="/auth/sign-up" element={<AuthSignUpStep1 />} />
        <Route path="/auth/sign-up/account" element={<AuthSignUpStep2 />} />
        <Route path="/auth/check-email" element={<AuthCheckYourEmail />} />
        <Route path="/auth/mission" element={<AuthMission />} />
        <Route path="/auth/finished" element={<AuthFinished />} />
        <Route path="/auth/welcome-back" element={<AuthWelcomeBack />} />

        {/* Password reset journey - also public, same reasoning as the
            block above. /auth/reset-password is reached from the emailed
            link and must work with no existing session, so it cannot be
            nested under ProtectedLayout either. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot-password/check-email" element={<ForgotPasswordCheckEmail />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />

        {/* Standalone, publicly reachable versions of the same three
            documents the sign-up reading pop-up shows, linked from the
            foot of the log in / sign up screens - see
            src/pages/legal/LegalDocumentPage.jsx. */}
        <Route path="/legal/:doc" element={<LegalDocumentPage />} />

        {/* Strategic Alignment Health Check: public, no login, no redirects
            for a logged-in portal user. Never nested under ProtectedLayout. */}
        <Route
          path="/health-check/:token"
          element={(
            <Suspense fallback={<div className="ui-root" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />}>
              <HealthCheck />
            </Suspense>
          )}
        />

        {/* PROTECTED ROUTES - ALL routes here require valid session */}
        <Route element={<ProtectedLayout />}>
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
          <Route path="/my-day/plan" element={<PlanMyDay />} />
          <Route path="/my-day/plan/:date" element={<PlanMyDay />} />
          <Route path="/my-day/review" element={<ReviewMyDay />} />
          <Route path="/my-day/review/:date" element={<ReviewMyDay />} />
          <Route path="/sleep-wind-down" element={<SleepWindDown />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/check-in" element={<CheckIn />} />
          <Route path="/check-in/:month" element={<CheckIn />} />
          <Route path="/check-in/:month/answers" element={<CheckIn />} />
          <Route path="/personal-operating-plan-archived/:missionId" element={<PersonalOperatingPlanArchivedOne />} />
          <Route path="/mission-progress-review" element={<MissionProgressReviewDetail />} />
          <Route path="/my-account" element={<MyAccount />} />
          <Route path="/goal-setting" element={<GoalSetting />} />
          <Route path="/risks-assessment" element={<RisksAssessment />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/critical-success-factors" element={<CriticalSuccessFactors />} />
          <Route path="/project-list" element={<ProjectList />} />
          <Route path="/project-matrix" element={<ProjectMatrix />} />
          <Route path="/project-progress" element={<ProjectProgress />} />
          <Route path="/project-scatter" element={<ProjectScatter />} />
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
          <Route path="/get-unstuck" element={<GrowStep1Goal />} />
          <Route path="/get-unstuck/reality" element={<GrowStep2Reality />} />
          <Route path="/get-unstuck/options" element={<GrowStep3Options />} />
          <Route path="/get-unstuck/prioritise" element={<GrowStep3bPrioritize />} />
          <Route path="/get-unstuck/will-do" element={<GrowStep4WillDo />} />
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
