import { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { MissionProvider } from './context/MissionContext';
import { FormProvider } from './context/FormContext';
import { supabase } from './lib/supabase';
import './lib/debugStorage'; // Make debugging utilities available
import WhatsAppWidget from './components/WhatsAppWidget';
import BreathButton from './components/BreathButton';
import ProtectedRoute from './components/ProtectedRoute';
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
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/welcome" element={<ProtectedRoute allowGuest={true}><Welcome /></ProtectedRoute>} />
        <Route path="/onboarding-mission" element={<ProtectedRoute><OnboardingMission /></ProtectedRoute>} />
        <Route path="/personal-operating-plan" element={<ProtectedRoute><PersonalOperatingPlan /></ProtectedRoute>} />
        <Route path="/personal-operating-plan-summary" element={<ProtectedRoute><PersonalOperatingPlanSummary /></ProtectedRoute>} />
        <Route path="/personal-operating-plan-edit" element={<ProtectedRoute><PersonalOperatingPlanEdit /></ProtectedRoute>} />
        <Route path="/personal-operating-plan-review" element={<ProtectedRoute><PersonalOperatingPlanReview /></ProtectedRoute>} />
        <Route path="/mission-progress-review" element={<ProtectedRoute><MissionProgressReviewDetail /></ProtectedRoute>} />
      <Route path="/create-account" element={<CreateAccount />} />
      <Route path="/about" element={<About />} />
      <Route path="/my-account" element={<ProtectedRoute><MyAccount /></ProtectedRoute>} />
      <Route path="/goal-setting" element={<ProtectedRoute><GoalSetting /></ProtectedRoute>} />
      <Route path="/risks-assessment" element={<ProtectedRoute><RisksAssessment /></ProtectedRoute>} />
      <Route path="/strategies" element={<ProtectedRoute><Strategies /></ProtectedRoute>} />
      <Route path="/critical-success-factors" element={<ProtectedRoute><CriticalSuccessFactors /></ProtectedRoute>} />
      <Route path="/project-list" element={<ProtectedRoute><ProjectList /></ProtectedRoute>} />
      <Route path="/project-matrix" element={<ProtectedRoute><ProjectMatrix /></ProtectedRoute>} />
      <Route path="/project-progress" element={<ProtectedRoute><ProjectProgress /></ProtectedRoute>} />
      <Route path="/project-scatter" element={<ProtectedRoute><ProjectScatter /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
      <Route path="/my-journal" element={<ProtectedRoute><MyJournal /></ProtectedRoute>} />
      <Route path="/journal-log" element={<ProtectedRoute><JournalLog /></ProtectedRoute>} />
      <Route path="/my-reviews" element={<ProtectedRoute><MyReviews /></ProtectedRoute>} />
      <Route path="/review-summary" element={<ProtectedRoute><ReviewSummary /></ProtectedRoute>} />
      <Route path="/weekly-momentum-review-summary" element={<ProtectedRoute><WeeklyMomentumReviewSummary /></ProtectedRoute>} />
      <Route path="/decision-tools" element={<ProtectedRoute><DecisionTools /></ProtectedRoute>} />
      <Route path="/decision-history" element={<ProtectedRoute><DecisionHistory /></ProtectedRoute>} />
      <Route path="/decision-summary" element={<ProtectedRoute><DecisionSummary /></ProtectedRoute>} />
      <Route path="/plan-my-day" element={<ProtectedRoute><PlanMyDayStep1 /></ProtectedRoute>} />
      <Route path="/daily-plan-summary" element={<ProtectedRoute><DailyPlanSummary /></ProtectedRoute>} />
      <Route path="/plan-meeting" element={<ProtectedRoute><PlanMeeting /></ProtectedRoute>} />
      <Route path="/meeting-summary" element={<ProtectedRoute><MeetingSummary /></ProtectedRoute>} />
      <Route path="/if-then-planning" element={<ProtectedRoute><IfThenPlanning /></ProtectedRoute>} />
      <Route path="/if-then-planning-summary" element={<ProtectedRoute><IfThenPlanningSummary /></ProtectedRoute>} />
      <Route path="/breathe" element={<ProtectedRoute><BreathingPage /></ProtectedRoute>} />
      <Route path="/breathing-sessions-summary" element={<ProtectedRoute><BreathingSessionsSummary /></ProtectedRoute>} />
      <Route path="/stop-doing-audit" element={<ProtectedRoute><StopDoingAudit /></ProtectedRoute>} />
      <Route path="/stop-doing-audit-summary" element={<ProtectedRoute><StopDoingAuditSummary /></ProtectedRoute>} />
      <Route path="/my-plans" element={<ProtectedRoute><MyPlans /></ProtectedRoute>} />
      <Route path="/grow-step-1" element={<ProtectedRoute><GrowStep1Goal /></ProtectedRoute>} />
      <Route path="/grow-step-2" element={<ProtectedRoute><GrowStep2Reality /></ProtectedRoute>} />
      <Route path="/grow-step-3" element={<ProtectedRoute><GrowStep3Options /></ProtectedRoute>} />
      <Route path="/grow-step-3b-prioritize" element={<ProtectedRoute><GrowStep3bPrioritize /></ProtectedRoute>} />
      <Route path="/grow-step-4" element={<ProtectedRoute><GrowStep4WillDo /></ProtectedRoute>} />
      <Route path="/inversion-step-1" element={<ProtectedRoute><InversionStep1Goal /></ProtectedRoute>} />
      <Route path="/inversion-step-2" element={<ProtectedRoute><InversionStep2Fuckups /></ProtectedRoute>} />
      <Route path="/inversion-step-3" element={<ProtectedRoute><InversionStep3Plan /></ProtectedRoute>} />
      <Route path="/inversion-thinking-summary" element={<ProtectedRoute><InversionThinkingSummary /></ProtectedRoute>} />
      <Route path="/tough-conversation-step-1" element={<ProtectedRoute><ToughConversationStep1Feedback /></ProtectedRoute>} />
      <Route path="/tough-conversation-step-2" element={<ProtectedRoute><ToughConversationStep2Coaching /></ProtectedRoute>} />
      <Route path="/tough-conversation-summary" element={<ProtectedRoute><ToughConversationSummary /></ProtectedRoute>} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/data-storage-notice" element={<DataStorageNotice />} />
      <Route path="/edit-profile" element={<ProtectedRoute><EditPersonalDetails /></ProtectedRoute>} />
      <Route path="/accept-terms" element={<ProtectedRoute><TermsAcceptance /></ProtectedRoute>} />
      </Routes>
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
