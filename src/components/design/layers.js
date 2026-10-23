import { useEffect, useRef } from 'react';

// Escape closes one thing at a time, the one on top: help that's open in
// place, a drop-down, the calendar, a panel, then the guided tool itself
// (decisions: "Escape closes open help, panels and drop-downs before the
// tool"). Each open thing adds itself here and removes itself on close;
// one listener sends Escape to whichever was opened last.

const stack = [];
let listening = false;

function onKeyDown(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || stack.length === 0) return;
  const top = stack[stack.length - 1];
  e.preventDefault();
  e.stopPropagation();
  top.onEscape();
}

// Returns a function that removes the layer again.
export function pushLayer(onEscape) {
  const layer = { onEscape };
  stack.push(layer);
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown);
    listening = true;
  }
  return () => {
    const at = stack.lastIndexOf(layer);
    if (at !== -1) stack.splice(at, 1);
  };
}

// While `active`, Escape calls the latest onEscape (if this is on top).
export function useEscapeLayer(active, onEscape) {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  useEffect(() => {
    if (!active) return undefined;
    return pushLayer(() => latest.current?.());
  }, [active]);
}
