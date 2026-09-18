import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

import HomeHeader from '../components/HomeHeader';

export default function Strategies() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [strategies, setStrategies] = useState(() => location.state?.strategies || []);

  const risks = location.state?.risks || [];
  const path = location.state?.path || 'personal';
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.strategies) {
      setStrategies([]);
      updateFormData('strategies', []);
      localStorage.removeItem('clarity_form_data');
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    updateFormData('strategies', strategies);
    navigate('/project-list', { state: { ...location.state, ...formData, strategies, path, isGuest } });
  };

  const handleStrategyChange = (index, value) => {
    const newStrategies = [...strategies];
    newStrategies[index] = value;
    setStrategies(newStrategies);
    updateFormData('strategies', newStrategies);
  };

  const getNumberColor = (index) => {
    if (index === 0) return '#F08571';
    if (index === 1) return '#5ECCC0';
    return '#666';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container"display: 'flex'
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          {location.state?.problemTitle && (
            <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {location.state.problemTitle}
            </p>
          )}
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '24px' }}>
            Now, what's your strategy?
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '75%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Risks */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '4px', textAlign: 'center' }}>
                The ways you could f*ck up
              </h2>
              <p style={{ fontSize: '12px', color: 'transparent', margin: 0, textAlign: 'center' }}>
                placeholder
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {risks.map((risk, index) => (
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
                    {risk}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Strategies */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '4px', textAlign: 'center' }}>
                Your strategies
              </h2>
              <p style={{ fontSize: '12px', color: '#999', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                (Clue: It might be the exact opposite of the f*ck up)
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {risks.map((risk, index) => (
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
                    value={strategies[index] || ''}
                    onChange={(e) => handleStrategyChange(index, e.target.value)}
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
                </div>
              ))}
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ strategies }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={handleSubmit}
          canNext={true}
          onBack={() => navigate('/risks-assessment', { state: { ...formData, ...location.state, isGuest } })}
        />
      </div>

    </div>
  );
}
