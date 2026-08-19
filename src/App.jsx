import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FormProvider } from './context/FormContext';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import CreateAccount from './pages/CreateAccount';
import MyAccount from './pages/MyAccount';
import ChooseFocus from './pages/ChooseFocus';
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

export default function App() {
  return (
    <AuthProvider>
      <FormProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/my-account" element={<MyAccount />} />
          <Route path="/choose-focus" element={<ChooseFocus />} />
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
        </Routes>
        </BrowserRouter>
      </FormProvider>
    </AuthProvider>
  );
}
