import { useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getLocalDateKey } from '../lib/dateFormatter';
import { useCachedLoad } from '../lib/pageCache';
import { savedItemRef } from '../lib/savedItemDelete';
import { useOnline } from '../lib/connection';
import { FIRST_OPEN_OFFLINE } from '../lib/friendlyError';
import { listFilters, planRows } from '../lib/savedItems';
import { loadSavedPlans, SAVED_PLANS_CACHE } from '../lib/savedItemsApi';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import HistoryList from '../components/ui/HistoryList';
import { Loading, PageHeader, useToast } from '../components/design';

// My Plans (Phase 4 step 4; decisions part 1 "My Plans and My Reviews"):
// one list of every saved plan across the three areas, old and new, named
// in words (writing rule 60, src/lib/savedItems.js), with the area behind
// the one Filter button. The old My decisions list (/decision-history)
// joined it. ?area=personal|interpersonal|strategic opens it filtered,
// with &tool= or &team= for the second choice (the hubs' links).
//
// Old tools keep their own delete (no Undo there before either) and edit.
// The plan, the sprint, the day plans and the old Personal Operating Plan
// open their own pages, where they are changed; they have no bin here.

export default function MyPlans() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const toast = useToast();

  // Instant page (Tim, 26 Oct): the plans shown last time appear at once
  // from the device, then refresh quietly in the background.
  const loaded = useCachedLoad({ userId: user?.id, name: SAVED_PLANS_CACHE, load: () => loadSavedPlans(user.id) });
  const online = useOnline();
  const today = getLocalDateKey();
  const rows = useMemo(() => planRows(loaded.data, today), [loaded.data, today]);
  const { filters, subFilters, subLabels } = useMemo(() => listFilters(rows), [rows]);
  const query = new URLSearchParams(location.search);
  const isLoading = loaded.loading;
  const error = loaded.error && !loaded.data
    ? { message: online ? 'Your plans didn’t load. Check your connection and try again.' : FIRST_OPEN_OFFLINE, onRetry: loaded.reload }
    : null;

  // A Discard on an old tool's step lands here (it used to land on My
  // decisions) with a one-shot toast: shown once, then the state cleared.
  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (to) => to && navigate(to.path, to.state ? { state: to.state } : undefined);
  // Opening a row takes the row along, so the opened item can delete
  // itself (SavedItemActions) and come back here.
  const open = (row) => row.to && navigate(row.to.path, {
    state: { ...(row.to.state || {}), savedItem: { ...savedItemRef(row), from: `${location.pathname}${location.search}` } },
  });

  const reviewRow = (row) => {
    if (row.reviewed) {
      navigate('/review-plan-summary', { state: { entryId: row.reviewEntryId, planKind: row.raw.tool_type, plan: row.raw } });
    } else {
      navigate('/review-plan', { state: { planKind: row.raw.tool_type, plan: row.raw } });
    }
  };


  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        {isLoading ? (
          <>
            <PageHeader title="My Plans" info={pageText.myPlans} />
            <Loading label="Loading your plans" className="ds-loading--page" />
          </>
        ) : (
          <HistoryList
            title="My Plans"
            pageKey="myPlans"
            rows={rows}
            filters={filters}
            subFilters={subFilters}
            subLabels={subLabels}
            filterLabel="Which area?"
            initialFilter={query.get('area') || 'all'}
            initialSubFilter={query.get('team') || query.get('tool') || 'all'}
            search={{ label: 'Search my plans', placeholder: 'Search by name or tool' }}
            initialSearch={query.get('q') || ''}
            newButton={{ label: 'New plan', onClick: () => navigate('/personal/plan') }}
            emptyText="No plans yet."
            error={error}
            onOpen={open}
            onEdit={(row) => go(row.edit || row.to)}
            onReview={reviewRow}
          />
        )}
      </div>

    </div>
  );
}
