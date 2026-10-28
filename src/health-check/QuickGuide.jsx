import { useCallback, useEffect, useRef, useState } from 'react';
import videoUrl from './media/quick-guide-PLACEHOLDER.mp4?url';
import captionsUrl from './media/quick-guide-PLACEHOLDER.vtt?url';
import { Cross } from './parts';

// The Quick guide video (mock-up M7b version 4): a card on the welcome, ready
// to play, and a panel from the play icon (centred on a laptop, full screen on
// a phone). Nothing plays by itself. The captions show in the bar under the
// picture. The files are placeholders until Claude supplies the real ones
// (see media/README.md).

const PLAY = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'currentColor' }}><path d="M5 3v10l8-5z" /></svg>;
const PAUSE = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'currentColor' }}><rect x="4" y="3" width="3" height="10" /><rect x="9" y="3" width="3" height="10" /></svg>;
const REPLAY = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 2.8v2.6h2.6" /></svg>;
const SOUND = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" /></svg>;
const MUTED = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5zM11 6l4 4M15 6l-4 4" /></svg>;
const BIG_PLAY = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" /></svg>;

const WATCHED_KEY = 'hc-quick-guide-watched';
export function readWatched() {
  try { return localStorage.getItem(WATCHED_KEY) === '1'; } catch { return false; }
}
function writeWatched() {
  try { localStorage.setItem(WATCHED_KEY, '1'); } catch { /* the device can't keep it; Begin stays quiet */ }
}
const clock = (v) => {
  const s = Number.isFinite(v) ? Math.floor(v) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Player({ inline, autoPlay, onWatched }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [cap, setCap] = useState('');
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [watched, setWatched] = useState(readWatched);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const track = v.textTracks?.[0];
    if (track) track.mode = 'hidden';
    const onCue = () => setCap(track?.activeCues?.[0]?.text || '');
    track?.addEventListener('cuechange', onCue);
    const onTime = () => {
      setT(v.currentTime);
      // Some recorded files don't state their length; the captions' last time stands in.
      const last = track?.cues?.length ? track.cues[track.cues.length - 1].endTime : 0;
      setDur(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : last);
    };
    const onEnd = () => {
      setPlaying(false); setEnded(true); setWatched(true); writeWatched(); onWatched?.();
    };
    const trackEl = v.querySelector('track');
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onTime);
    v.addEventListener('durationchange', onTime);
    trackEl?.addEventListener('load', onTime);
    v.addEventListener('ended', onEnd);
    v.addEventListener('play', () => setPlaying(true));
    v.addEventListener('pause', () => setPlaying(false));
    onTime(); // the video may already be ready when this runs
    if (autoPlay) v.play().then(() => setStarted(true)).catch(() => {});
    return () => {
      track?.removeEventListener('cuechange', onCue);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onTime);
      v.removeEventListener('durationchange', onTime);
      trackEl?.removeEventListener('load', onTime);
      v.removeEventListener('ended', onEnd);
    };
  }, [autoPlay, onWatched]);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    setStarted(true);
    setEnded(false);
    if (v.paused) { if (v.ended) v.currentTime = 0; v.play().catch(() => {}); } else v.pause();
  }, []);
  const replay = () => { const v = ref.current; setStarted(true); setEnded(false); v.currentTime = 0; v.play().catch(() => {}); };
  // The progress line can be dragged back and forth (pointer and touch); the
  // arrow keys move it 5 seconds. It never restarts the video.
  const [drag, setDrag] = useState(false);
  const trackRef = useRef(null);
  const seekTo = (s) => {
    const v = ref.current;
    if (!v || !dur) return;
    v.currentTime = Math.max(0, Math.min(dur, s));
    setT(v.currentTime);
  };
  const seekAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    seekTo(((clientX - r.left) / r.width) * dur);
  };
  const onScrubDown = (e) => {
    const v = ref.current;
    if (!v || !dur) return;
    e.preventDefault();
    const wasPlaying = !v.paused;
    v.pause();
    setDrag(true);
    setStarted(true);
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported: the move events still arrive */ }
    seekAt(e.clientX);
    const move = (ev) => seekAt(ev.clientX);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDrag(false);
      if (wasPlaying && v.currentTime < dur) v.play().catch(() => {});
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const seekKey = (e) => {
    const v = ref.current;
    const d = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[e.key];
    if (e.key === 'Home') seekTo(0);
    else if (e.key === 'End') seekTo(dur);
    else if (d) seekTo(v.currentTime + d);
    else return;
    e.preventDefault();
  };
  const showBig = inline && !playing && (!started || ended);
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
  const caption = inline && !started ? 'Watch with sound for the voice-over, or read the captions.' : cap;
  return (
    <>
      {/* Tapping the picture pauses or plays it; the Play button does the same for keyboards. */}
      <div className="stg" onClick={(e) => { if (!e.target.closest('.bigplay')) toggle(); }}>
        <video ref={ref} src={videoUrl} playsInline muted={muted} preload="metadata" aria-label="Quick guide video">
          <track kind="captions" src={captionsUrl} srcLang="en-GB" label="English" default />
        </video>
        {showBig && (
          <button type="button" className={`bigplay${watched ? ' done' : ''}`} onClick={toggle}>
            <span className="bpc">{BIG_PLAY}</span>
            <b>{ended ? 'Watch again' : 'Watch this first'}</b>
            <small>It takes under 2 minutes, and you’ll get more out of the Health Check.</small>
          </button>
        )}
      </div>
      <div className="capbar" aria-live="polite">{caption}</div>
      <div className="vpc">
        <button type="button" className="pb" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? PAUSE : PLAY}</button>
        <button type="button" className="pb" aria-label="Replay" onClick={replay}>{REPLAY}</button>
        <button type="button" className="pb" aria-label={muted ? 'Turn the voice on' : 'Mute the voice'} onClick={() => setMuted((m) => !m)}>{muted ? MUTED : SOUND}</button>
        <span
          className={`scrub${drag ? ' drag' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label="Position in the video"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${clock(t)} of ${clock(dur)}`}
          onPointerDown={onScrubDown}
          onKeyDown={seekKey}
        >
          <span className="trk" ref={trackRef}><i style={{ width: `${pct.toFixed(2)}%` }} /></span>
          <span className="th" style={{ left: `${pct.toFixed(2)}%` }} />
        </span>
        <span className="tm">{clock(t)} / {clock(dur)}</span>
      </div>
    </>
  );
}

/** The card on the welcome. */
export function GuideCard({ onWatched, style }) {
  return <div className="vp vpi rv" style={style}><Player inline onWatched={onWatched} /></div>;
}

/** The panel from the play icon. */
export function GuidePanel({ onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const back = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (back?.isConnected) back.focus({ preventScroll: true }); };
  }, [onClose]);
  return (
    <>
      <div className="vscrim" onClick={onClose} aria-hidden="true" />
      <div className="vp" role="dialog" aria-modal="true" aria-label="Quick guide">
        <div className="vph">
          <h3>Quick guide</h3>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Cross className="close" /></button>
        </div>
        <Player autoPlay />
      </div>
    </>
  );
}
