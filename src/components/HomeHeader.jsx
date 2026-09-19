import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useContext } from 'react';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function HomeHeader({ isGuest = false, personalGoal: propGoal = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [decisionsSubmenuOpen, setDecisionsSubmenuOpen] = useState(false);
  const [journalSubmenuOpen, setJournalSubmenuOpen] = useState(false);
  const [planSubmenuOpen, setPlanSubmenuOpen] = useState(false);
  const [groundSubmenuOpen, setGroundSubmenuOpen] = useState(false);
  const [personalGoal, setPersonalGoal] = useState(propGoal);
  const headerRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (propGoal) {
      setPersonalGoal(propGoal);
      return;
    }

    if (user && !isGuest) {
      const fetchGoal = async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('personal_goal')
            .eq('id', user.id)
            .single();

          if (data?.personal_goal) {
            setPersonalGoal(data.personal_goal);
          }
        } catch (error) {
          console.error('Error fetching goal:', error);
        }
      };

      fetchGoal();
    }
  }, [user, isGuest, propGoal]);

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
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >

      <div
        ref={headerRef}
        style={{
          padding: '16px 32px',
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
          flexShrink: 0,
          zIndex: 100,
        }}
        onMouseEnter={(e) => e.target.style.color = '#e07560'}
        onMouseLeave={(e) => e.target.style.color = '#F08571'}
      >
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
        <div style={{ width: '24px', height: '2px', backgroundColor: 'currentColor' }} />
      </button>

      {/* Center Goal Display - Absolutely Positioned for True Centering */}
      {personalGoal && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(240, 133, 113, 0.05) 0%, rgba(240, 133, 113, 0.02) 100%)',
            padding: '12px 24px',
            borderRadius: '8px',
            border: '1px solid rgba(240, 133, 113, 0.1)',
            boxShadow: '0 2px 8px rgba(240, 133, 113, 0.08)',
            backdropFilter: 'blur(4px)',
            whiteSpace: 'nowrap',
            maxWidth: '60vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            <span style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#F08571',
              lineHeight: '1.5',
              letterSpacing: '0.3px',
            }}>
              Your Mission: <span style={{ fontWeight: '700', opacity: 0.95 }}>{personalGoal}</span>
            </span>
          </div>
        </div>
      )}

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
            Plan
            <ChevronDown size={16} style={{ transform: planSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          {planSubmenuOpen && (
            <>
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
                setPlanSubmenuOpen(false);
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
                After-Action Review
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
          flexShrink: 0,
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
    </div>
    </div>
  );
}
