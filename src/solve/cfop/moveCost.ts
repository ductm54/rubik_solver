/**
 * How long a move takes to execute, in "fast moves": R or U = 1. A model of the usual right-handed
 * finger tricks from the home grip (thumbs on the front), not a measurement; change the tiers to
 * match your own turning. Left-handed solvers swap R/L, U/U' and F/F'.
 *
 *  1.0  R R' U U'         wrist turn; index-finger flick
 *  1.1  L L' r r' U2      left wrist; wrist taking two layers; two-finger flick
 *  1.3  R2 u u' D D' F'   double wrist; index flick over two layers; ring-finger pull; thumb push
 *  1.5  L2 M M' F u2 D2   left double; ring-finger push; index pull from the top
 *  1.8  M2 f' l l' S S' F2
 *  2.2  f f2 B B' S2 E E' d d'
 *  2.6  everything else (B2, l2, r2, d2, E2, b, ...)
 */
import { type Move, countMoves, formatMove } from '../../core/cube';

const TIERS: [number, string][] = [
  [1.0, "R R' U U'"],
  [1.1, "L L' r r' U2"],
  [1.3, "R2 u u' D D' F'"],
  [1.5, "L2 M M' F u2 D2"],
  [1.8, "M2 f' l l' S S' F2"],
  [2.2, "f f2 B B' S2 E E' d d'"],
];
export const SLOW_MOVE_COST = 2.6;

export const MOVE_COST: Record<string, number> = Object.fromEntries(TIERS.flatMap(([c, ms]) => ms.split(' ').map((m) => [m, c])));

/** Rotations cost nothing here (they are not turns); unlisted moves are the slowest tier. */
export const moveCost = (m: Move): number => ('xyz'.includes(m.base) ? 0 : (MOVE_COST[formatMove(m)] ?? SLOW_MOVE_COST));

/** Execution time of a sequence, in fast moves (R or U = 1). */
export const turnCost = (moves: readonly Move[]): number => Math.round(moves.reduce((a, m) => a + moveCost(m) * 10, 0)) / 10;

/** What advanced F2L minimises: execution time (weighted moves) or the plain move count. */
export type F2LMetric = 'time' | 'moves';

/**
 * The search's cost of a sequence, in whole tenths so sums compare exactly: execution time with
 * the move count to break ties, or the move count alone.
 */
export const metricCost = (metric: F2LMetric, moves: readonly Move[]): number =>
  metric === 'time' ? Math.round(turnCost(moves) * 10) * 100 + countMoves(moves) : countMoves(moves);
