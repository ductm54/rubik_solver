/**
 * Regrips: an estimate of how awkward a move sequence is to execute.
 *
 * Each hand holds its side of the cube with the thumb in front (the home grip), on top or on the
 * bottom. A wrist turn (R, R' for the right hand, L, L' for the left) carries the thumb along:
 * R takes the right thumb from the bottom to the front to the top. Every other turn is done by a
 * finger, and which turns a hand reaches depends on where its thumb is. When neither hand reaches
 * the next turn, or the wrist cannot turn further, a hand lets go and takes a new grip: a regrip.
 *
 * The fewest regrips for a sequence is found by trying every grip at every move. The first grip is
 * free: it is taken during inspection.
 *
 * This is a model, not a measurement. The table below follows the usual right-handed finger
 * tricks; change it, and the two costs under it, to match your own.
 */
import type { Move } from '../../core/cube';

/** Where a hand's thumb is. */
export type Thumb = 'bottom' | 'front' | 'top';
const THUMBS: Thumb[] = ['bottom', 'front', 'top']; // in the order a wrist turn goes through them

/**
 * The turns the RIGHT hand does with a finger, without regripping, by where its thumb is.
 *  - front (home): U with the index finger, D turns with the ring finger, F' with the thumb; u, u2
 *    and f' the same way over two layers.
 *  - top (after R): the fingers are at the back, so B turns; U either way with the index finger.
 *  - bottom (after R'): the index finger is over the front, so F and F2 (and f, f2); U as a push.
 * Wide r and l move the thumb like R and L. M, S, E and the other wide turns are not modelled.
 */
export const RIGHT_HAND: Record<Thumb, string> = {
  front: "U U2 D D' D2 F' u u2 f'",
  top: "U U' U2 B B' B2",
  bottom: 'U F F2 f f2',
};

/** The left hand: by default the mirror image of the right (U ↔ U', F ↔ F', ...). */
export const LEFT_HAND: Record<Thumb, string> = Object.fromEntries(
  THUMBS.map((t) => [t, RIGHT_HAND[t].split(' ').map((m) => (m.endsWith('2') ? m : m.endsWith("'") ? m[0] : `${m}'`)).join(' ')]),
) as Record<Thumb, string>;

/** What a regrip costs, in moves: the pause is about as long as 3 turns. */
export const REGRIP_COST = 3;
/**
 * What a B turn costs on top, in moves, even within reach: it is out of sight, and cubers would
 * sooner turn the whole cube than do one. A B turn as the very first move is free: the hand is
 * put in place for it during inspection.
 */
export const BACK_TURN_COST = 5;

/** Wrist turns: how many places (bottom → front → top) each one moves the thumb of its hand. */
const WRIST: Record<string, { hand: 0 | 1; by: number }> = {
  R: { hand: 1, by: 1 },
  "R'": { hand: 1, by: -1 },
  R2: { hand: 1, by: 2 },
  "L'": { hand: 0, by: 1 },
  L: { hand: 0, by: -1 },
  L2: { hand: 0, by: 2 },
  r: { hand: 1, by: 1 },
  "r'": { hand: 1, by: -1 },
  r2: { hand: 1, by: 2 },
  "l'": { hand: 0, by: 1 },
  l: { hand: 0, by: -1 },
  l2: { hand: 0, by: 2 },
};
/** Turns whose finger is modelled (the others never need a regrip). */
const MODELLED = new Set([...'URFDLB', 'u', 'f']);

const name = (m: Move) => m.base + ['', '', '2', "'"][m.amount];

// A grip is left thumb * 3 + right thumb (9 grips). For each turn: the grip after it, or -1 when
// the turn cannot be done from that grip.
const reach = [LEFT_HAND, RIGHT_HAND].map((h) => THUMBS.map((t) => new Set(h[t].split(' '))));
const afterCache = new Map<string, Int8Array>();
function after(turn: string): Int8Array {
  let out = afterCache.get(turn);
  if (out) return out;
  out = new Int8Array(9);
  const wrist = WRIST[turn];
  for (let g = 0; g < 9; g++) {
    const thumbs = [Math.floor(g / 3), g % 3];
    if (wrist) {
      // R2 / L2 go from the bottom to the top or back, whichever way there is room.
      const from = thumbs[wrist.hand];
      const to = wrist.by === 2 ? 2 - from : from + wrist.by;
      thumbs[wrist.hand] = to;
      out[g] = to < 0 || to > 2 || to === from ? -1 : thumbs[0] * 3 + thumbs[1];
    } else if (!MODELLED.has(turn[0])) out[g] = g; // rotations, slices and the other wide turns: not modelled
    else out[g] = reach[0][thumbs[0]].has(turn) || reach[1][thumbs[1]].has(turn) ? g : -1;
  }
  afterCache.set(turn, out);
  return out;
}

/** Hands that change between two grips (0, 1 or 2): the regrips it takes to go from one to the other. */
const CHANGED = Array.from({ length: 81 }, (_, i) => {
  const a = Math.floor(i / 9), b = i % 9;
  return (Math.floor(a / 3) !== Math.floor(b / 3) ? 1 : 0) + (a % 3 !== b % 3 ? 1 : 0);
});
const HOME = 4; // both thumbs in front
// One regrip weighs more than any choice of first grip, which only breaks ties (home grip first).
const REGRIP = 16;

/** Turns of the B face that cost something: all but one that is the very first move. */
export const backTurns = (moves: readonly Move[]) => moves.filter((m, i) => m.base === 'B' && i > 0).length;

/** How awkward the moves are to execute, as a number of extra moves: regrips and B turns. */
export const effort = (moves: readonly Move[]) => REGRIP_COST * countRegrips(moves) + BACK_TURN_COST * backTurns(moves);

/** The fewest regrips needed to execute the moves. */
export function countRegrips(moves: readonly Move[]): number {
  let cost = Array.from({ length: 9 }, (_, g) => CHANGED[HOME * 9 + g]);
  for (const m of moves) {
    const to = after(name(m));
    const next = new Array<number>(9).fill(Infinity);
    for (let g = 0; g < 9; g++) {
      for (let h = 0; h < 9; h++) {
        if (to[h] < 0) continue;
        const c = cost[g] + REGRIP * CHANGED[g * 9 + h];
        if (c < next[to[h]]) next[to[h]] = c;
      }
    }
    cost = next;
  }
  return Math.floor(Math.min(...cost) / REGRIP);
}

export interface GripPlan {
  /** The fewest regrips needed. */
  regrips: number;
  /** The grip to start with (taken during inspection). */
  start: { left: Thumb; right: Thumb };
  /** The moves (by index) before which a hand regrips: which hand(s), and where its thumb goes. */
  at: { move: number; hands: { hand: 'left' | 'right'; thumb: Thumb }[] }[];
}

/** The way to execute the moves with the fewest regrips: the first grip and where to regrip. */
export function planGrip(moves: readonly Move[]): GripPlan {
  let cost = Array.from({ length: 9 }, (_, g) => CHANGED[HOME * 9 + g]);
  // For each move and each grip after it: the grip before the move, and the grip regripped to.
  const from: [number, number][][] = [];
  for (const m of moves) {
    const to = after(name(m));
    const next = new Array<number>(9).fill(Infinity);
    const back = new Array<[number, number]>(9).fill([0, 0]);
    for (let g = 0; g < 9; g++) {
      for (let h = 0; h < 9; h++) {
        if (to[h] < 0) continue;
        const c = cost[g] + REGRIP * CHANGED[g * 9 + h];
        if (c < next[to[h]]) (next[to[h]] = c), (back[to[h]] = [g, h]);
      }
    }
    cost = next;
    from.push(back);
  }
  let grip = cost.indexOf(Math.min(...cost));
  const regrips = Math.floor(cost[grip] / REGRIP);
  const at: GripPlan['at'] = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const [g, h] = from[i][grip];
    if (g !== h) {
      const hands: GripPlan['at'][number]['hands'] = [];
      if (Math.floor(g / 3) !== Math.floor(h / 3)) hands.push({ hand: 'left', thumb: THUMBS[Math.floor(h / 3)] });
      if (g % 3 !== h % 3) hands.push({ hand: 'right', thumb: THUMBS[h % 3] });
      at.unshift({ move: i, hands });
    }
    grip = g;
  }
  return { regrips, start: { left: THUMBS[Math.floor(grip / 3)], right: THUMBS[grip % 3] }, at };
}
