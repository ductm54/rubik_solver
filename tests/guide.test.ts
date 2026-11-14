/** Guide-frame scanning and center logos. */
import { describe, expect, it } from 'vitest';
import { type Color, FACES, applyMoves, randomMoves, solvedState, statesEqual } from '../src/core/cube';
import { captureOf, readCube } from '../src/scan/readCube';
import type { RGB } from '../src/vision/color';
import { detectFace } from '../src/vision/detect';
import { SteadyDetector, findDuplicate, guideSquare, isClear, readGuide } from '../src/vision/guide';
import type { Point } from '../src/vision/homography';
import { neighboursOf, renderCube, renderFace } from '../src/vision/synth';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Logo colours seen on white centers: blue (GAN), black (MoYu), red (Tornado).
const LOGOS: Record<string, RGB> = { blue: [25, 70, 200], black: [20, 20, 22], red: [200, 30, 40] };
const W = 320;
const H = 240;
const sq = guideSquare(W, H);

/** Corners of a face that sits in the guide square, scaled and shifted like a hand-held cube. */
function cornersIn(scale: number, dx: number, dy: number): [Point, Point, Point, Point] {
  const c = [sq.x + sq.size / 2 + dx, sq.y + sq.size / 2 + dy];
  const h = (sq.size * scale) / 2;
  return [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
}

describe('guide frame', () => {
  const face: Color[] = ['R', 'G', 'B', 'O', 'W', 'Y', 'W', 'B', 'R'];

  it('reads a face lined up with the square', () => {
    const r = readGuide(renderFace(face, { width: W, height: H, corners: cornersIn(1, 0, 0), rand: mulberry32(1) }), sq);
    expect(r.colors).toEqual(face);
    expect(isClear(r)).toBe(true);
  });

  it('reads a face that is off the grid: smaller, bigger, shifted', () => {
    const rand = mulberry32(2);
    for (let n = 0; n < 60; n++) {
      const colors = Array.from({ length: 9 }, () => 'WYGBRO'[Math.floor(rand() * 6)] as Color);
      const pitch = sq.size / 3;
      const img = renderFace(colors, {
        width: W,
        height: H,
        corners: cornersIn(0.88 + rand() * 0.24, (rand() - 0.5) * 0.2 * pitch, (rand() - 0.5) * 0.2 * pitch),
        rand,
        clutter: true,
        tint: rand() < 0.5 ? [1.1, 0.98, 0.8] : [1, 1, 1],
      });
      expect(readGuide(img, sq).colors).toEqual(colors);
    }
  });

  for (const [name, logo] of Object.entries(LOGOS)) {
    it(`a ${name} logo on the white center still reads white`, () => {
      const rand = mulberry32(3);
      for (let n = 0; n < 20; n++) {
        const pitch = sq.size / 3;
        const corners = cornersIn(0.9 + rand() * 0.2, (rand() - 0.5) * 0.2 * pitch, (rand() - 0.5) * 0.2 * pitch);
        const r = readGuide(renderFace(face, { width: W, height: H, corners, rand, logo }), sq);
        expect(r.colors).toEqual(face);
        // the center reading is clean white, not white mixed with the logo
        expect(Math.hypot(r.stickers[4].lab[1], r.stickers[4].lab[2])).toBeLessThan(8);
        expect(r.stickers[4].lab[0]).toBeGreaterThan(80);
      }
    });
  }

  it('is not clear when there is no face in the square', () => {
    const img = renderFace(face, { width: W, height: H, corners: cornersIn(1, sq.size / 6, sq.size / 6), rand: mulberry32(4) });
    expect(isClear(readGuide(img, sq))).toBe(false);
  });

  it('fires once when the reading holds still, and again only after it changed', () => {
    const a = readGuide(renderFace(face, { width: W, height: H, corners: cornersIn(1, 0, 0), rand: mulberry32(5) }), sq);
    const other = [...face].reverse();
    other[0] = 'G';
    const b = readGuide(renderFace(other, { width: W, height: H, corners: cornersIn(1, 0, 0), rand: mulberry32(6) }), sq);
    const s = new SteadyDetector(450);
    const fires: number[] = [];
    let t = 0;
    for (const r of [a, a, a, a, a, a, a, a, b, b, b, b, b, b, b, b]) {
      if (s.update(r, (t += 100)).fire) fires.push(t);
    }
    expect(fires).toEqual([600, 1400]);
  });

  it('spots a face that was already captured, in any rotation', () => {
    const rand = mulberry32(7);
    const state = applyMoves(solvedState(), randomMoves(25, rand));
    const read = (f: number, up: number) => {
      const front = FACES[f];
      const img = renderCube(state, { front, up: neighboursOf(front)[up], distance: 8.9 }, { rand });
      return readGuide(img, guideSquare(img.width, img.height)).stickers.map((s) => s.lab);
    };
    const captured = [0, 1, 2].map((f) => read(f, 0));
    expect(findDuplicate(read(1, 2), captured)).toBe(1);
    expect(findDuplicate(read(2, 3), captured)).toBe(2);
    expect(findDuplicate(read(4, 1), captured)).toBe(-1);
  });

  it('reads 10 whole cubes through the guide, with a logo on the white center', () => {
    const rand = mulberry32(8);
    const logos = Object.values(LOGOS);
    for (let n = 0; n < 10; n++) {
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      const caps = FACES.map((front) => {
        const img = renderCube(
          state,
          {
            front,
            up: neighboursOf(front)[Math.floor(rand() * 4)],
            distance: 8.5 + rand() * 0.8,
            pitch: (rand() - 0.5) * 8,
            yaw: (rand() - 0.5) * 8,
            roll: (rand() - 0.5) * 8,
            shift: [(rand() - 0.5) * 10, (rand() - 0.5) * 10],
          },
          { rand, noise: 5, clutter: true, logo: logos[n % 3], tint: n % 2 ? [1.12, 0.98, 0.75] : [1, 1, 1] },
        );
        return captureOf(readGuide(img, guideSquare(img.width, img.height)));
      });
      caps.sort(() => rand() - 0.5);
      const r = readCube(caps);
      expect(r.states.map((s) => statesEqual(s, state))).toContain(true);
    }
  });
});

describe('free-hand detection with a center logo', () => {
  for (const [name, logo] of Object.entries(LOGOS)) {
    it(`${name} logo: the white face is still found and its center reads white`, () => {
      const rand = mulberry32(9);
      const state = applyMoves(solvedState(), randomMoves(25, rand));
      for (let n = 0; n < 8; n++) {
        const img = renderCube(
          state,
          { front: 'U', up: neighboursOf('U')[n % 4], pitch: (rand() - 0.5) * 30, yaw: (rand() - 0.5) * 20, roll: (rand() - 0.5) * 30 },
          { rand, logo },
        );
        const { face } = detectFace(img);
        expect(face).not.toBeNull();
        expect(face!.colors[4]).toBe('W');
        expect(Math.hypot(face!.stickers[4].lab[1], face!.stickers[4].lab[2])).toBeLessThan(8);
      }
    });
  }
});
