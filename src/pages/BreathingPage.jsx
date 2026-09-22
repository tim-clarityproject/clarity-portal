import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function BreathingPage() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const [breathingType, setBreathingType] = useState('sigh');
  const [view, setView] = useState('instructions');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sessionStartTimeRef = useRef(null);

  // Force light backgrounds
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const originalHtmlBg = html.style.backgroundColor;
    const originalBodyBg = body.style.backgroundColor;
    const originalRootBg = root?.style.backgroundColor;

    html.style.backgroundColor = 'white';
    body.style.backgroundColor = 'white';
    if (root) root.style.backgroundColor = 'white';
    html.style.setProperty('--bg', '#fff', 'important');
    html.style.setProperty('--text', '#6b6375', 'important');
    html.style.setProperty('--text-h', '#08060d', 'important');

    return () => {
      html.style.backgroundColor = originalHtmlBg;
      body.style.backgroundColor = originalBodyBg;
      if (root) root.style.backgroundColor = originalRootBg;
      html.style.removeProperty('--bg');
      html.style.removeProperty('--text');
      html.style.removeProperty('--text-h');
    };
  }, []);

  const saveBreathingSession = async () => {
    if (!user || isGuest || !sessionStartTimeRef.current) return;

    try {
      const duration = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
      await supabase.from('breathing_sessions').insert({
        user_id: user.id,
        breathing_mode: breathingType,
        duration,
        date: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving breathing session:', error);
    }
  };

  const handleStartBreathing = () => {
    setView('breathing');
    sessionStartTimeRef.current = Date.now();
    setElapsedSeconds(0);
  };

  const handleStopBreathing = () => {
    saveBreathingSession();
    setView('instructions');
  };

  const handleSwitchBreathingType = (type) => {
    if (view === 'breathing') {
      handleStopBreathing();
    }
    setBreathingType(type);
  };

  // Timer for elapsed seconds during breathing
  useEffect(() => {
    if (view !== 'breathing') return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [view]);

  const breathingInfo = {
    sigh: {
      name: 'Physiological Sigh',
      instructions: [
        'Take a deep breath in through your nose until your lungs feel full.',
        'Without exhaling, take a quick second "top-up" breath through your nose.',
        'Release a long, slow exhale through your mouth.',
        'Repeat 1-3 times for immediate stress relief.',
      ],
    },
    vagal: {
      name: 'Vagal Breathing',
      instructions: [
        'Inhale slowly through your nose for 4 seconds.',
        'Exhale slowly through your mouth for 6 seconds.',
        'Repeat for as many cycles as you like.',
      ],
    },
    box: {
      name: 'Box Breathing',
      instructions: [
        'Inhale through your nose for 4 seconds.',
        'Hold your breath for 4 seconds.',
        'Exhale through your mouth for 4 seconds.',
        'Hold your breath for 4 seconds.',
        'Repeat for as many cycles as you like.',
      ],
    },
  };

  const info = breathingInfo[breathingType];

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <style>{`
        .breathing-container {
          padding: 40px 32px;
        }
        @media (max-width: 768px) {
          .breathing-container {
            padding: 32px 16px;
          }
        }
      `}</style>

      {view === 'instructions' ? (
        // INSTRUCTION VIEW
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="breathing-container">
          <div style={{ width: '100%', maxWidth: '800px' }}>
            {/* Breathing Type Selector */}
            <div style={{ display: 'flex', border: '2px solid #e5e5e5', borderRadius: '6px', overflow: 'hidden', marginBottom: '32px', gap: 0 }}>
              {['sigh', 'vagal', 'box'].map((type) => (
                <button
                  key={type}
                  onClick={() => handleSwitchBreathingType(type)}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    backgroundColor: breathingType === type ? '#F08571' : 'white',
                    border: 'none',
                    color: breathingType === type ? 'white' : '#333',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (breathingType !== type) {
                      e.currentTarget.style.backgroundColor = '#f9f9f9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (breathingType !== type) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {type === 'sigh' ? 'Physiological Sigh' : type === 'vagal' ? 'Vagal Breathing' : 'Box Breathing'}
                </button>
              ))}
            </div>

            {/* Breathing Type Title */}
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', margin: '0 0 24px 0', textAlign: 'center' }}>
              {info.name}
            </h1>

            {/* Instructions */}
            <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', marginBottom: '32px', borderLeft: '4px solid #F08571', border: '1px solid #e5e5e5', paddingLeft: '24px' }}>
              {info.instructions.map((inst, idx) => (
                <div key={idx} style={{ marginBottom: idx < info.instructions.length - 1 ? '12px' : '0' }}>
                  <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#666', margin: 0 }}>
                    {inst}
                  </p>
                </div>
              ))}
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartBreathing}
              style={{
                width: '100%',
                padding: '14px 24px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#e07560';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#F08571';
              }}
            >
              Start Breathing
            </button>
          </div>
        </div>
      ) : (
        // BREATHING VIEW
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="breathing-container">
          {/* Breathing Animation */}
          <div style={{ marginBottom: '48px' }}>
            {breathingType === 'sigh' && <PhysiologicalSighAnimation isActive={view === 'breathing'} />}
            {breathingType === 'vagal' && <VagalBreathingAnimation isActive={view === 'breathing'} />}
            {breathingType === 'box' && <BoxBreathingAnimation isActive={view === 'breathing'} />}
          </div>

          {/* Timer */}
          <p style={{ fontSize: '14px', color: '#999', fontWeight: '500', marginBottom: '48px' }}>
            {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
          </p>

          {/* Done Button */}
          <button
            onClick={handleStopBreathing}
            style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#333',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.borderColor = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#e5e5e5';
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// Vagal Breathing: Expanding/Contracting Circle
function VagalBreathingAnimation({ isActive }) {
  const [scale, setScale] = useState(0.5);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);

  useEffect(() => {
    if (!isActive) {
      setScale(0.5);
      setPhase('inhale');
      setSecondsLeft(4);
      return;
    }

    let startTime = Date.now();
    let animationFrame;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleTime = 10000; // 4s inhale + 6s exhale
      const cycleProgress = (elapsed % cycleTime) / cycleTime;

      if (cycleProgress < 0.4) {
        // Inhale: 4 seconds (0-40%)
        setPhase('inhale');
        setScale(0.5 + cycleProgress); // 0.5 to 1.5
        setSecondsLeft(Math.ceil((4000 - (elapsed % cycleTime)) / 1000));
      } else {
        // Exhale: 6 seconds (40-100%)
        setPhase('exhale');
        const exhaleProgress = (cycleProgress - 0.4) / 0.6;
        setScale(1.5 - exhaleProgress); // 1.5 to 0.5
        setSecondsLeft(Math.ceil((10000 - (elapsed % cycleTime)) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const size = 240;
  const baseRadius = size / 2.5;
  const radius = baseRadius * scale;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgba(240, 133, 113, 0.1)"
          stroke="#F08571"
          strokeWidth="3"
          style={{ transition: 'r 0.05s linear' }}
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '48px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '13px', color: '#666', fontWeight: '500', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

// Box Breathing: Square with Animated Perimeter Line
function BoxBreathingAnimation({ isActive }) {
  const [strokeDashoffset, setStrokeDashoffset] = useState(0);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);

  useEffect(() => {
    if (!isActive) {
      setStrokeDashoffset(0);
      setPhase('inhale');
      setSecondsLeft(4);
      return;
    }

    let startTime = Date.now();
    let animationFrame;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleTime = 16000; // 4s × 4 phases
      const cycleProgress = (elapsed % cycleTime) / cycleTime;

      // Animate perimeter line (going around the box)
      setStrokeDashoffset(-(cycleProgress * 800)); // Perimeter of 200×200 box ≈ 800

      // Determine phase and countdown
      if (elapsed % cycleTime < 4000) {
        setPhase('inhale');
        setSecondsLeft(Math.ceil((4000 - (elapsed % cycleTime)) / 1000));
      } else if (elapsed % cycleTime < 8000) {
        setPhase('hold');
        setSecondsLeft(Math.ceil((8000 - (elapsed % cycleTime)) / 1000));
      } else if (elapsed % cycleTime < 12000) {
        setPhase('exhale');
        setSecondsLeft(Math.ceil((12000 - (elapsed % cycleTime)) / 1000));
      } else {
        setPhase('hold');
        setSecondsLeft(Math.ceil((16000 - (elapsed % cycleTime)) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const boxSize = 200;

  return (
    <div style={{ position: 'relative', width: boxSize, height: boxSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={boxSize} height={boxSize} style={{ position: 'absolute' }}>
        <rect
          x="20"
          y="20"
          width={boxSize - 40}
          height={boxSize - 40}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="2"
        />
        <rect
          x="20"
          y="20"
          width={boxSize - 40}
          height={boxSize - 40}
          fill="none"
          stroke="#F08571"
          strokeWidth="3"
          strokeDasharray="800"
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '48px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '13px', color: '#666', fontWeight: '500', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

// Physiological Sigh: Expanding Circle with Double Inhale Visual
function PhysiologicalSighAnimation({ isActive }) {
  const [scale, setScale] = useState(0.5);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(2);

  useEffect(() => {
    if (!isActive) {
      setScale(0.5);
      setPhase('inhale');
      setSecondsLeft(2);
      return;
    }

    let startTime = Date.now();
    let animationFrame;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleTime = 4000; // Full cycle
      const cycleProgress = (elapsed % cycleTime) / cycleTime;

      if (cycleProgress < 0.5) {
        // First inhale: 2 seconds
        setPhase('inhale');
        setScale(0.5 + cycleProgress); // 0.5 to 1.0
        setSecondsLeft(Math.ceil((2000 - (elapsed % cycleTime)) / 1000));
      } else if (cycleProgress < 0.625) {
        // Second inhale (sniff): 0.5 seconds
        setPhase('sniff');
        setScale(1.0 + (cycleProgress - 0.5) * 2); // 1.0 to 1.25
        setSecondsLeft(1);
      } else {
        // Exhale: 1.5 seconds
        setPhase('exhale');
        const exhaleProgress = (cycleProgress - 0.625) / 0.375;
        setScale(1.25 - exhaleProgress * 0.75); // 1.25 to 0.5
        setSecondsLeft(Math.ceil((4000 - (elapsed % cycleTime)) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const size = 240;
  const baseRadius = size / 2.5;
  const radius = baseRadius * scale;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgba(240, 133, 113, 0.1)"
          stroke="#F08571"
          strokeWidth="3"
          style={{ transition: 'r 0.05s linear' }}
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '56px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '16px', color: '#999', fontWeight: '500', textTransform: 'capitalize' }}>
          {phase === 'sniff' ? 'Sniff' : phase}
        </div>
      </div>
    </div>
  );
}
