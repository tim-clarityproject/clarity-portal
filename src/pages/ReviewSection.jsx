import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import DesignHeader from '../components/DesignHeader';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { findTodaysDailyPlan } from '../lib/planReview';
import PageHeading from '../components/PageHeading';

// "Review my day" now opens the prompt 8 review page for today's daily
// plan (separated from "Review a situation", which still opens the
// existing after-action journal flow - they used to land in the same
// place, see build summary point 6).
const CARDS = [
  { title: 'Review my day', description: 'Reflect on what worked today.', needsTodaysPlan: true },
  { title: 'Weekly momentum check-in', description: 'Look back on your week and set up the next.', route: '/my-journal', state: { reviewType: 'weekly-momentum' } },
  { title: 'Check in on your Wheel of Life', description: 'Rate the areas of your life and see how your wheel changes over time.', route: '/wheel-of-life' },
  { title: 'Review a situation', description: 'Learn from something that has happened.', route: '/my-journal', state: { reviewType: 'after-action' } },
  { title: 'Review my personal operating plan', description: 'Check it still fits how you work.', route: '/personal-operating-plan-review', needsMissionLookup: true },
];

function CrossMark() {
  return <span className="dt-card-mark ui-cross ui-cross--sm" aria-hidden="true" />;
}

function ClockIcon() {
  return (
    <svg className="hub-history-card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function ReviewSection() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const openCard = async (card) => {
    if (card.needsTodaysPlan) {
      try {
        const plan = await findTodaysDailyPlan(user?.id);
        navigate('/review-plan', { state: { planKind: 'daily_plan', plan } });
      } catch (err) {
        console.error('[ReviewSection] today\'s plan lookup failed:', err);
        navigate('/review-plan', { state: { planKind: 'daily_plan', plan: null } });
      }
      return;
    }
    if (!card.needsMissionLookup) {
      navigate(card.route, { state: card.state });
      return;
    }
    try {
      const { data: missionData } = await supabase
        .from('missions')
        .select('id')
        .eq('user_id', user?.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (missionData) {
        navigate(card.route, { state: { missionId: missionData.id } });
      }
    } catch (err) {
      console.error('[ReviewSection] mission lookup failed:', err);
    }
  };

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-header">
          <PageHeading pageKey="reviewSection" title="Review" overline="" rule={false} />
        </div>

        <div className="dt-cards">
          {CARDS.map((card) => (
            <button key={card.title} type="button" className="dt-card dt-card--row" onClick={() => openCard(card)}>
              <span className="dt-card-text">
                <span className="dt-card-title">{card.title}</span>
                <span className="dt-card-desc">{card.description}</span>
              </span>
              <CrossMark />
            </button>
          ))}
        </div>

        <p className="dt-soon-label" style={{ marginTop: 'var(--space-6)' }}>Your history</p>
        <button type="button" className="hub-history-card" onClick={() => navigate('/my-reviews')}>
          <span>
            <span className="hub-history-card-title">My reviews</span>
            <span className="hub-history-card-desc">Your journal entries and past reviews.</span>
          </span>
          <ClockIcon />
        </button>
      </div>
    </div>
  );
}
