import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionPanel, PerformanceSystem } from './design';
import { usePlanPage } from '../lib/performance/hooks';
import { saveSharing } from '../lib/performance/api';

// The header's My Mission panel for someone with an Individual Performance
// Plan (M1 mpanel): the plan's mission, its objectives with their figures,
// the score this week so far (hidden in Recovery), the system link and
// "Open my plan". It shares the plan page's copy on the device, so it
// opens at once. Mounted the first time the pill is tapped, so pages that
// never open it never load the plan.
export default function PlanMissionPanel({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { view, setData } = usePlanPage(userId);
  const [system, setSystem] = useState(false);

  const who = !view?.coachName
    ? { audience: 'me' }
    : {
      audience: view.missionShared ? 'coach' : 'me',
      coachName: view.coachName,
      name: 'Your mission',
      onChange: async (next) => {
        const isOn = next === 'coach';
        await saveSharing(userId, 'mission', isOn);
        setData((d) => ({
          ...d,
          switches: [...(d.switches || []).filter((s) => s.part !== 'mission'), { part: 'mission', is_on: isOn }],
        }));
      },
    };

  return (
    <>
      <MissionPanel
        open={open}
        onClose={onClose}
        mission={view?.mission || ''}
        objectives={view?.objectives || []}
        score={view && !view.inRecovery ? view.weekScore : null}
        who={who}
        onSystemLink={() => { onClose(); setSystem(true); }}
        onOpenPlan={() => { onClose(); navigate('/performance-plan'); }}
      />
      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
    </>
  );
}
