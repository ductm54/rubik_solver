import { describe, expect, it } from 'vitest';
import { applyMoves, applyMovesToArray, parseAlg, randomMoves, solvedState, statesEqual, toColorArray, type Color } from '../src/core/cube';
import { BEGINNER, solveBeginner, unflip } from '../src/solve/beginner';
import { getMethod } from '../src/solve/methods';
import { EN } from '../src/i18n/locales/en';
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
      // The cross is built with the cross colour on top, then the cube is turned over (x2).
      const over = plan.steps.map((s) => s.stage).lastIndexOf('cross');
      expect(over).toBeGreaterThan(0);
      expect(plan.steps[over].alg).toBe('x2');
      for (const [i, s] of plan.steps.entries()) {
        if (i === over) {
          expect(centerColor(st, 'U')).toBe(cross);
          expect(['UF', 'UR', 'UB', 'UL'].every((e) => pieceSolved(st, cubie(e)))).toBe(true);
        }
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
      // Beginners turn the cube instead of turning B: no B turn anywhere.
      for (const s of plan.steps) expect(parseAlg(s.alg).some((m) => m.base === 'B')).toBe(false);
    }
  });

  it('reads moves worked out in the z2 view back in the real hold', () => {
    const rand = rng(11);
    for (let n = 0; n < 20; n++) {
      const st = toColorArray(applyMoves(solved, randomMoves(20, rand)));
      const alg = parseAlg("R U' F2 D L' x y' z2 B");
      expect(applyMovesToArray(st, unflip(alg))).toEqual(applyMovesToArray(applyMovesToArray(applyMovesToArray(st, 'z2'), alg), 'z2'));
    }
  });

  it('puts first-layer corners in with either hand, whichever is shorter', () => {
    const rand = rng(5);
    let left = 0;
    let right = 0;
    for (let n = 0; n < 20; n++) {
      const plan = solveBeginner(applyMoves(solved, randomMoves(25, rand)), 'W');
      for (const s of plan.steps.filter((s) => s.stage === 'corners' && s.moves)) {
        if (s.alg.includes("L' U' L U")) left++;
        if (s.alg.includes("R U R' U'")) right++;
      }
    }
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it('a corner twisted in its own slot: no U turn, and the hint does not ask for one', () => {
    const rand = rng(9);
    let seen = 0;
    for (let n = 0; n < 40; n++) {
      const plan = solveBeginner(applyMoves(solved, randomMoves(25, rand)), 'W');
      for (const s of plan.steps.filter((s) => s.stage === 'corners' && s.caseName === EN['beg.cornerTwisted'])) {
        seen++;
        // Only a cube turn (y) before the 4-moves: no U to set the corner up.
        expect(s.alg.replace(/^y\S* /, '')).toMatch(/^(R U R' U'|L' U' L U)/);
        expect(s.hint).toMatch(/^The corner is already in the .* slot, only twisted/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  describe('faster first-layer corners', () => {
    const faster = (cube: ReturnType<typeof applyMoves>, cross: Color = 'W') => solveBeginner(cube, cross, { corners: 'faster' });
    const cornerMoves = (p: ReturnType<typeof solveBeginner>) => p.steps.filter((s) => s.stage === 'corners').reduce((a, s) => a + s.moves, 0);

    it('solves random cubes with the first layer done after the corners, never more corner moves than Standard', () => {
      const rand = rng(13);
      let fewer = 0;
      for (let n = 0; n < 60; n++) {
        const cube = applyMoves(solved, randomMoves(25, rand));
        const cross = (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[])[n % 6];
        const plan = faster(cube, cross);
        let st = toColorArray(cube);
        let l1: Color[] | null = null;
        for (const s of plan.steps) {
          st = applyMovesToArray(st, parseAlg(s.alg));
          if (s.stage === 'corners') l1 = st;
        }
        expect(allSolved(st)).toBe(true);
        if (l1) expect(['DFR', 'DLF', 'DBL', 'DRB', 'DF', 'DR', 'DB', 'DL'].every((p) => pieceSolved(l1!, cubie(p)))).toBe(true);
        const std = solveBeginner(cube, cross);
        if (cornerMoves(plan) < cornerMoves(std)) fewer++;
      }
      expect(fewer).toBeGreaterThan(10);
    });

    it('uses the shortcuts: one set less on top, a stuck corner out with the left hand, a solved middle edge kept', () => {
      const rand = rng(21);
      const seen = new Set<string>();
      for (let n = 0; n < 150 && seen.size < 3; n++) {
        const plan = faster(applyMoves(solved, randomMoves(25, rand)));
        for (const s of plan.steps.filter((s) => s.stage === 'corners')) {
          if (s.alg.includes("R U2 R' U' R U R' U'") || s.alg.includes("L' U2 L U L' U' L U")) seen.add('up');
          if (s.caseName === EN['beg.cornerElsewhereLeft']) seen.add('left');
          if (s.caseName === EN['beg.cornerKeep']) seen.add('keep');
        }
      }
      expect([...seen].sort()).toEqual(['keep', 'left', 'up']);
    });

    it('a kept middle edge stays solved', () => {
      const rand = rng(17);
      let seen = 0;
      for (let n = 0; n < 150 && seen < 5; n++) {
        const cube = applyMoves(solved, randomMoves(25, rand));
        const plan = faster(cube);
        let st = toColorArray(cube);
        for (const s of plan.steps) {
          const before = ['FR', 'FL', 'BL', 'BR'].filter((e) => pieceSolved(st, cubie(e))).length;
          st = applyMovesToArray(st, parseAlg(s.alg));
          if (s.caseName === EN['beg.cornerKeep']) {
            seen++;
            expect(['FR', 'FL', 'BL', 'BR'].filter((e) => pieceSolved(st, cubie(e))).length).toBeGreaterThanOrEqual(before);
          }
        }
      }
      expect(seen).toBeGreaterThan(0);
    });

    it('is a setting of the method, Standard by default', () => {
      expect(BEGINNER.defaults.corners).toBe('standard');
      const cube = applyMoves(solved, randomMoves(25, rng(4)));
      expect(BEGINNER.solve(cube, { ...BEGINNER.defaults, corners: 'faster' }).steps).toEqual(faster(cube).steps);
      expect(BEGINNER.solve(cube, BEGINNER.defaults).steps).toEqual(solveBeginner(cube, 'W').steps);
    });
  });

  describe('faster last layer', () => {
    const ALL = { corners: 'faster', topCross: 'faster', topEdges: 'faster', topCorners: 'faster', cornerTwist: 'faster' } as const;

    it('solves random cubes with every Faster setting, using each shortcut', () => {
      const rand = rng(31);
      const seen = new Set<string>();
      for (let n = 0; n < 80; n++) {
        const cube = applyMoves(solved, randomMoves(25, rand));
        const cross = (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[])[n % 6];
        const plan = solveBeginner(cube, cross, ALL);
        let st = toColorArray(cube);
        for (const s of plan.steps) {
          st = applyMovesToArray(st, parseAlg(s.alg));
          expect(s.moves).toBe(parseAlg(s.alg).filter((m) => !'xyz'.includes(m.base)).length);
          const fast = [EN['beg.LFast'], EN['beg.oppositeFast'], EN['beg.otherWay']].includes(s.caseName ?? '');
          if (fast) expect(['FR', 'FL', 'BL', 'BR', 'DFR', 'DLF', 'DBL', 'DRB', 'DF', 'DR', 'DB', 'DL'].every((p) => pieceSolved(st, cubie(p)))).toBe(true);
          if (s.caseName === EN['beg.LFast']) {
            seen.add('cross');
            expect(['UF', 'UR', 'UB', 'UL'].every((e) => st[cubie(e)[0]] === centerColor(st, 'U'))).toBe(true);
          }
          if (s.caseName === EN['beg.oppositeFast']) {
            seen.add('edges');
            expect(['UF', 'UR', 'UB', 'UL'].every((e) => [0, 1, 2, 3].some((k) => pieceSolved(applyMovesToArray(st, ['', 'U', 'U2', "U'"][k]), cubie(e))))).toBe(true);
          }
          if (s.caseName === EN['beg.otherWay']) {
            seen.add('corners');
            expect(['UFR', 'URB', 'UBL', 'ULF'].every((c) => cubie(c).map((i) => st[i]).sort().join('') === [...c].map((f) => centerColor(st, f as never)).sort().join(''))).toBe(true);
          }
        }
        expect(allSolved(st)).toBe(true);
      }
      expect([...seen].sort()).toEqual(['corners', 'cross', 'edges']);
    });

    it('top cross and top corners on their own: fewer moves on average than Standard', () => {
      const rand = rng(37);
      for (const key of ['topCross', 'topCorners'] as const) {
        let std = 0;
        let fast = 0;
        for (let n = 0; n < 40; n++) {
          const cube = applyMoves(solved, randomMoves(25, rand));
          // One solve can come out longer: a shortcut leaves a different (luckier or not) next case.
          std += solveBeginner(cube, 'W').moves;
          fast += solveBeginner(cube, 'W', { [key]: 'faster' }).moves;
        }
        expect(fast, key).toBeLessThan(std);
      }
    });

    it('top edges on its own: two opposite edges never take two looks', () => {
      const rand = rng(41);
      let seen = 0;
      for (let n = 0; n < 60; n++) {
        const plan = solveBeginner(applyMoves(solved, randomMoves(25, rand)), 'W', { topEdges: 'faster' });
        expect(plan.steps.some((s) => s.caseName === EN['beg.oppositeFirst'])).toBe(false);
        seen += plan.steps.filter((s) => s.caseName === EN['beg.oppositeFast']).length;
      }
      expect(seen).toBeGreaterThan(0);
    });

    it('corner twist on its own: never four R\' D\' R D, never more moves', () => {
      const rand = rng(43);
      let seen = 0;
      for (let n = 0; n < 40; n++) {
        const cube = applyMoves(solved, randomMoves(25, rand));
        const std = solveBeginner(cube, 'W');
        const fast = solveBeginner(cube, 'W', { cornerTwist: 'faster' });
        // The saved moves can make another hold the shortest, so compare totals, not steps.
        for (const st of fast.steps) expect(st.alg.includes("R' D' R D R' D' R D R' D' R D R' D' R D")).toBe(false);
        seen += fast.steps.filter((st) => st.alg.includes("D' R' D R D' R' D R")).length;
        expect(fast.moves).toBeLessThanOrEqual(std.moves);
      }
      expect(seen).toBeGreaterThan(0);
    });

    it('are four settings, Standard by default', () => {
      for (const k of ['topCross', 'topEdges', 'topCorners', 'cornerTwist']) {
        expect(BEGINNER.defaults[k]).toBe('standard');
        expect(BEGINNER.settings.find((d) => d.key === k)!.options.map((o) => o.value)).toEqual(['standard', 'faster']);
      }
    });
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
