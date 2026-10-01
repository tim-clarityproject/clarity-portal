import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Plan now absorbs the old Decide section. Each sub-link lists the extra
// routes that count as "current" for it (its own child/summary/step pages).
const SECTIONS = [
  {
    id: 'plan',
    label: 'Plan',
    links: [
      {
        label: 'Personal Operating Plan',
        to: '/personal-operating-plan',
        childRoutes: [
          '/personal-operating-plan-summary',
          '/personal-operating-plan-edit',
          '/goal-setting',
          '/risks-assessment',
          '/critical-success-factors',
          '/strategies',
          '/project-list',
          '/project-matrix',
          '/project-progress',
          '/project-scatter',
        ],
      },
      {
        label: 'Daily Intentions',
        to: '/plan-my-day',
        childRoutes: ['/daily-plan-summary'],
      },
      {
        label: 'Meeting Planner',
        to: '/plan-meeting',
        childRoutes: ['/meeting-summary'],
      },
      {
        label: 'My Plans',
        to: '/my-plans',
        childRoutes: [],
      },
      {
        label: 'Decision Tools',
        to: '/decision-tools',
        childRoutes: [
          '/decide-section',
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
        ],
      },
      {
        label: 'My Decisions',
        to: '/decision-history',
        childRoutes: [],
      },
    ],
  },
  {
    id: 'ground',
    label: 'Ground',
    links: [
      {
        label: 'If-Then Planning',
        to: '/if-then-planning',
        childRoutes: ['/if-then-planning-summary'],
      },
      {
        label: 'Breathe',
        to: '/breathe',
        childRoutes: ['/breathing-sessions-summary'],
      },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    links: [
      {
        label: 'After-Action Review',
        to: '/my-journal',
        state: { reviewType: 'after-action' },
        matchState: 'after-action',
        childRoutes: [],
      },
      {
        label: 'Weekly Momentum Review',
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
        childRoutes: ['/review-summary', '/weekly-momentum-review-summary', '/journal-log'],
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
        label: 'About',
        to: '/about',
        childRoutes: [],
      },
      {
        label: 'Log Out',
        isLogout: true,
      },
    ],
  },
];

function findOpenSection(pathname, locationState) {
  for (const section of SECTIONS) {
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
  return link.childRoutes?.includes(pathname) ?? false;
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

        .design-drawer-group--account {
          margin-top: auto;
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

        <div className="design-drawer-group design-drawer-group--account">
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
