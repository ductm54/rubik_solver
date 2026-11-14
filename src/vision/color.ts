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
  // 54 × 54 cost: column k is a slot of colour (center) floor(k / 9).
  const cost = labs.map((lab) => {
    const row: number[] = [];
    for (let face = 0; face < 6; face++) {
      const d = stickerDistance(lab, centers[face]);
      for (let k = 0; k < 9; k++) row.push(d);
    }
    return row;
  });
  // Centers must stay on their own colour.
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 54; k++) if (Math.floor(k / 9) !== face) cost[face * 9 + 4][k] = 1e6;
  }
  const match = hungarian(cost);
  return match.map((slot) => centerColors[Math.floor(slot / 9)]);
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
