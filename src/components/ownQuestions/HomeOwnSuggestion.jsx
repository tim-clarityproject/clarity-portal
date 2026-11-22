import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chevron } from '../design';
import { homeSuggestionLine, waitingSuggestions } from '../../lib/ownQuestions/model';
import { seeSuggestion, useOwnQuestions } from '../../lib/ownQuestions/store';
import './ownQuestions.css';

// Home: "See the question Tim suggested", one quiet link under the
// suggested card, shown once (mock-up "Your own questions", version 3). The
// coach's first name comes from the suggestion itself. It opens My
// Account at the suggestion; it never sits inside a tool.
export default function HomeOwnSuggestion({ userId }) {
  const navigate = useNavigate();
  const own = useOwnQuestions(userId);
  // The one to show is chosen once for this visit, so marking it seen
  // doesn't take it away while it is on the screen.
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (shown) return;
    const next = waitingSuggestions(own.suggestions).find((s) => !s.homeSeenAt);
    if (next) {
      setShown(next);
      seeSuggestion(userId, next.id).catch(() => null);
    }
  }, [own.suggestions, shown, userId]);
  if (!shown) return null;
  return (
    <div className="oq-home">
      <button type="button" className="oq-go" onClick={() => navigate('/my-account#own-questions')}>
        <span>{homeSuggestionLine(shown)}</span>
        <Chevron direction="right" size="sm" beside="words" />
      </button>
    </div>
  );
}
