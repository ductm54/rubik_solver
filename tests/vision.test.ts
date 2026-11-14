import { describe, expect, it } from 'vitest';
import { COLORS, type Color, FACES, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { classifyBalanced, deltaE, rgbToLab, REFERENCE_LAB } from '../src/vision/color';
import { detectFace } from '../src/vision/detect';
import { applyH, fitHomography, type Point } from '../src/vision/homography';
import { hungarian } from '../src/vision/hungarian';
import { CAMERA_RGB, renderFace } from '../src/vision/synth';
import { CaptureTracker } from '../src/vision/tracker';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('colour', () => {
  it('converts sRGB to Lab', () => {
    const w = rgbToLab([255, 255, 255]);
    expect(w[0]).toBeCloseTo(100, 1);
    expect(Math.abs(w[1])).toBeLessThan(0.1);
    const r = rgbToLab([255, 0, 0]);
    expect(r[0]).toBeCloseTo(53.24, 1);
    expect(r[1]).toBeCloseTo(80.09, 0);
    expect(r[2]).toBeCloseTo(67.2, 0);
  });

  it('hungarian finds the min-cost assignment', () => {
    expect(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2]);
  });

  it('balanced classification fixes red/orange confusion under warm light', () => {
    const rand = mulberry32(5);
    const state = applyMoves(solvedState(), randomMoves(25, rand));
    const truth = FACES.flatMap((f) => state[f]);
    // Warm light pushes everything towards orange/yellow; per-sticker nearest-reference reading
    // gets some wrong, but using the centers + exactly-9 constraint recovers all.
    const warm = (c: Color) => {
      const [r, g, b] = CAMERA_RGB[c];
      return rgbToLab([Math.min(255, r * 1.15 + 10 * (rand() - 0.5)), g * 0.95 + 10 * (rand() - 0.5), b * 0.7]);
    };
    const labs = truth.map(warm);
    expect(classifyBalanced(labs)).toEqual(truth);
  });

  it('reference colours are well separated', () => {
    for (const a of COLORS) for (const b of COLORS) if (a !== b) expect(deltaE(REFERENCE_LAB[a], REFERENCE_LAB[b])).toBeGreaterThan(20);
  });
});

describe('homography', () => {
  it('fits and maps points exactly', () => {
    const src: Point[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]];
    const truth = [1.2, 0.1, 30, -0.05, 0.9, 40, 0.001, 0.0005, 1];
    const map = (p: Point): Point => {
      const w = truth[6] * p[0] + truth[7] * p[1] + 1;
      return [(truth[0] * p[0] + truth[1] * p[1] + truth[2]) / w, (truth[3] * p[0] + truth[4] * p[1] + truth[5]) / w];
    };
    const H = fitHomography(src, src.map(map))!;
    for (const p of [[0.3, 0.7], [2, 2]] as Point[]) {
      const a = applyH(H, p);
      const b = map(p);
      expect(a[0]).toBeCloseTo(b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
    }
  });
});

describe('face detection on synthetic frames', () => {
  const face: Color[] = ['R', 'W', 'G', 'O', 'G', 'B', 'Y', 'Y', 'R'];

  const cases: { name: string; corners: [Point, Point, Point, Point]; extra?: object }[] = [
    { name: 'frontal', corners: [[100, 60], [220, 60], [220, 180], [100, 180]] },
    { name: 'small, off-center', corners: [[30, 30], [110, 30], [110, 110], [30, 110]] },
    { name: 'rotated 25°', corners: rotSquare(160, 120, 70, 25) },
    { name: 'rotated 70°', corners: rotSquare(160, 120, 65, 70) },
    { name: 'perspective tilt', corners: [[95, 55], [230, 70], [215, 185], [105, 175]] },
    { name: 'clutter', corners: [[90, 50], [215, 55], [210, 180], [92, 175]], extra: { clutter: true } },
    { name: 'glare on one sticker', corners: [[100, 60], [220, 60], [220, 180], [100, 180]], extra: { glare: 4 } },
    { name: 'noisy', corners: [[100, 60], [220, 60], [220, 180], [100, 180]], extra: { noise: 10 } },
    { name: 'thin gaps', corners: [[100, 60], [220, 60], [220, 180], [100, 180]], extra: { gap: 0.06 } },
  ];

  for (const c of cases) {
    it(`reads the face: ${c.name}`, () => {
      const img = renderFace(face, { corners: c.corners, rand: mulberry32(7), ...c.extra });
      const { face: f } = detectFace(img);
      expect(f, 'face detected').not.toBeNull();
      // Colours are read in image orientation; for rotated faces compare against the
      // rotation the detector chose (top row = the one nearest the top of the image).
      expect(rotations(face)).toContainEqual(f!.colors);
      // Corners land near the truth (as a set, since labelling may rotate).
      const size = Math.hypot(c.corners[0][0] - c.corners[2][0], c.corners[0][1] - c.corners[2][1]);
      for (const p of f!.corners) {
        const d = Math.min(...c.corners.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
        expect(d).toBeLessThan(size * 0.08);
      }
    });
  }

  it('frontal face keeps its orientation (row 0 at the top)', () => {
    const { face: f } = detectFace(renderFace(face, { rand: mulberry32(1) }));
    expect(f!.colors).toEqual(face);
    expect(f!.found).toBe(9);
  });

  it('finds nothing in an image with no cube', () => {
    const img = renderFace(face, { corners: [[-500, -500], [-400, -500], [-400, -400], [-500, -400]], clutter: true, rand: mulberry32(3) });
    expect(detectFace(img).face).toBeNull();
  });

  it('reads a solved (single colour) face', () => {
    const { face: f } = detectFace(renderFace(Array(9).fill('B'), { rand: mulberry32(2) }));
    expect(f!.colors).toEqual(Array(9).fill('B'));
  });
});

describe('capture tracker', () => {
  const reading = (colors: Color[], dx = 0) => {
    const { face } = detectFace(renderFace(colors, { rand: mulberry32(4), corners: [[100 + dx, 60], [220 + dx, 60], [220 + dx, 180], [100 + dx, 180]] }));
    return face!;
  };
  const a = reading(['W', 'W', 'G', 'O', 'W', 'B', 'Y', 'Y', 'R']);
  const b = reading(['G', 'R', 'G', 'O', 'G', 'B', 'Y', 'W', 'R']);

  it('captures after the face is steady for 300 ms, once', () => {
    const t = new CaptureTracker();
    expect(t.update(a, 0).status).toBe('steadying');
    expect(t.update(a, 150).progress).toBeCloseTo(0.5);
    const u = t.update(a, 310);
    expect(u.status).toBe('captured');
    expect(u.capture?.colors[4]).toBe('W');
    expect(t.update(a, 400).capture).toBeUndefined();
    expect(t.captured.size).toBe(1);
  });

  it('restarts the timer when the face moves', () => {
    const t = new CaptureTracker();
    t.update(a, 0);
    const moved = reading(['W', 'W', 'G', 'O', 'W', 'B', 'Y', 'Y', 'R'], 40);
    expect(t.update(moved, 200).progress).toBe(0);
    expect(t.update(moved, 400).status).toBe('steadying');
    expect(t.update(moved, 520).status).toBe('captured');
  });

  it('reports a duplicate center instead of capturing it twice', () => {
    const t = new CaptureTracker();
    t.update(a, 0);
    t.update(a, 300);
    t.update(null, 400);
    t.update(b, 500);
    expect(t.update(b, 800).status).toBe('captured');
    const a2 = { ...a, colors: ['Y', 'W', 'G', 'O', 'W', 'B', 'Y', 'Y', 'R'] as Color[] };
    t.update(a2, 900);
    expect(t.update(a2, 1200).status).toBe('duplicate');
    expect(t.captured.size).toBe(2);
  });
});

function rotSquare(cx: number, cy: number, half: number, deg: number): [Point, Point, Point, Point] {
  const a = (deg * Math.PI) / 180;
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Point[]).map(([x, y]) => [
    cx + half * (x * Math.cos(a) - y * Math.sin(a)),
    cy + half * (x * Math.sin(a) + y * Math.cos(a)),
  ]) as [Point, Point, Point, Point];
}

function rotations(f: Color[]): Color[][] {
  const out: Color[][] = [];
  let cur = f;
  for (let i = 0; i < 4; i++) {
    out.push(cur);
    cur = [cur[6], cur[3], cur[0], cur[7], cur[4], cur[1], cur[8], cur[5], cur[2]];
  }
  return out;
}

describe('randomised poses', () => {
  it('detects ≥ 97% of fully visible faces and reads every detected face correctly', () => {
    const rand = mulberry32(11);
    let visible = 0;
    let detected = 0;
    let wrong = 0;
    for (let i = 0; i < 150; i++) {
      const face = Array.from({ length: 9 }, () => COLORS[Math.floor(rand() * 6)]);
      const half = 35 + rand() * 55;
      const a = rand() * Math.PI * 2;
      const cx = 160 + (rand() - 0.5) * 60;
      const cy = 120 + (rand() - 0.5) * 40;
      const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Point[]).map(([x, y]) => {
        const k = 1 + 0.12 * (rand() - 0.5) * x * y; // mild perspective
        return [
          cx + half * k * (x * Math.cos(a) - y * Math.sin(a)) + (rand() - 0.5) * half * 0.15,
          cy + half * k * (x * Math.sin(a) + y * Math.cos(a)) + (rand() - 0.5) * half * 0.15,
        ];
      }) as [Point, Point, Point, Point];
      const img = renderFace(face, {
        corners,
        rand,
        tint: [1 + (rand() - 0.5) * 0.2, 1, 1 + (rand() - 0.5) * 0.2],
        noise: 2 + rand() * 8,
        clutter: rand() < 0.5,
        gap: 0.06 + rand() * 0.08,
        glare: rand() < 0.3 ? Math.floor(rand() * 9) : undefined,
      });
      const inside = corners.every(([x, y]) => x > 8 && y > 8 && x < 312 && y < 232);
      const { face: f } = detectFace(img);
      if (inside) visible++;
      if (!f) continue;
      if (inside) detected++;
      if (!rotations(face).some((r) => r.join('') === f.colors.join(''))) wrong++;
    }
    expect(wrong).toBe(0);
    expect(detected / visible).toBeGreaterThanOrEqual(0.97);
  });
});
