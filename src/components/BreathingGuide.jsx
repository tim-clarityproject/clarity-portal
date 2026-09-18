import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function BreathingGuide({ isOpen, onClose, showGreeting = false, firstName = 'there' }) {
  const { user } = useContext(AuthContext);
  const [phase, setPhase] = useState('inhale');
  const [scale, setScale] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [greetingPhase, setGreetingPhase] = useState('typing');
  const [displayedText, setDisplayedText] = useState('');

  // Greeting animation phase
  useEffect(() => {
    if (!isOpen || !showGreeting) {
      setGreetingPhase('typing');
      setDisplayedText('');
      return;
    }

    // Wait for firstName to be available
    if (!firstName || firstName === 'there') {
      return;
    }

    const fullText = `Good morning, ${firstName}. Let's take a breath`;
    let charIndex = 0;

    // Type out text
    const typingInterval = setInterval(() => {
      if (charIndex <= fullText.length) {
        setDisplayedText(fullText.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typingInterval);
        // After typing, wait 1.5 seconds then transition to breathing
        setTimeout(() => {
          setGreetingPhase('transitioning');
          setTimeout(() => {
            setGreetingPhase('done');
          }, 1000);
        }, 1500);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [isOpen, showGreeting, firstName]);

  useEffect(() => {
    if (!isOpen || (showGreeting && greetingPhase !== 'done')) return;

    const loadSettings = async () => {
      let inhaleDuration = 4000;
      let holdDuration = 0;
      let exhaleDuration = 6000;

      // Try to load from Supabase if user is logged in
      if (user) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('breathing_settings')
            .eq('id', user.id)
            .single();

          if (data?.breathing_settings) {
            const settings = data.breathing_settings;
            inhaleDuration = (settings.inhale || 4) * 1000;
            holdDuration = (settings.hold || 0) * 1000;
            exhaleDuration = (settings.exhale || 6) * 1000;
            startAnimation(inhaleDuration, holdDuration, exhaleDuration);
            return;
          }
        } catch (e) {
          console.error('Error loading breathing settings from Supabase:', e);
        }
      }

      // Fall back to localStorage
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

      startAnimation(inhaleDuration, holdDuration, exhaleDuration);
    };

    const startAnimation = (inhaleDuration, holdDuration, exhaleDuration) => {
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
          const remainingSeconds = Math.ceil((inhaleDuration - cycleElapsed) / 1000);
          setSeconds(Math.max(remainingSeconds, 0));
        } else if (cycleElapsed < inhaleDuration + holdDuration) {
          // Hold phase (after inhale): maintain 1.5 scale, count down
          setPhase('hold');
          setScale(1.5);
          const holdElapsed = cycleElapsed - inhaleDuration;
          const remainingSeconds = Math.ceil((holdDuration - holdElapsed) / 1000);
          setSeconds(Math.max(remainingSeconds, 0));
        } else if (cycleElapsed < inhaleDuration + holdDuration + exhaleDuration) {
          // Exhale phase: scale from 1.5 to 1
          setPhase('exhale');
          const exhaleElapsed = cycleElapsed - inhaleDuration - holdDuration;
          const progress = exhaleElapsed / exhaleDuration;
          setScale(1.5 - progress * 0.5);
          const remainingSeconds = Math.ceil((exhaleDuration - exhaleElapsed) / 1000);
          setSeconds(Math.max(remainingSeconds, 0));
        } else {
          // Hold phase (after exhale): maintain 1 scale, count down
          setPhase('hold');
          setScale(1);
          const holdElapsed = cycleElapsed - inhaleDuration - holdDuration - exhaleDuration;
          const remainingSeconds = Math.ceil((holdDuration - holdElapsed) / 1000);
          setSeconds(Math.max(remainingSeconds, 0));
        }

        animationFrame = requestAnimationFrame(animate);
      };

      animationFrame = requestAnimationFrame(animate);

      return () => cancelAnimationFrame(animationFrame);
    };

    loadSettings();
  }, [isOpen, greetingPhase, showGreeting, user]);

  if (!isOpen) return null;

  const isShowingGreeting = showGreeting && greetingPhase !== 'done';
  const greetingOpacity = greetingPhase === 'transitioning' ? 0 : 1;
  const greetingTransform = greetingPhase === 'transitioning' ? 'translateY(-100px)' : 'translateY(0)';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#2c3e50',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        flexDirection: 'column',
        gap: '24px',
      }}
      onClick={onClose}
    >
      {isShowingGreeting && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) ${greetingTransform}`,
            textAlign: 'center',
            fontSize: '56px',
            fontWeight: '600',
            color: 'white',
            maxWidth: '90%',
            opacity: greetingOpacity,
            transition: 'all 1s ease-out',
            minHeight: '80px',
            lineHeight: '1.3',
            letterSpacing: '-0.5px',
          }}
        >
          {displayedText}
          {displayedText.length < `Good morning, ${firstName}, let's take a breath`.length && greetingPhase === 'typing' && (
            <span style={{ animation: 'blink 1s infinite', marginLeft: '8px' }}>|</span>
          )}
          <style>{`
            @keyframes blink {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '80px', opacity: isShowingGreeting ? 0 : 1, transition: 'opacity 0.5s ease-in' }}>
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
          {phase === 'inhale' ? 'Breathe in through your nose' : phase === 'hold' ? 'Hold' : 'Breathe out through your mouth'}
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
          Finish
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
