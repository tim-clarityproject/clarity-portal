import { useEffect, useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';

/**
 * Unified hook for loading decision data in multi-step workflows.
 * Ensures single source of truth: FormContext is hydrated with full data.
 * Only loads in edit mode (when decisionId is present).
 *
 * @param {string[]} fields - Array of field names to extract (e.g., ['constraints', 'opportunities'])
 * @returns {object} { isLoading, isEditMode, values } where values is keyed by field name
 */
export const useLoadDecisionStep = (fields = []) => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { updateFormData, getFieldValue } = useContext(FormContext);
  const [isLoading, setIsLoading] = useState(false);

  const decisionId = location.state?.decisionId;
  const isEditMode = !!decisionId;

  useEffect(() => {
    // Only load in edit mode
    if (!isEditMode || !user) {
      setIsLoading(false);
      return;
    }

    const loadDecision = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching decision:', error);
          setIsLoading(false);
          return;
        }

        if (data && data.form_data) {
          // Update FormContext with ALL fields from form_data
          // This ensures FormContext is single source of truth
          Object.keys(data.form_data).forEach(key => {
            updateFormData(key, data.form_data[key]);
          });
        }
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [decisionId, user?.id, isEditMode, updateFormData]);

  // Return current field values from FormContext
  const values = {};
  fields.forEach(field => {
    values[field] = getFieldValue(field);
  });

  return {
    isLoading,
    isEditMode,
    ...values,
  };
};
