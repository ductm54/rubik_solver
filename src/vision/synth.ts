/**
 * Synthetic camera frames of a cube face, for tests and the demo's "test image" button.
 * Renders a 3 × 3 sticker grid on a black body under a perspective view, with clutter, lighting
 * tint, glare and noise.
 */
import type { Color } from '../core/cube';
import type { RGB } from './color';
import type { RGBAImage } from './detect';
import { type Point, applyH, fitHomography, invertH } from './homography';

export const CAMERA_RGB: Record<Color, RGB> = {
  W: [225, 228, 225],
  Y: [240, 210, 40],
  G: [30, 160, 85],
  B: [30, 85, 185],
  R: [185, 30, 45],
  O: [245, 110, 30],
};

export interface SynthOptions {
  width?: number;
  height?: number;
  /** Image positions of the face's outer corners: top-left, top-right, bottom-right, bottom-left. */
  corners?: [Point, Point, Point, Point];
  /** Gap between stickers as a fraction of the pitch. */
  gap?: number;
  /** Per-channel multiplier (e.g. warm light [1.1, 1, 0.8]). */
  tint?: [number, number, number];
  noise?: number;
  /** Sticker index (0..8) with a bright glare spot. */
  glare?: number;
  /** Deterministic random source. */
  rand?: () => number;
  clutter?: boolean;
}

export function renderFace(colors: Color[], o: SynthOptions = {}): RGBAImage {
  const W = o.width ?? 320;
  const H = o.height ?? 240;
  const corners = o.corners ?? [
    [100, 60],
    [220, 60],
    [220, 180],
    [100, 180],
  ];
  const gap = o.gap ?? 0.1;
  const tint = o.tint ?? [1, 1, 1];
  const noise = o.noise ?? 4;
  const rand = o.rand ?? Math.random;
  const Hm = fitHomography(
    [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ],
    corners,
  )!;
  const inv = invertH(Hm);
  // body extends a bit beyond the face (cube edge)
  const data = new Uint8ClampedArray(W * H * 4);
  const clutter: { x: number; y: number; w: number; h: number; c: RGB }[] = [];
  if (o.clutter) {
    for (let k = 0; k < 12; k++) {
      clutter.push({
        x: rand() * W,
        y: rand() * H,
        w: 10 + rand() * 50,
        h: 4 + rand() * 30,
        c: [rand() * 255, rand() * 255, rand() * 255].map(Math.round) as RGB,
      });
    }
  }
  const gauss = () => (rand() + rand() + rand() - 1.5) * 2 * noise;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = applyH(inv, [x + 0.5, y + 0.5]);
      let c: RGB;
      if (u >= -0.06 && u <= 3.06 && v >= -0.06 && v <= 3.06) {
        const col = Math.min(2, Math.max(0, Math.floor(u)));
        const row = Math.min(2, Math.max(0, Math.floor(v)));
        const fu = u - col;
        const fv = v - row;
        const inside = fu > gap / 2 && fu < 1 - gap / 2 && fv > gap / 2 && fv < 1 - gap / 2 && u >= 0 && u <= 3 && v >= 0 && v <= 3;
        if (inside) {
          const k = row * 3 + col;
          c = [...CAMERA_RGB[colors[k]]] as RGB;
          // gentle shading across the face
          const shade = 0.92 + 0.08 * (1 - v / 3);
          c = c.map((x) => x * shade) as RGB;
          if (o.glare === k) {
            const d = Math.hypot(fu - 0.65, fv - 0.35);
            if (d < 0.15) c = [255, 255, 255];
          }
        } else c = [22, 22, 24];
      } else {
        // background: soft gradient + clutter
        const g = 120 + 60 * (x / W) + 20 * Math.sin(y / 17);
        c = [g * 0.95, g, g * 1.05];
        for (const r of clutter) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) c = r.c;
      }
      const p = (y * W + x) * 4;
      data[p] = c[0] * tint[0] + gauss();
      data[p + 1] = c[1] * tint[1] + gauss();
      data[p + 2] = c[2] * tint[2] + gauss();
      data[p + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
