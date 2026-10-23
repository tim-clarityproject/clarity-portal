import { createContext, useContext } from 'react';

// Which colour mode a part of the page is forced into: 'light', 'dark',
// or null to follow the page (html[data-theme], see
// src/lib/colourMode/boot.js). Pages never set it; the design gallery
// does, to show each component in both modes side by side. Pop-ups,
// panels and lists render into document.body, outside that part, so
// they read this and carry the same data-theme onto their own .ui-root.
export const ThemeScopeContext = createContext(null);

export function useThemeScope() {
  return useContext(ThemeScopeContext);
}

// Props for a portal's .ui-root wrapper: data-theme when forced.
export function themeProps(scope) {
  return scope ? { 'data-theme': scope } : {};
}
