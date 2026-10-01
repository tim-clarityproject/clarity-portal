import { useRef, useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeIcon, GroundIcon, PlanIcon, ReviewIcon, AccountIcon } from './ui/TabIcons';

const TABS = [
  {
    id: 'home',
    label: 'Home',
    path: '/welcome',
    Icon: HomeIcon,
    sectionRoutes: ['/welcome'],
  },
  {
    id: 'ground',
    label: 'Ground',
    path: '/ground-section',
    Icon: GroundIcon,
    sectionRoutes: [
      '/ground-section',
      '/breathe',
      '/breathing-sessions-summary',
      '/if-then-planning',
      '/if-then-planning-summary',
      '/stop-doing-audit',
      '/stop-doing-audit-summary',
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    path: '/plan-section',
    Icon: PlanIcon,
    sectionRoutes: [
      '/plan-section',
      '/personal-operating-plan',
      '/personal-operating-plan-summary',
      '/personal-operating-plan-edit',
      '/personal-operating-plan-review',
      '/goal-setting',
      '/risks-assessment',
      '/critical-success-factors',
      '/project-list',
      '/project-matrix',
      '/project-progress',
      '/project-scatter',
      '/strategies',
      '/plan-my-day',
      '/daily-plan-summary',
      '/plan-meeting',
      '/meeting-summary',
      '/my-plans',
      '/decide-section',
      '/decision-tools',
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
    ],
  },
  {
    id: 'review',
    label: 'Review',
    path: '/review-section',
    Icon: ReviewIcon,
    sectionRoutes: [
      '/review-section',
      '/my-journal',
      '/journal-log',
      '/my-reviews',
      '/review-summary',
      '/weekly-momentum-review-summary',
      '/mission-progress-review',
    ],
  },
  {
    id: 'account',
    label: 'Account',
    path: '/my-account',
    Icon: AccountIcon,
    sectionRoutes: ['/my-account', '/edit-profile', '/account-section', '/about'],
  },
];

function getActiveTabIndex(pathname) {
  return TABS.findIndex((tab) => tab.sectionRoutes.includes(pathname));
}

export default function DesignTabBar() {
  const location = useLocation();
  const navRef = useRef(null);
  const activeIndex = getActiveTabIndex(location.pathname);

  // Measure the bar's real rendered height so page content below it never
  // gets hidden, matching how the old bar reserved space via body padding -
  // but measured dynamically (via --tabbar-height) instead of a hardcoded
  // guess, so it stays correct even if content wraps to a second line.
  useLayoutEffect(() => {
    const measure = () => {
      if (navRef.current) {
        const height = navRef.current.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--tabbar-height', `${height}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="ui-root">
      <style>{`
        @media (max-width: 768px) {
          body {
            padding-bottom: var(--tabbar-height, 79px);
          }
        }

        .design-tabbar {
          display: none;
        }

        @media (max-width: 768px) {
          .design-tabbar {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            background: var(--bg);
            border-top: 1px solid var(--line);
            padding: 14px 4px max(22px, env(safe-area-inset-bottom));
            z-index: 1999;
          }
        }

        @media (min-width: 769px) {
          .design-tabbar {
            display: none !important;
          }
        }

        .design-tabbar .design-tab {
          min-height: 44px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          text-decoration: none;
          background: transparent;
          color: var(--text-2);
        }

        .design-tabbar .design-tab.active {
          color: var(--coral);
        }

        .design-tabbar .design-tab:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
          border-radius: 8px;
        }

        .design-tabbar .design-tab-icon-wrap {
          display: flex;
          width: 24px;
          height: 24px;
          margin-bottom: 6px;
        }

        .design-tabbar .design-tab-label {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          line-height: 1.2;
          color: inherit;
        }

        .design-tabbar .design-tab-marker-slot {
          position: absolute;
          top: -1px;
          left: 4px;
          width: calc((100% - 8px) / 5);
          height: 2px;
          transform: translateX(calc(var(--i) * 100%));
          transition: transform var(--dur) var(--ease);
        }

        .design-tabbar .design-tab-marker-line {
          width: 22px;
          height: 2px;
          background: var(--coral);
          margin: 0 auto;
        }
      `}</style>

      <nav
        ref={navRef}
        className="bottom-tab-bar design-tabbar"
      >
        {activeIndex >= 0 && (
          <div
            className="design-tab-marker-slot"
            style={{ '--i': activeIndex }}
          >
            <div className="design-tab-marker-line" />
          </div>
        )}

        {TABS.map((tab, index) => {
          const isActive = index === activeIndex;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              className={`design-tab${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="design-tab-icon-wrap">
                <tab.Icon />
              </span>
              <span className="design-tab-label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
