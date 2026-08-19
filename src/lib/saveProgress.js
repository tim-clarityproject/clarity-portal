export const SAVE_KEY = 'strategic-alignment-progress';
export const AUTO_SAVE_KEY = 'strategic-alignment-autosave';

// Manual save (user clicked Save & Exit)
export const saveProgress = (currentPage, formData, locationState) => {
  const progressData = {
    currentPage,
    formData,
    locationState,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(progressData));
};

export const loadProgress = () => {
  const saved = localStorage.getItem(SAVE_KEY);
  return saved ? JSON.parse(saved) : null;
};

export const clearProgress = () => {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(AUTO_SAVE_KEY);
};

export const getResumeUrl = (savedProgress) => {
  if (!savedProgress) return null;
  return `/${savedProgress.currentPage}`;
};

// Auto-save (happens while user is filling out form)
export const autoSaveFormData = (formData) => {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({
      ...formData,
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Auto-save failed:', e);
  }
};

export const loadAutoSave = () => {
  try {
    const saved = localStorage.getItem(AUTO_SAVE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.error('Auto-load failed:', e);
    return null;
  }
};
