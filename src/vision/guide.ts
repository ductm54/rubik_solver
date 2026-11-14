/**
 * Guide-frame scanning: the user lines a face up with a fixed 3 × 3 square on screen, so the face
 * does not have to be found, only fine-tuned: nobody holds a cube exactly on the grid.
 *
 *   fitGuide()       where the face really sits near the square (size, turn, offset)
 *   readGuide()      9 colour readings from that grid
 *   SteadyDetector   says when the reading has stopped changing (for auto-capture)
 *   findDuplicate()  whether a face was already captured, in any rotation
 */
import type { Color } from '../core/cube';
import { type Lab, type RGB, classifySticker, robustColor, stickerDistance } from './color';
import type { RGBAImage } from './detect';

export interface GuideSquare {
  /** Top-left corner and side of the guide square in image pixels. */
  x: number;
  y: number;
  size: number;
}

export interface GuideSticker {
  lab: Lab;
  rgb: RGB;
  /** Nearest standard colour (single-face guess; whole-cube reading rebalances later). */
  color: Color;
  /** How far the second-best colour is behind; small = ambiguous. */
  margin: number;
  /** Share of the cell's pixels that agree with the reading; low = cell is not one flat colour. */
  purity: number;
}

export interface GuideReading {
  /** 9 stickers row by row as seen in the image. */
  stickers: GuideSticker[];
  colors: Color[];
}

/** Side of the guide square for a frame: a centered square that leaves room around the cube. */
export function guideSquare(width: number, height: number, fill = 0.62): GuideSquare {
  const size = Math.round(Math.min(width, height) * fill);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

export interface GuideFit {
  /** Size of the face relative to the guide square. */
  scale: number;
  /** Rotation of the face, radians. */
  rot: number;
  /** Offset of the face's middle from the square's middle, in sticker pitches of the square. */
  dx: number;
  dy: number;
}

const NOMINAL: GuideFit = { scale: 1, rot: 0, dx: 0, dy: 0 };

/** Image position of a point of the face: cell (col,row) plus an offset in sticker pitches. */
function facePoint(sq: GuideSquare, fit: GuideFit, col: number, row: number, du = 0, dv = 0): [number, number] {
  const pitch = sq.size / 3;
  const u = (col - 1 + du) * pitch * fit.scale;
  const v = (row - 1 + dv) * pitch * fit.scale;
  const c = Math.cos(fit.rot);
  const s = Math.sin(fit.rot);
  return [sq.x + sq.size / 2 + fit.dx * pitch + u * c - v * s, sq.y + sq.size / 2 + fit.dy * pitch + u * s + v * c];
}

/** Outer corners of the fitted face: top-left, top-right, bottom-right, bottom-left. */
export function fitCorners(sq: GuideSquare, fit: GuideFit): [number, number][] {
  return [facePoint(sq, fit, 0, 0, -0.5, -0.5), facePoint(sq, fit, 2, 0, 0.5, -0.5), facePoint(sq, fit, 2, 2, 0.5, 0.5), facePoint(sq, fit, 0, 2, -0.5, 0.5)];
}

const FIT_HALF = 0.26; // half-width of the searched part of a cell, in pitches
const FIT_CAP = 60; // a cell cannot cost more than this (logo, glare, finger)

/**
 * How badly a candidate grid sits on the face: for each cell, the colour spread of the pixels
 * under it. A cell that lies within one sticker is flat; one that straddles two stickers, or a
 * sticker and the background, is not. Works without visible gaps between stickers.
 */
function fitCost(img: RGBAImage, sq: GuideSquare, fit: GuideFit, lattice: number): number {
  const { width: W, height: H, data } = img;
  const pitch = sq.size / 3;
  const c = Math.cos(fit.rot) * pitch * fit.scale;
  const s = Math.sin(fit.rot) * pitch * fit.scale;
  const ox = sq.x + sq.size / 2 + fit.dx * pitch;
  const oy = sq.y + sq.size / 2 + fit.dy * pitch;
  const stepUV = (2 * FIT_HALF) / (lattice - 1);
  let cost = 0;
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let ss = 0;
      for (let i = 0; i < lattice; i++) {
        const u = col - FIT_HALF + i * stepUV;
        for (let j = 0; j < lattice; j++) {
          const v = row - FIT_HALF + j * stepUV;
          const x = Math.round(ox + u * c - v * s);
          const y = Math.round(oy + u * s + v * c);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          n++;
          sr += r;
          sg += g;
          sb += b;
          ss += r * r + g * g + b * b;
        }
      }
      if (n < 4) {
        cost += FIT_CAP;
        continue;
      }
      const variance = Math.max(0, (ss - (sr * sr + sg * sg + sb * sb) / n) / n);
      cost += Math.min(FIT_CAP, Math.sqrt(variance));
    }
  }
  // Among equally good grids prefer the one nearest the square the user is aiming at.
  return cost + 4 * (Math.abs(fit.scale - 1) * 3 + Math.abs(fit.rot) * 2 + Math.abs(fit.dx) + Math.abs(fit.dy));
}

/**
 * Find where the face really sits near the guide square: a little bigger or smaller, turned, or
 * off-center. Coarse search over the whole range, then three rounds of fine tuning.
 */
export function fitGuide(img: RGBAImage, sq: GuideSquare): GuideFit {
  let best = NOMINAL;
  let bestCost = fitCost(img, sq, best, 4);
  const deg = Math.PI / 180;
  for (let scale = 0.76; scale <= 1.241; scale += 0.08) {
    for (let rot = -15; rot <= 15; rot += 5) {
      for (let dx = -0.4; dx <= 0.401; dx += 0.1) {
        for (let dy = -0.4; dy <= 0.401; dy += 0.1) {
          const fit = { scale, rot: rot * deg, dx, dy };
          const c = fitCost(img, sq, fit, 4);
          if (c < bestCost) {
            bestCost = c;
            best = fit;
          }
        }
      }
    }
  }
  bestCost = fitCost(img, sq, best, 6);
  let step = { scale: 0.04, rot: 2.5 * deg, d: 0.05 };
  for (let round = 0; round < 3; round++) {
    const from = best;
    for (const ds of [-1, 0, 1]) {
      for (const dr of [-1, 0, 1]) {
        for (const ix of [-1, 0, 1]) {
          for (const iy of [-1, 0, 1]) {
            const fit = { scale: from.scale + ds * step.scale, rot: from.rot + dr * step.rot, dx: from.dx + ix * step.d, dy: from.dy + iy * step.d };
            const c = fitCost(img, sq, fit, 6);
            if (c < bestCost) {
              bestCost = c;
              best = fit;
            }
          }
        }
      }
    }
    step = { scale: step.scale / 2, rot: step.rot / 2, d: step.d / 2 };
  }
  return best;
}

const SAMPLES = 11; // lattice points per side of a cell

/**
 * Read the 9 cells of the face. With no `fit` the cells are those of the guide square itself;
 * pass the result of fitGuide() to read where the face really is. Each cell is sampled over its
 * middle. The center cell is sampled on a ring instead, skipping its middle, because center
 * stickers usually carry a brand logo there.
 */
export function readGuide(img: RGBAImage, sq: GuideSquare, fit: GuideFit = NOMINAL): GuideReading {
  const { width: W, height: H, data } = img;
  const stickers: GuideSticker[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const center = row === 1 && col === 1;
      const half = center ? 0.36 : 0.28;
      const hole = center ? 0.25 : -1;
      const samples: RGB[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const du = ((i / (SAMPLES - 1)) * 2 - 1) * half;
          const dv = ((j / (SAMPLES - 1)) * 2 - 1) * half;
          if (Math.max(Math.abs(du), Math.abs(dv)) < hole) continue;
          const [fx, fy] = facePoint(sq, fit, col, row, du, dv);
          const x = Math.round(fx);
          const y = Math.round(fy);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 4;
          samples.push([data[p], data[p + 1], data[p + 2]]);
        }
      }
      const { lab, rgb, purity } = robustColor(samples);
      const cls = classifySticker(lab, undefined, rgb);
      stickers.push({ lab, rgb, color: cls.color, margin: cls.margin, purity });
    }
  }
  return { stickers, colors: stickers.map((s) => s.color) };
}

/** True when every cell shows one flat, lit colour: a face is probably sitting in the guide. */
export function isClear(r: GuideReading, minPurity = 0.6): boolean {
  return r.stickers.every((s) => s.purity >= minPurity && s.lab[0] > 12);
}

const ROTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [6, 3, 0, 7, 4, 1, 8, 5, 2],
  [8, 7, 6, 5, 4, 3, 2, 1, 0],
  [2, 5, 8, 1, 4, 7, 0, 3, 6],
];

/**
 * Index of the captured face that `labs` shows again (the same stickers in some rotation), or
 * -1. Compares raw readings, so it does not depend on naming the colours.
 *
 * The light on a turning cube changes, so the same face read at two moments is not the same
 * numbers: on real video its stickers differ by up to 35, and by 24 on average. Two different
 * faces always have some sticker that is a different colour altogether (90 or more apart). So a
 * repeat is a face where no sticker is far off and the average is close.
 */
export function findDuplicate(labs: Lab[], captured: (Lab[] | null | undefined)[]): number {
  let best = -1;
  let bestMean = 30;
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    if (!c) continue;
    for (const rot of ROTATIONS) {
      let sum = 0;
      let worst = 0;
      for (let j = 0; j < 9; j++) {
        const d = stickerDistance(labs[j], c[rot[j]]);
        sum += d;
        if (d > worst) worst = d;
      }
      if (worst < 45 && sum / 9 < bestMean) {
        bestMean = sum / 9;
        best = i;
      }
    }
  }
  return best;
}

export interface SteadyUpdate {
  /** The cells are flat colours (see isClear). */
  clear: boolean;
  /** 0..1: how long the reading has been steady, as a share of `steadyMs`. */
  progress: number;
  /** True once, on the update where the reading has been steady for `steadyMs`. */
  fire: boolean;
}

/** Watches guide readings and fires once each time a clear reading holds still. */
export class SteadyDetector {
  private anchor: { t: number; labs: Lab[]; fired: boolean } | null = null;

  constructor(
    private steadyMs = 450,
    /**
     * Largest colour change of any cell that still counts as holding still. Lightness counts
     * half: a hand-held phone keeps adjusting its exposure.
     */
    private maxChange = 12,
  ) {}

  reset(): void {
    this.anchor = null;
  }

  update(r: GuideReading, t: number): SteadyUpdate {
    if (!isClear(r)) {
      this.anchor = null;
      return { clear: false, progress: 0, fire: false };
    }
    const labs = r.stickers.map((s) => s.lab);
    const a = this.anchor;
    if (!a || labs.some((l, i) => stickerDistance(l, a.labs[i]) > this.maxChange)) {
      this.anchor = { t, labs, fired: false };
      return { clear: true, progress: 0, fire: false };
    }
    const progress = Math.min(1, (t - a.t) / this.steadyMs);
    const fire = progress >= 1 && !a.fired;
    if (fire) a.fired = true;
    return { clear: true, progress, fire };
  }
}
