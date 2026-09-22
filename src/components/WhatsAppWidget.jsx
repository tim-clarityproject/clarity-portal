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
          height: 40px;
        }
        .whatsapp-button {
          height: 40px;
          min-height: 40px;
          padding: 0;
          margin: 0;
        }
        .whatsapp-icon {
          width: 18px;
          height: 18px;
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
          gap: isHovered ? '8px' : '0',
          width: isHovered ? 'auto' : '40px',
          minWidth: '40px',
          paddingLeft: isHovered ? '12px' : '0',
          paddingRight: isHovered ? '8px' : '0',
          backgroundColor: isHovered ? '#f0f0f0' : '#fafafa',
          border: `1.5px solid ${isHovered ? '#e07560' : '#F08571'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: 'none',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
        }}
        title={isNorthAmerica ? "Chat with Tim on iMessage" : "Chat with Tim on WhatsApp"}
      >
        {isHovered && (
          <span style={{
            fontSize: '12px',
            fontWeight: '500',
            color: isHovered ? '#e07560' : '#F08571',
            flex: 1,
          }}>
            Chat directly with Tim
          </span>
        )}
        <div className="whatsapp-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '18px', height: '18px' }}>
          <MessageCircle color={isHovered ? '#e07560' : '#F08571'} fill="none" style={{ width: '100%', height: '100%' }} />
        </div>
      </button>
      </div>
    </>
  );
}
