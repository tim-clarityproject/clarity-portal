import { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

function AppContent() {
  const { isLoading, user } = useContext(AuthContext);
  const location = useLocation();

  // Handle OAuth redirect after auth detection - send new users to welcome
  useEffect(() => {
    if (!isLoading && user && location.pathname === '/') {
      // User just authenticated, redirect to welcome
      if (location.hash.includes('access_token')) {
        // OAuth redirect
        window.location.pathname = '/welcome';
      }
    }
  }, [isLoading, user, location]);

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
