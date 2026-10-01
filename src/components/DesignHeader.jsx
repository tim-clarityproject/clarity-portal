import { useContext, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { MissionContext } from '../context/MissionContext';
import DesktopMenuDropdown from './DesktopMenuDropdown';

export default function DesignHeader({ className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mission, showInHeader } = useContext(MissionContext);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerWrapperRef = useRef(null);
  const hamburgerRef = useRef(null);
  const menuRef = useRef(null);

  // Measure the phone header (row + line) so the scrim can start exactly below it
  useLayoutEffect(() => {
    const measure = () => {
      if (headerWrapperRef.current) {
        setHeaderHeight(headerWrapperRef.current.getBoundingClientRect().height);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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

  // Stop the page behind from scrolling while the panel is open
  useEffect(() => {
    if (expandedPanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
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
          .design-header-wrapper {
            position: relative;
            z-index: 5002;
          }
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
          .mis-slot {
            flex: 1;
            position: relative;
            height: 36px;
          }
          .design-mis {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 36px;
            border: 1px solid var(--coral);
            border-radius: 999px;
            overflow: hidden;
            background: var(--bg);
            transition: border-radius var(--dur) var(--ease);
          }
          .design-mis.open {
            height: auto;
            border-radius: 26px;
          }
          .mis-trigger {
            display: flex;
            width: 100%;
            height: 36px;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 0;
            border: none;
            background: transparent;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            font: inherit;
            color: inherit;
          }
          .mis-trigger:focus-visible {
            outline: 2px solid var(--text);
            outline-offset: -4px;
          }
          .mis-trigger-text {
            font-family: var(--font-display);
            font-weight: 400;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            line-height: 15px;
            color: var(--text);
            padding-left: 0.16em;
          }
          .mis-panel-outer {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows var(--dur) var(--ease);
          }
          .mis-panel-outer.open {
            grid-template-rows: 1fr;
          }
          .mis-panel-inner {
            min-height: 0;
            overflow: hidden;
          }
          .mis-panel-content {
            border-top: 1px solid var(--line);
            margin: 0 18px;
            opacity: 0;
            transform: translateY(-4px);
            transition: opacity var(--dur) var(--ease) 120ms, transform var(--dur) var(--ease) 120ms;
          }
          .mis-panel-outer.open .mis-panel-content {
            opacity: 1;
            transform: none;
          }
          .mis-statement {
            font-family: var(--font-body);
            font-size: 18px;
            line-height: 1.5;
            color: var(--text);
            text-align: center;
            padding: 18px 4px 6px;
          }
          .mis-edit-button {
            display: block;
            width: 100%;
            margin: 0;
            border: none;
            background: transparent;
            padding: 8px 0 16px;
            padding-left: 0.2em;
            font-family: var(--font-display);
            font-weight: 400;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: var(--coral);
            text-align: center;
            cursor: pointer;
          }
          .design-header-line {
            margin: 18px 20px 0;
            height: 1px;
            background: var(--line);
          }
          .design-header-desktop {
            display: none;
          }
          .design-scrim {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--scrim);
            z-index: 5001;
            animation: ui-scrim-fade var(--dur) var(--ease) forwards;
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
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
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
            display: inline-flex;
            align-items: center;
            gap: 20px;
            min-height: 50px;
            padding: 0 30px;
            width: max-content;
            min-width: 300px;
            max-width: calc(100vw - 200px);
            border: 1px solid var(--coral);
            border-radius: 999px;
            background: transparent;
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
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: var(--coral);
            white-space: nowrap;
            padding-right: 20px;
            border-right: 1px solid var(--line);
            line-height: 50px;
            flex-shrink: 0;
          }
          .design-header-desktop .mission-statement {
            font-family: var(--font-body);
            font-size: 15px;
            color: var(--text);
            letter-spacing: 0;
            text-transform: none;
            line-height: 1.3;
            white-space: normal;
            flex: 1;
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
      `}</style>

      <div className="design-header-wrapper" ref={headerWrapperRef}>
        {/* PHONE HEADER */}
        <div className="design-header-phone">
          <img
            className="logo-mark"
            src="/brand/mark_colour-on-dark.png"
            alt="Clarity mark"
          />
          {shouldShowPill && (
            <div className="mis-slot">
              <div className={`design-mis${expandedPanel ? ' open' : ''}`}>
                <button
                  type="button"
                  className="mis-trigger"
                  onClick={() => setExpandedPanel(!expandedPanel)}
                  aria-expanded={expandedPanel}
                >
                  <span className="mis-trigger-text">YOUR MISSION</span>
                </button>
                <div className={`mis-panel-outer${expandedPanel ? ' open' : ''}`}>
                  <div className="mis-panel-inner">
                    <div className="mis-panel-content">
                      <div className="mis-statement">{mission}</div>
                      <button
                        type="button"
                        className="mis-edit-button"
                        onClick={handleEditMission}
                      >
                        Edit mission
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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

      {/* Full-screen scrim behind the open phone panel - portaled to document.body
          so no ancestor (padding, transform, overflow, stacking context) can
          constrain its position: fixed edges. Position/size come from the
          .design-scrim class (not inline style) because a pre-existing global
          rule in src/styles/mobile.css - div[style*="position: fixed"] { left:
          16px !important; right: 16px !important; ... } - matches and overrides
          ANY div with "position: fixed" literally inside its inline style
          attribute. Using a class avoids that match entirely without touching
          the global file. */}
      {expandedPanel && shouldShowPill && createPortal(
        <div className="ui-root">
          <div
            className="design-scrim"
            onClick={handleScrimClick}
            style={{ top: `${headerHeight}px` }}
          />
        </div>,
        document.body
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
