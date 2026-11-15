/**
 * Optimal cross on the D face, and optimal XCross (cross plus one F2L pair in one go).
 *
 * Cross: The 4 cross edges are tracked by where their D-coloured sticker
 * is (24 edge facelets each), giving a 24⁴ table of exact distances built once by BFS.
 */
import { type Move, applyMovesToArray, movePerm, parseAlg } from '../../core/cube';
import { CORNERS, EDGES, type Stickers, cubie, locate } from '../pieces';
import { SLOTS, SLOT_PIECES } from './f2l';

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

/** Turns of the B face: the awkward ones, which step 0 (how the cube is held) tries to avoid. */
export const backTurns = (moves: readonly Move[]) => moves.filter((m) => m.base === 'B').length;

const B_FACE = 5; // index of B in FACE_MOVES, 3 moves per face
const faceOfMove = (m: number) => Math.floor(m / 3);

/** An optimal (fewest moves) cross solution for the D face; of those, one with the fewest B turns. */
export function solveCross(st: Stickers): Move[] {
  if (!dist) build();
  const path: number[] = [];
  let best: number[] | null = null;
  let bestBack = Infinity;
  const dfs = (code: number, back: number, lastFace: number) => {
    const d = dist![code];
    if (d === 0) {
      best = [...path];
      bestBack = back;
      return;
    }
    for (let m = 0; m < FACE_MOVES.length && bestBack > 0; m++) {
      const face = faceOfMove(m);
      // Opposite faces in one order only: the other order is the same solution.
      if (face === lastFace || face + 3 === lastFace) continue;
      const b = back + (face === B_FACE ? 1 : 0);
      if (b >= bestBack) continue;
      const n = step(code, m);
      if (dist![n] !== d - 1) continue;
      path.push(m);
      dfs(n, b, face);
      path.pop();
    }
  };
  dfs(crossCode(st), 0, -1);
  return best!.map((m) => FACE_MOVES[m]);
}

/*
 * XCross: the cross and one F2L pair solved together, fewest moves, by iterative deepening.
 * A branch is cut when neither the cross table nor, for any slot, a table of exact distances for
 * that slot's corner, its edge and the two cross edges next to it (24⁴ each) leaves enough moves.
 *
 * Every solution of the shortest length is looked at, and for each side face the one that turns
 * that face least is kept: whichever side ends up at the back, there is a solution that suits it.
 */
const CORNER_FACELETS = CORNERS.flat();
const CF_INDEX = new Map(CORNER_FACELETS.map((f, i) => [f, i]));
/** For each slot: the two cross edges next to it, as digits of the cross code (0 = DF ... 3 = DL). */
const SLOT_CROSS = SLOTS.map((s) => [...s].map((f) => HOMES.findIndex((h) => h.join() === cubie(`D${f}`).join())));
const POW = [13824, 576, 24, 1];
const digit = (code: number, i: number) => Math.floor(code / POW[i]) % 24;

let cnext: Uint8Array[] = [];
let slotDist: Int8Array[] | null = null;

function buildSlots() {
  if (!dist) build();
  cnext = FACE_MOVES.map((m) => {
    const p = movePerm(m);
    return Uint8Array.from(CORNER_FACELETS, (f) => CF_INDEX.get(p[f])!);
  });
  slotDist = SLOTS.map((slot, k) => {
    const [corner, edge] = SLOT_PIECES[slot];
    const t = new Int8Array(N).fill(-1);
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    const start = encode([CF_INDEX.get(corner[0])!, EF_INDEX.get(edge[0])!, ...SLOT_CROSS[k].map((i) => EF_INDEX.get(HOMES[i][0])!)]);
    t[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const code = queue[head++];
      const c = digit(code, 0), e = digit(code, 1), x = digit(code, 2), y = digit(code, 3);
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const n = ((cnext[m][c] * 24 + next[m][e]) * 24 + next[m][x]) * 24 + next[m][y];
        if (t[n] < 0) {
          t[n] = t[code] + 1;
          queue[tail++] = n;
        }
      }
    }
    return t;
  });
}

/** How a move sequence found with the cube turned by y, y2 or y' reads without that turn. */
const Y_TURNS = ['y', 'y2', "y'"].map((r) => {
  const id = Array.from({ length: 54 }, (_, i) => i);
  const map: Record<string, string> = {};
  for (const b of 'URFDLB') {
    const want = applyMovesToArray(id, parseAlg(`${r} ${b}`)).join();
    map[b] = [...'URFDLB'].find((c) => applyMovesToArray(id, parseAlg(`${c} ${r}`)).join() === want)!;
  }
  return { rot: parseAlg(r), map };
});
/** The side faces, as face numbers of FACE_MOVES (R, F, L, B). */
const SIDE_FACES = [1, 2, 4, 5];
/** Per cube: the shortest solutions, one per side face (the one turning that face least), or null. */
const xcrossCache = new Map<string, Move[][] | null>();

/** All the shortest XCross solutions worth keeping (see above), or null over `max` moves. */
function xcrossOptions(st: Stickers, max: number): Move[][] | null {
  // The same cube held with another side in front has the same answers, with the faces renamed.
  const key = `${max}:${st.join('')}`;
  const hit = xcrossCache.get(key);
  if (hit !== undefined) return hit;
  for (const { rot, map } of Y_TURNS) {
    const other = xcrossCache.get(`${max}:${applyMovesToArray(st, rot).join('')}`);
    if (other !== undefined) return other && other.map((sol) => sol.map((m) => ({ ...m, base: map[m.base] })));
  }
  if (!slotDist) buildSlots();
  const tables = slotDist!;
  const corners = SLOTS.map((s) => CF_INDEX.get(locate(st, SLOT_PIECES[s][0])[0])!);
  const edges = SLOTS.map((s) => EF_INDEX.get(locate(st, SLOT_PIECES[s][1])[0])!);
  // Corner and edge places of the 4 slots at each depth.
  const cs = Array.from({ length: max + 1 }, () => new Uint8Array(4));
  const es = Array.from({ length: max + 1 }, () => new Uint8Array(4));
  cs[0].set(corners);
  es[0].set(edges);
  const path: number[] = [];
  const need = (code: number, d: number) => {
    const cross = dist![code];
    let best = 99;
    for (let k = 0; k < 4; k++) {
      const sc = SLOT_CROSS[k];
      const t = tables[k][((cs[d][k] * 24 + es[d][k]) * 24 + digit(code, sc[0])) * 24 + digit(code, sc[1])];
      best = Math.min(best, Math.max(cross, t));
    }
    return best;
  };
  // Turns of each face on the current path, and per side face the best solution so far.
  const turns = new Uint8Array(6);
  const bestTurns = SIDE_FACES.map(() => Infinity);
  const best: (number[] | null)[] = SIDE_FACES.map(() => null);
  const dfs = (code: number, d: number, left: number, lastFace: number) => {
    // Only go on where some side face is still turned less than in the best solution for it.
    if (SIDE_FACES.every((f, i) => turns[f] >= bestTurns[i])) return;
    const h = need(code, d);
    if (h === 0) {
      const solution = [...path];
      SIDE_FACES.forEach((f, i) => {
        if (turns[f] < bestTurns[i]) (bestTurns[i] = turns[f]), (best[i] = solution);
      });
      return;
    }
    if (h > left) return;
    for (let m = 0; m < FACE_MOVES.length; m++) {
      const face = faceOfMove(m);
      // Not the same face twice, and opposite faces in one order only.
      if (face === lastFace || face + 3 === lastFace) continue;
      for (let k = 0; k < 4; k++) {
        cs[d + 1][k] = cnext[m][cs[d][k]];
        es[d + 1][k] = next[m][es[d][k]];
      }
      path.push(m);
      turns[face]++;
      dfs(step(code, m), d + 1, left - 1, face);
      turns[face]--;
      path.pop();
    }
  };
  const start = crossCode(st);
  let found: Move[][] | null = null;
  for (let depth = need(start, 0); depth <= max && !found; depth++) {
    dfs(start, 0, depth, -1);
    if (best[0]) found = [...new Set(best)].map((p) => p!.map((m) => FACE_MOVES[m]));
  }
  if (xcrossCache.size > 200) xcrossCache.clear();
  xcrossCache.set(key, found);
  return found;
}

/**
 * The shortest way to solve the cross together with at least one F2L pair (of the shortest ones,
 * one with the fewest B turns), or null when that takes more than `max` moves.
 */
export function solveXCross(st: Stickers, max: number): Move[] | null {
  const options = xcrossOptions(st, max);
  if (!options) return null;
  return options.reduce((a, b) => (backTurns(b) < backTurns(a) ? b : a));
}
