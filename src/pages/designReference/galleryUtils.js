import { createContext, useState } from 'react';

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
