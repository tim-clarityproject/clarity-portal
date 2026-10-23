import pageText from '../content/pageText';
import { useNavigate } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { Button, PageHeader, useCoachName } from '../components/design';
import { useStartChat } from '../components/coach/startChat';

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

export default function About() {
  const navigate = useNavigate();
  const coachName = useCoachName();
  const startChat = useStartChat();

  return (
    <div className="ui-root">
      <DesignHeader />

      <style>{`
        .about-page {
          max-width: var(--content-max);
          margin: 0 auto;
          padding: var(--space-6) var(--page-x-phone) var(--space-6);
          box-sizing: border-box;
          text-align: center;
        }

        .ui-root .about-page .ds-page-header {
          text-align: left;
        }

        @media (min-width: 769px) {
          .about-page {
            padding: var(--space-6) var(--page-x-desktop) var(--space-6);
          }
        }

        .about-two {
          display: grid;
          grid-template-columns: 1fr;
          margin: var(--space-5) auto 0;
          max-width: 720px;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }

        @media (min-width: 769px) {
          .about-two {
            grid-template-columns: 1fr 1fr;
            margin-top: var(--space-6);
          }
        }

        .about-two p {
          margin: 0;
          padding: var(--space-4) 4px;
          font-size: var(--fs-body);
          line-height: 1.7;
          color: var(--text-2);
          text-align: center;
          border-top: 1px solid var(--line);
        }

        .about-two p:first-child {
          border-top: 0;
        }

        @media (min-width: 769px) {
          .about-two p {
            padding: var(--space-5) var(--space-4);
            border-top: 0;
          }

          .about-two p + p {
            border-left: 1px solid var(--line);
          }
        }

        .about-by {
          margin-top: var(--space-6);
        }

        .about-by-label {
          display: block;
          font-family: var(--font-body);
          font-weight: 400;
          letter-spacing: normal;
          font-size: var(--fs-meta);
          color: var(--label);
          margin-bottom: var(--space-3);
        }

        .about-by p {
          margin: 0 auto 14px;
          max-width: 44ch;
          font-size: 17px;
          line-height: 1.65;
          color: var(--text);
        }

        .about-by p:last-of-type {
          margin-bottom: var(--space-5);
        }

        .about-actions {
          display: flex;
          justify-content: center;
          margin-top: var(--space-5);
        }

        .about-footer {
          margin-top: var(--space-6);
          padding-top: var(--space-3);
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: center;
        }
      `}</style>

      <div className="about-page">
        <PageHeader
          title="About The Clarity Portal"
          info={pageText.about}
        />

        <div className="about-two">
          <p>This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.</p>
          <p>The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.</p>
        </div>

        <div className="about-by">
          <span className="about-by-label">Created by The Clarity Project</span>
          <p>The Clarity Project is a high performance consultancy and coaching practice led by Dr. Tim Dutton, BSc, MSc, DProf, CSCS.</p>
          <p>Tim is a trusted advisor to CEOs and head coaches in professional sport, supporting them to navigate the high-pressure demands of their roles.</p>
          <a
            className="ds-btn ds-btn--outline"
            href="https://theclarityproject.co.uk/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit The Clarity Project
            <ExternalLinkIcon />
          </a>
          <div className="about-actions">
            {coachName && (
              <Button variant="primary" onClick={startChat}>{`Chat to ${coachName}`}</Button>
            )}
          </div>
        </div>

        <div className="about-footer">
          <BackLink onClick={() => navigate('/welcome')} label="Back to Home" />
        </div>
      </div>
    </div>
  );
}
