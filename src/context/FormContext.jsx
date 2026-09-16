import { createContext, useState, useEffect } from 'react';

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

  // Clean up any old localStorage data on provider mount
  // FormContext now manages in-progress data only, not cross-session persistence
  useEffect(() => {
    localStorage.removeItem('clarity_form_data');
  }, []);

  const updateFormData = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const getFieldValue = (key) => {
    return formData[key] !== undefined ? formData[key] : (DEFAULT_FORM_DATA[key] || '');
  };

  const clearFormData = () => {
    setFormData(DEFAULT_FORM_DATA);
  };

  const resetField = (key) => {
    setFormData((prev) => ({
      ...prev,
      [key]: DEFAULT_FORM_DATA[key] || '',
    }));
  };

  return (
    <FormContext.Provider value={{ formData, updateFormData, getFieldValue, clearFormData, resetField }}>
      {children}
    </FormContext.Provider>
  );
}
