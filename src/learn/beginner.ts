/**
 * The beginner method (layer by layer) as a course, following J Perm's beginner guide
 * (jperm.net/3x3): seven steps built almost entirely from one "4-moves" trick, R U R' U', and
 * its left-hand mirror. Each step has a few example cases to play in the 3D viewer.
 *
 * Most steps hold the cube with white on the bottom and yellow on top. In the viewer (cubing.js,
 * white top and green front by default) that is an `x2` rotation, so a demo's setup starts with
 * its lesson's `hold` and the moves are read in that hold. The cross is built with white on top,
 * and the last step turns the cube over again: those two lessons use the viewer's own hold.
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
  /** How the cube is held, from the viewer's default (white top, green front). Default `HOLD`. */
  hold?: string;
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

/** The right-hand 4-moves. */
export const SEXY = "R U R' U'";
/** The left-hand 4-moves: the mirror image. */
export const LEFT_SEXY = "L' U' L U";
/** U, right 4-moves, turn to face the right side, left 4-moves (F' U' F U from the front). */
export const MIDDLE_RIGHT = "U R U R' U' F' U' F U";
/** U', left 4-moves, turn to face the left side, right 4-moves (F U F' U' from the front). */
export const MIDDLE_LEFT = "U' L' U' L U F U F' U'";
/** White on top: flips the front edge in place, keeping the other top edges. */
export const CROSS_FLIP = "F U' R U";
/** White on top: drops the front-right middle edge to the bottom, to the front. */
export const CROSS_DROP = "R' D' R";
export const YELLOW_CROSS = "F R U R' U' F'";
export const YELLOW_EDGES_ALG = "R U R' U R U2 R' U";
export const CORNER_CYCLE = "U R U' L' U R' U' L";
/** Cube turned over (yellow on the bottom): twist the front-right bottom corner. */
export const CORNER_TWIST = SEXY;

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
    hold: '',
    stage: 'cross',
    how: 4,
    algs: { flip: CROSS_FLIP, drop: CROSS_DROP },
    cases: [
      { id: 'bottom', alg: "D' F2", show: "D' · F2" },
      { id: 'flipped', alg: CROSS_FLIP },
      { id: 'middle', alg: `${CROSS_DROP} F2`, show: `${CROSS_DROP} · F2` },
    ],
    mask: bright(CROSS_EDGES),
  },
  {
    id: 'corners',
    stage: 'corners',
    how: 4,
    algs: { right: SEXY, left: LEFT_SEXY },
    cases: [
      { id: 'right', alg: SEXY, show: `(${SEXY}) ×1` },
      { id: 'up', alg: times(SEXY, 3), show: `(${SEXY}) ×3` },
      { id: 'front', alg: times(SEXY, 5), show: `(${SEXY}) ×5` },
      { id: 'left', alg: LEFT_SEXY, show: `(${LEFT_SEXY}) ×1` },
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
    hold: '',
    stage: 'top',
    how: 4,
    algs: { main: CORNER_TWIST },
    cases: [
      {
        id: 'two',
        alg: `${times(CORNER_TWIST, 2)} D ${times(CORNER_TWIST, 4)} D'`,
        show: `(${CORNER_TWIST}) ×2 · D · (${CORNER_TWIST}) ×4 · D'`,
      },
    ],
    mask: FULL_MASK,
  },
];

/** The moves the notation pad offers. */
export const NOTATION_MOVES = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'", 'U2', 'y'];

/** The hold a lesson's demos start from. */
export const holdOf = (lesson: Lesson) => lesson.hold ?? HOLD;
