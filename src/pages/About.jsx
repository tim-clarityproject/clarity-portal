import { useNavigate } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { Button, Card, MoreLink, keepWords, useCoachName, PageOpening } from '../components/design';
import { useStartChat } from '../components/coach/startChat';
import { B1_LINES } from '../content/pageLines/client';
import './hubs/clientPage.css';

// About The Clarity Portal (Polish 1, Stage B): the page opening, with Chat to [coach] as its one
// main button when there is a coach, then two cards in the reference's rhythm: what the portal is
// for, and who made it, with the website as a quiet link that opens more.
export default function About() {
  const coachName = useCoachName();
  const startChat = useStartChat();
  const navigate = useNavigate();

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="cp-page about-page">
        <PageOpening
          title="About The Clarity Portal"
          line={B1_LINES.about}
          action={coachName && startChat ? <Button variant="primary" onClick={startChat}>{`Chat to ${coachName}`}</Button> : null}
        />

        <Card label="What it’s for" className="about-card">
          {/* "high-performer" and "high-performance" always with the hyphen, never broken across a line (rule 29x): keepWords. */}
          <p>{keepWords('This is the place for high-performers who want to stay fully-engaged with their own thinking and make decisions with clarity and genuine conviction.')}</p>
          <p>The tools found here are designed to scaffold your thinking, increase your daily intentionality, and drive your performance through true reflection.</p>
          {/* How it works (Draft 9; Stage D item 8): the public page's words, inside the portal. */}
          <MoreLink onClick={() => navigate('/about/how-it-works')}>How it works</MoreLink>
        </Card>

        <Card label="Created by The Clarity Project" className="about-card">
          <p>{keepWords('The Clarity Project is a high-performance consultancy and coaching practice led by Dr. Tim Dutton, BSc, MSc, DProf, CSCS.')}</p>
          <p>{keepWords('Tim is a trusted advisor to CEOs and head coaches in professional sport, supporting them to navigate the high-pressure demands of their roles.')}</p>
          <MoreLink href="https://theclarityproject.co.uk/" target="_blank" rel="noopener noreferrer">
            Visit the website<span className="ds-sr"> of The Clarity Project (opens in a new tab)</span>
          </MoreLink>
        </Card>
      </div>
    </div>
  );
}
