import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppWidget() {
  const [isHovered, setIsHovered] = useState(false);
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
    <>
      <style>{`
        .whatsapp-widget {
          position: fixed;
          bottom: 32px;
          right: 24px;
          z-index: 50;
        }
        .whatsapp-button {
          width: 48px;
          height: 48px;
          min-width: 48px;
          min-height: 48px;
        }
        .whatsapp-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
        }
      `}</style>
      <div
        className="whatsapp-widget"
      >
      <button
        className="whatsapp-button"
        onClick={handleMessageClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: 0,
          backgroundColor: '#F08571',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(240, 133, 113, 0.3)',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
        }}
        title={isNorthAmerica ? "Chat with Tim on iMessage" : "Chat with Tim on WhatsApp"}
      >
        <div className="whatsapp-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageCircle color="white" fill="white" style={{ width: '100%', height: '100%' }} />
        </div>
        {isHovered && (
          <span
            style={{
              position: 'absolute',
              left: '-160px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '6px 12px',
              borderRadius: '4px',
              pointerEvents: 'none',
            }}
          >
            Speak directly to Tim
          </span>
        )}
      </button>
      </div>
    </>
  );
}
