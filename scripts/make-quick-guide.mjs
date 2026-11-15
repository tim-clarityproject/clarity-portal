// Rebuilds the Health Check's Quick guide videos (src/pages/healthCheck/media)
// from their sources, with only what is already on a Mac: Node, Playwright
// (the repo's own, with its own browser), macOS's afconvert, sips and swiftc
// (AVFoundation). It never downloads anything.
//
// How the guide is made (the handover of 29 Oct, ~/Downloads/clarity-quick-guide,
// and its rebuild of 15 Nov):
//   1. The animation is the approved mock-up's own (M7b, the outside Health
//      Check: its CAPS, SCN, TAPS, HOLD and simApply): the real screens drawn
//      small, typed into and tapped on a 65-second timeline, with a camera
//      that moves to the part being talked about. This script opens the
//      mock-up in Playwright's Chromium, opens its Quick guide panel, and
//      draws each frame at a fixed time (30 a second), holding every CSS
//      transition and animation at the same moment, so the frames are exact
//      whatever the machine's speed. Desktop: the welcome's card (the screens
//      drawn 820 wide, as the first video was), the picture 478 by 300 at
//      twice the pixels (956 by 600); phone: the full-screen panel (390
//      wide), 316 by 528 (632 by 1056). Always in light, as before.
//   2. The voice is Tim's voice-over (one 65-second file). A re-recorded line
//      replaces one line: its slot (the caption's own times in the VTT) is
//      silenced, the new line is laid in from the caption's start, and its
//      gain is set so its loudness (ITU-R BS.1770, measured here) equals the
//      median of the other lines'. Nothing outside the slot changes.
//   3. scripts/quick-guide/encode.swift (AVFoundation) joins the frames and
//      the voice into an MP4: H.264, one mono AAC track at 48 kHz, the index
//      first (faststart). The poster is each video's first frame, as JPEG.
//
//   node scripts/make-quick-guide.mjs \
//     --mockup ~/Downloads/clarity-health-check-calm/m7b-health-check.html \
//     --voice ~/Downloads/clarity-quick-guide/health-check-quick-guide-voice-over-final.m4a \
//     --line 6 --new-line ~/Downloads/clarity-health-check-calm/quick-guide-line-6-success-factor-matched.m4a \
//     [--out src/pages/healthCheck/media] [--work <scratch folder>] [--only audio,frames,encode,check]
//     [--afconvert /usr/bin/afconvert] [--swiftc /usr/bin/swiftc] [--sips /usr/bin/sips]
//
// The captions file (quick-guide.en-GB.vtt in --out) gives every line's
// times; the script reads them and never changes them. Write the new line's
// words into it by hand. Checks: it measures every line's loudness, where
// the new line starts, that the old line's slot holds only the new line,
// that the rest of the voice matches the source, each file's length and
// size (at most 3.5 MB), and saves a frame of each scene to look at.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loudness, peak, readWav, rms, swapLine, writeWav } from './quick-guide/audio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const home = (p) => (p ? p.replace(/^~(?=\/)/, homedir()) : p);
const OUT = resolve(home(arg('out', join(root, 'src/pages/healthCheck/media'))));
const WORK = resolve(home(arg('work', join(tmpdir(), 'clarity-quick-guide-build'))));
const MOCKUP = home(arg('mockup', '~/Downloads/clarity-health-check-calm/m7b-health-check.html'));
const VOICE = home(arg('voice', '~/Downloads/clarity-quick-guide/health-check-quick-guide-voice-over-final.m4a'));
const LINE = Number(arg('line', '6'));
const NEW_LINE = home(arg('new-line', '~/Downloads/clarity-health-check-calm/quick-guide-line-6-success-factor-matched.m4a'));
const AFCONVERT = arg('afconvert', '/usr/bin/afconvert');
const SWIFTC = arg('swiftc', '/usr/bin/swiftc');
const SIPS = arg('sips', '/usr/bin/sips');
const ONLY = (arg('only', 'audio,frames,encode,check')).split(',');
const FPS = 30;
const MAX_BYTES = 3.5 * 1024 * 1024;
// The two videos: the picture's size on screen (drawn at twice the pixels),
// the mock-up's device, and the H.264 bit rate that keeps the file small.
const KINDS = {
  desktop: { w: 478, h: 300, device: 'd', inline: true, bps: 270000 },
  phone: { w: 316, h: 528, device: 'p', inline: false, bps: 230000 },
};
const AUDIO_BPS = 128000;

const say = (s) => console.log(s);
const need = (file, what) => { if (!existsSync(file)) throw new Error(`${what} not found: ${file}`); };
mkdirSync(WORK, { recursive: true });

/** The captions' cues: [{ start, end, text }]. */
export function readCues(file) {
  const t = (s) => { const p = s.trim().split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  return readFileSync(file, 'utf8').split(/\r?\n\r?\n/).map((b) => b.trim().split(/\r?\n/)).map((lines) => {
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->');
    return { start: t(a), end: t(b), text: lines.slice(i + 1).join(' ') };
  }).filter(Boolean);
}

const cues = readCues(join(OUT, 'quick-guide.en-GB.vtt'));
const slot = cues[LINE - 1];
if (!slot) throw new Error(`The captions have no line ${LINE}.`);
const median = (list) => { const s = [...list].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const db = (x) => 20 * Math.log10(x);

// ------------------------------------------------------------ 2. the voice
function makeVoice() {
  need(VOICE, 'The voice-over'); need(NEW_LINE, 'The new line'); need(AFCONVERT, 'afconvert');
  execFileSync(AFCONVERT, ['-f', 'WAVE', '-d', 'LEF32@48000', VOICE, join(WORK, 'voice-source.wav')]);
  execFileSync(AFCONVERT, ['-f', 'WAVE', '-d', 'LEF32@48000', NEW_LINE, join(WORK, 'new-line.wav')]);
  const track = readWav(join(WORK, 'voice-source.wav'));
  const line = readWav(join(WORK, 'new-line.wav'));
  const levels = cues.map((c) => loudness(track, c.start, c.end));
  const others = levels.filter((_, i) => i !== LINE - 1);
  const target = median(others);
  const before = loudness(line);
  const gainDb = target - before;
  const length = line.data.length / line.rate;
  if (length > slot.end - slot.start) throw new Error(`The new line (${length.toFixed(3)}s) doesn’t fit its ${(slot.end - slot.start).toFixed(1)}s slot.`);
  const out = swapLine(track, line, { slotFrom: slot.start, slotTo: slot.end, at: slot.start, gain: 10 ** (gainDb / 20) });
  writeWav(join(WORK, 'voice.wav'), out);
  say('The voice-over, line by line (integrated loudness, ITU-R BS.1770):');
  cues.forEach((c, i) => say(`  line ${i + 1} (${c.start.toFixed(1)} to ${c.end.toFixed(1)}s): ${levels[i].toFixed(2)} LUFS${i === LINE - 1 ? ' (the old line, replaced)' : ''}`));
  say(`  the other lines' median: ${target.toFixed(2)} LUFS`);
  say(`  the new line ${LINE}: ${length.toFixed(3)}s, ${before.toFixed(2)} LUFS as supplied; gain ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB, so ${loudness(out, slot.start, slot.end).toFixed(2)} LUFS in its slot, peak ${peak(out, slot.start, slot.end).toFixed(2)} dBFS`);
}

// ------------------------------------------------------------ 1. the frames
async function makeFrames(kind) {
  need(MOCKUP, 'The mock-up');
  const { chromium } = await import('playwright');
  const k = KINDS[kind];
  const dir = join(WORK, `frames-${kind}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fonts = join(root, 'node_modules', '@fontsource', 'dm-sans', 'files');
  const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'no-preference', locale: 'en-GB' });
    // The mock-up's one outside request, DM Sans, is answered with the portal's own font files; nothing else leaves the machine.
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
    await ctx.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
      const w = /\/(400|500)/.exec(r.request().url())[1];
      r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(fonts, `dm-sans-latin-${w}-normal.woff2`)) });
    });
    await ctx.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
    const page = await ctx.newPage();
    await page.goto(`file://${MOCKUP}`);
    await page.locator('.rp[data-t="light"]').click();
    await page.locator(`.rp[data-w="${k.device}"]`).click();
    await page.evaluate(() => document.fonts.ready);
    const set = await page.evaluate(({ w, h, inline }) => {
      const st = window.__st;
      window.__jump('welcome');
      // Desktop: the welcome's own card, where most people watch it (the
      // screens drawn 820 wide, as the first video was, so the words read at
      // this size); phone: the full-screen panel (390 wide).
      if (!inline) window.__act('vid');
      // The mock-up's own clock stops (its loop ends while "dragging"): each frame's time is set here.
      st.vplay = true;
      st.vdrag = true;
      const box = inline ? '[data-vinl]' : '.sheet.vid';
      const style = document.createElement('style');
      // The picture alone, at the video's size, on whole pixels at the screen's corner, with square
      // corners (the player's card rounds them).
      style.textContent = `${box} .stg{position:fixed!important;left:0!important;top:0!important;z-index:2147483647!important;width:${w}px!important;height:${h}px!important;aspect-ratio:auto!important;margin:0!important}${box} .vcard{border:0!important;border-radius:0!important}`;
      document.head.appendChild(style);
      document.getAnimations().forEach((a) => a.finish());
      window.__stage = () => document.querySelector(`${box} [data-stage]`);
      // Every CSS transition and animation is held and moved on with the guide's own time.
      const born = new Map();
      window.__frameAt = (t) => {
        st.vt = t;
        window.__paintVid();
        document.body.getBoundingClientRect();
        for (const a of document.getAnimations()) {
          if (!born.has(a)) { born.set(a, t); a.pause(); }
          const ms = (t - born.get(a)) * 1000;
          const end = a.effect?.getComputedTiming().endTime ?? 0;
          if (ms >= end) a.finish(); else a.currentTime = ms;
        }
        const nekst = document.fonts.check('16px Nekst');
        const dm = document.fonts.check('500 16px "DM Sans"');
        const r = window.__stage().getBoundingClientRect();
        return { nekst, dm, r: [r.x, r.y, r.width, r.height] };
      };
      // The first frame is the welcome already drawn (as the poster shows it), never its fade in.
      window.__frameAt(0);
      document.getAnimations().forEach((a) => a.finish());
      return window.__frameAt(0);
    }, { w: k.w, h: k.h, inline: k.inline });
    if (!set.nekst || !set.dm) throw new Error('The fonts didn’t load.');
    if (set.r.join() !== `0,0,${k.w},${k.h}`) throw new Error(`The picture isn’t at the screen’s corner: ${set.r.join(', ')}`);
    const total = Math.round(65 * FPS);
    for (let i = 0; i < total; i += 1) {
      await page.evaluate((t) => window.__frameAt(t), i / FPS);
      await page.screenshot({ path: join(dir, `${String(i).padStart(5, '0')}.png`), clip: { x: 0, y: 0, width: k.w, height: k.h }, animations: 'allow', caret: 'initial' });
      if (i % 300 === 0) say(`  ${kind}: frame ${i} of ${total}`);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------ 3. the files
function encode(kind) {
  need(SWIFTC, 'swiftc'); need(SIPS, 'sips');
  const bin = join(WORK, 'encode');
  const src = join(here, 'quick-guide', 'encode.swift');
  if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) execFileSync(SWIFTC, ['-O', src, '-o', bin], { stdio: 'inherit' });
  const out = join(OUT, `quick-guide-${kind}.mp4`);
  say(execFileSync(bin, [join(WORK, `frames-${kind}`), String(FPS), join(WORK, 'voice.wav'), out, String(KINDS[kind].bps), String(AUDIO_BPS)]).toString().trim());
  // AVFoundation can leave its working copies beside the file ("….mp4.sb-…"): never keep them.
  for (const f of readdirSync(OUT)) if (f.startsWith(`quick-guide-${kind}.mp4.sb-`)) rmSync(join(OUT, f));
  // The poster: the video's first frame.
  execFileSync(SIPS, ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', join(WORK, `frames-${kind}`, '00000.png'), '--out', join(OUT, `quick-guide-${kind}.jpg`)], { stdio: 'ignore' });
}

// ------------------------------------------------------------ checks
function check(kind) {
  const file = join(OUT, `quick-guide-${kind}.mp4`);
  const size = statSync(file).size;
  const wav = join(WORK, `check-${kind}.wav`);
  execFileSync(AFCONVERT, ['-f', 'WAVE', '-d', 'LEF32@48000', file, wav]);
  const got = readWav(wav);
  const source = readWav(join(WORK, 'voice-source.wav'));
  const made = readWav(join(WORK, 'voice.wav'));
  const line = readWav(join(WORK, 'new-line.wav'));
  const seconds = got.data.length / got.rate;
  const R = 48000;
  // Where the new line lies: the lag at which the line itself best matches the track (to the sample).
  const corrAt = (lag) => {
    let t = 0; let ea = 0; let eb = 0;
    for (let n = 0; n < line.data.length; n += 4) { const a = line.data[n]; const b = got.data[lag + n] ?? 0; t += a * b; ea += a * a; eb += b * b; }
    return t / Math.sqrt(ea * eb || 1);
  };
  let best = { lag: 0, c: -1 };
  for (let lag = Math.round((slot.start - 0.3) * R); lag <= Math.round((slot.start + 0.3) * R); lag += 4) { const c = corrAt(lag); if (c > best.c) best = { lag, c }; }
  for (let lag = best.lag - 4; lag <= best.lag + 4; lag += 1) { const c = corrAt(lag); if (c > best.c) best = { lag, c }; }
  const placed = best.lag / R;
  // Its first sound, and its first word.
  let sound = null;
  for (let t = slot.start - 0.3; t < slot.end; t += 0.01) { if (rms(got, t, t + 0.01) > -60) { sound = t; break; } }
  // The old line is gone: in the slot, what is left once the new line is taken away is only the encoding's noise,
  // and the track no longer follows the old line there.
  const gain = Math.sqrt((() => { let a = 0; let b = 0; for (let n = 0; n < line.data.length; n += 1) { a += got.data[best.lag + n] * line.data[n]; b += line.data[n] ** 2; } return (a / b) ** 2; })());
  let left = 0; let mine = 0;
  for (let n = Math.round(slot.start * R); n < Math.round(slot.end * R); n += 1) {
    const k = n - best.lag;
    const l = k >= 0 && k < line.data.length ? line.data[k] * gain : 0;
    left += (got.data[n] - l) ** 2; mine += l * l;
  }
  const residue = 10 * Math.log10(left / mine);
  const oldLeft = (() => { let t = 0; let ea = 0; let eb = 0; for (let n = Math.round(slot.start * R); n < Math.round(slot.end * R); n += 1) { t += source.data[n] * got.data[n]; ea += source.data[n] ** 2; eb += got.data[n] ** 2; } return t / Math.sqrt(ea * eb); })();
  const lineEnd = placed + line.data.length / R;
  const tail = rms(got, lineEnd + 0.05, slot.end - 0.05);
  // The rest of the track against the source: as close as one AAC encoding allows.
  const diff = (a, b, from, to) => {
    let d = 0; let e = 0;
    for (let n = Math.round(from * R); n < Math.min(a.data.length, b.data.length, Math.round(to * R)); n += 1) { d += (a.data[n] - b.data[n]) ** 2; e += a.data[n] ** 2; }
    return 10 * Math.log10(d / e);
  };
  const outside = Math.max(diff(source, got, 0, slot.start - 0.05), diff(source, got, slot.end + 0.05, 65));
  void made;
  const levels = cues.map((c) => loudness(got, c.start, c.end));
  say(`${kind}: ${size} bytes (${(size / 1048576).toFixed(2)} MB${size <= MAX_BYTES ? '' : ', OVER 3.5 MB'}), audio ${seconds.toFixed(3)}s`);
  say(`  line ${LINE} is laid in at ${placed.toFixed(3)}s (its caption at ${slot.start.toFixed(3)}s; match ${best.c.toFixed(3)}), first sound at ${sound?.toFixed(2)}s, ends at ${lineEnd.toFixed(3)}s; the slot after it: ${tail === -Infinity ? 'digital silence' : `${tail.toFixed(1)} dBFS`}`);
  say(`  the old line in the slot: the track follows it by ${oldLeft.toFixed(3)} (0 is not at all); what is left once the new line is taken away: ${residue.toFixed(1)} dB below it`);
  say(`  outside the slot the voice matches the source to ${outside.toFixed(1)} dB (the difference against the signal; one AAC encoding)`);
  say(`  loudness by line: ${levels.map((l, i) => `${i + 1}: ${l.toFixed(2)}`).join(', ')}`);
  return { size, seconds, placed, sound, tail, residue, oldLeft, outside, levels };
}

const kinds = (arg('kinds', 'desktop,phone')).split(',');
if (ONLY.includes('audio')) makeVoice();
for (const kind of kinds) if (ONLY.includes('frames')) await makeFrames(kind);
for (const kind of kinds) if (ONLY.includes('encode')) encode(kind);
for (const kind of kinds) if (ONLY.includes('check')) check(kind);
