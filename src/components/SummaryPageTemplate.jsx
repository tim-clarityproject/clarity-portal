import { useNavigate } from 'react-router-dom';

export default function SummaryPageTemplate({
  title,
  subtitle,
  badge,
  sections = [],
  backLink,
  onEdit,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backLink?.action) {
      backLink.action();
    } else if (backLink?.path) {
      navigate(backLink.path, { state: backLink.state });
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={handleBack}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            padding: 0,
          }}
        >
          ← {backLink?.label || 'Back'}
        </button>
        {badge && (
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff', backgroundColor: '#F08571', padding: '4px 12px', borderRadius: '4px', textTransform: 'uppercase' }}>
            {badge}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
        {title}
      </h1>

      {/* Subtitle (Date) */}
      {subtitle && (
        <p style={{ fontSize: '14px', color: '#999', marginBottom: '48px' }}>
          {subtitle}
        </p>
      )}

      {/* Sections */}
      {sections.map((section, idx) => (
        <div key={idx} style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {section.title}
          </h2>
          <div style={{
            backgroundColor: '#f9f9f9',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#555',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}>
            {section.content || <span style={{ color: '#999', fontStyle: 'italic' }}>No content provided</span>}
          </div>
        </div>
      ))}

      {/* Edit Button */}
      {onEdit && (
        <div style={{ marginTop: '48px', display: 'flex', gap: '12px' }}>
          <button
            onClick={onEdit}
            style={{
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
