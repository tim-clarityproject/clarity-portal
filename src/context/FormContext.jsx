import { createContext, useState, useEffect } from 'react';

export const FormContext = createContext();

const STORAGE_KEY = 'clarity_form_data';
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

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_FORM_DATA;
  } catch (e) {
    console.error('Failed to load form data from localStorage:', e);
    return DEFAULT_FORM_DATA;
  }
}

export function FormProvider({ children }) {
  const [formData, setFormData] = useState(loadFromStorage);

  // Persist to localStorage whenever formData changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

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
