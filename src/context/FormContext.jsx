import { createContext, useState } from 'react';

export const FormContext = createContext();

export function FormProvider({ children }) {
  const [formData, setFormData] = useState({
    goal: '',
    risks: ['', '', ''],
    strategies: ['', '', ''],
    factors: ['', ''],
    projects: ['', ''],
    matrix: {},
    progress: {},
    ratings: {},
    currentPath: null,
  });

  const updateFormData = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const setPath = (path) => {
    // If path changes, reset form data
    if (formData.currentPath && formData.currentPath !== path) {
      setFormData({
        goal: '',
        risks: ['', '', ''],
        strategies: ['', '', ''],
        factors: ['', ''],
        projects: ['', ''],
        matrix: {},
        progress: {},
        ratings: {},
        currentPath: path,
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        currentPath: path,
      }));
    }
  };

  return (
    <FormContext.Provider value={{ formData, updateFormData, setPath }}>
      {children}
    </FormContext.Provider>
  );
}
