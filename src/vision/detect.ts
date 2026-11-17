/**
 * Find a cube face in an RGBA frame and read its 9 colours.
 *
 *   1. faceSearch.ts finds the 3 × 3 placement: flat cells with an outline around them. It needs no
 *      gaps between stickers, so stickerless cubes work as well as stickered ones.
 *   2. the middle of each sticker is sampled, dropping glare / outlier pixels (the center sticker
 *      on a ring, to skip a logo)
 *   3. a strip of the neighbouring side is read when the cube is tilted enough to show one
 *
 * All plain TypeScript: runs in a Web Worker or in Node tests.
 */
import type { Color, EdgeSide } from '../core/cube';
import { type Lab, type RGB, classifySticker, deltaE, nameTogether, rgbToLab, robustColor } from './color';
import { FLAT_SPREAD, type FoundFace, findFace, isFace, isSolvedSide, refinePlacement } from './faceSearch';
import { type Placement, placementCorners } from './grid';
import { type Homography, type Point, applyH, fitHomography } from './homography';

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface StripReading {
  /** Edge of the face (as seen in the image) that the strip touches. */
  edge: EdgeSide;
  /** 3 stickers of the neighbouring side, aligned with the face's edge stickers listed clockwise. */
  stickers: { center: Point; lab: Lab; rgb: RGB; color: Color }[];
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
  /** True if this cell is one flat colour (false = spoiled by glare, a logo or a fingertip). */
  found: boolean;
}

export interface FaceReading {
  /** Outer corners of the face in image pixels: top-left, top-right, bottom-right, bottom-left. */
  corners: [Point, Point, Point, Point];
  /** Where the face sits: middle, sticker size, turn. */
  placement: Placement;
  /** Grid (col, row) → image homography; sticker centers are at integer coords 0..2. */
  homography: Homography;
  /** 9 stickers row by row as seen in the image. */
  stickers: StickerReading[];
  colors: Color[];
  /** True for a face that is all one colour (a solved side), found by its outline alone. */
  plain: boolean;
  /** How many of the 9 cells are one flat colour. */
  found: number;
  /** Fit cost of the placement: lower is a clearer face. */
  residual: number;
  /** Laplacian variance inside the face (higher = sharper). */
  sharpness: number;
  /** Strip of a neighbouring side, when the cube is tilted enough to show one. */
  strip?: StripReading;
}

export interface DetectOptions {
  /**
   * Where the face was in the previous frame. It is tried first, which is much quicker than
   * searching the whole frame while the cube is being held still.
   */
  previous?: Placement;
  /** With `previous`: search the whole frame if the face is no longer there (default true). */
  searchIfLost?: boolean;
  /**
   * A face that is all one colour is expected (the scanned faces show its side must be solved):
   * it is then accepted with part of its outline missing. See isPlainFace.
   */
  expectPlain?: boolean;
}

export interface DetectResult {
  face: FaceReading | null;
}

export function detectFace(img: RGBAImage, opts: DetectOptions = {}): DetectResult {
  const { width: W, height: H, data } = img;
  let found: FoundFace | null = null;
  if (opts.previous) {
    const again = refinePlacement(img, opts.previous, 6, 3, 1, opts.expectPlain);
    if (isFace(again.score) || isSolvedSide(img, again)) found = again;
  }
  if (!found && (!opts.previous || opts.searchIfLost !== false)) found = findFace(img, opts.expectPlain);
  if (!found) return { face: null };

  const corners = placementCorners(found) as [Point, Point, Point, Point];
  const Hm = fitHomography(
    [
      [-0.5, -0.5],
      [2.5, -0.5],
      [2.5, 2.5],
      [-0.5, 2.5],
    ],
    corners,
  );
  if (!Hm) return { face: null };

  const stickers: StickerReading[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const { lab, rgb } = sampleSticker(data, W, H, Hm, col, row);
      const cls = classifySticker(lab, undefined, rgb);
      stickers.push({ center: applyH(Hm, [col, row]), lab, rgb, color: cls.color, margin: cls.margin, found: found.score.spread[row * 3 + col] <= FLAT_SPREAD });
    }
  }
  // red against orange is settled within the face, not sticker by sticker
  nameTogether(stickers.map((st) => st.rgb)).forEach((c, i) => (stickers[i].color = c));
  const { cx, cy, pitch, rot } = found;
  return {
    face: {
      corners,
      placement: { cx, cy, pitch, rot },
      plain: found.plain,
      homography: Hm,
      stickers,
      colors: stickers.map((s) => s.color),
      found: stickers.filter((s) => s.found).length,
      residual: found.cost,
      sharpness: laplacianVariance(data, W, H, corners),
      strip: sampleStrip(data, W, H, Hm, pitch),
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Look just beyond each edge of the face for the visible strip of the neighbouring side (shown
 * when the cube is tilted). For each of the 3 sticker positions along an edge, march outward
 * along a few parallel lines: a strip shows as a short run of sticker colour between dark cube
 * body pixels. Background is rejected because its run does not end close to the edge.
 * Distances are in the face's grid units (one sticker pitch), extrapolated past the edge.
 */
function sampleStrip(
  data: Uint8ClampedArray | Uint8Array,
  W: number,
  H: number,
  Hm: Homography,
  pitch: number,
): StripReading | undefined {
  const STEP = 0.02;
  const MAX_O = 1.0;
  const pixelPerUnit = pitch;
  const edges: { edge: EdgeSide; at: (slot: number, o: number) => Point }[] = [
    { edge: 'top', at: (t, o) => [t, -0.5 - o] },
    { edge: 'right', at: (t, o) => [2.5 + o, t] },
    { edge: 'bottom', at: (t, o) => [2 - t, 2.5 + o] },
    { edge: 'left', at: (t, o) => [-0.5 - o, 2 - t] },
  ];
  const sample = (g: Point): RGB | null => {
    const [x, y] = applyH(Hm, g);
    if (x < 0 || y < 0 || x > W - 2 || y > H - 2) return null;
    return bilinear(data, W, x, y);
  };
  const isDark = (rgb: RGB) => {
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    return max < 70 && max - min < 35;
  };

  let best: { edge: EdgeSide; stickers: StripReading['stickers']; score: number } | undefined;
  for (const e of edges) {
    const stickers: StripReading['stickers'] = [];
    const slotLens: number[] = [];
    let lengthSum = 0;
    for (let slot = 0; slot < 3; slot++) {
      const runs: { len: number; colors: RGB[]; mid: Point }[] = [];
      for (const dt of [-0.15, 0, 0.15]) {
        const t = slot + dt;
        // March from just inside the face's own edge sticker, across the dark seam, then
        // along the neighbour's first row until dark again or a clear colour change.
        const O0 = -0.12;
        const n = Math.round((MAX_O - O0) / STEP);
        const line: RGB[] = [];
        const labs: Lab[] = [];
        let start = -1;
        let end = -1;
        let sawDark = false;
        for (let k = 0; k <= n; k++) {
          const rgb = sample(e.at(t, O0 + k * STEP));
          if (!rgb) break;
          line.push(rgb);
          labs.push(rgbToLab(rgb));
          const dark = isDark(rgb);
          if (start < 0) {
            if (dark) sawDark = true;
            else if (sawDark) start = k;
            else if (O0 + k * STEP > 0.15) break; // no seam near the edge: not a cube edge
          } else if (dark) {
            end = k;
            break;
          } else if (k - start >= 2) {
            // colour change against the run so far (rows can touch with no visible gap)
            const ref = labs[start + Math.floor((k - start) / 2)];
            if (deltaE(labs[k], ref) > 22 && deltaE(labs[Math.min(k, labs.length - 1)], labs[k - 1]) > 10) {
              end = k;
              break;
            }
          }
        }
        if (start < 0 || end < 0 || O0 + start * STEP > 0.3) continue;
        const len = (end - start) * STEP;
        if (len * pixelPerUnit < 2) continue; // under 2 px: too thin to read
        const inner = line.slice(start + Math.floor((end - start) * 0.25), end - Math.floor((end - start) * 0.25));
        if (!inner.length) continue;
        const mid = O0 + ((start + end) / 2) * STEP;
        runs.push({ len, colors: inner, mid: applyH(Hm, e.at(t, mid)) });
      }
      if (runs.length < 2) break;
      const colors = runs.flatMap((r) => r.colors);
      const rgb = [0, 1, 2].map((c) => median(colors.map((x) => x[c]))) as RGB;
      const lab = rgbToLab(rgb);
      const slotLen = runs.reduce((a, r) => a + r.len, 0) / runs.length;
      slotLens.push(slotLen);
      lengthSum += slotLen;
      stickers.push({ center: runs[Math.floor(runs.length / 2)].mid, rgb: rgb.map(Math.round) as RGB, lab, color: classifySticker(lab, undefined, rgb).color });
    }
    if (stickers.length !== 3) continue;
    if (Math.max(...slotLens) > 2 * Math.min(...slotLens)) continue; // a real strip is an even band
    if (!best || lengthSum > best.score) best = { edge: e.edge, stickers, score: lengthSum };
  }
  return best && { edge: best.edge, stickers: best.stickers };
}

function bilinear(data: Uint8ClampedArray | Uint8Array, W: number, x: number, y: number): RGB {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const out: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p = (y0 * W + x0) * 4 + c;
    const top = data[p] * (1 - fx) + data[p + 4] * fx;
    const bot = data[p + W * 4] * (1 - fx) + data[p + W * 4 + 4] * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
  return out;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Robust colour of one sticker: a 5 × 5 lattice over its middle half, outliers (glare) dropped.
 * The center sticker often carries a brand logo in its middle, so it is read from a ring near its
 * border instead.
 */
function sampleSticker(
  data: Uint8ClampedArray | Uint8Array,
  W: number,
  H: number,
  Hm: Homography,
  col: number,
  row: number,
): { lab: Lab; rgb: RGB } {
  const ring = col === 1 && row === 1;
  const n = ring ? 7 : 5;
  const step = 0.11;
  const half = ((n - 1) / 2) * step;
  const samples: RGB[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const du = i * step - half;
      const dv = j * step - half;
      if (ring && Math.max(Math.abs(du), Math.abs(dv)) < half - 1e-9) continue;
      const [x, y] = applyH(Hm, [col + du, row + dv]);
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const p = (yi * W + xi) * 4;
      samples.push([data[p], data[p + 1], data[p + 2]]);
    }
  }
  const { lab, rgb } = robustColor(samples);
  return { lab, rgb };
}

function laplacianVariance(data: Uint8ClampedArray | Uint8Array, W: number, H: number, corners: Point[]): number {
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x0 = Math.max(1, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 2, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(1, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 2, Math.ceil(Math.max(...ys)));
  const grey = (i: number) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let n = 0;
  let s = 0;
  let ss = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const l = grey(i - 1) + grey(i + 1) + grey(i - W) + grey(i + W) - 4 * grey(i);
      n++;
      s += l;
      ss += l * l;
    }
  }
  if (!n) return 0;
  const mean = s / n;
  return ss / n - mean * mean;
}
