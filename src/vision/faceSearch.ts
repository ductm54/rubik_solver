/**
 * Find a cube face anywhere in a frame, without relying on gaps between stickers.
 *
 * A face is a 3 × 3 placement (position, size, turn) where every cell is one flat colour and the
 * outline contrasts with what lies outside it (see grid.ts). The search:
 *
 *   1. shrink the frame to ~180 px and build integral images, so the colour spread and mean of
 *      any small window are a few lookups
 *   2. try every position, size and turn; keep the placements whose cells are flat, show at
 *      least two colours and have an outline on all four sides
 *   3. fine-tune the best few by sampling the pixels directly, first small, then at full size
 *
 * A face that is all one colour (a solved side) is looked for only when no other face is found.
 * It needs a stronger outline, and seams between its nine cells in the full-size frame: without
 * those it is one sticker of a scrambled face, or a sheet of paper.
 */
import type { RGBAImage } from './detect';
import { CELL_HALF, OUTLINE_REACH, type Placement, type PlacementScore, cellSteps, scorePlacement, seamSteps } from './grid';

/** A cell whose colour spread is above this is not one sticker. */
export const FLAT_SPREAD = 24;
/** Colour step across the outline that counts as "something else is out there". */
export const OUTLINE_STEP = 45;
const SPREAD_CAP = 60;
const SMALL = 160;
const COARSE_HALF = 0.19;
const EDGE_STEP = 36;
const MIN_OUTLINE = 10.6;
/** A one-colour face has only its outline to go by, so it must be there nearly all the way round. */
const MIN_PLAIN_OUTLINE = 11.2;
/** Cells closer in colour than this are one colour. */
const SAME_COLOUR = 60;
/** A one-colour face shows a seam at least this clear on half of the borders between its cells... */
const MIN_SEAM = 6;
/** ...and this many times clearer than the same measurement across the middle of its cells. */
const SEAM_OVER_CELL = 1.5;

export interface FoundFace extends Placement {
  score: PlacementScore;
  /**
   * True for a placement that is all one colour with an outline around it. That is a solved side
   * only if it also has seams (see isSolvedSide).
   */
  plain: boolean;
  /** Lower is better. */
  cost: number;
}

/**
 * One number for a measured placement: flat cells are good, outline steps are good. The worst
 * cell is forgiven (it counts as just-not-flat at most): a logo, glare or a fingertip on one
 * sticker must not hide the face.
 */
export function placementCost(s: PlacementScore): number {
  let cost = 0;
  let worst = 0;
  for (const x of s.spread) {
    cost += Math.min(SPREAD_CAP, x);
    worst = Math.max(worst, x);
  }
  cost -= Math.min(SPREAD_CAP, worst) - Math.min(FLAT_SPREAD, worst);
  for (const x of s.outline) cost -= (4 * Math.min(2 * OUTLINE_STEP, x)) / OUTLINE_STEP;
  return cost;
}

/** How much of the outline is there, out of 12 (one per outer cell edge). */
export function outlineStrength(s: PlacementScore): number {
  let sum = 0;
  for (const x of s.outline) sum += Math.min(2 * OUTLINE_STEP, x) / (2 * OUTLINE_STEP);
  return sum;
}

/**
 * Whether a measured placement looks like a cube face at all. Measured on real photos: faces have
 * an outline strength of 11.5 or more and all cells equally flat; look-alikes (clutter, part of a
 * cube, a hand) reach 10.1 at most.
 */
export function isFace(s: PlacementScore): boolean {
  if (!s.inside) return false;
  // Cells are flat compared with the picture's own noise; one may be spoiled (a logo, glare, a
  // fingertip).
  const sorted = [...s.spread].sort((a, b) => a - b);
  const limit = Math.max(FLAT_SPREAD, sorted[4] + 10);
  if (sorted[7] > limit) return false;
  // stickers are bright or vivid; three dark cells means this is not a face
  if (s.mean.filter((m) => Math.max(m[0], m[1], m[2]) < 45).length > 2) return false;
  // an outline on every side, and nearly all the way round
  const steps = s.outline.map((x) => x > OUTLINE_STEP);
  for (let side = 0; side < 4; side++) if (!steps[side * 3] && !steps[side * 3 + 1] && !steps[side * 3 + 2]) return false;
  if (outlineStrength(s) < MIN_OUTLINE) return false;
  // at least two colours (a one-colour face goes through isPlainFace)
  return colourRange(s) > SAME_COLOUR;
}

/** Largest colour difference between any two cells. */
function colourRange(s: PlacementScore): number {
  let far = 0;
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) far = Math.max(far, Math.hypot(s.mean[i][0] - s.mean[j][0], s.mean[i][1] - s.mean[j][1], s.mean[i][2] - s.mean[j][2]));
  }
  return far;
}

/**
 * Whether a measured placement looks like a face that is all one colour (a solved side). Its
 * cells say nothing, since any plain surface is nine flat cells, so this rests on the outline: a
 * clear step on all 12 outer cell edges, bar one. A wall or a table top has no such outline. A
 * single sticker of a scrambled face, a sheet of paper and a floor tile do, so this is only half
 * of the test: see isSolvedSide.
 */
export function isPlainFace(s: PlacementScore): boolean {
  if (!s.inside) return false;
  const sorted = [...s.spread].sort((a, b) => a - b);
  if (sorted[7] > Math.max(FLAT_SPREAD, sorted[4] + 10)) return false;
  // a sticker colour: bright or vivid, never dark
  if (s.mean.some((m) => Math.max(m[0], m[1], m[2]) < 90)) return false;
  if (colourRange(s) > SAME_COLOUR) return false;
  if (s.outline.filter((x) => x > OUTLINE_STEP).length < 11) return false;
  return outlineStrength(s) >= MIN_PLAIN_OUTLINE;
}

/**
 * Whether the picture shows seams between the nine cells of a placement: on at least half of the
 * 12 borders between neighbouring cells, and clearer there than across the middle of the cells,
 * where glare and noise bend the colour too.
 *
 * Measured on the real photos and videos, at face widths from 30 to 200 px, taking the middle
 * value of the 12 borders: a solved white side scores 7 to 39, which is 2.3 to 13 times its
 * cells' level (1.3 times at the smallest size); borders between two stickers of one colour
 * usually score 15 to 60, for every colour. Of 1,800 single stickers that pass isPlainFace, those
 * of the stickerless cube score 4.7 at most, and those of the overexposed stickered cube up to 9
 * but never more than their cells' level.
 */
export function hasSeams(img: RGBAImage, p: Placement): boolean {
  const seam = middle(seamSteps(img, p));
  return seam >= MIN_SEAM && seam >= SEAM_OVER_CELL * (middle(cellSteps(img, p)) + 1);
}

function middle(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}

/**
 * Whether a placement found in `img` is a solved side: all one colour with an outline, and made
 * of nine pieces. The seams are what tell it from one sticker of a scrambled face, which is also
 * a flat square with other colours all round it. Seams are too thin to see in the shrunk frame,
 * so this is for placements settled in the full frame.
 */
export function isSolvedSide(img: RGBAImage, f: FoundFace): boolean {
  return f.plain && hasSeams(img, f);
}

interface Small {
  w: number;
  h: number;
  /** Integral images of r, g, b and r² + g² + b², each (w + 1) × (h + 1). */
  ir: Float64Array;
  ig: Float64Array;
  ib: Float64Array;
  iq: Float64Array;
  /** Integral image of edge pixels (a clear colour step to the neighbours). */
  ie: Int32Array;
  image: RGBAImage;
  /** Small pixels per frame pixel. */
  k: number;
}

function shrinkFrame(img: RGBAImage): Small {
  const k = Math.min(1, SMALL / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          r += img.data[p];
          g += img.data[p + 1];
          b += img.data[p + 2];
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      const q = (y * w + x) * 4;
      data[q] = r / n;
      data[q + 1] = g / n;
      data[q + 2] = b / n;
      data[q + 3] = 255;
    }
  }
  const W1 = w + 1;
  const ir = new Float64Array(W1 * (h + 1));
  const ig = new Float64Array(W1 * (h + 1));
  const ib = new Float64Array(W1 * (h + 1));
  const iq = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rr = 0;
    let rg = 0;
    let rb = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      const r = data[q];
      const g = data[q + 1];
      const b = data[q + 2];
      rr += r;
      rg += g;
      rb += b;
      rq += r * r + g * g + b * b;
      const i = (y + 1) * W1 + x + 1;
      ir[i] = ir[i - W1] + rr;
      ig[i] = ig[i - W1] + rg;
      ib[i] = ib[i - W1] + rb;
      iq[i] = iq[i - W1] + rq;
    }
  }
  // edge pixels: central differences over all three channels
  const ie = new Int32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const q = (y * w + x) * 4;
        const row = w * 4;
        const gx = Math.abs(data[q + 4] - data[q - 4]) + Math.abs(data[q + 5] - data[q - 3]) + Math.abs(data[q + 6] - data[q - 2]);
        const gy = Math.abs(data[q + row] - data[q - row]) + Math.abs(data[q + row + 1] - data[q - row + 1]) + Math.abs(data[q + row + 2] - data[q - row + 2]);
        if (gx > EDGE_STEP || gy > EDGE_STEP) run++;
      }
      const i = (y + 1) * W1 + x + 1;
      ie[i] = ie[i - W1] + run;
    }
  }
  return { w, h, ir, ig, ib, iq, ie, image: { width: w, height: h, data }, k: w / img.width };
}

const TURNS: number[] = [];
for (let d = -45; d < 45; d += 9) TURNS.push((d * Math.PI) / 180);

// Outline probes: the cell each belongs to, and its offset from the face's middle in pitches.
const PROBE_CELL: number[] = [];
const PROBE_U: number[] = [];
const PROBE_V: number[] = [];
{
  const reach = 1 + 0.5 + OUTLINE_REACH + CELL_HALF / 2;
  const add = (cell: number, u: number, v: number) => {
    PROBE_CELL.push(cell);
    PROBE_U.push(u);
    PROBE_V.push(v);
  };
  for (const c of [-1, 0, 1]) add(c + 1, c, -reach); // top
  for (const r of [-1, 0, 1]) add((r + 1) * 3 + 2, reach, r); // right
  for (const c of [1, 0, -1]) add(6 + c + 1, c, reach); // bottom
  for (const r of [1, 0, -1]) add((r + 1) * 3, -reach, r); // left
}

interface Candidate extends Placement {
  cost: number;
}

/**
 * Step 2: every position, size and turn on the small frame. Returns the best few placements with
 * two or more colours, and the best few that are all one colour, each best first.
 */
function coarseSearch(s: Small, keep: number): { mixed: Candidate[]; plain: Candidate[] } {
  const { w, h, ir, ig, ib, iq, ie } = s;
  const W1 = w + 1;
  const N = w * h;
  /** Edge pixels in the square of half-width `r` around (x, y), clipped to the frame. */
  const edgesIn = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(w, x + r + 1);
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    return ie[y1 * W1 + x1] - ie[y0 * W1 + x1] - ie[y1 * W1 + x0] + ie[y0 * W1 + x0];
  };
  const spread = new Float32Array(N);
  const flat = new Uint8Array(N);
  const mr = new Float32Array(N);
  const mg = new Float32Array(N);
  const mb = new Float32Array(N);
  const best: Candidate[] = [];
  let worst = Infinity;
  const plain: Candidate[] = [];
  const minDim = Math.min(w, h);
  // per turn: pixel offsets of the 9 cells, and x / y offsets of the 12 outline probes
  const cellOff = new Int32Array(9);
  const probeX = new Int32Array(12);
  const probeY = new Int32Array(12);

  for (let pitch = Math.max(6, minDim * 0.06); pitch * 3 <= minDim * 0.98; pitch *= 1.12) {
    // Colour spread and mean of the window around every pixel, for this sticker size (a smaller
    // window than the fine stage uses: the coarse grid of positions is never spot on).
    const rad = Math.max(1, Math.round(COARSE_HALF * pitch));
    const side = 2 * rad + 1;
    const n = side * side;
    spread.fill(255);
    flat.fill(0);
    for (let y = rad; y < h - rad; y++) {
      for (let x = rad; x < w - rad; x++) {
        const a = (y - rad) * W1 + x - rad;
        const b = a + side;
        const c = a + side * W1;
        const d = c + side;
        const sr = ir[d] - ir[b] - ir[c] + ir[a];
        const sg = ig[d] - ig[b] - ig[c] + ig[a];
        const sb = ib[d] - ib[b] - ib[c] + ib[a];
        const sq = iq[d] - iq[b] - iq[c] + iq[a];
        const i = y * w + x;
        const sp = Math.sqrt(Math.max(0, (sq - (sr * sr + sg * sg + sb * sb) / n) / n));
        spread[i] = sp;
        flat[i] = sp <= FLAT_SPREAD ? 1 : 0;
        mr[i] = sr / n;
        mg[i] = sg / n;
        mb[i] = sb / n;
      }
    }
    const step = Math.max(1, Math.round(pitch / 4.5));
    const box = Math.floor(1.3 * pitch);
    const inBox = Math.floor(1.2 * pitch);
    const outBox = Math.ceil(2.2 * pitch);
    // all 9 cell windows must be inside the frame at any turn
    const margin = Math.ceil(Math.SQRT2 * pitch) + rad + 1;
    for (const rot of TURNS) {
      const c = Math.cos(rot) * pitch;
      const sn = Math.sin(rot) * pitch;
      for (let row = -1, k = 0; row <= 1; row++) {
        for (let col = -1; col <= 1; col++, k++) cellOff[k] = Math.round(col * sn + row * c) * w + Math.round(col * c - row * sn);
      }
      for (let q = 0; q < 12; q++) {
        probeX[q] = Math.round(PROBE_U[q] * c - PROBE_V[q] * sn);
        probeY[q] = Math.round(PROBE_U[q] * sn + PROBE_V[q] * c);
      }
      for (let cy = margin; cy < h - margin; cy += step) {
        for (let cx = margin; cx < w - margin; cx += step) {
          const base = cy * w + cx;
          // the 8 outer cells: at most one may be spoiled (the center may carry a logo)
          let bad = 0;
          for (let k = 0; k < 9; k++) {
            if (k !== 4 && !flat[base + cellOff[k]] && ++bad > 1) break;
          }
          if (bad > 1) continue;
          // at least two colours, and not mostly dark
          const i0 = base + cellOff[0];
          let far = 0;
          let dark = 0;
          let cost = 0;
          for (let k = 0; k < 9; k++) {
            const i = base + cellOff[k];
            const d = Math.abs(mr[i] - mr[i0]) + Math.abs(mg[i] - mg[i0]) + Math.abs(mb[i] - mb[i0]);
            if (d > far) far = d;
            if (mr[i] < 45 && mg[i] < 45 && mb[i] < 45) dark++;
            const sp = spread[i];
            cost += k === 4 ? Math.min(sp, FLAT_SPREAD) : sp < SPREAD_CAP ? sp : SPREAD_CAP;
          }
          if (dark > 2) continue;
          const onePlain = far <= SAME_COLOUR;
          // A face has an outline around it, and a colour change inside it unless it is all one
          // colour; smooth areas (skin, a shaded wall) have neither.
          const inner = edgesIn(cx, cy, inBox);
          const ringEdges = edgesIn(cx, cy, outBox) - inner;
          if (onePlain ? ringEdges < 6 * pitch || dark > 0 : inner < pitch || ringEdges < 4 * pitch) continue;
          // outline on every side
          let steps = 0;
          let ok = true;
          for (let sideNo = 0; sideNo < 4 && ok; sideNo++) {
            let sideSteps = 0;
            for (let q = sideNo * 3; q < sideNo * 3 + 3; q++) {
              const x = cx + probeX[q];
              const y = cy + probeY[q];
              let d = 255;
              if (x >= rad && y >= rad && x < w - rad && y < h - rad) {
                const i = y * w + x;
                const j = base + cellOff[PROBE_CELL[q]];
                d = Math.sqrt((mr[i] - mr[j]) ** 2 + (mg[i] - mg[j]) ** 2 + (mb[i] - mb[j]) ** 2);
              }
              if (d > OUTLINE_STEP) sideSteps++;
              cost -= (4 * (d < 2 * OUTLINE_STEP ? d : 2 * OUTLINE_STEP)) / OUTLINE_STEP;
            }
            if (!sideSteps) ok = false;
            steps += sideSteps;
          }
          if (!ok) continue;
          if (onePlain) {
            // all one colour: the outline has to carry it
            if (steps < 10) continue;
            const same = plain.findIndex((b) => Math.abs(b.cx - cx) < pitch && Math.abs(b.cy - cy) < pitch);
            if (same >= 0) {
              if (plain[same].cost <= cost) continue;
              plain.splice(same, 1);
            }
            plain.push({ cx, cy, pitch, rot, cost });
            plain.sort((a, b) => a.cost - b.cost);
            if (plain.length > 2) plain.length = 2;
            continue;
          }
          if (steps < 7 || cost >= worst) continue;
          // keep the list short and varied: one entry per spot and size
          const same = best.findIndex((b) => Math.abs(b.cx - cx) < pitch && Math.abs(b.cy - cy) < pitch && b.pitch / pitch < 1.4 && pitch / b.pitch < 1.4);
          if (same >= 0) {
            if (best[same].cost <= cost) continue;
            best.splice(same, 1);
          }
          best.push({ cx, cy, pitch, rot, cost });
          best.sort((a, b) => a.cost - b.cost);
          if (best.length > keep) best.length = keep;
          worst = best.length === keep ? best[keep - 1].cost : Infinity;
        }
      }
    }
  }
  return { mixed: best, plain };
}

/** Step 3: nudge position, size and turn while the measured cost keeps dropping. */
export function refinePlacement(img: RGBAImage, start: Placement, lattice: number, rounds = 3, reach = 1): FoundFace {
  let best: Placement = start;
  let score = scorePlacement(img, best, lattice);
  let cost = placementCost(score);
  let step = { d: 0.1 * reach, size: 0.05 * reach, rot: (4 * reach * Math.PI) / 180 };
  for (let round = 0; round < rounds; round++) {
    let moved = true;
    for (let pass = 0; pass < 4 && moved; pass++) {
      moved = false;
      const from = best;
      for (const [dx, dy, ds, dr] of MOVES) {
        const p: Placement = {
          cx: from.cx + dx * step.d * from.pitch,
          cy: from.cy + dy * step.d * from.pitch,
          pitch: from.pitch * (1 + ds * step.size),
          rot: from.rot + dr * step.rot,
        };
        const sc = scorePlacement(img, p, lattice);
        const c = placementCost(sc);
        if (c < cost - 1e-9) {
          cost = c;
          score = sc;
          best = p;
          moved = true;
        }
      }
    }
    step = { d: step.d / 2, size: step.size / 2, rot: step.rot / 2 };
  }
  return { ...best, score, cost, plain: !isFace(score) && isPlainFace(score) };
}

const MOVES: [number, number, number, number][] = [];
for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const ds of [-1, 0, 1]) for (const dr of [-1, 0, 1]) if (dx || dy || ds || dr) MOVES.push([dx, dy, ds, dr]);

/** The best cube face in the frame, or null. */
export function findFace(img: RGBAImage): FoundFace | null {
  const small = shrinkFrame(img);
  const found = coarseSearch(small, 4);
  /** Carry a placement from the small frame back to the full frame and settle it there. */
  const settle = (f: FoundFace): FoundFace =>
    small.k === 1 ? f : refinePlacement(img, { cx: (f.cx + 0.5) / small.k - 0.5, cy: (f.cy + 0.5) / small.k - 0.5, pitch: f.pitch / small.k, rot: f.rot }, 6, 2, 0.5);
  let best: FoundFace | null = null;
  for (const c of found.mixed) {
    const fine = refinePlacement(small.image, c, 5);
    if (!isFace(fine.score)) continue;
    if (!best || fine.cost < best.cost) best = fine;
  }
  if (best) {
    const full = settle(best);
    return isFace(full.score) || isSolvedSide(img, full) ? full : null;
  }
  // Only when no face with several colours is in view: one that is all one colour.
  const plain = found.plain.map((c) => refinePlacement(small.image, c, 5)).filter((f) => f.plain);
  for (const fine of plain.sort((a, b) => a.cost - b.cost)) {
    const full = settle(fine);
    if (isSolvedSide(img, full)) return full;
  }
  return null;
}
