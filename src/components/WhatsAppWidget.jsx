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
          bottom: clamp(16px, 3vw, 28px);
          right: clamp(16px, 3vw, 32px);
          z-index: 50;
        }
        .whatsapp-icon {
          width: clamp(18px, 2.5vw, 22px);
          height: clamp(18px, 2.5vw, 22px);
        }
      `}</style>
      <div
        className="whatsapp-widget"
      >
      <button
        onClick={handleMessageClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(8px, 1.5vw, 12px)',
          padding: isHovered ? 'clamp(10px, 1.5vw, 12px) clamp(12px, 2vw, 16px)' : 'clamp(10px, 1.5vw, 12px)',
          backgroundColor: '#F08571',
          border: 'none',
          borderRadius: '50px',
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
              color: 'white',
              fontSize: 'clamp(11px, 1.5vw, 13px)',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              maxWidth: '150px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
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
