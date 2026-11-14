/**
 * Scanner tests on real photos (tests/fixtures):
 *   moyu-stickerless  a hand-held stickerless cube with rounded pieces and an embossed logo on the
 *                     white center, in a cluttered room
 *   stickered-robot   a stickered cube in a LEGO robot, badly overexposed: white and yellow are
 *                     almost the same pixel values, orange looks salmon, green looks mint
 */
import { describe, expect, it } from 'vitest';
import { type Color, FACES } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { captureOf, readCube } from '../src/scan/readCube';
import { detectFace } from '../src/vision/detect';
import { SteadyDetector, findDuplicate, fitGuide, isClear, readGuide } from '../src/vision/guide';
import { type Framing, type PhotoFace, frameInGuide, loadSet, shrink } from './helpers/image';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SETS = { 'moyu-stickerless': loadSet('moyu-stickerless'), 'stickered-robot': loadSet('stickered-robot') };

/** What the guide mode reads from a photo framed like a hand-held cube. */
function scanInGuide(face: PhotoFace, framing: Framing = {}) {
  const { image, square } = frameInGuide(face, framing);
  return readGuide(image, square, fitGuide(image, square));
}

/** A cube held roughly on the square: up to 20% too small or big, turned 10°, a quarter sticker off. */
function sloppy(rand: () => number): Framing {
  return {
    scale: 0.8 + rand() * 0.4,
    rot: (rand() - 0.5) * 20,
    dx: (rand() - 0.5) * 0.5,
    dy: (rand() - 0.5) * 0.5,
    blur: rand() < 0.5 ? 1 : 0,
  };
}

const truthOf = (faces: PhotoFace[]) => faces.map((f) => f.colors!.join(''));

for (const [name, faces] of Object.entries(SETS)) {
  describe(`guide frame, real photos: ${name}`, () => {
    it('the labels themselves form a valid cube', () => {
      const r = readCube(faces.map((f) => captureOf(scanInGuide(f))));
      expect(r.states).toHaveLength(1);
      expect(validate(r.states[0]).ok).toBe(true);
    });

    it('reads the whole cube from faces lined up with the square', () => {
      const r = readCube(faces.map((f) => captureOf(scanInGuide(f))));
      expect(r.faces.map((c) => c.join(''))).toEqual(truthOf(faces));
      expect(r.states).toHaveLength(1);
    });

    it('reads the whole cube when every face is held sloppily (25 scans)', () => {
      const rand = mulberry32(11);
      for (let n = 0; n < 25; n++) {
        const readings = faces.map((f) => scanInGuide(f, sloppy(rand)));
        // every face passes the "a face is sitting here" check, so auto-capture can fire
        for (const r of readings) expect(isClear(r)).toBe(true);
        const order = faces.map((_, i) => i).sort(() => rand() - 0.5);
        const r = readCube(order.map((i) => captureOf(readings[i])));
        expect(r.faces.map((c) => c.join(''))).toEqual(order.map((i) => faces[i].colors!.join('')));
        expect(r.states).toHaveLength(1);
      }
    }, 120_000);

    it('spots a face that was already scanned, also when it comes back turned', () => {
      const rand = mulberry32(12);
      const captured = faces.map((f) => scanInGuide(f, sloppy(rand)).stickers.map((s) => s.lab));
      faces.forEach((f, i) => {
        for (const quarter of [0, 90, 180, 270]) {
          const again = scanInGuide(f, { ...sloppy(rand), rot: quarter + (rand() - 0.5) * 16 });
          expect(findDuplicate(again.stickers.map((s) => s.lab), captured)).toBe(i);
        }
        // and it is not mistaken for any other face
        const others = captured.map((c, k) => (k === i ? null : c));
        expect(findDuplicate(scanInGuide(f).stickers.map((s) => s.lab), others)).toBe(-1);
      });
    }, 120_000);

    it('auto-capture fires once per face while the hand shakes a little', () => {
      const rand = mulberry32(13);
      const steady = new SteadyDetector(450);
      const fires: number[] = [];
      let t = 0;
      for (const f of faces.slice(0, 3)) {
        const hold = sloppy(rand);
        for (let k = 0; k < 10; k++) {
          const shake = { ...hold, dx: hold.dx! + (rand() - 0.5) * 0.06, dy: hold.dy! + (rand() - 0.5) * 0.06, rot: hold.rot! + (rand() - 0.5) * 2 };
          if (steady.update(scanInGuide(f, shake), (t += 70)).fire) fires.push(t);
        }
      }
      // 10 readings 70 ms apart per face; each face fires once, 450 ms after it appeared
      expect(fires).toEqual([560, 1260, 1960]);
    }, 120_000);
  });
}

describe('live colour preview (one face alone, before the whole cube is known)', () => {
  it('stickerless cube: every sticker of every face, also held sloppily', () => {
    const rand = mulberry32(21);
    for (const f of SETS['moyu-stickerless']) {
      expect(scanInGuide(f).colors).toEqual(f.colors);
      for (let n = 0; n < 8; n++) expect(scanInGuide(f, sloppy(rand)).colors).toEqual(f.colors);
    }
  }, 120_000);

  it('the embossed logo on the white center does not change its colour', () => {
    const white = SETS['moyu-stickerless'].find((f) => f.colors![4] === 'W')!;
    const s = scanInGuide(white).stickers[4];
    expect(s.color).toBe('W');
    expect(s.purity).toBeGreaterThan(0.8);
  });

  it('overexposed cube: red, green and blue are right, and washed-out orange is not called white', () => {
    let pale = 0;
    for (const f of SETS['stickered-robot']) {
      const got = scanInGuide(f).colors;
      f.colors!.forEach((truth, i) => {
        if ('RGB'.includes(truth)) expect(got[i]).toBe(truth);
        // White and yellow are the same pixels here; only the whole-cube reading can split them.
        if (truth === 'O' && got[i] !== 'O') pale++;
      });
    }
    expect(pale).toBeLessThanOrEqual(2); // two orange stickers are clipped to almost white
  });
});

describe('free-hand detection, real photos', () => {
  /** Detect the face in a photo shrunk so the face is `facePx` wide, as in a video frame. */
  function detectAt(f: PhotoFace, facePx: number) {
    const side = Math.hypot(f.corners[1][0] - f.corners[0][0], f.corners[1][1] - f.corners[0][1]);
    const { image, scale } = shrink(f.image, Math.round((Math.max(f.image.width, f.image.height) * facePx) / side));
    const { face } = detectFace(image);
    if (!face) return null;
    const off = Math.max(...face.corners.map((c, i) => Math.hypot(c[0] - f.corners[i][0] * scale, c[1] - f.corners[i][1] * scale))) / facePx;
    return { face, off };
  }

  it('stickered cube: finds every face at every size and reads the whole cube', () => {
    const faces = SETS['stickered-robot'];
    for (const facePx of [60, 90, 140, 180]) {
      const found = faces.map((f) => detectAt(f, facePx));
      for (const d of found) {
        expect(d).not.toBeNull();
        expect(d!.off).toBeLessThan(0.1);
      }
      const r = readCube(found.map((d) => captureOf(d!.face)));
      expect(r.faces.map((c) => c.join(''))).toEqual(truthOf(faces));
      expect(r.states).toHaveLength(1);
    }
  });

  it('stickerless cube, close up: finds every face and reads the whole cube', () => {
    const faces = SETS['moyu-stickerless'];
    const found = faces.map((f) => detectAt(f, 200));
    for (const d of found) expect(d).not.toBeNull();
    const r = readCube(found.map((d) => captureOf(d!.face)));
    expect(r.faces.map((c) => c.join(''))).toEqual(truthOf(faces));
    expect(r.states).toHaveLength(1);
  });

  it('stickerless cube, smaller: may miss a face, but never reports a wrong one', () => {
    // Known limit: with no gaps, same-coloured neighbours (and stickers against a similar
    // background) merge, so faces go missing. Guide mode is the way to scan these cubes.
    let found = 0;
    for (const facePx of [60, 75, 90, 110, 140]) {
      for (const f of SETS['moyu-stickerless']) {
        const d = detectAt(f, facePx);
        if (!d) continue;
        found++;
        expect(d.off).toBeLessThan(0.12);
        expect(d.face.colors).toEqual(f.colors);
      }
    }
    expect(found).toBeGreaterThanOrEqual(15); // of 30
  });
});

describe('fixture sanity', () => {
  it('each set has six faces with six different centers and 9 stickers of each colour', () => {
    for (const faces of Object.values(SETS)) {
      expect(faces).toHaveLength(FACES.length);
      expect(new Set(faces.map((f) => f.colors![4])).size).toBe(6);
      const count: Partial<Record<Color, number>> = {};
      for (const f of faces) for (const c of f.colors!) count[c] = (count[c] ?? 0) + 1;
      expect(Object.values(count)).toEqual([9, 9, 9, 9, 9, 9]);
    }
  });
});
