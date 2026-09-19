import React, { createContext, useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '../lib/supabase';

export const MissionContext = createContext();

export function MissionProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [mission, setMission] = useState('');
  const [showInHeader, setShowInHeader] = useState(true);

  useEffect(() => {
    if (!user) {
      setMission('');
      return;
    }

    const fetchMission = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('personal_goal, show_mission_in_header')
          .eq('id', user.id)
          .single();

        if (data?.personal_goal) {
          setMission(data.personal_goal);
        }

        if (data?.show_mission_in_header !== null && data?.show_mission_in_header !== undefined) {
          setShowInHeader(data.show_mission_in_header);
        }
      } catch (error) {
        console.error('Error fetching mission:', error);
      }
    };

    fetchMission();
  }, [user?.id]);

  const updateMission = async (newMission, visible) => {
    setMission(newMission);
    setShowInHeader(visible !== undefined ? visible : showInHeader);

    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({
            personal_goal: newMission,
            show_mission_in_header: visible !== undefined ? visible : showInHeader
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating mission:', error);
      }
    }
  };

  return (
    <MissionContext.Provider value={{ mission, showInHeader, setShowInHeader, updateMission }}>
      {children}
    </MissionContext.Provider>
  );
}
