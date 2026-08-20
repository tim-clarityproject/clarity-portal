import { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { FormProvider } from './context/FormContext';
import './lib/debugStorage'; // Make debugging utilities available
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import CreateAccount from './pages/CreateAccount';
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
import DecisionTools from './pages/DecisionTools';
import DecisionHistory from './pages/DecisionHistory';
import GrowStep1Goal from './pages/GrowStep1Goal';
import GrowStep2Reality from './pages/GrowStep2Reality';
import GrowStep3Options from './pages/GrowStep3Options';
import GrowStep4WillDo from './pages/GrowStep4WillDo';
import InversionStep1Goal from './pages/InversionStep1Goal';
import InversionStep2Fuckups from './pages/InversionStep2Fuckups';
import InversionStep3Plan from './pages/InversionStep3Plan';
import AuthCallback from './pages/AuthCallback';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import DataStorageNotice from './pages/DataStorageNotice';
import EditPersonalDetails from './pages/EditPersonalDetails';
import TermsAcceptance from './pages/TermsAcceptance';

function AppContent() {
  const { isLoading, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Check terms acceptance and handle redirects
  useEffect(() => {
    if (isLoading || !user) return;

    const handleRedirects = async () => {
      try {
        // Check if user needs to accept terms (with fallback to localStorage)
        let termsAccepted = localStorage.getItem(`terms_${user.id}`) === 'true';

        if (!termsAccepted) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('terms_accepted')
              .eq('id', user.id)
              .single();

            termsAccepted = profile?.terms_accepted || false;
          } catch (err) {
            console.warn('Could not fetch terms from profile:', err);
          }
        }

        // Redirect to terms if not accepted
        if (!termsAccepted && !location.pathname.includes('accept-terms')) {
          navigate('/accept-terms', { replace: true });
          return;
        }

        // OAuth redirect (only if terms are accepted)
        if (location.hash.includes('access_token') && termsAccepted) {
          navigate('/welcome', { replace: true });
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

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/create-account" element={<CreateAccount />} />
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
      <Route path="/decision-tools" element={<DecisionTools />} />
      <Route path="/decision-history" element={<DecisionHistory />} />
      <Route path="/grow-step-1" element={<GrowStep1Goal />} />
      <Route path="/grow-step-2" element={<GrowStep2Reality />} />
      <Route path="/grow-step-3" element={<GrowStep3Options />} />
      <Route path="/grow-step-4" element={<GrowStep4WillDo />} />
      <Route path="/inversion-step-1" element={<InversionStep1Goal />} />
      <Route path="/inversion-step-2" element={<InversionStep2Fuckups />} />
      <Route path="/inversion-step-3" element={<InversionStep3Plan />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/data-storage-notice" element={<DataStorageNotice />} />
      <Route path="/edit-profile" element={<EditPersonalDetails />} />
      <Route path="/accept-terms" element={<TermsAcceptance />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FormProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </FormProvider>
    </AuthProvider>
  );
}
