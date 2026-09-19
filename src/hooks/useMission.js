import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export function useMission() {
  const { user } = useContext(AuthContext);
  const [mission, setMission] = useState('');
  const [showInHeader, setShowInHeader] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchMission = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('personal_goal, show_mission_in_header')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('[useMission] Error:', error);
          setLoading(false);
          return;
        }

        if (data) {
          setMission(data.personal_goal || '');

          // Use Supabase value if available, otherwise default to true
          if (data.show_mission_in_header !== null && data.show_mission_in_header !== undefined) {
            setShowInHeader(data.show_mission_in_header);
          }
        }
      } catch (error) {
        console.error('[useMission] Unexpected error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMission();
  }, [user?.id]);

  const updateVisibility = async (visible) => {
    setShowInHeader(visible);

    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ show_mission_in_header: visible })
          .eq('id', user.id);
      } catch (error) {
        console.error('[useMission] Error updating visibility:', error);
      }
    }
  };

  return {
    mission,
    setMission,
    showInHeader,
    setShowInHeader: updateVisibility,
    loading,
  };
}
