import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useContext } from 'react';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';

export default function HomeHeader({ isGuest = false, delayMission = false, className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const { mission: contextMission, showInHeader: contextShowInHeader } = useContext(MissionContext);
  const [displayMission, setDisplayMission] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [decisionsSubmenuOpen, setDecisionsSubmenuOpen] = useState(false);
  const [journalSubmenuOpen, setJournalSubmenuOpen] = useState(false);
  const [planSubmenuOpen, setPlanSubmenuOpen] = useState(false);
  const [groundSubmenuOpen, setGroundSubmenuOpen] = useState(false);
  const headerRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);

  // On Welcome page, display mission immediately (no delay needed now that header is pre-sized)
  useEffect(() => {
    setDisplayMission(true);
  }, []);

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
        setGroundSubmenuOpen(false);
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
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        .header-container {
          padding: clamp(12px, 2vw, 16px) clamp(16px, 3vw, 32px);
          min-height: 120px;
          box-sizing: border-box;
        }
        .hamburger-button {
          display: flex;
          padding: 8px;
          min-width: auto;
          min-height: auto;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .desktop-nav {
          display: none;
          gap: 0;
          align-items: center;
          flex: 1;
        }
        .desktop-nav-item {
          padding: 8px 12px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.2s;
        }
        .desktop-nav-item:hover {
          color: #F08571 !important;
        }
        .menu-dropdown {
          width: 300px;
          max-width: calc(100% - 64px);
          left: auto;
          display: none;
        }
        @media (max-width: 768px) {
          .hamburger-button {
            display: flex;
            padding: 12px;
            min-width: 44px;
            min-height: 44px;
          }
          .desktop-nav {
            display: none;
          }
          .menu-dropdown {
            display: block;
            width: calc(100% - 32px);
            max-width: none;
            left: 16px;
          }
          .mission-container-mobile {
            display: none;
          }
        }
      `}</style>

      <div
        ref={headerRef}
        className="header-container"
        style={{
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          zIndex: 2000,
          backgroundColor: 'white',
          boxSizing: 'border-box',
        }}
      >
      {/* Hamburger Menu */}
      <button
        ref={hamburgerRef}
        className="hamburger-button"
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#F08571',
          flexDirection: 'column',
          gap: '4px',
          transition: 'color 0.2s',
          position: 'absolute',
          left: 'clamp(12px, 2vw, 16px)',
          zIndex: 100,
        }}
        onMouseEnter={(e) => e.target.style.color = '#e07560'}
        onMouseLeave={(e) => e.target.style.color = '#F08571'}
      >
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
      </button>

      {/* Desktop Navigation */}
      <div className="desktop-nav">
        <button onClick={() => handleMenuClick('/welcome')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>Home</button>
        <button onClick={() => handleMenuClick('/my-plans')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>Plan</button>
        <button onClick={() => handleMenuClick('/decision-history')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>Decide</button>
        <button onClick={() => handleMenuClick('/breathe')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>Ground</button>
        <button onClick={() => handleMenuClick('/my-reviews')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>Review</button>
        <button onClick={() => handleMenuClick('/about')} className="desktop-nav-item" style={{ backgroundColor: 'transparent', border: 'none', color: '#333' }}>About</button>
      </div>

      {/* Center Mission Display - Responsive Flex Item */}
      {(contextMission || isGuest) && (contextShowInHeader || isGuest) && displayMission && location.pathname !== '/personal-operating-plan' && (
        <>
          <style>{`
            @keyframes fadeInMission {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            .mission-container {
              display: flex;
              justify-content: center;
              min-width: 0;
              animation: fadeInMission 0.8s ease-in-out;
              padding: 0 clamp(8px, 1.5vw, 16px);
            }
            .mission-container > div {
              max-width: calc(100% - 90px);
            }
          `}</style>
          <button
            onClick={() => !isGuest && navigate('/personal-operating-plan', { state: { isGuest } })}
            className="mission-container"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isGuest ? 'default' : 'pointer',
              padding: 0,
            }}
          >
            <div style={{
              background: 'white',
              paddingTop: 'clamp(16px, 2.5vw, 20px)',
              paddingBottom: 'clamp(16px, 2.5vw, 20px)',
              paddingLeft: 'clamp(12px, 2vw, 24px)',
              paddingRight: 'clamp(12px, 2vw, 24px)',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
              maxWidth: '100%',
              minWidth: 0,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !isGuest && (e.currentTarget.style.borderColor = '#F08571')}
            onMouseLeave={(e) => !isGuest && (e.currentTarget.style.borderColor = '#e5e5e5')}
            >
              <div style={{
                fontSize: 'clamp(12px, 1.6vw, 16px)',
                fontWeight: '600',
                lineHeight: '1.4',
                letterSpacing: '0.2px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}>
                <span style={{ color: '#F08571' }}>Your Mission:</span> <span style={{ fontWeight: '700', color: '#333' }}>{isGuest ? 'Build something remarkable for the world' : contextMission}</span>
              </div>
            </div>
          </button>
        </>
      )}

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="menu-dropdown"
          style={{
            position: 'fixed',
            top: '69px',
            left: '0',
            backgroundColor: 'white',
            border: '1px solid #e5e5e5',
            borderLeft: 'none',
            borderTop: 'none',
            borderRadius: '0px',
            boxShadow: 'inset 1px 0 0 rgba(0, 0, 0, 0.06)',
            width: '300px',
            zIndex: 1000,
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
            display: 'block',
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
            onClick={() => {
              navigate('/about', { state: location.state });
              setMenuOpen(false);
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
            onClick={(e) => {
              e.stopPropagation();
              setPlanSubmenuOpen(!planSubmenuOpen);
              if (!planSubmenuOpen) {
                setDecisionsSubmenuOpen(false);
                setJournalSubmenuOpen(false);
                setGroundSubmenuOpen(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderLeft: '3px solid #F08571',
              backgroundColor: '#fafafa',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
          >
            Plan
            <ChevronDown size={16} style={{ transform: planSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {planSubmenuOpen && (
            <>
              <button
                onClick={() => {
                  navigate('/personal-operating-plan', { state: location.state });
                  setMenuOpen(false);
                  setPlanSubmenuOpen(false);
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
                Personal Operating Plan
              </button>
              <button
                onClick={() => {
                  navigate('/plan-my-day', { state: location.state });
                  setMenuOpen(false);
                  setPlanSubmenuOpen(false);
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
                Daily Intentions
              </button>
              <button
                onClick={() => {
                  navigate('/plan-meeting', { state: location.state });
                  setMenuOpen(false);
                  setPlanSubmenuOpen(false);
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
                Meeting Planner
              </button>
              <button
                onClick={() => {
                  navigate('/my-plans', { state: location.state });
                  setMenuOpen(false);
                  setPlanSubmenuOpen(false);
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
                My Plans
              </button>
            </>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setGroundSubmenuOpen(!groundSubmenuOpen);
              if (!groundSubmenuOpen) {
                setDecisionsSubmenuOpen(false);
                setJournalSubmenuOpen(false);
                setPlanSubmenuOpen(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderLeft: '3px solid #F08571',
              backgroundColor: '#fafafa',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
          >
            Ground
            <ChevronDown size={16} style={{ transform: groundSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {groundSubmenuOpen && (
            <>
              <button
                onClick={() => {
                  navigate('/if-then-planning', { state: location.state });
                  setMenuOpen(false);
                  setGroundSubmenuOpen(false);
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
                If-Then Planning
              </button>
              <button
                onClick={() => {
                  navigate('/breathe', { state: location.state });
                  setMenuOpen(false);
                  setGroundSubmenuOpen(false);
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
                Breathe
              </button>
            </>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setDecisionsSubmenuOpen(!decisionsSubmenuOpen);
              if (!decisionsSubmenuOpen) {
                setJournalSubmenuOpen(false);
                setPlanSubmenuOpen(false);
                setGroundSubmenuOpen(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderLeft: '3px solid #F08571',
              backgroundColor: '#fafafa',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
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
                setPlanSubmenuOpen(false);
                setGroundSubmenuOpen(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderLeft: '3px solid #F08571',
              backgroundColor: '#fafafa',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
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
                After-Action Review
              </button>
              <button
                onClick={() => {
                  navigate('/my-journal', { state: { ...location.state, reviewType: 'weekly-momentum' } });
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
                Weekly Momentum Review
              </button>
              <button
                onClick={() => {
                  navigate('/personal-operating-plan-review', { state: location.state });
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
                I want to review my mission progress
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

          {!isGuest && user && (
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
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
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
          position: 'absolute',
          right: '16px',
          minWidth: 0,
        }}
      >
        <a
          href="https://theclarityproject.co.uk/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            height: 'clamp(45px, 7vw, 60px)',
          }}
          onMouseEnter={(e) => e.target.style.opacity = '1'}
          onMouseLeave={(e) => e.target.style.opacity = '0.85'}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src="/clarity-logo.png"
            alt="The Clarity Project"
            style={{
              height: '100%',
              width: 'auto',
              display: 'block',
              opacity: 0.9,
            }}
          />
        </a>
      </div>
    </div>
    </div>
  );
}
