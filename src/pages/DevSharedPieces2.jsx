import { useState } from 'react';
import HistoryList from '../components/ui/HistoryList';
import NameDialog from '../components/ui/NameDialog';
import DeleteDialog from '../components/ui/DeleteDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import { showDeletedToast } from '../components/ui/DeleteDialog';

// ============================================================
// TEMPORARY test page for Build Prompt 5 (shared pieces, part 2).
// HARD-CODED example rows only - no Supabase, nothing fetched. Not
// linked from anywhere in the app. To be removed when prompts 6-10
// wire HistoryList/NameDialog/DeleteDialog into the real My Plans,
// My Reviews and My Journals pages.
// ============================================================

const EXAMPLE_ROWS = [
  { id: '1', title: 'Thursday 1st Oct', typeLabel: 'Daily plan', date: '2026-10-01T08:15:00' },
  { id: '2', title: 'Weekly team sync', typeLabel: 'Meeting plan', date: '2026-09-29T09:30:00' },
  { id: '3', title: 'Presenting to the board', typeLabel: 'If-Then plan', date: '2026-09-27T21:35:00' },
  { id: '4', title: 'Sunday 27th Sep', typeLabel: 'Daily plan', date: '2026-09-27T08:16:00' },
  { id: '5', title: 'Referral partner call', typeLabel: 'Meeting plan', date: '2026-09-28T16:10:00', isDraft: true },
  { id: '6', title: 'Plan review, Fri 2 Oct 2026', typeLabel: 'Plan review', date: '2026-09-26T16:10:00', version: 'Version 4.0' },
  { id: '7', title: 'Saturday 26th Sep', typeLabel: 'Daily plan', date: '2026-09-26T17:28:00' },
  { id: '8', title: 'Reclaiming my time', typeLabel: 'Time audit', date: '2026-09-25T12:55:00', isDraft: true },
  { id: '9', title: 'Hiring a sales lead', typeLabel: 'GROW', date: '2026-09-18T14:08:00' },
  { id: '10', title: 'Feedback for Sam', typeLabel: 'Tough feedback', date: '2026-09-15T13:57:00' },
  { id: '11', title: 'Client escalation call', typeLabel: 'Meeting plan', date: '2026-08-30T10:00:00' },
  { id: '12', title: 'Monday 24th Aug', typeLabel: 'Daily plan', date: '2026-08-24T07:50:00' },
  { id: '13', title: 'Difficult client call', typeLabel: 'If-Then plan', date: '2026-08-20T16:00:00' },
  { id: '14', title: 'Weekly momentum review, week of 17 Aug', typeLabel: 'Weekly momentum review', date: '2026-08-21T17:15:00', meta: '320 words' },
];

const FILTERS = [
  { id: 'Daily plan', label: 'Daily plans' },
  { id: 'Meeting plan', label: 'Meetings' },
  { id: 'If-Then plan', label: 'If-Then plans' },
];

export default function DevSharedPieces2() {
  const [showEmpty, setShowEmpty] = useState(false);
  const [showError, setShowError] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { message, showToast } = useToast();

  const errorProp = showError
    ? { message: 'Could not load this list.', onRetry: () => { setShowError(false); } }
    : null;

  return (
    <div className="ui-root" style={{ minHeight: '100vh', padding: '32px 20px', maxWidth: 820, margin: '0 auto' }}>
      <h1 className="ui-title" style={{ marginBottom: 8 }}>Dev: shared pieces, part 2</h1>
      <p style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)', fontSize: 14, marginBottom: 24 }}>
        Temporary route, hard-coded data only. Not linked anywhere. Remove when the real pages are wired (prompts 6-10).
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        <button type="button" className="ui-btn-ghost" onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? 'Show rows' : 'Show empty state'}
        </button>
        <button type="button" className="ui-btn-ghost" onClick={() => setShowError((v) => !v)}>
          {showError ? 'Show rows' : 'Show error state'}
        </button>
        <button type="button" className="ui-btn-ghost" onClick={() => setNameDialogOpen(true)}>
          Open NameDialog
        </button>
        <button type="button" className="ui-btn-ghost" onClick={() => setDeleteDialogOpen(true)}>
          Open DeleteDialog
        </button>
      </div>

      <HistoryList
        title="My Plans"
        subLine="Every plan and decision you have made, in one history."
        rows={showEmpty ? [] : EXAMPLE_ROWS}
        filters={FILTERS}
        newButton={{ label: 'New plan', onClick: () => showToast('New plan clicked.') }}
        emptyText="When you make one it will appear in this list."
        error={errorProp}
        onOpen={(row) => showToast(`Open: ${row.title}`)}
        onEdit={(row) => showToast(`Edit: ${row.title}`)}
        onDelete={(row) => showToast(`Delete clicked: ${row.title}`)}
      />

      <NameDialog
        open={nameDialogOpen}
        suggestedName="Hiring a sales lead"
        onConfirm={(name) => {
          setNameDialogOpen(false);
          showToast(`Saved as ${name}.`);
        }}
        onCancel={() => setNameDialogOpen(false)}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        title="Delete this plan?"
        body="Hiring a sales lead will be deleted for good. This cannot be undone."
        onConfirm={() => {
          setDeleteDialogOpen(false);
          // Example of the reusable helper every real page should call
          // after its own onConfirm (Supabase delete) resolves, instead
          // of hard-coding "Deleted." per page.
          showDeletedToast(showToast);
        }}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      <Toast message={message} />
    </div>
  );
}
