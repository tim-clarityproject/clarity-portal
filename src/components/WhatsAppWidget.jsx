import { useState, useEffect } from 'react';

export default function WhatsAppWidget() {
  const [isNorthAmerica, setIsNorthAmerica] = useState(false);

  useEffect(() => {
    const checkLocation = async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (timezone.startsWith('America/') || timezone.startsWith('Canada/')) {
        setIsNorthAmerica(true);
        return;
      }

      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const countryCode = data.country_code;
        setIsNorthAmerica(countryCode === 'US' || countryCode === 'CA');
      } catch (error) {
        console.error('Geolocation fetch failed:', error);
      }
    };

    checkLocation();
  }, []);

  const handleMessageClick = () => {
    const message = "Hi Tim, I'd like to chat with you.";

    if (isNorthAmerica) {
      window.location.href = `imessage://+447792332439?text=${encodeURIComponent(message)}`;
    } else {
      window.open(`https://wa.me/447792332439?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .fab-chat {
          position: fixed;
          right: 24px;
          bottom: 24px;
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

        .ui-root .fab-chat:hover,
        .ui-root .fab-chat:focus-visible {
          border-color: var(--coral);
        }

        .ui-root .fab-chat:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
        }

        .ui-root .fab-chat svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .ui-root .fab-chat .fab-label {
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

        .ui-root .fab-chat:hover .fab-label,
        .ui-root .fab-chat:focus-visible .fab-label {
          opacity: 1;
        }

        @media (max-width: 768px) {
          .ui-root .fab-chat {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ui-root .fab-chat,
          .ui-root .fab-chat .fab-label {
            transition: none !important;
          }
        }
      `}</style>

      <button
        type="button"
        className="fab-chat"
        onClick={handleMessageClick}
        aria-label="Chat to Dr. Tim"
      >
        <span className="fab-label" aria-hidden="true">Chat to Dr. Tim</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h14v9.5h-8l-4 3v-3H5z" />
        </svg>
      </button>
    </div>
  );
}
