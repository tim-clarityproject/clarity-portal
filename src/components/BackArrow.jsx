import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function BackArrow() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        color: '#F08571',
        cursor: 'pointer',
        borderRadius: '6px',
        transition: 'all 0.2s',
        marginBottom: '24px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      <ChevronLeft size={20} />
      <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: '4px' }}>Back</span>
    </button>
  );
}
