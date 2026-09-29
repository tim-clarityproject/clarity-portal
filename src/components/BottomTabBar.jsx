import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useContext } from 'react';
import { Home, FileText, Compass, CheckSquare } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

export default function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountButtonRef = useRef(null);
  const accountMenuRef = useRef(null);

  const tabs = [
    { id: 'home', label: 'Home', path: '/welcome', icon: Home },
    { id: 'ground', label: 'Ground', path: '/ground-section', icon: Compass },
    { id: 'plan', label: 'Plan', path: '/plan-section', icon: FileText },
    { id: 'review', label: 'Review', path: '/review-section', icon: CheckSquare },
  ];

  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        accountMenuOpen &&
        accountButtonRef.current &&
        accountMenuRef.current &&
        !accountButtonRef.current.contains(event.target) &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [accountMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setAccountMenuOpen(false);
  };

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

      {/* Account Tab with Logo Mark Icon */}
      <button
        ref={accountButtonRef}
        onClick={() => setAccountMenuOpen(!accountMenuOpen)}
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
          color: accountMenuOpen ? '#F08571' : '#999',
          transition: 'color 0.2s',
        }}
      >
        <img
          src="/favicon.png"
          alt="Account"
          style={{
            width: '24px',
            height: '24px',
            opacity: accountMenuOpen ? 1 : 0.6,
            transition: 'opacity 0.2s',
          }}
        />
        <span style={{ fontSize: '11px', fontWeight: '600' }}>Account</span>
      </button>

      {/* Account Menu Dropdown - appears above tab bar */}
      {accountMenuOpen && (
        <div
          ref={accountMenuRef}
          style={{
            position: 'fixed',
            bottom: 'calc(60px + max(8px, env(safe-area-inset-bottom)))',
            right: '0',
            backgroundColor: 'white',
            border: '1px solid #e5e5e5',
            borderRight: 'none',
            borderBottom: '1px solid #e5e5e5',
            borderRadius: '8px 0 0 0',
            boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
            width: 'auto',
            minWidth: '160px',
            zIndex: 2000,
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
          }}
        >
          <button
            onClick={() => {
              navigate('/my-account');
              setAccountMenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#333',
              textAlign: 'left',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            My Account
          </button>

          <button
            onClick={() => {
              navigate('/about');
              setAccountMenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#333',
              textAlign: 'left',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            About
          </button>

          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#F08571',
              textAlign: 'left',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Log Out
          </button>

          <button
            onClick={() => {
              window.open('https://theclarityproject.co.uk/', '_blank');
              setAccountMenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#333',
              textAlign: 'left',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Visit Website
          </button>
        </div>
      )}
    </div>
  );
}
