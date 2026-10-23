import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { pushLayer } from './layers';
import { lockPage, unlockPage } from './pageLock';
import { SaveStatus } from './Status';
import { themeProps, useThemeScope } from './themeScope';
import useKeepScroll from './useKeepScroll';
import useViewportFit from './useViewportFit';
import WhoSees from './WhoSees';
import './design.css';

// Focus mode for writing on phone (decisions: "Writing on phone: focus
// mode"). A full-screen writing page: the question at the top with the
// who-sees label, just the words, a quiet Saved, and Done. The page
// underneath is pinned, so nothing else moves. It fits the space above
// the keyboard (sized to the visual viewport), so the line being typed
// stays in sight as the browser keeps the caret in view inside it.
// Done, Escape or a swipe down on the top closes it; TextBox puts people
// back where they were with what they wrote in the box. Text is saved as
// it's typed (the page's useAutosave), so nothing needs saving by hand.

const SWIPE_CLOSE_PX = 80;

const FocusWriter = forwardRef(function FocusWriter({
  open,
  onClose,
  question,
  who,
  coachName,
  value,
  onChange,
  placeholder,
  maxLength,
  saveState,
}, forwardedRef) {
  const scope = useThemeScope();
  const pageRef = useRef(null);
  const scrollRef = useRef(null);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const onCloseRef = useRef(onClose);
  // Handed over on every render, so the box can be focused as it opens.
  useImperativeHandle(forwardedRef, () => boxRef.current);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Pin the page underneath and take Escape while open.
  useLayoutEffect(() => {
    if (!open) return undefined;
    lockPage();
    const removeLayer = pushLayer(() => onCloseRef.current?.());
    return () => {
      removeLayer();
      unlockPage();
    };
  }, [open]);

  // Fill exactly the visible space above the keyboard.
  useViewportFit(pageRef, open);
  useKeepScroll(scrollRef, open);

  if (!open) return null;

  const onTouchStart = (e) => {
    if (e.touches.length === 1) drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e) => {
    if (!drag.current) return;
    drag.current.dy = e.touches[0].clientY - drag.current.y;
  };
  const onTouchEnd = () => {
    if (drag.current && drag.current.dy > SWIPE_CLOSE_PX) onCloseRef.current?.();
    drag.current = null;
  };

  return createPortal(
    <div className="ui-root ds-portal" {...themeProps(scope)}>
      <div ref={pageRef} className="ds-focus" tabIndex={-1} role="dialog" aria-modal="true" aria-label={question}>
        <div
          className="ds-focus-top"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="ds-focus-bar">
            <SaveStatus state={saveState} />
            <button type="button" className="ds-focus-done" onClick={() => onCloseRef.current?.()}>Done</button>
          </div>
          <div className="ds-focus-head">
            <h2 className="ds-focus-question">{question}</h2>
            {who && <WhoSees audience={who} coachName={coachName} />}
          </div>
        </div>
        <div ref={scrollRef} className="ds-focus-scroll">
          <div className="ds-grow ds-grow--bare" data-value={`${value ?? ''} `}>
            <textarea
              ref={boxRef}
              className="ds-text"
              rows={1}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              aria-label={question}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default FocusWriter;
