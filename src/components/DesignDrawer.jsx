import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { findTodaysDailyPlan } from '../lib/planReview';

// Plan now absorbs the old Decide section. Each sub-link lists the extra
// routes that count as "current" for it (its own child/summary/step pages).
//
// Prompt 7c: Decision Tools/My Decisions removed from this list (reached
// via All Planning Tools and My Plans/My decisions now). Every decision
// tool's own step/summary pages (GROW, Inversion, Tough conversation,
// Stop doing audit, plus /decision-history and /decision-summary) now
// highlight My Plans, since there is no longer a single "Decision Tools"
// item for them to belong to - see build summary point 6. /decision-tools
// itself (the hub, reached FROM All Planning Tools) highlights that.
//
const SECTIONS = [
  {
    id: 'plan',
    label: 'Plan',
    links: [
      {
        label: 'Plan My Day',
        to: '/plan-my-day',
        childRoutes: ['/daily-plan-summary'],
      },
      {
        label: 'Plan a Meeting',
        to: '/plan-meeting',
        childRoutes: ['/meeting-summary'],
      },
      {
        label: 'My Personal Operating Plan',
        to: '/personal-operating-plan',
        childRoutes: [
          '/personal-operating-plan-edit',
          '/personal-operating-plan-review',
          '/personal-operating-plan-history',
          '/personal-operating-plan-archived',
          '/mission-progress-review',
        ],
      },
      {
        label: 'All Planning Tools',
        to: '/planning-tools',
        childRoutes: ['/decision-tools'],
      },
      {
        label: 'My Plans',
        to: '/my-plans',
        childRoutes: [
          '/decide-section',
          '/decision-history',
          '/decision-summary',
          '/grow-step-1',
          '/grow-step-2',
          '/grow-step-3',
          '/grow-step-3b-prioritize',
          '/grow-step-4',
          '/inversion-step-1',
          '/inversion-step-2',
          '/inversion-step-3',
          '/inversion-thinking-summary',
          '/tough-conversation-step-1',
          '/tough-conversation-step-2',
          '/tough-conversation-summary',
          '/stop-doing-audit',
          '/stop-doing-audit-summary',
        ],
      },
    ],
  },
  {
    id: 'ground',
    label: 'Ground',
    links: [
      {
        label: 'Breathe',
        to: '/breathe',
        childRoutes: ['/breathing-sessions-summary'],
      },
      {
        label: 'Daily Journal',
        to: '/daily-journal',
        childRoutes: [],
      },
      {
        label: 'My Journals',
        to: '/daily-journals',
        childRoutes: [],
        childPrefixes: ['/daily-journals/'],
      },
      {
        label: 'Scenario Planning',
        to: '/if-then-planning',
        childRoutes: ['/if-then-planning-summary'],
      },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    links: [
      {
        label: 'Review My Day',
        to: '/review-plan',
        isTodaysPlanLookup: true,
        childRoutes: ['/review-plan-summary'],
      },
      {
        label: 'After-Action Review',
        to: '/my-journal',
        state: { reviewType: 'after-action' },
        matchState: 'after-action',
        childRoutes: [],
      },
      {
        label: 'Weekly Momentum Check-in',
        to: '/my-journal',
        state: { reviewType: 'weekly-momentum' },
        matchState: 'weekly-momentum',
        childRoutes: [],
      },
      {
        label: 'Personal Operating Plan Review',
        to: '/personal-operating-plan-review',
        isMissionLookup: true,
        childRoutes: ['/mission-progress-review'],
      },
      {
        label: 'My Reviews',
        to: '/my-reviews',
        childRoutes: ['/review-summary'],
      },
    ],
  },
  {
    id: 'account',
    label: 'My Account',
    links: [
      {
        label: 'My Account',
        to: '/my-account',
        childRoutes: ['/edit-profile'],
      },
      {
        label: 'Log Out',
        isLogout: true,
      },
    ],
  },
];

// My Account always starts collapsed (prompt 7i) - its current-page
// highlight (the coral bar on the My Account button/row) is a separate
// check (isLinkCurrent, below) and still lights up on /my-account; it
// just no longer auto-opens the group. Plan/Ground/Review auto-opening
// on their own pages is unchanged/intentional.
function findOpenSection(pathname, locationState) {
  if (pathname === '/about') return null;
  for (const section of SECTIONS) {
    if (section.id === 'account') continue;
    for (const link of section.links) {
      if (link.isLogout) continue;
      if (link.to === pathname) {
        if (link.matchState) {
          if (locationState?.reviewType === link.matchState) return section.id;
        } else {
          return section.id;
        }
      }
      if (link.childRoutes?.includes(pathname)) return section.id;
      if (link.childPrefixes?.some((p) => pathname.startsWith(p))) return section.id;
    }
  }
  return null;
}

function isLinkCurrent(link, pathname, locationState) {
  if (link.isLogout) return false;
  if (link.to === pathname) {
    if (link.matchState) return locationState?.reviewType === link.matchState;
    return true;
  }
  if (link.childRoutes?.includes(pathname)) return true;
  return link.childPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
}

export default function DesignDrawer({ isOpen, onClose, headerHeight, burgerRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [shouldRender, setShouldRender] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const drawerRef = useRef(null);
  const firstLinkRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const wasOpenRef = useRef(false);

  // Keep mounted through the close animation, then unmount.
  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      setShouldRender(true);
      setOpenSection(findOpenSection(location.pathname, location.state));
    } else if (shouldRender) {
      closeTimeoutRef.current = setTimeout(() => setShouldRender(false), 260);
    }
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Focus first link on open, return focus to burger on close. Keyed on
  // shouldRender (not just isOpen): on the very first open, the "keep
  // mounted" effect above sets shouldRender=true in the same tick isOpen
  // flips true, so this effect would otherwise fire before that state
  // update has actually committed the drawer's DOM - firstLinkRef.current
  // would still be null at that point.
  //
  // wasOpenRef guards the close branch: without it, this effect also
  // runs on initial mount (isOpen starts false, burgerRef.current is
  // already attached), unconditionally calling burgerRef.current.focus()
  // and stealing focus onto the burger on every page load even though
  // the drawer was never opened. Only call focus() on the burger when
  // the drawer was actually open on the previous render and has now
  // closed.
  useEffect(() => {
    if (isOpen && shouldRender && firstLinkRef.current) {
      firstLinkRef.current.focus();
    } else if (!isOpen && wasOpenRef.current && burgerRef?.current) {
      burgerRef.current.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, shouldRender, burgerRef]);

  // Escape key closes.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Close when the window becomes 768px or narrower.
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      if (window.innerWidth <= 768) onClose();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/');
  };

  const handleMissionReviewClick = async (e) => {
    e.preventDefault();
    try {
      const { data: missionData } = await supabase
        .from('missions')
        .select('id')
        .eq('user_id', user?.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      onClose();
      if (missionData) {
        navigate('/personal-operating-plan-review', { state: { missionId: missionData.id } });
      }
    } catch (err) {
      console.error('Error fetching mission:', err);
      onClose();
    }
  };

  const handleReviewMyDayClick = async (e) => {
    e.preventDefault();
    onClose();
    try {
      const plan = await findTodaysDailyPlan(user?.id);
      navigate('/review-plan', { state: { planKind: 'daily_plan', plan } });
    } catch (err) {
      console.error('[DesignDrawer] today\'s plan lookup failed:', err);
      navigate('/review-plan', { state: { planKind: 'daily_plan', plan: null } });
    }
  };

  const homeActive = location.pathname === '/welcome';

  return createPortal(
    <div className="ui-root">
      <style>{`
        .design-drawer-scrim {
          position: fixed;
          left: 0;
          right: 0;
          top: ${headerHeight}px;
          bottom: 0;
          background: var(--scrim);
          z-index: 5001;
          opacity: ${isOpen ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .design-drawer {
          position: fixed;
          left: 0;
          top: ${headerHeight}px;
          bottom: 0;
          width: 300px;
          background: var(--bg);
          border-right: 1px solid var(--line);
          padding: 10px 0 12px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          z-index: 5002;
          transform: translateX(${isOpen ? '0' : '-100%'});
          transition: transform var(--dur) var(--ease);
        }

        .design-drawer-group {
          padding: 8px 0;
        }

        .design-drawer-group--bordered {
          border-bottom: 1px solid var(--line);
        }

        .design-drawer-group--about-push {
          margin-top: auto;
        }

        /* Quiet link just above My Account (prompt 7c, restyled 7i):
           same row shape as Home/Plan/Ground/Review (Nekst uppercase,
           same size/spacing/padding/row height), but t2 colour instead
           of white and a reduced-opacity coral edge instead of none -
           belongs to the drawer, just quieter than the groups around
           it. Full-strength edge when /about is the current page. */
        .design-drawer .drawer-about-link {
          position: relative;
          display: block;
          width: 100%;
          box-sizing: border-box;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 11px !important;
          color: var(--text-2);
          padding: 17px 28px 16px !important;
          min-height: 44px;
          text-decoration: none;
          cursor: pointer;
          background: transparent;
          border: none;
          text-align: left;
          transition: color var(--dur-fast) var(--ease);
        }

        .design-drawer .drawer-about-link::before {
          content: '';
          position: absolute;
          left: 0;
          top: 11px;
          bottom: 11px;
          width: 2px;
          background: var(--coral);
          opacity: 0;
        }

        .design-drawer .drawer-about-link.current::before {
          opacity: 1;
        }

        .design-drawer .drawer-about-link:hover,
        .design-drawer .drawer-about-link.current {
          color: var(--text);
        }

        .design-drawer .drawer-about-link:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: -2px;
        }

        .design-drawer .drawer-top-link {
          position: relative;
          display: block;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 11px;
          color: var(--text);
          padding: 17px 28px 16px;
          min-height: 44px;
          box-sizing: border-box;
          text-decoration: none;
          cursor: pointer;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
        }

        .design-drawer .drawer-top-link:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: -2px;
        }

        .design-drawer .drawer-top-link.current::before {
          content: '';
          position: absolute;
          left: 0;
          top: 11px;
          bottom: 11px;
          width: 2px;
          background: var(--coral);
        }

        /* src/styles/mobile.css has button:not(.breathe-button) {
           min-height: 44px; padding: 12px 16px !important; font-size:
           14px !important; } at max-width: 768px (also reachable if this
           component is ever rendered below 769px). The section headers
           must be real <button> elements. .design-drawer .drawer-section-btn
           (two classes, specificity 0,2,0) already beats the legacy
           rule's 0,1,1 on min-height, but padding and font-size need
           their own !important since specificity cannot out-rank an
           !important declaration. */
        .design-drawer .drawer-section-btn {
          position: relative;
          display: block;
          width: 100%;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 11px !important;
          color: var(--text);
          padding: 17px 28px 16px !important;
          min-height: 44px;
          box-sizing: border-box;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
        }

        .design-drawer .drawer-section-btn:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: -2px;
        }

        .design-drawer .drawer-section-btn.current::before {
          content: '';
          position: absolute;
          left: 0;
          top: 11px;
          bottom: 11px;
          width: 2px;
          background: var(--coral);
        }

        .design-drawer .drawer-section-cross {
          position: absolute;
          right: 28px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: var(--coral);
          transition: transform var(--dur) var(--ease);
        }

        .design-drawer .drawer-section-cross.open {
          transform: translateY(-50%) rotate(45deg);
        }

        .design-drawer-sublist-outer {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows var(--dur) var(--ease);
        }

        .design-drawer-sublist-outer.open {
          grid-template-rows: 1fr;
        }

        .design-drawer-sublist-inner {
          min-height: 0;
          overflow: hidden;
        }

        .design-drawer-sublist {
          margin: 0 0 8px 30px;
          border-left: 1px solid var(--line);
          list-style: none;
          padding: 0;
        }

        .design-drawer-sublist li {
          margin: 0;
        }

        /* The base selector here (0,2,0 specificity) already beats the
           legacy button:not(.breathe-button) rule's 0,1,1 for the Log Out
           item, which is a real <button> (not a Link, since it needs to
           run an async action first) - but font-size and padding need
           their own !important too, since the legacy rule marks those
           two !important and specificity alone cannot out-rank
           !important. Harmless on the other items here, which are <a>
           tags the legacy rule never matches anyway. */
        .design-drawer .drawer-sub-link {
          position: relative;
          display: block;
          font-family: var(--font-body);
          font-weight: 400;
          letter-spacing: 0.01em;
          font-size: 15px !important;
          color: var(--text-2);
          padding: 10px 20px 10px 22px !important;
          min-height: 44px;
          box-sizing: border-box;
          text-decoration: none;
          cursor: pointer;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          transition: color var(--dur-fast) var(--ease);
        }

        .design-drawer .drawer-sub-link:hover,
        .design-drawer .drawer-sub-link:focus-visible {
          color: var(--text);
        }

        .design-drawer .drawer-sub-link:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: -2px;
        }

        .design-drawer .drawer-sub-link.current {
          color: var(--text);
        }

        .design-drawer .drawer-sub-link.current::before {
          content: '';
          position: absolute;
          left: -1px;
          top: 9px;
          bottom: 9px;
          width: 2px;
          background: var(--coral);
        }

        .design-drawer .drawer-sub-link.logout {
          color: var(--coral-text);
        }

        @media (min-width: 769px) {
          .design-header-wrapper {
            z-index: 5003;
            position: relative;
          }
        }
      `}</style>

      <div className="design-drawer-scrim" onClick={onClose} aria-hidden="true" />

      <nav
        id="design-drawer"
        ref={drawerRef}
        className="design-drawer"
        aria-hidden={!isOpen}
      >
        <div className="design-drawer-group design-drawer-group--bordered">
          <Link
            ref={firstLinkRef}
            to="/welcome"
            className={`drawer-top-link${homeActive ? ' current' : ''}`}
            onClick={onClose}
            tabIndex={isOpen ? 0 : -1}
          >
            Home
          </Link>
        </div>

        <div className="design-drawer-group design-drawer-group--bordered">
          {SECTIONS.filter((s) => s.id !== 'account').map((section) => {
            const isSectionOpen = openSection === section.id;
            const sectionHasCurrent = section.links.some((l) =>
              isLinkCurrent(l, location.pathname, location.state)
            );
            return (
              <div key={section.id}>
                <button
                  type="button"
                  className={`drawer-section-btn${sectionHasCurrent ? ' current' : ''}`}
                  aria-expanded={isSectionOpen}
                  onClick={() => setOpenSection(isSectionOpen ? null : section.id)}
                  tabIndex={isOpen ? 0 : -1}
                >
                  {section.label}
                  <span className={`drawer-section-cross ui-cross${isSectionOpen ? ' open' : ''}`} aria-hidden="true" />
                </button>
                <div className={`design-drawer-sublist-outer${isSectionOpen ? ' open' : ''}`}>
                  <div className="design-drawer-sublist-inner">
                    <ul className="design-drawer-sublist">
                      {section.links.map((link) => {
                        const current = isLinkCurrent(link, location.pathname, location.state);
                        if (link.isMissionLookup) {
                          return (
                            <li key={link.label}>
                              <Link
                                to={link.to}
                                className={`drawer-sub-link${current ? ' current' : ''}`}
                                onClick={handleMissionReviewClick}
                                tabIndex={isOpen ? 0 : -1}
                              >
                                {link.label}
                              </Link>
                            </li>
                          );
                        }
                        if (link.isTodaysPlanLookup) {
                          return (
                            <li key={link.label}>
                              <Link
                                to={link.to}
                                className={`drawer-sub-link${current ? ' current' : ''}`}
                                onClick={handleReviewMyDayClick}
                                tabIndex={isOpen ? 0 : -1}
                              >
                                {link.label}
                              </Link>
                            </li>
                          );
                        }
                        return (
                          <li key={link.label}>
                            <Link
                              to={link.to}
                              state={link.state}
                              className={`drawer-sub-link${current ? ' current' : ''}`}
                              onClick={onClose}
                              tabIndex={isOpen ? 0 : -1}
                            >
                              {link.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="design-drawer-group--about-push">
          <Link
            to="/about"
            className={`drawer-about-link${location.pathname === '/about' ? ' current' : ''}`}
            onClick={onClose}
            tabIndex={isOpen ? 0 : -1}
          >
            About The Clarity Portal
          </Link>
        </div>

        <div className="design-drawer-group">
          {SECTIONS.filter((s) => s.id === 'account').map((section) => {
            const isSectionOpen = openSection === section.id;
            const sectionHasCurrent = section.links.some((l) =>
              isLinkCurrent(l, location.pathname, location.state)
            );
            return (
              <div key={section.id}>
                <button
                  type="button"
                  className={`drawer-section-btn${sectionHasCurrent ? ' current' : ''}`}
                  aria-expanded={isSectionOpen}
                  onClick={() => setOpenSection(isSectionOpen ? null : section.id)}
                  tabIndex={isOpen ? 0 : -1}
                >
                  {section.label}
                  <span className={`drawer-section-cross ui-cross${isSectionOpen ? ' open' : ''}`} aria-hidden="true" />
                </button>
                <div className={`design-drawer-sublist-outer${isSectionOpen ? ' open' : ''}`}>
                  <div className="design-drawer-sublist-inner">
                    <ul className="design-drawer-sublist">
                      {section.links.map((link) => {
                        if (link.isLogout) {
                          return (
                            <li key={link.label}>
                              <button
                                type="button"
                                className="drawer-sub-link logout"
                                onClick={handleLogout}
                                tabIndex={isOpen ? 0 : -1}
                              >
                                {link.label}
                              </button>
                            </li>
                          );
                        }
                        const current = isLinkCurrent(link, location.pathname, location.state);
                        return (
                          <li key={link.label}>
                            <Link
                              to={link.to}
                              className={`drawer-sub-link${current ? ' current' : ''}`}
                              onClick={onClose}
                              tabIndex={isOpen ? 0 : -1}
                            >
                              {link.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>
    </div>,
    document.body
  );
}
