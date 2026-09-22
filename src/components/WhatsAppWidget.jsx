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
          bottom: 24px;
          right: 24px;
          z-index: 50;
        }
        .whatsapp-icon {
          width: 24px;
          height: 24px;
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
          gap: '12px',
          padding: isHovered ? '12px 16px' : '12px',
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
              fontSize: '13px',
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
