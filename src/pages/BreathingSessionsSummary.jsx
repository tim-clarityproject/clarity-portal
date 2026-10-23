import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { parseDbTimestamp, formatDayMonthTime } from '../lib/dateFormatter';
import { TECHNIQUES, loadBreathingSessions, deleteBreathingSession, formatSessionLength } from '../lib/breathing';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import { EmptyState, Loading, PageHeader, useToast } from '../components/design';
import pageText from '../content/pageText';

function formatMonthHeading(value) {
  const date = parseDbTimestamp(value);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function BreathingSessionsSummary() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const data = await loadBreathingSessions(user.id);
      setSessions(data);
    } catch (error) {
      console.error('[BreathingSessionsSummary] load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleDelete = async () => {
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteBreathingSession(user.id, id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.show('Session deleted.');
    } catch (error) {
      console.error('[BreathingSessionsSummary] delete failed:', error);
      toast.error('Could not delete. Please try again.');
    }
  };

  const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <Loading label="Loading your sessions" className="ds-loading--page" />
      </div>
    );
  }

  let lastMonth = '';

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/breathe')} label="Back to Breathe" /></div>

        <div className="plan-summary-head">
          <PageHeader title="Breathing Sessions" info={pageText.breathingSessionsSummary} />
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            question="No sessions yet. Start a session and it will appear here."
            action={{ label: 'Start breathing', onClick: () => navigate('/breathe') }}
          />
        ) : (
          <>
            <div className="tsa-total" style={{ marginBottom: 'var(--space-5)' }}>
              <span>Sessions</span>
              <b>{sessions.length}</b>
            </div>
            <div className="tsa-total" style={{ marginBottom: 'var(--space-5)' }}>
              <span>Total time</span>
              <b>{totalHours}h {totalMins}m</b>
            </div>

            {sessions.map((s) => {
              const mm = formatMonthHeading(s.date);
              const showMonth = mm !== lastMonth;
              lastMonth = mm;
              const length = formatSessionLength(s.duration);
              return (
                <div key={s.id}>
                  {showMonth && <p className="hlist-month" style={{ marginTop: 'var(--space-4)' }}>{mm}</p>}
                  <div className="pop-version-row">
                    <span>
                      <span className="pop-version-label">{TECHNIQUES[s.breathing_mode]?.label || s.breathing_mode}</span>
                      <span className="pop-version-date" style={{ display: 'block' }}>{formatDayMonthTime(s.date)}{length ? ` · ${length}` : ''}</span>
                    </span>
                    <button type="button" className="plan-bin-btn" aria-label="Delete session" onClick={() => setDeleteTarget(s.id)}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete this session?"
        body="This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
