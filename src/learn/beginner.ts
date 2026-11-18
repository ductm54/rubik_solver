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
    how: 5,
    algs: { right: SEXY, left: LEFT_SEXY },
    cases: [
      { id: 'right', alg: SEXY, show: `(${SEXY}) ×1` },
      { id: 'up', alg: times(SEXY, 3), show: `(${SEXY}) ×3` },
      { id: 'front', alg: `y ${LEFT_SEXY}`, show: `y · (${LEFT_SEXY}) ×1` },
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
export const holdOf = (lesson: { hold?: string }) => lesson.hold ?? HOLD;

/**
 * Going faster with the same method: J Perm's shortcuts for each step, then starting the cross on any colour. A
 * group's text keys are `learn.<id>.title`, its tips `learn.<id>.<tip>` (the name) and
 * `learn.<id>.<tip>.text`; demos work like a lesson's cases (`learn.<id>.<case>` / `.desc`).
 */
export interface SpeedTip {
  id: string;
  /** The moves an `{alg}` in the tip's text stands for. */
  alg?: string;
}

export interface SpeedGroup {
  id: string;
  /** The beginner step these tips speed up, if any. */
  step?: string;
  stage: Lesson['stage'];
  hold?: string;
  tips: SpeedTip[];
  cases: LessonCase[];
  mask: string;
}

/** White on top: an edge at the front-right of the middle layer, white facing the front, that
 * belongs at the front: turn its spot over to the right, slide it up, turn back. */
export const CROSS_SLIDE = "U' R U";
/** White on top of the corner: the first U of the 4-moves made U2, then one more 4-moves. */
export const CORNER_UP_FAST = `R U2 R' U' ${SEXY}`;
/** White facing right, with the front-right middle edge already solved. */
export const KEEP_EDGE_RIGHT = "U' R U2 R' U R U R'";
/** The left-hand mirror: white facing left, with the front-left middle edge already solved. */
export const KEEP_EDGE_LEFT = "U L' U2 L U' L' U' L";
/** Swaps the two middle edges on the right side. */
export const SWAP_RIGHT_EDGES = 'R2 U2 R2 U2 R2';
/** Flips the front-right middle edge in its slot: R U2 R', U R U2 R', then U F' U' F puts the corner back with the left hand. */
export const FLIP_MIDDLE = "R U2 R' U R U2 R' U F' U' F";
/** The yellow cross in one go from an L at the front and right: a double-layer front turn. */
export const YELLOW_CROSS_WIDE = "f R U R' U' f'";
/** The corner cycle the other way round, starting with the left hand. */
export const CORNER_CYCLE_BACK = "L' U R U' L U R' U'";
/** The 4-moves backwards: twice does what four right 4-moves do. */
export const REVERSE_SEXY = "U R U' R'";

export const SPEEDUPS: SpeedGroup[] = [
  {
    id: 'fast.cross',
    step: 'cross',
    hold: '',
    stage: 'cross',
    tips: [{ id: 'slide', alg: CROSS_SLIDE }],
    cases: [
      { id: 'slide', alg: CROSS_SLIDE, show: "U' · R · U" },
      { id: 'direct', alg: "F'" },
    ],
    mask: bright(CROSS_EDGES),
  },
  {
    id: 'fast.corners',
    step: 'corners',
    stage: 'corners',
    tips: [
      { id: 'front', alg: LEFT_SEXY },
      { id: 'up', alg: CORNER_UP_FAST },
      { id: 'stuck', alg: LEFT_SEXY },
      { id: 'keep', alg: times(SEXY, 3) },
    ],
    cases: [
      { id: 'up', alg: CORNER_UP_FAST, show: `R U2 R' U' · ${SEXY}` },
      { id: 'keepRight', alg: KEEP_EDGE_RIGHT, show: "U' · R U2 R' U · R U R'" },
      { id: 'keepLeft', alg: `y ${KEEP_EDGE_LEFT}`, show: "y · U · L' U2 L U' · L' U' L" },
      { id: 'keepUp', alg: times(SEXY, 3), show: `(${SEXY}) ×3` },
    ],
    mask: bright(CROSS_EDGES, WHITE_CORNERS, MIDDLE_EDGES),
  },
  {
    id: 'fast.middle',
    step: 'middle',
    stage: 'middle',
    tips: [
      { id: 'swap', alg: SWAP_RIGHT_EDGES },
      { id: 'flipped', alg: FLIP_MIDDLE },
    ],
    cases: [
      { id: 'swap', alg: SWAP_RIGHT_EDGES },
      { id: 'flipped', alg: FLIP_MIDDLE, show: "R U2 R' · U R U2 R' · U F' U' F" },
    ],
    mask: bright(CROSS_EDGES, WHITE_CORNERS, MIDDLE_EDGES),
  },
  {
    id: 'fast.top',
    stage: 'top',
    tips: [
      { id: 'wide', alg: YELLOW_CROSS_WIDE },
      { id: 'opposite', alg: 'U2' },
      { id: 'corners', alg: CORNER_CYCLE_BACK },
    ],
    cases: [
      { id: 'wide', alg: YELLOW_CROSS_WIDE, show: `f · ${SEXY} · f'` },
      { id: 'corners', alg: CORNER_CYCLE_BACK },
    ],
    mask: FULL_MASK,
  },
  {
    id: 'fast.twist',
    step: 'twist',
    hold: '',
    stage: 'top',
    tips: [{ id: 'reverse', alg: REVERSE_SEXY }],
    cases: [
      {
        id: 'two',
        alg: `${times(CORNER_TWIST, 2)} D ${times(REVERSE_SEXY, 2)} D'`,
        show: `(${CORNER_TWIST}) ×2 · D · (${REVERSE_SEXY}) ×2 · D'`,
      },
    ],
    mask: FULL_MASK,
  },
  {
    id: 'fast.habits',
    stage: 'inspection',
    tips: [{ id: 'neutral' }],
    cases: [],
    mask: FULL_MASK,
  },
];
