import { useContext, useEffect, useState } from 'react';
import { useNavigationType } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { readDraft } from '../lib/drafts';

// Typing survives a refresh (Tim, 26 Oct). The GROW steps keep what is
// typed in FormContext's shared form, which FormContext keeps as a draft
// on the device and puts back when the app opens again. After a refresh
// the page can mount a moment before FormContext has put the draft back
// (both happen as sign-in finishes), so a step that cleared or loaded on
// mount would wipe it. This hook says when the draft is back, so the
// step can wait for it.

// The name FormContext keeps its draft under (src/context/FormContext.jsx).
const FORM_DRAFT_NAME = 'form';
// The longest a step waits for the draft before it shows anyway.
const WAIT_MS = 1000;

const isBlank = (v) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

const hasTyping = (data) => Object.values(data || {}).some((v) => !isBlank(v));

/**
 * @returns {{ ready: boolean, isReload: boolean }}
 *   ready: false only while a draft on the device is still on its way back
 *   isReload: true when the page was opened by a refresh, a reopened tab or
 *   the browser's back or forward button, rather than from inside the app;
 *   a step then keeps what is in the shared form instead of starting fresh
 */
export function useFormDraftReady() {
  const navigationType = useNavigationType();
  const { user } = useContext(AuthContext);
  const { formData } = useContext(FormContext);
  const isReload = navigationType === 'POP';

  const [expectDraft] = useState(
    () => isReload && hasTyping(readDraft(user?.id, FORM_DRAFT_NAME)?.v?.formData)
  );
  const [settled, setSettled] = useState(!expectDraft);
  const [waitedOut, setWaitedOut] = useState(false);
  const ready = settled || waitedOut || hasTyping(formData);

  // Once ready, stay ready (clearing every box must not hide the page).
  if (ready && !settled) setSettled(true);

  useEffect(() => {
    if (settled) return undefined;
    const timer = setTimeout(() => setWaitedOut(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [settled]);

  return { ready, isReload };
}
