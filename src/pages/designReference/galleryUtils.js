import { createContext, useCallback, useRef, useState } from 'react';
import { clearDraft, readDraft } from '../../components/design';

// Shared by the gallery's frame (galleryKit.jsx) and its page.

const VIEW_KEY = 'dr-view';

// 'both': dark and light side by side. 'one': the page's own mode only.
export const ViewContext = createContext('both');

export function useGalleryView() {
  const [view, setView] = useState(() => {
    try {
      return window.localStorage.getItem(VIEW_KEY) === 'one' ? 'one' : 'both';
    } catch {
      return 'both';
    }
  });
  const choose = (next) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the view lasts until the page is closed.
    }
  };
  return [view, choose];
}

// WCAG contrast between two #RRGGBB colours.
function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The gallery's pretend server (there is no database here): "saved"
// answers are kept in this browser, so a reload carries on as the real
// portal would. With `offline` on, saving fails, as with no signal.
const SAVED_PREFIX = 'gallery-saved:';

export function readSaved(key) {
  try {
    return JSON.parse(window.localStorage.getItem(SAVED_PREFIX + key) || 'null');
  } catch {
    return null;
  }
}

export function forgetSaved(key) {
  clearDraft(key);
  try {
    window.localStorage.removeItem(SAVED_PREFIX + key);
  } catch {
    // Nothing to forget.
  }
}

// What to show on opening: the copy kept on the device if there is one
// (it is newer), else what the server has.
export function startingValue(key, fallback) {
  return readDraft(key) ?? readSaved(key) ?? fallback;
}

export function usePretendServer(key) {
  const offline = useRef(false);
  const save = useCallback((value) => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (offline.current) {
        reject(new Error('offline'));
        return;
      }
      try {
        window.localStorage.setItem(SAVED_PREFIX + key, JSON.stringify(value));
      } catch {
        // Storage blocked: the demo forgets on reload.
      }
      resolve();
    }, 500);
  }), [key]);
  const setOffline = useCallback((v) => { offline.current = v; }, []);
  return [save, setOffline];
}
