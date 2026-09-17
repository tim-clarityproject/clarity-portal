import { useState, useEffect } from 'react';

export default function BreathingGuide({ isOpen, onClose }) {
  const [phase, setPhase] = useState('inhale'); // 'inhale' or 'exhale'
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    let animationFrame;
    let startTime = Date.now();
    const inhaleDuration = 4000; // 4 seconds
    const exhaleDuration = 6000; // 6 seconds
    const cycleDuration = inhaleDuration + exhaleDuration;

    const animate = () => {
      const elapsed = (Date.now() - startTime) % cycleDuration;

      if (elapsed < inhaleDuration) {
        // Inhale phase: scale from 1 to 1.5
        setPhase('inhale');
        const progress = elapsed / inhaleDuration;
        setScale(1 + progress * 0.5);
      } else {
        // Exhale phase: scale from 1.5 to 1
        setPhase('exhale');
        const progress = (elapsed - inhaleDuration) / exhaleDuration;
        setScale(1.5 - progress * 0.5);
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
      <div
        style={{
          width: '200px',
          height: '200px',
          backgroundColor: '#F08571',
          borderRadius: '50%',
          transform: `scale(${scale})`,
          transition: 'none',
          boxShadow: '0 10px 40px rgba(240, 133, 113, 0.3)',
        }}
      />

      <div
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: 'white',
          textAlign: 'center',
          minHeight: '24px',
          minWidth: '200px',
        }}
      >
        {phase === 'inhale' ? 'Breathe in through your nose' : 'Breathe out through your mouth'}
      </div>

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
        Done
      </button>
    </div>
  );
}
