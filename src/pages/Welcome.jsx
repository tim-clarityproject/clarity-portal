import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { parseDbTimestamp, getLocalDateKey } from '../lib/dateFormatter';
import { loadPlanReviews, findPlanReview } from '../lib/planReview';
import DesignHeader from '../components/DesignHeader';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import BreathingOrb from '../components/ui/BreathingOrb';
import BreathingQuickOpen from '../components/BreathingQuickOpen';

// Three top tiles. Routes/tools unchanged from the old ROUTE_MAP - only
// the on-page copy and layout changed. problemTitle is the string
// downstream pages read from location.state (SaveDiscardButtons,
// RisksAssessment, Strategies, CriticalSuccessFactors, etc. all fall back
// to it) - using each tile's own new copy here rather than the old
// dropdown-style phrasing some of these tools used to carry (e.g. the
// removed "I want to make the most of today"), since that phrasing no
// longer appears anywhere on Home and these are fresh labels for the
// same destinations.
const TILES = [
  {
    id: 'plan-day',
    label: 'Plan',
    title: 'Plan my day',
    description: 'Set your intentions and priorities',
    route: '/plan-my-day',
  },
  {
    id: 'review-day',
    label: 'Review',
    title: 'Review my day',
    description: 'Reflect on what worked today',
    route: '/my-journal',
    state: { reviewType: 'after-action' },
  },
  {
    id: 'strategize',
    label: 'Strategize',
    title: 'Refine my personal operating plan',
    description: 'Sharpen how you work best',
    route: '/personal-operating-plan',
  },
];

const PLAN_REVIEW_ROUTE = {
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
  if_then_planning: '/if-then-planning-summary',
};

const PLAN_LABEL = {
  daily_plan: 'Daily plan',
  plan_meeting: 'Meeting plan',
  if_then_planning: 'If-Then plan',
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "Thursday 1st Oct" - daily plans are titled by date, not a user title.
function formatDailyPlanTitle(dateStr) {
  const date = parseDbTimestamp(dateStr);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const day = date.getDate();
  // en-US (not en-GB) for the month abbreviation specifically - en-GB's
  // Intl data abbreviates September as "Sept" (4 letters), but the spec's
  // examples use the 3-letter "Sep".
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${ordinal(day)} ${month}`;
}

// "8:15am"
function formatTimeOnly(dateStr) {
  const date = parseDbTimestamp(dateStr);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
}

// "29 Sep, 9:30am" - UK day-before-month order, device local time.
function formatDateAndTime(dateStr) {
  const date = parseDbTimestamp(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${day} ${month}, ${formatTimeOnly(dateStr)}`;
}

function getPlanTitle(plan) {
  if (plan.tool_type === 'daily_plan') return formatDailyPlanTitle(plan.created_at);
  if (plan.tool_type === 'plan_meeting') return plan.title || 'Meeting';
  return plan.title || 'If-Then Plan';
}

function getPlanMeta(plan) {
  const label = PLAN_LABEL[plan.tool_type];
  const when = plan.tool_type === 'daily_plan' ? formatTimeOnly(plan.created_at) : formatDateAndTime(plan.created_at);
  return `${label} · ${when}`;
}

function getGreetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

// Weekly momentum card shows Friday, Saturday and Sunday only, by the
// device's local time. Hiding it once this week's review is already done
// is a later phase - it always shows on these three days for now.
function isWeekendReviewWindow() {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

function WaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 8 Q6.5 5.5 10 8 Q13.5 10.5 17 8" stroke="var(--on-coral)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 12.5 Q6.5 10 10 12.5 Q13.5 15 17 12.5" stroke="var(--on-coral)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Welcome() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { clearFormData } = useContext(FormContext);
  const [firstName, setFirstName] = useState('');
  const [recentPlans, setRecentPlans] = useState([]);
  const [recentPlanReviews, setRecentPlanReviews] = useState([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [showBreathingQuickOpen, setShowBreathingQuickOpen] = useState(false);

  // Same first-name source as before: cached localStorage first, then
  // profiles.first_name from Supabase. No other database reads changed.
  useEffect(() => {
    if (!user) {
      setFirstName('');
      return;
    }

    const loadUserName = async () => {
      try {
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !currentUser) {
          localStorage.removeItem('clarity-user-data');
          setFirstName('');
          return;
        }

        const cachedData = localStorage.getItem('clarity-user-data');
        if (cachedData) {
          const userData = JSON.parse(cachedData);
          if (userData.first_name) {
            setFirstName(userData.first_name);
            return;
          }
        }

        const { data } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (data && data.first_name) {
          setFirstName(data.first_name);
        }
      } catch (err) {
        console.error('Error loading user name:', err);
        setFirstName('');
      }
    };

    loadUserName();
  }, [user]);

  // Last three plans (daily, meeting, If-Then) from the decisions table,
  // newest first. Read-only - title/created_at/tool_type/id only.
  useEffect(() => {
    if (!user) {
      setRecentPlans([]);
      setPlansLoaded(true);
      return;
    }

    let cancelled = false;

    const loadRecentPlans = async () => {
      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('id, tool_type, title, created_at')
          .eq('user_id', user.id)
          .in('tool_type', ['daily_plan', 'plan_meeting', 'if_then_planning'])
          .order('created_at', { ascending: false })
          .limit(3);

        if (!cancelled) {
          if (error) {
            console.error('Error loading recent plans:', error);
          } else {
            setRecentPlans(data || []);
          }
        }
        // Prompt 8: which of these already have a finished review, so the
        // link can say "View review" - fails gracefully (just no "View
        // review" state) until migration 013 has been run.
        try {
          const planReviews = await loadPlanReviews(user.id);
          if (!cancelled) setRecentPlanReviews(planReviews);
        } catch (reviewErr) {
          console.error('Error loading plan reviews (migration 013 may not be run yet):', reviewErr);
        }
      } catch (err) {
        if (!cancelled) console.error('Error loading recent plans:', err);
      } finally {
        if (!cancelled) setPlansLoaded(true);
      }
    };

    loadRecentPlans();
    return () => { cancelled = true; };
  }, [user]);

  const greetingWord = getGreetingWord();
  const showWeeklyCard = isWeekendReviewWindow();

  const handleOptionClick = () => {
    clearFormData();
    clearProgress();
  };

  return (
    <div className="ui-root home-root">
      <style>{`
        .home-root {
          width: 100%;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        .home-content {
          flex: 1;
          width: 100%;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .home-content {
            min-height: calc(100dvh - var(--tabbar-height, 81px));
          }
        }

        /* src/styles/mobile.css has h1 { font-size: 28px !important;
           margin: 16px 0 !important; } at max-width: 768px. A bare
           element selector (0,0,1); .home-greeting (0,1,0) already
           outranks it on specificity, but the legacy rule is !important
           on those two properties, so matching !important here is
           required regardless of specificity. */
        .home-greeting {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          line-height: 1.35;
          color: var(--text);
          text-align: center;
          font-size: 26px !important;
          margin: 0 !important;
          padding-top: 34px;
        }

        @media (min-width: 769px) {
          .home-greeting {
            font-size: 32px !important;
            padding-top: 48px;
          }
        }

        .home-container {
          width: 100%;
          max-width: 960px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 0 var(--page-x-phone);
        }

        @media (min-width: 769px) {
          .home-container {
            padding: 0 var(--page-x-desktop);
          }
        }

        /* ---- Tiles ---- */
        .home-tiles {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 30px;
        }

        @media (min-width: 769px) {
          .home-tiles {
            grid-template-columns: repeat(3, 1fr);
            gap: var(--space-3);
            margin-top: 44px;
          }
        }

        .home-tile {
          display: grid;
          grid-template-rows: auto auto 1fr;
          row-gap: 18px;
          align-content: start;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-card);
          padding: 22px var(--space-4) var(--space-4);
          min-height: 184px;
          text-decoration: none;
          box-sizing: border-box;
          transition: border-color var(--dur) var(--ease);
        }

        .home-tile:hover,
        .home-tile:focus-visible {
          border-color: var(--coral);
        }

        .home-tile:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 3px;
        }

        .home-tile-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--line);
        }

        .home-tile-label {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: var(--fs-button);
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--coral-text);
        }

        .home-root .home-tile-cross {
          width: 14px;
          height: 14px;
          color: var(--coral);
          flex-shrink: 0;
          transition: transform var(--dur) var(--ease);
        }

        .home-tile:hover .home-tile-cross,
        .home-tile:focus-visible .home-tile-cross {
          transform: rotate(45deg);
        }

        .home-tile-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 13px;
          line-height: 1.55;
          color: var(--text);
          min-height: 3.1em;
          align-self: start;
        }

        .home-tile-desc {
          font-family: var(--font-body);
          font-weight: 400;
          font-size: 14px;
          line-height: 1.4;
          color: var(--text-2);
          align-self: end;
        }

        /* ---- All planning tools link (prompt 7j, replaces More options) ---- */
        .home-root .home-all-tools-link {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          min-height: var(--tap-min);
          margin: 22px auto 0;
          font-family: var(--font-body);
          font-weight: 400;
          font-size: 15px;
          color: var(--text-2);
          text-decoration: none;
          transition: color var(--dur-fast) var(--ease);
        }

        @media (min-width: 769px) {
          .home-root .home-all-tools-link {
            margin-top: 30px;
          }
        }

        .home-root .home-all-tools-link:hover,
        .home-root .home-all-tools-link:focus-visible {
          color: var(--text);
        }

        .home-root .home-all-tools-link:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
          border-radius: 4px;
        }

        .home-root .home-all-tools-mark {
          color: var(--coral);
        }

        /* ---- Weekly momentum card ---- */
        .home-weekly-card {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-3);
          margin-top: var(--space-5);
          border: 1px solid var(--coral);
          border-radius: var(--radius-card);
          padding: 20px 22px;
          text-decoration: none;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .home-weekly-tag {
          position: absolute;
          top: -8px;
          left: var(--space-3);
          background: var(--bg);
          padding: 0 var(--space-2);
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--coral-text);
        }

        .home-weekly-title {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text);
          margin: 0 0 4px;
        }

        .home-weekly-text {
          font-family: var(--font-body);
          font-size: 13px;
          color: var(--text-2);
          margin: 0;
        }

        .home-root .home-weekly-cross {
          color: var(--coral);
          flex-shrink: 0;
        }

        /* ---- Lower section ---- */
        .home-lower {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: var(--space-5);
          margin-top: 56px;
          margin-bottom: var(--space-6);
          align-items: stretch;
        }

        .home-lower > * {
          min-width: 0;
        }

        @media (min-width: 769px) {
          .home-lower {
            grid-template-columns: 1fr 1fr;
          }
        }

        .home-section-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .home-section-label-text {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: var(--fs-section);
          text-transform: uppercase;
          letter-spacing: var(--ls-section);
          color: var(--text-2);
        }

        .home-root .home-section-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          padding: 0;
          min-height: 0;
          font-family: var(--font-display);
          font-weight: 400;
          font-size: var(--fs-button);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--coral-text);
          text-decoration: none;
          cursor: pointer;
        }

        .home-root .home-section-link-cross {
          width: 14px;
          height: 14px;
          color: var(--coral);
        }

        .home-plans-list {
          border-left: 1px solid var(--line);
        }

        .home-plan-row {
          position: relative;
          display: block;
          padding: 14px var(--space-3);
          text-decoration: none;
          transition: background var(--dur-fast) var(--ease);
        }

        .home-plan-row::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: -1px;
          width: 3px;
          background: var(--coral);
          opacity: 0;
          transition: opacity var(--dur-fast) var(--ease);
        }

        .home-plan-row:hover::before,
        .home-plan-row:focus-within::before {
          opacity: 1;
        }

        .home-plan-row-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          cursor: pointer;
        }

        .home-plan-row-main:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: -2px;
          border-radius: 4px;
        }

        .home-plan-title {
          font-family: var(--font-body);
          font-size: var(--fs-body);
          color: var(--text);
          transition: color var(--dur-fast) var(--ease);
          min-width: 0;
          overflow-wrap: break-word;
        }

        .home-plan-row:hover .home-plan-title,
        .home-plan-row:focus-within .home-plan-title {
          color: var(--coral-soft);
        }

        .home-plan-meta {
          font-family: var(--font-body);
          font-size: 13px;
          color: var(--text-2);
          margin-top: 4px;
        }

        .home-root .home-plan-review {
          display: inline-flex;
          align-items: center;
          min-height: 0;
          padding: 4px 0 4px 8px;
          background: transparent;
          border: none;
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--coral-text);
          text-decoration: none;
          flex-shrink: 0;
          cursor: pointer;
        }

        .home-plans-empty {
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--text-2);
          padding: var(--space-3);
        }

        /* ---- Ground panel ---- */
        .home-ground-panel {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-card);
          padding: 28px var(--space-4);
          min-height: 204px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-4);
          overflow: hidden;
          container-type: inline-size;
          box-sizing: border-box;
          height: 100%;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .home-ground-panel:hover {
          border-color: var(--coral);
        }

        .home-ground-copy {
          min-width: 0;
        }

        .home-ground-title {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--text);
          margin: 0 0 8px;
        }

        .home-ground-text {
          font-family: var(--font-body);
          font-size: var(--fs-body-sub);
          color: var(--text-2);
          margin: 0 0 20px;
        }

        .home-root .home-breathe-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          min-height: 48px;
          padding: 0 26px !important;
          border-radius: var(--radius-pill);
          background: var(--coral);
          color: var(--on-coral);
          border: none;
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 11px !important;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          text-decoration: none;
          cursor: pointer;
          transition: background var(--dur-fast) var(--ease);
        }

        .home-root .home-breathe-btn:hover,
        .home-root .home-breathe-btn:focus-visible {
          background: var(--coral-soft);
        }

        .home-root .home-breathe-btn:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 3px;
        }

        /* Phone-only (prompt 7g): quiet link to About, matching the
           de-emphasised About link already in the burger drawer
           (prompt 7c) - DM Sans, small, t2, no uppercase Nekst, no box. */
        .home-about-link {
          display: none;
        }

        @media (max-width: 768px) {
          .home-about-link {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: var(--tap-min);
            margin-top: var(--space-5);
            font-family: var(--font-body);
            font-weight: 400;
            font-size: 14px;
            color: var(--text-2);
            text-decoration: none;
            transition: color var(--dur-fast) var(--ease);
          }
        }

        .home-root .home-about-link:hover,
        .home-root .home-about-link:focus-visible {
          color: var(--text);
        }

        .home-root .home-about-link:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
        }
      `}</style>

      <DesignHeader />

      <div className="home-content">
        <EmailVerificationBanner />

        <h1 className="home-greeting">
          {greetingWord},<br />
          {firstName ? `${firstName}.` : '.'}
        </h1>

        <div className="home-container">
          <div className="home-tiles">
            {TILES.map((tile) => (
              <Link
                key={tile.id}
                to={tile.route}
                state={{ ...location.state, ...tile.state, problemTitle: tile.title }}
                onClick={handleOptionClick}
                className="home-tile"
              >
                <div className="home-tile-top">
                  <span className="home-tile-label">{tile.label}</span>
                  <span className="home-tile-cross ui-cross" aria-hidden="true" />
                </div>
                <div className="home-tile-title">{tile.title}</div>
                <div className="home-tile-desc">{tile.description}</div>
              </Link>
            ))}
          </div>

          <Link to="/planning-tools" className="home-all-tools-link" onClick={handleOptionClick}>
            All planning tools
            <span className="home-all-tools-mark ui-cross ui-cross--sm" aria-hidden="true" />
          </Link>

          {showWeeklyCard && (
            <Link
              to="/my-journal"
              state={{ ...location.state, reviewType: 'weekly-momentum', problemTitle: 'Weekly momentum check-in' }}
              onClick={handleOptionClick}
              className="home-weekly-card"
            >
              <span className="home-weekly-tag">Friday to Sunday</span>
              <div>
                <p className="home-weekly-title">Weekly momentum check-in</p>
                <p className="home-weekly-text">Look back on your week and set up the next.</p>
              </div>
              <span className="home-weekly-cross ui-cross" aria-hidden="true" />
            </Link>
          )}

          <div className="home-lower">
            <div>
              <div className="home-section-label">
                <span className="home-section-label-text">Your recent plans</span>
                <Link to="/my-plans" className="home-section-link">
                  My Plans
                  <span className="home-section-link-cross ui-cross" aria-hidden="true" />
                </Link>
              </div>

              {plansLoaded && recentPlans.length === 0 ? (
                <p className="home-plans-empty">Your recent plans will appear here.</p>
              ) : recentPlans.length > 0 ? (
                <div className="home-plans-list">
                  {recentPlans.map((plan) => {
                    const openPlan = () => navigate(PLAN_REVIEW_ROUTE[plan.tool_type], { state: { decisionId: plan.id } });
                    const dateKey = getLocalDateKey(parseDbTimestamp(plan.created_at));
                    const existingReview = findPlanReview(recentPlanReviews, { planKind: plan.tool_type, planId: plan.id, dateKey });
                    const reviewed = Boolean(existingReview && !existingReview.data.draft);
                    const openReview = (e) => {
                      e.stopPropagation();
                      if (reviewed) {
                        navigate('/review-plan-summary', { state: { entryId: existingReview.id, planKind: plan.tool_type, plan } });
                      } else {
                        navigate('/review-plan', { state: { planKind: plan.tool_type, plan } });
                      }
                    };
                    return (
                      <div className="home-plan-row" key={plan.id}>
                        <div
                          className="home-plan-row-main"
                          role="button"
                          tabIndex={0}
                          onClick={openPlan}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openPlan();
                            }
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="home-plan-title">{getPlanTitle(plan)}</div>
                            <div className="home-plan-meta">{getPlanMeta(plan)}</div>
                          </div>
                          <button type="button" className="home-plan-review" onClick={openReview}>
                            {reviewed ? 'View review' : 'Review'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <div className="home-section-label">
                <span className="home-section-label-text">Ground</span>
              </div>

              <div className="home-ground-panel">
                <div className="home-ground-copy">
                  <p className="home-ground-title">Need a moment?</p>
                  <p className="home-ground-text">A short breathing reset, any time.</p>
                  <button type="button" className="home-breathe-btn" onClick={() => setShowBreathingQuickOpen(true)}>
                    <WaveIcon />
                    Breathe
                  </button>
                </div>
                <BreathingOrb />
              </div>
            </div>

            <Link to="/about" className="home-about-link">About The Clarity Portal</Link>
          </div>
        </div>
      </div>

      <BreathingQuickOpen isOpen={showBreathingQuickOpen} onClose={() => setShowBreathingQuickOpen(false)} />
    </div>
  );
}
