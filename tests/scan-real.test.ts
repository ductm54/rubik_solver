/**
 * Scanner tests on real photos (tests/fixtures):
 *   moyu-stickerless  a hand-held stickerless cube with rounded pieces and an embossed logo on the
 *                     white center, in a cluttered room
 *   stickered-robot   a stickered cube in a LEGO robot, badly overexposed: white and yellow are
 *                     almost the same pixel values, orange looks salmon, green looks mint
 *   no-cube           views without a cube face
 *   moyu-video        a phone video of the stickerless cube being turned by hand
 *   moyu-video-2      another, in dim warm light, with the white side solved and a reflection
 *   moyu-video-3      another, in low light over a pale cloth, phone held sideways
 */
import { describe, expect, it } from 'vitest';
import { type Color, FACES } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { type Capture, captureOf, readCube } from '../src/scan/readCube';
import { type Lab, nameTogether } from '../src/vision/color';
import { detectFace } from '../src/vision/detect';
import { isSolvedSide, refinePlacement } from '../src/vision/faceSearch';
import { FaceFollower } from '../src/vision/follow';
import { type Placement, placePoint } from '../src/vision/grid';
import { CaptureTracker } from '../src/vision/tracker';
import { findDuplicate } from '../src/vision/duplicate';
import { type PhotoFace, loadNoCube, loadSet, loadVideo, shrink } from './helpers/image';

const SETS = { 'moyu-stickerless': loadSet('moyu-stickerless'), 'stickered-robot': loadSet('stickered-robot') };

const truthOf = (faces: PhotoFace[]) => faces.map((f) => f.colors!.join(''));

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

  it('one sticker of a face is not taken for a solved side: it has no seams in it', () => {
    let squares = 0;
    for (const faces of Object.values(SETS)) {
      for (const facePx of [60, 90, 140, 200]) {
        for (const f of faces) {
          const side = Math.hypot(f.corners[1][0] - f.corners[0][0], f.corners[1][1] - f.corners[0][1]);
          const { image, scale } = shrink(f.image, Math.round((Math.max(f.image.width, f.image.height) * facePx) / side));
          const whole: Placement = {
            cx: (f.corners.reduce((a, c) => a + c[0], 0) / 4) * scale,
            cy: (f.corners.reduce((a, c) => a + c[1], 0) / 4) * scale,
            pitch: facePx / 3,
            rot: Math.atan2(f.corners[1][1] - f.corners[0][1], f.corners[1][0] - f.corners[0][0]),
          };
          // a 3 × 3 grid laid over each sticker on its own, settled the way the detector does it
          for (let k = 0; k < 9; k++) {
            const [cx, cy] = placePoint(whole, (k % 3) - 1, Math.floor(k / 3) - 1);
            const one = refinePlacement(image, { ...whole, cx, cy, pitch: whole.pitch / 3 }, 6);
            // many stickers are a flat square with other colours all round, like a solved side
            if (!one.plain) continue;
            squares++;
            expect(isSolvedSide(image, one), `${f.name} at ${facePx}px, sticker ${k}`).toBe(false);
          }
        }
      }
    }
    expect(squares).toBeGreaterThan(100); // of 432
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

for (const name of ['moyu-video', 'moyu-video-2', 'moyu-video-3']) {
  describe(`free-hand scan of a real video (cube turned by hand, never held still): ${name}`, () => {
    const video = loadVideo(name);
    // the faces that are in view long enough to capture, in the order shown
    const held = video.faces.map((_, k) => k).filter((k) => !video.brief.includes(k));

    /** What the scan page does with a camera: follow the face, capture steady readings, drop repeats. */
    const done = new Map<number, ReturnType<typeof run>>();
    const scan = (skip = 1) => done.get(skip) ?? done.set(skip, run(skip)).get(skip)!;
    function run(skip: number) {
      const follower = new FaceFollower();
      const tracker = new CaptureTracker();
      const captures: { t: number; capture: Capture; alone: string; together: string }[] = [];
      let seen = 0;
      let i = 0;
      for (const frame of video.frames()) {
        if (i++ % skip) continue;
        const t = ((i - 1) * 1000) / video.fps;
        const face = follower.detect(frame, t);
        if (face) seen++;
        const u = tracker.update(face, t);
        if (!u.capture) continue;
        const capture = captureOf(u.capture);
        if (findDuplicate(capture.labs, captures.map((c) => c.capture.labs)) >= 0) continue;
        // the preview as the page shows it: named together with the faces captured before
        const together = nameTogether([...captures.flatMap((c) => c.capture.rgbs!), ...capture.rgbs!]).slice(-9).join('');
        captures.push({ t, capture, alone: u.capture.colors.join(''), together });
      }
      return { captures, seen, frames: Math.ceil(i / skip) };
    }

    /** All six faces for the whole-cube reading: the captures, plus a single frame of each brief face. */
    function sixFaces(captures: { capture: Capture }[]): Capture[] {
      const six = captures.map((c) => c.capture);
      const frames = [...video.frames()];
      for (const k of video.brief) six.splice(k, 0, captureOf(detectFace(frames[Math.round(video.shown[k] * video.fps)]).face!));
      return six;
    }

    it('captures every face held in view, in the order shown, and reads the whole cube', () => {
      const { captures, seen, frames } = scan();
      expect(captures).toHaveLength(held.length);
      const r = readCube(sixFaces(captures));
      expect(r.faces.map((f) => f.join(''))).toEqual(video.faces);
      expect(r.states).toHaveLength(1);
      // a face is in view for most of the video; the rest is turning
      expect(seen / frames).toBeGreaterThan(0.5);
    }, 60_000);

    it('never takes one sticker for a solved side', () => {
      // Whatever is reported as a one-colour face must be as big as the cube's other faces. While
      // a layer is being turned no whole face is in view, and single stickers used to be reported.
      const widths: number[] = [];
      const plain: { frame: number; pitch: number }[] = [];
      let i = 0;
      for (const frame of video.frames()) {
        i++;
        const face = detectFace(frame).face;
        if (face?.plain) plain.push({ frame: i, pitch: face.placement.pitch });
        else if (face) widths.push(face.placement.pitch);
      }
      const usual = widths.sort((a, b) => a - b)[widths.length >> 1];
      expect(plain.filter((f) => f.pitch < 0.6 * usual)).toEqual([]);
      // the second video is the one with a solved side
      if (name === 'moyu-video-2') expect(plain.length).toBeGreaterThanOrEqual(15);
      else expect(plain).toEqual([]);
    }, 60_000);

    it('captures each face within a second of it coming into view', () => {
      const { captures } = scan();
      captures.forEach((c, n) => {
        expect(c.t / 1000).toBeGreaterThanOrEqual(video.shown[held[n]]);
        expect(c.t / 1000 - video.shown[held[n]]).toBeLessThan(1);
      });
    }, 60_000);

    it('still works on a slow phone that manages 5 frames per second', () => {
      const { captures } = scan(2);
      expect(captures).toHaveLength(held.length);
      const r = readCube(sixFaces(captures));
      expect(r.faces.map((f) => f.join(''))).toEqual(video.faces);
    }, 60_000);

    it('the live preview names every sticker right, before the whole cube is known', () => {
      const { captures } = scan();
      const truth = held.map((k) => video.faces[k]);
      expect(captures.map((c) => c.together)).toEqual(truth);
      expect(captures.map((c) => c.alone)).toEqual(truth);
    }, 60_000);
  });
}

describe('special cases in the second video', () => {
  const video = loadVideo('moyu-video-2');

  it('a solved white side is found by its outline, once a cube has been seen there', () => {
    const follower = new FaceFollower();
    let i = 0;
    let white = 0;
    for (const frame of video.frames()) {
      const face = follower.detect(frame, (i++ * 1000) / video.fps);
      if (face?.plain) {
        white++;
        expect(face.colors.join('')).toBe('WWWWWWWWW');
      }
    }
    expect(white).toBeGreaterThanOrEqual(10); // it is in view for about 2 s = 20 frames
  }, 60_000);

  it('a white square is not taken for a face when no cube was seen before it', () => {
    const follower = new FaceFollower();
    const frames = [...video.frames()].slice(80, 95); // the white side only
    expect(frames.map((f, k) => follower.detect(f, k * 100)).filter(Boolean)).toHaveLength(0);
  }, 60_000);

  it('a face read twice in changing light counts as a repeat, not as a seventh face', () => {
    const follower = new FaceFollower();
    const tracker = new CaptureTracker();
    const labs: Lab[][] = [];
    let repeats = 0;
    let i = 0;
    for (const frame of video.frames()) {
      const t = (i++ * 1000) / video.fps;
      const u = tracker.update(follower.detect(frame, t), t);
      if (!u.capture) continue;
      const l = u.capture.stickers.map((s) => s.lab);
      if (findDuplicate(l, labs) >= 0) repeats++;
      else labs.push(l);
    }
    expect(labs).toHaveLength(6);
    expect(repeats).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('the small reflection of the cube in the window is never reported', () => {
    const follower = new FaceFollower();
    let i = 0;
    for (const frame of video.frames()) {
      const face = follower.detect(frame, (i++ * 1000) / video.fps);
      // the reflection sits in the top fifth of the frame and is a third of the cube's size
      if (face) expect(face.placement.cy).toBeGreaterThan(frame.height * 0.3);
    }
  }, 60_000);
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
