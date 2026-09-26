import React, { createContext, useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '../lib/supabase';

export const MissionContext = createContext();

export function MissionProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [mission, setMission] = useState('');
  const [showInHeader, setShowInHeader] = useState(true);

  const fetchMission = async () => {
    if (!user) {
      setMission('');
      return;
    }

    try {
      // Fetch from missions table (primary source of truth)
      // Note: New users might not have a mission yet, so don't use .single() which fails on zero rows
      const { data: missionDataArray, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      // Get the first mission if it exists (it's fine if array is empty for new users)
      const missionData = missionDataArray?.[0] || null;

      if (missionData?.title) {
        setMission(missionData.title);
        // Sync to profiles table for consistency
        await supabase
          .from('profiles')
          .update({ personal_goal: missionData.title })
          .eq('id', user.id);
      } else {
        setMission('');
      }

      // Get visibility preference from profiles
      // Note: Don't use .single() here either - handle empty/missing gracefully
      const { data: profileDataArray, error: profileError } = await supabase
        .from('profiles')
        .select('show_mission_in_header')
        .eq('id', user.id)
        .limit(1);

      const profileData = profileDataArray?.[0] || null;
      if (profileData?.show_mission_in_header !== null && profileData?.show_mission_in_header !== undefined) {
        setShowInHeader(profileData.show_mission_in_header);
      }
    } catch (error) {
      console.error('Error fetching mission:', error);
    }
  };

  useEffect(() => {
    fetchMission();
  }, [user?.id]);

  const updateMission = async (newMission, visible) => {
    setMission(newMission);
    setShowInHeader(visible !== undefined ? visible : showInHeader);

    if (user) {
      try {
        // Update profiles table
        await supabase
          .from('profiles')
          .update({
            personal_goal: newMission,
            show_mission_in_header: visible !== undefined ? visible : showInHeader
          })
          .eq('id', user.id);

        // Also sync to missions table
        // Don't use .single() - handle the case where no mission exists yet
        const { data: existingMissionArray } = await supabase
          .from('missions')
          .select('*')
          .eq('user_id', user.id)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const existingMission = existingMissionArray?.[0] || null;

        if (existingMission) {
          // Update existing mission
          await supabase
            .from('missions')
            .update({ title: newMission })
            .eq('id', existingMission.id);
        } else {
          // Create new mission if none exists
          await supabase
            .from('missions')
            .insert([{ user_id: user.id, title: newMission }]);
        }
      } catch (error) {
        console.error('Error updating mission:', error);
      }
    }
  };

  return (
    <MissionContext.Provider value={{ mission, showInHeader, setShowInHeader, updateMission, refetchMission: fetchMission }}>
      {children}
    </MissionContext.Provider>
  );
}
