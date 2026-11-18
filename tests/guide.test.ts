/** The beginner guide solver: the Learn tab's method, with its faster tricks layer by layer. */
import { describe, expect, it } from 'vitest';
import { type Color, applyMoves, applyMovesToArray, parseAlg, randomMoves, solvedState, toColorArray } from '../src/core/cube';
import { GUIDE, LAYERS, type Layer, solveFrom, solveGuide } from '../src/solve/beginner/guide';
import { getMethod } from '../src/solve/methods';
import { centerColor, cubie, pieceSolved } from '../src/solve/pieces';
import { EN } from '../src/i18n/locales/en';

const solved = solvedState();
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
const allSolved = (st: Color[]) => [0, 1, 2, 3, 4, 5].every((f) => st.slice(f * 9, f * 9 + 9).every((c) => c === st[f * 9 + 4]));
const COLORS: Color[] = ['W', 'Y', 'G', 'B', 'R', 'O'];
const scrambles = (n: number, seed: number) => {
  const rand = rng(seed);
  return Array.from({ length: n }, () => applyMoves(solved, randomMoves(25, rand)));
};

/** Every subset of the layers. */
const SUBSETS: Layer[][] = Array.from({ length: 16 }, (_, m) => LAYERS.filter((_, i) => m & (1 << i)));

describe('Beginner guide', () => {
  it('solves random cubes with every mix of faster tricks; each layer is finished in its stage', () => {
    const cubes = scrambles(48, 11);
    cubes.forEach((cube, n) => {
      const cross = COLORS[n % 6];
      const fast = SUBSETS[n % 16];
      const plan = solveGuide(cube, cross, fast);
      let st = toColorArray(cube);
      const last = new Map<string, Color[]>();
      for (const s of plan.steps) {
        st = applyMovesToArray(st, parseAlg(s.alg));
        expect(s.moves).toBe(parseAlg(s.alg).filter((m) => !'xyz'.includes(m.base)).length);
        last.set(s.stage, st);
        // No B turns: the guide turns the cube instead.
        expect(parseAlg(s.alg).some((m) => m.base === 'B' || m.base === 'b')).toBe(false);
      }
      expect(allSolved(st)).toBe(true);
      expect(plan.moves).toBe(plan.steps.reduce((a, s) => a + s.moves, 0));
      // The cross is built on top.
      const c = last.get('cross')!;
      expect(centerColor(c, 'U')).toBe(cross);
      expect(['UF', 'UR', 'UB', 'UL'].every((e) => pieceSolved(c, cubie(e)))).toBe(true);
      const l1 = last.get('corners')!;
      expect(centerColor(l1, 'D')).toBe(cross);
      expect(['DFR', 'DLF', 'DBL', 'DRB', 'DF', 'DR', 'DB', 'DL'].every((p) => pieceSolved(l1, cubie(p)))).toBe(true);
      const l2 = last.get('middle') ?? l1;
      expect(['FR', 'FL', 'BL', 'BR', 'DFR', 'DLF', 'DBL', 'DRB'].every((p) => pieceSolved(l2, cubie(p)))).toBe(true);
    });
  }, 60000);

  it('without tricks uses only the guide\'s moves; each trick only in its own layer', () => {
    const fasterName = EN['gd.faster'];
    for (const cube of scrambles(12, 5)) {
      for (const s of solveGuide(cube, 'W').steps) {
        expect(s.caseName ?? '').not.toContain(fasterName);
        expect(s.alg).not.toMatch(/\bf\b|R2 U2 R2/);
      }
      for (const layer of LAYERS) {
        const stages = { cross: ['cross'], corners: ['corners'], middle: ['middle'], last: ['top'] }[layer];
        for (const s of solveGuide(cube, 'W', [layer]).steps)
          if ((s.caseName ?? '').includes(fasterName) || /\bf\b/.test(s.alg)) expect(stages).toContain(s.stage);
      }
    }
  }, 60000);

  it('the tricks get used, and make solves shorter', () => {
    const cubes = scrambles(30, 23);
    let plain = 0;
    let fast = 0;
    const used = new Set<string>();
    for (const cube of cubes) {
      plain += solveGuide(cube, 'W').moves;
      const p = solveGuide(cube, 'W', LAYERS);
      fast += p.moves;
      for (const s of p.steps) if ((s.caseName ?? '').includes(EN['gd.faster'])) used.add(s.stage);
    }
    expect(fast).toBeLessThan(plain);
    for (const stage of ['cross', 'corners', 'top']) expect(used).toContain(stage);
  }, 60000);

  it('the swap trick: two right middle edges swapped go in with R2 U2 R2 U2 R2', () => {
    // White cross on top, then the cube turned over: the setup swaps the two right middle edges.
    const cube = applyMoves(solved, 'R2 U2 R2 U2 R2');
    const plan = solveGuide(cube, 'Y', ['middle']);
    expect(plan.steps.filter((s) => s.stage === 'middle').map((s) => s.alg.replace(/^y\S* /, ''))).toContain('R2 U2 R2 U2 R2');
  });

  it('the flip trick: a middle edge flipped in its slot is fixed in one step', () => {
    // Two edges flipped (one alone can not happen): one in the middle layer, one on the yellow side.
    const st = toColorArray(solved);
    for (const e of ['FR', 'DF']) {
      const [a, b] = cubie(e);
      [st[a], st[b]] = [st[b], st[a]];
    }
    const cube = { U: st.slice(0, 9), R: st.slice(9, 18), F: st.slice(18, 27), D: st.slice(27, 36), L: st.slice(36, 45), B: st.slice(45, 54) } as never;
    const middle = (layers: Layer[]) => solveGuide(cube, 'W', layers).steps.filter((s) => s.stage === 'middle');
    const sum = (steps: { moves: number }[]) => steps.reduce((a, s) => a + s.moves, 0);
    expect(sum(middle(['middle']))).toBe(11);
    expect(sum(middle([]))).toBeGreaterThan(11);
    const fast = solveGuide(cube, 'W', ['middle']);
    expect(fast.steps.some((s) => s.stage === 'middle' && s.caseName === EN['gd.middle.flip'])).toBe(true);
  });

  it('the corner tricks never cost moves: step moves as shown, plus ~9 per middle edge left', () => {
    const middleLeft = (st: Color[]) => ['FR', 'FL', 'BR', 'BL'].filter((p) => !pieceSolved(st, cubie(p))).length;
    const score = (st: Color[], fast: Layer[]) => {
      let moves = 0;
      for (const s of solveFrom(st, '', 'W', new Set(fast))) {
        if (s.stage === 'middle' || s.stage === 'top') break;
        st = applyMovesToArray(st, parseAlg(s.alg));
        if (s.stage === 'corners') moves += s.moves;
      }
      return moves + 9 * middleLeft(st);
    };
    for (const cube of scrambles(40, 31)) {
      const st = toColorArray(cube);
      expect(score(st, ['corners'])).toBeLessThanOrEqual(score(st, []));
    }
  }, 60000);

  it('is in the method registry, with an empty set of tricks by default, and handles a solved cube', () => {
    expect(getMethod('guide')).toBe(GUIDE);
    expect(GUIDE.defaults.faster).toEqual([]);
    expect(GUIDE.solve(solved, GUIDE.defaults).moves).toBe(0);
    expect(GUIDE.solve(solved, { crossColor: 'G', faster: ['cross', 'bogus'] }).moves).toBe(0);
    for (const l of LAYERS) expect(`set.guide.faster.${l}` in EN).toBe(true);
  });

  it('is fast', () => {
    const cubes = scrambles(5, 3);
    const t = performance.now();
    for (const c of cubes) GUIDE.solve(c, { crossColor: 'W', faster: LAYERS });
    expect((performance.now() - t) / 5).toBeLessThan(1500);
  });
});
