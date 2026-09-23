import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function About() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        {/* Hero Section */}
        <div style={{ marginBottom: '64px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#333', margin: '0 0 24px 0', lineHeight: '1.3', letterSpacing: '-0.3px' }}>
            About The Clarity Portal
          </h1>
          <p style={{ fontSize: '16px', fontWeight: '500', color: '#666', margin: 0, lineHeight: '1.6' }}>
            A thinking companion for high-performers who value clarity, intentionality, and genuine conviction.
          </p>
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginBottom: '48px' }}>
          {/* Philosophy Section */}
          <section style={{ paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Our Philosophy
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '15px', color: '#555', margin: 0, lineHeight: '1.7' }}>
                You won't find an AI chatbot here giving you the easy answers.
              </p>
              <p style={{ fontSize: '15px', color: '#555', margin: 0, lineHeight: '1.7' }}>
                This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.
              </p>
            </div>
          </section>

          {/* Purpose Section */}
          <section style={{ paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What We Do
            </h2>
            <p style={{ fontSize: '15px', color: '#555', margin: 0, lineHeight: '1.7' }}>
              The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.
            </p>
          </section>

          {/* Features Grid */}
          <section>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Key Features
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {[
                { icon: '🎯', title: 'Daily Intentions', desc: 'Start each day with clarity on your top priority' },
                { icon: '🤔', title: 'Deep Reflection', desc: 'After-action reviews and decision frameworks' },
                { icon: '📋', title: 'Personal Operating Plan', desc: 'Define your mission, strategies, and tactics' },
                { icon: '📈', title: 'Progress Tracking', desc: 'Weekly momentum reviews to build momentum' }
              ].map((feature, idx) => (
                <div key={idx} style={{
                  padding: '20px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>{feature.icon}</div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 8px 0' }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' }}>
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Created By */}
          <section style={{ paddingTop: '24px', borderTop: '1px solid #e5e5e5', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Created By
            </h2>
            <p style={{ fontSize: '15px', color: '#555', margin: 0, lineHeight: '1.7', marginBottom: '12px' }}>
              The Clarity Project is dedicated to helping high-performers think better and lead with clarity.
            </p>
            <a
              href="https://theclarityproject.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#F08571',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '14px',
                transition: 'color 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.target.style.color = '#e07560'}
              onMouseLeave={(e) => e.target.style.color = '#F08571'}
            >
              Visit The Clarity Project →
            </a>
          </section>
        </div>

        {/* Back Button */}
        <button
          onClick={() => navigate('/welcome', { state: { isGuest } })}
          style={{
            alignSelf: 'flex-start',
            padding: '12px 24px',
            backgroundColor: '#F08571',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
