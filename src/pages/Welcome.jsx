import { Link, useLocation } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import DesignHeader from '../components/DesignHeader';
import EmailVerificationBanner from '../components/EmailVerificationBanner';

// Unchanged from the old dropdown - same ids, titles, tools, categories,
// same order. Nothing added, nothing removed.
const ALL_PROBLEMS = [
  // Plan
  { id: 'personal-plan', title: 'I want to shape my personal operating plan', tools: ['personal-operating-plan'], status: null, category: 'Plan' },
  { id: 'plan-day', title: 'I want to make the most of today', tools: ['plan-day'], status: null, category: 'Plan' },
  { id: 'plan-meeting', title: 'I want to hold a high quality meeting', tools: ['plan-meeting'], status: null, category: 'Plan' },

  // Ground
  { id: 'if-then', title: 'I\'m feeling anxious about an uncertain situation', tools: ['if-then-planning'], status: null, category: 'Ground' },
  { id: 'breathe', title: 'I need to take a moment to breathe', tools: ['breathe'], status: null, category: 'Ground' },

  // Decide
  { id: 'grow', title: 'I\'m navigating a tricky decision', tools: ['grow'], status: null, category: 'Decide' },
  { id: 'tough-conversation', title: 'I need to give tough feedback', tools: ['tough-conversation'], status: null, category: 'Decide' },
  { id: 'strategic', title: 'I need to provide my team direction', tools: ['strategic-alignment'], status: null, category: 'Decide' },
  { id: 'stop-doing', title: 'I\'ve got too many things to do', tools: ['time-allocation-audit'], status: null, category: 'Decide' },

  // Review
  { id: 'weekly-momentum', title: 'I want to review my week', tools: ['weekly-momentum'], status: null, category: 'Review' },
  { id: 'after-action', title: 'I need to review a situation', tools: ['after-action'], status: null, category: 'Review' },
  { id: 'progress', title: 'I want to review my personal operating plan', tools: ['progress'], status: null, category: 'Review' },
];

// Unchanged from the old page - same tool -> route mapping
const ROUTE_MAP = {
  'grow': '/grow-step-1',
  'inversion': '/inversion-step-1',
  'strategic-alignment': '/goal-setting',
  'tough-conversation': '/tough-conversation-step-1',
  'plan-day': '/plan-my-day',
  'plan-meeting': '/plan-meeting',
  'personal-operating-plan': '/personal-operating-plan',
  'if-then-planning': '/if-then-planning',
  'breathe': '/breathe',
  'time-allocation-audit': '/stop-doing-audit',
  'after-action': '/my-journal',
  'progress': '/personal-operating-plan-review',
  'weekly-momentum': '/my-journal',
};

function getRouteAndState(problem, currentLocationState) {
  const tool = problem.tools[0];
  const route = ROUTE_MAP[tool];
  const state = { ...currentLocationState, problemTitle: problem.title };
  if (tool === 'after-action') state.reviewType = 'after-action';
  if (tool === 'progress') state.reviewType = 'progress';
  if (tool === 'weekly-momentum') state.reviewType = 'weekly-momentum';
  return { route, state };
}

function getGreetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export default function Welcome() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { clearFormData } = useContext(FormContext);
  const [firstName, setFirstName] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  // Same first-name source as the old page: cached localStorage first,
  // then profiles.first_name from Supabase. No other database reads.
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

  const greetingWord = getGreetingWord();

  const handleOptionClick = () => {
    clearFormData();
    clearProgress();
  };

  const cardDefs = [
    {
      problemId: 'plan-day',
      title: 'Plan my day',
      description: 'Set your intentions and priorities',
    },
    {
      problemId: 'after-action',
      title: 'Review my day',
      description: 'Reflect on what worked today',
    },
    {
      problemId: 'personal-plan',
      title: 'Refine my personal operating plan',
      description: 'Sharpen how you work best',
    },
  ];

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
           margin: 16px 0 !important; } at max-width: 768px. It's a bare
           element selector (specificity 0,0,1); .home-greeting (0,1,0)
           already outranks it on specificity, but the legacy font-size
           and margin are !important, so this rule needs matching
           !important on those two properties plus an explicit margin: 0
           to cancel the legacy 16px top/bottom margin entirely. */
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

        .home-cards {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 30px 20px 0;
        }

        @media (min-width: 769px) {
          .home-cards {
            flex-direction: row;
            gap: 16px;
            margin: 48px auto 0;
            max-width: 780px;
            padding: 0 24px;
          }
        }

        .home-card {
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 14px 16px 13px;
          text-decoration: none;
          color: var(--text);
          cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .home-card:hover,
        .home-card:focus-visible {
          border-color: var(--coral);
        }

        .home-card:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
        }

        @media (min-width: 769px) {
          .home-card {
            flex: 1;
            flex-direction: column;
            align-items: stretch;
            justify-content: space-between;
            padding: 22px 22px 24px;
            min-height: 150px;
          }
        }

        .home-card-text {
          flex: 1;
          min-width: 0;
        }

        .home-card-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.14em;
          line-height: 1.5;
          color: var(--text);
        }

        .home-card-desc {
          font-family: var(--font-body);
          font-weight: 400;
          font-size: 13px;
          color: var(--text-2);
          margin-top: 5px;
          line-height: 1.4;
        }

        /* .ui-cross (components.css) also declares width/height: 20px at
           the same 0,1,0 specificity as a single-class selector here, so
           source order would decide the winner. Use .home-root .home-card-cross
           (0,2,0) instead to guarantee this size wins regardless of order. */
        .home-root .home-card-cross {
          width: 22px;
          height: 22px;
          color: var(--coral);
          flex-shrink: 0;
          margin-left: 12px;
        }

        @media (min-width: 769px) {
          .home-root .home-card-cross {
            margin-left: 0;
            align-self: flex-end;
          }
        }

        .home-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 22px;
        }

        @media (min-width: 769px) {
          .home-more-wrap {
            margin-top: 30px;
          }
        }

        /* src/styles/mobile.css has button:not(.breathe-button) { padding:
           12px 16px !important; font-size: 14px !important; } at
           max-width: 768px. This selector (two classes, specificity
           0,2,0, beats the legacy rule's 0,1,1) needs its own !important
           on padding and font-size specifically, since the legacy rule
           marks those two !important and specificity alone cannot beat
           an !important declaration. */
        .home-root .home-more-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          margin: 0;
          padding: 8px 4px !important;
          cursor: pointer;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          font-size: 10px !important;
          letter-spacing: 0.2em;
          color: var(--text-2);
        }

        .home-more-toggle:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
          border-radius: 4px;
        }

        .home-root .home-more-cross {
          width: 16px;
          height: 16px;
          color: var(--text-2);
          flex-shrink: 0;
          transition: transform var(--dur) var(--ease);
        }

        .home-root .home-more-cross.open {
          transform: rotate(45deg);
        }

        .home-more-panel {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows var(--dur) var(--ease);
        }

        .home-more-panel.open {
          grid-template-rows: 1fr;
        }

        .home-more-inner {
          min-height: 0;
          overflow: hidden;
        }

        .home-more-list {
          max-width: 520px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .home-more-row {
          display: block;
          padding: 12px 0;
          border-bottom: 1px solid var(--line);
          font-family: var(--font-body);
          font-size: 15px;
          color: var(--text);
          text-decoration: none;
        }
      `}</style>

      <DesignHeader />

      <div className="home-content">
        <EmailVerificationBanner />

        <h1 className="home-greeting">
          {greetingWord},<br />
          {firstName ? `${firstName}.` : '.'}
        </h1>

        <div className="home-cards">
          {cardDefs.map((card) => {
            const problem = ALL_PROBLEMS.find((p) => p.id === card.problemId);
            const { route, state } = getRouteAndState(problem, location.state);
            return (
              <Link
                key={card.problemId}
                to={route}
                state={state}
                onClick={handleOptionClick}
                className="home-card"
              >
                <div className="home-card-text">
                  <div className="home-card-title">{card.title}</div>
                  <div className="home-card-desc">{card.description}</div>
                </div>
                <span className="home-card-cross ui-cross" aria-hidden="true" />
              </Link>
            );
          })}
        </div>

        <div className="home-more-wrap">
          <button
            type="button"
            className="home-more-toggle"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
          >
            <span className={`home-more-cross ui-cross${moreOpen ? ' open' : ''}`} aria-hidden="true" />
            More options
          </button>
        </div>

        <div className={`home-more-panel${moreOpen ? ' open' : ''}`}>
          <div className="home-more-inner">
            <div className="home-more-list">
              {ALL_PROBLEMS.map((problem) => {
                const { route, state } = getRouteAndState(problem, location.state);
                return (
                  <Link
                    key={problem.id}
                    to={route}
                    state={state}
                    onClick={() => {
                      handleOptionClick();
                      setMoreOpen(false);
                    }}
                    className="home-more-row"
                  >
                    {problem.title}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
