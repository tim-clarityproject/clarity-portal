import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CONTAINER_SIZE = 300;
const CIRCLE_BASE_RADIUS = 45;

export default function BreathingGuide({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isBreathing, setIsBreathing] = useState(false);
  const [phase, setPhase] = useState('inhale');
  const [countdownSeconds, setCountdownSeconds] = useState(4);
  const [scale, setScale] = useState(1);

  // Vagal Breathing animation: 4s inhale + 6s exhale
  useEffect(() => {
    if (!isOpen || !isBreathing) {
      setPhase('inhale');
      setCountdownSeconds(4);
      setScale(1);
      return;
    }

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = 10000; // 4s inhale + 6s exhale

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;

      if (cycleElapsed < 4000) {
        // Inhale: 4 seconds, scale 1 → 3
        setPhase('inhale');
        const inhalProgress = cycleElapsed / 4000;
        setScale(1 + inhalProgress * 2);
        setCountdownSeconds(4 - Math.floor(cycleElapsed / 1000));
      } else {
        // Exhale: 6 seconds, scale 3 → 1
        setPhase('exhale');
        const exhaleProgress = (cycleElapsed - 4000) / 6000;
        setScale(3 - exhaleProgress * 2);
        setCountdownSeconds(10 - Math.floor(cycleElapsed / 1000));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isOpen, isBreathing]);

  const handleReset = () => {
    setIsBreathing(false);
  };

  const handleStart = () => {
    setIsBreathing(true);
  };

  const handleFullBreathing = () => {
    onClose();
    navigate('/breathe');
  };

  const handleSettings = () => {
    onClose();
    window.location.href = '/my-account#breathing-settings';
  };

  if (!isOpen) return null;

  const radius = CIRCLE_BASE_RADIUS * scale;
  const center = CONTAINER_SIZE / 2;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px 24px',
          maxWidth: '400px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Breathing Circle */}
        <div style={{ position: 'relative', width: CONTAINER_SIZE, height: CONTAINER_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px' }}>
          <svg width={CONTAINER_SIZE} height={CONTAINER_SIZE} style={{ position: 'absolute' }}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="rgba(240, 133, 113, 0.08)"
              stroke="#F08571"
              strokeWidth="3"
            />
          </svg>
          <div style={{ position: 'relative', textAlign: 'center', zIndex: 10, padding: '24px' }}>
            <div style={{ fontSize: '44px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
              {Math.max(0, countdownSeconds)}
            </div>
            <div style={{ fontSize: '12px', color: '#666', fontWeight: '500', textTransform: 'capitalize' }}>
              {phase}
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', marginBottom: '16px' }}>
          {!isBreathing ? (
            <button
              onClick={handleStart}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e07560';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F08571';
              }}
            >
              Start
            </button>
          ) : (
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: 'white',
                color: '#333',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
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
              Reset
            </button>
          )}
        </div>

        {/* Quick Links */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', fontSize: '12px' }}>
          <button
            onClick={handleFullBreathing}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              color: '#666',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f0f0';
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.color = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.color = '#666';
            }}
          >
            All Tools
          </button>
          <button
            onClick={handleSettings}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              color: '#666',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f0f0';
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.color = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.color = '#666';
            }}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
