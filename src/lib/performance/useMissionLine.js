import { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MissionContext } from '../../context/MissionContext';
import { AuthContext } from '../../context/AuthContext';
import { useActivePlan } from './hooks';
import { onPlanChanged } from './planChanged';
import { missionAddress } from './missionPlace';

/**
 * The laptop's My Mission line under Home's and the Dashboard's title (walk item 5, 27 Nov; Tim's option C):
 * PageOpening's `mission` props, or undefined when "Show my Mission at the top" is off in My Account. The same
 * Mission as the phone header's box (the active plan's, else the older one), opening the Individual Performance
 * Plan at My Mission (src/lib/performance/missionPlace.js). The line itself only shows from 1024px up.
 */
export function useMissionLine() {
  const navigate = useNavigate();
  const { mission: oldMission, missionKnown, showInHeader } = useContext(MissionContext);
  const { user } = useContext(AuthContext);
  const planLoad = useActivePlan(user?.id);
  const plan = planLoad.data;
  const reload = planLoad.reload;
  useEffect(() => onPlanChanged(() => { reload(); }), [reload]);
  if (!showInHeader) return undefined;
  const mission = plan ? (plan.mission || '') : (oldMission || '');
  const pending = !mission && !plan && (planLoad.loading || !missionKnown);
  const href = missionAddress({ hasPlan: Boolean(plan), hasMission: Boolean(mission) });
  return { mission, pending, href, onClick: () => navigate(href) };
}
