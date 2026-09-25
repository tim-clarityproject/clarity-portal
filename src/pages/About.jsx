import { useNavigate, useLocation } from 'react-router-dom';
import { designTokens } from '../lib/designTokens';
import HomeHeader from '../components/HomeHeader';

export default function About() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        {/* About this portal section */}
        <section style={{ marginBottom: designTokens.layout.gapBetweenSections, paddingLeft: designTokens.spacing.lg, borderLeft: `4px solid ${designTokens.colors.primary}` }}>
          <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.lg} 0` }}>
            About The Clarity Portal
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: designTokens.spacing.md }}>
            <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
              You won't find an AI chatbot here giving you the easy answers.
            </p>
            <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
              This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.
            </p>
            <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0 }}>
              The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.
            </p>
          </div>
        </section>

        {/* Created By */}
        <section style={{ marginBottom: designTokens.layout.gapBetweenSections, paddingTop: designTokens.spacing.lg, borderTop: `1px solid ${designTokens.colors.border.medium}`, paddingLeft: designTokens.spacing.lg, borderLeft: `4px solid ${designTokens.colors.primary}` }}>
          <h2 style={{ ...designTokens.typography.h2, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.md} 0` }}>
            Created by The Clarity Project
          </h2>
          <p style={{ ...designTokens.typography.body, color: designTokens.colors.text.secondary, margin: 0, marginBottom: designTokens.spacing.md }}>
            The Clarity Project is dedicated to helping high-performers think and lead with more clarity and conviction.
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
              display: 'inline-block',
            }}
            onMouseEnter={(e) => e.target.style.color = designTokens.button.primary.hoverBackgroundColor}
            onMouseLeave={(e) => e.target.style.color = designTokens.colors.primary}
          >
            Visit The Clarity Project
          </a>
        </section>

        {/* Back Button */}
        <button
          onClick={() => navigate('/welcome')}
          style={{
            alignSelf: 'flex-start',
            ...designTokens.button.primary,
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = designTokens.button.primary.hoverBackgroundColor}
          onMouseLeave={(e) => e.target.style.backgroundColor = designTokens.colors.primary}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
