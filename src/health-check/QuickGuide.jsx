import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
// Copied as files into the build (never inside the page's code), and asked for
// only once the guide is opened.
import desktopVideo from './media/quick-guide-desktop.mp4?url&no-inline';
import phoneVideo from './media/quick-guide-phone.mp4?url&no-inline';
import desktopPoster from './media/quick-guide-desktop.jpg?url&no-inline';
import phonePoster from './media/quick-guide-phone.jpg?url&no-inline';
import captionsUrl from './media/quick-guide.en-GB.vtt?url&no-inline';
import { Cross, PHONE, useDialog } from './parts';

// The Quick guide video (mock-up M7b version 49), with Tim's voice-over: a
// card on the welcome, ready to play, and a panel from the play icon (centred
// on a laptop, full screen on a phone). Laptops and tablets get the desktop
// video, phones the phone video, by the page's own phone width; both use the
// one captions file, shown as written in the bar under the picture. Nothing
// plays by itself, and nothing is downloaded until the guide is opened: the
// video has no source or poster before Watch (or Quick guide) is pressed.
//
// The controls are never rebuilt while it plays (Tim, 29 Oct: a press must
// never be lost). The time, the progress line and the slider's value are
// written straight onto their elements on each frame; React redraws only when
// something a person can see changes state (Play to Pause, a caption, mute).

const PLAY = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'currentColor' }}><path d="M5 3v10l8-5z" /></svg>;
const PAUSE = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'currentColor' }}><rect x="4" y="3" width="3" height="10" /><rect x="9" y="3" width="3" height="10" /></svg>;
const REPLAY = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 2.8v2.6h2.6" /></svg>;
const SOUND = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" /></svg>;
const MUTED = <svg viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5zM11 6l4 4M15 6l-4 4" /></svg>;
const BIG_PLAY = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10l8-5z" /></svg>;

// The guide's length, shown until the video itself says (it isn't asked for
// until the guide is opened).
const GUIDE_SECONDS = 65;
/** The video for this screen, chosen as the guide opens, so it never swaps mid-play. */
const pickVideo = () => (typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches
  ? { src: phoneVideo, poster: phonePoster }
  : { src: desktopVideo, poster: desktopPoster });

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
/** The caption showing now: the latest cue that has started (two touch at each change). */
const activeText = (track) => {
  const cues = track?.activeCues;
  if (!cues?.length) return '';
  let best = cues[0];
  for (let i = 1; i < cues.length; i++) if (cues[i].startTime >= best.startTime) best = cues[i];
  return best.text;
};

/** The video's captions, set to load their cues without showing them on the picture (the bar shows them). */
function captionsTrack(v) {
  const track = v.textTracks?.[0];
  if (track) track.mode = 'hidden';
  return track;
}

function Player({ inline, autoPlay, onWatched }) {
  const ref = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const scrubRef = useRef(null);
  const timeRef = useRef(null);
  const durRef = useRef(GUIDE_SECONDS);
  const shownRef = useRef({ s: -1, d: -1 });
  const watchedRef = useRef(onWatched);
  useEffect(() => { watchedRef.current = onWatched; }, [onWatched]);
  // The panel opens playing (it was opened by a press); the card waits for Watch.
  const [video, setVideo] = useState(() => (autoPlay ? pickVideo() : null));
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [dur, setDur] = useState(GUIDE_SECONDS);
  const [cap, setCap] = useState('');
  const [started, setStarted] = useState(!!autoPlay);
  const [ended, setEnded] = useState(false);
  const [watched, setWatched] = useState(readWatched);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState(false);

  // The time, the progress line and the slider: written onto the elements, never through React.
  const paint = useCallback(() => {
    const v = ref.current;
    if (!v || !fillRef.current) return;
    const d = durRef.current;
    const t = v.currentTime || 0;
    const pct = `${(d ? Math.min(100, (t / d) * 100) : 0).toFixed(2)}%`;
    fillRef.current.style.width = pct;
    thumbRef.current.style.left = pct;
    const s = Math.floor(t);
    if (s !== shownRef.current.s || d !== shownRef.current.d) {
      shownRef.current = { s, d };
      scrubRef.current.setAttribute('aria-valuenow', String(Math.round(t)));
      scrubRef.current.setAttribute('aria-valuetext', `${clock(t)} of ${clock(d)}`);
      timeRef.current.textContent = `${clock(t)} / ${clock(d)}`;
    }
  }, []);

  // The video's own events: on the element for as long as the player is open.
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    let raf = 0;
    const frame = () => { paint(); raf = requestAnimationFrame(frame); };
    const onLength = () => {
      const track = v.textTracks?.[0];
      const last = track?.cues?.length ? track.cues[track.cues.length - 1].endTime : 0;
      // Some recorded files don't state their length; the captions' last time stands in.
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : last || GUIDE_SECONDS;
      if (d !== durRef.current) { durRef.current = d; setDur(d); }
      paint();
    };
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); paint(); };
    const onEnd = () => {
      onPause(); setEnded(true); setWatched(true); writeWatched(); watchedRef.current?.();
    };
    // A file that can't load (missing after a deploy, or offline) says so in the caption bar.
    const onFail = () => { if (v.getAttribute('src')) setFailed(true); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnd);
    v.addEventListener('timeupdate', paint);
    v.addEventListener('seeked', paint);
    v.addEventListener('loadedmetadata', onLength);
    v.addEventListener('durationchange', onLength);
    v.addEventListener('error', onFail);
    if (v.error) onFail(); // it may have failed before this ran
    paint();
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('timeupdate', paint);
      v.removeEventListener('seeked', paint);
      v.removeEventListener('loadedmetadata', onLength);
      v.removeEventListener('durationchange', onLength);
      v.removeEventListener('error', onFail);
    };
  }, [paint]);

  // The captions: added with the video, read by the bar (never drawn over the picture).
  useLayoutEffect(() => {
    if (!video) return undefined;
    const v = ref.current;
    const track = v && captionsTrack(v);
    if (!track) return undefined;
    const onCue = () => { const text = activeText(track); if (text) setCap(text); };
    const trackEl = v.querySelector('track');
    const onLoad = () => { onCue(); const last = track.cues?.length ? track.cues[track.cues.length - 1].endTime : 0; if (!(v.duration > 0) && last) { durRef.current = last; setDur(last); paint(); } };
    track.addEventListener('cuechange', onCue);
    trackEl?.addEventListener('load', onLoad);
    return () => { track.removeEventListener('cuechange', onCue); trackEl?.removeEventListener('load', onLoad); };
  }, [video, paint]);

  // The panel plays as it opens (it was opened by a press, so the voice may play).
  useEffect(() => {
    if (autoPlay) ref.current?.play().catch(() => {});
  }, [autoPlay]);

  /** Gives the video its source on the first press, inside that press, so the voice is allowed to play. */
  const open = () => {
    if (!video) flushSync(() => { setVideo(pickVideo()); });
    setStarted(true);
    setEnded(false);
  };
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    open();
    if (v.paused) { if (v.ended) v.currentTime = 0; v.play().catch(() => setPlaying(!v.paused)); } else v.pause();
    setPlaying(!v.paused); // the button changes with the press, not when the video's event arrives
  };
  const replay = () => {
    const v = ref.current;
    open();
    v.currentTime = 0;
    v.play().catch(() => setPlaying(!v.paused));
    setPlaying(!v.paused);
  };
  // Mute keeps your place: only the sound changes.
  const mute = () => {
    const next = !muted;
    if (ref.current) ref.current.muted = next;
    setMuted(next);
  };
  // The progress line can be dragged back and forth (pointer and touch); the
  // arrow keys move it 5 seconds. It never restarts the video.
  const trackRef = useRef(null);
  const seekTo = (s) => {
    const v = ref.current;
    if (!v || !video) return;
    v.currentTime = Math.max(0, Math.min(durRef.current, s));
    paint();
  };
  const seekAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    seekTo(((clientX - r.left) / r.width) * durRef.current);
  };
  const onScrubDown = (e) => {
    const v = ref.current;
    if (!v || !video) return;
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
      if (wasPlaying && v.currentTime < durRef.current) v.play().catch(() => {});
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const seekKey = (e) => {
    const v = ref.current;
    const d = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[e.key];
    if (e.key === 'Home') seekTo(0);
    else if (e.key === 'End') seekTo(durRef.current);
    else if (d) seekTo(v.currentTime + d);
    else return;
    e.preventDefault();
  };
  const showBig = inline && !playing && !failed && (!started || ended);
  const caption = failed
    ? 'The video didn’t load. Check your connection, then reload the page.'
    : inline && !started ? 'Watch with sound for the voice-over, or read the captions.' : cap;
  return (
    <>
      {/* Tapping the picture pauses or plays it; the Play button does the same for keyboards. */}
      <div className="stg" onClick={(e) => { if (!e.target.closest('.bigplay')) toggle(); }}>
        <video ref={ref} src={video?.src} poster={video?.poster} playsInline preload="none" aria-label="Quick guide video">
          {video && <track kind="captions" src={captionsUrl} srcLang="en-GB" label="English" />}
        </video>
        {showBig && (
          <button type="button" className={`bigplay${watched ? ' done' : ''}`} onClick={toggle}>
            <span className="bpc">{BIG_PLAY}</span>
            <b>{ended ? 'Watch again' : 'Watch this first'}</b>
            <small>It takes ~1 minute, and you’ll get more out of the Health Check.</small>
          </button>
        )}
      </div>
      <div className="capbar" aria-live="polite">{caption}</div>
      <div className="vpc">
        <button type="button" className="pb" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? PAUSE : PLAY}</button>
        <button type="button" className="pb" aria-label="Replay" onClick={replay}>{REPLAY}</button>
        <button type="button" className="pb" aria-label={muted ? 'Turn the voice on' : 'Mute the voice'} onClick={mute}>{muted ? MUTED : SOUND}</button>
        {/* aria-valuenow, aria-valuetext, the widths and the time are written by paint(). */}
        <span
          ref={scrubRef}
          className={`scrub${drag ? ' drag' : ''}`}
          role="slider"
          tabIndex={0}
          aria-label="Position in the video"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          onPointerDown={onScrubDown}
          onKeyDown={seekKey}
        >
          <span className="trk" ref={trackRef}><i ref={fillRef} /></span>
          <span className="th" ref={thumbRef} />
        </span>
        <span className="tm" ref={timeRef} />
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
  const { boxRef, closeRef } = useDialog(onClose);
  return (
    <>
      <div className="vscrim" onClick={onClose} aria-hidden="true" />
      <div className="vp" role="dialog" aria-modal="true" aria-label="Quick guide" ref={boxRef}>
        <div className="vph">
          <h3>Quick guide</h3>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Cross className="close" /></button>
        </div>
        <Player autoPlay />
      </div>
    </>
  );
}
