/**
 * Guide-frame scanning: the user lines a face up with a fixed 3 × 3 square on screen, so there is
 * nothing to detect. Each cell's colour is read straight from the pixels under it.
 *
 *   readGuide()      9 colour readings from the square
 *   SteadyDetector   says when the reading has stopped changing (for auto-capture)
 *   findDuplicate()  whether a face was already captured, in any rotation
 */
import type { Color } from '../core/cube';
import { type Lab, type RGB, classifySticker, deltaE, robustColor, stickerDistance } from './color';
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

const SAMPLES = 11; // lattice points per side of a cell

/**
 * Read the 9 cells of the guide square. Each cell is sampled over its middle (the cube rarely
 * sits exactly on the grid). The center cell is sampled on a ring instead, skipping its middle,
 * because center stickers usually carry a brand logo there.
 */
export function readGuide(img: RGBAImage, sq: GuideSquare): GuideReading {
  const { width: W, height: H, data } = img;
  const pitch = sq.size / 3;
  const stickers: GuideSticker[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const center = row === 1 && col === 1;
      const half = center ? 0.37 : 0.3;
      const hole = center ? 0.25 : -1;
      const cx = sq.x + (col + 0.5) * pitch;
      const cy = sq.y + (row + 0.5) * pitch;
      const samples: RGB[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const du = ((i / (SAMPLES - 1)) * 2 - 1) * half;
          const dv = ((j / (SAMPLES - 1)) * 2 - 1) * half;
          if (Math.max(Math.abs(du), Math.abs(dv)) < hole) continue;
          const x = Math.round(cx + du * pitch);
          const y = Math.round(cy + dv * pitch);
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
 * Index of the captured face that `labs` shows again (same center colour and the same stickers
 * in some rotation), or -1. Compares raw readings, so it does not depend on naming the colours.
 */
export function findDuplicate(labs: Lab[], captured: (Lab[] | null | undefined)[]): number {
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    if (!c || stickerDistance(labs[4], c[4]) > 14) continue;
    for (const rot of ROTATIONS) {
      const mean = rot.reduce((s, k, j) => s + stickerDistance(labs[j], c[k]), 0) / 9;
      if (mean < 10) return i;
    }
  }
  return -1;
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
    /** Largest colour change (ΔE) of any cell that still counts as holding still. */
    private maxChange = 8,
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
    if (!a || labs.some((l, i) => deltaE(l, a.labs[i]) > this.maxChange)) {
      this.anchor = { t, labs, fired: false };
      return { clear: true, progress: 0, fire: false };
    }
    const progress = Math.min(1, (t - a.t) / this.steadyMs);
    const fire = progress >= 1 && !a.fired;
    if (fire) a.fired = true;
    return { clear: true, progress, fire };
  }
}
