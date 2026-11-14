/**
 * Optimal cross on the D face. The 4 cross edges are tracked by where their D-coloured sticker
 * is (24 edge facelets each), giving a 24⁴ table of exact distances built once by BFS.
 */
import { type Move, movePerm } from '../../core/cube';
import { EDGES, type Stickers, cubie, locate } from '../pieces';

const EDGE_FACELETS = EDGES.flat();
const EF_INDEX = new Map(EDGE_FACELETS.map((f, i) => [f, i]));
const HOMES = ['DF', 'DR', 'DB', 'DL'].map(cubie);

export const FACE_MOVES: Move[] = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((base) =>
  ([1, 2, 3] as const).map((amount) => ({ base, amount })),
);

const N = 24 ** 4;
let dist: Int8Array | null = null;
let next: Uint8Array[] = [];

function encode(l: readonly number[]): number {
  return ((l[0] * 24 + l[1]) * 24 + l[2]) * 24 + l[3];
}

function step(code: number, m: number): number {
  const t = next[m];
  const a = code % 24, b = Math.floor(code / 24) % 24, c = Math.floor(code / 576) % 24, d = Math.floor(code / 13824);
  return ((t[d] * 24 + t[c]) * 24 + t[b]) * 24 + t[a];
}

function build() {
  next = FACE_MOVES.map((m) => {
    const p = movePerm(m);
    return Uint8Array.from(EDGE_FACELETS, (f) => EF_INDEX.get(p[f])!);
  });
  dist = new Int8Array(N).fill(-1);
  const start = encode(HOMES.map((h) => EF_INDEX.get(h[0])!));
  const queue = new Int32Array(190080);
  let head = 0, tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++];
    for (let m = 0; m < FACE_MOVES.length; m++) {
      const n = step(c, m);
      if (dist[n] < 0) {
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
  }
}

/** Code of the cross edges' positions in this state (cross colour = D center). */
function crossCode(st: Stickers): number {
  return encode(HOMES.map((h) => EF_INDEX.get(locate(st, h)[0])!));
}

export function crossDistance(st: Stickers): number {
  if (!dist) build();
  return dist![crossCode(st)];
}

/** An optimal (fewest moves) cross solution for the D face. */
export function solveCross(st: Stickers): Move[] {
  if (!dist) build();
  let code = crossCode(st);
  const out: Move[] = [];
  let last = '';
  while (dist![code] > 0) {
    const d = dist![code];
    let found = -1;
    for (let m = 0; m < FACE_MOVES.length; m++) {
      if (FACE_MOVES[m].base === last) continue;
      if (dist![step(code, m)] === d - 1) {
        found = m;
        break;
      }
    }
    out.push(FACE_MOVES[found]);
    last = FACE_MOVES[found].base;
    code = step(code, found);
  }
  return out;
}
