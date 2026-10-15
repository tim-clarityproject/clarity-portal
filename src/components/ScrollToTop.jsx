import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Mounted once inside the router. When the person moves to a DIFFERENT
// page (a new pathname) the page opens at the top, instantly, instead of
// inheriting the scroll position of the page they came from (tap another
// tab while scrolled down and the next page used to open part-way down).
//
// The thing that scrolls is the window itself - there is no inner scroll
// container (the header, action bar and tab bar are position: fixed), so
// window.scrollTo is the right call. behavior 'instant' because
// src/index.css sets scroll-behavior: smooth on html.
//
// It deliberately does nothing when:
//  - the navigation is a POP (Back / Forward keep their place),
//  - only the search string or hash changed (filters, anchors),
//  - the pathname is the same,
//  - the navigation asked for a section to be scrolled to itself
//    (location.state.scrollTo, used by My Account),
//  - the person is typing in a field.
export default function ScrollToTop() {
  const { pathname, state } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const changedPage = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (!changedPage) return;
    if (navigationType === 'POP') return;
    if (state?.scrollTo) return;

    const active = document.activeElement;
    const typing = active && (
      active.tagName === 'TEXTAREA'
      || active.tagName === 'INPUT'
      || active.isContentEditable
    );
    if (typing) return;

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, navigationType, state]);

  return null;
}
