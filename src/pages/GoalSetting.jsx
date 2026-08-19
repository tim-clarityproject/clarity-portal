import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';

import HomeHeader from '../components/HomeHeader';

export default function GoalSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [showBackWarning, setShowBackWarning] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const path = location.state?.path || 'personal';
  const isGuest = location.state?.isGuest || false;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (goal.trim()) {
      updateFormData('goal', goal);
      const nextPage = path === 'team' ? '/critical-success-factors' : '/risks-assessment';
      navigate(nextPage, { state: { ...location.state, ...formData, goal, path, isGuest } });
    }
  };

  const handleChange = (e) => {
    const newGoal = e.target.value;
    setGoal(newGoal);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      {showBackWarning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '420px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '12px', marginTop: 0 }}>
              Save Your Progress?
            </h2>
            <p style={{ color: '#666', fontSize: '15px', marginBottom: '32px', lineHeight: '1.6', margin: '12px 0 32px 0' }}>
              You can save your response to return to later, discard it, or keep editing to complete the questionnaire.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', flexDirection: 'column' }}>
              <button
                onClick={() => {
                  updateFormData('goal', goal);
                  navigate('/choose-focus', { state: { ...location.state, isGuest } });
                }}
                style={{
                  padding: '14px 24px',
                  backgroundColor: '#5ECCC0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(94, 204, 192, 0.25)',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#4db3ae';
                  e.target.style.boxShadow = '0 6px 20px rgba(94, 204, 192, 0.35)';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#5ECCC0';
                  e.target.style.boxShadow = '0 4px 12px rgba(94, 204, 192, 0.25)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Save for Later
              </button>
              <button
                onClick={() => setShowBackWarning(false)}
                style={{
                  padding: '14px 24px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: '2px solid #e5e5e5',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.borderColor = '#d0d0d0';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Keep Editing
              </button>
              <button
                onClick={() => navigate('/choose-focus', { state: { ...location.state, isGuest } })}
                style={{
                  padding: '14px 24px',
                  backgroundColor: 'transparent',
                  color: '#d32f2f',
                  border: '2px solid #ffcdd2',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#ffebee';
                  e.target.style.borderColor = '#ef5350';
                  e.target.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = '#ffcdd2';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black' }}>
            {path === 'team' ? "What's your team's mission?" : 'What are you hoping to achieve?'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <textarea
            value={goal}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (goal.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="Type here..."
            style={{
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '16px',
              height: '100px',
              textAlign: 'center',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              marginBottom: '48px',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </form>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => setShowBackWarning(true)}
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
            onClick={() => {
              if (goal.trim()) {
                updateFormData('goal', goal);
                const nextPage = path === 'team' ? '/critical-success-factors' : '/risks-assessment';
                navigate(nextPage, { state: { ...location.state, ...formData, goal, path, isGuest } });
              }
            }}
            disabled={!goal.trim()}
            style={{
              padding: '16px 32px',
              backgroundColor: !goal.trim() ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: !goal.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !goal.trim() || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !goal.trim() || (e.target.style.backgroundColor = '#F08571')}
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
          Step 1/{path === 'team' ? '5' : '4'}
        </div>
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="goal-setting"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
