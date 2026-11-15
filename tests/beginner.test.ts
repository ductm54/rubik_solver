import { describe, expect, it } from 'vitest';
import { applyMoves, applyMovesToArray, parseAlg, randomMoves, solvedState, statesEqual, toColorArray, type Color } from '../src/core/cube';
import { BEGINNER, solveBeginner } from '../src/solve/beginner';
import { getMethod } from '../src/solve/methods';
import { centerColor, cubie, pieceSolved } from '../src/solve/pieces';

const solved = solvedState();

/** Deterministic random numbers, so a failure can be repeated. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/** The cube is solved in some orientation: every face one colour. */
const allSolved = (st: Color[]) => [0, 1, 2, 3, 4, 5].every((f) => st.slice(f * 9, f * 9 + 9).every((c) => c === st[f * 9 + 4]));

describe('Beginner method', () => {
  it('solves random cubes; each stage finishes its layer and keeps the ones before', () => {
    const rand = rng(7);
    for (let n = 0; n < 60; n++) {
      const cube = applyMoves(solved, randomMoves(25, rand));
      const cross = (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[])[n % 6];
      const plan = solveBeginner(cube, cross);
      let st = toColorArray(cube);
      const last = new Map<string, Color[]>();
      for (const s of plan.steps) {
        st = applyMovesToArray(st, parseAlg(s.alg));
        expect(s.moves).toBe(parseAlg(s.alg).filter((m) => !'xyz'.includes(m.base)).length);
        last.set(s.stage, st);
      }
      expect(allSolved(st)).toBe(true);
      expect(plan.moves).toBe(plan.steps.reduce((a, s) => a + s.moves, 0));
      // After the cross stage: cross colour on the bottom, the 4 edges in place.
      const c = last.get('cross')!;
      expect(centerColor(c, 'D')).toBe(cross);
      expect(['DF', 'DR', 'DB', 'DL'].every((e) => pieceSolved(c, cubie(e)))).toBe(true);
      const l1 = last.get('corners') ?? c;
      expect(['DFR', 'DLF', 'DBL', 'DRB', 'DF', 'DR', 'DB', 'DL'].every((p) => pieceSolved(l1, cubie(p)))).toBe(true);
      const l2 = last.get('middle') ?? l1;
      expect(['FR', 'FL', 'BL', 'BR', 'DFR', 'DLF', 'DBL', 'DRB'].every((p) => pieceSolved(l2, cubie(p)))).toBe(true);
      // Only the algorithms the method teaches (plus U turns, cube turns and the cross).
      for (const s of plan.steps) if (s.stage === 'top') expect(s.alg).not.toMatch(/\bB\b/);
    }
  });

  it('works through the method registry and handles a solved cube', () => {
    expect(getMethod('beginner')).toBe(BEGINNER);
    const plan = BEGINNER.solve(solved, BEGINNER.defaults);
    expect(plan.moves).toBe(0);
    expect(statesEqual(solved, solved)).toBe(true);
  });

  it('is fast', () => {
    const rand = rng(3);
    const cube = applyMoves(solved, randomMoves(25, rand));
    BEGINNER.solve(cube, BEGINNER.defaults);
    const t = performance.now();
    for (let i = 0; i < 5; i++) BEGINNER.solve(applyMoves(solved, randomMoves(25, rand)), BEGINNER.defaults);
    expect((performance.now() - t) / 5).toBeLessThan(1000);
  });
});
