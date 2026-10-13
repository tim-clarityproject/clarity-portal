import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import DesignHeader from '../components/DesignHeader';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// Same routes Home's review links use today (prompts 8/10 will re-point
// them). "Review my day" and "Review a situation" both lead to
// /my-journal with reviewType 'after-action' - that overlap already
// exists on Home today (see build summary point 6), not invented here.
const CARDS = [
  { title: 'Review my day', description: 'Reflect on what worked today.', route: '/my-journal', state: { reviewType: 'after-action' } },
  { title: 'Weekly momentum review', description: 'Look back on your week and set up the next.', route: '/my-journal', state: { reviewType: 'weekly-momentum' } },
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
          <div className="ui-title">Review</div>
          <p className="ui-subtitle">Look back, learn and sharpen how you work.</p>
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
