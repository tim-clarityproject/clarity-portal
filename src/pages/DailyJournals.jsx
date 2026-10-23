import { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey, formatPlainDayLabel } from '../lib/dateFormatter';
import { loadAllJournals, deleteJournal, wordCount } from '../lib/dailyJournal';
import DesignHeader from '../components/DesignHeader';
import HistoryList from '../components/ui/HistoryList';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import { Loading } from '../components/design';

const FILTERS = [
  { id: 'final', label: 'Saved', match: (r) => !r.isDraft },
  { id: 'draft', label: 'Drafts', match: (r) => r.isDraft },
];

export default function DailyJournals() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [journals, setJournals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { message, showToast } = useToast();

  const load = async () => {
    setError(null);
    try {
      const data = await loadAllJournals(user.id);
      setJournals(data);
    } catch (err) {
      console.error('[DailyJournals] load failed:', err);
      setError({ message: 'Could not load your journals.', onRetry: load });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayKey = getLocalDateKey(new Date());
  const hasTodayRow = journals.some((j) => j.journal_date === todayKey);

  const rows = journals.map((j) => ({
    id: j.id,
    title: formatPlainDayLabel(j.journal_date),
    typeLabel: 'Daily Journal',
    date: j.created_at,
    isDraft: j.status === 'draft',
    meta: `${wordCount(j.body)} word${wordCount(j.body) === 1 ? '' : 's'}`,
    journalDate: j.journal_date,
  }));

  const openRow = (row) => {
    if (row.isDraft) {
      navigate('/daily-journal', { state: { date: row.journalDate } });
    } else {
      navigate(`/daily-journals/${row.journalDate}`);
    }
  };

  const editRow = (row) => navigate('/daily-journal', { state: { date: row.journalDate } });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteJournal(user.id, id);
      setJournals((prev) => prev.filter((j) => j.id !== id));
      showToast('Journal deleted.');
    } catch (err) {
      console.error('[DailyJournals] delete failed:', err);
      showToast('Could not delete - please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <Loading label="Loading your journals" className="ds-loading--page" />
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <HistoryList
          title="My Journals"
          pageKey="dailyJournals"
          rows={rows}
          filters={FILTERS}
          newButton={{ label: hasTodayRow ? 'Continue today' : 'New journal', onClick: () => navigate('/daily-journal') }}
          emptyText="Nothing here. Your first journal is one tap away."
          error={error}
          onOpen={openRow}
          onEdit={editRow}
          onDelete={(row) => setDeleteTarget(row)}
        />
      </div>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete this journal?"
        body="It will be deleted for good and removed from My Reviews. This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
