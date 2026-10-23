import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { formatPlainDayLabel } from '../lib/dateFormatter';
import { loadJournalByDate, deleteJournal, wordCount } from '../lib/dailyJournal';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import DeleteDialog from '../components/ui/DeleteDialog';
import { Button, Loading, PageHeader, useToast } from '../components/design';

export default function DailyJournalRead() {
  const navigate = useNavigate();
  const { date } = useParams();
  const { user } = useContext(AuthContext);
  const [journal, setJournal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toast = useToast();

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
      toast.error('Could not delete. Please try again.');
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

        <PageHeader
          title={`${formatPlainDayLabel(dateObj)} ${dateObj.getFullYear()}`}
          meta={[`${words} word${words === 1 ? '' : 's'}`]}
        />

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
          <Button variant="outline" onClick={() => navigate('/daily-journal', { state: { date: journal.journal_date } })}>
            Edit journal
          </Button>
        </div>

        <div className="plan-discard-row">
          <Button variant="text" onClick={() => setDeleteOpen(true)}>
            Delete journal
          </Button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        title="Delete this journal?"
        body="It will be deleted for good and removed from My Reviews. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
