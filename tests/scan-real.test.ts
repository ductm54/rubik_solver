/**
 * Scanner tests on real photos (tests/fixtures):
 *   moyu-stickerless  a hand-held stickerless cube with rounded pieces and an embossed logo on the
 *                     white center, in a cluttered room
 *   stickered-robot   a stickered cube in a LEGO robot, badly overexposed: white and yellow are
 *                     almost the same pixel values, orange looks salmon, green looks mint
 *   no-cube           views without a cube face
 */
import { describe, expect, it } from 'vitest';
import { type Color, FACES } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { captureOf, readCube } from '../src/scan/readCube';
import { detectFace } from '../src/vision/detect';
import { FaceFollower } from '../src/vision/follow';
import { SteadyDetector, findDuplicate, fitGuide, isClear, readGuide } from '../src/vision/guide';
import { type Framing, type PhotoFace, frameInGuide, loadNoCube, loadSet, shrink } from './helpers/image';

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
    // how far the reported corners are from the real ones, as a share of the face's width
    const off = Math.max(...face.corners.map((c, i) => Math.hypot(c[0] - f.corners[i][0] * scale, c[1] - f.corners[i][1] * scale))) / facePx;
    return { face, off, image };
  }
  // from a cube that fills a tenth of the picture to one that fills most of it
  const SIZES = [40, 60, 75, 90, 110, 140, 200];

  for (const [name, faces] of Object.entries(SETS)) {
    it(`${name}: finds the face at every size, in the right place`, () => {
      let missed = 0;
      for (const facePx of SIZES) {
        for (const f of faces) {
          const d = detectAt(f, facePx);
          if (!d) {
            missed++;
            continue;
          }
          // The fit is a square; a tilted face is not quite one, hence the allowance.
          expect(d.off).toBeLessThan(0.16);
        }
      }
      expect(missed).toBeLessThanOrEqual(1); // of 42
    });

    it(`${name}: reads the whole cube at every size`, () => {
      for (const facePx of [60, 90, 140, 200]) {
        const found = faces.map((f) => detectAt(f, facePx));
        for (const d of found) expect(d).not.toBeNull();
        const r = readCube(found.map((d) => captureOf(d!.face)));
        expect(r.faces.map((c) => c.join(''))).toEqual(truthOf(faces));
        expect(r.states).toHaveLength(1);
      }
    });
  }

  it('stickerless cube: the live preview of each found face is right', () => {
    for (const facePx of SIZES) {
      for (const f of SETS['moyu-stickerless']) {
        const d = detectAt(f, facePx);
        if (d) expect(d.face.colors).toEqual(f.colors);
      }
    }
  });

  it('finds nothing in photos without a cube face (floor, desk, hand, robot, part of a cube)', () => {
    for (const n of loadNoCube()) {
      for (const max of [360, 240, 160]) {
        expect(detectFace(shrink(n.image, max).image).face, `${n.name} at ${max}px`).toBeNull();
      }
    }
  });

  it('follows a face from one frame to the next', () => {
    for (const f of SETS['moyu-stickerless']) {
      const first = detectAt(f, 110)!;
      // next frame: the same view, moved a little
      const moved = { ...first.face.placement, cx: first.face.placement.cx + 3, cy: first.face.placement.cy - 2 };
      const next = detectFace(first.image, { previous: moved, searchIfLost: false }).face!;
      expect(next.colors).toEqual(f.colors);
      expect(Math.hypot(next.placement.cx - first.face.placement.cx, next.placement.cy - first.face.placement.cy)).toBeLessThan(0.15 * first.face.placement.pitch);
    }
  });

  it('video: a new face in a new spot is picked up at once, not confused with the last one', () => {
    for (const faces of Object.values(SETS)) {
      const follower = new FaceFollower();
      for (let lap = 0; lap < 2; lap++) {
        faces.forEach((f, i) => {
          // each face a different size, so it lands somewhere else in the frame
          const side = Math.hypot(f.corners[1][0] - f.corners[0][0], f.corners[1][1] - f.corners[0][1]);
          const { image } = shrink(f.image, Math.round((Math.max(f.image.width, f.image.height) * (80 + 25 * ((i + lap) % 4))) / side));
          for (let frame = 0; frame < 4; frame++) {
            const face = follower.detect(image);
            expect(face, `${f.name} frame ${frame}`).not.toBeNull();
            if (faces === SETS['moyu-stickerless']) expect(face!.colors).toEqual(f.colors);
          }
        });
      }
    }
  });

  it('is quick enough for live video', () => {
    const frames = [...SETS['moyu-stickerless'], ...SETS['stickered-robot']].map((f) => shrink(f.image, 360).image);
    for (const image of frames) detectFace(image); // warm up
    const t = performance.now();
    for (const image of frames) detectFace(image);
    expect((performance.now() - t) / frames.length).toBeLessThan(150); // ms per frame; about 25 on a laptop
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
