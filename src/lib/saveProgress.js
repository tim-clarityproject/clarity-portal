export const SAVE_KEY = 'strategic-alignment-progress';

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
};

export const getResumeUrl = (savedProgress) => {
  if (!savedProgress) return null;
  return `/${savedProgress.currentPage}`;
};
