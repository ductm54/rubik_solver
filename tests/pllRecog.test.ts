/** Two-side PLL recognition: every view is what it says, and its description is enough. */
import { expect, test } from 'vitest';
import { type Color, applyMovesToArray, invertAlg, parseAlg } from '../src/core/cube';
import { EN } from '../src/i18n/locales/en';
import { REFERENCE } from '../src/learn/algs';
import { PAIRS, PLL_RECOG, type RecogView, relation, sideKind } from '../src/learn/pllRecog';
import { cubie, pieceSolved } from '../src/solve/pieces';

const describe = (v: RecogView) => [v.front, v.right, ...v.compare.map((c) => `${c.pair}:${c.rel}`)];
/** Does view `w` fit the description of `v`? */
const fits = (v: RecogView, w: RecogView) =>
  w.front === v.front && w.right === v.right && v.compare.every((c) => relation(w.stickers[PAIRS[c.pair][0]], w.stickers[PAIRS[c.pair][1]]) === c.rel);

test('all 21 cases, at most four views each, 71 views in all', () => {
  expect(PLL_RECOG).toHaveLength(21);
  for (const c of PLL_RECOG) expect(c.views.length, c.id).toBeGreaterThanOrEqual(1);
  for (const c of PLL_RECOG) expect(c.views.length, c.id).toBeLessThanOrEqual(4);
  expect(PLL_RECOG.find((c) => c.id === 'H')!.views).toHaveLength(1);
  expect(PLL_RECOG.flatMap((c) => c.views)).toHaveLength(71);
});

test('each view is the case seen after its U turn, and that turn then the algorithm solves the cube', () => {
  const ALL = ['UF', 'UR', 'UB', 'UL', 'UFR', 'URB', 'UBL', 'ULF', 'FR', 'FL', 'BR', 'BL', 'DF', 'DR', 'DB', 'DL'];
  for (const c of PLL_RECOG) {
    const ref = REFERENCE.pll.find((r) => r.id === c.id)!;
    for (const v of c.views) {
      // Undo the pre-turn to get the state as seen: the view's stickers are on its front and right.
      const seen = applyMovesToArray(ref.stickers as Color[], invertAlg(parseAlg(v.pre)));
      expect([18, 19, 20, 9, 10, 11].map((i) => seen[i]), `${c.id} ${v.pre}`).toEqual(v.stickers);
      const done = applyMovesToArray(seen, `${v.pre} ${c.alg}`.trim());
      expect(ALL.every((n) => pieceSolved(done, cubie(n))), `${c.id} ${v.pre}`).toBe(true);
      expect(v.front).toBe(sideKind(v.stickers.slice(0, 3)));
      expect(v.right).toBe(sideKind(v.stickers.slice(3)));
    }
  }
});

test("each view's description fits no other view, of this case or any other", () => {
  const all = PLL_RECOG.flatMap((c) => c.views.map((v) => ({ id: c.id, v })));
  for (const a of all) {
    const others = all.filter((b) => b !== a && fits(a.v, b.v));
    expect(others.map((b) => b.id), `${a.id} ${describe(a.v).join(' ')}`).toEqual([]);
  }
  // At most two comparisons are ever needed.
  expect(Math.max(...all.map((a) => a.v.compare.length))).toBeLessThanOrEqual(2);
});

test('every word the chart uses has its text', () => {
  const has = (k: string) => k in EN;
  for (const v of PLL_RECOG.flatMap((c) => c.views)) {
    expect(has(`learn.pllRecog.kind.${v.front}`), v.front).toBe(true);
    expect(has(`learn.pllRecog.kind.${v.right}`), v.right).toBe(true);
    for (const c of v.compare) {
      expect(has(`learn.pllRecog.rel.${c.rel}`)).toBe(true);
      const [i, j] = PAIRS[c.pair];
      expect(has(`learn.pllRecog.pair.${i}${j}`) || (has(`learn.pllRecog.pos.${i}`) && has(`learn.pllRecog.pos.${j}`)), `${i}${j}`).toBe(true);
    }
  }
});
