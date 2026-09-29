import { useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, Compass, GitBranch, CheckSquare } from 'lucide-react';

export default function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { id: 'home', label: 'Home', path: '/welcome', icon: Home },
    { id: 'ground', label: 'Ground', path: '/ground-section', icon: Compass },
    { id: 'plan-decide', label: 'Plan', path: '/plan-section', icon: FileText },
    { id: 'review', label: 'Review', path: '/review-section', icon: CheckSquare },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'white',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        zIndex: 1999,
      }}
      className="bottom-tab-bar"
    >
      <style>{`
        @media (max-width: 768px) {
          .bottom-tab-bar {
            display: flex;
          }
          body {
            padding-bottom: calc(60px + max(8px, env(safe-area-inset-bottom)));
          }
        }
        @media (min-width: 769px) {
          .bottom-tab-bar {
            display: none !important;
          }
        }
      `}</style>

      {tabs.map((tab) => {
        const IconComponent = tab.icon;
        const active = isActive(tab.path);

        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 0',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? '#F08571' : '#999',
              transition: 'color 0.2s',
            }}
          >
            <IconComponent size={24} />
            <span style={{ fontSize: '11px', fontWeight: '600' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
