import { describe, expect, it } from 'vitest';
import {
  applyMoves,
  applyMovesToArray,
  fromColorArray,
  invertAlg,
  parseAlg,
  randomMoves,
  solvedState,
  statesEqual,
  toColorArray,
} from '../src/core/cube';
import { CPLL, EPLL, PLL } from '../src/solve/cfop/algs/pll';
import { EO, OCLL, OLL, type AlgEntry } from '../src/solve/cfop/algs/oll';
import { CFOP, solveCfop } from '../src/solve/cfop';
import { crossSolved, f2lTable, slotSolved, SLOTS } from '../src/solve/cfop/f2l';
import { buildTable, matchLL, stageDone } from '../src/solve/cfop/ll';

const solved = solvedState();
const solvedArr = toColorArray(solved);
const eq = (a: string, b: string) => statesEqual(applyMoves(solved, a), applyMoves(solved, b));
const f2lDone = (st: ReturnType<typeof toColorArray>) => crossSolved(st) && SLOTS.every((s) => slotSolved(st, s));
/** Centers back in place too (no net rotation). */
const centersHome = (st: ReturnType<typeof toColorArray>) => [0, 1, 2, 3, 4, 5].every((f) => st[f * 9 + 4] === solvedArr[f * 9 + 4]);

describe('extended notation', () => {
  it('wide and slice moves', () => {
    expect(eq('r', "R M'")).toBe(true);
    expect(eq('Rw', 'r')).toBe(true);
    expect(eq('u', "U E'")).toBe(true);
    expect(eq('f', 'F S')).toBe(true);
    expect(eq('x', "r L'")).toBe(true);
    expect(eq('M M M M', '')).toBe(true);
    expect(eq('(R U R’ U’)', "R U R' U'")).toBe(true);
  });
});

function checkAlgs(entries: AlgEntry[], what: 'orient' | 'perm' | 'any') {
  for (const e of entries) {
    const x = applyMovesToArray(solvedArr, invertAlg(parseAlg(e.alg)));
    expect(f2lDone(x), `${e.name} keeps F2L`).toBe(true);
    expect(centersHome(x), `${e.name} keeps centers`).toBe(true);
    if (what === 'perm') expect(stageDone(x, 'orient'), `${e.name} keeps orientation`).toBe(true);
  }
}

describe('last-layer algorithm tables', () => {
  it('every algorithm keeps F2L and centers', () => {
    checkAlgs(OLL, 'any');
    checkAlgs(EO, 'any');
    checkAlgs(OCLL, 'any');
    checkAlgs(PLL, 'perm');
    checkAlgs(CPLL, 'perm');
    checkAlgs(EPLL, 'perm');
  });

  it('EO algorithms leave edges oriented; OCLL / CPLL / EPLL only touch their pieces', () => {
    for (const e of EO) expect(stageDone(applyMovesToArray(solvedArr, invertAlg(parseAlg(e.alg))), 'orientEdges')).toBe(false);
    for (const e of OCLL) expect(stageDone(applyMovesToArray(solvedArr, invertAlg(parseAlg(e.alg))), 'orientEdges'), e.name).toBe(true);
  });

  /** Distinct cases up to a U turn. */
  const distinct = (entries: AlgEntry[], kind: 'orient' | 'perm' | 'orientEdges' | 'permCorners') => {
    const t = buildTable(entries, kind, kind === 'perm');
    const seen = new Map<string, string>();
    for (const [k, list] of t.cases) for (const c of list) seen.set(c.entry.id, seen.get(c.entry.id) ?? k);
    // Two entries are the same case if any of their keys coincide (after a U turn).
    const ids = entries.map((e) => e.id);
    const clash: string[] = [];
    for (const [, list] of t.cases) {
      const u = [...new Set(list.map((c) => c.entry.id))];
      if (u.length > 1) clash.push(u.join('='));
    }
    return { count: ids.length, clash };
  };

  it('57 different OLL cases and 21 different PLL cases', () => {
    expect(distinct(OLL, 'orient').clash).toEqual([]);
    expect(distinct(PLL, 'perm').clash).toEqual([]);
    expect(distinct(EO, 'orientEdges').clash).toEqual([]);
    expect(distinct(OCLL, 'orient').clash).toEqual([]);
    expect(distinct(EPLL, 'perm').clash).toEqual([]);
  });

  it('recognises every last-layer state', () => {
    // Random LL states: random sequences of table algorithms and U turns, from solved.
    const all = [...OLL, ...PLL].map((e) => parseAlg(e.alg));
    const tables = {
      oll: buildTable(OLL, 'orient', false),
      eo: buildTable(EO, 'orientEdges', false),
      ocll: buildTable(OCLL, 'orient', false),
      pll: buildTable(PLL, 'perm', true),
      cpll: buildTable(CPLL, 'permCorners', false),
      epll: buildTable(EPLL, 'perm', true),
    };
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ollSeen = new Set<string>();
    for (let n = 0; n < 1500; n++) {
      let st = solvedArr;
      for (let k = 0; k < 4; k++) {
        st = applyMovesToArray(st, all[Math.floor(rand() * all.length)]);
        st = applyMovesToArray(st, randomMoves(1).filter(() => false).concat(parseAlg(['', 'U', 'U2', "U'"][Math.floor(rand() * 4)])));
      }
      // Full OLL then full PLL.
      const o = matchLL(st, tables.oll)!;
      expect(o, 'OLL matched').not.toBeNull();
      if (o.entry) ollSeen.add(o.entry.id);
      const a = applyMovesToArray(st, o.moves);
      expect(stageDone(a, 'orient')).toBe(true);
      const p = matchLL(a, tables.pll)!;
      expect(p, 'PLL matched').not.toBeNull();
      expect(statesEqual(fromColorArray(applyMovesToArray(a, p.moves)), solved)).toBe(true);
      // 2-look.
      const e1 = matchLL(st, tables.eo)!;
      const b = applyMovesToArray(st, e1.moves);
      expect(stageDone(b, 'orientEdges')).toBe(true);
      const c1 = matchLL(b, tables.ocll)!;
      const c = applyMovesToArray(b, c1.moves);
      expect(stageDone(c, 'orient')).toBe(true);
      const p1 = matchLL(c, tables.cpll)!;
      const d = applyMovesToArray(c, p1.moves);
      expect(stageDone(d, 'permCorners')).toBe(true);
      const p2 = matchLL(d, tables.epll)!;
      expect(statesEqual(fromColorArray(applyMovesToArray(d, p2.moves)), solved)).toBe(true);
    }
    expect(ollSeen.size).toBe(57);
  });
});

describe('F2L', () => {
  it('has an algorithm for all 150 places of a pair, each keeping cross and other slots', () => {
    const t = f2lTable();
    expect(t.size).toBe(150);
    for (const { alg } of t.values()) {
      const x = applyMovesToArray(solvedArr, invertAlg(alg));
      expect(crossSolved(x) && ['FL', 'BL', 'BR'].every((s) => slotSolved(x, s as 'FL'))).toBe(true);
      expect(centersHome(x)).toBe(true);
    }
    expect(Math.max(...[...t.values()].map((v) => v.moves))).toBeLessThanOrEqual(11);
  });
});

describe('CFOP solver', () => {
  const modes = [
    { oll: '2look', pll: '2look' },
    { oll: 'full', pll: 'full' },
    { oll: '2look', pll: 'full' },
  ] as const;

  it('solves random cubes, every step does its stage', () => {
    let total = 0;
    let count = 0;
    for (let n = 0; n < 150; n++) {
      const state = applyMoves(solved, randomMoves(25));
      const mode = modes[n % 3];
      const plan = solveCfop(state, { crossColors: ['W'], ...mode });
      let st = state;
      for (const step of plan.steps) st = applyMoves(st, step.alg);
      // Solved in whatever orientation the solve ended in: every face one colour.
      const arr = toColorArray(st);
      expect([0, 1, 2, 3, 4, 5].every((f) => arr.slice(f * 9, f * 9 + 9).every((c) => c === arr[f * 9 + 4]))).toBe(true);
      const stages = plan.steps.map((s) => s.stage);
      expect(stages.filter((s) => s === 'cross').length).toBe(1);
      expect(stages.filter((s) => s === 'f2l').length).toBe(4);
      expect(stages.filter((s) => s === 'oll').length).toBe(mode.oll === 'full' ? 1 : 2);
      expect(stages.filter((s) => s === 'pll').length).toBe(mode.pll === 'full' ? 1 : 2);
      expect(plan.steps[0].stage).toBe('inspection');
      expect(plan.steps[0].moves).toBe(0);
      expect(plan.steps[1].title).toContain('white');
      if (mode.oll === 'full') {
        total += plan.moves;
        count++;
      }
    }
    expect(total / count).toBeLessThan(75);
  });

  it('more cross colours never make the solve longer', () => {
    for (let n = 0; n < 20; n++) {
      const state = applyMoves(solved, randomMoves(25));
      const one = solveCfop(state, { crossColors: ['W'], oll: 'full', pll: 'full' });
      const all = solveCfop(state, { crossColors: ['W', 'Y', 'G', 'B', 'R', 'O'], oll: 'full', pll: 'full' });
      expect(all.moves).toBeLessThanOrEqual(one.moves);
    }
  });

  it('works through the method interface and is fast', () => {
    const state = applyMoves(solved, randomMoves(25));
    const t = performance.now();
    const plan = CFOP.solve(state, { crossColors: ['W', 'Y'], oll: 'full', pll: 'full' });
    expect(performance.now() - t).toBeLessThan(1500);
    expect(plan.steps.length).toBe(8);
    expect(plan.steps.every((s) => s.mask?.startsWith('EDGES:'))).toBe(true);
  });

  it('advanced F2L: no rotations, solves the cube, fewer moves than standard', () => {
    let std = 0;
    let adv = 0;
    const t = performance.now();
    for (let n = 0; n < 60; n++) {
      const state = applyMoves(solved, randomMoves(25));
      const a = solveCfop(state, { crossColors: ['W'], f2l: 'advanced', oll: 'full', pll: 'full' });
      const b = solveCfop(state, { crossColors: ['W'], f2l: 'standard', oll: 'full', pll: 'full' });
      let st = state;
      for (const step of a.steps) st = applyMoves(st, step.alg);
      const arr = toColorArray(st);
      expect([0, 1, 2, 3, 4, 5].every((f) => arr.slice(f * 9, f * 9 + 9).every((c) => c === arr[f * 9 + 4]))).toBe(true);
      const f2l = a.steps.filter((s) => s.stage === 'f2l');
      expect(f2l.length).toBe(4);
      expect(f2l.every((s) => !/[xyz]/.test(s.alg))).toBe(true);
      const sum = (p: typeof a) => p.steps.filter((s) => s.stage === 'f2l').reduce((x, s) => x + s.moves, 0);
      std += sum(b);
      adv += sum(a);
    }
    expect(adv).toBeLessThan(std);
    expect((performance.now() - t) / 60).toBeLessThan(200);
  });

  it('handles a solved cube', () => {
    const plan = solveCfop(solved, { crossColors: ['W'], oll: '2look', pll: '2look' });
    let st = solved;
    for (const s of plan.steps) st = applyMoves(st, s.alg);
    expect(plan.moves).toBe(0);
  });
});
