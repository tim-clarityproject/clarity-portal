import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';
import { autoSaveFormData, loadAutoSave } from '../lib/saveProgress';

import HomeHeader from '../components/HomeHeader';

export default function ProjectList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;

  const [projects, setProjects] = useState(location.state?.projects || loadAutoSave()?.projects || ['', '']);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const goal = location.state?.goal || loadAutoSave()?.goal || '';
  const path = location.state?.path || 'team';

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
  };

  const handleAddProject = () => {
    const newProjects = [...projects, ''];
    setProjects(newProjects);
  };

  const handleRemoveProject = (index) => {
    const newProjects = projects.filter((_, i) => i !== index);
    setProjects(newProjects);
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
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black' }}>
            List your projects
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', flex: 1, maxWidth: '512px', margin: '0 auto 24px', width: '100%' }}>
            {projects.map((project, index) => (
              <div key={index} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', height: '48px' }}>
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
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={project}
                    onChange={(e) => handleProjectChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filledProjects >= 1) {
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Type here..."
                    style={{
                      width: '100%',
                      padding: '12px 28px',
                      border: '2px solid #e5e5e5',
                      borderRadius: '8px',
                      fontSize: '14px',
                      textAlign: 'center',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#F08571'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
                  />
                  {index >= 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProject(index)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        padding: '4px',
                        backgroundColor: 'transparent',
                        color: '#999',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#d32f2f'}
                      onMouseLeave={(e) => e.target.style.color = '#999'}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddProject}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'transparent',
                color: '#F08571',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                marginTop: '12px',
              }}
              onMouseEnter={(e) => e.target.style.color = '#e07560'}
              onMouseLeave={(e) => e.target.style.color = '#F08571'}
            >
              Add another
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => navigate('/critical-success-factors', { state: { ...formData, ...location.state, isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              const div = e.target.querySelector('div');
              if (div) {
                div.style.backgroundColor = '#e8e8e8';
                div.style.transform = 'translateX(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              const div = e.target.querySelector('div');
              if (div) {
                div.style.backgroundColor = '#f5f5f5';
                div.style.transform = 'translateX(0)';
              }
            }}
          >
            <BackArrow />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '16px 32px',
              backgroundColor: !canSubmit ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: !canSubmit ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !canSubmit || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !canSubmit || (e.target.style.backgroundColor = '#F08571')}
          >
            Continue
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: '16px 32px',
              backgroundColor: 'transparent',
              color: '#F08571',
              fontWeight: 'bold',
              border: '2px solid #F08571',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#FEE5DE';
              e.target.style.borderColor = '#e07560';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.borderColor = '#F08571';
            }}
          >
            Save & Exit
          </button>
        </div>

        <div style={{ textAlign: 'center', color: '#999', fontSize: '14px' }}>
          Step 3/5
        </div>
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
