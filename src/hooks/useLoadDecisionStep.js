import { useEffect, useContext, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';

/**
 * Unified hook for loading decision data in multi-step workflows.
 *
 * Loading strategy:
 * - Fetches ONLY when decisionId exists AND differs from loadedDecisionId
 * - Uses ref guard to prevent re-running for the same ID
 * - Merges saved data: only hydrates fields that user hasn't modified (not dirty)
 * - Single fetch per unique decisionId in this edit session
 * - Handles errors with manual retry, no auto-retry
 *
 * Records created this session never fetch (they already have their ID and step data in state).
 * True edits from My Decisions fetch once, merge with user edits, and never re-fetch.
 */
export const useLoadDecisionStep = (fields = []) => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const {
    updateFormData,
    getFieldValue,
    loadedDecisionId,
    setLoadedDecisionId,
    markDirty,
    clearDirty,
    isDirty,
    clearFormData,
  } = useContext(FormContext);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadAttemptRef = useRef(new Set()); // Track which IDs we've tried to load

  const decisionId = location.state?.decisionId;

  // When decisionId changes (switching to a different record), reset form and dirty tracking
  useEffect(() => {
    if (decisionId && decisionId !== loadedDecisionId) {
      clearFormData();
    }
  }, [decisionId, loadedDecisionId, clearFormData]);

  // Load decision data - only when decisionId changes and differs from what's loaded
  useEffect(() => {
    // Don't fetch if no decisionId or this is the first render
    if (!decisionId || !user) {
      setIsLoading(false);
      return;
    }

    // Don't fetch if this ID is already loaded
    if (loadedDecisionId === decisionId) {
      setIsLoading(false);
      return;
    }

    // Guard against re-running for the same ID (e.g., AuthContext triggering re-renders)
    if (loadAttemptRef.current.has(decisionId)) {
      return;
    }

    const loadDecision = async () => {
      setIsLoading(true);
      setError(null);
      loadAttemptRef.current.add(decisionId);

      try {
        const { data, error: fetchError } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (fetchError) {
          throw new Error(fetchError.message || 'Failed to load decision');
        }

        if (data && data.form_data) {
          // Merge: only hydrate fields that user hasn't marked as dirty
          Object.keys(data.form_data).forEach((key) => {
            // Only update if field is not dirty (user hasn't changed it)
            if (!isDirty(key)) {
              updateFormData(key, data.form_data[key]);
            }
          });
        }

        // Mark this decision as loaded
        setLoadedDecisionId(decisionId);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading decision:', err);
        setError(err.message || 'Failed to load decision');
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [decisionId, user?.id, loadedDecisionId, updateFormData, isDirty, setLoadedDecisionId]);

  const handleRetry = async () => {
    // Reset the ref so we can attempt to load again
    loadAttemptRef.current.delete(decisionId);
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message || 'Failed to load decision');
      }

      if (data && data.form_data) {
        Object.keys(data.form_data).forEach((key) => {
          if (!isDirty(key)) {
            updateFormData(key, data.form_data[key]);
          }
        });
      }

      setLoadedDecisionId(decisionId);
      setIsLoading(false);
    } catch (err) {
      console.error('Error loading decision on retry:', err);
      setError(err.message || 'Failed to load decision');
      setIsLoading(false);
    }
  };

  // Return current field values from FormContext
  const values = {};
  fields.forEach((field) => {
    values[field] = getFieldValue(field);
  });

  return {
    isLoading,
    isEditMode: !!decisionId,
    error,
    onRetry: handleRetry,
    clearDirty,
    markDirty,
    ...values,
  };
};
