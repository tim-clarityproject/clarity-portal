import { useState, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';

import HomeHeader from '../components/HomeHeader';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData } = useContext(FormContext);
  const risks = location.state?.risks || [];
  const strategies = location.state?.strategies || formData.strategies || [];
  const isGuest = location.state?.isGuest || false;
  const displayStrategies = useMemo(() => strategies.slice(0, risks.length), [strategies, risks.length]);
  const [ratings, setRatings] = useState(displayStrategies.map(() => null));

  const handleRating = (index, rating) => {
    const newRatings = [...ratings];
    newRatings[index] = rating;
    setRatings(newRatings);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black' }}>
            How would you currently rate this?
          </h1>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Strategies */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayStrategies.map((strategy, index) => (
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
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#333',
                      lineHeight: '1.4',
                    }}
                  >
                    {strategy}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Ratings */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {displayStrategies.map((strategy, index) => {
                const currentValue = ratings[index] || 3;
                const progress = ((currentValue - 1) / 4) * 100;

                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '80px' }}>
                    <div style={{ flex: 1, paddingTop: '8px' }}>
                      {/* Number labels */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', position: 'relative' }}>
                        {[1, 2, 3, 4, 5].map((num) => (
                          <span
                            key={num}
                            style={{
                              fontSize: '16px',
                              fontWeight: 'bold',
                              color: currentValue === num ? '#F08571' : '#999',
                              transition: 'color 0.2s',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                            onClick={() => handleRating(index, num)}
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                      {/* Slider */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={currentValue}
                          onChange={(e) => handleRating(index, parseInt(e.target.value))}
                          style={{
                            width: '100%',
                            height: '6px',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundColor: '#e5e5e5',
                            borderRadius: '3px',
                            outline: 'none',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                        />
                        <style>{`
                          input[type="range"]::-webkit-slider-thumb {
                            appearance: none;
                            WebkitAppearance: none;
                            width: 32px;
                            height: 32px;
                            borderRadius: 50%;
                            backgroundColor: #F08571;
                            cursor: grab;
                            boxShadow: 0 4px 12px rgba(240, 133, 113, 0.4);
                            border: 2px solid white;
                            position: relative;
                            z-index: 1;
                            transition: boxShadow 0.2s;
                          }
                          input[type="range"]::-webkit-slider-thumb:active {
                            cursor: grabbing;
                            boxShadow: 0 6px 16px rgba(240, 133, 113, 0.6);
                          }
                          input[type="range"]::-moz-range-thumb {
                            width: 32px;
                            height: 32px;
                            borderRadius: 50%;
                            backgroundColor: #F08571;
                            cursor: grab;
                            border: 2px solid white;
                            boxShadow: 0 4px 12px rgba(240, 133, 113, 0.4);
                          }
                          input[type="range"]::-moz-range-thumb:active {
                            cursor: grabbing;
                            boxShadow: 0 6px 16px rgba(240, 133, 113, 0.6);
                          }
                          input[type="range"]::-moz-range-track {
                            background: transparent;
                            border: none;
                          }
                        `}</style>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', paddingBottom: '24px' }}>
        <button
          type="button"
          onClick={() => navigate('/strategies', { state: { ...location.state, isGuest } })}
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
          onClick={() => navigate('/results', { state: { ...formData, strategies: displayStrategies, ratings, ...location.state, isGuest } })}
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
      </div>

    </div>
  );
}
