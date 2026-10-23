import { useCallback, useSyncExternalStore } from 'react';
import './boot';

// The colour mode for React: { choice, mode, setChoice }.
// choice: 'light' | 'dark' | 'device' (Match my device, the starting choice).
// mode:   'light' | 'dark', what the page is showing now.
// boot.js does the work (and has usually already run in <head>); this
// only reads it and listens for changes.

function api() {
  return window.ClarityColourMode;
}

function subscribe(onChange) {
  const { EVENT } = api();
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const getChoice = () => api().get();
const getMode = () => api().mode();
const serverChoice = () => 'device';
const serverMode = () => 'dark';

export default function useColourMode() {
  const choice = useSyncExternalStore(subscribe, getChoice, serverChoice);
  const mode = useSyncExternalStore(subscribe, getMode, serverMode);
  const setChoice = useCallback((next) => api().set(next), []);
  return { choice, mode, setChoice };
}
