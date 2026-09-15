import { useState, useEffect } from 'react';

export default function OptionsTimer({ initialSeconds = null, onTimeChange = null }) {
  const DEFAULT_TIME = 6 * 60; // 6 minutes in seconds
  const startTime = initialSeconds || DEFAULT_TIME;
  const [totalSeconds, setTotalSeconds] = useState(startTime);
  const [secondsLeft, setSecondsLeft] = useState(startTime);
  const [isRunning, setIsRunning] = useState(!initialSeconds); // only auto-start if no initial time provided
  const [inputMinutes, setInputMinutes] = useState(Math.floor(startTime / 60).toString());

  useEffect(() => {
    if (!isRunning || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          setIsRunning(false);
        }
        if (onTimeChange) onTimeChange(newTime);
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, onTimeChange]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = (secondsLeft / totalSeconds) * 100;

  const handleReset = () => {
    setTotalSeconds(DEFAULT_TIME);
    setSecondsLeft(DEFAULT_TIME);
    setInputMinutes('6');
    setIsRunning(true);
  };

  const handleSetTime = () => {
    const mins = parseInt(inputMinutes, 10);
    if (mins > 0 && mins <= 60) {
      const newSeconds = mins * 60;
      setTotalSeconds(newSeconds);
      setSecondsLeft(newSeconds);
      setIsRunning(true);
    }
  };

  const handleToggle = () => {
    setIsRunning(!isRunning);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '16px 24px',
      backgroundColor: '#fafafa',
      borderRadius: '12px',
      marginBottom: '24px',
      position: 'sticky',
      top: '20px',
      zIndex: '10',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    }}>
      {/* Instruction Text */}
      <p style={{ fontSize: '13px', color: '#666', margin: '0 0 4px 0', lineHeight: '1.5' }}>
        Create a list of options you have. There are no bad ideas at this point. Write them all down. You can reset the timer if you need more time, but don't give up before the 6 minutes is up.
      </p>

      {/* Timer Display and Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
      {/* Timer Display */}
      <div style={{ position: 'relative', width: '100px', height: '100px' }}>
        <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#e5e5e5"
            strokeWidth="4"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#F08571"
            strokeWidth="4"
            strokeDasharray={`${(progress / 100) * 282.7} 282.7`}
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1a1a1a' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
            {isRunning ? 'running' : 'paused'}
          </div>
        </div>
      </div>

        {/* Controls - Horizontal Layout */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button
            onClick={handleToggle}
            style={{
              padding: '6px 12px',
              backgroundColor: isRunning ? '#FEE5DE' : '#F08571',
              color: isRunning ? '#F08571' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.target.style.opacity = '1';
            }}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </button>

          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: '#999',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.color = '#999';
            }}
          >
            Reset
          </button>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="number"
              min="1"
              max="60"
              value={inputMinutes}
              onChange={(e) => setInputMinutes(e.target.value)}
              style={{
                width: '40px',
                padding: '5px 6px',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '11px',
                textAlign: 'center',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#F08571'}
              onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
            />
            <span style={{ fontSize: '11px', color: '#999', whiteSpace: 'nowrap' }}>min</span>
            <button
              onClick={handleSetTime}
              style={{
                padding: '5px 10px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
