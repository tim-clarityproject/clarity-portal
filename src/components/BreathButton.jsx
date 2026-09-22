import { useState } from 'react';
import BreathingGuide from './BreathingGuide';

export default function BreathButton() {
  const [showBreathing, setShowBreathing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <style>{`
        .breathe-button {
          position: fixed;
          bottom: 88px;
          right: 24px;
          height: 40px;
          padding: 0;
          margin: 0;
        }
      `}</style>
      <button
        className="breathe-button"
        onClick={() => setShowBreathing(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: isHovered ? 'auto' : '40px',
          minWidth: '40px',
          borderRadius: '8px',
          backgroundColor: isHovered ? '#f0f0f0' : '#fafafa',
          border: `1.5px solid ${isHovered ? '#e07560' : '#F08571'}`,
          color: isHovered ? '#e07560' : '#F08571',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          boxShadow: 'none',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isHovered ? '8px' : '0',
          paddingLeft: isHovered ? '12px' : '0',
          paddingRight: isHovered ? '8px' : '0',
          zIndex: 999,
          lineHeight: '1',
          whiteSpace: 'nowrap',
        }}
        title="Take a breath"
      >
        {isHovered && (
          <span style={{
            fontSize: '12px',
            fontWeight: '500',
            color: isHovered ? '#e07560' : '#F08571',
            flex: 1,
          }}>
            Take a breath
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '18px', height: '18px' }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            {/* Top wavy line */}
            <path d="M 3 7 Q 6 5 9 7 Q 12 9 15 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            {/* Bottom wavy line */}
            <path d="M 3 11 Q 6 9 9 11 Q 12 13 15 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </button>

      <BreathingGuide isOpen={showBreathing} onClose={() => setShowBreathing(false)} />
    </>
  );
}
