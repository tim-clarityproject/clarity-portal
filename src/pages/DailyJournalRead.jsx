import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { formatPlainDayLabel } from '../lib/dateFormatter';
import { loadJournalByDate, deleteJournal, wordCount } from '../lib/dailyJournal';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import { Loading } from '../components/design';

export default function DailyJournalRead() {
  const navigate = useNavigate();
  const { date } = useParams();
  const { user } = useContext(AuthContext);
  const [journal, setJournal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { message, showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await loadJournalByDate(user.id, date);
        if (!cancelled) setJournal(row);
      } catch (error) {
        console.error('[DailyJournalRead] load failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, user?.id]);

  const handleDelete = async () => {
    try {
      await deleteJournal(user.id, journal.id);
      navigate('/daily-journals', { state: { toast: 'Journal deleted.' } });
    } catch (error) {
      console.error('[DailyJournalRead] delete failed:', error);
      setDeleteOpen(false);
      showToast('Could not delete - please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <Loading label="Loading your journal" className="ds-loading--page" />
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page">
          <div className="plan-back-row"><BackLink onClick={() => navigate('/daily-journals')} label="Back to My Journals" /></div>
          <p className="ui-subtitle">Journal not found.</p>
        </div>
      </div>
    );
  }

  const dateObj = new Date(`${journal.journal_date}T00:00:00`);
  const words = wordCount(journal.body);

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/daily-journals')} label="Back to My Journals" /></div>

        <span className="plan-overline">Daily Journal</span>
        <h1 className="jrn-date">{formatPlainDayLabel(dateObj)}<small>{dateObj.getFullYear()}</small></h1>
        <p className="jrn-sub">{words} word{words === 1 ? '' : 's'}</p>

        <div className="jrn-paper-wrap">
          {(journal.body || []).map((b, i) => (
            b.t === 'p' ? (
              <div className="jrn-qrow" key={i}>
                <span className="jrn-qdash" aria-hidden="true" />
                <span className="jrn-qtext">{b.v}</span>
              </div>
            ) : (
              <div className="jrn-paper jrn-paper--read" key={i}>{b.v}</div>
            )
          ))}
        </div>

        <div className="plan-actions">
          <button type="button" className="ui-btn-ghost" onClick={() => navigate('/daily-journal', { state: { date: journal.journal_date } })}>
            Edit journal
          </button>
        </div>

        <div className="plan-discard-row">
          <button type="button" className="plan-link-btn" onClick={() => setDeleteOpen(true)}>
            Delete journal
          </button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        title="Delete this journal?"
        body="It will be deleted for good and removed from My Reviews. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <Toast message={message} />
    </div>
  );
}
