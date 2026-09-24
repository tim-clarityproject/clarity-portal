import { useNavigate, useLocation } from 'react-router-dom';
import { designTokens } from '../lib/designTokens';
import HomeHeader from '../components/HomeHeader';

export default function About() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        {/* Hero Section */}
        <div style={{ marginBottom: designTokens.layout.gapBetweenSections }}>
          <h1 style={{ ...designTokens.typography.h1, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.lg} 0` }}>
            About The Clarity Portal
          </h1>
          <p style={{ fontSize: '16px', fontWeight: '500', color: designTokens.colors.text.secondary, margin: 0, lineHeight: '1.6' }}>
            A thinking companion for high-performers who value clarity, intentionality, and genuine conviction.
          </p>
        </div>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: designTokens.layout.gapBetweenSections, marginBottom: designTokens.layout.gapBetweenSections }}>
          {/* Philosophy Section */}
          <section style={{ paddingLeft: designTokens.spacing.lg, borderLeft: `4px solid ${designTokens.colors.primary}` }}>
            <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.lg} 0` }}>
              Our Philosophy
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: designTokens.spacing.md }}>
              <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
                You won't find an AI chatbot here giving you the easy answers.
              </p>
              <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
                This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.
              </p>
            </div>
          </section>

          {/* Purpose Section */}
          <section style={{ paddingLeft: designTokens.spacing.lg, borderLeft: `4px solid ${designTokens.colors.primary}` }}>
            <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.lg} 0` }}>
              What We Do
            </h2>
            <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
              The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.
            </p>
          </section>

          {/* Features Grid */}
          <section>
            <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.lg} 0` }}>
              Key Features
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: designTokens.layout.gapBetweenCards }}>
              {[
                { title: 'Daily Intentions', desc: 'Start each day with clarity on your top priority' },
                { title: 'Deep Reflection', desc: 'After-action reviews and decision frameworks' },
                { title: 'Personal Operating Plan', desc: 'Define your mission, strategies, and tactics' },
                { title: 'Progress Tracking', desc: 'Weekly momentum reviews to build momentum' }
              ].map((feature, idx) => (
                <div key={idx} style={{
                  padding: designTokens.spacing.lg,
                  backgroundColor: designTokens.colors.background.secondary,
                  border: `1px solid ${designTokens.colors.border.medium}`,
                  borderRadius: designTokens.borderRadius.lg,
                  textAlign: 'center',
                }}>
                  <h3 style={{ ...designTokens.typography.h4, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.sm} 0` }}>
                    {feature.title}
                  </h3>
                  <p style={{ ...designTokens.typography.bodySm, color: designTokens.colors.text.secondary, margin: 0 }}>
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Created By */}
          <section style={{ paddingTop: designTokens.spacing.lg, borderTop: `1px solid ${designTokens.colors.border.medium}`, paddingLeft: designTokens.spacing.lg, borderLeft: `4px solid ${designTokens.colors.primary}` }}>
            <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.md} 0` }}>
              Created By
            </h2>
            <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0, marginBottom: designTokens.spacing.md }}>
              The Clarity Project is dedicated to helping high-performers think better and lead with clarity.
            </p>
            <a
              href="https://theclarityproject.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: designTokens.colors.primary,
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '14px',
                transition: 'color 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.target.style.color = designTokens.button.primary.hoverBackgroundColor}
              onMouseLeave={(e) => e.target.style.color = designTokens.colors.primary}
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
            ...designTokens.button.primary,
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = designTokens.button.primary.hoverBackgroundColor}
          onMouseLeave={(e) => e.target.style.backgroundColor = designTokens.colors.primary}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
