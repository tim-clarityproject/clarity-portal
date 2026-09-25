import { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { MissionProvider } from './context/MissionContext';
import { FormProvider } from './context/FormContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import './lib/debugStorage'; // Make debugging utilities available
import WhatsAppWidget from './components/WhatsAppWidget';
import BreathButton from './components/BreathButton';
import ProtectedLayout from './components/ProtectedLayout';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import CreateAccount from './pages/CreateAccount';
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
import Dashboard from './pages/Dashboard';
import Results from './pages/Results';
import MyJournal from './pages/MyJournal';
import JournalLog from './pages/JournalLog';
import MyReviews from './pages/MyReviews';
import ReviewSummary from './pages/ReviewSummary';
import WeeklyMomentumReviewSummary from './pages/WeeklyMomentumReviewSummary';
import DecisionTools from './pages/DecisionTools';
import DecisionHistory from './pages/DecisionHistory';
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
import InversionStep2Fuckups from './pages/InversionStep2Fuckups';
import InversionStep3Plan from './pages/InversionStep3Plan';
import InversionThinkingSummary from './pages/InversionThinkingSummary';
import ToughConversationStep1Feedback from './pages/ToughConversationStep1Feedback';
import ToughConversationSummary from './pages/ToughConversationSummary';
import ToughConversationStep2Coaching from './pages/ToughConversationStep2Coaching';
import AuthCallback from './pages/AuthCallback';
import EmailConfirmation from './pages/EmailConfirmation';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import DataStorageNotice from './pages/DataStorageNotice';
import EditPersonalDetails from './pages/EditPersonalDetails';
import TermsAcceptance from './pages/TermsAcceptance';
import OnboardingMission from './pages/OnboardingMission';
import PersonalOperatingPlan from './pages/PersonalOperatingPlan';
import PersonalOperatingPlanSummary from './pages/PersonalOperatingPlanSummary';
import PersonalOperatingPlanEdit from './pages/PersonalOperatingPlanEdit';
import PersonalOperatingPlanReview from './pages/PersonalOperatingPlanReview';
import MissionProgressReviewDetail from './pages/MissionProgressReviewDetail';

function AppContent() {
  const { isLoading, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Check terms acceptance and handle redirects
  useEffect(() => {
    if (isLoading || !user) return;

    const handleRedirects = async () => {
      try {
        let termsAccepted = false;

        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('terms_accepted')
            .eq('id', user.id)
            .single();

          if (error) {
            console.warn('Profile not found or error fetching:', error);
            termsAccepted = false;
          } else {
            termsAccepted = profile?.terms_accepted || false;
          }
        } catch (err) {
          console.warn('Could not fetch terms from profile:', err);
          termsAccepted = false;
        }

        if (!termsAccepted && !location.pathname.includes('accept-terms')) {
          navigate('/accept-terms', { replace: true });
          return;
        }

      } catch (error) {
        console.error('Error in redirects:', error);
      }
    };

    handleRedirects();
  }, [user, isLoading, location.pathname, location.hash, navigate]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  // Determine if buttons should be hidden on current page
  const hideButtons = [
    '/',
    '/create-account',
    '/auth/callback',
    '/email-confirmation',
    '/accept-terms',
    '/onboarding-mission',
    '/personal-operating-plan-edit',
    '/personal-operating-plan-review',
    '/mission-progress-review',
    '/terms-of-service',
    '/privacy-policy',
    '/data-storage-notice'
  ].includes(location.pathname);

  return (
    <>
      <ErrorBoundary>
        <Routes>
          {/* PUBLIC ROUTES - No auth required */}
          <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/email-confirmation" element={<EmailConfirmation />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/data-storage-notice" element={<DataStorageNotice />} />

        {/* PROTECTED ROUTES - ALL routes here require valid session */}
        <Route element={<ProtectedLayout />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/onboarding-mission" element={<OnboardingMission />} />
          <Route path="/personal-operating-plan" element={<PersonalOperatingPlan />} />
          <Route path="/personal-operating-plan-summary" element={<PersonalOperatingPlanSummary />} />
          <Route path="/personal-operating-plan-edit" element={<PersonalOperatingPlanEdit />} />
          <Route path="/personal-operating-plan-review" element={<PersonalOperatingPlanReview />} />
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/results" element={<Results />} />
          <Route path="/my-journal" element={<MyJournal />} />
          <Route path="/journal-log" element={<JournalLog />} />
          <Route path="/my-reviews" element={<MyReviews />} />
          <Route path="/review-summary" element={<ReviewSummary />} />
          <Route path="/weekly-momentum-review-summary" element={<WeeklyMomentumReviewSummary />} />
          <Route path="/decision-tools" element={<DecisionTools />} />
          <Route path="/decision-history" element={<DecisionHistory />} />
          <Route path="/decision-summary" element={<DecisionSummary />} />
          <Route path="/plan-my-day" element={<PlanMyDayStep1 />} />
          <Route path="/daily-plan-summary" element={<DailyPlanSummary />} />
          <Route path="/plan-meeting" element={<PlanMeeting />} />
          <Route path="/meeting-summary" element={<MeetingSummary />} />
          <Route path="/if-then-planning" element={<IfThenPlanning />} />
          <Route path="/if-then-planning-summary" element={<IfThenPlanningSummary />} />
          <Route path="/breathe" element={<BreathingPage />} />
          <Route path="/breathing-sessions-summary" element={<BreathingSessionsSummary />} />
          <Route path="/stop-doing-audit" element={<StopDoingAudit />} />
          <Route path="/stop-doing-audit-summary" element={<StopDoingAuditSummary />} />
          <Route path="/my-plans" element={<MyPlans />} />
          <Route path="/grow-step-1" element={<GrowStep1Goal />} />
          <Route path="/grow-step-2" element={<GrowStep2Reality />} />
          <Route path="/grow-step-3" element={<GrowStep3Options />} />
          <Route path="/grow-step-3b-prioritize" element={<GrowStep3bPrioritize />} />
          <Route path="/grow-step-4" element={<GrowStep4WillDo />} />
          <Route path="/inversion-step-1" element={<InversionStep1Goal />} />
          <Route path="/inversion-step-2" element={<InversionStep2Fuckups />} />
          <Route path="/inversion-step-3" element={<InversionStep3Plan />} />
          <Route path="/inversion-thinking-summary" element={<InversionThinkingSummary />} />
          <Route path="/tough-conversation-step-1" element={<ToughConversationStep1Feedback />} />
          <Route path="/tough-conversation-step-2" element={<ToughConversationStep2Coaching />} />
          <Route path="/tough-conversation-summary" element={<ToughConversationSummary />} />
          <Route path="/edit-profile" element={<EditPersonalDetails />} />
          <Route path="/accept-terms" element={<TermsAcceptance />} />
        </Route>

          {/* Catch-all for unmatched routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      {!hideButtons && (
        <div className="no-print">
          <BreathButton />
          <WhatsAppWidget />
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MissionProvider>
        <FormProvider>
          <BrowserRouter>
            <AppContent />
            <div className="no-print">
              <BreathButton />
              <WhatsAppWidget />
            </div>
          </BrowserRouter>
        </FormProvider>
      </MissionProvider>
    </AuthProvider>
  );
}
