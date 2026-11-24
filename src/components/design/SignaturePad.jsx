import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Button } from './Button';
import { ErrorMessage } from './Status';
import './signature.css';

// The signature box (Phase 6b run 1; M13 A4 and A7, "built from the surface, edges and box
// tokens"): draw with a finger, a pen, a mouse or a trackpad above the line, then "Use this
// signature". Clear starts again; "Type instead" (when the page offers it) is how a keyboard
// user signs. On screen the ink is the text colour, so it reads in dark and light; the picture
// it keeps is drawn again in dark ink on nothing (--sig-ink-saved), because it is printed on the
// light PDF. The picture is a PNG data URL that fits migration 061's check (200 to 300,000
// characters), cropped to the drawing.
//
// props:
//   label         the words above the box ("Draw your signature")
//   onUse(image)  "Use this signature" with a drawing in the box (nothing happens when it's empty:
//                 onEmpty says so instead)
//   onEmpty()     "Use this signature" pressed with nothing drawn
//   onInk(bool)   whether there is any drawing in the box now
//   onTypeInstead "Type instead" beside Clear, or nothing (My signature has none, M13 A7)
//   problem       one line under the box saying what's missing
//   words         { clear, useThis, typeInstead } (signingWords)

const HINT = 'Sign above the line';
const BOX_LABEL = 'Signature box. Draw your signature with your finger, a mouse or a trackpad.';
const MIN_INK = 24;  // px of pen travel before a drawing counts
const SIG_MAX = 300000;

const readVar = (el, name, fallback) => {
  const v = el ? getComputedStyle(el).getPropertyValue(name).trim() : '';
  return v || fallback;
};

function drawStrokes(g, strokes, { ink, width, scale = 1, dx = 0, dy = 0 }) {
  g.lineWidth = width * scale;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  strokes.forEach((s) => {
    if (!s.length) return;
    if (s.length === 1) {
      g.beginPath();
      g.arc((s[0].x - dx) * scale, (s[0].y - dy) * scale, (width * scale) / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo((s[0].x - dx) * scale, (s[0].y - dy) * scale);
    for (let i = 1; i < s.length; i += 1) g.lineTo((s[i].x - dx) * scale, (s[i].y - dy) * scale);
    g.stroke();
  });
}

const travel = (strokes) => strokes.reduce((sum, s) => sum + s.reduce((d, p, i) => (i ? d + Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y) : d), 0), 0);

/** The drawing as a PNG data URL in dark ink, cropped to it with a small margin; '' when too small. */
export function signatureImage(strokes, { ink, width = 2 }) {
  const points = strokes.flat();
  if (!points.length || travel(strokes) < MIN_INK) return '';
  const pad = 8;
  const minX = Math.min(...points.map((p) => p.x)) - pad;
  const minY = Math.min(...points.map((p) => p.y)) - pad;
  const w = Math.max(...points.map((p) => p.x)) - minX + pad;
  const h = Math.max(...points.map((p) => p.y)) - minY + pad;
  for (const scale of [2, 1.5, 1, 0.75]) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * scale));
    c.height = Math.max(1, Math.ceil(h * scale));
    drawStrokes(c.getContext('2d'), strokes, { ink, width, scale, dx: minX, dy: minY });
    const url = c.toDataURL('image/png');
    if (url.length <= SIG_MAX) return url;
  }
  return '';
}

const SignaturePad = forwardRef(function SignaturePad({ label, onUse, onEmpty, onInk, onTypeInstead, problem, words = {} }, ref) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const drawing = useRef(null);
  const [ink, setInk] = useState(false);
  const labelId = useId();
  const problemId = useId();
  const onInkRef = useRef(onInk);
  onInkRef.current = onInk;

  const paint = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    // The text colour of the mode on screen (the canvas's own `color`, set from --text).
    drawStrokes(g, strokes.current, { ink: getComputedStyle(c).color, width: Number(readVar(c, '--sig-ink-w', '2')) || 2 });
  }, []);

  // Drawn again when the box changes size or the mode changes colour.
  useEffect(() => {
    paint();
    const c = canvasRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => paint());
    ro.observe(c);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', paint);
    const mo = new window.MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { ro.disconnect(); mq?.removeEventListener?.('change', paint); mo.disconnect(); };
  }, [paint]);

  const setHasInk = (on) => {
    setInk(on);
    onInkRef.current?.(on);
  };

  const clear = () => {
    strokes.current = [];
    drawing.current = null;
    paint();
    setHasInk(false);
  };

  useImperativeHandle(ref, () => ({ clear }), []);

  const at = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* an older browser: the move events still come */ }
    drawing.current = [at(e)];
    strokes.current = [...strokes.current, drawing.current];
    paint();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    (events.length ? events : [e]).forEach((ev) => drawing.current.push(at(ev)));
    paint();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = null;
    const has = travel(strokes.current) >= MIN_INK;
    if (has !== ink) setHasInk(has);
  };

  const use = () => {
    const c = canvasRef.current;
    const image = signatureImage(strokes.current, {
      ink: readVar(c, '--sig-ink-saved', '') || getComputedStyle(c).color,
      width: Number(readVar(c, '--sig-ink-w', '2')) || 2,
    });
    if (!image) { onEmpty?.(); return; }
    onUse?.(image);
  };

  return (
    <div className="ds-sig">
      {label && <p id={labelId} className="ds-sig-label">{label}</p>}
      <div className="ds-sig-pad">
        <canvas
          ref={canvasRef}
          className="ds-sig-canvas"
          role="img"
          aria-label={BOX_LABEL}
          aria-describedby={problem ? problemId : undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
        />
        <span className="ds-sig-base" aria-hidden="true" />
        <span className="ds-sig-hint" aria-hidden="true">{HINT}</span>
      </div>
      {problem && <div id={problemId} className="ds-panel-needs ds-sig-needs"><ErrorMessage>{problem}</ErrorMessage></div>}
      <div className="ds-sig-row">
        <span className="ds-sig-links">
          <Button variant="text" onClick={clear}>{words.clear || 'Clear'}</Button>
          {onTypeInstead && <Button variant="text" onClick={onTypeInstead}>{words.typeInstead || 'Type instead'}</Button>}
        </span>
        <Button variant="outline" className="ds-sig-use" onClick={use}>{words.useThis || 'Use this signature'}</Button>
      </div>
    </div>
  );
});

export default SignaturePad;

/**
 * A saved signature in its box, with one quiet link beside it ("Draw a new signature", M13 A4 and
 * A7). The picture is dark ink, shown through a mask in the text colour so it reads in both modes.
 */
export function SavedSignature({ image, action, onAction }) {
  return (
    <div className="ds-sig-saved-box">
      <span className="ds-sig-saved" role="img" aria-label="Your signature" style={{ '--sig-src': `url("${image}")` }} />
      {action && <Button variant="text" onClick={onAction}>{action}</Button>}
    </div>
  );
}
