export default function InfoModal({ isOpen, onClose, title, content }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 4000,
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '420px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          animation: 'slideInUp 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            padding: 0,
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '20px',
            color: '#999',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f0f0f0';
            e.currentTarget.style.color = '#333';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#999';
          }}
          aria-label="Close"
        >
          ×
        </button>

        {/* Title */}
        <h2
          style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#333',
            marginBottom: '16px',
            marginTop: 0,
            paddingRight: '32px',
          }}
        >
          {title}
        </h2>

        {/* Content */}
        <p
          style={{
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#666',
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {content}
        </p>
      </div>
    </div>
  );
}
