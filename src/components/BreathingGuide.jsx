import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function BreathingGuide({ isOpen, onClose }) {
  const { user } = useContext(AuthContext);
  const [phase, setPhase] = useState('inhale');
  const [scale, setScale] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [showGreeting, setShowGreeting] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [greetingOffset, setGreetingOffset] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setShowGreeting(true);
      setDisplayedText('');
      setGreetingOffset(0);
      return;
    }

    const firstName = user?.user_metadata?.first_name || 'there';
    const fullText = `Good morning, ${firstName}, let's take a breath`;
    let charIndex = 0;

    const typingInterval = setInterval(() => {
      if (charIndex <= fullText.length) {
        setDisplayedText(fullText.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typingInterval);
        setTimeout(() => {
          const animationStart = Date.now();
          const animationDuration = 1000;

          const animateOut = () => {
            const elapsed = Date.now() - animationStart;
            const progress = Math.min(elapsed / animationDuration, 1);

            setGreetingOffset(-progress * 100);

            if (progress < 1) {
              requestAnimationFrame(animateOut);
            } else {
              setShowGreeting(false);
            }
          };

          animateOut();
        }, 1500);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen || showGreeting) return;

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
    };

    loadSettings();
  }, [isOpen, user]);

  if (!isOpen) return null;

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
      {showGreeting && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, calc(-50% + ${greetingOffset}px))`,
            textAlign: 'center',
            fontSize: '28px',
            fontWeight: '600',
            color: 'white',
            maxWidth: '80%',
            transition: 'none',
            opacity: 1 - Math.abs(greetingOffset) / 100,
          }}
        >
          {displayedText}
          {displayedText.length < `Good morning, ${user?.user_metadata?.first_name || 'there'}, let's take a breath`.length && (
            <span style={{ animation: 'blink 1s infinite' }}>|</span>
          )}
          <style>{`
            @keyframes blink {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '80px', opacity: showGreeting ? 0 : 1, transition: 'opacity 0.3s ease' }}>
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
