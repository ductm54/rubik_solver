/**
 * Stickering masks for the cubing.js viewer: which pieces to show bright, dim or top-colour-only
 * at each step. cubing.js names pieces by their home in its own frame (white top, green front),
 * so pieces are picked by colour through the cube's colour scheme.
 */
import type { Color } from '../core/cube';

export const COLOR_WORDS: Record<Color, string> = { W: 'white', Y: 'yellow', G: 'green', B: 'blue', R: 'red', O: 'orange' };

// cubing.js 3x3x3 orbit order.
const EDGES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
const CORNERS = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];
const CENTERS = ['U', 'L', 'F', 'R', 'B', 'D'];

const OPPOSITE: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };

export type MaskStage =
  | { kind: 'cross'; cross: Color }
  /** `pairs`: corner and edge of a slot by its colours. `pieces`: single pieces, by their exact colours. */
  | { kind: 'f2l'; cross: Color; pairs: Color[][]; pieces?: Color[][] }
  | { kind: 'eo' | 'oll' | 'cpll' | 'pll'; cross: Color }
  /** Only these pieces (by their exact colours) bright, the rest dim. */
  | { kind: 'pieces'; cross: Color; pieces: Color[][] };

/** Serialised mask (cubing.js `experimental-stickering-mask-orbits`). `scheme` maps face → colour. */
export function stickeringMask(scheme: Record<string, Color>, stage: MaskStage): string {
  const colorsOf = (piece: string) => [...piece].map((f) => scheme[f]);
  const crossFace = Object.keys(scheme).find((f) => scheme[f] === stage.cross)!;
  const ll = scheme[OPPOSITE[crossFace]];
  const isLL = (piece: string) => colorsOf(piece).includes(ll);
  const inPair = (piece: string) =>
    stage.kind === 'f2l' &&
    colorsOf(piece).length > 1 &&
    (stage.pairs.some((p) => colorsOf(piece).every((c) => p.includes(c))) ||
      !!stage.pieces?.some((p) => p.length === piece.length && colorsOf(piece).every((c) => p.includes(c))));
  const listed = (piece: string) =>
    stage.kind === 'pieces' && stage.pieces.some((p) => p.length === piece.length && colorsOf(piece).every((c) => p.includes(c)));
  const isCross = (piece: string) => piece.length === 2 && colorsOf(piece).includes(stage.cross);

  const code = (piece: string, edge: boolean): string => {
    switch (stage.kind) {
      case 'cross':
        return isCross(piece) ? '-' : 'D';
      case 'f2l':
        return isCross(piece) || inPair(piece) ? '-' : 'D';
      case 'eo':
        return !isLL(piece) ? '-' : edge ? 'O' : 'I';
      case 'oll':
        return isLL(piece) ? 'O' : '-';
      case 'cpll':
        return !isLL(piece) ? '-' : edge ? 'I' : '-';
      case 'pll':
        return '-';
      case 'pieces':
        return listed(piece) ? '-' : 'D';
    }
  };
  return [
    `EDGES:${EDGES.map((p) => code(p, true)).join('')}`,
    `CORNERS:${CORNERS.map((p) => code(p, false)).join('')}`,
    `CENTERS:${CENTERS.map(() => '-').join('')}`,
  ].join(',');
}
