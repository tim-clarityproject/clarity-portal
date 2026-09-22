import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function BreathingPage() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const [breathingType, setBreathingType] = useState('sigh');
  const [view, setView] = useState('instructions'); // 'instructions' | 'breathing'
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [expandedHelp, setExpandedHelp] = useState(false);
  const sessionStartTimeRef = useRef(null);
  const isBreathingRef = useRef(false);

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
    isBreathingRef.current = true;
    setElapsedSeconds(0);
  };

  const handleStopBreathing = () => {
    isBreathingRef.current = false;
    saveBreathingSession();
    setView('instructions');
  };

  const handleSwitchBreathingType = (type) => {
    if (view === 'breathing') {
      handleStopBreathing();
    }
    setBreathingType(type);
    setExpandedHelp(false);
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
        { step: 'First Inhale', text: 'Take a deep, natural breath in through your nose until your lungs feel full.' },
        { step: 'Second Inhale', text: 'Without exhaling, take a quick second "top-up" inhalation (a sharp sniff) through your nose to maximally inflate your lungs.' },
        { step: 'Exhale', text: 'Release a long, slow exhale through your mouth until your lungs are completely empty.' },
      ],
      help: 'This rapid stress-relief technique activates your parasympathetic nervous system. The double inhale maximizes oxygen intake, and the long exhale triggers the relaxation response. Repeat 1-3 times for immediate relief.',
      note: 'Repeat 1-3 times for immediate stress relief.',
    },
    vagal: {
      name: 'Vagal Breathing',
      instructions: [
        { step: 'Inhale', text: 'Inhale slowly through your nose for four seconds, allowing your lungs to fill completely.' },
        { step: 'Exhale', text: 'Exhale slowly through your mouth for six seconds, releasing all the air gradually.' },
      ],
      help: 'This technique directly stimulates the vagus nerve, a key component of your parasympathetic nervous system. The longer exhale than inhale signals your body to relax. Safe and effective for anxiety, tension, and sleep.',
      note: 'Repeat for as many cycles as you like.',
    },
    box: {
      name: 'Box Breathing',
      instructions: [
        { step: 'Inhale', text: 'Inhale slowly through your nose for four seconds.' },
        { step: 'Hold', text: 'Hold your breath for four seconds.' },
        { step: 'Exhale', text: 'Exhale slowly through your mouth for four seconds.' },
        { step: 'Hold', text: 'Hold your breath for four seconds.' },
      ],
      help: 'This balanced breathing pattern is used by Navy SEALs and stress-management professionals. The equal timing creates a rhythm that calms your mind and body. Perfect for focus, anxiety, or emotional regulation.',
      note: 'Repeat for as many cycles as you like.',
    },
  };

  const info = breathingInfo[breathingType];

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {view === 'instructions' ? (
        // INSTRUCTION VIEW
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', paddingTop: '32px' }}>
          <div style={{ width: '100%', maxWidth: '600px' }}>
            {/* Breathing Type Selector */}
            <div style={{ display: 'flex', border: '2px solid #d0d0d0', borderRadius: '8px', overflow: 'hidden', marginBottom: '32px' }}>
              {['sigh', 'vagal', 'box'].map((type) => (
                <button
                  key={type}
                  onClick={() => handleSwitchBreathingType(type)}
                  style={{
                    flex: 1,
                    padding: '10px 20px',
                    backgroundColor: breathingType === type ? 'white' : '#f5f5f5',
                    border: 'none',
                    color: breathingType === type ? '#333' : '#999',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    borderRight: type !== 'box' ? '1px solid #d0d0d0' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (breathingType !== type) {
                      e.currentTarget.style.backgroundColor = '#ececec';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (breathingType !== type) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                >
                  {breathingType === type ? '✓' : ''} {type === 'sigh' ? 'Sigh' : type === 'vagal' ? 'Vagal' : 'Box'}
                </button>
              ))}
            </div>

            {/* Breathing Type Title */}
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', margin: '0 0 24px 0', textAlign: 'center' }}>
              {info.name}
            </h1>

            {/* Instructions */}
            <div style={{ backgroundColor: '#fafafa', padding: '24px', borderRadius: '8px', marginBottom: '24px', borderLeft: '4px solid #F08571' }}>
              {info.instructions.map((inst, idx) => (
                <div key={idx} style={{ marginBottom: idx < info.instructions.length - 1 ? '16px' : '0' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 6px 0' }}>
                    Step {idx + 1}: {inst.step}
                  </p>
                  <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.6', marginLeft: '12px' }}>
                    {inst.text}
                  </p>
                </div>
              ))}
              <p style={{ fontSize: '13px', color: '#999', margin: '16px 0 0 0', textAlign: 'center', fontStyle: 'italic' }}>
                {info.note}
              </p>
            </div>

            {/* Help Section (Collapsible) */}
            <button
              onClick={() => setExpandedHelp(!expandedHelp)}
              style={{
                width: '100%',
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: expandedHelp ? '12px' : '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
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
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>
                ? How does this work?
              </span>
              <ChevronDown
                size={16}
                style={{
                  color: '#999',
                  transform: expandedHelp ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </button>

            {expandedHelp && (
              <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '6px', marginBottom: '24px', borderLeft: '3px solid #F08571' }}>
                <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.8' }}>
                  {info.help}
                </p>
              </div>
            )}

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
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(240, 133, 113, 0.2)',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#e07560';
                e.target.style.boxShadow = '0 6px 16px rgba(240, 133, 113, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#F08571';
                e.target.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.2)';
              }}
            >
              Start Breathing
            </button>
          </div>
        </div>
      ) : (
        // BREATHING VIEW
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          {/* Breathing Animation Component */}
          <div style={{ marginBottom: '48px', textAlign: 'center' }}>
            {breathingType === 'sigh' && <PhysiologicalSigh isActive={view === 'breathing'} />}
            {breathingType === 'vagal' && <VagalBreathing isActive={view === 'breathing'} />}
            {breathingType === 'box' && <BoxBreathing isActive={view === 'breathing'} />}
          </div>

          {/* Timer */}
          <p style={{ fontSize: '18px', color: '#666', fontWeight: '500', marginBottom: '48px' }}>
            {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
          </p>

          {/* Stop Button */}
          <button
            onClick={handleStopBreathing}
            style={{
              padding: '12px 32px',
              backgroundColor: 'white',
              color: '#F08571',
              border: '2px solid #F08571',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'white';
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// Animation Components (kept from original)
function BoxBreathing({ isActive }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);
  const wasActiveRef = React.useRef(false);

  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && !isActive) {
      wasActiveRef.current = false;
      setProgress(0);
      setPhase('inhale');
      setSecondsLeft(4);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 16000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;
      const normalizedProgress = cycleElapsed / cycleDuration;

      setProgress(normalizedProgress);

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

  const size = 200;
  const circumference = 2 * Math.PI * (size / 2 - 10);
  const offset = circumference - (progress * circumference);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 10} fill="none" stroke="#e5e5e5" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 10}
          fill="none"
          stroke="#F08571"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '14px', color: '#999', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

function VagalBreathing({ isActive }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);
  const wasActiveRef = React.useRef(false);

  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && !isActive) {
      wasActiveRef.current = false;
      setProgress(0);
      setPhase('inhale');
      setSecondsLeft(4);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 10000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;
      const normalizedProgress = cycleElapsed / cycleDuration;

      setProgress(normalizedProgress);

      if (cycleElapsed < 4000) {
        setPhase('inhale');
        setSecondsLeft(Math.ceil((4000 - cycleElapsed) / 1000));
      } else {
        setPhase('exhale');
        setSecondsLeft(Math.ceil((10000 - cycleElapsed) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const size = 200;
  const circumference = 2 * Math.PI * (size / 2 - 10);
  const offset = circumference - (progress * circumference);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 10} fill="none" stroke="#e5e5e5" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 10}
          fill="none"
          stroke="#F08571"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '14px', color: '#999', textTransform: 'capitalize' }}>
          {phase}
        </div>
      </div>
    </div>
  );
}

function PhysiologicalSigh({ isActive }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('inhale1');
  const [secondsLeft, setSecondsLeft] = useState(1);
  const wasActiveRef = React.useRef(false);

  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && !isActive) {
      wasActiveRef.current = false;
      setProgress(0);
      setPhase('inhale1');
      setSecondsLeft(1);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 4000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;
      const normalizedProgress = cycleElapsed / cycleDuration;

      setProgress(normalizedProgress);

      if (cycleElapsed < 2000) {
        setPhase('inhale1');
        setSecondsLeft(Math.ceil((2000 - cycleElapsed) / 1000));
      } else if (cycleElapsed < 2500) {
        setPhase('inhale2');
        setSecondsLeft(1);
      } else {
        setPhase('exhale');
        setSecondsLeft(Math.ceil((4000 - cycleElapsed) / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const size = 200;
  const circumference = 2 * Math.PI * (size / 2 - 10);
  const offset = circumference - (progress * circumference);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 10} fill="none" stroke="#e5e5e5" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 10}
          fill="none"
          stroke="#F08571"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
          {secondsLeft}
        </div>
        <div style={{ fontSize: '14px', color: '#999', textTransform: 'capitalize' }}>
          {phase === 'inhale1' ? 'Inhale' : phase === 'inhale2' ? 'Sniff' : 'Exhale'}
        </div>
      </div>
    </div>
  );
}
