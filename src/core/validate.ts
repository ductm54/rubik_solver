/**
 * Cube validity: colour counts, real pieces, each piece once, twist, flip and parity.
 */
import { COLORS, type CubeState, type FaceName, centerMap, toColorArray } from './cube';

const F = (face: FaceName, n: number) => 'URFDLB'.indexOf(face) * 9 + n - 1;

/** Facelets of the 8 corner positions URF UFL ULB UBR DFR DLF DBL DRB; U/D sticker first, then clockwise. */
export const CORNER_FACELETS: [number, number, number][] = [
  [F('U', 9), F('R', 1), F('F', 3)],
  [F('U', 7), F('F', 1), F('L', 3)],
  [F('U', 1), F('L', 1), F('B', 3)],
  [F('U', 3), F('B', 1), F('R', 3)],
  [F('D', 3), F('F', 9), F('R', 7)],
  [F('D', 1), F('L', 9), F('F', 7)],
  [F('D', 7), F('B', 9), F('L', 7)],
  [F('D', 9), F('R', 9), F('B', 7)],
];
export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];

/** Facelets of the 12 edge positions UR UF UL UB DR DF DL DB FR FL BL BR. */
export const EDGE_FACELETS: [number, number][] = [
  [F('U', 6), F('R', 2)],
  [F('U', 8), F('F', 2)],
  [F('U', 4), F('L', 2)],
  [F('U', 2), F('B', 2)],
  [F('D', 6), F('R', 8)],
  [F('D', 2), F('F', 8)],
  [F('D', 4), F('L', 8)],
  [F('D', 8), F('B', 8)],
  [F('F', 6), F('R', 4)],
  [F('F', 4), F('L', 6)],
  [F('B', 6), F('L', 4)],
  [F('B', 4), F('R', 6)],
];
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

export interface CubieState {
  cp: number[]; // corner permutation: cp[pos] = corner piece at pos
  co: number[]; // corner orientation 0..2
  ep: number[];
  eo: number[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  cubies?: CubieState;
}

function parity(p: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++;
  return s % 2;
}

export function validate(state: CubeState): ValidationResult {
  const errors: string[] = [];
  const colors = toColorArray(state);

  for (const c of COLORS) {
    const n = colors.filter((x) => x === c).length;
    if (n !== 9) errors.push(`Colour ${c} appears ${n} times (expected 9)`);
  }
  const unknown = new Set(colors.filter((c) => !COLORS.includes(c)));
  for (const c of unknown) errors.push(`Unknown colour "${c}"`);

  let toFace: Map<string, FaceName>;
  try {
    toFace = centerMap(state);
  } catch (e) {
    errors.push((e as Error).message);
    return { ok: false, errors };
  }
  if (errors.length) return { ok: false, errors };

  const f = colors.map((c) => toFace.get(c)!).join('');

  // Corners
  const cp: number[] = [];
  const co: number[] = [];
  const cornerSets = CORNER_FACELETS.map((idx) => idx.map((i) => 'URFDLB'[Math.floor(i / 9)]).join(''));
  CORNER_FACELETS.forEach((idx, pos) => {
    const s = idx.map((i) => f[i]);
    const ori = s.findIndex((x) => x === 'U' || x === 'D');
    let found = -1;
    if (ori >= 0) {
      // rotate so the U/D sticker is first, then match clockwise order
      const r = [s[ori], s[(ori + 1) % 3], s[(ori + 2) % 3]].join('');
      found = cornerSets.indexOf(r);
    }
    if (found < 0) {
      errors.push(`Corner at ${CORNER_NAMES[pos]} has colours ${idx.map((i) => colors[i]).join('/')}, which is not a real corner piece`);
    }
    cp.push(found);
    co.push(ori);
  });

  // Edges
  const ep: number[] = [];
  const eo: number[] = [];
  const edgeSets = EDGE_FACELETS.map((idx) => idx.map((i) => 'URFDLB'[Math.floor(i / 9)]).join(''));
  EDGE_FACELETS.forEach((idx, pos) => {
    const s = idx.map((i) => f[i]).join('');
    let found = edgeSets.indexOf(s);
    let ori = 0;
    if (found < 0) {
      found = edgeSets.indexOf(s[1] + s[0]);
      ori = 1;
    }
    if (found < 0) {
      errors.push(`Edge at ${EDGE_NAMES[pos]} has colours ${idx.map((i) => colors[i]).join('/')}, which is not a real edge piece`);
    }
    ep.push(found);
    eo.push(ori);
  });

  if (errors.length) return { ok: false, errors };

  const dupCheck = (perm: number[], names: string[], kind: string) => {
    const seen = new Map<number, number>();
    perm.forEach((p, pos) => {
      if (seen.has(p)) errors.push(`${kind} piece ${names[p]} appears twice (at ${names[seen.get(p)!]} and ${names[pos]})`);
      else seen.set(p, pos);
    });
    names.forEach((n, i) => !perm.includes(i) && errors.push(`${kind} piece ${n} is missing`));
  };
  dupCheck(cp, CORNER_NAMES, 'Corner');
  dupCheck(ep, EDGE_NAMES, 'Edge');
  if (errors.length) return { ok: false, errors };

  const twist = co.reduce((a, b) => a + b, 0) % 3;
  if (twist !== 0) errors.push(`Corner twist is off by ${twist === 1 ? 'one clockwise' : 'one anticlockwise'} turn: a corner is twisted in place`);
  const flip = eo.reduce((a, b) => a + b, 0) % 2;
  if (flip !== 0) errors.push('Edge flip is odd: an edge is flipped in place');
  if (parity(cp) !== parity(ep)) errors.push('Permutation parity mismatch: two pieces are swapped');

  return errors.length ? { ok: false, errors } : { ok: true, errors, cubies: { cp, co, ep, eo } };
}

export function isValid(state: CubeState): boolean {
  return validate(state).ok;
}
