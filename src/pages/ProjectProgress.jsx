import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';

import HomeHeader from '../components/HomeHeader';

export default function ProjectProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const projects = location.state?.projects || [];
  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;

  const [progress, setProgress] = useState(location.state?.progress || {});
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleProgressChange = (projectIndex, value) => {
    const newProgress = { ...progress };
    newProgress[projectIndex] = parseInt(value);
    setProgress(newProgress);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateFormData('progress', progress);
    navigate('/project-scatter', { state: { ...location.state, ...formData, progress, isGuest } });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', lineHeight: '1.4' }}>
            What is the current progress of each project?
          </h1>
        </div>

        {/* Scale Legend */}
        <div style={{ marginBottom: '48px', display: 'flex', gap: '32px', justifyContent: 'center', fontSize: '13px', color: '#666', flexWrap: 'wrap' }}>
          <div><span style={{ fontWeight: 'bold', color: '#333' }}>1</span> = Not Started</div>
          <div><span style={{ fontWeight: 'bold', color: '#333' }}>2</span> = Planning</div>
          <div><span style={{ fontWeight: 'bold', color: '#333' }}>3</span> = In Progress</div>
          <div><span style={{ fontWeight: 'bold', color: '#333' }}>4</span> = Near Complete</div>
          <div><span style={{ fontWeight: 'bold', color: '#333' }}>5</span> = Completed</div>
        </div>

        {/* Projects Progress */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '48px' }}>
          {projects.map((project, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '24px', paddingBottom: '24px', borderBottom: '1px solid #e5e5e5' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '16px', color: '#333', marginBottom: '8px' }}>
                  {project}
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={progress[index] || 3}
                  onChange={(e) => handleProgressChange(index, e.target.value)}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                  }}
                />
              </div>
              <div style={{
                minWidth: '80px',
                padding: '12px 16px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                textAlign: 'center',
                fontWeight: '600',
                color: '#F08571',
                fontSize: '18px',
              }}>
                {progress[index] || 3}/5
              </div>
            </div>
          ))}
        </form>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => navigate('/project-matrix', { state: { ...formData, ...location.state, isGuest } })}
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
            style={{
              padding: '16px 32px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
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
          Step 4/5
        </div>
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="project-progress"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
