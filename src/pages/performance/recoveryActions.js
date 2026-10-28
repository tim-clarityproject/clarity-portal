import { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../components/design';
import { changeRecovery, startRecovery } from '../../lib/performance/api';
import { noteRecoveryOnDevice } from '../../lib/performance/hooks';
import { endValues, extendValues, recoveryRow } from '../../lib/performance/recovery';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';

// What every Recovery screen can do (M15), in one place: start it, add
// days to it and end it ("I'm ready to go again"). Each change is sent
// through the offline queue and every page's copy on the device learns it
// at once, so the sprint, the plan and the year show it straight away,
// offline too. A second tap while one is under way does nothing.

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

export function useRecoveryActions({ setData } = {}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const busy = useRef(false);
  const [working, setWorking] = useState(false);

  const run = async (row, send, after) => {
    if (busy.current || !userId) return;
    busy.current = true;
    setWorking(true);
    try {
      await send();
      noteRecoveryOnDevice(userId, row);
      setData?.((d) => (d ? { ...d, recoveries: [...(d.recoveries || []).filter((r) => r.id !== row.id), row] } : d));
      after();
    } catch (e) {
      // Another Recovery is already open (a second device, or a resend):
      // the pages load it fresh.
      if (e?.code === '23505') {
        navigate('/recovery/today', { replace: true });
        return;
      }
      toast.error(friendlyError(e, SAVE_ERROR));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  /** "Start my recovery". */
  const start = ({ sprintId, today, days, letCoachKnow }) => {
    const row = { ...recoveryRow({ id: newId(), userId, sprintId, today, days, letCoachKnow }), ended_at: null, end_on: null };
    return run(row, () => startRecovery(userId, row), () => {
      toast.show('Your recovery week has started.');
      navigate('/recovery/today', { replace: true });
    });
  };

  /** "Add the days". */
  const extend = (open, more, today) => {
    const row = { ...open, ...extendValues(open, more, today) };
    return run(row, () => changeRecovery(userId, open.id, { extended_days: row.extended_days }), () => {
      toast.show('Your recovery now ends a few days later.');
      navigate('/recovery/today', { replace: true });
    });
  };

  /** "I'm ready to go again" or "Pick up my sprint": back to the sprint, welcomed back. */
  const end = (open, today) => {
    const values = endValues(open, today);
    const row = { ...open, ...values };
    return run(row, () => changeRecovery(userId, open.id, values), () => {
      navigate('/performance-sprint', { replace: true });
    });
  };

  return { start, extend, end, working, userId };
}
