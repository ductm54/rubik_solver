/** The five Phase 0 acceptance tests from the plan. */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CubeState,
  type EdgeSide,
  EDGE_SIDES,
  FACES,
  applyMoves,
  cloneState,
  randomMoves,
  solvedState,
  statesEqual,
  toColorArray,
} from '../src/core/cube';
import { assemble, scanOf } from '../src/core/orient';
import { generateScramble, initSolver } from '../src/core/scramble';
import { validate } from '../src/core/validate';

// Small deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const solved = solvedState();
const key = (s: CubeState) => toColorArray(s).join('');

beforeAll(() => initSolver(), 30_000);

describe('Phase 0', () => {
  it('1. solved cube validates and gives an empty scramble', () => {
    expect(validate(solved)).toMatchObject({ ok: true, errors: [] });
    expect(generateScramble(solved).scramble).toBe('');
  });

  it('2. 100 random scrambles round-trip', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const original = applyMoves(solved, randomMoves(25, rand));
      const { scramble, moveCount } = generateScramble(original);
      expect(moveCount).toBeLessThanOrEqual(22);
      expect(statesEqual(applyMoves(solved, scramble), original), `case ${i}: ${scramble}`).toBe(true);
    }
  }, 60_000);

  it('3. shuffled, randomly rotated faces assemble back to the original', () => {
    const rand = mulberry32(2);
    let unique = 0;
    for (let i = 0; i < 50; i++) {
      const original = applyMoves(solved, randomMoves(25, rand));
      const scans = FACES.map((f) => scanOf(original, f, Math.floor(rand() * 4)));
      scans.sort(() => rand() - 0.5);
      const { states, errors } = assemble(scans);
      expect(errors).toEqual([]);
      expect(states.map(key)).toContain(key(original));
      if (states.length === 1) unique++;
    }
    // Validity alone almost always pins down the one real cube.
    expect(unique).toBeGreaterThanOrEqual(45);
  }, 30_000); // about 5 s on a laptop, right at vitest's default limit

  describe('4. impossible cubes are rejected with a clear message', () => {
    const base = applyMoves(solved, "R U F' L2 D B");
    const at = (s: CubeState, face: keyof CubeState, i: number) => s[face][i];

    it('twisted corner', () => {
      const s = cloneState(base);
      // Cycle the three stickers of the URF corner (U9, R1, F3).
      const [u, r, f] = [at(s, 'U', 8), at(s, 'R', 0), at(s, 'F', 2)];
      s.U[8] = f;
      s.R[0] = u;
      s.F[2] = r;
      const v = validate(s);
      expect(v.ok).toBe(false);
      expect(v.errors.join(' ')).toMatch(/twist/i);
      expect(() => generateScramble(s)).toThrow(/twist/i);
    });

    it('flipped edge', () => {
      const s = cloneState(base);
      // Swap the two stickers of the UF edge (U8, F2).
      [s.U[7], s.F[1]] = [s.F[1], s.U[7]];
      const v = validate(s);
      expect(v.ok).toBe(false);
      expect(v.errors.join(' ')).toMatch(/flip/i);
    });

    it('swapped pair', () => {
      const s = cloneState(solved);
      // Swap the UF and UR edge pieces.
      [s.U[7], s.U[5]] = [s.U[5], s.U[7]];
      [s.F[1], s.R[1]] = [s.R[1], s.F[1]];
      const v = validate(s);
      expect(v.ok).toBe(false);
      expect(v.errors.join(' ')).toMatch(/parity|swapped/i);
    });

    it('wrong colour counts', () => {
      const s = cloneState(solved);
      s.U[0] = 'Y';
      expect(validate(s).errors.join(' ')).toMatch(/W appears 8 times/);
    });
  });

  it('5. neighbour strips on every face give one answer with no search', () => {
    const rand = mulberry32(3);
    let noSearch = 0;
    for (let i = 0; i < 200; i++) {
      const original = applyMoves(solved, randomMoves(25, rand));
      const scans = FACES.map((f) =>
        scanOf(original, f, Math.floor(rand() * 4), EDGE_SIDES[Math.floor(rand() * 4)] as EdgeSide),
      );
      scans.sort(() => rand() - 0.5);
      const { states, combinationsTried, errors } = assemble(scans);
      expect(errors).toEqual([]);
      expect(states.map(key)).toEqual([key(original)]);
      // A strip can match a wrong row by coincidence (~2% of cubes); then a handful of checks remain.
      expect(combinationsTried).toBeLessThanOrEqual(4);
      if (combinationsTried === 1) noSearch++;
    }
    expect(noSearch).toBeGreaterThanOrEqual(180);
  });
});
