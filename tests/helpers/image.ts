/** Test helpers for real photos: load a JPEG, shrink it, and list the fixtures. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import type { Color } from '../../src/core/cube';
import type { RGBAImage } from '../../src/vision/detect';
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
export function loadVideo(set: string): { fps: number; faces: string[]; shown: number[]; brief: number[]; frames: () => Generator<RGBAImage> } {
  const meta = JSON.parse(readFileSync(join(FIXTURES, set, 'video.json'), 'utf8')) as { fps: number; frames: number; faces: string[]; shown: number[]; brief?: number[] };
  return {
    fps: meta.fps,
    faces: meta.faces,
    /** When each face first comes into view, in seconds. */
    shown: meta.shown,
    /** Indexes of faces that are in view too briefly to be captured. */
    brief: meta.brief ?? [],
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
