import { useContext, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { MissionContext } from '../context/MissionContext';
import { AuthContext } from '../context/AuthContext';
import { BoldCrosshair, ChatButton } from './design';
import { useStartChat } from './coach/startChat';
import { useActivePlan } from '../lib/performance/hooks';
import DesignDrawer from './DesignDrawer';
import PlanMissionPanel from './PlanMissionPanel';

// The header (approved Home mock-up M2, version 3; decisions "Header").
//
// Desktop: the bold crosshair on the left is the menu button (it opens the
// drawer and turns 45 degrees while it is open), M2's My Mission pill in
// the middle, and Chat to [coach's first name] on the right. No logo.
// Phone: M2's full-width My Mission pill. The phone tab bar stays as it is
// until Phase 4, and everything in the drawer is reachable from it, so the
// phone header has no menu button.
//
// The pill opens what the mission bar opened before: the plan on desktop,
// the full mission with Edit mission on phone. With no mission it reads
// "Add your mission when you're ready" and opens the mission step in My
// Account.
//
// Someone with an Individual Performance Plan (Phase 2) sees the plan's
// mission instead, and the pill opens the My Mission panel (M1 mpanel) on
// desktop and phone. Everyone else keeps the pill as it was.
const NO_MISSION = 'Add your mission when you’re ready';

export default function DesignHeader({ className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const startChat = useStartChat();
  const { mission: oldMission, showInHeader } = useContext(MissionContext);
  const { user } = useContext(AuthContext);
  const activePlan = useActivePlan(user?.id).data;
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [planPanelUsed, setPlanPanelUsed] = useState(false);
  const mission = activePlan ? (activePlan.mission || '') : oldMission;
  const openPlanPanel = () => {
    setPlanPanelUsed(true);
    setPlanPanelOpen(true);
  };
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerWrapperRef = useRef(null);
  const menuRef = useRef(null);

  // Measure the header so the scrim and the drawer start exactly below it.
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

  // The phone mission panel closes when the window grows to desktop
  // width, so its scroll lock never outlives it.
  useEffect(() => {
    if (!expandedPanel) return undefined;
    const handleResize = () => {
      if (window.innerWidth > 768) setExpandedPanel(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [expandedPanel]);

  // Close the phone mission panel on Escape.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && expandedPanel) setExpandedPanel(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [expandedPanel]);

  // Stop the page behind from scrolling while the panel is open.
  useEffect(() => {
    if (expandedPanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [expandedPanel]);

  // My Account's mission section, with Edit mission open.
  const openMissionStep = () => {
    setExpandedPanel(false);
    navigate('/my-account', {
      state: { ...location.state, scrollTo: 'mission-section', openEditMission: true },
    });
  };

  const showPill = showInHeader;
  const hasMission = Boolean(mission);

  return (
    <div className={`ui-root ${className}`.trim()}>
      <style>{`
        .ui-root .hdr {
          position: relative;
          background: var(--bg);
        }

        /* M2's My Mission pill: the solid surface pill, no outline, a small
           "My Mission" label in Nekst capitals (no crosshair), then the
           mission, cut short with "…" when it doesn't fit. */
        .ui-root .hdr-mis {
          all: unset;
          cursor: pointer;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          min-width: 0;
          min-height: var(--box-min-h) !important;
          padding: 0 var(--space-px22) !important;
          border-radius: var(--radius-pill);
          background: var(--raised);
          color: var(--text);
          font-family: var(--font-body);
          letter-spacing: normal;
        }
        .ui-root .hdr-mis:focus-visible {
          outline: var(--focus-w) solid var(--text);
          outline-offset: var(--space-px3);
        }
        .ui-root .hdr-mis-label {
          flex: none;
          font-family: var(--font-display);
          font-weight: var(--fw-regular);
          font-size: var(--fs-glyph);
          text-transform: uppercase;
          letter-spacing: var(--ls-overline);
          line-height: 1;
          color: var(--text-2);
          white-space: nowrap;
        }
        .ui-root .hdr-mis-text {
          min-width: 0;
          font-size: var(--fs-note) !important;
          line-height: var(--lh-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: right;
        }
        .ui-root .hdr-mis--none .hdr-mis-text {
          color: var(--placeholder);
        }

        @media (max-width: 768px) {
          .ui-root .hdr {
            z-index: 5002;
          }
          .ui-root .hdr-desktop {
            display: none;
          }
          .ui-root .hdr-phone {
            padding: var(--space-px22) var(--space-px18) var(--space-px10);
          }
          .ui-root .hdr-mis-card {
            border-radius: var(--radius-pill);
            transition: border-radius var(--dur) var(--ease);
            background: var(--raised);
            overflow: hidden;
          }
          .ui-root .hdr-phone .hdr-mis {
            width: 100%;
          }
          .ui-root .hdr-mis-card .hdr-mis {
            background: transparent;
          }
          .ui-root .hdr-mis-card.open {
            border-radius: var(--radius-sheet-desktop);
          }
          .ui-root .hdr-mis-panel {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows var(--dur) var(--ease);
          }
          .ui-root .hdr-mis-panel.open {
            grid-template-rows: 1fr;
          }
          .ui-root .hdr-mis-panel-inner {
            min-height: 0;
            overflow: hidden;
          }
          .ui-root .hdr-mis-full {
            margin: 0 var(--space-px22);
            padding: var(--space-px6) 0 var(--space-px18);
            border-top: var(--line-w) solid var(--line);
          }
          .ui-root .hdr-mis-full p {
            margin: var(--space-px14) 0 0;
            font-size: var(--fs-statement);
            line-height: var(--lh-statement);
            color: var(--text);
          }
          .ui-root .hdr-scrim {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--scrim);
            z-index: 5001;
            animation: hdr-scrim-fade var(--dur) var(--ease) forwards;
          }
        }

        @media (min-width: 769px) {
          .ui-root .hdr {
            z-index: 5003;
          }
          .ui-root .hdr-phone {
            display: none;
          }
          .ui-root .hdr-desktop {
            display: grid;
            grid-template-columns: minmax(max-content, 1fr) minmax(0, max-content) minmax(max-content, 1fr);
            align-items: center;
            gap: var(--space-3);
            height: var(--header-h-desktop);
            padding: 0 var(--space-px28);
            border-bottom: var(--line-w) solid var(--line);
          }
          .ui-root .hdr-desktop .hdr-mis {
            justify-self: center;
            gap: var(--space-px28);
            min-height: var(--mission-pill-h) !important;
            max-width: 100%;
          }
          .ui-root .hdr-desktop .hdr-mis-text {
            font-size: var(--fs-secondary) !important;
          }
          .ui-root .hdr-menu {
            all: unset;
            cursor: pointer;
            justify-self: start;
            box-sizing: border-box;
            width: var(--tap-min);
            height: var(--tap-min);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-pill);
          }
          .ui-root .hdr-menu:focus-visible {
            outline: var(--focus-w) solid var(--text);
            outline-offset: var(--space-px3);
          }
          .ui-root .hdr-menu .ds-bold-cross {
            width: var(--bold-cross-menu);
            height: var(--bold-cross-menu);
            transition: transform var(--dur-slow) var(--ease);
          }
          .ui-root .hdr-menu[aria-expanded="true"] .ds-bold-cross {
            transform: rotate(45deg);
          }
          .ui-root .hdr-chat {
            justify-self: end;
          }
        }

        @keyframes hdr-scrim-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <div className="hdr" ref={headerWrapperRef}>
        {/* PHONE HEADER */}
        {showPill && (
          <div className="hdr-phone">
            {activePlan ? (
              <button
                type="button"
                className={`hdr-mis${hasMission ? '' : ' hdr-mis--none'}`}
                onClick={openPlanPanel}
                aria-haspopup="dialog"
              >
                <span className="hdr-mis-label">My Mission</span>
                <span className="hdr-mis-text">{hasMission ? mission : NO_MISSION}</span>
              </button>
            ) : hasMission ? (
              <div className={`hdr-mis-card${expandedPanel ? ' open' : ''}`}>
                <button
                  type="button"
                  className="hdr-mis"
                  onClick={() => setExpandedPanel(!expandedPanel)}
                  aria-expanded={expandedPanel}
                >
                  <span className="hdr-mis-label">My Mission</span>
                  <span className="hdr-mis-text">{mission}</span>
                </button>
                <div className={`hdr-mis-panel${expandedPanel ? ' open' : ''}`}>
                  <div className="hdr-mis-panel-inner" inert={!expandedPanel}>
                    <div className="hdr-mis-full">
                      <p>{mission}</p>
                      <button type="button" className="ds-link" onClick={openMissionStep}>
                        Edit mission
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="hdr-mis hdr-mis--none" onClick={openMissionStep}>
                <span className="hdr-mis-label">My Mission</span>
                <span className="hdr-mis-text">{NO_MISSION}</span>
              </button>
            )}
          </div>
        )}

        {/* DESKTOP HEADER */}
        <div className="hdr-desktop">
          <button
            ref={menuRef}
            type="button"
            className="hdr-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="design-drawer"
          >
            <BoldCrosshair />
          </button>

          {showPill ? (
            <button
              type="button"
              className={`hdr-mis${hasMission ? '' : ' hdr-mis--none'}`}
              onClick={activePlan ? openPlanPanel : hasMission ? () => navigate('/personal-operating-plan') : openMissionStep}
              aria-haspopup={activePlan ? 'dialog' : undefined}
            >
              <span className="hdr-mis-label">My Mission</span>
              <span className="hdr-mis-text">{hasMission ? mission : NO_MISSION}</span>
            </button>
          ) : <span />}

          <span className="hdr-chat">
            <ChatButton onClick={startChat} />
          </span>
        </div>
      </div>

      {/* The scrim behind the open phone panel, portaled to document.body
          so no ancestor can constrain its fixed edges. Its position lives
          in the .hdr-scrim class, never an inline "position: fixed",
          which a global rule in src/styles/mobile.css would override. */}
      {expandedPanel && showPill && createPortal(
        <div className="ui-root ds-portal">
          <div
            className="hdr-scrim"
            onClick={() => setExpandedPanel(false)}
            style={{ top: `${headerHeight}px` }}
          />
        </div>,
        document.body,
      )}

      {/* The My Mission panel, for someone with an Individual Performance Plan */}
      {activePlan && planPanelUsed && (
        <PlanMissionPanel open={planPanelOpen} onClose={() => setPlanPanelOpen(false)} />
      )}

      {/* The drawer, opened by the menu button above */}
      <DesignDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        headerHeight={headerHeight}
        burgerRef={menuRef}
      />
    </div>
  );
}
