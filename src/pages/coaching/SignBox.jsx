import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '../../components/design';
import { signatureImage } from '../../components/design/SignaturePad';
import { DRAW } from '../../lib/coaching/clientMoney';
import './clientAgreement.css';

// The signing block's signature box (M28 version 4, .sigbox: the client's s-c-sign and the sponsor's s-s-sign): draw
// in the box, with "Draw your signature" under the drawing, then Clear and Type instead (Draw instead once typing)
// as quiet outlined buttons under it. There is no "Use this signature" step: what is in the box when Sign is pressed
// is what signs. Typing shows the full name as the signature (a keyboard user's way to sign). On screen the ink is the
// text colour, so it reads in dark and light; the picture kept is dark ink on nothing (--sig-ink-saved), for the light
// PDF. The ref gives { image(): string ('' when nothing usable is drawn), typed: boolean, has(): boolean }.
//   name:     the full name typed above (shown in the box while typing)
//   onChange: called when the drawing or the typed choice changes (so the page can clear its "what's missing" line)

const MIN_INK = 24;
const travel = (strokes) => strokes.reduce((sum, s) => sum + s.reduce((d, p, i) => (i ? d + Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y) : d), 0), 0);
const readVar = (el, name, fallback) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : '') || fallback;

function paintStrokes(c, strokes) {
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  g.lineWidth = Number(readVar(c, '--sig-ink-w', '2')) || 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = getComputedStyle(c).color;
  g.fillStyle = g.strokeStyle;
  strokes.forEach((s) => {
    if (!s.length) return;
    g.beginPath();
    if (s.length === 1) { g.arc(s[0].x, s[0].y, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); return; }
    g.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i += 1) g.lineTo(s[i].x, s[i].y);
    g.stroke();
  });
}

const SignBox = forwardRef(function SignBox({ name = '', onChange }, ref) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const drawing = useRef(null);
  const [typed, setTyped] = useState(false);
  const [ink, setInk] = useState(false);
  const changed = useRef(onChange);
  changed.current = onChange;

  const paint = useCallback(() => { if (canvasRef.current) paintStrokes(canvasRef.current, strokes.current); }, []);

  useEffect(() => {
    if (typed) return undefined;
    paint();
    const c = canvasRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => paint());
    ro.observe(c);
    const mo = new window.MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', paint);
    return () => { ro.disconnect(); mo.disconnect(); mq?.removeEventListener?.('change', paint); };
  }, [paint, typed]);

  const clear = () => {
    strokes.current = [];
    drawing.current = null;
    setInk(false);
    setTyped(false);
    paint();
    changed.current?.();
  };

  useImperativeHandle(ref, () => ({
    typed,
    has: () => (typed ? Boolean(String(name).trim()) : travel(strokes.current) >= MIN_INK),
    image: () => {
      if (typed || !canvasRef.current) return '';
      const c = canvasRef.current;
      return signatureImage(strokes.current, { ink: readVar(c, '--sig-ink-saved', '') || getComputedStyle(c).color, width: Number(readVar(c, '--sig-ink-w', '2')) || 2 });
    },
  }), [typed, name]);

  const at = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => {
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* the move events still come */ }
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
    if (has !== ink) { setInk(has); changed.current?.(); }
  };

  const toggleTyped = () => {
    strokes.current = [];
    setInk(false);
    setTyped((t) => !t);
    changed.current?.();
  };

  return (
    <div className="cl-sign-box">
      <div className="cl-sigbox">
        {typed ? (
          <span className="cl-sig-typed" aria-label="Your typed signature">{String(name).trim() || ' '}</span>
        ) : (
          <canvas
            ref={canvasRef}
            className="cl-sig-canvas"
            role="img"
            aria-label="Signature box. Draw your signature with your finger, a mouse or a trackpad."
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
          />
        )}
        <span className="cl-sig-cap">{typed ? 'Your full name is your signature' : DRAW}</span>
      </div>
      <div className="cl-acts">
        <Button variant="outline" onClick={clear}>Clear</Button>
        <Button variant="outline" onClick={toggleTyped}>{typed ? 'Draw instead' : 'Type instead'}</Button>
      </div>
    </div>
  );
});

export default SignBox;
