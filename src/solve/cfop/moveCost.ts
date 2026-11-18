/**
 * How long a move takes to execute, in "fast moves": R = 1. A model of right-handed finger tricks
 * from the home grip (thumbs on the front), not a measurement. The values follow trangium's
 * Movecount Coefficient Calculator (wrist turns cheapest, flicks a little slower, pushes and ring
 * finger slower still, half turns about 1.65 quarter turns), see docs/move-cost-research.md for
 * the reasoning behind each one. Change them to match your own turning; left-handed solvers swap
 * R/L, U/U' and F/F'.
 */
import { type Move, countMoves, formatMove } from '../../core/cube';

// prettier-ignore
export const MOVE_COST: Record<string, number> = {
  R: 1.0, "R'": 1.0, R2: 1.6,   L: 1.1, "L'": 1.1, L2: 1.8,
  U: 1.1, "U'": 1.1, U2: 1.7,   D: 1.5, "D'": 1.6, D2: 2.6,
  F: 1.4, "F'": 1.3, F2: 2.6,   B: 2.2, "B'": 2.2, B2: 3.0,
  r: 1.1, "r'": 1.1, r2: 1.8,   l: 1.3, "l'": 1.3, l2: 2.0,
  u: 1.4, "u'": 1.5, u2: 2.2,   d: 2.0, "d'": 2.0, d2: 3.0,
  f: 1.7, "f'": 1.6, f2: 3.0,   b: 2.8, "b'": 2.8, b2: 3.4,
  M: 1.6, "M'": 1.3, M2: 2.1,   S: 1.6, "S'": 1.8, S2: 2.6,   E: 1.6, "E'": 1.6, E2: 2.6,
};
/** Anything not in the table. */
export const SLOW_MOVE_COST = 3.4;

/** Rotations cost nothing here (they are not turns); unlisted moves are the slowest tier. */
export const moveCost = (m: Move): number => ('xyz'.includes(m.base) ? 0 : (MOVE_COST[formatMove(m)] ?? SLOW_MOVE_COST));

/** Execution time of a sequence, in fast moves (R = 1). */
export const turnCost = (moves: readonly Move[]): number => Math.round(moves.reduce((a, m) => a + moveCost(m) * 10, 0)) / 10;

/**
 * What advanced F2L minimises: execution time (weighted moves; the solver always uses this) or the
 * plain move count (kept to compare against, see the tests).
 */
export type F2LMetric = 'time' | 'moves';

/**
 * The search's cost of a sequence, in whole tenths so sums compare exactly: execution time with
 * the move count to break ties, or the move count alone.
 */
export const metricCost = (metric: F2LMetric, moves: readonly Move[]): number =>
  metric === 'time' ? Math.round(turnCost(moves) * 10) * 100 + countMoves(moves) : countMoves(moves);
