/**
 * The Algorithms tab: a reference sheet of every CFOP case (41 F2L, 57 OLL, 21 PLL), built from
 * the same algorithm lists the solver uses (solve/cfop/algs), so the sheet and the solver agree.
 *
 * Each case carries the state it starts from, held the CFOP way (white on the bottom, yellow on
 * top, blue in front, red on the right), and what its diagram shows: the top face and the top
 * row of the four sides for OLL and PLL, with PLL's arrows from where each piece is to where the
 * algorithm takes it; the top, front and right faces for F2L, with only the pair coloured.
 * tests/algs.test.ts checks every case starts unsolved and the algorithm solves it.
 */
import { type Color, STANDARD_SCHEME, applyMovesToArray, formatAlg, invertAlg, parseAlg, solvedState, toColorArray } from '../core/cube';
import { F2L_CASES } from '../solve/cfop/algs/f2l';
import { EO, OCLL, OLL } from '../solve/cfop/algs/oll';
import { CPLL, EPLL, PLL } from '../solve/cfop/algs/pll';
import { stickeringMask } from '../solve/mask';
import { centerColor, cubie, pieceSolved } from '../solve/pieces';
import { HOLD } from './beginner';

export type AlgSet = 'f2l' | 'oll' | 'pll';
export const ALG_SETS: AlgSet[] = ['f2l', 'oll', 'pll'];

export interface RefCase {
  set: AlgSet;
  /** Case number (F2L, OLL) or name (PLL), as shown on the card. */
  id: string;
  /** Group id: `algs.group.<id>` names it. */
  group: string;
  /** Shape or nickname (OLL), shown under the number. */
  shape?: string;
  /** English recognition hint (PLL), if any. */
  hint?: string;
  /** Main algorithm first, then alternatives. */
  algs: string[];
  /**
   * F2L only: the same case in the front-left slot, and for each algorithm the moves to the
   * state it solves (some start with a d or y, so the cube is held turned).
   */
  left?: string[];
  leftSetups?: string[];
  /** Moves from the held, solved cube to the case (for the 3D viewer, after `HOLD`). */
  setup: string;
  /** In 2-look OLL / PLL too. */
  twoLook?: boolean;
  /** 54 stickers of the case, held (URFDLB order). `null` = greyed out on the diagram. */
  stickers: (Color | null)[];
  /** PLL: U-face sticker index pairs [from, to], one per moving piece. */
  arrows?: [number, number][];
  /** Viewer mask (cubing.js stickering), as on the Solve tab. */
  mask: string;
}

const SOLVED = toColorArray(solvedState());
const IDS = SOLVED.map((_, i) => i);
/** Sticker labels of the held, solved cube: `HELD_IDS[p]` is the home index of what sits at p. */
const HELD_IDS = applyMovesToArray(IDS, HOLD);
const HELD = applyMovesToArray(SOLVED, HOLD);
const invert = (alg: string) => formatAlg(invertAlg(parseAlg(alg)));

const F2L_PIECES = ['DF', 'DR', 'DB', 'DL', 'DFR', 'DRB', 'DBL', 'DLF', 'FR', 'FL', 'BR', 'BL'].map(cubie);
/** First two layers solved, whichever way the cube ends up turned (an algorithm may end with a y). */
const f2lSolved = (st: Color[]) =>
  ['', 'y', 'y2', "y'"].some((y) => {
    const v = applyMovesToArray(st, y);
    return centerColor(v, 'U') === 'Y' && F2L_PIECES.every((p) => pieceSolved(v, p));
  });

/**
 * The front-left algorithms of a case, each with the moves to its start: the same case built at
 * the front-left slot (the front-right setup done with the cube turned, y' … y), with the top
 * turned (U) the way that algorithm expects. One that solves it from no U turn is left out.
 */
function leftAlgs(frSetup: string, algs: string[]): { left: string[]; leftSetups: string[] } {
  const base = `y' ${frSetup} y`;
  const left: string[] = [];
  const leftSetups: string[] = [];
  for (const alg of algs) {
    const auf = ['', 'U', 'U2', "U'"].find((u) => f2lSolved(applyMovesToArray(HELD, `${base} ${u} ${alg}`)));
    if (auf === undefined) continue;
    left.push(alg);
    leftSetups.push(`${base} ${auf}`.trim());
  }
  return { left, leftSetups };
}

/** Where each held sticker id sits on the solved, held cube. */
const HOME = new Map(HELD_IDS.map((id, p) => [id, p]));

/** The front-right slot, held: corner D-F-R and edge F-R. */
const DFR = [29, 26, 15]; // D[2], F[8], R[6]
const FR = [23, 12]; // F[5], R[3]

const MASKS = {
  f2l: stickeringMask(STANDARD_SCHEME, { kind: 'f2l', cross: 'W', pairs: [['W', 'B', 'R']] }),
  oll: stickeringMask(STANDARD_SCHEME, { kind: 'oll', cross: 'W' }),
  pll: stickeringMask(STANDARD_SCHEME, { kind: 'pll', cross: 'W' }),
};

/** Labels after `setup` on the held cube. */
const labels = (setup: string) => applyMovesToArray(HELD_IDS, setup);
const colour = (id: number) => SOLVED[id];

const OCLL_ALGS = new Set(OCLL.map((c) => c.alg));
const PLL_2LOOK = new Set([...CPLL, ...EPLL].map((c) => c.alg));

/** OLL shape → group, in the order the sheet shows them. */
const OLL_GROUPS: [string, string[]][] = [
  ['ocll', ['Sune', 'Anti-Sune', 'H', 'Pi', 'Headlights', 'Chameleon', 'Bowtie']],
  ['cornersDone', ['Arrow', 'Cross (H-dot)']],
  ['dot', ['Dot']],
  ['line', ['Line']],
  ['square', ['Square']],
  ['lightning', ['Small lightning', 'Big lightning']],
  ['fish', ['Fish']],
  ['knight', ['Knight move']],
  ['awkward', ['Awkward']],
  ['p', ['P shape']],
  ['t', ['T shape']],
  ['c', ['C shape']],
  ['w', ['W shape']],
  ['smallL', ['Small L']],
];

const PLL_GROUPS: [string, string[]][] = [
  ['edges', ['Ua', 'Ub', 'H', 'Z']],
  ['corners', ['Aa', 'Ab', 'E']],
  ['adjacent', ['T', 'F', 'Ja', 'Jb', 'Ra', 'Rb', 'Ga', 'Gb', 'Gc', 'Gd']],
  ['diagonal', ['Y', 'V', 'Na', 'Nb']],
];

const F2L_GROUPS: Record<string, string> = {
  'Free Pairs': 'free',
  'Disconnected Pairs': 'disconnected',
  'Connected Pairs': 'connected',
  'Corner In Slot': 'cornerSlot',
  'Edge In Slot': 'edgeSlot',
  'Pieces In Slot': 'bothSlot',
};

/** Group order of each set. */
export const GROUPS: Record<AlgSet, string[]> = {
  f2l: Object.values(F2L_GROUPS),
  oll: OLL_GROUPS.map(([g]) => g),
  pll: PLL_GROUPS.map(([g]) => g),
};

function f2lCase(c: (typeof F2L_CASES)[number]): RefCase {
  const ids = labels(c.setup);
  const pair = new Set([...DFR, ...FR].map((p) => HELD_IDS[p]));
  return {
    set: 'f2l',
    id: c.id,
    group: F2L_GROUPS[c.group],
    algs: c.FR,
    ...leftAlgs(c.setup, c.FL),
    setup: c.setup,
    // Centres and the pair in colour; the rest of the cube is already solved or does not matter yet.
    stickers: ids.map((id, p) => (p % 9 === 4 || pair.has(id) ? colour(id) : null)),
    mask: MASKS.f2l,
  };
}

function ollCase(c: (typeof OLL)[number]): RefCase {
  const shape = c.name.split(' · ')[1];
  const setup = invert(c.alg);
  return {
    set: 'oll',
    id: c.id,
    group: OLL_GROUPS.find(([, shapes]) => shapes.includes(shape))![0],
    shape,
    algs: [c.alg],
    setup,
    twoLook: OCLL_ALGS.has(c.alg),
    // Only where the yellow stickers are matters.
    stickers: labels(setup).map((id) => (colour(id) === 'Y' ? 'Y' : null)),
    mask: MASKS.oll,
  };
}

function pllCase(c: (typeof PLL)[number]): RefCase {
  const setup = invert(c.alg);
  const ids = labels(setup);
  const arrows: [number, number][] = [];
  for (const p of [0, 1, 2, 3, 5, 6, 7, 8].map((k) => k)) {
    const to = HOME.get(ids[p])!;
    if (to !== p && to < 9) arrows.push([p, to]);
  }
  return {
    set: 'pll',
    id: c.id,
    group: PLL_GROUPS.find(([, names]) => names.includes(c.id))![0],
    hint: c.hint,
    algs: [c.alg],
    setup,
    twoLook: PLL_2LOOK.has(c.alg),
    stickers: ids.map(colour),
    arrows,
    mask: MASKS.pll,
  };
}

const byGroup = (set: AlgSet) => (a: RefCase, b: RefCase) => GROUPS[set].indexOf(a.group) - GROUPS[set].indexOf(b.group);

export const REFERENCE: Record<AlgSet, RefCase[]> = {
  f2l: F2L_CASES.map(f2lCase).sort(byGroup('f2l')),
  oll: OLL.map(ollCase).sort(byGroup('oll')),
  pll: PLL_GROUPS.flatMap(([, names]) => names.map((n) => pllCase(PLL.find((c) => c.id === n)!))),
};

/** 2-look OLL's first look (edges): not one of the 57, so listed on its own. */
export const EO_CASES: RefCase[] = EO.map((c) => {
  const setup = invert(c.alg);
  return {
    set: 'oll',
    id: c.name,
    group: 'eo',
    hint: c.hint,
    algs: [c.alg],
    setup,
    twoLook: true,
    // Edges only: the corners' yellow does not matter in this step.
    stickers: labels(setup).map((id, p) => (colour(id) === 'Y' && !isCorner(p) ? 'Y' : null)),
    mask: stickeringMask(STANDARD_SCHEME, { kind: 'eo', cross: 'W' }),
  };
});

/** U-layer corner stickers (U face corners and the side stickers next to them). */
function isCorner(p: number): boolean {
  const k = p % 9;
  if (p < 9) return k === 0 || k === 2 || k === 6 || k === 8;
  return k === 0 || k === 2;
}
