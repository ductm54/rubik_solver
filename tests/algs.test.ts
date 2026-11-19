/** The Algorithms tab: every case is what its set says, and its algorithms solve it. */
import { describe, expect, test } from 'vitest';
import { applyMovesToArray, solvedState, toColorArray } from '../src/core/cube';
import { HOLD } from '../src/learn/beginner';
import { ALG_SETS, EO_CASES, GROUPS, REFERENCE } from '../src/learn/algs';
import { EN } from '../src/i18n/locales/en';
import { F2L_CASES } from '../src/solve/cfop/algs/f2l';
import { centerColor, cubie, pieceSolved } from '../src/solve/pieces';

const HELD = applyMovesToArray(toColorArray(solvedState()), HOLD);
const start = (setup: string) => applyMovesToArray(HELD, setup);
const F2L = ['DF', 'DR', 'DB', 'DL', 'DFR', 'DRB', 'DBL', 'DLF', 'FR', 'FL', 'BR', 'BL'];
const f2lDone = (st: string[]) => F2L.every((n) => pieceSolved(st as never, cubie(n)));
const llOriented = (st: string[]) => [0, 1, 2, 3, 5, 6, 7, 8].every((i) => st[i] === 'Y');
const same = (a: string[], b: string[]) => a.every((c, i) => c === b[i]);

test('every set is full', () => {
  expect(REFERENCE.f2l).toHaveLength(41);
  expect(REFERENCE.oll).toHaveLength(57);
  expect(REFERENCE.pll).toHaveLength(21);
  expect(REFERENCE.oll.filter((c) => c.twoLook)).toHaveLength(7);
  expect(REFERENCE.pll.filter((c) => c.twoLook)).toHaveLength(6);
});

test('every group and set has a name', () => {
  for (const set of ALG_SETS) {
    expect(EN[`algs.set.${set}` as keyof typeof EN]).toBeTruthy();
    for (const g of [...GROUPS[set], 'eo']) expect(EN[`algs.group.${g}` as keyof typeof EN], g).toBeTruthy();
  }
});

describe('F2L', () => {
  for (const c of REFERENCE.f2l) {
    test(`case ${c.id}: only the front-right pair is out, and every algorithm puts it in`, () => {
      const st = start(c.setup);
      expect(centerColor(st, 'U')).toBe('Y');
      expect(centerColor(st, 'F')).toBe('B');
      expect(f2lDone(st)).toBe(false);
      expect(['DF', 'DR', 'DB', 'DL', 'DRB', 'DBL', 'DLF', 'FL', 'BR', 'BL'].every((n) => pieceSolved(st, cubie(n)))).toBe(true);
      for (const alg of c.algs) {
        const end = applyMovesToArray(st, alg);
        // An algorithm may end with the cube turned (y); F2L done is checked whatever the turn.
        const turned = ['', 'y', 'y2', "y'"].map((y) => applyMovesToArray(end, y));
        expect(turned.some((s) => centerColor(s, 'F') === 'B' && f2lDone(s)), alg).toBe(true);
      }
    });
    test(`case ${c.id}, front-left: only that pair is out, and the algorithms put it in`, () => {
      expect(c.left).toEqual(F2L_CASES.find((k) => k.id === c.id)!.FL);
      c.left!.forEach((alg, i) => {
        const st = start(c.leftSetups![i]);
        expect(centerColor(st, 'F')).toBe('B');
        expect(['DF', 'DR', 'DB', 'DL', 'DFR', 'DRB', 'DBL', 'FR', 'BR', 'BL'].every((n) => pieceSolved(st, cubie(n))), alg).toBe(true);
        expect(f2lDone(st)).toBe(false);
        const end = applyMovesToArray(st, alg);
        const turned = ['', 'y', 'y2', "y'"].map((y) => applyMovesToArray(end, y));
        expect(turned.some((s) => centerColor(s, 'F') === 'B' && f2lDone(s)), alg).toBe(true);
      });
    });
  }
});

describe('OLL', () => {
  for (const c of REFERENCE.oll) {
    test(`OLL ${c.id}: F2L done, top not oriented, then oriented`, () => {
      const st = start(c.setup);
      expect(centerColor(st, 'U')).toBe('Y');
      expect(f2lDone(st)).toBe(true);
      expect(llOriented(st)).toBe(false);
      expect(same(applyMovesToArray(st, c.algs[0]), HELD)).toBe(true);
      expect(c.stickers.filter((s) => s === 'Y')).toHaveLength(9);
    });
  }
  for (const c of EO_CASES) {
    test(`edges first: ${c.id}`, () => {
      const st = start(c.setup);
      expect(f2lDone(st)).toBe(true);
      expect(same(applyMovesToArray(st, c.algs[0]), HELD)).toBe(true);
    });
  }
});

/** How many top-layer pieces each PLL moves: [corners, edges]. */
const MOVES: Record<string, [number, number]> = {
  Ua: [0, 3], Ub: [0, 3], H: [0, 4], Z: [0, 4], Aa: [3, 0], Ab: [3, 0], E: [4, 0],
  T: [2, 2], F: [2, 2], Ja: [2, 2], Jb: [2, 2], Ra: [2, 2], Rb: [2, 2],
  Ga: [2, 4], Gb: [2, 4], Gc: [2, 4], Gd: [2, 4], Y: [2, 2], V: [2, 2], Na: [2, 2], Nb: [2, 2],
};

describe('PLL', () => {
  test('arrows only on the pieces each case moves', () => {
    for (const c of REFERENCE.pll) {
      const corners = c.arrows!.filter(([from]) => from % 2 === 0).length;
      expect([corners, c.arrows!.length - corners], c.id).toEqual(MOVES[c.id]);
    }
  });
  for (const c of REFERENCE.pll) {
    test(`${c.id}-perm: top oriented, not solved, arrows match the pieces that move`, () => {
      const st = start(c.setup);
      expect(centerColor(st, 'U')).toBe('Y');
      expect(f2lDone(st)).toBe(true);
      expect(llOriented(st)).toBe(true);
      expect(same(st, HELD)).toBe(false);
      expect(same(applyMovesToArray(st, c.algs[0]), HELD)).toBe(true);
      expect(c.arrows!.length).toBeGreaterThanOrEqual(2);
    });
  }
});
