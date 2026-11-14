/**
 * Colour science for sticker reading: sRGB → CIELAB, distances, single-face classification
 * against a reference palette, and whole-cube balanced classification (exactly 9 per colour).
 */
import { COLORS, type Color } from '../core/cube';
import { hungarian } from './hungarian';

export type RGB = [number, number, number];
export type Lab = [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

// D65 white point
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const fx = f(X / XN);
  const fy = f(Y / YN);
  const fz = f(Z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Colour difference tuned for stickers: lightness matters less than hue/chroma (lighting
 * changes L a lot), which keeps red/orange and white/yellow apart under uneven light.
 */
export function stickerDistance(a: Lab, b: Lab): number {
  return Math.hypot((a[0] - b[0]) * 0.5, a[1] - b[1], a[2] - b[2]);
}

/** Typical sticker colours (sRGB) under neutral light. */
export const REFERENCE_RGB: Record<Color, RGB> = {
  W: [235, 235, 235],
  Y: [250, 215, 30],
  G: [20, 165, 80],
  B: [20, 80, 190],
  R: [195, 25, 45],
  O: [255, 115, 20],
};
export const REFERENCE_LAB: Record<Color, Lab> = Object.fromEntries(
  COLORS.map((c) => [c, rgbToLab(REFERENCE_RGB[c])]),
) as Record<Color, Lab>;

export interface Classified {
  color: Color;
  /** Distance to the best reference. */
  distance: number;
  /** Gap to the second-best reference: small means ambiguous. */
  margin: number;
}

/**
 * Nearest reference colour for one sticker. With RGB given, compares colour proportions (robust to
 * the sticker being dimly lit) plus a little lightness; otherwise uses Lab.
 */
export function classifySticker(lab: Lab, refs: Record<Color, Lab> = REFERENCE_LAB, rgb?: RGB): Classified {
  const dist = (c: Color) =>
    rgb ? chromaDistance(rgb, REFERENCE_RGB[c]) * 300 + Math.abs(lab[0] - refs[c][0]) * 0.15 : stickerDistance(lab, refs[c]);
  const d = COLORS.map((c) => ({ c, d: dist(c) })).sort((x, y) => x.d - y.d);
  return { color: d[0].c, distance: d[0].d, margin: d[1].d - d[0].d };
}

/**
 * Which standard colour each of the 6 center readings is: a one-to-one match of centers to
 * reference colours, so two centers can never get the same colour.
 */
export function assignCenters(centers: Lab[], refs: Record<Color, Lab> = REFERENCE_LAB): Color[] {
  if (centers.length !== 6) throw new Error('Need 6 centers');
  const cost = centers.map((c) => COLORS.map((k) => stickerDistance(c, refs[k])));
  const match = hungarian(cost);
  return match.map((j) => COLORS[j]);
}

/**
 * Classify all 54 stickers so that each colour gets exactly 9. The 6 center readings are the
 * reference colours (this adapts to lighting and to non-standard sticker shades).
 *
 * @param labs 54 readings in URFDLB order (index 4 of each face is its center)
 */
export function classifyBalanced(labs: Lab[]): Color[] {
  if (labs.length !== 54) throw new Error('Need 54 stickers');
  const centers = [0, 1, 2, 3, 4, 5].map((f) => labs[f * 9 + 4]);
  const centerColors = assignCenters(centers);
  // 54 × 54 cost: column k is a slot of colour (center) floor(k / 9). The centers are the first
  // references; then each colour's reference becomes the mean of the stickers given to it, so one
  // odd center reading (a logo, a glare spot) does not skew the whole colour.
  let refs = centers;
  let groups: number[] = [];
  for (let iter = 0; iter < 3; iter++) {
    const cost = labs.map((lab) => {
      const row: number[] = [];
      for (let face = 0; face < 6; face++) {
        const d = stickerDistance(lab, refs[face]);
        for (let k = 0; k < 9; k++) row.push(d);
      }
      return row;
    });
    // Centers must stay on their own colour.
    for (let face = 0; face < 6; face++) {
      for (let k = 0; k < 54; k++) if (Math.floor(k / 9) !== face) cost[face * 9 + 4][k] = 1e6;
    }
    const next = hungarian(cost).map((slot) => Math.floor(slot / 9));
    if (next.every((g, i) => g === groups[i])) break;
    groups = next;
    refs = centers.map((_, face) => {
      const members = labs.filter((__, i) => groups[i] === face);
      return [0, 1, 2].map((k) => members.reduce((s, m) => s + m[k], 0) / members.length) as Lab;
    });
  }
  return groups.map((g) => centerColors[g]);
}

/**
 * Brightness-independent colour difference: compares the proportions r:g:b. Shading (a side face
 * turned away from the light) scales all channels together, so a dim orange still matches orange.
 */
export function chromaDistance(a: RGB, b: RGB): number {
  const sa = a[0] + a[1] + a[2] || 1;
  const sb = b[0] + b[1] + b[2] || 1;
  return Math.hypot(a[0] / sa - b[0] / sb, a[1] / sa - b[1] / sb, a[2] / sa - b[2] / sb);
}

export interface RobustColor {
  lab: Lab;
  rgb: RGB;
  /** Share of the samples that agree with the result (1 = one flat colour). */
  purity: number;
}

/**
 * The main colour of a patch of pixels: the sample with the most similar samples around it, then
 * the mean of that group. Unlike a mean or median this never blends two colours, so glare, a logo,
 * the gap between stickers or a finger are ignored as long as the real colour is the largest group.
 */
export function robustColor(samples: RGB[]): RobustColor {
  if (!samples.length) return { lab: [0, 0, 0], rgb: [0, 0, 0], purity: 0 };
  const labs = samples.map(rgbToLab);
  const n = labs.length;
  const votes = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (deltaE(labs[i], labs[j]) < 12) {
        votes[i]++;
        votes[j]++;
      }
    }
  }
  let seed = 0;
  for (let i = 1; i < n; i++) if (votes[i] > votes[seed]) seed = i;
  const use: number[] = [];
  for (let i = 0; i < n; i++) if (deltaE(labs[i], labs[seed]) < 16) use.push(i);
  const mean = (get: (i: number) => number[]) => [0, 1, 2].map((k) => use.reduce((s, i) => s + get(i)[k], 0) / use.length);
  return {
    lab: mean((i) => labs[i]) as Lab,
    rgb: mean((i) => samples[i]).map(Math.round) as RGB,
    purity: use.length / n,
  };
}
