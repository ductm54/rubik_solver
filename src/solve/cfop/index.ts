/**
 * CFOP: cross, F2L (4 pairs), OLL, PLL, with 2-look or full last layer. With several cross
 * colours allowed, every allowed colour (in all 4 ways of holding it on the bottom) is solved
 * and the shortest solution wins.
 */
import { type Color, type CubeState, type Move, applyMovesToArray, countMoves, formatAlg, parseAlg, simplifyAlg, toColorArray } from '../../core/cube';
import { validate } from '../../core/validate';
import { COLOR_WORDS, type MaskStage, stickeringMask } from '../mask';
import { type Stickers, centerColor } from '../pieces';
import type { MethodDef, SettingValues, SolvePlan, SolveStep } from '../types';
import { CPLL, EPLL, PLL } from './algs/pll';
import { EO, OCLL, OLL } from './algs/oll';
import { solveCross, solveXCross } from './cross';
import { SLOTS, SLOT_NAMES, type Slot, crossSolved, planPair, slotSolved } from './f2l';
import { solveF2LAdvanced } from './f2lAdvanced';
import { type LLTable, buildTable, matchLL } from './ll';

let tables: Record<string, LLTable> | null = null;
function llTables() {
  tables ??= {
    oll: buildTable(OLL, 'orient', false),
    eo: buildTable(EO, 'orientEdges', false),
    ocll: buildTable(OCLL, 'orient', false),
    pll: buildTable(PLL, 'perm', true),
    cpll: buildTable(CPLL, 'permCorners', false),
    epll: buildTable(EPLL, 'perm', true),
  };
  return tables;
}

/** Whole-cube rotations that put each colour on the bottom, 4 per colour. */
const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));

export interface CfopOptions {
  crossColors: Color[];
  /** Advanced: the cross and at least one F2L pair together (XCross) when that takes under 11 moves. */
  cross?: 'standard' | 'advanced';
  f2l?: 'standard' | 'advanced';
  oll: 'full' | '2look';
  pll: 'full' | '2look';
}

/** The advanced cross does an XCross only when it takes at most this many moves (under 11). */
const XCROSS_MAX = 10;

interface Attempt {
  steps: SolveStep[];
  moves: number;
  color: Color;
}

function solveFrom(start: Stickers, hold: string, opts: CfopOptions, cross: Color): Attempt {
  const steps: SolveStep[] = [];
  const holdMoves = parseAlg(hold);
  let st = start;
  const scheme = schemeOf(start);
  const held = applyMovesToArray(start, holdMoves);
  const top = COLOR_WORDS[centerColor(held, 'U')];
  const push = (s: Omit<SolveStep, 'moves' | 'alg' | 'mask'>, moves: Move[], mask: MaskStage) => {
    const m = simplifyAlg(moves);
    steps.push({ ...s, alg: formatAlg(m), moves: countMoves(m), mask: stickeringMask(scheme, mask) });
    st = applyMovesToArray(st, m);
  };

  // Step 0: hold the cube the right way, during the 15 s inspection (rotations only, no moves).
  const front = COLOR_WORDS[centerColor(held, 'F')];
  push(
    {
      stage: 'inspection',
      title: `Hold ${COLOR_WORDS[cross]} on the bottom, ${front} in front`,
      caseName: holdMoves.length ? undefined : 'Already held this way: no turn needed',
      hint: `Do this during the 15 s inspection, before the timer starts: ${top} on top, ${front} facing you.`,
    },
    holdMoves,
    { kind: 'cross', cross },
  );

  // Cross, or with the advanced cross an XCross (cross + at least one pair) when it is short enough.
  const xcross = opts.cross === 'advanced' ? solveXCross(held, XCROSS_MAX) : null;
  if (xcross) {
    const after = applyMovesToArray(held, xcross);
    const done = SLOTS.filter((s) => slotSolved(after, s)).map((s) => slotColors(after, s));
    push(
      {
        stage: 'cross',
        title: `XCross (${COLOR_WORDS[cross]}) + ${done.map(pairName).join(' and ')} pair${done.length > 1 ? 's' : ''}`,
        hint: `Solve the 4 ${COLOR_WORDS[cross]} edges on the bottom and the ${done.map(pairName).join(' and ')} pair${done.length > 1 ? 's' : ''} in one go.`,
      },
      xcross,
      { kind: 'f2l', cross, pairs: done },
    );
  } else {
    push(
      { stage: 'cross', title: `Cross (${COLOR_WORDS[cross]})`, hint: `Solve the 4 ${COLOR_WORDS[cross]} edges on the bottom, matching the side centers.` },
      solveCross(held),
      { kind: 'cross', cross },
    );
  }

  // F2L: greedy, cheapest pair first. Slot names are relative to the current way of holding it.
  const pairs: Color[][] = [];
  for (const s of SLOTS.filter((s) => slotSolved(st, s))) {
    const colors = slotColors(st, s);
    pairs.push(colors);
    steps.push({ stage: 'f2l', title: `F2L ${pairs.length} · ${pairName(colors)} pair`, caseName: xcross ? 'Solved together with the cross (XCross)' : 'Already solved after the cross', alg: '', moves: 0, mask: stickeringMask(scheme, { kind: 'f2l', cross, pairs: [...pairs] }) });
  }
  if (opts.f2l === 'advanced') {
    const plan = solveF2LAdvanced(st, COLOR_WORDS[cross]);
    const pieces: Color[][] = [];
    const sides = (c: Color[]) => c.filter((x) => x !== cross).map((x) => COLOR_WORDS[x]).join('-');
    plan.forEach((p, k) => {
      pieces.push(p.corner, p.edge);
      const turns = [
        k === 0 ? `the bottom layer is turned first (${p.alg[0].base === 'D' ? formatAlg([p.alg[0]]) : 'D'}), so each corner goes in with the edge of another slot` : '',
        k === plan.length - 1 ? 'the last turn lines the bottom layer up again' : '',
      ].filter(Boolean);
      push(
        {
          stage: 'f2l',
          title: p.pseudo
            ? `F2L ${pairs.length + k + 1} · ${sides(p.corner)} corner + ${sides(p.edge)} edge`
            : `F2L ${pairs.length + k + 1} · ${sides(p.corner)} pair`,
          caseName: `${p.pseudo ? 'Pseudo pair into' : 'Into'} the ${SLOT_NAMES[p.slot]} slot`,
          hint: `${p.description}.${p.pseudo && turns.length ? ` Pseudo-slotting: ${turns.join('; ')}.` : ''}`,
        },
        p.alg,
        { kind: 'f2l', cross, pairs: [...pairs], pieces: [...pieces] },
      );
    });
  } else
  while (pairs.length < 4) {
    const done = SLOTS.filter((s) => slotSolved(st, s));
    let best: ReturnType<typeof planPair> = null;
    for (const s of SLOTS.filter((s) => !done.includes(s))) {
      const p = planPair(st, s, COLOR_WORDS[cross]);
      if (p && (!best || p.moves < best.moves)) best = p;
    }
    if (!best) throw new Error('F2L: no case matched (internal error)');
    const colors = slotColors(st, best.slot);
    pairs.push(colors);
    push(
      {
        stage: 'f2l',
        title: `F2L ${pairs.length} · ${pairName(colors)} pair`,
        caseName: best.extractedFrom
          ? `A piece is stuck in the ${SLOT_NAMES[best.extractedFrom]} slot${best.rotation.length ? ' (after the turn)' : ''}: take it out first`
          : undefined,
        hint: `${best.rotation.length ? `Turn the cube (${formatAlg(best.rotation)}) so this slot is at the front-right. ` : 'The slot is at the front-right. '}Now: ${best.description}.`,
      },
      [...best.rotation, ...best.extraction, ...best.alg],
      { kind: 'f2l', cross, pairs: [...pairs] },
    );
    if (SLOTS.filter((s) => slotSolved(st, s)).length !== pairs.length) throw new Error('F2L pair not solved (internal error)');
  }
  if (!crossSolved(st) || !SLOTS.every((s) => slotSolved(st, s))) throw new Error('F2L did not finish (internal error)');

  // Last layer
  const t = llTables();
  const llStep = (stage: string, title: string, table: LLTable, mask: MaskStage, skipText: string) => {
    const m = matchLL(st, table);
    if (!m) throw new Error(`${title}: no case matched (internal error)`);
    if (!m.entry && !m.count) {
      steps.push({ stage, title, caseName: skipText, alg: '', moves: 0, mask: stickeringMask(scheme, mask) });
      return;
    }
    push(
      { stage, title, caseName: m.entry?.name ?? 'Only an AUF (U turn)', hint: m.entry?.hint?.replaceAll('{top}', top) },
      m.moves,
      mask,
    );
  };
  if (opts.oll === 'full') llStep('oll', 'OLL', t.oll, { kind: 'oll', cross }, 'OLL skip: top already done');
  else {
    llStep('oll', 'OLL 1/2 · edges', t.eo, { kind: 'eo', cross }, `Skip: ${top} cross already there`);
    llStep('oll', 'OLL 2/2 · corners', t.ocll, { kind: 'oll', cross }, `Skip: ${top} corners already oriented`);
  }
  if (opts.pll === 'full') llStep('pll', 'PLL', t.pll, { kind: 'pll', cross }, 'PLL skip: solved');
  else {
    llStep('pll', 'PLL 1/2 · corners', t.cpll, { kind: 'cpll', cross }, 'Skip: corners already in place');
    llStep('pll', 'PLL 2/2 · edges', t.epll, { kind: 'pll', cross }, 'Skip: solved');
  }
  return { steps, moves: steps.reduce((a, s) => a + s.moves, 0), color: cross };
}

/** Colours of a slot: [cross colour, front-ish side, right-ish side]. */
function slotColors(st: Stickers, s: Slot): Color[] {
  const sides = [...s] as ('F' | 'B' | 'L' | 'R')[];
  return [centerColor(st, 'D'), ...sides.map((f) => centerColor(st, f))];
}

const pairName = (c: Color[]) => c.slice(1).map((x) => COLOR_WORDS[x]).join('-');

function schemeOf(st: Stickers): Record<string, Color> {
  return Object.fromEntries([...'URFDLB'].map((f, i) => [f, st[i * 9 + 4]]));
}

export function solveCfop(state: CubeState, opts: CfopOptions): SolvePlan {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const start = toColorArray(state);
  let best: Attempt | null = null;
  for (const hold of HOLDS) {
    const st = applyMovesToArray(start, hold);
    const cross = centerColor(st, 'D');
    if (!opts.crossColors.includes(cross)) continue;
    const a = solveFrom(start, hold, opts, cross);
    if (!best || a.moves < best.moves) best = a;
  }
  if (!best) throw new Error('Pick at least one cross colour');
  const n = opts.crossColors.length;
  return {
    method: 'CFOP',
    steps: best.steps,
    moves: best.moves,
    note: n > 1 ? `Cross on ${COLOR_WORDS[best.color]}: the shortest of your ${n} colours for this cube.` : `Cross on ${COLOR_WORDS[best.color]}.`,
  };
}

const COLOR_OPTIONS: { value: Color; label: string }[] = (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[]).map((c) => ({
  value: c,
  label: COLOR_WORDS[c][0].toUpperCase() + COLOR_WORDS[c].slice(1),
}));

export const CFOP: MethodDef = {
  id: 'cfop',
  name: 'CFOP',
  description: 'Cross, F2L, OLL, PLL: the method most speedcubers use.',
  settings: [
    {
      key: 'crossColors',
      label: 'Cross colours',
      help: 'Start with one. Add more as you learn to solve the cross on them; the solver picks the shortest for each cube.',
      kind: 'multi',
      options: COLOR_OPTIONS,
    },
    {
      key: 'cross',
      label: 'Cross',
      help: 'Standard: the shortest cross. Advanced: an XCross, the cross and at least one F2L pair solved together, whenever that takes under 11 moves (otherwise the normal cross).',
      kind: 'choice',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'advanced', label: 'Advanced (XCross)' },
      ],
    },
    {
      key: 'f2l',
      label: 'F2L',
      help: 'Standard: turn the cube so each pair goes in at the front-right, one case at a time. Advanced: no cube turns, no B moves (f and S instead), any slot, best pair order, and pseudo-slotting (pairs made with the bottom layer turned) when it is shorter: the fewest moves found.',
      kind: 'choice',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'advanced', label: 'Advanced' },
      ],
    },
    {
      key: 'oll',
      label: 'OLL',
      help: '2-look: 3 + 7 algorithms. Full: 57 algorithms, one step.',
      kind: 'choice',
      options: [
        { value: '2look', label: '2-look' },
        { value: 'full', label: 'Full (57)' },
      ],
    },
    {
      key: 'pll',
      label: 'PLL',
      help: '2-look: 2 + 4 algorithms. Full: 21 algorithms, one step.',
      kind: 'choice',
      options: [
        { value: '2look', label: '2-look' },
        { value: 'full', label: 'Full (21)' },
      ],
    },
  ],
  defaults: { crossColors: ['W'], cross: 'standard', f2l: 'standard', oll: '2look', pll: '2look' },
  solve(state: CubeState, s: SettingValues) {
    const colors = (Array.isArray(s.crossColors) ? s.crossColors : [s.crossColors]) as Color[];
    return solveCfop(state, {
      crossColors: colors.length ? colors : ['W'],
      cross: s.cross === 'advanced' ? 'advanced' : 'standard',
      f2l: s.f2l === 'advanced' ? 'advanced' : 'standard',
      oll: s.oll === 'full' ? 'full' : '2look',
      pll: s.pll === 'full' ? 'full' : '2look',
    });
  },
};
