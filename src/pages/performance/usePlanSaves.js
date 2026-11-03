import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/design';
import { useQueueState } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import {
  archivePlanRow,
  deletePlanRow,
  recordPlanVersion,
  savePlan,
  saveHabit,
  saveObjective,
  saveStrategy,
  saveStrategyLink,
  saveWorkingDays,
} from '../../lib/performance/api';
import {
  applySave,
  draftFromRows,
  keepUnfinished,
  planSaves,
  rowsSnapshot,
  savableRows,
  snapshotIds,
} from '../../lib/performance';

// How the Individual Performance Plan saves as you go, and keeps its
// versions: one engine for Build your plan, Edit my plan (PlanBuilder) and
// changing one part on the plan page (PlanPartPanel; Tim, 3 Nov), so every
// change saves and makes its version the same way.
//
// Everything saves as you go (Saving, Saved, Will sync offline): each
// change is written once it is complete enough for the tables, and until
// then it waits in the draft. A version is kept by keepVersion (when the
// editor is left after a change), major or minor by the rules in
// versions.js.
//
// data:    the rows from loadPlanEditor
// draft:   the draft as it stands (the page holds it)
// initial: the draft it started from: nothing is written until it changes
// today:   the person's local day

const SYNC_AFTER_MS = 700;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

export default function usePlanSaves({ userId, data, draft, initial, today }) {
  const toast = useToast();
  const queue = useQueueState();
  const savedRef = useRef(savableRows(draftFromRows(data, { planId: initial.planId }), today));
  const planExistsRef = useRef(Boolean(data.plan));
  const versionRef = useRef({
    major: data.plan?.major ?? 1,
    minor: data.plan?.minor ?? 0,
    snapshot: data.latestVersion?.snapshot ?? null,
  });
  const inVersion = useMemo(() => snapshotIds(data.latestVersion?.snapshot), [data.latestVersion]);
  const draftRef = useRef(draft);
  const [saveState, setSaveState] = useState('idle');
  const running = useRef(null);
  const again = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const send = useCallback(async (op) => {
    const planId = draftRef.current.planId;
    switch (op.kind) {
      case 'plan': return savePlan(userId, { id: op.row.id, mission: op.row.mission || null }).save;
      case 'objective': return saveObjective(userId, planId, op.row).save;
      case 'strategy': return saveStrategy(userId, planId, op.row).save;
      case 'habit': return saveHabit(userId, planId, op.row).save;
      case 'link': return saveStrategyLink(userId, op.link.strategyId, op.link.objectiveId, op.serves);
      case 'days': return saveWorkingDays(userId, today, op.days);
      case 'archive': return archivePlanRow(userId, op.table, op.id);
      case 'delete': return deletePlanRow(userId, op.table, op.id);
      default: return null;
    }
  }, [userId, today]);

  // Sends whatever the draft says that the database doesn't hold yet, one
  // save at a time and in order. A change made while saving is sent next.
  const sync = useCallback(() => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const work = (async () => {
      let queued = false;
      let sent = false;
      do {
        again.current = false;
        // A part still being typed keeps its saved version (keepUnfinished).
        const want = keepUnfinished(savableRows(draftRef.current, today), savedRef.current, draftRef.current);
        const ops = planSaves(savedRef.current, want, { planExists: planExistsRef.current, inVersion });
        if (ops.length) {
          sent = true;
          setSaveState('saving');
        }
        for (const op of ops) {
          const result = await send(op);
          if (result?.status === 'queued') queued = true;
          savedRef.current = applySave(savedRef.current, op);
          if (op.kind === 'plan') planExistsRef.current = true;
        }
      } while (again.current);
      if (sent) setSaveState(queued ? 'offline' : 'saved');
    })();
    running.current = work;
    return work.catch((e) => {
      setSaveState('failed');
      toast.error(friendlyError(e, SAVE_ERROR));
      throw e;
    }).finally(() => {
      running.current = null;
    });
  }, [send, today, inVersion, toast]);

  // Nothing is written until the person changes something: opening a new
  // plan never creates one (the old mission it starts from included).
  useEffect(() => {
    if (draft === initial) return undefined;
    const timer = setTimeout(() => { sync().catch(() => {}); }, SYNC_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft, initial, sync]);

  // "Will sync" turns to Saved once the queue has sent everything.
  const shownState = saveState === 'offline' && queue.waiting === 0 ? 'saved' : saveState;

  // A version, when the plan changed since its last one (editing), or the
  // first version (finishing a new plan).
  const keepVersion = useCallback(async (first) => {
    const after = rowsSnapshot(savedRef.current);
    const plan = { id: draftRef.current.planId, major: versionRef.current.major, minor: versionRef.current.minor };
    const v = await recordPlanVersion(userId, plan, { before: versionRef.current.snapshot, after, first });
    if (!v.kind) return null;
    versionRef.current = { major: v.major, minor: v.minor, snapshot: after };
    return v;
  }, [userId]);

  return { draftRef, savedRef, planExistsRef, send, sync, keepVersion, shownState, SAVE_ERROR };
}
