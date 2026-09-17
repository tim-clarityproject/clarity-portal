import { useEffect, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export const useLoadDecision = (updateFormDataFn) => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  useEffect(() => {
    if (!decisionId || !user || !updateFormDataFn) return;

    const loadDecision = async () => {
      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching decision:', error);
          return;
        }

        if (data && data.form_data) {
          const formDataLoaded = data.form_data;
          Object.keys(formDataLoaded).forEach(key => {
            updateFormDataFn(key, formDataLoaded[key]);
          });
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      }
    };

    loadDecision();
  }, [decisionId, user?.id, updateFormDataFn]);
};
