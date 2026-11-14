/**
 * Piece-level helpers on a flat 54-sticker array (URFDLB order, see core/cube.ts). Everything is
 * relative to the current centers, so whole-cube rotations and any colour scheme work.
 */
import { type Color, FACES, FACE_FRAMES, type FaceName, STICKERS, stickerIndex } from '../core/cube';

export type Stickers = Color[];

/** Facelet indices of each cubie, grouped by cubie position. */
const groups = new Map<string, number[]>();
STICKERS.forEach((s, i) => {
  const k = s.pos.join(',');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(i);
});
export const CORNERS: number[][] = [...groups.values()].filter((g) => g.length === 3);
export const EDGES: number[][] = [...groups.values()].filter((g) => g.length === 2);

export const faceOf = (i: number): FaceName => FACES[Math.floor(i / 9)];
export const centerColor = (st: Stickers, f: FaceName): Color => st[FACES.indexOf(f) * 9 + 4];
/** Colour this facelet has when the cube is solved (its face's center). */
export const homeColor = (st: Stickers, i: number): Color => st[Math.floor(i / 9) * 9 + 4];

/**
 * Facelets of the cubie at a named position, in the order of the letters: cubie('DFR') =
 * [D facelet, F facelet, R facelet].
 */
export function cubie(name: string): number[] {
  const faces = [...name] as FaceName[];
  const pos: [number, number, number] = [0, 0, 0];
  for (const f of faces) for (let k = 0; k < 3; k++) pos[k] += FACE_FRAMES[f].n[k];
  return faces.map((f) => stickerIndex({ pos, normal: FACE_FRAMES[f].n }));
}

export function pieceSolved(st: Stickers, facelets: readonly number[]): boolean {
  return facelets.every((i) => st[i] === homeColor(st, i));
}

/**
 * Where the piece that belongs at `home` currently is: for each home facelet, the facelet now
 * holding that facelet's colour.
 */
export function locate(st: Stickers, home: readonly number[]): number[] {
  const want = home.map((h) => homeColor(st, h));
  const pool = home.length === 3 ? CORNERS : EDGES;
  for (const c of pool) {
    if (want.every((w) => c.some((i) => st[i] === w))) return want.map((w) => c.find((i) => st[i] === w)!);
  }
  throw new Error('Piece not found: is this a valid cube?');
}

/** Faces a facelet set touches, as a sorted string such as "DFR" → "DFR". */
export const positionName = (facelets: readonly number[]): string =>
  facelets
    .map(faceOf)
    .sort((a, b) => 'UDFBRL'.indexOf(a) - 'UDFBRL'.indexOf(b))
    .join('');
