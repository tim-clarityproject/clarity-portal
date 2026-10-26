import { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react';
import { AuthContext } from './AuthContext';
import { announceDraftRestored, clearDraft, readDraft } from '../lib/drafts';
import { deviceKey, writeJson } from '../lib/deviceStore';

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
  constraints: '',
  opportunities: '',
  options: [],
  will_do: '',
};

// The pages that work through this shared form (GROW, Goal Setting,
// Risks, Strategies, Critical Success Factors and the project pages).
const FORM_PAGES = /^\/(grow-step|goal-setting|risks-assessment|strategies|critical-success-factors|project-)/;
const DRAFT_NAME = 'form';

export function FormProvider({ children }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id ?? null;
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [loadedDecisionId, setLoadedDecisionId] = useState(null);
  const [dirtyFields, setDirtyFields] = useState(new Set());
  const restoredFor = useRef(null);

  // Clean up any old localStorage data on provider mount
  useEffect(() => {
    try { localStorage.removeItem('clarity_form_data'); } catch { /* storage blocked */ }
  }, []);

  // Typing survives a refresh or a closed tab (Tim, 26 Oct): the form is
  // kept as a draft on the device for whoever is signed in, put back
  // quietly when the app opens again, and cleared when the form is.
  // Put back during render, the moment the person is known, so the draft
  // is in place before any page underneath runs its own start-up code
  // (an effect here would run after the page's, which could clear it).
  const [restoredUser, setRestoredUser] = useState(null);
  // A different person (or nobody, after Sign out) never sees the last
  // person's form: it starts empty, then takes the new person's own draft.
  if (restoredUser !== userId) {
    setRestoredUser(userId);
    restoredFor.current = userId;
    const draft = userId ? readDraft(userId, DRAFT_NAME) : null;
    setFormData(draft?.v?.formData ? { ...DEFAULT_FORM_DATA, ...draft.v.formData } : DEFAULT_FORM_DATA);
    setLoadedDecisionId(draft?.v?.decisionId ?? null);
    setDirtyFields(new Set());
  }

  // "Draft restored", once, when a form page is what opened.
  useEffect(() => {
    if (!restoredUser) return;
    const draft = readDraft(restoredUser, DRAFT_NAME);
    if (draft?.v?.formData && FORM_PAGES.test(window.location.pathname)) announceDraftRestored();
  }, [restoredUser]);

  const latest = useRef({ formData, loadedDecisionId });
  latest.current = { formData, loadedDecisionId };
  const writeDraft = useCallback(() => {
    if (!userId || restoredFor.current !== userId) return;
    const { formData: data, loadedDecisionId: id } = latest.current;
    if (JSON.stringify(data) === JSON.stringify(DEFAULT_FORM_DATA)) clearDraft(userId, DRAFT_NAME);
    else writeJson(deviceKey('draft', userId, DRAFT_NAME), { v: { formData: data, decisionId: id }, at: Date.now() });
  }, [userId]);

  // A moment after each change, and at once when the page is hidden or closed.
  useEffect(() => {
    const timer = setTimeout(writeDraft, 300);
    return () => clearTimeout(timer);
  }, [formData, loadedDecisionId, writeDraft]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') writeDraft(); };
    window.addEventListener('pagehide', writeDraft);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', writeDraft);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [writeDraft]);

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
    if (userId) clearDraft(userId, DRAFT_NAME);
  }, [userId]);

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
