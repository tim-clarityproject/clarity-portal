import { useContext, useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MissionContext } from '../context/MissionContext';
import DesktopMenuDropdown from './DesktopMenuDropdown';

export default function DesignHeader({ className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mission, showInHeader } = useContext(MissionContext);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef(null);
  const scrimRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);

  // Close panel on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && expandedPanel) {
        setExpandedPanel(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [expandedPanel]);

  // Close desktop menu when clicking outside it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuOpen &&
        hamburgerRef.current &&
        menuRef.current &&
        !hamburgerRef.current.contains(event.target) &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  // Close panel when clicking scrim
  const handleScrimClick = () => {
    setExpandedPanel(false);
  };

  // Navigate to My Account Mission section and open Edit Mission
  const handleEditMission = () => {
    setExpandedPanel(false);
    navigate('/my-account', {
      state: { ...location.state, scrollTo: 'mission-section', openEditMission: true }
    });
  };

  // Desktop pill click: go to Personal Operating Plan, no pop-up
  const handleDesktopPillClick = () => {
    navigate('/personal-operating-plan');
  };

  const shouldShowPill = mission && showInHeader;

  return (
    <div className={`ui-root ${className}`.trim()} style={{
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      <style>{`
        .design-header-wrapper {
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 768px) {
          .design-header-phone {
            display: flex;
            padding: 24px 20px 0;
            gap: 14px;
            align-items: center;
            background: var(--bg);
          }
          .design-header-phone .logo-mark {
            width: 30px;
            height: 30px;
            flex-shrink: 0;
          }
          .design-header-phone .mission-pill {
            flex: 1;
            border: 1px solid var(--coral);
            border-radius: 999px;
            background: transparent;
            padding: 11px 0 10px;
            cursor: pointer;
            text-align: center;
          }
          .design-header-phone .mission-pill-text {
            font-family: var(--font-display);
            font-weight: 400;
            font-size: var(--fs-label);
            text-transform: uppercase;
            letter-spacing: 0.16em;
            line-height: 1.3;
            color: var(--text);
            padding-left: 0.16em;
          }
          .design-header-line {
            margin: 18px 20px 0;
            height: 1px;
            background: var(--line);
          }
          .design-header-desktop {
            display: none;
          }
        }

        @media (min-width: 769px) {
          .design-header-phone {
            display: none;
          }
          .design-header-line {
            display: none;
          }
          .design-header-desktop {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            height: 79px;
            padding: 0 32px;
            align-items: center;
            background: var(--bg);
          }
          .design-header-desktop .hamburger {
            justify-self: start;
            display: flex;
            flex-direction: column;
            gap: 4.5px;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 0;
          }
          .design-header-desktop .hamburger-line {
            width: 22px;
            height: 1.5px;
            background: var(--coral);
          }
          .design-header-desktop .mission-pill-desktop {
            justify-self: center;
            width: fit-content;
            min-width: 380px;
            max-width: calc(100% - 160px);
            border: 1px solid var(--coral);
            border-radius: 999px;
            background: transparent;
            padding: 0 24px;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: border-color var(--dur-fast) var(--ease);
          }
          .design-header-desktop .mission-pill-desktop:hover {
            border-color: var(--coral-soft);
          }
          .design-header-desktop .mission-pill-desktop:focus-visible {
            outline: 2px solid var(--coral);
            outline-offset: 2px;
          }
          .design-header-desktop .mission-pill-text {
            font-family: var(--font-display);
            font-weight: 400;
            font-size: var(--fs-label);
            text-transform: uppercase;
            letter-spacing: 0.16em;
            line-height: 1.3;
            color: var(--text);
            white-space: nowrap;
            flex-shrink: 0;
          }
          .design-header-desktop .mission-divider {
            width: 1px;
            height: 16px;
            background: var(--line);
            margin: 0 16px;
            flex-shrink: 0;
          }
          .design-header-desktop .mission-statement {
            font-family: var(--font-body);
            font-size: 15px;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            min-width: 0;
            text-align: center;
          }
          .design-header-desktop .logo-mark-desktop {
            justify-self: end;
            width: 34px;
            height: 34px;
            flex-shrink: 0;
          }
          .design-header-line-desktop {
            height: 1px;
            background: var(--line);
            width: 100%;
          }
        }

        @keyframes ui-scrim-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes ui-panel-expand {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="design-header-wrapper">
        {/* PHONE HEADER */}
        <div className="design-header-phone">
          <img
            className="logo-mark"
            src="/brand/mark_colour-on-dark.png"
            alt="Clarity mark"
          />
          {shouldShowPill && (
            <button
              className="mission-pill"
              onClick={() => setExpandedPanel(!expandedPanel)}
              aria-expanded={expandedPanel}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <div className="mission-pill-text">YOUR MISSION</div>
            </button>
          )}
        </div>

        {/* Phone header line */}
        {shouldShowPill && <div className="design-header-line" />}

        {/* DESKTOP HEADER */}
        <div className="design-header-desktop">
          {/* Hamburger - opens the existing desktop menu */}
          <button
            ref={hamburgerRef}
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
          >
            <div className="hamburger-line" />
            <div className="hamburger-line" />
            <div className="hamburger-line" />
          </button>

          {/* Mission pill */}
          {shouldShowPill && (
            <button
              type="button"
              className="mission-pill-desktop"
              onClick={handleDesktopPillClick}
            >
              <div className="mission-pill-text">YOUR MISSION</div>
              <div className="mission-divider" />
              <div className="mission-statement">{mission}</div>
            </button>
          )}

          {/* Logo mark */}
          <img
            className="logo-mark-desktop"
            src="/brand/mark_colour-on-dark.png"
            alt="The Clarity Project"
          />
        </div>

        {/* Desktop header line */}
        <div className="design-header-line-desktop" />
      </div>

      {/* Phone expanded panel */}
      {expandedPanel && shouldShowPill && (
        <>
          {/* Scrim */}
          <div
            ref={scrimRef}
            onClick={handleScrimClick}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--scrim)',
              zIndex: 999,
              animation: 'ui-scrim-fade var(--dur) var(--ease) forwards',
            }}
          />

          {/* Expanded panel */}
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              background: 'var(--bg)',
              border: '1px solid var(--coral)',
              borderRadius: '26px',
              padding: '16px',
              zIndex: 1000,
              marginTop: '100px',
              marginLeft: '20px',
              marginRight: '20px',
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'auto',
              animation: 'ui-panel-expand var(--dur) var(--ease) forwards',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              lineHeight: 1.3,
              color: 'var(--text)',
              marginBottom: '16px',
              paddingLeft: '0.16em',
            }}>
              YOUR MISSION
            </div>

            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              color: 'var(--text)',
              lineHeight: 1.5,
              marginBottom: '16px',
              wordWrap: 'break-word',
            }}>
              {mission}
            </div>

            <button
              onClick={handleEditMission}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '10px',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: 'var(--coral)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Edit mission
            </button>
          </div>
        </>
      )}

      {/* Existing desktop menu, opened by the hamburger above */}
      <DesktopMenuDropdown
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        menuRef={menuRef}
      />
    </div>
  );
}
