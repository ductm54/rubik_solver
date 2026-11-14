/**
 * Find a cube face (3 × 3 grid of stickers) in an RGBA frame and read its 9 colours.
 *
 * Pipeline (all plain TypeScript, runs in a Web Worker or in Node tests):
 *   1. grey + blur → Sobel edge magnitude → edge mask (dilated by 1 px)
 *   2. connected regions of non-edge pixels → keep square-ish regions of plausible size
 *   3. for each region as a seed, build a local lattice from its nearest neighbours and count
 *      the regions that fall on a 3 × 3 grid; keep the best grid
 *   4. fit a homography grid → image, re-associate regions, refit
 *   5. normalise the labelling so row 0 is at the top of the image, then sample the middle of each
 *      sticker in Lab, dropping glare / outlier pixels
 */
import type { Color } from '../core/cube';
import { type Lab, type RGB, classifySticker, rgbToLab } from './color';
import { type Homography, type Point, applyH, fitHomography } from './homography';

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface Region {
  cx: number;
  cy: number;
  area: number;
}

export interface StickerReading {
  /** Sticker center in image pixels. */
  center: Point;
  lab: Lab;
  rgb: RGB;
  /** Nearest standard colour (single-face guess; whole-cube reading rebalances later). */
  color: Color;
  /** How far the second-best colour is behind; small = ambiguous. */
  margin: number;
  /** True if a sticker region was actually found here (false = position interpolated). */
  found: boolean;
}

export interface FaceReading {
  /** Outer corners of the face in image pixels: top-left, top-right, bottom-right, bottom-left. */
  corners: [Point, Point, Point, Point];
  /** Grid (col, row) → image homography; sticker centers are at integer coords 0..2. */
  homography: Homography;
  /** 9 stickers row by row as seen in the image. */
  stickers: StickerReading[];
  colors: Color[];
  /** How many of the 9 stickers were found directly. */
  found: number;
  /** Mean distance (in pitches) between found regions and the fitted grid. */
  residual: number;
  /** Laplacian variance inside the face (higher = sharper). */
  sharpness: number;
}

export interface DetectOptions {
  /** Minimum sticker regions that must lie on the grid. */
  minFound?: number;
  /** Edge threshold floor for the Sobel magnitude. */
  minEdge?: number;
}

export interface DetectResult {
  face: FaceReading | null;
  /** Square-ish regions considered (for debugging overlays). */
  regions: Region[];
}

export function detectFace(img: RGBAImage, opts: DetectOptions = {}): DetectResult {
  const { width: W, height: H, data } = img;
  const minFound = opts.minFound ?? 6;
  const N = W * H;

  // 1. grey, blur, edges
  const grey = new Float32Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) grey[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  const blur = boxBlur3(grey, W, H);
  const mag = new Float32Array(N);
  let sum = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = blur[i - W + 1] + 2 * blur[i + 1] + blur[i + W + 1] - blur[i - W - 1] - 2 * blur[i - 1] - blur[i + W - 1];
      const gy = blur[i + W - 1] + 2 * blur[i + W] + blur[i + W + 1] - blur[i - W - 1] - 2 * blur[i - W] - blur[i - W + 1];
      const m = Math.abs(gx) + Math.abs(gy);
      mag[i] = m;
      sum += m;
    }
  }
  const mean = sum / N;
  const T = Math.max(opts.minEdge ?? 40, Math.min(160, 2 * mean));
  const edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (mag[i] > T) edge[i] = 1;
  // Colour edges: neighbouring stickers can have similar grey but different hue; add a chroma
  // gradient so e.g. red next to green still separates when the gap is thin.
  addChromaEdges(data, W, H, edge, T);
  const mask = dilate(edge, W, H);
  // Image border counts as edge so regions touching it are dropped below.

  // 2. regions
  const regions = findRegions(mask, W, H);

  // 3. grid search
  const best = findGrid(regions);
  if (!best || best.found < minFound) return { face: null, regions };

  // 4. normalise orientation
  const Hm = normaliseOrientation(best.H);
  if (!Hm) return { face: null, regions };
  const corners = ([[-0.5, -0.5], [2.5, -0.5], [2.5, 2.5], [-0.5, 2.5]] as Point[]).map((p) => applyH(Hm, p)) as [
    Point,
    Point,
    Point,
    Point,
  ];
  if (!isConvex(corners)) return { face: null, regions };
  // the whole face must be inside the frame
  if (corners.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H)) return { face: null, regions };

  // 5. sample stickers
  const stickers: StickerReading[] = [];
  const pitch = Math.sqrt(polyArea(corners)) / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const center = applyH(Hm, [col, row]);
      const { lab, rgb } = sampleSticker(data, W, H, Hm, col, row);
      const cls = classifySticker(lab);
      const found = regions.some((r) => Math.hypot(r.cx - center[0], r.cy - center[1]) < 0.3 * pitch);
      stickers.push({ center, lab, rgb, color: cls.color, margin: cls.margin, found });
    }
  }

  return {
    face: {
      corners,
      homography: Hm,
      stickers,
      colors: stickers.map((s) => s.color),
      found: stickers.filter((s) => s.found).length,
      residual: best.residual,
      sharpness: laplacianVariance(grey, W, H, corners),
    },
    regions,
  };
}

// ---------------------------------------------------------------------------

function boxBlur3(src: Float32Array, W: number, H: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const l = x > 0 ? src[i - 1] : src[i];
      const r = x < W - 1 ? src[i + 1] : src[i];
      tmp[i] = (l + src[i] + r) / 3;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const u = y > 0 ? tmp[i - W] : tmp[i];
      const d = y < H - 1 ? tmp[i + W] : tmp[i];
      out[i] = (u + tmp[i] + d) / 3;
    }
  }
  return out;
}

function addChromaEdges(data: Uint8ClampedArray | Uint8Array, W: number, H: number, edge: Uint8Array, T: number) {
  // Opponent channels r-g and (r+g)/2-b, blurred twice to suppress sensor noise.
  let rg: Float32Array = new Float32Array(W * H);
  let yb: Float32Array = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    rg[i] = data[p] - data[p + 1];
    yb[i] = (data[p] + data[p + 1]) / 2 - data[p + 2];
  }
  rg = boxBlur3(boxBlur3(rg, W, H), W, H);
  yb = boxBlur3(boxBlur3(yb, W, H), W, H);
  const t = Math.max(30, T * 0.6);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const g =
        Math.abs(rg[i + 1] - rg[i - 1]) +
        Math.abs(rg[i + W] - rg[i - W]) +
        Math.abs(yb[i + 1] - yb[i - 1]) +
        Math.abs(yb[i + W] - yb[i - W]);
      if (g > t) edge[i] = 1;
    }
  }
}

function dilate(src: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        out[i] = 1;
        continue;
      }
      out[i] =
        src[i] | src[i - 1] | src[i + 1] | src[i - W] | src[i + W]
          ? 1
          : 0;
    }
  }
  return out;
}

/** Connected non-edge regions (4-connectivity) that look like a filled square. */
function findRegions(mask: Uint8Array, W: number, H: number): Region[] {
  const N = W * H;
  const label = new Int32Array(N).fill(-1);
  const minArea = Math.max(25, N * 0.0006);
  const maxArea = N * 0.08;
  const out: Region[] = [];
  const stack = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (mask[start] || label[start] !== -1) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = start;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let touches = false;
    while (sp) {
      const i = stack[--sp];
      const x = i % W;
      const y = (i - x) / W;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2) touches = true;
      // neighbours (border pixels are always mask=1, so no bounds checks needed beyond them)
      const nb = [i - 1, i + 1, i - W, i + W];
      for (const j of nb) {
        if (j < 0 || j >= N || mask[j] || label[j] !== -1) continue;
        label[j] = start;
        stack[sp++] = j;
      }
    }
    if (touches || n < minArea || n > maxArea) continue;
    const cx = sx / n;
    const cy = sy / n;
    const vxx = sxx / n - cx * cx;
    const vyy = syy / n - cy * cy;
    const vxy = sxy / n - cx * cy;
    const tr = vxx + vyy;
    const det = vxx * vyy - vxy * vxy;
    if (det <= 0) continue;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc;
    const l2 = tr / 2 - disc;
    if (l2 <= 0 || Math.sqrt(l1 / l2) > 2.2) continue;
    // A filled rectangle has area = 12·sqrt(det); ragged or hollow shapes fall short / over.
    const fill = n / (12 * Math.sqrt(det));
    if (fill < 0.8 || fill > 1.12) continue;
    out.push({ cx, cy, area: n });
  }
  return out;
}

interface GridFit {
  H: Homography;
  found: number;
  residual: number;
}

const GRID: Point[] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) GRID.push([c, r]);

function findGrid(regions: Region[]): GridFit | null {
  let best: GridFit | null = null;
  const better = (a: GridFit, b: GridFit | null) =>
    !b || a.found > b.found || (a.found === b.found && a.residual < b.residual);

  for (const seed of regions) {
    const size = Math.sqrt(seed.area);
    const similar = regions.filter(
      (r) => r !== seed && r.area > seed.area * 0.35 && r.area < seed.area * 2.8,
    );
    const nbrs = similar
      .map((r) => ({ r, v: [r.cx - seed.cx, r.cy - seed.cy] as Point }))
      .map((o) => ({ ...o, d: Math.hypot(o.v[0], o.v[1]) }))
      .filter((o) => o.d < size * 2.6)
      .sort((a, b) => a.d - b.d);
    if (!nbrs.length) continue;

    // Try the nearest few neighbours as the first lattice vector.
    for (const first of nbrs.slice(0, 3)) {
      const v1 = first.v;
      const d1 = first.d;
      // second vector: a neighbour of similar length, roughly perpendicular
      let v2: Point | null = null;
      let bestCos = 0.45;
      for (const o of nbrs) {
        if (o === first || o.d > d1 * 1.5 || o.d < d1 / 1.5) continue;
        const cos = Math.abs((o.v[0] * v1[0] + o.v[1] * v1[1]) / (o.d * d1));
        if (cos < bestCos) {
          bestCos = cos;
          v2 = o.v;
        }
      }
      if (!v2) v2 = [-v1[1], v1[0]];
      const det = v1[0] * v2[1] - v1[1] * v2[0];
      if (Math.abs(det) < 1e-6) continue;

      // Lattice coordinates of every similar region relative to the seed.
      const cells = new Map<string, { r: Region; err: number; a: number; b: number }>();
      cells.set('0,0', { r: seed, err: 0, a: 0, b: 0 });
      for (const r of similar) {
        const dx = r.cx - seed.cx;
        const dy = r.cy - seed.cy;
        const a = (dx * v2[1] - dy * v2[0]) / det;
        const b = (v1[0] * dy - v1[1] * dx) / det;
        const ra = Math.round(a);
        const rb = Math.round(b);
        if (Math.abs(ra) > 2 || Math.abs(rb) > 2) continue;
        const err = Math.hypot(a - ra, b - rb);
        if (err > 0.3) continue;
        const k = `${ra},${rb}`;
        const prev = cells.get(k);
        if (!prev || err < prev.err) cells.set(k, { r, err, a: ra, b: rb });
      }
      if (cells.size < 4) continue;

      // Best 3 × 3 window containing the seed.
      for (let oa = -2; oa <= 0; oa++) {
        for (let ob = -2; ob <= 0; ob++) {
          const pts: { g: Point; p: Point }[] = [];
          for (const c of cells.values()) {
            const ga = c.a - oa;
            const gb = c.b - ob;
            if (ga >= 0 && ga <= 2 && gb >= 0 && gb <= 2) pts.push({ g: [ga, gb], p: [c.r.cx, c.r.cy] });
          }
          if (pts.length < 4 || (best && pts.length < best.found)) continue;
          const fit = refine(pts, regions);
          if (fit && better(fit, best)) best = fit;
        }
      }
    }
  }
  return best;
}

/** Fit H from grid matches, then re-associate all regions with the predicted centers and refit. */
function refine(pts: { g: Point; p: Point }[], regions: Region[]): GridFit | null {
  let H = fitHomography(
    pts.map((x) => x.g),
    pts.map((x) => x.p),
  );
  if (!H) return null;
  // Must not be degenerate: all 4 outer corners distinct and convex.
  for (let iter = 0; iter < 2; iter++) {
    const pitch = Math.sqrt(polyArea(([[0, 0], [2, 0], [2, 2], [0, 2]] as Point[]).map((p) => applyH(H!, p)))) / 2;
    if (!Number.isFinite(pitch) || pitch < 3) return null;
    const matches: { g: Point; p: Point; e: number }[] = [];
    for (const g of GRID) {
      const q = applyH(H, g);
      let bestR: Region | null = null;
      let bestD = 0.35 * pitch;
      for (const r of regions) {
        const d = Math.hypot(r.cx - q[0], r.cy - q[1]);
        if (d < bestD) {
          bestD = d;
          bestR = r;
        }
      }
      if (bestR) matches.push({ g, p: [bestR.cx, bestR.cy], e: bestD / pitch });
    }
    if (matches.length < 4) return null;
    const H2 = fitHomography(
      matches.map((m) => m.g),
      matches.map((m) => m.p),
    );
    if (!H2) return null;
    H = H2;
    if (iter === 1) {
      const residual = matches.reduce((s, m) => s + m.e, 0) / matches.length;
      // all matched regions should have similar sizes
      return { H, found: matches.length, residual };
    }
  }
  return null;
}

/**
 * Relabel the grid so that columns run left → right and rows top → bottom in the image
 * (no mirror): the face reads as the camera sees it.
 */
function normaliseOrientation(H: Homography): Homography | null {
  // Candidate relabelings: 4 rotations × optional mirror, as affine maps on grid coords (center 1,1).
  let best: { H: Homography; score: number } | null = null;
  for (const mirror of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      // grid' (new) → grid (old)
      let M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (mirror) M = [0, 1, 0, 1, 0, 0, 0, 0, 1];
      for (let k = 0; k < rot; k++) M = mulH([0, -1, 2, 1, 0, 0, 0, 0, 1], M); // rotate 90° about (1,1)
      const Hn = mulH(H, M);
      const o = applyH(Hn, [1, 1]);
      const cx = applyH(Hn, [2, 1]);
      const cy = applyH(Hn, [1, 2]);
      const ux = [cx[0] - o[0], cx[1] - o[1]];
      const uy = [cy[0] - o[0], cy[1] - o[1]];
      const cross = ux[0] * uy[1] - ux[1] * uy[0];
      if (cross <= 0) continue; // mirrored (image y points down)
      const score = ux[0] / Math.hypot(ux[0], ux[1]); // column axis closest to +x
      if (!best || score > best.score) best = { H: Hn, score };
    }
  }
  return best?.H ?? null;
}

function mulH(A: number[], B: number[]): number[] {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
  return C;
}

function polyArea(p: Point[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function isConvex(p: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const c = p[(i + 2) % p.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) return false;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Robust colour of one sticker: a 5 × 5 lattice over its middle half, outliers (glare) dropped. */
function sampleSticker(
  data: Uint8ClampedArray | Uint8Array,
  W: number,
  H: number,
  Hm: Homography,
  col: number,
  row: number,
): { lab: Lab; rgb: RGB } {
  const samples: { lab: Lab; rgb: RGB }[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const [x, y] = applyH(Hm, [col - 0.22 + i * 0.11, row - 0.22 + j * 0.11]);
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const p = (yi * W + xi) * 4;
      const rgb: RGB = [data[p], data[p + 1], data[p + 2]];
      samples.push({ rgb, lab: rgbToLab(rgb) });
    }
  }
  if (!samples.length) return { lab: [0, 0, 0], rgb: [0, 0, 0] };
  const med = (k: number) => {
    const v = samples.map((s) => s.lab[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const m: Lab = [med(0), med(1), med(2)];
  const keep = samples.filter((s) => Math.hypot(s.lab[0] - m[0], s.lab[1] - m[1], s.lab[2] - m[2]) < 18);
  const use = keep.length >= 5 ? keep : samples;
  const avg = <T extends number[]>(get: (s: (typeof use)[0]) => T) =>
    [0, 1, 2].map((k) => use.reduce((s, x) => s + get(x)[k], 0) / use.length) as unknown as T;
  return { lab: avg((s) => s.lab), rgb: avg((s) => s.rgb).map(Math.round) as RGB };
}

function laplacianVariance(grey: Float32Array, W: number, H: number, corners: Point[]): number {
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x0 = Math.max(1, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 2, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(1, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 2, Math.ceil(Math.max(...ys)));
  let n = 0;
  let s = 0;
  let ss = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const l = grey[i - 1] + grey[i + 1] + grey[i - W] + grey[i + W] - 4 * grey[i];
      n++;
      s += l;
      ss += l * l;
    }
  }
  if (!n) return 0;
  const mean = s / n;
  return ss / n - mean * mean;
}
