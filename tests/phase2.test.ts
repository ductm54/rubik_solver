/** Phase 2: full scan pipeline on rendered 3D views of a cube. */
import { describe, expect, it } from 'vitest';
import { type CubeState, FACES, type FaceName, applyMoves, randomMoves, solvedState, statesEqual } from '../src/core/cube';
import { neighbourStrip } from '../src/core/cube';
import { detectFace } from '../src/vision/detect';
import { CAMERA_RGB, type CubePose, neighboursOf, renderCube } from '../src/vision/synth';
import { chromaDistance, type RGB } from '../src/vision/color';
import { COLORS, type Color } from '../src/core/cube';
import { type Capture, captureOf, readCube } from '../src/scan/readCube';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scanCube(state: CubeState, rand: () => number, tilt: boolean, warm = false): Capture[] {
  return FACES.map((front) => {
    const ups = neighboursOf(front);
    const pose: CubePose = {
      front,
      up: ups[Math.floor(rand() * 4)],
      roll: (rand() - 0.5) * 30,
      shift: [(rand() - 0.5) * 40, (rand() - 0.5) * 30],
      distance: 10 + rand() * 3,
      ...(tilt
        ? rand() < 0.5
          ? { pitch: (rand() < 0.5 ? 1 : -1) * (20 + rand() * 10), yaw: (rand() - 0.5) * 8 }
          : { yaw: (rand() < 0.5 ? 1 : -1) * (20 + rand() * 10), pitch: (rand() - 0.5) * 8 }
        : { pitch: (rand() - 0.5) * 8, yaw: (rand() - 0.5) * 8 }),
    };
    const img = renderCube(state, pose, {
      rand,
      noise: 5,
      clutter: rand() < 0.5,
      tint: warm ? [1.12, 0.98, 0.75] : [1, 1, 1],
    });
    const { face } = detectFace(img);
    if (!face) throw new Error(`face ${front} not detected (${JSON.stringify(pose)})`);
    return captureOf(face);
  });
}

describe('Phase 2: six-face scan', () => {
  it('tilted views: strips are detected and they match the real neighbour stickers', () => {
    const rand = mulberry32(21);
    let strips = 0;
    let total = 0;
    for (let n = 0; n < 4; n++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      for (const front of FACES) {
        const up = neighboursOf(front)[Math.floor(rand() * 4)];
        const img = renderCube(state, { front, up, pitch: 25, roll: (rand() - 0.5) * 20 }, { rand, noise: 4 });
        const { face } = detectFace(img);
        total++;
        expect(face).not.toBeNull();
        if (!face!.strip) continue;
        strips++;
        // pitch shows the `up` neighbour, which sits at the top of the image.
        expect(face!.strip.edge).toBe('top');
        const truth = neighbourTop(state, front, up);
        const got = face!.strip.stickers.map((s) => nearestCamera(s.rgb)).join('');
        expect(got).toBe(truth);
      }
    }
    expect(strips / total).toBeGreaterThanOrEqual(0.9);
  });

  it('reads 10 random cubes from tilted free-hand views, mostly without a search', () => {
    const rand = mulberry32(22);
    let noSearch = 0;
    for (let n = 0; n < 10; n++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      const caps = scanCube(state, rand, true);
      caps.sort(() => rand() - 0.5);
      const r = readCube(caps);
      expect(r.errors).toEqual([]);
      expect(r.states).toHaveLength(1);
      expect(statesEqual(r.states[0], state)).toBe(true);
      if (r.combinationsTried <= 4) noSearch++;
    }
    expect(noSearch).toBeGreaterThanOrEqual(8);
  });

  it('reads cubes from straight-on views (no strips) by searching rotations', () => {
    const rand = mulberry32(23);
    for (let n = 0; n < 5; n++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      const r = readCube(scanCube(state, rand, false));
      expect(r.usedStrips).toBe(0);
      expect(r.states.map((s) => statesEqual(s, state))).toContain(true);
    }
  });

  it('reads cubes under warm light', () => {
    const rand = mulberry32(24);
    for (let n = 0; n < 5; n++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      const r = readCube(scanCube(state, rand, true, true));
      expect(r.states.map((s) => statesEqual(s, state))).toContain(true);
    }
  });

  it('a misread sticker gives no valid cube but a best guess that is off by one sticker', () => {
    const rand = mulberry32(25);
    const state = applyMoves(solvedState(), randomMoves(25, rand));
    const caps = scanCube(state, rand, false);
    // Swap the readings of two non-center stickers of different colours on one face: the colour
    // counts stay right but the pieces become impossible.
    const c = caps[0];
    const i = [0, 1, 2, 3, 5, 6, 7, 8].find((k) => Math.abs(c.labs[k][1] - c.labs[0][1]) > 20 || Math.abs(c.labs[k][2] - c.labs[0][2]) > 20);
    if (i === undefined) return;
    [c.labs[0], c.labs[i]] = [c.labs[i], c.labs[0]];
    const r = readCube(caps);
    expect(r.states).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
    const diff = FACES.flatMap((f) => r.guess[f].map((x, k) => (x === state[f][k] ? 0 : 1))).reduce((a: number, b: number) => a + b, 0);
    expect(diff).toBeLessThanOrEqual(2);
  });
});

/** Colours of `up`'s stickers along the edge it shares with `front`, as the strip should read. */
function neighbourTop(state: CubeState, front: FaceName, up: FaceName): string {
  // The image's top edge is the edge of `front` shared with `up`; find which canonical side that is.
  const colors = FACES.flatMap((f) => state[f]);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const { face, facelets } = neighbourStrip(front, side);
    if (face === up) return facelets.map((i) => colors[i]).join('');
  }
  throw new Error('not neighbours');
}

function nearestCamera(rgb: RGB): Color {
  return [...COLORS].sort((a, b) => chromaDistance(rgb, CAMERA_RGB[a]) - chromaDistance(rgb, CAMERA_RGB[b]))[0];
}

describe('no false strips', () => {
  it('straight-on views and flat faces never report a strip', () => {
    const rand = mulberry32(26);
    let checked = 0;
    for (let k = 0; k < 5; k++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      for (const front of FACES) {
        const pose: CubePose = { front, up: neighboursOf(front)[0], pitch: (rand() - 0.5) * 6, yaw: (rand() - 0.5) * 6, roll: rand() * 40 };
        const { face } = detectFace(renderCube(state, pose, { rand, clutter: rand() < 0.5 }));
        if (!face) continue;
        checked++;
        expect(face.strip).toBeUndefined();
      }
    }
    expect(checked).toBeGreaterThanOrEqual(28);
  });
});
