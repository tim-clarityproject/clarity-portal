import { useCallback, useContext, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { MissionContext } from '../context/MissionContext';
import { AuthContext } from '../context/AuthContext';
import { BoldCrosshair, ChatButton } from './design';
import { useStartChat } from './coach/startChat';
import { useActivePlan } from '../lib/performance/hooks';
import { SiteDesktopMenu } from './SiteMenu';
import PlanMissionPanel from './PlanMissionPanel';

// The header (approved Home mock-up M2, version 3; decisions "Header").
//
// Desktop: the bold crosshair on the left is the menu button (it opens
// M3's menu and turns 45 degrees while it is open), M2's My Mission pill
// in the middle, and Chat to [coach's first name] on the right. No logo.
// Phone: M2's full-width My Mission pill. The menu is the phone bar's
// centre button (SitePhoneNav), so the phone header has no menu button.
//
// The pill (Phase 4, step 3, the decisions on the Mission pill): nothing
// is ever cut off with "…". The mission shows on up to two lines; when it
// needs more, or on the narrowest phones (under 360px), the pill shows
// "My Mission" alone. Either way, tapping it opens the full text: the My
// Mission panel (M1 mpanel) for someone with an Individual Performance
// Plan, the old mission's fold on phone and its plan page on desktop for
// someone without one. With no mission it reads "Add your mission when
// you're ready" in grey and opens the mission step of the new plan
// (/performance-plan/build?step=mission), never the old Personal
// Operating Plan page.
//
// The notch: the top bar sits inside the phone's safe area (decisions
// part 4, 30 Oct): the top inset is added here, and the sides' insets by
// src/pwa-standalone.css on every touch screen. As a Home Screen app the
// whole page already starts below the top inset, so it isn't added twice.
const NO_MISSION = 'Add your mission when you’re ready';
export const MISSION_STEP = '/performance-plan/build?step=mission';

// Whether the mission fits on two lines in the pill, measured as it is
// laid out. When the window changes it is shown again and measured again
// before the screen is drawn, so nothing flickers.
function useFitsTwoLines(ref) {
  const [check, setCheck] = useState({ fits: true, n: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !check.fits) return;
    const cs = getComputedStyle(el);
    const line = Number.parseFloat(cs.lineHeight) || 0;
    const words = el.scrollHeight - (Number.parseFloat(cs.paddingTop) || 0) - (Number.parseFloat(cs.paddingBottom) || 0);
    const ok = el.scrollWidth <= el.clientWidth + 1 && (!line || words <= line * 2 + 1);
    if (!ok) setCheck((c) => ({ ...c, fits: false }));
  }, [ref, check]);
  useEffect(() => {
    let live = true;
    const again = () => { if (live) setCheck((c) => ({ fits: true, n: c.n + 1 })); };
    window.addEventListener('resize', again);
    document.fonts?.ready?.then(again);
    return () => {
      live = false;
      window.removeEventListener('resize', again);
    };
  }, []);
  return check.fits;
}

// The pill's label and words. `none`: no mission yet.
function PillWords({ text, none }) {
  const ref = useRef(null);
  const fits = useFitsTwoLines(ref);
  return (
    <>
      <span className="hdr-mis-label">My Mission</span>
      <span ref={ref} className={`hdr-mis-text${fits ? '' : ' hdr-mis-text--long'}`} aria-hidden={!fits && !none ? 'true' : undefined}>
        {text}
      </span>
      {!fits && !none && <span className="ds-sr">, open to read it in full</span>}
    </>
  );
}

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
  const closeMenu = useCallback(() => setMenuOpen(false), []);
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

  // Edit mission on the old mission's fold: My Account's mission section.
  const openEditMission = () => {
    setExpandedPanel(false);
    navigate('/my-account', {
      state: { ...location.state, scrollTo: 'mission-section', openEditMission: true },
    });
  };
  // No mission yet: the mission step of the new plan.
  const openMissionStep = () => {
    setExpandedPanel(false);
    navigate(MISSION_STEP);
  };

  const showPill = showInHeader;
  const hasMission = Boolean(mission);

  return (
    <div className={`ui-root ${className}`.trim()}>
      <style>{`
        .ui-root .hdr {
          position: relative;
          background: var(--bg);
          padding-top: env(safe-area-inset-top, 0px);
        }
        /* A Home Screen app: the page already starts below the top inset
           (src/pwa-standalone.css). */
        @media (display-mode: standalone) and (pointer: coarse) {
          .ui-root .hdr {
            padding-top: 0;
          }
        }

        /* M2's My Mission pill: the solid surface pill, no outline, a small
           "My Mission" label in Nekst capitals (no crosshair), then the
           mission on up to two lines, never cut short with "…". */
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
          flex: 1 1 auto;
          min-width: 0;
          padding: var(--space-px6) 0;
          font-size: var(--fs-note) !important;
          line-height: var(--lh-text);
          white-space: normal;
          overflow-wrap: normal;
          text-align: right;
          text-wrap: balance;
        }
        /* Too long for two lines: "My Mission" alone. */
        .ui-root .hdr-mis-text--long {
          display: none;
        }
        .ui-root .hdr-mis--none .hdr-mis-text {
          color: var(--placeholder);
        }
        /* The narrowest phones: "My Mission" alone, or with no mission
           the grey words alone. */
        @media (max-width: 359px) {
          .ui-root .hdr-mis:not(.hdr-mis--none) .hdr-mis-text {
            display: none;
          }
          .ui-root .hdr-mis--none .hdr-mis-label {
            display: none;
          }
          .ui-root .hdr-mis--none .hdr-mis-text {
            text-align: left;
          }
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
            max-width: min(100%, var(--mission-pill-max));
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
                onClick={hasMission ? openPlanPanel : openMissionStep}
                aria-haspopup={hasMission ? 'dialog' : undefined}
              >
                <PillWords key={hasMission ? mission : ''} text={hasMission ? mission : NO_MISSION} none={!hasMission} />
              </button>
            ) : hasMission ? (
              <div className={`hdr-mis-card${expandedPanel ? ' open' : ''}`}>
                <button
                  type="button"
                  className="hdr-mis"
                  onClick={() => setExpandedPanel(!expandedPanel)}
                  aria-expanded={expandedPanel}
                >
                  <PillWords key={mission} text={mission} />
                </button>
                <div className={`hdr-mis-panel${expandedPanel ? ' open' : ''}`}>
                  <div className="hdr-mis-panel-inner" inert={!expandedPanel}>
                    <div className="hdr-mis-full">
                      <p>{mission}</p>
                      <button type="button" className="ds-link" onClick={openEditMission}>
                        Edit mission
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className="hdr-mis hdr-mis--none" onClick={openMissionStep}>
                <PillWords text={NO_MISSION} none />
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
            aria-controls="site-menu"
          >
            <BoldCrosshair />
          </button>

          {showPill ? (
            <button
              type="button"
              className={`hdr-mis${hasMission ? '' : ' hdr-mis--none'}`}
              onClick={!hasMission ? openMissionStep : activePlan ? openPlanPanel : () => navigate('/personal-operating-plan')}
              aria-haspopup={activePlan && hasMission ? 'dialog' : undefined}
            >
              <PillWords key={hasMission ? mission : ''} text={hasMission ? mission : NO_MISSION} none={!hasMission} />
            </button>
          ) : <span />}

          <span className="hdr-chat">
            {startChat && <ChatButton onClick={startChat} />}
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

      {/* The menu (M3), opened by the bold crosshair above */}
      <SiteDesktopMenu
        open={menuOpen}
        onClose={closeMenu}
        top={headerHeight}
        buttonRef={menuRef}
      />
    </div>
  );
}
