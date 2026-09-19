import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function BreathingPage() {
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;
  const [breathingType, setBreathingType] = useState('sigh');
  const [isBreathing, setIsBreathing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [setupComplete, setSetupComplete] = useState({ sigh: false, vagal: false, box: false });

  useEffect(() => {
    if (!isBreathing) return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isBreathing]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #faf7f6 0%, #f5f0ef 50%, #faf7f6 100%)', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', paddingTop: '100px', position: 'relative' }}>
        {/* Breathing Type Selector - positioned at bottom */}
        <div style={{ position: 'absolute', bottom: '56px', display: 'flex', border: '2px solid #d0d0d0', borderRadius: '8px', overflow: 'hidden' }}>
          <button
            onClick={() => {
              setSetupComplete(prev => ({...prev, vagal: false}));
              setBreathingType('vagal');
            }}
            style={{
              padding: '10px 28px',
              backgroundColor: breathingType === 'vagal' ? 'white' : '#f5f5f5',
              border: 'none',
              color: breathingType === 'vagal' ? '#333' : '#999',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              borderRight: '1px solid #d0d0d0',
            }}
            onMouseEnter={(e) => {
              if (breathingType !== 'vagal') {
                e.currentTarget.style.backgroundColor = '#ececec';
              }
            }}
            onMouseLeave={(e) => {
              if (breathingType !== 'vagal') {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
          >
            Vagal Breathing
          </button>
          <button
            onClick={() => {
              setSetupComplete(prev => ({...prev, box: false}));
              setBreathingType('box');
            }}
            style={{
              padding: '10px 28px',
              backgroundColor: breathingType === 'box' ? 'white' : '#f5f5f5',
              border: 'none',
              color: breathingType === 'box' ? '#333' : '#999',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              borderRight: '1px solid #d0d0d0',
            }}
            onMouseEnter={(e) => {
              if (breathingType !== 'box') {
                e.currentTarget.style.backgroundColor = '#ececec';
              }
            }}
            onMouseLeave={(e) => {
              if (breathingType !== 'box') {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
          >
            Box Breathing
          </button>
          <button
            onClick={() => {
              setSetupComplete(prev => ({...prev, sigh: false}));
              setBreathingType('sigh');
            }}
            style={{
              padding: '10px 28px',
              backgroundColor: breathingType === 'sigh' ? 'white' : '#f5f5f5',
              border: 'none',
              color: breathingType === 'sigh' ? '#333' : '#999',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              if (breathingType !== 'sigh') {
                e.currentTarget.style.backgroundColor = '#ececec';
              }
            }}
            onMouseLeave={(e) => {
              if (breathingType !== 'sigh') {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }
            }}
          >
            Physiological Sigh
          </button>
        </div>

        {/* Content Container - Full immersive experience */}
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          {/* Vagal Breathing */}
          {breathingType === 'vagal' && (
            <VagalBreathing isBreathing={isBreathing} onInstructionsDismissed={() => setSetupComplete(prev => ({...prev, vagal: true}))} />
          )}

          {/* Box Breathing */}
          {breathingType === 'box' && (
            <BoxBreathing isActive={isBreathing} onInstructionsDismissed={() => setSetupComplete(prev => ({...prev, box: true}))} />
          )}

          {/* Physiological Sigh */}
          {breathingType === 'sigh' && (
            <PhysiologicalSigh isActive={isBreathing} onInstructionsDismissed={() => setSetupComplete(prev => ({...prev, sigh: true}))} />
          )}
        </div>
      </div>

      {breathingType !== 'sigh' && setupComplete[breathingType] && (
        <div style={{
          position: 'fixed',
          bottom: '216px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '18px',
          color: '#666',
          fontWeight: '500',
          zIndex: 1000,
          textAlign: 'center',
        }}>
          Breathing Time: {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
        </div>
      )}

      {setupComplete[breathingType] && (
        <button
          onClick={() => {
            if (isBreathing) {
              setElapsedSeconds(0);
            }
            setIsBreathing(!isBreathing);
          }}
          style={{
            position: 'fixed',
            bottom: '134px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 32px',
          backgroundColor: '#F08571',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          zIndex: 100,
          boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#e07560';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(240, 133, 113, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F08571';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.3)';
        }}
        >
          {isBreathing ? 'Reset' : 'Start'}
        </button>
      )}

      <div style={{
        position: 'fixed',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}>
        <a href="#" onClick={(e) => {
          e.preventDefault();
          // TODO: Navigate to breathing settings page
        }} style={{
          fontSize: '13px',
          color: '#999',
          textDecoration: 'none',
          transition: 'color 0.3s ease',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#666';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#999';
        }}
        >
          Edit breathing settings
        </a>
      </div>
    </div>
  );
}

function BoxBreathing({ isActive, onInstructionsDismissed }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);
  const [showInstructions, setShowInstructions] = useState(true);
  const wasActiveRef = React.useRef(false);

  // Only reset animation state when transitioning from breathing to stopped
  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && !isActive) {
      // User was breathing and now stopped - reset animation but keep visualization visible
      wasActiveRef.current = false;
      setProgress(0);
      setPhase('inhale');
      setSecondsLeft(4);
    }
  }, [isActive]);

  // Animation effect
  useEffect(() => {
    if (!isActive) return;

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 16000; // 4 phases * 4 seconds

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;
      const normalizedProgress = cycleElapsed / cycleDuration;

      setProgress(normalizedProgress);

      // Calculate phase
      if (cycleElapsed < 4000) {
        setPhase('inhale');
        setSecondsLeft(Math.ceil((4000 - cycleElapsed) / 1000));
      } else if (cycleElapsed < 8000) {
        setPhase('hold');
        setSecondsLeft(Math.ceil((8000 - cycleElapsed) / 1000));
      } else if (cycleElapsed < 12000) {
        setPhase('exhale');
        setSecondsLeft(Math.ceil((12000 - cycleElapsed) / 1000));
      } else {
        setPhase('hold');
        setSecondsLeft(Math.ceil((16000 - cycleElapsed) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const getPhaseText = () => {
    switch (phase) {
      case 'inhale':
        return 'Breathe in through your nose';
      case 'exhale':
        return 'Breathe out through your mouth';
      case 'hold':
        return 'Hold';
      default:
        return 'Breathe';
    }
  };

  // Calculate line positions based on progress (0-1 over full 16 second cycle)
  const topLineX2 = 20 + Math.min(160, Math.max(0, progress * 160 * 4)); // 0-160 over 4s
  const rightLineY2 = 20 + Math.min(160, Math.max(0, (progress * 4 - 1) * 160)); // 0-160 from 4-8s
  const bottomLineX1 = 180 - Math.min(160, Math.max(0, (progress * 4 - 2) * 160)); // 180-20 from 8-12s
  const leftLineY1 = 180 - Math.min(160, Math.max(0, (progress * 4 - 3) * 160)); // 180-20 from 12-16s

  return (
    <>
      {showInstructions ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1, justifyContent: 'center', gap: '24px' }}>
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
              Box Breathing
            </h2>
            <div style={{ fontSize: '16px', color: '#666', lineHeight: '1.8', marginBottom: '24px' }}>
              <div style={{ textAlign: 'left', display: 'inline-block' }}>
                <p style={{ marginBottom: '12px' }}>
                  <strong>Step 1:</strong> Inhale slowly through your nose for four seconds.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>Step 2:</strong> Hold your breath for four seconds.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>Step 3:</strong> Exhale slowly through your mouth for four seconds.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>Step 4:</strong> Hold your breath for four seconds.
                </p>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: '#999', marginBottom: '24px' }}>
              Repeat for as many cycles as you like.
            </p>
          </div>
          <button
            onClick={() => {
              setShowInstructions(false);
              if (onInstructionsDismissed) {
                onInstructionsDismissed();
              }
            }}
            style={{
              padding: '12px 32px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e07560';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(240, 133, 113, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.3)';
            }}
          >
            OK, Let's Start
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1 }}>
          {/* Instruction text above box */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center',
              minHeight: '32px',
              minWidth: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getPhaseText()}
          </div>

          {/* Centered visualization container */}
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-120px' }}>
            <div style={{ position: 'relative', width: '400px', height: '400px' }}>
            <svg
              viewBox="0 0 400 400"
              style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 8px 24px rgba(240, 133, 113, 0.2))' }}
            >
              {/* Background box outline (sharp corners) */}
              <rect
                x="40"
                y="40"
                width="320"
                height="320"
                fill="none"
                stroke="rgba(240, 133, 113, 0.15)"
                strokeWidth="2"
              />

              {/* Animated border lines */}
              <line
                x1="40"
                y1="40"
                x2={topLineX2 * 2}
                y2="40"
                stroke="#F08571"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <line
                x1="360"
                y1="40"
                x2="360"
                y2={rightLineY2 * 2}
                stroke="#F08571"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <line
                x1={bottomLineX1 * 2}
                y1="360"
                x2="360"
                y2="360"
                stroke="#F08571"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <line
                x1="40"
                y1={leftLineY1 * 2}
                x2="40"
                y2="360"
                stroke="#F08571"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>

            {/* Timer only inside box */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '72px', fontWeight: 'bold', color: '#000', textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)' }}>
                {secondsLeft}
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VagalBreathing({ isBreathing, onInstructionsDismissed }) {
  const [phase, setPhase] = useState('inhale');
  const [scale, setScale] = useState(1);
  const [seconds, setSeconds] = useState(4);
  const [showInstructions, setShowInstructions] = useState(true);
  const wasBreathingRef = React.useRef(false);

  // Only reset animation state when transitioning from breathing to stopped
  useEffect(() => {
    if (isBreathing) {
      wasBreathingRef.current = true;
    } else if (wasBreathingRef.current && !isBreathing) {
      // User was breathing and now stopped - reset animation but keep visualization visible
      wasBreathingRef.current = false;
      setPhase('inhale');
      setScale(1);
      setSeconds(4);
    }
  }, [isBreathing]);

  // Animation effect
  useEffect(() => {
    if (!isBreathing) return;

    let animationFrame;
    let startTime = Date.now();
    const inhaleDuration = 4000;
    const exhaleDuration = 6000;
    const cycleDuration = inhaleDuration + exhaleDuration;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;

      if (cycleElapsed < inhaleDuration) {
        setPhase('inhale');
        const progress = cycleElapsed / inhaleDuration;
        setScale(1 + progress * 0.4);
        const remainingSeconds = Math.ceil((inhaleDuration - cycleElapsed) / 1000);
        setSeconds(Math.max(remainingSeconds, 0));
      } else {
        setPhase('exhale');
        const exhaleElapsed = cycleElapsed - inhaleDuration;
        const progress = exhaleElapsed / exhaleDuration;
        setScale(1.4 - progress * 0.4);
        const remainingSeconds = Math.ceil((exhaleDuration - exhaleElapsed) / 1000);
        setSeconds(Math.max(remainingSeconds, 0));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isBreathing]);

  const phaseText = phase === 'inhale' ? 'Breathe in through your nose' : 'Breathe out through your mouth';

  return (
    <>
      {showInstructions ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1, justifyContent: 'center', gap: '24px' }}>
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
              Vagal Breathing
            </h2>
            <div style={{ fontSize: '16px', color: '#666', lineHeight: '1.8', marginBottom: '24px' }}>
              <div style={{ textAlign: 'left', display: 'inline-block' }}>
                <p style={{ marginBottom: '12px' }}>
                  Inhale slowly through your nose for four seconds.
                </p>
                <p>
                  Then exhale slowly through your mouth for 6 seconds.
                </p>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: '#999', marginBottom: '24px' }}>
              Repeat for as many cycles as you like.
            </p>
          </div>
          <button
            onClick={() => {
              setShowInstructions(false);
              if (onInstructionsDismissed) {
                onInstructionsDismissed();
              }
            }}
            style={{
              padding: '12px 32px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e07560';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(240, 133, 113, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.3)';
            }}
          >
            OK, Let's Start
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1 }}>
          {/* Instruction text */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '500px',
              lineHeight: '1.3',
            }}
          >
            {phaseText}
          </div>

          {/* Centered visualization container */}
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-120px' }}>
            <div style={{ position: 'relative', width: '200px', height: '200px' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: '#F08571',
                transform: `scale(${scale})`,
                transition: 'transform 0.05s linear',
                boxShadow: '0 10px 40px rgba(240, 133, 113, 0.3)',
              }}
            />
            {/* Timer only inside circle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: '72px', fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)' }}>
                {seconds}
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PhysiologicalSigh({ isActive, onInstructionsDismissed }) {
  const [phase, setPhase] = useState('first-inhale');
  const [scale, setScale] = useState(1);
  const [seconds, setSeconds] = useState(4);
  const [showInstructions, setShowInstructions] = useState(true);
  const wasActiveRef = React.useRef(false);

  // Only reset animation state when transitioning from breathing to stopped
  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && !isActive) {
      // User was breathing and now stopped - reset animation but keep visualization visible
      wasActiveRef.current = false;
      setPhase('first-inhale');
      setScale(1);
      setSeconds(4);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || showInstructions) return;

    let animationFrame;
    let startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;

      // First inhale: 4 seconds, scale 1.0 to 1.4
      if (elapsed < 4000) {
        setPhase('first-inhale');
        const progress = elapsed / 4000;
        setScale(1 + progress * 0.4);
        setSeconds(Math.ceil((4000 - elapsed) / 1000));
      }
      // Second inhale: 2 seconds, scale 1.4 to 1.5
      else if (elapsed < 6000) {
        setPhase('second-inhale');
        const secondInhaleElapsed = elapsed - 4000;
        const progress = secondInhaleElapsed / 2000;
        setScale(1.4 + progress * 0.1);
        setSeconds(Math.ceil((6000 - elapsed) / 1000));
      }
      // Exhale: 8 seconds, scale 1.5 to 1.0
      else if (elapsed < 14000) {
        setPhase('exhale');
        const exhaleElapsed = elapsed - 6000;
        const progress = exhaleElapsed / 8000;
        setScale(1.5 - progress * 0.5);
        setSeconds(Math.ceil((14000 - elapsed) / 1000));
      }
      // Loop back
      else {
        startTime = Date.now();
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, showInstructions]);

  const getPhaseText = () => {
    switch (phase) {
      case 'first-inhale':
        return 'Deep inhale through your nose';
      case 'second-inhale':
        return 'Quick second inhale (top-up)';
      case 'exhale':
        return 'Long, slow exhale through your mouth';
      default:
        return '';
    }
  };

  return (
    <>
      {showInstructions ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1, justifyContent: 'center', gap: '24px' }}>
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
              Physiological Sigh
            </h2>
            <div style={{ fontSize: '16px', color: '#666', lineHeight: '1.8', marginBottom: '24px' }}>
              <div style={{ textAlign: 'left', display: 'inline-block' }}>
                <p style={{ marginBottom: '12px' }}>
                  <strong>First Inhale:</strong> Take a deep, natural breath in through your nose until your lungs feel full.
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>Second Inhale:</strong> Without exhaling, take a quick second "top-up" inhalation (a sharp sniff) through your nose to maximally inflate your lungs and re-expand any tiny collapsed air sacs.
                </p>
                <p>
                  <strong>Exhale:</strong> Release a long, slow exhale through your mouth until your lungs are completely empty.
                </p>
              </div>
            </div>
            <p style={{ fontSize: '14px', color: '#999', marginBottom: '24px' }}>
              Repeat 1-3 times for immediate stress relief.
            </p>
          </div>
          <button
            onClick={() => {
              setShowInstructions(false);
              if (onInstructionsDismissed) {
                onInstructionsDismissed();
              }
            }}
            style={{
              padding: '12px 32px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e07560';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(240, 133, 113, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F08571';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.3)';
            }}
          >
            OK, Let's Start
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', paddingBottom: '120px', flex: 1 }}>
          {/* Instruction text */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '500px',
              lineHeight: '1.3',
            }}
          >
            {getPhaseText()}
          </div>

          {/* Centered visualization container */}
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-120px' }}>
            <div style={{ position: 'relative', width: '200px', height: '200px' }}>
              {/* Extra inhale circle - appears during second inhale */}
              {phase === 'second-inhale' && (
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    border: '3px solid rgba(240, 133, 113, 0.4)',
                    transform: `scale(${scale + 0.2})`,
                    transition: 'transform 0.05s linear',
                    top: 0,
                    left: 0,
                  }}
                />
              )}

              {/* Main circle */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: '#F08571',
                  transform: `scale(${scale})`,
                  transition: 'transform 0.05s linear',
                  boxShadow: '0 10px 40px rgba(240, 133, 113, 0.3)',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
              {/* Timer only inside circle */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                <div style={{ fontSize: '72px', fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)' }}>
                  {seconds}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
