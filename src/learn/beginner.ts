/**
 * The beginner method (layer by layer) as a course: the same seven steps and algorithms the
 * Solve tab's beginner solver uses, each with a few example cases to play in the 3D viewer.
 *
 * The cube is held the way the solver holds it: white on the bottom, yellow on top. In the
 * viewer (cubing.js, white top and green front by default) that is an `x2` rotation, so every
 * demo's setup starts with it and the moves are read in that hold.
 *
 * A case is given by where it should end: `end` is an algorithm from the solved cube (in the
 * held frame) to the state after the case's moves, default the solved cube. The viewer works
 * the start state out by itself (`experimental-setup-anchor="end"`). tests/learn.test.ts
 * checks that every start looks the way its text says.
 *
 * Text lives in the translations: `learn.<lesson>.title`, `.goal`, `.how1`…, `.tip` and
 * `learn.<lesson>.<case>` / `.<case>.desc`.
 */
import { type Color, STANDARD_SCHEME } from '../core/cube';
import { type MaskStage, stickeringMask } from '../solve/mask';

/** The rotation from the viewer's default hold (white top) to the guide's (white bottom). */
export const HOLD = 'x2';

export interface LessonCase {
  id: string;
  /** The moves the demo plays. */
  alg: string;
  /** How the moves read on the page, when grouping helps (e.g. a repeat). Default `alg`. */
  show?: string;
  /** From the solved cube to where the moves end. Default: solved. */
  end?: string;
}

export interface Lesson {
  id: string;
  /** Stage colour on the page, shared with the Solve tab's step tags. */
  stage: 'inspection' | 'cross' | 'corners' | 'middle' | 'top';
  /** Number of `learn.<id>.how<n>` lines. */
  how: number;
  /** Algorithms to learn by heart in this step, by name key (`learn.<id>.alg.<key>`). */
  algs?: Record<string, string>;
  /** The moves an `{alg}` in this step's text stands for. Default: its first algorithm. */
  textAlg?: string;
  cases: LessonCase[];
  /** Which pieces the viewer shows bright (the rest dimmed). */
  mask: string;
}

const SIDES: Color[] = ['G', 'R', 'B', 'O'];
const CROSS_EDGES = SIDES.map((s) => ['W', s] as Color[]);
const WHITE_CORNERS = SIDES.map((s, i) => ['W', s, SIDES[(i + 1) % 4]] as Color[]);
const MIDDLE_EDGES = SIDES.map((s, i) => [s, SIDES[(i + 1) % 4]] as Color[]);
const YELLOW_EDGES = SIDES.map((s) => ['Y', s] as Color[]);

const mask = (stage: MaskStage) => stickeringMask(STANDARD_SCHEME, stage);
const bright = (...pieces: Color[][][]) => mask({ kind: 'pieces', cross: 'W', pieces: pieces.flat() });
/** Every piece shown normally. */
export const FULL_MASK = mask({ kind: 'pll', cross: 'W' });

const times = (alg: string, n: number) => Array(n).fill(alg).join(' ');

export const SEXY = "R U R' U'";
export const MIDDLE_RIGHT = "U R U' R' U' F' U F";
export const MIDDLE_LEFT = "U' L' U L U F U' F'";
export const YELLOW_CROSS = "F R U R' U' F'";
export const YELLOW_EDGES_ALG = "R U R' U R U2 R' U";
export const CORNER_CYCLE = "U R U' L' U R' U' L";
export const CORNER_TWIST = "R' D' R D";

export const BEGINNER: Lesson[] = [
  {
    id: 'notation',
    stage: 'inspection',
    how: 3,
    cases: [],
    mask: FULL_MASK,
  },
  {
    id: 'cross',
    stage: 'cross',
    how: 4,
    textAlg: "U' R' F R",
    cases: [
      { id: 'top', alg: 'F2' },
      { id: 'flipped', alg: "U' R' F R" },
      { id: 'middle', alg: "F'" },
    ],
    mask: bright(CROSS_EDGES),
  },
  {
    id: 'corners',
    stage: 'corners',
    how: 4,
    algs: { sexy: SEXY },
    cases: [
      { id: 'right', alg: SEXY, show: `(${SEXY}) ×1` },
      { id: 'up', alg: times(SEXY, 3), show: `(${SEXY}) ×3` },
      { id: 'front', alg: times(SEXY, 5), show: `(${SEXY}) ×5` },
    ],
    mask: bright(CROSS_EDGES, WHITE_CORNERS),
  },
  {
    id: 'middle',
    stage: 'middle',
    how: 4,
    algs: { right: MIDDLE_RIGHT, left: MIDDLE_LEFT },
    cases: [
      { id: 'right', alg: MIDDLE_RIGHT },
      { id: 'left', alg: MIDDLE_LEFT },
    ],
    mask: bright(CROSS_EDGES, WHITE_CORNERS, MIDDLE_EDGES),
  },
  {
    id: 'ycross',
    stage: 'top',
    how: 3,
    algs: { main: YELLOW_CROSS },
    cases: [
      { id: 'line', alg: YELLOW_CROSS },
      { id: 'l', alg: times(YELLOW_CROSS, 2), show: `(${YELLOW_CROSS}) ×2` },
      { id: 'dot', alg: `${YELLOW_CROSS} U2 ${times(YELLOW_CROSS, 2)}`, show: `${YELLOW_CROSS} · U2 · (${YELLOW_CROSS}) ×2` },
    ],
    mask: mask({ kind: 'eo', cross: 'W' }),
  },
  {
    id: 'yedges',
    stage: 'top',
    how: 4,
    algs: { main: YELLOW_EDGES_ALG },
    cases: [
      { id: 'adjacent', alg: YELLOW_EDGES_ALG },
      { id: 'opposite', alg: `${YELLOW_EDGES_ALG} U2 ${YELLOW_EDGES_ALG} U`, show: `${YELLOW_EDGES_ALG} · U2 · ${YELLOW_EDGES_ALG} · U` },
    ],
    mask: bright(CROSS_EDGES, WHITE_CORNERS, MIDDLE_EDGES, YELLOW_EDGES),
  },
  {
    id: 'ycorners',
    stage: 'top',
    how: 3,
    algs: { main: CORNER_CYCLE },
    cases: [
      { id: 'one', alg: CORNER_CYCLE },
      { id: 'twice', alg: times(CORNER_CYCLE, 2), show: `(${CORNER_CYCLE}) ×2` },
      { id: 'none', alg: `${CORNER_CYCLE} y ${CORNER_CYCLE}`, show: `${CORNER_CYCLE} · y · ${CORNER_CYCLE}` },
    ],
    mask: FULL_MASK,
  },
  {
    id: 'twist',
    stage: 'top',
    how: 4,
    algs: { main: CORNER_TWIST },
    cases: [
      {
        id: 'two',
        alg: `${times(CORNER_TWIST, 2)} U ${times(CORNER_TWIST, 4)} U'`,
        show: `(${CORNER_TWIST}) ×2 · U · (${CORNER_TWIST}) ×4 · U'`,
      },
    ],
    mask: FULL_MASK,
  },
];

/** The moves the notation pad offers. */
export const NOTATION_MOVES = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'", 'U2', 'y'];
