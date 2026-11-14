/**
 * Cube model: colours, faces, facelet strings and a sticker-level move engine.
 *
 * Facelet layout follows Kociemba's convention: faces in URFDLB order, 9 stickers each,
 * row by row. U is viewed from above with B at the top, D from below with F at the top,
 * and the four side faces with U at the top. Index 4 of each face is its center.
 */

export type Color = 'W' | 'Y' | 'G' | 'B' | 'R' | 'O';
export const COLORS: readonly Color[] = ['W', 'Y', 'G', 'B', 'R', 'O'];

export type FaceName = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: readonly FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** 9 colours, row by row; index 4 is the center. */
export type Face = Color[];

export type CubeState = Record<FaceName, Face>;

/** Standard colour scheme: white top, green front. */
export const STANDARD_SCHEME: Record<FaceName, Color> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
};

export function solvedState(scheme: Record<FaceName, Color> = STANDARD_SCHEME): CubeState {
  const s = {} as CubeState;
  for (const f of FACES) s[f] = Array(9).fill(scheme[f]);
  return s;
}

export function cloneState(s: CubeState): CubeState {
  const c = {} as CubeState;
  for (const f of FACES) c[f] = [...s[f]];
  return c;
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  return FACES.every((f) => a[f].every((c, i) => c === b[f][i]));
}

/** Rotate a face's 9 stickers 90° clockwise (as seen looking at the face). */
export function rotateFace90<T>(face: readonly T[]): T[] {
  // new[r][c] = old[2-c][r]
  const out: T[] = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = face[(2 - c) * 3 + r];
  return out;
}

/** Rotate clockwise `turns` quarter turns (negative / >3 allowed). */
export function rotateFace<T>(face: readonly T[], turns: number): T[] {
  let out = [...face];
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = rotateFace90(out);
  return out;
}

/** Flatten a state into 54 colours in URFDLB order. */
export function toColorArray(s: CubeState): Color[] {
  return FACES.flatMap((f) => s[f]);
}

export function fromColorArray(colors: readonly Color[]): CubeState {
  if (colors.length !== 54) throw new Error(`Expected 54 stickers, got ${colors.length}`);
  const s = {} as CubeState;
  FACES.forEach((f, i) => (s[f] = colors.slice(i * 9, i * 9 + 9) as Color[]));
  return s;
}

/**
 * Facelet string in URFDLB face letters (e.g. "UUUUUUUUURRR..."), as used by Kociemba solvers.
 * Each sticker is named after the face whose center has its colour.
 * Throws if the 6 centers are not 6 distinct colours.
 */
export function toFacelets(s: CubeState): string {
  const colorToFace = centerMap(s);
  return toColorArray(s)
    .map((c) => {
      const f = colorToFace.get(c);
      if (!f) throw new Error(`Colour ${c} does not match any center`);
      return f;
    })
    .join('');
}

/** Inverse of toFacelets; face letters are coloured using the given scheme. */
export function fromFacelets(facelets: string, scheme: Record<FaceName, Color> = STANDARD_SCHEME): CubeState {
  if (!/^[URFDLB]{54}$/.test(facelets)) throw new Error('Facelet string must be 54 letters from URFDLB');
  return fromColorArray([...facelets].map((ch) => scheme[ch as FaceName]));
}

export function centerMap(s: CubeState): Map<Color, FaceName> {
  const m = new Map<Color, FaceName>();
  for (const f of FACES) {
    const c = s[f][4];
    if (m.has(c)) throw new Error(`Two centers share colour ${c} (${m.get(c)} and ${f})`);
    m.set(c, f);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Sticker geometry. Axes: x → R, y → U, z → F. Each sticker has the position of its
// cubie (coords in {-1,0,1}) and the outward normal of the face it sits on.

type Vec = [number, number, number];

interface FaceFrame {
  n: Vec; // outward normal
  a: Vec; // direction of increasing column
  b: Vec; // direction of increasing row
}

export const FACE_FRAMES: Record<FaceName, FaceFrame> = {
  U: { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  R: { n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
  F: { n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
  D: { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
  L: { n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
  B: { n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
};

export interface Sticker {
  pos: Vec;
  normal: Vec;
}

const add = (...vs: Vec[]): Vec => vs.reduce((p, v) => [p[0] + v[0], p[1] + v[1], p[2] + v[2]], [0, 0, 0] as Vec);
const scale = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k];
const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const key = (s: Sticker) => `${s.pos.join(',')}|${s.normal.join(',')}`;

/** 3D sticker for facelet index 0..53. */
export const STICKERS: Sticker[] = FACES.flatMap((f) => {
  const { n, a, b } = FACE_FRAMES[f];
  const out: Sticker[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) out.push({ pos: add(n, scale(a, c - 1), scale(b, r - 1)), normal: n });
  return out;
});

const STICKER_INDEX = new Map(STICKERS.map((s, i) => [key(s), i]));

export function stickerIndex(s: Sticker): number {
  const i = STICKER_INDEX.get(key(s));
  if (i === undefined) throw new Error(`No sticker at ${key(s)}`);
  return i;
}

/** Rotate v a quarter turn clockwise when looking down `axis` from outside (axis is a unit vector). */
function quarterCW(v: Vec, axis: Vec): Vec {
  // Clockwise seen from +axis = rotation by -90° about axis: v' = (v·k)k − k×v ... computed as
  // v cosθ + (k×v) sinθ + k(k·v)(1−cosθ) with θ = −90° → −(k×v) + k(k·v)
  const [kx, ky, kz] = axis;
  const cross: Vec = [ky * v[2] - kz * v[1], kz * v[0] - kx * v[2], kx * v[1] - ky * v[0]];
  const d = dot(axis, v);
  return add(scale(cross, -1), scale(axis, d));
}

/**
 * A permutation `p` over 54 facelets: after the move, sticker at index `p[i]` came from index i,
 * i.e. next[p[i]] = prev[i].
 */
export type Perm = number[];

function buildPerm(axis: Vec, layer: (pos: Vec) => boolean): Perm {
  return STICKERS.map((s) => {
    if (!layer(s.pos)) return stickerIndex(s);
    return stickerIndex({ pos: quarterCW(s.pos, axis), normal: quarterCW(s.normal, axis) });
  });
}

const BASE_PERMS: Record<string, Perm> = {};
for (const f of FACES) {
  const n = FACE_FRAMES[f].n;
  BASE_PERMS[f] = buildPerm(n, (p) => dot(p, n) === 1);
}
// Whole-cube rotations (WCA): x follows R, y follows U, z follows F.
BASE_PERMS.x = buildPerm(FACE_FRAMES.R.n, () => true);
BASE_PERMS.y = buildPerm(FACE_FRAMES.U.n, () => true);
BASE_PERMS.z = buildPerm(FACE_FRAMES.F.n, () => true);

function applyPerm<T>(arr: readonly T[], p: Perm): T[] {
  const out = new Array<T>(arr.length);
  for (let i = 0; i < arr.length; i++) out[p[i]] = arr[i];
  return out;
}

export interface Move {
  base: string; // U R F D L B x y z
  amount: 1 | 2 | 3; // quarter turns clockwise
}

export function parseAlg(alg: string): Move[] {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const m = /^([URFDLBxyz])(2|'|2')?$/.exec(tok);
      if (!m) throw new Error(`Unsupported move "${tok}"`);
      const amount = m[2] === "'" ? 3 : m[2]?.startsWith('2') ? 2 : 1;
      return { base: m[1], amount } as Move;
    });
}

export function formatMove({ base, amount }: Move): string {
  return base + (amount === 1 ? '' : amount === 2 ? '2' : "'");
}

export function formatAlg(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ');
}

/** Inverse of a move sequence: reverse the order, R ↔ R', X2 stays X2. */
export function invertAlg(moves: readonly Move[]): Move[] {
  return [...moves].reverse().map((m) => ({ base: m.base, amount: (4 - m.amount) as 1 | 2 | 3 }));
}

export function applyMoves(s: CubeState, moves: readonly Move[] | string): CubeState {
  const list = typeof moves === 'string' ? parseAlg(moves) : moves;
  let arr = toColorArray(s);
  for (const m of list) for (let i = 0; i < m.amount; i++) arr = applyPerm(arr, BASE_PERMS[m.base]);
  return fromColorArray(arr);
}

/** Random face-turn sequence with no two consecutive moves on the same face. */
export function randomMoves(length: number, rand: () => number = Math.random): Move[] {
  const out: Move[] = [];
  let last = '';
  while (out.length < length) {
    const base = FACES[Math.floor(rand() * 6)];
    if (base === last) continue;
    last = base;
    out.push({ base, amount: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3 });
  }
  return out;
}

/** Edge of a face as seen in a scan (clockwise order). */
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
export const EDGE_SIDES: readonly EdgeSide[] = ['top', 'right', 'bottom', 'left'];

/** Sticker indices along each edge of a face, listed clockwise. */
export const EDGE_INDICES: Record<EdgeSide, [number, number, number]> = {
  top: [0, 1, 2],
  right: [2, 5, 8],
  bottom: [8, 7, 6],
  left: [6, 3, 0],
};

/**
 * For face f and one of its edges (in the canonical orientation), the neighbouring face and the
 * facelet indices (0..53) of the 3 neighbour stickers touching that edge, aligned with
 * EDGE_INDICES order.
 */
export function neighbourStrip(f: FaceName, side: EdgeSide): { face: FaceName; facelets: number[] } {
  const { a, b } = FACE_FRAMES[f];
  const dir: Vec = side === 'top' ? scale(b, -1) : side === 'right' ? a : side === 'bottom' ? b : scale(a, -1);
  const base = FACES.indexOf(f) * 9;
  const facelets = EDGE_INDICES[side].map((i) => stickerIndex({ pos: STICKERS[base + i].pos, normal: dir }));
  const face = FACES[Math.floor(facelets[0] / 9)];
  return { face, facelets };
}
