import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useContext } from 'react';
import { ChevronDown, User } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';

export default function HomeHeader({ delayMission = false, className = '' }) {
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
  const [missionExpanded, setMissionExpanded] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const accountButtonRef = useRef(null);

  // On Welcome page, display mission immediately (no delay needed now that header is pre-sized)
  useEffect(() => {
    setDisplayMission(true);
  }, []);

  // Measure actual header height and update CSS variable for dynamic spacing
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };

    // Measure on mount and after short delay (allow content to render)
    updateHeaderHeight();
    const timeoutId = setTimeout(updateHeaderHeight, 100);

    // Remeasure on window resize (handles responsive layout changes)
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close hamburger menu if clicking anywhere except the hamburger button or menu
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

      // Close account menu if clicking anywhere except the button or menu
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
  }, [menuOpen, accountMenuOpen]);

  const handleMenuClick = (path) => {
    navigate(path, { state: location.state });
    setMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
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
        .mission-label-mobile {
          display: none;
        }
        .mission-expansion-container {
          display: none;
        }
        .logo-desktop {
          display: block;
        }
        .logo-mobile-mark {
          display: none !important;
        }
        .account-button-mobile {
          display: none;
        }
        .account-menu-mobile {
          display: none;
        }
        @media (max-width: 768px) {
          .header-container {
            min-height: auto;
            padding: 2px clamp(12px, 3vw, 20px);
          }
          .hamburger-button {
            display: none !important;
          }
          .desktop-nav {
            display: none;
          }
          .menu-dropdown {
            display: none !important;
          }
          .mission-container-mobile {
            display: none;
          }
          .mission-container > div:not(.mission-label-mobile) {
            display: none !important;
          }
          .mission-label-mobile {
            display: flex !important;
            align-items: center;
            justify-content: center;
            flex: 0;
            min-width: 0;
            gap: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: #F08571;
            padding: 8px 12px;
            background: white;
            border: 2px solid #e5e5e5;
            border-radius: 8px;
            margin: 4px;
            width: fit-content;
          }
          .mission-expansion-container {
            display: block;
            position: fixed;
            top: calc(var(--header-height, 70px));
            left: 0;
            right: 0;
            width: 100%;
            padding: 16px;
            background: white;
            border-bottom: 1px solid #f0f0f0;
            z-index: 1000;
            box-sizing: border-box;
            max-height: calc(100vh - var(--header-height, 70px) - 70px);
            overflow-y: auto;
          }
          .mission-text-expanded {
            font-size: 14px;
            line-height: 1.5;
            color: #333;
          }
          .logo-mobile-mark {
            display: block !important;
            width: 40px;
            height: 40px;
            flex-shrink: 0;
          }
          .logo-desktop {
            display: none !important;
          }
          .account-button-mobile {
            display: flex;
            position: absolute;
            right: 56px;
            width: 36px;
            height: 36px;
            padding: 0;
            min-width: 36px;
            min-height: 36px;
            align-items: center;
            justify-content: center;
          }
          .account-menu-mobile {
            display: block;
            position: fixed;
            top: 69px;
            right: 0;
            backgroundColor: 'white';
            border: '1px solid #e5e5e5';
            borderLeft: '1px solid #e5e5e5';
            borderTop: 'none';
            borderRight: 'none';
            borderRadius: '0px';
            boxShadow: 'inset -1px 0 0 rgba(0, 0, 0, 0.06)';
            width: 'auto';
            minWidth: '140px';
            zIndex: 1000;
            maxHeight: 'calc(100vh - 100px)';
            overflowY: 'auto';
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
      {contextMission && contextShowInHeader && displayMission && (
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
              flex-wrap: wrap;
            }
            .mission-container > div:not(.mission-label-mobile) {
              max-width: calc(100% - 90px);
            }
            @media (max-width: 768px) {
              .mission-container {
                min-width: auto;
                flex: 0 0 auto;
              }
              .mission-container > div {
                max-width: 100%;
              }
            }
          `}</style>
          <button
            onClick={() => {
              const isMobile = window.innerWidth <= 768;
              if (isMobile) {
                setMissionExpanded(!missionExpanded);
              } else {
                navigate('/personal-operating-plan');
              }
            }}
            className="mission-container"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <div className="mission-label-mobile">
              Your Mission
            </div>
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
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#F08571'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e5e5'}
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
                <span style={{ color: '#F08571' }}>Your Mission:</span> <span style={{ fontWeight: '700', color: '#333' }}>{contextMission}</span>
              </div>
            </div>
          </button>
          {missionExpanded && (
            <div className="mission-expansion-container">
              <div className="mission-text-expanded">
                {contextMission}
              </div>
            </div>
          )}
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
                onClick={async () => {
                  // Fetch the latest mission to get its ID for the review page
                  try {
                    const { data: missionData } = await supabase
                      .from('missions')
                      .select('id')
                      .eq('user_id', user?.id)
                      .is('archived_at', null)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .single();

                    if (missionData) {
                      navigate('/personal-operating-plan-review', { state: { missionId: missionData.id } });
                    }
                  } catch (err) {
                    console.error('Error fetching mission:', err);
                  } finally {
                    setMenuOpen(false);
                    setJournalSubmenuOpen(false);
                  }
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
                Personal Operating Plan Review
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

          {(
            <button
              onClick={() => navigate('/my-account')}
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

          {user && (
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
          right: 'clamp(12px, 2vw, 16px)',
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
            className="logo-desktop"
            src="/clarity-logo.png"
            alt="The Clarity Project"
            style={{
              height: '100%',
              width: 'auto',
              opacity: 0.9,
            }}
          />
          <img
            className="logo-mobile-mark"
            src="/favicon.png"
            alt="Clarity"
            style={{
              height: '40px',
              width: '40px',
              opacity: 0.9,
            }}
          />
        </a>
      </div>

      {/* Mobile Account Menu Button */}
      <button
        ref={accountButtonRef}
        className="account-button-mobile"
        onClick={() => setAccountMenuOpen(!accountMenuOpen)}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#F08571',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.color = '#e07560'}
        onMouseLeave={(e) => e.target.style.color = '#F08571'}
      >
        <User size={20} />
      </button>

      {/* Mobile Account Menu Dropdown */}
      {accountMenuOpen && (
        <div
          ref={accountMenuRef}
          className="account-menu-mobile"
          style={{
            position: 'fixed',
            top: '69px',
            right: '0',
            backgroundColor: 'white',
            border: '1px solid #e5e5e5',
            borderLeft: '1px solid #e5e5e5',
            borderTop: 'none',
            borderRight: 'none',
            borderRadius: '0px',
            boxShadow: 'inset -1px 0 0 rgba(0, 0, 0, 0.06)',
            width: 'auto',
            minWidth: '140px',
            zIndex: 1000,
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
          }}
        >
          <button
            onClick={() => {
              navigate('/about', { state: location.state });
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
            onClick={() => {
              navigate('/my-account', { state: location.state });
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
            onClick={async () => {
              await logout();
              navigate('/');
              setAccountMenuOpen(false);
            }}
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
        </div>
      )}
    </div>
    </div>
  );
}
