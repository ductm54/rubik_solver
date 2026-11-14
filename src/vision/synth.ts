/**
 * Synthetic camera frames of a cube face, for tests and the demo's "test image" button.
 * Renders a 3 × 3 sticker grid on a black body under a perspective view, with clutter, lighting
 * tint, glare and noise.
 */
import { type Color, type CubeState, FACE_FRAMES, FACES, type FaceName } from '../core/cube';
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

/** Logo size as a fraction of the sticker pitch (real logos fill about half of the sticker). */
const LOGO_RADIUS = 0.27;

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
  /** Colour of a brand logo (a disc) drawn in the middle of a white center sticker. */
  logo?: RGB;
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
          if (o.logo && k === 4 && colors[4] === 'W' && Math.hypot(fu - 0.5, fv - 0.5) < LOGO_RADIUS) c = [...o.logo] as RGB;
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

// ---------------------------------------------------------------------------
// 3D cube renderer: ray-casts a whole cube under a pinhole camera, so tilted views show the
// neighbouring sides (and their sticker strips) as a real camera would.


type V3 = [number, number, number];
type M3 = number[]; // row-major 3 × 3

const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mulM = (A: M3, B: M3): M3 => {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
  return C;
};
const mulV = (A: M3, v: V3): V3 => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];
const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];

export interface CubePose {
  /** Face pointing at the camera. */
  front: FaceName;
  /** Neighbouring face that appears at the top of the image (sets the face's rotation). */
  up: FaceName;
  /** Tilt in degrees: positive pitch shows the top neighbour, positive yaw the right neighbour. */
  pitch?: number;
  yaw?: number;
  /** In-image roll in degrees. */
  roll?: number;
  /** Distance from camera to cube center, in sticker pitches (cube is 3 wide). */
  distance?: number;
  /** Shift of the cube in the image, in pixels. */
  shift?: [number, number];
}

export interface CubeRenderOptions {
  width?: number;
  height?: number;
  /** Focal length in pixels. */
  focal?: number;
  noise?: number;
  tint?: [number, number, number];
  gap?: number;
  clutter?: boolean;
  rand?: () => number;
  /** Colour of a brand logo (a disc) drawn in the middle of the white center sticker. */
  logo?: RGB;
}

/** Rotation taking cube coordinates (x→R, y→U, z→F) to camera coordinates (x right, y down, z forward). */
export function poseMatrix(p: CubePose): M3 {
  const f = FACE_FRAMES[p.front].n as V3;
  const u = FACE_FRAMES[p.up].n as V3;
  if (Math.abs(f[0] * u[0] + f[1] * u[1] + f[2] * u[2]) > 0.5) throw new Error('up must be a neighbour of front');
  const r = cross3(u, f);
  // rows: camera x = r, camera y = -u, camera z = -f
  const base: M3 = [r[0], r[1], r[2], -u[0], -u[1], -u[2], -f[0], -f[1], -f[2]];
  const deg = Math.PI / 180;
  // Pitch: rotate about camera x so the top side turns towards the camera.
  const tilt = mulM(rotZ((p.roll ?? 0) * deg), mulM(rotY((p.yaw ?? 0) * deg), rotX((p.pitch ?? 0) * deg)));
  return mulM(tilt, base);
}

export function renderCube(state: CubeState, pose: CubePose, o: CubeRenderOptions = {}): RGBAImage {
  const W = o.width ?? 360;
  const H = o.height ?? 270;
  const focal = o.focal ?? W * 1.1;
  const dist = pose.distance ?? 11;
  const gap = o.gap ?? 0.09;
  const noise = o.noise ?? 4;
  const tint = o.tint ?? [1, 1, 1];
  const rand = o.rand ?? Math.random;
  const R = poseMatrix(pose);
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const [sx, sy] = pose.shift ?? [0, 0];
  const cx = W / 2 + sx;
  const cy = H / 2 + sy;
  const origin = mulV(Rt, [0, 0, -dist]); // camera position in cube coordinates
  const light: V3 = [-0.3, -0.5, -1];
  const ln = Math.hypot(...light);
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
  const faceByAxis = (axis: number, sign: number): FaceName =>
    FACES.find((f) => FACE_FRAMES[f].n[axis] === sign)!;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = mulV(Rt, [(x + 0.5 - cx) / focal, (y + 0.5 - cy) / focal, 1]);
      // slab intersection with the box [-1.5, 1.5]^3
      let tmin = -Infinity;
      let tmax = Infinity;
      let axis = -1;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-12) {
          if (Math.abs(origin[k]) > 1.5) tmin = Infinity;
          continue;
        }
        const t1 = (-1.5 - origin[k]) / d[k];
        const t2 = (1.5 - origin[k]) / d[k];
        const lo = Math.min(t1, t2);
        if (lo > tmin) {
          tmin = lo;
          axis = k;
        }
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
      let c: RGB;
      if (tmin < tmax && tmin > 0 && axis >= 0) {
        const p: V3 = [origin[0] + d[0] * tmin, origin[1] + d[1] * tmin, origin[2] + d[2] * tmin];
        const face = faceByAxis(axis, Math.sign(p[axis]));
        const { a, b, n } = FACE_FRAMES[face];
        const u = p[0] * a[0] + p[1] * a[1] + p[2] * a[2] + 1.5;
        const v = p[0] * b[0] + p[1] * b[1] + p[2] * b[2] + 1.5;
        const col = Math.min(2, Math.max(0, Math.floor(u)));
        const row = Math.min(2, Math.max(0, Math.floor(v)));
        const fu = u - col;
        const fv = v - row;
        const inside = fu > gap / 2 && fu < 1 - gap / 2 && fv > gap / 2 && fv < 1 - gap / 2;
        const nc = mulV(R, n as V3);
        const lambert = Math.max(0, (nc[0] * light[0] + nc[1] * light[1] + nc[2] * light[2]) / ln);
        const shade = 0.6 + 0.4 * lambert;
        const isLogo = o.logo && row === 1 && col === 1 && state[face][4] === 'W' && Math.hypot(fu - 0.5, fv - 0.5) < LOGO_RADIUS;
        const base = isLogo ? o.logo! : CAMERA_RGB[state[face][row * 3 + col]];
        c = inside ? (base.map((v) => v * shade) as RGB) : [22, 22, 24];
      } else {
        const g = 120 + 60 * (x / W) + 20 * Math.sin(y / 17);
        c = [g * 0.95, g, g * 1.05];
        for (const r of clutter) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) c = r.c;
      }
      const q = (y * W + x) * 4;
      data[q] = c[0] * tint[0] + gauss();
      data[q + 1] = c[1] * tint[1] + gauss();
      data[q + 2] = c[2] * tint[2] + gauss();
      data[q + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** The neighbour faces of `front`, in the order they can serve as `up`. */
export function neighboursOf(front: FaceName): FaceName[] {
  const n = FACE_FRAMES[front].n;
  return FACES.filter((f) => {
    const m = FACE_FRAMES[f].n;
    return m[0] * n[0] + m[1] * n[1] + m[2] * n[2] === 0;
  });
}
