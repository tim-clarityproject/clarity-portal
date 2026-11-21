import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/design';
import { networkCountsOf, networkPageOf, saveNetworkPerson, useNetworkVersion } from '../../lib/coach/networkData';
import { networkProblem, todayDueQuery } from '../../lib/coach/network';
import { useCoachPortal } from './parts';

// Network's shared hooks (Phase 6a run 4, step 4). Network's people are
// never loaded whole: every part asks networkData.js for one page, the
// map's 150, the counts or one person, and asks again when Network changes
// on this device (useNetworkVersion), so Actions, the table, the map, the
// menu's count and Today update together.

/**
 * Asks Network something and asks again whenever Network changes.
 * `ask`: a function that resolves the answer, or null to ask nothing (an
 * associate never asks). The last answer stays on screen while the next
 * one is on its way.
 * @returns {{ data: any, error: Error|null, loading: boolean }}
 */
export function useNetworkAsk(ask, deps) {
  const version = useNetworkVersion();
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(ask) });
  const turn = useRef(0);
  useEffect(() => {
    if (!ask) { setState({ data: null, error: null, loading: false }); return undefined; }
    turn.current += 1;
    const mine = turn.current;
    Promise.resolve().then(ask)
      .then((data) => { if (mine === turn.current) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (mine === turn.current) setState((s) => ({ data: s.data, error, loading: false })); });
    return () => { turn.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return state;
}

/** The counts ({ active, archived, due, ready }): the owner's alone. `on` false asks nothing (the menu while it is shut). */
export function useNetworkCounts(on = true) {
  const { userId, isOwner, todayKey } = useCoachPortal();
  const asks = on && isOwner && userId;
  return useNetworkAsk(asks ? () => networkCountsOf(userId, todayKey) : null, [asks, userId, todayKey]);
}

/** Today's people due a catch-up (the three most overdue, and how many in all): the owner's alone. */
export function useNetworkDue() {
  const { userId, isOwner, todayKey } = useCoachPortal();
  const asks = isOwner && userId;
  return useNetworkAsk(asks ? () => networkPageOf(userId, todayDueQuery(todayKey)) : null, [asks, userId, todayKey]).data;
}

/**
 * Saving, the one way: the change is kept, the toast says so with Undo for
 * 10 seconds ("Will sync" while it waits for a connection), and a refusal
 * is said calmly, never in the database's own words.
 */
export function useNetworkActions() {
  const { userId } = useCoachPortal();
  const toast = useToast();
  /** `run` resolves 'saved', 'queued' or 'device'; `undo` puts it back. Resolves whether it was kept. */
  const act = useCallback(async ({ run, message, undo = null, after = null }) => {
    try {
      const status = await run();
      const onUndo = undo ? async () => { try { await undo(); } catch (e) { toast.error(networkProblem(e)); } } : undefined;
      if (onUndo) toast.saved({ message: status === 'queued' ? 'Will sync' : message, long: true, onUndo }); else toast.show(status === 'queued' ? 'Will sync' : message);
      after?.();
      return true;
    } catch (e) {
      toast.error(networkProblem(e));
      return false;
    }
  }, [toast]);
  /** A plan from network.js ({ patch, undo, toast } | { error } | null): saved, or handed back with its calm line. */
  const change = useCallback(async (plan, hooks = {}) => {
    if (!plan) return true;
    if (plan.error) return plan;
    return act({ run: () => saveNetworkPerson(userId, plan.patch), message: plan.toast, undo: () => saveNetworkPerson(userId, plan.undo), ...hooks });
  }, [act, userId]);
  return { act, change, userId };
}

export const Problem = ({ line }) => (line ? <p className="cc-problem" role="alert">{line}</p> : null);
