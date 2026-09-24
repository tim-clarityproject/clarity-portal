import { createContext, useState, useEffect, useCallback } from 'react';

// Single source of truth for multi-step form state, decision tracking, and dirty field detection
export const FormContext = createContext();

const DEFAULT_FORM_DATA = {
  goal: '',
  risks: [],
  strategies: [],
  factors: [],
  projects: [],
  matrix: {},
  progress: {},
  ratings: {},
};

export function FormProvider({ children }) {
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [loadedDecisionId, setLoadedDecisionId] = useState(null);
  const [dirtyFields, setDirtyFields] = useState(new Set());

  // Clean up any old localStorage data on provider mount
  // FormContext now manages in-progress data only, not cross-session persistence
  useEffect(() => {
    localStorage.removeItem('clarity_form_data');
  }, []);

  const updateFormData = useCallback((key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const getFieldValue = useCallback((key) => {
    return formData[key] !== undefined ? formData[key] : (DEFAULT_FORM_DATA[key] || '');
  }, [formData]);

  const markDirty = useCallback((fieldName) => {
    setDirtyFields((prev) => new Set(prev).add(fieldName));
  }, []);

  const clearDirty = useCallback(() => {
    setDirtyFields(new Set());
  }, []);

  const isDirty = useCallback((fieldName) => {
    return dirtyFields.has(fieldName);
  }, [dirtyFields]);

  const clearFormData = useCallback(() => {
    setFormData(DEFAULT_FORM_DATA);
    setDirtyFields(new Set());
  }, []);

  const resetField = useCallback((key) => {
    setFormData((prev) => ({
      ...prev,
      [key]: DEFAULT_FORM_DATA[key] || '',
    }));
  }, []);

  return (
    <FormContext.Provider value={{
      formData,
      updateFormData,
      getFieldValue,
      clearFormData,
      resetField,
      loadedDecisionId,
      setLoadedDecisionId,
      markDirty,
      clearDirty,
      isDirty,
    }}>
      {children}
    </FormContext.Provider>
  );
}
