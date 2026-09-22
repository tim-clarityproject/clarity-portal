import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

// Unified visual size for all breathing animations
const BREATHING_VISUAL_SIZE = 240; // px - same for circle and box

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
        'Repeat for as many cycles as you like.',
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

// ===== ANIMATION COMPONENTS =====

// Vagal Breathing: Circle expands (4s) then shrinks (6s)
function VagalBreathingAnimation({ isActive }) {
  const [phase, setPhase] = useState('inhale');
  const [countdownSeconds, setCountdownSeconds] = useState(4);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!isActive) {
      setPhase('inhale');
      setCountdownSeconds(4);
      setScale(0.5);
      return;
    }

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 10000; // 4s inhale + 6s exhale

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;

      // Calculate scale and phase
      if (cycleElapsed < 4000) {
        // Inhale: 4 seconds, scale 0.5 → 1.5
        setPhase('inhale');
        const inhalProgress = cycleElapsed / 4000;
        setScale(0.5 + inhalProgress);
        setCountdownSeconds(4 - Math.floor(cycleElapsed / 1000));
      } else {
        // Exhale: 6 seconds, scale 1.5 → 0.5
        setPhase('exhale');
        const exhaleProgress = (cycleElapsed - 4000) / 6000;
        setScale(1.5 - exhaleProgress);
        setCountdownSeconds(10 - Math.floor(cycleElapsed / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const radius = (BREATHING_VISUAL_SIZE / 2) * scale;
  const circumference = 2 * Math.PI * (BREATHING_VISUAL_SIZE / 2 - 8);

  return (
    <div style={{ position: 'relative', width: BREATHING_VISUAL_SIZE, height: BREATHING_VISUAL_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={BREATHING_VISUAL_SIZE} height={BREATHING_VISUAL_SIZE} style={{ position: 'absolute' }}>
        <circle
          cx={BREATHING_VISUAL_SIZE / 2}
          cy={BREATHING_VISUAL_SIZE / 2}
          r={radius}
          fill="rgba(240, 133, 113, 0.08)"
          stroke="#F08571"
          strokeWidth="3"
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '48px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {Math.max(0, countdownSeconds)}
        </div>
        <div style={{ fontSize: '13px', color: '#666', fontWeight: '500', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

// Box Breathing: Square with animated line (4s per side)
function BoxBreathingAnimation({ isActive }) {
  const [phase, setPhase] = useState('inhale');
  const [countdownSeconds, setCountdownSeconds] = useState(4);
  const [strokeDashoffset, setStrokeDashoffset] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase('inhale');
      setCountdownSeconds(4);
      setStrokeDashoffset(0);
      return;
    }

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 16000; // 4s × 4 phases

    const phaseLabels = ['inhale', 'hold', 'exhale', 'hold'];
    const perimeter = (BREATHING_VISUAL_SIZE - 40) * 4; // approximate perimeter of inner square

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;
      const phaseIndex = Math.floor(cycleElapsed / 4000);

      // Animate the line around the box perimeter
      const phaseProgress = (cycleElapsed % 4000) / 4000;
      setStrokeDashoffset(-phaseProgress * perimeter);

      // Update phase and countdown
      setPhase(phaseLabels[phaseIndex]);
      setCountdownSeconds(4 - Math.floor((cycleElapsed % 4000) / 1000));

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const boxSize = BREATHING_VISUAL_SIZE - 40;
  const perimeter = boxSize * 4;

  return (
    <div style={{ position: 'relative', width: BREATHING_VISUAL_SIZE, height: BREATHING_VISUAL_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={BREATHING_VISUAL_SIZE} height={BREATHING_VISUAL_SIZE} style={{ position: 'absolute' }}>
        {/* Background box */}
        <rect
          x="20"
          y="20"
          width={boxSize}
          height={boxSize}
          fill="rgba(240, 133, 113, 0.08)"
          stroke="#e5e5e5"
          strokeWidth="2"
        />
        {/* Animated line */}
        <rect
          x="20"
          y="20"
          width={boxSize}
          height={boxSize}
          fill="none"
          stroke="#F08571"
          strokeWidth="3"
          strokeDasharray={perimeter}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '48px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {Math.max(0, countdownSeconds)}
        </div>
        <div style={{ fontSize: '13px', color: '#666', fontWeight: '500', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

// Physiological Sigh: Expand (4s) → slight re-expand (sniff) → exhale (8s)
function PhysiologicalSighAnimation({ isActive }) {
  const [phase, setPhase] = useState('first-inhale');
  const [countdownSeconds, setCountdownSeconds] = useState(4);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!isActive) {
      setPhase('first-inhale');
      setCountdownSeconds(4);
      setScale(0.5);
      return;
    }

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 12000; // 4s inhale + 0.5s sniff + 7.5s exhale (simplified to 12s)

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;

      if (cycleElapsed < 4000) {
        // First inhale: 4 seconds, scale 0.5 → 1.3
        setPhase('first-inhale');
        const inhalProgress = cycleElapsed / 4000;
        setScale(0.5 + inhalProgress * 0.8);
        setCountdownSeconds(4 - Math.floor(cycleElapsed / 1000));
      } else if (cycleElapsed < 4500) {
        // Second inhale (sniff): 0.5 seconds, scale 1.3 → 1.5
        setPhase('second-inhale');
        const sniffProgress = (cycleElapsed - 4000) / 500;
        setScale(1.3 + sniffProgress * 0.2);
        setCountdownSeconds(1);
      } else {
        // Exhale: 7.5 seconds, scale 1.5 → 0.5
        setPhase('exhale');
        const exhaleProgress = (cycleElapsed - 4500) / 7500;
        setScale(1.5 - exhaleProgress);
        setCountdownSeconds(Math.max(0, 8 - Math.floor((cycleElapsed - 4000) / 1000)));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const radius = (BREATHING_VISUAL_SIZE / 2) * scale;

  const getPhaseLabel = () => {
    switch (phase) {
      case 'first-inhale':
        return 'First Inhale';
      case 'second-inhale':
        return 'Second Inhale';
      case 'exhale':
        return 'Exhale';
      default:
        return '';
    }
  };

  return (
    <div style={{ position: 'relative', width: BREATHING_VISUAL_SIZE, height: BREATHING_VISUAL_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={BREATHING_VISUAL_SIZE} height={BREATHING_VISUAL_SIZE} style={{ position: 'absolute' }}>
        <circle
          cx={BREATHING_VISUAL_SIZE / 2}
          cy={BREATHING_VISUAL_SIZE / 2}
          r={radius}
          fill="rgba(240, 133, 113, 0.08)"
          stroke="#F08571"
          strokeWidth="3"
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: '48px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {Math.max(0, countdownSeconds)}
        </div>
        <div style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
          {getPhaseLabel()}
        </div>
      </div>
    </div>
  );
}
