// The Quick guide's voice-over, in plain numbers (no packages): reading and
// writing 32-bit float WAV files (as macOS's afconvert writes them with
// `-f WAVE -d LEF32@48000`), integrated loudness as ITU-R BS.1770-4 measures
// it (K-weighting, 400ms blocks every 100ms, the -70 LUFS absolute gate and
// the -10 LU relative gate), and the line swap: one slot silenced and the
// new line laid in at its start with a gain. Used by
// scripts/make-quick-guide.mjs and its checks.
import { readFileSync, writeFileSync } from 'node:fs';

/** Reads a mono or multi-channel WAV (float 32 or PCM 16); returns { rate, data: Float32Array (first channel) }. */
export function readWav(file) {
  const b = readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') throw new Error(`${file} is not a WAV file`);
  let i = 12;
  let fmt = null;
  while (i + 8 <= b.length) {
    const id = b.toString('latin1', i, i + 4);
    const size = b.readUInt32LE(i + 4);
    const body = i + 8;
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data') {
      if (!fmt) throw new Error('data before fmt');
      const step = (fmt.bits / 8) * fmt.ch;
      const n = Math.floor(Math.min(size, b.length - body) / step);
      const data = new Float32Array(n);
      for (let k = 0; k < n; k += 1) {
        const at = body + k * step;
        data[k] = fmt.bits === 32 ? b.readFloatLE(at) : b.readInt16LE(at) / 32768;
      }
      return { rate: fmt.rate, data };
    }
    i = body + size + (size % 2);
  }
  throw new Error(`${file} has no audio`);
}

/** Writes mono float 32 WAV. */
export function writeWav(file, { rate, data }) {
  const b = Buffer.alloc(44 + data.length * 4);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + data.length * 4, 4); b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(data.length * 4, 40);
  for (let k = 0; k < data.length; k += 1) b.writeFloatLE(data[k], 44 + k * 4);
  writeFileSync(file, b);
}

// The K-weighting filter's two stages at 48 kHz (BS.1770-4, table 1 and 2).
const STAGES = [
  { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
  { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] },
];
function kWeight(x) {
  let y = Float64Array.from(x);
  for (const { b, a } of STAGES) {
    const out = new Float64Array(y.length);
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    for (let n = 0; n < y.length; n += 1) {
      const v = b[0] * y[n] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1; x1 = y[n]; y2 = y1; y1 = v; out[n] = v;
    }
    y = out;
  }
  return y;
}

/**
 * Integrated loudness in LUFS of samples [from, to) seconds (the whole when
 * left out), mono, 48 kHz. -Infinity for silence.
 */
export function loudness({ rate, data }, from = 0, to = data.length / rate) {
  if (rate !== 48000) throw new Error('The K-weighting here is for 48 kHz.');
  const seg = data.subarray(Math.max(0, Math.round(from * rate)), Math.min(data.length, Math.round(to * rate)));
  const z = kWeight(seg);
  const block = Math.round(0.4 * rate);
  const step = Math.round(0.1 * rate);
  const powers = [];
  // Running sum of squares, so each 400ms block is quick.
  const sq = new Float64Array(z.length + 1);
  for (let n = 0; n < z.length; n += 1) sq[n + 1] = sq[n] + z[n] * z[n];
  for (let s = 0; s + block <= z.length; s += step) powers.push((sq[s + block] - sq[s]) / block);
  const lk = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => p > 0 && lk(p) > -70);
  if (!abs.length) return -Infinity;
  const mean = (list) => list.reduce((t, p) => t + p, 0) / list.length;
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter((p) => lk(p) > rel);
  return lk(mean(gated));
}

/** The loudest sample's level in dBFS. */
export function peak({ data }, from = 0, to = Infinity, rate = 48000) {
  let m = 0;
  const end = Math.min(data.length, Math.round(to * rate));
  for (let n = Math.max(0, Math.round(from * rate)); n < end; n += 1) m = Math.max(m, Math.abs(data[n]));
  return m ? 20 * Math.log10(m) : -Infinity;
}

/** RMS level in dBFS of a stretch (for "is it silent"). */
export function rms({ data, rate }, from, to) {
  const a = Math.max(0, Math.round(from * rate));
  const b = Math.min(data.length, Math.round(to * rate));
  let t = 0;
  for (let n = a; n < b; n += 1) t += data[n] * data[n];
  return b > a && t > 0 ? 10 * Math.log10(t / (b - a)) : -Infinity;
}

/**
 * The swap: the track with [slotFrom, slotTo) seconds silenced (short fades
 * at its edges, so nothing clicks) and `line` laid in from `at` seconds,
 * times `gain` (a factor). Every sample outside the slot is left as it was.
 */
export function swapLine(track, line, { slotFrom, slotTo, at, gain = 1, fade = 0.01 }) {
  const { rate } = track;
  const out = Float32Array.from(track.data);
  const a = Math.round(slotFrom * rate);
  const b = Math.min(out.length, Math.round(slotTo * rate));
  const f = Math.max(1, Math.round(fade * rate));
  for (let n = a; n < b; n += 1) {
    // Fade the old audio out over the slot's first 10ms and back in over its last 10ms.
    const w = Math.max(0, Math.min(1, Math.min(n - a, b - 1 - n) / f));
    out[n] *= 1 - w;
  }
  const s = Math.round(at * rate);
  for (let k = 0; k < line.data.length && s + k < b; k += 1) out[s + k] += line.data[k] * gain;
  return { rate, data: out };
}
