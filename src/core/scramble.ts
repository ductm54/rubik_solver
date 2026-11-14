/**
 * Scramble generation: solve the state with Kociemba's two-phase algorithm, then invert the
 * solution. Applying the scramble to a solved cube reproduces the input state.
 */
import Cube from 'cubejs';
import {
  type Color,
  type CubeState,
  type FaceName,
  STANDARD_SCHEME,
  applyMoves,
  formatAlg,
  fromFacelets,
  invertAlg,
  parseAlg,
  solvedState,
  statesEqual,
  toFacelets,
} from './cube';
import { validate } from './validate';

let initialised = false;

/** Build the solver's lookup tables (about 1–2 s). Called automatically on first use. */
export function initSolver(): void {
  if (initialised) return;
  Cube.initSolver();
  initialised = true;
}

export interface ScrambleResult {
  /** WCA notation, white top / green front. Empty for a solved cube. */
  scramble: string;
  /** The solution the solver found (the scramble's inverse). */
  solution: string;
  moveCount: number;
}

/**
 * Generate a scramble that takes a solved cube (in the state's own colour scheme) to `state`.
 * Throws with readable messages if the state is not a valid cube.
 */
export function generateScramble(state: CubeState): ScrambleResult {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));

  const facelets = toFacelets(state);
  const scheme = Object.fromEntries((['U', 'R', 'F', 'D', 'L', 'B'] as FaceName[]).map((f) => [f, state[f][4]])) as Record<FaceName, Color>;
  const solved = solvedState(scheme);

  if (statesEqual(state, solved)) return { scramble: '', solution: '', moveCount: 0 };

  initSolver();
  const solution = Cube.fromString(facelets).solve().trim();
  const scrambleMoves = invertAlg(parseAlg(solution));
  const scramble = formatAlg(scrambleMoves);

  // Self-check: the scramble must rebuild the scanned state from solved.
  if (!statesEqual(applyMoves(solved, scrambleMoves), state)) {
    throw new Error('Internal error: generated scramble does not reproduce the cube');
  }
  return { scramble, solution, moveCount: scrambleMoves.length };
}

/**
 * Random-state scramble (as WCA scramblers do): a uniformly random reachable cube, then the
 * scramble that produces it. Every scramble is about 18-21 moves.
 */
export function randomStateScramble(): ScrambleResult {
  initSolver();
  for (;;) {
    const state = fromFacelets(Cube.random().asString());
    const r = generateScramble(state);
    if (r.moveCount >= 15) return r; // skip the astronomically rare near-solved states
  }
}

export { STANDARD_SCHEME };
