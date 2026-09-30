import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DesignHeader from '../components/DesignHeader';
import { designTokens } from '../lib/designTokens';

const PLAN_ITEMS = [
  { id: 'pop', title: 'Personal Operating Plan', description: 'Define your mission, strategies, and tactics', route: '/personal-operating-plan' },
  { id: 'daily', title: 'Daily Intentions', description: 'Plan your day with clear priorities', route: '/plan-my-day' },
  { id: 'meeting', title: 'Meeting Planner', description: 'Organize and prepare effective meetings', route: '/plan-meeting' },
];

const DECISION_ITEMS = [
  { id: 'decision', title: 'I\'m navigating a tricky decision', description: 'Use the GROW model to get clear on the way forward', route: '/grow-step-1', status: 'coming-soon' },
  { id: 'tough-conversation', title: 'I need to give tough feedback', description: 'Create a script for giving feedback', route: '/tough-conversation-step-1' },
  { id: 'stop-doing', title: 'I\'ve got too many things to do', description: 'Reclaim hours by stopping or delegating time-sink activities', route: '/stop-doing-audit' },
  { id: 'if-then', title: 'I\'m feeling anxious about an uncertain situation', description: 'Prepare for uncertain situations with contingency plans', route: '/if-then-planning' },
];

const CONTACT_ITEM = { id: 'contact', title: 'Chat to Tim', description: 'Get in touch via WhatsApp or iMessage', isContact: true };

export default function PlanSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isNorthAmerica, setIsNorthAmerica] = useState(false);

  useEffect(() => {
    const checkLocation = async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone.startsWith('America/') || timezone.startsWith('Canada/')) {
        setIsNorthAmerica(true);
        return;
      }
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        setIsNorthAmerica(data.country_code === 'US' || data.country_code === 'CA');
      } catch (error) {
        console.error('Geolocation fetch failed:', error);
      }
    };
    checkLocation();
  }, []);

  const handleCardSelect = (item) => {
    if (item.isContact) {
      const message = "Hi Tim, I'd like to chat with you.";
      if (isNorthAmerica) {
        window.location.href = `imessage://+447792332439?text=${encodeURIComponent(message)}`;
      } else {
        window.open(`https://wa.me/447792332439?text=${encodeURIComponent(message)}`, '_blank');
      }
    } else if (item.status === 'coming-soon') {
      return;
    } else {
      navigate(item.route, { state: { ...location.state } });
    }
  };

  const cardStyle = {
    padding: '20px',
    backgroundColor: 'white',
    border: '2px solid #e5e5e5',
    borderRadius: '12px',
    color: '#333',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '140px',
  };

  const disabledCardStyle = { ...cardStyle, backgroundColor: '#f9f9f9', color: '#999', cursor: 'not-allowed' };
  const historyCardStyle = { ...cardStyle, backgroundColor: 'rgba(240, 133, 113, 0.08)' };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: designTokens.colors.text.primary, marginTop: '0', marginBottom: '0' }}>Plan</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {PLAN_ITEMS.map((item) => (
            <button key={item.id} onClick={() => navigate(item.route, { state: { ...location.state } })} style={cardStyle} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#F08571'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div><div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{item.title}</div><div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>{item.description}</div></div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {DECISION_ITEMS.map((item) => (
            <button key={item.id} onClick={() => handleCardSelect(item)} disabled={item.status === 'coming-soon'} style={item.status === 'coming-soon' ? disabledCardStyle : cardStyle} onMouseEnter={(e) => { if (item.status !== 'coming-soon') { e.currentTarget.style.borderColor = '#F08571'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)'; } }} onMouseLeave={(e) => { if (item.status !== 'coming-soon') { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.boxShadow = 'none'; } }}>
              <div><div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{item.title}</div><div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>{item.description}</div></div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => navigate('/my-plans', { state: { ...location.state } })} style={historyCardStyle} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#F08571'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(240, 133, 113, 0.3)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div><div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>My Plans</div><div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>View and manage</div></div>
          </button>
          <button onClick={() => navigate('/decision-history', { state: { ...location.state } })} style={historyCardStyle} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#F08571'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(240, 133, 113, 0.3)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div><div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>My Decisions</div><div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>View history</div></div>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <button onClick={() => handleCardSelect(CONTACT_ITEM)} style={cardStyle} onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#F08571'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div><div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{CONTACT_ITEM.title}</div><div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>{CONTACT_ITEM.description}</div></div>
          </button>
        </div>
      </div>
    </div>
  );
}
