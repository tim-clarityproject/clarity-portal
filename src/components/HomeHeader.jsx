import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useContext } from 'react';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import BreathingGuide from './BreathingGuide';

export default function HomeHeader({ isGuest = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [decisionsSubmenuOpen, setDecisionsSubmenuOpen] = useState(false);
  const [journalSubmenuOpen, setJournalSubmenuOpen] = useState(false);
  const [showBreathingGuide, setShowBreathingGuide] = useState(false);
  const headerRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);

  // Show breathing guide on mount or after 2 hours
  useEffect(() => {
    const lastBreathingTime = localStorage.getItem('lastBreathingGuideTime');
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;

    if (!lastBreathingTime || now - parseInt(lastBreathingTime) > twoHours) {
      setShowBreathingGuide(true);
      localStorage.setItem('lastBreathingGuideTime', now.toString());
    }
  }, []);

  const handleCloseBreathingGuide = () => {
    setShowBreathingGuide(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close menu if clicking anywhere except the hamburger button or menu
      if (
        menuOpen &&
        hamburgerRef.current &&
        menuRef.current &&
        !hamburgerRef.current.contains(event.target) &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
        setDecisionsSubmenuOpen(false);
        setJournalSubmenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = (path) => {
    navigate(path, { state: location.state });
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setMenuOpen(false);
  };

  const handleCreateAccount = () => {
    navigate('/create-account', { state: location.state });
    setMenuOpen(false);
  };

  return (
    <div
      ref={headerRef}
      style={{
        padding: '0px 32px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      {/* Hamburger Menu */}
      <button
        ref={hamburgerRef}
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          color: '#F08571',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.color = '#e07560'}
        onMouseLeave={(e) => e.target.style.color = '#F08571'}
      >
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
      </button>

      {/* Menu Dropdown */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            backgroundColor: 'white',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            width: '180px',
            zIndex: 1000,
          }}
        >
          <button
            onClick={() => handleMenuClick('/welcome')}
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
            Home
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setDecisionsSubmenuOpen(!decisionsSubmenuOpen);
              if (!decisionsSubmenuOpen) {
                setJournalSubmenuOpen(false);
              }
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Decide
            <ChevronDown size={16} style={{ transform: decisionsSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {decisionsSubmenuOpen && (
            <>
              <button
                onClick={() => {
                  navigate('/decision-tools', { state: location.state });
                  setMenuOpen(false);
                  setDecisionsSubmenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#666',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Decision Tools
              </button>
              <button
                onClick={() => {
                  navigate('/decision-history', { state: location.state });
                  setMenuOpen(false);
                  setDecisionsSubmenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#666',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                My Decisions
              </button>
            </>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setJournalSubmenuOpen(!journalSubmenuOpen);
              if (!journalSubmenuOpen) {
                setDecisionsSubmenuOpen(false);
              }
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '24px',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Review
            <ChevronDown size={16} style={{ transform: journalSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
          </button>

          {journalSubmenuOpen && (
            <>
              <button
                onClick={() => {
                  navigate('/my-journal', { state: { ...location.state, reviewType: 'after-action' } });
                  setMenuOpen(false);
                  setJournalSubmenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#666',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                After Action Review
              </button>
              <button
                onClick={() => {
                  navigate('/my-journal', { state: { ...location.state, reviewType: 'progress' } });
                  setMenuOpen(false);
                  setJournalSubmenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#666',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Progress Review
              </button>
              <button
                onClick={() => {
                  navigate('/my-reviews', { state: location.state });
                  setMenuOpen(false);
                  setJournalSubmenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#666',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'backgroundColor 0.2s',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                My Reviews
              </button>
            </>
          )}

          {isGuest && (
            <button
              onClick={handleCreateAccount}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#5ECCC0',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'backgroundColor 0.2s',
                borderBottom: '1px solid #f0f0f0',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#E8F8F6'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Create Account
            </button>
          )}

          {!isGuest && (
            <button
              onClick={() => navigate('/my-account', { state: { ...location.state, isGuest } })}
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
          )}

          {!isGuest && (
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
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#FEE5DE'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Log Out
            </button>
          )}
        </div>
      )}

      <div
        onClick={() => setMenuOpen(false)}
        style={{
          color: '#999',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
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
            marginLeft: '-12px',
          }}
          onMouseEnter={(e) => e.target.style.opacity = '1'}
          onMouseLeave={(e) => e.target.style.opacity = '0.9'}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src="/clarity-logo.png"
            alt="The Clarity Project"
            style={{
              height: '67px',
              width: 'auto',
              display: 'block',
              opacity: 0.9,
            }}
          />
        </a>
      </div>

      <BreathingGuide isOpen={showBreathingGuide} onClose={handleCloseBreathingGuide} />
    </div>
  );
}
