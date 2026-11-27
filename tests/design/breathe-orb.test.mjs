// The Breathe orb's drawing (src/lib/breathOrb.js orbSvg; Tim, 26 Nov, decisions part 12; NEXT-BREATHE-TOOLS.md point 3):
// thin lines in the text colour, the track in the line colour, Level's fill the soft surface grey; no other colour, no
// coral or mint; Box breathing in rounded squares only; the timings unchanged (point 5).
//
//   node --import ./tests/scores/register.mjs --test tests/design/breathe-orb.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORB_PATTERNS, ORB_STILL_SIZE, breathAt, orbSvg } from '../../src/lib/breathOrb.js';

const colours = (svg) => [...svg.matchAll(/(?:stroke|fill)\s*[:=]\s*"?([^;"\s/>]+)/g)].map((m) => m[1]).filter((c) => c !== 'none');

test('every orb is drawn in the text, line and surface colours only', () => {
  for (const style of ['rings', 'level']) {
    for (const shape of ['round', 'square']) {
      for (const s of [0, 0.5, 1]) {
        const svg = orbSvg({ style, shape, s });
        const used = new Set(colours(svg));
        for (const c of used) assert.ok(['var(--text)', 'var(--line)', 'var(--raised)'].includes(c), `${style} ${shape}: ${c}`);
        assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgb/i, `${style} ${shape} has a written colour`);
        assert.match(svg, /stroke-width="1\.25"/);
      }
    }
  }
});

test('Box breathing draws rounded squares only; the round orbs draw circles', () => {
  for (const style of ['rings', 'level']) {
    const square = orbSvg({ style, shape: 'square', s: 0.5 });
    assert.doesNotMatch(square, /<circle/, `${style} square`);
    assert.match(square, /<path d="M-88 66V-66A22 22/, `${style} square has the rounded track`);
    assert.match(orbSvg({ style, shape: 'round', s: 0.5 }), /<circle/);
  }
});

test('Rings: the breathing ring grows from 34 to 86 inside the 92 track around the fixed 14 centre ring', () => {
  const r = (s) => [...orbSvg({ s }).matchAll(/<circle r="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(r(0), [92, 34, 14]);
  assert.deepEqual(r(1), [92, 86, 14]);
});

test('the timings are unchanged: sigh 3.5 + 1.5 + 7, Box 4 x 4, vagal 4 + 6, wind down 4 + 6; cosine easing; still at .55', () => {
  const secs = (k) => ORB_PATTERNS[k].map((p) => p.seconds);
  assert.deepEqual(secs('sigh'), [3.5, 1.5, 7]);
  assert.deepEqual(secs('box'), [4, 4, 4, 4]);
  assert.deepEqual(secs('vagal'), [4, 6]);
  assert.deepEqual(secs('wind'), [4, 6]);
  assert.ok(Math.abs(breathAt(ORB_PATTERNS.vagal, 2).size - 0.5) < 1e-9);
  assert.ok(Math.abs(breathAt(ORB_PATTERNS.vagal, 1).size - (1 - Math.cos(Math.PI / 4)) / 2) < 1e-9);
  assert.deepEqual(ORB_PATTERNS.sigh.map((p) => p.word), ['Breathe in', 'Top up', 'Breathe out']);
  assert.equal(ORB_STILL_SIZE, 0.55);
});
