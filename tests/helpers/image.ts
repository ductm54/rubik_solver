/** Test helpers for real photos: load a JPEG, shrink it, and re-frame it as the camera would see it. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import type { Color } from '../../src/core/cube';
import type { RGBAImage } from '../../src/vision/detect';
import { type GuideSquare, guideSquare } from '../../src/vision/guide';
import type { Point } from '../../src/vision/homography';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export interface PhotoFace {
  name: string;
  image: RGBAImage;
  /** Face corners in the photo: top-left, top-right, bottom-right, bottom-left. */
  corners: Point[];
  /** The 9 colours row by row as seen in the photo, when they are known. */
  colors: Color[] | null;
}

/** All faces of a photo set under tests/fixtures. */
export function loadSet(set: string): PhotoFace[] {
  const meta = JSON.parse(readFileSync(join(FIXTURES, set, 'faces.json'), 'utf8')) as {
    faces: { file: string; corners: Point[]; colors: string | null }[];
  };
  return meta.faces.map((f) => {
    const j = jpeg.decode(readFileSync(join(FIXTURES, set, f.file)), { useTArray: true, formatAsRGBA: true });
    return {
      name: `${set}/${f.file}`,
      image: { width: j.width, height: j.height, data: j.data },
      corners: f.corners,
      colors: f.colors ? ([...f.colors] as Color[]) : null,
    };
  });
}

/** Photos with no cube face in them (tests/fixtures/no-cube). */
export function loadNoCube(): { name: string; image: RGBAImage }[] {
  const meta = JSON.parse(readFileSync(join(FIXTURES, 'no-cube', 'files.json'), 'utf8')) as { files: string[] };
  return meta.files.map((file) => {
    const j = jpeg.decode(readFileSync(join(FIXTURES, 'no-cube', file)), { useTArray: true, formatAsRGBA: true });
    return { name: `no-cube/${file}`, image: { width: j.width, height: j.height, data: j.data } };
  });
}

/** A video under tests/fixtures as its frames, with the faces it shows in order. */
export function loadVideo(set: string): { fps: number; faces: string[]; frames: () => Generator<RGBAImage> } {
  const meta = JSON.parse(readFileSync(join(FIXTURES, set, 'video.json'), 'utf8')) as { fps: number; frames: number; faces: string[] };
  return {
    fps: meta.fps,
    faces: meta.faces,
    *frames() {
      for (let i = 1; i <= meta.frames; i++) {
        const j = jpeg.decode(readFileSync(join(FIXTURES, set, `f_${String(i).padStart(3, '0')}.jpg`)), { useTArray: true, formatAsRGBA: true });
        yield { width: j.width, height: j.height, data: j.data };
      }
    },
  };
}

/** Shrink so the longest side is `max` pixels (area average, like drawing video onto a small canvas). */
export function shrink(img: RGBAImage, max: number): { image: RGBAImage; scale: number } {
  const k = max / Math.max(img.width, img.height);
  if (k >= 1) return { image: img, scale: 1 };
  const W = Math.round(img.width * k);
  const H = Math.round(img.height * k);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x / k);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) / k)));
      const y0 = Math.floor(y / k);
      const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / k)));
      const s = [0, 0, 0];
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * 4;
          s[0] += img.data[p];
          s[1] += img.data[p + 1];
          s[2] += img.data[p + 2];
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      const q = (y * W + x) * 4;
      out[q] = s[0] / n;
      out[q + 1] = s[1] / n;
      out[q + 2] = s[2] / n;
      out[q + 3] = 255;
    }
  }
  return { image: { width: W, height: H, data: out }, scale: k };
}

export interface Framing {
  /** Size of the cube relative to the guide square (1 = fills it exactly). */
  scale?: number;
  /** Rotation of the cube in the frame, degrees. */
  rot?: number;
  /** Offset of the cube from the middle of the guide, in sticker pitches. */
  dx?: number;
  dy?: number;
  /** Blur radius in output pixels (hand shake / focus), 0 = sharp. */
  blur?: number;
}

/**
 * The photo as a camera frame in which the user has lined the face up with the guide square.
 * Only turns, zooms and shifts the photo (what moving the phone does); the photo's own
 * perspective, lighting and background stay as they are.
 */
export function frameInGuide(face: PhotoFace, f: Framing = {}, size = 240): { image: RGBAImage; square: GuideSquare } {
  const { image: src, corners: c } = face;
  const sq = guideSquare(size, size);
  const center: Point = [(c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4];
  const side = (dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]) + dist(c[3], c[0])) / 4;
  // direction of the face's rows in the photo
  const ax = c[1][0] - c[0][0] + c[2][0] - c[3][0];
  const ay = c[1][1] - c[0][1] + c[2][1] - c[3][1];
  const angle = Math.atan2(ay, ax) - ((f.rot ?? 0) * Math.PI) / 180;
  const k = side / (sq.size * (f.scale ?? 1)); // source pixels per output pixel
  const cos = Math.cos(angle) * k;
  const sin = Math.sin(angle) * k;
  const pitch = sq.size / 3;
  const ox = size / 2 + (f.dx ?? 0) * pitch;
  const oy = size / 2 + (f.dy ?? 0) * pitch;
  let out = new Uint8ClampedArray(size * size * 4);
  const n = Math.max(1, Math.round(k)); // supersample when shrinking
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const u = x + (i + 0.5) / n - ox;
          const v = y + (j + 0.5) / n - oy;
          const px = sample(src, center[0] + u * cos - v * sin, center[1] + u * sin + v * cos);
          s[0] += px[0];
          s[1] += px[1];
          s[2] += px[2];
        }
      }
      const q = (y * size + x) * 4;
      out[q] = s[0] / (n * n);
      out[q + 1] = s[1] / (n * n);
      out[q + 2] = s[2] / (n * n);
      out[q + 3] = 255;
    }
  }
  for (let pass = 0; pass < (f.blur ?? 0); pass++) out = box3(out, size, size);
  return { image: { width: size, height: size, data: out }, square: sq };
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Bilinear sample; outside the photo the nearest edge pixel repeats. */
function sample(img: RGBAImage, x: number, y: number): [number, number, number] {
  const cx = Math.min(img.width - 1.001, Math.max(0, x));
  const cy = Math.min(img.height - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const p = (y0 * img.width + x0) * 4 + ch;
    const top = img.data[p] * (1 - fx) + img.data[p + 4] * fx;
    const bot = img.data[p + img.width * 4] * (1 - fx) + img.data[p + img.width * 4 + 4] * fx;
    out[ch] = top * (1 - fy) + bot * fy;
  }
  return out;
}

function box3(src: Uint8ClampedArray, W: number, H: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            s += src[(yy * W + xx) * 4 + ch];
            n++;
          }
        }
        out[(y * W + x) * 4 + ch] = s / n;
      }
      out[(y * W + x) * 4 + 3] = 255;
    }
  }
  return out;
}
