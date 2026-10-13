import { useState } from 'react';
import BreathingGuide from './BreathingGuide';

export default function BreathButton() {
  const [showBreathing, setShowBreathing] = useState(false);

  return (
    <>
      <div className="ui-root">
        <style>{`
          .ui-root .fab-breathe {
            position: fixed;
            right: 24px;
            bottom: 88px;
            z-index: 999;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 1px solid var(--line);
            background: var(--surface);
            color: var(--text);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: border-color var(--dur) var(--ease);
          }

          .ui-root .fab-breathe:hover,
          .ui-root .fab-breathe:focus-visible {
            border-color: var(--coral);
          }

          .ui-root .fab-breathe:focus-visible {
            outline: 2px solid var(--coral);
            outline-offset: 2px;
          }

          .ui-root .fab-breathe svg {
            width: 22px;
            height: 22px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.5;
            stroke-linecap: round;
            stroke-linejoin: round;
          }

          .ui-root .fab-breathe .fab-label {
            position: absolute;
            right: 58px;
            white-space: nowrap;
            font-family: var(--font-display);
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            font-size: 10px;
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-pill);
            padding: 0 14px;
            min-height: 30px;
            display: flex;
            align-items: center;
            color: var(--text);
            opacity: 0;
            pointer-events: none;
            transition: opacity var(--dur) var(--ease);
          }

          .ui-root .fab-breathe:hover .fab-label,
          .ui-root .fab-breathe:focus-visible .fab-label {
            opacity: 1;
          }

          @media (max-width: 768px) {
            .ui-root .fab-breathe {
              display: none;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .ui-root .fab-breathe,
            .ui-root .fab-breathe .fab-label {
              transition: none !important;
            }
          }
        `}</style>

        <button
          type="button"
          className="fab-breathe"
          onClick={() => setShowBreathing(true)}
          aria-label="Take a breath"
        >
          <span className="fab-label" aria-hidden="true">Take a breath</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 9.5c2-2 4 2 7.5 0s5.5 2 7.5 0" />
            <path d="M4.5 14.5c2-2 4 2 7.5 0s5.5 2 7.5 0" />
          </svg>
        </button>
      </div>

      <BreathingGuide isOpen={showBreathing} onClose={() => setShowBreathing(false)} />
    </>
  );
}
