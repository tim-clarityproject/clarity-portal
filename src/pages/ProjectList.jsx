import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import { autoSaveFormData, loadAutoSave } from '../lib/saveProgress';

import HomeHeader from '../components/HomeHeader';

export default function ProjectList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;

  const [projects, setProjects] = useState(() => location.state?.projects || getFieldValue('projects') || ['', '']);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const goal = location.state?.goal || loadAutoSave()?.goal || '';

  // Auto-save form data when projects change
  useEffect(() => {
    const timer = setTimeout(() => {
      const filledProjects = projects.filter(p => p.trim());
      if (filledProjects.length > 0) {
        autoSaveFormData({ projects: filledProjects, path });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [projects, path]);

  const handleProjectChange = (index, value) => {
    const newProjects = [...projects];
    newProjects[index] = value;
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleAddProject = () => {
    const newProjects = [...projects, ''];
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleRemoveProject = (index) => {
    const newProjects = projects.filter((_, i) => i !== index);
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filledProjects = projects.filter(p => p.trim());
    if (filledProjects.length >= 1) {
      updateFormData('projects', filledProjects);
      navigate('/project-matrix', {
        state: { ...location.state, ...formData, goal, factors, projects: filledProjects, path, isGuest }
      });
    }
  };

  const filledProjects = projects.filter(p => p.trim()).length;
  const canSubmit = filledProjects >= 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '24px' }}>
            List your projects
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '60%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Critical Success Factors */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '16px', textAlign: 'center' }}>
              Critical Success Factors
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {factors.map((factor, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    height: '80px',
                  }}
                >
                  <span
                    style={{
                      color: '#F08571',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: '1',
                    }}
                  >
                    {index + 1}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#f5f5f5',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#333',
                    }}
                  >
                    {factor}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Projects */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '16px', textAlign: 'center' }}>
              Projects / Lines of Effort
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {projects.map((project, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '80px' }}>
                  <span
                    style={{
                      color: '#F08571',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: '1',
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <textarea
                    value={project}
                    onChange={(e) => handleProjectChange(index, e.target.value)}
                    placeholder="Type here..."
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #e5e5e5',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none',
                      minHeight: '80px',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#F08571'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(index)}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      color: '#F08571',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      marginTop: '50px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#e07560'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#F08571'}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                <span style={{ minWidth: '20px' }}></span>
                <button
                  type="button"
                  onClick={handleAddProject}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'transparent',
                    color: '#F08571',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#e07560'}
                  onMouseLeave={(e) => e.target.style.color = '#F08571'}
                >
                  Add another
                </button>
              </div>
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ projects }}
          pageType="decision"
          toolType="team-focus"
          onNext={handleSubmit}
          canNext={canSubmit}
          onBack={() => navigate('/critical-success-factors', { state: { ...formData, ...location.state, isGuest } })}
        />
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="project-list"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
