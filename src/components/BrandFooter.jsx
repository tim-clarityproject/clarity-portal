export default function BrandFooter() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '20px 32px',
        borderTop: '1px solid #f0f0f0',
        color: '#999',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '-12px',
      }}
    >
      <span>Created by</span>
      <a
        href="https://theclarityproject.co.uk/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.opacity = '1'}
        onMouseLeave={(e) => e.target.style.opacity = '0.9'}
      >
        <img
          src="/clarity-logo.png"
          alt="The Clarity Project"
          style={{
            height: '108px',
            width: 'auto',
            display: 'block',
            opacity: 0.9,
          }}
        />
      </a>
    </div>
  );
}
