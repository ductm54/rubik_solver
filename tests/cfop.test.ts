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
import { crossDistance, solveCross, solveXCross } from '../src/solve/cfop/cross';
import { LEFT_HAND, RIGHT_HAND, backTurns, countRegrips, effort, planGrip } from '../src/solve/cfop/grip';
import { crossSolved, f2lTable, slotSolved, SLOTS } from '../src/solve/cfop/f2l';
import { F2L_CASES } from '../src/solve/cfop/algs/f2l';
import { metricCost, turnCost } from '../src/solve/cfop/moveCost';
import { solveF2LAdvanced } from '../src/solve/cfop/f2lAdvanced';
import { buildTable, matchLL, stageDone } from '../src/solve/cfop/ll';
import { SIDE_ROWS, headlightSides } from '../src/solve/cfop/llTips';

const solved = solvedState();
const AUFS_ARR = ['', 'U', 'U2', "U'"];
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
  for (const side of ['FR', 'FL'] as const) {
    it(`has a SpeedCubeDB algorithm (most-voted) for all 150 places of the ${side} pair, each keeping cross and other slots`, () => {
      const t = f2lTable(side);
      expect(t.size).toBe(150);
      const ids = new Set<string>();
      for (const { alg, id } of t.values()) {
        const x = applyMovesToArray(solvedArr, invertAlg(alg));
        // An alg may end with the cube turned (y', d): compare with the centers, as the solver does.
        expect(crossSolved(x) && SLOTS.filter((s) => s !== side).every((s) => slotSolved(x, s))).toBe(true);
        ids.add(id);
      }
      expect(ids.size).toBe(42); // 41 cases + already solved
    });
  }
  it('uses the most-voted algorithm of every case', () => {
    for (const side of ['FR', 'FL'] as const) {
      const used = new Map([...f2lTable(side).values()].map((v) => [v.id, v.source]));
      for (const c of F2L_CASES) expect([side, c.id, used.get(c.id)]).toEqual([side, c.id, c[side][0]]);
    }
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

  /** The moves of the cross (or XCross) step of a plan. */
  const crossOf = (plan: ReturnType<typeof solveCfop>) => parseAlg(plan.steps.find((s) => s.stage === 'cross')!.alg);

  it('a pair that goes in along with another one (stuck piece taken out of its slot) gets its own step', () => {
    // In one of the ways of holding these (white on the bottom, x2), taking a stuck piece out of the
    // back-right slot (B U B') drops the back-right pair in with the front-left one. This used to throw.
    for (const scramble of [
      "F2 R D2 L2 D B R2 D' U2 R2 D' B' L' D2 L U2 L' B D L B2 F2 U2 L' B'",
      "D2 L2 R2 F R2 L2 B' U2 D' B2 U L2 R' D L2 R F D2 F' L' U2 L B' L' D",
    ]) {
      for (const cross of ['standard', 'advanced'] as const) {
        const state = applyMoves(solved, scramble);
        const plan = solveCfop(state, { crossColors: ['W'], cross, f2l: 'standard', oll: '2look', pll: '2look' });
        let st = state;
        for (const step of plan.steps) st = applyMoves(st, step.alg);
        const arr = toColorArray(st);
        expect([0, 1, 2, 3, 4, 5].every((f) => arr.slice(f * 9, f * 9 + 9).every((c) => c === arr[f * 9 + 4]))).toBe(true);
        const f2l = plan.steps.filter((s) => s.stage === 'f2l');
        expect(f2l.length).toBe(4);
        // Every F2L step adds exactly one solved pair to the stickering, in order.
        f2l.forEach((s, k) => expect(s.title).toContain(`${k + 1}`));
      }
    }
  });

  it('more cross colours never make the solve worse (moves, plus the regrips and B turns of the cross)', () => {
    const cost = (plan: ReturnType<typeof solveCfop>) => plan.moves + effort(crossOf(plan));
    for (let n = 0; n < 20; n++) {
      const state = applyMoves(solved, randomMoves(25));
      const one = solveCfop(state, { crossColors: ['W'], oll: 'full', pll: 'full' });
      const all = solveCfop(state, { crossColors: ['W', 'Y', 'G', 'B', 'R', 'O'], oll: 'full', pll: 'full' });
      expect(cost(all)).toBeLessThanOrEqual(cost(one));
    }
  });

  it('cross and XCross: of the shortest solutions, the easiest to execute', () => {
    const turns = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((b) => [b, `${b}2`, `${b}'`]);
    for (let n = 0; n < 40; n++) {
      const st = toColorArray(applyMoves(solved, randomMoves(25)));
      const cross = solveCross(st);
      expect(cross.length).toBe(crossDistance(st));
      expect(crossSolved(applyMovesToArray(st, cross))).toBe(true);
      // Brute force: the least effort (regrips and B turns) over every shortest cross.
      const least = (s: typeof st, done: string[]): number => {
        const d = crossDistance(s);
        if (d === 0) return effort(parseAlg(done.join(' ')));
        let best = Infinity;
        for (const t of turns) {
          const next = applyMovesToArray(s, t);
          if (crossDistance(next) === d - 1) best = Math.min(best, least(next, [...done, t]));
        }
        return best;
      };
      if (cross.length <= 6) expect(effort(cross)).toBe(least(st, []));
      // A B turn that can be the first move is the first move.
      expect(cross[0]?.base === 'F' && cross[1]?.base === 'B').toBe(false);
      // XCross: the same length whichever side is in front.
      const x = solveXCross(st, 10);
      const sides = ['y', 'y2', "y'"].map((r) => solveXCross(applyMovesToArray(st, r), 10));
      for (const other of sides) expect(other?.length).toBe(x?.length);
      if (x) {
        const after = applyMovesToArray(st, x);
        expect(crossSolved(after) && SLOTS.some((s) => slotSolved(after, s))).toBe(true);
      }
    }
  });

  it('cross: the easiest order of turns of opposite faces (F B or B F) in the middle of a solution', () => {
    // Found by random search: the shortest crosses here have an F and a B turn next to each other,
    // and only the other order of them (R B' F rather than R F B') reaches the least effort.
    const cases: [string, number][] = [
      ["D R B2 R D2 L' U2 B D2 L2 U D2 L' U R F' L B' U F' B F' L B' U2", 8],
      ["D' R' F L2 D R U2 R' B U D' R2 U L D2 B' D2 L D L D' L' B D' B'", 8],
      ["F2 L F L' B D' B' F' B' D2 F2 L2 D B' U2 F' L U' R2 L F D U' R' F", 8],
      ["R2 L2 F' D2 L2 D2 B' D' R2 B' U L U' F' U2 D2 U' D B' U B' L F' B R", 13],
    ];
    for (const [scramble, least] of cases) {
      const st = toColorArray(applyMoves(solved, scramble));
      const cross = solveCross(st);
      expect(cross.length).toBe(crossDistance(st));
      expect(crossSolved(applyMovesToArray(st, cross))).toBe(true);
      expect(effort(cross)).toBe(least);
    }
  });

  it('step 0 holds the cube so that the cross and the XCross need few regrips and B turns', () => {
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const cross of ['standard', 'advanced'] as const) {
      const N = 60;
      let smooth = 0;
      let noBack = 0;
      for (let n = 0; n < N; n++) {
        const state = applyMoves(solved, randomMoves(25, rand));
        const plan = solveCfop(state, { crossColors: ['W'], cross, oll: 'full', pll: 'full' });
        const moves = crossOf(plan);
        const regrips = countRegrips(moves);
        const back = backTurns(moves);
        if (regrips === 0) smooth++;
        if (back === 0) noBack++;
        expect(back).toBeLessThanOrEqual(2);
        expect(regrips).toBeLessThanOrEqual(2);
        // Step 0 says what the hold is good for; the cross step says where each regrip is.
        expect(plan.steps[0].hint).toContain(`needs ${regrips ? `${regrips} regrip` : 'no regrip'}`);
        expect(plan.steps[0].hint).toContain(back ? `${back} B turn` : 'no B turn');
        expect(plan.steps.find((s) => s.stage === 'cross')!.hint?.split('regrip:').length).toBe(regrips ? planGrip(moves).at.length + 1 : 1);
      }
      // Picking by length alone leaves about 1 cross in 5 without a B turn.
      expect(noBack / N).toBeGreaterThan(0.6);
      expect(smooth / N).toBeGreaterThan(0.4);
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

  it('advanced F2L: no rotations or B turns, solves the cube, fewer moves than standard, uses pseudo-slotting and u turns', () => {
    let pseudo = 0;
    let uPairs = 0;
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
      expect(f2l.every((s) => !/[xyzB]/.test(s.alg))).toBe(true);
      // Pseudo-slotting: the bottom layer is turned in the first pair and turned back in the last.
      if (f2l.some((s) => s.caseName?.startsWith('Pseudo pair'))) {
        pseudo++;
        expect(f2l[0].alg).toMatch(/^D/);
        expect(f2l[3].alg).toMatch(/D[2']?$/);
      } else expect(f2l.every((s) => !s.alg.includes('D'))).toBe(true);
      // u pairs: the top two layers are turned and turned back within the step (a quarter turn net 0).
      for (const s of f2l.filter((s) => /\bu/.test(s.alg))) {
        uPairs++;
        const net = parseAlg(s.alg).filter((m) => m.base === 'u').reduce((a, m) => a + m.amount, 0);
        expect(((net % 4) + 4) % 4).toBe(0);
        expect(s.hint).toContain(' u ');
      }
      const sum = (p: typeof a) => p.steps.filter((s) => s.stage === 'f2l').reduce((x, s) => x + s.moves, 0);
      std += sum(b);
      adv += sum(a);
    }
    expect(adv).toBeLessThan(std);
    expect(pseudo).toBeGreaterThan(0);
    expect(uPairs).toBeGreaterThan(0);
    expect((performance.now() - t) / 60).toBeLessThan(200);
  });

  it('advanced F2L weighs moves by finger trick: quicker to turn than the fewest-moves plan', () => {
    const totals = { time: { moves: 0, time: 0 }, moves: { moves: 0, time: 0 } };
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 30; n++) {
      const state = applyMoves(solved, randomMoves(25, rand));
      // The cube after the cross (and the way it is held), as the advanced F2L sees it.
      const plan = solveCfop(state, { crossColors: ['W'], f2l: 'advanced', oll: 'full', pll: 'full' });
      let st = state;
      for (const step of plan.steps.filter((s) => s.stage !== 'f2l' && s.stage !== 'oll' && s.stage !== 'pll')) st = applyMoves(st, step.alg);
      const arr = toColorArray(st);
      for (const metric of ['time', 'moves'] as const) {
        const pairs = solveF2LAdvanced(arr, 'white', metric);
        const alg = pairs.flatMap((p) => p.alg);
        expect(f2lDone(applyMovesToArray(arr, alg))).toBe(true);
        totals[metric].moves += pairs.reduce((a, p) => a + p.moves, 0);
        totals[metric].time += turnCost(alg);
      }
    }
    expect(totals.time.time).toBeLessThan(totals.moves.time);
    expect(totals.moves.moves).toBeLessThanOrEqual(totals.time.moves);
  });

  it('move costs: R is the quickest, double turns and f are slower, ties go to fewer moves', () => {
    expect(turnCost(parseAlg("R U R' U'"))).toBe(4.2);
    expect(turnCost(parseAlg("f R f'"))).toBeGreaterThan(turnCost(parseAlg("R U R'")) + 1);
    expect(turnCost(parseAlg('U2'))).toBeGreaterThan(turnCost(parseAlg('U')) * 1.5);
    expect(turnCost(parseAlg('b2 E2'))).toBe(6);
    expect(metricCost('time', parseAlg("R U R'"))).toBeLessThan(metricCost('time', parseAlg("R U R' U U'")));
    expect(metricCost('moves', parseAlg("f R f'"))).toBe(3);
  });

  it('advanced cross: cross and at least one pair together in under 11 moves, never longer overall', () => {
    let xcross = 0;
    let adv = 0;
    let std = 0;
    for (let n = 0; n < 40; n++) {
      const state = applyMoves(solved, randomMoves(25));
      const a = solveCfop(state, { crossColors: ['W'], cross: 'advanced', oll: 'full', pll: 'full' });
      const b = solveCfop(state, { crossColors: ['W'], oll: 'full', pll: 'full' });
      let st = state;
      const cross = a.steps.find((s) => s.stage === 'cross')!;
      for (const step of a.steps) {
        st = applyMoves(st, step.alg);
        if (step === cross && cross.title.startsWith('XCross')) {
          xcross++;
          expect(cross.moves).toBeLessThan(11);
          const arr = toColorArray(st);
          expect(crossSolved(arr) && SLOTS.some((s) => slotSolved(arr, s))).toBe(true);
        }
      }
      expect(f2lDone(toColorArray(st))).toBe(true);
      expect(a.steps.filter((s) => s.stage === 'f2l').length).toBe(4);
      adv += a.moves;
      std += b.moves;
    }
    expect(xcross).toBeGreaterThan(20);
    expect(adv).toBeLessThan(std);
  });

  it('cross, XCross and F2L steps say how to read the cube and why the pair is taken now', () => {
    for (let n = 0; n < 60; n++) {
      const state = applyMoves(solved, randomMoves(25));
      for (const adv of [false, true]) {
        const plan = solveCfop(state, { crossColors: ['W'], cross: adv ? 'advanced' : 'standard', f2l: adv ? 'advanced' : 'standard', oll: 'full', pll: 'full' });
        const cross = plan.steps.find((s) => s.stage === 'cross')!;
        // Every cross edge is sorted into one kind (the line about edges in the right order names some again).
        const edges = cross.tips!.filter((x) => /^white-/.test(x) && !x.includes('right order')).join(' ');
        for (const c of ['green', 'red', 'blue', 'orange']) expect(edges.split(`white-${c}`).length).toBe(2);
        const f2l = plan.steps.filter((s) => s.stage === 'f2l' && s.alg);
        for (const s of f2l) expect(s.tips!.length).toBeGreaterThan(0);
        // Standard F2L: exactly one of the listed pairs is marked as the one taken.
        if (!adv) for (const s of f2l) {
          const options = s.tips!.filter((x) => / moves?/.test(x) && !x.startsWith('Rule'));
          if (options.length) expect(options.filter((x) => x.endsWith('← this one')).length).toBe(1);
        }
        // No text is a missing translation key or has an unfilled placeholder.
        for (const s of plan.steps) for (const x of s.tips ?? []) expect(x).not.toMatch(/tip\.|\{\w+\}/);
      }
    }
  });

  it('last-layer recognition: two sides tell every PLL apart, headlights give the group', () => {
    const AUFS = ['', 'U', 'U2', "U'"];
    const ring = 'FRBL';
    // The front and right top rows, as colours relative to the first sticker (side colours are a ring).
    const twoSides = (st: ReturnType<typeof toColorArray>) => {
      const sideOf = (c: string) => ring[[22, 13, 49, 40].findIndex((i) => st[i] === c)];
      const f = [...SIDE_ROWS.F, ...SIDE_ROWS.R].map((i) => ring.indexOf(sideOf(st[i])));
      return f.map((x) => (x - f[0] + 4) % 4).join('');
    };
    const seen = new Map<string, string>();
    const group: Record<string, number> = { H: 4, Ua: 4, Ub: 4, Z: 4, E: 0, Na: 0, Nb: 0, V: 0, Y: 0 };
    for (const e of PLL) for (const pre of AUFS) for (const post of AUFS) {
      const st = applyMovesToArray(solvedArr, invertAlg(parseAlg(`${pre} ${e.alg} ${post}`)));
      const k = twoSides(st);
      expect(seen.get(k) ?? e.id, `${e.id} looks like ${seen.get(k)}`).toBe(e.id);
      seen.set(k, e.id);
      expect(headlightSides(st).length).toBe(group[e.id] ?? 1);
    }
    expect(seen.has(twoSides(solvedArr))).toBe(false);
  });

  it('OLL and PLL steps say how to recognise the case', () => {
    let sunes = 0;
    for (let n = 0; n < 40; n++) {
      const state = applyMoves(solved, randomMoves(25));
      for (const ll of ['full', '2look'] as const) {
        const plan = solveCfop(state, { crossColors: ['W'], oll: ll, pll: ll });
        let st = toColorArray(state);
        for (const s of plan.steps) {
          if ((s.stage === 'oll' || s.stage === 'pll') && s.alg && s.caseName !== 'Only an AUF (U turn)') {
            expect(s.tips?.length, s.title).toBeGreaterThan(0);
            for (const x of s.tips!) expect(x).not.toMatch(/tip\.|\{\w+\}/);
            if (s.stage === 'pll' && s.title !== 'PLL 1/2 · corners') expect(s.tips!.some((x) => x.includes(`it is the ${s.caseName}`))).toBe(true);
            // Sune rule: the one top corner at front-left, the front-right corner shows the top colour on the front.
            if (s.caseName === 'Sune' || s.caseName === 'Anti-Sune') {
              const top = st[4];
              const u = AUFS_ARR.map((a) => applyMovesToArray(st, parseAlg(a))).find((x) => x[6] === top)!;
              expect(u[20] === top).toBe(s.caseName === 'Sune');
              expect(u[9] === top).toBe(s.caseName === 'Anti-Sune');
              sunes++;
            }
          }
          st = applyMovesToArray(st, parseAlg(s.alg));
        }
      }
    }
    expect(sunes).toBeGreaterThan(0);
  });

  it('handles a solved cube', () => {
    const plan = solveCfop(solved, { crossColors: ['W'], oll: '2look', pll: '2look' });
    let st = solved;
    for (const s of plan.steps) st = applyMoves(st, s.alg);
    expect(plan.moves).toBe(0);
  });
});

describe('regrips', () => {
  const regrips = (alg: string) => countRegrips(parseAlg(alg));

  it('the left hand is the mirror image of the right', () => {
    expect(RIGHT_HAND.bottom.split(' ')).toContain('F');
    expect(LEFT_HAND.bottom.split(' ')).toContain("F'");
    const mirror = (alg: string) =>
      alg.split(' ').map((m) => ({ R: 'L', L: 'R' })[m[0]] ?? m[0]).map((f, i) => f + ({ '': "'", "'": '', '2': '2' })[alg.split(' ')[i].slice(1)]).join(' ');
    expect(mirror("R U R' F2")).toBe("L' U' L F2");
    for (let n = 0; n < 200; n++) {
      const alg = randomMoves(8).map((m) => m.base + ['', '', '2', "'"][m.amount]).join(' ');
      expect(regrips(mirror(alg)), alg).toBe(regrips(alg));
    }
  });

  it('usual finger tricks need no regrip', () => {
    for (const alg of ["R U R' U'", "R' F R F'", "L' U' L U", "R U R' U' R' F R2 U' R' U' R U R' F'", "R B' R'", "D R' D' R", 'R2 U R2']) expect(regrips(alg), alg).toBe(0);
  });

  it('wide r and l move the thumb like R and L; u and f are reached like U and F', () => {
    for (const alg of ["r U R' U'", "r U r'", "l' U' L U", "u R U R' u'", "f R U R' U' f'", "R' f R f'"]) expect(regrips(alg), alg).toBe(0);
    // The wrist is already turned as far as it goes.
    expect(regrips('R r R')).toBe(1);
    expect(regrips("r' R' r'")).toBe(1);
  });

  it('the first grip is free, the next ones are not', () => {
    // One B or F2 alone: take the grip for it during inspection.
    expect(planGrip(parseAlg('B'))).toEqual({ regrips: 0, start: { left: 'front', right: 'top' }, at: [] });
    expect(regrips('F2')).toBe(0);
    // So a B turn costs nothing as the first move, and only there.
    expect(backTurns(parseAlg('B R U'))).toBe(0);
    expect(backTurns(parseAlg('R B U'))).toBe(1);
    expect(backTurns(parseAlg("B2 R B' D B"))).toBe(2);
    // The wrist cannot keep turning the same way.
    expect(regrips("R U R U R U R")).toBe(1);
    // Front and back turns with both wrists already used.
    const plan = planGrip(parseAlg("D R' L F2 B2"));
    expect(plan.regrips).toBe(1);
    expect(plan.at.map((a) => a.move)).toEqual([4]);
    expect(plan.at[0].hands).toHaveLength(1);
    expect(plan.at[0].hands[0].thumb).toBe('top');
  });

  it('counting and planning agree, and a plan is never worse than regripping at every move', () => {
    for (let n = 0; n < 300; n++) {
      const moves = randomMoves(10);
      const plan = planGrip(moves);
      expect(plan.regrips).toBe(countRegrips(moves));
      expect(plan.at.reduce((a, r) => a + r.hands.length, 0)).toBe(plan.regrips);
      expect(plan.regrips).toBeLessThan(moves.length);
      // More moves never take fewer regrips.
      expect(countRegrips(moves.slice(0, 6))).toBeLessThanOrEqual(plan.regrips);
    }
  });
});
