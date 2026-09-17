import { useState, useEffect } from 'react';

export default function BreathingGuide({ isOpen, onClose }) {
  const [phase, setPhase] = useState('inhale'); // 'inhale' or 'exhale'
  const [scale, setScale] = useState(1);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    // Load custom settings from localStorage
    let inhaleDuration = 4000;
    let holdDuration = 0;
    let exhaleDuration = 6000;

    const saved = localStorage.getItem('breathingSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        inhaleDuration = (settings.inhale || 4) * 1000;
        holdDuration = (settings.hold || 0) * 1000;
        exhaleDuration = (settings.exhale || 6) * 1000;
      } catch (e) {
        console.error('Error loading breathing settings:', e);
      }
    }

    let animationFrame;
    let startTime = Date.now();
    const cycleDuration = inhaleDuration + holdDuration + exhaleDuration + holdDuration;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleDuration;

      if (cycleElapsed < inhaleDuration) {
        // Inhale phase: scale from 1 to 1.5
        setPhase('inhale');
        const progress = cycleElapsed / inhaleDuration;
        setScale(1 + progress * 0.5);
        const inhaleSeconds = Math.floor(cycleElapsed / 1000) + 1;
        setSeconds(Math.min(inhaleSeconds, Math.floor(inhaleDuration / 1000)));
      } else if (cycleElapsed < inhaleDuration + holdDuration) {
        // Hold phase (after inhale): maintain 1.5 scale, count up
        setPhase('hold');
        setScale(1.5);
        const holdElapsed = cycleElapsed - inhaleDuration;
        const holdSeconds = Math.floor(holdElapsed / 1000) + 1;
        setSeconds(Math.min(holdSeconds, Math.floor(holdDuration / 1000)));
      } else if (cycleElapsed < inhaleDuration + holdDuration + exhaleDuration) {
        // Exhale phase: scale from 1.5 to 1
        setPhase('exhale');
        const exhaleElapsed = cycleElapsed - inhaleDuration - holdDuration;
        const progress = exhaleElapsed / exhaleDuration;
        setScale(1.5 - progress * 0.5);
        const exhaleSeconds = Math.floor(exhaleElapsed / 1000) + 1;
        setSeconds(Math.min(exhaleSeconds, Math.floor(exhaleDuration / 1000)));
      } else {
        // Hold phase (after exhale): maintain 1 scale, count up
        setPhase('hold');
        setScale(1);
        const holdElapsed = cycleElapsed - inhaleDuration - holdDuration - exhaleDuration;
        const holdSeconds = Math.floor(holdElapsed / 1000) + 1;
        setSeconds(Math.min(holdSeconds, Math.floor(holdDuration / 1000)));
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        flexDirection: 'column',
        gap: '24px',
      }}
      onClick={onClose}
    >
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '80px' }}>
        {/* Circle with timer inside */}
        <div
          style={{
            position: 'relative',
            width: '200px',
            height: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '200px',
              height: '200px',
              backgroundColor: '#F08571',
              borderRadius: '50%',
              transform: `scale(${scale})`,
              transition: 'none',
              boxShadow: '0 10px 40px rgba(240, 133, 113, 0.3)',
            }}
          />
          {/* Timer in center */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              fontSize: '48px',
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            }}
          >
            {typeof seconds === 'number' ? Math.round(seconds) : '—'}
          </div>
        </div>

        {/* Text below circle */}
        <div
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'white',
            textAlign: 'center',
            minHeight: '24px',
            minWidth: '300px',
          }}
        >
          {phase === 'inhale' ? 'Breathe in through your nose' : phase === 'hold' ? 'Hold your breath' : 'Breathe out through your mouth'}
        </div>

        {/* Done button */}
        <button
          onClick={onClose}
          style={{
            marginTop: '24px',
            padding: '12px 24px',
            backgroundColor: 'white',
            border: 'none',
            borderRadius: '6px',
            color: '#333',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#f0f0f0';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'white';
          }}
        >
          FINISH
        </button>

        {/* Settings link */}
        <button
          onClick={() => {
            onClose();
            window.location.href = '/my-account#breathing-settings';
          }}
          style={{
            marginTop: '12px',
            padding: '0',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'color 0.2s',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 1)'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.6)'}
        >
          Edit breathing settings
        </button>
      </div>
    </div>
  );
}
