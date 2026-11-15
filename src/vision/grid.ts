/**
 * A 3 × 3 face placed in an image by position, size and turn, and how well such a placement
 * matches a cube face. Two signals, neither of which needs gaps between stickers:
 *
 *   flat cells   each of the 9 cells lies within one sticker, so the pixels under it are one colour
 *   outline      just outside the face is something else (background, hand, the next side)
 */
import type { RGBAImage } from './detect';

export interface Placement {
  /** Middle of the face in image pixels. */
  cx: number;
  cy: number;
  /** Size of one sticker in pixels. */
  pitch: number;
  /** Turn of the face in radians; rows run along this direction. */
  rot: number;
}

export interface PlacementScore {
  /** Colour spread of each cell (row by row); small = flat. */
  spread: number[];
  /** Mean colour of each cell. */
  mean: [number, number, number][];
  /** For each of the 12 outer cell edges (top 3, right 3, bottom 3, left 3): colour step across the outline. */
  outline: number[];
  /** False if part of the face is outside the image. */
  inside: boolean;
}

/** Half-width of the part of a cell that is looked at, in pitches. */
export const CELL_HALF = 0.26;
/** The center cell is measured on a square ring this far from its middle, over this much of each side. */
const RING = 0.33;
const RING_SPAN = 0.2;
/** How far outside the face the outline probes sit, in pitches from the face edge. */
export const OUTLINE_REACH = 0.3;

/** Image position of a point of the face given in pitches from its middle. */
export function placePoint(p: Placement, u: number, v: number): [number, number] {
  const c = Math.cos(p.rot) * p.pitch;
  const s = Math.sin(p.rot) * p.pitch;
  return [p.cx + u * c - v * s, p.cy + u * s + v * c];
}

/** Outer corners: top-left, top-right, bottom-right, bottom-left. */
export function placementCorners(p: Placement): [number, number][] {
  return [placePoint(p, -1.5, -1.5), placePoint(p, 1.5, -1.5), placePoint(p, 1.5, 1.5), placePoint(p, -1.5, 1.5)];
}

// The 12 outer cell edges: [cell column, cell row, outward direction].
const OUTLINE: [number, number, number, number][] = [
  [-1, -1, 0, -1], [0, -1, 0, -1], [1, -1, 0, -1],
  [1, -1, 1, 0], [1, 0, 1, 0], [1, 1, 1, 0],
  [1, 1, 0, 1], [0, 1, 0, 1], [-1, 1, 0, 1],
  [-1, 1, -1, 0], [-1, 0, -1, 0], [-1, -1, -1, 0],
];

/** Measure a placement by sampling the image directly. */
export function scorePlacement(img: RGBAImage, p: Placement, lattice = 5): PlacementScore {
  const { width: W, height: H, data } = img;
  const c = Math.cos(p.rot) * p.pitch;
  const s = Math.sin(p.rot) * p.pitch;
  const spread: number[] = [];
  const mean: [number, number, number][] = [];
  let inside = true;
  const step = (2 * CELL_HALF) / (lattice - 1);
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      // The center sticker often carries a logo in its middle: look at a ring around it instead.
      const ring = row === 0 && col === 0;
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let ss = 0;
      for (let i = 0; i < lattice; i++) {
        for (let j = 0; j < lattice; j++) {
          let u = col - CELL_HALF + i * step;
          let v = row - CELL_HALF + j * step;
          if (ring) {
            // push the lattice out onto the four sides of a square ring, corners left out
            const side = (i + j) % 4;
            const along = (i / (lattice - 1) - 0.5) * 2 * RING_SPAN;
            u = side === 0 ? -RING : side === 1 ? RING : along;
            v = side === 2 ? -RING : side === 3 ? RING : along;
          }
          const x = Math.round(p.cx + u * c - v * s);
          const y = Math.round(p.cy + u * s + v * c);
          if (x < 0 || y < 0 || x >= W || y >= H) {
            inside = false;
            continue;
          }
          const q = (y * W + x) * 4;
          const r = data[q];
          const g = data[q + 1];
          const b = data[q + 2];
          n++;
          sr += r;
          sg += g;
          sb += b;
          ss += r * r + g * g + b * b;
        }
      }
      if (!n) {
        spread.push(255);
        mean.push([0, 0, 0]);
        continue;
      }
      spread.push(Math.sqrt(Math.max(0, (ss - (sr * sr + sg * sg + sb * sb) / n) / n)));
      mean.push([sr / n, sg / n, sb / n]);
    }
  }
  // Outline: a small patch just outside each outer cell edge against that cell's colour.
  const outline: number[] = [];
  for (const [col, row, ox, oy] of OUTLINE) {
    const m = mean[(row + 1) * 3 + col + 1];
    let n = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let k = -1; k <= 1; k++) {
      // along the edge: -0.2, 0, 0.2 pitches from the cell's middle
      const u = col + ox * (0.5 + OUTLINE_REACH) + oy * k * 0.2;
      const v = row + oy * (0.5 + OUTLINE_REACH) + ox * k * 0.2;
      const x = Math.round(p.cx + u * c - v * s);
      const y = Math.round(p.cy + u * s + v * c);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const q = (y * W + x) * 4;
      n++;
      sr += data[q];
      sg += data[q + 1];
      sb += data[q + 2];
    }
    // Off the picture: nothing to compare with, count it as a step.
    outline.push(n ? Math.hypot(sr / n - m[0], sg / n - m[1], sb / n - m[2]) : 255);
  }
  return { spread, mean, outline, inside };
}

/** How far to either side of a border between two cells the seam is looked for, in pitches. */
const SEAM_REACH = 0.2;
/** How far from the border the two cells' own colours are taken, in pitches. */
const SEAM_FLAT = 0.36;

/**
 * How clearly each of the 12 borders between neighbouring cells shows a seam: the gap between two
 * pieces, seen as a dark groove or as the bright rounded edge of a piece. Each value is the
 * largest colour difference between the pixels near the border and the two cells beside it. The
 * cells' colours are joined by a straight line, so a face that gets darker towards one side shows
 * no seam.
 *
 * Nine pieces of one colour have seams between them. One piece does not, and neither does a
 * sheet of paper. The pixels are averaged along the border first, which keeps the seam and
 * cancels the noise.
 */
export function seamSteps(img: RGBAImage, p: Placement): number[] {
  return stepsAcross(img, p, [-0.5, 0.5]);
}

/**
 * The same measurement as seamSteps taken where no seam can be: across the middle of each cell,
 * 18 values. It shows how much the picture's noise, or glare on a sticker, bends the colour
 * without any seam, which is what a seam has to stand out from.
 */
export function cellSteps(img: RGBAImage, p: Placement): number[] {
  return stepsAcross(img, p, [-1, 0, 1]);
}

/**
 * For lines across the face at each of `centres` (in pitches from its middle), in both directions
 * and in each of the three rows or columns: how far the colour near the line strays from a
 * straight blend of the colours on either side of it.
 */
function stepsAcross(img: RGBAImage, p: Placement, centres: number[]): number[] {
  const { width: W, height: H, data } = img;
  const c = Math.cos(p.rot) * p.pitch;
  const s = Math.sin(p.rot) * p.pitch;
  // samples across the line (about one per pixel) and lines along it
  const n = Math.max(3, Math.round(SEAM_FLAT * p.pitch));
  const near = Math.max(1, Math.round((SEAM_REACH / SEAM_FLAT) * n));
  const ends = Math.max(1, Math.round(n / 4));
  const lines = Math.max(3, Math.min(9, Math.round(0.56 * p.pitch)));
  const size = 2 * n + 1;
  const profile = new Float64Array(size * 3);
  const out: number[] = [];
  for (const upright of [true, false]) {
    for (const along of [-1, 0, 1]) {
      for (const across of centres) {
        profile.fill(0);
        let got = 0;
        for (let j = 0; j < lines; j++) {
          const a = along + (j / (lines - 1) - 0.5) * 0.56;
          const at: number[] = [];
          for (let i = -n; i <= n; i++) {
            const t = across + (i / n) * SEAM_FLAT;
            const u = upright ? t : a;
            const v = upright ? a : t;
            const x = Math.round(p.cx + u * c - v * s);
            const y = Math.round(p.cy + u * s + v * c);
            if (x < 0 || y < 0 || x >= W || y >= H) break;
            at.push((y * W + x) * 4);
          }
          if (at.length < size) continue;
          got++;
          for (let i = 0; i < size; i++) {
            profile[i * 3] += data[at[i]];
            profile[i * 3 + 1] += data[at[i] + 1];
            profile[i * 3 + 2] += data[at[i] + 2];
          }
        }
        if (!got) {
          out.push(0);
          continue;
        }
        // the colours on either side: the outer few samples at each end
        const from = [0, 0, 0];
        const to = [0, 0, 0];
        for (let i = 0; i < ends; i++) {
          for (let ch = 0; ch < 3; ch++) {
            from[ch] += profile[i * 3 + ch] / ends;
            to[ch] += profile[(size - 1 - i) * 3 + ch] / ends;
          }
        }
        const first = (ends - 1) / 2;
        const span = size - 1 - 2 * first;
        let step = 0;
        for (let i = n - near; i <= n + near; i++) {
          const f = (i - first) / span;
          let d = 0;
          for (let ch = 0; ch < 3; ch++) d += ((profile[i * 3 + ch] - (from[ch] * (1 - f) + to[ch] * f)) / got) ** 2;
          step = Math.max(step, Math.sqrt(d));
        }
        out.push(step);
      }
    }
  }
  return out;
}
